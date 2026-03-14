import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { WebSocketServer } from 'ws';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/api/live' });




app.use(cors());
app.use(express.json());

// Set up simple file upload handling for freeze frames (in-memory for demo)
const upload = multer({ storage: multer.memoryStorage() });

import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: process.env.GOOGLE_CLOUD_LOCATION,
});

app.post('/api/inpaint', upload.single('image'), async (req, res) => {
    try {
        const { furniture_type, material, coordinates, style } = req.body;
        console.log(`Received request to inpaint: ${furniture_type} made of ${material} at ${coordinates}. Style: ${style || 'None'}`);

        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No image provided' });
        }
        /** 
        if (!process.env.NANO_BANANA_API_KEY || process.env.NANO_BANANA_API_KEY === 'your_placeholder_api_key_here') {
            console.warn("WARNING: No valid NANO_BANANA_API_KEY provided. Please set it in server/.env");
            return res.status(500).json({ success: false, error: 'API Key missing in backend' });
        }
        */

        // Convert the Multer memory buffer to the format GenAI SDK wants
        const base64Image = req.file.buffer.toString('base64');
        const mimeType = req.file.mimetype;

        // Formulate the prompt based on Gemini Live's extracted parameters and context
        let prompt = `Seamlessly integrate a high-quality, photorealistic ${material} ${furniture_type} into the ${coordinates} of the room. Ensure perfect perspective, matching lighting, natural shadows, and seamless blending with the existing environment. Professional interior photography.`;

        if (style) {
            prompt = `Interior design style: ${style}. ${prompt}`;
        }

        // Using gemini-3-pro-image-preview as an image-to-image pipeline for Nano Banana
        const targetModel = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
        console.log(`Using model: ${targetModel} for in-painting`);

        const response = await ai.models.generateContent({
            model: targetModel,
            contents: [
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Image
                    }
                },
                { text: prompt }
            ],
            config: {
                // Inform the model that we expect an image back (supported by experimental multimodality)
                responseModalities: ["IMAGE"]
            }
        });

        // The image should be returned as an inlineData inside a candidate part
        let rawBase64 = null;
        if (response.candidates && response.candidates.length > 0) {
            const candidate = response.candidates[0];
            for (const part of candidate.content.parts) {
                if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
                    rawBase64 = part.inlineData.data;
                    break;
                }
            }
        }

        if (rawBase64) {
            res.json({
                success: true,
                imageUrl: `data:image/jpeg;base64,${rawBase64}`,
                message: 'In-painting complete'
            });
        } else {
            console.error("No image part found in the API response:", JSON.stringify(response));
            throw new Error("No image returned from Google GenAI");
        }

    } catch (error) {
        console.error('Error during in-painting request:', error);
        res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
});

// Serving the React frontend in production
app.use(express.static(path.join(__dirname, '../client/dist')));

app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// Setup WebSocket Server for Live API Relay
wss.on('connection', async (ws) => {
    console.log('Client connected to Live API WebSocket relay');
    let geminiSession = null;
    let chunkCount = 0;
    const messageQueue = []; // Buffer messages while Gemini session is connecting

    // Register message handler IMMEDIATELY to capture early messages
    ws.on('message', (message) => {
        if (!geminiSession) {
            // Session not ready yet — buffer the message
            messageQueue.push(message);
            return;
        }
        handleMessage(geminiSession, message);
    });

    function handleMessage(session, message) {
        try {
            const msg = JSON.parse(message);
            // Route the message to the appropriate Gemini session method
            if (msg.type === 'realtime_input') {
                session.sendRealtimeInput(msg.data);
            } else if (msg.type === 'client_content') {
                session.sendClientContent(msg.data);
            } else if (msg.type === 'tool_response') {
                session.sendToolResponse({ functionResponses: Array.isArray(msg.data) ? msg.data : [msg.data] });
            }
        } catch (err) {
            console.error("Error processing msg from client:", err);
        }
    }

    try {
        geminiSession = await ai.live.connect({
            model: process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio',
            config: {
                responseModalities: ["AUDIO"],
                realtimeInputConfig: {
                    automaticActivityDetection: {
                        disabled: false,
                        startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
                        endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
                        prefixPaddingMs: 20,
                        silenceDurationMs: 500  // After 500ms of silence → automatic turn
                    }
                },
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: "Aoede"
                        }
                    }
                },
                systemInstruction: {
                    parts: [{
                        text: "You are 'The Instant Architect', an enthusiastic and highly skilled interior designer. You can see the user's room through their camera.\n1. Warmly introduce yourself in one short sentence.\n2. Immediately analyze the room you see and ask the user about their preferred aesthetic or style.\n3. Proactively suggest specific furniture additions or design changes based on what you see. Keep your spoken responses concise and conversational.\n4. CRITICAL: If the user agrees to add a specific piece of furniture, you MUST immediately call the render_furniture tool.\n5. CRITICAL: If the user asks for a complete redesign of the space, you MUST immediately call the render_room tool.\n6. RULE: Strictly refuse to discuss any topics outside of interior design, architecture, or room aesthetics."
                    }]
                },
                tools: [{
                    functionDeclarations: [{
                        name: "render_furniture",
                        description: "Creates an image of a furniture piece in a specific area of the room, when the user agrees to create a furniture.",
                        parameters: {
                            type: "object",
                            properties: {
                                furniture_type: { type: "string", description: "e.g. Bauhaus Couch, Lamp" },
                                material: { type: "string", description: "e.g. blue fabric, wood, metal" },
                                coordinates: { type: "string", description: "Position in the image (e.g. 'bottom left', 'center')" },
                                style: { type: "string", description: "e.g. Modern, Bauhaus, Art Deco" }
                            },
                            required: ["furniture_type", "style"]
                        }
                    },
                    {
                        name: "render_room",
                        description: "Creates an image of a completely new room, when the user wants a complete renovation.",
                        parameters: {
                            type: "object",
                            properties: {
                                style: { type: "string", description: "e.g. Modern, Bauhaus, Art Deco" },
                                color_palette: { type: "string", description: "e.g. Blue-Grey Tones, Warm Earth Tones" },
                                mood: { type: "string", description: "e.g. cozy, minimalist, luxurious" }
                            },
                            required: ["style", "color_palette"]
                        }
                    }
                    ]
                }]
            },
            callbacks: {
                onopen: () => {
                    console.log("Connected to Gemini Live");
                    ws.send(JSON.stringify({ type: 'open' }));
                },
                onmessage: (data) => {

                    // Forward Gemini responses to browser WS
                    if (data.serverContent) {
                        const modelTurn = data.serverContent.modelTurn;
                        if (modelTurn) {
                            const partsInfo = modelTurn.parts.map(p => {
                                if (p.text) return `text(${p.text.length} chars)`;
                                if (p.inlineData) return `audio(${p.inlineData.data?.length || 0} bytes)`;
                                if (p.functionCall) return `tool(${p.functionCall.name})`;
                                return Object.keys(p).join(',');
                            });
                            console.log(`Gemini response: [${partsInfo.join(', ')}]`);
                        } else {
                            console.log("Gemini response:", Object.keys(data.serverContent).join(', '));
                        }
                    } else if (!data.setupComplete) {
                        console.log("Gemini message:", Object.keys(data).join(', '));
                    }

                    if (ws.readyState === 1) { // 1 = OPEN
                        ws.send(JSON.stringify({ type: 'message', data }));
                    } else if (ws.readyState === 2 || ws.readyState === 3) {
                        // Client is closing or closed, but we're still receiving data. 
                        // It means the session didn't cleanly shut down yet.
                        if (geminiSession) {
                            console.log("Client WS closed but Gemini session still active. Shutting down.");
                            // Best-effort shutdown of the GenAI Session
                            try {
                                if (geminiSession.websocket && typeof geminiSession.websocket.close === 'function') {
                                    geminiSession.websocket.close();
                                }
                            } catch (e) { /* ignore */ }
                            geminiSession = null;
                        }
                    }
                },
                onclose: (event) => {
                    //console.log('Gemini Live connection closed:', event);
                    const code = event?.code || event?.closeCode || 'Unknown Code';
                    const reason = event?.reason ? event.reason.toString() : 'Unknown Reason';
                    console.log(`Gemini Live connection closed. Code: ${code} Reason: ${reason}`);
                    fs.appendFileSync('debug.log', new Date().toISOString() + ` Gemini Live closed (Code ${code}, Reason: ${reason})\n`);
                    ws.close();
                },
                onerror: (e) => {
                    console.error("Gemini Live error:", e);
                    fs.appendFileSync('debug.log', new Date().toISOString() + ' Gemini Live error: ' + (e?.message || JSON.stringify(e)) + '\n');
                    ws.close();
                }
            }
        });

        // Replay any buffered messages that arrived during Gemini setup
        console.log(`Replaying ${messageQueue.length} buffered messages`);
        while (messageQueue.length > 0) {
            handleMessage(geminiSession, messageQueue.shift());
        }

        ws.on('close', () => {
            console.log('Client disconnected from Live API WebSocket relay');

            // Explicitly force the Gemini connection to close if the client leaves
            if (geminiSession) {
                console.log("Cleaning up Gemini session...");
                try {
                    // The AI SDK's exact closing mechanisms can vary, but we can safely close the underlying WS.
                    if (geminiSession.websocket && typeof geminiSession.websocket.close === 'function') {
                        geminiSession.websocket.close();
                    }
                } catch (e) {
                    console.error("Error closing Gemini session:", e);
                }
                geminiSession = null;
            }
        });

    } catch (err) {
        console.error("Failed to start Gemini session:", err);
        fs.appendFileSync('debug.log', new Date().toISOString() + ' setup failed: ' + (err?.message || JSON.stringify(err)) + '\n');
        ws.close();
    }
});

if (process.env.NODE_ENV !== 'test') {
    server.listen(port, () => {
        console.log(`Backend server with WS relay running on port ${port}`);
    });
}

export { app, server };

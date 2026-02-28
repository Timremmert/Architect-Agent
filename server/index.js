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
                // The client sends data inside `media` (i.e. msg.data.media.mimeType)
                const mediaPart = msg.data.media || msg.data;
                if (mediaPart && mediaPart.mimeType && mediaPart.data) {

                    if (chunkCount === 1) {
                        console.log("FIRST CHUNK MIME:", mediaPart.mimeType);
                    }
                    session.sendRealtimeInput({
                        media: {
                            mimeType: mediaPart.mimeType,
                            data: mediaPart.data
                        }
                    });
                }
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
                        silenceDurationMs: 500  // Nach 500ms Stille → automatischer Turn
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
                        text: "Du bist The Instant Architect, ein kreativer Innenarchitekt.\n1. Stelle dich zuerst kurz vor.\n2. Frage nach dem bevorzugten Stil.\n3. Mach proaktive Einrichtungsvorschläge zum Kamerabild.\n4. Nutze IMMER 'render_furniture' wenn der Nutzer zustimmt.\n5. Nutze IMMER 'render_room' wenn der Nutzer eine vollständige Neugestaltung wünscht.\nREGEL: Lehne alle Themen außer Raumgestaltung sofort ab."
                    }]
                },
                tools: [{
                    functionDeclarations: [{
                        name: "render_furniture",
                        description: "Erzeugt ein Bild eines Möbelstücks in einem spezifischen Bereich des Raums, wenn der Nutzer einem Design-Vorschlag zustimmt.",
                        parameters: {
                            type: "object",
                            properties: {
                                furniture_type: { type: "string", description: "z.B. Bauhaus Couch, Stehlampe" },
                                material: { type: "string", description: "z.B. blauer Stoff, Holz, Metall" },
                                coordinates: { type: "string", description: "Position im Bild (z.B. 'unten links', 'mitte')" },
                                style: { type: "string", description: "z.B. Modern, Bauhaus, Art Deco" }
                            },
                            required: ["furniture_type", "style"]
                        }
                    },
                    {
                        name: "render_room",
                        description: "Erzeugt ein Bild eines komplett neu gestalteten Raumes, wenn der Nutzer eine vollständige Neugestaltung wünscht.",
                        parameters: {
                            type: "object",
                            properties: {
                                style: { type: "string", description: "z.B. Modern, Bauhaus, Art Deco" },
                                color_palette: { type: "string", description: "z.B. Blau-Grau Töne, Warme Erdtöne" },
                                mood: { type: "string", description: "z.B. Gemütlich, Minimalistisch, Luxuriös" }
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

                    ws.send(JSON.stringify({ type: 'message', data }));
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
        });

    } catch (err) {
        console.error("Failed to start Gemini session:", err);
        fs.appendFileSync('debug.log', new Date().toISOString() + ' setup failed: ' + (err?.message || JSON.stringify(err)) + '\n');
        ws.close();
    }
});

server.listen(port, () => {
    console.log(`Backend server with WS relay running on port ${port}`);
});

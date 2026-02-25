import { useState, useRef, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';

/**
 * Hook to manage Multimodal Live API connection with Gemini
 * Handles connecting, sending audio/video, receiving audio, and function calling.
 */
export function useGeminiLive(apiKey, model = "models/gemini-2.5-flash-native-audio-preview-12-2025") {
    const [status, setStatus] = useState('disconnected'); // disconnected, connecting, connected

    // The underlying WebSocket
    const wsRef = useRef(null);
    const audioContextRef = useRef(null);
    const scriptProcessorRef = useRef(null);
    const playbackContextRef = useRef(null);
    const nextPlayTimeRef = useRef(0);

    // Keep track of the function call trigger
    const onFunctionCallRef = useRef(null);

    const playAudioBase64 = useCallback((base64) => {
        if (!playbackContextRef.current) {
            // Gemini natively returns 24kHz PCM for Voice
            playbackContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
            nextPlayTimeRef.current = playbackContextRef.current.currentTime;
        }

        const audioCtx = playbackContextRef.current;
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const int16Data = new Int16Array(bytes.buffer);
        const float32Data = new Float32Array(int16Data.length);
        for (let i = 0; i < int16Data.length; i++) {
            float32Data[i] = int16Data[i] / 0x7FFF;
        }

        const buffer = audioCtx.createBuffer(1, float32Data.length, 24000);
        buffer.getChannelData(0).set(float32Data);

        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);

        const playTime = Math.max(audioCtx.currentTime, nextPlayTimeRef.current);
        source.start(playTime);
        nextPlayTimeRef.current = playTime + buffer.duration;
    }, []);

    const disconnect = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }

        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        if (playbackContextRef.current) {
            playbackContextRef.current.close();
            playbackContextRef.current = null;
        }

        setStatus('disconnected');
    }, []);

    const connect = useCallback(async () => {
        setStatus('connecting');

        try {
            // Fetch token from backend!
            // Use relative paths in production to route to the same origin (Express server)
            const baseUrl = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001');
            const tokenRes = await fetch(`${baseUrl}/api/token`);
            const tokenData = await tokenRes.json();

            if (!tokenData.success || !tokenData.token) {
                throw new Error("Failed to get Vertex AI token from backend");
            }

            const ai = new GoogleGenAI({
                vertexai: {
                    project: tokenData.project,
                    location: tokenData.location
                },
                httpOptions: {
                    headers: {
                        Authorization: `Bearer ${tokenData.token}`
                    }
                }
            });
            const session = await ai.live.connect({
                model: model,
                config: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: "Aoede" // Pick a friendly voice
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
                        console.log("WebSocket connected to Gemini Live via SDK");
                        setStatus('connected');
                    },
                    onmessage: (data) => {
                        // 1. Handle Function Calls and Audio Output
                        if (data.toolCall && data.toolCall.functionCalls) {
                            for (const call of data.toolCall.functionCalls) {
                                console.log("GEMINI TRIGGERED FUNCTION CALL (toolCall):", call);
                                if (onFunctionCallRef.current) {
                                    onFunctionCallRef.current(call);
                                }
                            }
                        } else if (data.serverContent?.modelTurn?.parts) {
                            for (const part of data.serverContent.modelTurn.parts) {
                                if (part.functionCall) {
                                    console.log("GEMINI TRIGGERED FUNCTION CALL (part):", part.functionCall);
                                    if (onFunctionCallRef.current) {
                                        onFunctionCallRef.current(part.functionCall);
                                    }
                                }
                                if (part.inlineData && part.inlineData.mimeType.startsWith("audio/pcm")) {
                                    playAudioBase64(part.inlineData.data);
                                }
                            }
                        }
                    },
                    onclose: () => {
                        console.log(`Gemini WebSocket Closed`);
                        setStatus('disconnected');
                        disconnect();
                    },
                    onerror: (e) => {
                        console.error("Gemini WebSocket Error", e);
                        setStatus('disconnected');
                        disconnect();
                    }
                }
            });

            wsRef.current = session;

            const initialTurn = {
                turns: [{
                    role: "user",
                    parts: [{ text: "Hallo! Ich bin bereit für deine Einrichtungsvorschläge." }]
                }],
                turnComplete: true
            };
            session.sendClientContent(initialTurn);

            // Start Audio capture
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const context = new window.AudioContext({ sampleRate: 16000 });
                audioContextRef.current = context;

                // Load our custom AudioWorklet processor from the public folder
                await context.audioWorklet.addModule('/pcm-processor.js');

                const source = context.createMediaStreamSource(stream);
                const workletNode = new AudioWorkletNode(context, 'pcm-processor');
                scriptProcessorRef.current = workletNode; // We keep the ref name for cleanup

                source.connect(workletNode);
                workletNode.connect(context.destination);

                // Receive the processed PCM data from the worklet
                workletNode.port.onmessage = (event) => {
                    if (wsRef.current) {
                        const buffer = event.data;
                        const uint8Array = new Uint8Array(buffer);




                        // Fast conversion of Uint8Array to Base64
                        let binary = '';
                        for (let i = 0; i < uint8Array.byteLength; i++) {
                            binary += String.fromCharCode(uint8Array[i]);
                        }
                        const base64Audio = btoa(binary);

                        wsRef.current.sendRealtimeInput({
                            media: [{
                                mimeType: "audio/pcm;rate=16000",
                                data: base64Audio
                            }]
                        });
                    }
                };
            } catch (err) {
                console.error("Audio setup failed:", err);
            }

        } catch (error) {
            console.error("Error connecting to Live API:", error);
            setStatus('disconnected');
        }

    }, [apiKey, model, disconnect, playAudioBase64]);

    // Set a callback for when Gemini wants to generate furniture
    const onFunctionCall = useCallback((callback) => {
        onFunctionCallRef.current = callback;
    }, []);

    // Function to send a low-res video frame to Gemini
    const sendVideoFrame = useCallback((base64JpegImage) => {
        if (wsRef.current) {
            // Remove the data:image/jpeg;base64, prefix
            const base64Data = base64JpegImage.split(',')[1];

            wsRef.current.sendRealtimeInput({
                media: [{
                    mimeType: "image/jpeg",
                    data: base64Data
                }]
            });
        }
    }, []);

    // Function to tell Gemini the tool executed successfully
    const sendToolResponse = useCallback((functionResponses) => {
        if (wsRef.current) {
            wsRef.current.sendToolResponse({
                functionResponses: functionResponses
            });
        }
    }, []);

    return {
        status,
        connect,
        disconnect,
        sendVideoFrame,
        sendToolResponse,
        onFunctionCall
    };
}

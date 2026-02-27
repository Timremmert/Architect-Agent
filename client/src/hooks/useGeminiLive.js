import { useState, useRef, useCallback } from 'react';

/**
 * Hook to manage Multimodal Live API connection with Gemini
 * Handles connecting, sending audio/video, receiving audio, and function calling.
 */
export function useGeminiLive() {
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
            // Initialize AudioContexts synchronously to ensure they are created 
            // within the user's click event (fixes execution context errors)
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const context = new AudioContext({ sampleRate: 16000 });
            audioContextRef.current = context;

            if (!playbackContextRef.current) {
                playbackContextRef.current = new AudioContext({ sampleRate: 24000 });
                nextPlayTimeRef.current = playbackContextRef.current.currentTime;
            }

            // Determine WebSocket URL
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            let wsUrl = '';

            if (import.meta.env.PROD) {
                wsUrl = `${protocol}//${window.location.host}/api/live`;
            } else {
                // In dev, the API base URL might be set, or fallback to localhost
                const devBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
                wsUrl = devBaseUrl.replace('http:', 'ws:').replace('https:', 'wss:') + '/api/live';
            }

            const ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log("WebSocket connected to backend relay");
                setStatus('connected');

                // Send initial turn
                const initialTurn = {
                    turns: [{
                        role: "user",
                        parts: [{ text: "Hallo! Ich bin bereit für deine Einrichtungsvorschläge." }]
                    }],
                    turnComplete: true
                };
                ws.send(JSON.stringify({ type: 'client_content', data: initialTurn }));
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'message') {
                        const data = msg.data;
                        // Handle Function Calls and Audio Output
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
                    }
                } catch (e) {
                    console.error("Error parsing WS message:", e);
                }
            };

            ws.onclose = () => {
                console.log(`WebSocket Closed`);
                setStatus('disconnected');
                disconnect();
            };

            ws.onerror = (e) => {
                console.error("WebSocket Error", e);
                setStatus('disconnected');
                disconnect();
            };

            wsRef.current = ws;

            // Start Audio capture
            try {
                // Resume contexts if they start in 'suspended' state
                if (context.state === 'suspended') await context.resume();
                if (playbackContextRef.current.state === 'suspended') await playbackContextRef.current.resume();

                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        sampleRate: 16000,
                        channelCount: 1,
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });

                // Load our custom AudioWorklet processor from the public folder
                await context.audioWorklet.addModule('/pcm-processor.js');

                if (context.state === 'closed') {
                    console.warn("AudioContext was closed before setup finished.");
                    return;
                }

                const source = context.createMediaStreamSource(stream);
                const workletNode = new AudioWorkletNode(context, 'pcm-processor');
                scriptProcessorRef.current = workletNode; // We keep the ref name for cleanup

                source.connect(workletNode);


                // Receive the processed PCM data from the worklet
                workletNode.port.onmessage = (event) => {
                    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                        // The processor already converted to Int16Array
                        const buffer = event.data;
                        const uint8Array = new Uint8Array(buffer);

                        // Fast conversion of Uint8Array to Base64
                        let binary = '';
                        for (let i = 0; i < uint8Array.byteLength; i++) {
                            binary += String.fromCharCode(uint8Array[i]);
                        }
                        const base64Audio = btoa(binary);


                        wsRef.current.send(JSON.stringify({
                            type: 'realtime_input',
                            data: {
                                media: {
                                    mimeType: "audio/pcm;rate=16000",
                                    data: base64Audio
                                }
                            }
                        }));
                    }
                };
            } catch (err) {
                console.error("Audio setup failed:", err);
            }

        } catch (error) {
            console.error("Error connecting to Live API relay:", error);
            setStatus('disconnected');
        }

    }, [disconnect, playAudioBase64]);

    // Set a callback for when Gemini wants to generate furniture
    const onFunctionCall = useCallback((callback) => {
        onFunctionCallRef.current = callback;
    }, []);

    // Function to send a low-res video frame to Gemini
    const sendVideoFrame = useCallback((base64JpegImage) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            // Remove the data:image/jpeg;base64, prefix
            const base64Data = base64JpegImage.split(',')[1];

            wsRef.current.send(JSON.stringify({
                type: 'realtime_input',
                data: {
                    media: {
                        mimeType: "image/jpeg",
                        data: base64Data
                    }
                }
            }));
        }
    }, []);

    // Function to tell Gemini the tool executed successfully
    const sendToolResponse = useCallback((functionResponses) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'tool_response',
                data: functionResponses
            }));
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

require('dotenv').config({ path: 'server/.env' });
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ vertexai: true, project: 'gen-lang-client-0208563832', location: 'europe-west1' });

async function testFullFlow() {
    return new Promise(async (resolve) => {
        let isClosed = false;
        console.log('=== Full App Flow Test ===');

        const session = await ai.live.connect({
            model: 'gemini-live-2.5-flash-native-audio',
            config: {
                responseModalities: ["AUDIO"],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } },
                systemInstruction: { parts: [{ text: "Du bist ein Test-Assistent." }] },
                tools: [{
                    functionDeclarations: [{
                        name: "render_furniture",
                        description: "Test function",
                        parameters: { type: "object", properties: { furniture_type: { type: "string" } }, required: ["furniture_type"] }
                    }]
                }]
            },
            callbacks: {
                onopen: () => console.log('  Connected'),
                onmessage: (msg) => {
                    if (msg.setupComplete) console.log('  Setup complete');
                    else if (msg.serverContent?.modelTurn) console.log('  Got model turn');
                    else if (msg.toolCall) console.log('  Got tool call');
                },
                onclose: (e) => {
                    console.log(`  CLOSED: ${e?.code || e?.closeCode} ${e?.reason}`);
                    isClosed = true;
                    resolve('closed');
                },
                onerror: (e) => console.log('  ERROR:', e?.message || e)
            }
        });

        // Step 1: Send initial client content (like the app does)
        console.log('  Sending initial client_content...');
        session.sendClientContent({
            turns: [{ role: "user", parts: [{ text: "Hallo! Ich bin bereit." }] }],
            turnComplete: true
        });

        // Step 2: Wait a moment, then send continuous audio chunks (like the app does)
        // await new Promise(r => setTimeout(r, 500));

        const pcmData = Buffer.alloc(128, 0).toString('base64'); // ~172 chars, similar to app
        console.log('  Data length:', pcmData.length, '| sample:', pcmData.slice(0, 30));

        let count = 0;
        const interval = setInterval(() => {
            if (isClosed) { clearInterval(interval); return; }
            count++;
            try {
                session.sendRealtimeInput({ media: { mimeType: 'audio/pcm;rate=16000', data: pcmData } });
                if (count <= 5) console.log(`  Sent chunk ${count}`);
            } catch (e) {
                console.log(`  Send error: ${e.message}`);
            }
            if (count > 20) {
                clearInterval(interval);
                console.log('  Sent 20 chunks. Waiting...');
                setTimeout(() => {
                    if (!isClosed) { console.log('  SUCCESS after 20 chunks!'); resolve('success'); }
                }, 3000);
            }
        }, 100); // Send every 100ms, like the app's AudioWorklet
    });
}

testFullFlow().then(result => {
    console.log('\nResult:', result);
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});

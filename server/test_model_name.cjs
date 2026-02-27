require('dotenv').config({ path: 'server/.env' });
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ vertexai: true, project: 'gen-lang-client-0208563832', location: 'europe-west1' });

async function test(modelName) {
    return new Promise(async (resolve) => {
        let isClosed = false;
        console.log(`\n=== Testing model: ${modelName} ===`);
        try {
            const session = await ai.live.connect({
                model: modelName,
                callbacks: {
                    onopen: () => console.log(`[${modelName}] CONNECTED!`),
                    onmessage: (msg) => console.log(`[${modelName}] MSG received`),
                    onclose: (e) => {
                        console.log(`[${modelName}] CLOSED: Code: ${e?.code || e?.closeCode}, Reason: ${e?.reason}`);
                        isClosed = true;
                        resolve();
                    },
                    onerror: (e) => console.log(`[${modelName}] ERROR:`, e?.message || e)
                }
            });

            const data = Buffer.alloc(1024, 0).toString('base64');
            session.sendRealtimeInput({ audio: { mimeType: 'audio/pcm;rate=16000', data } });
            console.log(`[${modelName}] sent audio chunk`);

            setTimeout(() => { if (!isClosed) { console.log(`[${modelName}] SUCCESS! Still open after 2s`); resolve(); } }, 2000);
        } catch (err) {
            console.log(`[${modelName}] CONNECT ERROR:`, err.message);
            resolve();
        }
    });
}

async function runAll() {
    await test('gemini-live-2.5-flash-native-audio');
    await test('gemini-2.0-flash-live-001');
    process.exit(0);
}

runAll().catch(console.error);

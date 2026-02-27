require('dotenv').config({ path: 'server/.env' });
const { GoogleGenAI } = require('@google/genai');

async function test(region, modelName) {
    const ai = new GoogleGenAI({ vertexai: true, project: 'gen-lang-client-0208563832', location: region });
    return new Promise(async (resolve) => {
        let isClosed = false;
        console.log(`\n=== Testing ${modelName} in ${region} ===`);
        try {
            const session = await ai.live.connect({
                model: modelName,
                callbacks: {
                    onclose: (e) => {
                        console.log(`[${region}] CLOSED: Code: ${e?.code || e?.closeCode}, Reason: ${e?.reason}`);
                        isClosed = true;
                        resolve();
                    },
                    onerror: (e) => {
                        console.log(`[${region}] ERROR:`, e);
                    }
                }
            });
            console.log(`[${region}] Connected successfully!`);
            session.sendRealtimeInput([{ mimeType: 'audio/pcm;rate=16000', data: Buffer.from('A'.repeat(500)).toString('base64') }]);
            console.log(`[${region}] Sent Realtime Input`);
            setTimeout(() => {
                if (!isClosed) {
                    console.log(`[${region}] SUCCESS! connection stayed open.`);
                    resolve();
                }
            }, 3000);
        } catch (err) {
            console.log(`[${region}] SYNC ERROR:`, err.message);
            resolve();
        }
    });
}
async function runAll() {
    await test('europe-west1', 'gemini-2.5-flash-native');
    await test('europe-west1', 'gemini-2.5-flash-native-audio-preview-12-2025');
    await test('us-central1', 'gemini-2.5-flash-native-audio-preview-12-2025');
    await test('us-central1', 'gemini-2.5-flash-native-audio-preview-12-2025');
    console.log("Done");
    process.exit(0);
}
runAll().catch(console.error);

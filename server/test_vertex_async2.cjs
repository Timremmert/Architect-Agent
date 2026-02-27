require('dotenv').config({ path: 'server/.env' });
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ vertexai: true, project: 'gen-lang-client-0208563832', location: 'europe-west1' });

async function test(mimeType, payload) {
    return new Promise(async (resolve) => {
        let isClosed = false;
        console.log(`\n=== Testing ${mimeType} ===`);
        const session = await ai.live.connect({
            model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
            callbacks: {
                onclose: (e) => { console.log(`CLOSED: Code: ${e?.code}, Reason: ${e?.reason}`); isClosed = true; resolve(); },
                onerror: (e) => { console.log(`ERROR:`, e); }
            }
        });
        session.sendRealtimeInput([{ mimeType, data: Buffer.from('A'.repeat(500)).toString('base64') }]);
        setTimeout(() => {
            if (!isClosed) { console.log(`SUCCESS!`); resolve(); session.ws.close(); }
        }, 1500);
    });
}
async function runAll() {
    await test('audio/pcm;rate=16000', '...');
    await test('audio/pcm; rate=16000', '...');
    await test('audio/webm', '...');
    await test('audio/pcm', '...');
}
runAll().catch(console.error);

require('dotenv').config({ path: 'server/.env' });
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ vertexai: true, project: 'gen-lang-client-0208563832', location: 'europe-west1' });

async function test(formatName, params) {
    return new Promise(async (resolve) => {
        let isClosed = false;
        console.log(`\n=== Testing ${formatName} ===`);
        const session = await ai.live.connect({
            model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
            callbacks: {
                onclose: (e) => {
                    console.log(`[${formatName}] CLOSED: Code: ${e?.code || e?.closeCode}, Reason: ${e?.reason}`);
                    isClosed = true;
                    resolve();
                },
                onerror: (e) => {}
            }
        });
        session.sendRealtimeInput(params);
        setTimeout(() => { if (!isClosed) { console.log(`[${formatName}] SUCCESS!`); resolve(); } }, 1500);
    });
}
async function runAll() {
    const data = Buffer.alloc(1024, 0).toString('base64');
    await test('Array of LiveSendRealtimeInputParameters', [{ media: { mimeType: 'audio/pcm;rate=16000', data } }]);
    await test('Array of LiveSendRealtimeInputParameters (audio)', [{ audio: { mimeType: 'audio/pcm;rate=16000', data } }]);
    await test('Direct mediaChunks array', { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data }] });
    await test('media array', { media: [{ mimeType: 'audio/pcm;rate=16000', data }] });
}
runAll().catch(console.error);

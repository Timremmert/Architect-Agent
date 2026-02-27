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
                onerror: (e) => {
                    console.log(`[${formatName}] ERROR:`, e);
                }
            }
        });

        try {
            session.sendRealtimeInput(params);
        } catch (err) {
            console.log(`[${formatName}] SYNC ERROR:`, err.message);
        }

        setTimeout(() => {
            if (!isClosed) {
                console.log(`[${formatName}] SUCCESS!`);
                resolve();
            }
        }, 1500);
    });
}

async function runAll() {
    const data = Buffer.from('A'.repeat(500)).toString('base64');

    await test('Array of chunks', [{ mimeType: 'audio/pcm;rate=16000', data }]);
    await test('Object with media', { media: { mimeType: 'audio/pcm;rate=16000', data } });
    await test('Object with audio', { audio: { mimeType: 'audio/pcm;rate=16000', data } });

    // Testing mimeType flavors
    await test('media: audio/pcm (no rate)', { media: { mimeType: 'audio/pcm', data } });
    await test('media: pcm;rate=16000', { media: { mimeType: 'pcm;rate=16000', data } });

    // What if data needs to be ArrayChunks under mediaChunks instead?
    await test('mediaChunks array', { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data }] });

}

runAll().catch(console.error);

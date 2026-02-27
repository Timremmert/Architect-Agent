require('dotenv').config({ path: 'server/.env' });
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({
    vertexai: true,
    project: 'gen-lang-client-0208563832',
    location: 'europe-west1'
});

async function runTest(name, payloadGen) {
    return new Promise(async (resolve) => {
        let isClosed = false;
        console.log(`\n=== Testing ${name} ===`);
        const session = await ai.live.connect({
            model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
            callbacks: {
                onclose: (event) => {
                    console.log(`[${name}] Connection CLOSED Code: ${event?.code || event?.closeCode}, Reason: ${event?.reason}`);
                    isClosed = true;
                    resolve('closed');
                },
                onerror: (e) => {
                    console.log(`[${name}] ERROR:`, e);
                }
            }
        });

        let count = 0;
        const interval = setInterval(() => {
            if (isClosed) {
                clearInterval(interval);
                return;
            }
            count++;
            try {
                session.sendRealtimeInput(payloadGen());
                console.log(`[${name}] sent chunk ${count}`);
            } catch (e) {
                console.log(`[${name}] sync err:`, e.message);
            }

            if (count > 3) {
                clearInterval(interval);
                console.log(`[${name}] SURVIVED 3 chunks. Hanging up.`);
                // Wait to see if it closes delayed
                setTimeout(() => {
                    if (!isClosed) {
                        console.log(`[${name}] Connection stayed open!`);
                        resolve('success');
                        session.ws.close(); // Not exposed, but whatever
                    }
                }, 1000);
            }
        }, 300);
    });
}

async function runAll() {
    const pcm = 'A'.repeat(500);

    // Test 1: Array of objects
    await runTest("Array of Media", () => [{ mimeType: 'audio/pcm;rate=16000', data: Buffer.from(pcm).toString('base64') }]);

    // Test 2: Object { media: { ... } }
    await runTest("Object with 'media'", () => ({ media: { mimeType: 'audio/pcm;rate=16000', data: Buffer.from(pcm).toString('base64') } }));

    // Test 3: Object { media: [{...}] }
    await runTest("Object with 'media' array", () => ({ media: [{ mimeType: 'audio/pcm;rate=16000', data: Buffer.from(pcm).toString('base64') }] }));

    console.log("All done.");
    process.exit(0);
}

runAll().catch(console.error);

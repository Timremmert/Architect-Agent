require('dotenv').config({ path: 'server/.env' });
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ vertexai: true, project: 'gen-lang-client-0208563832', location: 'us-central1' });

async function test() {
    return new Promise(async (resolve) => {
        let isClosed = false;
        console.log(`\n=== Testing gemini-2.0-flash-exp ===`);
        try {
            const session = await ai.live.connect({
                model: 'gemini-2.0-flash-exp',
                callbacks: {
                    onclose: (e) => {
                        console.log(`CLOSED: Code: ${e?.code || e?.closeCode}, Reason: ${e?.reason}`);
                        isClosed = true;
                        resolve();
                    },
                    onerror: (e) => {
                        console.log(`ERROR:`, e);
                    }
                }
            });
            console.log("Connected successfully!");
            session.sendRealtimeInput({ media: { mimeType: 'audio/pcm;rate=16000', data: Buffer.from('A'.repeat(500)).toString('base64') } });
            console.log("Sent Realtime Input");
            setTimeout(() => {
                if (!isClosed) {
                    console.log(`SUCCESS! connection stayed open.`);
                    resolve();
                }
            }, 3000);
        } catch (err) {
            console.log(`SYNC ERROR:`, err.message);
            resolve();
        }
    });
}
test().catch(console.error);

require('dotenv').config({ path: 'server/.env' });
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ vertexai: true, project: 'gen-lang-client-0208563832', location: 'europe-west1' });

async function test(name, sendFn) {
    return new Promise(async (resolve) => {
        let isClosed = false;
        console.log(`\n=== ${name} ===`);
        const session = await ai.live.connect({
            model: 'gemini-live-2.5-flash-native-audio',
            config: { responseModalities: ["AUDIO"] },
            callbacks: {
                onopen: () => console.log('  Connected'),
                onmessage: (msg) => {
                    if (msg.serverContent?.modelTurn?.parts) {
                        console.log('  Got model response!');
                    }
                },
                onclose: (e) => {
                    console.log(`  CLOSED: ${e?.code || e?.closeCode} ${e?.reason}`);
                    isClosed = true;
                    resolve('closed');
                },
                onerror: (e) => { }
            }
        });

        try {
            sendFn(session);
            console.log('  Sent successfully');
        } catch (err) {
            console.log('  SYNC ERROR:', err.message);
        }

        setTimeout(() => {
            if (!isClosed) {
                console.log('  SUCCESS - still open after 3s');
                resolve('success');
            }
        }, 3000);
    });
}

async function runAll() {
    const pcmData = Buffer.alloc(3200, 0).toString('base64'); // 100ms of silence at 16kHz

    // Test 1: SDK sendRealtimeInput with media (current approach - broken)
    await test('SDK media blob', (session) => {
        console.log(pcmData);
        session.sendRealtimeInput({ media: { mimeType: 'audio/pcm;rate=16000', data: pcmData } });
    });

    // Test 2: Direct conn.send with mediaChunks as raw base64 strings
    await test('Direct: mediaChunks raw bytes', (session) => {
        session.conn.send(JSON.stringify({
            realtimeInput: { mediaChunks: [pcmData] }
        }));
    });

    // Test 3: Direct conn.send with audio as raw base64 string
    await test('Direct: audio raw bytes', (session) => {
        session.conn.send(JSON.stringify({
            realtimeInput: { audio: pcmData }
        }));
    });

    // Test 4: SDK sendRealtimeInput with audio blob
    await test('SDK audio blob', (session) => {
        session.sendRealtimeInput({ audio: { mimeType: 'audio/pcm;rate=16000', data: pcmData } });
    });

    process.exit(0);
}

runAll().catch(console.error);

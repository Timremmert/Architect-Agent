require('dotenv').config({ path: 'server/.env' });
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ vertexai: true, project: 'gen-lang-client-0208563832', location: 'europe-west1' });

async function run() {
    return new Promise(async (resolve) => {
        const session = await ai.live.connect({
            model: 'gemini-live-2.5-flash-native-audio',
            config: {
                responseModalities: ["AUDIO"],
                systemInstruction: { parts: [{ text: "Du bist ein Test-Assistent." }] }
            },
            callbacks: {
                onopen: () => console.log('Connected'),
                onmessage: (msg) => {
                    if (msg.serverContent?.modelTurn) console.log('Got model turn (Response from Gemini)');
                },
                onclose: () => resolve()
            }
        });

        console.log('Sending initial client_content');
        session.sendClientContent({ turns: [{ role: "user", parts: [{ text: "Hallo" }] }], turnComplete: true });

        // Wait 1 second (so the first turnaround finishes)
        await new Promise(r => setTimeout(r, 1000));

        console.log('Sending silent chunks (2s) ...');
        const silentPcm = Buffer.alloc(3200, 0).toString('base64');
        for (let i = 0; i < 20; i++) {
            session.sendRealtimeInput([{ mimeType: 'audio/pcm;rate=16000', data: silentPcm }]);
            await new Promise(r => setTimeout(r, 100)); // 100ms per message
        }

        console.log('Finished sending silent chunks. Waiting 3s to see if Gemini responds...');
        await new Promise(r => setTimeout(r, 3000));

        console.log('Sending loud noise chunks (5s speech) ...');
        // A pattern of noise rather than pure 255
        const loudBuffer = Buffer.alloc(3200);
        for (let j = 0; j < 3200; j++) loudBuffer[j] = Math.random() * 255;
        const loudPcm = loudBuffer.toString('base64');

        for (let i = 0; i < 50; i++) {
            session.sendRealtimeInput([{ mimeType: 'audio/pcm;rate=16000', data: loudPcm }]);
            await new Promise(r => setTimeout(r, 100));
        }

        console.log('Finished sending loud chunks. Sending trailing silence for 2s to trigger VAD...');
        for (let i = 0; i < 20; i++) {
            session.sendRealtimeInput([{ mimeType: 'audio/pcm;rate=16000', data: silentPcm }]);
            await new Promise(r => setTimeout(r, 100)); // 100ms per message
        }

        console.log('Waiting 5s to see if Gemini responds...');
        await new Promise(r => setTimeout(r, 5000));

        console.log('Forcing turnComplete to see if Gemini processed the loud noise...');
        session.sendClientContent({ turnComplete: true });

        await new Promise(r => setTimeout(r, 3000));

        session.close();
        resolve();
    });
}
run();

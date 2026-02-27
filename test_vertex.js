require('dotenv').config({ path: 'server/.env' });
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ vertexai: true, project: 'gen-lang-client-0208563832', location: 'europe-west1' });


async function run() {
    console.log("Connecting...");
    const session = await ai.live.connect({
        model: 'models/gemini-live-2.5-flash-native-audio',
        callbacks: {
            onopen: () => console.log('Connected!'),
            onclose: () => console.log('Closed'),
            onerror: (e) => console.log('Error', e),
            onmessage: (m) => console.log('Msg', m)
        }
    });

    // Send the first payload
    session.sendRealtimeInput({ media: { mimeType: 'audio/pcm;rate=16000', data: 'A'.repeat(500) } });
    console.log('Sent first chunk');

    let count = 0;
    const interval = setInterval(() => {
        count++;
        // send realtime
        session.sendRealtimeInput({ media: { mimeType: 'audio/pcm;rate=16000', data: 'A'.repeat(500) } });
        console.log('Sent chunk', count);
        if (count > 10) clearInterval(interval);
    }, 100);
}
run().catch(console.error);

require('dotenv').config({ path: 'server/.env' });
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({
  vertexai: true,
  project: 'gen-lang-client-0208563832',
  location: 'europe-west1'
});

async function run() {
  console.log("Connecting...");
  const session = await ai.live.connect({
    model: 'models/gemini-live-2.5-flash-native-audio',
  });

  try {
    console.log('Sending array chunk (pre-relay format)');
    // Testing the array vs object
    session.sendRealtimeInput([{
      mimeType: 'audio/pcm;rate=16000',
      data: Buffer.from('A'.repeat(500)).toString('base64')
    }]);
  } catch (e) {
    console.log("Array chunk threw:", e);
  }

  try {
    console.log('Sending object chunk (current format)');
    session.sendRealtimeInput({
      media: {
        mimeType: 'audio/pcm;rate=16000',
        data: Buffer.from('A'.repeat(500)).toString('base64')
      }
    });
  } catch (e) {
    console.log("Object chunk threw:", e);
  }

  // Test the specific "audio" parameter vs "media" parameter
  try {
    console.log('Sending object chunk with audio format (possible correct format)');
    session.sendRealtimeInput({
      audio: { // NOT media
        mimeType: 'audio/pcm;rate=16000',
        data: Buffer.from('A'.repeat(500)).toString('base64')
      }
    });
  } catch (e) {
    console.log("Audio chunk threw:", e);
  }

  console.log("Done");
  process.exit(0);
}
run().catch(console.error);

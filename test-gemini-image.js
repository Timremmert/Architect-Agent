const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
require('dotenv').config({ path: './server/.env' });

const ai = new GoogleGenAI({ apiKey: process.env.NANO_BANANA_API_KEY });

async function test() {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: 'Draw a blue couch',
            config: {
                responseModalities: ['IMAGE']
            }
        });
        console.log("Success:", !!response.candidates[0].content.parts[0].inlineData);
    } catch (e) {
        console.error("Error:", e.message);
    }
}
test();

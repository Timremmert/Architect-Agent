import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Set up simple file upload handling for freeze frames (in-memory for demo)
const upload = multer({ storage: multer.memoryStorage() });

import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.NANO_BANANA_API_KEY });

app.post('/api/inpaint', upload.single('image'), async (req, res) => {
    try {
        const { furniture_type, material, coordinates, style } = req.body;
        console.log(`Received request to inpaint: ${furniture_type} made of ${material} at ${coordinates}. Style: ${style || 'None'}`);

        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No image provided' });
        }

        if (!process.env.NANO_BANANA_API_KEY || process.env.NANO_BANANA_API_KEY === 'your_placeholder_api_key_here') {
            console.warn("WARNING: No valid NANO_BANANA_API_KEY provided. Please set it in server/.env");
            return res.status(500).json({ success: false, error: 'API Key missing in backend' });
        }

        // Convert the Multer memory buffer to the format GenAI SDK wants
        const base64Image = req.file.buffer.toString('base64');
        const mimeType = req.file.mimetype;

        // Formulate the prompt based on Gemini Live's extracted parameters and context
        let prompt = `Seamlessly integrate a high-quality, photorealistic ${material} ${furniture_type} into the ${coordinates} of the room. Ensure perfect perspective, matching lighting, natural shadows, and seamless blending with the existing environment. Professional interior photography.`;

        if (style) {
            prompt = `Interior design style: ${style}. ${prompt}`;
        }

        // Using gemini-3-pro-image-preview as an image-to-image pipeline for Nano Banana
        const targetModel = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
        console.log(`Using model: ${targetModel} for in-painting`);

        const response = await ai.models.generateContent({
            model: targetModel,
            contents: [
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Image
                    }
                },
                { text: prompt }
            ],
            config: {
                // Inform the model that we expect an image back (supported by experimental multimodality)
                responseModalities: ["IMAGE"]
            }
        });

        // The image should be returned as an inlineData inside a candidate part
        let rawBase64 = null;
        if (response.candidates && response.candidates.length > 0) {
            const candidate = response.candidates[0];
            for (const part of candidate.content.parts) {
                if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
                    rawBase64 = part.inlineData.data;
                    break;
                }
            }
        }

        if (rawBase64) {
            res.json({
                success: true,
                imageUrl: `data:image/jpeg;base64,${rawBase64}`,
                message: 'In-painting complete'
            });
        } else {
            console.error("No image part found in Nano Banana response:", JSON.stringify(response));
            throw new Error("No image returned from Google GenAI");
        }

    } catch (error) {
        console.error('Error during in-painting request:', error);
        res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
});

// Serving the React frontend in production
app.use(express.static(path.join(__dirname, '../client/dist')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(port, () => {
    console.log(`Backend server running on port ${port}`);
});

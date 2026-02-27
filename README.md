# The Instant Architect 🛋️✨

**Built for the Google Live Agent Hackathon 2025** 🏆

Welcome to **The Instant Architect**, an AI-powered interior design partner that "sees" through your device's camera, listens to your natural language instructions, and live-generates (in-paints) stunning furniture into your room using Generative AI.

## 🚀 Core Concept

The application serves as an enthusiastic interior architect. By leveraging low-latency audio and vision streaming via WebSockets, you can have a natural conversation with the AI about your room. 

When you agree on a design suggestion (e.g., "Yes, put a blue Bauhaus couch there!"), the AI triggers a tool that captures a high-resolution snapshot of your living space and sends it to an image-generation backend. Within seconds, a photorealistic rendering of the suggested furniture is placed seamlessly into your room's live feed.

## 🏗️ Architecture

The project is structured as a Monorepo containing a modern web frontend and a lightweight backend orchestrator.

### 1. Frontend (`/client`)
- **Built with:** React and Vite (optimized for mobile Safari/Chrome).
- **Functionality:** 
  - Captures full-screen video (`object-fit: cover`) from the user's mobile camera.
  - Maintains a persistent WebSocket connection to the **Node.js Backend**, which securely relays data to the GenAI Live API.
  - Streams 16kHz PCM audio and base64 video frames in real-time.
  - Receives AI audio responses and plays them back dynamically via the Web Audio API (`AudioContext`).
  - Listens for Gemini's specific `render_furniture` Function Calls to trigger the visual magic.

### 2. Backend (`/server`)
- **Built with:** Node.js, Express, and Multer.
- **Functionality:** 
  - Keeps the API keys secure.
  - Exposes the `/api/inpaint` endpoint.
  - Receives high-resolution frame snapshots from the client when the image generation tool is triggered.
  - Communicates with the **Google GenAI SDK** (specifically utilizing advanced multimodal models like `gemini-live-2.5-flash-native-audio` and `gemini-2.5-flash-image`) to process the image and prompt, generating the in-painted result.

## 🔄 The "Magic" Workflow

1. **The Conversation:** The web app captures your microphone and camera. Data is continuously streamed to Gemini. The model is prompted with a specific persona ("Enthusiastic interior architect").
2. **The Output:** Gemini speaks back to you. The frontend decodes the incoming base64 24kHz PCM audio chunks and plays them instantly.
3. **The Trigger:** You tell the agent: "I want to see the couch." The Gemini model triggers the pre-defined `render_furniture` or `render_room` tool. 
4. **The Snapshot:** The frontend intercepts this tool call, instantly grabs a high-resolution snapshot of the video feed, and sends it to the local Express backend alongside the AI's parameters (e.g., `fabric`, `type`).
5. **The In-Painting:** The Node.js server routes the image and the formulated prompt to Google's Image Generation API.
6. **The Result:** The backend returns the final generated image (Base64), which the frontend overlays beautifully onto your screen as a "Wow" moment.

## 🛠️ Local Setup Instructions

### Prerequisites
- Node.js (v18+ recommended)
- A Google Cloud Project with Vertex AI API enabled.
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (`gcloud`) installed and authenticated.


### 1. Clone & Install
```bash
git clone https://github.com/timremmert/Architect-Agent.git
cd Architect-Agent

# Install all workspace dependencies at once
pnpm install
```

### 2. Environment Variables
You only need to configure the backend API URL for the frontend.

**Frontend (`client/.env`):**
```env
VITE_API_BASE_URL=http://localhost:3001
```

**Backend (`server/.env`):**
```env
PORT=3001
```

### 3. Google Cloud Authentication
Since the application connects directly to Vertex AI, you need to authorize your local environment using Application Default Credentials (ADC) and specify your project ID:
```bash
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

### 4. Run the Development Server
From the root `the-instant-architect` directory, you can start both the frontend and the backend simultaneously:
```bash
pnpm run dev
```

- The React frontend will run at `http://localhost:5173`
- The Express backend will run at `http://localhost:3001`

*(Note: Depending on your browser's security policies, you might need to access the app via `localhost` or set up HTTPS to allow microphone/camera permissions).*

## ⚠️ Notes on API Limits
Image generation models (like `gemini-2.5-flash-image`) have strict rate limits and quotas under the free tier. If you encounter a `429 Resource Exhausted` or `Quota` error, you may need to either link your API key to a billed Google Cloud Project or utilize a mock-mode.

## ☁️ Deployment (Google Cloud Run)

The application can be deployed reproducibly to Google Cloud Run using Terraform. This deploys a single container that serves both the built React frontend and the Express backend.

### Prerequisites
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (`gcloud`) installed and authenticated.
- [Terraform](https://developer.hashicorp.com/terraform/downloads) installed.
- A Google Cloud Project with billing enabled.
- [Docker](https://www.docker.com/) installed and running. (or Podman with Docker compatibility mode)

### Deployment Steps

We've bundled the entire deployment process into a single executable script so you don't have to manually build Docker images and Terraform states.

1. **Copy Environment Variables:**
   Make sure you have copied `server/.env.example` to `server/.env` and filled in your `GOOGLE_CLOUD_PROJECT`.

2. **Run the Deployment Script:**
   From the root repository directory, simply run:
   ```bash
   ./deploy.sh
   ```

The script will automatically:
- Authenticate with your Google Cloud account
- Enable required Google Cloud APIs (Artifact Registry, Cloud Run, Vertex AI)
- Initialize Terraform and create an Artifact Registry
- Build the Node.js+React container locally
- Push the Docker Image to your Google Cloud project
- Deploy the Cloud Run application

After applying, the console will output your public **`service_url`**.

### Continuous Updates
To deploy a new version of your code later, simply run `./deploy.sh` again. It handles both fresh provisions and code updates automatically!

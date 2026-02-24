# The Instant Architect 🛋️✨

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
  - Maintains a persistent WebSocket connection directly to the **Gemini Live API (Multimodal Bidi API)**.
  - Streams 16kHz PCM audio and base64 video frames in real-time.
  - Receives AI audio responses and plays them back dynamically via the Web Audio API (`AudioContext`).
  - Listens for Gemini's specific `render_furniture` Function Calls to trigger the visual magic.

### 2. Backend (`/server`)
- **Built with:** Node.js, Express, and Multer.
- **Functionality:** 
  - Keeps the API keys secure.
  - Exposes the `/api/inpaint` endpoint.
  - Receives high-resolution frame snapshots from the client when the image generation tool is triggered.
  - Communicates with the **Google GenAI SDK** (specifically utilizing advanced multimodal models like `gemini-3-pro-image-preview` / Imagen) to process the image and prompt, generating the in-painted result.

## 🔄 The "Magic" Workflow

1. **The Conversation:** The web app captures your microphone and camera. Data is continuously streamed to Gemini. The model is prompted with a specific persona ("Enthusiastic interior architect").
2. **The Output:** Gemini speaks back to you. The frontend decodes the incoming base64 24kHz PCM audio chunks and plays them instantly.
3. **The Trigger:** You tell the agent: "I want to see the couch." The Gemini model triggers the pre-defined `render_furniture` tool.
4. **The Snapshot:** The frontend intercepts this tool call, instantly grabs a high-resolution snapshot of the video feed, and sends it to the local Express backend alongside the AI's parameters (e.g., `fabric`, `type`).
5. **The In-Painting:** The Node.js server routes the image and the formulated prompt to Google's Image Generation API.
6. **The Result:** The backend returns the final generated image (Base64), which the frontend overlays beautifully onto your screen as a "Wow" moment.

## 🛠️ Setup Instructions

### Prerequisites
- Node.js (v18+ recommended)
- A valid Google AI Studio API Key with access to the Gemini Live API and Image Generation endpoints.

### 1. Clone & Install
```bash
git clone <repository-url>
cd the-instant-architect

# Install all workspace dependencies at once
pnpm install
```

### 2. Environment Variables
You need to configure your API keys in both the client and server.

**Frontend (`client/.env`):**
```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
VITE_API_BASE_URL=http://localhost:3001
```

**Backend (`server/.env`):**
```env
PORT=3001
NANO_BANANA_API_KEY=your_gemini_api_key_here
```

### 3. Run the Development Server
From the root `the-instant-architect` directory, you can start both the frontend and the backend simultaneously:
```bash
pnpm dev
```

- The React frontend will run at `http://localhost:5173`
- The Express backend will run at `http://localhost:3001`

*(Note: Depending on your browser's security policies, you might need to access the app via `localhost` or set up HTTPS to allow microphone/camera permissions).*

## ⚠️ Notes on API Limits
Image generation models (like `gemini-2.5-flash-image` or `imagen-3.0-generate-002`) have strict rate limits and quotas under the free tier. If you encounter a `429 Resource Exhausted` or `Quota` error, you may need to either link your API key to a billed Google Cloud Project or utilize a mock-mode.

## ☁️ Deployment (Google Cloud Run)

The application can be deployed reproducibly to Google Cloud Run using Terraform. This deploys a single container that serves both the built React frontend and the Express backend.

### Prerequisites
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (`gcloud`) installed and authenticated.
- [Terraform](https://developer.hashicorp.com/terraform/downloads) installed.
- A Google Cloud Project with billing enabled.

### Deployment Steps

1. **Authenticate with Google Cloud:**
   ```bash
   gcloud auth login
   gcloud auth application-default login
   gcloud config set project YOUR_PROJECT_ID
   ```

2. **Initialize Terraform:**
   ```bash
   cd terraform
   terraform init
   ```

3. **Provide your Variables:**
   Create a `terraform.tfvars` file in the `terraform/` directory:
   ```hcl
   project_id          = "your-gcp-project-id"
   region              = "europe-west3"
   nano_banana_api_key = "your_gemini_api_key_here"
   ```

4. **Create the Artifact Registry:**
   First, we need to create the Docker repository before we can push our image.
   ```bash
   terraform apply -target=google_artifact_registry_repository.app_repo
   ```

5. **Build and Push the Docker Image:**
   Return to the project root to build the monolithic container image and push it to the new registry.
   *(Replace `europe-west3` and `YOUR_PROJECT_ID` with your actual values)*
   
   ```bash
   cd ..
   
   # Authenticate Docker with your region
   gcloud auth configure-docker europe-west3-docker.pkg.dev
   
   # Build the image
   docker build -t europe-west3-docker.pkg.dev/YOUR_PROJECT_ID/instant-architect-repo/instant-architect:latest .
   
   # Push the image
   docker push europe-west3-docker.pkg.dev/YOUR_PROJECT_ID/instant-architect-repo/instant-architect:latest
   ```

6. **Deploy the Cloud Run Service:**
   Now deploy the actual Cloud Run service using the image you just pushed.
   ```bash
   cd terraform
   
   # We specify the image_url variable to use our newly pushed image
   terraform apply -var="image_url=europe-west3-docker.pkg.dev/YOUR_PROJECT_ID/instant-architect-repo/instant-architect:latest"
   ```

After applying, Terraform will output your public `service_url`.

### Continuous Updates
To deploy a new version of your code later, simply rebuild and push the Docker image, then tell Cloud Run to update:
```bash
gcloud run deploy instant-architect \
  --image europe-west3-docker.pkg.dev/YOUR_PROJECT_ID/instant-architect-repo/instant-architect:latest \
  --region europe-west3
```

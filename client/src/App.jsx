import React, { useState, useRef, useEffect } from 'react';
import CameraView from './components/CameraView';
import { useGeminiLive } from './hooks/useGeminiLive';

// Simple helper to lower the framerate we send to Gemini
const FRAME_RATE_MS = 1000;

function App() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [generatedImages, setGeneratedImages] = useState([]); // Store all generated designs ({ url, originalUrl, ... })
  const [selectedImagePair, setSelectedImagePair] = useState(null); // { originalUrl, generatedUrl } for comparison
  const [sliderPosition, setSliderPosition] = useState(50);   // Vertical slider position (0-100%)
  const [frozenSnapshot, setFrozenSnapshot] = useState(null); // The freeze-frame while generating
  const [isGalleryOpen, setIsGalleryOpen] = useState(true);   // Toggle for the gallery layout
  const [currentStyle, setCurrentStyle] = useState(null);     // Voice-determined design style

  const cameraRef = useRef(null);
  const videoIntervalRef = useRef(null);

  // You would normally securely fetch this from your backend or env
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const geminiModel = import.meta.env.VITE_GEMINI_MODEL;

  const { status, connect, disconnect, sendVideoFrame, onFunctionCall, sendToolResponse } = useGeminiLive(apiKey, geminiModel);

  const toggleConnection = () => {
    if (status === 'connected' || status === 'connecting') {
      disconnect();
    } else {
      connect();
    }
  };

  // 1. Setup continuous video streaming to Gemini when connected
  useEffect(() => {
    if (status === 'connected') {
      // Send a frame every second
      videoIntervalRef.current = setInterval(() => {
        if (cameraRef.current) {
          // We use the same snapshot tool but maybe lower quality if we had the option
          const frameBase64 = cameraRef.current.takeSnapshot();
          if (frameBase64) {
            sendVideoFrame(frameBase64);
          }
        }
      }, FRAME_RATE_MS);
    } else {
      if (videoIntervalRef.current) {
        clearInterval(videoIntervalRef.current);
      }
    }

    return () => {
      if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
    };
  }, [status, sendVideoFrame]);

  // 2. Listen for function calls from Gemini
  useEffect(() => {
    onFunctionCall(async (functionCall) => {
      const args = functionCall.args;

      if (functionCall.name === 'render_furniture') {
        console.log("Gemini wants to render:", args);

        // Update the current style if it was provided in the prompt
        if (args.style) {
          console.log("Setting style to:", args.style);
          setCurrentStyle(args.style);
        }

        // Immediately tell Gemini we are handling it so it doesn't freeze
        if (sendToolResponse) {
          sendToolResponse([{
            id: functionCall.id || "1",
            name: functionCall.name,
            response: { result: "Rendering started, generating image overlay now. Tell the user it will take a few seconds." }
          }]);
        }

        // Trigger the Inpainting workflow with the style context!
        handleInpaintRequest(args.furniture_type, args.material, args.coordinates, args.style || currentStyle);

      } else if (functionCall.name === 'render_room') {
        console.log("Gemini wants to render room:", args);

        if (args.style) {
          console.log("Setting style to:", args.style);
          setCurrentStyle(args.style);
        }

        if (sendToolResponse) {
          sendToolResponse([{
            id: functionCall.id || "2",
            name: functionCall.name,
            response: { result: "Room rendering started, generating new room design now. Tell the user it will take a few seconds." }
          }]);
        }

        // Trigger the Inpainting workflow for a full room redesign
        const mockMaterial = args.color_palette || "matching colors";
        const styleContext = args.style ? `${args.style} style, Mood: ${args.mood || 'matching'}` : `Mood: ${args.mood || 'matching'}`;
        handleInpaintRequest("entire room redesign", mockMaterial, "everywhere", styleContext || currentStyle);
      }
    });
  }, [onFunctionCall, sendToolResponse, currentStyle]);

  const handleInpaintRequest = async (furniture_type, material, coordinates, styleContext) => {
    if (!cameraRef.current) return;

    setIsProcessing(true);

    // Freeze Frame! Take the high-res snapshot right NOW.
    const snapshotBase64 = cameraRef.current.takeSnapshot();

    if (!snapshotBase64) {
      setIsProcessing(false);
      return;
    }

    // Set the state so the live feed gets covered by this still frame
    setFrozenSnapshot(snapshotBase64);

    try {
      const res = await fetch(snapshotBase64);
      const blob = await res.blob();

      const formData = new FormData();
      formData.append('image', blob, 'snapshot.jpg');
      formData.append('furniture_type', furniture_type || 'Unknown furniture');
      formData.append('material', material || 'Unknown material');
      formData.append('coordinates', coordinates || 'center');
      if (styleContext) {
        formData.append('style', styleContext);
      }

      // Use relative paths in production to route to the same origin (Express server)
      const baseUrl = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001');

      const apiResponse = await fetch(`${baseUrl}/api/inpaint`, {
        method: 'POST',
        body: formData
      });

      const data = await apiResponse.json();

      if (data.success && data.imageUrl) {
        // Add the new image pair to the beginning of the gallery array
        setGeneratedImages(prev => [{
          url: data.imageUrl,
          originalUrl: snapshotBase64, // Store the freeze frame for later comparison
          timestamp: new Date().toLocaleTimeString(),
          description: `${material} ${furniture_type}`
        }, ...prev]);

        // Auto-open the comparison slider right after generation
        setSelectedImagePair({
          originalUrl: snapshotBase64,
          generatedUrl: data.imageUrl
        });
        setSliderPosition(50); // Reset slider to middle
      }
    } catch (err) {
      console.error("In-painting test failed", err);
    } finally {
      setIsProcessing(false);
      // Unfreeze the camera feed (unless they are interacting with the modal, but the modal covers it anyway)
      setFrozenSnapshot(null);
    }
  };

  const isConnected = status === 'connected';

  return (
    <div id="root" style={{ '--gallery-height': isGalleryOpen ? '30dvh' : '56px' }}>

      {/* 
        ========================================================
        TOP 70%: LIVE CAMERA & MAIN UI
        ========================================================
      */}
      <div className="camera-view-port">
        {/* The Camera Feed */}
        <CameraView ref={cameraRef} isRendering={isProcessing} />

        {/* The Freeze Frame (Pauses reality during generation) */}
        {frozenSnapshot && (
          <img
            src={frozenSnapshot}
            className="frozen-snapshot-overlay"
            alt="Frozen Reality"
          />
        )}

        {/* UI Overlay on top of camera */}
        <div className="ui-layer">
          <div className="top-layout">
            <div className="header-bar">
              <h1 className="title">Instant Architect</h1>

              <div className="status-badge">
                <div className={`status-dot ${isProcessing ? 'processing' : isConnected ? 'active' : ''}`}></div>
                {isProcessing ? 'Generating...' : isConnected ? 'Listening' : 'Ready (Tap Mic)'}
              </div>
            </div>

            {currentStyle && (
              <div className="style-badge">
                ✨ Stil: {currentStyle}
              </div>
            )}
          </div>

          <div className="camera-controls">
            <button
              className={`mic-button ${isConnected ? 'recording' : ''}`}
              onClick={toggleConnection}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {!isConnected ? (
                  <>
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                  </>
                ) : (
                  <rect x="6" y="6" width="12" height="12" rx="2" ry="2" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* 
        ========================================================
        BOTTOM 30%: SCROLLABLE GALLERY LEISTE
        ========================================================
      */}
      <div className={`gallery-container ${!isGalleryOpen ? 'collapsed' : ''}`}>
        <div className="gallery-header" onClick={() => setIsGalleryOpen(!isGalleryOpen)}>
          <span>Your Designs ({generatedImages.length})</span>
          <span className="gallery-toggle-icon">
            {isGalleryOpen ? '▼' : '▲'}
          </span>
        </div>

        <div className="carousel-track">
          {generatedImages.length === 0 ? (
            <div className="empty-gallery">
              Talk to the architect to generate ideas!
            </div>
          ) : (
            generatedImages.map((img, idx) => (
              <div
                key={idx}
                className="gallery-item"
                onClick={() => {
                  setSelectedImagePair({
                    originalUrl: img.originalUrl,
                    generatedUrl: img.url
                  });
                  setSliderPosition(50);
                }}
              >
                <img src={img.url} className="gallery-image" alt={`Design ${idx}`} />
              </div>
            ))
          )}
        </div>
      </div>

      {/* 
        ========================================================
        MODAL: FULLSCREEN COMPARISON SLIDER (VORHER/NACHHER)
        ========================================================
      */}
      {selectedImagePair && (
        <div className="comparison-modal">

          <div className="comparison-image-container">
            {/* 1. Base layer: The original frozen snapshot (Before) */}
            <img
              src={selectedImagePair.originalUrl}
              className="comparison-bg-image"
              alt="Original Room"
            />

            {/* 2. Top layer: The generated image (After), clipped by the slider */}
            <img
              src={selectedImagePair.generatedUrl}
              className="comparison-fg-image"
              style={{ clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)` }}
              alt="Generated Design"
            />

            {/* The visual dividing line and handle */}
            <div
              className="comparison-divider-line"
              style={{ left: `${sliderPosition}%` }}
            >
              <div className="comparison-handle">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#202124" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#202124" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </div>
            </div>

            {/* Invisible native range input bridging the whole screen for easy dragging */}
            <input
              type="range"
              min="0"
              max="100"
              value={sliderPosition}
              onChange={(e) => setSliderPosition(parseFloat(e.target.value))}
              className="comparison-invisible-slider"
            />
          </div>

          {/* Modal Controls (Close) */}
          <div className="modal-controls">
            <button className="close-modal-btn" onClick={() => setSelectedImagePair(null)}>
              Zurück zur Kamera
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;

import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';

const CameraView = forwardRef(({ onStreamStart, isRendering }, ref) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [streamError, setStreamError] = useState(null);

    // Expose methods to the parent component (App)
    // For taking high-res snapshots and getting the stream for Gemini
    useImperativeHandle(ref, () => ({
        takeSnapshot: () => {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (!video || !canvas) return null;

            // Set canvas to actual video resolution for the screenshot
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Return high quality JPEG
            return canvas.toDataURL('image/jpeg', 0.95);
        },
        getStream: () => {
            return videoRef.current?.srcObject;
        }
    }));

    useEffect(() => {
        let activeStream = null;

        const startCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: 'environment', // Prefer back camera on mobile
                        width: { ideal: 1280 },    // Request reasonable resolution
                        height: { ideal: 720 }
                    },
                    audio: true // Need audio for Gemini
                });

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
                activeStream = stream;

                if (onStreamStart) {
                    onStreamStart(stream);
                }

            } catch (err) {
                console.error("Error accessing camera:", err);
                setStreamError("Kamera konnte nicht gestartet werden. Bitte erlaube den Zugriff.");
            }
        };

        startCamera();

        return () => {
            if (activeStream) {
                activeStream.getTracks().forEach(track => track.stop());
            }
        };
    }, [onStreamStart]);

    return (
        <div className="camera-container">
            {streamError ? (
                <div style={{ color: 'white', padding: '20px', textAlign: 'center' }}>
                    {streamError}
                </div>
            ) : (
                <>
                    <video
                        ref={videoRef}
                        className="main-video"
                        autoPlay
                        playsInline
                        muted // Mute local playback to avoid echo
                    />
                    <canvas ref={canvasRef} className="snapshot-canvas" />

                    {isRendering && (
                        <div className="rendering-overlay">
                            <div className="custom-spinner"></div>
                            <p>Rendering...</p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
});

export default CameraView;

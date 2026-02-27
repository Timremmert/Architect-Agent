// public/pcm-processor.js
class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 512; // Accumulate ~128ms of audio at 16kHz
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
    }

    process(inputs) {
        const input = inputs[0];
        if (input && input.length > 0) {
            const channelData = input[0];

            for (let i = 0; i < channelData.length; i++) {
                this.buffer[this.bufferIndex++] = channelData[i];

                // When buffer is full, convert to Int16 (Little-Endian) and send
                if (this.bufferIndex >= this.bufferSize) {
                    const outBuffer = new ArrayBuffer(this.bufferSize * 2);
                    const view = new DataView(outBuffer);
                    for (let j = 0; j < this.bufferSize; j++) {
                        const s = Math.max(-1, Math.min(1, this.buffer[j]));
                        // true = little-endian, required by Gemini
                        view.setInt16(j * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
                    }

                    this.port.postMessage(outBuffer, [outBuffer]);

                    // Reset buffer
                    this.buffer = new Float32Array(this.bufferSize);
                    this.bufferIndex = 0;
                }
            }
        }
        return true;
    }
}

registerProcessor('pcm-processor', PCMProcessor);


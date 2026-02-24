// public/pcm-processor.js
class PCMProcessor extends AudioWorkletProcessor {
    process(inputs) {
        const input = inputs[0];
        if (input && input.length > 0) {
            const channelData = input[0];

            // Convert Float32Array to Int16Array
            const int16Data = new Int16Array(channelData.length);
            for (let i = 0; i < channelData.length; i++) {
                int16Data[i] = Math.max(-1, Math.min(1, channelData[i])) * 0x7FFF;
            }

            // Post the ArrayBuffer back to the main thread
            // We transfer the buffer to avoid copying data
            this.port.postMessage(int16Data.buffer, [int16Data.buffer]);
        }

        // Return true to keep the processor alive
        return true;
    }
}

registerProcessor('pcm-processor', PCMProcessor);


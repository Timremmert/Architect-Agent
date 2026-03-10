import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import WebSocket from 'ws';
import { server } from '../index.js';

describe('WebSocket Live API Relay', () => {
    let wsClient;
    const PORT = 3002; // Use a different port for testing to avoid conflicts

    before((done) => {
        // Start the server on a test port
        server.listen(PORT, done);
    });

    after((done) => {
        // Clean up
        if (wsClient && wsClient.readyState === WebSocket.OPEN) {
            wsClient.close();
        }
        server.close(done);
    });

    test('should connect and accept a client_content message without crashing', (t, done) => {
        wsClient = new WebSocket(`ws://localhost:${PORT}/api/live`);

        wsClient.on('open', () => {
            // Send a mock message format that the server expects
            const payload = JSON.stringify({
                type: 'client_content',
                data: { text: "Hello AI" }
            });

            wsClient.send(payload);

            // Give it a brief moment to ensure the server processes it without throwing an unhandled exception
            setTimeout(() => {
                assert.ok(wsClient.readyState === WebSocket.OPEN);
                done();
            }, 500);
        });

        wsClient.on('error', (err) => {
            assert.fail(`WebSocket connection failed: ${err.message}`);
        });
    });
});

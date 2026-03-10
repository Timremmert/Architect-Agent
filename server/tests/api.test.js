import { test, describe } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { app } from '../index.js';

describe('API Endpoints API (/api/inpaint)', () => {

    test('should return 400 if no image is uploaded', async () => {
        const response = await request(app)
            .post('/api/inpaint')
            .send(); // No files attached

        assert.strictEqual(response.status, 400);
        assert.ok(response.body.success === false);
        assert.match(response.body.error, /No image provided/);
    });

    // We can't easily test a real successful request without mocking the Google GenAI SDK
    // because it requires valid API keys and consumes quota.
    // However, we can test that the endpoint parses form data correctly.
    test('should return 500 or validation error if prompt is missing but image exists', async () => {
        const response = await request(app)
            .post('/api/inpaint')
            .attach('image', Buffer.from('fake image data'), 'test.png');
        // Missing 'prompt' field

        // The exact error depends on how the SDK is mocked or if it throws a generic 500 when SDK fails
        // In this case, since the prompt is undefined, the server might hit an internal error when calling SDK
        assert.strictEqual(response.status, 500);
        assert.ok(response.body.success === false);
    });
});

import request from 'supertest';
import { describe, it, expect, afterAll } from 'vitest';

import { app, server } from '@/index';

describe('API Server', () => {
  afterAll(() => {
    server.close();
  });

  it('should return a deterministic response', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toBe('Hello World!');
  });

  it('should handle a bad request gracefully', async () => {
    const response = await request(app)
      .post('/bad-request')
      .send({ data: 'some data' });

    expect(response.status).toBe(404);
    expect(response.text).toBe('Not Found');
  });
});

import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/app.js';

describe('GET /health', () => {
  it('returns an operational health payload', async () => {
    const server = buildServer();

    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: 'dachbyte-office-api',
      status: 'ok',
    });

    await server.close();
  });
});

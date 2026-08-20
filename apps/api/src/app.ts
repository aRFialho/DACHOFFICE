import Fastify from 'fastify';

export const buildServer = () => {
  const server = Fastify({ logger: false });

  server.get('/health', async () => ({
    service: 'dachbyte-office-api',
    status: 'ok',
  }));

  return server;
};

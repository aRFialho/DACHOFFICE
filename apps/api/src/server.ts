import { buildServer } from './app.js';

const server = buildServer();

const start = async (): Promise<void> => {
  await server.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3000) });
};

start().catch(async (error: unknown) => {
  await server.close();
  throw error;
});

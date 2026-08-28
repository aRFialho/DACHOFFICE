import { startConfiguredWorker } from "./worker-entrypoint.js";

const worker = startConfiguredWorker();
const shutdown = async (): Promise<void> => {
  await worker.stop();
};
process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});

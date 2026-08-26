import type { TaskJobDispatcher } from "./postgres-task-worker.js";
import type { TaskOutboxJob } from "./task-worker.js";

export const createTaskJobDispatcher = (
  handlers: readonly TaskJobDispatcher[],
): TaskJobDispatcher => ({
  async canHandle(job: TaskOutboxJob): Promise<boolean> {
    return (await matchingHandler(handlers, job)) !== undefined;
  },
  async run(job: TaskOutboxJob): Promise<boolean> {
    const handler = await matchingHandler(handlers, job);
    return handler ? handler.run(job) : false;
  },
});

const matchingHandler = async (
  handlers: readonly TaskJobDispatcher[],
  job: TaskOutboxJob,
): Promise<TaskJobDispatcher | undefined> => {
  for (const handler of handlers)
    if (await handler.canHandle(job)) return handler;
  return undefined;
};

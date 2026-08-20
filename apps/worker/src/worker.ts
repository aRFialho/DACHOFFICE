export type FoundationJob = {
  id: string;
  idempotencyKey: string;
  message: string;
};

export const createFoundationQueue = () => {
  const jobs: FoundationJob[] = [];
  const idempotencyKeys = new Set<string>();
  return {
    enqueue(job: FoundationJob): void {
      if (!idempotencyKeys.has(job.idempotencyKey)) {
        idempotencyKeys.add(job.idempotencyKey);
        jobs.push(job);
      }
    },
    async drain(
      handle: (job: FoundationJob) => Promise<void>,
    ): Promise<number> {
      let processed = 0;
      for (const job of jobs.splice(0)) {
        await handle(job);
        processed += 1;
      }
      return processed;
    },
  };
};

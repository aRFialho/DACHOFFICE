export interface TaskOutboxJob {
  outboxId: string;
  idempotencyKey: string;
  taskId: string;
}

export interface TaskQueue {
  claimNext(): Promise<TaskOutboxJob | null>;
  settle(job: TaskOutboxJob, delivered: boolean): Promise<void>;
}

export interface TaskJobRunner {
  run(job: TaskOutboxJob): Promise<boolean>;
}

export class TaskOutboxWorker {
  constructor(
    private readonly queue: TaskQueue,
    private readonly runner: TaskJobRunner,
  ) {}

  async consumeOne(): Promise<boolean> {
    const job = await this.queue.claimNext();
    if (!job) return false;
    try {
      const delivered = await this.runner.run(job);
      await this.queue.settle(job, delivered);
      return delivered;
    } catch {
      await this.queue.settle(job, false);
      throw new Error("task job failed");
    }
  }
}

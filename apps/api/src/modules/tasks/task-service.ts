export type TaskPriority = "low" | "normal" | "high" | "critical";
export type TaskSource = "human" | "webhook" | "schedule" | "agent" | "meeting";
export type TaskStatus =
  | "queued"
  | "assigned"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

export interface TaskContextItemInput {
  key: string;
  value: string;
}

export interface CreateHumanTaskInput {
  officeId: string;
  type: string;
  title: string;
  description: string;
  priority: TaskPriority;
  requestedByUserId: string;
  context: readonly TaskContextItemInput[];
}

export interface TaskRecord extends CreateHumanTaskInput {
  id: string;
  source: TaskSource;
  status: TaskStatus;
  createdAt: Date;
}

export interface TaskRepository {
  createHumanTask(
    input: CreateHumanTaskInput & { source: "human" },
  ): Promise<TaskRecord>;
}

const required = (value: string, name: string, maximum: number): void => {
  if (!value.trim() || value.trim().length > maximum) {
    throw new Error(`${name} is invalid`);
  }
};

export class TaskService {
  constructor(private readonly repository: TaskRepository) {}

  async createHumanTask(input: CreateHumanTaskInput): Promise<TaskRecord> {
    required(input.officeId, "officeId", 80);
    required(input.type, "task type", 80);
    required(input.title, "task title", 240);
    required(input.description, "task description", 20000);
    required(input.requestedByUserId, "requestedByUserId", 80);
    if (!(["low", "normal", "high", "critical"] as const).includes(input.priority)) {
      throw new Error("task priority is invalid");
    }
    for (const item of input.context) {
      required(item.key, "task context key", 160);
      required(item.value, "task context value", 10000);
    }
    return this.repository.createHumanTask({ ...input, source: "human" });
  }
}

export const createTaskService = (repository: TaskRepository): TaskService =>
  new TaskService(repository);

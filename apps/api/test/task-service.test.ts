import { describe, expect, it, vi } from "vitest";
import {
  TaskService,
  type TaskRepository,
} from "../src/modules/tasks/task-service.js";

const repository: TaskRepository = {
  createHumanTask: async (input) => ({
    id: "task-1",
    status: "queued",
    createdAt: new Date("2026-08-20T00:00:00.000Z"),
    ...input,
  }),
};

describe("TaskService", () => {
  it("creates a queued human task with source-first context", async () => {
    const task = await new TaskService(repository).createHumanTask({
      officeId: "office-1",
      type: "investigation",
      title: "Review margin drop",
      description: "Investigate the current margin decrease.",
      priority: "high",
      requestedByUserId: "user-1",
      context: [
        { key: "sku", value: "ABC-1" },
        { key: "period", value: "last_7_days" },
      ],
    });

    expect(task).toMatchObject({
      id: "task-1",
      source: "human",
      priority: "high",
      status: "queued",
    });
  });

  it("rejects empty context keys before persistence", async () => {
    await expect(
      new TaskService(repository).createHumanTask({
        officeId: "office-1",
        type: "investigation",
        title: "Review margin drop",
        description: "Investigate the current margin decrease.",
        priority: "normal",
        requestedByUserId: "user-1",
        context: [{ key: "", value: "untrusted" }],
      }),
    ).rejects.toThrow("task context key is invalid");
  });
  it("rejects reserved margin analysis before task/outbox persistence", async () => {
    const createHumanTask = vi.fn();
    const service = new TaskService({ createHumanTask });

    await expect(
      service.createHumanTask({
        officeId: "office-1",
        type: "margin.analysis",
        title: "Bypass dedicated margin entry point",
        description: "This generic task must not reach persistence.",
        priority: "normal",
        requestedByUserId: "user-1",
        context: [],
      }),
    ).rejects.toThrow("task type is reserved");

    expect(createHumanTask).not.toHaveBeenCalled();
  });
});

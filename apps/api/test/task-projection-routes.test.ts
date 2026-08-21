import { beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/app.js";
import {
  createTaskService,
  type TaskRepository,
} from "../src/modules/tasks/task-service.js";
import {
  createAuthService,
  hashPassword,
  InMemoryAuthRepository,
} from "../src/modules/auth/index.js";

const tokenConfig = {
  audience: "dachbyte-office-web",
  issuer: "dachbyte-office-api",
  accessTokenSecret: "test-secret-with-at-least-thirty-two-bytes!",
  accessTokenTtlSeconds: 600,
  refreshTokenTtlSeconds: 604800,
  secureCookies: false,
};
const password = "Correct-Horse-Battery-Staple-2026";

const repository: TaskRepository = {
  createHumanTask: async (input) => ({
    id: "task-created",
    status: "queued",
    createdAt: new Date("2026-08-21T00:00:00.000Z"),
    ...input,
  }),
  findTask: async (taskId) =>
    taskId === "task-1"
      ? {
          id: taskId,
          officeId: "office-1",
          type: "investigation",
          title: "Review margin drop",
          description: "Investigate current margin decrease.",
          source: "human",
          priority: "high",
          status: "completed",
          requestedByUserId: "11111111-1111-4111-8111-111111111111",
          context: [{ key: "sku", value: "ABC-1" }],
          createdAt: new Date("2026-08-21T00:00:00.000Z"),
        }
      : null,
  findEvents: async () => [
    {
      sequenceNumber: 1,
      eventType: "task.queued",
      fromStatus: null,
      toStatus: "queued",
      createdAt: new Date("2026-08-21T00:00:00.000Z"),
    },
    {
      sequenceNumber: 4,
      eventType: "task.completed",
      fromStatus: "executing",
      toStatus: "completed",
      createdAt: new Date("2026-08-21T00:01:00.000Z"),
    },
  ],
};

describe("task projection routes", () => {
  let authRepository: InMemoryAuthRepository;

  beforeEach(async () => {
    authRepository = new InMemoryAuthRepository();
    await authRepository.seedUser({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Admin Master",
      email: "admin@example.com",
      role: "admin_master",
      active: true,
      passwordHash: await hashPassword(password),
      sessionVersion: 1,
    });
  });

  it("returns an authoritative task and its ordered events to an Admin Master", async () => {
    const server = buildServer({
      authService: createAuthService({
        repository: authRepository,
        tokenConfig,
      }),
      authTokenConfig: tokenConfig,
      taskService: createTaskService(repository),
    });
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@example.com", password },
    });
    const response = await server.inject({
      method: "GET",
      url: "/v1/tasks/task-1",
      headers: { authorization: `Bearer ${login.json().accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      task: { id: "task-1", status: "completed" },
      events: [
        { sequenceNumber: 1, eventType: "task.queued" },
        { sequenceNumber: 4, eventType: "task.completed" },
      ],
    });
    await server.close();
  });
});

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
const taskRepository: TaskRepository = {
  createHumanTask: async (input) => ({
    id: "task-1",
    status: "queued",
    createdAt: new Date("2026-08-20T00:00:00.000Z"),
    ...input,
  }),
};

describe("task routes", () => {
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

  it("creates a queued human task for the authenticated requester", async () => {
    const server = buildServer({
      authService: createAuthService({
        repository: authRepository,
        tokenConfig,
      }),
      authTokenConfig: tokenConfig,
      taskService: createTaskService(taskRepository),
    });
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@example.com", password },
    });
    const response = await server.inject({
      method: "POST",
      url: "/v1/tasks",
      headers: { authorization: `Bearer ${login.json().accessToken}` },
      payload: {
        officeId: "office-1",
        type: "investigation",
        title: "Review margin drop",
        description: "Investigate current margin decrease.",
        priority: "high",
        context: [{ key: "sku", value: "ABC-1" }],
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().task).toMatchObject({
      id: "task-1",
      status: "queued",
      source: "human",
      requestedByUserId: "11111111-1111-4111-8111-111111111111",
    });
    await server.close();
  });
});

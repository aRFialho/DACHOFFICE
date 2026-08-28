import type { FastifyInstance, FastifyReply } from "fastify";
import type { AuthService } from "../auth/service.js";
import { authenticateAdminMaster } from "../admin/admin-auth.js";
import type {
  OfficeRuntimeEvent,
  OfficeRuntimeService,
} from "./office-runtime-service.js";

const pollIntervalMs = 1000;

const officeIdFrom = (value: unknown): string | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const officeId = (value as Record<string, unknown>).officeId;
  return typeof officeId === "string" && officeId.trim() ? officeId : null;
};

const sequenceFrom = (value: string | undefined): number => {
  if (value === undefined || value.trim() === "") return 0;
  const sequence = Number(value);
  return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : 0;
};

const sseEvent = (event: OfficeRuntimeEvent): string =>
  `id: ${event.sequence}\nevent: office-runtime\ndata: ${JSON.stringify(event)}\n\n`;

const noStore = (reply: FastifyReply): FastifyReply =>
  reply.header("cache-control", "no-store");

export const registerOfficeRuntimeRoutes = (
  server: FastifyInstance,
  options: {
    authService: AuthService;
    officeRuntimeService: OfficeRuntimeService;
  },
): void => {
  server.get("/api/office/runtime-snapshot", async (request, reply) => {
    const actor = await authenticateAdminMaster(request, options.authService);
    const officeId = officeIdFrom(request.query);
    if (!actor) return noStore(reply).code(401).send({ error: "unauthorized" });
    if (!officeId)
      return noStore(reply).code(400).send({ error: "invalid_office_id" });
    return noStore(reply).send(
      await options.officeRuntimeService.snapshotForOffice(officeId),
    );
  });

  server.get("/api/office/events", async (request, reply) => {
    const actor = await authenticateAdminMaster(request, options.authService);
    const officeId = officeIdFrom(request.query);
    if (!actor) return noStore(reply).code(401).send({ error: "unauthorized" });
    if (!officeId)
      return noStore(reply).code(400).send({ error: "invalid_office_id" });

    const lastEventId = request.headers["last-event-id"];
    let sequence = sequenceFrom(
      Array.isArray(lastEventId) ? lastEventId[0] : lastEventId,
    );
    reply.hijack();
    reply.raw.writeHead(200, {
      "cache-control": "no-store",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
    });

    let polling = false;
    const flush = async (): Promise<void> => {
      if (polling || reply.raw.destroyed) return;
      polling = true;
      try {
        const events = await options.officeRuntimeService.eventsAfter(
          officeId,
          sequence,
        );
        for (const event of events) {
          if (event.sequence <= sequence) continue;
          sequence = event.sequence;
          reply.raw.write(sseEvent(event));
        }
      } finally {
        polling = false;
      }
    };

    await flush();
    const interval = setInterval(() => void flush(), pollIntervalMs);
    request.raw.once("close", () => clearInterval(interval));
  });
};

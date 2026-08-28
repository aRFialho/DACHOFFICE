import { describe, expect, it } from "vitest";
import {
  createOfficeService,
  type OfficeRepository,
} from "../src/modules/admin/office-service.js";

const repository: OfficeRepository = {
  createOffice: async (input) => ({ id: "office-1", ...input }),
  createDepartment: async (input) => ({ id: "department-1", ...input }),
};

describe("OfficeService", () => {
  it("creates an analytical Office with valid working hours", async () => {
    const service = createOfficeService(repository);

    await expect(
      service.createOffice({
        name: "Dachbyte",
        timezone: "America/Sao_Paulo",
        trustLevel: "analytical",
        workdayStart: "08:00",
        workdayEnd: "18:00",
        createdByUserId: "user-1",
      }),
    ).resolves.toMatchObject({
      id: "office-1",
      name: "Dachbyte",
      trustLevel: "analytical",
    });
  });

  it("rejects a workday ending before it starts", async () => {
    const service = createOfficeService(repository);

    await expect(
      service.createOffice({
        name: "Dachbyte",
        timezone: "America/Sao_Paulo",
        trustLevel: "analytical",
        workdayStart: "18:00",
        workdayEnd: "08:00",
        createdByUserId: "user-1",
      }),
    ).rejects.toThrow("workdayStart must be before workdayEnd");
  });
});

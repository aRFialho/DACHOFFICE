export type OfficeTrustLevel = "analytical" | "supervised" | "autonomous";

export interface CreateOfficeInput {
  name: string;
  timezone: string;
  trustLevel: OfficeTrustLevel;
  workdayStart: string;
  workdayEnd: string;
  createdByUserId: string;
}

export interface OfficeRecord extends CreateOfficeInput {
  id: string;
}

export interface CreateDepartmentInput {
  officeId: string;
  name: string;
  type: string;
}

export interface DepartmentRecord extends CreateDepartmentInput {
  id: string;
}

export interface OfficeRepository {
  createOffice(input: CreateOfficeInput): Promise<OfficeRecord>;
  createDepartment(input: CreateDepartmentInput): Promise<DepartmentRecord>;
}

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const requiredText = (
  value: string,
  label: string,
  maximum: number,
): string => {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum)
    throw new Error(`${label} is invalid`);
  return normalized;
};

const validateWorkday = (start: string, end: string): void => {
  if (!timePattern.test(start) || !timePattern.test(end)) {
    throw new Error("workday times must use HH:MM");
  }
  if (start >= end) throw new Error("workdayStart must be before workdayEnd");
};

export class OfficeService {
  constructor(private readonly repository: OfficeRepository) {}

  async createOffice(input: CreateOfficeInput): Promise<OfficeRecord> {
    const name = requiredText(input.name, "name", 160);
    const timezone = requiredText(input.timezone, "timezone", 80);
    validateWorkday(input.workdayStart, input.workdayEnd);
    return this.repository.createOffice({ ...input, name, timezone });
  }

  async createDepartment(
    input: CreateDepartmentInput,
  ): Promise<DepartmentRecord> {
    return this.repository.createDepartment({
      ...input,
      name: requiredText(input.name, "name", 160),
      type: requiredText(input.type, "type", 80),
    });
  }
}

export const createOfficeService = (
  repository: OfficeRepository,
): OfficeService => new OfficeService(repository);

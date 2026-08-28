export type ToolActionClass =
  | "READ"
  | "PREPARE"
  | "WRITE"
  | "DESTRUCTIVE"
  | "SENSITIVE";

export type ToolGrantLevel = "read" | "write";

export type SchemaParseResult<T> = { ok: true; value: T } | { ok: false };

export interface RuntimeSchema<T> {
  parse(value: unknown): SchemaParseResult<T>;
}

export interface ToolRateLimit {
  requestsPerMinute: number;
  costUnits: number;
}

export interface ToolDefinition<TInput, TOutput> {
  code: string;
  integration: string;
  description: string;
  inputSchema: RuntimeSchema<TInput>;
  outputSchema: RuntimeSchema<TOutput>;
  actionClass: ToolActionClass;
  idempotency: "not_required" | "required";
  retryPolicy: "safe_read" | "idempotent_write" | "manual";
  requiredGrant: ToolGrantLevel;
  rateLimit: ToolRateLimit;
}

export type RegisteredTool = ToolDefinition<unknown, unknown>;

export const defineTool = <TInput, TOutput>(
  definition: ToolDefinition<TInput, TOutput>,
): ToolDefinition<TInput, TOutput> => definition;

export type ToolInputValidation =
  | { ok: true; tool: RegisteredTool; input: unknown }
  | { ok: false; reason: "tool_unregistered" | "tool_input_invalid" };

export type ToolDenialReason =
  | "tool_unregistered"
  | "tool_input_invalid"
  | "task_authority_missing"
  | "agent_suspended"
  | "agent_not_active"
  | "tool_grant_missing"
  | "agent_version_mismatch"
  | "policy_conditions_failed"
  | "action_limits_exceeded"
  | "destructive_action_disabled";

export type ToolAuthorizationDecision =
  | { status: "allowed" }
  | { status: "approval_required"; reason: "trust_requires_approval" }
  | { status: "denied"; reason: ToolDenialReason };

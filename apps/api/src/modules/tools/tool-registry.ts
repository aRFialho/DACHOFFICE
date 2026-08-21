import type { RegisteredTool, ToolInputValidation } from "./tool-contracts.js";

export class ToolRegistry {
  private readonly byCode: ReadonlyMap<string, RegisteredTool>;

  constructor(tools: readonly RegisteredTool[]) {
    if (new Set(tools.map((tool) => tool.code)).size !== tools.length) {
      throw new Error("tool code must be unique");
    }
    this.byCode = new Map(tools.map((tool) => [tool.code, tool]));
  }

  get(code: string): RegisteredTool | undefined {
    return this.byCode.get(code);
  }

  validateInput(code: string, value: unknown): ToolInputValidation {
    const tool = this.get(code);
    if (!tool) return { ok: false, reason: "tool_unregistered" };

    const parsed = tool.inputSchema.parse(value);
    return parsed.ok
      ? { ok: true, tool, input: parsed.value }
      : { ok: false, reason: "tool_input_invalid" };
  }
}

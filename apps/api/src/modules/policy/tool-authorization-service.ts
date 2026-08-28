import {
  evaluateToolPolicy,
  type PolicyEvaluationInput,
} from "./policy-engine.js";
import type { ToolAuthorizationDecision } from "../tools/tool-contracts.js";
import { ToolRegistry } from "../tools/tool-registry.js";

export type PolicyEvaluationContext = Omit<PolicyEvaluationInput, "tool">;

export interface ToolAuthorizationRequest {
  toolCode: string;
  input: unknown;
  context: PolicyEvaluationContext;
}

export class ToolAuthorizationService {
  constructor(private readonly registry: ToolRegistry) {}

  authorize(input: ToolAuthorizationRequest): ToolAuthorizationDecision {
    const validated = this.registry.validateInput(input.toolCode, input.input);
    if (!validated.ok) {
      return { status: "denied", reason: validated.reason };
    }
    return evaluateToolPolicy({ ...input.context, tool: validated.tool });
  }
}

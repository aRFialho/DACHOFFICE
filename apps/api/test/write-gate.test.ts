import { describe, expect, it } from 'vitest';
import { decideAgentWrite } from '../src/modules/admin/write-gate.js';

describe('AgentWriteGate', () => {
  it('denies a suspended agent even when a matching grant exists', () => {
    expect(
      decideAgentWrite({
        lifecycleStatus: 'suspended',
        toolCode: 'catalog.update',
        grants: [{ toolCode: 'catalog.update', revokedAt: null }],
      }),
    ).toEqual({ allowed: false, reason: 'agent_suspended' });
  });

  it('denies a revoked or absent grant immediately', () => {
    expect(
      decideAgentWrite({
        lifecycleStatus: 'active',
        toolCode: 'catalog.update',
        grants: [{ toolCode: 'catalog.update', revokedAt: new Date() }],
      }),
    ).toEqual({ allowed: false, reason: 'tool_grant_missing' });
  });
});

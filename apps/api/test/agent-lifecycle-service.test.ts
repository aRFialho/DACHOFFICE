import { describe, expect, it } from 'vitest';
import {
  AgentLifecycleService,
  type AgentLifecycleRepository,
  type AppendAgentVersionInput,
} from '../src/modules/admin/agent-lifecycle-service.js';

const version: AppendAgentVersionInput = {
  agentId: 'agent-1',
  basePrompt: 'Use only authorized data.',
  mission: 'Review operations.',
  communicationStyle: 'concise',
  responsibilities: ['review'],
  restrictions: ['no writes'],
  modelProfile: 'gpt-5',
  trustCeiling: 'analytical',
  changeType: 'hard',
  createdByUserId: 'user-1',
};

const calls: string[] = [];
const repository: AgentLifecycleRepository = {
  appendVersion: async (input) => ({ id: 'version-2', versionNumber: 2, ...input }),
  transitionLifecycle: async (_id, _from, target) => {
    calls.push(target);
    return true;
  },
  replaceSchedule: async () => true,
  revokeGrant: async () => true,
};

describe('AgentLifecycleService', () => {
  it('appends a new immutable version instead of overwriting the active one', async () => {
    await expect(new AgentLifecycleService(repository).appendVersion(version)).resolves.toMatchObject({
      id: 'version-2', versionNumber: 2, changeType: 'hard',
    });
  });

  it('permits only documented lifecycle transitions', async () => {
    const service = new AgentLifecycleService(repository);
    await expect(service.transition('agent-1', 'draft', 'active', 'user-1')).resolves.toBeUndefined();
    await expect(service.transition('agent-1', 'draft', 'suspended', 'user-1')).rejects.toThrow('lifecycle transition is invalid');
    expect(calls).toContain('active');
  });

  it('fails when a hard revocation does not match an active grant', async () => {
    const service = new AgentLifecycleService({ ...repository, revokeGrant: async () => false });
    await expect(service.revokeGrant('agent-1', 'grant-1', 'user-1')).rejects.toThrow('active grant was not found');
  });
});

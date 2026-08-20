import { describe, expect, it } from 'vitest';
import { createAgentService, type AgentRepository } from '../src/modules/admin/agent-service.js';

const repository: AgentRepository = {
  createAgent: async (input) => ({ id: 'agent-1', lifecycleStatus: 'draft', versionNumber: 1, ...input }),
};

const input = {
  officeId: 'office-1',
  departmentId: 'department-1',
  name: 'Margin Analyst',
  title: 'Margin Analyst',
  primaryRole: 'margin_analysis',
  basePrompt: 'Analyze margin facts.',
  mission: 'Protect healthy margins.',
  communicationStyle: 'concise',
  responsibilities: ['analyze_margin'],
  restrictions: ['no_external_writes'],
  modelProfile: 'standard',
  trustCeiling: 'analytical' as const,
  createdByUserId: 'user-1',
  schedules: [{ weekday: 1, workStart: '08:00', workEnd: '18:00', timezone: 'America/Sao_Paulo', onCall: false }],
  grants: [{ toolCode: 'orders.read', accessLevel: 'read' as const }],
};

describe('AgentService', () => {
  it('creates a draft agent with immutable version one', async () => {
    await expect(createAgentService(repository).createAgent(input)).resolves.toMatchObject({
      id: 'agent-1', lifecycleStatus: 'draft', versionNumber: 1,
    });
  });

  it('rejects duplicate weekdays in an agent schedule', async () => {
    await expect(createAgentService(repository).createAgent({ ...input, schedules: [...input.schedules, input.schedules[0]!] }))
      .rejects.toThrow('schedule weekdays must be unique');
  });
});

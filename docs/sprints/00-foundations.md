# Sprint 0 — Foundations

## Goal
Create the minimum reliable engineering foundation for DACHBYTE OFFICE without implementing marketplace, finance, agent intelligence, Neon production infrastructure, Render deployment, or the isometric renderer.

## Approved stack
- Node.js 24 LTS
- TypeScript strict mode
- pnpm workspace
- React 19 + Vite 8 for `apps/web`
- Fastify 5 for `apps/api`
- Node/TypeScript background runtime for `apps/worker`
- Vitest for unit/integration tests
- GitHub Actions for CI
- Neon/PostgreSQL integration prepared but not connected in this sprint
- Render topology documented but not provisioned in this sprint

## Repository shape
```text
apps/
  web/
  api/
  worker/
packages/
  domain/
  db/
  events/
  queue/
  agent-runtime/
  model-gateway/
  policy-engine/
  memory/
  tools/
  observability/
docs/
```

Only packages required to prove the Sprint 0 runtime are implemented now. Empty future-domain folders are not created merely for decoration.

## Required vertical proof

### API
`GET /health` returns:
```json
{
  "service": "dachbyte-office-api",
  "status": "ok"
}
```

### Worker
A deterministic in-memory Sprint 0 queue contract proves that a job can be accepted, consumed and completed without coupling to the future production queue provider.

### Web
A minimal React shell builds successfully and clearly identifies DACHBYTE OFFICE as a foundation placeholder, not the final Office UI.

## CI quality gate
Every PR must run:
1. dependency install;
2. typecheck;
3. tests;
4. build.

The workflow bootstrap lives on the default branch so pull-request runs are evaluated from a known CI baseline.

## Non-goals
- no production Neon project changes;
- no Render service creation;
- no PixiJS/Tiled renderer yet;
- no authentication yet;
- no real marketplace integrations;
- no LLM/model provider;
- no agent autonomy;
- no external write actions.

## Acceptance
Sprint 0 is accepted only when:
- root workspace installs cleanly;
- API health test passes;
- worker queue proof test passes;
- web app builds;
- strict typecheck passes;
- CI is green;
- branch diff contains no secrets;
- documentation explains how to run the workspace locally.

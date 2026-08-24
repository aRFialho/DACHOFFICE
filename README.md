# DACHBYTE OFFICE

DACHBYTE OFFICE é um escritório virtual de agentes de IA para operações de
e-commerce, marketplaces, ERP, Hub, finanças, margem, precificação, Ads e
inteligência competitiva.

Este repositório é privado e inicia sua implementação a partir do handoff
arquitetural aprovado em 2026-08-19.

## Status

Sprints 0–3 delivered: foundations, Admin/Agent Forge, asynchronous task
engine, and deterministic Tool Registry + Policy Engine.

Sprint 4 Tray Canonical Catalog code is complete with local fixture coverage.
Connected Tray validation is pending until the controller runs it with
provisioned non-production credentials. Store General reads canonical
PostgreSQL catalog data only; a Tray sync is queued for the worker and no Tray
provider-write capability is available. See
[docs/sprints/04-tray-canonical-catalog.md](docs/sprints/04-tray-canonical-catalog.md)
for the operating boundary, mapping outcomes, and safe recovery codes.

## Regra central

Todo estado operacional exibido no Office deve corresponder a um estado real
do backend, tarefa, reunião, aprovação, evento ou atividade de agente.

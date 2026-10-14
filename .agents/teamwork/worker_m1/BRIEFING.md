# BRIEFING — 2026-10-14T10:25:00Z

## Mission
Implementar correções e melhorias no motor de emissão de NFS-e (Dual Engine: Municipal GISS e Nacional ADN), unificar dispatcher em `POST /api/nfse/emit`, corrigir bug de variáveis indefinidas, repassar e persistir endereços do tomador, auto-emissão em check-out priorizando empresa vinculada no CRM, integrar Chat Fiscal ao cadastro de PJ em `db.companies` com validação Módulo 11 e manter paridade twin-server em `scripts/`.

## 🔒 My Identity
- Archetype: teamwork_preview_worker
- Roles: implementer, qa, specialist
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1
- Original parent: 3d03f136-f013-4588-99e3-f22e17cc1ae4
- Milestone: M1 (NFS-e Backend Engine Fixes & Unified Emission)

## 🔒 Key Constraints
- Arquivos sob responsabilidade exclusiva:
  - `artifacts/api-server/demo-server.mjs`
  - `artifacts/api-server/giss-soap.mjs`
  - `artifacts/api-server/national-nfse.mjs`
  - `artifacts/api-server/chat-service.mjs`
  - Cópia espelho idêntica em `scripts/` (`scripts/demo-server.mjs`, `scripts/giss-soap.mjs`, `scripts/national-nfse.mjs`, `scripts/chat-service.mjs`, `scripts/lookup.mjs`).
- NUNCA executar testes globais, varreduras ou em lote (`tests/*.test.mjs`).
- Manter paridade estrita 100% SHA-256 entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`.
- DO NOT CHEAT: All implementations must be genuine, maintain real state, and produce real behavior.

## Current Parent
- Conversation ID: 3d03f136-f013-4588-99e3-f22e17cc1ae4
- Updated: 2026-10-14T10:25:00Z

## Task Summary
- **What to build**:
  - F1: Corrigir ReferenceError de `numNfseReal` / `codVerifReal` em `POST /api/nfse/emit`.
  - F2: Suporte completo ao motor Dual (`giss_prefeitura` e `padrao_nacional`) com fallback resiliente para testes/indisponibilidade.
  - F3: Repassar e persistir dados completos de endereço do Tomador em `POST /api/nfse/emit` e nos motores.
  - F4: Auto-emissão no checkout priorizando empresa vinculada (`companyId`) com Tomador PJ e discriminação detalhada com template.
  - F5: Chat Fiscal cadastrando PJ em `db.companies`, persistindo endereços e validando dígitos verificadores por Módulo 11.
  - Paridade Twin-Server em `scripts/`.
- **Success criteria**:
  - `POST /api/nfse/emit` emite sem ReferenceError para ambos os motores, com dados completos de endereço e retorno consistente.
  - Check-out faturando para PJ vinculada no CRM quando houver `companyId`.
  - Chat Fiscal cadastrando PJ em `db.companies` com validação Módulo 11.
  - SHA-256 idêntico entre arquivos gêmeos.
- **Interface contracts**: `orchestrator_9/PROJECT.md`
- **Code layout**: `artifacts/api-server/` e espelho em `scripts/`

## Key Decisions Made
- Unificado o dispatch de emissão em `POST /api/nfse/emit` chaveado por `sistemaEmissor` (`padrao_nacional` vs `giss_prefeitura`), com extração limpa de `numeroNfse` e `codigoVerificacao`.
- Resolvido bug crítico em `getFiscalData()` (linha 27208) onde condição `db.invoices[0].prestadorCnpj !== "47.964.813/0001-65"` sobrescrevia notas reais emitidas a cada chamada da rota fiscal.
- Rota de checkout duplicada para atender tanto `/api/reception/checkout/:reservationId` quanto `/api/pms/reservations/:id/checkout` com priorização automática de `companyId` para Tomador PJ e discriminação detalhada via `formatarDescricaoComTemplate`.
- Chat Fiscal aprimorado para registrar diretamente em `db.companies` quando CNPJ de 14 dígitos for detectado e validado via Módulo 11, suportando ainda resolução autônoma de CEP via `lookupCep`.
- Paridade estrita 100% SHA-256 mantida entre os 5 arquivos de `artifacts/api-server/` e `scripts/`.

## Change Tracker
- **Files modified**:
  - `artifacts/api-server/giss-soap.mjs` & `scripts/giss-soap.mjs`: Added crypto import, address fields in RPS XML, return mapping `numeroNfse: numeroNota`, and test mode fallback.
  - `artifacts/api-server/national-nfse.mjs` & `scripts/national-nfse.mjs`: Added address and ibge code handling in DPS payload, return mapping `numeroNota: numNfse`, and test mode fallback.
  - `artifacts/api-server/chat-service.mjs` & `scripts/chat-service.mjs`: Added Módulo 11 check on CPF/CNPJ candidates, standalone CEP regex extraction and lookupCep enrichment, and user messaging for invalid docs.
  - `artifacts/api-server/demo-server.mjs` & `scripts/demo-server.mjs`: Fixed ReferenceError in `POST /api/nfse/emit`, unified dual-engine dispatch, persisted full address fields in invoices, fixed `getFiscalData` re-seed overwrite, extracted unified checkout handler with company PJ prioritization, and integrated Chat Fiscal to `db.companies`.
  - `scripts/lookup.mjs`: Twin copy synchronized.
- **Build status**: PASS (node --check passed on all 10 files with 0 syntax errors)
- **Pending issues**: none

## Quality Status
- **Build/test result**: PASS. All twin files verified byte-by-byte (SHA-256 match 100%). Dynamic API smoke test confirmed 201 responses without ReferenceError, complete address persistence, PJ company prioritization in checkout, and Chat Fiscal company creation.
- **Lint status**: PASS (0 syntax errors).
- **Tests added/modified**: Targeted dynamic API smoke tests run via isolated ephemeral process. No global tests executed per AGENTS.md rules.

## Loaded Skills
- None loaded.

## Artifact Index
- `.agents/teamwork/worker_m1/DISPATCH.md` — Assignment instructions
- `.agents/teamwork/worker_m1/progress.md` — Liveness & heartbeat
- `.agents/teamwork/worker_m1/BRIEFING.md` — Situational awareness
- `.agents/teamwork/worker_m1/handoff.md` — 5-component handoff report

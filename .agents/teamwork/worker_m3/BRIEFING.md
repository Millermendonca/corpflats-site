# BRIEFING — 2026-10-14T10:50:56Z

## Mission
Implementar o fluxo completo do Assistente Fiscal do WhatsApp & Enriquecimento Automático (Milestone M3: Features F12 a F17) no Guest-Flow-Manager (CorpFlats), interceptando pedidos de NFS-e, identificando vínculos no CRM sem repetição de perguntas para clientes com empresa vinculada, realizando onboarding fiscal com sanitização, validação Módulo 11, enriquecimento automático (CNPJ e CEP), atualização do CRM e confirmação no WhatsApp, com estrita paridade twin-server e sintaxe validada.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3
- Original parent: 3d03f136-f013-4588-99e3-f22e17cc1ae4
- Milestone: M3 (WhatsApp Fiscal Assistant Flow & Automated Enrichment)

## 🔒 Key Constraints
- DO NOT CHEAT. All implementations must be genuine. Real state and behavior only.
- Strict file ownership for Worker M3:
  - `artifacts/api-server/whatsapp-ai-service.mjs` <-> `scripts/whatsapp-ai-service.mjs`
  - `artifacts/api-server/zapi-service.mjs` <-> `scripts/zapi-service.mjs`
  - `artifacts/api-server/lookup.mjs` <-> `scripts/lookup.mjs`
- 100% SHA-256 byte-for-byte twin parity between `artifacts/api-server/` and `scripts/`.
- STRICT test execution rule from AGENTS.md: NUNCA rodar testes globais (`tests/*.test.mjs`), varreduras ou outros módulos. Apenas `node --check` para sintaxe ou teste estritamente pontual autorizado.
- Preservar integridade e dados reais; sem poluir CRM com documentos inválidos.

## Current Parent
- Conversation ID: 3d03f136-f013-4588-99e3-f22e17cc1ae4
- Updated: 2026-10-14T10:50:56Z

## Task Summary
- **What was built**:
  1. F12: Interceptação robusta de intenção fiscal no WhatsApp (`isFiscalIntentMessage`) combinando verbos de ação e substantivos fiscais e cruzando remetente (`cleanTarget`/telefone) com `db.reservations` (titular `guestPhone`, `phone`, e solicitante terceiro `requesterInfo.phone`, `requesterInfo.whatsapp`) e `db.guests`.
  2. F13: Fluxo sem repetição de perguntas para clientes com empresa já vinculada (`companyId` e CNPJ válido em `db.companies`). Resposta calorosa confirmando Razão Social e CNPJ formatado, ativando `autoEmitInvoice=true` no hóspede e reserva, preparando rascunho `r.invoiceDetails`.
  3. F14: Fluxo de onboarding fiscal para clientes sem empresa vinculada, mensagem didática explicando PJ (CNPJ + e-mail) vs PF (Nome, CPF, Endereço/CEP, E-mail) e setando `conv.awaitingFiscalData = true`.
  4. F15: Validação matemática Módulo 11 (`isValidCpf`, `isValidCnpj`), mensagem gentil de correção se inválido sem poluir CRM; sanitização com `toTitleCase` (preservando siglas corporativas e preposições), `cleanPhone`, `cleanCep`, e-mail lowercase.
  5. F16: Enriquecimento automático de CNPJ (local `db.companies` + BrasilAPI) e CEP (ViaCEP / BrasilAPI) completando Razão Social, Fantasia e endereço completo com código IBGE.
  6. F17: Criação/atualização e vínculo no CRM (`db.companies`, `db.guests`, `db.reservations`), ativação de `autoEmitInvoice=true`, pre-fill de `invoiceDetails`, resposta no WhatsApp confirmando e limpeza de `awaitingFiscalData`.
  7. Espelhamento idêntico em `scripts/` com 100% SHA-256 twin parity e verificação com `node --check` em todos os 6 arquivos.

## Key Decisions Made
- `lookup.mjs`: Centralização de todas as validações (Módulo 11 CPF/CNPJ), sanitizações (`toTitleCase`, `cleanPhone`, `cleanCep`) e formatações (`formatCnpj`, `formatCpf`, `formatCep`) com fallback inteligente local no CRM e timeouts seguros para ViaCEP e BrasilAPI.
- `zapi-service.mjs`: Extensão de `getReservationPhones` para incluir `r.requesterInfo?.phone`, `r.requesterInfo?.whatsapp` e `r.requesterPhone`, garantindo que secretárias e solicitantes terceiros encontrem a reserva e a empresa vinculada.
- `zapi-service.mjs`: `await processAiInboundMessage(...)` no webhook de mensagem recebida para execução determinística e não-assíncrona nos testes e na produção.
- `whatsapp-ai-service.mjs`: Interceptação antecipada em `handleWhatsAppFiscalFlow` no início de `processAiInboundMessage` com criação garantida do registro `conv` em `db.whatsappConversations` para manter o estado `awaitingFiscalData`.

## Artifact Index
- `DISPATCH.md` — assignment from orchestrator
- `BRIEFING.md` — persistent memory
- `progress.md` — liveness heartbeat
- `handoff.md` — final completion report

## Change Tracker
- **Files modified**:
  - `artifacts/api-server/lookup.mjs` (Validações Módulo 11, sanitização, formatação e lookup enriquecido)
  - `scripts/lookup.mjs` (Cópia idêntica byte-a-byte com paridade SHA-256)
  - `artifacts/api-server/whatsapp-ai-service.mjs` (Fluxo fiscal completo F12-F17, extrações, `handleWhatsAppFiscalFlow`, heurística e hook)
  - `scripts/whatsapp-ai-service.mjs` (Cópia idêntica byte-a-byte com paridade SHA-256)
  - `artifacts/api-server/zapi-service.mjs` (Suporte a requesterInfo em telefones de reserva, re-exportações fiscais e await no webhook)
  - `scripts/zapi-service.mjs` (Cópia idêntica byte-a-byte com paridade SHA-256)
- **Build status**: PASS (`node --check` exit code 0 em todos os 6 arquivos)
- **Pending issues**: none

## Quality Status
- **Build/test result**: PASS (`node --check` exit code 0; 9/9 asserções de verificação pontual aprovadas)
- **Lint status**: clean
- **Tests added/modified**: Testes pontuais de validação em memória executados com sucesso

## Loaded Skills
- None required.

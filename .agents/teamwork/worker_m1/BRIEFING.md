# BRIEFING — 2026-10-22T10:35:00Z

## Mission
Implementação do Marco M1: Backend Core, sincronização twin-server, módulo modular `hr/`, schema CLT, isolamento rigoroso de prestadoras (Cris e Grazi) e guarda contra poda no banco de dados.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1
- Original parent: 58ecb31f-60d2-4e1e-9aac-82400a58c263
- Milestone: M1 - Backend Core & Isolamento de Prestadoras

## 🔒 Key Constraints
- Sincronização estrita SHA-256 entre `artifacts/api-server/` e `scripts/`
- Isolamento absoluto de Cris e Grazi: contractType = 'prestador', bloqueadas em todas as APIs CLT (/api/hr/employees)
- Guarda contra poda de 11 coleções de RH no pruneDatabase (5 anos / 1825 dias para transações)
- NUNCA executar testes globais (`tests/*.test.mjs`), apenas validação pontual estrita
- Integridade total: sem hardcoding em testes, sem facades falsas

## Current Parent
- Conversation ID: 58ecb31f-60d2-4e1e-9aac-82400a58c263
- Updated: 2026-10-22T10:35:00Z

## Task Summary
- **What to build**:
  - Restabelecimento de 100% de paridade SHA-256 entre `artifacts/api-server/` e `scripts/`
  - Estrutura modular `hr/` (`employees.mjs`, `router.mjs`, `index.mjs`) em `artifacts/api-server/hr/` e `scripts/hr/`
  - Integração em `demo-server.mjs`: `ensureHrCollections`, montagem de `/api/hr`, proteção em `pruneDatabase` contra `LIMITS` e guarda legal de 1825 dias (5 anos)
  - Blindagem estrita de Cris e Grazi com `contractType = "prestador"` em `defaultUsers` e `sanitizeMaidUsers()`
  - Criação do verificador `scripts/check-twin-parity.mjs`
  - Criação e aprovação do teste pontual dedicado `tests/hr-m1-backend-core.test.mjs`
- **Success criteria**:
  - `check-twin-parity.mjs` retorna 29/29 PASS (100%)
  - Testes pontuais `tests/hr-m1-backend-core.test.mjs` 6/6 subtestes aprovados
  - Cris e Grazi 100% isoladas de rotinas CLT

## Change Tracker
- **Files modified**:
  - `artifacts/api-server/demo-server.mjs` & `scripts/demo-server.mjs`: import de hr, chamada ensureHrCollections, montagem de /api/hr, proteção de poda de 5 anos, contractType prestador
  - `scripts/mail-service.mjs` & `scripts/zapi-service.mjs`: sincronizados da base de artifacts
  - `artifacts/api-server/hr/employees.mjs` & `scripts/hr/employees.mjs`: schemas CLT, guardas isPrestadora e isCltEmployee, CRUD
  - `artifacts/api-server/hr/router.mjs` & `scripts/hr/router.mjs`: rotas Express para /api/hr
  - `artifacts/api-server/hr/index.mjs` & `scripts/hr/index.mjs`: exportações unificadas e ensureHrCollections
  - `scripts/check-twin-parity.mjs`: ferramenta canônica de auditoria de paridade
  - `tests/hr-m1-backend-core.test.mjs`: suíte de teste pontual dedicada do Marco M1
- **Build status**: PASS (node --test tests/hr-m1-backend-core.test.mjs)
- **Pending issues**: Nenhuma pendência em M1

## Quality Status
- **Build/test result**: 6/6 subtests PASS (6.4s)
- **Parity status**: 29/29 files SHA-256 identical (100% PASS)
- **Tests added/modified**: `tests/hr-m1-backend-core.test.mjs`

## Loaded Skills
- N/A

## Key Decisions Made
- Sincronização inicial efetuada a partir de `artifacts/api-server/` para `scripts/` para absorver os commits `a7d4f78` e `4c5b997`.
- Isolamento de Cris e Grazi garantido em 5 camadas: em `defaultUsers`, em `sanitizeMaidUsers`, nas guardas `isPrestadora`/`isCltEmployee`, na rejeição de cadastro por nome/CPF/ID e nas rotas HTTP com retorno 404/403.
- Proteção legal de 5 anos (1825 dias) implementada formalmente em `pruneDatabase()` para cumprir Art. 11 da CLT e Portaria MTP 671/2021.

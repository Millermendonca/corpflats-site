# BRIEFING — 2026-10-14T11:24:00Z

## Mission
Criar e validar a suíte de testes pontual dedicada `tests/nfse-crm-whatsapp-flow.test.mjs` cobrindo 100% dos requisitos R1-R4 (M1, M2, M3).

## 🔒 My Identity
- Archetype: specialist, qa
- Roles: specialist, qa, test_writer
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\test_writer_m4
- Original parent: 3d03f136-f013-4588-99e3-f22e17cc1ae4
- Milestone: M4 (Dedicated Test Suite)

## 🔒 Key Constraints
- Modificar apenas arquivos de teste: `tests/nfse-crm-whatsapp-flow.test.mjs`. Nunca modificar código de produção (escalar eventuais bugs ao orquestrador).
- Regra crítica AGENTS.md: NUNCA rodar testes globais (`tests/*.test.mjs`) ou outros módulos. Executar EXCLUSIVAMENTE o teste pontual `node --test tests/nfse-crm-whatsapp-flow.test.mjs`.
- Isolamento total: process.env.NODE_ENV = "test", banco isolado em `os.tmpdir()` (`DATA_FILE` e `DATABASE_FILE`), nunca alterar `data/database.json`.
- Integridade total: sem mocks fajutos, sem silenciamento artificial de notificações em código, sem facade tests.

## Current Parent
- Conversation ID: 3d03f136-f013-4588-99e3-f22e17cc1ae4
- Updated: 2026-10-14T11:24:00Z

## Task Summary
- **What to build**: Suíte de teste completa `tests/nfse-crm-whatsapp-flow.test.mjs` cobrindo T1 (NFS-e municipal e nacional), T2 (Auto-emissão no checkout corporativo), T3 (CRM 360° empresas e hóspedes), T4 (WhatsApp empresa vinculada sem perguntas repetidas), T5 (WhatsApp onboarding não vinculados), T6 (Validação Módulo 11 CPF/CNPJ amigável), T7 (Sanitização/enriquecimento/cadastro via WhatsApp), T8 (Paridade SHA-256 twin-server), T9 (Frontend build verification), T10 (Integridade de banco).
- **Success criteria**: Todos os cenários T1 a T10 passam em `node --test tests/nfse-crm-whatsapp-flow.test.mjs` sem tocar em `data/database.json`.
- **Interface contracts**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_9\PROJECT.md`
- **Code layout**: `tests/nfse-crm-whatsapp-flow.test.mjs`

## Key Decisions Made
- Implementação de isolamento completo com cópia de banco em `os.tmpdir()`, remoção de `DATABASE_URL` e verificação estrita de hash SHA-256 e mtime de `data/database.json` no teardown.
- Estruturação em 11 suites com 24 testes pontuais, cobrindo T1 a T10.

## Artifact Index
- `tests/nfse-crm-whatsapp-flow.test.mjs` — Test suite principal M4
- `.agents/teamwork/test_writer_m4/progress.md` — Log de progresso e heartbeat
- `.agents/teamwork/test_writer_m4/handoff.md` — Relatório de handoff 5-componentes

## Loaded Skills
- Nenhuma skill externa necessária.

## Quality Status
- **Build/test result**: 24/24 testes passaram (100% de aprovação) em 2.73s.
- **Lint status**: Zero erros de sintaxe ou execução.
- **Tests added/modified**: `tests/nfse-crm-whatsapp-flow.test.mjs` (24 testes).

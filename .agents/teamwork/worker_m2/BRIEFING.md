# BRIEFING — 2026-10-29T16:55:00Z

## Mission
Implement the fix for CRM-to-Google Contacts sync logic, eliminating 8-digit suffix collisions, companion phone contamination, and false name overwrites, while preserving twin-file parity and passing dedicated isolated unit tests.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2
- Original parent: 77bac84a-2c7b-483b-8533-2e30a6efd40e
- Milestone: milestone_2

## 🔒 Key Constraints
- DO NOT CHEAT: genuine implementations only, no hardcoded test outputs or facade implementations.
- AGENTS.md: NUNCA executar testes globais, varreduras ou em lote (`tests/*.test.mjs`).
- AGENTS.md: Apenas o teste estritamente pontual do que foi alterado (`node --test tests/google-contacts-sync-fix.test.mjs`).
- AGENTS.md: NUNCA disparar mensagens reais de WhatsApp para hóspedes.
- AGENTS.md: Paridade byte-a-byte idêntica (SHA-256) entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`. Use `node scripts/check-twin-parity.mjs` para verificar.
- Owns exclusively: `artifacts/api-server/demo-server.mjs`, `scripts/demo-server.mjs`, `tests/google-contacts-sync-fix.test.mjs`.

## Current Parent
- Conversation ID: 77bac84a-2c7b-483b-8533-2e30a6efd40e
- Updated: not yet

## Task Summary
- **What to build**: Fix 8-digit phone suffix collision in `expandBrazilianPhoneVariants`, `syncAllGuestsToGoogleContacts`, `syncSingleGuestToGoogleContacts`; stop companion/reservation cross-contamination in `buildGuestCallerIdContactData`; enforce strict name & identity verification before Google Contact updates; prevent false name overwrites in `mergeGuestRecords`/`areGuestNamesCompatible`.
- **Success criteria**: Byte-for-byte parity verified via `node scripts/check-twin-parity.mjs`; isolated unit tests in `tests/google-contacts-sync-fix.test.mjs` pass cleanly.
- **Interface contracts**: REST API and internal helper signatures in `demo-server.mjs`.
- **Code layout**: Twin files `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`.

## Key Decisions Made
- [TBD]

## Artifact Index
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2\DISPATCH.md` — Assigned instructions
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2\progress.md` — Liveness & status log
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2\handoff.md` — 5-component completion handoff

## Change Tracker
- **Files modified**: [TBD]
- **Build status**: [TBD]
- **Pending issues**: None

## Quality Status
- **Build/test result**: [TBD]
- **Lint status**: Clean
- **Tests added/modified**: `tests/google-contacts-sync-fix.test.mjs`

## Loaded Skills
None requested.

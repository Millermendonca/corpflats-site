# Dispatch — Milestone 4 Final Integration Worker

## Objective
Execute final integration, end-to-end verification, and git synchronization:
1. Run all test suites:
   - `node --test tests/whatsapp-ai-agent.test.mjs` (must pass 24/24).
   - Run adversarial challenger suites:
     - `node --test tests/challenger-m1-r3-rule-engine.test.mjs`
     - `node --test tests/challenger2-m1-r3-lifecycle-persistence.test.mjs`
     - `node --test tests/challenger-m2-r2-heuristic-verification.test.mjs`
     - `node --test tests/m2-challenger-2-stress.test.mjs`
     - `node --test tests/challenger-m3-c2-ui-interaction.test.mjs`
2. Verify 100% SHA-256 byte parity between `artifacts/api-server/` and `scripts/` across all 7 mirrored service files (`demo-server.mjs`, `whatsapp-ai-service.mjs`, `zapi-service.mjs`, `mail-service.mjs`, `storage-service.mjs`, `fnrh-pdf-service.mjs`, `fnrh-serpro-service.mjs`).
3. Verify production build in `artifacts/limpeza`:
   - Run `npm run build` in `artifacts/limpeza` to confirm exit code 0 and fresh assets in `dist/public/`.
4. Check Git status:
   - Ensure working directory is clean. If any uncommitted changes remain, commit and execute mandatory `git push origin main` per `AGENTS.md`.
5. Write `handoff.md` in your working directory and notify orchestrator via `send_message`.


## 2026-10-11T04:53:24Z
You are the Final Integration Worker for Milestone 4 for Guest-Flow-Manager.
Your working directory is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m4_worker
The project root is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager

MANDATORY INSTRUCTION: You MUST read the Original User Request file before starting:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md

Also read your task instructions in:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m4_worker\DISPATCH.md
and the project roadmap:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Tasks:
1. Run all test suites:
   - `node --test tests/whatsapp-ai-agent.test.mjs` (must pass 24/24).
   - Run adversarial suites (`challenger-m1-r3-rule-engine.test.mjs`, `challenger2-m1-r3-lifecycle-persistence.test.mjs`, `challenger-m2-r2-heuristic-verification.test.mjs`, `m2-challenger-2-stress.test.mjs`, `challenger-m3-c2-ui-interaction.test.mjs`).
2. Verify 100% SHA-256 byte parity between artifacts/api-server/ and scripts/ across all 7 mirrored service files.
3. Run `npm run build` in artifacts/limpeza and confirm clean compilation to dist/public with exit code 0.
4. Verify git status is completely clean and pushed to `origin main` per AGENTS.md.
5. Write your complete handoff report to handoff.md in your working directory and notify me via send_message.

# DISPATCH: Milestone 4 Forensic Auditor (Independent Integrity Auditor)

## Mission
You are the Forensic Integrity Auditor for Milestone 4 (Final Milestone: E2E Integration, Hardening & Git Push) of Guest-Flow-Manager.
Your audit verdict is a BINARY VETO (CLEAN or INTEGRITY VIOLATION).

## Project Paths
- Project Root: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`
- Original Request: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`
- Master Roadmap: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md`
- Worker Handoff: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m4_worker\handoff.md`

## Forensic Audit Protocol
1. **Hardcoded Results / Cheating Check**:
   - Inspect all modified files (`demo-server.mjs`, `zapi-service.mjs`, `whatsapp-ai-service.mjs`, `App.tsx`, `use-faq.ts`, `faq-knowledge-base.tsx`).
   - Verify NO hardcoded test results, fake branch short-circuits, or test-specific hacks exist.
2. **Dummy/Facade Implementation Check**:
   - Confirm genuine business logic: real phone normalization, real rule evaluation, real atomic file operations, real React hooks, real modal forms, and real Gemini prompt construction.
3. **Cryptographic SHA-256 Parity**:
   - Compute SHA-256 for all 7 mirrored file pairs between `artifacts/api-server/` and `scripts/`.
   - Confirm 100% byte-for-byte identity.
4. **Independent Test & Build Execution**:
   - Run `node --test tests/whatsapp-ai-agent.test.mjs` independently. Must pass 24/24 in < 5s with exit code 0.
   - Run `npm run build` in `artifacts/limpeza`. Must pass cleanly with exit code 0.
5. **Git Clean Status & Remote Sync**:
   - Verify `git status` shows clean working tree with 0 untracked/uncommitted application files.
   - Verify `git log` shows recent commits are pushed to `origin main` per `AGENTS.md`.
6. **Definitive Verdict**:
   - Deliver `CLEAN` or `INTEGRITY VIOLATION` in `audit.md` and `handoff.md`.

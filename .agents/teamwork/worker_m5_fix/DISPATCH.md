## 2026-10-14T04:59:59Z
You are the Milestone 5 Remediation Worker for the Guest-Flow-Manager WebBookingPro Integration.
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m5_fix`

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Read these authoritative documents before starting:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first!)
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\PROJECT.md`
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`
4. Findings from Challenger 1 in:
   `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_m5_wbp_1\handoff.md`
5. Findings from Reviewer 2 in:
   `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_m5_wbp_2\handoff.md`

Your Mission:
Remediate the 2 specific defects identified during Gate 5:

1. Defect 1: Time-Travel Offset in Token Expiration (Challenger 1 Finding):
   - In `artifacts/api-server/wbp/vault.mjs` and mirror `scripts/wbp/vault.mjs`:
     `CreditCardVault` was using raw unadjusted `Date.now()`, ignoring `global.__simulatedTimeOffsetMs`. When tests advance time past 5 minutes (e.g. 301 seconds) using the time-travel simulation framework, the expired token was still accepted!
   - Fix: Define a helper:
     ```javascript
     function getEffectiveNow() {
       return Date.now() + Number(global.__simulatedTimeOffsetMs || 0);
     }
     ```
     Use `getEffectiveNow()` in `createReauthToken` (`expiresAt = getEffectiveNow() + expiresInSeconds * 1000`), in `consumeReauthToken` (`if (getEffectiveNow() > entry.expiresAt)`), in `purgeExpiredCards`, and wherever timestamps are compared in `vault.mjs`.
   - Maintain 100% SHA-256 byte-for-byte twin parity between `artifacts/api-server/wbp/vault.mjs` and `scripts/wbp/vault.mjs`.

2. Defect 2: Elimination of Facade Authentication Fallback in UI (Reviewer 2 Finding):
   - In `artifacts/limpeza/src/components/wbp/SecureCardModal.tsx`:
     Lines ~98–106 and ~126–152 contained a fallback facade where a failed password attempt (`!reauthRes.ok`) caught errors and generated a fake token (`"token-" + Math.random()`) and displayed fake card details. This violates strict integrity rules.
   - Fix: Completely REMOVE all fake fallback tokens and hardcoded dummy cards!
     If `!reauthRes.ok`:
       - Read error message from backend response (`const err = await reauthRes.json().catch(() => ({}));`).
       - Set `error = err.error || "Senha de administrador incorreta ou acesso não autorizado."`.
       - Strictly remain on step `"auth"`, halt execution, and do NOT transition to `"view"` or issue any token!
     If `!viewRes.ok`:
       - Set error message ("Token de visualização inválido ou expirado.").
       - Return or close modal, do NOT show fake card details!
   - Run `npm run build` in `artifacts/limpeza` to ensure clean build and update `artifacts/limpeza/dist/`.

3. Targeted Test Execution:
   - Run exclusively:
     - `node --test tests/wbp-integration/challenger-m5-vault-security.test.mjs` (must pass 100%, including Challenge 2 token expiration past 301s!).
     - `node --test tests/wbp-integration/challenger-m5-provisional-safety.test.mjs` (must pass 100%).
     - `node --test tests/wbp-integration/m5-vault-ui.test.mjs` (must pass 100%).
     - `node --test tests/wbp-integration/m4-reservations-inbox.test.mjs` (must pass 100%).
   - Verify `data/database.json` baseline SHA-256 (`e37d74b7...`) has 0 changes.
   - Verify 100% byte-for-byte SHA-256 twin parity across all 13 twin pairs between `artifacts/api-server/` and `scripts/`.

4. Git Commit & Push:
   - Verify active branch is `feature/wbp-integration`.
   - Commit all changes (including `artifacts/limpeza/dist/`) and `git push origin feature/wbp-integration`.
   - Write handoff report in `handoff.md` in your working directory and notify orchestrator.

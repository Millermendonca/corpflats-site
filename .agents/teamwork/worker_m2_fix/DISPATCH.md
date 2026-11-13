## 2026-10-13T23:38:45Z
You are the Milestone 2 Remediation Worker for the Guest-Flow-Manager WebBookingPro Integration.
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2_fix`

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Read these authoritative documents before starting:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first)
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\PROJECT.md`
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`
4. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_m2_2\handoff.md` (exact bug report and remediation specifications)

Your Mission:
Remediate the 2 bugs found by Challenger 2 in `applyPricingLocks`:
1. Bug 1 (Variation Lock Rounding Truncation):
   In `artifacts/api-server/wbp/pricing.mjs` (and mirror `scripts/wbp/pricing.mjs`), line 358:
   Currently `const deltaPct = round2((rate - prevRate) / prevRate);` rounds 30.1% (0.301) to 0.30, allowing swings between ±30.01% and ±30.49% to bypass `VARIATION_LOCK`.
   Fix: compute unrounded ratio `const deltaPct = (rate - prevRate) / prevRate;` so that `Math.abs(deltaPct) > maxVariation` triggers correctly for both upward (+30.1%) and downward (-30.1%) fluctuations. (Keep `deltaPercentStr = (deltaPct * 100).toFixed(1)` for the human message).
2. Bug 2 (Floor Lock NaN Bypass):
   In `artifacts/api-server/wbp/pricing.mjs` (and mirror `scripts/wbp/pricing.mjs`), around line 339:
   Currently non-numeric string inputs evaluate to NaN, bypassing `rate < floor` and approving corrupt rates.
   Fix: add explicit validation:
   ```javascript
   if (isNaN(rate) || rate <= 0) {
     return {
       approved: false,
       candidateRate: isNaN(rate) ? null : rate,
       finalRate: null,
       lockedReason: "FLOOR_LOCK",
       floor,
       deltaPct: 0,
       message: "Tarifa proposta inválida ou não numérica."
     };
   }
   ```
3. Twin Parity:
   Ensure 100% byte-for-byte SHA-256 parity between `artifacts/api-server/wbp/pricing.mjs` and `scripts/wbp/pricing.mjs`.
4. Run Targeted Tests (exclusively!):
   - `node --test tests/wbp-integration/challenger-m2-pricing.test.mjs` (all 21 tests must pass, 0 fail).
   - `node --test tests/wbp-integration/m2-availability-pricing.test.mjs` (all 25 tests must pass, 0 fail).
5. Git Commit & Push:
   - Ensure branch is `feature/wbp-integration`.
   - Commit and `git push` to `origin feature/wbp-integration`.
6. Write handoff to `handoff.md` in your working directory and notify orchestrator.

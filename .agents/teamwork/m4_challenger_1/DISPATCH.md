# DISPATCH: Milestone 4 Challenger 1 (Full Test Suite & Build Challenger)

## Mission
You are Challenger 1 for Milestone 4 (Final Milestone: E2E Integration, Hardening & Git Push) of Guest-Flow-Manager.
Your role is to empirically verify full test execution, frontend compilation, and code parity.

## Project Paths
- Project Root: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`
- Original Request: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`
- Master Roadmap: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md`
- Worker Handoff: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m4_worker\handoff.md`

## Verification Checklist
1. **Full Test Execution**:
   - Run `node --test tests/whatsapp-ai-agent.test.mjs`.
   - Confirm all 24/24 tests pass with exit code 0 in < 5 seconds.
2. **Frontend Production Build**:
   - Run `npm run build` in `artifacts/limpeza`.
   - Verify exit code 0 and non-empty bundles in `dist/public`.
3. **Cryptographic SHA-256 Byte Parity**:
   - Compute and verify SHA-256 parity for all 7 mirrored file pairs between `artifacts/api-server/` and `scripts/`.
4. **Port Health**:
   - Ensure port 5000 is completely free of orphaned server processes.
5. **Definitive Verdict**:
   - Deliver `APPROVE` or `REQUEST_CHANGES` in `challenge.md` and `handoff.md`.

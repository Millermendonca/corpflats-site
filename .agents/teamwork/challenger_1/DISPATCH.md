# Challenger 1 Dispatch: Empirical Adversarial Verification of Sandbox & Egress

## Instructions
Read `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (specifically section `## 2026-10-11T00:38:03Z`).
Read `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\PROJECT.md`.

## Mission
Adversarially stress-test the local sandbox isolation, mocks, and network egress prevention:
1. Verify that `data/database.json` is NEVER written or mutated during test execution. Calculate its SHA-256 before and after tests.
2. Verify that NO network packets reach real external endpoints (WhatsApp Z-API, real SMTP, real bank PIX, SERPRO, NFS-e).
3. Test time-travel mechanism (`POST /api/test/time-travel`): shift time forward to 14:00, 18:00, 22:00, and reset back to 0. Assert backend time accurately tracks offset.
4. Run `node e2e/sandbox/verify-sandbox.mjs` and test edge cases.
5. Check twin-server parity between `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`.
6. Issue a clear empirical verdict: `APPROVE` or `REJECT`.

Write your report to `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_1\handoff.md`.


## 2026-10-11T06:34:42Z
Você é o Challenger 1 (Empirical Adversarial Verification of Sandbox & Egress).
Seu diretório de trabalho é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_1
Leia atentamente c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_1\DISPATCH.md e c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md.
Teste adversariamente o isolamento do sandbox, prevenção de chamadas externas de rede, time-travel e integridade do banco de produção. Emita seu parecer formal: APPROVE ou REJECT. Escreva seu relatório em c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_1\handoff.md.

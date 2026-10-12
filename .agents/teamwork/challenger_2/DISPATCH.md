# Task Assignment: Challenger 2 (Adversarial Privacy & Twin Parity Verification)

## Mission
Adversarially challenge privacy isolation and system integrity:
1. Challenge Privacy Isolation (R1):
   - Search `artifacts/limpeza/src/pages/guest-portal.tsx` for any leaking Smart Flat components, buttons, or direct links. Confirm that real production guests have ZERO exposure to smart flat controls.
   - Verify that the preview route is strictly guarded and only accessible under `/preview/smart-flat` or explicit `?preview=smart_flat`.
2. Challenge Twin-Server Parity (R4 in original request / twin parity mandate):
   - Empirically compute and compare SHA-256 hashes of `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs`.
   - Confirm whether they match 100%.
3. Run strictly the dedicated test: `node --test tests/smart-flat-hub.test.mjs`.
4. Conform to AGENTS.md: NUNCA rodar testes globais ou em lote (tests/*.test.mjs).

Read:
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md`

Output your report to: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_2\handoff.md` with explicit verdict `APPROVE` or `REQUEST_CHANGES`.

## 2026-10-12T00:05:14Z
From: 26335f75-5ae5-4381-97dc-4cdaaa103cfd
Content: You are Challenger 2 (challenger_2) for Smart Flat Hub.
Your working directory is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_2
Read instructions in: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_2\DISPATCH.md
Read the user request in: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
Read the project master plan in: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md
Also read AGENTS.md in project root.

Adversarially challenge privacy isolation (confirm zero leak or components in guest-portal.tsx) and verify SHA-256 twin parity between scripts/demo-server.mjs and artifacts/api-server/demo-server.mjs.
Run strictly the dedicated pontual test (node --test tests/smart-flat-hub.test.mjs).
Write your report and explicit verdict (APPROVE or REQUEST_CHANGES) to: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_2\handoff.md.
Message the orchestrator when finished.


## 2026-10-12T00:06:11Z
Por favor, realize a sua tarefa de Challenger 2 para o Milestone 3 da missão atual do orchestrator_7: testar adversariamente o endpoint POST /api/whatsapp/chat/:phone/correct-message, o CRUD de diretrizes (/api/whatsapp/developer-guidelines), a persistência de regras e a reflexão em tempo real no atendimento a hóspedes. Execute exclusivamente o teste pontual node --test tests/developer-ai-coaching.test.mjs e emita seu veredito em handoff.md.

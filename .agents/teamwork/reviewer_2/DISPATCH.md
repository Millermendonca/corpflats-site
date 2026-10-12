# Task Assignment: Reviewer 2 (Backend APIs, Fail-Safe Engine & Twin-Server Parity)

## Mission
Conduct an objective and rigorous review of the Smart Flat Hub Backend implementation and IoT Hardware Guide:
1. Examine `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs`:
   - Inspect the 6 endpoints under `/api/smart-flat/*`.
   - Inspect the antecedence window validation: `now >= ETA - 30min` required to program or turn on appliances.
   - Inspect the Fail-Safe Presence Lifecycle:
     * Warning triggered at ETA without entrance confirmed: *"Você já chegou? Não esqueça de informar sua entrada aqui."*
     * Auto shutoff at ETA + 30min without entrance confirmed: turning off coffee maker and AC, setting reason: *"Equipamento desligado automaticamente por questão de segurança e economia de energia."*
     * Immediate disarmament upon entrance confirmation.
   - Inspect automatic welcome playlist activation on check-in day from official check-in time 14:00.
2. Inspect `docs/SMART_FLAT_HARDWARE_GUIDE.md`:
   - Verify complete specifications for 19 flats: Tuya 16A smart plugs, IR Blasters with TH sensors, Echo Pop/Dot Alexa, touch switches, 2.4GHz VLAN network design, power-outage recovery, and budget breakdown.
3. Verify Twin-Server SHA-256 Parity between `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` via PowerShell command.
4. Run strictly the dedicated pontual test: `node --test tests/smart-flat-hub.test.mjs` (must pass 100%).
5. Conform to AGENTS.md: NUNCA rodar testes globais ou em lote (tests/*.test.mjs).

Read:
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md`
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_backend_iot_1\handoff.md`

Output your report to: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_2\handoff.md` with explicit verdict `APPROVE` or `REQUEST_CHANGES`.


## 2026-10-12T00:05:12Z
You are Reviewer 2 (reviewer_2) for Smart Flat Hub.
Your working directory is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_2
Read instructions in: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_2\DISPATCH.md
Read the user request in: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
Read the project master plan in: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md
Also read AGENTS.md in project root.

Review the Backend APIs, fail-safe lifecycle, 30min antecedence window, twin-server SHA-256 parity, and docs/SMART_FLAT_HARDWARE_GUIDE.md.
Run strictly the dedicated pontual test (node --test tests/smart-flat-hub.test.mjs).
Write your report and explicit verdict (APPROVE or REQUEST_CHANGES) to: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_2\handoff.md.
Message the orchestrator when finished.

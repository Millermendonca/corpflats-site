# Task Assignment: Worker Backend & IoT Hardware (M2 & M4)

## Mission
Implement the Backend Engine, state persistence, validation rules, and the IoT Hardware Guide for the Smart Flat Hub:
1. **Hardware Guide (M4 / R5)**:
   - Create `docs/SMART_FLAT_HARDWARE_GUIDE.md` based on the complete specification in `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_3\analysis.md` and `handoff.md`.
   - Include: Tuya 16A smart plugs (NBR 14136, thermal overload, power metering), IR Blasters 38kHz with integrated TH sensors, Amazon Echo Pop/Dot Alexa, touch switches 4x2 (with/without neutral), 2.4GHz VLAN network design, power-outage recovery, and detailed budget for the 19 flats.
2. **Backend Engine (M2 / R2, R3, R4)**:
   - In `scripts/demo-server.mjs` AND `artifacts/api-server/demo-server.mjs`:
     - Initialize `SmartFlatState` in memory and in `db.smartFlats` and `reservation.smartFlat`.
     - Implement the 6 endpoints specified in `PROJECT.md` and `explorer_survey_2/handoff.md`:
       * `GET /api/smart-flat/:target`
       * `POST /api/smart-flat/:target/eta`
       * `POST /api/smart-flat/:target/devices`
       * `POST /api/smart-flat/:target/confirm-entrance`
       * `POST /api/smart-flat/:target/playlist`
       * `POST /api/smart-flat/:target/simulate`
     - Implement the 30-minute antecedence validation window (`now >= ETA - 30min` required to schedule/turn on devices).
     - Implement the Fail-Safe Presence Lifecycle:
       * Warning: *"Você já chegou? Não esqueça de informar sua entrada aqui."* when `now >= ETA` without entrance confirmed.
       * Safety Shutoff: At `now >= ETA + 30min` without confirmed entrance, turn off coffee maker and AC, setting shutoff reason: *"Equipamento desligado automaticamente por questão de segurança e economia de energia."*
       * Disarm fail-safe when entrance is confirmed (`isEntranceConfirmed === true`).
     - Welcome Playlist trigger: on check-in day from official check-in time 14:00 (`db.settings.checkinTime`), automatically activate welcome playlist state.
3. **Mandatory Parity Rule**:
   - Maintain 100% SHA-256 hash parity between `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs`.

## Write Ownership
- `scripts/demo-server.mjs`
- `artifacts/api-server/demo-server.mjs`
- `docs/SMART_FLAT_HARDWARE_GUIDE.md`

## Mandatory Rules
- DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
- NUNCA executar testes globais ou em lote (tests/*.test.mjs).
- Path to ORIGINAL_REQUEST.md: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`.
- Path to AGENTS.md: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`.



## 2026-10-11T23:47:09Z
You are Worker Backend & IoT Hardware (worker_backend_iot_1) for Smart Flat Hub.
Your working directory is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_backend_iot_1
Read instructions in: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_backend_iot_1\DISPATCH.md
Read the user request in: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
Read the project master plan in: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md
Read Explorer 2 findings in: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_2\handoff.md
Read Explorer 3 findings in: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_3\handoff.md
Also read AGENTS.md in project root.

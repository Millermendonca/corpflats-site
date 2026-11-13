# Worker Dispatch: Milestone 3 - Jornadas Humanas E2E & Prevenção Anti-Frustração (R3)

## Instructions
Read `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (specifically section `## 2026-10-11T00:38:03Z`).
Read `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\PROJECT.md`.
Read Explorer findings:
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_e2e_infra\handoff.md` (Section 1.4: Detailed code references for R3)
Read previous workers' handoffs:
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1_sandbox\handoff.md`
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2_crawler\handoff.md`

## Mandatory Integrity Warning
> DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Objective & Owned Files
Implement the complete test suite in `e2e/suites/02-human-journeys.spec.mjs` verifying all 7 critical anti-frustration journeys:

1. **Jornada 1: Zero Amnésia (Hóspede Recorrente)**
   - Pre-checkin flow (`/pre-checkin/:code`) for a returning guest whose CPF/phone matches an existing past reservation.
   - Assert that document photos (`docPhotoUrl`, `selfieUrl`) and personal details (`cpf`, `birthDate`, `address`) are automatically populated/recognized without forcing re-upload.

2. **Jornada 2: Vínculo Multicanal Automático (`/minha-conta`)**
   - Reservation created in PMS with phone/email/CPF.
   - When the guest accesses `/minha-conta` with that identity, assert that the reservation appears in their account dashboard automatically without manual code typing.

3. **Jornada 3: Persistência Completa de Veículo**
   - Vehicle details (`placa`, `marca`, `modelo`, `cor`) submitted during pre-checkin.
   - Verify that all 4 fields persist and appear in:
     a) `/portaria` (Terminal da Portaria).
     b) `/garagem` (Mapa de Vagas / Planilha de Garagem).
     c) Email transacional gerado no mock SMTP.

4. **Jornada 4: Gestão de Acesso e Fechadura Digital (Controle 14h)**
   - Use `time-travel` helper (`POST /api/test/time-travel`) to simulate morning before 14:00 (e.g., 10:00).
   - Assert that `/minha-reserva/:code` displays friendly cleaning/prep message and digital lock code is hidden.
   - Advance clock past 14:00 via time-travel.
   - Assert that access code is unlocked and prominently displayed.

5. **Jornada 5: Resiliência de Pagamento PIX**
   - Navigate to `/copiar-pix/:code` or guest portal with pending PIX reservation.
   - Trigger instant PIX webhook via `POST /api/pms/inter/webhook` using `e2e/sandbox/pix-simulator.mjs`.
   - Assert page updates in real-time without full page reload, displaying payment confirmed and voucher available.
   - Test QR code regeneration flow when expired.

6. **Jornada 6: Upload Mobile Resiliente & Canvas Signature**
   - Open pre-checkin on Mobile viewport (375x812, touch enabled).
   - Test canvas signature drawing (`onTouchStart`, `onTouchMove`, `onTouchEnd`) verifying `touch-action: none` prevents accidental page scrolling.
   - Verify image compression utility shrinks high-resolution upload before submission.

7. **Jornada 7: Isolamento Estrito de Acompanhantes**
   - In pre-checkin for 2 guests, fill data for Hóspede 2 (Acompanhante).
   - Verify that Hóspede 1 data is preserved and not overwritten.

## Twin-Server Parity Rule
If any backend changes or helpers are needed in `artifacts/api-server/demo-server.mjs`, ensure `scripts/demo-server.mjs` remains byte-for-byte identical.

## Output
Execute the suite with Playwright against the sandbox (`node e2e/runner.mjs` or `pnpm.cmd exec playwright test e2e/suites/02-human-journeys.spec.mjs`), verify 100% pass, and document results in `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3_journeys\handoff.md`.


## 2026-10-11T02:24:50Z
Você é o Worker M3 (Jornadas Humanas E2E & Prevenção Anti-Frustração - R3).
Seu diretório de trabalho é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3_journeys
Leia com atenção o arquivo c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3_journeys\DISPATCH.md e o arquivo c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Implemente e execute a suíte e2e/suites/02-human-journeys.spec.mjs cobrindo as 7 jornadas humanas anti-frustração (Zero Amnésia, Vínculo Multicanal, Veículo Completo na Portaria e Garagem, Fechadura 14h com time-travel, PIX em tempo real e regeneração, Upload com compressão e assinatura canvas touch sem scroll, Isolamento de Acompanhantes Hóspede 2 sem sobrescrever Hóspede 1).
Execute os testes contra o sandbox local, garanta 100% de aprovação e documente os resultados em c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3_journeys\handoff.md.

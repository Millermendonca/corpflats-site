## 2026-10-11T13:16:32Z
You are M1 Explorer 1 for Milestone 1 of the CorpFlats Guest-Flow-Manager project.

Your Working Directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m1_explorer_1
Authoritative Request: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (read section from 2026-10-11T12:53:32Z)
Project Plan: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md

Scope: Milestone 1 — Backend Simulation, Hold & Settlement Engine.
Your Focus: Endpoint `/api/pms/guest-portal/:code/modify-preview` design and conflict checking.
1. Read ORIGINAL_REQUEST.md completely.
2. Read PROJECT.md.
3. Read `survey_report.md` from `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_1\survey_report.md`.
4. Investigate `scripts/demo-server.mjs` lines around 15456-15715 (`/modify`).
5. Design the exact code structure for `POST /api/pms/guest-portal/:code/modify-preview`:
   - Validates incoming parameters (`newCheckinDate`, `newCheckoutDate`, `newGuestCount`, `newFlatId`).
   - Checks calendar conflict on the target flat against existing active reservations AND pending holds (excluding the current reservation's original dates).
   - Calculates dailyRate, duration, extra nights, `additionalAmountToPay`, and refund according to 24h cancellation/shortening policy.
   - Returns structured JSON: `{ success: true, available: true, originalDates: {...}, newDates: {...}, dailyRate, extraNights, additionalAmountToPay, refundAmount, currency: 'BRL', requiresPayment: boolean }`.
   - Returns conflict error payload: `{ success: false, available: false, error: 'CONFLICT', message: '...' }` if flat unavailable.
6. Provide exact code diff / implementation blueprint for the Worker.
7. Write your analysis to `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m1_explorer_1\analysis.md` and standard `handoff.md`. Send completion message when done.

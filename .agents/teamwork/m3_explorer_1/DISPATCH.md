## 2026-10-11T15:45:41Z
sender: 494db1f9-cfb2-46e9-8b9f-419a8aa9586c
priority: MESSAGE_PRIORITY_HIGH

You are M3 Explorer 1 for Milestone 3 of the CorpFlats Guest-Flow-Manager project.

Your Working Directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m3_explorer_1
Authoritative Request: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (read section from 2026-10-11T12:53:32Z)
Project Plan: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md

Scope: Milestone 3 — Guest Portal UI Flow, Modals & Operational Panels.
Focus: Multi-Step Reservation Modification Modal in `artifacts/limpeza/src/pages/guest-portal.tsx`.

Tasks:
1. Read ORIGINAL_REQUEST.md and PROJECT.md.
2. Inspect `artifacts/limpeza/src/pages/guest-portal.tsx` around lines 500-1100 (reservation view and date change / extension dialogs).
3. Investigate the API contracts implemented in Milestone 1:
   - `POST /api/pms/guest-portal/:code/modify-preview`
   - `POST /api/pms/guest-portal/:code/modify-checkout`
   - `GET /api/pms/guest-portal/:code/modify-status?pendingId=...`
   - `POST /api/pms/guest-portal/:code/modify-cancel-pending`
4. Design the multi-step modal experience:
   - **Step 1 (Preview)**: User selects new dates / guests / flat. Calls `/modify-preview`. Displays availability badge ("Disponível" / "Conflito / Indisponível"), cost breakdown (`dailyRate`, `extraNights`, `additionalAmountToPay`, `refundAmount`), 24h cancellation rule notice, and action button ("Continuar para Pagamento" if `requiresPayment`, or "Confirmar Alteração" if cost is 0).
   - **Step 2 (Checkout)**: Initiated via `/modify-checkout`. Displays choice between PIX and Cartão de Crédito.
     - PIX: renders QR Code image and "Copiar Código PIX" button (Copia e Cola). Starts automatic background polling (`/modify-status?pendingId=...`) every 2-3s with 30-min countdown timer.
     - Cartão: button redirecting to Mercado Pago checkout URL.
     - Option to cancel hold: "Cancelar e Manter Datas Originais" calling `/modify-cancel-pending`.
   - **Step 3 (Success / Re-signature Prompt)**: Once payment is verified or zero-cost change committed, display success notification with prompt and direct button: "Assinar Nova Ficha de Check-in" linking to `/pre-checkin/:code?resign=1`.
5. Provide exact drop-in code blueprint for `guest-portal.tsx`.
6. Write analysis to `analysis.md` and standard `handoff.md`. Send completion message when done.

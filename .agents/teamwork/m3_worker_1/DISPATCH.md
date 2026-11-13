## 2026-10-11T15:57:46Z
You are M3 Worker for Milestone 3 of the CorpFlats Guest-Flow-Manager project.

Your Working Directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m3_worker_1
Authoritative Request: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (read section from 2026-10-11T12:53:32Z)
Project Plan: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Exclusive File Ownership:
You own exclusively:
- `artifacts/limpeza/src/pages/guest-portal.tsx`
- `artifacts/limpeza/src/pages/guest-pre-checkin.tsx`
- `artifacts/limpeza/src/pages/garage-dashboard.tsx`
- `scripts/demo-server.mjs` & `artifacts/api-server/demo-server.mjs` (must remain 100% byte-for-byte SHA-256 identical)
- `tests/m3-frontend-portal-panels.test.mjs`

Inputs to Read First:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md`
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m3_explorer_1\analysis.md` (Multi-step modal blueprint)
4. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m3_explorer_2\analysis.md` (Re-signature banner & fast-track pre-checkin blueprint)
5. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m3_explorer_3\analysis.md` (Garage polling blueprint & build verification)

Implementation Scope:
1. Multi-Step Modification Modal & Re-Signature Banner in `artifacts/limpeza/src/pages/guest-portal.tsx`:
   - Add required Lucide icons (`PenTool`, `QrCode`, `Clock`, `CreditCard`, `ArrowRight`, `ExternalLink`, etc.).
   - Refactor modal to support multi-step state (`preview` -> `checkout` -> `success`):
     - Step 1 (Preview): Calls `POST /api/pms/guest-portal/:code/modify-preview` on date changes. Renders availability badge ("Disponível" / "Conflito"), transparent cost breakdown (`dailyRate`, `extraNights`, `additionalAmountToPay`, `refundAmount`), 24h cancellation policy notice, and action buttons.
     - Step 2 (Checkout): Calls `POST /api/pms/guest-portal/:code/modify-checkout`. Displays PIX (QR Code image, "Copiar Código PIX" button with copy feedback, 30-min countdown timer, and 2.5s polling loop on `/modify-status?pendingId=...`) and Mercado Pago card link. Provides button to cancel hold via `POST /api/pms/guest-portal/:code/modify-cancel-pending`.
     - Step 3 (Success): Displays success message and primary CTA "Assinar Nova Ficha de Check-in" linking to `/pre-checkin/${code}?resign=1`.
   - Top-level Re-Signature Alert Banner: Rendered on the header and inside reservation details card when `reservation.needsReSignature === true`, linking to `/pre-checkin/${reservation.code}?resign=1`.
2. Fast-Track Re-signing in `artifacts/limpeza/src/pages/guest-pre-checkin.tsx`:
   - Add missing `AlertTriangle` icon import.
   - When `?resign=1` is present or `needsReSignature` is true:
     - Direct jump to Step 3 (Assinatura).
     - Preserve 100% of pre-filled guest fields (name, CPF, phone, address, photo ID, vehicle).
     - Clear stale signature data so the guest can provide a fresh physical signature in 1 click.
     - Submit to `POST /api/pms/pre-checkin` with `resign: "1"`, then redirect back to `/minha-reserva/${code}?resign_success=1`.
3. Real-Time Background Polling in `artifacts/limpeza/src/pages/garage-dashboard.tsx`:
   - Implement 30-second silent background polling (`fetchGarageData(true)`) with cleanup on unmount.
   - Add `focus` and `visibilitychange` window listeners to refetch on tab activation.
   - Display live sync indicator ("Tempo Real (30s)"), sync timestamp, and dynamic stay status badges.
4. Backend Field Projection:
   - In `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs`, ensure `r.needsReSignature`, `r.reSignatureReason`, and `r.reSignatureUrl` are projected onto the returned reservation in `GET /api/pms/guest-portal/:code`.
   - Verify byte-for-byte SHA-256 parity between twin servers.
5. Build and Test Verification:
   - In `artifacts/limpeza`, execute `npm run build` and ensure clean exit code 0 and updated `artifacts/limpeza/dist/`.
   - Create automated test file `tests/m3-frontend-portal-panels.test.mjs` validating all Milestone 3 invariants.
   - Execute strictly targeted tests:
     - `node --test tests/m3-frontend-portal-panels.test.mjs`
     - `node --test tests/m2-re-signature-operations-sync.test.mjs`
     - `node --test tests/m1-reservation-modification-settlement.test.mjs`
6. Git Version Control:
   - Commit all changes and execute `git push` to `origin main` per `AGENTS.md`.
7. Update `progress.md`, write `handoff.md`, and notify orchestrator via `send_message`.

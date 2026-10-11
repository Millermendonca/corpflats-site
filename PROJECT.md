# Project: CorpFlats Guest-Flow-Manager - Secure Reservation Modification Flow

## Architecture
- **Backend Core**: In-memory `db` persisted atomically via `atomicWriteFileSync` in `data/database.json`. Server entry points in `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` maintaining strict 100% byte-for-byte SHA-256 parity (`72EA96CE4DC341181B8B41E7A01FE91F52E975FDD757FBD70C033688FEC6184F`).
- **Guest Portal Frontend**: React + TypeScript single-page app in `artifacts/limpeza/src/pages/guest-portal.tsx` and `guest-pre-checkin.tsx`, built via Vite to `artifacts/limpeza/dist/`.
- **Payment Layer**: Banco Inter PIX (dynamic mTLS + static EMV with QRCode), Mercado Pago Checkout preference, status polling (`/modify-status` / `/payment-status`) with in-flight Promise locking (`activeModificationCommits = new Map()`) and payment deduplication.
- **Legal & Reception Synchronization**: FNRH check-in document generation via `scripts/fnrh-pdf-service.mjs`, digital signatures, automated WhatsApp notifications via `scripts/zapi-service.mjs`, email dispatch via `scripts/mail-service.mjs`, and real-time polling on Reception (`/api/reception/today`) and Garage (`/api/pms/garage/daily-sheet`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Simulation & Availability Check (`/modify-preview`) | Validates flat calendar availability, calculates daily rates, extra nights, 24h refund policy, and returns pricing breakdown without mutating database. | M1 | ORIGINAL_REQUEST R1 (DONE) |
| 2 | Provisional Hold & Conflict Guard | Prevents double-booking during payment checkout via 30-minute hold (`r.pendingModification`) while keeping original dates intact until payment confirmation. | M1 | ORIGINAL_REQUEST R1, R2 (DONE) |
| 3 | Payment Settlement Before Date Commit | When `additionalAmountToPay > 0`, dates are committed only after PIX/Card payment verification; canceling or abandoning leaves reservation untouched. | M1 | ORIGINAL_REQUEST R2 (DONE) |
| 4 | Audit Trail & Payment Recording | Commits `r.payments`, `r.totalAmount`, `r.modificationHistory`, and updates reservation dates atomically upon verified payment with in-flight mutex lock. | M1 | ORIGINAL_REQUEST R2 (DONE) |
| 5 | Mandatory Re-Signature Invalidation | Flags `r.needsReSignature = true`, clears `fnhrCompleted`, `signatureUrl`, and stale FNRH links whenever dates or flat change in Portal or PMS Admin. | M2 | ORIGINAL_REQUEST R3 |
| 6 | Automated Re-Signature Communication | Dispatches WhatsApp and/or email notification with direct personalized link (`/pre-checkin/:code?resign=1`) for immediate re-signing. | M2 | ORIGINAL_REQUEST R3 |
| 7 | Forensic Document Generation & Reception Email Delivery | Generates updated FNRH PDF with SHA-256 hash upon re-signing, clears `needsReSignature = false`, and delivers document to reception email. | M2 | ORIGINAL_REQUEST R3 |
| 8 | Reception & Garage Panel Synchronization | Reception panel (`reception-tablet.tsx`) blocks check-in while `needsReSignature = true`; garage panel (`garage-dashboard.tsx`) adds polling to reflect updated stay dates & vehicle plates. | M3 | ORIGINAL_REQUEST R4 |
| 9 | Guest Portal Multi-Step UI Modal & Re-Sign Banner | Guest portal displays Step 1 preview badge & cost breakdown, Step 2 PIX QR Code/Copia e Cola + Card checkout with polling, and top banner when re-signature is required. | M3 | ORIGINAL_REQUEST R1, R2, R3 |
| 10 | Schedulers & Daily Routines Synchronization | Synchronizes morning 07:00 notification routine, breakfast orders, and housekeeping turnovers to new stay dates. | M2 | ORIGINAL_REQUEST R4 |
| 11 | Comprehensive E2E Testing Suite (Tiers 1-4) | Automated tests covering availability simulation, payment settlement guardrails, re-signature invalidation, WhatsApp link dispatch, and panel synchronization. | M4 | ORIGINAL_REQUEST Acceptance Criteria |
| 12 | Twin-Server Parity & Production Build Cleanliness | Strict SHA-256 parity between `scripts/` and `artifacts/api-server/`, clean `npm run build` in `artifacts/limpeza`, and git push to `origin main`. | M4 | Strict Guardrails & Parity |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Simulation, Hold & Settlement Engine | Endpoints `/modify-preview`, `/modify-checkout`, `/modify-status`, `/modify-cancel-pending`, availability check, calendar hold, atomic payment commit, in-flight mutex locking. | None | DONE |
| M2 | Re-Signature Lifecycle, Document Delivery & Ops Synchronization | Invalidation of signature on date/flat change, automated WhatsApp/email dispatch with direct re-signing link, PDF re-generation, reception email dispatch, scheduler sync. | M1 | IN_PROGRESS |
| M3 | Guest Portal UI Flow, Modals & Operational Panels | Refactor `guest-portal.tsx` modal (Step 1 preview, Step 2 payment checkout), re-signature banner, `guest-pre-checkin.tsx` fast-track, and `garage-dashboard.tsx` polling. | M1, M2 | PLANNED |
| M4 | Comprehensive E2E Test Suite, Parity & Production Verification | Tiers 1-4 automated tests, SHA-256 parity validation, clean `npm run build` in `artifacts/limpeza`, git push. | M1, M2, M3 | PLANNED |

## Interface Contracts
### Frontend ↔ Backend Modification Endpoints
- `POST /api/pms/guest-portal/:code/modify-preview`
  - Input: `{ newCheckinDate: string, newCheckoutDate: string, newGuestCount?: number, newFlatId?: string, reason?: string }`
  - Output: `{ success: true, available: boolean, conflictMessage?: string, originalDates: { checkinDate, checkoutDate }, newDates: { checkinDate, checkoutDate }, dailyRate: number, extraNights: number, additionalAmountToPay: number, refundAmount: number, currency: 'BRL', requiresPayment: boolean }`
- `POST /api/pms/guest-portal/:code/modify-checkout`
  - Input: `{ newCheckinDate: string, newCheckoutDate: string, newGuestCount?: number, newFlatId?: string, reason?: string, paymentMethod: 'pix' | 'credit_card' }`
  - Output: `{ success: true, pendingId: string, additionalAmountToPay: number, pixQrCodeUrl?: string, pixCopiaECola?: string, pixTxId?: string, mpCheckoutUrl?: string, expiresAt: string }`
- `GET /api/pms/guest-portal/:code/modify-status?pendingId=:id`
  - Output: `{ success: true, status: 'pending' | 'paid' | 'expired' | 'canceled', committed: boolean, message?: string }`
- `POST /api/pms/guest-portal/:code/modify-cancel-pending`
  - Input: `{ pendingId?: string }`
  - Output: `{ success: true, message: string }`
- `POST /api/pms/pre-checkin`
  - Input: form submission with signature
  - Behavior: Saves signature, clears `r.needsReSignature = false`, generates FNRH PDF with SHA-256 hash, delivers email to reception.

## Code Layout
- `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs`: Server routes and business logic (must be byte-for-byte identical).
- `scripts/fnrh-pdf-service.mjs` and `artifacts/api-server/fnrh-pdf-service.mjs`: Forensic PDF generation with SHA-256.
- `scripts/zapi-service.mjs` and `artifacts/api-server/zapi-service.mjs`: WhatsApp notification triggers.
- `artifacts/limpeza/src/pages/guest-portal.tsx`: Guest Portal UI, reservation view, modification modal.
- `artifacts/limpeza/src/pages/guest-pre-checkin.tsx`: Pre-checkin and re-signing canvas.
- `artifacts/limpeza/src/pages/reception-tablet.tsx`: Reception tablet view.
- `artifacts/limpeza/src/pages/garage-dashboard.tsx`: Garage dashboard.
- `tests/`: Automated test suites (`node --test tests/*.test.mjs`).

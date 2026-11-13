# Project: CorpFlats - System Actions API, Function Calling & Tariff Engine

## Architecture
- **Monolithic API Server & Twin Mirror**: `artifacts/api-server/demo-server.mjs` and identical mirror `scripts/demo-server.mjs`.
- **WhatsApp Engine & AI Service**: `artifacts/api-server/whatsapp-ai-service.mjs` and `artifacts/api-server/zapi-service.mjs` (mirrored in `scripts/`).
- **Frontend SPA**: React 18 + Vite + Tailwind in `artifacts/limpeza/src/` compiled to `artifacts/limpeza/dist/public/`.
- **Database**: In-memory JSON store in `data/database.json` with synchronous atomic persistence.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Global Master Switch (`apiActionsEnabled`) | Master toggle in admin and DB to activate/pause all bot system action access | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Granular Action Switches (`allowedActions`) | Matrix of 5 individual switches (checkAvailability, calculateQuote, generatePayment, createPreReservation, commitReservation) | M1 | ORIGINAL_REQUEST §R1 |
| 3 | REST Actions API (`/api/bot-actions/*`) | Standardized endpoints with 403 ACTION_DISABLED and handover metadata when disabled | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Smart Tariff Engine Data Model | `db.tariffSettings` and `db.tariffOverrides` in `database.json` | M1 | ORIGINAL_REQUEST §R2 |
| 5 | SEBRAE Automatic Pricing | Base daily rate computed from `getFinancialSettings()` fixed/variable costs & margin | M1 | ORIGINAL_REQUEST §R2 |
| 6 | Multi-Channel Markups & Commissions | Commission/markup configuration per channel (Direto, Booking, Airbnb) | M1 | ORIGINAL_REQUEST §R2 |
| 7 | Granular & Bulk Tariff Editing | Date x Flat x Channel individual override and bulk batch updates | M1 | ORIGINAL_REQUEST §R2 |
| 8 | Additional Fees Sync with siteConfig | Cleaning fee, extra bed, breakfast price synchronized with `db.siteConfig` | M1 | ORIGINAL_REQUEST §R2 |
| 9 | Autonomous PMS Reservation Pipeline | Availability conflict check, quote calculation, temporary pre-reservation (30m hold) | M1 | ORIGINAL_REQUEST §R3 |
| 10 | PIX Payment Generation | BR Code BACEN copia-e-cola and base64 QR Code generation | M1 | ORIGINAL_REQUEST §R3 |
| 11 | Reservation Commitment | Transition pre-reservation to confirmed in PMS with permanent calendar lock | M1 | ORIGINAL_REQUEST §R3 |
| 12 | Adaptive Gemini Function Calling | Multi-turn function declarations only for allowed actions; `tools: []` when master switch off | M2 | ORIGINAL_REQUEST §R4 |
| 13 | Courteous Human Handover & Zero-Crash | Informational concierge mode and polite fallback when action disabled or on error | M2 | ORIGINAL_REQUEST §R4 |
| 14 | Admin UI: WhatsApp Automation AI Tab | Highlight Master Switch, 5 granular switches, real-time tri-modal status indicator | M3 | ORIGINAL_REQUEST §R5 |
| 15 | Admin UI: Multi-Channel Tariff Calendar | Calendar grid, channel selector, SEBRAE vs Custom toggle, bulk edit modal | M3 | ORIGINAL_REQUEST §R5 |
| 16 | Twin-Server Parity Mandate | Byte-to-byte SHA-256 identity between `artifacts/api-server/` and `scripts/` | M4 | ORIGINAL_REQUEST §Infra |
| 17 | Test Suites Validation | 100% pass on `tariff-engine.test.mjs`, `bot-actions-api.test.mjs`, `whatsapp-ai-agent.test.mjs` | M4 | ORIGINAL_REQUEST §Verification |
| 18 | Frontend Build & Git Push | `npm run build` in `artifacts/limpeza`, dist included in commit, push to `origin main` | M4 | AGENTS.md |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Core: System Actions API & Tariff Engine & Autonomous Pipeline | R1 (Master switch & `/api/bot-actions/*`), R2 (Tariff Engine & SEBRAE), R3 (PMS Reservation & PIX Pipeline) | none | DONE |
| M2 | WhatsApp AI Service: Adaptive Function Calling & Fallback | R4 (Gemini tool calling, multi-turn, courteous handover, mirror parity) | M1 | DONE |
| M3 | Frontend Admin: AI Switches & Multi-Channel Tariff Calendar | R5 (`whatsapp-automation.tsx` & `tarifas.tsx`) | M1 | DONE |
| M4 | Final Milestone: Full Verification, Parity Audit, Build & Deploy | 100% tests pass, SHA-256 twin server parity, `npm run build`, git commit & push | M1, M2, M3 | DONE |

## Interface Contracts
### Bot Actions API ↔ Consumers (WhatsApp Bot & External)
- `GET /api/bot-actions/settings` -> `{ apiActionsEnabled: boolean, allowedActions: { checkAvailability: boolean, calculateQuote: boolean, generatePayment: boolean, createPreReservation: boolean, commitReservation: boolean } }`
- `POST /api/bot-actions/settings` -> updates settings, emits hot update.
- `GET /api/bot-actions/availability?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&guests=N` -> `{ available: boolean, flats: [...] }`
- `POST /api/bot-actions/quote` -> `{ checkIn, checkOut, guests, flatId, channel, ratePlan, dailyRate, nights, cleaningFee, extraBedFee, breakfastFee, total, expiresAt }`
- `POST /api/bot-actions/pre-reserve` -> `{ preReservationId, code, flatId, checkIn, checkOut, total, expiresAt, status: "pre_reserva" }`
- `POST /api/bot-actions/payment-link` -> `{ pixCopiaECola, qrCodeBase64, valor, expiresAt }`
- `POST /api/bot-actions/commit-reservation` -> `{ reservationId, code, status: "confirmada", flatNumber, pmsConfirmed: true }`
- Error response when disabled: `HTTP 403 { error: "ACTION_DISABLED", action: string, requiresHandover: true, message: string }`

### Tariff Engine ↔ Reservations & Quote
- `calculateDailyRate(flatId, date, channel)` -> checks override for (flatId, date, channel); if none, applies baseRate + channelMarkup + weekendMarkup; if mode == 'auto', baseRate is computed from `getFinancialSettings()`.

## Code Layout
- Backend routes & tariff logic: `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`
- WhatsApp AI & Tool calling: `artifacts/api-server/whatsapp-ai-service.mjs` and `scripts/whatsapp-ai-service.mjs`
- WhatsApp Z-API controller: `artifacts/api-server/zapi-service.mjs` and `scripts/zapi-service.mjs`
- Frontend WhatsApp Automation: `artifacts/limpeza/src/pages/whatsapp-automation.tsx`
- Frontend Tariff Calendar: `artifacts/limpeza/src/pages/tarifas.tsx`
- Automated tests: `tests/tariff-engine.test.mjs`, `tests/bot-actions-api.test.mjs`, `tests/whatsapp-ai-agent.test.mjs`

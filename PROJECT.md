# Project: Guest-Flow-Manager Dynamic FAQ & Knowledge Base

## Architecture
- **Backend & API Layer**: Node.js ESM Express server (`artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`) integrating with Z-API engine (`zapi-service.mjs`). Dual-mirrored byte-for-byte codebase between `artifacts/api-server/` and `scripts/`.
- **Database & Persistence**: In-memory JSON database loaded from and atomic-saved to `data/database.json` and replicated to PostgreSQL (`system_store`). `db.faqItems` collection stores knowledge base items.
- **Auto-Learning Engine**:
  - Inbound webhook (`processAiInboundMessage`) detects unmapped queries requiring human handover and persists them as `"pendente"`.
  - Outbound human response (`fromMe: true` via webhook or live chat API) captures operator response as `suggestedAnswer` with status `"aguardando_aprovacao"`.
  - 1-click approval promotes status to `"ativo"`.
- **Rule Engine & Client Exception**: `isFaqApplicableToClient` normalizes phone numbers (Brazilian DDI 55, DDD, 8/9 digit variants) and enforces scopes (`all`, `exclude`, `include_only`).
- **Sofia AI Motor**: `whatsapp-ai-service.mjs` dynamically injects applicable active FAQs into Google Gemini context and prioritizes them in local heuristic search.
- **Frontend UI Layer**: React + Vite 7 + Tailwind v4 + wouter in `artifacts/limpeza`. Dedicated tab "Base de Conhecimento & FAQ" on `/whatsapp-automation` with category cards/table, status filters, create/edit modal with exception config, and 1-click approval.
- **Build & CI**: `npm run build` in `artifacts/limpeza` emits to `dist/public/`. Strict git push policy per `AGENTS.md`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | DB FAQ Collection & Seed | `db.faqItems` persistence in `data/database.json` initialized with official FAQs and pending items | M1 | ORIGINAL_REQUEST §R5, AC1 |
| 2 | Phone Normalization & Rule Engine | `isFaqApplicableToClient` supporting scopes `all`, `exclude`, `include_only` with DDI/DDD normalization | M1 | ORIGINAL_REQUEST §R4, AC3 |
| 3 | REST API Endpoints | `GET`, `POST`, `PUT`, `DELETE` on `/api/whatsapp/faq` and `POST /api/whatsapp/faq/:id/approve` | M1 | ORIGINAL_REQUEST §R1, AC1 |
| 4 | Mirrored Code Parity | Ensure exact SHA-256 byte-for-byte identity between `artifacts/api-server/` and `scripts/` | M1 | Explorer Survey 3, AC4 |
| 5 | Unmapped Inbound Detection | Detect unmapped guest questions in `processAiInboundMessage` and persist with status `"pendente"` | M2 | ORIGINAL_REQUEST §R2, AC2 |
| 6 | Operator Response Capture | Capture `fromMe: true` operator responses linking `suggestedAnswer` and changing status to `"aguardando_aprovacao"` | M2 | ORIGINAL_REQUEST §R3, AC2 |
| 7 | Sofia Motor Dynamic Integration | Dynamic injection of active FAQs into Gemini prompt and heuristic keyword fallback | M2 | ORIGINAL_REQUEST §R5, AC2 |
| 8 | Frontend Route Alias | Declare `<AdminRoute path="/whatsapp-automation" ... />` in `artifacts/limpeza/src/App.tsx` | M3 | Explorer Survey 2, ORIGINAL_REQUEST §R1 |
| 9 | UI Hook `use-faq` | React hook for FAQ state management, cache, API calls, and toast alerts | M3 | Explorer Survey 2 |
| 10 | Knowledge Base & FAQ UI Tab | Tab in `/whatsapp-automation` with 9 category cards, table view, 4 status filters, modal, and 1-click approve | M3 | ORIGINAL_REQUEST §R1 |
| 11 | Frontend Build & Dist Sync | Build frontend via `npm run build` in `artifacts/limpeza` generating `dist/public` | M3 | AGENTS.md, AC4 |
| 12 | E2E Testing Suite | Comprehensive test suite in `tests/whatsapp-ai-agent.test.mjs` verifying R1-R5 | M4 | ORIGINAL_REQUEST AC4 |
| 13 | Adversarial Coverage & Hardening | Stress testing corner cases, phone formats, and exception rules | M4 | Project Pattern Phase 2 |
| 14 | Forensic Integrity & Git Push | Clean forensic audit, git commit and mandatory `git push` | M4 | AGENTS.md, ORIGINAL_REQUEST AC4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Core & Database Layer | Features 1, 2, 3, 4: Schema, seed, CRUD API, phone normalization & rule engine, code parity | none | DONE |
| M2 | Auto-Learning & Sofia Motor Integration | Features 5, 6, 7: Inbound unmapped question detection, operator response capture, Sofia Gemini/heuristic integration | M1 | DONE |
| M3 | Frontend UI & Build Delivery | Features 8, 9, 10, 11: Route alias, use-faq hook, FAQ tab, modal with rules, 1-click approval, build | M1, M2 | IN_PROGRESS |
| M4 | Final Milestone: E2E Tests, Hardening & Git Push | Features 12, 13, 14: 100% E2E test pass, adversarial hardening, clean forensic audit, git commit and push | M1, M2, M3 | PLANNED |

## Interface Contracts
### Backend ↔ Frontend API Contract
- `GET /api/whatsapp/faq`: Returns `{ success: true, count: number, items: FaqItem[] }`
- `POST /api/whatsapp/faq`: Body `{ question, answer, category, keywords?, variations?, scope?, clientPhones?, status? }` -> Returns `{ success: true, item: FaqItem }`
- `PUT /api/whatsapp/faq/:id`: Body `{ question?, answer?, category?, keywords?, variations?, scope?, clientPhones?, status? }` -> Returns `{ success: true, item: FaqItem }`
- `DELETE /api/whatsapp/faq/:id`: Returns `{ success: true, id: string }`
- `POST /api/whatsapp/faq/:id/approve`: Body `{ answer?, category? }` -> Returns `{ success: true, item: FaqItem }` (sets `status: "ativo"`, `approvedAt: ISOString`)

### FaqItem Schema
```typescript
interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: "reservas" | "checkin_acesso" | "wifi_tecnologia" | "cafe_manha" | "garagem" | "estrutura_flat" | "regras_visitas_pets" | "lazer_condominio" | "checkout";
  keywords: string[];
  variations: string[];
  status: "ativo" | "inativo" | "pendente" | "aguardando_aprovacao";
  scope: "all" | "exclude" | "include_only";
  clientPhones: string[];
  suggestedAnswer?: string;
  sourceClientPhone?: string;
  sourceClientName?: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
}
```

### Auto-Learning Inbound/Outbound Contract
- Inbound: `processAiInboundMessage({ db, incomingInfo, cleanTarget, ... })` -> if unmapped question & handover, push to `db.faqItems` with `status: "pendente"`.
- Outbound: `onOperatorMessage({ db, phone, text })` -> if open pending item exists for phone in last 24h, set `suggestedAnswer = text`, `status = "aguardando_aprovacao"`.

## Code Layout
- `artifacts/api-server/zapi-service.mjs` & `scripts/zapi-service.mjs`: Z-API webhook, live chat, and FAQ REST API endpoints.
- `artifacts/api-server/whatsapp-ai-service.mjs` & `scripts/whatsapp-ai-service.mjs`: AI motor, prompt injection, heuristic search, unmapped question auto-detection.
- `artifacts/api-server/demo-server.mjs` & `scripts/demo-server.mjs`: Database initialization, seed FAQs in `db.faqItems`.
- `data/database.json`: Persistent database state.
- `artifacts/limpeza/src/App.tsx`: Route declaration for `/whatsapp-automation`.
- `artifacts/limpeza/src/hooks/use-faq.ts`: FAQ state management hook.
- `artifacts/limpeza/src/components/faq-knowledge-base.tsx` or `artifacts/limpeza/src/pages/whatsapp-automation.tsx`: UI tab, category cards, table, modal, 1-click approve.
- `artifacts/limpeza/dist/`: Compiled production assets.
- `tests/whatsapp-ai-agent.test.mjs`: Test suite covering R1-R5.

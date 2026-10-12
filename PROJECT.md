# Project: Modo Desenvolvedor & Treinamento Inteligente no WhatsApp (CorpFlats)

## Architecture
- **Inbound WhatsApp Pipeline**: `scripts/zapi-service.mjs` & `artifacts/api-server/zapi-service.mjs`
- **AI Coaching & Prompt Engine**: `scripts/whatsapp-ai-service.mjs` & `artifacts/api-server/whatsapp-ai-service.mjs`
- **Data Persistence**: `data/database.json` -> `db.whatsappAiSettings.developerGuidelines`, `db.whatsappAiSettings.toneSettings`, `aiConfig.systemPrompt`
- **Frontend Web Chat**: `artifacts/limpeza/src/pages/whatsapp-chat.tsx`
- **Frontend AI Automation**: `artifacts/limpeza/src/pages/whatsapp-automation.tsx`
- **Production Build**: `artifacts/limpeza/dist/`
- **Targeted Test Suite**: `tests/developer-ai-coaching.test.mjs`

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Developer Phone Recognition | Helper `isDeveloperPhone` recognizing 22998505276 / 5522998505276 | M1 (DONE) | R1 |
| 2 | Persistent AI Pause Bypass | 4-layer defense ensuring developer chat is never muted by `aiPaused: true` | M1 (DONE) | R1 |
| 3 | Tri-Modal Intent Engine | Classifies developer messages into guest simulation vs tone calibration vs factual coaching | M1 (DONE) | R1, R2 |
| 4 | Non-Literal Tone Calibration | Extracts tone parameters from natural language ("responda mais curto"), updates config, generates cordial confirmation + summary + live sample | M1 (DONE) | R2 |
| 5 | Real-Time Guideline Injection | Injects active `developerGuidelines` and `toneSettings` into Sofia's prompt for all guests in real time | M1 (DONE) | R4 |
| 6 | Rectification Backend Endpoint | `POST /api/whatsapp/chat/:phone/correct-message` for 1-click guideline learning & guest rectification | M1 (DONE) | R3 |
| 7 | Guidelines Management API | CRUD endpoints for developer guidelines | M1 (DONE) | R4 |
| 8 | Dedicated Targeted Test Suite | `tests/developer-ai-coaching.test.mjs` validating all backend features (8/8 PASS) | M1 (DONE) | Verification |
| 9 | Web Chat 1-Click Rectification | Button "✏️ Corrigir / Ensinar Sofia" on Sofia's bubbles and modal in `whatsapp-chat.tsx` | M2 | R3 |
| 10 | Administrative Guidelines Card | Card "🧠 Diretrizes & Calibrações Aprendidas" in `whatsapp-automation.tsx` | M2 | R4 |
| 11 | Production Frontend Build | Clean build with `npm --prefix artifacts/limpeza run build` and `dist/` updated | M2 | AGENTS.md |
| 12 | Twin-Server Parity & Git Push | 100% SHA-256 match for twin files, gate verification, and immediate `git push origin main` | M3 | AGENTS.md |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Core & AI Coaching Engine | `zapi-service.mjs`, `whatsapp-ai-service.mjs`, parity sync, test creation | M0 | DONE |
| M2 | Frontend Web Chat & Automation UI | `whatsapp-chat.tsx`, `whatsapp-automation.tsx`, build `artifacts/limpeza` | M1 | IN_PROGRESS |
| M3 | Gate, Parity Verification & Git Push | Reviewers, Challengers, Auditor, SHA-256 parity, git commit & push | M1, M2 | PLANNED |

## Interface Contracts
### `POST /api/whatsapp/chat/:phone/correct-message`
- Request: `{ messageId?, originalText?, guideline: string, rectificationMessage?: string, sendToGuest: boolean, category?: string }`
- Response: `{ success: true, guideline: object, sentMessage?: object }`

### `db.whatsappAiSettings.developerGuidelines`
- Schema: `{ id: string, rule: string, category: "tone"|"factual", targetFlat?: string|null, createdAt: string, active: boolean, source: "whatsapp_developer"|"web_chat_operator"|"manual", sample?: string }`

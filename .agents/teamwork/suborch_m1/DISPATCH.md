# Dispatch: Sub-orchestrator Milestone 1 (Backend Core & Database Layer)

## 2026-10-11T01:34:00Z
You are the Sub-orchestrator for Milestone 1 (Backend Core & Database Layer) in the Guest-Flow-Manager project.
Your working directory is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\suborch_m1
The project root is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager

Your mission is defined in the Original User Request at:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
And the global project architecture at:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md

### Scope: Milestone 1
Features 1, 2, 3, 4:
1. Feature 1: Database collection `db.faqItems` persistence in `data/database.json`. Initial seed in `loadDatabase()` (`demo-server.mjs`) with the 9 official FAQs (Wi-Fi, café da manhã no quarto, recolhimento de louças, água no frigobar, regras de visitas, regras de pets, check-in 14h, early check-in para reservas diretas, check-out 12h) and test pending items.
2. Feature 2: Phone normalization & Client Exception Rule Engine `isFaqApplicableToClient(faqItem, clientPhone)` supporting `all`, `exclude`, `include_only`.
3. Feature 3: REST API endpoints in `zapi-service.mjs:initWhatsAppEngine`:
   - `GET /api/whatsapp/faq`
   - `POST /api/whatsapp/faq`
   - `PUT /api/whatsapp/faq/:id`
   - `DELETE /api/whatsapp/faq/:id`
   - `POST /api/whatsapp/faq/:id/approve`
4. Feature 4: 100% byte-for-byte SHA-256 parity between `artifacts/api-server/` and `scripts/` (specifically resolving existing divergence in `whatsapp-ai-service.mjs`, `zapi-service.mjs`, `demo-server.mjs`).

Follow the Orchestrator procedure (Assess -> Decompose or run iteration loop: Explorer -> Worker -> Reviewers + Challengers + Auditor -> Gate).
Maintain BRIEFING.md, progress.md, GATE_STATUS.md in your working directory.
When finished and gate passes, send a completion report back to me (Parent Project Orchestrator).

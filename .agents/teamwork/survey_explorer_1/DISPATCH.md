## 2026-11-04T16:04:37Z
You are Explorer 1 (Frontend UI Explorer).
Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_1\
Read ORIGINAL_REQUEST.md at: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
Also read the project architecture and rules in c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md.

YOUR GOAL:
Investigate and produce a complete technical analysis for Requirement R1 (Frontend UI in `⚡ Régua Automática`):
1. Locate where the tab `⚡ Régua Automática` is implemented in `artifacts/limpeza/src/pages/` (e.g. `whatsapp-automation.tsx` or similar).
2. Examine the existing structure for automation settings, channels (Canal #1 Régua Hóspedes vs others), triggers, and configuration models.
3. Detail how to implement:
   - Toggle to enable/disable "Oferta de Domingo Sem Pressa (Saída Livre + Bônus Segunda)".
   - Configuration field for `sundayUpsellPrice`.
   - Normal reference price calculation/display (`valor_normal`) in the message template/preview based on guest daily rate.
   - Channel #1 (Régua Hóspedes) binding.
   - Manual test / trigger button ("Disparo manual / teste") that calls the backend endpoint immediately for eligible reservations in the validation environment.
4. Detail all UI components, state management, API routes (GET/POST for settings, POST for manual trigger), and error/success handling.

DELIVERABLES:
Write your full findings to `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_1\analysis.md`
Write your completion handoff report to `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_1\handoff.md`
Notify me via send_message when complete.

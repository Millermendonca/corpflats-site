# E2E Test Infra: Maid Daily Summary, AI Triage & Opinion Synthesis

## Test Philosophy
- Requisito-orientado, aderente às regras estritas de teste do `AGENTS.md`.
- Execução pontual e isolada via `tests/maid-review-ai-synthesis.test.mjs` (sem disparos globais ou em lote).
- Cobertura de todas as regras de negócio:
  - R1: Resumo diário de avaliações via WhatsApp para camareiras com quarto, data da limpeza e nota.
  - R2: Preservação estrita do fluxo existente de 2 etapas de coleta de avaliações e comentários para notas < 5.
  - R3: Triagem por IA para notas < 5 (encaminhamento para responsabilidades da camareira vs descarte de itens alheios; notas 5 sempre incluídas).
  - R4: Envio retroativo inicial de Novembro/2026 com prevenção de duplicidade.
  - R5: Síntese consolidada de opiniões dos clientes (Mercado Livre) e comparativo de evolução entre períodos (delta, tendência subiu/desceu).

## Feature Inventory
| # | Feature | Source | Tier 1 | Tier 2 | Tier 3 |
|---|---------|--------|:------:|:------:|:------:|
| 1 | F1_MAID_ATTRIBUTION | R1, Acceptance Criteria | 5 | 5 | ✓ |
| 2 | F2_REVIEW_FLOW_PRESERVATION | R2, Acceptance Criteria | 5 | 5 | ✓ |
| 3 | F3_AI_SUB5_TRIAGE | R3, Acceptance Criteria | 5 | 5 | ✓ |
| 4 | F4_FORWARDING_RULES | R3, Acceptance Criteria | 5 | 5 | ✓ |
| 5 | F5_OPINION_SYNTHESIS_DATA | R5, Acceptance Criteria | 5 | 5 | ✓ |
| 6 | F6_EVOLUTION_COMPARATIVE | R5, Acceptance Criteria | 5 | 5 | ✓ |
| 7 | F7_REALTIME_DUAL_MESSAGE | R5, Acceptance Criteria | 5 | 5 | ✓ |
| 8 | F8_DAILY_SUMMARY_CRON | R1, Acceptance Criteria | 5 | 5 | ✓ |
| 9 | F9_DAILY_MESSAGE_FORMAT | R1, Acceptance Criteria | 5 | 5 | ✓ |
| 10 | F10_RETROACTIVE_NOVEMBER | R4, Acceptance Criteria | 5 | 5 | ✓ |
| 11 | F11_FRONTEND_AUTOMATION_UI | Acceptance Criteria | 5 | 5 | ✓ |
| 12 | F12_PUNCTUAL_TEST_SUITE | Acceptance Criteria | 5 | 5 | ✓ |

## Test Architecture
- Test Runner: Node.js native test runner (`node --test tests/maid-review-ai-synthesis.test.mjs`).
- Pass/Fail semantics: Exit code 0, 100% dos testes pontuais passando.
- Sem efeitos colaterais em banco de dados real de produção (uso de banco in-memory simulado e mocks de Z-API / Gemini).
- Zero dependência externa de rede nos testes unitários através do Two-Tier fallback determinístico.

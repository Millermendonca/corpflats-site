# Project: Envio Automático de Resumo Diário, Triagem por IA e Síntese de Avaliações para Camareiras

## Architecture
- **Review Hook & Ingestion**:
  - `artifacts/api-server/zapi-service.mjs` (espelhado em `scripts/zapi-service.mjs`): Hook listeners em `handleInboundNpsScoreOrComment` (linhas 16321, 16348, 16488) e `syncNpsCommentToReviews`. Preservação 100% intacta do fluxo de 2 etapas (`tpl_nps_satisfaction_check` e `tpl_nps_score_1..4`).
  - `artifacts/api-server/demo-server.mjs` (espelhado em `scripts/demo-server.mjs`): Hooks em `POST /api/ai/nps-response` e `POST /api/ai/import-review`.
- **Maid Attribution & Housekeeping Engine**:
  - `artifacts/api-server/maid-automation-service.mjs` (espelhado em `scripts/maid-automation-service.mjs`):
    - `resolveMaidCleaningForReservation(db, reservation)`: Identifica deterministicamente a camareira responsável pela última limpeza do quarto correspondente à reserva avaliada (verificando limpezas de preparação na data ou anterior ao check-in e stayovers durante a estadia).
- **AI Triage Engine (Sub-5 Feedback)**:
  - `triageSub5Review`: Arquitetura Two-Tier (Tier 1: Google Gemini JSON estruturado via `gemini-2.5-flash` com `thinkingBudget: 0`; Tier 2: Fallback determinístico por expressões regulares cobrindo 100% de precisão sem falhas quando offline).
  - Separação estrita: responsabilidades da camareira (lençol manchado/sujo, toalhas, amenities, louça/talher, box do banheiro, poeira/lixo) vs alheios (check-in, portaria, Wi-Fi/internet, ar-condicionado, barulho externo).
  - Notas 5: Elegíveis por definição sem necessidade de triagem. Notas < 5 sem comentário: retidas de envio para a camareira.
- **Mercado Livre Style Opinion Synthesis & Evolution Engine**:
  - Persistência em `db.maidOpinionSynthesis[maidId]`.
  - Agregação em tempo real: nota média acumulada, distribuição de notas, destaques positivos e termômetro de recorrência de itens críticos (Box e Banheiro; Louças, Pratos e Talheres; Enxoval de Cama e Banho; Piso e Superfícies).
  - Cálculo de evolução delta contra período anterior ($\Delta = \text{Média Atual} - \text{Média Anterior}$), determinando evolução (subiu 📈), estabilidade (➡️) ou regressão (pontos de atenção 📉).
  - Envio duplo em tempo real: Mensagem 1 (avaliação recebida) + Mensagem 2 (síntese atualizada com comparativo).
- **Scheduled Daily Summary & Retroactive November Dispatcher**:
  - Trigger diário em horário fixo em `DEFAULT_MAID_TRIGGERS` (`trigger_daily_review_summary`, padrão 18:00).
  - Mensagem consolidada contendo número do quarto, data da limpeza e nota recebida.
  - Rotina e endpoint `POST /api/maid-automation/dispatch-retroactive-reviews` para consolidação e despacho retroativo de Novembro/2026 com idempotência registrada em `dispatchedReviews`.
- **Frontend Settings**:
  - `artifacts/limpeza/src/pages/maid-whatsapp-automation.tsx`: Card de configuração do resumo diário de avaliações, seletor de horário fixo, botão de disparo retroativo de Novembro e visualização do histórico.
- **Twin-Server Parity**: Todo arquivo `.mjs` modificado em `artifacts/api-server/` deve manter paridade SHA-256 byte a byte com seu espelho em `scripts/`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | F1_MAID_ATTRIBUTION | Algoritmo determinístico de identificação da camareira da última limpeza correspondente à reserva avaliada | M1 | R1, Survey 1, Survey 2 |
| 2 | F2_REVIEW_FLOW_PRESERVATION | Preservação integral do fluxo de 2 etapas de coleta de notas e comentários (R2) | M1 | R2, Survey 1 |
| 3 | F3_AI_SUB5_TRIAGE | Motor Two-Tier de triagem por IA (Gemini JSON + Fallback) para notas < 5 separando limpeza vs alheios | M1 | R3, Survey 3 |
| 4 | F4_FORWARDING_RULES | Regras de elegibilidade (nota 5 sempre incluída; sub-5 sem comentário ou alheia descartada) | M1 | R3, Survey 2, Survey 3 |
| 5 | F5_OPINION_SYNTHESIS_DATA | Estrutura de agregação incremental de síntese de opiniões da camareira (`db.maidOpinionSynthesis`) | M2 | R5, Survey 3 |
| 6 | F6_EVOLUTION_COMPARATIVE | Cálculo do comparativo de evolução entre períodos (delta, tendência subiu/desceu, aspectos de melhoria) | M2 | R5, Survey 3 |
| 7 | F7_REALTIME_DUAL_MESSAGE | Disparo em tempo real via WhatsApp da avaliação + síntese atualizada Mercado Livre ao receber comentário | M2 | R5, Survey 1, Survey 3 |
| 8 | F8_DAILY_SUMMARY_CRON | Job agendado diário em horário fixo para consolidação e envio do resumo de avaliações | M3 | R1, Survey 2 |
| 9 | F9_DAILY_MESSAGE_FORMAT | Formatação da mensagem diária com número do quarto, data da limpeza e nota recebida | M3 | R1, Survey 2 |
| 10 | F10_RETROACTIVE_NOVEMBER | Rotina e endpoint de envio retroativo das avaliações elegíveis de Novembro/2026 com trava de idempotência | M3 | R4, Survey 2 |
| 11 | F11_FRONTEND_AUTOMATION_UI | Card na interface de automações das camareiras para ativação, horário e disparo retroativo | M3 | Survey 2 |
| 12 | F12_PUNCTUAL_TEST_SUITE | Suíte de testes pontual dedicada (`tests/maid-review-ai-synthesis.test.mjs`) validando R1 a R5 | M4 | Critérios de Aceite |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Atribuição de Limpeza & Motor de Triagem por IA | F1, F2, F3, F4 | none | PLANNED |
| M2 | Síntese de Opiniões Mercado Livre & Comparativo | F5, F6, F7 | M1 | PLANNED |
| M3 | Resumo Diário, Envio Retroativo Novembro & UI | F8, F9, F10, F11 | M2 | PLANNED |
| M4 | Verificação Integrada & Hardening de Cobertura | F12 | M1, M2, M3 | PLANNED |

## Interface Contracts

### M1: Atribuição de Camareira (`resolveMaidCleaningForReservation`)
- Localização: `artifacts/api-server/maid-automation-service.mjs`
- Assinatura: `resolveMaidCleaningForReservation(db, reservation: object): { maidUser: object | null, cleaningRequest: object | null, cleaningDate: string | null, isStayover: boolean }`
- Invariante: Localiza a limpeza concluída (`status: "clean"`) correspondente à reserva avaliada, priorizando stayover executado durante a estadia ou a limpeza de preparação na data ou anterior ao check-in.

### M1: Triagem de Feedback por IA (`triageSub5Review`)
- Localização: `artifacts/api-server/maid-automation-service.mjs` (ou módulo dedicado de triagem)
- Assinatura: `triageSub5Review({ score: number, comment: string, flatNumber?: string, db?: object, aiClientMock?: Function }): Promise<FeedbackTriageResult>`
- Retorno garantido:
  ```typescript
  interface FeedbackTriageResult {
    isCleaningRelated: boolean;
    category: "maid_cleaning" | "non_maid_infrastructure" | "non_maid_checkin_service" | "non_maid_external_noise" | "mixed";
    primaryResponsibility: "camareira" | "hotel_gestao" | "manutencao" | "recepcao_portaria" | "externo";
    forwardToMaid: boolean;
    cleaningAspects: string[];
    nonCleaningAspects: string[];
    explanation: string;
    triageMethod: "gemini_llm" | "deterministic_fallback";
  }
  ```
- Invariante: `score === 5` retorna `forwardToMaid: true` imediatamente. Comentários contendo aspectos de limpeza retornam `forwardToMaid: true`. Comentários puramente sobre Wi-Fi, portaria, check-in, etc. retornam `forwardToMaid: false`.

### M2: Síntese de Opiniões & Comparativo (`updateMaidOpinionSynthesis`)
- Localização: `artifacts/api-server/maid-automation-service.mjs`
- Assinatura: `updateMaidOpinionSynthesis(db, { maidId: number, review: object, triageResult?: object }): MaidOpinionSynthesis`
- Retorno garantido: Objeto com `avgScore`, contagem de itens (box, louças/utensílios, enxoval, piso), comparativo de evolução com o período anterior (`delta`, `trend: "evolucao" | "estabilidade" | "regressao"`).

### M2: Disparo em Tempo Real (`dispatchRealtimeMaidReviewAlerts`)
- Assinatura: `dispatchRealtimeMaidReviewAlerts(db, { review, maidUser, cleaningDate, triageResult }): Promise<{ success: boolean, messagesSent: number }>`
- Envia Mensagem 1 (avaliação recebida com quarto, data da limpeza, nota e comentário) e Mensagem 2 (síntese atualizada Mercado Livre com comparativo).

### M3: Resumo Diário Consolidado (`dispatchDailyReviewsSummary`)
- Assinatura: `dispatchDailyReviewsSummary(db, { targetDate?: string, force?: boolean }): Promise<{ maidsNotified: number, totalReviewsSent: number }>`
- Envia para cada camareira a mensagem diária contendo quarto, data da limpeza e nota recebida apenas das avaliações elegíveis do período.

### M3: Disparo Retroativo de Novembro (`dispatchNovemberRetroactiveReviews`)
- Assinatura: `dispatchNovemberRetroactiveReviews(db): Promise<{ maidsNotified: number, totalReviewsSent: number, summaryByMaid: Record<string, number> }>`
- Consolidada histórico de Novembro/2026, marca avaliações como `dispatchedToMaidAt` para evitar duplicidade.

## Code Layout
- Backend:
  - `artifacts/api-server/maid-automation-service.mjs`
  - `artifacts/api-server/zapi-service.mjs`
  - `artifacts/api-server/demo-server.mjs`
  - Espelhos idênticos (paridade SHA-256):
    - `scripts/maid-automation-service.mjs`
    - `scripts/zapi-service.mjs`
    - `scripts/demo-server.mjs`
- Frontend:
  - `artifacts/limpeza/src/pages/maid-whatsapp-automation.tsx`
- Testes Pontuais (estritamente pontual conforme AGENTS.md):
  - `tests/maid-review-ai-synthesis.test.mjs`

## 2026-11-10T03:24:48Z

Você é o Revisor de Contratos e Preservação de Fluxo do Milestone 3 (reviewer_m3_2).
Sua missão é verificar de forma adversarial se o fluxo existente de avaliações (R2) foi integralmente preservado, se as regras de triagem (R3) e envio diário (R1) e retroativo (R4) e síntese de opiniões (R5) estão cumpridas e robustas.

LEITURA OBRIGATÓRIA:
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3_1\handoff.md
- tests/maid-review-ai-synthesis.test.mjs

VERIFICAÇÕES OBRIGATÓRIAS:
1. Examine se os hooks em `zapi-service.mjs` e `demo-server.mjs` continuam íntegros sem nenhuma alteração que quebre o fluxo de 2 etapas do hóspede (`tpl_nps_satisfaction_check` e `tpl_nps_score_1..4`).
2. Verifique se a trava de idempotência de envio retroativo (`dispatchedToMaidAt`) impede duplicidade no envio para as camareiras.
3. Execute o teste pontual ESTRITAMENTE: `node --test tests/maid-review-ai-synthesis.test.mjs`. NUNCA execute testes globais.
4. Emita seu veredito em .agents/teamwork/reviewer_m3_2/handoff.md (APPROVE ou REQUEST_CHANGES) e envie mensagem ao orquestrador.

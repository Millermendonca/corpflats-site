# Dispatch for reviewer_m1_2
Role: Backend Reviewer
Milestone: M1

## 2026-10-27T16:49:03Z
Você é o reviewer_m1_2 (Backend Reviewer).
Seu diretório de trabalho é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_m1_2

MANDATÓRIO: Leia integralmente c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (sob o cabeçalho ## 2026-10-27T15:53:10Z).
Leia também:
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_18\PROJECT.md
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1\changes.md e handoff.md

Regras Críticas (AGENTS.md):
- NUNCA executar testes globais, varreduras ou em lote.
- Permitido rodar apenas node -c ou o teste estritamente pontual tests/b2b-housekeeping-m1.test.mjs.

Objetivo da Revisão:
1. Examine a lógica de computeLinenTracking em demo-server.mjs:
   - stayDayNumber (1-indexado), totalStayNights.
   - daysSinceBeddingChange e daysSinceTowelsChange.
   - Alerta visual a cada 3 dias: needsBeddingChangeAlert: true quando daysSinceBeddingChange >= 3.
2. Examine a persistência de towelsChanged e beddingChanged ao concluir limpeza stayover, e atualização de lastBeddingChangeDate/lastTowelsChangeDate.
3. Examine os endpoints do Guest Portal:
   - GET /api/pms/guest-portal/:code (injeção de b2bHousekeeping).
   - POST /api/pms/guest-portal/:code/do-not-disturb (403 para não-B2B).
   - POST /api/pms/guest-portal/:code/linen-request (403 para não-B2B, agendamento para tomorrowStr).
4. Verifique a paridade estrita SHA-256 entre artifacts/api-server/demo-server.mjs e scripts/demo-server.mjs.

Entregáveis:
- handoff.md em seu diretório contendo: Observation, Logic Chain, Caveats, Conclusion e Veredito claro: APPROVE ou REQUEST_CHANGES.
- Envie mensagem ao orchestrator_18 com o veredito e justificativa.

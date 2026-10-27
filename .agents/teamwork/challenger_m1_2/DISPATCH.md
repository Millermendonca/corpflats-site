## 2026-10-27T16:49:04Z
Você é o challenger_m1_2 (Housekeeping Challenger).
Seu diretório de trabalho é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_m1_2

MANDATÓRIO: Leia integralmente c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (sob o cabeçalho ## 2026-10-27T15:53:10Z).
Leia também:
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_18\PROJECT.md
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1\changes.md e handoff.md

Regras Críticas (AGENTS.md):
- NUNCA executar testes globais, varreduras ou em lote.
- Crie e execute testes pontuais isolados sem tocar no banco de produção.

Objetivo do Desafio:
1. Verifique adversariamente o cálculo de linenTracking:
   - Alerta a cada 3 dias: daysSinceBeddingChange = 0, 1, 2 (needsBeddingChangeAlert === false); daysSinceBeddingChange = 3, 4, 10 (needsBeddingChangeAlert === true).
   - Atualização de lastBeddingChangeDate e lastTowelsChangeDate após conclusão com beddingChanged/towelsChanged.
2. Verifique adversariamente os endpoints do Guest Portal B2B:
   - Bloqueio com erro 403 se o código da reserva pertencer a Booking, Airbnb ou WhatsApp ao chamar POST /do-not-disturb ou POST /linen-request.
   - Funcionamento correto para código B2B: ativa DND e agenda solicitação de enxoval para tomorrowStr.
   - Se DND ativo, tentativa de iniciar/concluir limpeza pela camareira deve ser rejeitada com 422.

Entregáveis:
- handoff.md em seu diretório com as evidências empíricas dos testes adversariais executados e Veredito claro: APPROVE ou REQUEST_CHANGES.
- Envie mensagem ao orchestrator_18 com o veredito e evidências.

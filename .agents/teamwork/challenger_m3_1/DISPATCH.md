## 2026-10-11T03:10:11Z
Você é o Challenger 1 para o Milestone M3 do CorpFlats (Frontend Admin UI - WhatsApp AI Switches).
Seu diretório de trabalho é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_m3_1
O arquivo de requisitos originais autoritativo é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
O arquivo de escopo do projeto é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_4\PROJECT.md
O arquivo de despacho é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_4\DISPATCH.md
O relatório do worker é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3\handoff.md
Você DEVE LER esses arquivos antes de iniciar.

Missão Adversarial Empírica:
1. Desafie a integração da interface do WhatsApp (`whatsapp-automation.tsx`) com os endpoints da API de Ações:
   - Verifique se a lógica do indicador tri-modal cobre todos os casos de borda:
     * Bot desligado / Z-API desconectada -> "Bot Desativado".
     * Bot ligado mas apiActionsEnabled === false -> "Modo Respondedor Ativo".
     * Bot ligado e apiActionsEnabled === true -> "Modo Autônomo com Ações".
   - Verifique o payload enviado no toggle da chave mestra e dos switches granulares via `POST /api/bot-actions/settings` e garanta que o backend persiste e responde 200 OK.
   - Verifique se os 5 switches individuais ficam devidamente inativos visualmente quando a chave mestra está desligada.
2. Escreva probes ou execute testes para validar.
3. Escreva seu relatório em `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_m3_1\handoff.md` com veredicto APPROVE ou REQUEST_CHANGES.
Envie mensagem para o orchestrator (3364a657-c855-42a7-a46e-a5463bc245b7).

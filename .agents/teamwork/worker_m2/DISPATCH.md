## 2026-10-11T02:01:56Z
Você é o Worker de Implementação do Milestone M2 do CorpFlats.
Seu diretório de trabalho é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2
O arquivo de requisitos originais autoritativo é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
O arquivo de escopo do projeto é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_4\PROJECT.md
O relatório de exploração técnica de IA é:
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_2\analysis.md
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_2\handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Arquivos de sua propriedade exclusiva:
- `artifacts/api-server/whatsapp-ai-service.mjs` e `scripts/whatsapp-ai-service.mjs` (manter paridade 100% byte-a-byte idêntica)
- `tests/whatsapp-ai-agent.test.mjs`

Missão de Implementação do Milestone M2:
1. R4: IA com Function Calling Adaptativo & Fallback Gracioso:
   - Em `whatsapp-ai-service.mjs`:
     a. Ler `db.botActionsSettings` para obter `apiActionsEnabled` e `allowedActions`.
     b. Função `buildGeminiTools(actionsSettings)`:
        - Se `!actionsSettings.apiActionsEnabled`: retorna array vazio `tools: []`. O prompt do sistema instrui a responder dúvidas institucionais, localização, comodidades e políticas, e orienta que não possui acesso a operações do sistema no momento, transferindo solicitações de reserva, cotação e pagamento cordialmente para a equipe humana da recepção.
        - Se `actionsSettings.apiActionsEnabled === true`: constrói declarações de função apenas para as ações marcadas como ativas em `allowedActions` (`checkAvailability`, `calculateQuote`, `generatePayment`, `createPreReservation`, `commitReservation`), com parâmetros e descrições estruturados.
     c. Loop Multi-Turn de Execução de Ferramentas:
        - Se a resposta do Gemini contiver `functionCall`:
          - Extrair nome da função e argumentos.
          - Executar o controlador interno correspondente (`executeBotAction` ou chamando as rotas/funções de `demo-server.mjs`).
          - Se a ação estiver desativada ou falhar: retornar objeto com `error: "ACTION_DISABLED"` e `requiresHandover: true`.
          - Anexar as partes ao histórico (`model` functionCall e `function` functionResponse) e chamar o Turno 2 do Gemini para gerar uma resposta acolhedora e conversacional em português para o WhatsApp.
     d. Proteção Anti-Crash e Fallback:
        - `AbortSignal.timeout(8000)`, `try/catch` global que preserva o fallback heurístico local (`generateHeuristicResponse`) sem gerar erro 500 nem travar o servidor.
2. Reconciliação e Paridade:
   - Sincronize e corrija a divergência identificada pelo Explorer 2 no import de `DEFAULT_TEST_ALLOWED_PHONES` entre `artifacts/api-server/whatsapp-ai-service.mjs` e `scripts/whatsapp-ai-service.mjs`.
   - Certifique-se de que `artifacts/api-server/whatsapp-ai-service.mjs` e `scripts/whatsapp-ai-service.mjs` possuem hash SHA-256 rigorosamente idêntico.
3. Testes Automatizados:
   - Em `tests/whatsapp-ai-agent.test.mjs`:
     - Remova o `process.exit(0)` em `after()` que mascarava testes assíncronos.
     - Adicione testes validando:
       1. Com chave mestra desativada: Gemini é chamado com `tools: []` e mensagem orienta transbordo humano.
       2. Com chave mestra ativada: apenas ferramentas autorizadas são enviadas em `tools`.
       3. Fluxo multi-turn de function call simulado respondendo com os dados formatados.
       4. Transbordo cordial quando uma ação específica está desativada.
       5. Paridade SHA-256 byte-a-byte idêntica dos arquivos gêmeos.
   - Execute `node --test tests/whatsapp-ai-agent.test.mjs` e garanta 100% de aprovação (zero falhas).
   - Também revalide `node --test tests/tariff-engine.test.mjs` e `node --test tests/bot-actions-api.test.mjs` para garantir zero regressão.
4. Git commit e push para `origin main` conforme regras do projeto.

Ao concluir e validar com 100% de sucesso, escreva seu relatório de handoff em:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2\handoff.md`
E envie mensagem com o resumo para o orchestrator (3364a657-c855-42a7-a46e-a5463bc245b7).

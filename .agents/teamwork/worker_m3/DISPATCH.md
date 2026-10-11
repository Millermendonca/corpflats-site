## 2026-10-11T03:00:05Z
Você é o Worker de Implementação do Milestone M3 do CorpFlats (Frontend Admin UI - R5).
Seu diretório de trabalho é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3
O arquivo de requisitos originais autoritativo é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
O arquivo de escopo do projeto é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_4\PROJECT.md
O arquivo de despacho é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_4\DISPATCH.md
Os relatórios detalhados dos 3 Explorers com todas as especificações e blueprints de código são:
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m3_1\handoff.md (WhatsApp AI Switches & Indicador Tri-modal)
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m3_2\handoff.md (Tarifas Multi-Canal, Matriz e Modal de Lote)
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m3_3\handoff.md (Tipos TypeScript, Hooks e Build)
Você DEVE LER esses arquivos antes de iniciar.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Arquivos de sua propriedade exclusiva:
- `artifacts/limpeza/src/pages/whatsapp-automation.tsx`
- `artifacts/limpeza/src/pages/tarifas.tsx`
- `artifacts/limpeza/dist/` (gerado pelo build)

Missão de Implementação:
1. Em `artifacts/limpeza/src/pages/whatsapp-automation.tsx`:
   - Na aba `<TabsContent value="ai_agent">`:
     a. Adicione o 4º card no banner superior com o Indicador Tri-modal de Status em tempo real ("Bot Desativado" / "Modo Respondedor Ativo" / "Modo Autônomo com Ações"), calculado a partir de `statusInfo.connected`, `aiConfig.enabled` e `botActionsSettings.apiActionsEnabled`.
     b. Adicione o Highlight Card da Chave Mestra Global (`apiActionsEnabled`) com switch destacado, feedback visual, salvamento instantâneo via `POST /api/bot-actions/settings` e banner explicativo.
     c. Adicione a Matriz Visual de Permissões Granulares com os 5 switches individuais (`checkAvailability`, `calculateQuote`, `generatePayment`, `createPreReservation`, `commitReservation`), com suspensão visual quando a chave mestra estiver desligada.
     d. Adicione a seção recolhível de Parâmetros Avançados para tempo de hold da pré-reserva (`preReservationHoldMinutes`) e mensagem padrão de transbordo (`handoverMessage`), com botão para salvar.
     e. Carregue as configurações via `GET /api/bot-actions/settings` no `useEffect` inicial.
2. Em `artifacts/limpeza/src/pages/tarifas.tsx`:
   - Reestruture a página em 2 abas (`Tabs`):
     a. Aba 1: "Mapa de Tarifas Diárias"
        - Toolbar superior: seletor de canal (Direto 0%, Booking +18%, Airbnb +15%), alternância de visualização Mensal/Semanal, navegação de mês com botões anterior/próximo, legenda visual (SEBRAE Auto vs Custom Override vs Fim de Semana +15%), e botão "Edição em Lote (Bulk)".
        - Matriz / Grade de flats x dias com primeira coluna fixa (Apartamento), linha 1 para "Geral (Todos os Flats)" e linhas subsequentes para flats individuais. Cada célula exibe o valor formatado da diária e badge se possuir override.
        - Clique na célula: abre modal de ajuste individual para editar o valor ou restaurar para o cálculo SEBRAE via `DELETE /api/tariffs/overrides/:id`.
        - Modal de Edição em Lote (Bulk Update): seleção de intervalo de datas (início e fim), dias da semana (todos, fds ou dias úteis), seleção de flats (todos ou específicos), seleção de canais (todos ou específicos), tipo de ajuste (valor fixo R$ ou percentual % com preview em tempo real), acionando `POST /api/tariffs/bulk-update`.
     b. Aba 2: "Parâmetros Base & Adicionais"
        - Card do Motor de Precificação: alternância entre `mode: "auto"` (SEBRAE) e `mode: "manual"`, diária base e acréscimo de fim de semana (%).
        - Preservação e sincronização com `siteConfig` (planos de diárias, taxa de limpeza, cama extra, camas twin, pet policy, desconto de reserva direta e PIX).
        - Botão de salvamento unificado sincronizando `POST /api/tariffs/settings` e `PUT /api/site-content`.
3. Verificação de Build e Testes:
   - Execute o build do frontend na pasta `artifacts/limpeza`:
     `npm --prefix artifacts/limpeza run build` (ou `npm run build` dentro de `artifacts/limpeza`). Certifique-se de que compila com saída 0 e gera os arquivos em `dist/public`.
   - Execute os testes de backend para garantir zero regressão:
     `node --test tests/tariff-engine.test.mjs`
     `node --test tests/bot-actions-api.test.mjs`
     `node --test tests/whatsapp-ai-agent.test.mjs`
4. Git Commit e Push:
   - Conforme as regras do repositório em `AGENTS.md`, faça o commit incluindo os arquivos alterados e `artifacts/limpeza/dist/`, e execute `git push origin main`.

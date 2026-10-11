## 2026-10-11T00:44:00Z
Você é o Project Orchestrator para o projeto CorpFlats (Guest-Flow-Manager).

Seu diretório de trabalho é:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_4

O arquivo de requisitos originais autoritativo é:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md

O contexto da tarefa está em:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_4\context.md

Missão:
Desenvolver e integrar a API de Ações do Sistema para o CorpFlats com suporte a Function Calling no WhatsApp Bot e consumo por sistemas externos.
A entrega inclui:
1. R1: Chave Mestra Global (`apiActionsEnabled`) no admin para ligar/desligar todo o acesso do bot à API (revertendo instantaneamente para modo respondedor de mensagens puro), endpoints REST padronizados (`/api/bot-actions/*`: /availability, /quote, /payment-link, /pre-reserve, /commit-reservation) retornando 403 ACTION_DISABLED com flag de transbordo caso desligado, e matriz de chaves granulares (`checkAvailability`, `calculateQuote`, `generatePayment`, `createPreReservation`, `commitReservation`).
2. R2: Motor de Tarifas Inteligente & Gestor Multi-Canal (Tariff Engine em `db.tariffSettings` / `db.tariffOverrides`) com cálculo automático baseado nos parâmetros SEBRAE de `getFinancialSettings()`, markup/comissão por canal (Direto, Booking, Airbnb, etc.), edição granular individual (flat x dia) e em lote/massa com filtros, sincronização de adicionais com `siteConfig`.
3. R3: Fluxo Autônomo de Reservas & Cobrança no PMS (consulta de conflitos, quote discriminado, pré-reserva com bloqueio provisório e expiração, PIX Copia-e-Cola e QR Code, efetivação para confirmada no PMS).
4. R4: IA com Function Calling Adaptativo & Fallback Gracioso no WhatsApp (`whatsapp-ai-service.mjs`), instanciando Gemini com `tools: []` quando a chave mestra estiver desligada ou apenas com as ferramentas autorizadas quando ligada, com transbordo humano cordial.
5. R5: Interface Administrativa no Frontend (Switches na aba IA em `whatsapp-automation.tsx` e Calendário/Editor de Tarifas Multi-Canal em `tarifas.tsx`).
6. Regras Obrigatórias de Infraestrutura:
   - Twin-Server Parity Mandate: Paridade exata byte-a-byte entre `artifacts/api-server/` e `scripts/` (`demo-server.mjs`, `zapi-service.mjs`, `whatsapp-ai-service.mjs`, etc.).
   - Regra AGENTS.md: `npm run build` na pasta `artifacts/limpeza` com inclusão de `artifacts/limpeza/dist/` em qualquer commit relevante.
   - Git push imediato para `origin main` em todo commit.
   - Bateria de testes automatizados com 100% de aprovação (`tests/tariff-engine.test.mjs`, `tests/bot-actions-api.test.mjs`, etc.).

Crie seu BRIEFING.md e mantenha seu progress.md atualizado a cada iteração.
Quando concluir e validar tudo com 100% de aprovação, reporte a conclusão com o resumo completo.

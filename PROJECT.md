# Project: Oferta de Domingo Sem Pressa (Saída Livre + Bônus Segunda)

## Architecture
O Guest-Flow-Manager é a plataforma de gestão de hotelaria e locação para CorpFlats.
- **Frontend**: Vite + React SPA em `artifacts/limpeza/` com roteamento Wouter. A aba `⚡ Régua Automática` em `artifacts/limpeza/src/pages/whatsapp-automation.tsx` fornece os controles operacionais e simulação em tempo real para o ciclo do hóspede.
- **Backend & Serviços**: Monolito Node.js Express com paridade estrita SHA-256 entre `artifacts/api-server/` e `scripts/`. O servidor principal `demo-server.mjs` gerencia o estado do PMS, reservas e webhooks de pagamento (Banco Inter).
- **Z-API WhatsApp Service**: `artifacts/api-server/zapi-service.mjs` gerencia a governança dos 7 canais independentes (incluindo o Canal #1 `guest_schedule`), filas de envio, templates de WhatsApp e o runner contínuo de background.
- **IA Sofia & Arquitetura de Agente**: `artifacts/api-server/agent-architecture.mjs`, `whatsapp-ai-service.mjs` e `src/agent/` implementam a inteligência conversacional autônoma da Sofia baseada em Tool Calling determinístico conforme a Constituição do AGENTS.md.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | UI do Painel Régua Automática | Card de controle em `whatsapp-automation.tsx` com master switch, input de `sundayUpsellPrice`, cálculo de diária de referência `valor_normal` e `{{economia}}`, vinculação ao Canal #1 (`guest_schedule`), live preview dos 2 balões e botão de disparo manual/teste. | M2 | R1 |
| 2 | Endpoints de Configuração e Disparo Manual | Rotas `GET /api/whatsapp/sunday-upsell/config`, `POST /api/whatsapp/sunday-upsell/config` e `POST /api/whatsapp/sunday-upsell/trigger` para gerenciamento do estado e execução sob demanda em validação. | M1 | R1, R2 |
| 3 | Gatilho Agendado aos Sábados 19h e Filtro de Elegibilidade | Verificação semanal automática às 19:00h de sábado no fuso de Brasília pelo runner de 60s em `zapi-service.mjs`, selecionando reservas ativas/hospedadas com check-out no domingo às 12:00h. | M1 | R2 |
| 4 | Motor de Disponibilidade e Fair-Share | Verificação de disponibilidade domingo-segunda: (1) flat vago; (2) flat com entrada no domingo remanejável via `selectFairShareFlat`; (3) bloqueio se o condomínio estiver 100% ocupado. | M1 | R2 |
| 5 | Hold Temporário de 30min e Expiração Silenciosa | Criação de bloqueio temporário via `pendingSundayUpsell` e `pendingModification` (`isSilentUpsellHold: true`) com cobrança PIX gerada. Expiração automática após 30min sem pagamento sem envio de WhatsApp e preservando a reserva original no domingo às 12h. | M1 | R3 |
| 6 | Confirmação Webhook PIX e Atualização Operacional | Interceptação do pagamento no webhook do Banco Inter em `demo-server.mjs`, extensão do check-out no PMS para segunda 12h, reagendamento da limpeza em `db.cleaningRequests` de domingo para segunda, remanejamento da reserva entrante para o flat alternativo e disparo da mensagem de confirmação do R4. | M1 | R4 |
| 7 | Disparo em 2 Balões no Canal #1 | Envio sequencial de 2 balões com delay de digitação (Balão 1: cópia comercial persuasiva com economia; Balão 2: exclusivamente o código PIX Copia e Cola) e registro do template `tpl_sunday_upsell`. | M1 | R5 |
| 8 | Sincronia Sofia AI e Tool Dedicada | Injeção de contexto `oferta_domingo_sem_pressa` em `tool-contract.ts` e `context-injector.ts`, diretrizes em `in-stay.prompt.ts`, e criação da tool `src/agent/tools/ofertar-domingo-sem-pressa.tool.ts` (AGENTS.md compliant) para simulação e reemissão com novo hold. | M1 | R5 |
| 9 | Integração, Build e Paridade Twin-Server | Compilação Vite em `artifacts/limpeza` (`npm run build`), sincronização SHA-256 de `artifacts/api-server/` para `scripts/`, teste pontual dedicado e versionamento via git commit & push. | M3 | Verification |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Backend Upsell Engine, Scheduler, Sofia Sync & Webhook | Features 2, 3, 4, 5, 6, 7, 8 (`zapi-service.mjs`, `demo-server.mjs`, `whatsapp-ai-service.mjs`, `agent-architecture.mjs`, `src/agent/tools/ofertar-domingo-sem-pressa.tool.ts`) | Survey completed | DONE |
| 2 | M2: Frontend UI na Régua Automática & Live Preview | Feature 1 (`artifacts/limpeza/src/pages/whatsapp-automation.tsx`) | M1 | DONE |
| 3 | M3: Integration, Twin Mirror Parity, Build & Targeted Verification | Feature 9 (Vite build, twin parity `scripts/check-twin-parity.mjs`, targeted unit tests, git commit & push) | M1, M2 | PLANNED |

## Interface Contracts

### Backend ↔ Frontend API Contract
- `GET /api/whatsapp/sunday-upsell/config`: Retorna `{ success: true, config: { enabled, sundayUpsellPrice, channelId, triggerTime, triggerDay, holdDurationMinutes }, lastRun }`.
- `POST /api/whatsapp/sunday-upsell/config`: Recebe `{ enabled, sundayUpsellPrice }` e persiste em `db.sundayUpsellConfig`.
- `POST /api/whatsapp/sunday-upsell/trigger`: Recebe `{ testMode: true }` e executa a rotina de avaliação de elegibilidade e disparo, retornando `{ success: true, totalEvaluated, eligibleCount, dispatchedCount, results: [...] }`.

### Scheduler & PMS ↔ Webhook PIX Contract
- Ao disparar a oferta, a reserva grava:
  - `pendingSundayUpsell`: `{ txid, pixCopiaECola, promotionalPrice, normalDailyRate, expiresAt, status: "pending_payment", isSilentUpsellHold: true, incomingReservationId, alternateFlatNumber }`
  - `pendingModification`: `{ status: "awaiting_payment", newCheckoutDate: mondayDate, expiresAt, isSilentUpsellHold: true }`
- Ao receber `POST /api/pms/inter/webhook` com correspondência em `pendingSundayUpsell.txid`:
  - `checkoutDate = pendingSundayUpsell.targetCheckoutDate` (segunda-feira).
  - `checkoutTime = "12:00"`.
  - `hasSundayUpsell = true`.
  - Reagendamento em `db.cleaningRequests`: card com `requestDate === sundayDate` passa a ter `requestDate = mondayDate`.
  - Caso `incomingReservationId` exista, a reserva entrante tem `flatId` e `flatNumber` atualizados para `alternateFlatNumber`.
  - Disparo de mensagem de confirmação: *"Pagamento confirmado! 🎉 Seu check-out livre de domingo (com direito a ficar até segunda às 12h se desejar) já está garantido no sistema. Aproveite seu descanso!"*.

### Sofia AI ↔ Tool `ofertar_domingo_sem_pressa`
- `ContextoSessaoInjetado`: `reserva_ativa.oferta_domingo_sem_pressa` injeta status, hold expirado, valores e bônus.
- Tool `ofertar_domingo_sem_pressa`:
  - `allowedStates: ['IN_STAY_CONCIERGE']`
  - `parametersSchema`: `{ confirmacao_hospede: boolean }`
  - `execute`: Retorna `AgentToolResponse` com `instrucao_para_ia`. Se `confirmacao_hospede === false`, simula e informa viabilidade e valor. Se `true`, gera novo PIX via `generatePixChargeForService`, grava novo hold de 30min (`isSilentUpsellHold: true`) e orienta a resposta da Sofia.

## Code Layout
- `artifacts/limpeza/src/pages/whatsapp-automation.tsx`: UI da Régua Automática, card de controle do upsell, live preview.
- `artifacts/api-server/zapi-service.mjs`: Scheduler de sábado às 19h, motor de elegibilidade e disparo em 2 balões pelo Canal #1, endpoints REST do upsell.
- `artifacts/api-server/demo-server.mjs`: Estado `db`, varredura de expiração silenciosa, webhook do Banco Inter para confirmação e extensão PMS/governança.
- `artifacts/api-server/agent-architecture.mjs` & `whatsapp-ai-service.mjs`: Context injection para Sofia e runtime de tool calling.
- `src/agent/types/tool-contract.ts`: Contrato de tipagem com `oferta_domingo_sem_pressa`.
- `src/agent/middleware/context-injector.ts`: Injeção de contexto de sessão da Sofia.
- `src/agent/prompts/in-stay.prompt.ts`: Prompt do concierge com reconhecimento da oferta.
- `src/agent/tools/ofertar-domingo-sem-pressa.tool.ts`: Tool oficial AGENTS.md compliant para a Sofia.
- `src/agent/tools/index.ts`: Registro da tool.
- `scripts/`: Espelho idêntico de runtime dos arquivos `.mjs` de `artifacts/api-server/`.
- `artifacts/limpeza/dist/`: Bundle compilado de produção.

# BRIEFING — 2026-10-21T18:42:30Z

## Mission
Mapear a arquitetura de backend, persistência, modelo de dados, fluxos de pagamento (PIX Inter / Cartão Mercado Pago), notificações (WhatsApp Z-API / E-mail SMTP) e uploads para o ecossistema de Frigobar (CorpFlats + Anserve).

## 🔒 My Identity
- Archetype: teamwork_preview_explorer
- Roles: explorer, investigator, analyst
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_1
- Original parent: d10c20e2-adfb-4695-835e-52dd3bebe9a9
- Milestone: Milestone 1 - Reconhecimento & Arquitetura de Backend/Persistência/Pagamentos Frigobar

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Diretrizes do projeto em AGENTS.md: sem testes em lote, sem execução desnecessária, sem envio real em testes
- Nunca modificar arquivos de código-fonte (.mjs, etc.) diretamente nesta fase

## Current Parent
- Conversation ID: d10c20e2-adfb-4695-835e-52dd3bebe9a9
- Updated: 2026-10-21T18:42:30Z

## Investigation State
- **Explored paths**:
  - `artifacts/api-server/demo-server.mjs` (linhas 1-1250, 6000-6300, 8100-8700, 21400-21800, 40700-42150)
  - `scripts/demo-server.mjs` (verificada paridade SHA-256)
  - `artifacts/api-server/inter-pix-service.mjs` (cash-out governança)
  - `artifacts/api-server/storage-service.mjs` (upload local e Cloudflare R2)
  - `artifacts/api-server/zapi-service.mjs` (sendZapiMessage, sendZapiDocument, governança de canais, appendMessageToConversation)
  - `artifacts/api-server/mail-service.mjs` (sendEmailAsync, nodemailer attachments)
  - `artifacts/api-server/whatsapp-ai-service.mjs` (querySystemData, buildGuestContext, Sofia)
  - `artifacts/limpeza/src/lib/permissions.ts` (RBAC, perfis, canonical modules)
  - `tests/auth-roles-permissions.test.mjs` e `tests/nfse-crm-whatsapp-flow.test.mjs` (padrões de testes pontuais isolados)
- **Key findings**:
  - `db` em memória hidratado via PostgreSQL (`system_store` chave `'db_state'`) e gravado com debounce (`localSaveTimeout` 300ms, `pgSaveTimeout` 800ms) por `saveDatabase(reason)`.
  - `pruneDatabase()` em `demo-server.mjs` (linha 8395) descarta arrays antigos para evitar OOM no Render. `minibarOrders` e `minibarInspections` precisam de limites saudáveis (ex.: 2500) para não perder histórico financeiro e fiscal.
  - Motores de pagamento existentes:
    - PIX: `createInterPixCob({ amount, description, debtorName, debtorDocument, reservationCode })` gera txid e Copia e Cola via mTLS Inter API (`/pix/v2/cob/${txid}`). Polling via `getCachedInterExtratoCompleto()`.
    - Cartão: `createMercadoPagoPreference({ reservationCode, amount, guestName, guestEmail, ... })` cria preferência via API do Mercado Pago e retorna `initPoint`. Webhook em `/api/pms/mercadopago/webhook` e polling via `checkMercadoPagoPaymentByRef(ref)`.
  - Envio de NF anexada:
    - `sendZapiDocument` já converte arquivos locais de `/api/storage/files/...` em Base64 e despacha via WhatsApp.
    - `sendEmailAsync` aceita `attachments: [{ filename, path }]` para envio via SMTP Zoho.
    - `/api/pms/guest-portal/:code` já existe e pode expor `minibarOrders` com o link direto da NF anexada.
  - Alerta da Sofia sobre divergência:
    - `sendZapiMessage` com `appendMessageToConversation` unifica a mensagem no WhatsApp Web da equipe.
    - `querySystemData` e `buildGuestContext` em `whatsapp-ai-service.mjs` aceitam facilmente o módulo `minibar` para Sofia orientar hóspedes e enviar o link `/minha-reserva/:code/frigobar`.
  - Armadilhas mapeadas: Paridade SHA-256 obrigatória entre arquivos gêmeos, nunca somar frigobar à fatura da hospedagem, controle de cortesia 1x por estadia, segurança do QR Code via validação dos 4 dígitos do celular.
- **Unexplored areas**: Nenhuma no escopo desta missão; pronta para elaboração do relatório estruturado `analysis.md` e `handoff.md`.

## Key Decisions Made
- Estruturar a modelagem de dados de forma nativa e aderente às demais entidades de `db` (`minibarProducts`, `minibarDefaultStock`, `minibarOrders`, `minibarInspections`, `minibarSettings`).
- Mapear a reutilização direta e isolada dos motores de PIX Inter e Cartão Mercado Pago sem acoplamento à reserva de hospedagem.
- Documentar em detalhes os contratos de rotas REST, payloads de request/response e tratamento de anexos.

## Artifact Index
- DISPATCH.md — Registro do chamado inicial
- progress.md — Heartbeat de execução
- BRIEFING.md — Memória de trabalho do agente
- analysis.md — [Em elaboração] Relatório completo e estruturado de backend, persistência e pagamentos
- handoff.md — [Em elaboração] Sumário executivo e protocolo de handoff de 5 seções

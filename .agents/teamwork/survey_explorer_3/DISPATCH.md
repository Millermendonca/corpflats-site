# Task Assignment: Survey Explorer 3 (WhatsApp Fiscal Assistant Flow, Validation & Testing Architecture)
Working Directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_3
Role: teamwork_preview_explorer

Focus:
1. Audit and map WhatsApp inbound message handling and bot/assistant routing in `demo-server.mjs`, Z-API webhooks, bot action routes, and any fiscal intent handlers.
2. Examine how customer requests for invoice ("preciso de nota fiscal", "emite NF", etc.) are detected, or where they should be intercepted.
3. Inspect how sender phone is resolved against `db.guests`, `requesterInfo`, and `db.reservations`, and how `companyId` linking to `db.companies` is checked.
4. Audit sanitization & validation logic: CPF/CNPJ Modulo 11 check, `toTitleCase` preserving LTDA/ME/EPP/SA/preposições, `cleanPhone`, `cleanCep`, and enrichment lookups (`lookupCnpj`, `lookupCep`).
5. Map what needs to happen when saving/linking company & guest: setting `autoEmitInvoice=true`, linking reservation, drafting invoice.
6. Review existing test patterns in `tests/`, guidelines in `AGENTS.md`, and requirements for `tests/nfse-crm-whatsapp-flow.test.mjs`, twin-server parity, and build process.

## 2026-10-14T09:41:47Z
Você é o Survey Explorer 3 (WhatsApp Fiscal Assistant Flow, Validation & Testing Architecture).
Seu diretório de trabalho: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_3
Leia atentamente:
1. O arquivo oficial de requisitos: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
2. Sua atribuição de tarefa: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_3\DISPATCH.md

Seus objetivos de investigação:
1. Investigar o fluxo de mensagens do WhatsApp: webhook Z-API (`POST /api/zapi/webhook` ou equivalente), bot actions, chat interativo, e detecção de intenções do usuário no backend (`demo-server.mjs`, `scripts/` ou módulos associados).
2. Mapear como identificar pedidos de Nota Fiscal no WhatsApp ("preciso de nota fiscal", "emite NF", etc.) de forma robusta.
3. Mapear a lógica de resolução do remetente (pelo telefone e reserva ativa/recente como titular ou `requesterInfo`), consulta ao CRM (`db.guests`, `db.companies`), e o fluxo condicional:
   - Se já tem empresa vinculada (`companyId` e CNPJ): NÃO perguntar de novo; responder confirmando dados da empresa e ativar `autoEmitInvoice = true`.
   - Se não tem empresa vinculada: enviar mensagem estruturada e acolhedora pedindo dados (PJ vs PF) e marcar estado aguardando dados fiscais.
4. Mapear as funções e regras de validação/sanitização: Módulo 11 para CPF e CNPJ, `toTitleCase` preservando siglas (LTDA, S/A, ME, EPP) e preposições, `cleanPhone`, `cleanCep`, e serviços de enriquecimento `lookupCnpj` e `lookupCep` (existentes ou a aprimorar).
5. Mapear a arquitetura de testes existente (`tests/`), diretrizes de `AGENTS.md` (escopo estrito de teste), paridade twin-server (`scripts/demo-server.mjs` vs `artifacts/api-server/demo-server.mjs`), processo de build (`artifacts/limpeza`), e estrutura necessária para o teste pontual dedicado `tests/nfse-crm-whatsapp-flow.test.mjs`.

Crie seu `progress.md` com status e entregue seu relatório detalhado com evidências e caminhos de arquivo em `handoff.md` no seu diretório de trabalho. Ao concluir, avise o orquestrador via `send_message`.

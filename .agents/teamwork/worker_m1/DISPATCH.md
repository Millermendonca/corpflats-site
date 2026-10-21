## 2026-10-21T18:49:37Z
Você é o subagente worker_m1 (teamwork_preview_worker).
Seu diretório de trabalho exclusivo é:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1

O diretório raiz do projeto é:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager

Seu parent é o Project Orchestrator (conversation ID: d10c20e2-adfb-4695-835e-52dd3bebe9a9).

Leia atentamente os seguintes arquivos antes de começar:
1. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (seção 2026-10-21T18:26:13Z)
2. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md
3. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_16\PROJECT.md (Milestone M1 e Features F01 a F10)
4. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_1\analysis.md
5. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_1\handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Missão do Worker M1:
Implementar o Marco M1 (Backend Core, Dados & APIs de Frigobar — Features F01 a F10):
1. **Coleções e Persistência (F01)**:
   - Adicionar em `db`: `minibarProducts`, `minibarDefaultStock`, `minibarOrders`, `minibarInspections`, `minibarSettings`.
   - Inicializar com dados padrão essenciais (produtos padrão como água sem gás R$ 6.00, refrigerantes, cervejas, cortesia de 2 cápsulas Nespresso + amendoim/balas gratuitos uma vez por estadia com opções avulsas pagas, e gabarito padrão nominal por flat).
   - Proteger em `pruneDatabase` para garantir retenção mínima de 730 dias de registros fiscais/financeiros de `minibarOrders`.
   - Garantir hidratação e salvamento correto em `loadDatabase()` e `saveDatabase()`.
2. **APIs de Catálogo e Gabarito (F02)**:
   - `GET /api/minibar/products`, `POST /api/minibar/products`, `PATCH /api/minibar/products/:id`, `DELETE /api/minibar/products/:id`.
   - `GET /api/minibar/default-stock`, `PUT /api/minibar/default-stock`.
3. **APIs de Contexto Mobile do Hóspede (F03, F04)**:
   - `POST /api/minibar/flat-context`: recebe `{ flatNumber, last4Digits }`, valida contra a reserva ativa/recente daquele flat (checando os 4 últimos dígitos do `guestPhone`), retornando saudação calorosa com o primeiro nome do hóspede, catálogo de produtos, gabarito padrão do flat e eventuais itens já pagos na mesma reserva.
   - `GET /api/minibar/reservation-context/:code`: valida a reserva pelo código e retorna o mesmo contexto sem exigir redigitação dos 4 dígitos.
4. **Checkout e Pagamentos Desacoplados (F05, F06, F07)**:
   - `POST /api/minibar/orders`: cria pedido de frigobar com itens selecionados, preferências fiscais (discriminado, água, consumo frigobar), documento (CPF ou CNPJ) e e-mail.
   - Integração PIX Banco Inter: reaproveita `createInterPixCob` gerando QR Code / Copia e Cola. O frigobar NUNCA altera o valor da hospedagem (`r.totalAmount` permanece inalterado).
   - Integração Cartão Mercado Pago: reaproveita `createMercadoPagoPreference` gerando preferência com Checkout Pro.
   - `GET /api/minibar/orders/:id/status`: consulta ativa e polling de liquidação.
5. **Upload de Nota Fiscal e Disparo Multicanal (F08)**:
   - `POST /api/minibar/orders/:id/invoice`: anexa o arquivo (PDF ou imagem Base64/upload) ao pedido e aciona o envio imediato via Z-API WhatsApp (`sendZapiDocument` com Base64) e E-mail (`sendEmailAsync` com attachments), além de expor a NF no portal do hóspede (`/api/pms/guest-portal/:code`).
6. **Inspeção, Divergência Anserve e Alerta da Sofia (F09)**:
   - `POST /api/minibar/inspections`: registra vistoria física da repositora (conforme ou divergência com itens faltantes e fotos) e reposição física (pagos + cortesias).
   - Se houver divergência não declarada, gera cobrança pendente e dispara mensagem automática da Sofia no WhatsApp com itens e link `/minha-reserva/:code/frigobar?ord=...`.
   - `GET /api/minibar/inspections/flats-status`: visão geral dos flats para a repositora.
   - `GET /api/minibar/invoices/pending`: fila de pedidos pagos para emissão de NF pela supervisão.
7. **Extrato de Repasse Financeiro (F10)**:
   - `GET /api/minibar/settlement`: consolida total vendido, desconta taxas de cartão e compensa custo de reposição de cortesias gratuitas.
8. **Paridade SHA-256 Obrigatória**:
   - Espelhar 100% de qualquer alteração em `artifacts/api-server/demo-server.mjs` para `scripts/demo-server.mjs` e garantir que o hash SHA-256 seja idêntico byte-a-byte.
9. **Teste Pontual Isolado**:
   - Criar `tests/minibar-backend-flow.test.mjs` cobrindo o ciclo de APIs com `NODE_ENV="test"`, cópia de banco em `os.tmpdir()`, sem `DATABASE_URL`, e sem envio de mensagens reais a hóspedes de produção.
   - Executar EXCLUSIVAMENTE: `node --test tests/minibar-backend-flow.test.mjs`.
   - NUNCA executar `tests/*.test.mjs` ou varreduras em lote (regra estrita do AGENTS.md).

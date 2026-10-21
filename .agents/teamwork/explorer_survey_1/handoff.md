# Handoff Report — Explorer Survey 1 (Backend, Persistência e Pagamentos do Frigobar)

**Data**: 2026-10-21  
**Agente**: `explorer_survey_1` (teamwork_preview_explorer)  
**Destinatário**: Project Orchestrator (`d10c20e2-adfb-4695-835e-52dd3bebe9a9`)  
**Tipo**: Hard Handoff (Investigação completa)

---

## 1. Observation

1. **Persistência de Estado e Carregamento**:
   - `artifacts/api-server/demo-server.mjs`:
     - Linhas 1147–1218: Inicialização do objeto singleton `let db = { ... }`.
     - Linhas 6013–6040: `loadDatabase()` lê `data/database.json` via `fs.promises.readFile(DB_FILE, "utf-8")` e faz `Object.assign(db, loaded)`.
     - Linhas 6041–6135: Criação das tabelas PostgreSQL (`system_store`, `system_store_backups`, `media_blobs`, `reservation_communications`, `system_audit_logs`) e leitura de `SELECT value FROM system_store WHERE key = 'db_state'`.
     - Linhas 8395–8456: Função `pruneDatabase()` que impõe limites máximos para coleções voláteis a fim de evitar OOM no contêiner de 2GB do Render.
     - Linhas 8655–8714: `saveDatabase(reason)` executa invalidação de caches (`invalidateGuestCache()`, `invalidateFlatsCache()`), chama `pruneDatabase()` e grava em disco local com debounce de 300ms e no PostgreSQL com debounce de 800ms.
2. **Motores de Pagamento Existentes**:
   - **PIX Banco Inter**:
     - `artifacts/api-server/demo-server.mjs`: Linha 40764 `getInterAccessToken()` (autenticação mTLS via certificados `certs/inter.crt` e `certs/inter.key` e token OAuth2 com escopo `cob.read cob.write pix.read pix.write extrato.read`).
     - Linha 40816: `createInterPixCob({ amount, description, debtorName, debtorDocument, reservationCode })` executa chamada PUT em `https://cdpj.partners.bancointer.com.br/pix/v2/cob/${txid}`, retornando `{ txid, pixCopiaECola, ... }`.
     - Linhas 41109–41259: Consulta ativa no extrato bancário completo `/banking/v2/extrato/completo` (`getCachedInterExtratoCompleto()`), realizando conciliação por `txId` ou por `valor + documento/nome do pagador`.
     - Linha 40927: `POST /api/pms/inter/webhook` recebe notificações instantâneas.
   - **Cartão de Crédito Mercado Pago**:
     - `artifacts/api-server/demo-server.mjs`: Linha 41949 `createMercadoPagoPreference({ reservationCode, amount, guestName, guestEmail, nights, flatNumber })` chama `https://api.mercadopago.com/checkout/preferences` e retorna `{ id, initPoint, sandboxInitPoint }`.
     - Linha 41073: `checkMercadoPagoPaymentByRef(externalRef)` consulta `/v1/payments/search?external_reference=${externalRef}`.
     - Linha 42072: `POST /api/pms/mercadopago/webhook` recebe notificações de pagamentos aprovados.
3. **Serviços de Mensageria e Envio de Anexos**:
   - `artifacts/api-server/zapi-service.mjs`:
     - Linha 3436: `sendZapiDocument(config, { phone, document, fileName, caption, ... })`. As linhas 3515–3525 demonstram que se `document` for um caminho em `/api/storage/files/...`, ele lê fisicamente de `artifacts/api-server/uploads`, converte em Base64 e dispara via API Z-API `/send-document/${extension}`.
     - Linha 5582: `appendMessageToConversation(db, { phone, text, type, mediaUrl, fileName, caption, ... })` grava a mensagem diretamente no chat unificado do CRM/Recepção.
   - `artifacts/api-server/mail-service.mjs`:
     - Linha 1255: `sendEmailAsync({ db, saveDatabase, reservationId, recipient, subject, bodyHtml, attachments })` aceita `attachments: [{ filename, path }]` e envia via Nodemailer / Zoho SMTP, gravando auditoria em `reservation_communications`.
   - `artifacts/api-server/storage-service.mjs`:
     - Linha 96: `uploadImageToStorage(base64Data, filenamePrefix, db, folder)` suporta upload direto com SigV4 no Cloudflare R2 e fallback permanente em `/api/storage/files/...` ou data URLs.
   - `artifacts/api-server/whatsapp-ai-service.mjs`:
     - Linha 909: `querySystemData(db, { module, query, filters, ... })` possui arquitetura modular em switch-case.
     - Linha 601: `buildGuestContext(db, phone, now)` centraliza o contexto da conversa da IA Sofia.
4. **Controle de Acesso e Módulos Canônicos**:
   - `artifacts/limpeza/src/lib/permissions.ts` (linhas 108–160) e `artifacts/api-server/demo-server.mjs` (linhas 755–850) sincronizam `DEV_ONLY_MODULES`, `ALL_CANONICAL_MODULES` e `getDefaultModulesForRole(role)`.
5. **Paridade Twin-Server e Testes**:
   - PowerShell verificou paridade SHA-256 idêntica entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`.
   - `tests/nfse-crm-whatsapp-flow.test.mjs` e `tests/auth-roles-permissions.test.mjs` comprovam o padrão de teste pontual obrigatório: porta dinâmica (`getAvailablePort()`), `NODE_ENV = "test"`, `DATABASE_URL` deletada, cópia de banco em `os.tmpdir()` e asserção de que `data/database.json` original não foi modificado.

---

## 2. Logic Chain

1. A partir das observações do ciclo de vida de `db` (Obs 1), constata-se que a inclusão das coleções `minibarProducts`, `minibarDefaultStock`, `minibarOrders`, `minibarInspections` e `minibarSettings` em `db` garante a persistência nativa tanto em arquivo local (`data/database.json`) quanto no PostgreSQL (`system_store`), sem necessidade de criar tabelas relacionais adicionais.
2. Como `pruneDatabase()` (Obs 1) remove itens de coleções que excedem seus limites, os dados de `minibarOrders` e `minibarInspections` devem receber blindagem explícita com retenção mínima de 730 dias para evitar a exclusão de comprovantes fiscais e transações financeiras.
3. Observando os motores de pagamento existentes (Obs 2), verificou-se que `createInterPixCob` e `createMercadoPagoPreference` operam de forma agnóstica a parâmetros de hospedagem quando alimentados com descrições e identificadores próprios. Portanto, os novos endpoints `/api/minibar/orders` podem reutilizar diretamente essas funções, associando `reservationCode: "MB-" + order.id`, garantindo que o frigobar seja liquidado de forma 100% autônoma, sem alterar o valor da hospedagem (`r.totalAmount`).
4. Observando os serviços de envio de documentos e e-mails (Obs 3), conclui-se que o upload de Nota Fiscal em `POST /api/minibar/orders/:id/invoice` pode gravar o arquivo em `uploads/invoices/` ou Cloudflare R2 e acionar imediatamente `sendZapiDocument` (com Base64 e sincronização via `appendMessageToConversation`) e `sendEmailAsync` (com `attachments`), além de expor o arquivo no retorno de `/api/pms/guest-portal/:code`.
5. Da mesma forma, quando a repositora registrar divergência em `POST /api/minibar/inspections`, o backend pode criar a ordem pendente e chamar `sendZapiMessage` com o texto formatado da IA Sofia e link `/minha-reserva/:code/frigobar?ord=...`.
6. Observando o RBAC e permissões (Obs 4), a criação dos perfis `anserve_repositora` e `anserve_gestor` com acesso a link rápido por PIN (`/frigobar-reposicao?pin=...`) resolve a exigência de operação mobile rápida sem atrito de login complexo.
7. Observando a regra do AGENTS.md e os testes de referência (Obs 5), conclui-se que qualquer validação automatizada deve ser escrita em um arquivo pontual isolado (`tests/minibar-backend-flow.test.mjs`), sem varreduras globais e sem chamadas de rede externas reais.

---

## 3. Caveats

1. **Credenciais em Produção**: O ambiente local opera com certificados ou credenciais simuladas de Banco Inter e Mercado Pago caso as chaves reais de produção não estejam presentes nas variáveis de ambiente do desenvolvedor. A implementação deve manter os fallbacks simulados resilientes já existentes no código.
2. **Cloudflare R2 vs Armazenamento Local**: Se as credenciais do Cloudflare R2 não estiverem ativas, o sistema grava automaticamente os uploads na pasta local `artifacts/api-server/uploads/invoices/` servida estaticamente em `/api/storage/files/invoices/`, o que é 100% funcional e compatível com `sendZapiDocument`.
3. **Escopo de Leitura Estrita**: Por se tratar de uma missão de Explorer (investigação), nenhum arquivo de código-fonte foi alterado nesta etapa.

---

## 4. Conclusion

A arquitetura do backend do Guest-Flow-Manager está plenamente apta e preparada para receber o ecossistema completo de Frigobar:
1. **Modelo de Dados**: 5 coleções limpas (`minibarProducts`, `minibarDefaultStock`, `minibarOrders`, `minibarInspections`, `minibarSettings`), integradas a `loadDatabase`, `saveDatabase` e `pruneDatabase` blindado.
2. **Pagamentos**: Reutilização direta do Banco Inter (mTLS + PUT cob + Webhook + Extrato) e Mercado Pago (Checkout Pro + Webhook + Busca Ativa), totalmente desacoplados da conta da hospedagem.
3. **Mensageria e Documentos**: Fluxo imediato e automatizado de envio de NF (WhatsApp Z-API + E-mail SMTP Zoho + Portal do Hóspede) e cobrança automática pela Sofia ao detectar divergências.
4. **Governança de Código**: O plano de implementação preserva a paridade SHA-256 e segue estritamente as regras de isolamento e não-varredura de testes do `AGENTS.md`.

O relatório técnico detalhado e especificação dos contratos de API encontra-se em `.agents/teamwork/explorer_survey_1/analysis.md`.

---

## 5. Verification Method

Para verificar independentemente todas as constatações deste relatório:

1. **Verificação de Paridade Twin-Server**:
   ```powershell
   (Get-FileHash 'artifacts/api-server/demo-server.mjs').Hash -eq (Get-FileHash 'scripts/demo-server.mjs').Hash
   ```
   *Condição de sucesso*: Retorna `True`.
2. **Inspeção dos Motores de Pagamento**:
   - Inspecionar linhas 40764–40920 de `artifacts/api-server/demo-server.mjs` para validar `createInterPixCob` e `getInterAccessToken`.
   - Inspecionar linhas 41949–42120 de `artifacts/api-server/demo-server.mjs` para validar `createMercadoPagoPreference` e webhook do Mercado Pago.
3. **Inspeção de Envio de Documentos e E-mails**:
   - Inspecionar linhas 3436–3560 de `artifacts/api-server/zapi-service.mjs` para conferir a leitura e envio de arquivos locais em `sendZapiDocument`.
   - Inspecionar linhas 1255–1310 de `artifacts/api-server/mail-service.mjs` para conferir `sendEmailAsync` com suporte a `attachments`.
4. **Inspeção da IA Sofia**:
   - Inspecionar linhas 601–796 e 909–1250 de `artifacts/api-server/whatsapp-ai-service.mjs` para conferir `buildGuestContext` e `querySystemData`.
5. **Critério de Invalidação**:
   - Se for constatada a necessidade de misturar a cobrança do frigobar com as diárias da reserva, ou se `sendZapiDocument` não suportar envio de arquivos locais, este diagnóstico precisará de revisão. Ambas as hipóteses foram refutadas pelas evidências diretas do código.

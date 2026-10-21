# Relatório de Análise Técnica: Backend, Persistência e Pagamentos do Ecossistema de Frigobar (CorpFlats + Anserve)

**Data da Investigação**: 2026-10-21  
**Autor**: Explorer Survey 1 (`explorer_survey_1`)  
**Escopo**: `artifacts/api-server/demo-server.mjs`, `scripts/demo-server.mjs`, motores de pagamento (Inter PIX / Mercado Pago), mensageria (Z-API WhatsApp / SMTP Zoho), Sofia IA e CRM 360°.

---

## 1. Sumário Executivo

A implementação do ecossistema de Frigobar para o CorpFlats (19 flats no Edifício Soho Residence, Campos dos Goytacazes/RJ) em parceria com a empresa operadora Anserve exige uma arquitetura de backend robusta, desacoplada e 100% aderente aos padrões já consagrados no Guest-Flow-Manager.

### Principais Descobertas e Diretrizes da Arquitetura:
1. **Persistência Centralizada e Debounced**: O estado do sistema reside no objeto em memória `db`, hidratado na inicialização a partir do disco (`data/database.json`) e sincronizado de forma resiliente com PostgreSQL na nuvem (`system_store`, chave `'db_state'`). O salvamento é orquestrado por `saveDatabase(reason)`, que utiliza debouncing (300ms local, 800ms nuvem) e executa rotinas de integridade e poda (`pruneDatabase`). As novas coleções de frigobar (`minibarProducts`, `minibarDefaultStock`, `minibarOrders`, `minibarInspections`, `minibarSettings`) devem ser integradas a esse ciclo de vida com blindagem explícita contra podas acidentais de registros financeiros.
2. **Reutilização dos Motores de Pagamento Existentes**:
   - **PIX Banco Inter**: O sistema já possui infraestrutura completa com autenticação mTLS via certificados (`certs/inter.crt` e `certs/inter.key`), cache de token OAuth2 (`getInterAccessToken()`) com escopo `cob.write pix.write extrato.read`, criação de cobrança imediata com QR Code / Copia e Cola (`createInterPixCob`) via PUT `/pix/v2/cob/${txid}`, webhook de conciliação instantânea e consulta ativa resiliente no extrato bancário completo (`/banking/v2/extrato/completo`).
   - **Cartão de Crédito Mercado Pago**: Já integrado via Checkout Pro (`createMercadoPagoPreference`), webhook oficial (`/api/pms/mercadopago/webhook`) e consulta ativa por referência externa (`checkMercadoPagoPaymentByRef`).
   - **Regra de Ouro Operacional**: O consumo de frigobar **nunca pode ser faturado junto com o valor da hospedagem**. Os novos endpoints `/api/minibar/orders` gerarão transações financeiras e cobranças autônomas, mantendo a integridade fiscal da locação de temporada e do frigobar.
3. **Disparo Imediato de Notificações e Anexos**:
   - **WhatsApp (Z-API)**: O método `sendZapiDocument` (linha 3436 de `zapi-service.mjs`) possui capacidade nativa de ler arquivos locais de `/api/storage/files/...`, codificá-los em Base64 e enviá-los como documentos ou imagens com legenda diretamente para o WhatsApp do hóspede, integrando ao histórico da conversa (`appendMessageToConversation`).
   - **E-mail (SMTP Zoho)**: O método `sendEmailAsync` (linha 1255 de `mail-service.mjs`) aceita o array `attachments: [{ filename, path }]`, gravando o log na tabela `reservation_communications` do PostgreSQL.
   - **Portal do Hóspede**: O endpoint `/api/pms/guest-portal/:code` (linha 21420 de `demo-server.mjs`) pode expor imediatamente a lista de pedidos de frigobar e o link de download da Nota Fiscal anexada pela Anserve.
   - **IA Sofia**: A função `querySystemData` e o construtor `buildGuestContext` em `whatsapp-ai-service.mjs` devem ser estendidos com o módulo `minibar`, permitindo que a Sofia informe os itens consumidos, envie o link direto de pagamento (`/minha-reserva/:code/frigobar`) e notifique o hóspede caso a repositora aponte divergência.
4. **Governança de Código e Testes**: Paridade byte-a-byte (100% SHA-256) obrigatória entre `artifacts/api-server/` e `scripts/`, com testes pontuais estritamente isolados (`NODE_ENV=test`, `DATA_FILE` temporário, remoção de `DATABASE_URL` e sem envio real a hóspedes em produção).

---

## 2. Persistência de Dados e Ciclo de Vida no Backend

### 2.1 Como o `db` Opera em `artifacts/api-server/demo-server.mjs`
- **Estrutura em Memória**: `db` é declarado como objeto singleton exportado na linha 1147:
  ```javascript
  let db = {
    users: defaultUsers,
    flats: [],
    smartFlats: {},
    cleaningRequests: [],
    reservations: [],
    guests: [],
    // ...
  };
  ```
- **Carregamento Inicial (`loadDatabase()`, linhas 6013–6250)**:
  1. Lê `data/database.json` via `fs.promises.readFile(DB_FILE, "utf-8")` e executa `Object.assign(db, loaded)`.
  2. Caso `pgPool` esteja ativo (`DATABASE_URL`), cria/garante as tabelas necessárias:
     - `system_store`: chave primária `key TEXT`, coluna `value JSONB NOT NULL`, `updated_at`.
     - `system_store_backups`: snapshots históricos a cada 15 minutos (limite mantido de 25 snapshots recentes).
     - `media_blobs`: armazenamento particionado de Base64 pesados com `id TEXT PRIMARY KEY`, `entity_type`, `entity_id`, `data_url`.
     - `reservation_communications`: logs de e-mails enviados.
     - `system_audit_logs`: auditoria operacional.
  3. Recupera o registro `key = 'db_state'` de `system_store` e mescla via `reconcileUniversalIntegrity()`.
- **Salvamento e Persistência (`saveDatabase(reason)`, linhas 8655–8714)**:
  - Invalida caches em memória (`invalidateGuestCache()`, `invalidateFlatsCache()`).
  - Chamadas manuais (`manual_*`, `repair_*`, `settings_*`, `shutdown`) acionam gravação síncrona imediata via `atomicWriteFileSync(DB_FILE)` e `flushPgState()`.
  - Chamadas padrão usam debouncing: `localSaveTimeout` de 300ms para disco local e `pgSaveTimeout` de 800ms para PostgreSQL.
- **Motor de Poda (`pruneDatabase()`, linha 8395)**:
  - Limita coleções voláteis para manter o consumo do processo abaixo do limite de memória do Render (contêiner de ~2GB).
  - **Atenção Mandatória**: As coleções de frigobar (`minibarOrders` e `minibarInspections`) têm caráter fiscal, contábil e de conciliação de repasse. Portanto, **NÃO devem ser podadas agressivamente**. Deve-se adicionar uma regra específica em `pruneDatabase()` que preserve todos os pedidos dos últimos 730 dias (2 anos) e limite a coleção a um teto alto (ex.: 3.000 pedidos), podando apenas pedidos cancelados/não pagos muito antigos caso exceda esse limite.

---

## 3. Especificação do Modelo de Dados do Frigobar

Para atender integralmente aos requisitos R1, R2, R3 e R4, as seguintes entidades devem ser adicionadas a `db`:

### 3.1 Catálogo de Produtos e Cortesias (`db.minibarProducts`)
Coleção que armazena todos os produtos comercializáveis e itens de cortesia.

```typescript
interface MinibarProduct {
  id: string;                    // Ex: "prod_agua_sem_gas_500", "prod_nespresso_capsula", "prod_amendoim_japones"
  name: string;                  // Ex: "Água Mineral sem Gás 500ml", "Cápsula Nespresso Ristretto"
  category: "bebidas" | "cervejas" | "snacks" | "cortesias" | "outros";
  price: number;                 // Preço de venda ao hóspede (R$) - Ex: 6.00 (ou 0.00 se exclusivo cortesia)
  cost: number;                  // Custo de reposição/repasse Anserve (R$) - Ex: 3.20
  imageUrl: string;              // URL da foto ou Base64 (salvo em uploads/minibar/ ou Cloudflare R2)
  description?: string;          // Descrição do produto (opcional)
  active: boolean;               // Visível para seleção no catálogo mobile
  isCourtesy: boolean;           // True se fizer parte do kit gratuito de boas-vindas
  courtesyLimitPerStay?: number; // Qtd gratuita permitida por estadia (Ex: 2 cápsulas Nespresso, 1 amendoim)
  extraPaidProductId?: string;   // ID do produto avulso pago correspondente caso o hóspede queira consumir além da cortesia
  sortOrder: number;             // Ordem de exibição na interface
  createdAt: string;             // ISO Date
  updatedAt: string;             // ISO Date
}
```

### 3.2 Gabarito Padrão por Flat (`db.minibarDefaultStock`)
Define a quantidade nominal padrão que deve existir no frigobar de cada flat antes do check-in do hóspede.

```typescript
interface MinibarDefaultStockItem {
  productId: string;
  defaultQuantity: number;       // Ex: 4 águas, 2 coca-colas, 2 heinekens, 2 cápsulas cortesia
  isCourtesy?: boolean;
}

// Configuração geral em db.minibarDefaultStock e possibilidade de override por flat
interface MinibarDefaultStockConfig {
  globalTemplate: MinibarDefaultStockItem[]; // Gabarito padrão aplicável a todos os 19 flats
  flatOverrides?: Record<string, MinibarDefaultStockItem[]>; // flatNumber -> itens customizados (caso algum flat tenha adega ou frigobar maior)
}
```

### 3.3 Pedidos de Consumo (`db.minibarOrders`)
Registra cada compra efetuada pelo hóspede (via QR Code do flat ou Área da Reserva) ou gerada por divergência apontada pela repositora.

```typescript
interface MinibarOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  isCourtesy: boolean;           // Se foi usufruído como cortesia gratuita (valor 0)
}

interface MinibarFiscalPreferences {
  invoiceDescriptionType: "items_detailed" | "single_water" | "minibar_consumption";
  // (a) Discriminar todos os itens consumidos
  // (b) Lançar como "Água"
  // (c) Lançar como "Consumo de Frigobar"
  documentType: "cpf" | "cnpj";
  documentNumber: string;        // Higienizado (apenas dígitos)
  companyName?: string;          // Razão Social se for CNPJ
  email: string;                 // E-mail obrigatório para envio da NF
}

interface MinibarInvoiceAttachment {
  status: "pendente" | "anexada";
  invoiceFileUrl: string | null; // URL em /api/storage/files/invoices/... ou Cloudflare R2
  invoiceFileName: string | null;
  attachedAt: string | null;     // ISO Date
  attachedBy: string | null;     // Usuário supervisor Anserve
  whatsappSentAt: string | null; // Data/hora do disparo no WhatsApp
  whatsappMessageId: string | null;
  emailSentAt: string | null;    // Data/hora do disparo por E-mail
  emailMessageId: string | null;
}

interface MinibarOrder {
  id: string;                    // Ex: "ORD-MB-20261021-001"
  flatId: string | number;
  flatNumber: string;            // Ex: "212"
  reservationId: string | number;
  reservationCode: string;       // Ex: "RES-212-0066"
  guestId?: string | number;
  guestName: string;
  guestPhone: string;
  guestDocument: string;
  guestEmail: string;
  items: MinibarOrderItem[];
  totalAmount: number;           // Valor total a pagar (R$)
  paymentMethod: "pix" | "cartao_credito" | "pendente";
  paymentStatus: "pendente" | "pago" | "cancelado";
  source: "guest_qrcode" | "guest_portal" | "anserve_discrepancy" | "admin_manual";
  
  // Metadados PIX (Banco Inter)
  pixTxId?: string | null;
  pixCopiaECola?: string | null;
  pixExpiresAt?: string | null;
  pixEndToEndId?: string | null;
  
  // Metadados Cartão (Mercado Pago)
  mpPreferenceId?: string | null;
  mpInitPoint?: string | null;
  mpPaymentId?: string | null;
  
  paidAt?: string | null;        // ISO Date
  fiscalPreferences: MinibarFiscalPreferences;
  invoice: MinibarInvoiceAttachment;
  notes?: string;
  createdAt: string;             // ISO Date
  updatedAt: string;             // ISO Date
}
```

### 3.4 Inspeções e Conferências da Anserve (`db.minibarInspections`)
Armazena a auditoria física realizada pela repositora no flat (rotina ou pós-checkout).

```typescript
interface MinibarInspectionItemDeclared {
  productId: string;
  quantity: number;
}

interface MinibarInspectionItemDiscrepancy {
  productId: string;
  productName: string;
  missingQuantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface MinibarRestockedItem {
  productId: string;
  productName: string;
  quantity: number;
  isCourtesy: boolean;
  unitCost: number;              // Custo unitário de repasse da Anserve
  totalCost: number;             // quantity * unitCost
}

interface MinibarInspection {
  id: string;                    // Ex: "INSP-MB-20261021-001"
  flatNumber: string;
  flatId?: string | number;
  reservationId?: string | number | null;
  reservationCode?: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  inspectorId: string | number;
  inspectorName: string;
  inspectedAt: string;           // ISO Date
  status: "conforme" | "divergencia_detectada" | "divergencia_paga";
  
  expectedStock: { productId: string; quantity: number }[];
  declaredItems: MinibarInspectionItemDeclared[]; // Itens que o hóspede já havia pago/declarado
  foundItems: { productId: string; quantity: number }[];    // Itens fisicamente encontrados no frigobar
  
  hasDiscrepancy: boolean;
  discrepancyItems: MinibarInspectionItemDiscrepancy[];
  discrepancyTotalAmount: number;
  
  restockedItems: MinibarRestockedItem[]; // Itens recolocados para restabelecer o gabarito
  restockedCourtesyTotalCost: number;    // Subtotal de cortesias (reembolsado pela CorpFlats)
  restockedPaidItemsTotalCost: number;   // Subtotal de produtos pagos
  
  photos: string[];              // URLs de fotos anexadas pela repositora em caso de avaria/divergência
  notes?: string;
  chargeOrderId?: string | null; // ID da ordem pendente gerada em db.minibarOrders
  whatsappSofiaAlertSent: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### 3.5 Configurações Operacionais & Financeiras (`db.minibarSettings`)

```typescript
interface MinibarSettings {
  anservePin: string;            // PIN rápido mobile de 4 ou 6 dígitos para login da repositora
  anserveMobileTokenSecret: string; // Segredo para geração de link direto autenticado
  creditCardFeePercent: number;  // Ex: 3.99% (taxa de intermediação do Mercado Pago a descontar do repasse)
  pixFeeFixed: number;           // Ex: 0.00 ou taxa por transação PIX
  corpFlatsCommissionPercent: number; // Margem ou comissão da CorpFlats sobre produtos pagos (ex: 15% ou 0%)
  courtesyReimbursementEnabled: boolean; // Se a CorpFlats reembolsa 100% do custo das cortesias à Anserve (padrão true)
  autoNotifySofiaOnDiscrepancy: boolean; // Se dispara mensagem WhatsApp automática da Sofia ao detectar divergência
  notificationManagerWhatsApp: string; // WhatsApp de contingência da supervisão CorpFlats/Anserve
}
```

---

## 4. Análise dos Fluxos de Pagamento no Backend

### 4.1 PIX Banco Inter
O backend já possui um módulo maduro para o Banco Inter:
- **Autenticação**:
  - `getInterAccessToken()` (linha 40764 de `demo-server.mjs`) utiliza `getInterHttpsAgent()` configurado com mTLS (`inter.crt` e `inter.key`).
  - Cache de token OAuth2 com expiração de 55 minutos para o endpoint `https://cdpj.partners.bancointer.com.br/oauth/v2/token`.
- **Criação da Cobrança PIX**:
  - `createInterPixCob({ amount, description, debtorName, debtorDocument, reservationCode })` (linha 40816 de `demo-server.mjs`):
    - Gera `txid = crypto.randomBytes(16).toString("hex")`.
    - Executa chamada PUT para `https://cdpj.partners.bancointer.com.br/pix/v2/cob/${txid}`.
    - Retorna `{ txid, pixCopiaECola, location, status, valor, expiresIn, createdAt }`.
- **Conciliação e Confirmação**:
  - **Webhook Oficial**: `POST /api/pms/inter/webhook` (linha 40927) recebe notificações instantâneas com array `pix: [{ txid, valor }]`.
  - **Consulta Ativa no Extrato Bancário Completo**: `getCachedInterExtratoCompleto()` e `checkInterBankingExtratoPix()` (linhas 41109–41259) consultam `/banking/v2/extrato/completo` com cache inteligente de 10 segundos, fazendo o cruzamento seguro por `txId` ou por `valor + documento/nome do pagador`.
- **Como Reutilizar no Frigobar**:
  - Ao criar um pedido de frigobar com PIX (`POST /api/minibar/orders` com `paymentMethod: "pix"`), o backend chama `createInterPixCob` com:
    - `amount: order.totalAmount`
    - `description: "Frigobar Flat " + order.flatNumber`
    - `debtorName: order.guestName`
    - `debtorDocument: order.fiscalPreferences.documentNumber`
    - `reservationCode: order.id` (usando o ID da ordem de frigobar como chave de referência)
  - No webhook do Inter e no endpoint de polling do pedido (`GET /api/minibar/orders/:id/status`), verifica-se se o `txId` corresponde à ordem em `db.minibarOrders`. Confirmado o pagamento:
    - `order.paymentStatus = "pago"`
    - `order.paidAt = new Date().toISOString()`
    - Adiciona à fila de Notas Fiscais pendentes da Anserve.

### 4.2 Cartão de Crédito Mercado Pago
O sistema conta com integração completa ao Mercado Pago Checkout Pro:
- **Criação da Preferência**:
  - `createMercadoPagoPreference({ reservationCode, amount, guestName, guestEmail, nights, flatNumber })` (linha 41949 de `demo-server.mjs`):
    - Envia requisição para `https://api.mercadopago.com/checkout/preferences` com headers contendo o `accessToken`.
    - Configura `back_urls`, `auto_return: "approved"`, `external_reference`, e desativa métodos indesejados (`ticket`, `bank_transfer`), permitindo cartão com até 12 parcelas.
    - Retorna `{ id, initPoint, sandboxInitPoint }`.
- **Webhook e Consulta Ativa**:
  - `POST /api/pms/mercadopago/webhook` (linha 42072) recebe notificações de evento `payment` com ID da transação.
  - `checkMercadoPagoPaymentByRef(externalRef)` (linha 41073) realiza busca ativa em `https://api.mercadopago.com/v1/payments/search?external_reference=${externalRef}`.
- **Como Reutilizar no Frigobar**:
  - Ao selecionar Cartão no checkout de frigobar, chama `createMercadoPagoPreference` configurando:
    - `reservationCode: "MB-" + order.id`
    - `amount: order.totalAmount`
    - `title: "Consumo Frigobar Flat " + order.flatNumber`
    - `back_urls`: aponta para a tela de conclusão do frigobar com parâmetro de sucesso.
  - No webhook do Mercado Pago ou no polling `GET /api/minibar/orders/:id/status`, caso `status === "approved"`, o pedido é marcado como `"pago"` com `order.paymentMethod = "cartao_credito"` e `order.mpPaymentId = queryId`.

### 4.3 Garantia de Não-Faturamento Conjunto com a Hospedagem
- O consumo de frigobar deve ter seus recebíveis contabilizados separadamente das diárias de hotelaria.
- O campo `r.totalAmount` da reserva **NÃO é alterado** por compras de frigobar.
- No DRE e ERP Financeiro (`/financeiro`), os valores de frigobar entram em centro de custo próprio ("Receita de Frigobar / Repasse Terceiros"), impedindo qualquer conflito fiscal ou contábil com a NFS-e de hospedagem.

---

## 5. Arquitetura de Notificações, Anexos e IA Sofia

### 5.1 Envio de Arquivos e Documentos via WhatsApp (Z-API)
- **Função `sendZapiDocument`** (`artifacts/api-server/zapi-service.mjs`, linha 3436):
  - Suporta parâmetros: `{ phone, document, fileName, caption, channelId, triggerEvent, db }`.
  - **Conversão Automática de Arquivo Local para Base64**:
    - Se `document` for um caminho relativo iniciado por `/api/storage/files/...`, a função extrai o caminho físico dentro de `UPLOADS_DIR` (`artifacts/api-server/uploads`), lê o buffer do arquivo (`fs.readFileSync`), infere o MIME type e monta a URI Base64 (`data:application/pdf;base64,...`).
    - Dispara para a API da Z-API na rota `/instances/${instanceId}/token/${token}/send-document/${extension}`.
  - **Governança de Canais e Sanitização**: Respeita whitelist/blacklist de canais Z-API e executa `cleanWhatsAppPhone(phone)`.
  - **Sincronização com o Chat**: Através de `appendMessageToConversation(db, { phone, text, type: "document", mediaUrl, fileName, caption })`, a mensagem e o documento constam imediatamente no WhatsApp Web interno da recepção/gestão (`/whatsapp-chat`).

### 5.2 Envio de E-mails com Anexos (SMTP Zoho / MailService)
- **Função `sendEmailAsync`** (`artifacts/api-server/mail-service.mjs`, linha 1255):
  - Suporta parâmetros: `{ db, saveDatabase, reservationId, recipient, subject, bodyHtml, attachments }`.
  - `attachments` segue o formato do Nodemailer:
    ```javascript
    attachments: [
      {
        filename: order.invoice.invoiceFileName,
        path: path.join(UPLOADS_DIR, "invoices", uniqueFileName)
      }
    ]
    ```
  - Registra a comunicação na tabela `reservation_communications` do PostgreSQL para auditoria completa.

### 5.3 Upload de Nota Fiscal (`POST /api/minibar/orders/:id/invoice`) e Disparo Automático
Fluxo executado quando o supervisor da Anserve anexa a Nota Fiscal emitida:
1. **Recepção do Arquivo**: O endpoint aceita payload JSON com `{ fileBase64, fileName, mimeType }` (graças ao limite de 50MB de `express.json` na linha 394 de `demo-server.mjs`) ou multipart form data.
2. **Armazenamento**: O arquivo é salvo localmente em `artifacts/api-server/uploads/invoices/${uniqueFileName}` e/ou enviado para o Cloudflare R2 via `uploadImageToStorage(fileBase64, "invoice_minibar", db, "invoices")`.
3. **Persistência no Pedido**:
   - `order.invoice.status = "anexada"`
   - `order.invoice.invoiceFileUrl = "/api/storage/files/invoices/" + uniqueFileName`
   - `order.invoice.attachedAt = new Date().toISOString()`
   - `order.invoice.attachedBy = user.name`
   - Executa `saveDatabase("minibar_invoice_attached")`.
4. **Disparo Imediato Multicanal**:
   - **WhatsApp**: Chama `sendZapiDocument` com o PDF ou foto da NF, legenda amigável de agradecimento e link para download.
   - **E-mail**: Chama `sendEmailAsync` para `order.fiscalPreferences.email` com template formatado e anexo PDF/imagem.
   - **Área do Hóspede**: Disponível instantaneamente no retorno de `/api/pms/guest-portal/:code` no objeto `minibarOrders`.

### 5.4 Sofia WhatsApp: Notificação Automática de Divergência na Reposição
Quando a repositora da Anserve realiza a conferência do flat e aponta itens faltantes não declarados pelo hóspede (`hasDiscrepancy: true`):
1. O backend calcula o subtotal da divergência e cria uma ordem com `paymentStatus: "pendente"` e `source: "anserve_discrepancy"`.
2. O sistema formata a mensagem cordial da IA Sofia:
   ```text
   Olá, [Nome do Hóspede]! Tudo bem? Esperamos que tenha tido uma excelente estadia no Flat [Número] da CorpFlats! 🌟

   Durante a conferência e reposição do frigobar pelo nosso parceiro de governança, identificamos o consumo dos seguintes itens:
   • [Qtd]x [Nome do Item] — R$ [Valor]

   Total do consumo: R$ [ValorTotal]

   Como o frigobar não pode ser lançado junto à fatura da hospedagem, você pode efetuar o pagamento diretamente via PIX ou Cartão pelo link exclusivo abaixo:
   🔗 https://corpflats.onrender.com/minha-reserva/[CódigoReserva]/frigobar?ord=[OrderId]

   Caso tenha alguma dúvida, estamos à disposição! Tenha um excelente dia! ✨
   ```
3. A mensagem é enviada ao WhatsApp do hóspede titular (`cleanWhatsAppPhone(reservation.guestPhone)`) via `sendZapiMessage` com canal `"guest"` e gravada em `db.whatsappConversations`.

### 5.5 Habilidades da IA Sofia em `whatsapp-ai-service.mjs`
1. **Extensão de `querySystemData`**:
   - Adicionar o caso `case "minibar": case "frigobar":` (linha ~918).
   - Retorna o catálogo de produtos e preços, as regras de cortesias (2 Nespresso + guloseimas gratuitas no check-in, extras pagos), o histórico de consumo da reserva e o link direto para o frigobar.
2. **Extensão de `buildGuestContext`** (linha ~753):
   - Adicionar campos `minibarConsumption`:
     - `orders`: pedidos de frigobar vinculados à reserva ativa.
     - `totalSpent`: soma dos valores pagos.
     - `hasPendingPayment`: booleano se há pedido pendente.
     - `minibarUrl`: `https://corpflats.onrender.com/minha-reserva/${code}/frigobar`.
3. **Instruções de Sistema da Sofia**:
   - Quando o hóspede enviar mensagens como *"tem água no flat?"*, *"quanto custa a cerveja?"*, *"consumi duas cervejas, como pago?"*:
     - A Sofia consulta `querySystemData(module: "minibar")`.
     - Esclarece que o flat possui frigobar abastecido com bebidas e cortesias (cápsulas Nespresso de cortesia).
     - Informa que o consumo é acertado de forma independente da diária do hotel e envia o link direto do flat ou da reserva para pagamento via PIX ou Cartão.

---

## 6. Mapeamento e Especificação dos Endpoints REST

Tabela completa de novos endpoints necessários em `artifacts/api-server/demo-server.mjs`:

| Método | Endpoint | Perfil de Acesso | Descrição |
|---|---|---|---|
| `GET` | `/api/minibar/products` | Público / Hóspede / Admin | Lista catálogo de produtos ativos e cortesias. Se autenticado como admin/gestor, inclui custos e margens. |
| `POST` | `/api/minibar/products` | `admin`, `dev` | Cadastra novo produto no catálogo de frigobar. |
| `PATCH` | `/api/minibar/products/:id` | `admin`, `dev` | Atualiza produto (preço, custo, foto, status ativo, limites de cortesia). |
| `DELETE` | `/api/minibar/products/:id` | `admin`, `dev` | Desativa ou remove produto do catálogo. |
| `GET` | `/api/minibar/default-stock` | `admin`, `anserve_*`, `dev` | Retorna o gabarito padrão de estoque por flat. |
| `PUT` | `/api/minibar/default-stock` | `admin`, `dev` | Atualiza gabarito padrão global ou overrides por flat. |
| `GET` | `/api/minibar/flat-context/:flatNumber` | Público (Mobile QR Code) | Retorna status do flat (ocupado/checkout) e solicita verificação dos 4 dígitos do celular sem expor dados sensíveis. |
| `POST` | `/api/minibar/verify-flat-access` | Público (Mobile QR Code) | Valida os 4 últimos dígitos do celular contra a reserva ativa e retorna nome do hóspede, código da reserva e token de sessão mobile. |
| `GET` | `/api/minibar/reservation-context/:code` | Público / Hóspede | Carrega contexto da reserva para a tela mobile `/minha-reserva/:code/frigobar` (produtos, gabarito padrão, consumo anterior). |
| `POST` | `/api/minibar/orders` | Hóspede / Repositora / Admin | Cria pedido de consumo de frigobar, valida cortesias e gera cobrança PIX Inter ou preferência Mercado Pago. |
| `GET` | `/api/minibar/orders/:id/status` | Hóspede (Polling) / Admin | Consulta status de pagamento do pedido (verifica banco em tempo real via webhook, extrato Inter ou Mercado Pago). |
| `GET` | `/api/minibar/inspections/flats-status` | `anserve_repositora`, `anserve_gestor`, `admin` | Visão geral dos 19 flats para a repositora (destacando checkout hoje, livres, ocupados e consumo declarado). |
| `POST` | `/api/minibar/inspections` | `anserve_repositora`, `admin`, `dev` | Registra conferência/vistoria do frigobar, apontando conformidade ou divergência, reposição e fotos. |
| `GET` | `/api/minibar/invoices/pending` | `anserve_gestor`, `admin`, `dev` | Fila de pedidos pagos aguardando emissão/anexo de Nota Fiscal. |
| `POST` | `/api/minibar/orders/:id/invoice` | `anserve_gestor`, `admin`, `dev` | Upload do arquivo da Nota Fiscal (PDF/imagem) e disparo automático por WhatsApp, E-mail e Portal do Hóspede. |
| `GET` | `/api/minibar/analytics` | `admin`, `dev` | Métricas de vendas, ranking de produtos, cortesias repostas, taxas de divergência e cruzamento demográfico por estado/cidade. |
| `GET` | `/api/minibar/settlement` | `admin`, `anserve_gestor`, `dev` | Extrato de repasse CorpFlats ↔ Anserve com vendas brutas, deduções de taxas de gateway e reembolso de cortesias. |

---

## 7. Controle de Acesso e Perfis de Usuário (RBAC)

Para atender ao controle de acesso híbrido solicitado no R3:

### 7.1 Novos Perfis em `permissions.ts` e `demo-server.mjs`
1. **`anserve_repositora`**:
   - Perfil operacional mobile para as repositoras da Anserve.
   - Módulo padrão liberado: `["/frigobar-reposicao"]`.
   - Pode ser acessado via formulário de login padrão ou via **Link Rápido Mobile com PIN/Token**:
     - Link: `/frigobar-reposicao?pin=1234` ou `/anserve/reposicao?token=...`.
     - O backend valida o PIN configurado em `db.minibarSettings.anservePin` e emite cookie de sessão temporário com `role: "anserve_repositora"`.
2. **`anserve_gestor`**:
   - Perfil de supervisão da Anserve.
   - Módulos padrão liberados: `["/anserve", "/frigobar-reposicao"]`.
   - Acessa a fila de Notas Fiscais pendentes, extrato de repasse, relatórios de reposição e estoque.
3. **`admin` e `dev`**:
   - Acesso total à interface gerencial `/frigobar` (catálogo, QR codes, extrato de repasse, CRM e auditoria).

---

## 8. Contratos de Interface, Restrições e Armadilhas Identificadas

### 8.1 Paridade Rigorosa Twin-Server (SHA-256)
- O backend do Guest-Flow-Manager exige **paridade byte a byte** entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`.
- Quaisquer rotas ou funções implementadas devem ser replicadas identicamente.
- Caso seja criado um serviço auxiliar (ex: `artifacts/api-server/minibar-service.mjs`), ele deverá obrigatoriamente ter sua cópia gêmea em `scripts/minibar-service.mjs`.

### 8.2 Isolamento de Testes e Diretrizes do AGENTS.md
- **PROIBIDO rodar `tests/*.test.mjs` ou varreduras em lote**: A execução de testes deve ser estritamente pontual (ex.: `node --test tests/minibar-backend-flow.test.mjs`).
- **Segurança Operacional em Testes**:
  - `NODE_ENV = "test"` obrigatório.
  - Excluir explicitamente `delete process.env.DATABASE_URL` para não tocar o PostgreSQL de produção.
  - Usar cópia isolada de `data/database.json` em `os.tmpdir()`.
  - Assertar que o arquivo real `data/database.json` não sofreu alteração de hash SHA-256 ou mtime.
  - **Mocks de Notificação**: Em modo de teste, nenhum disparo real deve ser enviado à API do Banco Inter em produção ou à Z-API para números reais de hóspedes.

### 8.3 Blindagem Contra Podas Acidentais (`pruneDatabase`)
- Em `artifacts/api-server/demo-server.mjs` (linha 8395), a rotina `pruneDatabase()` poda arrays para manter a integridade da memória.
- As coleções `minibarOrders` e `minibarInspections` devem ser tratadas como dados fiscais e de auditoria:
  - Não descartar pedidos confirmados/pagos de até 730 dias.
  - Apenas podar registros incompletos ou órfãos se a lista exceder 3.000 itens.

### 8.4 Validação de Cortesias (Anti-Abuso)
- O modelo de cortesia do CorpFlats prevê gratuidade de itens de boas-vindas (ex.: 2 cápsulas Nespresso e amendoim/balas) **uma única vez por reserva**.
- O backend deve validar na criação do pedido se a reserva já consumiu os itens de cortesia em pedidos anteriores. Caso positivo, o sistema deve converter a solicitação em unidades extras pagas, impedindo pedidos duplicados de itens gratuitos.

### 8.5 Proteção de Privacidade no QR Code do Flat
- O QR Code impresso no flat é público.
- Para evitar que uma pessoa escaneando o código veja o nome completo ou telefone do hóspede anterior/atual, o endpoint `/api/minibar/flat-context/:flatNumber` deve exibir apenas o nome mascarado (ex: *"M**** P*******"*) e exigir os **4 últimos dígitos do celular cadastrado** na reserva para liberar o checkout autenticado.

---

## 9. Próximos Passos Recomendados para Implementação

1. **Persistência**: Adicionar a inicialização das 5 coleções de frigobar (`minibarProducts`, `minibarDefaultStock`, `minibarOrders`, `minibarInspections`, `minibarSettings`) no objeto `db`, na função `loadDatabase()` e na hidratação PG de `demo-server.mjs`.
2. **Endpoints de API**: Criar o conjunto de rotas `/api/minibar/...` conectando aos motores de pagamento PIX Inter e Mercado Pago.
3. **Módulo de Anexos e Mensageria**: Implementar o upload da Nota Fiscal com despacho duplo (Z-API + SMTP) e disparo automático da Sofia para divergências.
4. **Integração Sofia e CRM**: Habilitar a consulta ao módulo `minibar` em `whatsapp-ai-service.mjs` e vincular histórico de frigobar aos hóspedes em `db.guests`.
5. **Sincronização Twin**: Espelhar todas as alterações em `scripts/` e validar SHA-256.
6. **Teste Pontual Dedicado**: Criar `tests/minibar-backend-flow.test.mjs` validando o ciclo completo com isolamento de ambiente.

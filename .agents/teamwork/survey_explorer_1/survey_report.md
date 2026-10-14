# Survey & Architectural Audit: NFS-e Engine, CRM 360° & WhatsApp Fiscal Integration

**Data**: 2026-10-14T09:55:00Z  
**Autor**: Survey Explorer 1 (NFS-e Engine & Emission Audit)  
**Ambiente**: CorpFlats Guest-Flow-Manager (Soho Residence, Campos dos Goytacazes/RJ)

---

## Sumário Executivo

Esta investigação detalhada auditou de ponta a ponta o ecossistema de emissão de Nota Fiscal de Serviço Eletrônica (NFS-e Municipal GissOnline e Padrão Nacional ADN/SEFIN), a sua integração com o CRM 360° (Hóspedes, Solicitantes e Empresas) e o fluxo de mensageria via WhatsApp.

Identificamos com precisão as causas de falha na emissão, as lacunas de dados de faturamento e de endereço, a ausência de suporte ativo ao motor nacional no endpoint de emissão, e a falta de automação para recepção e confirmação de dados fiscais no WhatsApp.

---

## 1. Mapeamento Arquitetural dos Componentes

| Componente | Arquivo(s) | Responsabilidade Principal |
| :--- | :--- | :--- |
| **API Server Twin** | `artifacts/api-server/demo-server.mjs`<br>`scripts/demo-server.mjs` | Rotas REST de emissão (`/api/nfse/emit`), configurações, faturamento no check-out, CRUD de empresas e hóspedes. |
| **Motor Municipal GISS** | `artifacts/api-server/giss-soap.mjs` | Geração de XML ABRASF 2.04, assinatura digital XMLDSig, envio SOAP (`RecepcionarLoteRps`) e consulta (`ConsultarLoteRps`) para Campos dos Goytacazes/RJ. |
| **Motor Padrão Nacional** | `artifacts/api-server/national-nfse.mjs` | Geração de Chave de Acesso de 50 dígitos, montagem de DPS (JSON/XML), compressão gzip+base64, envio REST mTLS para ADN / SEFIN Nacional e DANFSE oficial. |
| **Lookup CNPJ & CEP** | `artifacts/api-server/lookup.mjs` | Consulta pública de dados cadastrais de empresas (BrasilAPI / Receita) e endereços por CEP (ViaCEP). |
| **Chat Assistente Fiscal** | `artifacts/api-server/chat-service.mjs` | Processamento de linguagem natural, conversão flexível de valores e datas, aplicação de template dinâmico de discriminação. |
| **Agente WhatsApp** | `artifacts/api-server/whatsapp-ai-service.mjs`<br>`scripts/whatsapp-ai-service.mjs` | Atendimento autônomo e direcionamento de solicitações de hóspedes via Z-API. |
| **UI Notas Fiscais** | `artifacts/limpeza/src/pages/fiscal-invoices.tsx` | Painel de controle, tabela de notas emitidas, chat assistente e formulário de emissão. |
| **UI CRM 360°** | `artifacts/limpeza/src/pages/crm-guests.tsx` | Gestão de cadastros de hóspedes, empresas, histórico de estadias e preferências fiscais. |

---

## 2. Diagnóstico Detalhado das Não-Conformidades

### 2.1. ReferenceError em `POST /api/nfse/emit`
- **Linha**: 27467 de `demo-server.mjs`
- **Trecho com bug**:
  ```javascript
  res.status(201).json({
    success: true,
    invoice: newInvoice,
    numeroNfse: numNfseReal,       // <-- NÃO DECLARADA
    numeroNota: numNfseReal,       // <-- NÃO DECLARADA
    codigoVerificacao: codVerifReal, // <-- NÃO DECLARADA
    danfseUrl: `/api/nfse/danfse/${numNfseReal}`,
    linkPrefeitura: newInvoice.linkPrefeitura,
    qrCodeUrl: newInvoice.qrCodeUrl,
    message: `Nota Fiscal Nº ${numNfseReal} emitida com sucesso pelo GissOnline Municipal!`
  });
  ```
- **Consequência**: A nota fiscal é salva no banco (`db.invoices`), mas a resposta HTTP quebra com erro 500.

### 2.2. Campos de Endereço Descartados em `POST /api/nfse/emit`
- A desestruturação em `demo-server.mjs` extrai apenas:
  `reservationId, reservationCode, tomadorNome, tomadorCpfCnpj, tomadorEmail, tomadorTelefone, flatNumber, valorServico, discriminacao, regraFiscalId`.
- Os campos `tomadorEndereco`, `tomadorLogradouro`, `tomadorNumero`, `tomadorBairro`, `tomadorCep`, `tomadorCidade`, `tomadorUf`, `tomadorCodigoMunicipio` não são extraídos do body nem repassados para `emitirNfseGissReal` ou salvos em `newInvoice`.

### 2.3. Roteamento de Motores Inexistente
- `demo-server.mjs` importa `processNationalInvoiceEmission` e `buildNationalDpsPayload` de `national-nfse.mjs`, mas nunca os utiliza na rota de emissão.
- `POST /api/nfse/emit` deve verificar `sistemaEmissor` (ou fallback para `db.nfseConfig.padrao`) e acionar o motor municipal (`giss_prefeitura`) ou nacional (`padrao_nacional`).

### 2.4. Auto-Emissão em Check-out Desconectada do CRM de Empresas
- Em `app.post("/api/pms/reservations/:id/checkout")` (linhas 22144–22178), quando `shouldAutoEmit` é verdadeiro, o tomador é sempre preenchido com `r.guestName` e `r.guestDocument`.
- Se a reserva tiver `r.companyId` ou o hóspede tiver `guest.companyId`, a empresa vinculada (`db.companies`) é ignorada, emitindo nota no CPF do hóspede em vez do CNPJ da empresa conveniada.

### 2.5. Chat Assistente Fiscal Poluindo `db.guests` com Empresas
- Em `app.post("/api/invoices/chat")` (linhas 27288–27310), se o documento tiver 14 dígitos (CNPJ), o sistema insere em `db.guests` com `documentType: "cnpj"` e nunca em `db.companies`.
- Em `chat-service.mjs`, não há suporte a extração avulsa de CEP ou validação matemática por Módulo 11.

### 2.6. Falta de Campos no CRUD e Modal de Empresas
- `POST /api/companies` (linhas 28705–28750) não grava `cep`, `address`/`logradouro`, `number`, `neighborhood`/`bairro`, `city`, `state`/`uf`, `ibgeCode`.
- O formulário em `crm-guests.tsx` não exibe os campos de endereço, mesmo com estados locais declarados.

### 2.7. WhatsApp Trata Pedidos Fiscais como Demanda Ausente
- Em `whatsapp-ai-service.mjs` (linha 3198), regex de nota fiscal aciona `UNMET_DEMAND_CATEGORIES.emissao_nota_fiscal.defaultSuggested` sem nenhum fluxo de atendimento, enriquecimento ou vínculo.

---

## 3. Plano de Correção e Especificação Técnica

### 3.1. Correção e Unificação de `POST /api/nfse/emit`
1. Desestruturar todos os campos do tomador:
   - Identificação: `tomadorNome`, `tomadorCpfCnpj`, `tomadorEmail`, `tomadorTelefone`.
   - Endereço: `tomadorEndereco` / `tomadorLogradouro`, `tomadorNumero`, `tomadorBairro`, `tomadorCep`, `tomadorCidade` / `tomadorMunicipio`, `tomadorUf`, `tomadorCodigoMunicipio`.
   - Contexto: `reservationId`, `reservationCode`, `flatNumber`, `valorServico`, `discriminacao`, `sistemaEmissor`, `cnae`, `codigoServico`, `aliquota`.
2. Vínculo automático de CRM caso venha `reservationId` ou `companyId`:
   - Se houver `companyId`, carregar dados da empresa como Tomador.
   - Formatar a discriminação usando `formatarDescricaoComTemplate` para preservar o nome do hóspede e datas da estadia.
3. Roteamento de Motor:
   - Se `sistemaEmissor === "padrao_nacional"` ou `(!sistemaEmissor && db.nfseConfig?.padrao === "nacional_adn")`:
     - Acionar `buildNationalDpsPayload` e `processNationalInvoiceEmission`.
     - Caso em teste ou offline, gerar contingência/autorização nacional com chave de 50 dígitos e protocolo ADN.
   - Caso contrário (`giss_prefeitura`):
     - Acionar `emitirNfseGissReal`.
     - Caso falhe por timeout ou offline em teste, gerar contingência com RPS/número válido.
4. Persistência e Resposta:
   - Normalizar `numeroNfse = emissionResult.numeroNfse || emissionResult.numeroNota || String(nextRpsNumber)`.
   - Normalizar `codigoVerificacao = emissionResult.codigoVerificacao || ...`.
   - Salvar todos os campos de endereço no objeto da nota.
   - Retornar HTTP 201 com `success: true, invoice, numeroNfse, numeroNota, codigoVerificacao, danfseUrl, linkPrefeitura, qrCodeUrl`.

### 3.2. Check-out Inteligente com Priorização de Empresa PJ
- Ao realizar check-out (`POST /api/pms/reservations/:id/checkout`):
  - Verificar se a reserva possui `companyId` ou se o hóspede possui `companyId`.
  - Havendo empresa, o tomador da nota é a Empresa PJ (`cnpj`, `corporateName`, `address`, `cep`, `financialEmail`, `phone`).
  - A discriminação do serviço deve conter: `Hóspede: ${r.guestName} | Flat ${r.flatNumber} | Check-in: ${r.checkinDate} | Check-out: ${r.checkoutDate}`.

### 3.3. Compatibilização do Chat Assistente Fiscal
- Em `POST /api/invoices/chat`:
  - Se documento for CNPJ (14 dígitos válidos):
    - Consultar `lookupCnpj` (se ainda não consultado) e criar/atualizar a empresa em `db.companies`.
    - Se houver hóspede na conversa, vincular `companyId` no hóspede.
  - Se for CPF (11 dígitos válidos):
    - Criar/atualizar em `db.guests` com nome, CPF, endereço, CEP, telefone e e-mail.

### 3.4. Fluxo Automatizado no WhatsApp
1. Interceptação da intenção fiscal:
   - Se mensagem contiver palavras como "nota fiscal", "nf", "cnpj", "emite nf":
2. Verificação de Vínculo:
   - Localizar hóspede ou reserva pelo telefone do remetente (incluindo `requesterPhone` e `requesterInfo`).
   - Se já tiver `companyId` com CNPJ válido no cadastro:
     - Responder confirmando a Razão Social e CNPJ cadastrados.
     - **Não solicitar novamente os dados.**
     - Marcar `autoEmitInvoice = true` na reserva e no hóspede.
   - Se NÃO tiver empresa vinculada:
     - Enviar mensagem acolhedora solicitando dados para PJ (CNPJ + e-mail) ou PF (Nome, CPF, Endereço com CEP, E-mail).
3. Processamento de Resposta com Dados:
   - Validar dígito verificador matematicamente (Módulo 11). Se inválido, alertar educadamente pedindo conferência sem salvar lixo no banco.
   - Se CNPJ: consultar `lookupCnpj`, salvar em `db.companies`, vincular `companyId` ao hóspede e à reserva, ativar `autoEmitInvoice = true` e confirmar no WhatsApp.
   - Se CPF: salvar dados em `db.guests`, ativar `autoEmitInvoice = true` e confirmar no WhatsApp.

### 3.5. Frontend (`fiscal-invoices.tsx` & `crm-guests.tsx`)
- `fiscal-invoices.tsx`:
  - Seletor do CRM deve listar e pesquisar Hóspedes e Empresas.
  - Ao selecionar hóspede com `companyId`, auto-preencher dados da Empresa PJ e habilitar switch/botão para alternar Tomador (Empresa PJ ↔ Hóspede PF).
  - Preencher estadia e flat a partir da reserva mais recente.
- `crm-guests.tsx`:
  - Modal de empresa com inputs para todos os campos de endereço e fiscais.
  - Payload de `handleSaveCompany` enviando todos os campos para `/api/companies`.
  - Modal de hóspede com campos estruturados para endereço/CEP.

---

## 4. Paridade Twin-Server e Arquivos Auxiliares

- Espelhar todas as alterações de `artifacts/api-server/demo-server.mjs` para `scripts/demo-server.mjs`.
- Copiar os arquivos auxiliares para `scripts/`:
  - `scripts/giss-soap.mjs`
  - `scripts/national-nfse.mjs`
  - `scripts/chat-service.mjs`
  - `scripts/lookup.mjs`
  - `scripts/real-nfse-transmissor.mjs`
- Garantir SHA-256 idêntico entre os arquivos gêmeos.

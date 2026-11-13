# Project: CorpFlats NFS-e Engine, CRM 360° Alignment & WhatsApp Fiscal Assistant

## Architecture
O módulo de Nota Fiscal de Serviços Eletrônica (NFS-e) do Guest-Flow-Manager (CorpFlats) integra os motores fiscais municipais e nacionais ao ecossistema operacional do hotel:
1. **Motores de Emissão NFS-e (Dual Engine)**:
   - **Municipal (`giss_prefeitura`)**: `giss-soap.mjs` integrado ao WebService SOAP ABRASF 2.04 da Prefeitura Municipal de Campos dos Goytacazes/RJ (código IBGE `3301009`). Utiliza certificado digital A1 ICP-Brasil com assinatura XMLDSig RSA-SHA1 (`RecepcionarLoteRps`, `ConsultarLoteRps`), RPS Série 1, alíquota de 2% (CNAE 5510801 / Item 09.02).
   - **Padrão Nacional ADN (`padrao_nacional`)**: `national-nfse.mjs` integrado ao Ambiente de Dados Nacional da Receita Federal / SEFIN Nacional. Transmissão mTLS REST de DPS compactada em GZip Base64, geração de Chave de Acesso Oficial de 50 dígitos com Módulo 11 e DANFSE Nacional.
   - **Dispatcher Unificado**: `POST /api/nfse/emit` com suporte a `sistemaEmissor` (`giss_prefeitura` ou `padrao_nacional`), resolução de variáveis de retorno (`numeroNfse`, `codigoVerificacao`, `danfseUrl`), repasse e persistência integral de todos os campos de endereço do tomador.
2. **CRM 360° Bidirecional (Empresas, Hóspedes & Reservas)**:
   - **Empresas (`db.companies`, `/api/companies`)**: Cadastro corporativo com CNPJ, Razão Social, Nome Fantasia, Inscrição Estadual/Municipal, E-mail Financeiro, Telefone, Contato, e campos completos de endereço (Logradouro, Número, Complemento, Bairro, CEP, Cidade, UF, Código IBGE).
   - **Hóspedes (`db.guests`, `/api/pms/guests`)**: Cadastro de pessoa física com CPF, Nome Completo, E-mail, Telefone, Endereço completo, vínculo corporativo `companyId` e preferência de faturamento `autoEmitInvoice`.
   - **Reservas (`db.reservations`, `/api/pms/reservations`)**: Suporte a titular da reserva e solicitante terceiro (`requesterInfo`), vínculo `companyId`, flag `autoEmitInvoice`, e auto-emissão inteligente no check-out priorizando a Empresa PJ vinculada como Tomador da NFS-e e detalhando hóspede e estadia na discriminação dos serviços.
3. **Frontend SPA (UI Faturamento & CRM)**:
   - `artifacts/limpeza/src/pages/crm-guests.tsx`: Modais enriquecidos de edição e visualização de Empresas e Hóspedes com campos fiscais e de endereço completos e atalho para faturamento.
   - `artifacts/limpeza/src/pages/fiscal-invoices.tsx`: Seletor inteligente multientidade (Hóspedes PF, Empresas PJ e Reservas), auto-preenchimento do Tomador com os dados da Empresa vinculada quando houver `companyId`, botão de alternância rápida de Tomador (PJ ↔ PF), preenchimento automático dos dados da estadia na discriminação e suporte a parâmetros de URL.
4. **WhatsApp Fiscal Assistant (Automação Conversacional Inteligente)**:
   - Inbound webhook (`POST /api/whatsapp/webhook/received`) em `zapi-service.mjs` e `whatsapp-ai-service.mjs`.
   - Interceptação de intenção fiscal via regex robusta com verificação de vínculo prévio no CRM pelo telefone do remetente (titular ou `requesterInfo`).
   - Se já possui empresa vinculada: resposta imediata confirmando Razão Social e CNPJ sem repetição de perguntas, ativação de `autoEmitInvoice = true` e pré-preenchimento de rascunho de nota.
   - Se não possui empresa vinculada: solicitação acolhedora e clara de dados PJ vs PF com estado `awaitingFiscalData = true`.
   - Sanitização (`toTitleCase` preservando siglas e preposições, `cleanPhone`, `cleanCep`), validação matemática por Módulo 11 (`isValidCpf`, `isValidCnpj`), enriquecimento via `lookupCnpj` (CRM local + BrasilAPI) e `lookupCep` (ViaCEP), cadastro/atualização e vínculo bidirecional no CRM.
5. **Infraestrutura Twin-Server & Testes Isolados**:
   - Paridade estrita 100% SHA-256 entre `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs`.
   - Arquivos auxiliares gêmeos sincronizados em `scripts/` (`chat-service.mjs`, `national-nfse.mjs`, `giss-soap.mjs`, `lookup.mjs`, `whatsapp-ai-service.mjs`, `zapi-service.mjs`).
   - Suíte de teste pontual dedicada em `tests/nfse-crm-whatsapp-flow.test.mjs`, respeitando as regras estritas do `AGENTS.md` (24/24 testes aprovados).

---

## Feature Inventory
| # | Feature | Description | Milestone | Status | Source |
|---|---------|-------------|-----------|--------|--------|
| F1 | Fix Undefined Vars in `/api/nfse/emit` | Corrigir `ReferenceError: numNfseReal/codVerifReal is not defined` retornando `numeroNfse` e `codigoVerificacao` | M1 | DONE | ORIGINAL_REQUEST § R1, Survey |
| F2 | Dual Engine Support (GISS & ADN) | Suportar seleção de motor (`giss_prefeitura` e `padrao_nacional`) repassando dados completos do tomador | M1 | DONE | ORIGINAL_REQUEST § R1, Survey |
| F3 | Full Address Handling in Invoices | Desestruturar, validar, repassar ao motor e persistir endereço completo do tomador em `newInvoice` | M1 | DONE | ORIGINAL_REQUEST § R1, Survey |
| F4 | Corporate Check-out Auto-Emission | Auto-emissão no check-out priorizando Tomador PJ da empresa vinculada (`companyId`) e hóspede na discriminação | M1 | DONE | ORIGINAL_REQUEST § R1, Survey |
| F5 | Fiscal Chat CRM Integration | `POST /api/invoices/chat` cadastrando PJ em `db.companies`, persistindo endereço e validando Módulo 11 | M1 | DONE | ORIGINAL_REQUEST § R1, Survey |
| F6 | CRM Companies Address Persistence | `POST /api/companies` e `PATCH /api/companies/:id` persistindo campos completos de endereço e fiscais | M2 | DONE | ORIGINAL_REQUEST § R2, Survey |
| F7 | CRM Guests Address Persistence | `POST /api/pms/guests` e `PUT/PATCH /api/pms/guests/:id` persistindo campos completos de endereço e fiscais | M2 | DONE | ORIGINAL_REQUEST § R2, Survey |
| F8 | CRM Modals UI Expansion | Expandir modais de Empresa e Hóspede em `crm-guests.tsx` com campos de endereço e fiscais completos | M2 | DONE | ORIGINAL_REQUEST § R2, Survey |
| F9 | Fiscal Invoices Multi-Entity Selector | Seletor em `fiscal-invoices.tsx` buscando Hóspedes (PF), Empresas (PJ) e Reservas ativas/recentes | M2 | DONE | ORIGINAL_REQUEST § R2, Survey |
| F10 | Auto-Fill & PJ/PF Tomador Toggle | Auto-preenchimento da Empresa como Tomador para hóspede com `companyId`, com toggle rápido PJ ↔ PF | M2 | DONE | ORIGINAL_REQUEST § R2, Survey |
| F11 | URL Params Prefill in `/notas` | Capturar e preencher flat, checkin, checkout, valor, diárias, resCode, doc e companyId via URL | M2 | DONE | ORIGINAL_REQUEST § R2, Survey |
| F12 | WhatsApp Fiscal Inbound Interceptor | Interceptar pedidos de NFS-e no WhatsApp cruzando telefone titular e `requesterInfo` com CRM | M3 | DONE | ORIGINAL_REQUEST § R3, Survey |
| F13 | WhatsApp No-Repeat Flow for Linked Companies | Confirmar dados da empresa vinculada no WhatsApp sem solicitar dados novamente, ativando `autoEmitInvoice` | M3 | DONE | ORIGINAL_REQUEST § R3, Survey |
| F14 | WhatsApp Fiscal Onboarding Flow | Mensagem acolhedora pedindo dados PJ vs PF para contatos sem empresa vinculada (`awaitingFiscalData`) | M3 | DONE | ORIGINAL_REQUEST § R3, Survey |
| F15 | Modulo 11 Validation & Sanitization | Validar dígitos verificadores CPF/CNPJ, sanitizar via `toTitleCase` preservando siglas, `cleanPhone`, `cleanCep` | M3 | DONE | ORIGINAL_REQUEST § R3, Survey |
| F16 | Automated CNPJ & CEP Enrichment | Consulta local em `db.companies` + BrasilAPI/ViaCEP para completar razão social, nome fantasia e endereço | M3 | DONE | ORIGINAL_REQUEST § R3, Survey |
| F17 | CRM Binding & WhatsApp Confirmation | Criar/atualizar Empresa ou Hóspede, vincular à reserva, ativar `autoEmitInvoice` e responder confirmação no WhatsApp | M3 | DONE | ORIGINAL_REQUEST § R3, Survey |
| F18 | Twin-Server Sync & SHA-256 Parity | Sincronizar módulos auxiliares para `scripts/` e garantir paridade 100% SHA-256 com `artifacts/api-server/` | M4 | DONE | ORIGINAL_REQUEST § R4, Survey |
| F19 | Frontend Production Build | Executar `npm run build` em `artifacts/limpeza` gerando `dist/` atualizado sem erros | M4 | DONE | ORIGINAL_REQUEST § R4, Survey |
| F20 | Dedicated Test Suite Execution | Executar exclusivamente `tests/nfse-crm-whatsapp-flow.test.mjs` com 100% de aprovação e commit/push | M4 | DONE | ORIGINAL_REQUEST § R4, AGENTS.md |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | NFS-e Backend Engine Fixes & Unified Emission | F1, F2, F3, F4, F5 (`demo-server.mjs`, `giss-soap.mjs`, `national-nfse.mjs`, `chat-service.mjs`) | none | DONE |
| M2 | CRM 360° Alignment & Fiscal Invoices UI | F6, F7, F8, F9, F10, F11 (`demo-server.mjs`, `crm-guests.tsx`, `fiscal-invoices.tsx`) | M1 | DONE |
| M3 | WhatsApp Fiscal Assistant Flow & Automated Enrichment | F12, F13, F14, F15, F16, F17 (`whatsapp-ai-service.mjs`, `zapi-service.mjs`, `lookup.mjs`) | M1, M2 | DONE |
| M4 | Twin Parity, Dedicated Test Suite, Build & Git Push | F18, F19, F20 (`tests/nfse-crm-whatsapp-flow.test.mjs`, build, git commit/push) | M1, M2, M3 | DONE |

---

## Interface Contracts

### Endpoints Backend
- `POST /api/nfse/emit`
  - Body: `{ reservationId?, guestId?, companyId?, sistemaEmissor?, tomadorCpfCnpj, tomadorNome, tomadorEndereco, tomadorNumero, tomadorComplemento, tomadorBairro, tomadorCep, tomadorCidade, tomadorUf, tomadorCodigoMunicipio, tomadorEmail, tomadorTelefone, valorServico, discriminacao, flatNumber?, checkinDate?, checkoutDate? }`
  - Response (201): `{ success: true, invoice, numeroNfse, numeroNota, codigoVerificacao, danfseUrl, linkPrefeitura, qrCodeUrl, message }`
- `POST /api/companies` & `PATCH /api/companies/:id`
  - Body: `{ corporateName, tradeName, cnpj, stateRegistration, municipalRegistration, financialEmail, phone, contactPerson, billingTerms, notes, address, logradouro, number, complement, neighborhood, bairro, cep, city, cidade, state, uf, ibgeCode, codigoMunicipio }`
- `POST /api/pms/guests` & `PUT /api/pms/guests/:id`
  - Body: `{ ..., address, logradouro, number, complement, neighborhood, bairro, cep, city, state, uf, ibgeCode, companyId, autoEmitInvoice }`
- `POST /api/whatsapp/webhook/received`
  - Interceptação de intenção fiscal no processamento de mensagens inbound com controle de estado `conv.awaitingFiscalData`.

---

## Code Layout
- **Backend API & Engines**:
  - `artifacts/api-server/demo-server.mjs`
  - `artifacts/api-server/giss-soap.mjs`
  - `artifacts/api-server/national-nfse.mjs`
  - `artifacts/api-server/chat-service.mjs`
  - `artifacts/api-server/lookup.mjs`
  - `artifacts/api-server/whatsapp-ai-service.mjs`
  - `artifacts/api-server/zapi-service.mjs`
- **Backend Twin Mirror (Paridade Estrita 100% SHA-256)**:
  - `scripts/demo-server.mjs`
  - `scripts/giss-soap.mjs`
  - `scripts/national-nfse.mjs`
  - `scripts/chat-service.mjs`
  - `scripts/lookup.mjs`
  - `scripts/whatsapp-ai-service.mjs`
  - `scripts/zapi-service.mjs`
- **Frontend SPA**:
  - `artifacts/limpeza/src/pages/crm-guests.tsx`
  - `artifacts/limpeza/src/pages/fiscal-invoices.tsx`
  - `artifacts/limpeza/dist/` (build de produção)
- **Testes Pontuais**:
  - `tests/nfse-crm-whatsapp-flow.test.mjs`

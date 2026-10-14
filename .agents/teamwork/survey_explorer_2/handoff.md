# Relatório de Investigação — Survey Explorer 2
**Módulo**: CRM 360° Models & Fiscal Invoices UI (Empresas, Hóspedes e Emissão de Notas Fiscais)  
**Data**: 2026-10-14  
**Agente**: Survey Explorer 2 (`survey_explorer_2`)  

---

## 1. Observation (Observações Diretas)

### 1.1 Backend: Modelagem e Endpoints do CRM (`artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`)

#### A. Empresas (`db.companies`, `GET/POST /api/companies`, `PATCH /api/companies/:id`)
- **Arquivo**: `artifacts/api-server/demo-server.mjs` (linhas 28669–28787).
- **Linha 28671–28701**: Inicialização de `db.companies` com amostras. Contém apenas:
  `id, corporateName, tradeName, cnpj, stateRegistration, municipalRegistration, financialEmail, phone, contactPerson, billingTerms, notes, createdAt`.
  **Não possui**: `cep, address/logradouro, number, complement, neighborhood, city, state/uf, ibgeCode`.
- **Linha 28705–28750 (`POST /api/companies`)**:
  ```javascript
  const {
    corporateName, tradeName, cnpj,
    stateRegistration = "", municipalRegistration = "",
    financialEmail = "", phone = "", contactPerson = "",
    billingTerms = "30 dias", notes = ""
  } = req.body;
  ```
  O objeto `newCompany` construído (linhas 28724–28737) **descarta completamente** quaisquer campos de endereço enviados no `req.body` (`cep`, `address`, `number`, `neighborhood`, `city`, `state`, `ibgeCode`).
- **Linha 28752–28769 (`PATCH /api/companies/:id`)**:
  Usa `Object.assign(company, req.body, { updatedAt: new Date().toISOString() })`, o que aceitaria campos extras, mas como o `POST` descarta e a tipagem/UI não os enviava, não havia persistência uniforme.

#### B. Hóspedes (`db.guests`, `GET/POST /api/pms/guests`, `PUT/PATCH /api/pms/guests/:id`)
- **Arquivo**: `artifacts/api-server/demo-server.mjs` (linhas 20673–21181).
- **Linha 20673**: Endpoint montado em `/api/pms/guests` (não existe rota `/api/guests`).
- **Linha 21141 (`POST /api/pms/guests`)**:
  ```javascript
  const { name, fullName, phone, email, document, documentNumber, city, notes, tags, isMonthlyGuest, clientType, autoEmitInvoice, companyId, preferences, docPhotoUrl, docPhotoBase64, hasMinor, minorAge, isCamposResident } = req.body;
  ```
  O `newGuest` (linhas 21156–21177) **descarta**: `cep`, `address/logradouro`, `number`, `complement`, `neighborhood`, `state/uf`, `ibgeCode`.
- **Linha 21026–21038 (`handleUpdateGuest` para `PUT` e `PATCH /api/pms/guests/:id`)**:
  Possui uma whitelist restrita de campos atualizáveis:
  ```javascript
  const fields = [
    "name", "fullName", "phone", "email", "document", "documentNumber", "city", "notes", "tags",
    "isMonthlyGuest", "clientType", "companyId", "preferences", "autoEmitInvoice",
    "docPhotoUrl", "hasMinor", "minorAge", "isCamposResident", "riskAttentionAlert", "riskAttentionReason"
  ];
  ```
  Quaisquer campos de endereço (`cep`, `address`, `number`, `neighborhood`, `state`, `ibgeCode`) enviados para atualização são **silenciosamente ignorados**.
- **Linha 5604–5682 (`mergeGuestRecords` em `reconcileAndMergeGuests`)**:
  Deduplicação funde `address`, `city`, `state`, `country`, mas **não funde** `cep`, `number`, `neighborhood`, `companyId`, `companyName`, `autoEmitInvoice`. Ao rodar a reconciliação, dados não mapeados correm risco de não serem preservados.

#### C. Reservas (`db.reservations`, `POST /api/pms/reservations`, `PUT /api/pms/reservations/:id`)
- **Linha 14809–15250 (`POST /api/pms/reservations`)**:
  Suporta `companyId`, `companyName`, `autoEmitInvoice`, `requesterType`, `requesterInfo`, `invoiceDetails`.
  - Se `invoiceDetails?.emitInvoice && invoiceDetails.type === "pj" && invoiceDetails.cnpj` (linhas 15069–15099): cria ou localiza `existingComp` em `db.companies` e vincula `guest.companyId = existingComp.id`, `guest.autoEmitInvoice = true`.
  - Se `requesterType === "other_person"` (linhas 15112–15159): cadastra/atualiza o solicitante em `db.guests` com tag `"solicitante_terceiro"`.
- **Linha 16315–16328 (`PUT /api/pms/reservations/:id`)**:
  Whitelist de campos já inclui `"autoEmitInvoice"`, `"companyId"`, `"companyName"`, `"requesterType"`, `"requesterInfo"`.
- **Linha 22133–22189 (Auto-emissão no Check-out)**:
  ```javascript
  const guest = db.guests ? db.guests.find(g => g.id === r.guestId || (g.document && g.document === r.guestDocument)) : null;
  const clientRequested = Boolean(r.autoEmitInvoice || (guest && guest.autoEmitInvoice));
  ...
  tomadorNome: r.guestName,
  tomadorCpfCnpj: doc,
  ```
  **Falha Crítica**: Mesmo quando a reserva possui `r.companyId` ou `guest.companyId`, a auto-emissão gera a nota sempre no CPF/Nome da pessoa física do hóspede (`r.guestName`, `doc`), ignorando os dados cadastrais da empresa vinculada como tomador legal.

#### D. Bug de Execução em `POST /api/nfse/emit`
- **Linha 27464–27474**:
  ```javascript
  res.status(201).json({
    success: true,
    invoice: newInvoice,
    numeroNfse: numNfseReal,
    numeroNota: numNfseReal,
    codigoVerificacao: codVerifReal,
    danfseUrl: `/api/nfse/danfse/${numNfseReal}`,
    linkPrefeitura: newInvoice.linkPrefeitura,
    qrCodeUrl: newInvoice.qrCodeUrl,
    message: `Nota Fiscal Nº ${numNfseReal} emitida com sucesso pelo GissOnline Municipal!`
  });
  ```
  As variáveis `numNfseReal` e `codVerifReal` **não existem no escopo da função**! O resultado real retornado pelo motor SOAP municipal está em `emissionResult.numeroNfse` e `emissionResult.codigoVerificacao` (atribuídos a `newInvoice.numeroNfse` e `newInvoice.codigoVerificacao`).
  **Resultado**: Lança `ReferenceError: numNfseReal is not defined`, gerando erro HTTP 500 mesmo após autorização na prefeitura.
- **Linha 27412–27443**: `newInvoice` **não persiste** os campos de endereço do tomador (`tomadorEndereco`, `tomadorNumero`, `tomadorBairro`, `tomadorCep`, `tomadorCidade`, `tomadorUf`, `tomadorCodigoMunicipio`).

---

### 1.2 UI do CRM: `artifacts/limpeza/src/pages/crm-guests.tsx`

#### A. Modal de Empresa (`companyModalOpen`, linhas 1608–1665)
- **Campos existentes no formulário JSX**:
  - CNPJ (`compCnpj`)
  - Razão Social (`compCorporateName`)
  - Nome Fantasia (`compTradeName`)
  - E-mail Financeiro (`compFinancialEmail`)
  - Condição de Faturamento (`compBillingTerms`)
- **Campos AUSENTES no formulário JSX**:
  - Inscrição Estadual (`stateRegistration`)
  - Inscrição Municipal (`municipalRegistration`)
  - CEP (`cep`)
  - Logradouro / Endereço (`address`)
  - Número (`number`)
  - Complemento (`complement`)
  - Bairro (`neighborhood`)
  - Cidade (`city`)
  - UF (`state`)
  - Código IBGE (`ibgeCode`)
  - Telefone / WhatsApp (`phone`)
  - Contato / Responsável (`contactPerson`)
  - Observações (`notes`)
- **No `handleSaveCompany` (linhas 379–418)**:
  O payload enviado para `/api/companies` não incluía `compCep`, `compAddress`, `compCity`, `compNumber`, `compNeighborhood`, `compState`, `compIbgeCode`.
- **Na tabela de Empresas (linhas 893–902)**:
  Existe apenas botão "Editar". Falta botão de atalho rápido "Emitir NFS-e" direcionando para `/notas?doc=${c.cnpj}&nome=...&companyId=${c.id}`.

#### B. Modal de Hóspede (`guestModalOpen`, linhas 1452–1605)
- **Campos existentes no formulário JSX**:
  - Nome Completo (`formName`)
  - CPF / Documento (`formDocument`)
  - WhatsApp / Celular (`formPhone`)
  - E-mail (`formEmail`)
  - Cidade / UF (`formCity` — campo de texto único)
  - Empresa Parceira (`formCompanyId` — select dropdown)
  - Mensalista Switch (`formIsMonthlyGuest`)
  - Auto-Emitir Nota Fiscal Switch (`formAutoInvoice`)
  - Observações / Preferências (`formNotes`, `formPreferences`)
  - Anexo de Documento Oficial (`formDocPhotoUrl`)
- **Campos AUSENTES no formulário JSX**:
  - CEP (`formCep`)
  - Logradouro / Endereço (`formAddress`)
  - Número (`formNumber`)
  - Complemento (`formComplement`)
  - Bairro (`formNeighborhood`)
  - UF / Estado separado (`formState`)
  - Código IBGE (`formIbgeCode`)
- **No `handleSaveGuest` (linhas 298–347)**:
  O payload para `/api/pms/guests` omite CEP, Logradouro, Número, Bairro, UF e IBGE.

---

### 1.3 UI de Notas Fiscais: `artifacts/limpeza/src/pages/fiscal-invoices.tsx`

#### A. Seletor Atual do CRM (linhas 554–604)
- **Combobox atual**:
  - Busca exclusivamente em `guests` (`fetchGuests()` de `/api/pms/guests`).
  - **Não busca Empresas (PJ)**: Empresas não são carregadas na página (`fetchCompanies` ausente).
  - **Não busca Reservas**: Reservas não são carregadas no combobox.
- **Função `handleSelectGuest(g)` (linhas 205–241)**:
  - Endereço é chumbado com valores fixos:
    `tomadorEndereco: "Av. Pelinca, 100"`, `tomadorCep: "28035000"`.
  - **Ignora `g.companyId`**: Mesmo se o hóspede tiver empresa vinculada, não preenche a empresa como Tomador.
  - **Não possui alternância rápida de Tomador (PJ ↔ PF)**.
  - **Não preenche os dados da estadia**: Não preenche `flatNumber`, `checkIn`, `checkOut`, `valorServico`, `quantidadeDiarias` a partir da reserva do hóspede.

#### B. Parâmetros de URL recebidos na página `/notas` (linhas 150–171)
- **Código atual**:
  ```javascript
  const urlParams = new URLSearchParams(window.location.search);
  const docParam = urlParams.get("doc");
  const nomeParam = urlParams.get("nome");
  ```
- **Campos faltantes na captura de URL**:
  - `flat` / `flatNumber`
  - `checkin` / `checkIn`
  - `checkout` / `checkOut`
  - `valor` / `valorServico`
  - `diarias` / `quantidadeDiarias`
  - `resCode` / `reservationId`
  - `companyId`
  - `guestId`

---

## 2. Logic Chain (Cadeia de Raciocínio Lógico)

1. **Premissa 1 (R2)**: A nota fiscal de hotelaria corporativa no Brasil exige que o Tomador dos Serviços seja a pessoa jurídica (PJ com CNPJ, Razão Social e Endereço Fiscal) quando a empresa financia ou contrata a hospedagem de seus colaboradores, enquanto os dados da pessoa física (hóspede), apartamento e período devem constar detalhados na Discriminação dos Serviços.
2. **Premissa 2 (Observação 1.1A & 1.1B)**: O backend atual (`demo-server.mjs`) e os formulários de cadastro no frontend (`crm-guests.tsx`) descartam campos fiscais vitais de endereço (CEP, Logradouro, Número, Bairro, UF, IBGE) tanto para empresas quanto para hóspedes.
3. **Premissa 3 (Observação 1.1C)**: As rotas de criação/edição de reserva já suportam `companyId` e `autoEmitInvoice`, mas o gatilho de check-out ignora `companyId` e emite nota sempre no CPF do hóspede.
4. **Premissa 4 (Observação 1.1D)**: A rota `POST /api/nfse/emit` contém erro de compilação/execução (`ReferenceError` em `numNfseReal` e `codVerifReal`), quebrando qualquer emissão manual ou automática.
5. **Premissa 5 (Observação 1.3A & 1.3B)**: A interface `fiscal-invoices.tsx` possui um assistente IA e formulário estruturado, mas seu combobox está restrito a hóspedes físicos, chumba endereço fixo, não carrega reservas ativas nem empresas, e não lê parâmetros de estadia da URL.
6. **Conclusão Lógica**: Para atender integralmente ao R2 (e subsidiar R1 e R3), é necessário:
   - Expandir a modelagem e persistência backend em `db.companies` e `db.guests` para contemplar todos os campos fiscais e de endereço completos.
   - Corrigir o bug de retorno em `POST /api/nfse/emit` e garantir persistência de endereço na NFS-e gerada.
   - Implementar no modal de empresa e no modal de hóspede de `crm-guests.tsx` a edição e consulta (via CEP/CNPJ) de todos os campos fiscais.
   - Refatorar o combobox de `fiscal-invoices.tsx` em um seletor unificado multientidade (Hóspedes, Empresas, Reservas), com pré-preenchimento automático do Tomador PJ quando houver `companyId`, preenchimento da estadia e botão de alternância rápida de Tomador (PJ ↔ PF).
   - Expandir o parsing de parâmetros de URL em `fiscal-invoices.tsx`.

---

## 3. Caveats (Ressalvas e Limitações)

1. **Paridade Byte a Byte**: Qualquer alteração em `artifacts/api-server/demo-server.mjs` deve ser espelhada byte a byte (100% SHA-256) em `scripts/demo-server.mjs`.
2. **Compatibilidade de Campos em `db.companies`**: Diversas fontes de dados (BrasilAPI, Receita, CRM legado) usam nomes ligeiramente variantes (`corporateName` vs `razaoSocial`, `tradeName` vs `nomeFantasia`, `phone` vs `telefone`, `address` vs `logradouro`). O backend e a UI devem suportar getters/fallbacks bidirecionais tolerantes.
3. **Escopo Estrito de Testes**: NUNCA executar `tests/*.test.mjs` em lote. Ao validar, rodar exclusivamente o teste pontual específico do fluxo (`tests/nfse-crm-whatsapp-flow.test.mjs`).
4. **Código IBGE de Campos**: O código municipal padrão para Campos dos Goytacazes/RJ é `3301009`. Quando o município for Campos dos Goytacazes, `ibgeCode` / `codigoMunicipio` deve ser garantido como `3301009`.

---

## 4. Conclusion & Actionable Proposals (Conclusão e Propostas Práticas)

### 4.1 Proposta de Correção no Backend (`artifacts/api-server/demo-server.mjs`)

#### A. Ajustar `POST /api/companies` e `PATCH /api/companies/:id` (Linha ~28705)
Incluir na desestruturação e no objeto salvo:
```javascript
const {
  corporateName, tradeName, cnpj,
  stateRegistration = "", municipalRegistration = "",
  financialEmail = "", phone = "", contactPerson = "",
  billingTerms = "30 dias", notes = "",
  cep = "", address = "", logradouro = "",
  number = "", numero = "", complement = "", complemento = "",
  neighborhood = "", bairro = "", city = "", municipio = "",
  state = "", uf = "", ibgeCode = "", codigoIbge = ""
} = req.body;

const newCompany = {
  id: db.companies.length > 0 ? Math.max(...db.companies.map(c => c.id)) + 1 : 1,
  corporateName: corporateName.trim(),
  tradeName: (tradeName || corporateName).trim(),
  cnpj: (cnpj || "Isento / Não informado").trim(),
  stateRegistration: stateRegistration.trim(),
  municipalRegistration: municipalRegistration.trim(),
  financialEmail: financialEmail.trim().toLowerCase(),
  phone: phone.trim(),
  contactPerson: contactPerson.trim(),
  billingTerms: billingTerms.trim(),
  notes: notes.trim(),
  cep: (cep || "").replace(/\D/g, ""),
  address: (address || logradouro || "").trim(),
  number: (number || numero || "").trim(),
  complement: (complement || complemento || "").trim(),
  neighborhood: (neighborhood || bairro || "").trim(),
  city: (city || municipio || "Campos dos Goytacazes").trim(),
  state: (state || uf || "RJ").trim().toUpperCase(),
  ibgeCode: (ibgeCode || codigoIbge || "3301009").trim(),
  createdAt: new Date().toISOString()
};
```

#### B. Ajustar `POST /api/pms/guests` e `handleUpdateGuest` (Linhas ~21026 e ~21140)
Adicionar à lista `fields` e ao objeto `newGuest`:
`"cep", "address", "logradouro", "number", "numero", "complement", "complemento", "neighborhood", "bairro", "city", "municipio", "state", "uf", "ibgeCode", "codigoIbge", "companyId", "companyName", "autoEmitInvoice"`.

#### C. Ajustar `reconcileAndMergeGuests` / `mergeGuestRecords` (Linhas ~5620–5682)
Adicionar fusão de `cep`, `number`, `complement`, `neighborhood`, `companyId`, `companyName`, `autoEmitInvoice`:
```javascript
if (!target.cep && source.cep) target.cep = source.cep;
if (!target.number && (source.number || source.numero)) target.number = source.number || source.numero;
if (!target.neighborhood && (source.neighborhood || source.bairro)) target.neighborhood = source.neighborhood || source.bairro;
if (!target.companyId && source.companyId) target.companyId = source.companyId;
if (!target.companyName && source.companyName) target.companyName = source.companyName;
if (source.autoEmitInvoice !== undefined && target.autoEmitInvoice === undefined) target.autoEmitInvoice = source.autoEmitInvoice;
```

#### D. Corrigir Bug de Variáveis Indefinidas em `POST /api/nfse/emit` (Linha ~27464)
Substituir:
```javascript
// ANTES (Quebra com ReferenceError):
numeroNfse: numNfseReal,
numeroNota: numNfseReal,
codigoVerificacao: codVerifReal,
danfseUrl: `/api/nfse/danfse/${numNfseReal}`,

// DEPOIS (Corrigido):
const nNota = emissionResult.numeroNfse || newInvoice.numeroNfse;
const cVerif = emissionResult.codigoVerificacao || newInvoice.codigoVerificacao;

res.status(201).json({
  success: true,
  invoice: newInvoice,
  numeroNfse: nNota,
  numeroNota: nNota,
  codigoVerificacao: cVerif,
  danfseUrl: `/api/nfse/danfse/${nNota}`,
  linkPrefeitura: newInvoice.linkPrefeitura,
  qrCodeUrl: newInvoice.qrCodeUrl,
  message: `Nota Fiscal Nº ${nNota} emitida com sucesso pelo GissOnline Municipal!`
});
```
E incluir na criação de `newInvoice` os campos de endereço completos do tomador:
```javascript
tomadorEndereco: req.body.tomadorEndereco || req.body.tomadorLogradouro || "",
tomadorNumero: req.body.tomadorNumero || "",
tomadorBairro: req.body.tomadorBairro || "",
tomadorCep: req.body.tomadorCep ? onlyDigits(req.body.tomadorCep) : "",
tomadorCidade: req.body.tomadorCidade || req.body.tomadorMunicipio || "Campos dos Goytacazes",
tomadorUf: req.body.tomadorUf || "RJ",
tomadorCodigoMunicipio: req.body.tomadorCodigoMunicipio || "3301009",
```

#### E. Corrigir Tomador da Auto-Emissão no Check-out (Linha ~22150)
Verificar se há empresa vinculada à reserva (`r.companyId`) ou ao hóspede (`guest?.companyId`):
```javascript
let resolvedTomadorNome = r.guestName;
let resolvedTomadorDoc = r.guestDocument || guest?.document || "000.000.000-00";
let resolvedTomadorEmail = r.guestEmail || guest?.email || "";
let resolvedTomadorPhone = r.guestPhone || guest?.phone || "";
let resolvedTomadorEndereco = guest?.address || "";
let resolvedTomadorCep = guest?.cep || "";

const activeCompId = r.companyId || guest?.companyId;
if (activeCompId && db.companies) {
  const linkedCompany = db.companies.find(c => Number(c.id) === Number(activeCompId));
  if (linkedCompany) {
    resolvedTomadorNome = linkedCompany.corporateName;
    resolvedTomadorDoc = linkedCompany.cnpj;
    resolvedTomadorEmail = linkedCompany.financialEmail || resolvedTomadorEmail;
    resolvedTomadorPhone = linkedCompany.phone || resolvedTomadorPhone;
    resolvedTomadorEndereco = linkedCompany.address || resolvedTomadorEndereco;
    resolvedTomadorCep = linkedCompany.cep || resolvedTomadorCep;
  }
}
```

---

### 4.2 Proposta de Ajustes na UI: `crm-guests.tsx`

1. **Modal de Empresa (`companyModalOpen`)**:
   - Adicionar inputs para:
     - `Inscrição Estadual` e `Inscrição Municipal` (grid de 2 colunas)
     - `CEP` (com botão de busca ou consulta automática de 8 dígitos chamando `/api/invoices/lookup-cep/:cep`)
     - `Logradouro / Endereço` e `Número`
     - `Complemento` e `Bairro`
     - `Cidade`, `UF` e `Código IBGE`
     - `Telefone` e `Contato / Responsável`
   - Atualizar `handleSaveCompany` para persistir todos esses campos.
   - Atualizar `handleEditCompany` para carregar esses campos no estado do form.
   - Atualizar `handleLookupCnpj` para preencher número, bairro, cidade, uf e cep retornados da BrasilAPI.
   - Na listagem de empresas, adicionar o botão "NFS-e" direcionando para `/notas?doc=${c.cnpj}&nome=${encodeURIComponent(c.corporateName)}&companyId=${c.id}`.

2. **Modal de Hóspede (`guestModalOpen`)**:
   - Adicionar seção "Endereço Fiscal / Residencial":
     - `CEP` (com consulta automática ao preencher 8 dígitos)
     - `Endereço / Logradouro` e `Número`
     - `Complemento` e `Bairro`
     - `Cidade` e `UF`
   - Atualizar `handleSaveGuest` e `handleEditGuest` para persistir e carregar os dados de endereço.

---

### 4.3 Proposta de Ajustes na UI: `fiscal-invoices.tsx`

1. **Carregamento de Coleções Completas**:
   - Adicionar `fetchCompanies()` (`GET /api/companies`) salvando em estado `companies`.
   - Adicionar `fetchReservations()` (`GET /api/pms/calendar`) salvando em estado `reservations`.

2. **Seletor Inteligente CRM 360° (Combobox Triplo)**:
   - Campo de busca filtra simultaneamente:
     - **Empresas**: nome, CNPJ, e-mail.
     - **Hóspedes**: nome, CPF, e-mail, telefone.
     - **Reservas**: código (`RES-...`), flat, nome do hóspede, datas.
   - Resultados organizados com divisões visuais e badges coloridos:
     - 🏢 Empresa Parceira (PJ)
     - 👤 Hóspede (PF)
     - 📅 Reserva Ativa / Recente

3. **Lógica de Seleção e Alternância Rápida PJ ↔ PF**:
   - Manter estados:
     ```typescript
     const [selectedEntity, setSelectedEntity] = useState<any | null>(null);
     const [selectedType, setSelectedType] = useState<"guest" | "company" | "reservation" | null>(null);
     const [linkedCompany, setLinkedCompany] = useState<any | null>(null);
     const [linkedGuest, setLinkedGuest] = useState<any | null>(null);
     const [activeReservation, setActiveReservation] = useState<any | null>(null);
     const [tomadorMode, setTomadorMode] = useState<"pj" | "pf">("pf");
     ```
   - **Quando selecionar Hóspede com Empresa Vinculada (`companyId`)**:
     1. Localiza a empresa correspondente em `companies`.
     2. Define `tomadorMode = "pj"` por padrão.
     3. Preenche os dados do Tomador com a **Empresa (PJ)** (CNPJ formatado, Razão Social, Logradouro, Número, Bairro, CEP, E-mail Financeiro, Telefone).
     4. Busca a reserva ativa ou mais recente do hóspede: preenche Flat, Check-in, Check-out, Diárias e Valor.
     5. Monta a Discriminação do Serviço identificando o hóspede beneficiário:
        `"Nota relativa à hospedagem de {g.fullName} no Flat {flat} de {cin} a {cout} ({dias} diárias)..."`
     6. **Renderiza Banner de Alternância Rápida**:
        ```tsx
        <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-600" />
            <div className="text-xs">
              <span className="font-bold text-slate-900 dark:text-slate-100">
                Tomador: {tomadorMode === "pj" ? `Empresa ${linkedCompany.tradeName || linkedCompany.corporateName}` : `Hóspede ${selectedGuest.fullName}`}
              </span>
              <span className="text-muted-foreground block text-[10px]">
                {tomadorMode === "pj" ? `CNPJ: ${linkedCompany.cnpj}` : `CPF: ${selectedGuest.documentNumber}`}
              </span>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleToggleTomadorMode()}
            className="h-7 text-[11px] font-bold rounded-xl"
          >
            {tomadorMode === "pj" ? "Alternar para Hóspede (PF)" : "Alternar para Empresa (PJ)"}
          </Button>
        </div>
        ```
   - Ao alternar (`handleToggleTomadorMode`), atualiza instantaneamente `extractedData` e campos do formulário para os dados da outra entidade, preservando inalterados o valor, datas, flat e diárias.

4. **Tratamento Completo de Parâmetros de URL no `useEffect`**:
   Expandir leitura dos parâmetros:
   ```typescript
   const urlParams = new URLSearchParams(window.location.search);
   const docParam = urlParams.get("doc") || urlParams.get("cpf") || urlParams.get("cnpj");
   const nomeParam = urlParams.get("nome") || urlParams.get("name") || urlParams.get("razaoSocial");
   const flatParam = urlParams.get("flat") || urlParams.get("flatNumber");
   const checkinParam = urlParams.get("checkin") || urlParams.get("checkIn");
   const checkoutParam = urlParams.get("checkout") || urlParams.get("checkOut");
   const valorParam = urlParams.get("valor") || urlParams.get("valorServico");
   const resCodeParam = urlParams.get("resCode") || urlParams.get("reservationId");
   const companyIdParam = urlParams.get("companyId");
   const guestIdParam = urlParams.get("guestId");
   ```
   Se houver parâmetros, aplicar match automático com a lista de reservas, empresas e hóspedes já carregados e preencher formulário e chat.

---

## 5. Verification Method (Método de Verificação Independente)

1. **Inspeção de Código e Arquivos**:
   - Inspecionar `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` para confirmar que `numNfseReal` e `codVerifReal` foram corrigidos e que os campos de endereço são salvos.
   - Verificar paridade SHA-256 entre os servidores gêmeos.
   - Inspecionar `artifacts/limpeza/src/pages/crm-guests.tsx` e `artifacts/limpeza/src/pages/fiscal-invoices.tsx`.

2. **Compilação do Frontend**:
   - Executar: `npm --prefix artifacts/limpeza run build`
   - O código deve compilar com código de saída 0.

3. **Execução Estrita do Teste Pontual Dedicado (`AGENTS.md`)**:
   - Rodar exclusivamente: `node --test tests/nfse-crm-whatsapp-flow.test.mjs`
   - Asserções que o teste deve conter:
     - `POST /api/companies` e `PATCH /api/companies/:id` persistem `cep`, `address`, `number`, `neighborhood`, `city`, `state`, `ibgeCode`.
     - `POST /api/pms/guests` e `PATCH /api/pms/guests/:id` persistem campos de endereço completos e `companyId`.
     - `POST /api/nfse/emit` conclui com status 201 e retorna `numeroNfse`, `codigoVerificacao` e `danfseUrl` sem `ReferenceError`.
     - Auto-emissão no check-out de reserva com `companyId` emite a nota em nome da Empresa PJ vinculada.

4. **Condições de Invalidação**:
   - Se qualquer chamada a `POST /api/nfse/emit` lançar `ReferenceError: numNfseReal is not defined`.
   - Se criar uma empresa via `/api/companies` com endereço e um `GET /api/companies` retornar a empresa sem campos de endereço.
   - Se selecionar um hóspede com `companyId` em `fiscal-invoices.tsx` e o tomador permanecer no CPF do hóspede sem alternância para a empresa.

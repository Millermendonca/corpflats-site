# Task Assignment: Worker M2 (CRM 360° Alignment & Fiscal Invoices UI)
Working Directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2
Role: teamwork_preview_worker

## Escopo e Instruções
Você deve implementar as funcionalidades de M2 (Features F6 a F11) conforme especificado em `ORIGINAL_REQUEST.md`, `PROJECT.md` e no relatório de `survey_explorer_2`:

1. **Persistência de Campos Fiscais e de Endereço em Empresas (`demo-server.mjs`)**:
   - Em `POST /api/companies` e `PATCH /api/companies/:id`:
     - Aceitar e persistir: `address`, `logradouro`, `number`, `complement`, `neighborhood`, `bairro`, `cep`, `city`, `cidade`, `state`, `uf`, `ibgeCode`, `codigoMunicipio`, `stateRegistration`, `municipalRegistration`, `financialEmail`, `phone`, `contactPerson`, `billingTerms`, `notes`.
     - Normalizar para aceitar tanto chaves em português quanto em inglês (`address` / `logradouro`, `neighborhood` / `bairro`, etc.).

2. **Persistência de Campos Fiscais e de Endereço em Hóspedes (`demo-server.mjs`)**:
   - Em `POST /api/pms/guests` e `PUT/PATCH /api/pms/guests/:id`:
     - Adicionar à whitelist e persistir: `address`, `logradouro`, `number`, `complement`, `neighborhood`, `bairro`, `cep`, `city`, `state`, `uf`, `ibgeCode`, `companyId`, `autoEmitInvoice`.
   - Em `mergeGuestRecords` (linhas 5604–5682), garantir preservação de `cep`, `number`, `neighborhood`, `companyId`, `companyName`, `autoEmitInvoice`.

3. **Expansão dos Modais de CRM em `artifacts/limpeza/src/pages/crm-guests.tsx`**:
   - **Modal de Empresa (`companyModalOpen`)**:
     - Adicionar inputs para: CEP, Logradouro, Número, Complemento, Bairro, Cidade, UF, Código IBGE, Inscrição Estadual, Inscrição Municipal, Telefone, Contato.
     - Garantir que `handleSaveCompany` envie todos esses campos para `/api/companies`.
     - Na tabela de empresas, adicionar atalho "Emitir NFS-e" direcionando para `/notas?doc=${c.cnpj}&nome=${encodeURIComponent(c.corporateName)}&companyId=${c.id}`.
   - **Modal de Hóspede (`guestModalOpen`)**:
     - Adicionar inputs para: CEP, Logradouro, Número, Complemento, Bairro, UF, IBGE.
     - Garantir que `handleSaveGuest` envie esses campos para `/api/pms/guests`.

4. **Seletor Unificado do CRM e Alternância de Tomador em `artifacts/limpeza/src/pages/fiscal-invoices.tsx`**:
   - Atualizar a busca do CRM para carregar e pesquisar tanto **Hóspedes (PF)** quanto **Empresas (PJ)** e Reservas ativas/recentes.
   - Quando um Hóspede selecionado possuir `companyId` (empresa vinculada no CRM):
     - Preencher automaticamente os dados da **Empresa** como Tomador da NFS-e (CNPJ, Razão Social, Endereço completo, CEP, Cidade, UF, E-mail Financeiro, Telefone).
     - Manter na **Discriminação do Serviço** o nome do hóspede, flat, check-in, check-out e diárias.
     - Disponibilizar na interface um botão/toggle rápido para alternar o Tomador entre a *Empresa Vinculada (PJ)* e o *Próprio Hóspede (PF)*.
   - Preencher dados da estadia a partir da reserva (flat, datas, valor, diárias).
   - Capturar parâmetros da URL (`flat`, `checkin`, `checkout`, `valor`, `diarias`, `resCode`, `doc`, `nome`, `companyId`, `guestId`) e preencher o formulário.

5. **Paridade Twin-Server & Build**:
   - Manter paridade 100% SHA-256 entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`.
   - Executar `npm run build` em `artifacts/limpeza` para assegurar compilação com saída 0.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Ao concluir, atualize seu `progress.md`, crie seu `handoff.md` e envie mensagem para o orquestrador.

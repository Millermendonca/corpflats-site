# Task Assignment: Worker M1 (NFS-e Backend Engine Fixes & Unified Emission)
Working Directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1
Role: teamwork_preview_worker

## Escopo e Instruções
Você deve implementar as correções e aperfeiçoamentos de M1 (Features F1 a F5) conforme identificado pelos Survey Explorers 1, 2 e 3:

1. **Correção do Bug de Variáveis Indefinidas em `POST /api/nfse/emit` (`demo-server.mjs`)**:
   - Eliminar o `ReferenceError: numNfseReal is not defined` / `codVerifReal is not defined`.
   - Utilizar `emissionResult.numeroNfse || emissionResult.numeroNota` e `emissionResult.codigoVerificacao`.
   - Em `giss-soap.mjs`, certificar que o retorno de `emitirNfseGissReal` mapeie `numeroNfse: numeroNota` e `codigoVerificacao`.

2. **Suporte Completo aos Motores Dual (GISS Municipal e Padrão Nacional ADN)**:
   - Na rota `POST /api/nfse/emit`:
     - Respeitar o motor solicitado no body (`sistemaEmissor`, ex: `"giss_prefeitura"` ou `"padrao_nacional"`) ou fallback para `db.nfseConfig.padrao`.
     - Se `padrao_nacional`: invocar `processNationalInvoiceEmission(db, invoiceData, options)`.
     - Se `giss_prefeitura`: invocar `emitirNfseGissReal(invoiceData, cert, options)`.
     - Manter fallback resiliente caso o WebService externo esteja indisponível ou em ambiente de teste (`NODE_ENV === "test"`).

3. **Repasse e Persistência Integral de Dados de Endereço do Tomador**:
   - Na rota `POST /api/nfse/emit`, desestruturar: `tomadorEndereco`, `tomadorNumero`, `tomadorComplemento`, `tomadorBairro`, `tomadorCep`, `tomadorCidade`, `tomadorUf`, `tomadorCodigoMunicipio`, `tomadorEmail`, `tomadorTelefone`.
   - Repassar esses dados completos aos motores (`giss-soap.mjs` e `national-nfse.mjs`).
   - Persistir esses campos integralmente no objeto `newInvoice` salvo em `db.invoices`.

4. **Auto-Emissão Inteligente no Check-out e Fila Fiscal**:
   - Em `app.post("/api/pms/reservations/:id/checkout")`:
     - Quando `shouldAutoEmit` for verdadeiro, verificar se a reserva ou o hóspede possui empresa vinculada (`r.companyId || guest?.companyId`).
     - Se houver empresa vinculada em `db.companies`: o Tomador da NFS-e DEVE receber os dados da Empresa PJ (CNPJ, Razão Social / Nome, Endereço completo, CEP, Cidade, UF, Código IBGE, E-mail financeiro, Telefone).
     - A discriminação do serviço deve detalhar os dados do hóspede e da estadia: Nome do Hóspede, Apartamento/Flat, datas de Check-in e Check-out, diárias e valor (utilizando o formatador com template `formatarDescricaoComTemplate`).

5. **Aperfeiçoamento do Chat Fiscal (`POST /api/invoices/chat` e `chat-service.mjs`)**:
   - Quando dados de PJ (CNPJ de 14 dígitos) forem informados no chat, cadastrar/atualizar em `db.companies` (e não apenas como hóspede em `db.guests`), preenchendo todos os dados cadastrais e de endereço obtidos no enriquecimento (`lookupCnpj`).
   - Validar dígitos verificadores via Módulo 11 (`isValidCpf` / `isValidCnpj`).
   - Permitir lookup de CEP direto quando um CEP avulso for informado.

6. **Paridade Twin-Server**:
   - Manter paridade estrita byte a byte (100% SHA-256) entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`.
   - Garantir que `scripts/` possua os arquivos `giss-soap.mjs`, `national-nfse.mjs`, `chat-service.mjs`, `lookup.mjs` sincronizados.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Ao concluir, atualize seu `progress.md`, gere `handoff.md` e envie mensagem para o orquestrador.


## 2026-10-14T10:00:05Z
Você é o Worker M1 (NFS-e Backend Engine Fixes & Unified Emission).
Seu diretório de trabalho: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1

Leia atentamente:
1. Requisitos oficiais: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
2. Sua atribuição de tarefa: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1\DISPATCH.md
3. O relatório detalhado de auditoria de Explorer 1: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_1\handoff.md
4. O plano de arquitetura: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_9\PROJECT.md

Arquivos sob sua responsabilidade exclusiva de escrita para M1:
- `artifacts/api-server/demo-server.mjs`
- `artifacts/api-server/giss-soap.mjs`
- `artifacts/api-server/national-nfse.mjs`
- `artifacts/api-server/chat-service.mjs`
- Sincronização espelho idêntica em `scripts/` (`scripts/demo-server.mjs`, `scripts/giss-soap.mjs`, `scripts/national-nfse.mjs`, `scripts/chat-service.mjs`, `scripts/lookup.mjs`).

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Ao concluir todas as implementações e verificar a paridade twin-server, crie seu `progress.md`, escreva seu `handoff.md` no seu diretório de trabalho e envie mensagem ao orquestrador.

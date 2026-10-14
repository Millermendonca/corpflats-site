# Task Assignment: Test Writer M4 (Dedicated Test Suite `tests/nfse-crm-whatsapp-flow.test.mjs`)
Working Directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\test_writer_m4
Role: teamwork_preview_test_writer

## Escopo e Instruções
Você deve criar e validar o arquivo de teste pontual oficial `tests/nfse-crm-whatsapp-flow.test.mjs` para cobrir 100% dos requisitos de R1, R2, R3 e R4 especificados em `ORIGINAL_REQUEST.md`:

1. **Padrão Arquitetural de Testes Isolados (`AGENTS.md` & `tests/tariff-engine.test.mjs`)**:
   - Rodar com `node:test` e `node:assert`.
   - Definir `process.env.NODE_ENV = "test"`.
   - Remover `delete process.env.DATABASE_URL`.
   - Usar cópia isolada de banco em `os.tmpdir()` (`DATA_FILE` e `DATABASE_FILE`), garantindo que `data/database.json` real NÃO seja tocado (verificar mtime/hash).
   - Iniciar o servidor em porta efêmera livre (ex: 5099 / livre) ou usar sub-processo/módulo isolado.
   - Não silenciar notificações com guardas artificiais no código.

2. **Cenários Obrigatórios a serem Testados**:
   - **T1: Emissão de NFS-e Municipal e Nacional (`POST /api/nfse/emit`)**:
     * Emissão sem `ReferenceError` (verificar ausência do bug `numNfseReal`/`codVerifReal`).
     * Retorno com status 201, `numeroNfse`, `codigoVerificacao`, `danfseUrl`.
     * Persistência de todos os campos de endereço do tomador em `db.invoices`.
     * Teste com `sistemaEmissor: "giss_prefeitura"` e com `sistemaEmissor: "padrao_nacional"`.
     * Provar que consultas subsequentes a `GET /api/nfse/invoices` NÃO apagam as notas emitidas (bug do `getFiscalData`).
   - **T2: Check-out com Auto-Emissão Corporativa (`POST /api/pms/reservations/:id/checkout`)**:
     * Reserva com `autoEmitInvoice: true` e vinculada a `companyId`: verificar que a nota fiscal é emitida tendo a Empresa PJ como Tomador (CNPJ, Razão Social, Endereço completo) e discriminando hóspede, flat, check-in, check-out e diárias.
   - **T3: CRM 360° Endpoints de Empresas & Hóspedes**:
     * `POST /api/companies` e `PATCH /api/companies/:id`: salvar e carregar CNPJ, Razão Social, CEP, Endereço/Logradouro, Número, Bairro, Cidade, UF, Código IBGE, E-mail Financeiro.
     * `POST /api/pms/guests` e `PUT/PATCH /api/pms/guests/:id`: salvar e carregar campos de endereço, `companyId` e `autoEmitInvoice`.
   - **T4: Fluxo WhatsApp de Solicitação de NF (Sem Perguntas Repetidas para Empresa Vinculada)**:
     * Contato titular ou solicitante terceiro (`requesterInfo`) que JÁ possui empresa vinculada no CRM pede nota fiscal ("preciso de nota fiscal"):
       - Resposta imediata confirmando Razão Social e CNPJ já cadastrados.
       - NÃO solicitar dados novamente.
       - Ativação de `autoEmitInvoice = true` na reserva e pré-preenchimento de `invoiceDetails`.
   - **T5: Fluxo WhatsApp de Solicitação de NF (Onboarding para Não Vinculados)**:
     * Contato SEM empresa vinculada pede nota fiscal:
       - Resposta acolhedora solicitando dados (perguntando PJ vs PF).
       - Estado `awaitingFiscalData = true`.
   - **T6: Validação Módulo 11 & Tratamento de Erro Amigável**:
     * Envio de CNPJ ou CPF com dígitos verificadores matematicamente inválidos:
       - Resposta gentil no WhatsApp pedindo conferência.
       - NENHUM registro inválido gravado no CRM (`db.companies` ou `db.guests`).
   - **T7: Sanitização, Enriquecimento e Cadastro via WhatsApp**:
     * Resposta com CNPJ válido e e-mail:
       - Validação Módulo 11 aprovada.
       - Enriquecimento com razão social e endereço.
       - Sanitização via `toTitleCase` preservando siglas (LTDA, S/A, ME, EPP).
       - Cadastro/atualização em `db.companies` com endereço completo.
       - Vínculo com `db.guests` e reserva ativa (`autoEmitInvoice = true`).
       - Resposta de confirmação no WhatsApp.
     * Resposta com CPF válido e dados PF:
       - Validação Módulo 11 aprovada.
       - Cadastro/atualização em `db.guests` com endereço.
       - Vínculo na reserva (`autoEmitInvoice = true`).
       - Resposta de confirmação no WhatsApp.
   - **T8: Paridade Estrita dos Arquivos Gêmeos Twin-Server**:
     * Verificar que o hash SHA-256 de `artifacts/api-server/demo-server.mjs` é 100% idêntico a `scripts/demo-server.mjs`.
     * Verificar que `giss-soap.mjs`, `national-nfse.mjs`, `chat-service.mjs`, `lookup.mjs`, `whatsapp-ai-service.mjs`, `zapi-service.mjs` possuem hash SHA-256 idêntico entre `artifacts/api-server/` e `scripts/`.
   - **T9: Verificação de Build do Frontend**:
     * Verificar que os artefatos de `artifacts/limpeza/dist/public/` existem e que o build compila com código 0.

3. **Execução do Teste**:
   - Executar EXCLUSIVAMENTE `node --test tests/nfse-crm-whatsapp-flow.test.mjs`.
   - NUNCA executar `tests/*.test.mjs` nem testes de outros módulos (`AGENTS.md`).
   - Todos os testes devem passar com 100% de sucesso.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Ao concluir, atualize seu `progress.md`, crie seu `handoff.md` e envie mensagem para o orquestrador.


## 2026-10-14T11:11:22Z
Você é o Test Writer M4 (Dedicated Test Suite tests/nfse-crm-whatsapp-flow.test.mjs).
Seu diretório de trabalho: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\test_writer_m4

Leia atentamente:
1. Requisitos oficiais: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
2. Sua atribuição de tarefa: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\test_writer_m4\DISPATCH.md
3. O plano de arquitetura: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_9\PROJECT.md
4. Relatórios dos workers:
   - c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1\handoff.md
   - c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2\handoff.md
   - c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3\handoff.md

Arquivo sob sua responsabilidade exclusiva de escrita:
- `tests/nfse-crm-whatsapp-flow.test.mjs`

REGRA CRÍTICA DE EXECUÇÃO (AGENTS.md):
- Execute EXCLUSIVAMENTE o teste pontual `node --test tests/nfse-crm-whatsapp-flow.test.mjs`.
- É ESTRITAMENTE PROIBIDO executar testes globais (`tests/*.test.mjs`) ou outros módulos.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Ao concluir e validar que 100% dos testes passam, atualize seu `progress.md`, crie seu `handoff.md` e envie mensagem para o orquestrador.

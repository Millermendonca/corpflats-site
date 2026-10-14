# Task Assignment: Worker M3 (WhatsApp Fiscal Assistant Flow & Automated Enrichment)
Working Directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3
Role: teamwork_preview_worker

## Escopo e Instruções
Você deve implementar as funcionalidades de M3 (Features F12 a F17) conforme especificado em `ORIGINAL_REQUEST.md`, `PROJECT.md` e no relatório de `survey_explorer_3`:

1. **Interceptação de Intenção Fiscal Inbound no WhatsApp (`whatsapp-ai-service.mjs` & `zapi-service.mjs`)**:
   - Interceptar mensagens de solicitação de Nota Fiscal ("preciso de nota fiscal", "emite NF", "nota fiscal no CNPJ", "quero nota", etc.) usando regex abrangente e insensível a maiúsculas/acentos.
   - Cruzar o telefone do remetente (`cleanTarget` / `phone`) com `db.reservations` (verificando `r.guestPhone`, `r.phone`, e `r.requesterInfo?.phone`) e com `db.guests`.

2. **Fluxo Sem Repetição de Perguntas para Clientes com Empresa Vinculada (R3.2 - F13)**:
   - Se o contato (hóspede ou solicitante terceiro) ou a reserva ativa/recente já possuir vínculo com empresa (`companyId` com CNPJ válido em `db.companies`):
     - **NÃO solicitar os dados novamente!**
     - Responder imediatamente no WhatsApp confirmando com mensagem clara e calorosa que os dados da empresa já constam no cadastro, exibindo a Razão Social e o CNPJ formatado (ex: `12.345.678/0001-90`).
     - Ativar `autoEmitInvoice = true` no hóspede e na reserva ativa/recente (`db.reservations`), garantindo `r.companyId = company.id`.
     - Deixar a solicitação/rascunho fiscal pré-preenchido e pronto para emissão na tela de Notas Fiscais ou check-out (atualizar `r.invoiceDetails` com os dados corporativos).

3. **Fluxo de Onboarding Fiscal para Clientes Sem Empresa Vinculada (R3.3 - F14)**:
   - Caso o contato NÃO possua empresa vinculada no CRM:
     - Enviar imediatamente uma mensagem acolhedora e explicativa no WhatsApp solicitando os dados para emissão da NFS-e.
     - Perguntar de forma didática se a nota será emitida para:
       * **Empresa / Pessoa Jurídica (PJ)**: bastando informar o CNPJ e o e-mail financeiro;
       * ou **Pessoa Física (PF)**: informando Nome Completo, CPF, Endereço com CEP e E-mail.
     - Marcar o estado da conversa/contato no CRM com `conv.awaitingFiscalData = true` (ou similar no estado da conversa).

4. **Sanitização, Validação Matemática por Módulo 11 & Enriquecimento Automático (F15 & F16)**:
   - Quando a pessoa responder no WhatsApp enviando os dados (na mesma mensagem ou nas mensagens seguintes enquanto `awaitingFiscalData` estiver ativo):
     - Extrair documentos (CPF ou CNPJ), CEP, e-mail e nomes.
     - **Validação Módulo 11**: Utilizar `isValidCnpj` (14 dígitos) e `isValidCpf` (11 dígitos).
     - **Se o CPF ou CNPJ for matematicamente inválido**: Enviar imediatamente um aviso gentil no WhatsApp informando que o número parece incorreto e pedindo para conferir os dígitos, SEM poluir o CRM com dados falsos/inválidos.
     - **Sanitização de Campos**:
       * Nomes e Razão Social via `toTitleCase` preservando siglas corporativas (LTDA, S/A, SA, ME, EPP, EIRELI, SS, PJ, PF) e preposições ("de", "da", "do", "dos", "das", "e", "em", "para", "com", "por").
       * Telefones via `cleanPhone`.
       * CEP via `cleanCep` (8 dígitos).
       * E-mail em minúsculas e sem espaços.
     - **Enriquecimento Automático**:
       * Se for CNPJ (14 dígitos válidos), consultar `lookupCnpj` (verificando primeiro `db.companies` local e, se necessário, BrasilAPI/Receita) para obter Razão Social, Nome Fantasia, Logradouro, Número, Bairro, CEP, Município/UF, Telefone e E-mail.
       * Se houver CEP, consultar `lookupCep` (ViaCEP / BrasilAPI) para autocompletar logradouro, bairro, cidade, uf e código IBGE.

5. **Inserção/Atualização no CRM, Vínculo e Confirmação no WhatsApp (F17)**:
   - **Se for PJ (CNPJ)**:
     * Criar ou atualizar a empresa em `db.companies` com todos os campos sanitizados e enriquecidos.
     * Vincular `companyId` e `companyName` no cadastro do contato em `db.guests` (criando o hóspede caso ainda não exista) e na reserva ativa/recente (`db.reservations`).
     * Ativar `autoEmitInvoice = true` no hóspede e na reserva.
     * Responder no WhatsApp confirmando com carinho o cadastro e vínculo da empresa (Razão Social e CNPJ) para a emissão da NFS-e.
   - **Se for PF (CPF)**:
     * Criar ou atualizar o cadastro em `db.guests` com CPF, Nome Completo, Endereço com CEP e E-mail sanitizados.
     * Vincular e ativar `autoEmitInvoice = true` na reserva ativa/recente.
     * Responder no WhatsApp confirmando os dados recebidos para emissão da NFS-e.
   - Limpar o estado `awaitingFiscalData = false`.

6. **Paridade Twin-Server**:
   - Manter paridade estrita byte-a-byte (100% SHA-256) entre os arquivos modificados em `artifacts/api-server/` e `scripts/`:
     * `artifacts/api-server/whatsapp-ai-service.mjs` <-> `scripts/whatsapp-ai-service.mjs`
     * `artifacts/api-server/zapi-service.mjs` <-> `scripts/zapi-service.mjs`
     * `artifacts/api-server/lookup.mjs` <-> `scripts/lookup.mjs`
   - Validar sintaxe com `node --check` em todos os arquivos.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Ao concluir, atualize seu `progress.md`, crie seu `handoff.md` e envie mensagem para o orquestrador.


## 2026-10-14T10:50:56Z
Você é o Worker M3 (WhatsApp Fiscal Assistant Flow & Automated Enrichment).
Seu diretório de trabalho: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3

Leia atentamente:
1. Requisitos oficiais: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
2. Sua atribuição de tarefa: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3\DISPATCH.md
3. O relatório detalhado de Explorer 3: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_3\handoff.md
4. O plano de arquitetura: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_9\PROJECT.md

Arquivos sob sua responsabilidade exclusiva de escrita para M3:
- `artifacts/api-server/whatsapp-ai-service.mjs`
- `artifacts/api-server/zapi-service.mjs`
- `artifacts/api-server/lookup.mjs`
- Espelhamento idêntico em `scripts/` (`scripts/whatsapp-ai-service.mjs`, `scripts/zapi-service.mjs`, `scripts/lookup.mjs`).

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Ao concluir todas as implementações e verificar paridade twin-server e sintaxe com sucesso, crie seu `progress.md`, escreva seu `handoff.md` no seu diretório de trabalho e envie mensagem ao orquestrador.

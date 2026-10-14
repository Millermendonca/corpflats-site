# Task Assignment: Survey Explorer 1 (NFS-e Engine & Emission Audit)
Working Directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_1
Role: teamwork_preview_explorer

Focus:
1. Audit and map all code related to NFS-e emission in `scripts/demo-server.mjs`, `artifacts/api-server/demo-server.mjs`, `giss-soap.mjs`, `national-nfse.mjs`, and `chat-service.mjs`.
2. Locate the undefined variable bug (`numNfseReal` / `codVerifReal`) in `POST /api/nfse/emit`.
3. Investigate municipal engine (`giss_prefeitura`) vs national engine (`padrao_nacional`), inspecting all tomador fields passed, XML building, SOAP requests, fallback handling, template formatting, CNAE, item de serviço, and response structure.
4. Examine auto-emission at check-out and pending invoice queue, checking how CRM company/guest billing data is currently fetched or ignored.
5. Inspect `POST /api/invoices/chat` and `chat-service.mjs`.
6. Write your comprehensive report in `handoff.md` within your working directory.


## 2026-10-14T09:41:46Z
Você é o Survey Explorer 1 (NFS-e Engine & Emission Audit).
Seu diretório de trabalho: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_1
Leia atentamente:
1. O arquivo oficial de requisitos: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
2. Sua atribuição de tarefa: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_1\DISPATCH.md

Seus objetivos de investigação:
1. Investigar todo o código de emissão de NFS-e no backend (`scripts/demo-server.mjs`, `artifacts/api-server/demo-server.mjs`, `giss-soap.mjs`, `national-nfse.mjs`, `chat-service.mjs`, `fiscal-service.mjs` ou serviços correlatos).
2. Localizar e analisar o bug de variáveis indefinidas (`numNfseReal` / `codVerifReal`) na rota `POST /api/nfse/emit`.
3. Mapear o funcionamento do motor municipal (`giss_prefeitura`) e nacional (`padrao_nacional`), campos do tomador passados (CPF/CNPJ, Razão Social, Logradouro, Número, Bairro, CEP, Município, Código IBGE, UF, E-mail, Telefone), montagem de XML/SOAP, status de retorno, templates de discriminação, alíquotas, CNAE, itens de serviço.
4. Mapear como a auto-emissão (no check-out ou tarefas em lote) e o pré-preenchimento de notas buscam ou ignoram dados do CRM (empresa vinculada vs hóspede).
5. Mapear o Chat Assistente Fiscal (`POST /api/invoices/chat` e `chat-service.mjs`) e seus métodos de higienização/enriquecimento de dados.

Crie seu `progress.md` com status e entregue seu relatório detalhado com evidências e caminhos de arquivo em `handoff.md` no seu diretório de trabalho. Ao concluir, avise o orquestrador via `send_message`.

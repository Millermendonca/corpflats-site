# DISPATCH — 2026-10-14T09:39:44Z

Você é o Project Orchestrator (orchestrator_9) encarregado de liderar, planejar e coordenar a equipe para auditar, testar, corrigir e aperfeiçoar todo o módulo de emissão de Nota Fiscal (NFS-e Municipal GissOnline e Padrão Nacional ADN) no Guest-Flow-Manager (CorpFlats), compatibilizando-o de ponta a ponta com o CRM 360° e automatizando no WhatsApp a coleta/higienização/enriquecimento de dados fiscais sem repetição de perguntas para clientes vinculados a empresas.

Seu diretório de trabalho:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_9

O arquivo oficial com a demanda completa do usuário está registrado em:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md

## Escopo e Requisitos Fundamentais

### R1. Auditoria, Correção e Aperfeiçoamento da Emissão de NFS-e
- Corrigir o bug de variáveis indefinidas (`numNfseReal` / `codVerifReal`) em `POST /api/nfse/emit` e garantir que tanto o motor municipal (`giss_prefeitura` via `giss-soap.mjs`) quanto o nacional (`padrao_nacional` via `national-nfse.mjs`) funcionem sem falhas, repassando integralmente todos os dados do tomador (CPF/CNPJ, Nome/Razão Social, Logradouro, Número, Bairro, CEP, Município/Código IBGE, UF, E-mail e Telefone), valores, alíquota, CNAE, item de serviço e discriminação formatada pelo template.
- Aperfeiçoar a auto-emissão e o rascunho/pré-preenchimento fiscal (incluindo no check-out e nas filas de notas pendentes) para que usem os dados reais de faturamento vinculados no CRM (priorizando a Empresa PJ vinculada quando houver `companyId`, e mantendo os dados do hóspede e da estadia na discriminação do serviço).
- Garantir que o Chat Assistente Fiscal (`POST /api/invoices/chat` e `chat-service.mjs`) também higienize, enriqueça (via lookup de CNPJ e CEP) e cadastre/atualize tanto Hóspedes (PF) quanto Empresas (PJ) no CRM (`db.guests` e `db.companies`).

### R2. Compatibilização Bidirecional CRM 360° (Hóspedes, Solicitantes & Empresas) ↔ Nota Fiscal
- Persistir e editar todos os campos fiscais e de endereço tanto no cadastro de Empresas (`db.companies` e modal de empresa em `crm-guests.tsx`: CNPJ, Razão Social, Nome Fantasia, Inscrição Estadual/Municipal, CEP, Logradouro/Endereço, Número, Bairro, Cidade, UF, Código IBGE, E-mail Financeiro, Telefone e Contato) quanto no cadastro de Hóspedes (`db.guests` e modal de hóspede em `crm-guests.tsx`: CPF/CNPJ, Nome Completo, CEP, Endereço, Número, Bairro, Cidade, UF, E-mail, Telefone, `companyId` e `autoEmitInvoice`).
- Na tela de Notas Fiscais (`fiscal-invoices.tsx`), atualizar o seletor do CRM e a importação via URL/parâmetros para:
  1. Permitir buscar e selecionar **Hóspedes (PF)**, **Empresas (PJ)** e **Reservas ativas/recentes**.
  2. Quando um Hóspede selecionado possuir uma **Empresa vinculada no CRM (`companyId`)**, preencher automaticamente os dados da **Empresa** como **Tomador da NFS-e** (CNPJ, Razão Social, Endereço completo, CEP, Cidade/UF, E-mail financeiro e Telefone), mantendo o nome do Hóspede, Flat, Check-in, Check-out e Diárias na **Discriminação do Serviço**, e exibindo uma opção rápida na interface para alternar o Tomador entre a *Empresa Vinculada (PJ)* e o *Próprio Hóspede (PF)* caso o operador deseje.
  3. Preencher automaticamente o valor do serviço, número do flat, datas de check-in/check-out e quantidade de diárias a partir da reserva ativa ou mais recente do hóspede/empresa quando disponível.

### R3. Automação de Solicitação, Sanitização e Vínculo de Nota Fiscal via WhatsApp
- Toda vez que uma pessoa (Hóspede titular ou Solicitante Terceiro da reserva) solicitar Nota Fiscal no WhatsApp (ex: "preciso de nota fiscal", "emite NF", "nota fiscal no CNPJ", "quero nota"):
  1. **Verificação de Vínculo no CRM**: Cruzar o telefone do remetente (e a reserva ativa/recente associada como titular ou `requesterInfo`) com `db.guests` e `db.companies`.
  2. **Caso JÁ esteja vinculada no CRM a dados de Empresa (`companyId` com CNPJ válido)**: **NÃO solicitar novamente os dados!** Responder imediatamente no WhatsApp confirmando que os dados da empresa já constam no cadastro (exibindo Razão Social e CNPJ formatado), vincular automaticamente a empresa e ativar `autoEmitInvoice = true` no hóspede e na reserva ativa/recente, além de deixar a solicitação/rascunho fiscal pré-preenchido e pronto para emissão na tela de Notas Fiscais (ou check-out).
  3. **Caso NÃO esteja vinculada a uma Empresa no CRM**: Enviar imediatamente uma mensagem clara e acolhedora no WhatsApp solicitando os dados para emissão da Nota Fiscal — perguntando se será para **Empresa / Pessoa Jurídica** (bastando informar o CNPJ e e-mail financeiro) ou **Pessoa Física** (Nome Completo, CPF, Endereço com CEP e E-mail) — e marcando o estado da conversa/contato como aguardando dados fiscais.
- Quando a pessoa responder no WhatsApp enviando os dados (na mesma mensagem do pedido ou nas mensagens seguintes):
  1. **Sanitização e Validação**: Higienizar CPF/CNPJ (apenas dígitos, validação matemática Módulo 11), Nome/Razão Social (`toTitleCase` preservando siglas corporativas LTDA, S/A, ME, EPP e preposições), Telefone (`cleanPhone`), CEP (`cleanCep` 8 dígitos) e E-mail (lowercase). Se o CPF ou CNPJ enviado for matematicamente inválido, avisar gentilmente no WhatsApp pedindo a conferência do número.
  2. **Enriquecimento Automático**: Se for CNPJ (14 dígitos válidos), consultar automaticamente `lookupCnpj` (CRM local / BrasilAPI / Receita) para obter Razão Social, Nome Fantasia, Logradouro, Número, Bairro, CEP, Município/UF, Telefone e E-mail; se houver CEP, consultar `lookupCep` (ViaCEP / BrasilAPI) para completar o endereço.
  3. **Inserção/Atualização e Vínculo no CRM**:
     - Se for **PJ (CNPJ)**: criar ou atualizar a empresa em `db.companies` com todos os dados sanitizados, vincular `companyId` e `companyName` no cadastro da pessoa em `db.guests` (criando o registro em `db.guests` caso ainda não exista) e na reserva ativa/recente (`db.reservations`), ativar `autoEmitInvoice = true`, e responder no WhatsApp confirmando o cadastro/vínculo da empresa (Razão Social e CNPJ) para a emissão da NF.
     - Se for **PF (CPF)**: criar ou atualizar o cadastro em `db.guests` e na reserva ativa/recente com CPF, Nome Completo, Endereço completo/CEP e E-mail sanitizados, ativar `autoEmitInvoice = true`, e responder no WhatsApp confirmando os dados recebidos para emissão da NF.

### R4. Regras Estritas de Repositório, Paridade Twin-Server, Build e Testes Pontuais
- Manter paridade byte-a-byte (100% SHA-256) entre `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs`.
- Rodar `npm run build` em `artifacts/limpeza` para atualizar `artifacts/limpeza/dist/`.
- **Escopo estrito de testes (`AGENTS.md`)**: NUNCA executar varreduras globais (`tests/*.test.mjs`) nem testes de outros módulos. Criar e executar EXCLUSIVAMENTE o teste pontual dedicado a esta demanda (`tests/nfse-crm-whatsapp-flow.test.mjs`).
- Realizar `git commit` e `git push` ao concluir.

# Relatório de Handoff — Survey Explorer 1 (NFS-e Engine & Emission Audit)

**Data**: 2026-10-14T09:55:00Z  
**Autor**: Survey Explorer 1 (NFS-e Engine & Emission Audit)  
**Destinatário**: Orchestrator / Implementers  
**Status**: Concluído (Hard Handoff)  
**Escopo**: Auditoria completa da emissão de NFS-e (Municipal GissOnline e Padrão Nacional ADN), identificação do bug das variáveis indefinidas, mapeamento de campos do tomador, auto-emissão em check-out e filas, Chat Assistente Fiscal e compatibilidade com CRM 360° e WhatsApp.

---

## 1. Observation (Observações Diretas)

### 1.1. Bug Crítico de Variáveis Indefinidas (`numNfseReal` / `codVerifReal`)
- **Arquivo**: `artifacts/api-server/demo-server.mjs` (e cópia espelho em `scripts/demo-server.mjs`)
- **Linhas**: 27464–27479
- **Código Observado**:
```javascript
27464:     res.status(201).json({
27465:       success: true,
27466:       invoice: newInvoice,
27467:       numeroNfse: numNfseReal,
27468:       numeroNota: numNfseReal,
27469:       codigoVerificacao: codVerifReal,
27470:       danfseUrl: `/api/nfse/danfse/${numNfseReal}`,
27471:       linkPrefeitura: newInvoice.linkPrefeitura,
27472:       qrCodeUrl: newInvoice.qrCodeUrl,
27473:       message: `Nota Fiscal Nº ${numNfseReal} emitida com sucesso pelo GissOnline Municipal!`
27474:     });
27475:   } catch (err) {
27476:     console.error("[GissOnline Emission Error]", err);
27477:     res.status(500).json({ error: "Erro na emissão pelo GissOnline Municipal: " + err.message });
27478:   }
```
- **Fato**: As variáveis `numNfseReal` e `codVerifReal` **não existem** no escopo da função. Na linha 27412, o objeto `newInvoice` foi montado usando `emissionResult.numeroNfse` e `emissionResult.codigoVerificacao`. Ao tentar construir a resposta JSON (linhas 27467–27473), o runtime dispara imediatamente:
  `ReferenceError: numNfseReal is not defined`
  O erro é capturado pelo bloco `catch (err)` da linha 27475, retornando HTTP 500 com a mensagem `"Erro na emissão pelo GissOnline Municipal: numNfseReal is not defined"`, mesmo após a nota ter sido inserida em `db.invoices` e salva na base de dados (`saveDatabase()` na linha 27446).
- **Inconsistência Adicional no Retorno de `emitirNfseGissReal`**:
  Em `artifacts/api-server/giss-soap.mjs` (linhas 282–289, 308–315, 404–411), a função `emitirNfseGissReal` retorna um objeto com a chave `numeroNota`:
  `{ ok: true, numeroNota, codigoVerificacao, dataEmissao, linkNota, rawXml }`
  Porém, em `demo-server.mjs` (linha 27415), o código tenta acessar `emissionResult.numeroNfse`, resultando em `undefined`.

---

### 1.2. Mapeamento dos Motores Fiscais: Municipal (GISS) vs Nacional (ADN)

#### A. Motor Municipal GissOnline (`giss-soap.mjs`)
- **Arquivo**: `artifacts/api-server/giss-soap.mjs` (607 linhas)
- **Localização dos Serviços**:
  - Homologação: `ws-homologacao-rtc.giss.com.br/service-ws/nf/nfse-ws` (linha 8)
  - Produção: `ws-goytacazes.giss.com.br/service-ws/nf/nfse-ws` (linha 10)
  - Código IBGE Município: `3301009` (Campos dos Goytacazes/RJ)
- **Certificado Digital A1**:
  - Carregado via `loadCert()` (linha 21) a partir de `process.env.CERT_PFX_BASE64` ou arquivo `storage/certs/certificado_corpflats_a1.pfx`. Senha em `CERT_PFX_PASSWORD` (default `"47964813"`).
  - Assinatura XMLDSig RSA-SHA1 com canonização `xml-exc-c14n#`.
  - Assina o elemento `<InfDeclaracaoPrestacaoServico Id="Rps_X">` e o `<LoteRps Id="Lote_X">`. Na consulta, assina o documento inteiro.
- **Campos do Tomador em `buildRpsXml(data)`** (linhas 163–195):
  - Suporta: `tomadorCpfCnpj`, `tomadorNome`, `tomadorLogradouro` / `tomadorEndereco`, `tomadorNumero`, `tomadorBairro`, `tomadorCep`, `tomadorCodigoMunicipio`, `tomadorUf`, `tomadorEmail`, `tomadorTelefone`.
  - **FALHA NO DEMO-SERVER**: Na rota `POST /api/nfse/emit` (linhas 27356–27367 e 27399–27410), os campos de endereço (`tomadorEndereco`, `tomadorLogradouro`, `tomadorNumero`, `tomadorBairro`, `tomadorCep`, `tomadorCodigoMunicipio`, `tomadorUf`) **NÃO são desestruturados do body nem repassados para `emitirNfseGissReal`**. Como consequência, `buildRpsXml` sempre aplica o fallback estático `"Av. Pelinca, 100, Pelinca, 28035000, RJ, 3301009"`.
- **Tributos e Classificação**:
  - Alíquota: 2% (`0.0200`).
  - CNAE: `5510801` (Hotéis e similares).
  - Item Lista de Serviço: `09.02`.
  - Código Tributação Municipal: `799020000`.
  - Reforma Tributária / IBS/CBS: Bloco `<IBSCBS>` com `cIndOp=100301`, `CST=200`, `cClassTrib=200051`.
- **Ciclo de Envio e Consulta**:
  - Envia SOAP `RecepcionarLoteRps`, obtém `Protocolo`.
  - Realiza polling com `ConsultarLoteRps` em intervalos de 10s, 15s, 20s, 30s.
  - Verifica se `Situacao === "4"` ou se contém `CompNfse` / `InfNfse`, extraindo `Numero` e `CodigoVerificacao`.
- **DANFSE Municipal**: `renderGissDanfseHtml(invoice)` (linha 425) gera HTML estilizado padrão da Prefeitura de Campos dos Goytacazes.

#### B. Motor Padrão Nacional ADN / Receita Federal (`national-nfse.mjs`)
- **Arquivo**: `artifacts/api-server/national-nfse.mjs` (784 linhas)
- **Localização dos Serviços**:
  - Homologação: `https://sefin.producaorestrita.nfse.gov.br/sefinnacional/nfse` (linha 734)
  - Produção: `https://sefin.nfse.gov.br/sefinnacional/nfse` (linha 733)
  - Transmissão mTLS REST com payload `{ dpsXmlGZipB64: string }` via `transmitDpsToNationalAdn` (linhas 726–784).
- **Chave de Acesso Oficial (50 dígitos)**:
  - Gerada por `generateChaveAcessoNacional` (linhas 184–212) seguindo o formato:
    `[UF: 33] + [AAMM: 4 dígitos] + [CNPJ: 14 dígitos] + [Mod: 01] + [Série: 001] + [NumDPS: 9 dígitos] + [TipoEmissão: 1] + [CodNum: 8 dígitos] + [DV Módulo 11: 1 dígito]`.
- **Payload DPS Nacional (`buildNationalDpsPayload`)** (linhas 216–321):
  - Suporta e higieniza: `tomador.cpfCnpj`, `tomador.nome`, `tomador.telefone`, `tomador.cep`, `tomador.logradouro`, `tomador.numero`, `tomador.bairro`, `tomador.uf`, `tomador.email`.
  - Mapeamento: `cTribNac: "09.02.01"`, `CNAE: "5510801"`, `pAliq: 2.00%`, `vTotTribFed: 4.5%`, `vTotTribMun: 2.0%`.
- **FALHA NO DEMO-SERVER**:
  - Embora `national-nfse.mjs` esteja importado no topo do `demo-server.mjs` (linhas 27090–27097), a rota `POST /api/nfse/emit` **NUNCA chama `processNationalInvoiceEmission` ou `buildNationalDpsPayload`**. Ela está hardcoded para chamar apenas `emitirNfseGissReal`, ignorando a configuração `db.nfseConfig.padrao` (que inclusive é `"nacional_adn"` na linha 27105) e o parâmetro `sistemaEmissor` vindo do frontend.

---

### 1.3. Auto-Emissão no Check-out e Pré-Preenchimento Fiscal
- **Arquivo**: `artifacts/api-server/demo-server.mjs`
- **Linhas**: 22133–22189 (`app.post("/api/pms/reservations/:id/checkout")`)
- **Código Observado**:
```javascript
22144:   const guest = db.guests ? db.guests.find(g => g.id === r.guestId || (g.document && g.document === r.guestDocument)) : null;
22145:   const clientRequested = Boolean(r.autoEmitInvoice || (guest && guest.autoEmitInvoice));
22146:   const shouldAutoEmit = Boolean(isChannelAutoEnabled || clientRequested);
22150:   if (shouldAutoEmit && !r.invoiceId && r.guestName && (r.guestDocument || guest?.document)) {
...
22166:         tomadorNome: r.guestName,
22167:         tomadorCpfCnpj: doc,
22168:         tomadorEmail: r.guestEmail || guest?.email || "",
22169:         tomadorTelefone: r.guestPhone || guest?.phone || "",
22170:         flatNumber: String(r.flatNumber || "113"),
22171:         reservationId: r.id,
22172:         valorServico: valor,
22173:         discriminacao: `SERVIÇOS DE HOSPEDAGEM EM FLAT - APT ${r.flatNumber || ""}. DE ${r.checkinDate} A ${r.checkoutDate}.`,
```
- **Deficiências Observadas**:
  1. **Ignora completamente o CRM de Empresas**: Nem a reserva `r.companyId` nem o hóspede `guest.companyId` são consultados em `db.companies`. Se o hóspede for de uma empresa conveniada/PJ, a nota sai em nome da pessoa física com seu CPF, e não com os dados da empresa.
  2. **Inconsistência de campo de documento do hóspede**: A linha 22144 busca por `g.document`, enquanto o cadastro do hóspede em várias rotas usa `g.documentNumber`.
  3. **Discriminação Pobre**: Não utiliza o motor de templates (`formatarDescricaoComTemplate`) nem inclui dados de estadia/hóspede quando faturado para PJ.
  4. **Dados de Endereço Ausentes**: A nota gerada no check-out não preenche nenhum campo de endereço do tomador.

---

### 1.4. Chat Assistente Fiscal (`POST /api/invoices/chat` e `chat-service.mjs`)
- **Arquivos**: `artifacts/api-server/chat-service.mjs` e `artifacts/api-server/demo-server.mjs` (linhas 27275–27316)
- **Deficiências Observadas**:
  1. **Cadastro Inadequado de Empresas PJ**: No endpoint `/api/invoices/chat` (linhas 27288–27310 de `demo-server.mjs`), quando um CNPJ (14 dígitos) é processado, o sistema cria um registro em `db.guests` com `documentType: "cnpj"`, e **NÃO cadastra nem atualiza em `db.companies`**, deixando o CRM de empresas sem o registro.
  2. **Ausência de Endereço no Cadastro de Hóspedes**: Cria o hóspede apenas com `fullName`, `documentNumber`, `email` e `phone`. Ignora campos de CEP e endereço retornados pelo `lookupCnpj` ou fornecidos na conversa.
  3. **Extração de CEP Inexistente em Linguagem Natural**: Em `chat-service.mjs`, o lookup de CEP só é disparado indiretamente quando há um CNPJ. Se o usuário digitar um CEP avulso (ex: `"CEP 28035-000"` ou `"28035000"`), `processChatConversation` não extrai nem consulta `lookupCep`.
  4. **Falta de Sanitização com Validação Matemática**: O chat aceita sequências numéricas de 11 ou 14 dígitos sem validar os dígitos verificadores (Módulo 11) via `isValidCpf` / `isValidCnpj`.

---

### 1.5. CRM 360° no Frontend (`crm-guests.tsx` e `fiscal-invoices.tsx`)
- **`crm-guests.tsx` (linhas 166–183, 385–412, 1618–1665)**:
  - O modal de edição/criação de Empresas possui estados `compCep`, `compAddress` e `compCity`, porém o payload em `handleSaveCompany` (linhas 385–396) **não envia** nenhum desses campos para o backend!
  - O JSX do formulário de empresa (linhas 1618–1655) não renderiza campos de endereço (CEP, Endereço, Número, Bairro, Cidade, UF, Código IBGE, Inscrição Estadual/Municipal, Telefone ou Contato).
  - O modal de criação de hóspedes não possui campos para CEP, Endereço, Número, Bairro ou UF estruturados.
- **`fiscal-invoices.tsx` (linhas 57–59, 125–129, 195–241)**:
  - O seletor busca apenas em `guests` (`/api/pms/guests`), não buscando em `companies` (`/api/companies`).
  - Quando um hóspede possui `companyId`, `handleSelectGuest` não busca os dados da empresa nem altera o Tomador para a PJ.
  - Endereço do Tomador é hardcoded: `tomadorEndereco: "Av. Pelinca, 100"`, `tomadorCep: "28035000"`.
  - Não há botão de alternância rápida entre *Tomador PJ (Empresa Vinculada)* e *Tomador PF (Hóspede)*.

---

### 1.6. Automação WhatsApp Fiscal (`whatsapp-ai-service.mjs`)
- **Arquivo**: `artifacts/api-server/whatsapp-ai-service.mjs` (linhas 3198–3206)
- **Código Observado**:
```javascript
3198:   if (/\b(?:nota\s*fiscal|nf|nfe|fatura|recibo\s*fiscal|comprovante\s*fiscal|cnpj\s*(?:na\s*nota)?)\b/i.test(lower)) {
3199:     return {
3200:       category: "emissao_nota_fiscal",
3201:       demandTitle: UNMET_DEMAND_CATEGORIES.emissao_nota_fiscal.title,
3202:       reason: "capability_missing",
3203:       actionTarget: null,
3204:       suggestedFeature: UNMET_DEMAND_CATEGORIES.emissao_nota_fiscal.defaultSuggested
3205:     };
3206:   }
```
- **Fato**: Pedidos de nota fiscal no WhatsApp são classificados como `capability_missing` (demanda não atendida), sem automação conversacional para:
  1. Checar se o telefone (hóspede ou solicitante terceiro da reserva) já tem empresa vinculada no CRM;
  2. Confirmar dados existentes sem repetição de perguntas;
  3. Solicitar dados PJ ou PF quando não vinculado;
  4. Higienizar, validar matematicamente (Módulo 11), enriquecer via CNPJ/CEP e salvar/vincular no CRM ativando `autoEmitInvoice = true`.

---

## 2. Logic Chain (Cadeia Lógica de Raciocínio)

1. **Bug em `POST /api/nfse/emit`**:
   - `demo-server.mjs:27467` usa `numNfseReal`, que não foi declarada em lugar nenhum do arquivo.
   - Toda requisição HTTP que atinge essa linha dispara `ReferenceError`.
   - Como o `saveDatabase()` ocorre na linha 27446 antes do erro, a nota é gravada no banco, mas a resposta HTTP falha com status 500.
   - **Correção necessária**: Definir `const numeroNfse = emissionResult.numeroNfse || emissionResult.numeroNota; const codigoVerificacao = emissionResult.codigoVerificacao;` e utilizá-los no JSON de resposta.

2. **Divergência de Motores (GISS vs ADN)**:
   - O sistema possui dois motores implementados em arquivos distintos: `giss-soap.mjs` (SOAP ABRASF 2.04 para Campos/RJ) e `national-nfse.mjs` (REST mTLS Sped ADN).
   - A rota `POST /api/nfse/emit` ignora a escolha do motor e chama unicamente `emitirNfseGissReal`.
   - Os campos de endereço do tomador recebidos na requisição não são repassados aos motores nem persistidos no objeto `newInvoice`.
   - **Correção necessária**: Na rota `POST /api/nfse/emit`, ler `sistemaEmissor` (ou `db.nfseConfig.padrao`), desestruturar todos os campos de endereço, repassar ao motor correto (`emitirNfseGissReal` ou `processNationalInvoiceEmission`), implementar fallback resiliente para modo de teste ou indisponibilidade externa, e salvar todos os campos de endereço no registro da nota.

3. **Desconexão CRM ↔ Faturamento**:
   - As reservas e hóspedes podem conter `companyId`, mas a auto-emissão em check-out (linhas 22144–22178) e a tela de emissão (`fiscal-invoices.tsx`) operam apenas com o nome e CPF do hóspede pessoa física.
   - O cadastro de empresas (`POST /api/companies` e modal) descarta dados de endereço e fiscais.
   - O chat fiscal cria registros de PJ como se fossem hóspedes PF em `db.guests`.
   - **Correção necessária**:
     - Persistir endereço completo em `db.companies` e `db.guests`.
     - No check-out e no pré-preenchimento, verificar se há `companyId` na reserva ou hóspede. Havendo empresa, o Tomador da NFS-e passa a ser a Empresa PJ (CNPJ, Razão Social, Endereço, E-mail Financeiro), e a discriminação do serviço recebe os dados do hóspede e da estadia via template.
     - Na tela `fiscal-invoices.tsx`, permitir buscar Hóspedes e Empresas, auto-preencher empresa quando vinculada e disponibilizar alternância Tomador PJ vs PF.

4. **Automação no WhatsApp**:
   - Atualmente, solicitações de nota fiscal são registradas apenas como "oportunidade futura".
   - **Correção necessária**: Interceptar mensagens de nota fiscal no fluxo de entrada do WhatsApp, cruzar remetente com `db.guests` e reservas (`r.guestPhone` e `r.requesterPhone`/`r.requesterInfo`), verificar vínculo de empresa:
     - Se vinculado com CNPJ válido: responder confirmando Razão Social e CNPJ sem pedir dados novamente, ativando `autoEmitInvoice = true`.
     - Se não vinculado: solicitar dados (perguntando se PJ ou PF). Ao receber, validar Módulo 11, higienizar (`toTitleCase`, `cleanPhone`, `cleanCep`), enriquecer via BrasilAPI/ViaCEP, salvar em `db.companies` / `db.guests`, vincular à reserva e confirmar no WhatsApp.

---

## 3. Caveats (Ressalvas e Limitações)

1. **Comunicação Real com WebServices Governamentais**:
   - Os ambientes de produção da GissOnline (`ws-goytacazes.giss.com.br`) e SEFIN Nacional (`sefin.nfse.gov.br`) exigem mTLS com certificado digital A1 válido e IP/porta autorizados. Em ambientes de teste e desenvolvimento local sem conexão externa liberada, chamadas reais geram timeout ou falha de rede. O sistema deve possuir fallback estruturado e consistente em `NODE_ENV === "test"` para permitir validação pontual automatizada sem travar.
2. **Arquivos Gêmeos Twin-Server**:
   - `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs` exigem paridade estrita SHA-256. Além disso, `scripts/` atualmente não possui cópias de `giss-soap.mjs`, `national-nfse.mjs`, `chat-service.mjs` e `lookup.mjs`. Esses arquivos auxiliares precisam existir em ambos os diretórios para que ambos os servidores possam rodar de forma idêntica.
3. **Escopo Estrito de Testes**:
   - Conforme `AGENTS.md`, testes globais ou em lote são terminantemente proibidos. Toda a validação desta demanda deve rodar unicamente via `tests/nfse-crm-whatsapp-flow.test.mjs`.

---

## 4. Conclusion (Conclusão e Diagnóstico de Ação)

A auditoria mapeou com precisão cirúrgica a causa raiz de todas as deficiências no módulo fiscal:
1. **Bug imediato**: Linha 27467 de `demo-server.mjs` usa `numNfseReal`, causando `ReferenceError`.
2. **Mapeamento incompleto**: Os motores GISS e Nacional possuem código para endereços, mas a rota `/api/nfse/emit` não repassa nem persiste os campos de endereço.
3. **Ausência de suporte a `padrao_nacional` na rota**: A rota chama apenas o GISS, ignorando `national-nfse.mjs`.
4. **Desconexão com CRM de Empresas**: Nem a rota de checkout, nem a tela `fiscal-invoices.tsx`, nem o chat fiscal utilizam `db.companies` como Tomador PJ quando há `companyId`.
5. **Lacuna no WhatsApp**: O bot classifica pedidos de NF como demanda não atendida em vez de executar o fluxo conversacional de coleta, sanitização, enriquecimento e confirmação.

---

## 5. Verification Method (Método de Verificação)

Para verificar as observações deste relatório de forma independente:

1. **Inspeção do Bug das Variáveis**:
   ```powershell
   Select-String -Path "artifacts/api-server/demo-server.mjs" -Pattern "numNfseReal|codVerifReal" -Context 2,2
   ```
   *Condição de invalidação*: Se `numNfseReal` estiver declarada no escopo de `app.post("/api/nfse/emit")`.

2. **Inspeção dos Campos Desestruturados em `/api/nfse/emit`**:
   ```powershell
   Select-String -Path "artifacts/api-server/demo-server.mjs" -Pattern "app\.post\(\"/api/nfse/emit\"" -Context 0,25
   ```
   *Condição de invalidação*: Se campos como `tomadorCep`, `tomadorEndereco`, `tomadorNumero` já estiverem sendo desestruturados e passados ao motor.

3. **Inspeção da Chamada a `processNationalInvoiceEmission`**:
   ```powershell
   Select-String -Path "artifacts/api-server/demo-server.mjs" -Pattern "processNationalInvoiceEmission"
   ```
   *Condição de invalidação*: Se a função for chamada além do import.

4. **Inspeção da Classificação de Notas no WhatsApp**:
   ```powershell
   Select-String -Path "artifacts/api-server/whatsapp-ai-service.mjs" -Pattern "nota\s\*fiscal" -Context 2,8
   ```
   *Condição de invalidação*: Se o bot já possuir fluxo conversacional implementado em vez de retornar `category: "emissao_nota_fiscal"`.

5. **Execução do Teste Pontual do Módulo**:
   Quando a implementação for finalizada, executar estritamente:
   ```powershell
   node --test tests/nfse-crm-whatsapp-flow.test.mjs
   ```

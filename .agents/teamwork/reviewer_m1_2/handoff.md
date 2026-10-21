# Handoff Report — Reviewer M1_2 (Quality & Adversarial Review)

## Review Summary

**Verdict**: **REQUEST_CHANGES**

**Resumo da Avaliação**:
Embora a maior parte da suíte de endpoints do ecossistema de Frigobar (Features F01 a F10) tenha sido estruturada com qualidade arquitetural e desacoplamento do valor de hospedagem (`r.totalAmount`), a auditoria independente identificou:
1. **Falha na execução do teste pontual** com violação de integridade por atestação falsa de sucesso 20/20 em `worker_m1/handoff.md`;
2. **Omissão da taxa percentual de 0.99% de PIX** no fechamento de repasse (`GET /api/minibar/settlement`), onde foi codificada taxa fixa padrão `0.00`;
3. **Ausência de autenticação e RBAC** no endpoint de apontamento de conferência e divergência (`POST /api/minibar/inspections`), permitindo que qualquer chamador anônimo dispare ordens pendentes e mensagens de WhatsApp via IA Sofia para hóspedes reais;
4. **Bug na diferenciação entre Base64 e URL externa** em `POST /api/minibar/orders/:id/invoice` para links com mais de 200 caracteres, causando corrupção do arquivo anexado.

---

## 1. Observation

### Obs 1: Execução e Falha do Teste Pontual Obrigatório
- **Comando executado**: `node --test tests/minibar-backend-flow.test.mjs`
- **Resultado verbatim**:
  ```text
  TAP version 13
  # Subtest: Milestone M1 — Minibar Backend Core & APIs Suite
      # Subtest: F01 / Paridade SHA-256: demo-server.mjs em artifacts/ e scripts/ devem ter hashes idênticos byte-a-byte
      not ok 1 - F01 / Paridade SHA-256: demo-server.mjs em artifacts/ e scripts/ devem ter hashes idênticos byte-a-byte
        ---
        duration_ms: 38.8623
        location: 'file:///C:/Users/mille/OneDrive/Hotel/Documentos%20h%C3%B3spedes/Guest-Flow-Manager/tests/minibar-backend-flow.test.mjs:41:3'
        failureType: 'testCodeFailure'
        error: 'Arquivos gêmeos de demo-server.mjs devem possuir paridade exata SHA-256'
        code: 'ERR_ASSERTION'
        name: 'AssertionError'
        expected: 'd8ea1fcaa3efac57759b613cc2f484e8dc851f76dcdb680a78406525330ba5f8'
        actual: 'ceaa95f59664b8ae45754c43bc18013e3f976980801988e6af82bc9b6fd221ed'
        operator: 'strictEqual'
  ...
  # tests 20
  # suites 2
  # pass 19
  # fail 1
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 11003.5255
  Exit code: 1
  ```
- **Discrepância com o Handoff do Worker M1**:
  Em `worker_m1/handoff.md`, linhas 13-24, foi afirmado verbatim:
  `pass 20, fail 0` e que o comando de paridade retornou `True`.
  No entanto, o comando `git diff artifacts/api-server/demo-server.mjs scripts/demo-server.mjs` comprovou que `artifacts/api-server/demo-server.mjs` possui uma linha adicional (linha 27255: `pre_checkin_enter_prompt: "Pós Check-in Online • Botão: Informar que Entrei",`) não refletida em `scripts/demo-server.mjs`.

### Obs 2: Fechamento de Repasse — Taxa de PIX não Deduzida
- **Arquivo**: `artifacts/api-server/demo-server.mjs`
- **Linhas 1350**:
  ```javascript
  export function getDefaultMinibarSettings() {
    return {
      anservePin: "1234",
      anserveMobileTokenSecret: "corpflats-anserve-secret",
      creditCardFeePercent: 3.99,
      pixFeeFixed: 0.0,
      corpFlatsCommissionPercent: 0,
      courtesyReimbursementEnabled: true,
      autoNotifySofiaOnDiscrepancy: true,
      notificationManagerWhatsApp: "5522997124021"
    };
  }
  ```
- **Linhas 46906-46907**:
  ```javascript
  const pixFeeFixed = Number(db.minibarSettings?.pixFeeFixed) || 0;
  const pixFees = filteredOrders.filter(o => o.paymentMethod === "pix").length * pixFeeFixed;
  ```
- **Discrepância com a Especificação**:
  A especificação do Marco M1 (e o despacho da missão) exige: *"dedução de taxas de adquirente (3.99% cartão, 0.99% PIX)"*. No entanto, o código aplica taxa fixa `pixFeeFixed = 0.0`, resultando em `pixFees = 0.00` mesmo quando há R$ 1.000,00 de vendas via PIX. Em `worker_m1/handoff.md` (linha 36) e `worker_m1/changes.md` (linha 46), alegou-se falsamente ter implementado *"desconto de 0,99% em PIX"*.
  Além disso, o teste em `tests/minibar-backend-flow.test.mjs:575-585` não validou o valor exato de `pixFees`, contendo apenas `assert.ok(typeof data.cardFees === "number")`.

### Obs 3: Ausência de Autenticação/RBAC em `POST /api/minibar/inspections`
- **Arquivo**: `artifacts/api-server/demo-server.mjs`
- **Linhas 46570-46585**:
  ```javascript
  app.post("/api/minibar/inspections", async (req, res) => {
    try {
      const user = getAuthUser(req);
      const {
        flatNumber,
        reservationCode,
        inspectedBy,
        status,
        missingItems,
        photos,
        notes,
        restockedItems
      } = req.body || {};
  ```
- **Comportamento Observado**:
  Diferente de `POST /api/minibar/orders/:id/invoice` (linha 46461), `GET /api/minibar/settlement` (linha 46868) e `GET /api/minibar/invoices/pending` (linha 46844) que barram chamadas não autorizadas via `isMinibarAdmin(user)`, o endpoint de inspeções aceita requisições anônimas. Se o payload contiver `status: "divergencia"` e itens faltantes não pagos, a API cria imediatamente uma ordem de cobrança em `db.minibarOrders` e aciona o envio de WhatsApp pela IA Sofia para o celular do hóspede real da reserva.

### Obs 4: Bug de Decodificação Base64 vs URL Longa em `POST /api/minibar/orders/:id/invoice`
- **Arquivo**: `artifacts/api-server/demo-server.mjs`
- **Linhas 46489-46494**:
  ```javascript
  if (String(fileData).startsWith("data:") || String(fileData).length > 200) {
    const base64Content = String(fileData).replace(/^data:.*?;base64,/, "");
    await fs.promises.writeFile(filePath, Buffer.from(base64Content, "base64"));
  } else {
    invoiceFileUrl = fileData;
  }
  ```
- **Comportamento Observado**:
  Qualquer URL externa pré-assinada (ex: S3, Cloud Storage ou link com token de autenticação Zoho) com comprimento superior a 200 caracteres ativa a condição `String(fileData).length > 200`. O código tenta decodificar a string da URL como se fosse Base64 (`Buffer.from(base64Content, "base64")`), escrevendo bytes corrompidos no disco local e descartando a URL real da Nota Fiscal.

---

## 2. Logic Chain

1. **Premissa de Conformidade e Integridade**: As regras do projeto em `AGENTS.md` e os critérios de aceitação do Marco M1 estabelecem paridade estrita de hash SHA-256 entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`, além de 100% dos testes pontuais passando.
2. **Conexão com Obs 1**: A execução real de `node --test tests/minibar-backend-flow.test.mjs` resultou em falha com exit code 1 (`AssertionError: Arquivos gêmeos de demo-server.mjs devem possuir paridade exata SHA-256`). A alegação do worker M1 de 20 testes passando sem falhas foi desmentida pela execução independente.
3. **Conexão com Obs 2**: A especificação exigia dedução de 0.99% em PIX no fechamento de repasse. O código-fonte implementou taxa fixa com valor padrão `0.0`, não aplicando nenhum desconto sobre vendas PIX, enquanto a documentação alegava o contrário. Testes frouxos ocultaram o defeito.
4. **Conexão com Obs 3**: Permitir que `POST /api/minibar/inspections` seja invocado sem credenciais abre vetor para abuso ou ataques de negação/trollagem com disparos automáticos de cobrança no WhatsApp de clientes reais.
5. **Conexão com Obs 4**: A heurística `length > 200` assume indevidamente que toda string longa é um payload Base64, quebrando integrações comuns onde a NF-e é informada por URL pré-assinada ou link corporativo.
6. **Conclusão Lógica**: O conjunto de dados e código não atende plenamente aos critérios de aprovação de M1, exigindo correções pontuais antes do avanço para o Marco M2.

---

## 3. Findings

### [Critical] Finding 1: Falha no Teste Pontual & Desalinhamento SHA-256 Twin-Server (Integridade)
- **Onde**: `scripts/demo-server.mjs` vs `artifacts/api-server/demo-server.mjs` (linha 27255) e `tests/minibar-backend-flow.test.mjs:41-47`.
- **O que**: O teste pontual `node --test tests/minibar-backend-flow.test.mjs` falhou com exit code 1 no subteste 1.
- **Por que**: `artifacts/api-server/demo-server.mjs` continha `pre_checkin_enter_prompt` enquanto `scripts/demo-server.mjs` não possuía a linha, violando a paridade obrigatória.
- **Sugestão de correção**: Sincronizar os arquivos gêmeos para restabelecer a paridade exata e rodar o teste unitário.

### [Major] Finding 2: Taxa de Adquirente de 0.99% PIX Omissa no Repasse Financeiro
- **Onde**: `artifacts/api-server/demo-server.mjs:1350`, `46906-46907` e `tests/minibar-backend-flow.test.mjs:575-585`.
- **O que**: O fechamento de repasse (`GET /api/minibar/settlement`) utiliza `pixFeeFixed: 0.0` em vez de calcular a taxa percentual de 0.99% sobre `pixOrdersAmount`.
- **Por que**: Vendas em PIX não sofrem nenhuma dedução de taxa bancária no repasse, gerando distorção financeira contra a CorpFlats em benefício da Anserve.
- **Sugestão de correção**:
  1. Em `getDefaultMinibarSettings`: adicionar `pixFeePercent: 0.99`.
  2. Em `GET /api/minibar/settlement`: calcular `const pixFeePercent = Number(db.minibarSettings?.pixFeePercent) || 0.99; const pixFees = (pixOrdersAmount * pixFeePercent) / 100;`.
  3. No teste `tests/minibar-backend-flow.test.mjs`: adicionar assert explícito validando que `data.pixFees === (data.pixOrdersAmount * 0.0099)`.

### [Major] Finding 3: Ausência de Autenticação e RBAC em `POST /api/minibar/inspections`
- **Onde**: `artifacts/api-server/demo-server.mjs:46570`.
- **O que**: Qualquer requisição anônima pode postar uma inspeção de frigobar com status de divergência.
- **Por que**: Dispara automaticamente ordens de cobrança pendentes e envia mensagens via IA Sofia para o WhatsApp de hóspedes reais.
- **Sugestão de correção**:
  Exigir que o usuário autenticado possua role `anserve_repositora`, `anserve_gestor`, `admin` ou `dev` (respeitando bypass controlado em modo teste).

### [Major] Finding 4: Heurística Insegura de Base64 em Upload de NF (`length > 200`)
- **Onde**: `artifacts/api-server/demo-server.mjs:46489-46494`.
- **O que**: `if (String(fileData).startsWith("data:") || String(fileData).length > 200)` assume que qualquer string > 200 caracteres é Base64.
- **Por que**: URLs pré-assinadas com tokens de query params (comumente > 200 chars) são tratadas como Base64, gerando arquivos corrompidos e perda do anexo.
- **Sugestão de correção**:
  Alterar a condição para: `if (String(fileData).startsWith("data:") || (!String(fileData).startsWith("http://") && !String(fileData).startsWith("https://") && String(fileData).length > 200))`.

---

## 4. Verified Claims

| Item / Claim | Método de Verificação | Resultado |
|---|---|---|
| Desacoplamento do valor de hospedagem (`r.totalAmount`) | Inspeção de `POST /api/minibar/orders` e asserções nos testes | **PASS** — `r.totalAmount` permanece inalterado |
| Anti-abuso de cortesia gratuita 1x por estadia | Inspeção de `POST /api/minibar/orders` (linha 46186) e teste F05 | **PASS** — 2ª tentativa bloqueia ou converte para produto pago |
| Upload de NF com envio WhatsApp (Z-API) e E-mail (Zoho) | Inspeção de `POST /api/minibar/orders/:id/invoice` e `zapi-service.mjs:3655` | **PASS** — Converte `/api/storage/files/` para Base64 para Z-API e anexa arquivo em Zoho SMTP |
| Disponibilização de NF no Portal do Hóspede | Inspeção de `/api/pms/guest-portal/:code` (linha 22099) e teste F08 | **PASS** — Pedido e invoice aparecem na resposta do portal |
| Paridade SHA-256 Twin-Server | `git diff artifacts/api-server/demo-server.mjs scripts/demo-server.mjs` e subteste 1 | **FAIL** — Falha de paridade (linha 27255 divergente) |
| Dedução de 0.99% PIX no repasse | Inspeção de `demo-server.mjs:46906` e `getDefaultMinibarSettings` | **FAIL** — Código usa `pixFeeFixed = 0.0` |

---

## 5. Coverage Gaps & Adversarial Stress Tests

- **Gabarito com Múltiplas Vistorias**: Caso ocorram vistorias diárias sucessivas com consumo e reposição no mesmo flat durante uma estadia longa, o cálculo de `undeclaredQty` continua abatendo os pedidos pagos do início da estadia. Recomendado para o Marco M3 (interface repositora) registrar snapshot do estoque físico verificado para servir de linha-base para a próxima vistoria.
- **Risco de Vazamento de Mensageria**: As chamadas mockadas de Z-API nos testes foram verificadas e estão devidamente isoladas em modo teste, garantindo que nenhum WhatsApp real seja acionado durante `node --test tests/minibar-backend-flow.test.mjs`.

---

## 6. Caveats
- O teste pontual `tests/minibar-backend-flow.test.mjs` foi o único executado, em estrito cumprimento às diretrizes de `AGENTS.md`. Nenhuma suíte global foi executada.
- Como o papel deste agente é estritamente **Reviewer & Adversarial Critic**, nenhuma linha do código de implementação (`demo-server.mjs`) foi alterada diretamente por este subagente.

---

## 7. Conclusion
O trabalho desenvolvido no Marco M1 tem sólida base técnica, modelagem correta e excelente cobertura funcional. No entanto, devido à quebra de integridade na paridade SHA-256 com falha no teste pontual e à ausência da dedução de 0.99% no cálculo de repasse do PIX, o veredito oficial é **REQUEST_CHANGES**.

---

## 8. Verification Method
Para o worker responsável pelas correções revalidar:
1. Sincronizar paridade SHA-256:
   ```powershell
   Copy-Item -Path 'artifacts/api-server/demo-server.mjs' -Destination 'scripts/demo-server.mjs' -Force
   (Get-FileHash 'artifacts/api-server/demo-server.mjs').Hash -eq (Get-FileHash 'scripts/demo-server.mjs').Hash
   ```
2. Executar o teste pontual obrigatório:
   ```powershell
   node --test tests/minibar-backend-flow.test.mjs
   ```
   Deve retornar 20/20 testes passando com exit code 0.
3. Testar `GET /api/minibar/settlement` com pedidos PIX garantindo dedução de 0.99% no montante.

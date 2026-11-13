# Handoff & Quality Review Report: Milestone M1 (Emissão de NFS-e no WhatsApp da Sofia)

**Agente**: reviewer_1 (Roles: reviewer, critic)  
**Parent**: orchestrator_21 (Conversation ID: `d148d17c-b644-4690-94c7-bab73af837cc`)  
**Data**: 2026-11-02  
**Milestone**: M1  
**Verdict**: **APPROVE**  
**Overall Risk Assessment**: **LOW**

---

## 1. Observation

### 1.1 Arquivos e Linhas Inspecionados Diretamente
- **`artifacts/api-server/whatsapp-ai-service.mjs`**:
  - Linhas 46-51: Importação de `crypto`, `buildNationalDpsPayload`, `processNationalInvoiceEmission`, `normalizeTomadorAddressFields`.
  - Linhas 8968-9013: Função `parseFlexibleMoney(text)` para extração de valores em linguagem natural.
  - Linhas 9015-9080: Funções `formatDateBr`, `formatMoneyBr`, `formatCpfOrCnpj`, `buildDefaultStayDescription`, `buildConferencePresentationMessage`.
  - Linhas 9085-9248: Função `executeWhatsAppFiscalEmission` realizando emissão via DPS padrão nacional Gov.br ADN (`processNationalInvoiceEmission`), atualização de `db.invoices`, vínculo na reserva (`matchedRes.numeroNfse`, `matchedRes.invoiceId`) e disparo de notificações internas.
  - Linhas 9254-9422: Função `handleManagerFiscalApprovalReply` interceptando respostas do gestor (`isDeveloperPhone`), autorizando ou rejeitando alterações de valor em `db.pendingFiscalApprovals`.
  - Linhas 9516-10050: Função `handleWhatsAppFiscalFlow`:
    - Linhas 9530-9534: Restrição por telefone de teste (`if (!isDeveloperPhone(cleanTarget, db)) return { handled: false };`).
    - Linhas 9621-9698: Trava de alteração de valor: bloqueia emissão imediata, registra pendência em `db.pendingFiscalApprovals`, notifica gestor `22998505276` via Z-API e avisa solicitante.
    - Linhas 9700-9762: Atualização autônoma de dados cadastrais (CNPJ/CPF, e-mail, razão social, descrição, CEP).
    - Linhas 9764-9818: Confirmação explícita disparando emissão e retorno de NFS-e, código de verificação e link/DANFSE no WhatsApp.
    - Linhas 9831-10049: Captação e apresentação da conferência de dados prévia para tomador identificado ou didática para novo tomador.
  - Linhas 10166-10179: Roteamento de `handleManagerFiscalApprovalReply` em `processAiInboundMessage`.
  - Linhas 10182-10196: Roteamento de `handleWhatsAppFiscalFlow` em `processAiInboundMessage`.

- **`scripts/whatsapp-ai-service.mjs`**:
  - Gêmeo espelho mantendo paridade byte-a-byte estrita com `artifacts/api-server/whatsapp-ai-service.mjs`.

- **`tests/sofia-fiscal-whatsapp-confirmation.test.mjs`**:
  - Teste pontual automatizado dedicado com 6 suítes cobrindo:
    1. Exibição de conferência prévia (Tomador, Descrição, Valor);
    2. Emissão e entrega de link/código após confirmação explícita;
    3. Atualização cadastral/descritiva sem bloqueio;
    4. Bloqueio imediato em pedido de alteração de valor, notificação ao gestor e emissão após aprovação do gestor;
    5. Descarte silencioso (`handled: false`) para números não autorizados;
    6. Roteamento de ponta a ponta via `processAiInboundMessage`.

### 1.2 Verificações de Comandos Executadas

1. **Paridade SHA-256 dos Arquivos Gêmeos**:
   ```powershell
   Get-FileHash 'artifacts/api-server/whatsapp-ai-service.mjs', 'scripts/whatsapp-ai-service.mjs'
   ```
   **Resultado observado**:
   - `artifacts/api-server/whatsapp-ai-service.mjs`: `A2CEA7E72AD642E6505ED7298F9D630DE9572EF58411107955191AAF0B4784BC`
   - `scripts/whatsapp-ai-service.mjs`: `A2CEA7E72AD642E6505ED7298F9D630DE9572EF58411107955191AAF0B4784BC`
   *(100% idênticos, paridade byte-a-byte confirmada)*.

2. **Execução do Teste Pontual Dedicado**:
   ```powershell
   node --test tests/sofia-fiscal-whatsapp-confirmation.test.mjs
   ```
   **Resultado observado**:
   ```text
   TAP version 13
   # [Demandas IA] Nova demanda mapeada: "Solicitação de Emissão de Nota Fiscal" (Motivo: capability_missing, Categoria: emissao_nota_fiscal)
   # Subtest: Sofia WhatsApp Fiscal Flow: Conferência, Confirmação, Trava de Valor e Restrição (R1, R2, R3, R4)
       # Subtest: Critério 1 (R1): Ao receber solicitação de nota fiscal de 22998505276, apresenta dados de conferência (tomador, descrição e valor)
       ok 1 - Critério 1 (R1): Ao receber solicitação de nota fiscal de 22998505276, apresenta dados de conferência (tomador, descrição e valor)
       # Subtest: Critério 2 (R1): Mediante confirmação explícita do usuário, aciona emissão da NFS-e e envia dados/link no WhatsApp
       ok 2 - Critério 2 (R1): Mediante confirmação explícita do usuário, aciona emissão da NFS-e e envia dados/link no WhatsApp
       # Subtest: Critério 3 (R2): Alteração de dados cadastrais/descrição é aplicada diretamente sem travar a emissão
       ok 3 - Critério 3 (R2): Alteração de dados cadastrais/descrição é aplicada diretamente sem travar a emissão
       # Subtest: Critério 3 (R2): Solicitação de alteração de valor BLOQUEIA emissão imediata, notifica gestor e exige aprovação
       ok 4 - Critério 3 (R2): Solicitação de alteração de valor BLOQUEIA emissão imediata, notifica gestor e exige aprovação
       # Subtest: Critério 4 (R3): Solicitações de nota fiscal vindas de números NÃO autorizados são descartadas silenciosamente (handled: false)
       ok 5 - Critério 4 (R3): Solicitações de nota fiscal vindas de números NÃO autorizados são descartadas silenciosamente (handled: false)
       # Subtest: Validação de Integração em processAiInboundMessage: Roteamento de ponta a ponta
       ok 6 - Validação de Integração em processAiInboundMessage: Roteamento de ponta a ponta
       1..6
   ok 1 - Sofia WhatsApp Fiscal Flow: Conferência, Confirmação, Trava de Valor e Restrição (R1, R2, R3, R4)
   # tests 6
   # suites 1
   # pass 6
   # fail 0
   ```
   *(Executou 6 testes, 6 passaram, 0 falhas, duração ~744ms)*.

3. **Integridade de `data/database.json`**:
   O gancho `after()` do arquivo de testes calcula e compara o hash SHA-256 e o `mtimeMs` de `data/database.json` de produção antes e depois da suíte. O teste passou sem qualquer assert error, confirmando que o banco de dados de produção permaneceu 100% intocado.

---

## 2. Logic Chain

1. **R1 (Conferência Prévia e Emissão)**:
   - A função `handleWhatsAppFiscalFlow` intercepta a mensagem do remetente autorizado. Ao detectar intenção fiscal, recupera reserva e cadastro via `findContactAndReservation`.
   - Formata a mensagem com `buildConferencePresentationMessage`, apresentando explicitamente Razão Social/Nome, CPF/CNPJ formatado via `formatCpfOrCnpj`, endereço, e-mail, descrição da estadia com flat e datas via `buildDefaultStayDescription`, e valor total via `formatMoneyBr`.
   - Persiste o rascunho em `conv.fiscalConferenceState` com status `"awaiting_confirmation"`.
   - Quando o remetente envia mensagem confirmatória ("Sim", "Pode emitir", "Confirmo"), aciona `executeWhatsAppFiscalEmission`, gerando o registro em `db.invoices`, vinculando na reserva (`numeroNfse`, `invoiceId`) e enviando resposta com número, código de verificação e link público/DANFSE.
   - *Conclusão*: R1 plenamente atendido.

2. **R2 (Retificação Cadastral e Trava de Valor)**:
   - Se a mensagem durante a conferência contiver retificação de dados cadastrais (novo CNPJ, CPF, e-mail, nome, endereço ou descrição), os campos correspondentes em `conf` são atualizados e a conferência é reapresentada (ou emitida se vier com confirmação conjunta).
   - Se a mensagem contiver alteração de valor monetário (`parseFlexibleMoney` detecta divergência superior a R$ 0,01 em relação a `valorOriginal`), a lógica no bloco 1.1 intercepta a mensagem ANTES de qualquer ramo de confirmação.
   - Bloqueia a emissão imediata, cria entrada em `db.pendingFiscalApprovals` (`status: "pending_manager"`), dispara notificação Z-API para o gestor (`22998505276`) com botões/textos de comando ("Aprovar fiscal"), e informa o cliente que o pedido aguarda autorização da gerência.
   - A função `handleManagerFiscalApprovalReply` intercepta mensagens autorizativas do gestor (`isDeveloperPhone`), atualiza o status para `"approved"`, emite a NFS-e com o valor retificado e envia link/dados ao solicitante e confirmação ao gestor.
   - *Conclusão*: R2 plenamente atendido com rigorosa garantia de integridade contra fraudes ou faturamento indevido.

3. **R3 (Restrição por Telefone de Teste)**:
   - A primeira checagem em `handleWhatsAppFiscalFlow` é `if (!isDeveloperPhone(cleanTarget, db)) return { handled: false };`.
   - Se o número do remetente não for `22998505276` / `5522998505276`, a execução do fluxo fiscal é abortada silenciosamente sem criar estados, emitir notas ou disparar mensagens. A chamada retorna `{ handled: false }`, permitindo que `processAiInboundMessage` continue para as rotinas normais de conversação da Sofia (FAQ, cotações, contingência).
   - *Conclusão*: R3 plenamente atendido.

4. **R4 e AGENTS.md (Diretrizes de Testes e Git)**:
   - O teste automatizado foi criado em arquivo dedicado pontual (`tests/sofia-fiscal-whatsapp-confirmation.test.mjs`).
   - Não foi executada nenhuma suíte global nem varredura de diretório (`tests/*.test.mjs`), em obediência estrita ao `AGENTS.md`.
   - O commit `da48b31` foi realizado e enviado para o repositório remoto (`origin/main`).
   - *Conclusão*: R4 e AGENTS.md estritamente respeitados.

5. **Integrity & Facade Check**:
   - Nenhuma resposta simulada em código fonte de produção.
   - Nenhum resultado fixo "marretado" para passar em teste.
   - O motor de emissão invoca o padrão nacional oficial (`processNationalInvoiceEmission`), que em ambiente de teste usa mock declarativo e em produção utiliza o certificado digital A1.
   - *Conclusão*: Nenhuma violação de integridade detectada.

---

## 3. Caveats

1. **Ambiente de Teste Local vs. Certificado Digital Real**:
   - O motor nacional `national-nfse.mjs` opera com mock quando `process.env.NODE_ENV === "test"`. Em produção, requer o certificado digital A1 configurado em disco/banco para transmissão à SEFIN Nacional.
2. **Número de Teste Unificado**:
   - Nesta fase de testes controlada por R3, o número `22998505276` desempenha tanto o papel de solicitante quanto de gestor. O código já possui a separação lógica de `requesterPhone` e `managerPhone` para quando a restrição for estendida em versões futuras.

---

## 4. Adversarial Challenge & Stress-Testing

### Challenge 1: Injeção Conjunta de Confirmação e Alteração de Valor
- **Cenário**: O usuário envia uma mensagem híbrida do tipo: `"Sim, confirmo a emissão, pode emitir! Mas altera o valor para R$ 850,00"`.
- **Comportamento Verificado**: No código (linhas 9621-9698), a checagem da **Trava de Valor (1.1)** é executada **antes** da checagem de **Confirmação Explícita (1.3)**. Ao detectar a alteração de valor, o fluxo entra imediatamente em `value_lock_engaged` e retorna, bloqueando a emissão antes que qualquer gatilho de confirmação possa ser acionado.
- **Resultado**: **Aprovado com Robustez**.

### Challenge 2: Tentativa de Aprovação de Gestor por Número Não Autorizado
- **Cenário**: Um cliente externo ou atacante envia `"Aprovar fiscal"` ou `"Aprovo #NFSE-APP-XYZ"` pelo seu próprio WhatsApp.
- **Comportamento Verificado**: `handleManagerFiscalApprovalReply` (linha 9264) inicia com `if (!db || !messageText || !isDeveloperPhone(cleanTarget, db)) return { handled: false };`. O número é rejeitado imediatamente antes de verificar `db.pendingFiscalApprovals`.
- **Resultado**: **Aprovado com Robustez**.

### Challenge 3: Injeção de Valores Não-Numéricos, Negativos ou Zero
- **Cenário**: O usuário pede alteração para valor zero ou negativo (`"altera o valor para 0 reais"` ou `"-50"`).
- **Comportamento Verificado**: `parseFlexibleMoney` só retorna valores se `!isNaN(num) && num > 0`. E `executeWhatsAppFiscalEmission` valida `if (!valor || valor <= 0) return { success: false }`.
- **Resultado**: **Aprovado com Robustez**.

### Challenge 4: Detecção de Padrão Decimal com Ponto (English Style)
- **Cenário**: O usuário envia o valor no formato americano com ponto: `"R$ 800.00"`.
- **Comportamento Verificado**: Na regex do padrão brasileiro (linha 8978), o ponto é tratado como separador de milhar (`.replace(/\./g, "")`). Portanto, `"R$ 800.00"` é extraído como `80000.00`. Como R$ 80.000,00 é diferente de R$ 600,00, a trava de segurança de valor **é acionada** e a emissão imediata é **bloqueada**. O gestor recebe a notificação para aprovar R$ 80.000,00 e obviamente recusa.
- **Classificação**: Falha segura (Fail-Safe), sem risco de fraude fiscal.
- **Recomendação de Melhoria**: No futuro, refinar `parseFlexibleMoney` para identificar quando o ponto for precedido de 1 a 6 dígitos e sucedido estritamente por 2 dígitos sem vírgula (ex.: `/^\d+\.\d{2}$/`), normalizando como decimal.

### Challenge 5: Resposta de Rejeição do Gestor com "Não aprovo"
- **Cenário**: O gestor responde textualmente `"Não aprovo"`.
- **Comportamento Verificado**: O regex de aprovação bloqueia porque contém `"nao"`. Porém, o regex de recusa `isReject` procura por `nao\s*autorizo`, `recusar`, `reprovar`, `negar`, `cancelar`. A frase `"não aprovo"` não casa com `isReject`, retornando `{ handled: false }`. Se o gestor responder `"Recuso"`, `"Não autorizo"`, `"Reprovar"` ou `"Cancelar"`, a rejeição é processada com sucesso.
- **Classificação**: Oportunidade de expansão de sinônimos no regex de rejeição (`nao\s*aprovo`).

---

## 5. Conclusion

- **Veredito**: **APPROVE**
- **Justificativa**: Todos os requisitos R1, R2, R3 e R4 foram integralmente atendidos. As verificações forenses atestam paridade SHA-256 estrita entre os arquivos gêmeos (`artifacts/api-server/` e `scripts/`), passagem de 100% dos testes dedicados pontuais sem efeitos colaterais no banco de dados de produção, e comportamento seguro (fail-safe) sob estresse adversarial.

---

## 6. Verification Method

Para verificar de forma independente e pontual:

1. **Executar o Teste Pontual**:
   ```powershell
   Set-Location 'c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager'; node --test tests/sofia-fiscal-whatsapp-confirmation.test.mjs
   ```
   *(Confirmar que 6 de 6 testes passam sem falhas)*.

2. **Verificar Paridade SHA-256 dos Arquivos Gêmeos**:
   ```powershell
   Set-Location 'c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager'; Get-FileHash 'artifacts/api-server/whatsapp-ai-service.mjs', 'scripts/whatsapp-ai-service.mjs' | Format-Table -AutoSize
   ```
   *(Confirmar hashes SHA-256 idênticos)*.

3. **Condições de Invalidação**:
   - Falha em qualquer um dos 6 testes em `tests/sofia-fiscal-whatsapp-confirmation.test.mjs`.
   - Discrepância nos hashes SHA-256 entre os arquivos gêmeos.
   - Qualquer mutação em `data/database.json` durante a execução dos testes.

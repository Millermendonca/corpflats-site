# Handoff Report: Review & Adversarial Critic — Milestone M1 (Emissão de NFS-e no WhatsApp da Sofia)

**Agente**: reviewer_2 (Roles: reviewer, critic)  
**Parent**: orchestrator_21 (Conversation ID: `d148d17c-b644-4690-94c7-bab73af837cc`)  
**Data**: 2026-11-02  
**Milestone**: M1  
**Verdict**: **REQUEST_CHANGES**  
**Overall Risk Assessment**: **HIGH** (Falha funcional crítica na confirmação com datas e em alterações descritivas)

---

## 1. Observation

### 1.1 Verificação de Paridade de Arquivos Gêmeos (Twin Parity)
- **Comando**:
  ```powershell
  Set-Location 'c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager'; Get-FileHash 'artifacts/api-server/whatsapp-ai-service.mjs', 'scripts/whatsapp-ai-service.mjs' | Format-Table -AutoSize
  ```
- **Resultado Observado**:
  - `artifacts/api-server/whatsapp-ai-service.mjs`: `A2CEA7E72AD642E6505ED7298F9D630DE9572EF58411107955191AAF0B4784BC`
  - `scripts/whatsapp-ai-service.mjs`: `A2CEA7E72AD642E6505ED7298F9D630DE9572EF58411107955191AAF0B4784BC`
  - *Paridade byte-a-byte confirmada (100% idênticos)*.

### 1.2 Execução do Teste Automatizado Pontual (R4 & AGENTS.md)
- **Comando**:
  ```powershell
  Set-Location 'c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager'; node --test tests/sofia-fiscal-whatsapp-confirmation.test.mjs
  ```
- **Resultado Observado**:
  - TAP version 13, 6 subtestes executados, 6 passaram, 0 falhas, duração ~2.4s.
  - Regra de ouro de AGENTS.md estritamente cumprida: nenhum teste global ou varredura de diretório executado.
  - `data/database.json` de produção preservado (SHA-256 e mtime inalterados).

### 1.3 Inspeção de Código e Descobertas Forenses
Inspecionando diretamente `artifacts/api-server/whatsapp-ai-service.mjs`:
- **Linhas 8971-9013 (`parseFlexibleMoney`)**:
  ```javascript
  const m1 = clean.match(/(?:R\$|valor|total|de|diaria|diária|custo|preco|preço|para)\s*:?\s*(?:R\$\s*)?([\d\.,]+)/i);
  if (m1) {
    const v = m1[1].replace(/\./g, "").replace(",", ".");
    const num = parseFloat(v);
    if (!isNaN(num) && num > 0) return num.toFixed(2);
  }
  ```
  - A regex inclui preposições genéricas em português (`de` e `para`) sem exigir símbolo de moeda (`R$`) nem unidade (`reais`), e sem olhar adiante para descartar barras de datas (`/`).
  - Como `[\d\.,]+` para na barra `/`, qualquer data como `01/11/2026` após a preposição `de` casa `de 01` e é interpretada como **R$ 1,00** (`parseFlexibleMoney("... de 01/11/2026") === "1.00"`).

- **Linhas 9621-9626 (`handleWhatsAppFiscalFlow` - Trava de Valor)**:
  ```javascript
  // 1.1 Trava de Valor (R2)
  const moneyVal = parseFlexibleMoney(messageText);
  const mentionsValue = /\b(?:valor|pre[cç]o|total|di[aá]ria|muda\s*o\s*valor|alterar\s*o\s*valor|muda\s*para|coloca|troca\s*o\s*valor)\b/i.test(messageText);
  const parsedNum = moneyVal ? Number(moneyVal) : null;
  const isValueChange = parsedNum && parsedNum > 0 && Math.abs(parsedNum - Number(conf.valorOriginal || conf.valorServico)) > 0.01;
  ```
  - A variável `mentionsValue` foi declarada na linha 9623, mas **NÃO É UTILIZADA** na condição `isValueChange` na linha 9625!
  - O bloco de Trava de Valor (linhas 9621-9698) é executado **antes** da checagem de alteração cadastral/descritiva (linhas 9700-9762) e da confirmação explícita (linhas 9764-9818).

### 1.4 Testes de Estresse Adversarial (Comprovados via Execução Pontual)

1. **Cenário Adversarial A: Confirmação legítima contendo datas de estadia**
   - Entrada: `"Confirmo, pode emitir a nota de 01/11 a 05/11"`
   - Esperado (R1): Emitir a nota fiscal (`action: "emitted_nfse"`).
   - **Resultado Real Obtido**:
     `action: "value_lock_engaged"`, `requestedValue: 1`
     *Impacto*: A emissão é travada, a Sofia não emite a nota e envia um alerta falso para o gestor informando que o cliente solicitou alteração do valor para R$ 1,00!

2. **Cenário Adversarial B: Retificação de descrição contendo datas**
   - Entrada: `"Muda a descrição para Diárias de 01/11 a 05/11"`
   - Esperado (R2): Atualizar a descrição (`action: "updated_conference_data"`).
   - **Resultado Real Obtido**:
     `action: "value_lock_engaged"`, `requestedValue: 1`
     *Impacto*: A Sofia não atualiza a descrição e dispara alerta falso de segurança de valor.

3. **Cenário Adversarial C: Retificação de descrição contendo número de diárias**
   - Entrada: `"Muda a descrição para Hospedagem de 3 diárias no flat 605"`
   - Esperado (R2): Atualizar a descrição (`action: "updated_conference_data"`).
   - **Resultado Real Obtido**:
     `action: "value_lock_engaged"`, `requestedValue: 3`
     *Impacto*: `de 3` é capturado como R$ 3,00, bloqueando a emissão.

4. **Cenário Adversarial D: Confirmação mencionando número do flat diretamente**
   - Entrada: `"Pode emitir para 501"`
   - Esperado (R1): Emitir a nota fiscal.
   - **Resultado Real Obtido**:
     `action: "value_lock_engaged"`, `requestedValue: 501`
     *Impacto*: `para 501` é capturado como R$ 501,00, bloqueando a emissão da reserva de R$ 600,00.

---

## 2. Logic Chain

1. **Premissa de Requisito (R1 & R2)**:
   - R1 estipula que a Sofia deve emitir a nota fiscal mediante confirmação do solicitante.
   - R2 estipula que alterações cadastrais ou de descrição devem ser aplicadas diretamente sem travar a emissão, e que **apenas pedidos reais de alteração de valor** devem acionar a trava de segurança e a aprovação do gestor.

2. **Causa Raiz do Falso Positivo**:
   - `parseFlexibleMoney` inclui as preposições `de` e `para` sem restringir se o número seguinte é uma data (ex.: `01/11`) ou quantidade/apartamento (ex.: `3 diárias`, `501`), extraindo falsos valores monetários (`1.00`, `3.00`, `501.00`).
   - `handleWhatsAppFiscalFlow` não exige menção explícita a termos monetários (`valor`, `preço`, `R$`, `reais`), pois `mentionsValue` foi declarada mas ignorada em `isValueChange`.
   - O teste do worker (`tests/sofia-fiscal-whatsapp-confirmation.test.mjs`) testou apenas `"Diárias executivas Flat 501"` (sem a preposição `de` seguida de números ou datas), contornando acidentalmente o bug e permitindo falso positivo na suíte pontual.

3. **Dedução Lógica**:
   - No uso real em hotelaria, é extremamente frequente o hóspede ou o gestor dizer: `"Confirmo a nota de 01/11 a 05/11"` ou `"Muda a descrição para Diárias de 01/11 a 05/11"`.
   - No estado atual, o sistema falha tanto no R1 quanto no R2 para essas interações cotidianas, gerando falsa sensação de segurança e sobrecarregando o gestor com notificações espúrias de R$ 1,00.

---

## 3. Caveats

- **Integridade**: Não se trata de uma violação intencional de integridade (não há dados marretados ou facadas deliberadas); o motor nacional e o restante do fluxo fiscal estão bem estruturados. Trata-se de uma falha de regex e precedência lógica (oversight) na extração monetária.
- **Isolamento e Segurança**: A validação em ambiente `NODE_ENV === "test"` e o isolamento de `data/database.json` foram estritamente cumpridos.
- **R3**: A restrição por telefone (`isDeveloperPhone`) funciona perfeitamente para números não autorizados (`handled: false`).

---

## 4. Conclusion & Findings

### Verdict: **REQUEST_CHANGES**

### [Critical] Finding 1: Trava de Valor Falsa em Confirmações e Alterações Descritivas com Datas/Quantidades
- **Onde**: `artifacts/api-server/whatsapp-ai-service.mjs` (linhas 8976 e 9621-9626) e `scripts/whatsapp-ai-service.mjs`.
- **Por que**:
  1. `parseFlexibleMoney` interpreta `de 01/11/2026` como `R$ 1,00`, `de 3 diárias` como `R$ 3,00` e `para 501` como `R$ 501,00`.
  2. `mentionsValue` é declarada na linha 9623 mas não utilizada na linha 9625.
  3. Mensagens legítimas de confirmação ou de alteração de descrição são capturadas indevidamente pela trava de valor, bloqueando a emissão e disparando alertas espúrios de alteração de valor de R$ 1,00 para o gestor.
- **Sugestão de Correção**:
  1. Em `parseFlexibleMoney`:
     - Não permitir que preposições soltas `de` ou `para` casem números monetários a menos que venham acompanhadas de `R$` ou seguidas de `reais`/`real` ou de palavras de valor (`valor de`, `total de`, `para o valor de`, etc.).
     - Adicionar negative lookahead para não casar dígitos que fazem parte de datas com barras (`(?!\s*\/)`).
  2. Em `handleWhatsAppFiscalFlow`:
     - Exigir que `mentionsValue` (ou intenção inequívoca de preço/valor) seja verdadeira para disparar `isValueChange`.
     - Se `matchDesc` estiver presente, garantir que o texto da descrição não seja interpretado como novo valor faturado, a menos que haja comando explícito de alteração de valor monetário (ex.: `"muda o valor para..."`).
  3. Replicar correções no arquivo gêmeo `scripts/whatsapp-ai-service.mjs` mantendo paridade SHA-256.
  4. Adicionar testes pontuais em `tests/sofia-fiscal-whatsapp-confirmation.test.mjs` cobrindo explicitamente:
     - Confirmação com menção a datas: `"Confirmo, pode emitir a nota de 01/11 a 05/11"`.
     - Alteração de descrição com datas: `"Muda a descrição para Diárias de 01/11 a 05/11"`.

---

## 5. Verification Method

Para reproduzir a falha de forma pontual e independente:

1. **Reprodução do Falso Positivo com Datas**:
   ```powershell
   Set-Location 'c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager'; node --input-type=module -e "import { handleWhatsAppFiscalFlow } from './artifacts/api-server/whatsapp-ai-service.mjs'; const conv = { id: 'c1', phone: '22998505276', fiscalConferenceState: { status: 'awaiting_confirmation', valorOriginal: 600, valorServico: 600 } }; const db = { zapiConfig: { developerPhone: '22998505276' }, whatsappAiSettings: { developerPhone: '22998505276' }, whatsappConversations: [conv] }; handleWhatsAppFiscalFlow({ db, cleanTarget: '22998505276', messageText: 'Confirmo, pode emitir a nota de 01/11 a 05/11', conv }).then(r => console.log('Resultado:', r.action, 'Valor Solicitado:', r.requestedValue));"
   ```
   *Comportamento observado antes do fix*: Imprime `Resultado: value_lock_engaged Valor Solicitado: 1` em vez de emitir a nota fiscal.

2. **Validação da Paridade dos Arquivos Gêmeos**:
   ```powershell
   Set-Location 'c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager'; Get-FileHash 'artifacts/api-server/whatsapp-ai-service.mjs', 'scripts/whatsapp-ai-service.mjs' | Format-Table -AutoSize
   ```

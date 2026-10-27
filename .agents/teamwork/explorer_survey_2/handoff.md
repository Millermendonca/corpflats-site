# Handoff Report — Maid Rates & Financial Statements Exploration

**Agent**: `explorer_survey_2`  
**Mission**: Maid Rates & Financial Statements Explorer (Milestone 2)  
**Date**: 2026-10-27  
**Status**: Hard Handoff (Investigation Complete)

---

## 1. Observation

### Obs 1: Paridade SHA-256 dos Arquivos Gêmeos
Execução do comando PowerShell:
```powershell
Get-FileHash artifacts/api-server/maid-automation-service.mjs, scripts/maid-automation-service.mjs, artifacts/api-server/demo-server.mjs, scripts/demo-server.mjs
```
Resultado obtido:
- `artifacts/api-server/maid-automation-service.mjs`: `813410E808A8B6BDC04C8422A8E39940E3408523996F13B98D1E8756442A35CA`
- `scripts/maid-automation-service.mjs`: `813410E808A8B6BDC04C8422A8E39940E3408523996F13B98D1E8756442A35CA`
- `artifacts/api-server/demo-server.mjs`: `E3E697950560C692FDFF9D2E32C0269376E905A62DD4BEC388A238022859AFA8`
- `scripts/demo-server.mjs`: `E3E697950560C692FDFF9D2E32C0269376E905A62DD4BEC388A238022859AFA8`
Ambos os pares de arquivos possuem paridade de 100% (hashes idênticos).

### Obs 2: `syncMaidCredits` e Bug de Normalização
Em `artifacts/api-server/maid-automation-service.mjs`:
- Linhas 181–184:
  ```javascript
  const defaultRate = Number(db.cleaningRates?.defaultRatePerRoom || 22.50);
  const userRate = db.cleaningRates?.userRates?.[userId] !== undefined
    ? Number(db.cleaningRates.userRates[userId])
    : defaultRate;
  ```
- Linhas 213–220:
  ```javascript
  for (const e of db.maidStatementEntries) {
    if (e.userId !== userId || e.entryType !== "credit") continue;
    const entryDate = e.entryDate || (e.createdAt ? getExecutionDateStr(e.createdAt) : "");
    if (entryDate < "2026-09-01") continue;
    if ((userId === 2 || userId === 3) && Math.abs(Number(e.amount || 0) - userRate) > 0.001) {
      e.amount = userRate;
      modified = true;
    }
  ```
- Linhas 257–267:
  ```javascript
  newEntries.push({
    id: generatePaymentId(),
    userId,
    cleaningRequestId: cleaning.id,
    paymentId: null,
    entryType: "credit",
    amount: userRate,
    description: `Diária — Flat ${flatNum}`,
    entryDate,
    createdAt: cleaning.completedAt || new Date().toISOString(),
  });
  ```
A função não verifica se o `cleaning` é do tipo `stayover`. O loop de normalização na linha 217 forçará qualquer crédito de Setembro+ para `userRate` (R$ 22,50 ou R$ 23,25), sobrescrevendo qualquer valor de Stayover (R$ 15,00).

### Obs 3: Multiplicação Indiscriminada em `getMaidPeriodFinances`
Em `artifacts/api-server/maid-automation-service.mjs:316-318`:
```javascript
const cleaningsCount = cleanings.length;
const grossAmount = Number((cleaningsCount * userRate).toFixed(2));
```
Calcula o bruto multiplicando a contagem total de limpezas (`cleaningsCount`) unicamente por `userRate`, sem discriminar limpezas de Stayover.

### Obs 4: Estrutura Atual de `db.cleaningRates` e Rotas
Em `data/database.json`:
```json
{
  "defaultRatePerRoom": 35,
  "userRates": {
    "2": 22.5,
    "3": 23.25
  }
}
```
Em `demo-server.mjs:18949-18984`:
`GET /api/cleaning/rates` e `POST /api/cleaning/rates` só leem e gravam `defaultRatePerRoom` e `userRates`. Não existem `defaultStayoverRatePerRoom` nem `userStayoverRates`.

### Obs 5: Cálculo sem Discriminação em `/api/analytics/report`
Em `demo-server.mjs:19069-19074`:
```javascript
const ratePerRoom = db.cleaningRates.userRates?.[u.id] !== undefined
  ? Number(db.cleaningRates.userRates[u.id])
  : defaultRate;

const totalToPay = userCleanings.length * ratePerRoom;
```
Multiplica todas as limpezas de `u` pela taxa de checkout (`ratePerRoom`). Além disso, no mapeamento de cada quarto limpo (linhas 19120), passa `rate: ratePerRoom` fixo.

### Obs 6: Recibo Impresso em `reports.tsx`
Em `artifacts/limpeza/src/pages/reports.tsx:89`:
```typescript
const rate = Number(cleaner.ratePerRoom || 35).toFixed(2)
```
Linha 121: Na tabela de quartos impressa:
```html
<td style="text-align: right; font-weight: bold; color: #059669; font-family: monospace;">R$ ${rate}</td>
```
Linha 262: No banner de resumo:
```html
<span>Produção Bruta: <strong>R$ ${formatBRL(gross)}</strong> (${count} quartos × R$ ${rate})</span>
```
Todas as linhas e totais assumem uma única taxa de quarto.

### Obs 7: Card de Prestadoras Autônomas em `hr-dashboard.tsx`
Em `artifacts/limpeza/src/pages/hr-dashboard.tsx:1406-1422`:
O card renderiza a constante `PRESTADORAS_AUTONOMAS` (linhas 411–430) com informações estáticas. Não consome `/api/cleaning/rates` nem possui inputs para editar os valores de Check-out e Stayover de Cris e Grazi.

---

## 2. Logic Chain

1. **A partir de Obs 4**, `db.cleaningRates` não possui as chaves `defaultStayoverRatePerRoom` e `userStayoverRates`. Para atender ao Requisito R2, a API deve suportar `defaultStayoverRatePerRoom` (padrão 15.00) e `userStayoverRates` (Cris `id: 2` = 15.00, Grazi `id: 3` = 15.00), e persisti-las em `GET /api/cleaning/rates` e `POST /api/cleaning/rates`.
2. **A partir de Obs 2**, quando um card de Stayover for concluído (marcado como `clean`), a chamada reativa a `syncMaidCredits(userId)` precisa creditar `userStayoverRate` (R$ 15,00) em vez de `userRate` (R$ 22,50/23,25). Além disso, o loop de normalização de Setembro+ precisa ser protegido para não sobrescrever créditos de Stayover. A descrição deve ser gerada como `Diária Stayover — Flat ${flatNum}` para discriminação contábil.
3. **A partir de Obs 3 e Obs 5**, tanto o cálculo da quinzena (`getMaidPeriodFinances`) quanto o relatório analítico (`/api/analytics/report`) devem segregar `checkoutCleanings` de `stayoverCleanings`. O subtotal bruto de cada camareira deve ser a soma exata: `(checkoutCount * checkoutRate) + (stayoverCount * stayoverRate)`. Cada item no array `cleanings` deve refletir sua taxa e seu tipo (`stayover` vs `checkout`).
4. **A partir de Obs 6 e Obs 7**, os componentes de frontend devem ser enriquecidos:
   - `reports.tsx`: Modal de taxas deve permitir configurar `defaultStayoverRatePerRoom` e `userStayoverRates` para cada colaboradora. O gerador do recibo A4 (`printReceiptWindow`) deve exibir a taxa individual de cada quarto, a identificação do tipo (`[Stayover]` vs `[Check-out]`) e o subtotal discriminando a quantidade e valores de cada modalidade.
   - `hr-dashboard.tsx`: O card de Prestadoras Autônomas deve carregar os valores da API e permitir a edição direta das taxas de Check-out e Stayover de Cris e Grazi, salvando via `POST /api/cleaning/rates`.
   - `maid-statement.tsx`: As movimentações de crédito devem destacar o badge `Stayover` quando aplicável, e o modal de comprovante deve explicitar o tipo de serviço prestado.
5. **A partir de Obs 1**, toda e qualquer alteração efetuada nos arquivos de backend deve ser replicada de forma idêntica entre `artifacts/api-server/` e `scripts/`, garantindo 100% de paridade SHA-256.

---

## 3. Caveats

- **Transição de Dados Legados**: Entradas de créditos de limpezas concluídas antes do lançamento desta funcionalidade não possuem o campo `cleaningType`. A inferência deve considerar `cleaningType || (cleaningRequestId ? linkedCleaning.source : null) || (description.includes("Stayover") ? "stayover" : "checkout")`.
- **Limpeza de Setembro/Agosto**: O código em `syncMaidCredits` preserva estritamente intocadas as entradas anteriores a `2026-09-01` (Agosto). Essa regra de negócio foi respeitada e deve ser mantida.
- **Não modificação de código nesta etapa**: Como este agente possui perfil read-only de exploração, nenhuma alteração em arquivos de produção foi realizada. Todas as propostas e contratos estão descritos neste relatório e em `analysis.md`.

---

## 4. Conclusion

O sistema possui uma arquitetura centralizada e consistente para a apuração de diárias através de `maid-automation-service.mjs` e `demo-server.mjs`. No entanto, atualmente todas as limpezas são tratadas como uma única modalidade tarifada à taxa de check-out.

Para atender plenamente o Milestone 2 e os critérios de aceitação R2:
1. `db.cleaningRates` deve armazenar `defaultStayoverRatePerRoom: 15.00` e `userStayoverRates: { "2": 15.00, "3": 15.00 }`.
2. As rotas `GET /api/cleaning/rates` e `POST /api/cleaning/rates` devem ler e persistir ambos os campos.
3. `syncMaidCredits` e `getMaidPeriodFinances` em `maid-automation-service.mjs` (com paridade estrita em `scripts/` e `artifacts/api-server/`) devem discriminar Check-out e Stayover na geração de entradas, no loop de normalização e no cálculo do valor bruto.
4. `/api/analytics/report` e `/api/maids/:userId/statement` devem retornar contagens e valores separados de Check-out e Stayover.
5. As telas `reports.tsx`, `hr-dashboard.tsx` e `maid-statement.tsx` devem refletir a edição de taxas e a exibição discriminada nos demonstrativos e recibos de impressão.

---

## 5. Verification Method

Para verificar de forma independente as observações e o plano:

1. **Paridade SHA-256 Atual**:
   ```powershell
   Get-FileHash artifacts/api-server/maid-automation-service.mjs, scripts/maid-automation-service.mjs, artifacts/api-server/demo-server.mjs, scripts/demo-server.mjs | Format-Table -AutoSize
   ```
   *Condição de invalidação*: Qualquer diferença entre os hashes dos pares gêmeos.

2. **Inspeção de `db.cleaningRates` no Banco**:
   ```bash
   node -e "const db = JSON.parse(require('fs').readFileSync('data/database.json', 'utf8')); console.log(db.cleaningRates);"
   ```
   *Resultado esperado*: Atualmente contém apenas `defaultRatePerRoom` e `userRates`.

3. **Verificação de Vulnerabilidade de Normalização**:
   Inspecionar `artifacts/api-server/maid-automation-service.mjs:213-228`.
   *Constatação*: O loop sobrescreve qualquer `e.amount` que divirja de `userRate` para os usuários 2 e 3.

4. **Teste Pontual do Módulo (quando implementado pelo implementador)**:
   ```bash
   node tests/b2b-stayover-housekeeping.test.mjs
   ```
   *Regra*: Nunca executar suítes de testes globais ou em lote (`AGENTS.md`).

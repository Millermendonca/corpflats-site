# Análise Técnica Profunda: Tarifas de Camareiras & Extratos Financeiros (Milestone 2)

**Agente**: `explorer_survey_2` (Maid Rates & Financial Statements Explorer)  
**Data**: 2026-10-27  
**Escopo**: Milestone 2 (F4: Stayover Rates Configuration & F5: Maid Credits & Financial Statements) e componentes de interface associados (F9).

---

## 1. Verificação de Paridade SHA-256 (Twin Services & Servers)

Executada verificação via PowerShell `Get-FileHash`:

| Par de Arquivos | Hash SHA-256 | Status de Paridade |
|-----------------|--------------|-------------------|
| `artifacts/api-server/maid-automation-service.mjs`<br>`scripts/maid-automation-service.mjs` | `813410E808A8B6BDC04C8422A8E39940E3408523996F13B98D1E8756442A35CA` | **100% IDÊNTICOS** |
| `artifacts/api-server/demo-server.mjs`<br>`scripts/demo-server.mjs` | `E3E697950560C692FDFF9D2E32C0269376E905A62DD4BEC388A238022859AFA8` | **100% IDÊNTICOS** |

**Diretriz para Implementação**: Qualquer alteração efetuada nos arquivos de backend deve ser replicada de forma estritamente idêntica (byte a byte) entre `artifacts/api-server/` e `scripts/`.

---

## 2. Análise de `maid-automation-service.mjs`

### 2.1. `syncMaidCredits(db, userId)` (Linhas 173–278)
- **Localização**: `artifacts/api-server/maid-automation-service.mjs:173-278` e `scripts/maid-automation-service.mjs:173-278`.
- **Como funciona hoje**:
  1. Lê a taxa padrão e taxa por usuário:
     ```javascript
     const defaultRate = Number(db.cleaningRates?.defaultRatePerRoom || 22.50);
     const userRate = db.cleaningRates?.userRates?.[userId] !== undefined
       ? Number(db.cleaningRates.userRates[userId])
       : defaultRate;
     ```
  2. Filtra `db.cleaningRequests` atribuídas ao usuário com status `clean`:
     ```javascript
     const cleanings = (db.cleaningRequests || []).filter(r => {
       if (r.status !== "clean" || r.isBedAdjustmentOnly || r.isInstructionOnly || r.type === "instruction" || r.source === "manual_instruction" || r.isPaidCleaning === false) return false;
       if (r.id === 1 && (r.flatId === 22 || r.requestDate === "2026-09-01")) return false;
       return r.assignedUserId === userId;
     });
     ```
  3. **Vulnerabilidade Crítica Identificada (Linhas 213–228)**:
     O loop de normalização de créditos de Setembro+ atualmente força todos os créditos para `userRate`:
     ```javascript
     if ((userId === 2 || userId === 3) && Math.abs(Number(e.amount || 0) - userRate) > 0.001) {
       e.amount = userRate;
       modified = true;
     }
     ```
     *Impacto*: Se uma limpeza for de Stayover (R$ 15,00), a normalização existente sobrescreverá o valor para R$ 22,50 (Cris) ou R$ 23,25 (Grazi).
     *Solução necessária*: O loop de normalização deve verificar se a entrada ou a limpeza vinculada é Stayover (`e.cleaningType === "stayover"` ou `e.description.includes("Stayover")` ou `linkedCleaning.cleaningType === "stayover"`). Se for Stayover, a taxa esperada é `userStayoverRate` (ex.: R$ 15,00); caso contrário, `userRate` (Check-out).
  4. **Criação de Novas Entradas no Extrato (Linhas 257–268)**:
     Atualmente gera:
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
     *Solução necessária*:
     - Detectar `const isStayover = cleaning.cleaningType === "stayover" || cleaning.source === "stayover";`
     - Determinar taxa: `const cleaningAmount = isStayover ? userStayoverRate : userRate;`
     - Definir descrição: `description: isStayover ? `Diária Stayover — Flat ${flatNum}` : `Diária — Flat ${flatNum}``
     - Gravar `cleaningType: isStayover ? "stayover" : "checkout"`

### 2.2. `getMaidPeriodFinances(db, userId, startDate, endDate)` (Linhas 283–400)
- **Localização**: `artifacts/api-server/maid-automation-service.mjs:283-400`
- **Como funciona hoje**:
  Linhas 316–318:
  ```javascript
  const cleaningsCount = cleanings.length;
  const grossAmount = Number((cleaningsCount * userRate).toFixed(2));
  ```
  *Problema*: Multiplica a quantidade total de limpezas diretamente pela taxa de checkout (`userRate`). Se houver limpezas de Stayover, o valor bruto fica superfaturado.
  *Solução necessária*:
  Separar a contagem e apuração:
  ```javascript
  const checkoutCleanings = cleanings.filter(r => r.cleaningType !== "stayover" && r.source !== "stayover");
  const stayoverCleanings = cleanings.filter(r => r.cleaningType === "stayover" || r.source === "stayover");

  const checkoutCount = checkoutCleanings.length;
  const stayoverCount = stayoverCleanings.length;

  const checkoutGross = Number((checkoutCount * userCheckoutRate).toFixed(2));
  const stayoverGross = Number((stayoverCount * userStayoverRate).toFixed(2));
  const grossAmount = Number((checkoutGross + stayoverGross).toFixed(2));
  ```
  Retornar os campos discriminados:
  `checkoutCount`, `stayoverCount`, `checkoutGross`, `stayoverGross`, `userCheckoutRate`, `userStayoverRate` no objeto retornado por `getMaidPeriodFinances`.

### 2.3. `getMaidStats(db, maidUserId, targetDateStr)` (Linhas 404–513)
- Linhas 469–488: Agrupa as diárias por data para o `dayBreakdown` das mensagens de WhatsApp.
- Pode discriminar os tipos no detalhamento diário:
  `• 27/10/2026: Flat 211 (Saída), Flat 114 (Stayover) (2 quartos: 1 saída, 1 stayover)`
- Na tag `{{valor_por_quarto}}`: Se houver taxas distintas, pode formatar como `R$ 22,50 (Saída) / R$ 15,00 (Stayover)`.

---

## 3. Análise da Estrutura de `db.cleaningRates` e Rotas em `demo-server.mjs`

### 3.1. Estrutura Atual vs. Nova Estrutura
- **Estado atual em `data/database.json`**:
  ```json
  {
    "defaultRatePerRoom": 35.0,
    "userRates": {
      "2": 22.5,
      "3": 23.25
    }
  }
  ```
- **Inicialização em `demo-server.mjs` (Linhas 4228–4236 e 18950–18956)**:
  Atualmente assegura apenas `defaultRatePerRoom` e `userRates` ("2": 22.50, "3": 23.25).
- **Nova Estrutura Obrigatória (R2)**:
  ```json
  {
    "defaultRatePerRoom": 22.50,
    "userRates": {
      "2": 22.50,
      "3": 23.25
    },
    "defaultStayoverRatePerRoom": 15.00,
    "userStayoverRates": {
      "2": 15.00,
      "3": 15.00
    }
  }
  ```

### 3.2. Endpoints `/api/cleaning/rates`
- **GET `/api/cleaning/rates` (Linhas 18949–18971)**:
  - Atualmente retorna:
    ```javascript
    res.json({
      defaultRatePerRoom: Number(db.cleaningRates.defaultRatePerRoom || 22.50),
      userRates: db.cleaningRates.userRates || {},
      cleaners: list // cada cleaner com 'rate'
    });
    ```
  - Alteração necessária:
    - Incluir `defaultStayoverRatePerRoom: Number(db.cleaningRates.defaultStayoverRatePerRoom || 15.00)`.
    - Incluir `userStayoverRates: db.cleaningRates.userStayoverRates || {}`.
    - Na lista `cleaners`, incluir para cada colaboradora:
      `stayoverRate: db.cleaningRates.userStayoverRates?.[u.id] !== undefined ? Number(db.cleaningRates.userStayoverRates[u.id]) : Number(db.cleaningRates.defaultStayoverRatePerRoom || 15.00)`.
- **POST `/api/cleaning/rates` (Linhas 18973–18984)**:
  - Protegido por autenticação (`admin` ou `dev`).
  - Lê `defaultRatePerRoom` e `userRates` de `req.body`.
  - Alteração necessária:
    - Extrair também `defaultStayoverRatePerRoom` e `userStayoverRates`.
    - Persistir:
      ```javascript
      if (defaultStayoverRatePerRoom !== undefined) db.cleaningRates.defaultStayoverRatePerRoom = Number(defaultStayoverRatePerRoom);
      if (userStayoverRates !== undefined) db.cleaningRates.userStayoverRates = userStayoverRates;
      ```

---

## 4. Análise de `/api/analytics/report` e `/api/maids/:userId/statement`

### 4.1. `/api/analytics/report` (Linhas 18986–19252)
- Linha 19041–19078: Apuração para cada colaboradora `u`:
  Atualmente:
  ```javascript
  const ratePerRoom = db.cleaningRates.userRates?.[u.id] !== undefined
    ? Number(db.cleaningRates.userRates[u.id])
    : defaultRate;
  const totalToPay = userCleanings.length * ratePerRoom;
  ```
  Alteração necessária:
  ```javascript
  const userStayoverRate = db.cleaningRates.userStayoverRates?.[u.id] !== undefined
    ? Number(db.cleaningRates.userStayoverRates[u.id])
    : Number(db.cleaningRates.defaultStayoverRatePerRoom || 15.00);

  const checkoutCleanings = userCleanings.filter(c => c.cleaningType !== "stayover" && c.source !== "stayover");
  const stayoverCleanings = userCleanings.filter(c => c.cleaningType === "stayover" || c.source === "stayover");

  const checkoutCount = checkoutCleanings.length;
  const stayoverCount = stayoverCleanings.length;
  const checkoutTotal = checkoutCount * ratePerRoom;
  const stayoverTotal = stayoverCount * userStayoverRate;
  const totalToPay = checkoutTotal + stayoverTotal;
  ```
  E nos objetos do array `cleanings` da colaboradora (Linhas 19104–19123):
  Adicionar `cleaningType: isStayover ? "stayover" : "checkout"` e definir `rate: isStayover ? userStayoverRate : ratePerRoom`.
- Na resposta global:
  Adicionar `totalCheckoutCleanings` e `totalStayoverCleanings`.

### 4.2. `/api/maids/:userId/statement` e `/api/maids/statement/me` (Linhas 50545–50625)
- `buildStatement(userId)` chama `syncMaidCredits(userId)`, que carrega as diárias sincronizadas de `db.maidStatementEntries`.
- Cada entrada conterá `cleaningType: "stayover" | "checkout"` e descrição discriminada (`Diária Stayover — Flat X` vs `Diária — Flat X`), com o `amount` correspondente (R$ 15,00 vs R$ 22,50/23,25).
- O saldo cumulativo (`balanceAfter`) é calculado dinamicamente somando/subtraindo o `amount` de cada entrada, permanecendo matematicamente perfeito.

---

## 5. Análise do Frontend

### 5.1. `artifacts/limpeza/src/pages/reports.tsx`
1. **Modal de Configuração de Taxas (`ratesModalOpen`, Linhas 676–680, 1070–1096, 2292–2376)**:
   - Hoje possui apenas:
     - Input de `Valor Padrão Base (R$)` (`defaultRateInput`)
     - Input único por colaboradora (`userRatesInput[userId]`)
   - Alteração necessária:
     - Adicionar estado `defaultStayoverRateInput` (inicializado com `15.00`).
     - Adicionar estado `userStayoverRatesInput` (`Record<string, string>`).
     - No formulário do modal, incluir o campo para taxa base de Stayover (R$ 15,00) e duas colunas de inputs para cada colaboradora: **Saída (Check-out)** e **Diária (Stayover)**.
     - No `handleSaveRates`, enviar ambos os blocos para `POST /api/cleaning/rates`.
2. **Impressão do Recibo Executivo (`printReceiptWindow`, Linhas 85–320)**:
   - Linha 89: Atualmente usa taxa única: `const rate = Number(cleaner.ratePerRoom || 35).toFixed(2)`.
   - Linha 119–121: Linhas da tabela de quartos exibem apenas `Apartamento ${c.flatNumber}` e `R$ ${rate}`.
   - Linha 262: Banner exibe apenas `(${count} quartos × R$ ${rate})`.
   - Alteração necessária:
     - Na tabela, exibir a discriminação visual: `Apartamento ${c.flatNumber} • Stayover (Diária)` ou `Check-out (Saída)`.
     - Exibir na coluna valor o rate real do item (`R$ ${c.rate}`).
     - No banner e subtotal, exibir contagens separadas: `${cleaner.checkoutCount || count} saídas (R$ ${cleaner.ratePerRoom || 22.50}) + ${cleaner.stayoverCount || 0} stayovers (R$ ${cleaner.stayoverRate || 15.00})`.

### 5.2. `artifacts/limpeza/src/pages/hr-dashboard.tsx`
1. **Card "Prestadoras Autônomas de Governança (Cris & Grazi)" (Linhas 1367–1425)**:
   - Atualmente possui apenas texto estático renderizando a constante `PRESTADORAS_AUTONOMAS` (Linhas 411–430), com o botão "Abrir Extrato de Governança" apontando para `/reports`.
   - Não há exibição nem edição das taxas de diária.
   - Alteração necessária (R2):
     - Buscar taxas da rota `GET /api/cleaning/rates`.
     - Exibir para Cris e Grazi:
       - **Taxa Check-out**: Cris R$ 22,50 | Grazi R$ 23,25 (editável)
       - **Taxa Stayover**: Cris R$ 15,00 | Grazi R$ 15,00 (editável)
     - Permitir edição rápida com botão "Salvar Tarifas", enviando `POST /api/cleaning/rates`.

### 5.3. `artifacts/limpeza/src/pages/maid-statement.tsx`
1. **Feed Mobile e Tabela Desktop (Linhas 662–738, 777–855)**:
   - As entradas do extrato exibem a `description`.
   - Para entradas de Stayover, exibir um badge específico (ex.: `<Badge className="bg-indigo-500/15 text-indigo-700">Stayover</Badge>`).
2. **Modal de Comprovante (Linhas 861–985)**:
   - No cabeçalho e detalhamento, discriminar se o crédito foi de **Limpeza de Stayover (Diária)** ou **Limpeza de Check-out (Saída)**.
3. **Resumo Financeiro (Linhas 557–600)**:
   - Exibir na seção de Diárias Realizadas o detalhamento de quantas foram Check-out e quantas foram Stayover.

---

## 6. Conclusões e Recomendações de Implementação

1. **Ordem de Execução Recomendada**:
   - Fase 1: Atualização das estruturas de taxas e funções canônicas em `maid-automation-service.mjs` (com paridade imediata em `scripts/` e `artifacts/api-server/`).
   - Fase 2: Atualização dos endpoints em `demo-server.mjs` (`/api/cleaning/rates` e `/api/analytics/report`).
   - Fase 3: Atualização do frontend em `reports.tsx`, `hr-dashboard.tsx` e `maid-statement.tsx`.
   - Fase 4: Build de verificação (`npm run build` em `artifacts/limpeza`) e execução do teste pontual dedicado `tests/b2b-stayover-housekeeping.test.mjs`.
2. **Blindagem contra Riscos**:
   - A normalização de Setembro+ em `syncMaidCredits` deve obrigatoriamente checar se a entrada é Stayover antes de alterar o valor para `userRate`.
   - Manter compatibilidade com entradas históricas de Agosto/Setembro que não possuem o campo `cleaningType`.

# Relatório de Auditoria e Diagnóstico de Integridade de Banco de Dados
**Módulo**: Database & Multi-Flat Integrity Explorer  
**Data da Investigação**: 2026-09-29T05:20:00Z (Horário Local: 2026-09-29T02:20:00-03:00)  
**Alvo**: `data/database.json`, backups em `data/backups/`, scripts de migração/sincronização e rotinas de integridade universal  

---

## 1. Sumário Executivo

A auditoria forense do banco de dados `data/database.json` (1.44 MB, 19 flats ativos, 240 solicitações de limpeza, 195 reservas, 341 lançamentos de extrato de camareiras, 505 audit logs) identificou com precisão cirúrgica a origem e a cadeia causal das inconsistências relatadas nos Flats 313, 511, 512, 712, 904 e em toda a base de flats:

1. **Flat 313 & Limpeza Fantasma ID 1358**:
   - A reserva de Leonardo Primo de Sousa (`id: 283`, `code: RES-313-0267`, check-out em 25/09) foi sincronizada no PMS retroativamente em 27/09.
   - O Flat 313 foi devidamente limpo por Grazi em 26/09 (ID 1336, 14:05), preparando o quarto para o hóspede seguinte (Felipe, entrada em 28/09).
   - Porém, a rotina `reconcileUniversalIntegrity` (linhas 1691-1733 de `demo-server.mjs`) exigia estritamente uma limpeza na data exata `2026-09-25`. Como não encontrou limpeza com data 25/09, gerou automaticamente a limpeza ID 1358 com `status: "dirty"`.
   - Essa limpeza suja retroativa permaneceu no banco e foi arrastada como pendência prioritária (`isPendingFromPreviousDay`) pelas linhas 5843-5883 de `demo-server.mjs`, embora o quarto já tivesse sido higienizado no dia 26 e o hóspede Felipe já estivesse hospedado.

2. **Flat 511 & Atribuição Indevida a Grazi no Dia 26/09 (ID 1338)**:
   - No sábado, 26/09/2026, a camareira em escala real era **Cris** (User ID 2). Cris realizou a limpeza do Flat 511 (ID original 1324), com crédito lançado em seu extrato (`pay_1790528959693_pnzhpy`, R$ 22,50).
   - O script `scripts/apply_maid_cleanings_dia26.mjs` foi executado em 28/09 às 05:58Z sob a premissa incorreta de que Grazi havia trabalhado no dia 26.
   - O script inseriu os cards 1336 a 1340 para Grazi com `adminNote: "Limpeza realizada por Grazi"`, apagou/substituiu as limpezas de Cris (1322, 1323, 1324) e gerou créditos em duplicidade no extrato de Grazi (`stmt_3_1338_20260928`, R$ 23,25).
   - Resultado: Pagamento duplo para a mesma faxina no extrato e camareira errada atribuída em seu dia de folga. O mesmo problema atingiu os Flats 907 (ID 1339) e 1004 (ID 1340).

3. **Flat 512 vs 712 (`RES-712-0291` & ID 1351)**:
   - A reserva `RES-712-0291` (Miller Mendonça Pessanha, check-in 12/10, check-out 13/10) possui código do Flat 712 e token `bfk_res7120291`, mas foi gravada no banco com `flatId: 12` e `flatNumber: "512"`.
   - Por consequência, a rotina `reconcileUniversalIntegrity` gerou a limpeza de check-out ID 1351 para o Flat 512, poluindo a grade do Flat 512 com uma reserva que é do Flat 712.
   - Além disso, no Flat 512, o motor de integridade possui uma regra reativa (linhas 1736-1753) que reverte qualquer limpeza `clean` recente para `dirty` caso não possua `assignedUserId` ou `completedAt`, impedindo a liberação definitiva do flat.

4. **Transtorno das 18h no Dashboard (Flat 904)**:
   - No frontend (`dashboard.tsx`, linhas 37-43), ao atingir 18:00 o seletor padrão avança automaticamente para o dia seguinte (`getDefaultDate()`).
   - O Flat 904 tinha check-out do hóspede Jorge agendado para 29/09. Às 18:05 de 28/09, o painel carregou o dia 29/09 mostrando o quarto sujo. Como não há aviso claro de "Visualização de Amanhã / Modo Noturno", o usuário presumiu que o sistema estava exibindo uma pendência de ontem.

5. **Auditoria Universal dos 19 Flats**:
   - Detectadas 4 limpezas sujas fantasmas retroativas no banco: ID 1362 (Flat 408 - no-show de Yan que permaneceu limpo), ID 1364 (Flat 113 - check-out de Thayla em 26/09 já limpo por Cris em 27/09 ID 1335), ID 1358 (Flat 313 - check-out de Leonardo já limpo por Grazi em 26/09 ID 1336), e ID 1361 (Flat 712 - 25/09).
   - Detectadas 17 reservas com divergência entre o prefixo do código (`RES-XXX-`) e os campos `flatNumber` / `flatId`. 16 decorrem de transferências de apartamento no calendário PMS (drag & drop), enquanto 1 (`RES-712-0291`) é um erro de alocação que requer correção imediata.

---

## 2. Investigação Detalhada por Quarto Crítico

### 2.1. Flat 313 — Análise de Causa Raiz da Limpeza ID 1358

#### Linha do Tempo Reconstruída (Auditoria Forense):
- **2026-09-21 a 2026-09-24**: Estada de Nagem (`RES-313-0174`).
- **2026-09-24 14:55:00Z**: Cris realiza e conclui limpeza de check-out (ID 1251, `status: "clean"`, `assignedUserId: 2`).
- **2026-09-24 a 2026-09-25**: Estada de Leonardo Primo de Sousa (`RES-313-0267`, `id: 283`). Hóspede sai no dia 25/09.
- **2026-09-25**: O Flat 313 fica vago. Nenhuma faxina é registrada neste dia para o 313 (Cris limpou 8 quartos e Grazi estava de vale/folga).
- **2026-09-26 14:05:00Z**: Grazi realiza limpeza completa no Flat 313 (ID 1336, `status: "clean"`, `assignedUserId: 3`, `completedAt: "2026-09-26T14:05:00.000Z"`). O quarto fica 100% pronto e higienizado.
- **2026-09-27 18:43:46Z**: O PMS recebe ou regulariza a reserva 283 de Leonardo Primo (`createdAt: "2026-09-27T18:43:46.695Z"`).
- **2026-09-28**: Felipe faz check-in no Flat 313 (`RES-313-0301`, check-in 28/09, check-out 02/10).
- **Execução de `reconcileUniversalIntegrity`**:
  ```javascript
  // artifacts/api-server/demo-server.mjs:1694-1697
  const checkoutDate = r.checkoutDate; // "2026-09-25"
  const hasCleaning = db.cleaningRequests.some(c => 
    (String(c.flatNumber) === String(r.flatNumber) || c.flatId === r.flatId) &&
    (c.requestDate === checkoutDate || c.effectiveDate === checkoutDate)
  );
  ```
  Como a limpeza efetuada estava datada de `2026-09-26` (ID 1336) e a reserva 283 tinha check-out em `2026-09-25`, `hasCleaning` retornou `false`.
  O motor gerou a solicitação de limpeza ID 1358 com data 25/09 e `status: "dirty"`.
- **Efeito no Dashboard**:
  Ao consultar datas iguais ou posteriores a 25/09 (`getRequestsForDate` em `demo-server.mjs:5843`), a rotina de carry-over encontrou o ID 1358 como `status: "dirty"` e o adicionou com `isPendingFromPreviousDay: true`.
  Isso causou a exibição de uma faxina pendente para Leonardo Primo de Sousa enquanto Felipe já estava no quarto.

#### Diagnóstico Técnico:
O ID 1358 é um clone órfão e desnecessário da faxina ID 1336 realizada por Grazi em 26/09. A falha no motor de integridade é não verificar se o flat já foi higienizado entre o check-out da reserva anterior e o check-in da reserva seguinte antes de forçar a criação de um card sujo.

---

### 2.2. Flat 511 — Análise da Atribuição Indevida a Grazi (Card 1338)

#### Contexto e Evidências no Banco:
- No dia **26/09/2026**, o backup `database_backup_pre_dia26_1790575107604.json` continha:
  ```json
  {
    "id": 1324,
    "flatNumber": "511",
    "requestDate": "2026-09-26",
    "status": "clean",
    "assignedUserId": 2,
    "assignedUsername": "Cris",
    "completedAt": "2026-09-26T18:00:00.000Z",
    "adminNote": "Limpeza concluída por Cris (recuperada da auditoria)"
  }
  ```
- O extrato de Cris (`db.maidStatementEntries`) possui o lançamento correspondente:
  - ID: `pay_1790528959693_pnzhpy`
  - `userId`: 2 (Cris)
  - `cleaningRequestId`: 1324
  - `amount`: R$ 22,50
  - `entryDate`: 2026-09-26
  - `description`: "Diária — Flat 511"
- Em 28/09 às 05:58:27Z, o script `apply_maid_cleanings_dia26.mjs` sobrescreveu/apagou o ID 1324 e criou o ID 1338:
  ```json
  {
    "id": 1338,
    "flatId": 11,
    "flatNumber": "511",
    "requestDate": "2026-09-26",
    "status": "clean",
    "assignedUserId": 3,
    "assignedUsername": "Grazi",
    "adminNote": "Limpeza realizada por Grazi",
    "addedBy": "admin",
    "completedAt": "2026-09-26T15:35:00.000Z"
  }
  ```
- O mesmo script injetou um crédito indevido para Grazi:
  - ID: `stmt_3_1338_20260928`
  - `userId`: 3 (Grazi)
  - `cleaningRequestId`: 1338
  - `amount`: R$ 23,25
  - `entryDate`: 2026-09-26
  - `description`: "Diária — Flat 511"

#### Diagnóstico da Escala:
Grazi **não estava de serviço no dia 26/09**. Quem trabalhou foi Cris.
O script cometeu o mesmo erro nos seguintes quartos no dia 26/09:
- **Flat 907**: Cris limpou (ID 1323, R$ 22,50). Script criou ID 1339 para Grazi e crédito `stmt_3_1339_20260929` (R$ 23,25).
- **Flat 1004**: Cris limpou (ID 1322, R$ 22,50). Script criou ID 1340 para Grazi e crédito `stmt_3_1340_20260930` (R$ 23,25).

#### Impacto Financeiro Atual no Banco:
- O extrato de Grazi possui **R$ 69,75 em créditos indevidos** no dia 26/09 referentes aos Flats 511, 907 e 1004.
- As limpezas de Cris (1322, 1323, 1324) ficaram como referências fantasmas no extrato dela porque seus IDs foram removidos de `cleaningRequests`.

---

### 2.3. Flat 512 & 712 — Mismatch da Reserva `RES-712-0291` e Loop de Reabertura

#### Inconsistência na Reserva `RES-712-0291`:
- Registro em `data/database.json`:
  ```json
  {
    "id": 291,
    "code": "RES-712-0291",
    "flatNumber": "512",
    "flatId": 12,
    "guestName": "Miller Mendonça Pessanha",
    "checkinDate": "2026-10-12",
    "checkoutDate": "2026-10-13",
    "breakfastToken": "bfk_res7120291"
  }
  ```
- **Conflito evidente**: O código e o token de café são explicitamente do **Flat 712**, mas o `flatNumber` e `flatId` foram associados ao **Flat 512** (`flatId: 12`).
- **Impacto**: O motor de integridade criou o Cleaning Request ID 1351:
  - `flatId`: 12
  - `flatNumber`: "512"
  - `requestDate`: "2026-10-13"
  - `adminNote`: "Limpeza de check-out gerada automaticamente para o Flat 512 (Reserva RES-712-0291)"
  Isso causa uma limpeza futura indevida na fila do Flat 512.

#### Loop de Reabertura de Limpezas (Flat 512 e outros):
- Em `demo-server.mjs`, linhas 1736-1753:
  ```javascript
  const recentWindow = typeof getOffsetDateStr === "function" ? getOffsetDateStr(-7) : "2026-09-20";
  (db.cleaningRequests || []).forEach(c => {
    if (
      c.source === "checkout" &&
      c.status === "clean" &&
      !c.assignedUserId &&
      !c.completedAt &&
      c.requestDate >= recentWindow &&
      c.adminNote && c.adminNote.includes("Limpeza de check-out gerada automaticamente")
    ) {
      c.status = "dirty";
      c.durationMinutes = null;
      changed = true;
      console.log(`[Universal Integrity] Corrigindo limpeza não realizada do Flat ${c.flatNumber} em ${c.requestDate} de clean para dirty`);
    }
  });
  ```
- Quando o administrador marca manualmente um card de check-out gerado automaticamente como `clean` pela interface ou por endpoint administrativo, os campos `assignedUserId` e `completedAt` muitas vezes ficam nulos (pois foi uma liberação administrativa, e não o encerramento do app da camareira).
- Toda vez que a API inicia ou qualquer sincronização de integridade roda, essa regra detecta `!c.assignedUserId && !c.completedAt` e **reverte unilateralmente o status para `dirty`**!
- Uma vez `dirty`, o Flat 512 volta a ser carregado pelo endpoint `/api/cleaning/checkouts` como quarto sujo ou pendência anterior, gerando o loop infinito de reabertura.

---

### 2.4. Flat 904 — Tratamento da Virada de Data das 18h no Dashboard

#### Lógica Atual em `dashboard.tsx`:
```tsx
// artifacts/limpeza/src/pages/dashboard.tsx:37-43
function getDefaultDate(userRole?: string) {
  const now = new Date()
  if (now.getHours() >= 18) {
    return format(addDays(now, 1), "yyyy-MM-dd")
  }
  return format(now, "yyyy-MM-dd")
}
```
- Em 28/09, o Flat 904 teve check-in de Jorge (`RES-904-0297`), com saída programada para 29/09.
- O motor de integridade gerou a solicitação de limpeza de saída ID 1345 com `requestDate: "2026-09-29"` (`status: "dirty"`).
- Às 18:00 de 28/09, o usuário acessou o dashboard. A função `getDefaultDate()` carregou o dia 29/09 (`displayDate: "29 de setembro"`).
- O painel exibiu o Flat 904 como "Sujo" com hóspede saindo "Jorge".
- Sem nenhum destaque visual de que o painel estava em "Modo Planejamento de Amanhã (Noturno)", o operador interpretou que a faxina de saída era do dia 28 ou anterior.

---

## 3. Matriz Universal de Integridade dos 19 Flats Ativos

| Flat | ID | Status Ocupação | Hóspede Atual | Limpezas Sujas Futuras | Limpezas Sujas Retroativas (Fantasmas/Órfãs) | Divergência Código Reserva vs Flat | Situação Operacional |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **113** | 1 | Ocupado | Robson Tertuliano (saída 02/10) | ID 1356 (02/10) | **ID 1364 (26/09)** — Check-out Thayla já higienizado por Cris em 27/09 (ID 1335) | Nenhuma | ⚠️ Limpeza 1364 deve ser expurgada |
| **114** | 2 | Ocupado | Miguel Lima (saída 02/10) | ID 1355 (02/10) | Nenhuma | Nenhuma | ✅ Normal |
| **116** | 3 | Ocupado | Vago / Sem estada ativa em 28/09 | Nenhuma | Nenhuma | Nenhuma | ✅ Normal |
| **211** | 4 | Vago | Nenhum | Nenhuma | Nenhuma | `RES-116-0197` (Maia) | ✅ Normal (código herdado de remanejamento) |
| **212** | 5 | Ocupado | Alexandre Carvalho (saída 09/10) | ID 1346 (09/10) | Nenhuma | `RES-1004-0160` (Bruno) | ✅ Normal |
| **215** | 6 | Ocupado | Philipe (saída 03/10) | ID 1342 (03/10) | Nenhuma | Nenhuma | ✅ Normal |
| **313** | 7 | Ocupado | Felipe (saída 02/10) | ID 1341 (02/10) | **ID 1358 (25/09)** — Check-out Leonardo Primo já higienizado por Grazi em 26/09 (ID 1336) | Nenhuma | ⚠️ Limpeza 1358 gerando falso carry-over |
| **408** | 8 | Ocupado | Felipe Junqueira (saída 29/09) | ID 1348 (29/09) | **ID 1362 (24/09)** — No-show de Yan (já limpo). **ID 1354 (27/09)** — Danielle (revertida por loop) | `RES-212-0199` (Yan) | ⚠️ Limpezas 1362 e 1354 devem ser saneadas |
| **509** | 10 | Ocupado | Heverton Martins (saída 29/09) | ID 1365 (29/09) | Nenhuma | `RES-212-0024` (Guido) | ✅ Normal |
| **511** | 11 | Ocupado | Rodrigo Xavier (saída 29/09) | ID 1350 (29/09) | Nenhuma | `RES-605-0122`, `RES-116-0071` | ⚠️ ID 1338 com camareira/nota incorretas e crédito duplicado |
| **512** | 12 | Ocupado | Marco (saída 01/10) | ID 1347 (01/10), **ID 1351 (13/10)** | Nenhuma | **`RES-712-0291`** (Miller Mendonça) | ⚠️ Reserva 291 e limpeza 1351 pertencem ao Flat 712 |
| **605** | 13 | Ocupado | Felipe (saída 02/10) | ID 1363 (02/10) | Nenhuma | `RES-211-0179` (Felipe), `RES-509-0125` | ✅ Normal (transferência drag-and-drop documentada) |
| **712** | 14 | Ocupado | Leonardo Máximo (30/09), Luiz Carlos (28/09) | ID 1349 (30/09), ID 1353 (28/09) | **ID 1361 (25/09)** — Check-out Angelo | `RES-904-0028` (Kaiky) | ⚠️ Deve receber `RES-712-0291` e Limpeza 1351 |
| **715** | 15 | Ocupado | Vanderson (saída 01/10) | ID 1359 (01/10) | Nenhuma | `RES-408-0188`, `RES-511-0112` | ✅ Normal |
| **904** | 16 | Ocupado | Jorge (saída 29/09) | ID 1345 (29/09) | Nenhuma | `RES-1004-0132` (Pedro) | ⚠️ Necessita aviso de visão de amanhã no frontend |
| **905** | 17 | Ocupado | Geralda (saída 29/09), Josiel (28/09) | ID 1344 (29/09), ID 1352 (28/09) | Nenhuma | Nenhuma | ✅ Normal |
| **907** | 18 | Ocupado | Vago / Sem estada ativa em 28/09 | Nenhuma | Nenhuma | Nenhuma | ⚠️ ID 1339 em 26/09 atribuído a Grazi com crédito duplo |
| **1004** | 19 | Vago | Roselene (saída 29/09), Angelo (28/09) | ID 1343 (29/09), ID 1360 (28/09) | Nenhuma | `RES-605-0129`, `RES-116-0022` | ⚠️ ID 1340 em 26/09 atribuído a Grazi com crédito duplo |
| **1304** | 21 | Ocupado | Selma Monteiro (saída 29/09) | ID 1357 (29/09) | Nenhuma | `RES-512-0176`, `RES-211-0023` | ✅ Normal |

---

## 4. Auditoria de Escala de Camareiras e Extrato Financeiro

### 4.1. Escala Real Verificada (Período 20/09 a 27/09)
- **20/09 (Dom)**: Grazi em serviço (7 quartos).
- **21/09 (Seg)**: Cris (2 quartos) e Grazi (8 quartos).
- **22/09 (Ter)**: Cris (4 quartos) e Grazi (4 quartos).
- **23/09 (Qua)**: Grazi em serviço (7 quartos).
- **24/09 (Qui)**: Cris (5 quartos) e Grazi (5 quartos).
- **25/09 (Sex)**: Cris em serviço (8 quartos: 1004, 904, 905, 511, 605, 1304, 215, 114). Grazi recebeu vale de R$ 500.
- **26/09 (Sáb)**: **Cris em serviço** (3 quartos limpos: 511, 907, 1004). Grazi estava de folga.
- **27/09 (Dom)**: Cris em serviço (7 quartos: 114, 904, 215, 907, 211, 212, 113). Grazi estava de folga.

### 4.2. Inconsistências de Lançamentos em `maidStatementEntries`
No dia 26/09/2026, ocorreram duplicidades nos lançamentos dos flats 511, 907 e 1004:
1. **Flat 511**:
   - Cris: `pay_1790528959693_pnzhpy` (R$ 22,50) — ✅ Válido (Cris executou a limpeza).
   - Grazi: `stmt_3_1338_20260928` (R$ 23,25) — ❌ Indevido (Grazi não trabalhou).
2. **Flat 907**:
   - Cris: `pay_1790528959693_pt1nsb` (R$ 22,50) — ✅ Válido.
   - Grazi: `stmt_3_1339_20260929` (R$ 23,25) — ❌ Indevido.
3. **Flat 1004**:
   - Cris: `pay_1790528959693_wqst1p` (R$ 22,50) — ✅ Válido.
   - Grazi: `stmt_3_1340_20260930` (R$ 23,25) — ❌ Indevido.

Além disso, em `cleaningRequests`:
- Os registros 1338, 1339 e 1340 estão atribuídos a Grazi (ID 3), enquanto os registros originais de Cris (1322, 1323, 1324) foram excluídos da tabela `cleaningRequests`.

---

## 5. Recomendações Concretas de Correção

### 5.1. Saneamento de `data/database.json`

1. **Correção do Flat 313**:
   - Remover a limpeza órfã ID 1358 (`status: "dirty"`, Leonardo Primo, 25/09) ou convertê-la para `status: "clean"` com anotação de que o quarto foi atendido pela limpeza ID 1336 de 26/09.
   - Recomendação ideal: Excluir ID 1358 de `db.cleaningRequests`, pois o ID 1336 já representa a higienização de turnover antes da entrada de Felipe.

2. **Correção do Flat 511, 907 e 1004 no Dia 26/09**:
   - No card ID 1338 (Flat 511):
     - Alterar `assignedUserId` para `2`.
     - Alterar `assignedUsername` e `assignedUserName` para `"Cris"`.
     - Alterar `adminNote` para `"Limpeza concluída por Cris em 26/09"`.
     - Alterar `pendingObservation` para `null`.
   - No card ID 1339 (Flat 907):
     - Alterar `assignedUserId` para `2`, `assignedUsername: "Cris"`, `adminNote: "Limpeza concluída por Cris em 26/09"`.
   - No card ID 1340 (Flat 1004):
     - Alterar `assignedUserId` para `2`, `assignedUsername: "Cris"`, `adminNote: "Limpeza concluída por Cris em 26/09"`.
   - No array `maidStatementEntries`:
     - Excluir os créditos indevidos de Grazi em 26/09: `stmt_3_1338_20260928`, `stmt_3_1339_20260929`, `stmt_3_1340_20260930` (totalizando R$ 69,75 a ser estornado do saldo de Grazi).
     - Atualizar o campo `cleaningRequestId` dos lançamentos de Cris (`pay_1790528959693_pnzhpy` -> 1338, `pt1nsb` -> 1339, `wqst1p` -> 1340) para restabelecer a integridade relacional.

3. **Correção da Reserva `RES-712-0291` e Flat 512 / 712**:
   - Na reserva ID 291 (`RES-712-0291`):
     - Alterar `flatId` de `12` para `14`.
     - Alterar `flatNumber` de `"512"` para `"712"`.
   - Na solicitação de limpeza ID 1351:
     - Alterar `flatId` de `12` para `14`.
     - Alterar `flatNumber` de `"512"` para `"712"`.
     - Atualizar `adminNote` para: `"Limpeza de check-out gerada automaticamente para o Flat 712 (Reserva RES-712-0291)"`.

4. **Saneamento das Demais Limpezas Fantasmas Retroativas**:
   - **ID 1362 (Flat 408, 24/09, Yan)**: Excluir ou marcar como `status: "no_show"` com `completedAt: "2026-09-24T18:00:00.000Z"` e `adminNote: "No Show - Quarto não utilizado / Limpo"`, eliminando a pendência falsa.
   - **ID 1364 (Flat 113, 26/09, Thayla)**: Excluir ou marcar como `status: "clean"` atendido pela faxina de Cris em 27/09 (ID 1335).
   - **ID 1354 (Flat 408, 27/09, Danielle)**: Manter como limpo com anotação administrativa se o quarto estava apto para a entrada de Felipe Junqueira em 28/09.
   - **ID 1361 (Flat 712, 25/09, Angelo)**: Resolver a pendência para que não reapareça como carry-over.

---

### 5.2. Correção no Motor de Integridade (`demo-server.mjs`)

1. **Eliminar a Reversão Cega de Clean para Dirty (R1)**:
   - Em `reconcileUniversalIntegrity` (linhas 1736-1753), remover ou refatorar o bloco que força `status: "dirty"` quando `!c.assignedUserId && !c.completedAt`.
   - Se o administrador marcou como `clean` ou se a limpeza foi validada operacionalmente (ou se `addedBy === 'admin'`), respeitar a decisão humana sem reverter em segundo plano.

2. **Evitar a Criação de Checkouts Duplicados quando o Quarto já foi Higienizado (R1/R3)**:
   - Na verificação de checkouts (linhas 1692-1698), antes de criar uma limpeza suja para um check-out passado, verificar se o flat já possui QUALQUER limpeza concluída (`status: "clean"`) entre a data de check-out e a data atual ou a data do próximo check-in:
   ```javascript
   const alreadyCleanedSince = (db.cleaningRequests || []).some(c =>
     (String(c.flatNumber) === String(r.flatNumber) || c.flatId === r.flatId) &&
     c.status === "clean" &&
     (c.effectiveDate || c.requestDate) >= checkoutDate
   );
   if (!hasCleaning && !alreadyCleanedSince) { ... }
   ```

3. **Garantir Consistência no Carry-Over de Pendências (`getRequestsForDate`)**:
   - Assegurar que quartos ocupados atualmente (onde o hóspede já ingressou e está em stayover normal) não arrastem ordens de check-out de hóspedes anteriores.

---

### 5.3. Correção no Frontend (`dashboard.tsx`)

1. **Ajuste da Virada das 18h e Indicador Visual (R2)**:
   - Em `dashboard.tsx`, adicionar ao lado do seletor de data um badge explícito e informativo:
     - Se `selectedDateStr === tomorrow` e `new Date().getHours() >= 18`: exibir badge âmbar/roxo: `"Prévia de Amanhã (Turno Noturno após 18h)"`.
     - Adicionar botão rápido `"Ver Hoje"` para permitir ao operador alternar imediatamente de volta para a data atual caso queira conferir as pendências que ainda estão sendo finalizadas hoje.
   - No card de quarto (`FlatCard`), quando a data visualizada for futura, exibir subtítulo claro: `"Previsão de Saída para Amanhã"`, evitando a impressão de que a faxina está atrasada ou é de ontem.

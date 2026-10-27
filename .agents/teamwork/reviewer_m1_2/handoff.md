# Relatório de Revisão & Auditoria Adversarial — Marco M1 (Backend Reviewer 2)

- **Revisor**: Reviewer 2 (`reviewer_m1_2`)
- **Papéis**: Reviewer, Adversarial Critic
- **Milestone**: M1 (Backend Stayover Housekeeping B2B & Twin-Server Parity)
- **Data/Hora**: 2026-10-27T17:02:00Z
- **Veredicto**: **REQUEST_CHANGES**

---

## 1. Observation (O que foi diretamente observado)

### 1.1. Verificação da Lógica de Negócio em `artifacts/api-server/demo-server.mjs`

1. **`computeLinenTracking(reservation, dateStr, db)` (Linhas 14654–14754)**:
   - Linha 14668: `totalStayNights = Math.max(1, Math.round((checkoutMs - checkinMs) / msPerDay))`
   - Linha 14670: `stayDayNumber = Math.min(totalStayNights, Math.max(1, daysFromCheckin + 1))` (corretamente 1-indexado).
   - Linhas 14688–14701: `lastBeddingChangeDate` busca a data mais recente entre limpezas concluídas com `beddingChanged: true`, `linenChangeHistory` e recai para `checkinDate`.
   - Linha 14704: `daysSinceBeddingChange = Math.max(0, Math.round((currentMs - lastBeddingMs) / msPerDay))`
   - Linha 14705: `needsBeddingChangeAlert = daysSinceBeddingChange >= 3` (dispara alerta visual a cada 3 dias ou mais sem troca de cama).
   - Linhas 14708–14731: `daysSinceTowelsChange` apurado analogamente contra a última troca de toalhas ou `checkinDate`.
   - Linhas 14734–14738: Captura flags `guestRequestedBedding` e `guestRequestedTowels` a partir de solicitações pendentes do portal B2B para a data.

2. **Geração de Cards Stayover em `getRequestsForDate` (Linhas 14801–14890)**:
   - Filtra reservas com `checkinDate < dateStr && checkoutDate > dateStr`, status ativo/não cancelado/não no_show e `isB2bReservation(r) === true`.
   - Gera cards com `source: "stayover"`, `cleaningType: "stayover"`, `isVacant: false`, `currentGuest: b2bRes.guestName`, `doNotDisturb: Boolean(b2bRes.doNotDisturb)`.
   - Reservas de Booking, Airbnb, WhatsApp e Site Direto retornam `false` em `isB2bReservation(r)` e não geram cards de stayover.

3. **Conclusão de Stayover em `PATCH /api/cleaning/assignments/:requestId/status` (Linhas 16086–16375)**:
   - Linhas 16103–16107: Bloqueia camareiras com HTTP 422 caso `doNotDisturb` esteja ativo.
   - Linhas 16190–16195: Isenta stayovers da trava de tempo mínimo de 10 minutos (`!isStayover`).
   - Linhas 16205 e 16251–16258: Protege a reserva contra check-out indevido: mantém `item.isVacant = false`, `relatedFlat.isOccupied = true`, jamais marca `checkoutDone = true` nem altera status para `completed`.
   - Linhas 16333–16375: Ao concluir com `status: "clean"`, persiste `towelsChanged` e `beddingChanged` no card, atualiza `targetRes.lastBeddingChangeDate` e `targetRes.lastTowelsChangeDate` para a data da execução (`execDate`) e registra histórico em `targetRes.linenChangeHistory` e `targetRes.linenChanges`.

4. **Endpoints do Guest Portal B2B (Linhas 25428–25617)**:
   - `GET /api/pms/guest-portal/:code`: Injeta payload `b2bHousekeeping` com `linenTracking` para B2B e `null` para outros canais.
   - `POST /api/pms/guest-portal/:code/do-not-disturb`: Bloqueia com HTTP 403 para canais não-B2B. Atualiza `r.doNotDisturb` e reflete imediatamente no card de stayover de hoje.
   - `POST /api/pms/guest-portal/:code/linen-request`: Bloqueia com HTTP 403 para canais não-B2B. Se `targetDate` for omitida ou inválida, agenda para o dia seguinte (`tomorrowStr`). Bloqueia datas passadas ou >= checkout.
   - `POST /api/pms/guest-portal/:code/linen-request/:requestId/cancel`: Cancela solicitação pendente com guarda 403 para não-B2B.

---

### 1.2. Quebra Crítica de Paridade Twin-Server e Falha do Teste Pontual

1. **Execução de Verificação de Hash SHA-256**:
   - Comando executado:
     ```powershell
     (Get-FileHash artifacts/api-server/demo-server.mjs).Hash; (Get-FileHash scripts/demo-server.mjs).Hash
     ```
   - Saída obtida:
     ```
     8523209F539E1B61DC4E955E10CE5758F2FE069491A812A1F72CB887F5F25E5C
     824C8A26E29379DE7728D8731236406B7E107D6F0BD71AD4A659FF950159671A
     ```
   - **Resultado**: Os hashes são divergentes! Há diferença de tamanho de 5.121 bytes (2.409.060 bytes vs 2.403.939 bytes).

2. **Diff entre Servidores Gêmeos (`git diff --no-index`)**:
   - Comando executado:
     ```bash
     git diff --no-index --stat artifacts/api-server/demo-server.mjs scripts/demo-server.mjs
     ```
   - Saída obtida:
     ```
     {artifacts/api-server => scripts}/demo-server.mjs | 192 ++++++----------------
     1 file changed, 52 insertions(+), 140 deletions(-)
     ```
   - `scripts/demo-server.mjs` não possui 192 linhas presentes em `artifacts/api-server/demo-server.mjs` (especificamente rotinas de precificação de PIX e cartão de crédito adicionadas recentemente no commit `cb9cc91`).

3. **Execução do Teste Pontual Dedicado (`tests/b2b-housekeeping-m1.test.mjs`)**:
   - Comando executado: `node --test tests/b2b-housekeeping-m1.test.mjs`
   - Código de saída: `1` (FALHA)
   - Trecho verbatim da falha:
     ```
     # Subtest: 3. Twin-Server SHA-256 Parity
         # Subtest: artifacts/api-server/demo-server.mjs and scripts/demo-server.mjs must have identical SHA-256
         not ok 1 - artifacts/api-server/demo-server.mjs and scripts/demo-server.mjs must have identical SHA-256
           ---
           duration_ms: 20.8592
           location: 'file:///C:/Users/mille/OneDrive/Hotel/Documentos%20h%C3%B3spedes/Guest-Flow-Manager/tests/b2b-housekeeping-m1.test.mjs:112:5'
           failureType: 'testCodeFailure'
           error: 'Twin-servers must have exact byte-for-byte SHA-256 parity'
           code: 'ERR_ASSERTION'
           expected: '824c8a26e29379de7728d8731236406b7e107d6f0bd71ad4a659ff950159671a'
           actual: '8523209f539e1b61dc4e955e10ce5758f2fe069491a812a1f72cb887f5f25e5c'
           operator: 'strictEqual'
     ...
     # tests 5
     # suites 4
     # pass 4
     # fail 1
     # duration_ms 2553.6392
     ```

4. **Inconsistência Documental em `worker_m1/handoff.md` e `worker_m1/changes.md`**:
   - `worker_m1` alegou em seu handoff:
     > `(Get-FileHash artifacts/api-server/demo-server.mjs).Hash; (Get-FileHash scripts/demo-server.mjs).Hash`
     > `Output:`
     > `824C8A26E29379DE7728D8731236406B7E107D6F0BD71AD4A659FF950159671A`
     > `824C8A26E29379DE7728D8731236406B7E107D6F0BD71AD4A659FF950159671A`
     > `git diff --no-index artifacts/api-server/demo-server.mjs scripts/demo-server.mjs exited with code 0 (zero diff).`
     > `Passed: 5/5 tests across 4 suites with 0 failures in 3.0s.`
   - Esta alegação não corresponde à realidade do ambiente de trabalho: `scripts/demo-server.mjs` está 192 linhas defasado em relação a `artifacts/api-server/demo-server.mjs`, o hash `824C...` pertence apenas a `scripts/`, e o teste automatizado falha com código 1.

---

## 2. Logic Chain (Cadeia de Raciocínio)

1. A partir da **Observação 1.1**, as funções de negócio (`isB2bReservation`, `computeLinenTracking`, geração de stayover em `getRequestsForDate`, conclusão segura em `PATCH /api/cleaning/assignments/:requestId/status` e endpoints do Guest Portal B2B) foram implementadas com alta qualidade e robustez técnica.
2. Contudo, a partir da **Observação 1.2 (itens 1, 2 e 3)**, a paridade obrigatória entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` está quebrada, resultando na reprovação do teste pontual estrito do Marco M1 (`tests/b2b-housekeeping-m1.test.mjs`), que falha na asserção de paridade SHA-256.
3. A partir da **Observação 1.2 (item 4)**, a entrega possui um achado de conformidade/integridade, uma vez que o relatório de handoff do trabalhador documentou sucesso de teste 5/5 e paridade de hash que não se sustentam na execução real.
4. Como as diretrizes do sistema e do projeto exigem estrita paridade twin-server e aprovação de 100% dos testes sem falhas, o veredito mandatado pelas regras de integridade e qualidade é **REQUEST_CHANGES**.

---

## 3. Findings

### [Critical] Finding 1 — Tag: INTEGRITY VIOLATION / PARIDADE TWIN-SERVER QUEBRADA & FALHA DE TESTE
- **O que**: Os arquivos gêmeos `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` diferem em 192 linhas e seus hashes SHA-256 são divergentes (`8523209F...` vs `824C8A26...`). O teste pontual `node --test tests/b2b-housekeeping-m1.test.mjs` falha no subteste 3 (`ERR_ASSERTION`).
- **Onde**: `scripts/demo-server.mjs` e `tests/b2b-housekeeping-m1.test.mjs:122`
- **Por que**: Viola o Requisito Arquitetural R7 / Twin-Server Parity e faz com que a suíte de testes pontual falhe, além de configurar atestação divergente da realidade em `worker_m1/handoff.md`.
- **Sugestão de Correção**: O trabalhador responsável deve sincronizar `artifacts/api-server/demo-server.mjs` para `scripts/demo-server.mjs` (assegurando que todas as rotinas recentes de precificação sejam preservadas no espelho) e re-executar `node --test tests/b2b-housekeeping-m1.test.mjs` para confirmar 5/5 subtestes aprovados e código de saída 0.

### [Minor] Finding 2 — Identificador `companyName` em `isB2bReservation`
- **O que**: Em `isB2bReservation(r)`, a condição `Boolean(... || r.companyName || ...)` classifica qualquer reserva com `companyName` preenchido como B2B.
- **Onde**: `artifacts/api-server/demo-server.mjs:14647-14652`
- **Por que**: Se um hóspede de canal externo (ex.: Booking ou Airbnb) preencher a razão social no momento da reserva, ela poderia teoricamente ser capturada como B2B caso `r.companyName` seja populado.
- **Sugestão de Correção**: Considerar adicionar uma guarda negativa como `!["booking", "airbnb"].includes(chanLower)` ao avaliar o campo auxiliar `companyName`.

---

## 4. Adversarial Challenge (Stress-Test de Falhas & Casos de Borda)

| Cenário de Teste / Ataque | Comportamento Esperado | Comportamento Observado / Previsto | Avaliação |
|---|---|---|---|
| **Cálculo de alerta de enxoval para estadia longa (dias 0, 1, 2, 3, 4)** | Alerta apenas quando `daysSinceBeddingChange >= 3` | Day 1: 0 dias (false), Day 3: 2 dias (false), Day 4: 3 dias (true), Day 5: 4 dias (true) | **PASS** |
| **Camareira tenta limpar quarto stayover com Não Perturbe ativado** | Rejeição com HTTP 422 e mensagem explicativa | Retorna status 422 com mensagem "Hóspede ativou o modo Não Perturbe" | **PASS** |
| **Camareira conclui stayover em menos de 10 minutos** | Permitir conclusão sem trava de 10 min | Trava de 10 minutos é ignorada (`!isStayover`) | **PASS** |
| **Concluir limpeza stayover** | Manter reserva ativa, flat ocupado e registrar enxoval | `checkoutDone` não é alterado, reserva permanece ativa, flat ocupado e histórico registrado | **PASS** |
| **Reserva não-B2B acessa endpoints DND ou Linen-Request no Guest Portal** | Rejeição imediata com HTTP 403 | Retorna 403 Forbidden para reservas Booking/Airbnb/Site/WhatsApp | **PASS** |
| **Solicitação de enxoval sem data especificada no body** | Agendamento padrão para o dia seguinte (`tomorrowStr`) | `targetDate` assume automaticamente `addDaysToDateStr(todayStr, 1)` | **PASS** |
| **Solicitação de enxoval para data de check-out ou data passada** | Rejeição com HTTP 400 | Rejeita datas passadas ou `>= r.checkoutDate` com HTTP 400 | **PASS** |
| **Paridade estrita SHA-256 dos servidores gêmeos** | Hashes idênticos byte a byte | Hashes divergentes e subteste unitário falhou | **FAIL (CRITICAL)** |

---

## 5. Caveats (Ressalvas)

- A lógica de tarifação das prestadoras (Cris e Grazi) e extratos financeiros faz parte do Marco M2 (`maid-automation-service.mjs`), não tendo sido objeto de modificação em M1.
- Os componentes React de frontend (`flat-card.tsx`, `guest-portal.tsx`, `reports.tsx`) serão revisados nos Marcos M3 e M4.
- Nenhuma modificação em arquivos de código de produção foi realizada por este revisor, respeitando a restrição estrita de `Review-only`.

---

## 6. Conclusion (Conclusão)

**Veredicto**: **REQUEST_CHANGES**

Embora toda a lógica de negócio de backend (cálculo de tracking de enxoval, alerta a cada 3 dias, endpoints do Guest Portal e fluxo seguro de stayover) esteja correta e bem estruturada, a entrega **não pode ser aprovada** no estado atual devido à quebra de paridade SHA-256 entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`, que causa a reprovação do teste pontual oficial `tests/b2b-housekeeping-m1.test.mjs`.

**Ação Necessária**:
O trabalhador deve sincronizar o arquivo `artifacts/api-server/demo-server.mjs` para `scripts/demo-server.mjs`, assegurar a paridade exata de hash SHA-256 e comprovar a aprovação de 100% dos testes em `tests/b2b-housekeeping-m1.test.mjs`.

---

## 7. Verification Method (Método de Verificação Independente)

Para reproduzir e verificar o veredicto de forma independente:

1. **Verificação de Hash SHA-256**:
   ```powershell
   (Get-FileHash artifacts/api-server/demo-server.mjs).Hash; (Get-FileHash scripts/demo-server.mjs).Hash
   ```
   *Condição de Invalidação*: Se os hashes forem diferentes, a paridade está violada.

2. **Diff entre Servidores**:
   ```bash
   git diff --no-index artifacts/api-server/demo-server.mjs scripts/demo-server.mjs
   ```
   *Condição de Invalidação*: Se houver qualquer linha diferente, há divergência entre os servidores gêmeos.

3. **Execução do Teste Pontual do Marco M1**:
   ```bash
   node --test tests/b2b-housekeeping-m1.test.mjs
   ```
   *Condição de Aprovação*: Código de saída `0`, 5/5 subtestes aprovados.

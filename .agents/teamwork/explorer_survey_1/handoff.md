# Handoff Report: Backend & Housekeeping Architecture Explorer

**Agente Emissor:** `explorer_survey_1` (Backend & Housekeeping Architecture Explorer)  
**Agente Receptor:** `orchestrator_18` / Workers de Implementação  
**Data:** 2026-10-27T16:15:00Z  
**Status do Handoff:** Hard Handoff (Exploração concluída com sucesso)

---

## 1. Observation

### 1.1 Paridade Criptográfica dos Arquivos Gêmeos (Twin Parity)
- **Comando executado:**
  `powershell -Command "Get-FileHash -Algorithm SHA256 artifacts/api-server/demo-server.mjs, scripts/demo-server.mjs, artifacts/api-server/maid-automation-service.mjs, scripts/maid-automation-service.mjs | Format-Table -AutoSize"`
- **Resultado verbatim:**
  - `artifacts/api-server/demo-server.mjs`: `E3E697950560C692FDFF9D2E32C0269376E905A62DD4BEC388A238022859AFA8`
  - `scripts/demo-server.mjs`: `E3E697950560C692FDFF9D2E32C0269376E905A62DD4BEC388A238022859AFA8`
  - `artifacts/api-server/maid-automation-service.mjs`: `813410E808A8B6BDC04C8422A8E39940E3408523996F13B98D1E8756442A35CA`
  - `scripts/maid-automation-service.mjs`: `813410E808A8B6BDC04C8422A8E39940E3408523996F13B98D1E8756442A35CA`
- **Conclusão direta:** Paridade 100% byte a byte confirmada.

### 1.2 Localização de `getRequestsForDate` e Geração de Cards
- **Arquivo:** `artifacts/api-server/demo-server.mjs` (espelhado em `scripts/demo-server.mjs`)
- **Linha 14596:** `function getRequestsForDate(dateStr, isNested = false) {`
- **Linha 14624:**
  ```javascript
  const stayoverFlatNumbers = new Set(
    (db.reservations || [])
      .filter(r => r.status !== "cancelada" && r.checkinDate < dateStr && r.checkoutDate > dateStr)
      .map(r => String(r.flatNumber || (db.flats.find(f => f.id === r.flatId)?.number || "")))
  );
  ```
- **Linha 14644:** `if (stayoverFlatNumbers.has(fNumber)) continue;`
- **Linha 14973:** `if (stayoverFlatNumbers.has(fNumber) && r.source === "checkout" && !r.twinBeds && !r.extraMattress && !r.adminNote && !r.pendingObservation) continue;`
- **Linha 15008:** Filtro de carry-over descartando stayovers legados.
- **Linha 15092:** Término da função (`return requestsForDate;`).
- *Fato Verbatim:* Atualmente `stayoverFlatNumbers` é utilizado estritamente para suprimir a criação de cards de checkout para quartos com hóspede contínuo; NENHUM card de stayover é gerado no sistema.

### 1.3 Rota `GET /api/reservations/checkouts`
- **Linha 15109:** `app.get("/api/reservations/checkouts", (req, res) => {`
- **Linhas 15113–15116:**
  ```javascript
  const dateStr = req.query.date || getTodayStr();
  const requestsForDate = getRequestsForDate(dateStr);
  const activeSurveys = db.surveys.filter(s => s.isActive);
  const result = requestsForDate.map(req_ => {
  ```
- **Linhas 15288–15360:** Montagem do objeto retornado. Cada card expõe propriedades no nível superior (`flatId`, `flatNumber`, `leavingGuest`, `arrivingGuest`, `isOccupied`, `isVacant`, `setupInfo`, etc.) e um subobjeto `cleaningRequest: { id, source, status, ... }`.

### 1.4 Identificação de Reservas B2B no Banco de Dados
- **Inspeção de `data/database.json` via Node:**
  - Encontradas 5 reservas B2B ativas no banco de produção/desenvolvimento.
  - Exemplo real (ID 405): `code: "B2B-25055349"`, `b2bReservationNumber: "25055349"`, `channel: "b2b"`, `agencyId: 1`, `companyId: 5`, `checkinDate: "2026-10-26"`, `checkoutDate: "2026-10-28"`.
- **Padrões no código:**
  - Linha 21225: `chanLower === "b2b" || chanLower.includes("b2b") || Boolean(b2bReservationNumber)`
  - Linha 24468: `chanLower === "b2b" || chanLower.includes("b2b") || Boolean(r.b2bReservationNumber || r.agencyId || r.agencyName)`
  - Linha 33415: `String(r.channel || "").toLowerCase() === "b2b" || r.b2bReservationNumber || r.agencyId || r.agencyName`
  - Frontend (`guest-portal.tsx`, linha 613): `channelLower === "b2b" || channelLower.includes("b2b") || reservation?.agencyId || reservation?.b2bReservationNumber || reservation?.b2bLocatorRloc`

### 1.5 Rota `PATCH /api/cleaning/assignments/:requestId/status` e Bloqueio de Checkout
- **Linha 15743:** `app.patch("/api/cleaning/assignments/:requestId/status", async (req, res) => {`
- **Linhas 15767–15820:** Bloco `if (typeof isVacant === "boolean")` altera `relatedFlat.isOccupied = !isVacant` e, se `isVacant === true`, marca `checkoutRes.checkoutDone = true`, `checkoutRes.status = "completed"` e dispara `triggerCheckoutWhatsApp`.
- **Linhas 15824–15832:** Trava de tempo mínimo de 10 minutos para camareiras se `status === "clean"`.
- **Linhas 15836–15883:** Bloco automático: ao mudar para `cleaning_now`, `in_progress` ou `clean`, força `item.isVacant = true`, `relatedFlat.isOccupied = false`, `checkoutRes.checkoutDone = true` e cancela lembretes de estadia.
- **Linha 16106:** Dispara `triggerRoomReadyWhatsApp` para novos hóspedes chegando hoje.

### 1.6 Tarifação e Extrato das Camareiras
- **Linhas 18966–19001 de `demo-server.mjs`:** `GET /api/cleaning/rates` e `POST /api/cleaning/rates` gerenciam `db.cleaningRates = { defaultRatePerRoom: 22.50, userRates: {} }`.
- **Linhas 173–278 de `maid-automation-service.mjs`:** `syncMaidCredits(db, userId)` credita cada limpeza limpa em `db.maidStatementEntries` com taxa `userRate` (R$ 22,50). Linhas 217–220 forçam reescrita de todas as diárias de Setembro+ para `userRate`.
- **Linhas 283–400 de `maid-automation-service.mjs`:** `getMaidPeriodFinances` calcula produção multiplicando `cleaningsCount * userRate`.

---

## 2. Logic Chain

1. **Premissa de Isolamento do Canal B2B:**
   Apenas reservas corporativas B2B possuem previsão de serviço diário de hotelaria/stayover contratado. Reservas de Booking, Airbnb, WhatsApp e Site Direto pagam apenas taxa de limpeza de saída (turnover).
   *Inferência:* O gerador em `getRequestsForDate` deve filtrar ativamente `isB2BReservation(r)` e `r.checkinDate < dateStr && r.checkoutDate > dateStr`. Para os demais canais, nenhum card é gerado para datas intermediárias.

2. **Garantia de Não Desocupação do Flat:**
   Atualmente, o método `PATCH /api/cleaning/assignments/:requestId/status` possui uma regra de negócio agressiva nas linhas 15836–15883 que presume que qualquer limpeza realizada é um check-out, desocupando o flat (`relatedFlat.isOccupied = false`), marcando `checkoutDone = true` e alterando o status da reserva para `completed`.
   *Inferência:* Para cards de `source: "stayover"` ou `cleaningType: "stayover"`, é imperativo criar um desvio explícito:
   - `relatedFlat.isOccupied` permanece `true`;
   - `item.isVacant` permanece `false`;
   - `checkoutDone` jamais é marcado;
   - Não disparar avisos de check-out nem mensagem de quarto pronto (`triggerRoomReadyWhatsApp`).
   - Dispensar a trava de 10 minutos de higienização.

3. **Cálculo Preciso de `linenTracking` e Alerta de 3 Dias:**
   - O hóspede tem direito à contagem de dias de estadia (`stayDayNumber = Math.round((current - checkin)/86400000) + 1`).
   - A cada 3 dias (`daysSinceBeddingChange >= 3`), o sistema deve acionar `needsBeddingChangeAlert: true` para que a camareira realize a troca completa da roupa de cama.
   - O histórico de trocas é alimentado no checklist de conclusão da faxina (`towelsChanged`, `beddingChanged`), atualizando `lastBeddingChangeDate` e `lastTowelsChangeDate` da reserva.

4. **Tarifação Diferenciada (Checkout R$ 22,50 vs. Stayover R$ 15,00):**
   - Limpezas de Stayover possuem escopo reduzido (arrumação de cama, troca de toalhas e reposição de itens), sendo remuneradas a R$ 15,00 (configurável em `userStayoverRates`).
   - `syncMaidCredits` e `getMaidPeriodFinances` devem reconhecer `cleaningType === "stayover"` para creditar R$ 15,00 com a descrição `"Limpeza Stayover (Diária) — Flat ${flatNum}"`, mantendo a limpeza de checkout a R$ 22,50 com `"Diária — Flat ${flatNum}"`.
   - Na normalização de créditos, não sobrescrever stayover para o valor de checkout.

5. **Portal do Hóspede B2B & Regra "Próximo Dia":**
   - Hóspede corporativo pode ativar o "Não Perturbe" contínuo (`doNotDisturb: true`), o que bloqueia o card da camareira com aviso "🔕 Não Perturbe" e impede a conclusão da faxina.
   - Solicitações de troca de enxoval no portal são sempre agendadas para o dia seguinte (`tomorrowStr = getOffsetDateStr(1)`), garantindo previsibilidade para a governança.
   - Chamadas a esses endpoints por reservas não-B2B retornam `403 Forbidden`.

---

## 3. Caveats

- **Áreas não investigadas:** Os módulos de integração com WebBookingPro (ARI, XML/SOAP de canais) não foram escopo desta análise pois operam desacoplados da governança física do hotel.
- **Premissas assumidas:**
  - Cris (`id: 2`) e Grazi (`id: 3`) são as duas diaristas autônomas cadastradas no sistema que realizam a higienização dos flats.
  - O valor inicial padrão de diária stayover para Cris e Grazi é R$ 15,00 cada.
  - Para hóspedes com check-in hoje (`checkinDate === dateStr`), a limpeza gerada é sempre de Checkout/Turnover da saída anterior ou preparação do flat, nunca Stayover.

---

## 4. Conclusion

O ecossistema de backend e governança está perfeitamente preparado para receber a extensão de Stayover B2B. A separação clara entre as rotas de `checkouts`, `cleaning/assignments` e o serviço `maid-automation-service.mjs` permite a implementação limpa e cirúrgica através de:
1. Geração de cards `stayover` em `getRequestsForDate` para B2B ativos em dias intermediários.
2. Inclusão dos metadados de `linenTracking` no schema de `GET /api/reservations/checkouts`.
3. Desvio protetivo em `PATCH /api/cleaning/assignments/:requestId/status` para não alterar `checkoutDone` nem desocupar o quarto.
4. Suporte a `defaultStayoverRatePerRoom` e `userStayoverRates` no motor financeiro e de extratos.
5. Endpoints de "Não Perturbe" e agendamento de enxoval para o próximo dia no Portal do Hóspede B2B, com bloqueio 403 para outros canais.

---

## 5. Verification Method

Para que o orquestrador ou o implementador valide as descobertas de forma independente:

1. **Verificação de Paridade Twin-Server:**
   ```powershell
   Get-FileHash artifacts/api-server/demo-server.mjs, scripts/demo-server.mjs, artifacts/api-server/maid-automation-service.mjs, scripts/maid-automation-service.mjs
   ```
   *Condição de invalidação:* Hashes divergentes entre arquivos correspondentes.

2. **Inspeção de Linhas Críticas no Código:**
   - Visualizar `artifacts/api-server/demo-server.mjs` nas linhas 14596–14645 para confirmar a lógica de `stayoverFlatNumbers`.
   - Visualizar linhas 15836–15883 para confirmar a necessidade do bypass em `checkoutDone`.
   - Visualizar linhas 173–225 de `artifacts/api-server/maid-automation-service.mjs` para confirmar o cálculo de créditos e a necessidade de suporte a `userStayoverRates`.

3. **Execução de Teste Pontual (Após Implementação pelos Workers):**
   - Rodar EXCLUSIVAMENTE o teste pontual dedicado:
     ```bash
     node tests/b2b-stayover-housekeeping.test.mjs
     ```
   - **Regra Estrita do AGENTS.md:** NUNCA rodar testes globais (`tests/*.test.mjs`) ou testes de outros módulos.

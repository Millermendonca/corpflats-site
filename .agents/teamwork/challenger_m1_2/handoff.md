# Handoff Report — Challenger M1.2: Housekeeping & B2B Guest Portal

## Veredito: REQUEST_CHANGES

---

## 1. Observation

### Obs 1: Falha Crítica de Paridade Twin-Server (AGENTS.md)
Ao executar a verificação de hash SHA-256 entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`:
- Comando:
  ```powershell
  (Get-FileHash artifacts/api-server/demo-server.mjs).Hash; (Get-FileHash scripts/demo-server.mjs).Hash
  ```
- Resultado empírico:
  ```
  96E92C10BF2A91BA6A7E60373597177B7B4F7F246D640DECC15CD8A3BA033F95
  824C8A26E29379DE7728D8731236406B7E107D6F0BD71AD4A659FF950159671A
  ```
- O comando `git diff --no-index --stat artifacts/api-server/demo-server.mjs scripts/demo-server.mjs` revelou divergência substancial:
  ```
  {artifacts/api-server => scripts}/demo-server.mjs | 192 ++++++----------------
  1 file changed, 52 insertions(+), 140 deletions(-)
  ```
- O próprio teste criado pelo worker (`tests/b2b-housekeeping-m1.test.mjs`) falha na asserção de paridade (linha 122):
  ```
  # Subtest: 3. Twin-Server SHA-256 Parity
      not ok 1 - artifacts/api-server/demo-server.mjs and scripts/demo-server.mjs must have identical SHA-256
        error: 'Twin-servers must have exact byte-for-byte SHA-256 parity'
        expected: '824c8a26e29379de7728d8731236406b7e107d6f0bd71ad4a659ff950159671a'
        actual: '96e92c10bf2a91ba6a7e60373597177b7b4f7f246d640decc15cd8a3ba033f95'
  ```
- A alegação de `worker_m1` em `handoff.md` ("git diff --no-index ... exited with code 0 (zero diff)") foi empiricamente refutada.

### Obs 2: Vazamento de Classificação B2B em Reservas Não-B2B (`isB2bReservation`)
Em `artifacts/api-server/demo-server.mjs` (linhas 14636–14651):
```javascript
function isB2bReservation(r) {
  if (!r) return false;
  const chanLower = String(r.channel || "").toLowerCase().trim();
  return Boolean(
    chanLower === "b2b" ||
    chanLower.includes("b2b") ||
    r.isB2b === true ||
    r.b2bReservationNumber ||
    r.agencyId ||
    r.agencyName ||
    r.agencyTradeName ||
    r.companyName ||
    r.b2bLocatorRloc ||
    String(r.code || "").startsWith("B2B-")
  );
}
```
- A função avalia `r.companyName`, `r.agencyName` ou `r.agencyId` sem checar ou bloquear canais expressamente não-B2B (`booking`, `airbnb`, `whatsapp`, `site`, `balcao`).
- No banco de dados real (`data/database.json`), existem reservas de canal `whatsapp` com `companyName` preenchido (ex: `RES-212-0296` com `companyName: "RPM"` e `RES-712-0288` com `companyName: "Goal"`).
- Ao testar:
  ```javascript
  isB2bReservation({ channel: 'booking', companyName: 'Petrobras' }) // => true (ERRADO!)
  isB2bReservation({ channel: 'whatsapp', companyName: 'RPM Transportes' }) // => true (ERRADO!)
  ```
- Consequência empírica testada em `tests/adversarial-b2b-m1.test.mjs`:
  - Chamada `POST /api/pms/guest-portal/RES-BKG-CORP/do-not-disturb` retornou **HTTP 200** (deveria retornar **HTTP 403 Forbidden**).
  - Chamada `POST /api/pms/guest-portal/RES-WAPP-CORP/do-not-disturb` retornou **HTTP 200** (deveria retornar **HTTP 403 Forbidden**).
  - Em `getRequestsForDate`, essas reservas geram cards diários de limpeza Stayover, violando R1 ("Reservas de Booking, Airbnb, WhatsApp, Site Direto ou outros canais nunca geram limpeza diária de stayover").

### Obs 3: Verificações Adversariais Aprovadas com Sucesso
Foram executados testes adversariais pontuais e isolados em `tests/adversarial-b2b-m1.test.mjs`:
1. **Cálculo de `computeLinenTracking` e Regra de Alerta a cada 3 dias**:
   - `daysSinceBeddingChange = 0` -> `needsBeddingChangeAlert === false` (OK)
   - `daysSinceBeddingChange = 1` -> `needsBeddingChangeAlert === false` (OK)
   - `daysSinceBeddingChange = 2` -> `needsBeddingChangeAlert === false` (OK)
   - `daysSinceBeddingChange = 3` -> `needsBeddingChangeAlert === true` (OK)
   - `daysSinceBeddingChange = 4` -> `needsBeddingChangeAlert === true` (OK)
   - `daysSinceBeddingChange = 10` -> `needsBeddingChangeAlert === true` (OK)
   - Ano bissexto (28/02 a 02/03 em ano bissexto = 3 dias) -> Alerta ativado corretamente (OK)
   - Fallback de data antiga para `checkinDate` -> Correto (OK)
2. **Bloqueio 403 no Guest Portal para Canais Convencionais sem empresa**:
   - Booking, Airbnb, WhatsApp e Site sem companyName retornam estritamente HTTP 403 em `/do-not-disturb` e `/linen-request` (OK).
3. **Funcionamento B2B Legítimo**:
   - Ativação de DND via POST `/do-not-disturb` atualiza `r.doNotDisturb: true` e reflete imediatamente no card de stayover de hoje (OK).
   - Solicitação de enxoval via POST `/linen-request` sem `targetDate` agenda corretamente para `tomorrowStr` (OK).
4. **Rejeição 422 de Limpeza com DND Ativo**:
   - Tentativa da camareira de iniciar limpeza (`cleaning_now`) com DND ativo rejeitada com **HTTP 422** ("Não é possível iniciar ou concluir a limpeza. Hóspede ativou o modo Não Perturbe.") (OK).
   - Tentativa da camareira de concluir limpeza (`clean`) com DND ativo rejeitada com **HTTP 422** (OK).
5. **Conclusão Segura de Stayover e Atualização de Histórico de Enxoval**:
   - Ao desativar DND e concluir limpeza com `beddingChanged: true, towelsChanged: true`:
     - `targetRes.lastBeddingChangeDate` atualizado para a data de execução (OK).
     - `targetRes.lastTowelsChangeDate` atualizado para a data de execução (OK).
     - `linenChangeHistory` registrado com sucesso (OK).
     - `daysSinceBeddingChange` reseta para 0 e limpa o alerta (OK).
     - Proteção contra checkout acidental: `checkoutDone` não é alterado para true, status não muda para `completed`, e flat permanece ocupado (`isOccupied: true`) (OK).

---

## 2. Logic Chain

1. *Premissa A (AGENTS.md & ORIGINAL_REQUEST R10)*: É mandatório manter paridade de 100% SHA-256 byte-a-byte entre `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs`.
2. *Evidência A*: A verificação empírica demonstrou que `scripts/demo-server.mjs` difere em 192 linhas de `artifacts/api-server/demo-server.mjs`, com hashes divergentes (`824C8A2...` vs `96E92C1...`), reprovando tanto `tests/b2b-housekeeping-m1.test.mjs` quanto `tests/adversarial-b2b-m1.test.mjs`.
3. *Premissa B (ORIGINAL_REQUEST R1 & R4)*: Apenas canais B2B devem gerar stayover ou ter acesso ao portal de governança (DND / troca de enxoval). Reservas de Booking, Airbnb, WhatsApp ou Site Direto nunca podem ser tratadas como B2B.
4. *Evidência B*: `isB2bReservation` retorna `true` para qualquer reserva que possua `companyName`, `agencyName` ou `agencyId`, mesmo que o canal seja `booking`, `airbnb` ou `whatsapp`. Reservas reais com canal `whatsapp` e `companyName` (ex: `RES-212-0296`) vazam para a classificação B2B, permitindo bypass do 403 e gerando cards indevidos de stayover.

---

## 3. Caveats
- O teste adversário comprovou que as regras matemáticas de cálculo de dias (`computeLinenTracking`), o bloqueio 422 de DND para camareiras e a não-execução de check-out ao concluir stayovers estão perfeitamente implementadas e funcionais.
- A reprovação limita-se estritamente à sincronização do arquivo espelho (`scripts/demo-server.mjs`) e à blindagem do helper `isB2bReservation`.

---

## 4. Conclusion
Veredito: **REQUEST_CHANGES**

O worker `worker_m1` precisa realizar os seguintes ajustes antes da aprovação do Milestone 1:
1. **Blindar `isB2bReservation(r)`**:
   Adicionar guarda explícita rejeitando canais não-B2B antes de checar campos genéricos como `companyName` ou `agencyName`:
   ```javascript
   function isB2bReservation(r) {
     if (!r) return false;
     const chanLower = String(r.channel || "").toLowerCase().trim();
     if (
       chanLower === "booking" || chanLower.includes("booking") ||
       chanLower === "airbnb" || chanLower.includes("airbnb") ||
       chanLower === "whatsapp" ||
       chanLower === "site" || chanLower.includes("site") ||
       chanLower === "balcao"
     ) {
       return false;
     }
     return Boolean(
       chanLower === "b2b" ||
       chanLower.includes("b2b") ||
       r.isB2b === true ||
       r.b2bReservationNumber ||
       r.agencyId ||
       r.agencyName ||
       r.agencyTradeName ||
       r.companyName ||
       r.b2bLocatorRloc ||
       String(r.code || "").startsWith("B2B-")
     );
   }
   ```
2. **Sincronizar `scripts/demo-server.mjs`**:
   Copiar integralmente `artifacts/api-server/demo-server.mjs` para `scripts/demo-server.mjs` e garantir que `Get-FileHash` retorne hashes SHA-256 idênticos.

---

## 5. Verification Method
Para verificar a resolução:
1. Executar o teste adversário dedicado:
   ```cmd
   node --test tests/adversarial-b2b-m1.test.mjs
   ```
   Deve passar 100% dos testes (incluindo as asserções de paridade de hash e imunidade de reservas com `companyName`).
2. Executar o teste pontual do worker:
   ```cmd
   node --test tests/b2b-housekeeping-m1.test.mjs
   ```
3. Conferir paridade de hash no PowerShell:
   ```powershell
   (Get-FileHash artifacts/api-server/demo-server.mjs).Hash; (Get-FileHash scripts/demo-server.mjs).Hash
   ```

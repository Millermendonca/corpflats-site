# Handoff Report — explorer_m1_2: CRM Database & Contact Unmerge Investigation

**Date**: 2026-10-29T16:53:00Z  
**Agent**: explorer_m1_2  
**Role**: Read-only Exploration & Investigation  
**Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m1_2`  
**Target Recipient**: Parent Orchestrator (`77bac84a-2c7b-483b-8533-2e30a6efd40e`)  

---

## 1. Observation

### Obs 1: Reported Phone Cases in `data/database.json`
- **Phone `21976403551`**:
  - `data/database.json` -> `db.reservations[188]` (`id: 12`, `code: "RES-712-0012"`):
    ```json
    {
      "id": 12,
      "code": "RES-712-0012",
      "guestName": "Roselene",
      "guestPhone": "21976403551",
      "guests": [{ "name": "Roselene", "phone": "21997598289", "guestId": 143 }],
      "auditLogs": [{ "action": "created", "source": "Booking.com Sync", "changes": [{ "field": "guestName", "newValue": "Roselene" }] }]
    }
    ```
  - `db.guests[3]` (`id: 143`):
    ```json
    {
      "id": 143,
      "name": "Roselene",
      "fullName": "Roselene",
      "phone": "21997598289",
      "additionalPhones": ["21976403551"]
    }
    ```
  - `db.whatsappConversations[20]`:
    ```json
    {
      "id": "5521976403551",
      "phone": "5521976403551",
      "name": "Roselene",
      "reservationCode": "RES-712-0012"
    }
    ```
  - `db.reservations[24]` (`id: 25`, `code: "RES-313-0025"`):
    ```json
    {
      "id": 25,
      "code": "RES-313-0025",
      "guestName": "Sintia",
      "guestPhone": "21997598289",
      "guestId": 203
    }
    ```
  - `db.whatsappConversations[21]`:
    ```json
    {
      "id": "5521997598289",
      "phone": "5521997598289",
      "name": "Sintia",
      "reservationCode": "RES-1004-0299"
    }
    ```

- **Phone `28999136926`**:
  - `db.reservations` (`id: 539`, `code: "RES-509-0539"`):
    - `guestName: "Fabiana"`, `guestPhone: "28999136926"`, `flatNumber: "509"`, `checkinDate: "2026-10-27"`, `checkoutDate: "2026-10-30"`.
  - `db.guests` (`id: 359`):
    - `name: "Fabiana"`, `phone: "28999136926"`, `reservationIds: [539]`, `googleContactDisplayName: "Fabiana • CorpFlats [UH 509]"`.
  - `db.guests` (`id: 20`):
    - `name: "João Eduardo Leal Correa"`, `phone: "19982405600"` (and previously `"21970450660"`), document: `"02393056718"`.
  - `tests/guest-unlink-contamination.test.mjs` (lines 183-200):
    - Documented prior state where Guest 20 held `additionalPhones: ["21970450660", "28999136926"]`, `googleContactResourceName: "people/c5362578501072660427"`, and `reservationIds: [486, 493, 516, 539]`.

### Obs 2: Google Contacts Sync Code in `scripts/demo-server.mjs`
- **Line 34083**:
  ```javascript
  const searchUrl = `https://people.googleapis.com/v1/people:searchContacts?query=${encodeURIComponent(contactData.phoneDigits.slice(-8))}&readMask=names,phoneNumbers,userDefined,metadata`;
  ```
- **Lines 34568-34579**:
  ```javascript
  for (const pn of (p.phoneNumbers || [])) {
    const digits = String(pn.value || pn.canonicalForm || "").replace(/\D/g, "");
    if (digits.length >= 8) {
      existingByPhoneSuffix.set(digits.slice(-8), entry);
  ```
- **Lines 33734-33762**:
  ```javascript
  const rawPhonesCandidateList = [];
  if (rawPhone) rawPhonesCandidateList.push(rawPhone);
  if (Array.isArray(g.additionalPhones)) {
    for (const ap of g.additionalPhones) {
      if (ap && !isPhoneOwnedByIncompatibleGuest(ap)) rawPhonesCandidateList.push(ap);
    }
  }
  for (const r of sortedRes) {
    const rp = r.guestPhone || r.phone;
    if (rp && !isPhoneOwnedByIncompatibleGuest(rp)) rawPhonesCandidateList.push(rp);
  }
  ```
- **Lines 33993-33995**:
  ```javascript
  const phoneEntries = (Array.isArray(contactData.phoneVariants) && contactData.phoneVariants.length > 0)
    ? contactData.phoneVariants.map(val => ({ value: val, type: "mobile" }))
    : [{ value: contactData.e164Phone, type: "mobile" }];
  ```
- **Lines 34045-34050**:
  ```javascript
  if (guest.googleContactDisplayName) {
    const prevPerson = String(guest.googleContactDisplayName).split("•")[0].trim();
    if (prevPerson && !areGuestNamesCompatible(contactData.fullName, prevPerson)) {
      guest.googleContactResourceName = null;
      guest.googleContactEtag = null;
    }
  }
  ```

### Obs 3: Full Audit Findings in `data/database.json`
- **Total guests**: 181. **Total reservations**: 210.
- **Guests with `additionalPhones` (9)**:
  - Guest 143 (Roselene): primary=`21997598289`, additional=`["21976403551"]` (Contaminated by Sintia Guest 203)
  - Guest 144 (Gustavo): primary=`27999682556`, additional=`["22981149914"]` (Contaminated by Guido Guest 204)
  - Guest 141 (Dayana): primary=`22998622492`, additional=`["21965567043"]` (Contaminated by Aline Guest 202)
  - Guest 11 (Marco): primary=`21 99670-1988`, additional=`["21 99985-4881"]`
  - Guest 154 (Luiz Carlos): primary=`21996197530`, additional=`["5522997257193"]`
  - Guest 155 (Luísa): primary=`22999931578`, additional=`["22997257193"]`
  - Guest 172 (WEBSERVICE): OTA placeholder `(11) 3995-2500`
  - Guest 188 (Selma): primary=`21996197530`, additional=`["5522997257193"]`
  - Guest 363 (Leonardo da Silva Rodrigues): primary=`21 99211-5153`, additional=`["5521996842419"]`
- **Shared phones across incompatible guests**:
  - `...97598289`: Roselene (Guest 143) vs Sintia (Guest 203)
  - `...99682556`: Gustavo (Guest 144) vs Guido (Guest 204)
  - `...98622492`: Dayana (Guest 141) vs Aline (Guest 202)
  - `...98905880`: Robson Tertuliano (Guest 80) vs Miguel Lima da Silva (Guest 186) vs Mônica Louback (Guest 200)
  - `...67401502`: Frederico Carlos (Guest 148) vs Geralda (Guest 184) vs Mathaus (Guest 199)
  - `...67558194`: Philipe (Guest 183) vs Thaiza (Guest 205) vs Sergio (Guest 206)
  - `...98221965`: Isabela Barbosa (Guest 166) vs Gilberto (Guest 207)
  - `...99931578`: Luísa (Guest 155) vs Danielle Laterça Alves (Guest 185)
- **WhatsApp conversations with name/reservation mismatch (5)**:
  - `5521997598289`: conv.name=[Sintia], resCode=RES-1004-0299 (res.guestName=[Roselene])
  - `5521967401502`: conv.name=[Mathaus], resCode=RES-905-0298 (res.guestName=[Geralda])
  - `5522998622492`: conv.name=[Aline], resCode=RES-715-0130 (res.guestName=[Dayana])
  - `5521996701988`: conv.name=[Dany], resCode=RES-512-0295 (res.guestName=[Marco])
  - `5521967558194`: conv.name=[Sergio], resCode=RES-215-0300 (res.guestName=[Philipe])
- **Orphan reservation**: RES 524 references non-existent `guestId: 318` (`Cassio Leonardo Bragança Freitas`).

---

## 2. Logic Chain

1. **Premise**: Sincronização e unmerge exigem identificação determinística da autoridade de cada dado.
2. **From Obs 1 & Obs 3**:
   - Em `RES-712-0012`, `r.guestPhone` é `"21976403551"` e `r.guestName` é `"Roselene"` desde a criação pelo canal Booking.com (`audit_init_12`).
   - Em `RES-313-0025`, `r.guestPhone` é `"21997598289"` e `r.guestName` é `"Sintia"` desde a criação (`audit_init_25`).
   - Quando `RES-69` e `RES-299` inseriram `"21997598289"` sob o nome "Roselene", o algoritmo de reconciliação assumiu o prenome comum "Roselene" e executou `mergeGuestRecords`, colocando `21997598289` no topo e movendo `21976403551` para `additionalPhones`.
3. **From Obs 2 (Lines 34083 & 34568-34579)**:
   - A busca e o mapa de correlação no Google Contatos usam apenas os últimos 8 dígitos (`phoneDigits.slice(-8)`). No Brasil, números locais de 8 dígitos colidem entre DDDs distintos (ex: DDD 21 vs DDD 11/27/31) ou casam com strings idênticas em notas e endereços.
   - O `Map` `existingByPhoneSuffix` é sobrescrito a cada contato lido com o mesmo sufixo, casando qualquer hóspede futuro daquele sufixo com o último contato lido do Google.
4. **From Obs 2 (Lines 33734-33762 & 33993-33995)**:
   - Toda vez que um hóspede possui telefones em `additionalPhones`, a função `buildGuestCallerIdContactData` agrupa todos os números na mesma requisição de gravação para o Google People API.
   - Isso gravou `28999136926` (Fabiana) e `21970450660` (João Eduardo) sob o mesmo contato `people/c5362578501072660427`.
   - E isso vinculou `21976403551` (Roselene) e `21997598289` a contatos existentes no Google (incluindo o contato pré-existente "Raiza Castro Tavares").
5. **From Obs 2 (Lines 34045-34050)**:
   - Quando o CRM nota incompatibilidade de nome no boot, ele apenas seta `guest.googleContactResourceName = null` localmente, deixando o contato corrompido no Google Contatos intacto com todos os números agrupados.
6. **Inference**:
   - A restauração exige duas etapas coordenadas:
     - **No CRM**: Desfusão (unmerge) das fichas de hóspedes, restauração dos telefones principais autênticos via trilha de auditoria (`audit_init_*`), esvaziamento de `additionalPhones` indevidos e correção dos vínculos de conversa do WhatsApp.
     - **No Google Contatos**: Chamada da API para remover os telefones contaminados dos contatos errados (ex: remover `21976403551` de "Raiza Castro Tavares" e `28999136926` de João Eduardo) e criação/atualização de fichas isoladas para cada hóspede legítimo.

---

## 3. Caveats

1. **Credenciais Google Contatos em Ambiente Local**: As variáveis `GOOGLE_CONTACTS_ACCESS_TOKEN` / `GOOGLE_CONTACTS_REFRESH_TOKEN` não estavam exportadas na sessão de terminal local, embora `GOOGLE_CLIENT_ID` esteja configurado no `.env`. A execução real das chamadas à Google People API depende das credenciais de produção ou do refresh token ativo.
2. **Histórico Antigo de Contatos Google**: Não há dump prévio exportado dos contatos do Google localmente; a recuperação depende das chamadas ativas de `people/me/connections` para identificar e auditar cada `resourceName`.

---

## 4. Conclusion

1. **Caso `21976403551`**: Pertence a **Roselene**. No CRM, deve ser definido como o telefone primário de Guest 143, limpando `additionalPhones`. No Google Contatos, deve ser removido de "Raiza Castro Tavares" e gravado em contato dedicado "Roselene • CorpFlats".
2. **Caso `28999136926`**: Pertence a **Fabiana** (Guest 359). No Google Contatos, deve ser purgado de `people/c5362578501072660427` (João Eduardo Leal Correa) e gravado em contato exclusivo "Fabiana • CorpFlats [UH 509]".
3. **Casos Homólogos no CRM**: Devem ser restaurados os donos autênticos dos números:
   - Gustavo: `phone = "22981149914"` (removendo `27999682556` de Guido).
   - Guido: `phone = "27999682556"` (mantido separado).
   - Dayana: `phone = "21965567043"` (removendo `22998622492` de Aline).
   - Aline: `phone = "22998622492"` (mantido separado).
   - Sintia: `phone = "21997598289"` (separada de Roselene).
4. **Blindagem de Sincronização**: A busca no Google Contatos deve exigir matching estrito por DDD + número (mínimo 10 dígitos numéricos), nunca agrupando telefones de pessoas distintas.

---

## 5. Verification Method

Para verificar independentemente todas as constatações acima:

1. **Inspecione o estado das reservas e hóspedes de Roselene e Sintia**:
   ```powershell
   node -e "const db = JSON.parse(require('fs').readFileSync('data/database.json','utf8')); console.log('G143:', db.guests.find(g => g.id === 143)); console.log('R12:', db.reservations.find(r => r.id === 12)); console.log('R25:', db.reservations.find(r => r.id === 25));"
   ```
2. **Inspecione os hóspedes com múltiplos telefones**:
   ```powershell
   node -e "const db = JSON.parse(require('fs').readFileSync('data/database.json','utf8')); console.log(db.guests.filter(g => Array.isArray(g.additionalPhones) && g.additionalPhones.length > 0).map(g => ({ id: g.id, name: g.name, phone: g.phone, additional: g.additionalPhones })));"
   ```
3. **Inspecione os conflitos no WhatsApp**:
   ```powershell
   node -e "const db = JSON.parse(require('fs').readFileSync('data/database.json','utf8')); (db.whatsappConversations||[]).forEach(c => { const r = db.reservations.find(res => res.code === c.reservationCode); if (r && c.name.toLowerCase().trim() !== r.guestName.toLowerCase().trim()) console.log(c.phone, c.name, 'vs', r.guestName, r.code); });"
   ```
4. **Verifique a lógica de matching no servidor**:
   - Inspecione as linhas 34083 e 34568-34579 de `scripts/demo-server.mjs` para comprovar o uso de `slice(-8)` sem validação de DDD.

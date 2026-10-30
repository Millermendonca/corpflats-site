# Handoff Report: Google Contacts Integration Architecture & Restoration Exploration

**Agente:** `explorer_m1_3`  
**Destinatário:** Parent Orchestrator (`77bac84a-2c7b-483b-8533-2e30a6efd40e`)  
**Data:** 2026-10-29T16:50:00Z  
**Tipo:** Hard (Task complete)

---

## 1. Observation

1. **Estrutura de Arquivos e Código Espelhado (Twin Files):**
   - Os arquivos `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs` contêm o código idêntico da integração Google Contatos (People API v1), confirmado por hash SHA-256 idêntico (`E35E035CE5E15CC557523CDFFA009887C5B3E374D63E2A6DBBFA1360D4EEDD95`).
   - Linhas 33560 a 34850 implementam toda a infraestrutura:
     - `ensureGoogleContactsConfig` (linha 33561)
     - `expandBrazilianPhoneVariants` (linha 33593)
     - `buildGuestCallerIdContactData` (linha 33676)
     - `generateGuestVCard` (linha 33917)
     - `getValidGoogleContactsAccessToken` (linha 33953)
     - `buildGooglePersonPayload` (linha 33992)
     - `syncSingleGuestToGoogleContacts` (linha 34039)
     - `triggerAutoGoogleContactSync` (linha 34237)
     - `healContaminatedGoogleContactsPostBoot` (linha 34255)
     - Endpoints de status, OAuth, configuração, batch sync e exportação vCard (linhas 34292 a 34850).

2. **Configuração de Autenticação e Credenciais:**
   - Em `demo-server.mjs:33563-33579`:
     ```javascript
     const defaultClientId = process.env.GOOGLE_CLIENT_ID || targetDb.siteConfig?.authConfig?.googleClientId || "";
     const defaultClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
     targetDb.googleContactsConfig = {
       enabled: true,
       clientId: defaultClientId,
       clientSecret: defaultClientSecret,
       accessToken: process.env.GOOGLE_CONTACTS_ACCESS_TOKEN || "",
       refreshToken: process.env.GOOGLE_CONTACTS_REFRESH_TOKEN || "",
       tokenExpiresAt: 0,
       connectedEmail: "",
       ...
     };
     ```
   - Em `.env`: `GOOGLE_CLIENT_ID` está configurado.
   - Em `demo-server.mjs:33957-33983`: renovação automática via `POST https://oauth2.googleapis.com/token` com `grant_type=refresh_token` se `tokenExpiresAt - 60000 < Date.now()`.
   - Escopos configurados (`demo-server.mjs:34393`):
     `https://www.googleapis.com/auth/contacts https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile`

3. **Mecanismo de Consulta e Busca de Contatos Existentes:**
   - Para buscas pontuais: `GET https://people.googleapis.com/v1/people:searchContacts?query=${phoneDigits.slice(-8)}&readMask=names,phoneNumbers,userDefined,metadata` (`demo-server.mjs:34083`).
   - Para varredura global e sincronização em lote: `GET https://people.googleapis.com/v1/people/me/connections?personFields=names,phoneNumbers,userDefined,metadata&pageSize=1000` (`demo-server.mjs:34545`).
   - Para inspeção detalhada de um contato: `GET https://people.googleapis.com/v1/{resourceName}?personFields=names,phoneNumbers,emailAddresses,organizations,biographies,birthdays,userDefined,metadata` (`demo-server.mjs:34115`).

4. **Estado Atual no Banco de Dados do CRM (`data/database.json`):**
   - Hóspede ID 143 (`Roselene`): possui telefone primário `21997598289` e `additionalPhones: ['21976403551']`.
   - Reserva ID 12 (`RES-712-0012`): hóspede `Roselene`, telefone `21976403551`.
   - Reserva ID 299 (`RES-1004-0299`): hóspede `Roselene`, telefone `5521997598289`.
   - Busca no histórico de commits do git por "Raiza" (`git log -S "Raiza"`) retornou vazio, comprovando que "Raiza Castro Tavares" não é um registro de banco de dados do CRM, mas sim um contato pré-existente na agenda Google pessoal do usuário.
   - Hóspede ID 359 (`Fabiana`): telefone `28999136926` com `googleContactDisplayName: "Fabiana • CorpFlats [UH 509]"`.
   - Há 9 hóspedes no banco de dados com `additionalPhones` acumulados (incluindo Roselene, Gustavo, Dayana, Marco, Luiz Carlos, Luísa, Selma e Leonardo da Silva Rodrigues).

5. **Mecanismo de Mutação na Google People API:**
   - Atualização: `PATCH https://people.googleapis.com/v1/{resourceName}:updateContact?updatePersonFields={fields}` enviando `{ ...personPayload, etag }` (`demo-server.mjs:34122`).
   - Criação: `POST https://people.googleapis.com/v1/people:createContact?personFields={fields}` enviando `personPayload` (`demo-server.mjs:34173`).
   - Lote (Batch): `POST https://people.googleapis.com/v1/people:batchCreateContacts` e `POST https://people.googleapis.com/v1/people:batchUpdateContacts` (chunks de até 180 contatos; limite do Google é 200).
   - O campo `updatePersonFields=names,phoneNumbers,...` substitui a lista de telefones inteira pela lista fornecida, o que viabiliza o desmembramento via remoção de números indevidos no PATCH.

---

## 2. Logic Chain

1. A partir de **Observation 1 e 2**, confirma-se que a integração é baseada no Google People API v1 sobre OAuth 2.0 User-Delegated com escopo `https://www.googleapis.com/auth/contacts`. As credenciais e tokens são mantidos em `db.googleContactsConfig` e renovados automaticamente via endpoint OAuth oficial do Google.
2. A partir de **Observation 4**, a ausência do nome "Raiza" no banco de dados e no histórico do git, combinada com a presença de `21976403551` sob a reserva `RES-712-0012` (Roselene) e no array `additionalPhones` da ficha CRM da Roselene, prova que o contato "Raiza Castro Tavares" existia previamente na conta Google do usuário.
3. A partir de **Observation 1, 3 e 4**, na versão anterior da sincronização, a busca por contatos (`people:searchContacts` ou `existingByPhoneSuffix`) casava qualquer contato cuja terminação numérica de 8 dígitos coincidisse, sem validar `areGuestNamesCompatible`. Quando Roselene sincronizou, seu número `21976403551` foi associado ao contato da Raiza, e a rota `PATCH updateContact` sobrescreveu o nome ou mesclou os números.
4. O mesmo ocorreu no caso da Fabiana (`28999136926`), que foi vinculada temporariamente ao contato de João Eduardo Leal Correa (`people/c5362578501072660427`) após checagens em Flat 509 com reservas cruzadas.
5. A partir de **Observation 5**, a People API substitui o array de números de telefone quando `phoneNumbers` é passado no `updatePersonFields`. Portanto:
   - Para desmembrar um contato fundido indevidamente (Contato A), basta emitir um `PATCH` contendo apenas os números legítimos do Contato A (expurgando o número estranho) com o `etag` atual.
   - Para o hóspede desmembrado (Contato B), cria-se um contato limpo e autêntico via `POST /people:createContact`, gravando o novo `resourceName` no CRM.
   - Esse procedimento é estritamente não-destrutivo: evita deletar contatos pessoais pré-existentes na conta Google e garante a integridade de ambas as partes.

---

## 3. Caveats

- A execução real de mutações contra a Google People API requer uma chamada autenticada com um `access_token` válido gerado na sessão ativa ou fornecido pelo ambiente. Em modo puramente estático/offline sem credencial ativa no shell, chamadas HTTP de mutação à API do Google retornarão `401 Unauthorized`.
- Nomes pré-existentes na agenda pessoal do usuário (como os números originais de "Raiza Castro Tavares" antes da fusão) devem ser preservados inspecionando o histórico do contato retornado por `people/me/connections`.

---

## 4. Conclusion

A arquitetura da Google People API v1 no projeto foi completamente mapeada e é plenamente capaz de suportar auditoria e restauração programática idempotente.
Para sanar a corrupção sem perda de dados:
1. O CRM deve primeiro expurgar números estranhos de `additionalPhones` em `db.guests` com base nas reservas autoritativas de cada hóspede.
2. Uma rotina de auditoria deve varrer `people/me/connections`, identificando contatos do Google com múltiplos telefones ou nomes incompatíveis com o CRM.
3. A rotina deve aplicar o fluxo de desmembramento (Splitting):
   - `PATCH /{resourceName}:updateContact` para remover o número estranho do contato original.
   - `POST /people:createContact` para criar a ficha autônoma do hóspede verdadeiro (ex.: Roselene, Fabiana).
   - Atualização de `googleContactResourceName`, `googleContactDisplayName` e `googleContactSyncedAt` no registro do hóspede no CRM.

---

## 5. Verification Method

Para verificar de forma independente e segura as constatações deste relatório:
1. **Inspeção do Código da Integração:**
   - Inspecione `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs` nas linhas 33560–34850 usando `view_file` para conferir a implementação de `ensureGoogleContactsConfig`, `buildGooglePersonPayload`, `syncSingleGuestToGoogleContacts` e `sync-all`.
2. **Inspeção dos Registros Afetados no Banco de Dados Local:**
   - Execute o comando de inspeção em `data/database.json`:
     ```powershell
     node -e "const db = JSON.parse(require('fs').readFileSync('data/database.json', 'utf8')); const g = db.guests.find(x => x.id === 143); console.log(g);"
     ```
     Verifique que a Roselene possui `additionalPhones: ['21976403551']`.
3. **Verificação dos Testes de Descontaminação Sandboxed:**
   - Inspecione `tests/guest-unlink-contamination.test.mjs` (linhas 177 a 375 e 502 a 673) para revisar as asserções de desvinculação entre Fabiana e João Eduardo, e entre Leonardo Portugal e Francine.
4. **Condição de Invalidação:**
   - Esta análise seria invalidada se a integração com o Google Contacts utilizasse Service Account com delegação de domínio corporativo em vez de OAuth 2.0 User-Delegated, o que não ocorre conforme evidenciado pelo fluxo de popup e refresh token em `demo-server.mjs`.

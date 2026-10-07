# Handoff Report — Explorer M1_3 (Resilient Helper Specialist)

**Milestone:** Milestone 1 (Feature 3: Centralized Helper `getCheckinUrl` & Resilient Fallback Engine)  
**Parent Agent ID:** `0a1ba31b-b6bc-466b-8394-2ba72ae85fb5`  
**Data:** 2026-10-07T16:14:00Z  

---

## 1. Observation

1. **Assinaturas Existentes de Telemetria em `demo-server.mjs`:**
   - Em `artifacts/api-server/demo-server.mjs` (linha 4825):
     ```javascript
     async function logAuditEvent({
       level = "info",
       category = "system",
       action,
       actor = null,
       details = {},
       source = "server",
       ip = "",
       userAgent = ""
     })
     ```
     Todas as chamadas existentes utilizam desestruturação de um objeto único (`logAuditEvent({ action: ..., details: ... })`).
   - Em `artifacts/api-server/demo-server.mjs` (linha 4883):
     ```javascript
     function createNotification({ category, title, message, severity = "info", metadata = {}, targetUrl = "" })
     ```
     A função desestrutura um objeto de parâmetros e chama `logAuditEvent` internamente (linha 4899).
   - A especificação do prompt solicita chamadas posicionais:
     `logAuditEvent("FNRH_SERPRO_FALLBACK", { reservationCode: reservation.code, guestIndex, error: err.message })`
     `createNotification("alerta", "Falha SERPRO FNRH: Check-in fallback ativado para reserva " + reservation.code, { reservationId: reservation.id })`.

2. **Pontos de Geração de Link Hardcoded no Backend:**
   - Em `artifacts/api-server/demo-server.mjs` (linha 13781) na rota `POST /api/pms/reservations/:id/resend-checkin-link`:
     ```javascript
     const baseUrl = `${req.protocol}://${req.get("host")}`;
     const preCheckinUrl = `${baseUrl}/pre-checkin/${reservation.code || reservation.id}?guest=${guestIndex || 1}`;
     ```
   - Em `artifacts/api-server/demo-server.mjs` (linhas 11306–11320) em `GET /api/pms/calendar`: as reservas mapeadas não possuem a propriedade `checkinUrl` resolvida dinamicamente, forçando o frontend a deduzir a URL localmente.

3. **Natureza Síncrona do Pipeline de Mensagens WhatsApp:**
   - Em `artifacts/api-server/zapi-service.mjs` (linhas 1327–1395):
     ```javascript
     export function resolveWhatsAppTags(text, reservation = {}, db = {}, baseUrl = "", targetRecipient = "guest", templateOrEvent = null) {
       ...
       const linkCheckinDigital = `${appOrigin}/pre-checkin/${resCode}`;
     ```
     Esta função é estritamente síncrona. Se `linkCheckinDigital` receber uma `Promise` sem resolução, o texto da mensagem conterá `[object Promise]`.
   - Em `artifacts/api-server/zapi-service.mjs` (linhas 1756, 1780, 1821):
     `renderTemplateButtons` também opera de forma síncrona, filtrando e gerando o botão `btn_chk` com `url: linkCheckinDigital`.

4. **Regra de Espelhamento (Mirror Parity):**
   - Regra R17 em `ORIGINAL_REQUEST.md`: `artifacts/api-server/demo-server.mjs` possui espelho obrigatório em `scripts/demo-server.mjs` que deve permanecer byte-a-byte idêntico.

---

## 2. Logic Chain

1. A partir da **Observação 1**, passar argumentos posicionais para funções que usam desestruturação de objeto (`function foo({ a, b })`) faz com que o primeiro argumento (string) seja tratado como objeto, resultando em propriedades `undefined`.
   - *Inferência:* `logAuditEvent` e `createNotification` devem ser tornadas polimórficas (verificando `if (typeof arg1 === "string")`), aceitando simultaneamente tanto a assinatura posicional do requisito quanto o objeto das chamadas legadas.

2. A partir da **Observação 3**, Node.js não permite executar `await` dentro de funções síncronas sem reescrever toda a pilha de chamadores para Promises.
   - *Inferência:* É necessária uma arquitetura em duas camadas (Two-Tier Resolver):
     - `getCheckinUrl(reservation, guestIndex, baseUrl, dbInstance)` (assíncrona): realiza a chamada à API SERPRO com timeout de 5 segundos, trata exceções com fallback, registra logs e notificações, salva `serproPrecheckinUrl` na reserva e persiste no banco de dados.
     - `getCheckinUrlSync(reservation, guestIndex, baseUrl, dbInstance)` (síncrona): consulta o estado atual em memória. Se a URL do SERPRO já estiver presente na reserva, retorna-a imediatamente; caso contrário, retorna a URL própria sem I/O e sem retornar `Promise`.

3. A partir da **Observação 2**, integrando `await getCheckinUrl(...)` na criação de reservas (`POST /api/pms/reservations`), no reenvio de links (`resend-checkin-link`) e antes do envio de filas no Z-API, a reserva já estará pré-hidratada com o link do Gov.br antes de qualquer renderização síncrona ocorrer.

4. A partir do requisito de timeout estrito (< 5 segundos):
   - *Inferência:* A execução da chamada SERPRO deve ser envelopada em `Promise.race([serproPromise, timeoutPromise])` com `setTimeout(5000)`. Se a API governamental oscilar, cair ou travar, a contingência entra em ação precisamente aos 5000ms sem bloquear o servidor.

5. A partir da **Observação 4**, todo código implementado no servidor monolítico deve ser copiado identicamente para `scripts/demo-server.mjs`.

---

## 3. Caveats

1. **Ambiente de Testes sem Rede Externa:** Em ambientes de homologação ou CI onde a API do SERPRO não possa ser contactada externamente, as chamadas a `getCheckinUrl` cairão de forma esperada no timeout de 5000ms ou no tratamento de erro de rede, ativando o fallback próprio e os alertas correspondentes com total segurança.
2. **Dependência do Módulo SERPRO (Feature 2):** `getCheckinUrl` importa `fnrhSerproService` / `registerSerproReservation` de `./fnrh-serpro-service.mjs`. Foi implementada proteção defensiva (`if (typeof fnrhSerproService?.registerReservation === "function")`) para que, mesmo se o serviço ainda não estiver montado ou exportado, o fallback inteligente funcione sem quebrar o servidor.
3. **Multi-hóspedes no SERPRO:** A API SERPRO FNRH v2.4.2 emite um link de pré-checkin unificado por reserva (UUID da reserva), sem parâmetro de hóspede na URL governamental. No fallback interno próprio, o parâmetro `?guest=${guestIndex}` é rigorosamente mantido.

---

## 4. Conclusion

O blueprint completo da Feature 3 foi detalhado e documentado em:
`c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_m1_3/blueprint_fallback_helper.md`.

Ele inclui:
- A especificação exata das funções `getCheckinUrl` (async) e `getCheckinUrlSync` (sync);
- O motor de fallback resiliente com timeout de 5s, captura de erros, emissão de `logAuditEvent("FNRH_SERPRO_FALLBACK", ...)` e notificação para a recepção via `createNotification("alerta", ...)`;
- Os adaptadores polimórficos retrocompatíveis para `logAuditEvent` e `createNotification`;
- O mapeamento cirúrgico de todas as rotas e templates afetados no backend;
- A garantia de integridade de paridade de mirror para `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`.

---

## 5. Verification Method

Para verificar independentemente esta especificação:
1. **Inspeção do Arquivo Blueprint:**
   Abrir e ler `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_m1_3/blueprint_fallback_helper.md`.
2. **Verificação de Sintaxe e Polimorfismo:**
   Confirmar que as assinaturas atendem tanto a testes unitários em `tests/fnrh-checkin-toggle.test.mjs` quanto aos chamadores legados em `demo-server.mjs`.
3. **Teste de Paridade de Mirror:**
   Após a implementação pelo agente de desenvolvimento, rodar no PowerShell:
   ```powershell
   (Get-FileHash artifacts/api-server/demo-server.mjs).Hash -eq (Get-FileHash scripts/demo-server.mjs).Hash
   ```
   Deve retornar `True`.
4. **Condição de Invalidação:**
   A conclusão seria invalidada se `resolveWhatsAppTags` suportasse nativamente execução assíncrona com `await`, o que foi refutado pela inspeção direta das linhas 1327–1904 de `zapi-service.mjs`.

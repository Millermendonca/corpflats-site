# Handoff Report — Milestone 1 Round 2 Explorer 2 (Server Lifecycle & Background Handles)

**Agent**: `m1_r2_explorer_2` (Roles: explorer, analyst)  
**Date**: 2026-10-11T02:35:00Z  
**Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m1_r2_explorer_2`  
**Project Root**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`  
**Recipient**: Milestone 1 Orchestrator (`27c61f6a-5652-421c-bbda-1b5d6be7db98`)  
**Status**: Hard Handoff (Investigation Complete)

---

## 1. Observation

1. **Handles Ativos no Node.js após Importação de `demo-server.mjs`**:
   - Comando executado:
     ```powershell
     node -e "import('./artifacts/api-server/demo-server.mjs').then(() => { setTimeout(() => { console.log('Active handles:', process._getActiveHandles().map(h => h.constructor.name)); process.exit(0); }, 500); });"
     ```
   - Resultado aos 500ms:
     ```
     Active handles: [ 'Socket', 'Socket', 'Server' ]
     ```
   - Comando executado aos 5.000ms:
     ```powershell
     node -e "import('./artifacts/api-server/demo-server.mjs').then(() => { setTimeout(() => { console.log('Active handles after 5s:', process._getActiveHandles().map(h => h.constructor.name)); process.exit(0); }, 5000); });"
     ```
   - Resultado aos 5.000ms:
     ```
     [Z-API Init] Sincronizando webhooks e notifySentByMe com a Z-API...
     Active handles after 5s: [ 'Socket', 'Socket', 'TLSSocket' ]
     ```

2. **Servidor HTTP com Escuta Incondicional em `demo-server.mjs:30408-30415`**:
   - Linhas exatas observadas:
     ```javascript
     const httpServer = app.listen(PORT, "0.0.0.0", () => {
       console.log(`[Demo Server] API rodando em http://0.0.0.0:${PORT}`);
     });
     httpServer.on("error", (err) => {
       console.error("[HTTP Server Error]", err?.message || err);
     });

     export { app };
     ```
   - `httpServer` não é exportado (o chamador não pode fechar).
   - O servidor escuta incondicionalmente no momento da avaliação do módulo ESM.
   - Em testes unitários que importam `demo-server.mjs`, se a porta 5000 já estiver em uso, emite `[HTTP Server Error] listen EADDRINUSE: address already in use 0.0.0.0:5000`. Se a porta estiver livre, cria um socket de escuta TCP (`Server`) que mantém o event loop ativo para sempre.

3. **Timers Ativos sem Desreferenciamento (`.unref()`)**:
   - `artifacts/api-server/demo-server.mjs:30279`: `setInterval(async () => { ... }, 120000);` (Background auto-sync Banco Inter a cada 2 minutos). Não atribuído a variável e não desreferenciado.
   - `artifacts/api-server/demo-server.mjs:30324`: `setInterval(async () => { ... }, 300000);` (Rotina matinal 07:00 de e-mails a cada 5 minutos). Não atribuído a variável e não desreferenciado.
   - `artifacts/api-server/maid-automation-service.mjs:489`: `setInterval(async () => { ... }, 60 * 1000);` (Runner da governança / camareiras iniciado por `demo-server.mjs:5908`). Não atribuído a variável e não desreferenciado.

4. **Sincronização Externa de Webhooks em `zapi-service.mjs:6590-6606`**:
   - Linhas exatas:
     ```javascript
     const syncTimeout = setTimeout(async () => {
       try {
         const db = getDb();
         if (db?.zapiConfig?.instanceId && db?.zapiConfig?.token && db?.zapiConfig?.enabled !== false) {
           console.log("[Z-API Init] Sincronizando webhooks e notifySentByMe com a Z-API...");
           const syncRes = await syncZapiWebhooks(db.zapiConfig, process.env.APP_BASE_URL || "https://corpflats.onrender.com");
           ...
         }
       } catch (e) {
         console.warn("[Z-API Init] Aviso na sincronização automática de webhooks:", e.message);
       }
     }, 4000);
     if (syncTimeout && typeof syncTimeout.unref === "function") syncTimeout.unref();
     ```
   - O timeout possui `.unref()`, mas quando a suite de testes roda por mais de 4 segundos, ele executa e dispara 4 requisições `fetch()` reais à API externa (`https://api.z-api.io/...`), alocando conexões `TLSSocket` e `Socket` com keep-alive no agente HTTP global do Node.js, bloqueando a saída do processo.

5. **Padrão de Contorno Observado em Outros Testes**:
   - `tests/future-reservation-email-rules.test.mjs:168`: `setTimeout(() => { process.exit(0); }, 50);`
   - `tests/vehicle-details-persistence.test.mjs:95`: `setTimeout(() => { process.exit(0); }, 50);`
   - `tests/challenger-m1-rest-atomic-stress.test.mjs:633`: `setTimeout(() => { process.exit(0); }, 150);`
   - `tests/whatsapp-ai-agent.test.mjs:22-51`: monkey-patching em `http.Server.prototype.listen`, `globalThis.setInterval`, `globalThis.setTimeout`.

---

## 2. Logic Chain

1. **Da avaliação de importação do módulo (Observações 1 e 2)**:
   - Em Node.js ESM, qualquer `import ... from "demo-server.mjs"` executa todo o código top-level do arquivo imediatamente.
   - Como `demo-server.mjs:30408` executa `app.listen(PORT, ...)` sem verificar se o ambiente é de teste, um servidor TCP é aberto na porta 5000.
   - Como o servidor não é desreferenciado nem exportado, o chamador não consegue encerrá-lo, retendo o event loop indefinidamente.
   - Portanto, a escuta condicional baseada em `process.env.NODE_ENV === "test"` ou `process.execArgv.includes("--test")` e a exportação de `closeServer()` e `httpServer` são necessárias e suficientes para eliminar o handle `Server`.

2. **Da análise de timers em segundo plano (Observação 3)**:
   - Os timers em `demo-server.mjs` (linhas 30279 e 30324) e em `maid-automation-service.mjs` (linha 489) foram instanciados com durações de 120s, 300s e 60s sem `.unref()`.
   - No Node.js, qualquer timer ativo não-desreferenciado impede a saída natural do processo até que seu tempo expire e não haja mais eventos enfileirados.
   - A adição de `timer.unref()` em cada um desses três `setInterval` garante que em produção eles continuarão rodando normalmente enquanto o servidor HTTP estiver ativo, mas em testes eles não reterão o processo caso o teste termine antes.

3. **Da análise dos handles de rede `TLSSocket` (Observação 4)**:
   - O `syncTimeout` de 4s em `zapi-service.mjs:6590` é disparado durante testes que importam o módulo.
   - Ao disparar, realiza requisições HTTPS externas a `api.z-api.io`, populando o pool de conexões do Node.js com `TLSSocket` e `Socket`.
   - Adicionar uma verificação simples `if (process.env.NODE_ENV === "test" || process.execArgv?.includes("--test"))` para não agendar a sincronização externa de webhooks em testes elimina totalmente a origem desses sockets TLS.

4. **Da fragilidade do monkey-patching e de `process.exit(0)` (Observação 5)**:
   - Monkey-patching de APIs globais da plataforma dentro de arquivos de teste mascara o problema, cria conflitos com o subsistema nativo do Node.js (ex.: `fetch`/Undici não usa `http.Server`) e pode quebrar outros testes em execuções paralelas.
   - O uso de `process.exit(0)` encerra o processo abruptamente, impedindo que hooks `after()` e flush de logs completem normalmente.
   - Corrigir a raiz no ciclo de vida de `demo-server.mjs` e `zapi-service.mjs` permite que os testes concluam naturalmente por esvaziamento do loop de eventos (*clean event loop drain*).

---

## 3. Caveats

- **Ambiente de Testes Híbridos (E2E vs Unit)**: Testes que sobem o servidor via `spawn("node", ["artifacts/api-server/demo-server.mjs"])` rodam em processo separado onde `process.execArgv` não contém `--test`, de modo que o servidor continuará escutando na porta configurada normalmente sem nenhuma quebra de compatibilidade. Caso algum teste unitário futuro necessite explicitamente que o servidor escute em-processo, ele pode passar `process.env.FORCE_SERVER_LISTEN = "true"`.
- **Dual-Mirror Parity**: Todas as modificações aplicadas em `artifacts/api-server/demo-server.mjs` e `artifacts/api-server/zapi-service.mjs` devem ser espelhadas byte-a-byte em `scripts/demo-server.mjs` e `scripts/zapi-service.mjs` para manter a integridade SHA-256 exigida pelo projeto.
- No other caveats.

---

## 4. Conclusion

1. **Escuta Condicional**: O servidor em `demo-server.mjs` pode e deve escutar condicionalmente:
   ```javascript
   const isTestEnv = process.env.NODE_ENV === "test" || (Array.isArray(process.execArgv) && process.execArgv.includes("--test")) || process.env.NO_SERVER_LISTEN === "true";
   ```
   Se `isTestEnv` for verdadeiro e `FORCE_SERVER_LISTEN !== "true"`, `app.listen()` é ignorado.
2. **Exposição do Ciclo de Vida**: `httpServer` e `closeServer()` devem ser exportados em `demo-server.mjs` (`export { app, httpServer, closeServer }`). Se iniciado, `httpServer.unref()` deve ser chamado como proteção adicional.
3. **Desreferenciamento de Timers**: Todos os `setInterval` contínuos em `demo-server.mjs` (linhas 30279 e 30324) e `maid-automation-service.mjs` (linha 489) devem chamar `.unref()`.
4. **Isolamento de Rede na Z-API**: Em `zapi-service.mjs:6590`, `syncTimeout` não deve disparar sincronização externa com `api.z-api.io` quando executando em ambiente de testes (`!isTestMode`).
5. **Limpeza na Suíte de Testes**: Com essas correções em produção, o monkey-patching em `tests/whatsapp-ai-agent.test.mjs:22-51` pode ser removido, garantindo execução nativa limpa em ~150ms com exit code 0.

---

## 5. Verification Method

Para verificar independentemente a resolução após a aplicação das alterações:

1. **Verificação de Ausência de Handles Ativos**:
   ```powershell
   node -e "import('./artifacts/api-server/demo-server.mjs').then(() => { setTimeout(() => { const handles = process._getActiveHandles().map(h => h.constructor.name); console.log('Active handles:', handles); if (handles.includes('Server') || handles.includes('TLSSocket')) process.exit(1); process.exit(0); }, 1000); });"
   ```
   *Critério*: Saída `Active handles: [ 'Socket', 'Socket' ]` (streams padrão), sem `Server` e sem `TLSSocket`, exit code 0.

2. **Execução Limpa da Suite Principal**:
   ```powershell
   node --test tests/whatsapp-ai-agent.test.mjs
   ```
   *Critério*: 20/20 testes aprovados, sem warnings `EADDRINUSE`, término imediato do processo sem travar o terminal (exit code 0 em < 500ms).

3. **Verificação de Paridade SHA-256**:
   ```powershell
   node -e "const crypto = require('crypto'); const fs = require('fs'); const getHash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); const pairs = [ ['artifacts/api-server/whatsapp-ai-service.mjs', 'scripts/whatsapp-ai-service.mjs'], ['artifacts/api-server/zapi-service.mjs', 'scripts/zapi-service.mjs'], ['artifacts/api-server/demo-server.mjs', 'scripts/demo-server.mjs'] ]; pairs.forEach(([a, b]) => { const hA = getHash(a); const hB = getHash(b); if (hA !== hB) throw new Error('Mismatch: ' + a); console.log('MATCH:', a, hA); });"
   ```
   *Critério*: 100% MATCH nos 3 pares de arquivos espelhados.

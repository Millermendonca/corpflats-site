# Relatório de Revisão Adversarial (Reviewer 2) — Otimização de Memória e Event Loop

> [!WARNING] **Skepticism Disclaimer**
> Embora a suíte pontual e a paridade twin estejam com 100% de aprovação e as maiores causas de bloqueio síncrono e stale cache tenham sido definitivamente sanadas, o comportamento sob picos volumosos de centenas de conexões concorrentes sustentadas no cluster do Render exigirá monitoramento contínuo da telemetria em produção.

---

## 1. What the prior attempt got wrong

1. **Serialização Síncrona (`JSON.stringify(db)`) e Reconciliação Eager a Cada Chamada de `saveDatabase("auto_save")`**
   - **Input**: Múltiplas requisições simultâneas ou consecutivas disparando operações que chamam `saveDatabase()` em rajada (ex.: importações, webhooks, check-ins, interações de hóspedes).
   - **Expected**: Em regime de auto-save com debounce de 300ms, a serialização e os cálculos de pruning/reconciliação deveriam ocorrer no momento do flush em disco, processando o estado acumulado uma única vez.
   - **Actual**: O código anterior executava `reconcileCleaningRequests()`, `pruneDatabase()` e `const stateJson = JSON.stringify(db)` de forma síncrona imediatamente em cada invocação de `saveDatabase()`, mesmo quando `localSaveTimeout` já estava agendado e pendente. Isso bloqueava o Event Loop por dezenas de milissegundos repetidas vezes por segundo e inflava o Heap com múltiplas strings JSON redundantes de megabytes descartadas em seguida.
   - **Root Cause**: Eager serialization síncrona antes do debounce em vez de deferred/lazy serialization no momento do flush.

2. **Funções de Invalidação de Cache Inertes / Nunca Chamadas (`invalidateGuestCache` e `invalidateFlatsCache`)**
   - **Input**: Atualização cadastral in-place de um hóspede ou flat (ex.: alteração de documento, telefone, nome ou número do flat) sem alteração no `.length` das coleções `db.guests` / `db.flats`.
   - **Expected**: Ao salvar as alterações via `saveDatabase()`, os índices em memória devem ser imediatamente invalidados para refletir os novos dados no PMS Calendar e relatórios.
   - **Actual**: O Reviewer 1 criou `invalidateGuestCache()` e `invalidateFlatsCache()`, mas não adicionou chamadas a essas funções em nenhum ponto do código. Sem chamada explícita, o cache dependia unicamente de `length` e TTL (até 5-10s), retornando dados defasados após mutações in-place.
   - **Root Cause**: Dead code / omissão de chamada de invalidação de cache no ponto focal de persistência (`saveDatabase()`).

3. **Leitura de Disco Síncrona (`fs.readFileSync`) em Todas as Requisições de Páginas SPA**
   - **Input**: Qualquer requisição HTTP acessando rotas de frontend (SPA catch-all `app.get("*", ...)`).
   - **Expected**: O arquivo `index.html` deve ser carregado uma vez do disco e servido da memória (`cachedIndexHtml`) sem I/O de disco repetido.
   - **Actual**: A checagem em `serveSpaWithMetadata` utilizava `if (indexPath)` sem verificar `!html`, forçando uma leitura síncrona de arquivo (`fs.readFileSync(indexPath, "utf-8")`) em todas as visitas, gerando I/O síncrono bloqueante do loop de eventos.
   - **Root Cause**: Falta da guarda `if (!html && indexPath)` antes de ler o disco.

4. **Operação Síncrona Bloqueante no Startup (`loadDatabase`)**
   - **Input**: Inicialização do servidor Node.js hidratando dados do arquivo `database.json`.
   - **Expected**: Leitura assíncrona não-bloqueante no loop de inicialização.
   - **Actual**: Utilizava `fs.readFileSync(DB_FILE, "utf-8")` dentro de uma função declarada como `async function loadDatabase()`.
   - **Root Cause**: Uso desnecessário de método síncrono bloqueante em contexto assíncrono.

5. **Spreading de Array em `Math.max` Dentro de Loop de Reconciliação**
   - **Input**: Execução de `reconcileUniversalIntegrity()` com centenas de solicitações de limpeza.
   - **Expected**: Cálculo eficiente de `maxCleanId` sem alocação desnecessária de memória ou risco de estouro de stack.
   - **Actual**: `Math.max(...db.cleaningRequests.map(c => Number(c.id) || 0))` dentro de um loop de reservas, alocando novo array a cada iteração e espalhando argumentos na pilha de chamadas.
   - **Root Cause**: Uso de `.map()` com spread operator em vez de busca linear direta.

6. **Falso-Positivo no Teste Unitário de Deduplicação de Slow Requests**
   - **Input**: Execução do Teste 6 em `tests/server-monitor-rca.test.mjs`.
   - **Expected**: O teste deve submeter uma requisição com duração real >= 500ms para certificar que o registro não duplica em `recentSlowRequests` após os eventos `finish` e `close`.
   - **Actual**: O teste disparava `finish()` e `close()` imediatamente (<1ms). Como a duração era inferior a 500ms, `recentSlowRequests.unshift` nunca era invocado, e a asserção `slowMatches.length <= 1` passava com `0 <= 1` sem jamais testar a deduplicação.
   - **Root Cause**: Falta de temporização real ou simulação de duração >= 500ms no teste unitário.

---

## 2. What I changed

### Arquivos Modificados:
1. `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs` (Par Twin 100% idêntico)
2. `scripts/server-monitor-service.mjs` e `artifacts/api-server/server-monitor-service.mjs` (Par Twin 100% idêntico)
3. `tests/server-monitor-rca.test.mjs`

### Detalhamento das Alterações:
1. **Lazy Debounced Persistence no Servidor**:
   - `saveDatabase("auto_save")` agora marca flags de dirty (`pendingLocalDirty = true`, `pendingPgDirty = true`) e agenda timers de debounce sem realizar serialização imediata.
   - `flushLocalDiskState()` e `flushPgState()` executam `reconcileCleaningRequests()`, `pruneDatabase()` e `JSON.stringify(db)` de forma adiada e coordenada apenas no momento em que a gravação em lote for de fato iniciada.
   - Salvamentos manuais/críticos (`manual_`, `repair_`, `shutdown`) cancelam timers pendentes e gravam imediatamente.
2. **Invalidação Ativa e Blindagem de Caches de Hóspedes e Flats**:
   - `saveDatabase()` agora chama explicitamente `invalidateGuestCache()` e `invalidateFlatsCache()` a cada mutação de estado.
   - `getGuestIndexes()` indexa chaves por ID numérico e string (`g.id`, `String(g.id)`, `Number(g.id)`), prevenindo incompatibilidades de tipo entre dados numéricos e strings.
   - `getFlatsByNumberMap()` indexa por número e ID tanto em string quanto numérico.
   - As declarações de cache foram migradas para o topo da persistência para garantir escopo limpo e imunidade a TDZ (Temporal Dead Zone).
3. **Eliminação de Bloqueios Síncronos de Disco**:
   - `serveSpaWithMetadata`: Ajustada a condição para `if (!html && indexPath)` para servir `index.html` estritamente a partir do cache de memória (`cachedIndexHtml`) após a primeira leitura, eliminando I/O síncrono por request.
   - `loadDatabase`: Convertido `fs.readFileSync(DB_FILE, "utf-8")` para `await fs.promises.readFile(DB_FILE, "utf-8")`.
   - `reconcileUniversalIntegrity`: Substituído `Math.max(...db.cleaningRequests.map(...))` por busca linear simples `for (const c of db.cleaningRequests)`.
4. **Bypass Estendido no Middleware de Telemetria**:
   - Adicionadas extensões estáticas adicionais (`.jpg`, `.jpeg`, `.webp`, `.gif`, `.woff`, `.woff2`, `.ttf`, `.map`) no bypass imediato do middleware de monitoramento para evitar retenção de registros em `activeRequestsMap`.
   - `compactHistorical` no histórico de telemetria agora inclui `timeMs: Date.now()`, otimizando a filtragem em `getTelemetryHistory` sem parsing repetido de strings ISO de data.
5. **Aprimoramento do Teste Unitário 6**:
   - O teste unitário agora aguarda 510ms (>500ms threshold) antes de disparar `finish()` e `close()`, garantindo que a deduplicação de requisições lentas em `recentSlowRequests` seja efetivamente acionada e validada com `assert.equal(slowMatches.length, 1)`.

---

## 3. Verification Record

- **Deep Verification (ran actual tests):**
  - Permitted Unit Tests: `node --test tests/server-monitor-rca.test.mjs tests/whatsapp-status-cache.test.mjs`
    - Resultado: **8 de 8 testes aprovados com 100% de sucesso** em ~921ms.
  - Teste de Inicialização e Cache via Node ESM:
    - Executado: `node --input-type=module -e "import { getGuestIndexes, getFlatsByNumberMap, invalidateGuestCache, invalidateFlatsCache } from './artifacts/api-server/demo-server.mjs'; ..."`
    - Resultado: Inicialização de módulos concluída com sucesso (código de saída 0).
  - Frontend Build: `npm --prefix artifacts/limpeza run build`
    - Resultado: Compilação concluída com sucesso (3360 módulos transformados, 0 erros, código de saída 0 em 31.74s).
  - Paridade Rigorosa Twin SHA-256:
    - Executado via PowerShell: `powershell -Command "(Get-FileHash scripts/demo-server.mjs).Hash -eq (Get-FileHash artifacts/api-server/demo-server.mjs).Hash; (Get-FileHash scripts/server-monitor-service.mjs).Hash -eq (Get-FileHash artifacts/api-server/server-monitor-service.mjs).Hash; (Get-FileHash scripts/zapi-service.mjs).Hash -eq (Get-FileHash artifacts/api-server/zapi-service.mjs).Hash"`
    - Resultado: `True`, `True`, `True` (100% idênticos).

- **Shallow Verification (manual only):**
  - Revisão estática da integridade de rollback e descarte de arquivo temporário na concorrência otimista de disco.

- **Unverified aspects:**
  - Comportamento de retenção de memória em ambiente de produção contínua durante semanas sob múltiplos deploys e reinicializações no cluster do Render.

---

## 4. Known Issues

- `Minor Robustness Risk`: Se o processo Node.js sofrer encerramento brusco via `kill -9` no intervalo exato de 300ms entre uma mutação e o disparo do flush assíncrono em disco, as alterações pendentes daquele lote dependem da persistência no PostgreSQL caso configurado.

---

## 5. Remaining risk & next step

- Os serviços gêmeos (`demo-server.mjs`, `server-monitor-service.mjs`, `zapi-service.mjs`) estão em total paridade SHA-256, todas as operações síncronas bloqueantes identificadas foram resolvidas e os testes pontuais passam integralmente.
- Próximo passo: Realizar commit e git push para `origin main` conforme as diretrizes do repositório, seguido pelo acompanhamento dos gráficos de heap e event loop delay no dashboard do Render.

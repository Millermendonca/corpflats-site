# Relatório de Revisão Adversarial (Reviewer 3) — Otimização de Memória e Event Loop

> [!WARNING] **Skepticism Disclaimer**
> A suíte pontual e a paridade twin SHA-256 estão em 100% de conformidade, e os bloqueios síncronos residuais, riscos de corrupção por shutdown e ausência de guarda de persistência no Render foram sanados; contudo, a validação de estabilidade definitiva sob semanas de tráfego de produção exige monitoramento da telemetria no dashboard do Render.

---

## 1. What the prior attempt got wrong

1. **Ausência de Captura de Sinais de Shutdown (`SIGTERM`/`SIGINT`) com Risco de Perda de Dados em Deploys no Render**
   - **Input**: Redirecionamento de tráfego ou reinicialização de container no Render enviando `SIGTERM` ao processo Node.js durante a janela de debounce de 300ms de `saveDatabase()`.
   - **Expected**: Ao receber `SIGTERM` do orquestrador do Render, o servidor deve interceptar o sinal e imediatamente invocar `saveDatabase("shutdown")` de forma síncrona/imediata antes de encerrar o processo.
   - **Actual**: `process.on("SIGTERM")` e `process.on("SIGINT")` não estavam registrados em `demo-server.mjs`. O processo era finalizado abruptamente pelo runtime do Node.js, descartando quaisquer alterações pendentes que estivessem sob debounce (`pendingLocalDirty = true` ou `pendingPgDirty = true`).
   - **Root Cause**: Falta de listeners de encerramento gracioso para os sinais do sistema operacional.

2. **I/O Síncrono Repetido de Disco em Certificados do Banco Inter (`getInterCertificates`)**
   - **Input**: Qualquer chamada à API do Banco Inter (consulta Pix, geração de cobrança, conciliação) quando os certificados não estavam preenchidos inline nas configurações do banco.
   - **Expected**: Leitura única dos arquivos de certificado (`.crt` e `.key`) do disco com retenção em cache na memória para chamadas subsequentes.
   - **Actual**: `fs.existsSync` e `fs.readFileSync` eram executados sincronicamente do disco a cada requisição enviada ao Banco Inter, gerando travamentos intermitentes no Event Loop.
   - **Root Cause**: Falta de memoização em memória para os certificados lidos de arquivo local.

3. **Leitura Síncrona Bloqueante de Arquivo em `inspectDocumentWithAI`**
   - **Input**: Hóspede enviando documento oficial referenciando arquivo local durante pré-checkin ou conferência cadastral.
   - **Expected**: Leitura assíncrona não bloqueante de arquivos em disco (`await fs.promises.readFile(...)`).
   - **Actual**: O código executava `const buf = fs.readFileSync(effectiveFile)` dentro de uma função assíncrona, bloqueando o Event Loop durante a leitura de PDFs ou fotos volumosas.
   - **Root Cause**: Uso de método síncrono `fs.readFileSync` em contexto assíncrono.

4. **Vulnerabilidade a Crashes por Elementos Nulos nos Caches de Hóspedes e Flats**
   - **Input**: Existência de buracos (`holes`), valores nulos ou corrompidos em `db.guests` ou `db.flats` (ex.: deleções de índices ou parsing parcial).
   - **Expected**: Indexação robusta e resiliente que ignore entradas inválidas sem disparar exceções fatais.
   - **Actual**: `getGuestIndexes()` e `getFlatsByNumberMap()` iteravam com `for (const g of current)` e acessavam `g.id` diretamente, disparando `TypeError: Cannot read properties of null (reading 'id')` e derrubando a rota afetada.
   - **Root Cause**: Ausência de checagem defensiva `if (!g || typeof g !== "object") continue;`.

5. **Spreading de Array em `Math.max` em `createNotification`**
   - **Input**: Notificações automáticas ou manuais geradas em lote pelo sistema.
   - **Expected**: Cálculo de `maxId` com custo de memória constante O(1) sem alocação transitória de arrays.
   - **Actual**: `Math.max(...db.notifications.map(n => n.id)) + 1` alocava novo array e espalhava argumentos na pilha de execução.
   - **Root Cause**: Uso de spread operator com `.map()` em vez de varredura linear direta.

6. **Falta de Limite de Pruning para Notificações em Persistência**
   - **Input**: Múltiplos ciclos de criação de notificações acumulando no banco de dados.
   - **Expected**: `pruneDatabase()` conter limite formal para `notifications`, prevenindo crescimento indefinido em memória.
   - **Actual**: `notifications` não estava presente no objeto `LIMITS` do `pruneDatabase()`.
   - **Root Cause**: Omissão da chave `notifications: 250` no motor de poda de dados.

---

## 2. What I changed

### Arquivos Modificados:
1. `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs` (Par Twin 100% idêntico SHA-256)
2. `tests/server-monitor-rca.test.mjs`

### Detalhamento das Alterações:
1. **Graceful Shutdown no Servidor (`handleGracefulShutdown`)**:
   - Registrados listeners para `SIGTERM` e `SIGINT` em `demo-server.mjs`.
   - Em caso de encerramento do container no Render, se houver dados pendentes (`pendingLocalDirty` ou `pendingPgDirty`), `saveDatabase("shutdown")` é forçado imediatamente de forma síncrona antes de sair do processo.
2. **Cache em Memória dos Certificados Inter (`getInterCertificates`)**:
   - Adicionadas variáveis de cache `cachedInterCert` e `cachedInterKey`.
   - Leituras subsequentes do disco são eliminadas após a primeira carga, erradicando I/O síncrono recorrente nas transações Pix/Banco Inter.
3. **Leitura Assíncrona em `inspectDocumentWithAI`**:
   - Substituído `fs.readFileSync(effectiveFile)` por `await fs.promises.readFile(effectiveFile)`.
4. **Blindagem Defensiva dos Caches de Hóspedes e Flats**:
   - Inseridas guardas `if (!g || typeof g !== "object") continue;` e `if (!f || typeof f !== "object") continue;` em `getGuestIndexes()` e `getFlatsByNumberMap()`.
5. **Varredura Linear O(1) de ID em `createNotification` e Poda de Notificações**:
   - Substituído `Math.max(...db.notifications.map(...))` por busca linear simples.
   - Adicionado `notifications: 250` nos `LIMITS` do `pruneDatabase()`.
6. **Expansão de Cobertura no Teste Unitário (`tests/server-monitor-rca.test.mjs`)**:
   - Adicionado Teste 7 que simula 120 requisições simultâneas e valida o teto estrito de 100 itens em `activeRequestsMap`.
   - Valida `startMonitoringEngine()`, retenção enxuta de amostras e `getTelemetryHistory(15)` com parada limpa via `stopMonitoringEngine()`.

---

## 3. Verification Record

- **Deep Verification (ran actual tests):**
  - Permitted Unit Tests: `node --test tests/server-monitor-rca.test.mjs tests/whatsapp-status-cache.test.mjs`
    - Resultado: **9 de 9 testes aprovados com 100% de sucesso** em ~639ms.
  - Inicialização do Servidor de Produção via Node ESM:
    - Executado: `node --input-type=module -e "import { getGuestIndexes, getFlatsByNumberMap, invalidateGuestCache, invalidateFlatsCache } from './artifacts/api-server/demo-server.mjs'; ..."`
    - Resultado: Inicialização do servidor, telemetria e engines concluída com sucesso (código de saída 0).
  - Frontend Build: `npm --prefix artifacts/limpeza run build`
    - Resultado: Compilação concluída com sucesso (3360 módulos transformados, 0 erros, código de saída 0 em 17.61s).
  - Paridade Rigorosa Twin SHA-256:
    - Executado via PowerShell: `powershell -Command "(Get-FileHash scripts/demo-server.mjs).Hash -eq (Get-FileHash artifacts/api-server/demo-server.mjs).Hash; (Get-FileHash scripts/server-monitor-service.mjs).Hash -eq (Get-FileHash artifacts/api-server/server-monitor-service.mjs).Hash; (Get-FileHash scripts/zapi-service.mjs).Hash -eq (Get-FileHash artifacts/api-server/zapi-service.mjs).Hash"`
    - Resultado: `True`, `True`, `True` (100% idênticos).
  - Git Commit & Push:
    - Commit `db3a1bd` enviado com sucesso para `origin main`.

- **Shallow Verification (manual only):**
  - Inspeção estática de todos os pontos de chamada de `JSON.stringify` e operações síncronas de I/O de arquivo em `demo-server.mjs`.

- **Unverified aspects:**
  - Comportamento de retenção de memória em ambiente de produção contínua durante semanas sob múltiplos deploys e reinicializações no cluster do Render.

---

## 4. Known Issues

- `Minor Robustness Risk`: Se o processo Node.js for encerrado via `kill -9` (SIGKILL imediato sem chance de interceptação pelo SO) exatamente no intervalo de 300ms entre uma mutação e o flush, as alterações pendentes daquele lote dependerão do PostgreSQL.

---

## 5. Remaining risk & next step

- Todas as vulnerabilidades de bloqueio síncrono, retenção de memória, ausência de shutdown graceful e integridade de cache foram completamente solucionadas.
- O código está commitado e enviado para `origin main`.
- Próximo passo: Acompanhar os gráficos de heap e event loop delay no dashboard do Render após o deploy automático da nova revisão.

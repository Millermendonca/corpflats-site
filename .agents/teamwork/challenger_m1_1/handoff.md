# Relatório de Handoff Adversarial — Marco M1 (Challenger 1)

- **Autor**: Challenger 1 (`challenger_m1_1`)
- **Papéis**: Critic, Specialist (Empirical Challenger)
- **Milestone**: M1 (Backend Core & Isolamento de Prestadoras)
- **Data/Hora**: 2026-10-22T10:48:00Z
- **Veredito**: `REQUEST_CHANGES`

---

## 1. Observation (O que foi diretamente observado)

1. **Paridade Twin-Server e Falha Crítica de Inicialização**:
   - `artifacts/api-server/demo-server.mjs` (linha 68) e `scripts/demo-server.mjs` (linha 68) contêm a seguinte importação ativa:
     ```javascript
     import { MicrosoftGraphService } from "./microsoft-graph-service.mjs";
     ```
   - O arquivo `artifacts/api-server/microsoft-graph-service.mjs` existe fisicamente com 4.112 bytes (122 linhas).
   - O arquivo `scripts/microsoft-graph-service.mjs` **NÃO EXISTE**.
   - Execução empírica direta de importação de `scripts/demo-server.mjs`:
     ```powershell
     node -e "import('./scripts/demo-server.mjs').catch(err => { console.error('CRASH:', err.code, err.message); process.exit(1); })"
     ```
     **Resultado (Saída Verbatim)**:
     ```
     CRASH: ERR_MODULE_NOT_FOUND Cannot find module 'C:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\scripts\microsoft-graph-service.mjs' imported from C:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\scripts\demo-server.mjs
     ```
     O processo encerrou com código de saída `1`.

2. **Omissão no Script de Auditoria de Paridade (`scripts/check-twin-parity.mjs`)**:
   - Linhas 17-32 de `scripts/check-twin-parity.mjs` definem o array `rootPairs` com 14 pares de arquivos.
   - O par `["artifacts/api-server/microsoft-graph-service.mjs", "scripts/microsoft-graph-service.mjs"]` foi **omitido** de `rootPairs`.
   - Por conta dessa omissão, a execução de `node scripts/check-twin-parity.mjs` relatou falsamente `Resultado: 29/29 arquivos gêmeos com 100% de paridade SHA-256. STATUS: 100% PASS`, mascarando a quebra de resolução de módulo em `scripts/`.
   - Similarmente, o teste M1-1 em `tests/hr-m1-backend-core.test.mjs` chama `checkTwinParity()` e passou com falso positivo.

3. **Estresse Empírico da Regra de Poda Trabalhista (`pruneDatabase()`)**:
   - A função `pruneDatabase()` em `artifacts/api-server/demo-server.mjs` (linhas 8869-8994) implementa a blindagem preventiva de `HR_PROTECTED_COLLECTIONS` e a retenção de 5 anos (1825 dias) para `hrTimeRecords` (> 50.000 itens) e `hrPayroll` (> 10.000 itens).
   - Foi executado harness de teste empírico injetando volumes extraordinários:
     - 50.005 itens em `db.hrTimeRecords`, contendo registros com 1 ano (365 dias), 4 anos (1460 dias), 1824 dias, 1825 dias (borda exata), 1826 dias, 6 anos (2190 dias) e 8 anos (2920 dias).
     - 10.005 itens em `db.hrPayroll`, contendo competências recentes, 4 anos (< 1825 dias), 1824 dias, 1826 dias, 6 anos e 8 anos.
     - Volume normal (< 50.000 e < 10.000) contendo registros de 4, 6 e 10 anos.
   - **Resultado do Harness**:
     - Registros com 4 anos (1460 dias), 1824 dias e 1825 dias foram **100% preservados** após `pruneDatabase()`.
     - Registros com 1826 dias, 6 anos e 8 anos foram **corretamente descartados** apenas quando o volume excedeu os limites extraordinários.
     - Em volume normal (< 50.000 e < 10.000), **nenhum registro foi podado**, comprovando a imunidade contra `LIMITS`.
     - O harness executou 4 asserções com `pass 4, fail 0` (código de saída 0).

4. **Isolamento de Cris e Grazi & Schemas de RH**:
   - `artifacts/api-server/hr/employees.mjs` e `scripts/hr/employees.mjs`:
     - `isPrestadora` valida estritamente IDs (2, 3), usernames ("cris", "grazi"), telefones e contractType ("prestador").
     - `isCltEmployee` exclui prestadoras sumariamente.
     - `validateRecipientNotPrestador` lança erro crítico `[CRITICAL_SECURITY_VIOLATION]` caso uma rotina CLT seja acionada para prestadoras.
     - CRUD e rotas Express em `artifacts/api-server/hr/router.mjs` rejeitam criação com nome "Cris" ou "Grazi" com código 400 e retornam 404 em `GET /employees/:id` para IDs 2 e 3.

---

## 2. Logic Chain (Cadeia de Raciocínio)

1. A partir da **Observação 1**, o arquivo `scripts/demo-server.mjs` possui uma dependência estática não resolvida (`./microsoft-graph-service.mjs`) que impede completamente a sua execução em ambiente Node.js.
2. A partir da **Observação 2**, a suíte de verificação fornecida pelo worker (`scripts/check-twin-parity.mjs`) não é exaustiva, pois ignora serviços existentes em `artifacts/api-server/`, permitindo que código quebrado passe como "100% PASS".
3. A partir da **Observação 3**, a regra de poda em `pruneDatabase()` e a guarda de 5 anos (1825 dias) funcionam exatamente conforme o Art. 11 da CLT e a Portaria 671 MTP, garantindo que registros de 4 anos jamais sejam apagados.
4. A partir da **Observação 4**, os módulos de RH e o isolamento de Cris e Grazi foram modelados com rigor e funcionam perfeitamente.
5. Contudo, como o projeto estabelece que a arquitetura twin-server deve ser funcional e manter paridade estrita (Requisito R7 em `ORIGINAL_REQUEST.md` e `PROJECT.md`), a quebra de inicialização do servidor em `scripts/` constitui um impedimento bloqueante.
6. Portanto, o Marco M1 requer correção antes de ser aprovado.

---

## 3. Caveats (Ressalvas)

- Em `hrPayroll`, a comparação do corte de 5 anos é realizada via `fDate = String(f.referenceMonth || f.date || f.createdAt || "").split("T")[0]; return fDate >= cutoffDate5Years;`. Como `cutoffDate5Years` é uma string no formato `"YYYY-MM-DD"` (ex: `"2021-10-22"`) e `referenceMonth` normalmente é `"YYYY-MM"` (ex: `"2021-10"`), uma folha do mês de corte exato (ex: Outubro/2021) é lexicograficamente menor que `"2021-10-22"` (`"2021-10" < "2021-10-22"`), podendo ser podada alguns dias antes de completar 5 anos exatos caso não contenha o campo `date` ou `createdAt`. Recomenda-se normalizar para `fDate.length === 7 ? fDate + "-01" : fDate`. Registros de 4 anos (ex: `"2022-10"`), contudo, não são afetados e sobrevivem com segurança (`"2022-10" >= "2021-10-22"` é verdadeiro).
- Nenhuma alteração foi realizada em código fonte de produção pelo Challenger, em estrito cumprimento às restrições de revisão.

---

## 4. Conclusion (Conclusão)

**Veredito**: `REQUEST_CHANGES`

A lógica de banco, proteção de poda de 5 anos e isolamento de Cris e Grazi foi aprovada com louvor no estresse empírico. No entanto, o Marco M1 não pode ser aprovado devido a:
1. **Ausência de `scripts/microsoft-graph-service.mjs`**, fazendo com que `scripts/demo-server.mjs` falhe ao inicializar com erro fatal `ERR_MODULE_NOT_FOUND`.
2. **Falso positivo em `scripts/check-twin-parity.mjs`**, que precisa incluir o par `["artifacts/api-server/microsoft-graph-service.mjs", "scripts/microsoft-graph-service.mjs"]` em `rootPairs`.

**Ações Necessárias do Worker**:
1. Copiar `artifacts/api-server/microsoft-graph-service.mjs` para `scripts/microsoft-graph-service.mjs` (garantindo paridade SHA-256).
2. Adicionar `["artifacts/api-server/microsoft-graph-service.mjs", "scripts/microsoft-graph-service.mjs"]` à lista `rootPairs` em `scripts/check-twin-parity.mjs`.
3. Executar `node scripts/check-twin-parity.mjs` (agora com 30/30 arquivos) e validar que `node -c scripts/demo-server.mjs` e a importação do servidor executam com código 0.

---

## 5. Verification Method (Método de Verificação Independente)

Para reproduzir empiricamente os achados deste relatório:

1. **Reproduzir o Crash do Twin-Server `scripts/demo-server.mjs`**:
   ```powershell
   node -e "import('./scripts/demo-server.mjs').catch(err => { console.error('CRASH:', err.code, err.message); process.exit(1); })"
   ```
   *Resultado esperado atual*: Falha com código 1 e mensagem `ERR_MODULE_NOT_FOUND Cannot find module ... scripts/microsoft-graph-service.mjs`.
   *Critério de resolução*: Deve carregar sem lançar `ERR_MODULE_NOT_FOUND`.

2. **Verificar a Regra de Poda em `pruneDatabase()`**:
   Execute o seguinte comando de teste em memória:
   ```powershell
   node -e "
   const fs = require('fs');
   const assert = require('assert');
   const code = fs.readFileSync('artifacts/api-server/demo-server.mjs', 'utf8');
   const pruneMatch = code.match(/function pruneDatabase\(\) \{[\s\S]*?\n\}/m);
   const offsetMatch = code.match(/function getOffsetDateStr[\s\S]*?^}/m);
   const runner = new Function('db', 'const BRAZIL_DATE_FORMATTER = new Intl.DateTimeFormat(\"en-CA\", { timeZone: \"America/Sao_Paulo\", year: \"numeric\", month: \"2-digit\", day: \"2-digit\" }); function getEffectiveDate() { return new Date(); } function getTodayStr() { return BRAZIL_DATE_FORMATTER.format(getEffectiveDate()); } ' + offsetMatch[0] + ' ' + pruneMatch[0] + ' pruneDatabase(); return db;');
   const records = [{ id: 'rec_4y', date: '2022-10-22' }, { id: 'rec_6y', date: '2020-10-22' }];
   for (let i = 0; i < 50005; i++) records.push({ id: 'p_' + i, date: '2025-10-22' });
   const db = { hrTimeRecords: records };
   runner(db);
   assert.ok(db.hrTimeRecords.some(r => r.id === 'rec_4y'), 'Registro de 4 anos NÃO pode ser apagado');
   assert.ok(!db.hrTimeRecords.some(r => r.id === 'rec_6y'), 'Registro de 6 anos DEVE ser podado');
   console.log('PRUNE STRESS TEST: PASS');
   "
   ```
   *Critério de aprovação*: Imprime `PRUNE STRESS TEST: PASS` com código 0.

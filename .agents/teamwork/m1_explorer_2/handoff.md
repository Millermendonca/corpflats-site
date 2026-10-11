# Handoff Report — Milestone 1 Explorer 2
**Agent**: Milestone 1 Explorer 2 (Archetype: Explorer)
**Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m1_explorer_2`
**Project Root**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`
**Date**: 2026-10-11T01:46:00Z

---

## 1. Observation

### 1.1 SHA-256 Parity & Divergence
- **Arquivos `zapi-service.mjs`**:
  - `artifacts/api-server/zapi-service.mjs`: `SHA256: 301F4D859495BC0242EB7F3F050EB4C1BFE482B963D02BB166A5E86794C17007`
  - `scripts/zapi-service.mjs`: `SHA256: 301F4D859495BC0242EB7F3F050EB4C1BFE482B963D02BB166A5E86794C17007`
  - Status: **100% Idênticos**.
- **Arquivos `whatsapp-ai-service.mjs`**:
  - `artifacts/api-server/whatsapp-ai-service.mjs`: `SHA256: 6683557D7C735DEB3B23494EA41307BACFEBB33DF8252771274D4B24506653C8`
  - `scripts/whatsapp-ai-service.mjs`: `SHA256: 1DD69090F7FF3AC2E0F513432EB53909DCBD9FD5A4B32853458B5D16B3EE2991`
  - Status: **Divergentes**.
- **Comando de diff executado**:
  `git diff --no-index artifacts/api-server/whatsapp-ai-service.mjs scripts/whatsapp-ai-service.mjs`
  Resultado:
  ```diff
  diff --git a/artifacts/api-server/whatsapp-ai-service.mjs b/scripts/whatsapp-ai-service.mjs
  index e412459..c31bcca 100644
  --- a/artifacts/api-server/whatsapp-ai-service.mjs
  +++ b/scripts/whatsapp-ai-service.mjs
  @@ -9,7 +9,7 @@
   -import { cleanWhatsAppPhone, DEFAULT_TEST_ALLOWED_PHONES } from "./zapi-service.mjs";
   +import { cleanWhatsAppPhone } from "./zapi-service.mjs";
    import { getCheckinUrlSync as getSerproCheckinUrlSync } from "./fnrh-serpro-service.mjs";
   
  @@ -532,7 +532,8 @@ export async function processAiInboundMessage({
    
     // 2. Verifica se está em Modo de Teste
     if (db.zapiConfig?.testModeOnly === true) {
  -    const allowed = [...DEFAULT_TEST_ALLOWED_PHONES, ...String(db.zapiConfig.testAllowedPhones || "").split(/[,\s]+/)]
  +    const allowed = String(db.zapiConfig.testAllowedPhones || "")
  +      .split(/[,\s]+/)
         .map(p => cleanWhatsAppPhone(p))
         .filter(Boolean);
       const targetNorm = cleanWhatsAppPhone(cleanTarget);
  ```
- **Execução do Teste 10 de Integridade**:
  Comando:
  `node -e "const crypto = require('crypto'); const fs = require('fs'); const assert = require('assert'); const getHash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); assert.equal(getHash('artifacts/api-server/whatsapp-ai-service.mjs'), getHash('scripts/whatsapp-ai-service.mjs'));"`
  Resultado verbatim:
  `AssertionError [ERR_ASSERTION]: '6683557d7c735deb3b23494ea41307bacfebb33df8252771274d4b24506653c8' == '1dd69090f7ff3ac2e0f513432eb53909dcbd9fd5a4b32853458b5d16b3ee2991'`

### 1.2 Função `cleanWhatsAppPhone` e Whitelist
- Localizada em `scripts/zapi-service.mjs` e `artifacts/api-server/zapi-service.mjs` nas linhas 1069-1084:
  - Remove caracteres não-dígito;
  - Remove zeros à esquerda;
  - Adiciona prefixo `"55"` para números de 10 ou 11 dígitos;
- Constante `DEFAULT_TEST_ALLOWED_PHONES` em `zapi-service.mjs:1096-1099`:
  - Contém `"22998505276"`, `"5522998505276"`, `"21997142513"`, `"5521997142513"`;
- Matching de telefone no codebase: utiliza `.slice(-8)` e `.endsWith()` (ex: `zapi-service.mjs:3951`, `5284`, `6301`).

### 1.3 Estado de `data/database.json`
- `db.faqItems` é atualmente `undefined` no arquivo bruto.
- A função `ensureDbDefaults()` em `initWhatsAppEngine` (linha 4205 de `zapi-service.mjs`) atualmente inicializa `db.zapiConfig`, mas ainda não garante `db.faqItems = []`.

### 1.4 Estrutura de Rotas em `initWhatsAppEngine`
- Definida em `zapi-service.mjs:4201-6360`.
- Os endpoints de IA existentes terminam na linha 6359 com `POST /api/whatsapp/chat/:phone/ai-suggest`.
- A seção subsequente (linha 6362 em diante) contém o `setTimeout` de sincronização de webhooks e o `setInterval` de background runner.

---

## 2. Logic Chain

1. **Origem da Divergência SHA-256**:
   - `DEFAULT_TEST_ALLOWED_PHONES` foi exportado em `zapi-service.mjs:1096` para permitir que o desenvolvedor Miller Mendonça e telefones de teste homologados recebessem interações mesmo com o modo de teste ativo (`testModeOnly: true`).
   - `artifacts/api-server/whatsapp-ai-service.mjs` foi atualizado para importar e utilizar essa constante em suas linhas 12 e 535.
   - O arquivo espelho `scripts/whatsapp-ai-service.mjs` não recebeu esse commit, resultando na divergência observada no `git diff` e na falha de asserção estrita de hash.
   - **Inferência**: A versão em `artifacts/` é a mais recente e funcionalmente correta; `scripts/` deve ser atualizado para espelhá-la fielmente.

2. **Necessidade do `matchClientPhone`**:
   - No Brasil, os números celulares podem ser representados com 8 ou 9 dígitos no assinante, com ou sem DDI 55, com ou sem DDD, e no WhatsApp podem vir com JID `@c.us`.
   - Comparar apenas `slice(-8)` causa falso positivo se dois clientes em DDDs diferentes tiverem o mesmo número terminal (ex: DDD 21 vs DDD 22).
   - O design de `matchClientPhone` compara o sufixo de 8 dígitos E valida que, se ambos os números possuem DDD identificável, os DDDs devem coincidir. Se um dos números for apenas local (8 ou 9 dígitos sem DDD), a comparação de sufixo prevalece.
   - **Inferência**: Isso atende 100% dos requisitos de R4 e AC3 sem falso positivo.

3. **Arquitetura do Motor `isFaqApplicableToClient`**:
   - Conforme R4, se `scope === "all"` (ou omitido), a FAQ é universal (`true`).
   - Se `scope === "exclude"`, a FAQ só é aplicável se o cliente **não** estiver na lista `clientPhones`.
   - Se `scope === "include_only"`, a FAQ só é aplicável se o cliente estiver explicitamente na lista `clientPhones`.
   - Se `status` for especificado e diferente de `"ativo"`, a FAQ deve ser rejeitada imediatamente.
   - **Inferência**: O protótipo validou 13 casos de teste cobrindo todas as permutações e valores nulos/vazios com 100% de sucesso.

4. **Contrato e Ponto de Montagem dos Endpoints REST**:
   - `GET`, `POST`, `PUT`, `DELETE` em `/api/whatsapp/faq` e `POST /api/whatsapp/faq/:id/approve` devem ser registrados diretamente em `initWhatsAppEngine`.
   - `ensureDbDefaults()` deve garantir `db.faqItems = []` para evitar `TypeError: Cannot read properties of undefined` em bancos que ainda não foram migrados.
   - `POST .../approve` atende aos requisitos de 1-clique (R1 e R3), promovendo `suggestedAnswer` ou `body.answer` para `answer`, alterando status para `"ativo"` e carimbando `approvedAt`.

---

## 3. Caveats

1. **Escopo Read-Only do Explorer**:
   - Nenhuma modificação direta foi aplicada aos arquivos de código-fonte (`artifacts/`, `scripts/`, `data/`). As alterações foram preparadas como diffs concretos no relatório `analysis.md` para aplicação pelo Worker do Milestone 1.
2. **Populamento Inicial de Seeds**:
   - O seeding dos 9 itens de FAQ oficiais e perguntas pendentes em `data/database.json` é atribuição concorrente do Explorer 1 / Worker do Feature 1.
3. **Persistência PostgreSQL Replicada**:
   - O `saveDatabase()` salva atonicamente em disco e replica via `system_store` quando o servidor está rodando. O worker deve manter as chamadas de `saveDatabase()` nos 4 endpoints de mutação.
4. **Modo de Execução dos Testes Node.js**:
   - `tests/whatsapp-ai-agent.test.mjs` possui `after(() => process.exit(0))` na linha 329. Para evitar que os testes assíncronos sejam cancelados prematuramente pelo exit antes do término da asserção 10, o worker deve garantir que os testes assíncronos completem antes de invocar o exit do processo.

---

## 4. Conclusion

O design da camada de normalização de telefone, motor de regras de exceção por cliente e endpoints REST da Base de Conhecimento está concluído, testado por prototipagem e pronto para implementação pelo Worker no Milestone 1.

### Ações Imediatas para o Worker:
1. **Restaurar Paridade SHA-256**:
   - Atualizar `scripts/whatsapp-ai-service.mjs` com as linhas 12 e 534-540 de `artifacts/api-server/whatsapp-ai-service.mjs` (incluindo o re-export de `isFaqApplicableToClient` e `matchClientPhone`).
2. **Implementar em `zapi-service.mjs`** (em ambos os caminhos `artifacts/` e `scripts/`):
   - Adicionar `matchClientPhone` e `isFaqApplicableToClient` logo após `cleanWhatsAppPhone` (linha 1084);
   - Adicionar `if (!Array.isArray(db.faqItems)) db.faqItems = [];` em `ensureDbDefaults()` (linha 4208);
   - Adicionar os 5 endpoints REST do FAQ na linha 6360 de `initWhatsAppEngine`.
3. **Verificar Paridade SHA-256**:
   - Confirmar que `artifacts/api-server/zapi-service.mjs` e `scripts/zapi-service.mjs` continuam com SHA-256 100% idêntico.
   - Confirmar que `artifacts/api-server/whatsapp-ai-service.mjs` e `scripts/whatsapp-ai-service.mjs` possuem SHA-256 100% idêntico.

---

## 5. Verification Method

Para verificar de forma independente e automática as descobertas e recomendações deste relatório:

### V1. Verificação da Divergência e Paridade Atual
```powershell
node -e "const crypto = require('crypto'); const fs = require('fs'); const assert = require('assert'); const h1 = crypto.createHash('sha256').update(fs.readFileSync('artifacts/api-server/whatsapp-ai-service.mjs')).digest('hex'); const h2 = crypto.createHash('sha256').update(fs.readFileSync('scripts/whatsapp-ai-service.mjs')).digest('hex'); console.log('Divergência confirmada:', h1 !== h2);"
```
*Critério de Invalidação*: Se `h1 === h2`, a discrepância já teria sido resolvida externamente.

### V2. Verificação do Motor de Regras e Normalização (Suíte de Casos de Borda)
```powershell
node -e "const { matchClientPhone, isFaqApplicableToClient } = require('./.agents/teamwork/m1_explorer_2/analysis.md');" # Ou importar o protótipo contido na Seção 3.2 de analysis.md
```
Executar o script de teste unitário reproduzido na Seção 3.3 de `analysis.md`. Todos os 13 testes devem emitir `true`.

### V3. Verificação dos Endpoints REST após Aplicação pelo Worker
```powershell
node --test tests/whatsapp-ai-agent.test.mjs
```
O arquivo de teste deve rodar sem erros e a asserção de integridade 10 (SHA-256) deve passar com sucesso para todos os pares espelhados.

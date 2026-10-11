# Handoff Report: Infraestrutura de Testes, Casos de Teste e Estado Git
**Subagente**: Explorer Survey 3  
**Data**: 2026-10-11T01:32:30Z  
**Diretório de Trabalho**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_3`  
**Destinatário**: Orchestrator (`27c61f6a-5652-421c-bbda-1b5d6be7db98`)

---

## 1. Observation

1. **Framework e Comando de Testes**:
   - O projeto possui 43 arquivos em `tests/`, todos estruturados com ESM `.mjs` importando nativamente `node:test` e `node:assert/strict` (ou `node:assert`).
   - `package.json` raiz (`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\package.json`) define:
     ```json
     "scripts": {
       "build": "npm --prefix artifacts/limpeza run build",
       "postinstall": "npm --prefix artifacts/limpeza run build",
       "start": "node server.mjs"
     }
     ```
     Não há script `"test"`. O comando `npm test` falhou com:
     ```
     npm ERR! Missing script: "test"
     ```
   - O comando de execução direta de testes é `node --test <caminho-do-teste>`.

2. **Execução de `tests/whatsapp-ai-agent.test.mjs`**:
   - Comando executado: `node --test tests/whatsapp-ai-agent.test.mjs`.
   - Resultado: Código de saída `0`, duração de 983ms, 1 teste com subtestes passando.
   - Observou-se nas linhas 328-330 do arquivo:
     ```javascript
     after(() => {
       process.exit(0);
     });
     ```

3. **Descoberta de Desalinhamento SHA-256 e Falha Mascarada**:
   - No arquivo `tests/m2-messaging-checkin-url.test.mjs`, o teste de espelhamento falhou:
     ```
     not ok 3 - 100% byte-for-byte identical: artifacts/api-server/whatsapp-ai-service.mjs <==> scripts/whatsapp-ai-service.mjs
     AssertionError [ERR_ASSERTION]: 'SHA-256 mismatch for artifacts/api-server/whatsapp-ai-service.mjs vs scripts/whatsapp-ai-service.mjs'
     expected: '1dd69090f7ff3ac2e0f513432eb53909dcbd9fd5a4b32853458b5d16b3ee2991'
     actual: '6683557d7c735deb3b23494ea41307bacfebb33df8252771274d4b24506653c8'
     ```
   - O diff entre os dois arquivos via `git diff --no-index artifacts/api-server/whatsapp-ai-service.mjs scripts/whatsapp-ai-service.mjs` mostrou:
     ```diff
     --- a/artifacts/api-server/whatsapp-ai-service.mjs
     +++ b/scripts/whatsapp-ai-service.mjs
     @@ -12,1 +12,1 @@
     -import { cleanWhatsAppPhone, DEFAULT_TEST_ALLOWED_PHONES } from "./zapi-service.mjs";
     +import { cleanWhatsAppPhone } from "./zapi-service.mjs";
     @@ -535,1 +535,2 @@
     -const allowed = [...DEFAULT_TEST_ALLOWED_PHONES, ...String(db.zapiConfig.testAllowedPhones || "").split(/[,\s]+/)]
     +const allowed = String(db.zapiConfig.testAllowedPhones || "")
     +  .split(/[,\s]+/)
     ```
   - Em `tests/whatsapp-ai-agent.test.mjs`, o Teste 10 compara exatamente esses arquivos:
     ```javascript
     test("10. Integridade dos Arquivos Duplos Espelhados (SHA256)", async () => {
       const hashAiApi = getHash("artifacts/api-server/whatsapp-ai-service.mjs");
       const hashAiScript = getHash("scripts/whatsapp-ai-service.mjs");
       assert.equal(hashAiApi, hashAiScript, "whatsapp-ai-service.mjs deve ser idêntico em artifacts e scripts");
     });
     ```
     Porém, devido ao `process.exit(0)` síncrono no hook `after()`, o processo era finalizado antes da captura e reporte da rejeição assíncrona.

4. **Estado do Repositório Git e Diretrizes**:
   - `git status`: Branch `main`, sincronizada com `origin/main`.
   - `git remote -v`:
     `origin: https://github.com/Millermendonca/corpflats-site.git`
     `gitsafe-backup: git://gitsafe:5418/backup.git`
   - `git log -n 1`: Commit `ab9386d5f676059c6ab0af2c659cec7f93b76359` (`feat(m1): implement Bot Actions API, master switch and Tariff Engine with SEBRAE pricing`).
   - `AGENTS.md`: Exige `git push` obrigatório após qualquer commit e build do frontend (`npm run build` na pasta `artifacts/limpeza`) com arquivos de `dist/public` adicionados ao commit.

5. **Build do Frontend (`artifacts/limpeza`)**:
   - Comando executado: `npm run build` em `artifacts/limpeza`.
   - Resultado: Sucesso (código de saída `0`) em 47.09s, gerando `dist/public/index.html` (2.65 kB), `dist/public/assets/index.css` (380.67 kB) e `dist/public/assets/index.js` (3,172.70 kB).

6. **Estrutura Atual do Banco de Dados para FAQ**:
   - `grep_search` por `"faq"` e `"knowledgeBase"` em `data/database.json` retornou `No results found`.
   - A coleção `db.faqItems` ainda não existe no arquivo e deve ser inicializada na carga do banco (`loadDatabase` em `demo-server.mjs`).

---

## 2. Logic Chain

1. **Da observação 1 para o método de execução de testes**:
   Como não há script `"test"` no `package.json` raiz e todos os arquivos em `tests/` usam `import { test, describe } from "node:test"`, qualquer validação automatizada das mudanças de R2 a R5 deve ser acionada via `node --test tests/whatsapp-ai-agent.test.mjs`.

2. **Da observação 2 e 3 para a integridade de testes e espelhamento**:
   A falha no teste `m2-messaging-checkin-url.test.mjs` comprova que `artifacts/api-server/whatsapp-ai-service.mjs` e `scripts/whatsapp-ai-service.mjs` estão fora de sincronia. A presença de `process.exit(0)` no hook `after()` de `tests/whatsapp-ai-agent.test.mjs` mascara essa inconsistência, permitindo falsos positivos. Para garantir que novas falhas não sejam engolidas, o hook `after()` deve aguardar a conclusão de todos os testes ou unref'ar timers pendentes, e o time de implementação precisa sincronizar imediatamente ambos os arquivos.

3. **Das observações 3 e 4 para a governança de código de IA e Z-API**:
   O sistema de espelhamento duplo é estrito no projeto (arquivos em `artifacts/api-server/` e `scripts/` devem ser rigorosamente idênticos). Quaisquer modificações para R2-R5 em `whatsapp-ai-service.mjs`, `zapi-service.mjs` ou `demo-server.mjs` devem ser aplicadas em ambos os diretórios simultaneamente, sob pena de quebra de testes de integridade.

4. **Da observação 6 para os requisitos de persistência de R1/R5**:
   Como `db.faqItems` não existe atualmente no banco `database.json`, o backend precisa:
   - Inicializar `if (!Array.isArray(db.faqItems)) db.faqItems = getInitialFaqItems();` na inicialização do servidor (`loadDatabase`).
   - Carregar dinamicamente `db.faqItems` no motor da Sofia (`getWhatsAppAiConfig` e `generateAiWhatsAppResponse`).
   - Disponibilizar endpoints REST para CRUD, auto-aprendizado e aprovação.

5. **Das observações 1 a 6 para os critérios de aceitação e novos testes**:
   Para cumprir os critérios de aceitação de `ORIGINAL_REQUEST.md`:
   - Devem ser adicionados testes unitários e de integração específicos cobrindo R2 (detecção automática de dúvida não mapeada e inserção com status `"pendente"`), R3 (captura de resposta do operador com status `"aguardando_aprovacao"` e aprovação para `"ativo"`), R4 (motor de regras `scope: exclude` e `scope: include_only` com normalização de telefones) e R5 (pesquisa dinâmica heurística e montagem do prompt Gemini com FAQs do banco).

---

## 3. Caveats

1. **Ambiente Real da API Z-API e Gemini**: Em ambiente de teste unitário, chamadas à API Z-API e ao Google Gemini são mockadas (com `geminiApiKey: ""`). Testes com chamadas ativas à API externa do Gemini não foram executados em rede para não consumir cotas ou depender de credenciais externas.
2. **Dependência de Transbordo**: O fluxo de detecção de pergunta inédita (R2) depende de distinguir perguntas genuínas sem mapeamento de mensagens genéricas ou saudações. Os testes devem cobrir uma amostra diversificada de frases para evitar falsos positivos de auto-aprendizado.
3. **Outros Arquivos não rastreados**: Existem arquivos modificados em `.agents/teamwork/` relativos ao trabalho dos outros agentes da equipe. Nenhuma alteração de código de aplicação foi realizada neste survey (estrito modo read-only).

---

## 4. Conclusion

1. A infraestrutura de testes do projeto é baseada em `node:test` e está operacional, executando `tests/whatsapp-ai-agent.test.mjs` em menos de 1 segundo.
2. Existe um bug de sincronização ativo entre `artifacts/api-server/whatsapp-ai-service.mjs` e `scripts/whatsapp-ai-service.mjs`, o qual deve ser resolvido na primeira intervenção de implementação para manter o SHA-256 alinhado.
3. A suíte `tests/whatsapp-ai-agent.test.mjs` fornece o arcabouço ideal para expansão de cobertura para os requisitos R2 a R5, bastando injetar os novos casos de teste propostos na Seção 7 do `analysis.md`.
4. As regras de governança (`git push` automático, build de frontend em `artifacts/limpeza` com inclusão de `dist/public`, e manutenção do espelhamento de arquivos em `scripts/`) estão claras e validadas.

---

## 5. Verification Method

Para verificar de forma independente e empírica as conclusões deste relatório:

1. **Verificar Execução da Suíte Existente**:
   ```powershell
   node --test tests/whatsapp-ai-agent.test.mjs
   ```
   *Resultado esperado*: Sai com código 0 e reporta a execução dos testes unitários da IA.

2. **Verificar Desalinhamento SHA-256 Atual de `whatsapp-ai-service.mjs`**:
   ```powershell
   node --test tests/m2-messaging-checkin-url.test.mjs
   ```
   *Resultado esperado*: Falha no subteste `1.3 100% byte-for-byte identical: artifacts/api-server/whatsapp-ai-service.mjs <==> scripts/whatsapp-ai-service.mjs`.

3. **Verificar Build do Frontend**:
   ```powershell
   npm --prefix artifacts/limpeza run build
   ```
   *Resultado esperado*: Compila em ~45s com código 0 gerando arquivos em `artifacts/limpeza/dist/public/`.

4. **Verificar Status do Git**:
   ```powershell
   git status
   git remote -v
   ```
   *Resultado esperado*: Branch `main` rastreando `origin/main`.

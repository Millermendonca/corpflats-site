# Review Report: Milestone 1 (Backend Core & Database Layer)

**Reviewer**: `m1_reviewer_1` (Roles: Reviewer, Adversarial Critic)  
**Date**: 2026-10-11T02:22:00Z  
**Target Milestone**: Milestone 1 (Backend Core & Database Layer)  
**Project**: Guest-Flow-Manager (CorpFlats)  
**Verdict**: **`REQUEST_CHANGES`**

---

## 1. Review Summary

A implementação do **Milestone 1** realizada por `m1_worker` atinge alto padrão de completude funcional, fidelidade aos contratos de interface e robustez nos requisitos de persistência e regras de negócio:
- A coleção `db.faqItems` foi integrada e persistida de forma atômica (`atomicWriteFileSync`), com merge não-destrutivo em `reconcileUniversalIntegrity` e seeding inicial de 15 itens canônicos (cobrindo todos os 9 temas oficiais mandatórios, 2 pendentes, 2 para aprovação e 2 de regras de exceção).
- O motor de normalização telefônica (`matchClientPhone`) e regras de exceção (`isFaqApplicableToClient`) atende aos escopos `all`, `exclude` e `include_only`, prevenindo colisões entre DDDs distintos com mesmo sufixo terminal.
- Todos os 5 endpoints REST da base de FAQ (`GET`, `POST`, `PUT`, `DELETE` em `/api/whatsapp/faq` e `POST /api/whatsapp/faq/:id/approve`) foram implementados com conformidade aos contratos de rota e status HTTP.
- A paridade estrita byte-a-byte (SHA-256) entre os 3 pares espelhados (`artifacts/api-server/` e `scripts/`) foi 100% restabelecida.

**Contudo, foi detectado um defeito impeditivo (Critical Finding) no ciclo de testes obrigatório:**
A execução do comando mandatório `node --test tests/whatsapp-ai-agent.test.mjs` **trava indefinidamente e nunca encerra o processo Node.js** (hang no event loop). Embora os 15 testes individuais passem com sucesso em ~130ms, a importação no topo de `tests/whatsapp-ai-agent.test.mjs` a partir de `artifacts/api-server/demo-server.mjs` inicia o servidor Express na porta 5000 e inicializa intervalos/sockets de rede em background que impedem o encerramento natural do processo de teste. Isso inviabiliza pipelines automatizados de CI/CD.

Por este motivo estrito, o veredito emitido é **`REQUEST_CHANGES`**, solicitando a adição de gancho de encerramento (`after()`) no arquivo de testes.

---

## 2. Findings

### [Critical] Finding 1: Execução do runner de testes congela indefinidamente sem encerrar o processo Node.js
- **Onde**: `tests/whatsapp-ai-agent.test.mjs:16`
- **O que**: Ao rodar `node --test tests/whatsapp-ai-agent.test.mjs`, o processo nunca atinge o exit code 0 e permanece ativo indefinidamente (`Status: RUNNING`), travando runners de CI e terminais.
- **Por que acontece**: 
  Na linha 16 de `tests/whatsapp-ai-agent.test.mjs`, o worker incluiu:
  ```javascript
  import { getOfficialFaqSeed, seedInitialFaqItems, atomicWriteFileSync } from "../artifacts/api-server/demo-server.mjs";
  ```
  O arquivo `demo-server.mjs` possui código executável no nível superior (top-level):
  1. `const httpServer = app.listen(PORT, "0.0.0.0", ...);` (linha 30408) abrindo um socket servidor na porta 5000.
  2. Chamada incondicional `initWhatsAppEngine(...)` (linha 245112) que agenda timers de sincronização com a Z-API e mantém conexões TLS ativas.
  3. `setInterval(..., 300000)` (linha 30406) para a rotina matinal sem `.unref()`.
  
  Como `tests/whatsapp-ai-agent.test.mjs` não possui um hook `after()` com encerramento forçado do processo (ao contrário de `tests/future-reservation-email-rules.test.mjs:168`), o Node.js aguarda indefinidamente os sockets e timers abertos.
- **Sugestão de Correção**:
  Adicionar hook de limpeza no final de `tests/whatsapp-ai-agent.test.mjs`:
  ```javascript
  after(() => {
    setTimeout(() => { process.exit(0); }, 50);
  });
  ```
  *(Ou alternativamente proteger o `app.listen` de `demo-server.mjs` contra execução quando importado como módulo).*

---

### [Minor] Finding 2: Ausência de validação estrita de enum para `category` nos endpoints REST
- **Onde**: `artifacts/api-server/zapi-service.mjs:6463` e `6526` (e espelho `scripts/zapi-service.mjs`)
- **O que**: Em `POST /api/whatsapp/faq` e `PUT /api/whatsapp/faq/:id`, o campo `category` aceita qualquer string arbitrária sem validar se pertence aos 9 identificadores canônicos (`reservas`, `checkin_acesso`, `wifi_tecnologia`, `cafe_manha`, `garagem`, `estrutura_flat`, `regras_visitas_pets`, `lazer_condominio`, `checkout`).
- **Impacto**: Se um operador ou integração enviar uma categoria com grafia incorreta, ela será persistida e não aparecerá nas abas/cards filtrados do frontend no Milestone 3.
- **Sugestão de Correção**:
  Validar `ALLOWED_CATEGORIES.includes(category)` retornando erro 400 amigável caso seja fornecida uma categoria inválida.

---

### [Minor] Finding 3: Checagem defensiva de `status` em `isFaqApplicableToClient`
- **Onde**: `artifacts/api-server/zapi-service.mjs:1122`
- **O que**: A condição `if (faqItem.status && faqItem.status !== "ativo") return false;` permite que um item com `status` omitido (`undefined` ou `""`) seja tratado como ativo por padrão.
- **Impacto**: Baixo, visto que todos os itens seed possuem `status` preenchido.
- **Sugestão de Correção**:
  Garantir que apenas itens explicitamente marcados com `status === "ativo"` sejam considerados elegíveis:
  ```javascript
  if (faqItem.status !== "ativo") return false;
  ```

---

## 3. Verified Claims

| Reivindicação do Worker | Método de Verificação Independente | Resultado |
|---|---|---|
| Paridade SHA-256 entre `artifacts/api-server/whatsapp-ai-service.mjs` e `scripts/whatsapp-ai-service.mjs` | `crypto.createHash('sha256')` em ambos os arquivos | **CONFIRMADO** (Hash `f3e412e254a116b72791ef68f1c506333b0889783702a8dd10788e0d5ab4cab5`) |
| Paridade SHA-256 entre `artifacts/api-server/zapi-service.mjs` e `scripts/zapi-service.mjs` | `crypto.createHash('sha256')` em ambos os arquivos | **CONFIRMADO** (Hash `1484762e845996379a2a80676dc6a1debe3f7105ecc1be0bb2c349799516742a`) |
| Paridade SHA-256 entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` | `crypto.createHash('sha256')` em ambos os arquivos | **CONFIRMADO** (Hash `d3e69adb0c76aaa684a125988ac76fee653ff88961b8dc3b9ee8ea68ed00a5db`) |
| 15 testes de unidade passam em `tests/whatsapp-ai-agent.test.mjs` | Execução sob `node --test` e análise do log TAP | **CONFIRMADO** (15 pass, 0 fail), **MAS PROCESSO NÃO ENCERRA** |
| 7 testes passam em `tests/challenger-clearance-verification.test.mjs` | Execução síncrona `node --test` | **CONFIRMADO** (Passa com exit code 0 em ~7.5s) |
| 13 testes passam em `tests/challenger-m1-final-clearance-stress.test.mjs` | Execução síncrona `node --test` | **CONFIRMADO** (Passa com exit code 0 em ~11.9s) |
| Persistência e catálogo seed de 15 FAQs no banco `data/database.json` | Leitura e parsing de `data/database.json` | **CONFIRMADO** (15 itens presentes, todos os 9 temas oficiais validados) |
| Escrita atômica `atomicWriteFileSync` | Inspeção de código e execução de teste isolado | **CONFIRMADO** (Gravação em `.tmp_...` + `renameSync` + fallback Windows) |

---

## 4. Adversarial Challenge & Stress-Testing

### Desafio 1: Colisão de Telefones com DDDs Distintos (`matchClientPhone`)
- **Cenário**: Comparação de `(21) 99850-5276` (Rio de Janeiro) contra `(22) 99850-5276` (Campos dos Goytacazes), com mesmo terminal de 8 dígitos.
- **Comportamento Esperado**: Rejeição estrita (`false`).
- **Comportamento Observado**: `matchClientPhone` extrai os DDDs `21` e `22` e rejeita a correspondência (`false`). Teste aprovado.

### Desafio 2: Clientes Anônimos ou Sem Telefone em Escopos `exclude` e `include_only`
- **Cenário**: Hóspede enviando pergunta sem identificação de telefone (`clientPhone = null`).
- **Comportamento Esperado**:
  - Em `scope: "exclude"`: Resposta universal liberada (`true`).
  - Em `scope: "include_only"`: Resposta restrita bloqueada (`false`).
- **Comportamento Observado**: Implementação trata perfeitamente o valor nulo de acordo com a política de menor privilégio. Teste aprovado.

### Desafio 3: Concorrência e Gravação Atômica em Sistema de Arquivos Windows
- **Cenário**: Escrita concorrente ou bloqueio temporário de arquivo por antivírus / OneDrive durante o salvamento da base JSON.
- **Comportamento Esperado**: Tolerância a falhas sem corrupção do arquivo `data/database.json`.
- **Comportamento Observado**: `atomicWriteFileSync` isola a escrita em arquivo temporário único e executa substituição atômica via `renameSync`, com fallback defensivo para `copyFileSync` + `unlinkSync`. Teste aprovado.

### Desafio 4: Vazamento de Recursos / Conexões Abertas no Test Harness
- **Cenário**: Execução de suites de teste automatizadas em ambientes CI/CD com timeout estrito.
- **Comportamento Esperado**: Processo conclui a execução de todos os testes e finaliza o processo Node.js com exit code 0.
- **Comportamento Observado**: **FALHA**. O processo permanece em execução contínua aguardando handles de socket (`Socket`, `TLSSocket`) e timers associados ao `demo-server.mjs`.

---

## 5. Coverage Gaps

Nenhuma lacuna de cobertura identificada no escopo funcional do Milestone 1. Todos os componentes do backend e camada de dados foram devidamente contemplados.

---

## 6. Actionable Next Steps for Worker

Para obter aprovação imediata (`APPROVE`):
1. Abrir `tests/whatsapp-ai-agent.test.mjs`.
2. Adicionar o hook de encerramento gracioso ao final do bloco `describe`:
   ```javascript
   after(() => {
     setTimeout(() => { process.exit(0); }, 50);
   });
   ```
3. Executar `node --test tests/whatsapp-ai-agent.test.mjs` e garantir que o processo finalize imediatamente com exit code 0 sem intervenção manual.

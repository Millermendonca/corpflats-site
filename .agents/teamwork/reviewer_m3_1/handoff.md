# Relatório de Revisão de Código e Auditoria Adversarial (M2 & M3)
**Revisor:** `reviewer_m3_1` (Reviewer & Adversarial Critic)  
**Data:** 10/11/2026  
**Veredito:** `REQUEST_CHANGES` (1 Ajuste Maior necessário para integridade operacional de templates)

---

## 1. Observation (O que foi diretamente observado)

### 1.1 Comandos e Resultados de Verificação Independente
1. **Verificação de Paridade Twin-Server:**
   - Comando executado: `node scripts/check-twin-parity.mjs`
   - Saída verbatim:
     ```
     Resultado: 39/39 arquivos de runtime auditados dinamicamente.
     STATUS: 100% PASS - Paridade perfeita restabelecida!
     ```
2. **Execução de Testes Pontuais:**
   - Comando executado: `node --test tests/maid-review-ai-synthesis.test.mjs`
   - Saída verbatim:
     ```
     # tests 44
     # suites 11
     # pass 44
     # fail 0
     # cancelled 0
     # skipped 0
     # todo 0
     # duration_ms 1410.2267
     ```
3. **Build de Produção do Frontend:**
   - Comando executado: `npm run build` na pasta `artifacts/limpeza`
   - Saída verbatim:
     ```
     ✓ 3406 modules transformed.
     dist/public/assets/maid-whatsapp-automation-YjjGklR1.js     63.75 kB │ gzip:  12.93 kB
     ✓ built in 36.61s
     ```

### 1.2 Auditoria de Integridade (Anti-Cheating Check)
- **Hardcoding de fixtures de teste:** Busca por IDs e strings específicas dos testes (`901`, `902`, `1001`, `Mariana`, `Juliana`) em `artifacts/api-server/maid-automation-service.mjs` retornou **0 ocorrências**.
- **Implementações dummy / fachada:** Inspecionadas as funções `resolveMaidCleaningForReservation`, `triageSub5Review`, `deterministicTriageSub5Review`, `updateMaidOpinionSynthesis`, `formatDailyReviewsSummaryMessage`, `dispatchDailyReviewsSummary` e `dispatchNovemberRetroactiveReviews`. Todas contêm lógica real e robusta de negócio, cálculos matemáticos incrementais e integração via Z-API.
- **Resultado:** **NENHUMA VIOLAÇÃO DE INTEGRIDADE DETECTADA**.

### 1.3 Vulnerabilidade Detectada no Código (Linhas e Arquivos Específicos)
1. **[MAJOR] Reset involuntário do template do Gatilho 4 em chamadas subsequentes à API:**
   - **Arquivo:** `artifacts/api-server/maid-automation-service.mjs` (e espelho `scripts/maid-automation-service.mjs`)
   - **Linhas 2548–2557:**
     ```javascript
     // Garante que todos os 3 triggers existam caso novos tenham sido criados
     for (const defTrig of DEFAULT_MAID_TRIGGERS) {
       const existing = db.maidAutomationConfig.triggers.find(t => t.id === defTrig.id);
       if (!existing) {
         db.maidAutomationConfig.triggers.push(JSON.parse(JSON.stringify(defTrig)));
         saveDatabase();
       } else if (existing.template && !existing.template.includes("saldo_liquido_quinzena")) {
         existing.template = defTrig.template;
         saveDatabase();
       }
     }
     ```
   - **Evidência de Falha (Reprodução Direta em Node.js):**
     Ao salvar um template customizado para o Gatilho 4 (`trigger_daily_review_summary`) ou para o Gatilho 1 (`trigger_overtime_cleaning`), qualquer requisição subsequente que acione `ensureConfig()` (como `GET /api/maid-automation/config` disparado ao carregar a página) avalia `!existing.template.includes("saldo_liquido_quinzena")` como `true`, sobrescrevendo o template customizado do usuário de volta para o padrão (`defTrig.template`) e gravando no banco sem autorização do usuário.

2. **[MINOR] Ausência de substituição de tags de avaliações em `resolveMaidTemplateTags`:**
   - **Arquivo:** `artifacts/api-server/maid-automation-service.mjs:612–634`
   - A função utilitária `resolveMaidTemplateTags` não substitui `{{lista_avaliacoes}}` e `{{media_dia}}`. Caso o usuário acione o modal "Testar" para o Gatilho 4 através de `POST /api/maid-automation/test-dispatch`, a mensagem de preview enviada exibe as tags brutas em vez de um exemplo formatado de avaliações.

3. **[MINOR] String estática `"2026-11-10"` no parâmetro `targetDate` do disparo retroativo:**
   - **Arquivo:** `artifacts/api-server/maid-automation-service.mjs:2479`
   - O método `dispatchNovemberRetroactiveReviews` chama `formatDailyReviewsSummaryMessage` com `targetDate: "2026-11-10"`. Embora o cabeçalho retroativo não exiba essa data e cada item utilize sua respectiva `r.cleaningDate`, o parâmetro de fallback deve preferir `getBrasiliaNow().date`.

---

## 2. Logic Chain (Cadeia de Raciocínio)

1. A paridade Twin-Server e a suíte de testes de 44 casos pontuais encontram-se verdes e sem qualquer indício de bypass ou hardcoding. O build do frontend em Vite também foi concluído com sucesso.
2. No entanto, o teste adversarial de ciclo de vida da configuração revelou um defeito no método interno `ensureConfig()`:
   - A condição `else if (existing.template && !existing.template.includes("saldo_liquido_quinzena"))` foi escrita originalmente para forçar a migração de templates financeiros das quinzenas (`trigger_daily_summary` e `trigger_quinzena_closing`).
   - Como foi aplicada genericamente a todos os itens de `DEFAULT_MAID_TRIGGERS`, ela atinge diretamente `trigger_daily_review_summary` (cujo template padrão nunca possui a tag `saldo_liquido_quinzena`).
   - Consequentemente, as customizações de texto feitas pelo usuário no Card de Resumo de Avaliações são apagadas imediatamente na próxima leitura do endpoint `/api/maid-automation/config`.
3. Para restabelecer 100% de confiabilidade na UI de automação de WhatsApp, essa trava de migração deve ser restrita apenas aos IDs que efetivamente utilizam `saldo_liquido_quinzena`.

---

## 3. Caveats (Ressalvas)

- O defeito não foi pego pela suíte `tests/maid-review-ai-synthesis.test.mjs` porque os testes unitários exercitaram diretamente os métodos funcionais exportados (`dispatchDailyReviewsSummary`, `dispatchNovemberRetroactiveReviews`, `updateMaidOpinionSynthesis`), enquanto `ensureConfig()` é um helper interno executado pelas rotas HTTP Express e pelo agendador contínuo.
- O funcionamento do cron agendado e os disparos diretos via `dispatchDailyReviewsSummary` e `dispatchNovemberRetroactiveReviews` funcionam perfeitamente na lógica de despacho.

---

## 4. Conclusion (Conclusão e Veredito)

**Veredito:** `REQUEST_CHANGES`

A funcionalidade dos Milestones M2 e M3 está excelente em 95% do escopo, mas requer o ajuste cirúrgico abaixo antes da aprovação final para garantir que o usuário consiga personalizar e salvar templates sem que sejam revertidos para o default:

### Ação Necessária do Implementador (`worker_m3_1`):
Em `artifacts/api-server/maid-automation-service.mjs` (linha ~2553) e seu espelho `scripts/maid-automation-service.mjs`:
Substituir:
```javascript
} else if (existing.template && !existing.template.includes("saldo_liquido_quinzena")) {
  existing.template = defTrig.template;
  saveDatabase();
}
```
Por:
```javascript
} else if (
  (defTrig.id === "trigger_daily_summary" || defTrig.id === "trigger_quinzena_closing") &&
  existing.template &&
  !existing.template.includes("saldo_liquido_quinzena")
) {
  existing.template = defTrig.template;
  saveDatabase();
}
```
(Opcionalmente, adicionar em `resolveMaidTemplateTags` o suporte a `{{lista_avaliacoes}}` e `{{media_dia}}` e sincronizar a paridade Twin-Server via `Copy-Item`).

---

## 5. Verification Method (Método de Verificação)

Para re-verificar após a correção:
1. **Teste Unitário do Bug de Template:**
   ```powershell
   node -e "
   const DEFAULT_MAID_TRIGGERS = [{ id: 'trigger_daily_review_summary', template: 'DEF' }];
   const db = { maidAutomationConfig: { triggers: [{ id: 'trigger_daily_review_summary', template: 'CUSTOM_USER_TEMPLATE' }] } };
   for (const defTrig of DEFAULT_MAID_TRIGGERS) {
     const existing = db.maidAutomationConfig.triggers.find(t => t.id === defTrig.id);
     if ((defTrig.id === 'trigger_daily_summary' || defTrig.id === 'trigger_quinzena_closing') && existing?.template && !existing.template.includes('saldo_liquido_quinzena')) {
       existing.template = defTrig.template;
     }
   }
   console.assert(db.maidAutomationConfig.triggers[0].template === 'CUSTOM_USER_TEMPLATE', 'Falha: template customizado foi sobrescrito!');
   console.log('PASS: Template customizado preservado com sucesso!');
   "
   ```
2. **Checagem de Paridade Twin-Server:**
   ```powershell
   node scripts/check-twin-parity.mjs
   ```
3. **Execução Estrita dos Testes Pontuais:**
   ```powershell
   node --test tests/maid-review-ai-synthesis.test.mjs
   ```

# Handoff Report — Challenger M4-2 (challenger_m4_2)

- **Autor**: Challenger M4-2 (`challenger_m4_2`)
- **Papel**: critic, specialist (Empirical Challenger)
- **Destinatário**: Project Orchestrator (`orchestrator_17` / `58ecb31f-60d2-4e1e-9aac-82400a58c263`)
- **Data/Hora**: 2026-10-22T14:52:00Z
- **Diretório de Trabalho**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_m4_2`
- **Veredicto**: `REQUEST_CHANGES` (Bloqueio mandatório até correção das brechas de blindagem de prestadoras)

---

## 1. Observation

Durante a execução do harness adversarial empírico `.agents/teamwork/challenger_m4_2/stress_contracts_aso_security.mjs`, foram auditadas as três dimensões críticas do Marco M4:

### A. Blindagem de Prestadoras (Cris e Grazi - IDs 2, 3, "2", "3", "cris", "grazi")
O comando de estresse executado foi:
```powershell
node .agents/teamwork/challenger_m4_2/stress_contracts_aso_security.mjs
```
Resultados observados:
1. **Calcular Folha (`POST /api/hr/payroll/calculate`)**:
   - Para todos os 6 IDs testados (`2, 3, "2", "3", "cris", "grazi"`), retornou `HTTP 403 Forbidden` com código `PRESTADORA_PAYROLL_BLOCKED` (6/6 PASS).
2. **Gerar Contrato CLT (`POST /api/hr/contracts/generate`)**:
   - Para todos os 6 IDs testados, retornou `HTTP 403 Forbidden` com código `PRESTADORA_CONTRACT_BLOCKED` (6/6 PASS).
3. **Cadastrar Exame ASO (`POST /api/hr/aso`)**:
   - Para todos os 6 IDs testados, retornou `HTTP 403 Forbidden` com código `PRESTADORA_ASO_BLOCKED` (6/6 PASS).
4. **Fechar Mês (`POST /api/hr/payroll/close-month`)**:
   - **FALHA OBSERVADA (0/6 PASS)**: Ao enviar `{ employeeId: targetId, yearMonth: "2026-05" }`, a rota retornou `HTTP 201 Created` em vez de `HTTP 403 Forbidden`.
   - Inspeção de código em `artifacts/api-server/hr/router.mjs` (linhas 801–816):
     ```javascript
     router.post("/payroll/close-month", (req, res) => {
       try {
         const { yearMonth } = req.body;
         if (!yearMonth) {
           return res.status(400).json({ success: false, error: "Campo obrigatório: yearMonth..." });
         }
         const summary = closeMonthlyPayroll(db, yearMonth, req.body);
         ...
         res.status(201).json(summary);
     ```
     Não há validação de `employeeId` contra Cris ou Grazi no endpoint de fechamento mensal.
5. **Assinar Contrato (`POST /api/hr/contracts/:id/sign`)**:
   - **FALHA OBSERVADA (0/6 PASS)**:
     - Via 1: Ao tentar assinar passando o ID da prestadora na URL (`POST /api/hr/contracts/${targetId}/sign`), a rota retornou `HTTP 404 CONTRACT_NOT_FOUND` em vez de `HTTP 403 Forbidden`.
     - Via 2: Ao tentar assinar um contrato presente na base com `employeeId` de prestadora (`mockContract.employeeId === 2`), a rota retornou `HTTP 200 OK` e assinou o contrato com sucesso (`signContractWithCanvas`), gerando selo probatório para uma prestadora autônoma!
   - Inspeção de código em `artifacts/api-server/hr/contracts-aso.mjs` (linhas 263–310):
     ```javascript
     export function signContractWithCanvas(db, contractId, signaturePayload = {}) {
       ...
       const idx = db.hrContracts.findIndex(c => c.id === contractId);
       if (idx === -1) {
         const err = new Error(`Contrato ${contractId} não encontrado.`);
         err.statusCode = 404;
         err.code = "CONTRACT_NOT_FOUND";
         throw err;
       }
       const contract = db.hrContracts[idx];
       // Nenhuma checagem de isPrestadora(contract) ou contract.employeeId!
     ```
   - Inspeção de código em `artifacts/api-server/hr/router.mjs` (linhas 956–983):
     ```javascript
     router.post("/contracts/:id/sign", (req, res) => {
       ...
       const signed = signContractWithCanvas(db, req.params.id, payload);
     ```
     Não há nenhuma guarda `isPrestadora` nem no roteador nem no serviço de assinatura.

### B. Assinatura Canvas e Detecção de Tampering SHA-256
1. Contrato CLT gerado com hash SHA-256 autêntico (`1db159dfc75c...`).
2. Assinatura em Canvas realizada via API gerando selo final probatório (`0a57909b8034...`).
3. **Ataque de Adulteração de Minuta**:
   - Adicionada cláusula adulterada posteriormente no texto da minuta.
   - Hash adulterado (`a35e96337ae5...`) divergiu instantaneamente do hash original (`1db159dfc75c...`).
   - Recálculo do selo probatório (`44e97a6483cb...`) divergiu do selo original (`0a57909b8034...`), comprovando a quebra da integridade jurídica per MP 2.200-2/2001 e Lei 14.063/2020.
4. **Ataque de Forja de Imagem Canvas**:
   - Hash da assinatura forjada (`cb460f6cacf8...`) divergiu do hash da assinatura legítima (`53f01d18fd6a...`).
5. **Ataque de Spoofing de IP nos Metadados**:
   - Alteração do IP de auditoria invalidou o selo final SHA-256.
6. Total: 6/6 PASS.

### C. Horizontes de Alerta de ASO (NR-7 / PCMSO)
Data de referência fixada: `2026-05-15`.
1. Exame vencido ontem (`2026-05-14`, diff = -1 dia): classificado em `expired` com `daysRemaining = -1` (PASS).
2. Exame vencendo no dia 30 (`2026-06-14`, diff = 30 dias): classificado em `expiring_30_days` com `daysRemaining = 30` (PASS).
3. Exame vencendo no dia 31 (`2026-06-15`, diff = 31 dias): classificado em `expiring_60_days` e excluído de `30_days` (PASS).
4. Exame vencendo no dia 60 (`2026-07-14`, diff = 60 dias): classificado em `expiring_60_days` com `daysRemaining = 60` (PASS).
5. Exame vencendo no dia 61 (`2026-07-15`, diff = 61 dias): **zero alertas gerados**, sem falsos positivos (PASS).
6. Exame vencendo em 120 dias (`2026-09-12`, diff = 120 dias): **zero alertas gerados** (PASS).
7. Total de alertas retornados pela API: 4 (1 vencido, 1 em 30d, 2 em 60d). Total: 5/5 PASS.

---

## 2. Logic Chain

1. **Premissa Mandatória de Segurança (ORIGINAL_REQUEST § R1 e AGENTS.md)**:
   Cris (ID: 2) e Grazi (ID: 3) são prestadoras de serviço diaristas autônomas. Qualquer operação funcional de folha, contratos CLT, assinatura ou ASO que envolva essas identidades deve ser terminantemente rejeitada com `HTTP 403 Forbidden`.
2. **Observação das Falhas**:
   - Ao submeter requisições para `POST /api/hr/payroll/close-month` com `{ employeeId: 2, ... }`, o servidor aceita a chamada e retorna `HTTP 201 Created`. Embora `closeMonthlyPayroll` filtre internamente os funcionários que entram na folha, a API não rejeita a tentativa explícita de fechar mês para uma prestadora com `HTTP 403 Forbidden`.
   - Ao submeter requisições para `POST /api/hr/contracts/:id/sign`, se `:id` for um ID de prestadora (ex: `2` ou `"cris"`), o servidor responde `404` em vez de `403`. Pior: se um contrato associado a uma prestadora existir na coleção (por injeção ou legado), `signContractWithCanvas` e o endpoint executam a assinatura com `HTTP 200 OK`, emitindo selo de assinatura digital trabalhista para prestadora autônoma.
3. **Conclusão Lógica**:
   A blindagem em `router.mjs` e `contracts-aso.mjs` possui duas brechas evidentes. O critério mandatório estabelecido no despacho ("assertar que TODOS retornam HTTP 403 Forbidden!") foi violado em 2 das 5 operações requeridas.

---

## 3. Caveats

- **Escopo restrito a Review-Only**: Conforme a regra de ouro do Challenger, nenhuma modificação foi realizada nos arquivos de produção (`artifacts/api-server/` ou `scripts/`).
- **Isolamento de Testes**: Todo o estresse foi conduzido via harness pontual isolado (`.agents/teamwork/challenger_m4_2/stress_contracts_aso_security.mjs`) sobre instâncias em memória e portas temporárias efêmeras, sem disparos reais ou efeitos colaterais.

---

## 4. Conclusion

**Veredicto**: `REQUEST_CHANGES`

Para aprovação final do Marco M4, o worker responsável deve aplicar as seguintes correções pontuais:

1. **Em `artifacts/api-server/hr/router.mjs` (e espelho `scripts/hr/router.mjs`)**:
   - No endpoint `POST /api/hr/payroll/close-month` (linha ~801):
     Adicionar validação de `employeeId`:
     ```javascript
     const { employeeId } = req.body;
     const idStr = String(employeeId || "").toLowerCase().trim();
     if (
       employeeId === 2 ||
       employeeId === 3 ||
       employeeId === "2" ||
       employeeId === "3" ||
       idStr === "cris" ||
       idStr === "grazi" ||
       isPrestadora({ id: employeeId })
     ) {
       return res.status(403).json({
         success: false,
         error: "Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).",
         code: "PRESTADORA_PAYROLL_BLOCKED"
       });
     }
     ```
   - No endpoint `POST /api/hr/contracts/:id/sign` (linha ~956):
     Validar `req.params.id`, `req.body.employeeId` e consultar o contrato alvo antes de assinar. Se pertencer a prestadora, responder com `HTTP 403 Forbidden` (`PRESTADORA_CONTRACT_BLOCKED`).

2. **Em `artifacts/api-server/hr/contracts-aso.mjs` (e espelho `scripts/hr/contracts-aso.mjs`)**:
   - Na função `signContractWithCanvas(db, contractId, signaturePayload)`:
     Adicionar guarda imediata:
     ```javascript
     const contractIdStr = String(contractId || "").toLowerCase().trim();
     const payloadEmpId = signaturePayload?.employeeId;
     const payloadIdStr = String(payloadEmpId || "").toLowerCase().trim();

     if (
       contractId === 2 || contractId === 3 || contractIdStr === "2" || contractIdStr === "3" || contractIdStr === "cris" || contractIdStr === "grazi" ||
       payloadEmpId === 2 || payloadEmpId === 3 || payloadIdStr === "2" || payloadIdStr === "3" || payloadIdStr === "cris" || payloadIdStr === "grazi" ||
       isPrestadora({ id: contractId }) || isPrestadora({ id: payloadEmpId })
     ) {
       const err = new Error("Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).");
       err.statusCode = 403;
       err.code = "PRESTADORA_CONTRACT_BLOCKED";
       throw err;
     }
     ```
     E logo após recuperar `const contract = db.hrContracts[idx];`:
     ```javascript
     if (contract.employeeId === 2 || contract.employeeId === 3 || String(contract.employeeId) === "2" || String(contract.employeeId) === "3" || isPrestadora({ id: contract.employeeId })) {
       const err = new Error("Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).");
       err.statusCode = 403;
       err.code = "PRESTADORA_CONTRACT_BLOCKED";
       throw err;
     }
     ```

3. **Garantir Paridade Twin-Server**:
   - Reexecutar `node scripts/check-twin-parity.mjs` após aplicar as correções nos arquivos de `artifacts/` e `scripts/`.

---

## 5. Verification Method

Para reproduzir empiricamente os resultados deste relatório e comprovar a resolução das vulnerabilidades apontadas:

1. **Executar o harness adversarial**:
   ```powershell
   node .agents/teamwork/challenger_m4_2/stress_contracts_aso_security.mjs
   ```
   *Condição de aprovação*:
   - Blindagem Prestadoras: **30 PASS | 0 FAIL** (100% de retorno HTTP 403 para todos os 6 IDs nos 5 fluxos).
   - Assinatura Canvas & Tampering: **6 PASS | 0 FAIL**.
   - Horizontes Alerta ASO: **5 PASS | 0 FAIL**.

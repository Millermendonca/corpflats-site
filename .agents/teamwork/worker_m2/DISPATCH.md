## 2026-10-22T11:18:52Z
Você é o Worker M2 (worker_m2) responsável pela implementação do Marco M2 (Ponto Eletrônico Mobile & Motor de Conformidade em 3 Níveis).
Seu diretório de trabalho exclusivo é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2`
A raiz do projeto é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`

MANDATÓRIO:
1. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`.
2. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_17\PROJECT.md`.
3. Leia os relatórios dos 3 Explorers de M2:
   - `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m2_timekeeping\handoff.md`
   - `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m2_compliance\handoff.md`
   - `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m2_test_design\handoff.md`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

PROPRIEDADE EXCLUSIVA DE ESCRITA:
- `artifacts/api-server/hr/timekeeping.mjs` e `scripts/hr/timekeeping.mjs`
- `artifacts/api-server/hr/compliance.mjs` e `scripts/hr/compliance.mjs`
- `artifacts/api-server/hr/router.mjs` e `scripts/hr/router.mjs`
- `artifacts/api-server/hr/index.mjs` e `scripts/hr/index.mjs`
- `tests/hr-m2-timekeeping-compliance.test.mjs`
- `.agents/teamwork/worker_m2/*`

SUA MISSÃO DE IMPLEMENTAÇÃO:
1. **Implementar `artifacts/api-server/hr/timekeeping.mjs` e espelhar identicamente em `scripts/hr/timekeeping.mjs`**:
   - Ciclo de 6 batidas diárias (`entrada`, `almoco_saida`, `almoco_retorno`, `saida`, `pausa_saida`, `pausa_retorno`).
   - NSR incremental (+1 por batida) persistido em `db.hrSettings.lastNsr` ou calculado sobre `db.hrTimeRecords`.
   - `calculateDistanceHaversine(lat1, lon1, lat2, lon2)` (distância em metros usando R = 6.371.000m) e verificação contra o Soho Residence (`-21.7584`, `-41.3262`, raio padrão 150m em `db.hrSettings.geofence.radiusMeters`).
   - `validateAndHashSelfie(selfieBase64)` calculando hash SHA-256 de 64 caracteres.
   - `checkDeviceWhitelist(db, deviceId)` respeitando o toggle `db.hrSettings.deviceWhitelist.enabled`.
   - Funções: `registerPunch(db, payload, source)`, `getTimeRecords(db, query)`, `getDailySheet(db, date)`, `getMonthlyMirror(db, employeeId, yearMonth)`, `adjustTimeRecord(db, recordId, payload)`.
   - Gestão de dispositivos: `getWhitelistedDevices`, `authorizeDevice`, `updateDeviceSettings`, `removeDevice`.
   - BLINDAGEM ESTRITA DE CRIS E GRAZI: Rejeitar sumariamente com HTTP 403 Forbidden qualquer tentativa de bater ponto ou consultar espelho para `id: 2`, `id: 3` ou qualquer colaborador que seja prestador (`isPrestadora`).
2. **Implementar `artifacts/api-server/hr/compliance.mjs` e espelhar identicamente em `scripts/hr/compliance.mjs`**:
   - Catálogo das 10 regras:
     1. `intrajornada_minima`
     2. `interjornada_minima`
     3. `limite_horas_extras`
     4. `maximo_dias_consecutivos`
     5. `tolerancia_art58`
     6. `geofence_violada`
     7. `aparelho_nao_autorizado`
     8. `selfie_ausente_ou_invalida`
     9. `trabalho_em_dsr`
     10. `trabalho_em_ferias_ou_afastamento`
   - Motor em 3 níveis:
     * `alert`: permite com aviso gravado em `warnings`.
     * `admin_override`: bloqueia a menos que fornecido `{ adminOverride: { adminPassword, justification } }` com senha válida de admin (`db.users` role admin ou `admin123`) e justificativa substantiva. Registra imutavelmente em `db.hrComplianceAudits`.
     * `hard_block`: bloqueio irrestrito HTTP 400 Bad Request, sem aceitar override.
   - Funções: `getComplianceRules(db)`, `updateComplianceRule(db, ruleId, updateData)`, `validatePunchCompliance(db, employee, punchPayload, context)`, `getComplianceAudits(db, query)`.
3. **Atualizar `artifacts/api-server/hr/router.mjs` e `index.mjs` (e seus espelhos em `scripts/hr/`)**:
   - Conectar os novos endpoints sob `/api/hr`:
     * `POST /punch`
     * `GET /timekeeping/records`
     * `GET /timekeeping/daily-sheet`
     * `GET /timekeeping/monthly-mirror/:employeeId`
     * `POST /timekeeping/records/:id/adjust`
     * `GET /devices`, `POST /devices/authorize`, `PATCH /devices/settings`, `DELETE /devices/:deviceId`
     * `GET /compliance/rules`, `PATCH /compliance/rules/:ruleId`, `POST /compliance/validate`, `GET /compliance/audits`
   - Exportar as novas funções em `index.mjs` e inicializar as novas coleções em `ensureHrCollections`.
4. **Criar a Suíte de Testes `tests/hr-m2-timekeeping-compliance.test.mjs`**:
   - Aplicar o código completo especificado no handoff do `explorer_m2_test_design`.
   - Executar: `node --test tests/hr-m2-timekeeping-compliance.test.mjs` e assegurar que TODOS os 8 testes passam (8/8 PASS).
   - Executar: `node scripts/check-twin-parity.mjs` e assegurar que 100% dos arquivos mantêm SHA-256 match.
   - LEMBRE-SE: NUNCA rodar testes globais `tests/*.test.mjs`.

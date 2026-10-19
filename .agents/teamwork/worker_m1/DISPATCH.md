# Task Assignment: Worker M1 (Backend Auth, Roles & Dev Endpoints)

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Authoritative References
- ORIGINAL_REQUEST.md: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (read section `## 2026-10-19T02:58:52Z`)
- PROJECT.md: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_13\PROJECT.md`
- Explorer Auth Report: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_auth_roles\analysis.md`
- Explorer Auth Handoff: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_auth_roles\handoff.md`

## Exclusively Owned Files
- `artifacts/api-server/demo-server.mjs`
- `scripts/demo-server.mjs`

## Scope of Work
1. Implement `ensureSystemUsers(db)` in `artifacts/api-server/demo-server.mjs`:
   - Inspect existing users in `db.users`.
   - Update user `"admin"` to `role: "dev"` (preserving password).
   - Create new user `"gestor"` if not present: `username: "gestor"`, `name: "Administração CorpFlats"`, `role: "admin"`, initial password `"admin123"`.
   - Update `defaultUsers` declaration in the file to reflect `"admin"` as `role: "dev"` and `"gestor"` as `role: "admin"`.
2. Update operational endpoints:
   - Accept `role === "admin" || role === "dev"` for all operational management (reservations, cleaning, inventory, rates, tariffs, finance, PMS, WBP vault reauth, user management `/api/admin/users*`).
   - Allow `role === "dev"` in user creation and editing.
   - Accept both `PATCH` and `POST` in `/api/admin/users/:id/reset-password`.
3. Restrict technical dev-only endpoints strictly to `role === "dev"`:
   - `/api/admin/server-monitor/*`, `/api/audit-logs`, `/api/storage/config`, `/api/integrations/microsoft-graph/*`, `/api/settings/gemini`, `/api/settings/email`, `/api/whatsapp/config`, `/api/reservations/clear-all`.
4. Ensure exact SHA-256 parity between `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`.
5. Run a pinpoint verification test confirming:
   - `ensureSystemUsers` works correctly.
   - `admin` (role `dev`) accesses operational + dev endpoints.
   - `gestor` (role `admin`) accesses operational endpoints and receives 403 on dev-only endpoints.
   - Do NOT run batch sweeps (`tests/*.test.mjs`).
6. Report results in `handoff.md`.

## 2026-10-19T03:21:22Z
Você é o subagente worker_m1 (TypeName: teamwork_preview_worker).
Seu diretório de trabalho é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1`
A raiz do projeto é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`

Execute a implementação dos requisitos de backend do Milestone 1:
1. `artifacts/api-server/demo-server.mjs`:
   - `ensureSystemUsers(db)` para migrar `"admin"` para `role: "dev"` e criar `"gestor"` com `role: "admin"` e senha `"admin123"`.
   - Atualizar checagens de permissão operacional para `role === "admin" || role === "dev"`.
   - Proteger endpoints técnicos estritamente com `role === "dev"`.
   - Permitir `role === "dev"` em `/api/admin/users` e suportar tanto `PATCH` quanto `POST` em `/api/admin/users/:id/reset-password`.
2. Sincronizar byte a byte `scripts/demo-server.mjs` com `artifacts/api-server/demo-server.mjs` garantindo o mesmo hash SHA-256.
3. Executar teste pontual de verificação (sem rodar suítes completas em lote, respeitando AGENTS.md).
4. Gerar relatório de entrega em `handoff.md` e enviar mensagem via `send_message` ao Project Orchestrator (c4864abd-776b-4ad1-aef9-25c7af7463df).

## 2026-10-19T04:25:31Z
[AVISO DE ESCOPO M1]
Atenção `worker_m1`: conforme seu `DISPATCH.md`, seus arquivos exclusivos no Milestone 1 são APENAS:
- `artifacts/api-server/demo-server.mjs`
- `scripts/demo-server.mjs`
- `tests/auth-roles-permissions.test.mjs`

NÃO edite arquivos do frontend (`artifacts/limpeza/src/*`), pois eles pertencem exclusivamente aos workers dos Milestones M2 e M3.
Como você já concluiu as edições em `artifacts/api-server/demo-server.mjs`, prossiga IMEDIATAMENTE para:
1. Copiar `artifacts/api-server/demo-server.mjs` para `scripts/demo-server.mjs` e verificar paridade SHA-256.
2. Criar e rodar o teste pontual `tests/auth-roles-permissions.test.mjs`.
3. Atualizar `handoff.md` e enviar `send_message` para o Project Orchestrator (`c4864abd-776b-4ad1-aef9-25c7af7463df`).

## 2026-10-19T04:41:07Z
**Context**: Verificação de execução do teste pontual tests/auth-roles-permissions.test.mjs.
**Content**: Seu comando de teste `node --test tests/auth-roles-permissions.test.mjs` encontrou um erro no hook (`TypeError: Cannot read properties of undefined (reading 'role')` na linha 123) e o processo node filho do demo-server manteve o test runner aberto sem finalizar. Verifique o log em `task-763.log`, encerre quaisquer processos node órfãos na porta de teste se necessário (`taskkill /F /IM node.exe` com cuidado ou mate o pid específico), ajuste o teste (ou use `--test-force-exit` / garanta que o child server finalize no `after`) e conclua seu `handoff.md`.
**Action**: Corrija o teste pontual, garanta finalização limpa e entregue seu handoff.md com `send_message`.

## 2026-10-19T05:11:40Z
**Context**: Remediação da paridade SHA-256 e Build Integrado Final.
**Content**: Conforme demonstrado pelo `explorer_m1_remediation`, `scripts/demo-server.mjs` é o superset canônico completo.
Execute imediatamente:
1. `Copy-Item -Path "scripts/demo-server.mjs" -Destination "artifacts/api-server/demo-server.mjs" -Force`
2. `Get-FileHash "artifacts/api-server/demo-server.mjs", "scripts/demo-server.mjs" -Algorithm SHA256` e confirme hash idêntico.
3. `node --test tests/auth-roles-permissions.test.mjs` e confirme que os 6 testes passam com código 0.
4. `npm --prefix artifacts/limpeza run build` e confirme compilação com código 0 gerando os artefatos em `dist/`.
5. `git add -A ; git commit -m "fix(sync): synchronize demo-server twin files and update build dist" ; git push origin main`.
**Action**: Execute todos os passos acima, atualize seu handoff.md e envie mensagem de conclusão.

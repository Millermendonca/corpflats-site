# Handoff Report: Milestone 1 — Backend Auth, Roles & Dev Endpoints

**Agent**: `reviewer_m1_1` (teamwork_preview_reviewer)  
**Roles**: Reviewer, Critic  
**Date**: 2026-10-19  
**Working Directory**: `.agents/teamwork/reviewer_m1_1/`  
**Recipient**: Project Orchestrator (`c4864abd-776b-4ad1-aef9-25c7af7463df`)  

---

## Review Summary

**Verdict**: **REQUEST_CHANGES**

A implementação dos requisitos funcionais do Milestone 1 (migração `ensureSystemUsers`, proteção `requireDevAuth`, expansão operacional `admin || dev` e gestão de usuários `/api/admin/users` com `PATCH`/`POST` em reset de senha) está conceitualmente e funcionalmente correta e passou em todos os 5 subtestes de integração HTTP. No entanto, **a paridade estrita SHA-256 entre os servidores gêmeos está violada no branch `main`**: o commit `035c16e` alterou 247 linhas em `scripts/demo-server.mjs` sem espelhá-las em `artifacts/api-server/demo-server.mjs`, fazendo o subteste 1 de `tests/auth-roles-permissions.test.mjs` falhar com código de saída 1.

---

## 1. Observation

1. **Desparidade SHA-256 dos Arquivos Gêmeos**:
   Comando executado:
   ```powershell
   Get-FileHash 'artifacts/api-server/demo-server.mjs', 'scripts/demo-server.mjs' -Algorithm SHA256 | Format-List
   ```
   Resultado observado:
   ```text
   Algorithm : SHA256
   Hash      : D9A25D2F78E89E9B38869AF6DCA00CEEBABDDA67EBB079B55AF319B899C05B29
   Path      : C:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\artifacts\api-server\demo-server.mjs

   Algorithm : SHA256
   Hash      : 33C17537913A1F3B5509489C387106B8A0FFDBB959FDDD3A9B0DF578E310D9DA
   Path      : C:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\scripts\demo-server.mjs
   ```

2. **Causa Raiz da Desparidade (Commit `035c16e`)**:
   `git show --stat 035c16e`:
   ```text
   commit 035c16e1b22260960f8f9f7d29b50ed6397e972e
   Author: Millermendonca <miller.mendonca16@gmail.com>
   Date:   Mon Oct 19 01:54:10 2026 -0300

       fix(payments): prioritize credit card / mpPaymentId over pre-generated pixTxId in receipts and portal

    scripts/demo-server.mjs | 247 +++++++++++++++------
   ```
   O commit `035c16e` alterou linhas 37600–38400 de `scripts/demo-server.mjs` (tratamento de pagamentos com cartão Mercado Pago) mas NÃO tocou `artifacts/api-server/demo-server.mjs`.

3. **Falha na Execução do Teste Pontual de M1**:
   Comando executado:
   ```bash
   node --test tests/auth-roles-permissions.test.mjs
   ```
   Resultado observado:
   ```text
   TAP version 13
   # Subtest: Milestone 1 — Auth, Roles & RBAC Separation Suite
       # Subtest: File Parity: artifacts/api-server/demo-server.mjs and scripts/demo-server.mjs must have identical SHA-256
       not ok 1 - File Parity: artifacts/api-server/demo-server.mjs and scripts/demo-server.mjs must have identical SHA-256
         ---
         duration_ms: 26.1238
         location: 'file:///C:/Users/mille/OneDrive/Hotel/Documentos%20h%C3%B3spedes/Guest-Flow-Manager/tests/auth-roles-permissions.test.mjs:35:3'
         failureType: 'testCodeFailure'
         error: 'demo-server twin files must have matching SHA-256 hashes'
         code: 'ERR_ASSERTION'
         expected: '33c17537913a1f3b5509489c387106b8a0ffdbb959fddd3a9b0df578e310d9da'
         actual: 'd9a25d2f78e89e9b38869af6dca00ceebabdda67ebb079b55af319b899c05b29'
         operator: 'strictEqual'
         ...
       # Subtest: HTTP Integration & RBAC Tests
           ok 1 - ensureSystemUsers migrated database: admin is dev, gestor is created as admin
           ok 2 - /api/auth/me returns 'dev' for admin and 'admin' for gestor
           ok 3 - Operational Endpoints: both dev and admin can access business routes
           ok 4 - Technical Endpoints: dev gets 200, gestor (admin) gets 403 Forbidden
           ok 5 - User Management: password reset supports PATCH and POST; admin cannot alter dev accounts
           1..5
       ok 2 - HTTP Integration & RBAC Tests
         ---
         duration_ms: 5891.5198
         type: 'suite'
         ...
       1..2
   not ok 1 - Milestone 1 — Auth, Roles & RBAC Separation Suite
   # tests 6
   # suites 2
   # pass 5
   # fail 1
   # duration_ms 6236.2855
   ```

4. **Verificação de `ensureSystemUsers` (`artifacts/api-server/demo-server.mjs:740-813`)**:
   - Linhas 750-764: Localiza `admin`, preserva o `passwordHash` e atualiza `role = "dev"`. Se ausente, cria com `id: 1, role: "dev"`.
   - Linhas 767-791: Localiza ou cria `gestor` (`role: "admin"`, `name: "Administração CorpFlats"`, senha `"admin123"`).
   - Linhas 5648, 5864 e 8728: Executado no `loadDatabase()` e no startup com persistência imediata atômica via `saveDatabase("manual_migrate_system_users_dev_and_gestor")`.

5. **Verificação de `requireDevAuth` (`artifacts/api-server/demo-server.mjs:8693-8723`)**:
   - Bloqueia com HTTP 403 qualquer usuário onde `!user || user.role !== "dev"`.
   - Montado na raiz de 19 endpoints técnicos (`/api/whatsapp/config`, `/api/settings/gemini`, `/api/storage/config`, `/api/admin/server-monitor`, etc.).
   - Rotas operacionais aceitam `admin || dev`.

6. **Verificação de `/api/admin/users` (`artifacts/api-server/demo-server.mjs:9794-9954`)**:
   - `GET /api/admin/users`: sanitiza e omite `passwordHash`.
   - `POST /api/admin/users`: proíbe admin de cadastrar `dev` (linha 9825: 403 Forbidden).
   - `PATCH /api/admin/users/:id`: proíbe admin de alterar conta `dev` ou promover para `dev` (linhas 9868 e 9881: 403 Forbidden).
   - `PATCH` e `POST` `/api/admin/users/:id/reset-password`: ambos suportados via `handleResetPassword` (linhas 9937-9938), proibindo admin de alterar senha de `dev`.
   - `DELETE /api/admin/users/:id`: proíbe exclusão do próprio usuário e exclusão de conta `dev` por admin.

---

## 2. Logic Chain

1. O projeto `Guest-Flow-Manager` estabelece em `AGENTS.md` e em `PROJECT.md` a regra inegociável de paridade estrita byte a byte (SHA-256) entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`.
2. O subteste 1 de `tests/auth-roles-permissions.test.mjs` executa uma checagem criptográfica comparando `hashA` e `hashB`.
3. Embora o commit `a2717eb` do Worker M1 estivesse com paridade idêntica (`D9A25D2F...`), o commit subsequente `035c16e` alterou 247 linhas em `scripts/demo-server.mjs` sem atualizar `artifacts/api-server/demo-server.mjs`.
4. Em consequência, o teste pontual `node --test tests/auth-roles-permissions.test.mjs` falhou com erro de asserção no subteste 1 e código de saída 1.
5. Por restrição mandatória do papel de Reviewer ("Review-only — do NOT modify implementation code"), o reviewer não pode corrigir os arquivos de código diretamente.
6. Portanto, a emissão do veredito **REQUEST_CHANGES** é mandatória até que a sincronização entre os arquivos gêmeos seja restabelecida e todos os testes passem com 100% de sucesso.

---

## 3. Caveats

- **Integridade da Implementação Funcional**: O código de autenticação, migração e RBAC não contém facades, atalhos fraudulentos ou resultados hardcoded. Se os arquivos forem sincronizados, a funcionalidade atende 100% aos requisitos de M1.
- **Origem da Divergência**: A alteração que quebrou a paridade decorreu de um commit independente de pagamentos (`035c16e`), não de um erro interno na lógica de autenticação de M1.

---

## 4. Conclusion

O Milestone 1 atendeu aos requisitos funcionais de RBAC (`dev` vs `admin`), proteção de rotas técnicas, migração idempotente de usuários e segurança de credenciais. Contudo, **o gate de qualidade está bloqueado** devido à quebra de paridade SHA-256 entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`.

**Ação Necessária**:
1. Espelhar as alterações de `scripts/demo-server.mjs` em `artifacts/api-server/demo-server.mjs` (ou vice-versa, consolidando as alterações do commit `035c16e`).
2. Validar que ambos os arquivos possuem exatamente o mesmo hash SHA-256.
3. Reexecutar `node --test tests/auth-roles-permissions.test.mjs` confirmando 6/6 testes aprovados e saída 0.
4. Realizar `git commit` e `git push origin main`.

---

## 5. Verification Method

Para reproduzir e verificar a resolução:

1. **Checagem de Paridade SHA-256**:
   ```powershell
   Get-FileHash 'artifacts/api-server/demo-server.mjs', 'scripts/demo-server.mjs' -Algorithm SHA256 | Format-List
   ```
   *Critério de Invalidação*: Qualquer caractere diferente nos hashes SHA-256 invalida o gate.

2. **Execução do Teste Pontual de M1**:
   ```bash
   node --test tests/auth-roles-permissions.test.mjs
   ```
   *Critério de Invalidação*: Saída com qualquer teste com status `not ok` ou código de retorno diferente de 0.

3. **Verificação de Compilação Sintática**:
   ```bash
   node -c artifacts/api-server/demo-server.mjs
   node -c scripts/demo-server.mjs
   ```
   *Critério de Invalidação*: Qualquer erro de sintaxe.

---

## Quality Review Findings

### [Critical] Finding 1: Quebra de Paridade SHA-256 entre Twin Servers
- **What**: Os arquivos `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` possuem conteúdos divergentes (247 linhas alteradas em `scripts/` pelo commit `035c16e`).
- **Where**: `artifacts/api-server/demo-server.mjs` vs `scripts/demo-server.mjs`
- **Why**: Viola a diretriz mandatória de paridade do projeto e quebra a suíte de testes `tests/auth-roles-permissions.test.mjs`.
- **Suggestion**: Reconciliar as alterações do commit `035c16e` em `artifacts/api-server/demo-server.mjs` para que ambos fiquem 100% idênticos.

### [Minor] Finding 2: Rota `/api/whatsapp/raw-webhook-logs` sem checagem de autenticação
- **What**: A rota `GET /api/whatsapp/raw-webhook-logs` em `artifacts/api-server/zapi-service.mjs:6667` expõe logs de webhooks brutos sem verificar `requireDevAuth` ou `getAuthUser`.
- **Where**: `artifacts/api-server/zapi-service.mjs:6667`
- **Why**: Embora não seja consumida na UI, permite que qualquer cliente leia payloads brutos de webhooks.
- **Suggestion**: Adicionar `requireDevAuth` ou incluir `/api/whatsapp/raw-webhook-logs` na lista protegida em `demo-server.mjs`.

---

## Adversarial Review & Attack Surface

### 1. Assumption Stress-Testing
- **Premissa A**: `admin` pode tentar auto-promoção ou elevação de privilégio.
  - *Cenário de Teste*: `PATCH /api/admin/users/:id` com `{ role: "dev" }` disparado por usuário `admin`.
  - *Resultado*: Linha 9881 barra com HTTP 403 ("Apenas desenvolvedores podem promover usuários a dev."). **Aprovado.**
- **Premissa B**: `admin` pode tentar alterar a senha ou excluir a conta `dev`.
  - *Cenário de Teste*: `POST /api/admin/users/1/reset-password` e `DELETE /api/admin/users/1` disparados por `gestor` (`admin`).
  - *Resultado*: Linhas 9927 e 9947 barram com HTTP 403 ("Apenas desenvolvedores podem..."). **Aprovado.**
- **Premissa C**: Rotas técnicas de telemetria ou nuvem acessíveis via requisições diretas de `admin`.
  - *Cenário de Teste*: Acesso a `/api/admin/server-monitor/live`, `/api/audit-logs`, `/api/storage/config`, `/api/whatsapp/config` com cookie de `gestor`.
  - *Resultado*: `requireDevAuth` intercepta e retorna HTTP 403 ("Acesso restrito a desenvolvedores."). **Aprovado.**
- **Premissa D**: Desligamento ou falha imediata após inicialização com usuários não persistidos.
  - *Cenário de Teste*: `ensureSystemUsers` aciona `saveDatabase("manual_migrate_system_users_dev_and_gestor")`.
  - *Resultado*: Prefixo `manual_` desvia do debounce de 500ms e grava sincronicamente via `atomicWriteFileSync(DB_FILE, stateJson)`, garantindo integridade imediata no disco. **Aprovado.**

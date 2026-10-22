## 2026-10-22T10:26:07Z
Você é o Worker M1 (worker_m1) responsável pela implementação do Marco M1 (Backend Core & Isolamento de Prestadoras).
Seu diretório de trabalho exclusivo é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1`
A raiz do projeto é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`

MANDATÓRIO:
1. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (seção `## 2026-10-22T09:58:01Z`).
2. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_17\PROJECT.md`.
3. Leia os relatórios dos Explorers:
   - `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m1_twin_sync\handoff.md`
   - `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m1_employees_schema\handoff.md`
   - `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m1_cris_grazi_isolation\handoff.md`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

PROPRIEDADE EXCLUSIVA DE ESCRITA:
Você tem permissão de escrita em:
- `artifacts/api-server/hr/*` e `scripts/hr/*`
- `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`
- `scripts/mail-service.mjs` e `scripts/zapi-service.mjs` (para sincronização inicial com artifacts)
- `scripts/check-twin-parity.mjs`
- `.agents/teamwork/worker_m1/*`

SUA MISSÃO DE IMPLEMENTAÇÃO:
1. **Passo 0: Sincronização Inicial Twin-Server**:
   Copie `demo-server.mjs`, `mail-service.mjs` e `zapi-service.mjs` de `artifacts/api-server/` para `scripts/` para restabelecer 100% de paridade SHA-256 base.
2. **Passo 1: Criação da Estrutura Modular `hr/`**:
   Crie em `artifacts/api-server/hr/` e espelhe identicamente em `scripts/hr/`:
   - `employees.mjs`:
     * Schema completo de funcionário CLT (dados civis, CTPS, PIS, CBO, jornada 6x1 44h, salário, adicionais insalubridade 20%, PIX, PIN hash, functionalHistory).
     * Sementes seguras iniciais (`getDefaultHrEmployees`): 1 Cozinheira (`emp_cozinha_01`, Sebastiana Ramos dos Santos, CLT-001) e 1 Camareira CLT (`emp_camareira_01`, Luciana Moreira Ribeiro, CLT-002).
     * Guarda mandatória `isCltEmployee(emp)` e `isPrestadora(emp)`.
     * CRUD: `getEmployees(db, query)`, `getEmployeeById(db, id)`, `createEmployee(db, payload)`, `updateEmployee(db, id, payload)`.
   - `router.mjs`: Express Router montando os endpoints:
     * `GET /api/hr/employees` (filtra e sanitiza hashes, exclui estritamente Cris e Grazi)
     * `POST /api/hr/employees` (valida jornada 6x1, almoço >= 1h se > 6h, rejeita se nome contiver Cris ou Grazi)
     * `GET /api/hr/employees/:id` (retorna 404 para prestadoras de serviço)
     * `PATCH /api/hr/employees/:id` (atualiza com trilha de auditoria em functionalHistory)
   - `index.mjs`: Exporta `createHrRouter`, `ensureHrCollections`, `isCltEmployee`, `isPrestadora`, etc.
3. **Passo 2: Integração no `demo-server.mjs` (em ambos `artifacts/` e `scripts/`)**:
   - Import no topo de `demo-server.mjs`: `import { createHrRouter, ensureHrCollections } from "./hr/index.mjs";`.
   - Inicialização em `loadDatabase()` e declaração inicial de `db`: chamar `ensureHrCollections(db)`.
   - Ponto de montagem: `app.use("/api/hr", createHrRouter({ db, saveDatabase }));` na linha ~1491 (antes das rotas estáticas).
   - Proteção de poda em `pruneDatabase()`: adicionar `HR_PROTECTED_COLLECTIONS` protegendo as 11 coleções de RH contra poda e garantindo guarda de 5 anos (1825 dias) para transações.
   - Atualização em `sanitizeMaidUsers()` e `defaultUsers`: garantir `contractType = "prestador"` em Cris (`id: 2`) e Grazi (`id: 3`).
4. **Passo 3: Script de Validação de Paridade**:
   Crie `scripts/check-twin-parity.mjs` para checar `demo-server.mjs`, serviços duplicados e pastas filhas (`hr/`, `wbp/`). Execute-o e garanta 100% PASS.
5. **Passo 4: Verificação Local Isolada**:
   Execute verificação pontual em node com porta isolada ou import direto provando:
   - Paridade SHA-256 = true.
   - `isCltEmployee` retorna false para Cris e Grazi, e true para os 2 funcionários semeados.
   - `pruneDatabase` não deleta coleções de RH.
6. Escreva o relatório de conclusão em `handoff.md` no seu diretório e avise o orquestrador via `send_message`.
LEMBRE-SE: Nunca execute testes globais em lote (`tests/*.test.mjs`). Apenas verificação pontual dos arquivos alterados.

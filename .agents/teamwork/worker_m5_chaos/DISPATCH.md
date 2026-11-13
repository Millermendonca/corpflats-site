# Worker Dispatch: Milestone 5 - Gemini Chaos Explorer & Relatório HTML Consolidado (R5)

## Instructions
Read `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (specifically section `## 2026-10-11T00:38:03Z`).
Read `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\PROJECT.md`.
Read previous workers' handoffs:
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1_sandbox\handoff.md`
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2_crawler\handoff.md`
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3_journeys\handoff.md`
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m4_pairwise\handoff.md`

## Mandatory Integrity Warning
> DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Objective & Owned Files
Implement the Autonomous Heuristic/AI Chaos Explorer suite and the Consolidated HTML Report generator:

1. `e2e/suites/04-chaos-explorer.spec.mjs`:
   - **Ação Caótica 1: Cliques Duplos e Rápidos**:
     - Simulação de cliques duplos rápidos (50ms interval) em botões de ação críticos (ex: "Confirmar", "Avançar", "Salvar", "Vou Limpar").
     - Garantir que o sistema previne submissão duplicada (idempotência), não entra em loop e não quebra a interface.
   - **Ação Caótica 2: Injeção de Dados Fuzzing / Especiais**:
     - Inserção em inputs de texto de caracteres especiais (`<script>alert(1)</script>`, `SELECT * FROM`, emojis `🏨✨🎉`, aspas duplas/simples, espaços excessivos nas bordas `   João da Silva   `, números de telefone com formatos bizarros).
     - Garantir sanitização graciosa, mensagens de validação amigáveis e zero crash do React (`window.onerror` / tela branca).
   - **Ação Caótica 3: Navegação Fora de Ordem (Botão Voltar)**:
     - No meio de formulários multi-step (ex: formulário de pré-checkin etapa 2 -> 3 -> botão Voltar do browser `page.goBack()`).
     - No funil de reserva ou portal do hóspede.
     - Garantir preservação de estado ou recuperação amigável sem tela branca.
   - **Ação Caótica 4: Auditoria Qualitativa de Usabilidade**:
     - Heurísticas que varrem elementos DOM na tela em busca de textos truncados com `text-overflow: ellipsis` ocultando dados críticos, elementos sobrepostos ou botões sem rótulo acessível.
     - Gera lista de insights de usabilidade (`usability-audit.json`).

2. `e2e/reporters/html-reporter.mjs` & `e2e/reports/index.html`:
   - Atualizar e enriquecer o gerador de relatório HTML consolidado.
   - Deve apresentar:
     - Header com métricas consolidadas: Total de Testes, Taxa de Sucesso (%) por Módulo (Sandbox M1, Crawler 45 Telas M2, Jornadas Humanas M3, Matriz Pairwise M4, Chaos Explorer M5), Tempo Total de Execução.
     - Seção dedicada para o **Gemini Chaos Explorer**: resumo de testes de estresse, double clicks, injeções caóticas e achados qualitativos de usabilidade.
     - Tabela detalhada de testes com status (PASSED / FAILED), duração e viewport.
     - Galeria indexada com links/miniaturas de capturas de tela e vídeos para quaisquer testes que apresentarem falha.
     - Design moderno, responsivo e standalone (CSS/JS embutidos, sem dependência externa que quebre offline).

3. `e2e/runner.mjs`:
   - Assegurar que `node e2e/runner.mjs` execute perfeitamente `e2e/suites/04-chaos-explorer.spec.mjs` e integre todos os resultados ao relatório `e2e/reports/index.html`.

## Twin-Server Parity & Git Rule
- Ensure `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` remain byte-by-byte identical.
- Build frontend via `npm run build` in `artifacts/limpeza` if frontend code is modified.
- Commit and `git push origin main` per project rules.

## Output
Execute the suite with Playwright against the sandbox (`node e2e/runner.mjs e2e/suites/04-chaos-explorer.spec.mjs`), verify 100% pass rate, ensure `e2e/reports/index.html` is generated with all sections, and document findings in `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m5_chaos\handoff.md`.


## 2026-10-11T06:09:28Z
Você é o Worker M5 (Gemini Chaos Explorer & Relatório HTML Consolidado - R5).
Seu diretório de trabalho é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m5_chaos
Leia com atenção o arquivo c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m5_chaos\DISPATCH.md e o arquivo c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Implemente e execute a suíte e2e/suites/04-chaos-explorer.spec.mjs (cliques duplos rápidos, injeção de caracteres especiais/fuzzing, navegação fora de ordem pelo botão Voltar, e auditoria heurística de usabilidade).
Aprimore o gerador de relatórios e2e/reporters/html-reporter.mjs gerando e2e/reports/index.html com taxa de sucesso por módulo, seção dedicada do Chaos Explorer com achados qualitativos, e indexador de fotos e vídeos para falhas.
Execute os testes contra o sandbox local, garanta 100% de aprovação e documente os resultados em c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m5_chaos\handoff.md.

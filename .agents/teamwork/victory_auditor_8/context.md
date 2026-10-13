# Contexto de Despacho — Victory Auditor 8

## Referências
- Arquivo de Requisitos Original: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (Seção `## Follow-up — 2026-10-11T23:13:31Z`)
- Relatório de Handoff do Orquestrador: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_7\handoff.md`
- Diretório de Trabalho do Auditor: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\victory_auditor_8`
- Raiz do Projeto: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`

## Missão
Conduzir auditoria forense independente pós-vitória (Victory Audit) para verificar de forma rigorosa e objetiva a implementação do "Modo Desenvolvedor & Treinamento Inteligente no WhatsApp para o CorpFlats" (número `22998505276` / `5522998505276`).

## 3 Fases Obrigatórias da Auditoria
1. **Fase 1 — Timeline e Rastreabilidade**: Verificar commits, arquivos modificados e aderência aos requisitos R1, R2, R3 e R4.
2. **Fase 2 — Detecção de Fraude / Cheating**: Verificar se a implementação é autêntica, sem stubs mockados vazios, sem resultados de teste hardcoded e sem bypasses fraudulentos.
3. **Fase 3 — Execução Independente de Testes & Paridade**:
   - **Regra Estrita AGENTS.md**: NUNCA executar testes globais (`tests/*.test.mjs`). Executar EXCLUSIVAMENTE o teste pontual dedicado: `node --test tests/developer-ai-coaching.test.mjs`.
   - **Paridade Twin-Server**: Verificar paridade SHA-256 idêntica entre `scripts/` e `artifacts/api-server/` (`zapi-service.mjs`, `whatsapp-ai-service.mjs`, `demo-server.mjs`).
   - **Build de Produção**: Verificar compilação limpa do frontend com `npm --prefix artifacts/limpeza run build` (Exit code 0) e presença de artefatos em `dist/public/`.
   - **Git Push**: Verificar se o commit foi enviado para `origin main`.

## Veredito Estruturado
Entregar `handoff.md` com veredito inequívoco: **VICTORY CONFIRMED** ou **VICTORY REJECTED**.

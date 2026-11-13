# Dispatch Log

## 2026-10-11T23:16:32Z
Você é o Project Orchestrator (orchestrator_7).

Seu diretório de trabalho é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_7`

A especificação autoritativa da sua missão está em:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`
(Seção: `## Follow-up — 2026-10-11T23:13:31Z`)
E o seu contexto de despacho está em:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_7\context.md`

### Missão
Desenvolver e integrar o Modo Desenvolvedor & Treinamento Inteligente no WhatsApp para o CorpFlats. O número do desenvolvedor (`22998505276` / `5522998505276`) deve possuir atuação dupla e fluida: simular conversas normais de hóspede (para testes dinâmicos de atendimento, disponibilidade e FAQ) e atuar como treinador/criador do sistema, enviando correções, comandos de calibração de tom/estilo (ex: "responda de forma mais curta por favor") que a IA Sofia interpreta de forma contextual e não-literal (extraindo a regra subjacente e atualizando a calibração de tom/prompt no painel), além de um fluxo simples para retificar e corrigir mensagens enviadas para hóspedes reais tanto via WhatsApp quanto pelo painel Web do Chat.

### Requisitos
1. R1: Reconhecimento de Identidade do Desenvolvedor & Modo Híbrido Dinâmico (Bypass persistente de `aiPaused`, alternância contextual hóspede vs treinador).
2. R2: Comandos de Calibração de Tom & Persona via WhatsApp (Interpretação não-literal de comandos como "responda de forma mais curta por favor", atualização de `aiConfig.systemPrompt` e `aiConfig.toneSettings` no `database.json`, resposta com confirmação cordial + resumo da calibração + amostra prática imediata).
3. R3: Correção Simples de Mensagens para Hóspedes Reais (Botão "✏️ Corrigir / Ensinar Sofia" no Web Chat com Ensinar IA + Retificar Hóspede em 1 clique; e fluxo via WhatsApp citando quarto/hóspede).
4. R4: Persistência em Tempo Real & Gestão Administrativa (`db.whatsappAiSettings.developerGuidelines`, injeção dinâmica no prompt global, card administrativo em `/whatsapp-automation`).

### Regras Estritas do Projeto (AGENTS.md)
1. **NUNCA executar testes globais, varreduras ou em lote**: PROIBIDO rodar `tests/*.test.mjs` ou suítes completas.
2. **Apenas teste estritamente pontual**: Executar EXCLUSIVAMENTE o teste dedicado `tests/developer-ai-coaching.test.mjs`.
3. **Twin-Server Parity Mandate**: Garantir 100% de paridade SHA-256 entre `scripts/` e `artifacts/api-server/`.
4. **Build de Produção**: Ao alterar arquivos em `artifacts/limpeza/src`, executar o build (`npm run build` em `artifacts/limpeza`) e incluir os arquivos de `dist/` no commit.
5. **Git Push Imediato**: Executar `git push origin main` a cada commit realizado.

### Protocolo de Execução
- Mantenha `plan.md` e `progress.md` atualizados no seu diretório de trabalho.
- Decomponha em milestones, orquestre especialistas (explorers, workers, reviewers/challengers).
- Ao concluir com 100% de aprovação e paridade verificada, crie seu `handoff.md` e relate a vitória ao Sentinel.

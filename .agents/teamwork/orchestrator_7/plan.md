# Project Plan: Modo Desenvolvedor & Treinamento Inteligente no WhatsApp (CorpFlats)

## Architectural Overview
Implementar suporte nativo a desenvolvedor/treinador no WhatsApp (`22998505276` / `5522998505276`):
1. **Identificação & Bypass**: Detecção de número de desenvolvedor, imunidade a `aiPaused: true`, classificação de intenção (Hóspede Simulado vs Treinador/Feedback vs Calibração de Tom vs Correção Factual).
2. **Motor de Calibração de Tom & Persona**: Interpretação não-literal de comandos de estilo (ex: "responda de forma mais curta por favor"), atualização em tempo real de `aiConfig.toneSettings` / `aiConfig.systemPrompt` e resposta com confirmação cordial + resumo da calibração + amostra prática no novo tom.
3. **Correção & Retificação Simples**: Botão "✏️ Corrigir / Ensinar Sofia" no Web Chat com 1 clique (ensinar IA + retificar hóspede) e comando via WhatsApp citando quarto/hóspede.
4. **Persistência Global & Gestão Administrativa**: `db.whatsappAiSettings.developerGuidelines`, injeção em todos os chats de hóspedes, e card administrativo em `/whatsapp-automation` (ver, editar, testar, excluir).
5. **Twin-Server Parity & QA**: Paridade SHA-256 de 100% entre `scripts/` e `artifacts/api-server/`, build de produção em `artifacts/limpeza`, e teste pontual `tests/developer-ai-coaching.test.mjs`.

## Milestones & Phasing
- **Phase 0: Survey & Technical Exploration** (3 Explorers paralelos)
- **Milestone 1 (M1)**: Reconhecimento de Identidade & Modo Híbrido Dinâmico (Bypass de pausa, classificação hóspede vs treinador)
- **Milestone 2 (M2)**: Calibração de Tom & Persona via WhatsApp (Extração não-literal, atualização no banco/prompt, resposta com amostra imediata)
- **Milestone 3 (M3)**: Correção de Mensagens (Web Chat + WhatsApp do Desenvolvedor)
- **Milestone 4 (M4)**: Persistência Global & Interface Administrativa (Card de diretrizes em /whatsapp-automation)
- **Milestone 5 (M5)**: Teste Pontual Dedicado, Paridade Twin-Server, Build de Produção & Git Push

## Execution Strategy
- Iteration Loop: Explorer -> Worker -> Reviewer -> Challenger -> Auditor -> Gate.
- All source code changes performed exclusively by workers.
- Strictly adhere to AGENTS.md rules.

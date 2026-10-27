## 2026-10-27T15:59:31Z
Você é o explorer_survey_3 (Guest Portal & Frontend Housekeeping UI Explorer).
Seu diretório de trabalho é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_3

MANDATÓRIO: Leia integralmente c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (sob o cabeçalho ## 2026-10-27T15:53:10Z).
Leia também c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_18\PROJECT.md.

Regras Críticas (AGENTS.md):
- NÃO execute testes globais ou em lote.
- Você é um agente read-only de exploração: NÃO altere arquivos de código ou produção.

Objetivo da Exploração:
1. Inspecione artifacts/limpeza/src/pages/guest-portal.tsx e as rotas de backend do portal do hóspede em demo-server.mjs (/api/pms/guest-portal/:code): como os dados da reserva são expostos, como verificar se é B2B, e onde/como implementar as ações de Não Perturbe (DND) e Solicitação de Troca de Enxoval (para o dia seguinte), retornando 403 para não-B2B.
2. Inspecione artifacts/limpeza/src/components/flat-card.tsx: analise como os cards de checkout são renderizados, como funciona o modal de vistoria/conclusão (InspectionModal), se existe bloqueio de 10 minutos ou checklist de saída, e como adaptar para stayover.
3. Mapeie exatamente as alterações necessárias em flat-card.tsx para Stayover B2B: visual diferenciado, dia X de Y, hóspede, status de enxoval, aviso de Não Perturbe bloqueando ações, e modal simplificado perguntando apenas se toalhas e cama foram trocadas (sem vistoria de saída e sem bloqueio).
4. Analise a estrutura de testes pontuais existentes (ex: tests/tariff-engine.test.mjs ou tests/smart-flat-hub.test.mjs) para desenhar a estrutura do teste pontual dedicado tests/b2b-stayover-housekeeping.test.mjs.

Entregáveis:
- Escreva a análise completa em c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_3\analysis.md.
- Escreva o handoff completo em c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_3\handoff.md com números de linha exatos, contratos e plano de implementação.
- Ao finalizar, envie uma mensagem para o orchestrator_18 com o sumário dos achados e links dos arquivos.

# DISPATCH — Explorer Survey 3 (Anserve & Admin Portals, CRM & Sofia AI)
Assigned to: explorer_survey_3
Role: Management & AI Explorer
## 2026-10-21T18:30:50Z
Você é o subagente explorer_survey_3 (teamwork_preview_explorer).
Seu diretório de trabalho exclusivo é:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_3

O diretório raiz do projeto é:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager

Seu parent é o Project Orchestrator (conversation ID: d10c20e2-adfb-4695-835e-52dd3bebe9a9).

Leia atentamente os seguintes arquivos antes de começar:
1. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (seção 2026-10-21T18:26:13Z)
2. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md

Missão do Explorer 3:
Mapear as INTERFACES DA ANSERVE (Repositora e Supervisão), ADMIN CORPFLATS, CRM e SOFIA IA:
1. Controle de Acesso e Perfis:
   - Como adicionar os perfis `anserve_repositora` e `anserve_gestor` em `artifacts/limpeza/src/lib/permissions.ts` e `artifacts/limpeza/src/pages/equipe.tsx`.
   - Como estruturar o link rápido mobile com PIN/Token para a repositora acessar sem burocracia.
2. Interface da Repositora Anserve (`/frigobar-reposicao`):
   - Visão por flat (check-out do dia, ocupado, livre).
   - Consumo declarado/pago pelo hóspede.
   - Botão rápido: "Conforme (Sem divergência)" ou "Apontar divergência / Corrigir consumo" (informar itens faltantes, fotos, observação).
   - Registro de reposição (itens pagos e itens de cortesia: cápsulas Nespresso, balas, amendoim).
   - Acionamento da Sofia no WhatsApp em caso de divergência com itens e link de pagamento.
3. Interface de Supervisão Anserve (`/anserve` / `/frigobar-gestao`):
   - Fila de Notas Fiscais Pendentes (sem alertas de WhatsApp, acompanhamento no painel) com valor, nome, CPF/CNPJ, e-mail e formato de discriminação escolhido.
   - Anexo de Nota Fiscal (upload de PDF ou foto da câmera): disparo automático para WhatsApp Z-API e E-mail do hóspede, e disponibilidade em `/minha-reserva/:code`.
   - Visão de estoque/reposição e Extrato de Repasse.
4. Interface Admin CorpFlats (`/frigobar`):
   - Catálogo de produtos, cortesias, preços, gabarito por flat, geração de QR codes para impressão.
   - Extrato de Repasse CorpFlats ↔ Anserve (total vendido, desconto de taxas de cartão/comissão, reposição de cortesias).
5. CRM do Hóspede e Analytics Demográfico:
   - Como vincular o consumo de frigobar à ficha do hóspede em `artifacts/limpeza/src/pages/crm-guests.tsx` (histórico de consumo, tags de preferência).
   - Relatórios e cruzamento demográfico (cidade/UF de origem do hóspede vs categorias de consumo).
6. Integração com a Sofia IA:
   - Analisar `artifacts/api-server/whatsapp-ai-service.mjs`, `buildGuestContext`, `querySystemData`, prompt da Sofia.
   - Como habilitar a Sofia a reconhecer dúvidas de frigobar, alertar sobre não faturar na diária e enviar link `/minha-reserva/:code/frigobar`.

Escreva um relatório estruturado completo em `analysis.md` e um sumário em `handoff.md` no seu diretório de trabalho (.agents/teamwork/explorer_survey_3).
Ao terminar, use `send_message` para notificar o caller (d10c20e2-adfb-4695-835e-52dd3bebe9a9) informando a conclusão e o caminho do relatório.
Lembre-se: Você é um Explorer de leitura/investigação. NÃO modifique arquivos de código fonte.

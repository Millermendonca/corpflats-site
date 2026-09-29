# Original User Request

## Initial Request — 2026-09-29T05:00:30Z

Auditoria profunda, saneamento e correção definitiva das rotinas de reconciliação de governança, regras de check-out retroativo, transição de data após 18h e atribuição de camareiras no sistema Guest Flow Manager (CorpFlats), sanando as falhas nos flats 904, 313, 511, 512 e em toda a base.

Working directory: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager
Integrity mode: development

## Requirements

### R1. Eliminar o Loop de Reabertura Automática de Limpezas (Flat 512 e outros)
- O motor de integridade (`reconcileUniversalIntegrity` em `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`) possui uma regra que reverte limpezas recentes marcadas como `clean` de volta para `dirty` caso não possuam `assignedUserId` ou `completedAt` preenchidos.
- Ajustar essa rotina para respeitar marcações manuais do administrador e limpezas canônicas sem sofrer reversão automática em segundo plano.

### R2. Tratamento da Virada de Data das 18:00 no Dashboard (Flat 904)
- No frontend (`dashboard.tsx`), após as 18:00 o sistema avança automaticamente o dia padrão para o dia seguinte (`getDefaultDate()`).
- O Flat 904 teve check-in no dia 28/09 (Jorge) e check-out agendado para 29/09. Após as 18h do dia 28/09, o painel carregou o dia 29/09 com a faxina de saída do Jorge, gerando a impressão de que era ontem.
- Melhorar o indicador visual da data exibida no painel ou ajustar a lógica de transição para evitar confusão entre o trabalho de hoje e a previsão de amanhã.

### R3. Saneamento de Limpezas Fantasmas e Atribuição de Camareiras (Flats 313 e 511)
- **Flat 313**: Uma limpeza de check-out do dia 25/09 (Leonardo Primo) foi gerada automaticamente como `dirty` (ID 1358) e vinha sendo arrastada diariamente como pendência (`isPendingFromPreviousDay`), enquanto o hóspede atual (Felipe) só sai em 02/10. Corrigir o histórico e as referências de camareira.
- **Flat 511**: Um registro manual (ID 1338) inseriu no card a nota "Limpeza realizada por Grazi" atribuindo `addedBy: admin`, mesmo em data na qual a funcionária não estava escalada. Limpar ou reatribuir conforme a escala real.

### R4. Varredura e Auditoria Universal de Integridade em Todos os Flats
- Executar script de auditoria em todos os 19 flats ativos para detectar:
  - Checkouts de reservas que geraram cartões duplicados ou órfãos.
  - Cartões marcados como limpos por camareiras que não estavam em escala no respectivo dia.
  - Conflitos de código de reserva vs número de flat (ex.: `RES-712-0291` alocado no Flat 512).
- Sincronizar as alterações em `data/database.json`, `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`.

## Acceptance Criteria

### Integridade do Motor de Governança
- [ ] O Flat 512 permanece com status limpo de forma definitiva e não reaparece na fila sem checkout novo.
- [ ] O Flat 904 só exibe ordem de limpeza na data correta do check-out (29/09) com indicação nítida de data no painel.
- [ ] O Flat 313 deixa de carregar pendência indevida de 25/09 e exibe os dados corretos da estada do Felipe.
- [ ] O Flat 511 tem sua nota e camareira corrigidas sem atribuir Grazi em dias de folga.
- [ ] A reserva `RES-712-0291` tem seu flatId/flatNumber corrigido para o flat correto (712).
- [ ] Toda a suíte de testes de integridade roda com 100% de sucesso sem erros de sintaxe ou de build.
- [ ] Build do frontend (`npm run build` em `artifacts/limpeza`) e commit + git push concluídos conforme `AGENTS.md`.

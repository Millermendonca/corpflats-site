# Original User Request

## Initial Request — 2026-10-13T22:04:17Z

Construir a integração do PMS **Guest-Flow-Manager** (CorpFlats Soho Residence: 19 flats, Campos dos Goytacazes/RJ) com o channel manager **WebBookingPro** pela API "Build-To-Us". O PMS passa a ser a fonte da verdade de disponibilidade, tarifas e restrições, enviando-as à WebBookingPro, e passa a receber automaticamente as reservas da Booking.com e do Airbnb. Junto com isso, reestruturar o módulo de precificação tendo a planilha SEBRAE do usuário como modelo. É um sistema de **produção** de um hotel em operação: **nenhuma perda de dados e nenhuma interferência na operação atual** são os requisitos mais importantes. Ainda não existem credenciais da WebBookingPro, então todo o desenvolvimento e os testes devem rodar contra um **simulador fiel à especificação**.

Working directory: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager` (trabalhar na branch `feature/wbp-integration`; nunca fazer merge na `main` sem aprovação do usuário)
Integrity mode: development

## Material de referência
- **Documentação completa da API, copiada localmente:** `C:\Users\mille\.gemini\antigravity\brain\70356aec-b041-4a86-8517-6963f7cb2aa9\wbp_docs\`
  - `wbpAPI.yaml` é a especificação OpenAPI completa e a fonte da verdade.
  - `README.md` traz as regras-chave, as lacunas e inconsistências já identificadas e os códigos de erro.
  - `pages/` tem uma página por endpoint.
  - Versionar uma cópia dessa pasta no repositório, para consulta futura.
- **Planilha de precificação do usuário:** `c:\Users\mille\OneDrive\Hotel\Arquivos Antigravity\Kit Precificacao Hoteleira SEBRAE.xlsx`
  - A extração completa (valores e fórmulas) está em `C:\Users\mille\.gemini\antigravity\brain\70356aec-b041-4a86-8517-6963f7cb2aa9\scratch\sebrae_dump.txt`.
  - A análise de lacunas em relação ao sistema atual está em `C:\Users\mille\.gemini\antigravity\brain\70356aec-b041-4a86-8517-6963f7cb2aa9\analise_precificacao_sebrae.md`.
- **Regras do projeto:** `AGENTS.md` (obrigatório; ver R10) e `PROJECT.md`.
- **Fatos do código atual,** levantados na pesquisa. Os números de linha podem ter mudado.
  - **Backend:** é um arquivo único, `artifacts/api-server/demo-server.mjs`, com cópia gêmea **byte a byte idêntica** em `scripts/demo-server.mjs` (paridade SHA-256). O mesmo vale para os serviços duplicados.
  - **Persistência:** o estado inteiro fica num blob JSONB no Postgres (`system_store`, `key='db_state'`), regravado com debounce. Há poda automática de reservas antigas e snapshots só das últimas cerca de 6 h.
  - **Hospedagem:** Render, plano pago com cerca de 2 GB de RAM. Hoje o processo se limita a cerca de 384 MB via `server.mjs` e `render.yaml`.
  - **Flats:** são 19 flats individuais, sem tipos de quarto.
  - **Reservas:** não existe campo de ID externo. As reservas de OTA são digitadas à mão (`channel` = booking/airbnb), e a regra atual força `pago_total` para elas.
  - **Tarifas:** `db.tariffSettings`, `db.tariffOverrides` e `calculateDailyRate`, em modo `auto` (SEBRAE simplificado) ou `manual`. Não há plano tarifário nem restrições, e `minNights` é ignorado.
  - **Disponibilidade:** é calculada de 4 formas divergentes (só `hasReservationConflict` considera holds e roomBlocks), e o servidor não valida overbooking.
  - **Automações ao criar reserva:** WhatsApp, SERPRO/FNRH, PIX (pré-reserva), e-mails de portaria/garagem, governança e café.
  - **Autenticação:** o cookie de sessão não é assinado e várias rotas de escrita não checam autenticação.
  - **Testes pontuais:** seguem o padrão `node:test` sobre uma cópia de `data/database.json`, como em `tests/tariff-engine.test.mjs`.

## Requirements

### R1. Segurança operacional e integridade de dados (prioridade máxima)
- **Interruptor geral:** a integração inteira fica atrás de um interruptor geral, **desligado por padrão**. Desligada, o sistema se comporta exatamente como hoje: nenhuma chamada de saída, nenhum agendamento e nenhuma mudança visível para a recepção.
- **Modos de operação:** `desligado` → `somente observar` (recebe e registra tudo, mas não cria nem altera reservas e não dispara automações) → `automático`.
- **Registro antes do processamento:** todo payload recebido da WebBookingPro (callback ou polling) é gravado de forma durável e só de inserção, **fora do blob principal e imune à poda**, antes de qualquer processamento. O processamento é idempotente: o mesmo booking recebido N vezes, por callback, polling ou ambos, produz exatamente um efeito. Uma falha entre o recebimento e o processamento é retomada automaticamente.
- **Escritas da integração:** as escritas no estado de reservas são serializadas, para evitar IDs ou códigos duplicados em chamadas concorrentes.
- **Isolamento dos testes:** nenhum teste ou simulador pode tocar o banco de produção (`DATABASE_URL` sempre removida nos testes) e as cópias de banco usadas em testes não podem vazar dados pessoais reais para fora da máquina.

### R2. Cliente da API e simulador
- **Implementação da especificação:**
  - Chamadas obrigatórias: HealthCheck, SetupProperty, GetRoomTypes, GetRatePlans, ARIUpdate, GetBookingList e GetBookingId.
  - Também: AckBooking.
  - Callbacks no PMS: BookingCreate, NotifyBooking (form-urlencoded), ARIFullRefresh e RoomInfo.
  - Seguir o formato de autenticação, o `guid` por requisição, os códigos de erro e as regras do README, como `end_date` inclusivo, a margem de 5 min no `wbp_booking_version` e o fim de semana em UTC.
- **Simulador local da WebBookingPro:**
  - Valida cada requisição recebida contra os schemas de `wbpAPI.yaml`, tolerando as inconsistências documentadas.
  - Permite injetar reservas novas, alteradas e canceladas, falhas, timeouts e respostas de erro.
  - É usado em todos os testes.
- **Credenciais:** `cid`, `shared_secret`, ID e senha da propriedade e URL ficam configuráveis por variáveis de ambiente ou tela de administração. Os segredos **não** podem ficar no blob do banco.
- **Callbacks:** os endpoints de callback validam o `shared_secret`, respondem rápido (após o registro durável) e o polling de backup roda a cada 30 min (configurável).

### R3. Mapeamento e publicação de ARI
- **Modelo atual:** **1 tipo de quarto "Flat"**, com estoque = nº de flats livres por data, e **2 planos tarifários**: "Sem café" e "Com café". Os anúncios com e sem café da Booking e do Airbnb apontam para esses planos.
- **Tela de mapeamento:** deve permitir, no futuro, criar categorias (cada flat pertence a uma categoria) e mais planos, sem reescrever a integração.
- **Estoque compartilhado:** qualquer venda baixa o estoque de todos os planos. Cada plano pode ter um **teto opcional** por data, e o valor enviado é sempre `min(teto, flats livres)`.
- **Cálculo único de disponibilidade:** considera reservas ativas, bloqueios e manutenções (roomBlocks e ordens de serviço), holds e pré-reservas não expiradas, com status normalizados. Ele é usado para o ARI.
- **Conflitos nas telas atuais:** criar ou mover uma reserva com conflito passa a exibir um **aviso claro, sem bloquear**.
- **Preço:**
  - "Sem café" vem do motor de precificação (R4).
  - "Com café" = "Sem café" + **valor configurável por hóspede por noite**, enviado de forma coerente nos campos de preço por ocupação da API (`rate`, `rdef_single` e os campos de adultos adicionais).
- **Restrições configuráveis** por data, período e plano: estadia mínima, estadia máxima, stop-sell (por plano ou geral), CTA, CTD e antecedência mínima e máxima. A `minNights` atual passa a valer.
- **Envios:** carga completa inicial até o fim do ano seguinte e, depois, envio incremental em segundos após qualquer mudança (reserva, cancelamento, bloqueio, tarifa ou restrição), com agrupamento de datas, lotes, retentativa e consumo de memória controlado.

### R4. Precificação estilo SEBRAE, com travas
- **Funcionalidades da planilha, reestruturadas para a rotina do usuário:**
  - Custo por UH com os itens reais: fixos, limpeza, enxoval, energia e cartão.
  - Custo fixo por diária vendida, com a ocupação, e por diária disponível, com os dias reais do mês.
  - Tarifa mínima = custo ÷ (1 − comissão − margem − **imposto sobre faturamento de 6%**, Simples/ISS), com uma composição que **fecha**.
  - **Contagem dupla de comissão corrigida:** a planilha inclui "Comissão do canal R$ 28,50/diária" no custo por UH e também desconta a comissão % na fórmula. O usuário decidiu remover a comissão em R$ do custo e manter só a comissão % na fórmula.
  - Tarifa líquida por canal (comissão + taxa de cartão/VCC).
  - Sazonalidade calculada a partir da **ocupação histórica real** dos flats, com override manual.
  - Ajustes por segmento e canal.
  - Telas de análise de **Orçamento anual** e **Indicadores por canal** (mix, receita líquida, RevPAR líquido).
- **Comissões:** os markups por canal não podem ser aplicados em dobro.
- **Travas obrigatórias:**
  1. **Piso:** nunca enviar abaixo da tarifa mínima sustentável ou de um piso manual.
  2. **Variação:** uma variação acima de X% (configurável, padrão 30%) em relação ao último valor enviado fica retida até confirmação.
  3. **Publicação:** mudanças de custos e configurações só vão às OTAs depois de **pré-visualização + "Publicar"** pelo administrador.
- **Aprovação da interface:** a tela segue os mockups aprovados pelo usuário (ver Verification Resources).

### R5. Importação de reservas: caixa de entrada, quarentena, alterações e transição
- **Caixa de Entrada OTA:** toda reserva recebida entra numa "Caixa de Entrada OTA".
  - No modo automático, sem conflito, vira reserva real com flat alocado automaticamente pelo motor de alocação existente, café da manhã marcado conforme o plano, ID externo da OTA gravado e canal correto.
  - Com conflito ou dúvida, vai para a **quarentena**, onde o administrador decide.
- **Pagamento:**
  - `PaymentCollect=Channel`: pago pela OTA, com o valor líquido a receber registrado.
  - `PaymentCollect=Property`: pendente de cobrança no hotel, com alerta à recepção.
- **Automações (só no modo automático):** iguais às de uma reserva Booking/Airbnb digitada hoje (governança, café, e-mails de portaria/garagem, WhatsApp de boas-vindas e SERPRO/FNRH), **sem PIX**. No modo "somente observar", nenhuma automação dispara.
- **Cancelamento da OTA:** é aplicado automaticamente (cancela, libera o flat e reenvia o ARI), salvo se o hóspede já fez check-in; nesse caso vai para a quarentena.
- **Alteração da OTA:** é aplicada automaticamente se couber no mesmo flat ou em outro livre; se não couber, vai para a quarentena.
- **Histórico:** toda mudança grava o "antes e depois" no histórico da reserva.
- **Transição:** uma reserva recebida que corresponda com segurança a uma reserva digitada à mão (mesmo canal, mesmas datas, nome semelhante) é **vinculada**, sem duplicar e sem alterar a reserva existente. Na dúvida, vai para a quarentena. Antes de ligar, deve existir um **relatório de conciliação inicial**.

### R6. Cartões de crédito
- **Armazenamento:** o cartão recebido na reserva é guardado **criptografado**, com a chave fora do banco, em variável de ambiente. O **CVV nunca é armazenado**.
- **Visualização:** só administradores podem ver, após **redigitar a senha**, que gera um token de uso único de 5 min. Cada visualização é auditada.
- **Exclusão automática:** 7 dias após o check-out, ou imediatamente em caso de cancelamento sem multa.
- **Vazamento:** o número completo nunca aparece em logs, no blob, em respostas de listagem ou em backups em texto claro.
- **Escopo da proteção:** as telas e endpoints da integração exigem admin verificado no servidor. **Não alterar o login atual dos demais usuários.**

### R7. Mensagens e Avaliações (provisório)
- **Integração:** GetMessages/SendMessage com o chat de WhatsApp existente e GetReviews/RespondReview com a tela Review Insights existente.
- **Isolamento:** como a documentação oficial dessas seções está incompleta, a implementação fica isolada atrás de um adaptador, **desligada por padrão** e marcada como provisória até a WebBookingPro confirmar o formato.

### R8. Alertas
- **No sistema:** contador da Caixa de Entrada OTA e central de notificações.
- **WhatsApp e e-mail ao(s) gestor(es) em eventos críticos:** reserva em quarentena, overbooking, falha de envio de ARI por mais de 15 min e preço retido pela trava.
- **Resumo diário:** reservas recebidas, canceladas e pendências.
- **Configuração:** cada canal de alerta e cada tipo de evento pode ser ligado ou desligado por caixas de seleção.

### R9. Página de ajuda dentro do sistema (manual)
- **Formato:** um manual **bem elaborado, em português, para uso humano**, entregue **apenas como página de ajuda dentro do sistema**, com capturas de tela reais das telas construídas.
- **Parte do administrador:**
  - Como obter as credenciais da WebBookingPro.
  - Configuração e mapeamento de quartos e planos.
  - Modos (desligado, observar, automático) e como testar no sandbox.
  - Conciliação inicial e entrada em produção.
  - Precificação e travas, cartões, alertas.
  - Solução de problemas por código de erro.
- **Parte da recepção:** rotina diária, caixa de entrada e quarentena, conflitos, pagamentos.

### R10. Regras do projeto (AGENTS.md e repositório)
- **Paridade:** manter a paridade byte a byte entre `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs`, e também entre qualquer serviço duplicado novo ou alterado.
- **Build e commits:** ao alterar `artifacts/limpeza/src`, rodar `npm run build` em `artifacts/limpeza` e commitar o `dist/`. Todo commit recebe `git push` imediato para a branch ativa.
- **Testes:** **rodar SOMENTE os testes pontuais da integração criados neste projeto.** É proibido rodar `tests/*.test.mjs` em lote, varreduras ou testes de outros módulos. Não silenciar notificações no código.
- **Memória:** ajustar o limite de memória do processo para aproveitar o plano atual (cerca de 2 GB), com margem de segurança.

## Acceptance Criteria

### Segurança operacional
- [ ] Com o interruptor geral desligado, os testes pontuais da integração provam que não ocorre nenhuma chamada de saída à WebBookingPro (simulador com contador = 0), nenhum timer da integração é registrado e os callbacks respondem "não habilitado" sem gravar reservas.
- [ ] O mesmo booking entregue 5× por callback e 3× por polling, inclusive de forma concorrente, resulta em exatamente 1 reserva, sem ID ou código duplicado.
- [ ] Quando o processo é encerrado depois do registro do payload e antes do processamento, a reserva é processada corretamente ao reiniciar.
- [ ] O payload bruto fica gravado fora do blob principal e não é afetado por `pruneDatabase`.
- [ ] No modo "somente observar", nenhuma reserva é criada e nenhuma automação dispara (mocks de WhatsApp, e-mail e SERPRO com contador = 0).
- [ ] Os testes rodam com `DATABASE_URL` removida e sobre uma cópia do banco, demonstradamente.

### API e simulador
- [ ] 100% das requisições enviadas ao simulador nos testes passam pela validação contra `wbpAPI.yaml`.
- [ ] O simulador consegue injetar reserva nova, alterada, cancelada, erro 1001/1002/1102, timeout e NotifyBooking em form-urlencoded, e cada cenário tem teste pontual.
- [ ] O polling usa `wbp_booking_version` − 5 min e trata `null` (teste).

### ARI e precificação
- [ ] A carga completa cobre todas as datas de hoje até 31/12 do ano seguinte para o tipo "Flat" × 2 planos, e `units` bate com o cálculo único de disponibilidade em datas com reservas, bloqueios, manutenções e pré-reservas (teste com cenários construídos).
- [ ] Teto por plano: o valor enviado é sempre `min(teto, livres)` (teste).
- [ ] Preço "Com café" = "Sem café" + valor por hóspede, e é refletido corretamente para 1, 2 e 3 hóspedes nos campos da API (teste).
- [ ] As 7 restrições aparecem no ARI quando configuradas, e `minNights` passa a ser respeitada (teste).
- [ ] Após criar ou cancelar uma reserva, o ARI incremental das datas afetadas chega ao simulador em ≤ 10 s (teste).
- [ ] Trava de piso: nenhum preço abaixo do piso é enviado. Trava de variação: uma mudança acima de X% fica retida até confirmação. Mudanças de configuração não são enviadas antes de "Publicar" (testes).
- [ ] Com os dados reais da planilha, corrigida a contagem dupla de comissão (custo por UH = R$ 101,62 + 23,25 + 15,51 + 9,00 = **R$ 149,38**, sem a "comissão R$/diária"), a tarifa mínima = 149,38 ÷ (1 − 0,15 − 0,25 − 0,06) = **R$ 276,63 (± R$ 0,05)**, e a composição soma exatamente a tarifa mínima (teste).

### Reservas
- [ ] Reserva sem conflito no modo automático: flat alocado, café conforme o plano, ID externo gravado, `PaymentCollect` mapeado corretamente, automações disparadas (exceto PIX) (teste).
- [ ] Os conflitos (overbooking, flat bloqueado, correspondência ambígua com reserva manual) vão para a quarentena e geram um alerta (teste).
- [ ] O cancelamento libera o flat e reenvia o ARI. Com check-in feito, vai para a quarentena (teste).
- [ ] A alteração é aplicada quando cabe e vai para a quarentena quando não cabe, e o histórico contém o "antes e depois" (teste).
- [ ] Uma reserva manual pré-existente compatível é vinculada, não duplicada, e permanece inalterada, exceto pelo vínculo (teste). O relatório de conciliação inicial lista as correspondências seguras e as duvidosas.

### Cartões
- [ ] Depois de receber uma reserva com cartão, uma busca pelo número completo e pelo CVV no blob do banco, nos logs, no `audit_logs.jsonl` e nas respostas da API retorna **zero** ocorrências (teste).
- [ ] A visualização exige o token de redigitação de senha (expira em 5 min, uso único) e é auditada. A exclusão automática ocorre na regra de 7 dias e no cancelamento (teste com time-travel).

### Repositório e entrega
- [ ] Os hashes SHA-256 dos arquivos gêmeos são idênticos no commit final.
- [ ] `npm run build` em `artifacts/limpeza` conclui sem erro e o `dist/` está commitado.
- [ ] Todo o trabalho está commitado e com push na branch `feature/wbp-integration`, e a `main` não foi alterada.
- [ ] A página de ajuda existe no sistema, cobre todos os tópicos do R9 e contém capturas de tela reais. Um avaliador independente confere tópico a tópico e reprova se algum estiver ausente ou genérico.
- [ ] A tela de precificação corresponde aos mockups aprovados. Um avaliador independente compara elemento a elemento.
- [ ] Mensagens e Avaliações estão implementadas atrás de um adaptador, desligadas por padrão, com testes contra o simulador.

## Verification Resources
- O padrão de teste pontual do repositório é `tests/tariff-engine.test.mjs`: servidor isolado com porta exclusiva, `DATA_FILE` numa cópia e `NODE_ENV=test`.
- Há infraestrutura de sandbox em `e2e/sandbox/` (mock-zapi, mock-smtp, time-travel, db-seeder).
- Mockups da interface (layout e fluxo), em `C:\Users\mille\.gemini\antigravity\brain\70356aec-b041-4a86-8517-6963f7cb2aa9\`:
  - `mockup_precificacao_1791928509939.jpg`: aba Tarifa Mínima. Os números do desenho são os antigos; valem os do critério corrigido (R$ 149,38 → R$ 276,63).
  - `mockup_previsualizacao_v2_1791928602700.jpg`: Pré-visualização & Publicar.
  - `mockup_caixa_entrada_ota_1791928543273.jpg`: Caixa de Entrada OTA. As linhas repetidas da lista são um erro do desenho.
  - As notas sobre os mockups estão em `mockups.md`.
- Estado do repositório em 13/10 às 18:56: `main` sincronizada com `origin/main` (último commit `0501d02`) e arquivos gêmeos idênticos. A única alteração não commitada são 11 linhas de log local em `artifacts/api-server/audit_logs.jsonl`. Preservá-las no primeiro commit da branch.


## Follow-up — 2026-10-13T22:21:28Z

CORREÇÃO URGENTE do usuário (repassar ao orquestrador e a todos os workers):

1) BRANCH: a verificação às 19:21 mostra que o repositório está em `main` (git branch --show-current = main), com PROJECT.md modificado na working tree da main. Antes de QUALQUER commit, criar e fazer checkout de `feature/wbp-integration` a partir de `0501d02` (git switch -c feature/wbp-integration), levando junto as alterações não commitadas. Nenhum commit ou push na main. Confirmem o branch antes de cada commit.

2) NÃO PERDER DOCUMENTAÇÃO EXISTENTE: `PROJECT.md` (projeto anterior "Smart Flat Hub") foi sobrescrito, e `TEST_INFRA.md` / `TEST_READY.md` (projeto anterior "Reservation Modification Flow") correm o mesmo risco. Preservar o conteúdo original: o mais simples é usar arquivos próprios deste projeto, por exemplo `docs/integracoes/webbookingpro/PROJECT.md` e `.../TEST_INFRA.md`, e restaurar os originais na raiz com `git checkout 0501d02 -- PROJECT.md`. A alternativa é acrescentar uma seção nova sem remover nada do conteúdo anterior.

3) `artifacts/api-server/audit_logs.jsonl` tem 11 linhas locais não commitadas, que devem ser preservadas (não fazer checkout ou reset desse arquivo).

Respondam confirmando os três pontos.

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


## Follow-up — 2026-10-13T22:49:53Z

ALERTA DE RISCO OPERACIONAL para o M2 (repassar ao orquestrador e ao worker_m2):

O motor de tarifas atual (`calculateDailyRate`, `getTariffSettings`, `calculateSebraeSustainableRate`, `db.tariffSettings`/`tariffOverrides`) também é usado FORA da integração: no motor de reservas do site (direct-booking), nas cotações do bot (`/api/bot-actions/quote`), na tela de Tarifas e no cálculo de `dailyRates` ao criar reservas manuais. Pelo R1, com a integração desligada o sistema deve se comportar EXATAMENTE como hoje.

Requisitos para o M2:
1) A nova precificação SEBRAE (custos corrigidos, imposto de 6%, sazonalidade por ocupação real etc.) NÃO pode alterar os preços que o site, o bot e as reservas manuais calculam hoje enquanto o usuário não a ativar explicitamente, pela pré-visualização e "Publicar" ou por uma chave própria. Os valores e os modos existentes de `db.tariffSettings` devem ser preservados, sem migração destrutiva.
2) O cálculo canônico de disponibilidade alimenta o ARI. Nas telas atuais, ele só pode ACRESCENTAR avisos de conflito, sem bloquear e sem mudar os resultados dos endpoints de disponibilidade existentes para o site e o bot, a menos que isso seja explicitamente desejado e aprovado.
3) Incluir no M2 um teste pontual de regressão: com a integração desligada e sem nenhuma publicação, `calculateDailyRate` e o endpoint de cotação retornam os mesmos valores de antes da mudança para um conjunto de datas, flats e canais.

Confirmem.


## Follow-up — 2026-10-13T23:09:48Z

REVISÃO DO USUÁRIO/ORQUESTRADOR-PAI sobre tests/wbp-integration/m2-availability-pricing.test.mjs — BLOQUEANTE para o gate do M2 (não executar o teste antes de corrigir):

1) ISOLAMENTO QUEBRADO (crítico): imports ESM são içados (hoisted). O `delete process.env.DATABASE_URL` da linha 24 roda DEPOIS de `demo-server.mjs` já ter sido avaliado (import da linha 42). Além disso o teste NÃO define DATA_FILE nem NODE_ENV=test, então o demo-server carrega e pode regravar o `data/database.json` REAL (DB_FILE, linha ~671 do demo-server). Corrigir: definir DATABASE_URL removida, DATA_FILE=cópia temporária em os.tmpdir() e NODE_ENV=test ANTES do carregamento — p.ex. num arquivo setup importado primeiro (`import "./_env-setup.mjs"` como primeiro import) ou via `await import()` dinâmico depois de configurar o env; ou seguir o padrão de tests/tariff-engine.test.mjs (servidor filho isolado). Provar no teste que DB_FILE aponta para a cópia e que o data/database.json real não teve mtime/hash alterado.

2) GUARDA DE NÃO-REGRESSÃO FRACA: as asserções atuais só verificam proporções internas (booking = direct×1.18 etc.), o que passaria mesmo se o preço base mudasse. Exigência: comparar com valores-ouro do comportamento LEGADO real — gerar os valores de calculateDailyRate (vários flats, datas dia de semana/fim de semana/alta/baixa, canais direct/booking/airbnb, com e sem overrides P1–P4) usando o demo-server da `main` (commit 0501d02, via `git show 0501d02:artifacts/api-server/demo-server.mjs` num diretório temporário, sobre a MESMA cópia de dados) e afirmar igualdade exata com o da branch, com a integração desligada/não publicada.

3) /api/bot-actions/quote: o cabeçalho diz que é coberto, mas não há teste. Adicionar comparação legado vs branch da cotação do bot e do endpoint de cotação/preço usado pelo site público, com integração desligada.

4) Lembrete AGENTS.md: rodar apenas este arquivo de teste pontual; nada de lote.

Por favor confirmem as correções e me mandem as linhas alteradas antes do gate.


## Follow-up — 2026-10-13T23:21:48Z

Revisei a nova versão do m2-availability-pricing.test.mjs. Isolamento e comparação com 0501d02: APROVADOS no conceito. Restam 3 ajustes (rápidos) antes do gate:

1) P1–P4 provavelmente vazio (linhas 789–836): os overrides são gravados no arquivo DEPOIS dos servidores subirem; o demo-server mantém o estado em memória, então os dois devem estar comparando SEM overrides. Corrigir: injetar os overrides na cópia ANTES do spawn (ou via API idêntica nos dois servidores) e ASSERTAR que o override aparece (ex.: flat 1 em 2026-11-18 direct = 399.00 nos dois) — prova de que o caso não é vácuo.

2) Um único arquivo de DB compartilhado pelos dois processos (legado e ativo gravam com debounce no mesmo isolatedDbPath) — frágil/condição de corrida. Usar DUAS cópias temporárias idênticas (uma por servidor) e apagá-las no after.

3) O teste da linha 685 cria reserva (POST /api/pms/reservations) só no servidor ativo, o que faz os estados divergirem para as comparações seguintes (availability/quote). Mover para depois das comparações ou rodar contra uma instância separada; e garantir que as comparações de availability/quote cubram datas com reservas existentes (não só datas vazias).

Rodar novamente apenas este arquivo pontual e me reportar a contagem de testes e as asserções do item 1.


## Follow-up — 2026-10-14T00:41:50Z

REVISÃO PREVENTIVA DE M3 (m3-ari-sync.test.mjs) — ajustar antes de fechar o Portão 3:

1) CRÍTICO (AGENTS.md — não disparar rotinas/notificações em testes): na linha 528 de `tests/wbp-integration/m3-ari-sync.test.mjs`, ANTES do `await import("../../artifacts/api-server/demo-server.mjs")`, falta definir `process.env.NODE_ENV = "test"` e `process.env.PORT = String(serverPort)`. Sem `NODE_ENV = "test"`, a linha 35811 do `demo-server.mjs` executa `startMonitoringEngine()` ao importar e abre um `httpServer` extra na porta padrão (3000) que não é fechado no `after()`. Definir `process.env.NODE_ENV = "test"` no topo do arquivo (e antes do import), usar `process.env.PORT = String(serverPort)` e fechar `serverModule.httpServer` no `after()`.

2) Asserção de integridade do `data/database.json` real (hash SHA-256 e mtime inalterados antes/depois), igual ao M2.

3) Critérios de aceite obrigatórios de M3 no teste contra o Simulador WBP real (`e2e/wbp-simulator`):
   - Verificar que o `ARIUpdate` gerado pelo `WbpAriSynchronizer` (tanto no full push quanto no incremental após criar/cancelar reserva via rota PMS) chega ao Simulador WBP em ≤ 10s e passa 100% na validação de schema (`wbpAPI.yaml`) do simulador.
   - Incluir no teste de `variationLimitPct` o caso explícito `variationLimitPct: 0` (confirmando que não é confundido silenciosamente e que respeita o fallback/validação documentada).

Por favor apliquem esses ajustes no `m3-ari-sync.test.mjs` durante o Portão 3.


## Follow-up — 2026-10-14T01:36:32Z

DIRETIVA PREVENTIVA DE ARQUITETURA PARA O MARCO 4 (incorporar já no desenho dos Explorers e no Worker de M4):

1) ISOLAMENTO DE NOTIFICAÇÕES EM TESTES (CRÍTICO — AGENTS.md):
   - O M4 testa automações (WhatsApp, e-mail portaria/garagem, SERPRO, alertas ao gestor). Nos testes de M4 (`tests/wbp-integration/m4-*.test.mjs`), NENHUMA mensagem real pode sair para WhatsApp (Z-API), SMTP ou SERPRO, e o código de produção NÃO pode ter notificações silenciadas/comentadas (regra do AGENTS.md). Usar estritamente injeção/interceptador de transporte ou os mocks de sandbox (`e2e/sandbox/mock-zapi`, `mock-smtp`) + `NODE_ENV="test"`, `DATABASE_URL` removida, `DATA_FILE` em `os.tmpdir()` e asserção de hash/mtime do `data/database.json` real.

2) PAGAMENTO `PaymentCollect` vs REGRA LEGADA `pago_total` (R5):
   - O código legado do `demo-server.mjs` força `paymentStatus = "pago_total"` para `booking`/`airbnb`. Para reservas vindas da WBP:
     • `PaymentCollect = "Channel"` → pago pela OTA (`pago_total`), registrando o valor líquido a receber (`netAmount` / comissão descontada).
     • `PaymentCollect = "Property"` → pendente de cobrança no hotel (`pendente`), NÃO pode ser sobrescrito para `pago_total` pela regra legada, e gera alerta para a recepção cobrar no check-in.

3) HIGIENE DE CARTÕES JÁ NA INGESTÃO DE M4 / `storage.mjs` (R6):
   - O payload de reserva da WBP (`BookingCreate`/`GetBookingId`) pode trazer `Cards` (PAN e CVV). Garantir já na entrada (`storage.mjs` e `inbox.mjs`) que:
     • O CVV (`card_cvv`, `cvv`, `cvc`, `security_code`) é descartado IMEDIATAMENTE em memória antes de gravar qualquer arquivo (nem no `wbp_storage_state.json`, nem no blob `db`, nem em logs).
     • O número completo do cartão (PAN) NUNCA entra em `db.reservations`, `wbpInbox`, `quarantineBookings`, `audit_logs.jsonl` ou `console.log` (guardar no registro da reserva apenas máscara/last4 + referência ao cofre criptografado que será completado no M5).

4) TRANSIÇÃO / DEDUPLICAÇÃO SEGURA (R5):
   - Reservas manuais existentes de Booking/Airbnb que casem com segurança (mesmo canal, mesmas datas, nome compatível) são apenas VINCULADAS (`externalOrderId` / metadado WBP), sem duplicar e sem alterar flat/preço/status da reserva manual. Casos duvidosos (ex.: datas parciais ou nome divergente) vão para a Quarentena. Incluir o gerador do Relatório de Conciliação Inicial.


## Follow-up — 2026-10-14T02:03:06Z

AJUSTES PONTUAIS EM `artifacts/api-server/wbp/alerts.mjs` (detectados na leitura imediata do arquivo, aplicar já no `worker_m4_wbp` e espelhar em `scripts/wbp/alerts.mjs`):

1) Respeito estrito ao interruptor geral (`off` / `observe`) e `NODE_ENV === "test"`:
   - Em `startDailySummaryScheduler(db)`: se a integração estiver `off`, NÃO registrar `setInterval` (critério de aceite: "Com o interruptor geral desligado... nenhum timer da integração é registrado"). No callback do timer, checar se está habilitada (`auto`).
   - No modo `observe` ou `off`, NENHUM envio externo (WhatsApp/e-mail) pode disparar (critério de aceite: "No modo somente observar... mocks de WhatsApp, e-mail e SERPRO com contador = 0").
   - Nas linhas 131 e 152 (`global.sendZapiMessage` / `global.sendEmailAsync`), nunca chamar o sender global se `process.env.NODE_ENV === "test"` (em teste só usar `this.zapiSender` / `this.emailSender` injetados).

2) `sendPricingLockAlert` (linha 312 — R8):
   - R8 exige WhatsApp **e e-mail** ao gestor nos 4 eventos críticos (quarentena, overbooking, falha ARI > 15 min e **preço retido pela trava**). Hoje `sendPricingLockAlert` envia só WhatsApp; adicionar envio de e-mail quando `settings.channels.email && settings.recipients.managerEmail`.

3) Toggle `triggers.onOverbooking` (linha 195):
   - Em `sendImmediateQuarantineAlert`, quando `reason === "OVERBOOKING"`, respeitar `settings.triggers.onOverbooking` (e `settings.triggers.onQuarantine` para os demais motivos), para que a caixa de seleção `onOverbooking` funcione de forma independente.

4) Resumo diário (linha 392 — R8):
   - R8 pede "reservas recebidas, **canceladas** e pendências". Incluir no cálculo e no texto de `dispatchDailySummaryAlert` a contagem de reservas OTA **canceladas** nas últimas 24h (`cancelled24h`).


## Follow-up — 2026-10-14T02:04:36Z

AJUSTES PONTUAIS EM `artifacts/api-server/wbp/reconciler.mjs` (detectados na leitura imediata do arquivo, aplicar já no `worker_m4_wbp` e espelhar em `scripts/wbp/reconciler.mjs`):

1) Condição de `isSafeMatch` (linhas 226 e 273 — R5):
   - R5 exige "mesmo canal, mesmas datas, nome semelhante" para vínculo seguro; qualquer divergência de data ou canal é dúvida e deve ir para a Quarentena.
   - Problema A: hoje, se apenas 1 data coincidir (15 pts) + canal (20) + nome (30) + telefone (15) + preço (5) = 85 pts >= 80 → classificaria como `isSafeMatch = true` com datas diferentes!
   - Problema B: hoje, se canal (20) + datas exatas (30) + nome com similaridade 0.85..0.94 (25 pts) e sem telefone/preço digitado no PMS = 75 pts < 80 → cairia em ambíguo apesar do comentário da linha 272 dizer "If dates match exactly and name similarity >= 85% and same channel -> safe match".
   - Correção: `isSafeMatch` DEVE exigir obrigatoriamente `exactChannelMatch && exactDateMatch && nameSim >= 0.85` (e ajustar o score para >= 80 nesse caso); se `score >= 50` mas `!exactChannelMatch || !exactDateMatch`, classificar sempre como `isAmbiguous = true` (`isSafeMatch = false`) para ir à Quarentena.

2) Preservação estrita no vínculo (`applySafeReconciliationLink`, linha 353):
   - Critério de aceite: "Uma reserva manual pré-existente compatível é vinculada, não duplicada, e permanece inalterada, exceto pelo vínculo (teste)".
   - Não sobrescrever campos existentes da reserva manual (guardar os metadados do vínculo apenas em `externalOrderId`, `wbpBookingId`, `wbpSynced`, `wbpMatchedAt` / `wbpLinkMeta`).


## Follow-up — 2026-10-14T02:10:11Z

AJUSTES CRÍTICOS EM `artifacts/api-server/wbp/inbox.mjs` (detectados na leitura imediata do arquivo, aplicar já no `worker_m4_wbp` e espelhar em `scripts/wbp/inbox.mjs`):

1) Vazamento de PAN em `normalizeOtaBooking` / `stripCvvDeep` (linhas 50 e 108 — R6):
   - `stripCvvDeep` remove o CVV, mas mantém `CardNumber`/`cardNumber`/`pan` em claro dentro de `sanitized`, que vai para `normalized.rawPayload` e é salvo em `db.wbpInbox` (linhas 739 e 825)!
   - Correção: em `stripCvvDeep` (ou `normalizeOtaBooking`), mascarar também qualquer campo `CardNumber` / `card_number` / `cardNumber` / `pan` no objeto `sanitized` (usando `maskPan`) DEPOIS de extrair `cardLast4` e `cardBrand`, garantindo ZERO PAN completo em `normalized.rawPayload` e em `db.wbpInbox`.

2) Gravação de `netAmount` e `commissionAmount` em `newReservation` (linha 765 — R5):
   - R5 exige: "`PaymentCollect=Channel`: pago pela OTA, com o valor líquido a receber registrado".
   - `normalizeOtaBooking` já calcula `normalized.netAmount` e `normalized.commissionAmount`, mas `newReservation` (linha 765) esqueceu de incluí-los! Adicionar `netAmount: normalized.netAmount`, `commissionAmount: normalized.commissionAmount`, `cardLast4: normalized.cardLast4`, `cardBrand: normalized.cardBrand` no objeto `newReservation`.

3) Guarda de cancelamento em `handleOtaCancellation` (linhas 450–455 — R5):
   - Critério de aceite: "O cancelamento libera o flat e reenvia o ARI. Com check-in feito, vai para a quarentena (teste)".
   - Na linha 453, `isPastCheckinTimeToday` bloqueia cancelamento mesmo quando `status === "ativa"` (sem check-in feito) se a data for hoje/passada. Remover `isPastCheckinTimeToday` da condição de bloqueio e bloquear estritamente quando o check-in estiver feito (`existing.status === "checked_in" || existing.status === "hospedado" || existing.status === "checkin_realizado" || existing.checkedIn === true || Boolean(existing.checkedInAt)`).

4) Histórico estruturado "antes e depois" em `handleOtaModification` (linhas 545–601 — R5):
   - Critério de aceite: "e o histórico contém o 'antes e depois' (teste)".
   - Ao aplicar modificação (mesmo flat ou realocada), capturar `before = { flatId: existing.flatId, flatNumber: existing.flatNumber, checkinDate: oldCheckin, checkoutDate: oldCheckout, totalAmount: existing.totalAmount, breakfastIncluded: existing.breakfastIncluded, guestCount: existing.guestCount }` e `after = { ... }` e gravar `before` e `after` tanto no item de `existing.auditLogs` quanto em `existing.history` / `existing.modificationHistory`.

5) Automações completas no modo `auto` (linhas 830–857 — R5):
   - Critério de aceite: "Reserva sem conflito no modo automático: flat alocado, café conforme o plano, ID externo gravado, PaymentCollect mapeado corretamente, automações disparadas (exceto PIX) (teste)".
   - Em `processIncomingOTA` (modo `auto`, e NUNCA em `observe`): além de `cleaningRequests` (governança) e café (`breakfastIncluded`), disparar sempre no modo `auto`:
     • WhatsApp de boas-vindas (via `alertsManager.sendWhatsApp` para `normalized.guestPhone`, sem PIX);
     • E-mail de portaria/recepção (via `alertsManager.sendEmail`, independentemente de `checkinDate === todayStr`);
     • Registro de fila/evento SERPRO/FNRH (ex.: `db.serproQueue.push(...)` + `newReservation.fnrhStatus = "enviado"` ou hook em `alertsManager`), mantendo `pixTxId: null` e `pixCopiaECola: null`.

## Follow-up — 2026-10-14T02:21:14Z

DETALHE IMPORTANTE EM `artifacts/api-server/wbp/inbox.mjs` (linhas 508, 619, 685 e 977):

- O worker colocou `if (process.env.NODE_ENV !== "test")` em volta de `notifyPmsMutation(...)` em `handleOtaCancellation`, `handleOtaModification` e `processIncomingOTA`.
- Problema: todos os testes rodam com `NODE_ENV === "test"`, e o critério de aceite exige provar em teste que **"O cancelamento libera o flat e reenvia o ARI"** (e também na criação/modificação). Com `if (process.env.NODE_ENV !== "test")`, o `notifyPmsMutation` fica silenciado nos testes (o que também fere a regra do AGENTS.md de não colocar guardas `NODE_ENV !== "test"` para silenciar comportamento no código).
- Solução limpa: remover o `if (process.env.NODE_ENV !== "test")` das chamadas a `notifyPmsMutation` em `inbox.mjs` (para que `notifyPmsMutation` SEMPRE seja chamado em `auto`) e, em `ari-sync.mjs`, chamar `.unref()` nos timers de debounce (`if (this.debounceTimer?.unref) this.debounceTimer.unref(); if (this.maxWaitTimer?.unref) this.maxWaitTimer.unref();`) para que o processo do `node --test` nunca fique preso esperando timer pendente ao encerrar. E sincronizar os gêmeos em `scripts/wbp/`.

## Follow-up — 2026-10-14T02:42:05Z

HIGIENE DO REPOSITÓRIO ANTES DO COMMIT DE M4 (`audit_logs.jsonl`):

- Detectei no `git status` que `artifacts/api-server/audit_logs.jsonl` recebeu linhas de teste (`Pre Hóspede 3`, `RES-503` etc.) durante o teste do Challenger 2 às 01:28Z, porque a linha 6869 do `demo-server.mjs` tinha caminho fixo:
  `const AUDIT_LOG_FILE = path.join(__dirname, "audit_logs.jsonl");`
- Antes do commit de M4:
  1) Restaurar `artifacts/api-server/audit_logs.jsonl` (`git checkout -- artifacts/api-server/audit_logs.jsonl`) para remover as linhas sintéticas de teste e preservar apenas os logs reais já commitados em `13d5043`.
  2) Na linha ~6869 de `artifacts/api-server/demo-server.mjs` (e espelhar em `scripts/demo-server.mjs`), isolar o `AUDIT_LOG_FILE` em testes:
     `const AUDIT_LOG_FILE = process.env.AUDIT_LOG_FILE || (process.env.NODE_ENV === "test" && process.env.DATA_FILE ? path.join(path.dirname(process.env.DATA_FILE), "audit_logs.jsonl") : path.join(__dirname, "audit_logs.jsonl"));`
     Assim qualquer teste com `NODE_ENV === "test"` e `DATA_FILE` em `os.tmpdir()` grava `audit_logs.jsonl` no diretório temporário e nunca suja o repositório.

## Follow-up — 2026-10-14T03:33:42Z

DIRETIVA PREVENTIVA DE ARQUITETURA PARA O MARCO 5 (F25 a F31 — incorporar nos Explorers e Workers de M5):

1) COFRE DE CARTÕES (F25 & F26 — R6):
   - Integrar o `CreditCardVault` (AES-256-GCM com chave em variável de ambiente, nunca no blob) ao fluxo de entrada de reservas (`callbacks.mjs` / `inbox.mjs`): capturar o cartão (descartando o CVV em memória imediatamente!) e criptografá-lo no cofre ANTES do mascaramento do PAN no payload.
   - Garantir em teste que uma varredura pelo PAN completo e pelo CVV no blob do banco, no `wbp_storage_state.json`, nos logs, no `audit_logs.jsonl` e nas respostas de listagem da API retorna **ZERO ocorrências**.
   - Token de visualização: exige admin + redigitação da senha → gera token de **uso único** (invalidado após 1 leitura!) e **validade de 5 minutos**, gravando auditoria a cada visualização. **Não alterar o login atual dos demais usuários.**
   - Auto-purge: expurgar automaticamente cartões **7 dias após o check-out** e **imediatamente no cancelamento sem multa** (testar ambos com avanço de tempo/data).

2) ADAPTADORES PROVISÓRIOS DE MENSAGENS E AVALIAÇÕES (F27 — R7):
   - `GetMessages`/`SendMessage` (integrado ao chat existente) e `GetReviews`/`RespondReview` (integrado ao Review Insights existente) isolados atrás de um adaptador, **desligados por padrão**, marcados como provisórios e testados contra o simulador WBP.

3) TELAS DE UI FIÉIS AOS MOCKUPS APROVADOS (F28 & F29 — R4, R5):
   - Precificação SEBRAE: seguir o layout de `mockup_precificacao_1791928509939.jpg` com os números corrigidos (**Custo por UH R$ 149,38 → Tarifa Mínima R$ 276,63** e decomposição 100%), mais o modal/painel de Pré-visualização & Publicar (`mockup_previsualizacao_v2_1791928602700.jpg`), Orçamento Anual, Indicadores por Canal (mix, receita líquida, RevPAR líquido), Mapeamento de Quartos/Planos e 7 Restrições.
   - Caixa de Entrada OTA e Quarentena: seguir `mockup_caixa_entrada_ota_1791928543273.jpg` (sem linhas duplicadas), com abas, filtros, gaveta de resolução de quarentena, conciliação inicial e visualização segura de cartão com modal de senha do admin.

4) PÁGINA DE AJUDA / MANUAL HUMANO EM PORTUGUÊS COM CAPTURAS REAIS (F30 — R9):
   - Entregue **apenas como página de ajuda dentro do sistema**, rica e didática em português:
     • **Parte do Administrador:** obtenção de credenciais WBP (formulário de parceria, `cid`, `shared_secret`), configuração e mapeamento de quartos/planos, modos (`off`, `observe`, `auto`) e teste no sandbox, conciliação inicial e entrada em produção, precificação SEBRAE e travas, cofre de cartões, configuração de alertas e tabela de solução de problemas por código de erro (`4`, `1001`, `1002`, `1003`, `1031`, `1102`, `9203`).
     • **Parte da Recepção:** rotina diária, Caixa de Entrada OTA e Quarentena, resolução de conflitos, cobrança `PaymentCollect=Property` vs `Channel`.
     • **Capturas de tela reais** das telas construídas no sistema (servidas em `public/` ou embutidas na página de ajuda).

5) BUILD & PARIDADE (F31 — R10):
   - Rodar `npm run build` em `artifacts/limpeza` e incluir `artifacts/limpeza/dist/` no commit. Manter paridade SHA-256 em 100% dos arquivos gêmeos de `artifacts/api-server/` e `scripts/`.

## Follow-up — 2026-10-14T04:10:30Z

AJUSTES PREVENTIVOS EM `artifacts/api-server/wbp/vault.mjs` E INTEGRAÇÃO COM `callbacks.mjs` / `inbox.mjs` (aplicar já no `worker_m5_backend` e espelhar em `scripts/wbp/`):

1) Segurança de boot em Produção sem variável configurada (`vault.mjs`, linha 140):
   - Hoje `_resolveKey()` é chamado no construtor `new CreditCardVault()` e lança `Error("Vault key missing...")` se `NODE_ENV !== "test"` e `CREDIT_CARD_VAULT_KEY` não estiver definida.
   - Risco crítico: quando o código subir para o Render com a integração desligada por padrão (antes de o usuário cadastrar `CREDIT_CARD_VAULT_KEY` no painel do Render), qualquer chamada a `getCardVault()` no startup derrubaria o servidor!
   - Correção: não lançar erro no construtor de `CreditCardVault`; se `CREDIT_CARD_VAULT_KEY` / `WBP_VAULT_KEY` não estiver definida, usar uma chave derivada local de fallback (com `console.warn` apenas quando tentar criptografar em produção), garantindo que o servidor sempre suba com segurança.

2) Guarda do interruptor geral em `startCardAutoPurgeScheduler` (`vault.mjs`, linha 607):
   - Se a integração estiver `off` (`!isWbpEnabled(db)`), `startCardAutoPurgeScheduler` NÃO deve registrar `setInterval` (critério de aceite: zero timers registrados com o interruptor geral desligado).

3) Fiação automática do Cofre na entrada e no cancelamento (`callbacks.mjs` e `inbox.mjs`):
   - Na entrada da reserva (`BookingCreate`, `NotifyBooking`/`GetBookingId`, `processIncomingOTA`): antes de mascarar o PAN, extrair o cartão (já sem CVV!) e gravar no cofre via `getCardVault().storeCard({ orderId, cardData, checkoutDate })`, vinculando `reservationId` e `checkoutDate` ao criar a reserva (`linkReservation`).
   - Em `handleOtaCancellation` (`inbox.mjs`): ao cancelar a reserva (sem multa), chamar automaticamente `getCardVault().purgeCard(normalized.externalOrderId, "cancelled_without_penalty", db)` para cumprir o critério de exclusão imediata no cancelamento sem multa.

## Follow-up — 2026-10-14T04:15:34Z

DIRETIVAS DE REFINAMENTO DO MANUAL OPERACIONAL EM `WbpHelpManualPage.tsx` (Critério Estrito de Avaliação do R9):

1. **Capturas de Tela Reais (tags `<img>`) em `WbpHelpManualPage.tsx`:**
   - Na Seção 4 (`value="screens"`), incluir elementos reais `<img>` apontando para `/manual/...` (copiar as imagens dos mockups aprovados ou capturas reais para `artifacts/limpeza/public/manual/`, ex: `precificacao-sebrae.jpg`, `previsualizacao-publicar.jpg`, `caixa-entrada-ota.jpg`).
   - Usar `<img src="/manual/..." alt="..." className="w-full rounded-xl border border-border shadow-sm" />` para que as capturas visuais reais sejam renderizadas na página de ajuda interna.

2. **Completude Explícita de Todos os Subtópicos de Administrador (R9) na Seção 1 (`value="admin"`):**
   - **1.1 (Credenciais):** incluir URL oficial de solicitação de parceria (`https://www.webbookingpro.com/become-a-partner/`), credenciamento de conta de teste (`cid`, `shared_secret`), alinhamentos quinzenais de status e certificação, além do uso do simulador/sandbox local (`e2e/wbp-simulator`).
   - **1.6. Conciliação Inicial e Checklist de Entrada em Produção (Go-Live):** guia passo a passo da emissão do relatório de conciliação inicial (`/api/wbp/reconciliation-report`) antes de ligar o modo `auto`, vinculação segura de reservas manuais existentes (`channel` + `checkIn`/`checkOut` + similaridade de nome >= 80%) sem duplicar nem alterar, envio de casos ambíguos para quarentena, validação prévia em modo `observe` e disparo da carga completa de ARI inicial (até 31/dez do ano seguinte).
   - **1.7. Configuração de Alertas Críticos e Resumo Diário (08:00):** documentação do badge de notificação no sistema, alertas de WhatsApp/e-mail para a gerência nos 4 eventos críticos (reserva em quarentena, overbooking, falha de envio de ARI > 15 min, preço retido pela trava de variação), resumo diário às 08:00 (recebidas, canceladas, pendentes) e checkboxes de opt-in/opt-out por canal e evento.
   - **1.8. Mensagens e Avaliações (Adaptador Provisório):** explicitar que `GetMessages`/`SendMessage` e `GetReviews`/`RespondReview` estão isolados em adaptador provisório, desligados por padrão até a homologação da especificação final pela WebBookingPro.
   - **Seção 2 (Códigos de Erro):** adicionar também os códigos de erro `1004` (Invalid rate plan / room mapping) e `1100` / `1101` (Invalid date range / past date) de `docs/wbp/README.md` para cobrir todos os códigos `FAULT.OTA.*` documentados.


## Follow-up — 2026-10-14T06:18:30Z

URGENT Live Inspection of `tests/wbp-integration/e2e-tier2-boundaries.test.mjs`:
I inspected `e2e-tier2-boundaries.test.mjs` and `git status -s` and found the exact bugs causing `e2e-tier2-boundaries.test.mjs` issues and stray files:

1. **Missing `DATA_FILE` and isolated file env vars in `e2e-tier2-boundaries.test.mjs` (lines 106–118):**
   - `e2e-tier2-boundaries.test.mjs` passed `DATABASE_PATH: tempDbPath` instead of `DATA_FILE: tempDbPath`! And it omitted `WBP_RAW_STORAGE_FILE`, `WBP_IDEMPOTENCY_FILE`, and `WBP_CARD_VAULT_FILE` in `spawnEnv` (and in the parent process env), which caused `data/wbp_idempotency.json` and `data/wbp_raw_payloads.jsonl` to be created in the workspace `data/` folder!
   - Fix in `e2e-tier2-boundaries.test.mjs` (and ensure Tiers 3 & 4 do the same, matching `e2e-tier1-features.test.mjs` lines 146–160):
     - Set `DATA_FILE: tempDbPath`, `DATABASE_FILE: tempDbPath`, `WBP_RAW_STORAGE_FILE: path.join(tmpDir, "wbp_raw_payloads.jsonl")`, `WBP_IDEMPOTENCY_FILE: path.join(tmpDir, "wbp_idempotency.json")`, and `WBP_CARD_VAULT_FILE: path.join(tmpDir, "wbp_card_vault.json")` in BOTH `process.env` and `spawnEnv`!
   - Also delete the stray untracked files `data/wbp_idempotency.json` and `data/wbp_raw_payloads.jsonl`, and run `git checkout -- artifacts/api-server/audit_logs.jsonl` (and `git checkout -- data/database.json` if ever touched) so the workspace stays 100% clean!

2. **Wrong file paths in `e2e-tier2-boundaries.test.mjs` Section F30 (lines 1605–1635):**
   - Lines 1606, 1612, 1625, 1631 check `artifacts/limpeza/src/pages/WbpHelpManualPage.tsx`, which does not exist at that path! The manual component is at `artifacts/limpeza/src/components/wbp/WbpHelpManualPage.tsx` (and the page wrapper is at `artifacts/limpeza/src/pages/wbp-manual.tsx`).
   - Line 1621 checks `files.length >= 6` in `artifacts/limpeza/public/manual`, whereas `artifacts/limpeza/public/manual` contains the 3 real screenshot `.jpg` files (`precificacao-sebrae.jpg`, `previsualizacao-publicar.jpg`, `caixa-entrada-ota.jpg` -> `files.length >= 3`).
   - Line 1515–1516 checks `data.enableMessages` / `data.enableReviews` on `GET /api/wbp/provisional/settings`, whereas the endpoint returns `data.provisionalMessagesEnabled` and `data.provisionalReviewsEnabled` (check `e2e-tier1-features.test.mjs` / `m5-vault-ui.test.mjs` for exact field names).

Please pass these exact fixes to `test_writer_e2e_final` immediately so Tier 2, Tier 3, and Tier 4 pass cleanly on the first run!


## 2026-10-14T09:37:25Z

Auditar, testar, corrigir e aperfeiçoar todo o módulo de emissão de Nota Fiscal (NFS-e Municipal GissOnline e Padrão Nacional ADN) no Guest-Flow-Manager (CorpFlats), compatibilizando-o de ponta a ponta com o CRM 360° (Hóspedes, Solicitantes Terceiros e Empresas PJ) e automatizando no WhatsApp a solicitação, recepção, sanitização, enriquecimento (CNPJ/CEP) e vínculo de dados fiscais no CRM sem repetição de perguntas para clientes já vinculados a empresas.

Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager
Integrity mode: development

## Requirements

### R1. Auditoria, Correção e Aperfeiçoamento da Emissão de NFS-e
- Corrigir o bug de variáveis indefinidas (`numNfseReal` / `codVerifReal`) em `POST /api/nfse/emit` e garantir que tanto o motor municipal (`giss_prefeitura` via `giss-soap.mjs`) quanto o motor nacional (`padrao_nacional` via `national-nfse.mjs`) funcionem sem falhas, repassando integralmente todos os dados do tomador (CPF/CNPJ, Nome/Razão Social, Logradouro, Número, Bairro, CEP, Município/Código IBGE, UF, E-mail e Telefone), valores, alíquota, CNAE, item de serviço e discriminação formatada pelo template.
- Aperfeiçoar a auto-emissão e o rascunho/pré-preenchimento fiscal (incluindo no check-out e nas filas de notas pendentes) para que usem os dados reais de faturamento vinculados no CRM (priorizando a Empresa PJ vinculada quando houver `companyId`, e mantendo os dados do hóspede e da estadia na discriminação do serviço).
- Garantir que o Chat Assistente Fiscal (`POST /api/invoices/chat` e `chat-service.mjs`) também higienize, enriqueça (via lookup de CNPJ e CEP) e cadastre/atualize tanto Hóspedes (PF) quanto Empresas (PJ) no CRM (`db.guests` e `db.companies`).

### R2. Compatibilização Bidirecional CRM 360° (Hóspedes, Solicitantes & Empresas) ↔ Nota Fiscal
- Persistir e editar todos os campos fiscais e de endereço tanto no cadastro de Empresas (`db.companies` e modal de empresa em `crm-guests.tsx`: CNPJ, Razão Social, Nome Fantasia, Inscrição Estadual/Municipal, CEP, Logradouro/Endereço, Número, Bairro, Cidade, UF, Código IBGE, E-mail Financeiro, Telefone e Contato) quanto no cadastro de Hóspedes (`db.guests` e modal de hóspede em `crm-guests.tsx`: CPF/CNPJ, Nome Completo, CEP, Endereço, Número, Bairro, Cidade, UF, E-mail, Telefone, `companyId` e `autoEmitInvoice`).
- Na tela de Notas Fiscais (`fiscal-invoices.tsx`), atualizar o seletor do CRM e a importação via URL/parâmetros para:
  1. Permitir buscar e selecionar **Hóspedes (PF)**, **Empresas (PJ)** e **Reservas ativas/recentes**.
  2. Quando um Hóspede selecionado possuir uma **Empresa vinculada no CRM (`companyId`)**, preencher automaticamente os dados da **Empresa** como **Tomador da NFS-e** (CNPJ, Razão Social, Endereço completo, CEP, Cidade/UF, E-mail financeiro e Telefone), mantendo o nome do Hóspede, Flat, Check-in, Check-out e Diárias na **Discriminação do Serviço**, e exibindo uma opção rápida na interface para alternar o Tomador entre a *Empresa Vinculada (PJ)* e o *Próprio Hóspede (PF)* caso o operador deseje.
  3. Preencher automaticamente o valor do serviço, número do flat, datas de check-in/check-out e quantidade de diárias a partir da reserva ativa ou mais recente do hóspede/empresa quando disponível.

### R3. Automação de Solicitação, Sanitização e Vínculo de Nota Fiscal via WhatsApp
- Toda vez que uma pessoa (Hóspede titular ou Solicitante Terceiro da reserva) solicitar Nota Fiscal no WhatsApp (ex: "preciso de nota fiscal", "emite NF", "nota fiscal no CNPJ", "quero nota"):
  1. **Verificação de Vínculo no CRM**: Cruzar o telefone do remetente (e a reserva ativa/recente associada como titular ou `requesterInfo`) com `db.guests` e `db.companies`.
  2. **Caso JÁ esteja vinculada no CRM a dados de Empresa (`companyId` com CNPJ válido)**: **NÃO solicitar novamente os dados!** Responder imediatamente no WhatsApp confirmando que os dados da empresa já constam no cadastro (exibindo Razão Social e CNPJ formatado), vincular automaticamente a empresa e ativar `autoEmitInvoice = true` no hóspede e na reserva ativa/recente, além de deixar a solicitação/rascunho fiscal pré-preenchido e pronto para emissão na tela de Notas Fiscais (ou check-out).
  3. **Caso NÃO esteja vinculada a uma Empresa no CRM**: Enviar imediatamente uma mensagem clara e acolhedora no WhatsApp solicitando os dados para emissão da Nota Fiscal — perguntando se será para **Empresa / Pessoa Jurídica** (bastando informar o CNPJ e e-mail financeiro) ou **Pessoa Física** (Nome Completo, CPF, Endereço com CEP e E-mail) — e marcando o estado da conversa/contato como aguardando dados fiscais.
- Quando a pessoa responder no WhatsApp enviando os dados (na mesma mensagem do pedido ou nas mensagens seguintes):
  1. **Sanitização e Validação**: Higienizar CPF/CNPJ (apenas dígitos, validação matemática Módulo 11), Nome/Razão Social (`toTitleCase` preservando siglas corporativas LTDA, S/A, ME, EPP e preposições), Telefone (`cleanPhone`), CEP (`cleanCep` 8 dígitos) e E-mail (lowercase). Se o CPF ou CNPJ enviado for matematicamente inválido, avisar gentilmente no WhatsApp pedindo a conferência do número.
  2. **Enriquecimento Automático**: Se for CNPJ (14 dígitos válidos), consultar automaticamente `lookupCnpj` (CRM local / BrasilAPI / Receita) para obter Razão Social, Nome Fantasia, Logradouro, Número, Bairro, CEP, Município/UF, Telefone e E-mail; se houver CEP, consultar `lookupCep` (ViaCEP / BrasilAPI) para completar o endereço.
  3. **Inserção/Atualização e Vínculo no CRM**:
     - Se for **PJ (CNPJ)**: criar ou atualizar a empresa em `db.companies` com todos os dados sanitizados, vincular `companyId` e `companyName` no cadastro da pessoa em `db.guests` (criando o registro em `db.guests` caso ainda não exista) e na reserva ativa/recente (`db.reservations`), ativar `autoEmitInvoice = true`, e responder no WhatsApp confirmando o cadastro/vínculo da empresa (Razão Social e CNPJ) para a emissão da NF.
     - Se for **PF (CPF)**: criar ou atualizar o cadastro em `db.guests` e na reserva ativa/recente com CPF, Nome Completo, Endereço completo/CEP e E-mail sanitizados, ativar `autoEmitInvoice = true`, e responder no WhatsApp confirmando os dados recebidos para emissão da NF.

### R4. Regras Estritas de Repositório, Paridade Twin-Server, Build e Testes Pontuais
- Manter paridade byte-a-byte (100% SHA-256) entre `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs`.
- Rodar `npm run build` em `artifacts/limpeza` para atualizar `artifacts/limpeza/dist/`.
- **Escopo estrito de testes (`AGENTS.md`)**: NUNCA executar varreduras globais (`tests/*.test.mjs`) nem testes de outros módulos. Criar e executar EXCLUSIVAMENTE o teste pontual dedicado a esta demanda (`tests/nfse-crm-whatsapp-flow.test.mjs`).
- Realizar `git commit` e `git push` ao concluir.

## Acceptance Criteria

### Emissão de NFS-e e Endpoints Fiscais
- [ ] `POST /api/nfse/emit` emite com sucesso sem `ReferenceError` e persiste todos os campos de endereço e identificação do tomador (PF ou PJ) na nota gerada, retornando `status: 201`, `numeroNfse`, `codigoVerificacao` e `danfseUrl`.
- [ ] Quando uma nota é emitida ou pré-preenchida para reserva/hóspede vinculado a empresa (`companyId`), o Tomador recebe os dados da Empresa PJ e a discriminação preserva os dados do hóspede e da estadia.

### Integração CRM 360° ↔ Nota Fiscal
- [ ] Criar e editar uma Empresa (`POST /api/companies` e `PATCH /api/companies/:id`) e pela UI (`crm-guests.tsx`) salva e carrega corretamente CNPJ, Razão Social, Nome Fantasia, CEP, Endereço/Logradouro, Número, Bairro, Cidade, UF e E-mail Financeiro.
- [ ] Na tela `fiscal-invoices.tsx`, selecionar um hóspede que possui `companyId` preenche automaticamente os campos do Tomador com a Empresa vinculada (CNPJ, Razão Social, Endereço/CEP, E-mail, Telefone), preenche os dados da estadia (Flat, Check-in, Check-out, Diárias, Valor) quando houver reserva, e oferece alternância rápida entre Tomador PJ (Empresa) e Tomador PF (Hóspede).
- [ ] O seletor do CRM em `fiscal-invoices.tsx` permite pesquisar e selecionar tanto Hóspedes quanto Empresas cadastradas.

### Fluxo WhatsApp → Sanitização → CRM
- [ ] Quando um contato (Hóspede ou Solicitante Terceiro) **sem** empresa vinculada no CRM pede Nota Fiscal no WhatsApp, o sistema envia automaticamente a mensagem solicitando os dados de Empresa (CNPJ + e-mail) ou Pessoa Física (Nome, CPF, Endereço/CEP, E-mail).
- [ ] Quando o contato responde no WhatsApp com dados de CNPJ (ou CPF + dados PF), os dados são validados, sanitizados (`toTitleCase`, `onlyDigits`, `cleanCep`, `cleanPhone`, enriquecimento de CNPJ/CEP), salvos/atualizados em `db.companies` e `db.guests`, vinculados ao `companyId` do contato e à sua reserva (`autoEmitInvoice = true`), e confirmados na resposta do WhatsApp.
- [ ] Quando um contato que **já possui** empresa vinculada no CRM (`companyId`) solicita Nota Fiscal no WhatsApp, o sistema **não** solicita os dados novamente: responde confirmando a Razão Social e o CNPJ já vinculados no CRM e marca a reserva/hóspede com `autoEmitInvoice = true` e empresa vinculada.
- [ ] Se o contato enviar um CPF ou CNPJ com dígitos verificadores inválidos durante a coleta fiscal no WhatsApp, o sistema detecta a invalidade e solicita a correção sem poluir o CRM com documento inválido.

### Build, Paridade e Verificação Pontual
- [ ] `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs` possuem hash SHA-256 idêntico.
- [ ] `npm --prefix artifacts/limpeza run build` compila com código de saída 0.
- [ ] O arquivo de teste pontual `tests/nfse-crm-whatsapp-flow.test.mjs` passa 100% dos testes cobrindo emissão NFS-e, vínculo CRM ↔ NF, coleta/sanitização no WhatsApp e não-repetição de solicitação para clientes com empresa vinculada.

## 2026-10-14T10:09:35Z — Diretriz de Coexistência no Workspace

AVISO IMPORTANTE DE COEXISTÊNCIA NO WORKSPACE:
O usuário iniciou outra conversa paralela no mesmo diretório (`orchestrator_9`, trabalhando em `artifacts/api-server/giss-soap.mjs`, `artifacts/api-server/national-nfse.mjs` e `.agents/teamwork/orchestrator_9/` para NFS-e).
Portanto:
1. **NUNCA** descarte nem reverta alterações de `giss-soap.mjs`, `national-nfse.mjs` ou `.agents/teamwork/orchestrator_9/`.
2. Ao despachar o `victory_auditor`, instrua-o explicitamente a auditar o escopo da integração WebBookingPro (`wbp/`, `scripts/wbp/`, `demo-server.mjs`, `tests/wbp-integration/`, `artifacts/limpeza/`, `docs/wbp/`, `docs/integracoes/webbookingpro/`) e a **ignorar** modificações não-relacionadas em andamento da tarefa paralela de NFS-e (`giss-soap.mjs`, `national-nfse.mjs`, `orchestrator_9`, `worker_m1` da outra sessão).

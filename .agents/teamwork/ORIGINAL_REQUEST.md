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


## 2026-10-19T02:58:52Z

Reorganização da interface administrativa (backend) do Guest-Flow-Manager (CorpFlats), implementando menu lateral esquerdo retrátil (auto-hide flutuante ao tirar o mouse) para visualização do calendário em tela inteira, nova hierarquia de categorias recolhíveis com busca rápida, separação de perfis `dev` (acesso total + ferramentas técnicas) e `admin` (gestão hoteleira completa sem configurações técnicas de desenvolvimento), página dedicada de gestão de equipe e remoção completa do manual técnico WBP.

Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager
Integrity mode: development

## Requirements

### R1. Coluna Lateral Esquerda Auto-Hide (Calendário em Tela Inteira)
A barra lateral esquerda (`Shell` em `artifacts/limpeza/src/components/layout.tsx`) no desktop deve ficar oculta por padrão (largura zero no fluxo de layout) para que o Mapa de Reservas (`/reservas`) e demais telas ocupem 100% da largura da janela. Deve existir uma zona sensível na borda esquerda da tela (hover edge trigger) e um discreto gatilho visual para revelar a coluna flutuando sobre o conteúdo (`overlay`) ao aproximar o mouse, e recolhê-la automaticamente com transição suave quando o mouse sair da coluna (com opção de fixar/desafixar).

### R2. Novo Perfil `dev` vs `admin` e Reestruturação de Permissões
Implementar o perfil de usuário `dev` (Desenvolvedor) no backend (`artifacts/api-server/demo-server.mjs` e rotas de API) e no frontend (`artifacts/limpeza/src/`):
- Transformar o usuário padrão `"admin"` existente em `role: "dev"` e criar um novo usuário padrão para administração hoteleira (`username: "gestor"`, `name: "Administração CorpFlats"`, `role: "admin"`, senha inicial `"admin123"`).
- O perfil `dev` possui acesso irrestrito a todas as rotas e funcionalidades do sistema (tudo que `admin` acessa + módulos de engenharia/desenvolvimento). Todas as checagens operacionais de permissão administrativa no backend e frontend devem aceitar `role === "admin" || role === "dev"`.
- O perfil `admin` possui acesso completo a todos os módulos operacionais, financeiros, reservas, governança, comunicação e gestão de equipe, mas NÃO vê nem acessa módulos estritamente técnicos de desenvolvimento (`DevRoute` / exclusivo `dev`): Monitor do Servidor (`/monitor-servidor`), Status da IA (`/ia-status`), Logs & Auditoria (`/logs`), Integrações Técnicas & Chaves de Nuvem/API (`/configuracoes`), Conexão Técnica Z-API (`/zapi-conexao`) e Fluxograma Técnico da Jornada (`/jornada-reservas`).

### R3. Separação da Gestão de Equipe (`/equipe`) e Exclusão do Manual WBP (`/ajuda-wbp`)
- Criar uma rota e página dedicada de **Equipe & Níveis de Acesso** (`/equipe` e `/usuarios`) acessível tanto para `admin` quanto para `dev`, permitindo listar, criar, editar (nome, WhatsApp, PIX, perfil) e redefinir senha de usuários sem expor chaves de API, certificados ou configurações de nuvem (que permanecem em `/configuracoes` restritas ao perfil `dev`).
- Excluir completamente o Manual Técnico de Integração WebBookingPro (`/ajuda-wbp`, `/manual-wbp`, `/manual-integracao`), removendo as rotas em `App.tsx`, os links/botões em `layout.tsx`, o export em `components/wbp/index.ts` e os arquivos `wbp-manual.tsx` e `WbpHelpManualPage.tsx`.

### R4. Reorganização da Navegação Lateral por Prioridade Operacional
Reorganizar os menus da barra lateral (`layout.tsx`) com campo de busca rápida no topo (desktop e mobile) e categorias recolhíveis (accordion) ordenadas por prioridade de uso diário:
1. **📅 Reservas & Hospedagem** (aberta por padrão, liderada pelo Mapa de Reservas PMS e Caixa de Entrada OTA)
2. **💬 Comunicação & Atendimento** (WhatsApp Chat, Automação WhatsApp, Gerenciador de E-mails, Central de Notificações)
3. **🧹 Governança & Manutenção** (Painel de Limpeza, Fechamento & Diárias, Lista de Compras, Ocorrências, Preventivas, Vistorias, Serviços Externos, Achados & Perdidos, Automação Camareiras)
4. **💰 Financeiro, Tarifas & Fiscal** (ERP Financeiro & DRE, Tarifas & Precificação SEBRAE, Pagamentos PIX & Cauções, Hub de Notas Fiscais NFS-e, Funil de Vendas)
5. **🏨 Propriedade & Equipe** (Equipe & Usuários `/equipe`, Flats & Regras, Garagem, Avaliações IA, Editor do Site)
6. **🛠️ Engenharia & Dev** (visível apenas para `role === "dev"`: Integrações Técnicas & Nuvem, Conexão Z-API, Mapa da Jornada, Monitor do Servidor, Status da IA, Logs & Auditoria).

### R5. Restrições de Ambiente e Build
- Executar `npm run build` em `artifacts/limpeza` ao final para validar a compilação TypeScript/Vite e atualizar os artefatos de build (`artifacts/limpeza/dist/`).
- Respeitar estritamente as diretrizes do projeto (`AGENTS.md`): NUNCA executar varreduras globais de testes (`tests/*.test.mjs`) ou testes de outros módulos; executar apenas verificação pontual da funcionalidade alterada.

## Acceptance Criteria

### Compilação e Integridade
- [ ] `npm --prefix artifacts/limpeza run build` executa com código de saída 0 sem erros de TypeScript ou bundle.
- [ ] Arquivos `artifacts/limpeza/src/pages/wbp-manual.tsx` e `artifacts/limpeza/src/components/wbp/WbpHelpManualPage.tsx` foram removidos e não há referências quebradas a `/ajuda-wbp`.

### Comportamento do Menu Lateral (Auto-Hide & Reorganização)
- [ ] Em viewport desktop (`>= 768px`), a barra lateral fica recolhida/oculta por padrão (`0px` ocupados no fluxo principal), permitindo que o calendário (`/reservas`) ocupe toda a largura da tela.
- [ ] Encostar o mouse na borda esquerda da tela ou acionar o botão de menu no topo esquerdo exibe a barra lateral flutuante (`overlay`), e retirar o mouse da barra lateral a oculta novamente de forma suave.
- [ ] A barra lateral possui busca rápida funcional no desktop e categorias recolhíveis na nova ordem operacional, com "Reservas & Hospedagem" em primeiro lugar.

### Controle de Acesso `dev` vs `admin`
- [ ] O usuário `"admin"` possui `role: "dev"` e visualiza todas as 6 categorias (incluindo "🛠️ Engenharia & Dev") e acessa `/configuracoes`, `/monitor-servidor`, `/logs`, `/zapi-conexao` e `/jornada-reservas`.
- [ ] Um usuário com `role: "admin"` (ex.: `"gestor"`) visualiza as 5 categorias operacionais (sem "🛠️ Engenharia & Dev"), acessa `/reservas`, `/financeiro`, `/equipe`, etc., e recebe bloqueio (`AccessDenied`) se tentar acessar diretamente rotas exclusivas de `dev` (`/configuracoes`, `/monitor-servidor`, `/logs`, `/ia-status`, `/zapi-conexao`, `/jornada-reservas`).
- [ ] A página `/equipe` permite que tanto `admin` quanto `dev` gerenciem usuários da equipe sem exibir chaves técnicas de API/nuvem.


## 2026-10-19T17:08:01Z

This is a single self-contained fix; keep it small and focused.
Implementar controle visual e granular de permissões de acesso por usuário na página de Gestão de Equipe (`/equipe`) do Guest-Flow-Manager (CorpFlats), permitindo selecionar por checkboxes quais telas e categorias cada usuário tem acesso (com preenchimento padrão pelo perfil base `camareira`, `recepcao`, `admin`, `dev`), persistindo `allowedModules` no backend e aplicando dinamicamente no menu lateral e guardas de rota.

Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager
Integrity mode: development

## Requirements

### R1. Catálogo Central de Módulos e Presets por Perfil (`permissions.ts` + Backend)
Criar um módulo compartilhado (`artifacts/limpeza/src/lib/permissions.ts`) e espelhar a lógica no backend (`artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`) contendo as 6 categorias e todas as 34 telas do menu lateral:
1. **📅 Reservas & Hospedagem (`reservas`)**: `/reservas`, `/caixa-entrada-ota`, `/relatorios-reservas`, `/crm`, `/portaria`, `/pedidos-cafe`, `/relatorios-cafe`, `/reservar`
2. **💬 Comunicação & Atendimento (`comunicacao`)**: `/whatsapp-chat`, `/whatsapp`, `/emails`, `/notificacoes`
3. **🧹 Governança & Manutenção (`governanca`)**: `/dashboard`, `/reports`, `/lista-compras`, `/observations`, `/tasks`, `/surveys`, `/servicos`, `/achados-perdidos`, `/automacoes-camareiras`
4. **💰 Financeiro, Tarifas & Fiscal (`financeiro`)**: `/financeiro`, `/tarifas`, `/pagamentos`, `/notas`, `/funil-vendas`
5. **🏨 Propriedade & Equipe (`propriedade`)**: `/equipe`, `/propriedade`, `/garagem`, `/avaliacoes-ia`, `/editor-site`
6. **🛠️ Engenharia & Dev (`engenharia`, `devOnly: true`)**: `/configuracoes`, `/zapi-conexao`, `/jornada-reservas`, `/monitor-servidor`, `/ia-status`, `/logs`

Definir os pacotes padrão (`getDefaultModulesForRole(role)`):
- `camareira`: `["/dashboard", "/reports", "/lista-compras", "/observations", "/tasks", "/achados-perdidos"]`
- `recepcao`: todos os itens de `reservas` + `["/dashboard", "/reports", "/lista-compras", "/observations", "/tasks", "/achados-perdidos"]`
- `admin`: todas as 28 telas das 5 categorias operacionais (`reservas`, `comunicacao`, `governanca`, `financeiro`, `propriedade`), sem `engenharia`
- `dev`: todas as 34 telas das 6 categorias (incluindo `engenharia`).

### R2. Persistência e Segurança de `allowedModules` no Backend
Atualizar `artifacts/api-server/demo-server.mjs` e manter paridade exata de SHA-256 com `scripts/demo-server.mjs`:
- `getAuthUser(req)`, `GET /api/auth/me`, `POST /api/auth/login` e `GET /api/admin/users` devem retornar `allowedModules: string[]` (usando `user.allowedModules` se existir como array, ou `getDefaultModulesForRole(user.role)` como fallback).
- `POST /api/admin/users` e `PATCH /api/admin/users/:id` devem aceitar `allowedModules` (array de rotas canônicas). Se `role` for alterado e `allowedModules` não for enviado explicitamente na requisição, atualizar `allowedModules` para o padrão do novo `role`.
- **Regra de Segurança Estrita**: Apenas usuários autenticados com `role === "dev"` podem conceder ou manter módulos da categoria `🛠️ Engenharia & Dev` (`/configuracoes`, `/zapi-conexao`, `/jornada-reservas`, `/monitor-servidor`, `/ia-status`, `/logs`). Se um usuário `admin` (não-`dev`) criar ou editar qualquer usuário enviando `allowedModules`, o backend deve remover automaticamente qualquer módulo `devOnly` da lista salva.

### R3. Seletor Visual de Telas e Categorias na Gestão de Equipe (`/equipe`)
Atualizar `artifacts/limpeza/src/pages/equipe.tsx`:
- Na listagem da equipe, exibir junto ao perfil quantos módulos o usuário possui liberados (indicando se é `Padrão do Perfil` ou `Personalizado`) e adicionar um botão rápido **"Acessos"** (`ShieldCheck`) na linha de cada colaborador para abrir diretamente um modal dedicado de edição de permissões daquele usuário.
- Nos modais **Cadastrar Novo Colaborador**, **Editar Colaborador** e **Permissões de Acesso**:
  - Ao selecionar ou trocar o **Perfil Base** (`camareira`, `recepcao`, `admin`, `dev`), pré-selecionar automaticamente os checkboxes do pacote padrão daquele perfil (incluindo botão *"Restaurar padrão do perfil"*, *"Marcar todos"* e *"Desmarcar todos"*).
  - Exibir as categorias com checkbox/switch mestre por categoria (para marcar/desmarcar a categoria inteira) e checkboxes individuais para cada tela com nome e descrição.
  - Ocultar a categoria `🛠️ Engenharia & Dev` no seletor de permissões quando o usuário logado não for `dev`.

### R4. Aplicação Dinâmica no Menu Lateral (`layout.tsx`) e Guardas de Rota (`App.tsx`)
- Em `artifacts/limpeza/src/components/layout.tsx`, filtrar os itens de `navCategories` usando `hasModuleAccess(user, item.href)` para que o menu lateral exiba exatamente as telas liberadas em `allowedModules` para o usuário logado (ocultando categorias que ficarem com 0 itens visíveis).
- Em `artifacts/limpeza/src/App.tsx`, atualizar `AdminGuard`, `ReceptionGuard`, `StaffGuard` e `DevGuard` para consultar `hasModuleAccess(user, path)` (mapeando aliases como `/usuarios` -> `/equipe`, `/precificacao-sebrae` -> `/tarifas`, `/meu-extrato` -> `/reports`, etc.), permitindo o acesso se o módulo estiver em `allowedModules` e bloqueando com `<AccessDenied />` caso tenha sido desmarcado.

### R5. Restrições Estritas de Testes, Build e Git (`AGENTS.md`)
- Atualizar e executar EXCLUSIVAMENTE o teste pontual `node --test tests/auth-roles-permissions.test.mjs` (NUNCA rodar varreduras globais `tests/*.test.mjs`).
- Executar `npm --prefix artifacts/limpeza run build` e garantir saída 0.
- Fazer `git commit` e `git push origin main` incluindo `artifacts/limpeza/dist/`.

## Acceptance Criteria

### Backend & Segurança
- [ ] `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` possuem hash SHA-256 idêntico.
- [ ] `GET /api/auth/me` e `GET /api/admin/users` retornam `allowedModules` como array de strings para todos os usuários.
- [ ] `PATCH /api/admin/users/:id` salva `allowedModules` customizados e bloqueia/remove módulos `devOnly` caso o autor da requisição não seja `dev`.
- [ ] `node --test tests/auth-roles-permissions.test.mjs` passa 100%.

### Frontend (`/equipe`, `layout.tsx`, `App.tsx`) & Build
- [ ] Na página `/equipe`, é possível clicar em **"Acessos"** (ou criar/editar usuário), escolher o perfil base para preencher o padrão e marcar/desmarcar checkboxes individuais por tela ou por categoria inteira.
- [ ] `layout.tsx` e `App.tsx` respeitam `allowedModules` dinamicamente via `hasModuleAccess`.
- [ ] `npm --prefix artifacts/limpeza run build` compila com código 0 e as alterações + `dist/` são enviadas via `git push origin main`.


## 2026-10-21T18:26:13Z

Implementar o ecossistema completo de Venda e Gestão de Frigobar nos Flats (CorpFlats + parceira Anserve) no projeto Guest-Flow-Manager, abrangendo autoatendimento mobile do hóspede (via QR Code do flat e Área da Reserva), checkout PIX/Cartão integrado, 4 interfaces dedicadas (Hóspede, Repositora Anserve, Supervisão Anserve e Admin CorpFlats), fluxo de Nota Fiscal com envio automático via WhatsApp e E-mail, controle de cortesias, auditoria de divergências com cobrança automática pela IA Sofia e inteligência analítica no CRM.

Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager
Integrity mode: development

## Requirements

### R1. Catálogo de Produtos, Cortesias e Gabarito Padrão do Frigobar
- Permitir cadastrar, editar e gerenciar os produtos do frigobar (com foto, nome, categoria, preço de venda, custo/repasse, status ativo) e a **quantidade padrão no frigobar de cada flat** (gabarito padrão).
- Suportar **Itens de Cortesia** (ex: 2 cápsulas de Nespresso, balas, amendoim), configurados como cortesia gratuita 1 vez por reserva (no check-in), permitindo também ter unidades extras pagas no catálogo (ex: cápsulas avulsas adicionais para venda em estadias longas).
- Gerar e exibir os QR Codes individuais de cada flat (ex: `/frigobar/flat/:flatNumber`) prontos para impressão.

### R2. Interface Mobile do Hóspede (QR Code por Flat + Área da Reserva + Pagamento PIX/Cartão)
- Criar uma experiência 100% otimizada para celular acessível por duas vias:
  1. **QR Code exclusivo de cada flat** (`/frigobar/flat/:flatNumber` ou `/frigobar/:flatNumber`): solicita confirmação dos **4 últimos dígitos do celular** do hóspede, valida contra a reserva ativa/recente daquele flat e exibe uma **saudação personalizada pelo nome do hóspede**.
  2. **Área do Hóspede / Link Direto da Reserva** (`/minha-reserva/:code/frigobar` e card/atalho dentro de `/minha-reserva/:code`): identifica a reserva automaticamente pelo código, saudando o hóspede pelo nome sem exigir redigitação.
- Exibir os produtos com fotos, mostrar de forma visual e não-editável a **quantidade padrão que havia no frigobar** (ex: *"Padrão no flat: 4 un."*) para ajudar o hóspede a lembrar quanto consumiu, exibir eventuais itens já pagos anteriormente na mesma reserva e atualizar o subtotal em tempo real conforme seleciona as quantidades (`-` / `+`).
- Exibir aviso claro de que **não é possível faturar o consumo de frigobar junto com o valor da hospedagem**.
- No checkout, exigir/confirmar:
  - **Preferência de descrição na Nota Fiscal**: (a) Discriminar todos os itens consumidos, (b) Lançar como *"Água"*, ou (c) Lançar como *"Consumo de Frigobar"*.
  - **Documento para a Nota Fiscal**: permitir manter o **CPF já cadastrado** do hóspede ou informar um **CNPJ da empresa / outro CPF** para reembolso corporativo.
  - **E-mail para recebimento da Nota Fiscal**: pré-preenchido com o e-mail do cadastro (ou solicitado obrigatoriamente caso não tenha e-mail cadastrado).
- Processar o pagamento diretamente para a CorpFlats via **PIX (Banco Inter com QR Code / Copia e Cola e polling automático)** ou **Cartão de Crédito (Mercado Pago)** usando os serviços existentes no backend.

### R3. Interfaces da Anserve (Repositora Mobile & Supervisão/Gestão) e Interface Admin CorpFlats
- **Controle de Acesso Híbrido**: adicionar os perfis `anserve_repositora` e `anserve_gestor` no sistema de equipe/permissões (`/equipe` e `permissions.ts`) e também disponibilizar acesso via link rápido mobile com PIN/Token para a repositora operar facilmente pelo celular.
- **Interface da Repositora Anserve** (`/frigobar-reposicao` / `/anserve/reposicao`):
  - Lista intuitiva de todos os flats (destacando flats em check-out do dia, ocupados ou livres), mostrando o consumo já declarado/pago pelo hóspede na reserva atual.
  - Botão rápido para **Confirmar Conformidade (Sem Divergência)** ou **Apontar Divergência / Corrigir Consumo** (informando o que faltou no frigobar além do declarado pelo hóspede, com opção de foto/observação) e registrar a **reposição realizada** (tanto de itens pagos quanto de itens de cortesia como cápsulas Nespresso, balas e amendoim).
  - Ao registrar uma divergência de consumo não pago, o sistema cria automaticamente a cobrança pendente na reserva e aciona a **Sofia no WhatsApp** com uma mensagem amigável listando os itens apurados e o link direto (`/minha-reserva/:code/frigobar`) para pagamento via PIX ou Cartão.
- **Interface dos Superiores da Anserve** (`/anserve` / `/frigobar-gestao`):
  - **Fila de Notas Fiscais Pendentes**: lista todos os consumos pagos (sem envio de alerta prévio no WhatsApp da Anserve; acompanhamento direto pelo painel) exibindo Valor, Nome, CPF ou CNPJ escolhido, E-mail e a opção de discriminação escolhida pelo hóspede (*Itens discriminados*, *Água* ou *Consumo de Frigobar*).
  - **Anexo de Nota Fiscal (Foto ou Arquivo)**: permite anexar a NF emitida via câmera/foto ou upload de PDF/imagem. Assim que anexada, o sistema dispara **automaticamente** a NF para o **WhatsApp do hóspede** (via Z-API), envia para o **E-mail do hóspede** e disponibiliza o documento na **Área do Hóspede** (`/minha-reserva/:code`).
  - Visão gerencial de estoque/reposições por flat, saída de cortesias e **Extrato de Repasse Anserve**.
- **Interface Admin CorpFlats** (`/frigobar` / `/admin/frigobar`):
  - Visão completa de vendas, auditoria de divergências, gestão do catálogo/preços/gabarito padrão, controle de cortesias, fila de NFs e **Extrato de Fechamento & Repasse CorpFlats ↔ Anserve** (calculando total vendido pago, descontando taxas de cartão/comissão configuráveis e somando/abatendo o custo das cortesias repostas).

### R4. CRM do Hóspede, Analytics de Consumo (Insights) e Integração com a IA Sofia
- **Histórico no Cadastro do Hóspede (CRM)**: vincular cada consumo ao perfil do hóspede em `/crm` (`crm-guests.tsx`), exibindo na ficha do hóspede o histórico de itens consumidos, gasto total em frigobar e tags/preferências automáticas (ex: itens favoritos do hóspede).
- **Relatórios e Insights Analíticos**: painel de relatórios com ranking de produtos mais vendidos, saída de cortesias, taxa de divergência por período/flat e **cruzamento demográfico de consumo por origem do hóspede** (cidade/UF do cadastro/FNRH vs. categorias/produtos consumidos, permitindo insights como *"Hóspedes de São Paulo consomem mais cerveja"*).
- **Habilidade na IA Sofia (`whatsapp-ai-service.mjs`)**:
  - Integrar o módulo `minibar` / `frigobar` ao contexto do hóspede (`buildGuestContext`) e às ferramentas de consulta da Sofia (`querySystemData`).
  - Quando o hóspede enviar mensagem mencionando consumo de frigobar, a Sofia deve identificar se já existe consumo lançado/pago na reserva, explicar que o frigobar não pode ser faturado junto com a diária da hospedagem, e enviar o link direto (`/minha-reserva/:code/frigobar`) para ele selecionar os itens e pagar mesmo que já tenha saído do flat.

### R5. Restrições Críticas de Ambiente e Testes (`AGENTS.md`)
- **PROIBIDO rodar testes globais ou em lote**: Nunca execute `tests/*.test.mjs` ou varreduras de testes que disparem notificações em massa. Caso execute algum script de verificação, valide apenas de forma estritamente isolada os endpoints novos de frigobar sem acionar disparos reais para hóspedes de produção.
- Executar `npm run build` na pasta `artifacts/limpeza` ao concluir as alterações do frontend para atualizar `artifacts/limpeza/dist/`.

## Acceptance Criteria

### Backend & APIs de Frigobar
- [ ] Endpoints REST implementados em `artifacts/api-server/demo-server.mjs` para: catálogo e gabarito padrão (`/api/minibar/products`), validação de QR Code do flat pelos 4 últimos dígitos do celular (`/api/minibar/flat-context`), contexto da reserva (`/api/minibar/reservation-context/:code`), checkout PIX Inter e Cartão Mercado Pago (`/api/minibar/orders` e polling de status), conferência/divergência e reposição pela Anserve (`/api/minibar/inspections`), upload de Nota Fiscal com disparo automático via Z-API + E-mail (`/api/minibar/orders/:id/invoice`), e relatórios/repasse/insights demográficos (`/api/minibar/analytics` e `/api/minibar/settlement`).
- [ ] Ao anexar uma Nota Fiscal a um pedido de frigobar pago, o backend registra o anexo no pedido, disponibiliza na API do portal do hóspede (`/api/pms/guest-portal/:code`) e aciona o envio de e-mail e mensagem WhatsApp para o hóspede.
- [ ] Ao apontar divergência de consumo não declarado na inspeção da repositora, o backend gera o pedido pendente na reserva e aciona o disparo automático da Sofia no WhatsApp com os itens e o link de pagamento.

### Interfaces Frontend & Build
- [ ] Página mobile do hóspede acessível tanto via QR Code do flat (`/frigobar/flat/:flatNumber` com validação dos 4 últimos dígitos do celular e saudação pelo nome) quanto via Área da Reserva (`/minha-reserva/:code/frigobar` e card em `/minha-reserva/:code`), exibindo fotos, quantidade padrão informativa, aviso de não faturamento com a hospedagem, escolha de descrição na NF (*Itens discriminados*, *Água*, *Consumo de Frigobar*), escolha de CPF ou CNPJ e pagamento PIX/Cartão em tempo real.
- [ ] Interfaces dedicadas para Repositora Anserve (visão por flat, consumo declarado, apontamento de divergência e reposição de pagos + cortesias), Supervisão Anserve (fila de NFs pendentes, anexo de foto/arquivo da NF, relatórios e extrato) e Admin CorpFlats (catálogo, QR codes por flat, extrato de repasse Anserve, CRM e insights demográficos por cidade/estado).
- [ ] Integração no CRM (`crm-guests.tsx`) exibindo o perfil de consumo de frigobar de cada hóspede e na Sofia (`whatsapp-ai-service.mjs`) respondendo e enviando o link de pagamento quando o hóspede mencionar consumo de frigobar.
- [ ] O comando `npm --prefix artifacts/limpeza run build` executa sem erros de compilação TypeScript/Vite.


## 2026-10-22T09:58:01Z

Construir um **Sistema Completo de Gestão de Funcionários CLT (RH, Ponto Eletrônico com Selfie/GPS e Whitelist de Aparelho, Automação WhatsApp, Escalas 6x1, Motor de Conformidade CLT/Sindicato com Travas em 3 Níveis, Folha de Pagamento, Contratos e Controle de ASO)** integrado ao sistema hoteleiro existente (`Guest-Flow-Manager` / CorpFlats). O sistema atenderá inicialmente 1 funcionário de cozinha e 1 camareira em regime CLT, mantendo intacto e isolado o fluxo atual das prestadoras de serviço diaristas (**Cris** e **Grazi**), que não entram como funcionárias CLT.

Working directory: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`
Integrity mode: development

## Requirements

### R1. Cadastro de Funcionários CLT vs. Isolamento de Prestadoras de Serviço (Cris e Grazi)
- Criar o módulo completo de gestão de funcionários CLT com pré-configuração inicial para **1 Funcionário de Cozinha** e **1 Camareira CLT**, contendo dados pessoais, matrícula/CTPS, cargo, categoria sindical (Hotéis, Restaurantes e Similares), regime de jornada padrão **6x1 (44h semanais — ex: 7h20/dia ou 8h seg-sex + 4h sáb, com 1h de almoço)** totalmente editável, horário de almoço programado, salário base, adicionais, chave PIX e histórico funcional.
- **Isolamento estrito de Cris e Grazi**: As colaboradoras **Cris** e **Grazi** devem continuar exatamente como estão hoje (prestadoras de serviço / diaristas com pagamento por faxina no extrato de governança), sendo explicitamente excluídas de lembretes de ponto CLT, banco de horas, folha CLT e travas trabalhistas.

### R2. Registro de Ponto com Selfie, GPS, Cerca Virtual e Whitelist de Aparelho
- Disponibilizar interface mobile-first de batida de ponto (Entrada, Saída Almoço, Retorno Almoço, Saída e Pausas) que exige captura de **Selfie ao vivo** via câmera e **Geolocalização (GPS)** com cálculo de distância em relação às coordenadas do hotel (cerca virtual/geofence configurável).
- **Controle de Aparelho Autorizado (Device Whitelist)**: Permitir que o ponto seja batido pelo celular do próprio funcionário ou por um aparelho dedicado da empresa, contando com uma opção de **Whitelist de Aparelho** no painel Admin:
  - O Admin pode cadastrar/autorizar um aparelho específico (ex: botão *"Autorizar este aparelho como Terminal Oficial"* gerando token/fingerprint persistente no dispositivo, ou autorizar aparelhos específicos por funcionário).
  - Quando a chave **"Exigir Aparelho Autorizado (Bloquear demais aparelhos)"** estiver **desativada** (padrão inicial enquanto o aparelho da empresa ainda não foi comprado), os funcionários batem ponto normalmente pelos seus celulares.
  - Quando a chave estiver **ativada**, apenas o(s) aparelho(s) na whitelist podem registrar ponto, bloqueando batidas vindas de outros dispositivos/celulares.

### R3. Automação de Ponto no WhatsApp (Lembretes, Confirmação Imediata e Histórico Acumulado)
- **Confirmação imediata na conversa do WhatsApp a cada batida**: Sempre que o funcionário registrar qualquer batida de ponto, enviar mensagem automática no WhatsApp do funcionário contendo:
  1. Confirmação da batida realizada (tipo de batida, data, hora exata, status de GPS/aparelho);
  2. Histórico diário dos dias anteriores do mês vigente + todas as batidas registradas no dia atual;
  3. Resumo atualizado de horas trabalhadas no dia e no mês, com **saldo acumulado (horas extras / banco de horas) ou horas faltantes** em comparação com a carga horária prevista até a data.
- **Lembretes automáticos via WhatsApp**:
  - Lembrete quando o funcionário esquecer de bater o ponto de entrada ou saída após o horário previsto na escala (+ tolerância configurável);
  - Lembrete nos horários programados de **saída para o almoço** e **retorno do almoço**;
  - **Alerta preventivo de pausa intrajornada (limite de 6h)**: Monitorar o tempo contínuo trabalhado desde a entrada e disparar lembrete/alerta antes de completar **6 horas seguidas de trabalho** sem saída para o almoço/pausa obrigatória;
  - **Exclusão automática em dias de folga e férias**: O motor de lembretes deve verificar a escala ativa e **nunca** enviar lembretes de ponto em dias de folga (DSR), férias, feriados dispensados ou afastamentos médicos.

### R4. Montagem de Escalas, Horas Extras, Adicional Noturno e Controle de Férias
- **Gestão de Escalas**: Calendário/construtor de escala (padrão 6x1 44h semanais ou personalizada) definindo horários de entrada, intervalo de almoço, saída e dias de folga semanal (DSR) e folgas dominicais cíclicas.
- **Cálculo de Jornada, Horas Extras e Adicional Noturno**:
  - Apuração automática de horas normais, tolerância legal (Art. 58 §1º CLT — 5 min por batida / 10 min diários), **horas extras** (50% dias úteis / 100% domingos e feriados) e saldo acumulado/faltante;
  - Cálculo automático de **adicional noturno** (trabalho entre 22:00 e 05:00 e prorrogação, com percentual configurável padrão 20% e hora ficta noturna reduzida de 52m30s).
- **Controle de Férias**: Contabilização automática de período aquisitivo (12 meses) e período concessivo (12 meses subsequentes), programação de gozo de férias (incluindo fracionamento em até 3 períodos conforme CLT: um deles >= 14 dias e demais >= 5 dias), alertas de risco de férias vencidas (dobra) e bloqueio de escalas/lembretes durante o período de férias.

### R5. Motor de Conformidade Trabalhista (CLT e Sindicato) com 3 Níveis de Trava Configuráveis
- Implementar um motor de regras trabalhistas e sindicais onde **cada regra pode ser configurada individualmente** pelo Admin em **3 níveis de ação**:
  1. **`Apenas Alerta`** (`alert`): Permite a operação e gera alerta imediato no painel e no WhatsApp do gestor;
  2. **`Trava com Senha/Justificativa do Admin`** (`admin_override`): Bloqueia a operação até que o Admin insira justificativa/senha autorizando a exceção;
  3. **`Bloqueio Total`** (`hard_block`): Impede terminantemente o salvamento da escala ou o registro da ação em desconformidade.
- **Regras monitoradas pelo motor (com parâmetros editáveis no painel)**:
  - Trabalhar mais de **6 horas contínuas** sem pausa de almoço/intrajornada (ou intervalo de almoço inferior ao mínimo legal de 1h para jornadas > 6h);
  - Descanso **interjornada inferior a 11 horas** consecutivas entre o fim de um expediente e o início do próximo (Art. 66 CLT);
  - Trabalhar mais de **6 dias consecutivos sem folga** (DSR — Art. 67 CLT / OJ 410 SDI-1 TST) ou violar a frequência máxima de domingos trabalhados sem folga dominical;
  - Exceder o limite de **2 horas extras diárias** (Art. 59 CLT) ou 10 horas totais trabalhadas no dia;
  - Escalar funcionário em período de **férias**, afastamento médico ou com **ASO vencido**;
  - Bater ponto fora do raio de GPS permitido (cerca virtual) ou fora do aparelho na whitelist.

### R6. Controle de Pagamento (Folha/Holerite), Contratos/Constituição e Controle de ASO
- **Controle de Pagamento / Folha Mensal**: Cálculo da folha mensal de cada funcionário CLT somando salário base, horas extras (50%/100%), reflexo DSR, adicional noturno, descontos (INSS, vale-transporte, faltas/atrasos, adiantamentos/vales), geração de recibo/demonstrativo de pagamento (PDF/impressão/envio WhatsApp) e registro de pagamento/baixa via PIX.
- **Assinatura de Contrato e Constituição (Admissão/DP)**: Geração de documentos contratuais (Contrato de Trabalho CLT, Acordo de Compensação/Banco de Horas, Termo de Uso de Ponto/Celular, Ficha de EPI) com assinatura eletrônica na tela (canvas de assinatura + hash/IP/timestamp) e checklist de documentos de admissão.
- **Controle de ASO (Saúde Ocupacional / PCMSO)**: Cadastro e histórico de exames ocupacionais (**Admissional, Periódico, Retorno ao Trabalho, Mudança de Risco/Função e Demissional**), com status de aptidão, médico/clínica, anexo/comprovante, data de realização, data de vencimento e alertas automáticos antes do vencimento.

### R7. Paridade de Arquitetura, Build e Testes Pontuais do Repositório
- Manter paridade estrita (100% SHA-256) entre `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs`.
- Integrar as novas rotas e telas no frontend React (`artifacts/limpeza/src/`) seguindo o design system do projeto e o controle de permissões (`permissions.ts`).
- Executar `npm run build` em `artifacts/limpeza` e criar/executar **exclusivamente** o teste pontual dedicado ao novo módulo (`tests/hr-employee-management.test.mjs`), respeitando estritamente as diretrizes do `AGENTS.md` (proibido rodar varreduras de testes globais).

## Acceptance Criteria

### Isolamento e Cadastro CLT (R1)
- [ ] Existência de cadastro funcional para Funcionário de Cozinha e Camareira CLT com jornada 6x1 (44h semanais) e regras sindicais configuráveis.
- [ ] Verificação programática de que Cris e Grazi permanecem marcadas como prestadoras de serviço (`prestadora` / não-CLT) e que a API de lembretes/folha CLT nunca inclui Cris ou Grazi.

### Ponto com Selfie, GPS e Whitelist de Aparelho (R2)
- [ ] Endpoint e UI de registro de ponto exigem payload de selfie (base64/dataURL) e coordenadas GPS (`lat`, `lng`, `accuracy`), calculando distância para a cerca virtual do hotel.
- [ ] Quando a Whitelist de Aparelho está desativada, qualquer dispositivo válido registra ponto; quando a Whitelist está ativada com um `deviceId` autorizado, requisições com outro `deviceId` são bloqueadas conforme o nível de trava configurado.

### Automação WhatsApp — Confirmação, Histórico Acumulado e Lembretes (R3)
- [ ] Cada batida de ponto gera e registra/envia mensagem WhatsApp contendo: (a) data e hora da batida atual, (b) histórico dos dias anteriores do mês + batidas do dia, e (c) saldo acumulado ou horas faltantes frente à carga horária.
- [ ] Motor de lembretes gera avisos de esquecimento de entrada/saída, saída/volta do almoço e alerta preventivo antes de 6h contínuas sem pausa.
- [ ] Em dias marcados na escala como `folga`, `ferias` ou `afastamento`, o motor de lembretes retorna 0 disparos para o funcionário.

### Escalas, Horas Extras, Adicional Noturno e Férias (R4)
- [ ] Motor de cálculo apura corretamente horas normais, horas extras (50% e 100%) e adicional noturno (22h–05h com hora reduzida 52m30s).
- [ ] Controle de férias calcula períodos aquisitivo e concessivo, valida regras de fracionamento CLT (Art. 134 §1º) e emite alerta de proximidade de vencimento.

### Motor de Conformidade CLT/Sindicato com 3 Níveis de Trava (R5)
- [ ] Cada regra trabalhista (intrajornada > 6h sem pausa, almoço < 1h, interjornada < 11h, > 6 dias seguidos sem folga, > 2h extras/dia, ASO vencido, férias vencidas, fora do GPS/Whitelist) possui configuração independente entre `alert` (Apenas Alerta), `admin_override` (Trava com Senha/Justificativa do Admin) e `hard_block` (Bloqueio Total).
- [ ] Testes automatizados comprovam os 3 comportamentos: `alert` permite e gera alerta; `admin_override` retorna erro 403/422 sem justificativa/senha e permite quando enviada autorização do Admin; `hard_block` rejeita com erro 400/403 mesmo com tentativa de override comum.

### Pagamento, Contratos e ASO (R6)
- [ ] Fechamento de folha mensal calcula proventos (salário + HE + ad. noturno) e descontos, gerando recibo/holerite detalhado.
- [ ] Módulo de contratos gera minuta contratual preenchida e registra assinatura eletrônica com data/hora/IP.
- [ ] Módulo de ASO registra exames (admissional, periódico, etc.), calcula vencimento e sinaliza exames vencidos ou a vencer.

### Build, Paridade Twin-Server e Teste Pontual (R7)
- [ ] `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs` possuem hash SHA-256 idêntico.
- [ ] `npm --prefix artifacts/limpeza run build` compila com código de saída 0 sem erros.
- [ ] Teste pontual `node tests/hr-employee-management.test.mjs` passa 100% das asserções sem executar testes de outros módulos.


## 2026-10-27T15:53:10Z

Implementar o sistema completo de **Serviço Diário de Governança (Stayover) exclusivo para reservas B2B**, incluindo diferenciação visual nos cards de limpeza (Check-out vs. Diária em Andamento), tarifação diferenciada de limpeza Stayover para prestadoras terceirizadas (Cris e Grazi) com discriminação no extrato/relatórios e no painel de RH, checklist e contador de dias de troca de roupa de cama e toalhas de banho (com alerta a cada 3 dias), e controles de "Não Perturbe" e solicitação de troca de enxoval (sempre para o próximo dia) no Portal do Hóspede B2B.

Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager
Integrity mode: development

## Regras Críticas do Projeto (AGENTS.md - Obrigatório)
- **NUNCA executar testes globais, varreduras ou em lote**: É terminantemente PROIBIDO rodar `tests/*.test.mjs`, scripts que varrem a pasta `tests/`, ou suítes completas do projeto.
- **Apenas o teste estritamente pontual do que foi alterado**: Crie e execute EXCLUSIVAMENTE o arquivo de teste pontual `tests/b2b-stayover-housekeeping.test.mjs` associado a esta funcionalidade.
- **Proibido rodar testes de outros módulos**.
- **Build de Verificação**: Ao alterar arquivos em `artifacts/limpeza/src`, rode o build (`npm run build` na pasta `artifacts/limpeza`).

## Requirements

### R1. Geração e Diferenciação Visual de Cards de Limpeza Diária (Stayover) Exclusivos para B2B
- Apenas reservas do canal **B2B** (`channel === "b2b"`, `channel.includes("b2b")`, `b2bReservationNumber` ou `agencyId`) em andamento (`checkinDate < dateStr && checkoutDate > dateStr`, status ativo/não cancelado/não no_show) devem gerar cards diários de limpeza do tipo **Stayover (`source: "stayover"`, `cleaningType: "stayover"`)** em `getRequestsForDate` e `GET /api/reservations/checkouts`.
- Reservas de **Booking, Airbnb, WhatsApp, Site Direto** ou outros canais **nunca** geram limpeza diária de stayover.
- Nos cards de limpeza (`artifacts/limpeza/src/components/flat-card.tsx` e painel de governança), diferenciar visualmente de forma clara o que é **Limpeza de Check-out (Saída)** do que é **Limpeza de Diária em Andamento (Stayover B2B)**, exibindo no card de Stayover o dia atual da estadia (ex.: `Dia 3 de 10`), nome do hóspede em estadia e status de enxoval.
- Iniciar (`cleaning_now`) ou concluir (`clean`) uma limpeza de **Stayover** (`PATCH /api/cleaning/assignments/:requestId/status`) jamais deve dar baixa de check-out na reserva (`checkoutDone` não deve ser marcado como `true`, o status da reserva não muda para `completed`, e o flat permanece ocupado pelo hóspede).

### R2. Tarifação Diferenciada (Checkout vs. Stayover) e Extrato das Terceirizadas (Cris & Grazi)
- Adicionar suporte a taxas de limpeza **Stayover** em `db.cleaningRates`: `defaultStayoverRatePerRoom` (valor inicial padrão `15.00`) e `userStayoverRates` por camareira (ex.: Cris `id: 2` e Grazi `id: 3` iniciando em `15.00`, editáveis).
- Permitir configurar os valores de **Limpeza de Check-out** e **Limpeza de Stayover** tanto no modal de taxas em `/reports` (`artifacts/limpeza/src/pages/reports.tsx`) quanto diretamente no card de **Prestadoras Autônomas (Cris & Grazi)** em `/hr-dashboard` (`artifacts/limpeza/src/pages/hr-dashboard.tsx`).
- Contabilizar cada limpeza concluída com o valor correspondente ao seu tipo (`checkout` vs. `stayover`) em `syncMaidCredits` e `getMaidPeriodFinances` (`artifacts/api-server/maid-automation-service.mjs` e `scripts/maid-automation-service.mjs`), `/api/analytics/report`, `/api/maids/:id/statement`, `/maid-statement` (`artifacts/limpeza/src/pages/maid-statement.tsx`) e `/reports` (incluindo recibo impresso), discriminando claramente no histórico e nos demonstrativos o que foi **Limpeza de Check-out** e o que foi **Limpeza de Stayover (Diária)**, exibindo contagens e valores separados.

### R3. Checklist de Troca de Enxoval na Limpeza Stayover e Contagem de Dias
- Ao concluir uma limpeza de **Stayover** (pela camareira ou pelo admin em nome dela em `flat-card.tsx`), exibir modal específico solicitando apenas o checklist de enxoval (sem exigir vistoria de saída de check-out e sem bloqueio de 10 minutos):
  1. **Toalhas de banho foram trocadas?** (Sim / Não)
  2. **Roupa de cama foi trocada?** (Sim / Não)
- Persistir `towelsChanged: boolean` e `beddingChanged: boolean` no registro da limpeza concluída.
- Calcular e retornar em `linenTracking` (no endpoint `/api/reservations/checkouts` e no card `FlatCard`) o histórico de trocas da reserva:
  - `stayDayNumber` e `totalStayNights`
  - `lastBeddingChangeDate` (data da última troca de cama ou `checkinDate` caso ainda não trocada na estadia) e `daysSinceBeddingChange`
  - `lastTowelsChangeDate` (data da última troca de toalhas ou `checkinDate` caso ainda não trocada na estadia) e `daysSinceTowelsChange`
  - **Alerta visual sugerindo troca de roupa de cama a cada 3 dias** (`daysSinceBeddingChange >= 3`, `needsBeddingChangeAlert: true`)
  - Destaque prioritário quando o hóspede tiver solicitado troca de roupa de cama (`guestRequestedBedding`) e/ou toalhas (`guestRequestedTowels`) para aquela data.

### R4. Portal do Hóspede B2B: "Não Perturbe" e Solicitação de Troca de Cama/Banho (Próximo Dia)
- Exclusivamente para reservas **B2B** em andamento no Portal do Hóspede (`artifacts/limpeza/src/pages/guest-portal.tsx` e rotas `/api/pms/guest-portal/:code` em `demo-server.mjs`):
  - **Modo "Não Perturbe" (`POST /api/pms/guest-portal/:code/do-not-disturb`)**: permanece ativo continuamente (`doNotDisturb: true`) até que o hóspede o desative no portal (`doNotDisturb: false`). Enquanto ativo, o card de limpeza Stayover aparece bloqueado no painel das camareiras com aviso visual **"🔕 Não Perturbe — Hóspede dispensou limpeza"**, impedindo início/conclusão da limpeza pela camareira e não gerando crédito de diária.
  - **Solicitação de Troca de Roupa de Cama e/ou Banho (`POST /api/pms/guest-portal/:code/linen-request`)**: permite ao hóspede B2B solicitar troca de **Roupa de Cama** (`bedding`), **Toalhas de Banho** (`towels`) ou **Ambos**, sempre agendada para a limpeza do **próximo dia (`tomorrowStr`)** (exibindo confirmação da data agendada, permitindo cancelar se desejar, e refletindo no card de limpeza de amanhã).
- Reservas de Booking, Airbnb, WhatsApp ou Site Direto **não** exibem o painel de governança diária, "Não Perturbe" ou solicitação de troca no portal, e os endpoints retornam `403` para reservas não-B2B.

## Acceptance Criteria

### Governança Diária B2B & Cards de Limpeza
- [ ] Reserva B2B com `checkinDate < dateStr && checkoutDate > dateStr` gera card com `cleaningType: "stayover"` e `source: "stayover"` em `GET /api/reservations/checkouts?date=YYYY-MM-DD`.
- [ ] Reservas de canais `booking`, `airbnb`, `whatsapp` e `site` nas mesmas datas intermediárias **não** geram card de stayover.
- [ ] Concluir um card de `stayover` (`PATCH /api/cleaning/assignments/:id/status` com `status: "clean"`, `towelsChanged`, `beddingChanged`) mantém a reserva ativa (`checkoutDone !== true`) e registra o histórico de troca de enxoval.
- [ ] O contador de dias sem troca de cama/banho calcula corretamente os dias desde a última troca (ou `checkinDate`) e ativa o alerta de sugestão de troca de cama quando `daysSinceBeddingChange >= 3`.

### Tarifação Terceirizadas & Extrato
- [ ] `GET /api/cleaning/rates` e `POST /api/cleaning/rates` retornam e persistem `defaultStayoverRatePerRoom` e `userStayoverRates`.
- [ ] Limpezas de `stayover` concluídas por Cris (`id: 2`) ou Grazi (`id: 3`) creditam o valor configurado em `userStayoverRates` no extrato (`maidStatementEntries`) com descrição discriminando `Stayover` e contabilizam separadamente de `Check-out` em `/api/analytics/report`.

### Portal do Hóspede B2B
- [ ] `GET /api/pms/guest-portal/:code` retorna dados de governança diária (`b2bHousekeeping`) apenas para reservas B2B.
- [ ] Ativar "Não Perturbe" via endpoint do portal B2B persiste `doNotDisturb: true` na reserva, reflete o status bloqueado (`doNotDisturb: true`) no card de Stayover para a camareira e bloqueia a conclusão/crédito da limpeza enquanto ativo.
- [ ] Solicitar troca de roupa de cama e/ou banho no portal B2B agenda a solicitação sempre para o dia seguinte (`tomorrowStr`) e exibe o pedido no card de limpeza de Stayover daquela data.
- [ ] Endpoints de "Não Perturbe" e solicitação de enxoval retornam erro `403` se chamados para reservas não-B2B (Booking, Airbnb, WhatsApp, Site).
- [ ] O build do frontend (`npm run build` em `artifacts/limpeza`) compila sem erros e o teste pontual dedicado `tests/b2b-stayover-housekeeping.test.mjs` passa 100%.


## 2026-10-29T03:22:00Z

This is a single self-contained fix; keep it small and focused.

Corrigir o cálculo de valor já pago e saldo pendente no fluxo de edição/extensão de reservas do sistema Guest-Flow-Manager (CorpFlats) quando há múltiplos pagamentos registrados (ou complemento PIX já quitado), ajustar o registro da reserva `RES-113-0524` no banco de dados se necessário e reenviar ao hóspede da `RES-113-0524` a mensagem de confirmação de alteração/extensão constando a reserva como 100% quitada (sem cobrança pendente ou PIX Copia e Cola).

Working directory: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager
Integrity mode: development

## Contexto do Problema (Reserva `RES-113-0524`)
- Hóspede: Cassio Leonardo Bragança Freitas (Flat 113)
- Período atualizado: `26/10/2026` até `31/10/2026` (5 diárias, sendo Check-out alterado de `30/10/2026` para `31/10/2026`)
- Valor Total Anterior: `R$ 650,40` → Valor Total Atualizado: `R$ 800,40` (Diárias: `R$ 750,40` + Taxa de Limpeza: `R$ 50,00`)
- Pagamentos Recebidos na reserva (2 lançamentos):
  1. Booking.com: `R$ 650,40` (Quitação Total)
  2. PIX: `R$ 150,00` (Quitação Total — Complemento PIX via Banco Inter confirmado em 28/10/2026 às 18:26:44, TxId `098365cd9c380e6d9672346c1ece18ea`)
- O painel de edição da reserva exibe corretamente `TOTAL DA ESTADIA: R$ 800,40`, `TOTAL RECEBIDO: R$ 800,40`, `SALDO A PAGAR: R$ 0,00 (100% Quitado / Pago Integralmente)`.
- Contudo, ao salvar a alteração/extensão da diária, a mensagem de WhatsApp enviada ao hóspede informou `Valor Já Pago: R$ 650,40`, `Situação do Pagamento: Pago Parcialmente (Saldo de diária adicional em aberto)` e gerou cobrança de saldo pendente (`R$ 157,50` no cartão / `R$ 150,00` no PIX com código Copia e Cola).

## Requirements

### R1. Cálculo Correto do Total Pago e Status de Quitação na Alteração/Extensão
Ao processar a edição/extensão de uma reserva e montar a notificação de alteração de estadia (bem como na persistência dos campos de pagamento da reserva), o sistema deve considerar a soma real de todos os pagamentos válidos/recebidos (ex.: array `payments` / `amountPaid` atualizado) em comparação ao novo valor total (`totalPrice`). Quando o total recebido for maior ou igual ao valor total atualizado da reserva (`saldo <= 0`), o status deve ser reconhecido como integralmente quitado.

### R2. Formatação da Mensagem de Alteração/Extensão para Reserva Quitada
Quando uma reserva alterada/estendida já estiver 100% quitada (saldo pendente igual a zero):
- Exibir a situação do pagamento como quitada (`Pago Integralmente` / sem saldo em aberto).
- Exibir o `Valor Já Pago` atualizado correspondente ao total efetivamente recebido (ex.: `R$ 800,40`).
- Não incluir na mensagem o bloco `💰 Saldo Pendente da Diária Adicional / Alteração`, nem `📋 PIX Copia e Cola`, nem instruções de pagamento de saldo residual.
- Preservar o comportamento atual (exibição de saldo pendente e geração de PIX Copia e Cola da diferença) apenas quando realmente houver saldo a pagar (`novo total > total efetivamente recebido`).

### R3. Regularização e Reenvio para a Reserva `RES-113-0524`
Verificar o registro da reserva `RES-113-0524` no banco de dados para assegurar que os campos financeiros (`amountPaid`, `paymentStatus`, `payments`, `totalPrice`, datas de check-in/check-out `26/10/2026` a `31/10/2026`) estejam 100% consistentes como quitados (`R$ 800,40`), e disparar para o hóspede da reserva `RES-113-0524` a notificação atualizada de confirmação de alteração/extensão refletindo que a reserva já está integralmente paga.

### R4. Restrições Operacionais, Build e Git (Regras Estritas do Repositório)
- **Proibição de testes em lote**: NUNCA executar varreduras de testes (`tests/*.test.mjs` ou suítes globais) que disparem mensagens para outras reservas ou módulos. Qualquer verificação automatizada do cálculo/template deve ser estritamente isolada.
- **Build de produção**: Caso arquivos em `artifacts/limpeza/src` sejam modificados, executar `npm run build` dentro de `artifacts/limpeza` e incluir os arquivos atualizados de `artifacts/limpeza/dist/` no commit.
- **Git Push obrigatório**: Realizar `git commit` das alterações e executar imediatamente `git push` para a branch ativa no repositório remoto.

## Acceptance Criteria

### Lógica de Pagamento e Template de Mensagem
- [ ] A função/endpoint responsável pela atualização de reserva e pelo envio da mensagem de alteração/extensão calcula o valor pago considerando todos os pagamentos recebidos (`R$ 650,40 + R$ 150,00 = R$ 800,40`), resultando em saldo pendente `R$ 0,00` quando o total recebido cobre o novo valor total.
- [ ] Para uma reserva com saldo pendente `R$ 0,00`, o texto gerado para a mensagem de alteração informa `Valor Já Pago: R$ 800,40` e situação `Pago Integralmente`, sem conter os blocos `Saldo Pendente da Diária Adicional` ou `PIX Copia e Cola`.
- [ ] Para uma reserva cujo novo valor total supere o total recebido (`saldo > 0`), o texto gerado continua incluindo normalmente o saldo pendente (Cartão e PIX) e o código PIX Copia e Cola.

### Banco de Dados, Reenvio (`RES-113-0524`) e Deploy
- [ ] No banco de dados, a reserva `RES-113-0524` encontra-se com `totalPrice` de `800.40`, total recebido/pago de `800.40` (2 lançamentos: `650.40` + `150.00`), check-out em `31/10/2026` e status de pagamento quitado.
- [ ] A mensagem de confirmação de alteração/extensão corrigida (indicando pagamento integral de `R$ 800,40` e sem cobrança PIX) foi enviada com sucesso via WhatsApp ao hóspede da `RES-113-0524`.
- [ ] Se houve alteração em `artifacts/limpeza/src`, `npm run build` em `artifacts/limpeza` concluiu sem erros e `git status` / `git push` confirmam que todas as alterações foram enviadas ao repositório remoto sem rodar suítes de testes globais.

## 2026-10-29T16:29:13Z

Investigate the root cause of the CRM-to-Google Contacts synchronization bug that merged multiple unrelated guests' phone numbers into single contacts and overwrote contact names, identify all affected contacts, fix the synchronization logic, and automatically restore all corrupted records in both the CRM database and Google Contacts.

Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager
Integrity mode: development

## Requirements

### R1. Root Cause Analysis & Synchronization Bug Fix
Identify the exact mechanism in the CRM-to-Google Contacts synchronization code that caused multiple unrelated guests' phone numbers to be grouped under a single contact and caused guest names to be overwritten by other people's names. Fix the synchronization logic so that each guest and phone number is matched and synced accurately without merging unrelated contacts or overwriting valid names.

### R2. Comprehensive Audit of All Affected Contacts
Perform a full programmatic audit comparing CRM records (contacts, reservations, guest documents, and chat history) against Google Contacts to identify every contact corrupted by the synchronization bug. This must cover the known reported cases — phone `21976403551` (Roselene, erroneously saved as "Raiza Castro Tavares" with multiple numbers) and phone `28999136926` (Fabiana, erroneously saved as "João Eduardo Leal Correa") — as well as all other affected records. Generate a complete Before/After audit report detailing every impacted contact.

### R3. Automated Data Restoration in CRM & Google Contacts
Automatically repair all affected records in both the CRM database and Google Contacts. Unmerge improperly grouped phone numbers into their rightful individual contacts and restore the true guest names using authoritative historical data from reservations, guest registrations, and chat history.

### R4. Controlled Execution & Repository Rules
Strictly follow the workspace's `AGENTS.md` rules:
- Never run global or batch test suites (`tests/*.test.mjs`) or any script that sends WhatsApp messages to guests.
- If any files under `artifacts/limpeza/src` are modified, run `npm run build` in `artifacts/limpeza` and include the build output.
- Commit all code fixes and immediately run `git push` to the remote repository.

## Acceptance Criteria

### Root Cause & Code Fix
- [ ] The exact root cause in the sync logic is documented with file and line references explaining why unrelated phone numbers were merged and names were overwritten.
- [ ] The synchronization code is fixed and verified via a safe, non-destructive check (without triggering WhatsApp messages) proving that distinct contacts are no longer merged or renamed erroneously.

### Data Audit & Restoration Verification
- [ ] Programmatic verification confirms that phone `21976403551` is restored to Roselene in both the CRM database and Google Contacts, separated from unrelated phone numbers.
- [ ] Programmatic verification confirms that phone `28999136926` is restored to Fabiana in both the CRM database and Google Contacts, separated from unrelated phone numbers.
- [ ] Programmatic verification across all CRM and Google Contacts records confirms zero remaining contacts where unrelated guests' phone numbers are merged together or where a guest's name remains overwritten by another guest's name due to the sync bug.
- [ ] A comprehensive Before/After report is produced listing every affected contact ID/phone, the corrupted name and merged numbers before repair, the authoritative name restored, and the verified post-repair status.

### Operational & Git Compliance
- [ ] Zero WhatsApp messages or global test suites (`tests/*.test.mjs`) were triggered during the work.
- [ ] All code changes (and frontend build artifacts, if applicable) are committed and pushed to the remote git repository (`git status` is clean and up-to-date with `origin`).


## 2026-10-30T21:50:59Z

This is a single self-contained fix; keep it small and focused. Reordenar os campos do modal de criação/edição manual de reserva no calendário PMS (`artifacts/limpeza/src/pages/pms-calendar.tsx`) para seguir o fluxo operacional de atendimento (1º Datas de Check-in/Check-out, 2º Quantidade de Hóspedes, 3º Dados do Hóspede, 4º Status Pré-Reserva/Confirmada, 5º Resumo Financeiro da Hospedagem), mantendo todos os mecanismos, botões, nomes e comportamentos atuais intactos, e adicionar seleção de período (check-in e check-out no mesmo calendário popover) preservando a opção de digitar as datas manualmente.

Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager
Integrity mode: development

## Requirements

### R1. Reordenação do fluxo no modal de Nova/Editar Reserva (`artifacts/limpeza/src/pages/pms-calendar.tsx`)
Na aba principal (`Reserva`), logo após os banners informativos condicionais de topo, posicionar os 5 blocos principais exatamente nesta ordem:
1. **Datas e Horários de Entrada (Check-in) e Saída (Check-out)**
2. **Quantidade de Hóspedes na Reserva (1, 2 ou 3)**
3. **Dados do Hóspede** (bloco "Quem está solicitando a reserva?" / busca CRM + Hóspede 1 Titular, Documento com Foto, Hóspedes 2 e 3)
4. **Status & Confirmação da Reserva (Pré-Reserva ou Confirmada)**
5. **Resumo Financeiro da Hospedagem** (card com resumo de valores e botão "Gerenciar Pagamentos & Diárias ➔", mantendo o sistema de abas exatamente como é hoje)

Logo abaixo do 5º bloco (Resumo Financeiro da Hospedagem), posicionar todos os demais blocos operacionais existentes (Apartamento, Canal de Origem, Sugestão Quarto da Vez, Bloqueio de Flat, Alerta de Conflito/Overbooking, Early Check-in, Mensalista, Auto NFS-e, Aviso Portaria, Veículo/Garagem, Preparação p/ Camareiras, Café da Manhã Incluso, Check-out Antecipado, Observações Gerais e Disparar WhatsApp) sem alterar nenhum mecanismo, botão, nome ou funcionamento.

### R2. Seleção de Check-in e Check-out em Calendário Único + Digitação Manual
- Nos campos de **Entrada (Check-in)** e **Saída (Check-out)**, manter a possibilidade de digitar a data manualmente (ex.: `DD/MM/AAAA` ou input de data) em cada um dos dois campos e manter os campos de **Horário** de entrada e saída ao lado exatamente como hoje.
- Ao clicar no ícone de calendário de qualquer um dos dois campos (Check-in ou Check-out), abrir um **único calendário interativo de período (Range Picker)** onde o **1º clique** define a data de Check-in e o **2º clique** define a data de Check-out, destacando o intervalo selecionado.
- Sempre que as datas de Check-in e Check-out forem alteradas (seja clicando no calendário único ou digitando manualmente), disparar exatamente a mesma lógica existente de atualização de diárias (`buildReservationDailyRates` e `syncCompositeTotalAndPaid`) e sugestão de flat disponível (`fairShareResult`).

### R3. Diretrizes de Build, Git e Testes (`AGENTS.md`)
- Após concluir a alteração em `artifacts/limpeza/src/pages/pms-calendar.tsx`, executar `npm run build` na pasta `artifacts/limpeza` para verificar a compilação e atualizar `artifacts/limpeza/dist/`.
- É terminantemente proibido rodar testes globais, varreduras ou testes de outros módulos (respeitar estritamente `AGENTS.md`).
- Realizar `git commit` e `git push` das alterações (incluindo `artifacts/limpeza/dist/`).

## Acceptance Criteria

### Reordenação e Preservação de Funcionalidades
- [ ] Na aba `Reserva` do modal de Nova/Editar Reserva em `artifacts/limpeza/src/pages/pms-calendar.tsx`, a ordem dos 5 primeiros blocos de preenchimento do formulário é estritamente: (1) Entrada Check-in & Saída Check-out, (2) Quantidade de Hóspedes na Reserva, (3) Quem solicita + Dados dos Hóspedes (Hóspedes 1, 2, 3 e Documento), (4) Status & Confirmação da Reserva (Pré-Reserva / Confirmada), (5) Resumo Financeiro da Hospedagem (com botão para a aba Pagamento).
- [ ] Todos os demais blocos existentes (Apartamento, Canal de Origem, Quarto da Vez, Bloqueio de Flat, Alerta de Conflito, Early Check-in, Mensalista, Auto NFS-e, Aviso Portaria, Veículo/Garagem, Preparação p/ Camareiras, Café da Manhã, Check-out Antecipado, Observações Gerais e Disparar WhatsApp) permanecem presentes logo abaixo do Resumo Financeiro, com todos os seus botões, textos e lógicas funcionando sem alteração.

### Calendário Único de Período + Digitação Manual
- [ ] Clicar no ícone de calendário tanto no campo de Check-in quanto no de Check-out abre um único calendário de período (range) onde o 1º clique preenche a data de Check-in e o 2º clique preenche a data de Check-out.
- [ ] O usuário continua podendo digitar manualmente a data de Check-in e a data de Check-out pelo teclado, bem como editar os horários de Check-in e Check-out.
- [ ] Alterar as datas (via calendário único ou digitação) recalcula normalmente o array de diárias (`formDailyRates`) e o valor total composto.
- [ ] `npm run build` em `artifacts/limpeza` compila com código de saída 0 sem erros.

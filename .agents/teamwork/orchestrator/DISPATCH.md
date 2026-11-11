## 2026-11-02T23:16:47Z

Executar tudo ao mesmo tempo com uma equipe de agentes em paralelo todas as modificações propostas para o Guest-Flow-Manager nas Prioridades 1 a 3 (eliminação de tela branca/carregamento de módulos no frontend, otimização de latência de telas e rotas GET, e estabilidade do servidor Node e banco PostgreSQL no Render).

Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager
Integrity mode: development

## 2026-11-04T16:02:30Z

Implementar uma nova automação de Upsell na aba `⚡ Régua Automática` chamada "Oferta de Domingo Sem Pressa (Saída Livre + Bônus Segunda)", disparada aos sábados às 19:00h pelo Canal #1 (Régua Hóspedes) para reservas ativas com check-out no domingo às 12:00h, com pré-reserva temporária (hold de 30 minutos), expiração silenciosa, sincronia com a Sofia e atualização do mapa PMS e governança.

Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager
Integrity mode: development

## Requirements

### R1. Painel de Controle e Configuração na Régua Automática
Na aba `⚡ Régua Automática`, disponibilizar a configuração da automação "Oferta de Domingo Sem Pressa (Saída Livre + Bônus Segunda)", incluindo:
- Toggle para ativar/desativar a automação.
- Campo de configuração para o valor promocional da oferta (`sundayUpsellPrice`).
- Cálculo do valor normal de referência (`valor_normal`) exibido na mensagem com base no valor da diária da reserva atual do hóspede.
- Disparo pelo Canal #1 (Régua Hóspedes).
- Botão de disparo manual/teste para disparar a oferta imediatamente para reservas elegíveis em ambiente de validação.

### R2. Gatilho de Disparo e Elegibilidade de Disponibilidade
O gatilho deve rodar automaticamente todo sábado às 19:00h (quando a automação estiver ativada):
- Identificar todas as reservas com status ativo/hospedado (`in_stay` ou confirmada) cujo check-out original esteja marcado para o domingo seguinte às 12:00h.
- Verificar a disponibilidade do flat de domingo para segunda-feira:
  1. Se o flat atual do hóspede estiver vago de domingo para segunda-feira, a reserva é elegível.
  2. Se houver outra reserva agendada para entrar no domingo no mesmo flat, verificar se existe outro flat livre no condomínio ("Flat da Vez" via `selectFairShareFlat`) para receber essa nova reserva. Havendo flat alternativo para remanejar o hóspede entrante, a reserva atual é elegível.
  3. Se o prédio estiver 100% ocupado de domingo para segunda-feira (sem flat vago para remanejar), não disparar a oferta para o hóspede.

### R3. Pré-Reserva de Extensão (Hold de 30 Minutos e Expiração Silenciosa)
- No momento do disparo (sábado às 19:00h ou teste manual), gerar a cobrança PIX via `createInterPixCob` / `generateStaticPixPayload` no valor promocional configurado.
- Criar um bloqueio temporário (hold) de 30 minutos estendendo a reserva até segunda-feira às 12:00h.
- Regra de expiração silenciosa (`isSilentUpsellHold: true`): caso o hóspede não efetue o pagamento do PIX dentro dos 30 minutos, o bloqueio temporário de domingo para segunda expira em silêncio no sistema, mantendo a reserva original com check-out no domingo às 12:00h. É terminantemente proibido disparar mensagens de expiração de pré-reserva ou cancelamento ao hóspede após o vencimento dos 30 minutos.

### R4. Confirmação Automática de Pagamento e Atualização Operacional
Ao receber a notificação de pagamento confirmado via Webhook PIX correspondente à cobrança da oferta:
- Atualizar a reserva no mapa PMS estendendo o check-out para segunda-feira às 12:00h através da rotina existente de extensão de reservas.
- Reagendar a ordem de limpeza das camareiras para o flat de domingo para segunda-feira.
- Se havia outro hóspede com check-in previsto para aquele flat no domingo, transferir automaticamente a reserva do hóspede entrante para o flat vago selecionado via `selectFairShareFlat`.
- Disparar a mensagem de confirmação ao hóspede: *"Pagamento confirmado! 🎉 Seu check-out livre de domingo (com direito a ficar até segunda às 12h se desejar) já está garantido no sistema. Aproveite seu descanso!"*.

### R5. Formato de Envio das Mensagens e Sincronia com a Sofia
- O disparo deve ser realizado em 2 balões consecutivos com simulação de delay de digitação:
  - Balão 1: Mensagem persuasiva apresentando o check-out livre no domingo pelo valor promocional (`valor_promocional`), destacando a economia em relação à tarifa normal (`valor_normal`), informando a extensão bônus até segunda às 12:00h e comunicando a pré-reserva com validade de 30 minutos.
  - Balão 2: Exclusivamente a chave PIX Copia e Cola (`codigo_pix_copia_e_cola`), sem textos adicionais.
- Registrar no contexto dinâmico da IA Sofia que o hóspede recebeu a oferta de domingo sem pressa no sábado à noite. Se o hóspede interagir tirando dúvidas ou solicitar novo código PIX após o prazo de 30 minutos ter expirado, a Sofia deve reconhecer a condição e emitir uma nova cobrança promocional com novo hold, desde que o flat continue disponível de domingo para segunda.

## Acceptance Criteria

### Painel e Configurações da Régua
- [ ] A aba `⚡ Régua Automática` contém o toggle de ativação/desativação da "Oferta de Domingo Sem Pressa (Saída Livre + Bônus Segunda)", o campo para `sundayUpsellPrice` e o botão de disparo manual/teste.
- [ ] O acionamento manual dispara o fluxo de oferta apenas para as reservas que atendem aos critérios de elegibilidade.

### Filtro de Elegibilidade e Disponibilidade
- [ ] Apenas hóspedes com reservas ativas/confirmadas e check-out agendado para domingo às 12:00h são selecionados.
- [ ] Reservas em flats que possuem check-in no domingo só recebem a oferta se houver outro flat vago apto para remanejamento via `selectFairShareFlat`.
- [ ] Nenhuma oferta é enviada caso o condomínio esteja 100% ocupado na noite de domingo para segunda.

### Hold de 30 Minutos e Expiração Silenciosa
- [ ] O disparo gera o payload PIX no valor promocional e grava o hold de 30 minutos com a flag `isSilentUpsellHold: true`.
- [ ] Ao término de 30 minutos sem pagamento, o hold de domingo para segunda é removido silenciosamente, sem envio de mensagem de cancelamento ou expiração ao hóspede e preservando a reserva original.

### Webhook PIX e Repercussões no Sistema
- [ ] A confirmação do PIX atualiza a data de check-out no PMS para segunda-feira às 12:00h.
- [ ] A limpeza do flat é automaticamente reagendada para segunda-feira.
- [ ] Havendo reserva subsequente no domingo para o mesmo flat, ela é remanejada para o flat alternativo livre.
- [ ] A mensagem de confirmação de pagamento é enviada ao hóspede.

### Mensagens e Contexto da Sofia
- [ ] A mensagem da oferta é enviada em dois balões distintos (texto persuasivo no primeiro, código PIX isolado no segundo).
- [ ] A IA Sofia possui em seu contexto a informação da oferta enviada e consegue regerar o PIX promocional caso solicitada pelo hóspede e havendo disponibilidade.

## Verification Resources
- [ ] Testes pontuais de unidade/integração desenvolvidos pela equipe conforme as diretrizes do AGENTS.md, cobrindo elegibilidade, geração e expiração silenciosa do hold, e confirmação via webhook PIX.

## 2026-11-11T10:25:56Z

Substituição e padronização visual das fotos do cardápio do frigobar por marcas reais comerciais com aprovação prévia, inclusão dos itens de cortesia do kit de boas-vindas com conferência individual por unidade, segregação zerada no extrato do hóspede e apuração financeira do custo dos copos d'água da Anserve para repasse.

Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager
Integrity mode: development

## Requirements

### R1. Padronização e substituição das fotos do cardápio por marcas reais
Substituir todas as imagens de produtos do catálogo de frigobar por fotos de produtos e marcas comerciais reais (como Coca-Cola, Kinder Bueno e os demais itens do frigobar). Todas as imagens devem seguir padrão visual idêntico: fundo branco puro, mesmas proporções, ângulo de visão, distância e iluminação padronizada.

### R2. Galeria para validação e aprovação prévia das fotos
Antes de atualizar os arquivos definitivos no sistema, a equipe deve disponibilizar uma galeria ou painel de pré-visualização apresentando lado a lado cada foto proposta, nome do produto e marca escolhida, aguardando aprovação explícita do usuário para eventuais trocas antes da implantação final.

### R3. Inclusão dos itens de cortesia (Kit de Boas-Vindas) no cardápio
Inserir no cardápio do frigobar os itens que compõem o kit de boas-vindas: até 2 copos d'água mineral e até 2 amendoins Mendorato. Na interface do cardápio acessada pelo hóspede, estes itens devem ser exibidos em uma seção de destaque no topo intitulada "Kit de Boas-Vindas (Cortesia da Casa)", com selo visual de cortesia e valor R$ 0,00, claramente segregados dos produtos pagos.

### R4. Contabilização individual pela repositora sem reposição de estoque
Adaptar o checklist e a interface de conferência da repositora (painel Anserve/reposição) para permitir registrar individualmente a quantidade exata consumida de cada item de cortesia (de 0 a 2 copos d'água e de 0 a 2 amendoins Mendorato). O consumo não gera ordem de reposição do frigobar para a repositora (a reposição do kit ocorre na virada de hóspede pela camareira).

### R5. Segregação e valor zerado no extrato do hóspede
No extrato de consumo da reserva (tanto na visão do hóspede quanto no painel operacional/PMS), os itens de cortesia consumidos devem constar discriminados individualmente por unidade consumida em seção destacada e separada dos consumos pagos, sem cobrança e com valor exibido de R$ 0,00.

### R6. Distinção de fornecimento e apuração de repasse de custo à Anserve
Diferenciar a origem dos itens de cortesia nas regras financeiras e relatórios:
- Amendoins Mendorato: fornecimento próprio pelo proprietário/hotel (sem vínculo financeiro ou repasse à Anserve).
- Copos d'água: originários do estoque da Anserve, com apuração do volume de copos consumidos em cortesias multiplicado pelo seu preço de custo unitário, gerando o relatório/totalizador de repasse devido à Anserve pelo hotel.

## Acceptance Criteria

### Padronização Visual e Galeria de Fotos
- [ ] Todas as imagens dos produtos de frigobar utilizam fotos de produtos reais e marcas comerciais reconhecidas sobre fundo branco padronizado com proporções e ângulos uniformes.
- [ ] A galeria/painel de pré-visualização exibe todas as imagens propostas para aprovação prévia do usuário antes da aplicação definitiva no catálogo de produção.

### Kit de Boas-Vindas no Cardápio
- [ ] O cardápio do hóspede (`/frigobar/:flatNumber`) apresenta a seção destacada "Kit de Boas-Vindas (Cortesia da Casa)" no topo, contendo copos d'água e amendoins Mendorato.
- [ ] Os itens de cortesia exibem distintivo/badge de gratuidade e valor de R$ 0,00, sem permitir cobrança indevida no fechamento.

### Operação da Repositora e Estoque
- [ ] O painel de conferência da repositora permite registrar individualmente a quantidade exata consumida de cada item (0, 1 ou 2 copos d'água; 0, 1 ou 2 amendoins Mendorato).
- [ ] O consumo dos itens de cortesia não dispara ordem de reposição nem afeta o fluxo de reabastecimento de produtos pagos no painel de reposição.

### Extrato do Hóspede e PMS
- [ ] No extrato de conta do hóspede e nos detalhes de reserva do PMS, apenas as quantidades consumidas de cada item de cortesia aparecem discriminadas em bloco separado com valor R$ 0,00.
- [ ] O valor total a pagar da reserva não é acrescido por nenhum item pertencente ao kit de boas-vindas.

### Fechamento Financeiro Anserve vs Hotel
- [ ] O sistema calcula e totaliza a quantidade de copos d'água consumidos como cortesia multiplicada pelo custo unitário para apuração do valor a ser repassado pelo hotel à Anserve.
- [ ] O amendoim Mendorato é identificado como fornecimento próprio, sem gerar débito de repasse ou cobrança com a Anserve.
- [ ] A verificação ponta a ponta é validada nos flats e reservas de teste do ambiente de desenvolvimento.
## 2026-11-11T13:13:55Z

VICTORY AUDIT RESULT: VICTORY REJECTED

Prezado Orquestrador, o Victory Auditor concluiu a auditoria independente e rejeitou a vitória devido a uma falha de paridade twin-server em demo-server.mjs:

=== VICTORY AUDIT REPORT ===
VERDICT: VICTORY REJECTED

PHASE A — TIMELINE: PASS
PHASE B — INTEGRITY CHECK: FAIL
- Os requisitos funcionais R1 a R6 foram implementados com sucesso e comprovados empiricamente.
- Porém, foi detectada divergência entre `artifacts/api-server/demo-server.mjs` (82.423 linhas) e `scripts/demo-server.mjs` (82.000 linhas), violando a regra mandatória de 40/40 arquivos com paridade SHA-256 (39/40 PASS, 1 FAIL).

PHASE C — INDEPENDENT TEST EXECUTION:
- `node scripts/check-twin-parity.mjs`: EXIT CODE 1 (Art: c0519ac7ef83 != Scr: 295a6bd19fe7)
- Demais testes passaram: targeted (5/5 PASS), finance adversarial (6/6 PASS), frontend UI (53/53 PASS), Vite build (Exit code 0).

REMEDIATION REQUIRED:
1. Copiar `artifacts/api-server/demo-server.mjs` para `scripts/demo-server.mjs` mantendo a paridade byte-a-byte idêntica (SHA-256).
2. Rodar `node scripts/check-twin-parity.mjs` para confirmar 40/40 PASS (100% Paridade).
3. Efetuar commit da correção e realizar `git push origin main`.
4. Retornar a entrega formal à Sentinel após a sincronização confirmada.

Por favor, retome a equipe, aplique a remediação e reporte a conclusão.
## 2026-11-11T13:16:19Z

Não estão carrgando 

[Imagem anexada pelo usuário: tela do navegador em corpflats.com.br/frigobar exibindo o modal "INSPEÇÃO DE PADRONIZAÇÃO VISUAL (1024x1024) - Refrigerante • Comparação Lado a Lado", onde a coluna da esquerda "Foto Legada (IA / Genérica)" exibe a imagem, porém a coluna da direita "Nova Foto Comercial (Marca Real)" exibe ícone de imagem quebrada com alt "Coca-Cola Original 350ml", e os cards de produtos ao fundo como "Toddynho Tradicional 200ml" também exibem ícone de imagem quebrada.]

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

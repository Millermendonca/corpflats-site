# Original User Request

## Initial Request — 2026-11-04T01:24:29Z

This is a single self-contained fix; keep it small and focused.
Adicionar a obrigatoriedade de marcação se o hóspede fumou no quarto ao finalizar a limpeza no card da camareira, registrando o apontamento de fumante no cadastro do hóspede e em suas reservas futuras, com opção de alternar ou corrigir a marcação no próprio card.

Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager
Integrity mode: development

## Requirements

### R1. Pergunta em destaque sobre fumo na finalização da limpeza
Ao acionar a finalização da limpeza em um card de tarefa da camareira, a pergunta se o hóspede fumou no quarto deve ser exibida de forma destacada, tomando o tamanho do card naquele momento, com opções para "Sim" e "Não", sem exigir modal ou confirmação adicional para conclusão.

### R2. Indicador interativo e correção da marcação no card
Caso a opção "Sim" seja marcada, o card de limpeza deve exibir um indicador visual (ex: badge "Fumou") e permitir que a camareira alterne ou desmarque a seleção caso tenha marcado por engano. Ao desmarcar, o badge e a sinalização devem ser removidos tanto na visão da camareira quanto no painel administrativo.

### R3. Atualização no cadastro do hóspede e sinalização em reservas futuras
Quando for confirmado que o hóspede fumou no quarto, o cadastro do hóspede associado àquela estadia deve ser atualizado com o status de fumante, e qualquer reserva futura deste hóspede deve exibir uma sinalização visual para a equipe (posicionamento visual a critério da equipe). Caso a marcação seja desfeita no card, o apontamento no cadastro e nas reservas futuras deve ser revertido.

## Acceptance Criteria

### Finalização da Limpeza no Card
- [ ] Ao clicar para finalizar a limpeza no card de tarefa, é exibida em destaque (ocupando a área do card) a pergunta se o hóspede fumou no quarto, com botões para "Sim" e "Não".
- [ ] A finalização da limpeza é concluída diretamente com a resposta informada, sem solicitar telas extras de confirmação.
- [ ] O card de limpeza disponibiliza um indicador/badge (ex: "Fumou") que permite à camareira alterar ou desmarcar a indicação de fumo a qualquer momento se selecionada por engano.
- [ ] Ao desmarcar a indicação no card, o badge é removido da interface da camareira e a alteração é refletida no sistema administrativo.

### Cadastro e Reservas Futuras
- [ ] Ao registrar que o hóspede fumou, o perfil/cadastro do hóspede correspondente à reserva é marcado com o status de fumante.
- [ ] As reservas futuras do hóspede sinalizado exibem o alerta/apontamento de hóspede fumante para a equipe.
- [ ] Ao reverter a indicação de fumo no card, o apontamento de fumante é removido do cadastro do hóspede e das reservas futuras vinculadas.

Working directory: .agents/teamwork/swe/
Original request file: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
Project directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager

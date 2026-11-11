## 2026-11-10T01:48:45Z

Recurso para envio automático de resumo diário via WhatsApp para as camareiras com as avaliações dos hóspedes dos quartos limpos por elas, incluindo envio retroativo de novembro, triagem por IA para notas abaixo de 5 e síntese consolidada de opiniões dos clientes atualizada a cada novo comentário.

Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager
Integrity mode: development

## Requirements

### R1. Resumo diário de avaliações via WhatsApp para camareiras
O sistema deve consolidar e enviar diariamente em horário fixo, via WhatsApp, uma mensagem para cada camareira com o resumo das avaliações recebidas dos hóspedes que ocuparam os flats limpos por ela. Para cada avaliação enviada, devem constar o número do quarto, a data da limpeza realizada e a nota recebida.

### R2. Preservação do fluxo atual de avaliações
Não alterar o sistema ou fluxo de avaliações existente: o sistema atual já realiza a coleta de notas e solicita ao hóspede o motivo/comentário quando a avaliação for inferior a 5, devendo esse comportamento ser integralmente preservado.

### R3. Triagem de feedback por IA para notas abaixo de 5
Aproveitando as respostas de comentários já coletadas pelo fluxo existente, as avaliações com nota menor que 5 estrelas devem passar por triagem com inteligência artificial antes de qualquer envio à camareira:
- Se o hóspede responder e o motivo for relacionado a limpeza ou responsabilidades diretas da camareira (como lençol manchado ou sujo, toalhas de banho ou amenities faltando), a nota e o comentário devem ser encaminhados para a camareira.
- Se o motivo apontado for alheio à limpeza e ao trabalho da camareira (como problemas no processo de check-in, velocidade da internet/Wi-Fi, etc.), a crítica e a nota NÃO devem ser encaminhadas para a camareira.
- Avaliações de 5 estrelas são sempre incluídas no resumo da camareira responsável pela limpeza.

### R4. Envio retroativo inicial de novembro
Executar um primeiro envio consolidando retroativamente as avaliações elegíveis ocorridas no mês de novembro até a data de ativação do recurso para as respectivas camareiras.

### R5. Síntese consolidada de opiniões dos clientes e comparativo de evolução
Toda vez que uma avaliação com comentário elegível sobre limpeza for recebida, o sistema deve enviar à camareira a avaliação em si e, em seguida, uma mensagem separada contendo um resumo consolidado de opinião dos clientes atualizado (estilo Mercado Livre), contendo:
- Síntese dos principais pontos destacados pelos hóspedes sobre a limpeza (destacando aspectos positivos e recorrência de itens como limpeza de box, utensílios de cozinha, pratos e talheres).
- Nota média calculada.
- Comparativo com o período anterior indicando evolução ou regressão nos pontos observados (mostrando se a média melhorou ou piorou e em quais aspectos houve evolução ou necessidade de atenção).

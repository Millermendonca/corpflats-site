## 2026-11-05T12:30:20Z

Usar uma equipe muito profissional para implementar correções e aprimoramentos no sistema de monitoramento e ingestão autônoma de reservas e cancelamentos B2B via e-mail em ambiente de produção.

Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager
Integrity mode: development

## Requirements

### R1. Correção do cálculo de diárias e lançamento de reservas B2B
O sistema de monitoramento de e-mails deve calcular e cadastrar a quantidade exata de diárias recebidas nas reservas B2B (corrigindo o problema de registrar apenas 1 diária quando a reserva possui 2 ou mais noites) e salvar os dados essenciais da estadia e dos hóspedes.

### R2. Extração completa de dados de agência e faturamento via anexo PDF ou link do voucher
O sistema deve inspecionar o e-mail em busca de voucher anexado em PDF ou, caso não haja anexo, acessar diretamente via requisição HTTP o link do voucher contido no corpo do e-mail. A partir do voucher (PDF ou página web), o sistema deve extrair e registrar todas as informações cadastrais da agência (nome da agência, CNPJ, agente emissor, telefone, e-mail), valores financeiros (valor total, comissão da agência) e as instruções completas para emissão de nota fiscal.

### R3. Identificação de e-mails de cancelamento e cancelamento autônomo com notificação
O sistema deve monitorar e identificar e-mails que sinalizem o cancelamento de reservas B2B, localizar a reserva correspondente no sistema e atualizar seu status para cancelado de forma autônoma. O cancelamento deve ser acompanhado de registro de auditoria e envio de alerta/notificação ao gestor.

## Verification Resources
- Reserva de exemplo no Flat 113 (Pires Hage), cujos dados originais recebidos no voucher por link de e-mail e os dados preenchidos manualmente servem como gabarito de conferência.
- Histórico de e-mails reais de reservas e cancelamentos B2B disponíveis no sistema.

## Acceptance Criteria

### Integridade de Diárias e Dados da Reserva
- [ ] Reservas B2B recebidas por e-mail com 2 ou mais diárias são cadastradas no sistema com a quantidade exata de noites e datas corretas de check-in e check-out.
- [ ] Os dados da reserva do Flat 113 (Pires Hage) são validados contra o gabarito dos dados originais do voucher.

### Extração do Voucher (PDF e Link Web)
- [ ] Quando o e-mail contiver anexo em PDF, o sistema extrai o voucher diretamente do arquivo.
- [ ] Quando o e-mail não contiver anexo em PDF, o sistema acessa via HTTP o link contido no corpo do e-mail e extrai as informações do voucher.
- [ ] Todos os campos cadastrais da agência são preenchidos no sistema: nome da agência, CNPJ, agente emissor, telefone e e-mail de contato.
- [ ] Os valores financeiros da reserva (valor total e comissão da agência) são extraídos e registrados.
- [ ] As instruções contidas no voucher para emissão de nota fiscal são extraídas e vinculadas ao registro da reserva.

### Cancelamento Autônomo e Notificação
- [ ] E-mails de cancelamento recebidos identificam corretamente a reserva correspondente no sistema.
- [ ] O status da reserva identificada é alterado para cancelado de forma autônoma no sistema.
- [ ] Um alerta/notificação de cancelamento é gerado e enviado ao gestor, com registro da alteração.

### Verificação Operacional
- [ ] Testes de validação executados reproduzindo o fluxo com e-mails reais do histórico e o caso do Flat 113 confirmam o preenchimento de todos os campos sem erros de execução.

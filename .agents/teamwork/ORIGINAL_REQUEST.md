# Original User Request

## Initial Request — 2026-11-04T22:16:33Z

This is a single self-contained fix; keep it small and focused. Investigar o motivo pelo qual a mensagem de lembrete de café da manhã via WhatsApp (programada para 18:00) não foi enviada para Alessandra Dias (Flat 905), AVILA SAMUEL (Flat 113) e Patrícia Belchior de Carvalho (Flat 605) — todas com café contratado para a manhã seguinte e sem pedido efetuado —, e implementar a correção necessária na régua de envio respeitando todas as regras de negócio acordadas.

Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager
Integrity mode: development

## Requirements

### R1. Diagnóstico da Causa Raiz do Não-Disparo
Investigar o histórico de execuções, agendamentos, dados de reserva e código do serviço da régua de envio (`artifacts/api-server/zapi-service.mjs`, `artifacts/api-server/demo-server.mjs`) para determinar por que o lembrete de café não disparou às 18:00 do dia 04/11/2026 para:
- Flat 905 - Alessandra Dias (RES-905-0596, reservationId: 596)
- Flat 113 - AVILA SAMUEL (RES-113-B2B-25152172, reservationId: 550)
- Flat 605 - Patrícia Belchior de Carvalho (RES-605-0470, reservationId: 470)
Documentar a causa raiz identificada (ex.: validação de datas, formato de telefone, checagem de status/no-show, ordenação de chaves ou filtro de pedidos existentes).

### R2. Correção da Lógica da Régua de Café da Manhã
Ajustar a rotina de envio para assegurar que todas as reservas elegíveis recebam o lembrete de café da manhã às 18:00, garantindo o cumprimento das seguintes regras:
- Avaliar e agendar apenas nos dias de estadia ativa (data atual >= data de check-in e data atual < data de check-out) para hóspedes com café contratado que ainda não realizaram o pedido para a manhã seguinte.
- Respeitar a janela estendida das 18:00 às 20:00 (permitir disparo até as 20:00 se a reserva ou contato for carregado logo após as 18:00, e bloquear estritamente após as 20:00).
- Disparar para o solicitante/titular e também para eventuais acompanhantes cadastrados na reserva que possuam telefone.
- Não bloquear o envio por status de no-show (enviar para todas as reservas com café contratado para o dia seguinte).
- Manter a paridade estrita SHA-256 entre os arquivos alterados em `artifacts/api-server/` e seus espelhos em `scripts/`.
- Conforme o `AGENTS.md`, executar apenas testes pontuais da alteração realizada, sem executar testes globais ou de outros módulos.

## Acceptance Criteria

### Diagnóstico
- [ ] Causa raiz do não-envio para Alessandra, Avila e Patrícia identificada e explicada objetivamente.

### Elegibilidade e Regras de Disparo
- [ ] A lógica de seleção inclui todas as reservas com café da manhã contratado sem pedido registrado para a manhã seguinte durante a estadia ativa (hoje >= check-in e hoje < check-out).
- [ ] O disparo ocorre às 18:00 com janela estendida permitida até 20:00, bloqueando envios após as 20:00.
- [ ] Acompanhantes cadastrados com telefone válido também são incluídos no agendamento do lembrete.
- [ ] Reservas sem confirmação presencial de entrada (no-show) não são bloqueadas.
- [ ] Paridade de arquivos entre `artifacts/api-server/` e `scripts/` validada e mantida (100% idênticos).
- [ ] Teste automatizado pontual da correção implementado e executado com sucesso, sem execução de testes globais.

## Verification Resources
- Dados das reservas pendentes em 04/11/2026:
  - RES-905-0596 (ID: 596, Flat 905, Alessandra Dias, tel: 5521964120926)
  - RES-113-B2B-25152172 (ID: 550, Flat 113, AVILA SAMUEL, tel: 41 998725041)
  - RES-605-0470 (ID: 470, Flat 605, Patrícia Belchior de Carvalho, tel: 3198171397)
- Endpoint de verificação de pedidos de café: `/api/breakfast/orders?date=2026-11-05`

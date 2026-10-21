## 2026-10-21T18:30:49Z

Você é o subagente explorer_survey_1 (teamwork_preview_explorer).
Seu diretório de trabalho exclusivo é:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_1

O diretório raiz do projeto é:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager

Seu parent é o Project Orchestrator (conversation ID: d10c20e2-adfb-4695-835e-52dd3bebe9a9).

Leia atentamente os seguintes arquivos antes de começar:
1. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (seção 2026-10-21T18:26:13Z)
2. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md

Missão do Explorer 1:
Mapear a arquitetura de BACKEND, PERSISTÊNCIA e PAGAMENTOS para o ecossistema de Frigobar (CorpFlats + Anserve):
1. Analise como os dados são mantidos em `artifacts/api-server/demo-server.mjs` (e `scripts/demo-server.mjs`), como `db` é persistido e estruturado, e como modelar:
   - Produtos de frigobar e itens de cortesia (`db.minibarProducts` ou similar).
   - Gabarito padrão de produtos por flat (`defaultStock` por flat).
   - Pedidos de consumo (`db.minibarOrders`): flat, reserva, itens, valor total, status de pagamento, preferências fiscais (discriminação, CPF/CNPJ, e-mail), comprovante de pagamento, Nota Fiscal anexada, etc.
   - Inspeções e conferências da Anserve (`db.minibarInspections`): flat, data, itens declarados vs encontrados, divergências, fotos, itens repostos (pagos e cortesias).
   - Fila de NFs pendentes e extrato de repasse Anserve (total vendido, desconto de taxas/comissões, custo de cortesias).
2. Analise os fluxos e endpoints de pagamento existentes no backend:
   - Como funciona o PIX (Inter / Copia e Cola / polling / webhook).
   - Como funciona o Cartão de Crédito (Mercado Pago).
   - Como criar os novos endpoints `/api/minibar/...` reutilizando esses motores de pagamento com segurança.
3. Analise o disparo de notificações e anexos:
   - Como funcionam `global.sendZapiMessage` / Z-API e `global.sendEmailAsync` / SMTP.
   - Como implementar o upload de Nota Fiscal (PDF ou imagem) em `/api/minibar/orders/:id/invoice` e o disparo imediato para WhatsApp e E-mail do hóspede, além de disponibilizar em `/api/pms/guest-portal/:code`.
   - Como disparar mensagem da Sofia no WhatsApp quando houver divergência apontada pela repositora.
4. Identifique contratos de interface, restrições e potenciais armadilhas (ex: paridade SHA-256 com scripts/demo-server.mjs, isolamento de testes sem envio real).

Escreva um relatório estruturado completo em `analysis.md` e um sumário em `handoff.md` no seu diretório de trabalho (.agents/teamwork/explorer_survey_1).
Ao terminar, use `send_message` para notificar o caller (d10c20e2-adfb-4695-835e-52dd3bebe9a9) informando a conclusão e o caminho do relatório.
Lembre-se: Você é um Explorer de leitura/investigação. NÃO modifique arquivos de código fonte.

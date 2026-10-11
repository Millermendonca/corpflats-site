# Handoff Report: Survey Explorer 1 — Backend Architecture & Modification Flow

**Agent**: Survey Explorer 1  
**Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_1`  
**Handoff Type**: Hard (Task Complete)  
**Target Recipient**: Orchestrator (494db1f9-cfb2-46e9-8b9f-419a8aa9586c)

---

## 1. Observation

1. **Paridade Byte-a-Byte do Servidor**:
   - `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs` possuem exatamente 1.322.828 bytes e hashes SHA256 idênticos:
   - Verificado via comando: `powershell -Command "(Get-FileHash 'scripts/demo-server.mjs').Hash -eq (Get-FileHash 'artifacts/api-server/demo-server.mjs').Hash"` -> Retornou `True`.
   - Total de linhas: 30.757. Total de rotas Express mapeadas: 347.

2. **Endpoint Atual de Modificação no Portal do Hóspede**:
   - `scripts/demo-server.mjs` linhas 15.456 a 15.716 (`POST /api/pms/guest-portal/:code/modify`):
   - Muta imediatamente as datas no banco:
     ```javascript
     15528: additionalAmountToPay += extraNights * dailyRate;
     15529: r.totalAmount = Number(r.totalAmount || 0) + additionalAmountToPay;
     ...
     15615: r.checkinDate = newCheckinDate;
     15616: r.checkoutDate = newCheckoutDate;
     15617: r.calendarSequence = (r.calendarSequence || 0) + 1;
     15618: r.updatedAt = new Date().toISOString();
     ```
   - Não verifica pagamento prévio quando `additionalAmountToPay > 0`.
   - Não possui endpoint `/modify-preview`.
   - Não invalida a assinatura anterior: não toca em `r.fnhrCompleted` nem em `r.needsReSignature`.

3. **Invalidação de Assinatura Existente no PMS Admin**:
   - Em `PUT /api/pms/reservations/:id` (linhas 13.718–13.765), quando `isDatesOrFlatChanged` é verdadeiro:
     ```javascript
     13728: r.fnhrCompleted = false;
     13729: r.signatureUrl = null;
     13730: r.checkedInAt = null;
     13731: r.needsReSignature = true;
     13732: r.reSignatureReason = "Alteração de acomodação (flat) ou período da estadia";
     ```
   - Invalida também slots individuais de hóspedes em `r.guests`.
   - O endpoint do portal do hóspede (`/api/pms/guest-portal/:code/modify`) **não implementava essa invalidação**.

4. **Fluxos de Pagamento Ativos no Servidor**:
   - PIX Dinâmico Inter: `createInterPixCob` (linhas 27.704–27.776), mTLS via porta 8443 com Banco Inter, status verificado via `checkInterPixCobStatus(r.pixTxId)` (linhas 27.850–27.880).
   - PIX Estático EMV: `generateStaticPixPayload` (linhas 11.283–11.307), chave CNPJ `47964813000165`, cidade `CAMPOS DOS GOYTACAZES`, com QR Code gerado por `QRCode.toDataURL`.
   - Mercado Pago: `createMercadoPagoPreference` (linhas 28.487–28.570), webhook `POST /api/pms/mercadopago/webhook` (linhas 28.610–28.670) e consulta ativa por `external_reference` via `checkMercadoPagoPaymentByRef(r.code)` (linhas 27.893–27.927).
   - Polling de Pagamento: `GET /api/pms/reservations/:code/payment-status` (linhas 28.229–28.343).
   - Registro de Pagamento: `confirmReservationPayment(r, details)` (linhas 28.157–28.225) estrutura os lançamentos em `r.payments`, atualiza `r.paidAmount` e define `r.paymentStatus`.

5. **Mecanismo de Hold Provisório Existente em Bot Actions**:
   - Em `POST /api/bot-actions/pre-reserve` (linhas 20.974–21.125), hold de 30 minutos configurável (`expiresAt = now + 30 min`).
   - Algoritmo de limpeza automática de holds vencidos em `lines 20740–20752`.
   - Efetivação definitiva via `POST /api/bot-actions/commit-reservation` (linhas 21.127–21.245) após validação de conflitos.

6. **Frontend e Re-Assinatura**:
   - `artifacts/limpeza/src/pages/guest-pre-checkin.tsx` (linhas 2067–2080) já possui a interface gráfica e o banner de alerta para `needsReSignature`.
   - `artifacts/limpeza/src/pages/guest-portal.tsx` (linhas 3117–3323) possui o modal de modificação legado com cálculo puramente client-side, sem preview do servidor, sem travas de pagamento e sem menção a `needsReSignature`.
   - O build do frontend (`npm run build` em `artifacts/limpeza`) compila com sucesso em 31.53s gerando chunks de produção limpos.

---

## 2. Logic Chain

1. **Premissa de Integridade Financeira**: Se o hóspede solicita um acréscimo de diárias (`additionalAmountToPay > 0`), mas o commit no banco de dados ocorre antes da liquidação financeira, o hóspede adquire direito às diárias extras mesmo fechando a janela ou abandonando o pagamento (Observação 2).
2. **Solução de Hold Provisório**: Para evitar que outro hóspede reserve o mesmo apartamento enquanto o primeiro está escaneando o QR Code do PIX, deve existir um bloqueio temporário (hold de 30 minutos) que protege o período sem alterar os campos principais `checkinDate`/`checkoutDate` da reserva (Observações 2 e 5).
3. **Mecanismo de Consulta e Liquidação**: Como o sistema já dispõe de verificação em tempo real de PIX (Inter cobrança e extrato) e Mercado Pago (Observação 4), a mesma lógica de polling em `modify-status` pode validar o pagamento do hold e, de forma síncrona e atômica, promover a modificação para definitiva em `db.reservations` (Observações 1, 2 e 4).
4. **Conformidade Jurídica e Operacional (Re-Assinatura)**: Quando datas ou número do flat são alterados, a FNRH original torna-se legalmente e operacionalmente inválida perante a portaria e o Ministério do Turismo (Lei Geral do Turismo). O padrão já existente em `PUT /api/pms/reservations/:id` (Observação 3) deve ser replicado integralmente na modificação via portal do hóspede, acionando o banner já existente no pré-check-in (Observação 6) e despachando mensagem com o link `{{link_checkin_digital}}`.
5. **Sincronização em Tempo Real**: Os endpoints de recepção (`/api/reception/today`) e garagem (`/api/pms/garage/daily-sheet`) leem diretamente a coleção `db.reservations` na requisição (Observações 1 e 4). Assim, o commit atômico garante que os painéis reflitam a mudança imediatamente na próxima leitura ou renderização.

---

## 3. Caveats

1. **Pagamentos em Dinheiro ou Balcão**: O fluxo de autoatendimento do portal do hóspede cobre estritamente PIX (Dinâmico e Estático) e Cartão de Crédito (Mercado Pago). Modificações pagas em dinheiro ou faturadas para empresas continuam dependendo do painel interno do PMS (`PUT /api/pms/reservations/:id`).
2. **Canais Externos (OTAs)**: Reservas originadas de Booking.com ou Airbnb continuam bloqueadas para alteração de datas pelo portal do hóspede (`403 Forbidden`), devendo ser alteradas diretamente na plataforma de origem.
3. **Troca de Flat no Portal**: A troca de flat no autoatendimento requer que o flat de destino esteja completamente vago no período solicitado. Se houver sobreposição em qualquer um dos apartamentos, a operação deve ser rejeitada com erro 409.

---

## 4. Conclusion

A investigação conclui que a arquitetura do backend do CorpFlats está plenamente preparada para receber o novo fluxo seguro em duas etapas. Não há impedimentos estruturais ou de performance.

Todas as peças fundamentais (motor de geração de PIX, geração de QR Code, preferência de checkout no Mercado Pago, verificação ativa por webhook/polling, trilha de auditoria em `r.modificationHistory` e `r.auditLogs`, e componentes de re-assinatura) já existem e estão testadas no repositório. O plano de ação para a fase de implementação consiste em:
1. Criar os endpoints `/api/pms/guest-portal/:code/modify-preview`, `/modify-checkout`, `/modify-status` e `/modify-cancel-pending`.
2. Integrar o hold `r.pendingModification` aos algoritmos de consulta de disponibilidade do calendário.
3. Refatorar o modal do portal do hóspede em `guest-portal.tsx` para apresentar o preview, badge de confirmação e checkout por PIX/Cartão.
4. Conectar o gatilho de re-assinatura (`r.needsReSignature = true`) e despacho automatizado do link via WhatsApp.
5. Manter rigorosamente a paridade byte-a-byte entre `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs`.

---

## 5. Verification Method

Para verificar independentemente todas as afirmações e diagnósticos deste relatório:

1. **Paridade Byte-a-Byte**:
   ```powershell
   powershell -Command "(Get-FileHash 'scripts/demo-server.mjs').Hash -eq (Get-FileHash 'artifacts/api-server/demo-server.mjs').Hash"
   ```
   Deve retornar `True`.

2. **Bateria de Testes Automatizados**:
   ```bash
   node --test tests/pre-reservation-payment-integrity.test.mjs
   node --test tests/bot-actions-api.test.mjs
   ```
   Todos os testes devem passar com 100% de aprovação.

3. **Verificação do Build Frontend**:
   ```bash
   cd "artifacts/limpeza"
   npm run build
   ```
   Deve compilar sem nenhum erro de TypeScript ou empacotamento Vite.

4. **Inspeção dos Arquivos do Relatório**:
   - `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_1\survey_report.md`
   - `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_1\handoff.md`

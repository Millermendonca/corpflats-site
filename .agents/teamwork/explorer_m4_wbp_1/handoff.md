# Handoff Report — Explorer 1 (Milestone 4: Features 17 & 18)

**Type:** Hard Handoff  
**Agent:** explorer_m4_wbp_1  
**Target:** parent / worker_m4  
**Date:** 2026-10-14  

---

## 1. Observation

1. **Especificação dos Webhooks e Polling na Documentação WBP**:
   - Em `wbp_docs/pages/wbpapi__callbacks__notify_booking.md` (linhas 17-27):
     ```markdown
     Endpoint: POST /NotifyBooking
     Version: 1.0
     Security: shared_secret
     ## Request fields (application/x-www-form-urlencoded):
       - `wbp_property_id` (integer)
       - `booking_id` (integer)
       - `shared_secret` (string, required)
     ```
   - Em `wbp_docs/pages/wbpapi__callbacks__booking_create.md` (linhas 22-38):
     ```markdown
     Endpoint: POST /BookingCreate
     Version: 1.0
     Security: shared_secret
     ## Request fields (application/json):
       - `pms_property_id` (string)
       - `wbp_property_id` (string)
       - `shared_secret` (string, required)
       - `reservation` (object)
     ```
   - Em `wbp_docs/pages/wbpapi__other__get_booking_list.md` (linhas 41-55):
     ```markdown
     - `wbp_booking_version` (string,null, required)
       With each request we send along wbp_booking_version, which has the format YYYY-MM-DD HH:MM:SS...
       make sure to always reduce 5 or more minutes from the time given...
       If wbp_booking_version is null please return all bookings.
     ```
   - Em `wbp_docs/README.md` (linhas 30-35):
     ```markdown
     - BookingCreate: reserva completa em JSON. Resposta {} em caso de sucesso.
     - NotifyBooking: apenas o booking_id, em form-urlencoded. O PMS deve então chamar GetBookingList.
     - ARIFullRefresh: pede uma carga completa. Resposta {UpdateId}.
     - RoomInfo: devolve a lista de quartos do PMS.
     - Formato de erro dos callbacks: {Error|ErrorCode, ErrorMsg|Error}.
     ```

2. **Implementação Existente do Roteador e do Worker**:
   - Em `artifacts/api-server/wbp/callbacks.mjs`:
     - O roteador `createWbpCallbackRouter` existe com rotas `/BookingCreate`, `/NotifyBooking`, `/ARIFullRefresh` e `/RoomInfo`.
     - No entanto, falta parser dedicado para formulários em tempo de montagem para garantir parsing de `application/x-www-form-urlencoded`.
     - Falta a sanitização de CVV em memória antes de `storage.recordRawPayload` (linhas 80-84 gravam `req.body` diretamente).
     - Em `/NotifyBooking` (linha 135), o payload bruto é gravado, mas não dispara a busca e ingestão pontual no modo `auto`.
     - O `WbpBackgroundWorker` (linhas 222-305) tem a estrutura básica, mas:
       - Não persiste `wbp_last_booking_version` no banco/settings do PMS.
       - Não sanitiza CVV em memória ao receber `GetBookingId`.
       - Não está instanciado no `demo-server.mjs`.

3. **Código Legado do PMS sobre Pagamentos OTA**:
   - Em `artifacts/api-server/demo-server.mjs` (linhas 14197-14230):
     ```javascript
     const chanLower = String(channel || "").toLowerCase();
     const isOta = chanLower.includes("booking") || chanLower.includes("airbnb");
     ...
     if (isOta) {
       resolvedPaymentStatus = "pago_total";
       if (finalTotalAmount > 0) {
         resolvedPaidAmount = finalTotalAmount;
       }
     }
     ```
   - Isso sobrescreve cegamente qualquer reserva de OTA para `pago_total`, violando a nova diretriz parental quando `PaymentCollect === "Property"`.

4. **Diretiva Parental de Milestone 4 (2026-10-14T01:39:43Z)**:
   - "TEST NOTIFICATION ISOLATION (AGENTS.md): In all M4 tests, ZERO real messages to WhatsApp (Z-API), SMTP, or SERPRO... Use dependency injection/transport interceptors or sandbox mocks (`e2e/sandbox/mock-zapi`, `mock-smtp`) + `NODE_ENV="test"`, `DATABASE_URL` unset, `DATA_FILE` in `os.tmpdir()`"
   - "PAYMENT COLLECT vs LEGACY `pago_total` (R5): `PaymentCollect = 'Channel'` -> `pago_total`, `PaymentCollect = 'Property'` -> `pendente`, MUST NOT be overwritten to `pago_total`"
   - "CARD HYGIENE ON INGESTION (R6): Immediately discard CVV in memory BEFORE saving to any file or log. Full PAN NEVER enters `db.reservations`, `wbpInbox`, `quarantineBookings`, `audit_logs.jsonl` or `console.log`"
   - "SAFE TRANSITION / DEDUPLICATION (R5): Existing manual Booking/Airbnb reservations matching securely are LINKED (`externalOrderId`), never duplicated."

---

## 2. Logic Chain

1. A partir das observações da documentação WBP (Observação 1), callbacks chegam com Content-Types divergentes (`application/json` em `/BookingCreate`, mas `application/x-www-form-urlencoded` em `/NotifyBooking`).
2. Portanto, o roteador `createWbpCallbackRouter` deve declarar explicitamente middlewares para ambos os formatos (`express.json({ limit: "10mb" })` e `express.urlencoded({ extended: true, limit: "10mb" })`), garantindo que campos como `booking_id` e `shared_secret` estejam presentes em `req.body` independentemente do cabeçalho enviado pela WBP.
3. A partir da Diretiva Parental R6 (Observação 4), se uma reserva vier com dados de pagamento e cartão (`Payments` ou `Cards`), campos contendo CVV/CVC violam a política de segurança PCI e de proteção de dados se forem persistidos mesmo que em armazenamento temporário ou logs.
4. Logo, uma rotina de sanitização recursiva em memória (`sanitizeCardDataInMemory`) deve ser executada imediatamente na entrada, deletando chaves contendo CVV antes de chamar `storage.recordRawPayload` e antes de qualquer gravação em disco.
5. A partir do requisito de mitigação de clock skew (Observação 1), o WBP especifica deduzir 5 minutos de `wbp_booking_version`. O método `client.adjustBookingVersion` já implementa esse cálculo. O worker de background deve carregar a versão salva (`wbp_last_booking_version`), aplicar a margem e, ao final de uma rodada com sucesso, persistir o novo cursor UTC no PMS.
6. A partir da regra de atomicidade e integridade (R1 e R2), `client.ackBooking` só pode ser executado após a persistência durável no storage e no PMS. Se ocorrer crash durante o processamento, `storage.getUnprocessedPayloads()` recupera o payload não processado na inicialização, garantindo processamento exatamente uma vez (idempotente) antes do ACK.
7. A partir da análise do código legado (Observação 3) e da Diretiva Parental R5 (Observação 4), ao instanciar ou integrar `processIncomingOTA`, o valor de `PaymentCollect` deve ser respeitado: `"Channel"` gera `pago_total` com valor líquido; `"Property"` força `paymentStatus = "pendente"`, bloqueando a sobrescrita legada da linha 14226.

---

## 3. Caveats

- **Formato Exato de Cartões na WBP**: Como notado no README oficial da WBP (linha 51), o campo `Payments` não é detalhado exaustivamente na especificação pública. O sanitizador projetado em `analysis.md` utiliza busca recursiva case-insensitive para cobrir qualquer variação de nomenclatura (`card_cvv`, `cvv`, `cvc`, `security_code`, `card_security_code`).
- **Comportamento em Modo Observe**: No modo `observe`, o worker pode consultar a WBP e salvar payloads brutos para auditoria, mas decidimos que ele **não deve chamar `AckBooking`**, pois chamar ACK na WBP sem ter aplicado a reserva no PMS faria a WBP assumir que a reserva já está importada em definitivo, impedindo um reimport posterior no modo `auto`.
- **Nenhum Código de Produção Foi Alterado**: Por se tratar de investigação de Explorer, nenhum arquivo de código de aplicação em `artifacts/api-server/` ou `scripts/` foi modificado neste turno.

---

## 4. Conclusion

A arquitetura para as Features 17 (Inbound Webhooks & Form Parsing) e 18 (Background Polling Backup) está completamente desenhada, documentada e alinhada a todos os requisitos e diretrizes:
1. **Feature 17**: Roteador com suporte dual (`json` + `urlencoded`), autenticação em tempo constante, sanitização prévia de CVV em memória, gravação durável insert-only antes de regras de negócio, e respostas compatíveis com a WBP (HTTP 200 `{}` ou `{ UpdateId }`).
2. **Feature 18**: Worker com timer de 30 minutos condicionado ao interruptor geral, dedução de 5 minutos na timestamp de versão com fallback seguro para `null`, recuperação automática de falhas no startup via `getUnprocessedPayloads()`, e chamada de `ackBooking` estritamente posterior à gravação durável.
3. **Resiliência**: Tratamento uniforme dos modos `off` (100% inerte), `observe` (apenas ingestão durável e auditoria) e `auto` (mutação no PMS e automações sem PIX).
4. O documento `analysis.md` na pasta do agente contém o blueprint completo e código pronto para implementação pelo Worker de M4.

---

## 5. Verification Method

Para verificar independentemente estas conclusões e validar a implementação do Worker:

1. **Inspeção de Documentos**:
   - Verificar `analysis.md` nesta pasta: confirmação do blueprint arquitetural e contratos de interface.
   - Verificar `wbp_docs/pages/wbpapi__callbacks__notify_booking.md` para checar os requisitos de form-urlencoded.
   - Verificar `wbp_docs/pages/wbpapi__other__get_booking_list.md` para confirmar a regra dos 5 minutos.
2. **Execução de Teste Pontual (Estrita conforme AGENTS.md)**:
   - Ao implementar o código, executar estritamente o teste pontual isolado:
     ```powershell
     node --test tests/wbp-integration/m4-webhooks-polling.test.mjs
     ```
   - **Condições de Invalidação**:
     - Se `tests/*.test.mjs` for executado em lote: violação imediata de `AGENTS.md`.
     - Se o payload bruto gravado contiver código CVV: reprovação imediata da política R6.
     - Se `AckBooking` for disparado antes da gravação durável: reprovação do critério R1/R2.
     - Se o hash SHA-256 de `data/database.json` real mudar após a execução dos testes: reprovação imediata do portão.

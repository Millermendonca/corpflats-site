# Relatório de Handoff: Endpoint `/modify-checkout` e Motor de Hold Provisório (`r.pendingModification`)

**Agente**: M1 Explorer 2  
**Data**: 2026-10-11T13:26:00Z  
**Destinatário**: Orchestrator / Suborch M1 / Worker M1  
**Diretório de Trabalho**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m1_explorer_2`  
**Documento Principal**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m1_explorer_2\analysis.md`

---

## 1. Observation

1. **Vulnerabilidade no Endpoint Legado `/modify`**:
   - Arquivo: `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs`, linhas 15.456 a 15.716.
   - Linhas 15.615–15.616:
     ```javascript
     r.checkinDate = newCheckinDate;
     r.checkoutDate = newCheckoutDate;
     ```
   - Linhas 15.528–15.529:
     ```javascript
     additionalAmountToPay += extraNights * dailyRate;
     r.totalAmount = Number(r.totalAmount || 0) + additionalAmountToPay;
     ```
   - As datas e o total da reserva são mutados no banco de dados imediatamente antes de qualquer pagamento ser realizado, gerando risco financeiro e quebra da integridade das reservas caso o hóspede abandone o checkout.

2. **Infraestrutura de Pagamento PIX Existente**:
   - `createInterPixCob`: Linhas 27.704–27.776 em `demo-server.mjs`. Gera cobrança imediata via API oficial mTLS Banco Inter na URL `https://cdpj.partners.bancointer.com.br/pix/v2/cob/${txid}`, retornando `{ txid, pixCopiaECola, ... }`.
   - `generateStaticPixPayload`: Linhas 11.283–11.307 em `demo-server.mjs`. Gera linha digitável EMV BR Code com chave padrão `47964813000165` (`CORPFLATS LTDA`) e cálculo de CRC16.
   - `QRCode.toDataURL`: Linhas 20.945 e 21.095 em `demo-server.mjs`. Gera string Base64 Data URI (`data:image/png;base64,...`) pronta para renderização direta em tags `<img>`.

3. **Infraestrutura de Pagamento Mercado Pago Existente**:
   - `createMercadoPagoPreference`: Linhas 28.487–28.570 em `demo-server.mjs`.
   - Propriedade `external_reference` (linha 28.517) recebe `reservationCode`.
   - `checkMercadoPagoPaymentByRef(externalRef)`: Linhas 27.893–27.927. Busca ativa via `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(externalRef)}`.

4. **Algoritmos de Verificação de Disponibilidade e Conflito**:
   - `GET /api/reservations/availability`: Linhas 11.183–11.187 mapeiam ocupação em `(db.reservations || []).filter(r => r.status !== "cancelada" && r.checkinDate < checkout && r.checkoutDate > checkin)`.
   - `GET /api/bot-actions/availability`: Linhas 20.756–20.764 mapeiam `busyFlatSet` limpando pré-reservas vencidas (`new Date(r.expiresAt).getTime() < nowMs && r.paymentStatus !== "pago_total"`).
   - `POST /api/bot-actions/pre-reserve`: Linhas 21.002–21.007 verificam `hasConflict` considerando expiração de pré-reservas de 30 min.
   - Atualmente, nenhum desses pontos verifica `r.pendingModification`, permitindo que outro usuário reserve um flat que está em processo de modificação.

5. **Paridade Byte-a-Byte (Twin-Server Parity)**:
   - Execução do comando:
     `Get-FileHash "scripts/demo-server.mjs", "artifacts/api-server/demo-server.mjs"`
   - Resultado: Ambos os arquivos possuem o hash SHA-256 idêntico `4FDDE099E92A3036D49E7C1ED5E1E57CF3568719D0E7573D4AC6F6AB9B92CAEB`.

---

## 2. Logic Chain

1. **A partir da Observação 1**: Para impedir que as datas sejam atualizadas prematuramente quando `additionalAmountToPay > 0`, o endpoint de checkout não deve alterar `r.checkinDate`, `r.checkoutDate` nem `r.totalAmount`. Em vez disso, deve armazenar a proposta de alteração em um objeto anexo temporário: `r.pendingModification`.
2. **A partir das Observações 2 e 3**: Para permitir que o hóspede pague a diferença via PIX ou Cartão no Guest Portal, `r.pendingModification` deve conter os identificadores e dados de cobrança de ambos os gateways: `pixTxId`, `pixCopiaECola`, `pixQrCodeUrl`, `mpPreferenceId` e `mpCheckoutUrl`.
3. **A partir da Observação 3**: Se a preferência do Mercado Pago usasse simplesmente `reservationCode: r.code`, uma busca por pagamentos encontraria o pagamento inicial já aprovado da reserva original, gerando uma liquidação falsa positiva imediata. Portanto, a preferência de modificação deve obrigatoriamente usar `external_reference: "MOD-" + r.code`.
4. **A partir da Observação 4**: Enquanto o hóspede estiver na janela de pagamento de 30 minutos (`expiresAt = now + 30m`), nenhum outro hóspede pode reservar o período solicitado no apartamento de destino. Logo, `isPendingHoldActive(other.pendingModification)` deve ser incorporado em `hasReservationConflict`, `GET /availability`, `GET /bot-actions/availability` e `POST /bot-actions/pre-reserve`.
5. **A partir dos passos 1 e 4**: Como as datas originais `r.checkinDate` e `r.checkoutDate` nunca foram alteradas durante o hold, se os 30 minutos expirarem sem pagamento (`new Date(expiresAt).getTime() < nowMs`), o hold simplesmente passa para `status = 'expired'`. O bloqueio temporário desaparece e a reserva original permanece 100% preservada sem qualquer efeito colateral.
6. **A partir da Observação 5**: Todas as alterações devem ser espelhadas de forma idêntica e simultânea em `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs`.

---

## 3. Caveats

1. **Ambiente Sandbox / Sem Credenciais Inter**:
   Em ambiente local de testes ou se as chaves mTLS do Banco Inter não estiverem no disco, `createInterPixCob` lança exceção. O endpoint trata isso com fallback resiliente para o PIX estático via `generateStaticPixPayload`, garantindo que a emissão do QR Code e a linha digitável nunca falhem.
2. **Concorrência entre Abas do Mesmo Hóspede**:
   Se o mesmo hóspede submeter múltiplas requisições em `/modify-checkout` para datas diferentes, a nova requisição substitui o objeto `r.pendingModification` existente, reiniciando o cronômetro de 30 minutos e liberando o hold anterior.
3. **Escopo de Liquidação e Commit**:
   A efetivação atômica definitiva do pagamento (promover datas, registrar em `r.payments`, atualizar `modificationHistory` e marcar `r.needsReSignature = true`) é tratada na consulta de status (`/modify-status`), sob escopo de Explorer 3.

---

## 4. Conclusion

O design do endpoint `POST /api/pms/guest-portal/:code/modify-checkout` e da estrutura `r.pendingModification` foi completamente finalizado e documentado em `analysis.md`:
- Estrutura completa de `r.pendingModification` com 13 campos obrigatórios (`pendingId`, `newCheckinDate`, `newCheckoutDate`, `newGuestCount`, `newFlatId`, `additionalAmountToPay`, `createdAt`, `expiresAt`, `status: 'pending'`, `pixTxId`, `pixQrCodeUrl`, `pixCopiaECola`, `mpPreferenceId`, `mpCheckoutUrl`) mais metadados de snapshot da reserva.
- Prevenção total contra double-booking através de `hasReservationConflict` e `isPendingHoldActive`.
- Auto-expiração em 30 minutos com preservação garantida das datas originais da reserva.
- Código completo verbatim pronto para aplicação pelo Worker em `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs`.

---

## 5. Verification Method

Para verificar a integridade da implementação:

1. **Paridade Byte-a-Byte**:
   ```powershell
   Get-FileHash "scripts/demo-server.mjs", "artifacts/api-server/demo-server.mjs" | Select-Object Hash, Path
   ```
   *Critério de Invalidação*: Hashes divergentes invalidam o commit imediatamente.

2. **Execução da Bateria de Testes Automatizados**:
   ```powershell
   node --test tests/bot-actions-api.test.mjs
   node --test tests/pre-reservation-payment-integrity.test.mjs
   ```

3. **Verificação do Endpoint `/modify-checkout` e Hold no Banco**:
   - Disparar requisição `POST /api/pms/guest-portal/:code/modify-checkout` com `{ newCheckinDate: "2026-11-01", newCheckoutDate: "2026-11-05", newGuestCount: 2 }`.
   - Validar retorno HTTP 200 contendo `pendingId`, `expiresAt`, `pixCopiaECola`, `pixQrCodeUrl`.
   - Inspecionar `data/database.json`:
     - `r.checkinDate` e `r.checkoutDate` devem permanecer inalterados.
     - `r.pendingModification` deve conter `status: "pending"` e `additionalAmountToPay > 0`.
   - Chamar `GET /api/reservations/availability?checkin=2026-11-01&checkout=2026-11-05` e constatar que o apartamento de destino consta como ocupado devido ao hold provisório.

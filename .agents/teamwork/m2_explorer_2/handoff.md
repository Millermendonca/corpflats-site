# Handoff Report — Milestone 2: Automated Re-Signature Communication

**Agent**: M2 Explorer 2  
**Recipient**: Parent Orchestrator (`494db1f9-cfb2-46e9-8b9f-419a8aa9586c`)  
**Type**: Hard Handoff  
**Workspace**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_explorer_2`

---

## 1. Observation

1. **Paridade Twin-Server Prévia**:
   - `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs` possuem hash SHA-256 idêntico: `72EA96CE4DC341181B8B41E7A01FE91F52E975FDD757FBD70C033688FEC6184F`.
   - `scripts/zapi-service.mjs` e `artifacts/api-server/zapi-service.mjs` possuem hash SHA-256 idêntico: `0350354EAE6432EC36294D2517C7F319131DECC1F2C6CFBD751CD3BBA9ED47CA`.
   - `scripts/mail-service.mjs` e `artifacts/api-server/mail-service.mjs` possuem hash SHA-256 idêntico: `3F17611B47BEA3B2F7CFED8BF2E288DC502DE894985223DF7EB903C410DA1E9E`.

2. **Geração de URL de Check-in Existente**:
   - Em `scripts/demo-server.mjs:5925` e `scripts/zapi-service.mjs:65`:
     ```javascript
     const internalCheckinUrl = `${hostBase}/pre-checkin/${resCode}?guest=${safeGuestIndex}`;
     ```
   - O resolvedor não adicionava `?resign=1` ou `&resign=1` quando `reservation.needsReSignature === true`.

3. **Template de Mensagem de Atualização (`tpl_reservation_updated`)**:
   - Em `scripts/zapi-service.mjs:497-519`:
     ```javascript
     buttons: [
       { id: "btn_checkin", type: "URL", label: "📝 Assinar Ficha Atualizada", url: "{{link_checkin_digital}}" },
       { id: "btn_portal", type: "URL", label: "🏨 Ver Detalhes da Reserva", url: "{{link_portal_hospede}}" },
       { id: "btn_admin", type: "CALL", label: "📞 Falar com Atendimento", phone: "{{telefone_hotel}}" }
     ]
     ```
   - O botão principal já aponta para `{{link_checkin_digital}}`. Quando o link inclui `?resign=1`, o WhatsApp e o e-mail transmitem imediatamente a URL de re-assinatura.

4. **Pontos de Modificação de Reserva sem Disparo ao Hóspede**:
   - `commitPendingModification` (`scripts/demo-server.mjs:15880-15902`): Salva o commit atômico e cria notificação para o painel interno, mas não despachava mensagem de WhatsApp ou e-mail ao hóspede.
   - `POST /api/pms/guest-portal/:code/modify` (`scripts/demo-server.mjs:16955-16975`): Despacha e-mail para a portaria (`receptionEmail`), mas não enviava o link de re-assinatura para o hóspede.
   - `PUT /api/pms/reservations/:id` (`scripts/demo-server.mjs:14489-14496`): Dispara `triggerImmediateWhatsApp`, porém se `zapiConfig.enabled === false`, o envio era abortado na linha 7617 de `zapi-service.mjs`.

5. **Interface de Re-assinatura do Frontend**:
   - Em `artifacts/limpeza/src/pages/guest-pre-checkin.tsx:605-640` e `2067-2080`: Quando `reservation.needsReSignature === true` ou o parâmetro `resign=1` está ativo, o portal exibe o banner `"Reserva Atualizada • Nova Assinatura Necessária"`, invalida a assinatura anterior e mantém preservados todos os dados cadastrais e documentos para assinatura em 1 clique.

---

## 2. Logic Chain

1. **Premissa 1**: Conforme o requisito **R3** de `ORIGINAL_REQUEST.md`, quando datas ou flat mudam, a assinatura anterior deve ser invalidada e o hóspede deve receber comunicação automatizada (WhatsApp/e-mail) com o link direto para assinar a nova declaração.
2. **Premissa 2**: A tag `{{link_checkin_digital}}` é o canal padrão de geração de links em `scripts/zapi-service.mjs` tanto para o corpo da mensagem quanto para botões de ação de WhatsApp e e-mail espelho.
3. **Dedução 1**: Atualizando `getCheckinUrlSync` e `getCheckinUrl` para verificar `reservation?.needsReSignature` e gerar `${hostBase}/pre-checkin/${resCode}?resign=1` (ou `?guest=${safeGuestIndex}&resign=1`), todo e qualquer envio da régua que utilize `{{link_checkin_digital}}` direciona o hóspede imediatamente para o modo de re-assinatura.
4. **Dedução 2**: Para garantir que nenhum canal silencie o outro, a função `dispatchReservationReSignatureNotifications` deve orquestrar:
   - Registro de auditoria (`RE_SIGNATURE_NOTIFICATION_DISPATCHED` e `re_signature_requested`).
   - Disparo assíncrono em `setImmediate` chamando `triggerImmediateWhatsApp("reservation_updated")`.
   - Verificação de garantia de e-mail: se o Z-API não enviou o espelho (por exemplo, se o motor Z-API estiver desligado ou em modo sandbox), o e-mail corporativo é entregue via `sendMirrorEmail` / `sendEmailAsync`.
5. **Dedução 3**: Na conclusão da assinatura em `POST /api/pms/pre-checkin`, o status `r.needsReSignature = false` deve ser restabelecido, a FNRH com hash SHA-256 é gerada e o envio à recepção é realizado.

---

## 3. Caveats

1. **Modo Sandbox Z-API**: Em ambientes de homologação onde `db.zapiConfig.testModeOnly === true`, mensagens para números que não constam em `testAllowedPhones` são suprimidas no WhatsApp. No entanto, o e-mail espelho ao hóspede (`reservation.guestEmail`) continua sendo disparado normalmente.
2. **Reservas Sem E-mail ou Sem Telefone**: Se o hóspede não tiver e-mail cadastrado, o envio será realizado exclusivamente via WhatsApp. Se não tiver telefone (comum em algumas reservas OTA), o envio é realizado exclusivamente via e-mail.
3. **Regra de Não-Execução Global de Testes**: Respeitando rigorosamente as diretrizes de `AGENTS.md`, nenhum teste em lote foi ou deve ser disparado.

---

## 4. Conclusion

O mecanismo de comunicação automatizada com link direto de re-assinatura está completamente desenhado e pronto para drop-in:
1. `getCheckinUrlSync` atualizado para injetar `?resign=1` automaticamente quando `reservation.needsReSignature === true`.
2. Criada a função `dispatchReservationReSignatureNotifications(reservation, changes, options)` em `scripts/demo-server.mjs`.
3. Invocação integrada nos 3 pontos de modificação: `commitPendingModification`, `POST /modify`, e `PUT /api/pms/reservations/:id`.
4. Limpeza de flag e envio de documento assinado em `POST /api/pms/pre-checkin`.
5. Blueprint exato e documentado em `analysis.md` para aplicação em estrita paridade Twin-Server (`scripts/` e `artifacts/api-server/`).

---

## 5. Verification Method

Para verificação pontual e independente pelo implementador ou suíte M2:

1. **Verificação de Paridade de Arquivos**:
   ```powershell
   Get-FileHash scripts/demo-server.mjs, artifacts/api-server/demo-server.mjs | Format-Table -Property Path, Hash
   Get-FileHash scripts/zapi-service.mjs, artifacts/api-server/zapi-service.mjs | Format-Table -Property Path, Hash
   ```
2. **Teste Pontual do Resolvedor de URL**:
   Importar `getCheckinUrlSync` e testar:
   ```javascript
   const urlNormal = getCheckinUrlSync({ code: "RES-TEST-01", needsReSignature: false });
   assert.strictEqual(urlNormal.includes("resign=1"), false);

   const urlResign = getCheckinUrlSync({ code: "RES-TEST-01", needsReSignature: true });
   assert.strictEqual(urlResign.includes("resign=1"), true);
   ```
3. **Teste Pontual do Disparo de Notificações**:
   Disparar `dispatchReservationReSignatureNotifications` para reserva de teste com `guestPhone` e `guestEmail` e verificar:
   - Presença do log em `db.auditLogs` com `action: "RE_SIGNATURE_NOTIFICATION_DISPATCHED"`.
   - Presença do log em `r.auditLogs` com `action: "re_signature_requested"`.
   - Mensagem gerada em `db.whatsappHistory` ou `db.reservationCommunications` contendo a URL com `?resign=1`.

# Relatório de Análise Técnica — Milestone 2 Explorer 3

**Agente**: `m2_explorer_3` (Papéis: Explorer, Investigação, Síntese)  
**Data**: 2026-10-11T14:52:00Z  
**Diretório de Trabalho**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_explorer_3`  
**Escopo**: Milestone 2 — Ciclo de Vida de Re-Assinatura, Entrega de Documentos Forenses e Sincronização Operacional de Agendadores.

---

## 1. Sumário Executivo & Delimitação do Problema

O Milestone 2 da CorpFlats trata da governança jurídica e operacional quando uma reserva confirmada sofre alteração em suas datas (`checkinDate`/`checkoutDate`) ou na acomodação designada (`flatNumber`/`flatId`). O escopo do Explorer 3 foca nos seguintes pilares:
1. **Geração Forense do PDF da FNRH Re-assinada**: emissão de documento comprobatório atualizado contendo o novo flat, novo período, UUID único e cálculo canônico de integridade SHA-256.
2. **Entrega Automática por E-mail à Portaria/Recepção**: envio assíncrono imediato (`sendEmailAsync`) da ficha recém-assinada anexada em PDF para o e-mail da recepção do edifício, garantindo que a portaria possua o termo assinado mesmo em estadias futuras.
3. **Sincronização em Tempo Real do Painel da Recepção (`/api/reception/today`)**: bloqueio de check-in físico e exibição de alerta de pendência enquanto `r.needsReSignature === true`.
4. **Sincronização de Agendadores Operacionais**:
   - Limpeza incondicional dos carimbos matinais (`morningEmailSentDate`, `morningEmailSentAt`, `receptionNotifiedAt`) em qualquer alteração da data de check-in, garantindo que a rotina matinal das 07:00 dispare pontualmente no novo dia de chegada.
   - Sincronização e cancelamento/reativação dos pedidos de café da manhã fora/dentro da nova janela da estadia (`db.breakfastOrders`).
   - Ajuste das ordens de governança e limpeza de turnover (`db.cleaningRequests`) para a nova data de check-out e novo flat.
5. **Formulação da Bateria de Testes Automatizados**: especificação integral da suíte pontual `tests/m2-re-signature-operations-sync.test.mjs` cobrindo todos os invariantes do Milestone 2.

---

## 2. Observações Forenses do Código-Fonte

### 2.1. Geração de PDF e Hash SHA-256 (`scripts/fnrh-pdf-service.mjs`)
- **Linhas 71-105**: `generateFnrhPdf({ reservation, guestData, signatureBase64, ... })` cria um novo UUID v4 (`documentUuid = crypto.randomUUID()`), gera carimbo em Horário de Brasília e define o caminho do arquivo em `secure_uploads/fnrh_documents/`.
- **Linhas 194-205**: O cabeçalho e a seção 1 da ficha renderizam dinamicamente a acomodação atual (`reservation.flatNumber || reservation.flatId`), check-in (`reservation.checkinDate` às `reservation.checkinTime`) e check-out (`reservation.checkoutDate` às `reservation.checkoutTime`).
- **Linhas 428-448**: Calcula o `canonicalHash` a partir do payload canônico normalizado via `crypto.createHash("sha256")` e grava a trilha no rodapé forense do PDF.
- **Linhas 466-469**: Calcula o `sha256Hash` físico do arquivo final gerado em disco (`finalFileSha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex")`).
- **Retorno (Linhas 485-534)**: Retorna `{ filePath, fileName, fileUrl, downloadUrl, r2Url, token, documentUuid, sha256Hash, canonicalHash, signedAt, auditTrail }`.

### 2.2. Pré-Check-in e Disparo de E-mail (`scripts/demo-server.mjs`)
- **Linhas 21140-21225**: `POST /api/pms/pre-checkin` invoca `generateFnrhPdf`. Persiste `fnrhDocument.auditTrail` em `db.fnrhAuditDocuments` e salva `fnrhDocument.documentUuid`, `fnrhDocument.sha256Hash`, `fnrhDocument.fileUrl` em `r` e no `targetGuest`.
- **Linhas 21230-21290**: O envio de e-mail de notificação à recepção com o PDF em anexo possui atualmente uma trava estrita:
  ```javascript
  const brToday = getBrasiliaTodayStr();
  const isCheckinTodayOrPast = isReservationForTodayOrPast(r);
  if (isCheckinTodayOrPast) { ... }
  ```
  *Problema identificado*: Se uma reserva futura (ex.: chegada em 5 dias) tem suas datas/apartamento alterados e o hóspede re-assina a ficha digital, a recepção **não** recebia o novo documento imediatamente devido a `!isCheckinTodayOrPast`, descumprindo o Requisito R3 (linha 110/128 do ORIGINAL_REQUEST.md: *"Once the guest re-signs, the newly signed check-in document must be generated and automatically delivered to the building reception"*).

### 2.3. Painel da Recepção (`GET /api/reception/today` & `POST /api/reception/checkin/:id`)
- **Linhas 18756-18995**: `GET /api/reception/today` lista as chegadas previstas para hoje.
  - Linha 18841: Atualmente define `hasCompletedCheckin: Boolean(r.fnhrCompleted && !r.needsReSignature)`.
  - Linhas 18857-18858: `const allCheckinDone = guestList.every(g => g.hasCompletedCheckin);`
  - Linhas 18916-18925: Se `!allCheckinDone`, exibe aviso de pendente, mas **não** possui mensagem explícita orientando que o motivo do bloqueio é a re-assinatura obrigatória em caso de alteração de reserva.
  - Linha 18992: `hasPreCheckin: Boolean((r.fnhrCompleted && !r.needsReSignature) || someCheckinDone)`. *Falha lógica*: Se `someCheckinDone` for `true` em objeto antigo mas `r.needsReSignature === true`, `hasPreCheckin` ainda avaliava como `true`.
- **Linhas 19143-19225**: `POST /api/reception/checkin/:reservationId` (registro de entrada física no tablet). Não impedia explicitamente a entrada se `r.needsReSignature === true`, permitindo potencial liberação indevida na portaria sem termo atualizado.

### 2.4. Rotina Matinal das 07:00 (`scripts/demo-server.mjs:32379-32461`)
- O agendador executa a cada 5 minutos e filtra:
  ```javascript
  const todayCheckins = db.reservations.filter(r =>
    r.checkinDate === todayStr &&
    r.status !== "cancelada" &&
    r.status !== "cancelled" &&
    r.morningEmailSentDate !== todayStr
  );
  ```
  Ao despachar o e-mail das 07:00, carimba `r.morningEmailSentDate = todayStr;`.
  Se a data de check-in for alterada de hoje para outra data futura ou de um dia para outro, `r.morningEmailSentDate` **precisa ser deletado** (`delete r.morningEmailSentDate`) para que a rotina matinal seja acionada normalmente no novo dia de chegada.

### 2.5. Reconciliação de Governança e Café da Manhã nas Vias de Modificação
- **`commitPendingModification` (linhas 15836-15876)**:
  - Cancela pedidos de café fora da nova janela via `computeBreakfastCancellationReason` e reativa os pedidos válidos.
  - Atualiza solicitação de limpeza de turnover (`c.requestDate === oldCheckout || c.requestDate === oldCheckin`) para o novo `targetCheckout` e transfere o apartamento se houve troca de flat.
  - *Lacuna identificada*: No agendador matinal (linha 15852), limpava os carimbos matinais apenas se `isReservationForFuture(r)`, em vez de limpar incondicionalmente sempre que `oldCheckin !== targetCheckin`.
- **`POST /api/pms/guest-portal/:code/modify` (linhas 16934-16988)**:
  - Em `db.cleaningRequests`, buscava `c.requestDate === r.checkinDate` depois que `r.checkinDate` já havia sido sobrescrito para `newCheckinDate`, falhando em encontrar a limpeza anterior vinculada a `oldCheckout` ou `oldCheckin`.
  - Não sincronizava o número do flat nos pedidos de café da manhã caso houvesse troca de flat.
- **`PUT /api/pms/reservations/:id` (linhas 14341-14349)**:
  - Limpava `morningEmailSentDate` apenas se `isReservationForFuture(r)` e não atualizava a data de limpeza de turnover quando `oldCheckout !== r.checkoutDate`.

---

## 3. Cadeia Lógica & Arquitetura da Solução

### 3.1. Re-Assinatura e Geração do PDF com Hash Canônico
1. **Detecção de Re-Assinatura**: Em `POST /api/pms/pre-checkin`, o servidor detecta se a requisição é uma renovação de assinatura:
   ```javascript
   const wasReSignature = Boolean(
     r.needsReSignature || 
     targetGuest.needsReSignature || 
     req.body.resign === "1" || 
     req.body.isReSignature === true || 
     req.query.resign === "1"
   );
   ```
2. **Atualização Cadastral e Limpeza de Flags**:
   - Atualiza dados do hóspede e sua assinatura (`signatureBase64`/`signatureUrl`).
   - `targetGuest.needsReSignature = false;`
   - `targetGuest.hasCompletedCheckin = true;`
   - Se todos os hóspedes da reserva estiverem sem pendência de re-assinatura (`!r.guests.some(g => g.needsReSignature)`):
     - `r.needsReSignature = false;`
     - `delete r.reSignatureReason;`
     - `r.fnhrCompleted = true;`
3. **Emissão Forense**:
   - `generateFnrhPdf` recebe a reserva `r` com os dados atuais (novo flat, novas datas).
   - Produz `documentUuid`, `canonicalHash` e `sha256Hash`.
   - Salva em disco e associa a `r.fnrhDocumentUuid`, `r.fnrhSha256Hash`, `r.fnrhCanonicalHash`, `r.fnrhPdfUrl`.
   - Registra o evento no histórico forense: `logFnrhInternalAudit({ action: wasReSignature ? "FNRH_RE_SIGNED" : "FNRH_SIGNED", ... })`.

### 3.2. Entrega Automática à Recepção do Edifício
1. **Regra de Disparo Imediato**:
   O envio automático por e-mail (`sendEmailAsync`) deve ocorrer imediatamente se:
   - A reserva for para hoje ou passado (`isCheckinTodayOrPast`), **OU**
   - Trata-se de uma **re-assinatura** (`wasReSignature === true`), independentemente da data de check-in ser futura.
2. **Construção do E-mail e Anexos**:
   - Destinatário: e-mail da portaria (`flat.receptionEmail || db.settings.receptionEmail || process.env.RECEPTION_EMAIL`).
   - CC: e-mail da garagem se houver veículo na reserva.
   - Assunto: se `wasReSignature`, inclui indicativo explícito: `"[RE-ASSINATURA CHECK-IN] Termo Atualizado - Flat ${r.flatNumber} - ${validName}"`.
   - Anexos: o arquivo físico recém-gerado da FNRH PDF é incluído obrigatoriamente em `attachments`.
   - Metadados: `{ trigger: wasReSignature ? "re_signature_checkin" : "pre_checkin", isReSignature: wasReSignature, fnrhSha256Hash: fnrhDocument.sha256Hash }`.
3. **Carimbo Matinal**:
   - Se for para hoje (`isCheckinTodayOrPast`): define `r.morningEmailSentDate = brToday;` para evitar duplicidade na rotina matinal das 07:00.
   - Se for para data futura: **não** define `r.morningEmailSentDate`, permitindo que o envio de boas-vindas das 07:00 ocorra no dia exato da chegada.

### 3.3. Sincronização do Painel da Recepção (`/api/reception/today`)
1. **Isolamento de Estado**:
   Enquanto `r.needsReSignature === true`:
   - `allCheckinDone = false;`
   - `someCheckinDone = false;`
   - `hasPreCheckin = false;`
   - `canAuthorizeEntry = false;`
   - `entryBadgeType = "error";`
   - `entryMessage = "Check-in Pendente (Re-assinatura de Termo Obrigatória)";`
   - Cada hóspede no payload tem `needsReSignature: true` e `hasCompletedCheckin: false`.
2. **Barreira no Endpoint de Entrada Física**:
   Em `POST /api/reception/checkin/:reservationId`:
   ```javascript
   if (r.needsReSignature && !req.body.adminOverride) {
     return res.status(400).json({
       error: "Não é possível liberar a entrada: Re-assinatura de termo obrigatória devido a alterações na reserva (datas/acomodação). O hóspede precisa assinar o termo atualizado antes da liberação.",
       needsReSignature: true,
       reSignatureReason: r.reSignatureReason || "Alteração no período da estadia ou flat"
     });
   }
   ```
   Isso impede qualquer tentativa de liberação física indevida antes da formalização do documento assinado.

### 3.4. Sincronização dos Agendadores Operacionais
1. **Limpeza Incondicional do Carimbo Matinal**:
   Sempre que `oldCheckin !== newCheckinDate`:
   ```javascript
   delete r.morningEmailSentDate;
   delete r.morningEmailSentAt;
   delete r.receptionNotifiedAt;
   if (r.vehicle) {
     delete r.vehicle.garageNotifiedAt;
     delete r.vehicle.lastNotifiedPlate;
   }
   ```
   Isso assegura que, quando chegar a nova data de check-in, a rotina das 07:00 identificará `r.morningEmailSentDate !== todayStr` e disparará o e-mail de chegada para a portaria.
2. **Café da Manhã**:
   Pedidos com data `< newCheckinDate` ou `> newCheckoutDate` recebem `status: "cancelled"` com justificativa gerada por `computeBreakfastCancellationReason`. Pedidos que voltam ao intervalo válido retornam para `pending`. Se o flat mudou, `o.roomNumber` e `o.flatNumber` são atualizados.
3. **Governança / Limpeza de Turnover**:
   A solicitação de limpeza associada ao checkout da reserva (`c.requestDate === oldCheckout || c.requestDate === oldCheckin`) tem suas propriedades `requestDate` e `effectiveDate` atualizadas para `newCheckoutDate`, e o número do flat sincronizado se houve troca.

---

## 4. Blueprints de Código (Exatas Modificações Drop-in)

### Blueprint 1: `scripts/demo-server.mjs` & `artifacts/api-server/demo-server.mjs`
#### Localização: `POST /api/pms/pre-checkin` (Linhas ~21140 a 21312)

```javascript
// <<<< SUBST / INSERÇÃO EM POST /api/pms/pre-checkin >>>>

  // 0. Detecção se é processo de re-assinatura decorrente de alteração
  const wasReSignature = Boolean(
    r.needsReSignature ||
    targetGuest?.needsReSignature ||
    req.body.resign === "1" ||
    req.body.isReSignature === true ||
    req.query.resign === "1"
  );

  // ... [Geração do PDF via generateFnrhPdf mantém-se] ...
  if (fnrhDocument) {
    if (!db.fnrhAuditDocuments) db.fnrhAuditDocuments = [];
    db.fnrhAuditDocuments.unshift(fnrhDocument.auditTrail);

    targetGuest.whatsapp2faVerified = whatsapp2faVerified;
    targetGuest.whatsappPhone = verifiedOtpRecord ? verifiedOtpRecord.phone : null;
    r.whatsapp2faVerified = whatsapp2faVerified;
    r.whatsappPhone = verifiedOtpRecord ? verifiedOtpRecord.phone : null;
    targetGuest.fnrhDocumentUuid = fnrhDocument.documentUuid;
    targetGuest.fnrhPdfUrl = fnrhDocument.fileUrl;
    targetGuest.fnrhDownloadUrl = fnrhDocument.downloadUrl;
    targetGuest.r2Url = fnrhDocument.r2Url;
    targetGuest.fnrhSha256Hash = fnrhDocument.sha256Hash;
    targetGuest.fnrhCanonicalHash = fnrhDocument.canonicalHash;
    targetGuest.fnrhVerifyUrl = fnrhDocument.verifyUrl;
    targetGuest.fnrhSignedAt = fnrhDocument.signedAt;
    targetGuest.fnrhAuditTrail = fnrhDocument.auditTrail;
    targetGuest.fnrhFileName = fnrhDocument.fileName;
    targetGuest.fnrhFilePath = fnrhDocument.filePath;
    targetGuest.status = "CHECKED_IN";
    targetGuest.hasCompletedCheckin = true;
    targetGuest.needsReSignature = false;

    // Preserva status como "confirmada" caso não esteja in_house/checkin
    if (!r.status || r.status === "CHECKED_IN" || r.status === "pre_reserva") {
      r.status = "confirmada";
    }
    r.checkedInAt = fnrhDocument.signedAt;
    r.signatureUrl = effectiveSignature;
    if (Number(guestIndex) === 1) {
      r.fnrhPdfUrl = fnrhDocument.fileUrl;
      r.fnrhDownloadUrl = fnrhDocument.downloadUrl;
      r.r2Url = fnrhDocument.r2Url;
      r.fnrhDocumentUuid = fnrhDocument.documentUuid;
      r.fnrhSha256Hash = fnrhDocument.sha256Hash;
      r.fnrhCanonicalHash = fnrhDocument.canonicalHash;
      r.fnrhVerifyUrl = fnrhDocument.verifyUrl;
      r.fnrhSignedAt = fnrhDocument.signedAt;
      r.fnrhAuditTrail = fnrhDocument.auditTrail;
      r.fnrhFileName = fnrhDocument.fileName;
      r.fnrhFilePath = fnrhDocument.filePath;
    }

    // Se todos os hóspedes foram liberados da re-assinatura, desmarca na reserva
    const hasPendingGuestsReSign = Array.isArray(r.guests) && r.guests.some(g => g.needsReSignature);
    if (!hasPendingGuestsReSign) {
      r.needsReSignature = false;
      delete r.reSignatureReason;
      r.fnhrCompleted = true;
    }
  }

  // Gatilho A & D: Envio Automático de Notificação à Recepção/Portaria e Garagem com FNRH PDF Anexo
  // Despacha imediatamente se: (1) Check-in for hoje/passado OU (2) For uma Re-Assinatura de termo
  const brToday = getBrasiliaTodayStr();
  const isCheckinTodayOrPast = isReservationForTodayOrPast(r);
  const shouldNotifyReception = Boolean(wasReSignature || isCheckinTodayOrPast);

  if (shouldNotifyReception) {
    try {
      const flat = (db.flats || []).find(f => f.id === r.flatId || String(f.number) === String(r.flatNumber));
      const receptionEmail = flat?.receptionEmail || db.settings?.receptionEmail || db.settings?.buildingEmail || process.env.RECEPTION_EMAIL || "millerpessanha@gmail.com";
      const garageEmail = db.settings?.garageEmail || process.env.GARAGE_EMAIL || "millerpessanha@gmail.com";
      const { subject, bodyHtml } = renderCheckinConfirmedEmail({ reservation: r, flat, settings: db.settings });

      await ensureReservationAttachmentsReady({ reservation: r, guest, db, appOrigin: originHeader });
      const emailAttachments = resolveReservationAttachments({ reservation: r, guest, db });
      const safeValidName = validName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s-]/gi, "")
        .trim()
        .replace(/\s+/g, "_");
      const currentFnrhFilename = `FNRH_${r.code || r.id}_${safeValidName}.pdf`;
      if (fnrhDocument?.filePath && fs.existsSync(fnrhDocument.filePath) && !emailAttachments.some(a => a.path === fnrhDocument.filePath || a.filename === currentFnrhFilename)) {
        emailAttachments.unshift({
          filename: currentFnrhFilename,
          path: fnrhDocument.filePath
        });
      }

      const emailSubject = wasReSignature
        ? `[RE-ASSINATURA CHECK-IN] Termo Atualizado - Flat ${r.flatNumber} - ${validName}`
        : subject;

      sendEmailAsync({
        db,
        saveDatabase,
        reservationId: r.code || r.id,
        recipient: receptionEmail,
        cc: (r.vehicle?.plate && garageEmail !== receptionEmail) ? garageEmail : undefined,
        subject: emailSubject,
        bodyHtml,
        type: "email",
        direction: "outbound",
        attachments: emailAttachments,
        metadata: {
          trigger: wasReSignature ? "re_signature_checkin" : "pre_checkin",
          isReSignature: wasReSignature,
          flatNumber: r.flatNumber,
          guestName: validName,
          buildingName: flat?.buildingName || db.settings?.buildingName || "Edifício Soho Residence Service",
          hasPdfAttached: emailAttachments.some(a => a.filename?.includes("FNRH")),
          hasDocumentAttached: emailAttachments.some(a => a.filename?.includes("Documento")),
          attachmentsCount: emailAttachments.length,
          receptionEmail,
          garageEmail,
          fnrhSha256Hash: fnrhDocument?.sha256Hash
        }
      });
      r.receptionNotifiedAt = new Date().toISOString();
      if (isCheckinTodayOrPast) {
        r.morningEmailSentDate = brToday;
        r.morningEmailSentAt = new Date().toISOString();
      }
    } catch (mailErr) {
      console.warn("[MailService] Erro ao disparar aviso de check-in à portaria:", mailErr.message);
    }
  } else {
    console.log(`[MailService ℹ️] Pré-check-in concluído com antecedência para ${r.code}. FNRH gerada e salva. Notificação à recepção agendada para o dia do check-in (${r.checkinDate}) às 07:00.`);
  }
```

---

### Blueprint 2: `GET /api/reception/today` (Linhas ~18830 a 18995)
```javascript
// <<<< SUBST / INSERÇÃO EM GET /api/reception/today >>>>

        const isReSignatureNeeded = Boolean(r.needsReSignature);

        // Quantidade de hóspedes autorizados (1, 2 ou 3)
        const count = Math.min(Math.max(Number(r.guestCount) || Number(r.adults) || 1, 1), 3);
        let guestList = Array.isArray(r.guests) && r.guests.length > 0 ? [...r.guests] : [];

        if (guestList.length === 0) {
          guestList.push({
            index: 1,
            name: r.guestName || guest.name || "Hóspede 1",
            cpf: guest.document || "",
            phone: r.guestPhone || guest.phone || "",
            email: r.guestEmail || guest.email || "",
            hasCompletedCheckin: Boolean(!isReSignatureNeeded && r.fnhrCompleted),
            needsReSignature: isReSignatureNeeded,
            checkinCompletedAt: r.fnhrCompleted && !isReSignatureNeeded ? r.updatedAt : null
          });
          for (let i = 2; i <= count; i++) {
            guestList.push({
              index: i,
              name: `Hóspede ${i}`,
              cpf: "",
              phone: "",
              email: "",
              hasCompletedCheckin: false,
              needsReSignature: isReSignatureNeeded,
              checkinCompletedAt: null
            });
          }
        } else if (isReSignatureNeeded) {
          // Se a reserva requer re-assinatura, reflete o bloqueio em todos os hóspedes
          guestList = guestList.map(g => ({
            ...g,
            needsReSignature: true,
            hasCompletedCheckin: false
          }));
        }

        const allCheckinDone = !isReSignatureNeeded && guestList.every(g => g.hasCompletedCheckin && !g.needsReSignature);
        const someCheckinDone = !isReSignatureNeeded && guestList.some(g => g.hasCompletedCheckin && !g.needsReSignature);
        const completedCount = guestList.filter(g => g.hasCompletedCheckin && !g.needsReSignature).length;
        const totalCount = guestList.length;

        // ... [cálculo de cleaningStatus e isRoomReady] ...

        let canAuthorizeEntry = false;
        let entryMessage = "";
        let entryBadgeType = "neutral";

        if (isReSignatureNeeded) {
          canAuthorizeEntry = false;
          entryMessage = "Check-in Pendente (Re-assinatura de Termo Obrigatória)";
          entryBadgeType = "error";
        } else if (!allCheckinDone) {
          if (completedCount > 0) {
            canAuthorizeEntry = isRoomReady && (isPastOrExact14h || earlyCheckinStatus === "Liberado");
            entryMessage = `Entrada Parcial Liberada (${completedCount}/${totalCount} prontos)`;
            entryBadgeType = "warning";
          } else {
            canAuthorizeEntry = false;
            entryMessage = `Check-in Digital Pendente (0/${totalCount} concluído)`;
            entryBadgeType = "error";
          }
        } else if (!isRoomReady) {
          canAuthorizeEntry = false;
          entryMessage = `Quarto não está pronto (${cleaningLabel})`;
          entryBadgeType = "error";
        } else if (isPastOrExact14h) {
          canAuthorizeEntry = true;
          entryMessage = "Check-in Regular (14:00)";
          entryBadgeType = "success";
        } else if (earlyCheckinStatus === "Liberado") {
          canAuthorizeEntry = true;
          entryMessage = isFirstStayCourtesy ? "🎁 Cortesia 1ª Reserva" : "⚡ Check-in Antecipado";
          entryBadgeType = "success";
        } else {
          canAuthorizeEntry = false;
          entryMessage = "Horário regular às 14:00 (Check-in antecipado não liberado)";
          entryBadgeType = "warning";
        }

        return {
          ...r,
          fnrhPdfUrl: safePdfUrl,
          fnrhDownloadUrl: safeDownloadUrl,
          flatNumber: flat.number,
          cleaningStatus,
          cleaningLabel,
          cleaningMinutes,
          isRoomReady,
          priorStayCount,
          isFirstTimeGuest,
          earlyCheckinStatus,
          earlyCheckinReason,
          isFirstStayCourtesy,
          guestCount: count,
          guests: guestList,
          allCheckinDone,
          someCheckinDone,
          canAuthorizeEntry,
          entryMessage,
          entryBadgeType,
          earlyCheckinAuthorized: isEarlyAuthorizedManual,
          receptionNotes: r.receptionNotes || "",
          guestPhoto: r.selfieUrl || guest.photoUrl || null,
          docPhoto: r.docPhotoUrl || guest.docPhotoUrl || null,
          signatureUrl: r.signatureUrl || null,
          needsReSignature: isReSignatureNeeded,
          reSignatureReason: r.reSignatureReason || (isReSignatureNeeded ? "Alteração no período da estadia ou acomodação" : null),
          hasPreCheckin: Boolean(!isReSignatureNeeded && ((r.fnhrCompleted && !r.needsReSignature) || someCheckinDone))
        };
```

---

### Blueprint 3: `POST /api/reception/checkin/:reservationId` (Linhas ~19180)
```javascript
// <<<< GUARDA EM POST /api/reception/checkin/:reservationId >>>>

  // Bloqueio mandatório: se a reserva requer re-assinatura de termo (datas ou flat alterados)
  if (r.needsReSignature && !req.body.adminOverride) {
    return res.status(400).json({
      error: "Não é possível liberar a entrada: Re-assinatura de termo obrigatória devido a alterações na reserva (datas/acomodação). O hóspede precisa assinar o termo atualizado antes da liberação.",
      needsReSignature: true,
      reSignatureReason: r.reSignatureReason || "Alteração no período da estadia ou acomodação"
    });
  }
```

---

### Blueprint 4: Sincronização dos Agendadores em Modificações
#### A) Em `commitPendingModification`:
```javascript
  // Limpeza incondicional de carimbos da rotina matinal em mudança de check-in
  if (oldCheckin !== targetCheckin) {
    delete r.morningEmailSentDate;
    delete r.morningEmailSentAt;
    delete r.receptionNotifiedAt;
    if (r.vehicle) {
      delete r.vehicle.garageNotifiedAt;
      delete r.vehicle.lastNotifiedPlate;
    }
  }

  // Sincronização de pedidos de café se o flat mudar
  if (targetFlatNumber && targetFlatNumber !== String(oldFlatNumber)) {
    (db.breakfastOrders || []).forEach(o => {
      if ((o.reservationCode && (o.reservationCode === r.code || o.reservationCode === r.reservationCode)) || o.reservationId === r.id) {
        o.roomNumber = targetFlatNumber;
        o.flatNumber = targetFlatNumber;
        if (targetFlatId) o.flatId = Number(targetFlatId) || targetFlatId;
      }
    });
  }
```

#### B) Em `POST /api/pms/guest-portal/:code/modify`:
```javascript
  const oldCheckin = r.checkinDate;
  const oldCheckout = r.checkoutDate;
  const oldFlatNumber = r.flatNumber;

  // ... [Atualização de datas e histórico] ...

  // Limpeza incondicional de carimbos da rotina matinal
  if (oldCheckin !== newCheckinDate) {
    delete r.morningEmailSentDate;
    delete r.morningEmailSentAt;
    delete r.receptionNotifiedAt;
    if (r.vehicle) {
      delete r.vehicle.garageNotifiedAt;
      delete r.vehicle.lastNotifiedPlate;
    }
  }

  // Reconciliação de governança no checkout
  if (Array.isArray(db.cleaningRequests)) {
    const reqItem = db.cleaningRequests.find(c =>
      (c.flatId === r.flatId || String(c.flatNumber) === String(r.flatNumber) || String(c.flatNumber) === String(oldFlatNumber)) &&
      (c.requestDate === oldCheckout || c.requestDate === oldCheckin)
    );
    if (reqItem) {
      reqItem.requestDate = newCheckoutDate;
      reqItem.effectiveDate = newCheckoutDate;
      if (targetFlatNumber && targetFlatNumber !== String(oldFlatNumber)) {
        reqItem.flatNumber = targetFlatNumber;
        if (targetFlatId) reqItem.flatId = Number(targetFlatId) || targetFlatId;
      }
    }
  }
```

#### C) Em `PUT /api/pms/reservations/:id`:
```javascript
  // Limpeza incondicional dos carimbos matinais sempre que a data de checkin mudar
  if (oldCheckin !== r.checkinDate) {
    delete r.morningEmailSentDate;
    delete r.morningEmailSentAt;
    delete r.receptionNotifiedAt;
    if (r.vehicle) {
      delete r.vehicle.garageNotifiedAt;
      delete r.vehicle.lastNotifiedPlate;
    }
  }

  // Reconciliação de governança no checkout
  if (oldCheckout !== r.checkoutDate && Array.isArray(db.cleaningRequests)) {
    const reqItem = db.cleaningRequests.find(c =>
      (c.flatId === r.flatId || String(c.flatNumber) === String(r.flatNumber)) &&
      c.requestDate === oldCheckout
    );
    if (reqItem) {
      reqItem.requestDate = r.checkoutDate;
      reqItem.effectiveDate = r.checkoutDate;
    }
  }
```

---

## 5. Especificação Completa da Suíte de Testes `tests/m2-re-signature-operations-sync.test.mjs`

Abaixo está o arquivo completo e autônomo de testes para o Milestone 2, projetado segundo as regras estritas do projeto (porta isolada 3995, banco de dados temporário, destruição garantida de processos em `after()` e paridade byte-a-byte):

```javascript
/**
 * Test Suite: Milestone 2 - Re-Signature Lifecycle, Forensic Document Delivery & Ops Sync
 * File: tests/m2-re-signature-operations-sync.test.mjs
 * Execution: node --test tests/m2-re-signature-operations-sync.test.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const TEST_PORT = 3995;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-m2-ops-sync-db-${Date.now()}.json`);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

function getDb() {
  return JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
}

describe("Milestone 2: Re-Signature Lifecycle, Document Delivery & Ops Synchronization Suite", () => {
  before(async () => {
    // 0. Limpeza preventiva da porta de teste
    try {
      const netstatOutput = execSync(`netstat -ano | findstr :${TEST_PORT}`, { encoding: "utf8" });
      for (const line of netstatOutput.split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[1].endsWith(`:${TEST_PORT}`)) {
          const pid = parts[parts.length - 1];
          if (pid && pid !== "0") killProcessTree(pid);
        }
      }
      await new Promise(r => setTimeout(r, 400));
    } catch (_) {}

    // 1. Inicializa banco de dados isolado com dados controlados
    const initialDb = fs.existsSync(prodDbPath)
      ? JSON.parse(fs.readFileSync(prodDbPath, "utf-8"))
      : {};

    initialDb.flats = [
      { id: 1, number: "113", receptionEmail: "recepcao.113@corpflats.com.br" },
      { id: 2, number: "114", receptionEmail: "recepcao.114@corpflats.com.br" }
    ];

    initialDb.settings = {
      ...(initialDb.settings || {}),
      receptionEmail: "portaria.geral@corpflats.com.br",
      garageEmail: "garagem@corpflats.com.br",
      buildingName: "Edifício Soho Residence Service"
    };

    const todayStr = new Date().toISOString().substring(0, 10);

    // Res 1: Reserva confirmada com check-in hoje que sofrerá invalidação e re-assinatura
    const resToday = {
      id: 8001,
      code: "RES-M2-001",
      guestName: "Marcos Paulo",
      guestEmail: "marcospaulo@example.com",
      guestPhone: "5522998881111",
      guestDocument: "12345678901",
      flatId: 1,
      flatNumber: "113",
      checkinDate: todayStr,
      checkoutDate: "2026-10-18",
      guestCount: 1,
      dailyRate: 180,
      totalAmount: 360,
      paidAmount: 360,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "site_direto",
      fnhrCompleted: true,
      needsReSignature: false,
      signatureUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      morningEmailSentDate: todayStr,
      guests: [
        {
          index: 1,
          name: "Marcos Paulo",
          cpf: "12345678901",
          phone: "5522998881111",
          hasCompletedCheckin: true,
          needsReSignature: false,
          entryAuthorized: false
        }
      ]
    };

    // Res 2: Reserva futura (para teste de e-mail na re-assinatura e limpeza de morningEmailSentDate)
    const resFuture = {
      id: 8002,
      code: "RES-M2-002",
      guestName: "Juliana Mendes",
      guestEmail: "juliana@example.com",
      guestPhone: "5522998882222",
      guestDocument: "98765432100",
      flatId: 2,
      flatNumber: "114",
      checkinDate: "2026-11-01",
      checkoutDate: "2026-11-05",
      guestCount: 1,
      dailyRate: 200,
      totalAmount: 800,
      paidAmount: 800,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "whatsapp",
      fnhrCompleted: true,
      needsReSignature: false,
      morningEmailSentDate: "2026-10-10",
      guests: [
        {
          index: 1,
          name: "Juliana Mendes",
          cpf: "98765432100",
          phone: "5522998882222",
          hasCompletedCheckin: true,
          needsReSignature: false
        }
      ]
    };

    initialDb.reservations = [resToday, resFuture];

    // Pedidos de café da manhã vinculados à Reserva 8002
    initialDb.breakfastOrders = [
      { id: "bk-1", reservationCode: "RES-M2-002", date: "2026-11-02", status: "pending", roomNumber: "114" },
      { id: "bk-2", reservationCode: "RES-M2-002", date: "2026-11-04", status: "pending", roomNumber: "114" }
    ];

    // Limpeza de governança vinculada
    initialDb.cleaningRequests = [
      { id: 701, flatNumber: "114", flatId: 2, requestDate: "2026-11-05", status: "pending" }
    ];

    initialDb.reservationCommunications = [];
    initialDb.fnrhAuditDocuments = [];

    fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

    // 2. Inicia o servidor em modo de teste
    serverProcess = spawn("node", ["artifacts/api-server/demo-server.mjs"], {
      cwd: rootDir,
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        DATA_FILE: isolatedDbPath,
        DATABASE_FILE: isolatedDbPath,
        NODE_ENV: "test"
      },
      stdio: "pipe"
    });

    let isReady = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/system/version`);
        if (res.ok) { isReady = true; break; }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 250));
    }
    if (!isReady) throw new Error(`Falha ao iniciar servidor de teste na porta ${TEST_PORT}`);
  });

  after(() => {
    if (serverProcess && serverProcess.pid) killProcessTree(serverProcess.pid);
    try {
      if (fs.existsSync(isolatedDbPath)) fs.unlinkSync(isolatedDbPath);
    } catch (_) {}
  });

  // ── 1. Paridade de Arquivos ───────────────────────────────────────────────
  it("1. Paridade SHA-256 byte-a-byte entre scripts/ e artifacts/api-server/", () => {
    const pairs = [
      ["scripts/demo-server.mjs", "artifacts/api-server/demo-server.mjs"],
      ["scripts/fnrh-pdf-service.mjs", "artifacts/api-server/fnrh-pdf-service.mjs"]
    ];
    for (const [f1, f2] of pairs) {
      const b1 = fs.readFileSync(path.join(rootDir, f1));
      const b2 = fs.readFileSync(path.join(rootDir, f2));
      const h1 = crypto.createHash("sha256").update(b1).digest("hex");
      const h2 = crypto.createHash("sha256").update(b2).digest("hex");
      assert.strictEqual(h1, h2, `Hash SHA-256 divergente em ${f1} vs ${f2}`);
    }
  });

  // ── 2. Invalidação de Assinatura ao Modificar Reserva ───────────────────────
  it("2. Alteração de datas na Reserva 8001 invalida assinatura e exige re-assinatura", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/reservations/8001`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkoutDate: "2026-10-20",
        notes: "Extensão de período"
      })
    });
    assert.strictEqual(res.status, 200);

    const db = getDb();
    const r = db.reservations.find(x => x.id === 8001);
    assert.strictEqual(r.needsReSignature, true, "needsReSignature deve ser true após alterar datas");
    assert.strictEqual(r.fnhrCompleted, false, "fnhrCompleted deve ser false");
    assert.strictEqual(r.signatureUrl, null, "signatureUrl deve ter sido limpa");
    assert.ok(r.guests.every(g => g.needsReSignature === true), "Todos os hóspedes devem estar com needsReSignature: true");
    assert.ok(r.guests.every(g => g.hasCompletedCheckin === false), "hasCompletedCheckin deve ser false para todos os hóspedes");
  });

  // ── 3. Painel da Recepção Bloqueia Check-in enquanto needsReSignature === true ─
  it("3. GET /api/reception/today reflete pendência e bloqueia check-in enquanto needsReSignature === true", async () => {
    const res = await fetch(`${BASE_URL}/api/reception/today`);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    const arr = (json.arrivals || []).find(x => x.id === 8001);
    assert.ok(arr, "Reserva 8001 deve constar em chegadas de hoje");
    assert.strictEqual(arr.needsReSignature, true);
    assert.strictEqual(arr.allCheckinDone, false);
    assert.strictEqual(arr.canAuthorizeEntry, false);
    assert.strictEqual(arr.entryBadgeType, "error");
    assert.match(arr.entryMessage, /re-assinatura/i);

    // Tentativa de liberação física na portaria deve retornar 400
    const checkinRes = await fetch(`${BASE_URL}/api/reception/checkin/8001`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.strictEqual(checkinRes.status, 400);
    const errJson = await checkinRes.json();
    assert.strictEqual(errJson.needsReSignature, true);
    assert.match(errJson.error, /re-assinatura/i);
  });

  // ── 4. Re-assinatura, Geração Forense de PDF e Hash SHA-256 ─────────────────
  it("4. POST /api/pms/pre-checkin re-assina a reserva, gera PDF com SHA-256 e limpa invalidation", async () => {
    const sampleSignature = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const res = await fetch(`${BASE_URL}/api/pms/pre-checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId: 8001,
        guestIndex: 1,
        fullName: "Marcos Paulo Atualizado",
        document: "12345678901",
        phone: "5522998881111",
        email: "marcospaulo@example.com",
        signatureBase64: sampleSignature,
        resign: "1"
      })
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(json.fnrhDocument, "Deve retornar objeto fnrhDocument");
    assert.ok(json.fnrhDocument.sha256Hash, "Deve possuir hash SHA-256");
    assert.strictEqual(json.fnrhDocument.sha256Hash.length, 64, "Hash SHA-256 deve ter 64 caracteres hexadecimais");

    const db = getDb();
    const r = db.reservations.find(x => x.id === 8001);
    assert.strictEqual(r.needsReSignature, false, "needsReSignature deve ser false após re-assinar");
    assert.strictEqual(r.fnhrCompleted, true, "fnhrCompleted deve ser true");
    assert.strictEqual(r.fnrhSha256Hash, json.fnrhDocument.sha256Hash);
    assert.ok(db.fnrhAuditDocuments.some(d => d.documentUuid === json.fnrhDocument.documentUuid), "Trilha forense deve estar em db.fnrhAuditDocuments");
  });

  // ── 5. Entrega Automática à Recepção por E-mail ────────────────────────────
  it("5. Re-assinatura dispara e-mail com PDF anexado para a recepção (db.reservationCommunications)", () => {
    const db = getDb();
    const comms = db.reservationCommunications || [];
    const reSignEmail = comms.find(c =>
      c.reservation_id === "RES-M2-001" || c.reservation_id === "8001"
    );

    assert.ok(reSignEmail, "Deve existir registro de e-mail disparado para a reserva");
    assert.strictEqual(reSignEmail.type, "email");
    assert.strictEqual(reSignEmail.direction, "outbound");
    assert.ok(reSignEmail.metadata?.hasAttachments, "E-mail deve indicar anexos presentes");
    assert.strictEqual(reSignEmail.metadata?.trigger, "re_signature_checkin", "Gatilho deve ser re_signature_checkin");
    assert.ok(reSignEmail.metadata?.fnrhSha256Hash, "Metadados devem registrar o hash SHA-256 do documento");
  });

  // ── 6. Liberação no Painel da Recepção após Re-assinatura ───────────────────
  it("6. Painel da Recepção agora autoriza check-in após re-assinatura concluída", async () => {
    const res = await fetch(`${BASE_URL}/api/reception/today`);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    const arr = (json.arrivals || []).find(x => x.id === 8001);
    assert.strictEqual(arr.needsReSignature, false);
    assert.strictEqual(arr.allCheckinDone, true);
    assert.strictEqual(arr.canAuthorizeEntry, true);
    assert.strictEqual(arr.entryBadgeType, "success");

    // Check-in físico agora deve ser aceito
    const checkinRes = await fetch(`${BASE_URL}/api/reception/checkin/8001`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.strictEqual(checkinRes.status, 200);
  });

  // ── 7. Sincronização de Agendadores (Rotina 07:00, Café e Limpeza) ──────────
  it("7. Alteração de datas na Reserva 8002 limpa morningEmailSentDate, sincroniza café e governança", async () => {
    // Muda período da Reserva 8002 de 01/11-05/11 para 03/11-07/11 e troca para Flat 113
    const res = await fetch(`${BASE_URL}/api/pms/reservations/8002`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkinDate: "2026-11-03",
        checkoutDate: "2026-11-07",
        flatId: 1,
        flatNumber: "113"
      })
    });
    assert.strictEqual(res.status, 200);

    const db = getDb();
    const r = db.reservations.find(x => x.id === 8002);

    // Invariante A: morningEmailSentDate foi limpo para disparar na nova data
    assert.strictEqual(r.morningEmailSentDate, undefined, "morningEmailSentDate deve ter sido deletado");
    assert.strictEqual(r.receptionNotifiedAt, undefined, "receptionNotifiedAt deve ter sido deletado");

    // Invariante B: Pedido de café de 02/11 (fora do novo período) foi cancelado
    const bk1 = db.breakfastOrders.find(b => b.id === "bk-1");
    assert.strictEqual(bk1.status, "cancelled", "Café do dia 02/11 deve estar cancelado");
    assert.ok(bk1.cancelReason, "Deve possuir justificativa de cancelamento");

    // Invariante C: Pedido de café de 04/11 (dentro do novo período) foi transferido para o novo Flat 113
    const bk2 = db.breakfastOrders.find(b => b.id === "bk-2");
    assert.strictEqual(bk2.roomNumber, "113", "Pedido de café deve refletir o novo Flat 113");

    // Invariante D: Limpeza de checkout foi transferida para a nova data 07/11
    const clean = db.cleaningRequests.find(c => c.id === 701);
    assert.strictEqual(clean.requestDate, "2026-11-07", "Data de limpeza deve ser o novo checkout 07/11");
  });
});
```

---

## 6. Advertências e Ressalvas Técnicas

1. **Assinaturas Base64 vs URL**:
   O sistema suporta tanto imagens cruas (`data:image/png;base64,...`) quanto caminhos de arquivos em disco. O helper `generateFnrhPdf` decodifica de forma segura através do parser de buffer `Buffer.from(b64Data, "base64")` com fallback gracioso para marcador tipográfico caso o payload seja corrompido.
2. **Ambiente de Testes vs Envio Real de SMTP**:
   `sendEmailAsync` grava imediatamente a comunicação na coleção `db.reservationCommunications` com status `"pending"` e despacha via `setImmediate`. Em ambiente de teste sem credenciais SMTP reais, o `catch` assíncrono consome o erro silenciosamente, preservando a integridade dos testes e a auditoria em banco.
3. **Múltiplos Hóspedes em Reserva Compartilhada**:
   Se a reserva contiver múltiplos hóspedes e apenas o titular re-assinar, `targetGuest.needsReSignature` é liberado para o titular, mas `r.needsReSignature` mantém-se até que todos tenham assinado, com suporte a entrada parcial via portaria (`partial: true`).
4. **Regra de Não Silenciamento / Mascaramento**:
   Nenhum disparo de notificação foi suprimido ou mockado estaticamente no código de produção; o comportamento obedece estritamente às regras de negócio.

---

## 7. Conclusão da Investigação

A análise detalhada confirma que a infraestrutura existente de `fnrh-pdf-service.mjs`, `demo-server.mjs` e `mail-service.mjs` possui 100% dos pré-requisitos matemáticos e lógicos para o Milestone 2.
Com os blueprints fornecidos:
- A geração da FNRH PDF recalcula o hash SHA-256 e salva a trilha jurídica.
- A entrega por e-mail para a portaria passa a contemplar re-assinaturas imediatas.
- O painel da recepção sincroniza em tempo real a retenção do check-in.
- Os agendadores matinais e operacionais garantem que a nova data receba a notificação às 07:00 e mantenham café e limpeza perfeitamente ajustados.
- A suíte pontual `tests/m2-re-signature-operations-sync.test.mjs` cobre todos os invariantes com validação reproduzível.

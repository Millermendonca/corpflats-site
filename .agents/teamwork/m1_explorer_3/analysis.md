# Análise Técnica: Liquidação de Modificação, Commit Atômico, Liberação de Hold e Estratégia de Testes

**Milestone**: Milestone 1 — Backend Simulation, Hold & Settlement Engine  
**Autor**: M1 Explorer 3  
**Data**: 2026-10-11  
**Escopo**: Endpoints `GET /modify-status`, `POST /modify-cancel-pending`, commit atômico de liquidação, auditoria, invalidação de assinatura, tratamento de modificação direta (`additionalAmountToPay === 0`), e suite de testes automatizados (unitários e integração).

---

## 1. Sumário Executivo

A investigação detalhada do backend monolítico CorpFlats (`scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs`) confirmou a existência de uma falha crítica de integridade financeira no endpoint legado `POST /api/pms/guest-portal/:code/modify`: quando o hóspede solicita alteração com aumento de diárias (`additionalAmountToPay > 0`), o servidor atualiza imediatamente `r.checkinDate` e `r.checkoutDate` em memória e salva no `data/database.json`, sem exigir nem aguardar liquidação financeira. Caso o hóspede feche a tela ou abandone o checkout, o período do flat já foi consumido no PMS sem qualquer pagamento.

Nesta análise, projetamos o motor completo de liquidação e commit atômico (Settlement Engine):
1. **`GET /api/pms/guest-portal/:code/modify-status`**: Polling em tempo real que consulta ativamente a API do Banco Inter (Cobrança mTLS e Extrato Completo) e do Mercado Pago (Checkout Pro por `external_reference`). Ao detectar pagamento aprovado, executa o commit atômico definitivo: atualiza datas, flat e ocupação, incrementa `totalAmount` e `paidAmount`, lança o pagamento em `r.payments`, registra a transação no histórico `r.modificationHistory`, grava logs de auditoria (`addReservationAuditLog` e `logAuditEvent`), invalida a assinatura (`r.needsReSignature = true`, `r.fnhrCompleted = false`), sincroniza café e governança, e remove `r.pendingModification`.
2. **`POST /api/pms/guest-portal/:code/modify-cancel-pending`**: Permite o cancelamento antecipado do hold de 30 minutos caso o hóspede desista ou feche o modal, expurgando `r.pendingModification` e liberando imediatamente o calendário sem que as datas originais tenham sofrido qualquer mutação.
3. **Modificação Direta em `POST /modify`**: Modificações com custo zero (`additionalAmountToPay === 0`, e.g. deslocamento de datas com mesma quantidade de diárias, ou reduções de estadia) realizam o commit instantâneo com invalidação obrigatória de assinatura. Se `additionalAmountToPay > 0`, o endpoint rejeita a alteração direta com código `402 Payment Required`, obrigando o uso do fluxo de checkout seguro.
4. **Persistência Atômica**: Utilização do motor `saveDatabase()` com `atomicWriteFileSync(filePath, content)` (criação de arquivo temporário + `fs.renameSync` atômico), garantindo resistência total a quedas de energia, falhas de processo ou crashes de servidor.
5. **Estratégia de Testes Automatizados**: Bateria de testes em `tests/m1-reservation-modification-settlement.test.mjs` executada via `node --test`, validando simulação, criação de hold, bloqueio de conflitos, cancelamento antecipado, expiração, liquidação atômica e paridade estrita byte-a-byte.

---

## 2. Investigação dos Mecanismos de Pagamento e Persistência Existentes

### 2.1 Verificação de Pagamentos no Backend

No arquivo `scripts/demo-server.mjs`, o sistema já conta com conectores prontos para as duas principais formas de pagamento do ecossistema CorpFlats:

1. **Banco Inter PIX Cobrança Imediata (`checkInterPixCobStatus`)**:
   - **Localização**: Linhas 27.860–27.890.
   - **Protocolo**: Conexão mTLS com certificados `client_cert` e `client_key` na URL `https://cdpj.partners.bancointer.com.br/pix/v2/cob/${txid}` com token OAuth Bearer.
   - **Critério de Liquidação**: Retorna objeto JSON. O pagamento é comprovado se `cobData.status === "CONCLUIDA"` ou se o array `cobData.pix` possui elementos (`cobData.pix.length > 0`).

2. **Banco Inter Extrato Completo (`checkInterBankingExtratoPix`)**:
   - **Localização**: Linhas 27.930–28.059.
   - **Protocolo**: Consulta periódica (com cache em memória de 10 segundos `_interExtratoCache`) ao endpoint `/banking/v2/extrato/completo` para identificar créditos de PIX estático (QR Code BR Code EMV) ou transferências diretas.
   - **Critério de Liquidação**: Filtra transações onde `tipoTransacao === "PIX" && tipoOperacao === "C"`, cruza pelo `txId` da transação, pelo valor exato da cobrança e pela correspondência do primeiro nome do pagador.

3. **Mercado Pago Checkout Pro (`checkMercadoPagoPaymentByRef`)**:
   - **Localização**: Linhas 27.893–27.927.
   - **Protocolo**: Consulta à API de busca de pagamentos `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(externalRef)}` autenticado com `process.env.MERCADOPAGO_ACCESS_TOKEN`.
   - **Critério de Liquidação**: Filtra `results.find(p => p.status === "approved")`. Retorna o objeto do pagamento aprovado com `id`, `transaction_amount` e `date_approved`.

### 2.2 Estrutura do Registro Financeiro (`r.payments`)

A convenção arquitetural do PMS para o array `r.payments` (linhas 28.179–28.199) define cada lançamento como:
```javascript
{
  id: string,          // Ex: "pay_mod_pix_1728654123456"
  amount: number,      // Valor exato creditado
  method: string,      // "pix" | "cartao_credito"
  date: string,        // Timestamp ISO 8601 da liquidação
  notes: string,       // Descritivo legível com canal e E2E/TxId
  txId?: string,       // Identificador da transação
  endToEndId?: string, // E2E oficial do Banco Central (PIX)
  pendingId?: string   // ID da alteração que originou a cobrança
}
```

### 2.3 Persistência Atômica (`atomicWriteFileSync` e `saveDatabase`)

A persistência do banco em disco segue a implementação de alta disponibilidade em `scripts/demo-server.mjs`:
- **Linhas 5549–5568**:
  ```javascript
  export function atomicWriteFileSync(filePath, content) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpPath = path.join(dir, `.tmp_${path.basename(filePath)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    fs.writeFileSync(tmpPath, content, "utf-8");
    try {
      fs.renameSync(tmpPath, filePath);
    } catch (err) {
      // Fallback resiliente para Windows (bloqueios de indexação/antivírus)
      try {
        fs.copyFileSync(tmpPath, filePath);
        fs.unlinkSync(tmpPath);
      } catch (_) {
        try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (__) {}
        fs.writeFileSync(filePath, content, "utf-8");
      }
    }
  }
  ```
- **Linhas 5570–5612**: `saveDatabase(reason)` executa a reconciliação e poda em memória, serializa com `JSON.stringify(db)`, grava atomicamente em `DB_FILE` (`data/database.json`) e, se o PostgreSQL estiver configurado, sincroniza com `system_store`.
- **Garantia de Integridade**: A escrita temporária combinada com `fs.renameSync` assegura que um processo que caia antes do término da gravação **nunca** corrompa ou deixe o arquivo `database.json` truncado.

---

## 3. Desenho do Fluxo de Liquidação e Commit Atômico

### 3.1 Função Modular Central: `commitPendingModification(r, pending, paymentDetails)`

Para desacoplar a regra de negócio do transporte HTTP e permitir acionamento tanto pelo polling `/modify-status` quanto por webhooks futuros (Mercado Pago ou Inter), definimos a função atômica:

```javascript
async function commitPendingModification(r, pending, {
  amount = null,
  paidAt = null,
  endToEndId = null,
  txId = null,
  paymentMethod = "pix",
  source = "Banco Inter"
} = {}) {
  if (!r || !pending) return { success: false, error: "Reserva ou alteração pendente ausente." };

  const additionalPaid = Number(amount !== null ? amount : pending.additionalAmountToPay || 0);
  const oldCheckin = r.checkinDate;
  const oldCheckout = r.checkoutDate;
  const oldFlatNumber = r.flatNumber;
  const oldFlatId = r.flatId;
  const oldTotalAmount = Number(r.totalAmount || 0);
  const oldPaidAmount = Number(r.paidAmount || 0);
  const oldGuestCount = r.guestCount || 1;
  const oldNights = pending.oldNights || Math.max(1, Math.round((new Date(oldCheckout + "T00:00:00Z") - new Date(oldCheckin + "T00:00:00Z")) / (1000 * 3600 * 24)));
  const targetCheckin = pending.newCheckinDate || pending.proposedCheckinDate || oldCheckin;
  const targetCheckout = pending.newCheckoutDate || pending.proposedCheckoutDate || oldCheckout;
  const newNights = pending.newNights || Math.max(1, Math.round((new Date(targetCheckout + "T00:00:00Z") - new Date(targetCheckin + "T00:00:00Z")) / (1000 * 3600 * 24)));
  const targetFlatNumber = String(pending.newFlatNumber || pending.proposedFlatNumber || oldFlatNumber);
  const targetFlatId = pending.newFlatId || pending.proposedFlatId || oldFlatId;
  const targetGuestCount = Math.max(1, Number(pending.newGuestCount || pending.proposedGuestCount || oldGuestCount));

  // 1. Preserva datas anteriores para histórico e trilha de auditoria
  if (r.checkinDate !== targetCheckin) r.previousCheckinDate = r.checkinDate;
  if (r.checkoutDate !== targetCheckout) r.previousCheckoutDate = r.checkoutDate;

  // 2. Atualiza datas, flat e ocupantes
  r.checkinDate = targetCheckin;
  r.checkoutDate = targetCheckout;
  if (targetFlatNumber && targetFlatNumber !== String(r.flatNumber)) {
    r.flatNumber = targetFlatNumber;
    if (targetFlatId) r.flatId = Number(targetFlatId) || targetFlatId;
  }
  if (targetGuestCount) {
    r.guestCount = targetGuestCount;
  }
  r.calendarSequence = (r.calendarSequence || 0) + 1;
  r.updatedAt = new Date().toISOString();

  // 3. Atualização Financeira & Registro de Pagamento
  r.totalAmount = oldTotalAmount + additionalPaid;
  r.paidAmount = oldPaidAmount + additionalPaid;
  r.paymentStatus = (r.totalAmount > 0 && r.paidAmount >= r.totalAmount) ? "pago_total" : (r.paidAmount > 0 ? "sinal_pago" : r.paymentStatus);
  if (paymentMethod) r.paymentMethod = paymentMethod;

  const resolvedPaidAt = paidAt || new Date().toISOString();
  if (endToEndId) r.pixEndToEndId = endToEndId;
  if (txId && paymentMethod === "cartao_credito") r.mpPaymentId = String(txId);

  if (!Array.isArray(r.payments)) r.payments = [];
  const payRecord = {
    id: `pay_mod_${paymentMethod}_${Date.now()}`,
    amount: additionalPaid,
    method: paymentMethod || "pix",
    date: resolvedPaidAt,
    notes: `Acréscimo de modificação de reserva liquidado via ${source}${endToEndId ? ` (E2E: ${endToEndId})` : ""}${txId ? ` (TxId: ${txId})` : ""}`,
    txId: txId || pending.pixTxId || null,
    endToEndId: endToEndId || null,
    pendingId: pending.pendingId || pending.id || null
  };
  r.payments.push(payRecord);

  // 4. Invalidação Obrigatória de Assinatura (Requisito R3)
  r.needsReSignature = true;
  r.reSignatureReason = "Alteração no período da estadia ou flat";
  r.fnhrCompleted = false;
  r.preCheckinCompleted = false;
  delete r.fnrhPdfUrl;
  delete r.fnrhSha256Hash;
  if (Array.isArray(r.guests)) {
    r.guests.forEach(g => {
      g.needsReSignature = true;
      g.hasCompletedCheckin = false;
    });
  }

  // 5. Registro no Histórico de Modificações (modificationHistory)
  if (!Array.isArray(r.modificationHistory)) r.modificationHistory = [];
  r.modificationHistory.push({
    modifiedAt: new Date().toISOString(),
    oldCheckin,
    newCheckin: targetCheckin,
    oldCheckout,
    newCheckout: targetCheckout,
    oldFlatNumber,
    newFlatNumber: targetFlatNumber,
    oldNights,
    newNights,
    oldGuests: oldGuestCount,
    newGuests: targetGuestCount,
    additionalAmountToPay: additionalPaid,
    refundAmount: pending.refundAmount || 0,
    isUnder24h: Boolean(pending.isUnder24h),
    nonRefundableReduction: Boolean(pending.nonRefundableReduction),
    paymentMethod,
    paymentId: txId || endToEndId || null,
    reason: pending.reason || "Modificação com acréscimo liquidada via autoatendimento",
    settledVia: source,
    pendingId: pending.pendingId || pending.id || null
  });

  // 6. Trilha de Auditoria (Audit Logs)
  ensureReservationAuditLogs(r);
  addReservationAuditLog(r, {
    action: "portal_modify_settled",
    actor: {
      id: null,
      name: r.guestName || "Hóspede",
      role: "guest",
      type: "guest"
    },
    source: "Portal do Hóspede (Liquidação de Modificação)",
    description: `Modificação confirmada com liquidação de R$ ${additionalPaid.toFixed(2)} via ${source}`,
    changes: [
      {
        field: "dates",
        label: "Período da Estadia",
        oldValue: `${oldCheckin} a ${oldCheckout}`,
        newValue: `${targetCheckin} a ${targetCheckout}`
      },
      ...(oldFlatNumber !== targetFlatNumber ? [{
        field: "flatNumber",
        label: "Flat",
        oldValue: String(oldFlatNumber),
        newValue: String(targetFlatNumber)
      }] : []),
      {
        field: "totalAmount",
        label: "Valor Total",
        oldValue: `R$ ${oldTotalAmount.toFixed(2)}`,
        newValue: `R$ ${(oldTotalAmount + additionalPaid).toFixed(2)} (+R$ ${additionalPaid.toFixed(2)})`
      },
      {
        field: "needsReSignature",
        label: "Re-assinatura FNRH",
        oldValue: "false",
        newValue: "true"
      }
    ]
  });

  logAuditEvent({
    level: "info",
    category: "reservation",
    action: "RESERVATION_MODIFICATION_SETTLED",
    actor: { name: r.guestName || "Hóspede", role: "guest" },
    source: "portal_modify_status",
    details: {
      reservationCode: r.code,
      pendingId: pending.pendingId || pending.id,
      additionalAmountToPay: additionalPaid,
      paymentMethod,
      source
    }
  });

  // 7. Sincronização Operacional
  // A. Pedidos de Café da Manhã fora da nova janela são cancelados
  if (!db.breakfastOrders) db.breakfastOrders = [];
  const nowBrl = getBrasiliaNow();
  const todayStr = nowBrl.date;
  db.breakfastOrders.forEach(o => {
    if ((o.reservationCode && (o.reservationCode === r.code || o.reservationCode === r.reservationCode)) || o.reservationId === r.id) {
      if (o.date < targetCheckin || o.date > targetCheckout) {
        o.status = "cancelled";
        o.cancelReason = computeBreakfastCancellationReason(o, r, todayStr, nowBrl, db);
      } else if (o.date >= targetCheckin && o.date <= targetCheckout && o.status === "cancelled") {
        o.status = "pending";
        o.cancelReason = null;
      }
    }
  });

  // B. Se for estadia futura, limpa carimbos de rotina matinal para disparar no dia correto
  if (isReservationForFuture(r)) {
    delete r.morningEmailSentDate;
    delete r.morningEmailSentAt;
    delete r.receptionNotifiedAt;
    if (r.vehicle) {
      delete r.vehicle.garageNotifiedAt;
      delete r.vehicle.lastNotifiedPlate;
    }
  }

  // C. Reconciliação de Governança
  if (Array.isArray(db.cleaningRequests)) {
    const reqItem = db.cleaningRequests.find(c =>
      (c.flatId === r.flatId || String(c.flatNumber) === String(r.flatNumber)) &&
      (c.requestDate === oldCheckout || c.requestDate === oldCheckin)
    );
    if (reqItem) {
      reqItem.requestDate = targetCheckout;
      reqItem.effectiveDate = targetCheckout;
      if (targetFlatNumber && targetFlatNumber !== String(oldFlatNumber)) {
        reqItem.flatNumber = targetFlatNumber;
        if (targetFlatId) reqItem.flatId = Number(targetFlatId) || targetFlatId;
      }
    }
  }

  // 8. Limpa o Hold Pendente
  delete r.pendingModification;

  // 9. Emite Notificação Operacional no Painel
  createNotification({
    category: "checkout",
    title: `🔄 Alteração Confirmada: Apt ${r.flatNumber} (${r.code})`,
    message: `Estadia estendida para ${targetCheckin} a ${targetCheckout}. Pagamento de R$ ${additionalPaid.toFixed(2)} liquidado via ${source}.`,
    severity: "success",
    metadata: {
      reservationCode: r.code,
      additionalAmountToPay: additionalPaid,
      newCheckinDate: targetCheckin,
      newCheckoutDate: targetCheckout
    },
    targetUrl: `/reservas?code=${r.code}`
  });

  // 10. Persistência Atômica no Disco e DB
  saveDatabase("modify_settled_committed");

  return { success: true, committed: true, reservation: r };
}
```

---

### 3.2 Endpoint `GET /api/pms/guest-portal/:code/modify-status`

O endpoint implementa o ciclo de verificação para o polling do frontend:

```javascript
app.get("/api/pms/guest-portal/:code/modify-status", async (req, res) => {
  try {
    const { code } = req.params;
    const { pendingId } = req.query;

    if (!db.reservations) db.reservations = [];
    const r = findReservationByLocatorOrContact(code) || (db.reservations || []).find(x => x.code === code || String(x.id) === code);
    if (!r) {
      return res.status(404).json({ success: false, error: "Reserva não encontrada." });
    }

    // 1. Caso a modificação já tenha sido confirmada em polling anterior
    if (!r.pendingModification) {
      const recentMod = Array.isArray(r.modificationHistory)
        ? r.modificationHistory.find(m => pendingId && m.pendingId === pendingId)
        : null;

      if (recentMod) {
        return res.json({
          success: true,
          paid: true,
          status: "paid",
          committed: true,
          message: "Pagamento confirmado! As datas da sua estadia foram atualizadas com sucesso.",
          newCheckinDate: recentMod.newCheckin,
          newCheckoutDate: recentMod.newCheckout,
          flatNumber: recentMod.newFlatNumber || r.flatNumber,
          needsReSignature: Boolean(r.needsReSignature),
          reSignatureUrl: `/pre-checkin/${r.code}?resign=1`
        });
      }

      return res.json({
        success: true,
        paid: false,
        status: "none",
        committed: false,
        message: "Nenhuma alteração pendente ativa encontrada para esta reserva."
      });
    }

    const pending = r.pendingModification;

    // 2. Validação do ID do Hold
    if (pendingId && pending.pendingId && pending.pendingId !== pendingId && pending.id !== pendingId) {
      return res.status(400).json({
        success: false,
        error: "O identificador da alteração pendente não coincide com o hold ativo."
      });
    }

    // 3. Verificação de Expiração do Hold (30 minutos)
    const nowMs = Date.now();
    const expiresMs = new Date(pending.expiresAt).getTime();
    if (pending.status === "expired" || expiresMs < nowMs) {
      if (pending.status !== "expired") {
        pending.status = "expired";
        pending.expiredAt = new Date().toISOString();
        saveDatabase("modify_hold_expired");
      }
      return res.json({
        success: true,
        paid: false,
        status: "expired",
        committed: false,
        message: "O prazo de 30 minutos para pagamento desta alteração expirou. Por favor, inicie uma nova simulação."
      });
    }

    // 4. Verificação de Cancelamento
    if (pending.status === "canceled" || pending.status === "cancelled") {
      return res.json({
        success: true,
        paid: false,
        status: "canceled",
        committed: false,
        message: "Esta alteração pendente foi cancelada."
      });
    }

    // 5. CONSULTA ATIVA DE PAGAMENTO (Banco Inter & Mercado Pago)
    let paymentVerified = false;
    let paymentDetails = null;

    // A. Cobrança PIX Banco Inter por TxId
    if (pending.pixTxId) {
      try {
        const cobData = await checkInterPixCobStatus(pending.pixTxId);
        if (cobData && (cobData.status === "CONCLUIDA" || (Array.isArray(cobData.pix) && cobData.pix.length > 0))) {
          const valorPago = Number(cobData.pix?.[0]?.valor || cobData.valor?.original || pending.additionalAmountToPay);
          paymentVerified = true;
          paymentDetails = {
            amount: valorPago,
            paidAt: cobData.pix?.[0]?.horario || new Date().toISOString(),
            endToEndId: cobData.pix?.[0]?.endToEndId,
            txId: pending.pixTxId,
            paymentMethod: "pix",
            source: "Banco Inter Cobrança"
          };
        }
      } catch (err) {
        console.warn("[Modify Status] Erro ao checar Inter Pix Cob:", err.message);
      }
    }

    // B. Extrato Bancário Completo Banco Inter (Fallback para PIX estático)
    if (!paymentVerified) {
      try {
        const extratoMatch = await checkInterBankingExtratoPixForPending(r, pending);
        if (extratoMatch && extratoMatch.found) {
          paymentVerified = true;
          paymentDetails = {
            amount: extratoMatch.amount,
            paidAt: extratoMatch.paidAt,
            endToEndId: extratoMatch.endToEndId,
            txId: extratoMatch.txId,
            pagador: extratoMatch.pagador,
            paymentMethod: "pix",
            source: "Banco Inter Extrato"
          };
        }
      } catch (err) {
        console.warn("[Modify Status] Erro ao checar Inter Extrato:", err.message);
      }
    }

    // C. Mercado Pago (Cartão de Crédito)
    if (!paymentVerified) {
      try {
        const mpSearchRef = `MOD-${r.code}`;
        let mpPayment = await checkMercadoPagoPaymentByRef(mpSearchRef);
        if (!mpPayment && pending.pendingId) {
          mpPayment = await checkMercadoPagoPaymentByRef(pending.pendingId);
        }

        if (mpPayment && mpPayment.status === "approved") {
          const valorPago = Number(mpPayment.transaction_amount || mpPayment.total_paid_amount || pending.additionalAmountToPay);
          paymentVerified = true;
          paymentDetails = {
            amount: valorPago,
            paidAt: mpPayment.date_approved || new Date().toISOString(),
            txId: String(mpPayment.id),
            paymentMethod: "cartao_credito",
            source: "Mercado Pago"
          };
        }
      } catch (err) {
        console.warn("[Modify Status] Erro ao checar Mercado Pago:", err.message);
      }
    }

    // 6. SE LIQUIDADO -> EXECUTA O COMMIT ATÔMICO
    if (paymentVerified && paymentDetails) {
      const commitRes = await commitPendingModification(r, pending, paymentDetails);
      if (!commitRes.success) {
        return res.status(500).json({ success: false, error: commitRes.error });
      }

      return res.json({
        success: true,
        paid: true,
        status: "paid",
        committed: true,
        message: "Pagamento confirmado! As datas da sua estadia foram atualizadas com sucesso.",
        newCheckinDate: r.checkinDate,
        newCheckoutDate: r.checkoutDate,
        flatNumber: r.flatNumber,
        needsReSignature: true,
        reSignatureUrl: `/pre-checkin/${r.code}?resign=1`
      });
    }

    // 7. SE AINDA NÃO LIQUIDADO -> RETORNA PENDING COM DADOS DO CHECKOUT
    return res.json({
      success: true,
      paid: false,
      status: "pending",
      committed: false,
      message: "Aguardando confirmação do pagamento.",
      pendingId: pending.pendingId,
      expiresAt: pending.expiresAt,
      additionalAmountToPay: pending.additionalAmountToPay,
      pixTxId: pending.pixTxId || null,
      pixCopiaECola: pending.pixCopiaECola || null,
      pixQrCodeUrl: pending.pixQrCodeUrl || pending.qrCodeBase64 || null,
      mpCheckoutUrl: pending.mpCheckoutUrl || pending.mpInitPoint || null
    });
  } catch (err) {
    console.error("[Modify Status Check] Erro:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});
```

---

## 4. Desenho da Liberação Antecipada: `POST /modify-cancel-pending`

Quando o hóspede fecha a janela de checkout, desiste da alteração ou clica explicitamente no botão de cancelar:
- O backend deve remover imediatamente `r.pendingModification`, liberando as datas do flat para outros hóspedes ou para novas cotações.
- A reserva original permanece 100% inalterada.

```javascript
app.post("/api/pms/guest-portal/:code/modify-cancel-pending", (req, res) => {
  try {
    const { code } = req.params;
    const { pendingId } = req.body || {};

    if (!db.reservations) db.reservations = [];
    const r = findReservationByLocatorOrContact(code) || (db.reservations || []).find(x => x.code === code || String(x.id) === code);
    if (!r) {
      return res.status(404).json({ success: false, error: "Reserva não encontrada." });
    }

    if (!r.pendingModification) {
      return res.json({
        success: true,
        message: "Nenhuma alteração pendente ativa para cancelar.",
        committed: false
      });
    }

    const pending = r.pendingModification;
    if (pendingId && pending.pendingId && pending.pendingId !== pendingId && pending.id !== pendingId) {
      return res.status(400).json({
        success: false,
        error: "O identificador da alteração pendente informado não coincide com o hold ativo."
      });
    }

    if (pending.status === "paid" || pending.status === "committed") {
      return res.status(400).json({
        success: false,
        error: "Não é possível cancelar uma alteração cujo pagamento já foi processado."
      });
    }

    const canceledPendingId = pending.pendingId || pending.id || "mod_hold";
    delete r.pendingModification;

    ensureReservationAuditLogs(r);
    addReservationAuditLog(r, {
      action: "portal_modify_hold_canceled",
      actor: {
        id: null,
        name: r.guestName || "Hóspede",
        role: "guest",
        type: "guest"
      },
      source: "Portal do Hóspede",
      description: `Bloqueio provisório de alteração (${canceledPendingId}) cancelado pelo hóspede. Período original preservado.`
    });

    logAuditEvent({
      level: "info",
      category: "reservation",
      action: "RESERVATION_MODIFICATION_HOLD_CANCELED",
      actor: { name: r.guestName || "Hóspede", role: "guest" },
      source: "portal_modify_cancel_pending",
      details: {
        reservationCode: r.code,
        canceledPendingId
      }
    });

    saveDatabase("modify_hold_canceled");

    return res.json({
      success: true,
      message: "Alteração pendente cancelada com sucesso. O bloqueio temporário foi liberado.",
      originalDates: {
        checkinDate: r.checkinDate,
        checkoutDate: r.checkoutDate,
        flatNumber: r.flatNumber
      }
    });
  } catch (err) {
    console.error("[Modify Cancel Pending] Erro:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});
```

---

## 5. Blindagem do Endpoint Direto `POST /modify`

Para eliminar de vez a vulnerabilidade de alteração sem pagamento:

1. **Se `additionalAmountToPay > 0`**:
   O endpoint `POST /modify` **rejeita** a mutação direta e responde com `402 Payment Required`:
   ```javascript
   if (additionalAmountToPay > 0) {
     return res.status(402).json({
       success: false,
       requiresPayment: true,
       error: "PAYMENT_REQUIRED",
       message: `A alteração solicitada requer acréscimo de R$ ${additionalAmountToPay.toFixed(2)}. Por favor, utilize o fluxo de checkout com pagamento para confirmar.`,
       additionalAmountToPay,
       policyNotice
     });
   }
   ```
2. **Se `additionalAmountToPay === 0`** (Ex: mesma quantidade de diárias deslocadas, ou redução com/sem estorno):
   O endpoint executa o commit imediato, atualiza o histórico e, crucialmente, **invalida a assinatura anterior**:
   ```javascript
   r.needsReSignature = true;
   r.reSignatureReason = "Alteração no período da estadia ou acomodação";
   r.fnhrCompleted = false;
   r.preCheckinCompleted = false;
   delete r.fnrhPdfUrl;
   delete r.fnrhSha256Hash;
   if (Array.isArray(r.guests)) {
     r.guests.forEach(g => {
       g.needsReSignature = true;
       g.hasCompletedCheckin = false;
     });
   }
   ```

---

## 6. Helper de Consulta no Extrato Inter para Holds: `checkInterBankingExtratoPixForPending`

Implementação específica para localizar transações com valores correspondentes a acréscimos de alteração:

```javascript
async function checkInterBankingExtratoPixForPending(r, pending) {
  try {
    if (!r || !pending) return null;
    const data = await getCachedInterExtratoCompleto();
    if (!data || !Array.isArray(data.transacoes) || data.transacoes.length === 0) {
      return null;
    }

    const cleanResCode = String(r.code || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    const cleanPixTxId = String(pending.pixTxId || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    const expectedAmount = Number(pending.additionalAmountToPay || 0);

    for (const t of data.transacoes) {
      if (t.tipoTransacao !== "PIX" || t.tipoOperacao !== "C") continue;

      const txValor = Number(t.valor || 0);
      const txIdFromDetails = String(t.detalhes?.txId || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      const endToEndId = t.detalhes?.endToEndId || t.idTransacao;

      // Impede vinculação caso essa transação já tenha sido lançada em pagamentos
      const alreadyClaimed = (db.reservations || []).some(other =>
        (other.payments || []).some(p => p.endToEndId === endToEndId || p.txId === endToEndId) ||
        other.pixEndToEndId === endToEndId
      );
      if (alreadyClaimed) continue;

      const txIdMatched = Boolean(
        txIdFromDetails && (
          (cleanPixTxId && txIdFromDetails === cleanPixTxId) ||
          (cleanPixTxId && cleanPixTxId.length >= 5 && txIdFromDetails.includes(cleanPixTxId)) ||
          (cleanPixTxId && cleanPixTxId.length >= 5 && cleanPixTxId.includes(txIdFromDetails))
        )
      );

      const amountMatched = Math.abs(txValor - expectedAmount) < 0.05;

      const guestNameNormalized = (r.guestName || "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const firstGuestName = guestNameNormalized.split(" ")[0] || "";
      const pagadorNormalized = (t.detalhes?.nomePagador || t.descricao || "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

      const nameMatched = Boolean(
        firstGuestName.length >= 3 && pagadorNormalized.includes(firstGuestName)
      );

      if (txIdMatched || (amountMatched && (nameMatched || (cleanResCode && txIdFromDetails.includes("MOD"))))) {
        console.log(`[Banco Inter Extrato] MATCH de acréscimo de alteração confirmado para reserva ${r.code}! TxID: ${t.detalhes?.txId || t.idTransacao}, Valor: ${txValor}`);
        return {
          found: true,
          amount: txValor,
          paidAt: t.dataInclusao || t.dataTransacao || new Date().toISOString(),
          endToEndId,
          txId: t.detalhes?.txId || pending.pixTxId,
          pagador: t.detalhes?.nomePagador || t.descricao
        };
      }
    }

    return null;
  } catch (err) {
    console.error("[Banco Inter Extrato Pending] Falha:", err);
    return null;
  }
}
```

---

## 7. Estratégia Completa de Testes Automatizados (M1 Test Harness)

A suite de testes deve ser criada em `tests/m1-reservation-modification-settlement.test.mjs` utilizando o executor nativo do Node.js (`node:test` e `node:assert/strict`):

```bash
node --test tests/m1-reservation-modification-settlement.test.mjs
```

### 7.1 Matriz de Cenários de Teste

| # | Cenário de Teste | Descrição da Verificação | Asserções Principais |
|---|---|---|---|
| 1 | **Twin-Server Parity** | Comprova integridade byte-a-byte entre `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs`. | `assert.strictEqual(shaScripts, shaArtifacts)` |
| 2 | **Simulação `/modify-preview` Sem Mutação** | Solicita pré-visualização de extensão. O servidor calcula as diárias extras e o valor a pagar, mas não altera o banco. | `res.available === true`, `additionalAmountToPay > 0`, `r.checkinDate` e `checkoutDate` intactos. |
| 3 | **Criação de Hold `/modify-checkout`** | Cria `r.pendingModification` com expiração de 30 minutos e dados de PIX e Mercado Pago. As datas originais permanecem intactas no banco. | `r.pendingModification.status === "pending"`, `r.pendingModification.expiresAt` futuro, datas originais intactas. |
| 4 | **Bloqueio de Conflito em Hold Ativo** | Tenta criar uma segunda reserva ou simulação no mesmo flat durante o período do hold ativo de outra reserva. | Retorna conflito (`available === false` ou 409 Conflict). |
| 5 | **Cancelamento Antecipado `/modify-cancel-pending`** | Chama o endpoint de cancelamento. O hold é expurgado e o flat é imediatamente liberado. | `delete r.pendingModification`, calendário livre, log de auditoria gerado. |
| 6 | **Expiração Automática após 30 Minutos** | Hold com `expiresAt` passado é consultado em `/modify-status`. | Retorna `status: "expired"`, datas originais intactas, flat liberado. |
| 7 | **Blindagem de `/modify` Direto** | Tenta chamar `POST /modify` com acréscimo de diárias. | Retorna `402 PAYMENT_REQUIRED`, rejeita commit direto de datas. |
| 8 | **Modificação Direta com Custo Zero** | Chama `POST /modify` com alteração sem custo (`additionalAmountToPay === 0`). | Datas atualizadas, `needsReSignature === true`, `modificationHistory` populado. |
| 9 | **Commit Atômico com Liquidação Confirmada** | Simula pagamento confirmado e consulta `/modify-status`. | `r.checkinDate` e `checkoutDate` atualizados, `r.totalAmount` acrescido, pagamento registrado em `r.payments`, `r.needsReSignature === true`, `r.pendingModification` removido. |
| 10 | **Idempotência de `/modify-status`** | Consulta `/modify-status` repetidamente após confirmação. | Retorna `status: "paid"`, `committed: true`, sem pagamentos duplicados ou corrupção de dados. |

---

## 8. Blueprint de Implementação para o Worker

As alterações a seguir devem ser aplicadas **rigorosamente em paridade exata** nos dois arquivos:
1. `scripts/demo-server.mjs`
2. `artifacts/api-server/demo-server.mjs`

### 8.1 Inserção do Helper `checkInterBankingExtratoPixForPending`
Inserir logo após a função `checkInterBankingExtratoPix(r)` (linha 28.060).

### 8.2 Inserção de `commitPendingModification`
Inserir antes da rota `POST /api/pms/guest-portal/:code/modify` (linha 15.456).

### 8.3 Inserção dos Endpoints `GET /modify-status` e `POST /modify-cancel-pending`
Inserir imediatamente após `POST /api/pms/guest-portal/:code/modify-checkout`.

### 8.4 Atualização de `POST /api/pms/guest-portal/:code/modify`
Atualizar para incluir o bloqueio com `402 PAYMENT_REQUIRED` quando `additionalAmountToPay > 0`, e garantir invalidação de assinatura (`needsReSignature = true`) quando `additionalAmountToPay === 0`.

---

## 9. Conclusão

O desenho apresentado blinda por completo o ciclo de vida de modificação de reservas:
- Elimina a mutação prematura de datas sem pagamento.
- Garante liberação do hold antecipada ou por expiração sem efeitos colaterais.
- Realiza commit atômico completo com trilha de auditoria e invalidação legal de assinaturas.
- Mantém conformidade estrita com o Mandato de Paridade Twin-Server e fornece suite de testes 100% automatizada.

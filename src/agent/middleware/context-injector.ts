// src/agent/middleware/context-injector.ts

import {
  ContextoSessaoInjetado,
  EstadoSessao,
  PerfilRemetente,
  ReservaAtivaSessao,
} from '../types/tool-contract';

function normalizePhoneDigits(phone?: string | null): string {
  return String(phone || '').replace(/\D+/g, '');
}

function phonesMatch(phoneA?: string | null, phoneB?: string | null): boolean {
  const a = normalizePhoneDigits(phoneA);
  const b = normalizePhoneDigits(phoneB);
  if (!a || !b || a.length < 8 || b.length < 8) return false;
  return a.endsWith(b.slice(-8)) || b.endsWith(a.slice(-8));
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function computeCardAmountLocal(pixAmount: number, cardMarkupPercent = 5): number {
  const fn = (globalThis as any).computeCardAmountFromPix;
  if (typeof fn === 'function') {
    return Number(fn(pixAmount, cardMarkupPercent));
  }
  const base = Number(pixAmount) || 0;
  if (base <= 0) return 0;
  const pct = Number.isFinite(Number(cardMarkupPercent)) && Number(cardMarkupPercent) >= 0
    ? Number(cardMarkupPercent)
    : 5;
  return Math.round(base * (1 + pct / 100) * 100) / 100;
}

function addDaysIso(baseDateStr: string, days = 1): string {
  const clean = String(baseDateStr || '').slice(0, 10);
  const [y, m, d] = clean.split('-').map(Number);
  if (!y || !m || !d) {
    const dt = new Date(Date.now() + days * 86400000);
    return dt.toISOString().slice(0, 10);
  }
  const utc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0) + days * 86400000);
  return utc.toISOString().slice(0, 10);
}

function getBrasiliaIsoAndDate(now: Date = new Date()): {
  isoNow: string;
  todayStr: string;
  timeStr: string;
} {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(now);

    const map: Record<string, string> = {};
    for (const p of parts) {
      map[p.type] = p.value;
    }
    const todayStr = `${map.year}-${map.month}-${map.day}`;
    const timeStr = `${map.hour}:${map.minute}:${map.second}`;
    return {
      isoNow: `${todayStr}T${timeStr}-03:00`,
      todayStr,
      timeStr: `${map.hour}:${map.minute}`,
    };
  } catch {
    const iso = now.toISOString();
    return {
      isoNow: iso,
      todayStr: iso.slice(0, 10),
      timeStr: iso.slice(11, 16),
    };
  }
}

function isPlaceholderGuestName(nm?: string | null): boolean {
  const s = String(nm || '').trim();
  return !s || /a definir|informar depois|pendente|^h[oó]spede\s*\d*$/i.test(s);
}

function buildPackageSummaryForSession(db: any, sourceRes: any, baseUrl: string) {
  const pkgCode = String(sourceRes?.packageCode || sourceRes?.packageId || '').trim().toUpperCase();
  if (!pkgCode || !Array.isArray(db?.reservations)) return null;

  const cleanBase = String(baseUrl || 'https://corpflats.com.br').replace(/\/+$/, '');
  const all = db.reservations
    .filter((r: any) => String(r?.packageCode || r?.packageId || '').trim().toUpperCase() === pkgCode)
    .sort((a: any, b: any) => {
      const idxA = Number(a?.packageIndex) || 999;
      const idxB = Number(b?.packageIndex) || 999;
      if (idxA !== idxB) return idxA - idxB;
      return (Number(a?.id) || 0) - (Number(b?.id) || 0);
    });
  if (all.length === 0) return null;

  const isCancelled = (r: any) => ['cancelada', 'cancelado', 'cancelled'].includes(String(r?.status || '').toLowerCase().trim());
  const isExpired = (r: any) => ['expirada', 'expired'].includes(String(r?.status || '').toLowerCase().trim());
  const activeItems = all.filter((r: any) => r && !isCancelled(r) && !isExpired(r));

  let totalAmount = 0;
  let paidAmount = 0;
  let pendingAmount = 0;

  for (const r of activeItems) {
    const rTot = round2(Number(r.totalAmount) || 0);
    const paySt = String(r.paymentStatus || '').toLowerCase().trim();
    const st = String(r.status || '').toLowerCase().trim();
    const isUnpaidPre = st === 'pre_reserva' && paySt !== 'pago_total' && paySt !== 'pago';
    const settled = paySt === 'pago_total' || paySt === 'pago' || (!isUnpaidPre && rTot > 0 && (Number(r.paidAmount) || 0) >= rTot - 0.01);
    const rPaid = settled ? rTot : round2(Math.min(rTot, Number(r.paidAmount) || 0));
    totalAmount = round2(totalAmount + rTot);
    paidAmount = round2(paidAmount + rPaid);
    pendingAmount = round2(pendingAmount + Math.max(0, round2(rTot - rPaid)));
  }

  const cardMarkupPct = Number(db?.siteConfig?.pricing?.cardMarkupPercent ?? db?.tariffSettings?.cardMarkupPercent ?? 5.0);
  const cardPendingAmount = computeCardAmountLocal(pendingAmount, cardMarkupPct);
  const isAllPaid = activeItems.length > 0 && pendingAmount <= 0.01;
  const primary = activeItems.find((r: any) => r.isPackagePrimary) || activeItems[0] || all[0];

  const missingCredentialItems = activeItems.filter((r: any) => {
    const guestCount = Math.max(1, Number(r.guestCount || r.adults) || 1);
    const gArr = Array.isArray(r.guests) ? r.guests : [];
    const g1Name = String(r.guestName || gArr[0]?.name || '').trim();
    const g1Phone = normalizePhoneDigits(r.guestPhone || gArr[0]?.phone || '');
    if (r.guestPending || r.informGuestsLater || isPlaceholderGuestName(g1Name) || g1Phone.length < 10) return true;
    if (guestCount >= 2) {
      const g2 = gArr[1] || null;
      if (r.guest2InformLater || g2?.informLater || isPlaceholderGuestName(g2?.name)) return true;
    }
    return false;
  });

  const activeCodes = activeItems.map((r: any) => r.code).filter(Boolean);
  const batchCredentialPath =
    activeCodes.length > 0
      ? `/credenciamento/${encodeURIComponent(pkgCode)}?codes=${encodeURIComponent(activeCodes.join(','))}`
      : `/credenciamento/${encodeURIComponent(pkgCode)}`;
  const packagePortalUrl = `${cleanBase}/minha-reserva/${encodeURIComponent(pkgCode)}?requester=1`;
  const batchCredentialUrl = `${cleanBase}${batchCredentialPath}`;

  const sharedPix = !isAllPaid && activeItems.length > 0
    ? (primary?.packagePixCopiaECola || primary?.pixCopiaECola || activeItems.find((x: any) => x.pixCopiaECola)?.pixCopiaECola || null)
    : null;

  return {
    packageCode: pkgCode,
    package_code: pkgCode,
    codigo_pacote: pkgCode,
    quantidade_flats_ativos: activeItems.length,
    activeFlatsCount: activeItems.length,
    totalAmount,
    paidAmount,
    pendingAmount,
    valor_total_pacote: totalAmount,
    valor_pago_pacote: paidAmount,
    valor_pendente_pacote: pendingAmount,
    valor_cartao_pendente: cardPendingAmount,
    status_pagamento_pacote: isAllPaid ? 'PAGO_INTEGRALMENTE' : 'PENDENTE',
    precisa_cadastrar_hospedes: missingCredentialItems.length > 0,
    chave_pix_unica: sharedPix,
    packagePortalUrl,
    batchCredentialUrl,
    link_pacote: packagePortalUrl,
    link_credenciamento: batchCredentialUrl,
    flats: activeItems.map((it: any) => {
      const gArr = Array.isArray(it.guests) ? it.guests : [];
      const g1Label = it.informGuestsLater || it.guestPending
        ? 'A informar após pagamento'
        : (it.guestName || gArr[0]?.name || 'A Definir');
      const g2Name = String(gArr[1]?.name || '').trim();
      return {
        codigo_reserva: it.code,
        code: it.code,
        flat: String(it.flatNumber || ''),
        flatNumber: String(it.flatNumber || ''),
        data_checkin: String(it.checkinDate || '').slice(0, 10),
        data_checkout: String(it.checkoutDate || '').slice(0, 10),
        checkinDate: String(it.checkinDate || '').slice(0, 10),
        checkoutDate: String(it.checkoutDate || '').slice(0, 10),
        quantidade_hospedes: Math.max(1, Number(it.guestCount || it.adults) || 1),
        guestCount: Math.max(1, Number(it.guestCount || it.adults) || 1),
        incluir_cafe: Boolean(it.includeBreakfast),
        hospede_titular: g1Label,
        hospede_2: g2Name || (Number(it.guestCount || 1) >= 2 && (it.guest2InformLater || gArr[1]?.informLater) ? 'A informar' : null),
        valor_flat: round2(Number(it.totalAmount) || 0),
      };
    }),
  };
}

export interface InjectSessionContextParams {
  db?: any;
  phone: string;
  now?: Date;
  guestContext?: any;
  runtime?: ContextoSessaoInjetado['runtime'];
}

export function injectSessionContext(
  params: InjectSessionContextParams
): ContextoSessaoInjetado {
  const simOffset = Number((globalThis as any).__simulatedTimeOffsetMs || 0);
  const { db, phone, now = new Date(Date.now() + simOffset), guestContext, runtime } = params;
  const cleanPhone = normalizePhoneDigits(phone);
  const { isoNow, todayStr } = getBrasiliaIsoAndDate(now);
  const nowMs = now instanceof Date ? now.getTime() : Date.now() + simOffset;

  const reservations: any[] = Array.isArray(db?.reservations) ? db.reservations : [];
  const guests: any[] = Array.isArray(db?.guests) ? db.guests : [];

  const matchingReservations = reservations
    .filter((r) => {
      if (!r) return false;
      const st = String(r.status || '').toLowerCase().trim();
      if (['cancelada', 'cancelado', 'cancelled', 'expirada', 'expired', 'no_show'].includes(st)) {
        return false;
      }
      const paySt = String(r.paymentStatus || '').toLowerCase().trim();
      const isPaid = ['paid', 'pago', 'pago_total', 'pago_integralmente', 'confirmado'].includes(paySt);
      const holdExp = r.expiresAt || r.holdExpiresAt;
      if ((st === 'pre_reserva' || st === 'pendente' || r.isPreReservation) && !isPaid && holdExp) {
        const expMs = new Date(holdExp).getTime();
        if (Number.isFinite(expMs) && expMs <= nowMs) return false;
      }
      const matchesCompanion =
        Array.isArray(r.guests) &&
        r.guests.some((g: any) => phonesMatch(g?.phone || g?.whatsapp, cleanPhone));
      return (
        phonesMatch(r.guestPhone || r.phone, cleanPhone) ||
        phonesMatch(r.requesterInfo?.phone || r.requesterInfo?.whatsapp || r.requesterPhone, cleanPhone) ||
        matchesCompanion
      );
    })
    .sort((a, b) => {
      const scoreMatch = (r: any) => {
        let s = 0;
        if (phonesMatch(r.guestPhone || r.phone, cleanPhone)) s += 10;
        if (Array.isArray(r.guests) && r.guests.some((g: any) => phonesMatch(g?.phone || g?.whatsapp, cleanPhone))) s += 8;
        if (r.requesterIsGuest1) s += 4;
        if (r.isPackagePrimary) s += 2;
        return s;
      };
      const diffScore = scoreMatch(b) - scoreMatch(a);
      if (diffScore !== 0) return diffScore;
      const idxA = Number(a?.packageIndex) || 999;
      const idxB = Number(b?.packageIndex) || 999;
      if (idxA !== idxB) return idxA - idxB;
      return 0;
    });

  // 1. Prioriza estadia em andamento (check-in <= hoje <= check-out) e não encerrada
  const activeRes = matchingReservations.find((r) => {
    const ci = String(r.checkinDate || '').slice(0, 10);
    const co = String(r.checkoutDate || '').slice(0, 10);
    const completed = Boolean(
      r.checkoutCompleted ||
        r.status === 'concluida' ||
        r.status === 'checked_out' ||
        guestContext?.isCheckoutCompleted
    );
    return !completed && ci <= todayStr && co >= todayStr;
  });

  // 2. Se não há estadia em andamento, busca reserva futura confirmada ou pré-reserva ativa (PRÉ-CHECKIN)
  let futureRes: any = null;
  if (!activeRes) {
    const futureCandidates = matchingReservations
      .filter((r) => String(r.checkinDate || '').slice(0, 10) > todayStr)
      .sort((a, b) => {
        const cmp = String(a.checkinDate || '').localeCompare(String(b.checkinDate || ''));
        if (cmp !== 0) return cmp;
        const idxA = Number(a?.packageIndex) || 999;
        const idxB = Number(b?.packageIndex) || 999;
        return idxA - idxB;
      });
    if (futureCandidates.length > 0) {
      futureRes = futureCandidates[0];
    }
  }

  const chosenRes = activeRes || futureRes || null;

  // Determina o Estado da Sessão (State Router)
  let estado_atual: EstadoSessao = 'COMERCIAL_VENDAS';
  let perfil_remetente: PerfilRemetente = 'LEAD_DESCONHECIDO';

  if (activeRes) {
    estado_atual = 'IN_STAY_CONCIERGE';
    perfil_remetente = 'HOSPEDE_ATIVO';
  } else if (futureRes) {
    estado_atual = 'PRE_CHECKIN';
    perfil_remetente = 'HOSPEDE_ATIVO';
  } else if (guestContext?.hasReservation && !guestContext?.isCheckoutCompleted) {
    if (guestContext.stayStatus === 'reserva_futura') {
      estado_atual = 'PRE_CHECKIN';
      perfil_remetente = 'HOSPEDE_ATIVO';
    } else if (
      guestContext.stayStatus === 'em_estadia' ||
      guestContext.stayStatus === 'checkout_hoje' ||
      guestContext.stayStatus === 'checkin_hoje'
    ) {
      estado_atual = 'IN_STAY_CONCIERGE';
      perfil_remetente = 'HOSPEDE_ATIVO';
    }
  }

  const matchedGuest = guests.find((g) => phonesMatch(g?.phone || g?.whatsapp, cleanPhone));
  const sourceRes = chosenRes || (guestContext?.hasReservation ? guestContext.reservation : null);

  let isSenderRequester = false;
  let isCompanionSender = false;
  let matchedCompanionIdx = -1;
  let matchedCompanionGuestNumber = 1;
  let ocultarFinanceiro = false;

  if (sourceRes) {
    const reqPhoneCandidate =
      sourceRes.requesterInfo?.whatsapp ||
      sourceRes.requesterInfo?.phone ||
      sourceRes.requesterPhone ||
      '';
    const matchesReqPhone = Boolean(cleanPhone && phonesMatch(reqPhoneCandidate, cleanPhone));
    const matchesMainGuestPhone = Boolean(
      cleanPhone &&
        (phonesMatch(sourceRes.guestPhone || sourceRes.phone, cleanPhone) ||
          (Array.isArray(sourceRes.guests) &&
            sourceRes.guests[0] &&
            phonesMatch(sourceRes.guests[0]?.phone || sourceRes.guests[0]?.whatsapp, cleanPhone)))
    );

    matchedCompanionIdx = Array.isArray(sourceRes.guests)
      ? sourceRes.guests.findIndex(
          (g: any, idx: number) =>
            (idx >= 1 || Number(g?.index) >= 2 || g?.isMain === false) &&
            phonesMatch(g?.phone || g?.whatsapp, cleanPhone)
        )
      : -1;

    if (matchedCompanionIdx >= 0 && !matchesReqPhone && !matchesMainGuestPhone) {
      isCompanionSender = true;
      const compItem = sourceRes.guests[matchedCompanionIdx];
      matchedCompanionGuestNumber =
        Number(compItem?.index) >= 2 ? Number(compItem.index) : Math.max(2, matchedCompanionIdx + 1);
    }

    isSenderRequester = Boolean(
      matchesReqPhone ||
        (sourceRes.requesterIsGuest1 && !isCompanionSender && matchesMainGuestPhone)
    );

    const isB2bRes =
      String(sourceRes.channel || '').toLowerCase().includes('b2b') ||
      Boolean(sourceRes.agencyId || sourceRes.b2bReservationNumber);

    const isSeparateRequester = Boolean(
      isB2bRes ||
        (sourceRes.requesterType && sourceRes.requesterType !== 'guest' && !sourceRes.requesterIsGuest1) ||
        (reqPhoneCandidate && !phonesMatch(reqPhoneCandidate, sourceRes.guestPhone || sourceRes.phone || '')) ||
        ((sourceRes.packageId || sourceRes.packageCode) && !sourceRes.requesterIsGuest1) ||
        guestContext?.hideFinancialForGuest
    );

    ocultarFinanceiro = Boolean(
      isCompanionSender || ((sourceRes.hideFinancialForGuest || isSeparateRequester) && !isSenderRequester)
    );
  }

  const companionObj =
    isCompanionSender && sourceRes && Array.isArray(sourceRes.guests)
      ? sourceRes.guests[matchedCompanionIdx]
      : null;
  const companionRealName =
    companionObj?.name && !isPlaceholderGuestName(companionObj.name)
      ? String(companionObj.name).trim()
      : '';
  const rawChosenGuestName = String(chosenRes?.guestName || '').trim();
  const isChosenPendingName = isPlaceholderGuestName(rawChosenGuestName);

  const guestName =
    companionRealName ||
    (isSenderRequester && (isChosenPendingName || !phonesMatch(sourceRes?.guestPhone || sourceRes?.phone, cleanPhone))
      ? String(sourceRes?.requesterInfo?.name || sourceRes?.requesterName || '').trim()
      : '') ||
    (!isChosenPendingName ? rawChosenGuestName : '') ||
    guestContext?.guestName ||
    matchedGuest?.name ||
    undefined;

  const dadosHospede = guestName
    ? {
        id: String(matchedGuest?.id || chosenRes?.guestId || `usr_${cleanPhone.slice(-6) || 'guest'}`),
        nome: String(guestName),
        telefone: cleanPhone ? `+${cleanPhone}` : phone,
      }
    : undefined;

  let reservaSessao: (ReservaAtivaSessao & Record<string, any>) | undefined;

  if (sourceRes) {
    const flatNum = String(sourceRes.flatNumber || guestContext?.flatNumber || 'S/N');
    const resCode = String(
      sourceRes.code ||
        sourceRes.reservationCode ||
        guestContext?.reservationCode ||
        (sourceRes.id != null ? `RES-${flatNum}-${String(sourceRes.id).padStart(4, '0')}` : `RES-${flatNum}`)
    );
    const checkinDate = String(sourceRes.checkinDate || '').slice(0, 10);
    const checkoutDate = String(sourceRes.checkoutDate || '').slice(0, 10);
    const rawPay = String(sourceRes.paymentStatus || '').toLowerCase();
    const rawStatus = String(sourceRes.status || '').toLowerCase();
    const isPaid =
      rawPay === 'paid' ||
      rawPay === 'pago' ||
      rawPay === 'pago_total' ||
      rawPay === 'pago_integralmente' ||
      rawPay === 'confirmado';
    const isUnconfirmedPreRes =
      rawStatus === 'pre_reserva' ||
      rawStatus === 'pendente' ||
      rawStatus === 'pending_payment' ||
      rawStatus === 'expirada';

    const wifiPassword =
      db?.whatsappAiSettings?.knowledgeBase?.wifiPassword || '1234567890123';
    const procEnv = (globalThis as any).process?.env;
    const baseUrl = String(
      db?.settings?.baseUrl || procEnv?.APP_BASE_URL || procEnv?.SERVER_BASE_URL || 'https://corpflats.com.br'
    ).replace(/\/+$/, '');

    const rawChan = String(sourceRes.channel || sourceRes.source || 'whatsapp').toLowerCase().trim();
    const canalReservaNome = (() => {
      if (sourceRes.channelLabel) return String(sourceRes.channelLabel).trim();
      if (rawChan.includes('b2b') || rawChan.includes('corporat') || rawChan.includes('agenc') || sourceRes.isB2B || sourceRes.agencyId || sourceRes.b2bReservationNumber) return 'B2B / Corporativo';
      if (rawChan.includes('booking')) return 'Booking.com';
      if (rawChan.includes('airbnb')) return 'Airbnb';
      if (rawChan.includes('expedia')) return 'Expedia';
      if (rawChan.includes('decolar')) return 'Decolar';
      if (rawChan.includes('whats') || rawChan.includes('wpp') || rawChan === 'direta') return 'WhatsApp';
      if (rawChan.includes('site') || rawChan.includes('motor') || rawChan.includes('corpflats') || rawChan === 'direct') return 'Site CorpFlats';
      if (rawChan.includes('balcao') || rawChan.includes('balcão') || rawChan.includes('presencial')) return 'Recepção / Balcão';
      return rawChan ? rawChan.charAt(0).toUpperCase() + rawChan.slice(1) : 'WhatsApp';
    })();

    const qtdHospedes = Math.max(
      1,
      Math.round(
        Number(sourceRes.guestCount) ||
          Number(sourceRes.guestsCount) ||
          Number(sourceRes.numGuests) ||
          Number(sourceRes.adults) ||
          (typeof sourceRes.guests === 'number' ? Number(sourceRes.guests) : 0) ||
          (Array.isArray(sourceRes.guests) && sourceRes.guests.length > 0 ? sourceRes.guests.length : 0) ||
          1
      )
    );

    const guestIdxQuery = isCompanionSender ? `?guest=${matchedCompanionGuestNumber}` : '';
    const linkPreCheckinResolved = isUnconfirmedPreRes
      ? null
      : `${baseUrl}/pre-checkin/${resCode}${guestIdxQuery}`;
    const linkPortalHospedeIndividual = `${baseUrl}/minha-reserva/${resCode}${guestIdxQuery}`;

    const pkgSummaryCtx =
      !ocultarFinanceiro && isSenderRequester && (sourceRes.packageId || sourceRes.packageCode) && db
        ? buildPackageSummaryForSession(db, sourceRes, baseUrl)
        : null;

    reservaSessao = {
      id: resCode,
      reserva_id: resCode,
      imovel_id: String(sourceRes.flatId || `flat_${flatNum}`),
      nome_imovel: `Flat ${flatNum}`,
      data_checkin: checkinDate,
      data_checkout: checkoutDate,
      check_in: `${checkinDate}T${sourceRes.checkinTime || '14:00'}:00`,
      check_out: `${checkoutDate}T${sourceRes.lateCheckoutTime || sourceRes.checkoutTime || '12:00'}:00`,
      status_pagamento: isPaid ? 'PAGO_INTEGRALMENTE' : 'PENDENTE',
      status_reserva: isUnconfirmedPreRes ? 'PRE_RESERVA' : 'CONFIRMADA',
      quantidade_hospedes: qtdHospedes,
      canal_reserva: rawChan,
      canal_reserva_nome: canalReservaNome,
      ocultar_financeiro: ocultarFinanceiro,
      papel_remetente: isSenderRequester
        ? (pkgSummaryCtx ? 'SOLICITANTE_PACOTE' : 'SOLICITANTE')
        : isCompanionSender
          ? 'ACOMPANHANTE'
          : 'HOSPEDE_TITULAR',
      indice_hospede: isCompanionSender ? matchedCompanionGuestNumber : 1,
      senha_fechadura: sourceRes.doorCode || sourceRes.lockPassword || undefined,
      wifi_rede: `apto ${flatNum}`,
      wifi_senha: wifiPassword,
      email_cadastrado: isCompanionSender
        ? (companionObj?.email || null)
        : (sourceRes.guestEmail || matchedGuest?.email || null),
      alerta_email_incorreto:
        !isCompanionSender &&
        (sourceRes.emailCorrectionRequest?.status === 'awaiting_reply' || sourceRes.guestEmailInvalid)
          ? {
              status: 'AGUARDANDO_CORRECAO',
              email_invalido: String(
                sourceRes.emailCorrectionRequest?.invalidEmail || sourceRes.guestEmail || ''
              ),
              email_sugerido: sourceRes.emailCorrectionRequest?.suggestedEmail || null,
              solicitado_em: sourceRes.emailCorrectionRequest?.notifiedAt || null,
            }
          : null,
      link_pre_checkin: linkPreCheckinResolved,
      link_portal_hospede: linkPortalHospedeIndividual,
      ...(ocultarFinanceiro
        ? {}
        : {
            valor_diaria: Number(sourceRes.dailyRate || 237),
            valor_total: pkgSummaryCtx ? pkgSummaryCtx.totalAmount : Number(sourceRes.totalAmount || 0),
            link_comprovante_pagamento: pkgSummaryCtx
              ? pkgSummaryCtx.packagePortalUrl
              : `${baseUrl}/minha-reserva/${resCode}`,
          }),
      ...(pkgSummaryCtx ? { pacote_multi_flat: pkgSummaryCtx } : {}),
    };

    if (!ocultarFinanceiro && (sourceRes.pendingSundayUpsell || sourceRes.sundayUpsellOffer)) {
      const offer = sourceRes.pendingSundayUpsell || sourceRes.sundayUpsellOffer;
      const holdExp = offer.expiresAt || offer.holdExpiresAt ? new Date(offer.expiresAt || offer.holdExpiresAt).getTime() : 0;
      const isExpired = holdExp > 0 && nowMs > holdExp;
      const offerPaid = offer.status === 'paid' || offer.status === 'confirmed_paid' || sourceRes.hasSundayUpsell === true || sourceRes.sundayUpsellPaid === true;
      const discountPct = Number(offer.discountPercent ?? db?.sundayUpsellConfig?.sundayUpsellDiscountPercent ?? 50);
      const normalRate = Number(offer.normalDailyRate || offer.normalRate || sourceRes.dailyRate || 200.0);
      const promoPrice = Number(offer.promotionalPrice || offer.sundayUpsellPrice || Number((normalRate * (1 - discountPct / 100)).toFixed(2)));
      const economia = Math.max(0, Number((normalRate - promoPrice).toFixed(2)));

      reservaSessao.oferta_domingo_sem_pressa = {
        ofertada: true,
        status: offerPaid ? 'CONFIRMADA_PAGA' : (isExpired ? 'HOLD_EXPIRADO' : 'PENDENTE_PAGAMENTO'),
        data_envio: offer.createdAt || offer.offeredAt || offer.sentAt,
        percentual_desconto: discountPct,
        valor_promocional: promoPrice,
        valor_normal: normalRate,
        economia,
        bonus_segunda_ate: offer.bonusUntil || offer.targetCheckoutTime || '12:00',
        hold_expirado: isExpired && !offerPaid,
        hold_expira_em: offer.expiresAt || offer.holdExpiresAt,
        codigo_pix_copia_e_cola: isExpired && !offerPaid ? undefined : (offer.pixCopiaECola || offer.pix_copia_e_cola),
      };
    }
  }

  return {
    data_hora_atual: isoNow,
    telefone_remetente: cleanPhone ? `+${cleanPhone}` : String(phone || ''),
    perfil_remetente,
    estado_atual,
    hospede: dadosHospede,
    dados_hospede: dadosHospede,
    reserva_ativa: reservaSessao,
    reserva_atual: reservaSessao,
    runtime: {
      db,
      ...runtime,
    },
  };
}

export function buildContextoSessaoJson(context: ContextoSessaoInjetado): string {
  const isoNow = context.data_hora_atual || new Date().toISOString();
  const todayIso = String(isoNow).slice(0, 10);
  const rawRes: any = context.reserva_atual || context.reserva_ativa || null;
  const sanitizedRes =
    rawRes && rawRes.ocultar_financeiro
      ? (() => {
          const clone = { ...rawRes };
          delete clone.valor_diaria;
          delete clone.valor_total;
          delete clone.status_pagamento;
          delete clone.link_comprovante_pagamento;
          delete clone.oferta_domingo_sem_pressa;
          delete clone.pacote_multi_flat;
          return clone;
        })()
      : rawRes;

  const payload = {
    contexto_sessao: {
      data_hora_atual: isoNow,
      data_hoje_iso: todayIso,
      data_amanha_iso: addDaysIso(todayIso, 1),
      data_depois_de_amanha_iso: addDaysIso(todayIso, 2),
      perfil_remetente: context.perfil_remetente || (context.reserva_ativa ? 'HOSPEDE_ATIVO' : 'LEAD_DESCONHECIDO'),
      estado_atual: context.estado_atual,
      dados_hospede: context.dados_hospede || context.hospede || null,
      reserva_atual: sanitizedRes,
    },
  };
  return JSON.stringify(payload, null, 2);
}

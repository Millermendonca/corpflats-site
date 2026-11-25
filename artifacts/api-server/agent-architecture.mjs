/**
 * Runtime ESM compilado de `src/agent/` (Constituição Arquitetural AGENTS.md)
 * Contém:
 * - Contratos e validação de Retorno Instrucional (`AgentToolResponse` / `instrucao_para_ia`)
 * - Middleware Pré-LLM (`injectSessionContext`, `buildContextoSessaoJson`)
 * - Roteador de Estado (`COMERCIAL_VENDAS`, `PRE_CHECKIN`, `IN_STAY_CONCIERGE`) e Prompts Modulares
 * - Serviço de Transbordo Inteligente (`notifyAdminWhatsApp`)
 * - Catálogo Completo de Tools Semânticas:
 *   1. `consultar_disponibilidade`
 *   2. `calcular_orcamento`
 *   3. `gerar_link_reserva`
 *   4. `consultar_detalhes_reserva`
 *   5. `atualizar_dados_hospede`
 *   6. `solicitar_early_checkin`
 *   7. `solicitar_late_checkout`
 *   8. `alterar_datas_reserva`
 *   9. `estender_estadia`
 *  10. `solicitar_limpeza_extra`
 *  11. `abrir_chamado_manutencao`
 *  12. `gerenciar_nota_fiscal_nfse`
 *  13. `notificar_administrador`
 */

import {
  triggerImmediateWhatsApp,
  generateStaticPixPayload,
  formatReservationChannelLabel,
  resolveReservationGuestCount,
  computeCardAmountFromPix,
  sendZapiMessage,
  sendZapiDocument,
  appendMessageToConversation,
  checkZapiPhoneExists,
  dispatchCatchUpGuestRulerMessages,
  scheduleUpcomingReservationTriggers,
  hasPdfAlreadyBeenSentOrInFlight,
  evaluateSelfCheckinEligibility,
  evaluateFlatCheckinReadiness,
} from './zapi-service.mjs';
import { validateGuestEmailAddress, updateGuestEmailAndResendRecentPending } from './mail-service.mjs';
import { WbpPricingManager, calculateSebraeRate, STANDARD_SEBRAE_SEASONALITY_FACTORS } from './wbp/pricing.mjs';
import {
  generatePackageCode,
  computePackageSummary,
  syncPackagePixAndPaymentLinks,
  cancelSinglePackageFlat,
  getPackageReservations,
  isPackageItemActive,
  isReservationSettledInPackage,
  ensureRequesterPortalToken,
  verifyWhatsAppPhoneActive,
  updateGuestPhoneAndResendInstructions,
} from './package-reservations-service.mjs';

function round2Local(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normalizePhoneDigits(phone) {
  return String(phone || '').replace(/\D+/g, '');
}

function phonesMatch(phoneA, phoneB) {
  const a = normalizePhoneDigits(phoneA);
  const b = normalizePhoneDigits(phoneB);
  if (!a || !b || a.length < 8 || b.length < 8) return false;
  return a.endsWith(b.slice(-8)) || b.endsWith(a.slice(-8));
}

function isPlaceholderGuestName(nm) {
  const s = String(nm || '').trim();
  return !s || /a definir|informar depois|pendente|^h[oó]spede\s*\d*$/i.test(s);
}

export function evaluateReservationFinancialPrivacy(sourceRes, senderPhone, guestContext = null) {
  if (!sourceRes) {
    return {
      isSenderRequester: false,
      isCompanionSender: false,
      matchedCompanionIdx: -1,
      matchedCompanionGuestNumber: 1,
      isSeparateRequester: false,
      ocultarFinanceiro: false,
    };
  }
  const cleanPhone = normalizePhoneDigits(senderPhone);
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

  const matchedCompanionIdx = Array.isArray(sourceRes.guests)
    ? sourceRes.guests.findIndex(
        (g, idx) =>
          (idx >= 1 || Number(g?.index) >= 2 || g?.isMain === false) &&
          phonesMatch(g?.phone || g?.whatsapp, cleanPhone)
      )
    : -1;

  const isCompanionSender = matchedCompanionIdx >= 0 && !matchesReqPhone && !matchesMainGuestPhone;
  const compObj = isCompanionSender ? sourceRes.guests[matchedCompanionIdx] : null;
  const matchedCompanionGuestNumber = isCompanionSender
    ? (Number(compObj?.index) >= 2 ? Number(compObj.index) : Math.max(2, matchedCompanionIdx + 1))
    : 1;

  const isSenderRequester = Boolean(
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

  const ocultarFinanceiro = Boolean(
    isCompanionSender || ((sourceRes.hideFinancialForGuest || isSeparateRequester) && !isSenderRequester)
  );

  return {
    isSenderRequester,
    isCompanionSender,
    matchedCompanionIdx,
    matchedCompanionGuestNumber,
    isSeparateRequester,
    ocultarFinanceiro,
  };
}

function getBrasiliaIsoAndDate(now = new Date()) {
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

    const map = {};
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

export function injectSessionContext(params = {}) {
  const simOffset = Number(globalThis.__simulatedTimeOffsetMs || 0);
  const { db, phone, now = new Date(Date.now() + simOffset), guestContext, runtime } = params;
  const cleanPhone = normalizePhoneDigits(phone);
  const { isoNow, todayStr } = getBrasiliaIsoAndDate(now);

  const reservations = Array.isArray(db?.reservations) ? db.reservations : [];
  const guests = Array.isArray(db?.guests) ? db.guests : [];

  const isDevSender = cleanPhone && cleanPhone.endsWith('998505276');
  const nowMs = now instanceof Date ? now.getTime() : Date.now() + simOffset;

  const matchingReservations = reservations
    .filter((r) => {
      if (!r) return false;
      const st = String(r.status || '').toLowerCase().trim();
      if (['cancelada', 'cancelado', 'cancelled', 'expirada', 'expired', 'no_show'].includes(st)) return false;
      if (r.isRoomMoveHistoricalSegment && String(r.checkoutDate || '').slice(0, 10) <= todayStr) {
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
        r.guests.some((g) => phonesMatch(g?.phone || g?.whatsapp, cleanPhone));
      return (
        phonesMatch(r.guestPhone || r.phone, cleanPhone) ||
        phonesMatch(r.requesterInfo?.phone || r.requesterInfo?.whatsapp || r.requesterPhone, cleanPhone) ||
        matchesCompanion
      );
    })
    .sort((a, b) => {
      const scoreMatch = (r) => {
        let s = 0;
        if (phonesMatch(r.guestPhone || r.phone, cleanPhone)) s += 10;
        if (Array.isArray(r.guests) && r.guests.some((g) => phonesMatch(g?.phone || g?.whatsapp, cleanPhone))) s += 8;
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

  const activeRes = matchingReservations.find((r) => {
    const ci = String(r.checkinDate || '').slice(0, 10);
    const co = String(r.checkoutDate || '').slice(0, 10);
    const completed = Boolean(
      r.checkoutCompleted ||
        r.checkoutDone ||
        r.status === 'completed' ||
        r.status === 'concluida' ||
        r.status === 'checked_out' ||
        guestContext?.isCheckoutCompleted
    );
    return !completed && ci <= todayStr && co >= todayStr;
  });

  let futureRes = null;
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

  let pastRes = null;
  if (!activeRes && !futureRes && !isDevSender) {
    const pastCandidates = matchingReservations
      .filter((r) => {
        const co = String(r.checkoutDate || '').slice(0, 10);
        return (
          co < todayStr ||
          r.checkoutCompleted ||
          r.status === 'concluida' ||
          r.status === 'checked_out'
        );
      })
      .sort((a, b) => String(b.checkoutDate || '').localeCompare(String(a.checkoutDate || '')));
    if (pastCandidates.length > 0) {
      pastRes = pastCandidates[0];
    }
  }

  const chosenRes = activeRes || futureRes || pastRes || null;

  let estado_atual = 'COMERCIAL_VENDAS';
  let modo_roteamento = 'MODO_COMERCIAL_LEAD';
  let perfil_remetente = 'LEAD_DESCONHECIDO';

  if (activeRes) {
    estado_atual = 'IN_STAY_CONCIERGE';
    modo_roteamento = 'MODO_CONCIERGE_INSTAY';
    perfil_remetente = 'HOSPEDE_ATIVO';
  } else if (futureRes) {
    estado_atual = 'PRE_CHECKIN';
    modo_roteamento = 'MODO_PRE_CHECKIN';
    perfil_remetente = 'HOSPEDE_ATIVO';
  } else if (pastRes || guestContext?.isCheckoutCompleted) {
    estado_atual = 'POS_CHECKOUT';
    modo_roteamento = 'MODO_POS_CHECKOUT';
    perfil_remetente = 'EX_HOSPEDE_POS_CHECKOUT';
  } else if (guestContext?.hasReservation && !guestContext?.isCheckoutCompleted) {
    if (guestContext.stayStatus === 'reserva_futura') {
      estado_atual = 'PRE_CHECKIN';
      modo_roteamento = 'MODO_PRE_CHECKIN';
      perfil_remetente = 'HOSPEDE_ATIVO';
    } else if (
      guestContext.stayStatus === 'em_estadia' ||
      guestContext.stayStatus === 'checkout_hoje' ||
      guestContext.stayStatus === 'checkin_hoje'
    ) {
      estado_atual = 'IN_STAY_CONCIERGE';
      modo_roteamento = 'MODO_CONCIERGE_INSTAY';
      perfil_remetente = 'HOSPEDE_ATIVO';
    }
  }

  const matchedGuest = guests.find((g) => phonesMatch(g?.phone || g?.whatsapp, cleanPhone));
  const sourceRes = chosenRes || (guestContext?.hasReservation ? guestContext.reservation : null);

  const privacyEval = evaluateReservationFinancialPrivacy(sourceRes, cleanPhone, guestContext);
  const {
    isSenderRequester,
    isCompanionSender,
    matchedCompanionIdx,
    matchedCompanionGuestNumber,
    ocultarFinanceiro,
  } = privacyEval;

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
        telefone: cleanPhone ? `+${cleanPhone}` : String(phone || ''),
      }
    : undefined;

  let reservaSessao;

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

    const includeBreakfast = Boolean(
      sourceRes.includeBreakfast ||
        sourceRes.ratePlan === 'with_breakfast' ||
        String(sourceRes.ratePlan || '').toLowerCase().includes('cafe')
    );
    const preCheckinDone = isCompanionSender
      ? Boolean(companionObj?.hasCompletedCheckin || companionObj?.status === 'CHECKED_IN')
      : Boolean(
          sourceRes.preCheckinCompleted ||
            sourceRes.preCheckinCompletedAt ||
            sourceRes.fnrhCompleted ||
            sourceRes.checkinCompletedAt
        );

    const wifiPassword =
      db?.whatsappAiSettings?.knowledgeBase?.wifiPassword || '1234567890123';
    const baseUrl = String(
      db?.settings?.baseUrl ||
      (typeof process !== 'undefined' && (process.env?.APP_BASE_URL || process.env?.SERVER_BASE_URL)) ||
      'https://corpflats.com.br'
    ).replace(/\/+$/, '');

    const guestIdxQuery = isCompanionSender ? `?guest=${matchedCompanionGuestNumber}` : '';
    const linkPreCheckinResolved = isUnconfirmedPreRes
      ? null
      : `${baseUrl}/pre-checkin/${resCode}${guestIdxQuery}`;
    const linkPortalHospedeIndividual = `${baseUrl}/minha-reserva/${resCode}${guestIdxQuery}`;

    const pkgSummaryCtx =
      !ocultarFinanceiro && isSenderRequester && (sourceRes.packageId || sourceRes.packageCode) && db
        ? computePackageSummary(db, sourceRes.packageId || sourceRes.packageCode, {
            baseUrl,
            computeCardAmountFromPix,
          })
        : null;

    let roomMoveGroupSummary = null;
    if (sourceRes.roomMoveGroupId && Array.isArray(db?.reservations)) {
      const grpId = String(sourceRes.roomMoveGroupId).trim();
      const grpSegments = db.reservations
        .filter((seg) => {
          if (!seg || String(seg.roomMoveGroupId || '').trim() !== grpId) return false;
          const sst = String(seg.status || '').toLowerCase().trim();
          return !['cancelada', 'cancelado', 'cancelled', 'expirada', 'expired', 'no_show'].includes(sst);
        })
        .sort((a, b) => {
          const ciCmp = String(a?.checkinDate || '').slice(0, 10).localeCompare(String(b?.checkinDate || '').slice(0, 10));
          if (ciCmp !== 0) return ciCmp;
          const idxDiff = (Number(a?.roomMoveIndex) || 0) - (Number(b?.roomMoveIndex) || 0);
          if (idxDiff !== 0) return idxDiff;
          return (Number(a?.id) || 0) - (Number(b?.id) || 0);
        });

      if (grpSegments.length > 0) {
        let grpTotal = 0;
        let grpPaid = 0;
        let minCi = String(sourceRes.originalStayCheckinDate || grpSegments[0]?.checkinDate || '').slice(0, 10);
        const trailFlats = [];

        for (const seg of grpSegments) {
          const segCi = String(seg.checkinDate || '').slice(0, 10);
          if (segCi && (!minCi || segCi < minCi)) minCi = segCi;
          const segFlat = String(seg.flatNumber || '');
          if (segFlat) trailFlats.push(segFlat);

          const segTot = round2Local(Number(seg.totalAmount) || 0);
          const segPaySt = String(seg.paymentStatus || '').toLowerCase().trim();
          const segSettled =
            ['paid', 'pago', 'pago_total', 'pago_integralmente', 'confirmado'].includes(segPaySt) ||
            (segTot > 0 && (Number(seg.paidAmount) || 0) >= segTot - 0.01);
          const segPaid =
            seg.paidAmount != null
              ? round2Local(Number(seg.paidAmount) || 0)
              : (segSettled ? segTot : 0);

          grpTotal = round2Local(grpTotal + segTot);
          grpPaid = round2Local(grpPaid + segPaid);
        }

        const grpPending = round2Local(Math.max(0, grpTotal - grpPaid));
        roomMoveGroupSummary = {
          roomMoveGroupId: grpId,
          originalCheckinDate: minCi,
          totalAmount: grpTotal,
          paidAmount: grpPaid,
          pendingAmount: grpPending,
          isFullyPaid: grpTotal > 0 ? grpPending <= 0.01 : isPaid,
          flatTrailNumbers: trailFlats,
        };
      }
    }

    const effectiveIsPaid = roomMoveGroupSummary ? roomMoveGroupSummary.isFullyPaid : isPaid;
    const effectiveTotalAmount = pkgSummaryCtx
      ? Number(pkgSummaryCtx.totalAmount || 0)
      : (roomMoveGroupSummary ? roomMoveGroupSummary.totalAmount : round2Local(Number(sourceRes.totalAmount || 0)));
    const effectivePaidAmount = pkgSummaryCtx
      ? Number(pkgSummaryCtx.paidAmount || 0)
      : (roomMoveGroupSummary ? roomMoveGroupSummary.paidAmount : round2Local(Number(sourceRes.paidAmount || 0)));
    const effectivePendingAmount = pkgSummaryCtx
      ? Number(pkgSummaryCtx.pendingAmount || 0)
      : (roomMoveGroupSummary
          ? roomMoveGroupSummary.pendingAmount
          : round2Local(Math.max(0, effectiveTotalAmount - effectivePaidAmount)));

    reservaSessao = {
      id: resCode,
      reserva_id: resCode,
      raw_id: sourceRes.id ?? null,
      imovel_id: String(sourceRes.flatId || `flat_${flatNum}`),
      nome_imovel: `Flat ${flatNum}`,
      data_checkin: checkinDate,
      data_checkout: checkoutDate,
      check_in: `${checkinDate}T${sourceRes.checkinTime || '14:00'}:00`,
      check_out: `${checkoutDate}T${sourceRes.lateCheckoutTime || sourceRes.checkoutTime || '12:00'}:00`,
      ...(ocultarFinanceiro ? {} : { status_pagamento: effectiveIsPaid ? 'PAGO_INTEGRALMENTE' : 'PENDENTE' }),
      status_reserva: isUnconfirmedPreRes ? 'PRE_RESERVA' : 'CONFIRMADA',
      plano_tarifa: includeBreakfast ? 'COM_CAFE_DA_MANHA' : 'SOMENTE_HOSPEDAGEM',
      cafe_incluso: includeBreakfast,
      status_pre_checkin_fnrh: preCheckinDone ? 'CONCLUIDO' : 'PENDENTE',
      canal_reserva: String(sourceRes.channel || 'whatsapp').toLowerCase(),
      canal_reserva_nome: formatReservationChannelLabel(sourceRes),
      ocultar_financeiro: ocultarFinanceiro,
      papel_remetente: isSenderRequester
        ? (pkgSummaryCtx ? 'SOLICITANTE_PACOTE' : 'SOLICITANTE')
        : isCompanionSender
          ? 'ACOMPANHANTE'
          : 'HOSPEDE_TITULAR',
      indice_hospede: isCompanionSender ? matchedCompanionGuestNumber : 1,
      ...(roomMoveGroupSummary
        ? {
            possui_troca_flat: true,
            roomMoveGroupId: roomMoveGroupSummary.roomMoveGroupId,
            flat_anterior: sourceRes.transferredFromFlatNumber || null,
            data_corte_troca: sourceRes.roomMoveCutDate || null,
            data_checkin_estadia_original: roomMoveGroupSummary.originalCheckinDate,
            trilha_flats: roomMoveGroupSummary.flatTrailNumbers,
          }
        : {}),
      ...(ocultarFinanceiro
        ? {}
        : {
            valor_diaria: Number(sourceRes.dailyRate || 237),
            valor_total: effectiveTotalAmount,
            valor_pago: effectivePaidAmount,
            saldo_pendente: effectivePendingAmount,
          }),
      quantidade_hospedes: resolveReservationGuestCount(sourceRes),
      acesso_imovel: 'Cartão NFC retirado na recepção 24h',
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
      veiculo: sourceRes.vehicle || null,
      link_pre_checkin: linkPreCheckinResolved,
      link_portal_hospede: linkPortalHospedeIndividual,
      ...(ocultarFinanceiro
        ? {}
        : {
            link_comprovante_pagamento: pkgSummaryCtx
              ? pkgSummaryCtx.packagePortalUrl
              : `${baseUrl}/minha-reserva/${resCode}`,
          }),
      link_agendamento_cafe: (!isUnconfirmedPreRes && includeBreakfast) ? `${baseUrl}/minha-reserva/${resCode}/cafe` : null,
      ...(pkgSummaryCtx
        ? {
            pacote_multi_flat: {
              packageCode: pkgSummaryCtx.packageCode,
              package_code: pkgSummaryCtx.packageCode,
              codigo_pacote: pkgSummaryCtx.packageCode,
              quantidade_flats_ativos: pkgSummaryCtx.activeFlatsCount,
              activeFlatsCount: pkgSummaryCtx.activeFlatsCount,
              totalAmount: pkgSummaryCtx.totalAmount,
              paidAmount: pkgSummaryCtx.paidAmount,
              pendingAmount: pkgSummaryCtx.pendingAmount,
              valor_total_pacote: pkgSummaryCtx.totalAmount,
              valor_pago_pacote: pkgSummaryCtx.paidAmount,
              valor_pendente_pacote: pkgSummaryCtx.pendingAmount,
              valor_cartao_pendente: pkgSummaryCtx.cardPendingAmount,
              status_pagamento_pacote: pkgSummaryCtx.isPaid ? 'PAGO_INTEGRALMENTE' : 'PENDENTE',
              precisa_cadastrar_hospedes: pkgSummaryCtx.needsGuestCredentials,
              chave_pix_unica: pkgSummaryCtx.pixCopiaECola || null,
              packagePortalUrl: pkgSummaryCtx.packagePortalUrl,
              batchCredentialUrl: pkgSummaryCtx.batchCredentialUrl,
              link_pacote: pkgSummaryCtx.packagePortalUrl,
              link_credenciamento: pkgSummaryCtx.batchCredentialUrl,
              flats: pkgSummaryCtx.items
                .filter((it) => it.isActive)
                .map((it) => ({
                  codigo_reserva: it.code,
                  code: it.code,
                  flat: it.flatNumber,
                  flatNumber: it.flatNumber,
                  data_checkin: it.checkinDate,
                  data_checkout: it.checkoutDate,
                  checkinDate: it.checkinDate,
                  checkoutDate: it.checkoutDate,
                  quantidade_hospedes: it.guestCount,
                  guestCount: it.guestCount,
                  incluir_cafe: it.includeBreakfast,
                  hospede_titular: it.informGuestsLater ? 'A informar após pagamento' : it.guestName,
                  hospede_2: it.guest2Name || (it.guestCount >= 2 && it.guest2InformLater ? 'A informar' : null),
                  valor_flat: it.totalAmount,
                })),
            },
          }
        : {}),
    };

    if (!ocultarFinanceiro && (sourceRes.pendingSundayUpsell || sourceRes.sundayUpsellOffer)) {
      const offer = sourceRes.pendingSundayUpsell || sourceRes.sundayUpsellOffer;
      const holdExp = offer.expiresAt || offer.holdExpiresAt ? new Date(offer.expiresAt || offer.holdExpiresAt).getTime() : 0;
      const isExpired = holdExp > 0 && Date.now() > holdExp;
      const isPaid = offer.status === 'paid' || offer.status === 'confirmed_paid' || sourceRes.hasSundayUpsell === true || sourceRes.sundayUpsellPaid === true;
      const discountPct = Number(offer.discountPercent ?? db?.sundayUpsellConfig?.sundayUpsellDiscountPercent ?? 50);
      const normalRate = Number(offer.normalDailyRate || offer.normalRate || sourceRes.dailyRate || 200.0);
      const promoPrice = Number(offer.promotionalPrice || offer.sundayUpsellPrice || Number((normalRate * (1 - discountPct / 100)).toFixed(2)));
      const economia = Math.max(0, Number((normalRate - promoPrice).toFixed(2)));

      reservaSessao.oferta_domingo_sem_pressa = {
        ofertada: true,
        status: isPaid ? 'CONFIRMADA_PAGA' : (isExpired ? 'HOLD_EXPIRADO' : 'PENDENTE_PAGAMENTO'),
        data_envio: offer.createdAt || offer.offeredAt || offer.sentAt,
        percentual_desconto: discountPct,
        valor_promocional: promoPrice,
        valor_normal: normalRate,
        economia,
        bonus_segunda_ate: offer.bonusUntil || offer.targetCheckoutTime || '12:00',
        hold_expirado: isExpired && !isPaid,
        hold_expira_em: offer.expiresAt || offer.holdExpiresAt,
        codigo_pix_copia_e_cola: isExpired && !isPaid ? undefined : (offer.pixCopiaECola || offer.pix_copia_e_cola),
      };
    }
  }

  // Varre TODAS as reservas ativas não expiradas onde o remetente é Solicitante para expor alertas de WhatsApp inválido de hóspedes (inclusive Flats 2..N)
  const alertasTelefoneHospedeInvalido = [];
  const seenPhoneAlertKeys = new Set();
  if (cleanPhone && cleanPhone.length >= 8) {
    for (const r of reservations) {
      if (!r) continue;
      if (r.isRoomMoveHistoricalSegment) continue;
      const st = String(r.status || '').toLowerCase().trim();
      if (['cancelada', 'cancelado', 'cancelled', 'expirada', 'expired', 'no_show', 'concluida', 'checked_out'].includes(st)) continue;
      if (r.checkoutCompleted) continue;
      const paySt = String(r.paymentStatus || '').toLowerCase().trim();
      const isPaidItem = ['paid', 'pago', 'pago_total', 'pago_integralmente', 'confirmado'].includes(paySt);
      const holdExp = r.expiresAt || r.holdExpiresAt;
      if ((st === 'pre_reserva' || st === 'pendente' || r.isPreReservation) && !isPaidItem && holdExp) {
        const expMs = new Date(holdExp).getTime();
        if (Number.isFinite(expMs) && expMs <= nowMs) continue;
      }

      const reqPhoneCand = r.requesterInfo?.whatsapp || r.requesterInfo?.phone || r.requesterPhone || '';
      const isReqMatch = Boolean(
        phonesMatch(reqPhoneCand, cleanPhone) ||
        (r.requesterIsGuest1 && phonesMatch(r.guestPhone || r.phone, cleanPhone))
      );
      if (!isReqMatch) continue;

      const reqList = Array.isArray(r.guestPhoneCorrectionRequests) ? r.guestPhoneCorrectionRequests : [];
      for (const reqItem of reqList) {
        if (!reqItem || reqItem.status !== 'awaiting_reply') continue;
        const gIdx = Math.max(1, Number(reqItem.guestIndex) || 1);
        const rCodeItem = String(r.code || r.reservationCode || `RES-${r.flatNumber}-${r.id}`).trim();
        const dedupKey = `${rCodeItem}:${gIdx}`;
        if (seenPhoneAlertKeys.has(dedupKey)) continue;
        seenPhoneAlertKeys.add(dedupKey);

        const gName = String(
          reqItem.guestName ||
          (gIdx === 1 ? r.guestName : r.guests?.[gIdx - 1]?.name) ||
          `Hóspede ${gIdx}`
        ).trim();

        alertasTelefoneHospedeInvalido.push({
          codigo_reserva: rCodeItem,
          codigo_pacote: r.packageCode || r.packageId || null,
          flat: String(r.flatNumber || ''),
          indice_hospede: gIdx,
          nome_hospede: gName,
          telefone_invalido: String(reqItem.invalidPhone || ''),
          motivo: String(reqItem.reason || 'no_whatsapp_account'),
          solicitado_em: reqItem.notifiedAt || null,
          status: 'AGUARDANDO_CORRECAO',
        });
      }
    }
  }

  if (reservaSessao && alertasTelefoneHospedeInvalido.length > 0) {
    reservaSessao.alertas_telefone_hospede_invalido = alertasTelefoneHospedeInvalido;
  }

  const veiculoPendente =
    runtime?.conversation?.pendingVehicle ||
    matchedGuest?.pendingVehicle ||
    null;

  const sessionCtx = {
    data_hora_atual: isoNow,
    telefone_remetente: cleanPhone ? `+${cleanPhone}` : String(phone || ''),
    perfil_remetente,
    estado_atual,
    modo_roteamento,
    hospede: dadosHospede,
    dados_hospede: dadosHospede,
    reserva_ativa: reservaSessao,
    reserva_atual: reservaSessao,
    ...(alertasTelefoneHospedeInvalido.length > 0 ? { alertas_telefone_hospede_invalido: alertasTelefoneHospedeInvalido } : {}),
    veiculo_pendente: veiculoPendente,
  };

  Object.defineProperty(sessionCtx, 'runtime', {
    value: {
      db,
      ...runtime,
    },
    enumerable: false,
    writable: true,
    configurable: true,
  });

  return sessionCtx;
}

export function buildContextoSessaoJson(context) {
  const isoNow = context?.data_hora_atual || new Date().toISOString();
  const todayIso = String(isoNow).slice(0, 10);
  const tomorrowIso = addDaysIso(todayIso, 1);
  const dayAfterTomorrowIso = addDaysIso(todayIso, 2);
  const rawRes = context?.reserva_atual || context?.reserva_ativa || null;
  const sanitizedRes =
    rawRes && rawRes.ocultar_financeiro
      ? (() => {
          const clone = { ...rawRes };
          delete clone.valor_diaria;
          delete clone.valor_total;
          delete clone.valor_pago;
          delete clone.saldo_pendente;
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
      data_amanha_iso: tomorrowIso,
      data_depois_de_amanha_iso: dayAfterTomorrowIso,
      perfil_remetente:
        context?.perfil_remetente ||
        (context?.reserva_ativa ? 'HOSPEDE_ATIVO' : 'LEAD_DESCONHECIDO'),
      estado_atual: context?.estado_atual || 'COMERCIAL_VENDAS',
      dados_hospede: context?.dados_hospede || context?.hospede || null,
      reserva_atual: sanitizedRes,
      ...(Array.isArray(context?.alertas_telefone_hospede_invalido) && context.alertas_telefone_hospede_invalido.length > 0
        ? { alertas_telefone_hospede_invalido: context.alertas_telefone_hospede_invalido }
        : {}),
    },
  };
  return JSON.stringify(payload, null, 2);
}

export function formatAdminAlertMessage(payload) {
  const urgenciaLabel = payload.nivel_urgencia === 'CRITICA' ? 'CRÍTICA' : payload.nivel_urgencia;
  const imovelSuffix = payload.imovel ? ` (${payload.imovel})` : '';
  const baseUrl =
    payload.context?.runtime?.db?.settings?.baseUrl ||
    (typeof process !== 'undefined' && process.env?.SERVER_BASE_URL) ||
    'https://corpflats.com.br';
  const cleanDigits = String(payload.telefone || '').replace(/\D+/g, '');
  const chatLink = payload.link_conversa || `${baseUrl}/whatsapp?phone=${cleanDigits}`;

  return [
    `🚨 *Alerta do Agente IA [URGÊNCIA: ${urgenciaLabel}]*`,
    `*Hóspede:* ${payload.hospede_nome || 'Desconhecido'}${imovelSuffix}`,
    `*Telefone:* ${payload.telefone || 'Não informado'}`,
    `*Categoria:* ${payload.categoria}`,
    `*Resumo:* ${payload.resumo}`,
    `*Link da conversa:* ${chatLink}`,
  ].join('\n');
}

export function matchesSessionReservation(r, reserva) {
  if (!r || !reserva) return false;
  const targetId = String(reserva.id || reserva.reserva_id || '').trim();
  const rawId = r.id != null ? String(r.id).trim() : '';
  const flatNum = String(
    r.flatNumber ||
      String(reserva.nome_imovel || '')
        .replace(/^Flat\s+/i, '')
        .trim() ||
      'S/N'
  );
  const synthCode = rawId ? `RES-${flatNum}-${rawId.padStart(4, '0')}` : '';
  const synthShort = rawId ? `RES-${rawId}` : '';
  return Boolean(
    (r.code && String(r.code).trim() === targetId) ||
      (r.reservationCode && String(r.reservationCode).trim() === targetId) ||
      (rawId && rawId === targetId) ||
      (synthCode && synthCode === targetId) ||
      (synthShort && synthShort === targetId) ||
      (reserva.raw_id != null && rawId === String(reserva.raw_id).trim())
  );
}

export async function notifyAdminWhatsApp(payload) {
  const formattedMessage = formatAdminAlertMessage(payload);
  const runtime = payload.context?.runtime;
  const db = runtime?.db;

  const adminPhone = String(
    db?.settings?.adminWhatsapp ||
      db?.whatsappAiSettings?.adminPhone ||
      db?.zapiConfig?.adminPhone ||
      (typeof process !== 'undefined' && process.env?.ADMIN_WHATSAPP_PHONE) ||
      '5522998505276'
  ).replace(/\D+/g, '');

  const timestamp = new Date().toISOString();
  let sent = false;

  try {
    if (db) {
      if (!Array.isArray(db.adminAiAlerts)) {
        db.adminAiAlerts = [];
      }
      db.adminAiAlerts.unshift({
        id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        nivel_urgencia: payload.nivel_urgencia,
        categoria: payload.categoria,
        hospede_nome: payload.hospede_nome,
        telefone: payload.telefone,
        imovel: payload.imovel || payload.context?.reserva_ativa?.nome_imovel || null,
        resumo: payload.resumo,
        formattedMessage,
        createdAt: timestamp,
      });
    }

    if (typeof runtime?.createNotification === 'function') {
      await runtime.createNotification({
        type: 'ai_admin_alert',
        title: `Alerta Sofia IA [${payload.nivel_urgencia}] - ${payload.categoria}`,
        message: `${payload.hospede_nome}: ${payload.resumo}`,
        phone: payload.telefone,
        urgency: payload.nivel_urgencia,
        createdAt: timestamp,
      });
    }

    if (typeof runtime?.sendZapiMessage === 'function' && adminPhone) {
      const zapiRes = await runtime.sendZapiMessage(adminPhone, formattedMessage, {
        channel: 'ai_agent',
        channelId: 'ai_agent',
        recipientRole: 'developer',
        bypassTestMode: true,
        isAdminAlert: true,
        db,
      });
      sent = zapiRes?.success !== false;
    }

    if (db && adminPhone && Array.isArray(db.whatsappConversations)) {
      const targetLast8 = adminPhone.slice(-8);
      let adminConv = db.whatsappConversations.find((c) => {
        const cp = String(c?.phone || '').replace(/\D+/g, '');
        return cp && targetLast8 && (cp.endsWith(targetLast8) || adminPhone.endsWith(cp.slice(-8)));
      });
      if (!adminConv) {
        adminConv = {
          id: `conv_admin_${Date.now()}`,
          phone: adminPhone,
          name: 'Gestor CorpFlats',
          messages: [],
          unreadCount: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        db.whatsappConversations.push(adminConv);
      }
      if (!Array.isArray(adminConv.messages)) adminConv.messages = [];
      adminConv.messages.push({
        id: `msg_admin_alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        fromMe: true,
        senderName: 'Sofia (Alerta Gestor)',
        text: formattedMessage,
        type: 'text',
        status: 'delivered',
        isAdminAlert: true,
        timestamp,
      });
      adminConv.lastMessage = formattedMessage.slice(0, 140);
      adminConv.lastMessageAt = timestamp;
      adminConv.updatedAt = timestamp;
    }

    if (typeof runtime?.saveDatabase === 'function') {
      await runtime.saveDatabase();
    }
  } catch (err) {
    console.warn('[AdminNotifier] Aviso ao disparar alerta para o administrador:', err?.message || err);
  }

  return {
    sent,
    adminPhone,
    formattedMessage,
    timestamp,
  };
}

function normalizeTimeHHMM(raw, fallback = '12:00') {
  const clean = String(raw || '').trim();
  const match = clean.match(/(\d{1,2})(?:[:h](\d{2}))?/i);
  if (!match) return fallback;
  const hh = String(Math.min(23, Math.max(0, parseInt(match[1], 10)))).padStart(2, '0');
  const mm = String(Math.min(59, Math.max(0, parseInt(match[2] || '00', 10)))).padStart(2, '0');
  return `${hh}:${mm}`;
}

function diffDays(dateA, dateB) {
  const a = new Date(`${dateA}T00:00:00Z`).getTime();
  const b = new Date(`${dateB}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export function addDaysIso(baseDateStr, days = 1) {
  const clean = String(baseDateStr || '').slice(0, 10);
  const [y, m, d] = clean.split('-').map(Number);
  if (!y || !m || !d) {
    const dt = new Date(Date.now() + days * 86400000);
    return dt.toISOString().slice(0, 10);
  }
  const utc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0) + days * 86400000);
  return utc.toISOString().slice(0, 10);
}

export function resolveNaturalDateInput(rawInput, nowIso = null, currentCheckoutIso = null) {
  const raw = String(rawInput || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const isoPrefix = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix) return isoPrefix[1];

  const todayIso = String(nowIso || getBrasiliaIsoAndDate().isoNow).slice(0, 10);
  const refCheckout = currentCheckoutIso && currentCheckoutIso > todayIso ? currentCheckoutIso : todayIso;
  const norm = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (/\bdepois\s+de\s+amanh[aã?]?\b/.test(norm)) {
    return addDaysIso(todayIso, 2);
  }
  if (/\bamanh[aã?]?\b/.test(norm)) {
    return addDaysIso(todayIso, 1);
  }
  if (/\bhoje\b/.test(norm)) {
    return todayIso;
  }

  const extraDaysMatch = norm.match(/\b(?:mais\s+)?(\d{1,2})\s*(?:dias?|diarias?|noites?)\b/);
  if (extraDaysMatch) {
    const extra = Math.max(1, parseInt(extraDaysMatch[1], 10));
    return addDaysIso(refCheckout, extra);
  }

  const brFull = norm.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (brFull) {
    const dd = String(brFull[1]).padStart(2, '0');
    const mm = String(brFull[2]).padStart(2, '0');
    const yyyy = brFull[3].length === 2 ? `20${brFull[3]}` : brFull[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  const brShort = norm.match(/\b(\d{1,2})[\/\-](\d{1,2})\b/);
  if (brShort) {
    const dd = String(brShort[1]).padStart(2, '0');
    const mm = String(brShort[2]).padStart(2, '0');
    const yyyy = todayIso.slice(0, 4) || '2026';
    return `${yyyy}-${mm}-${dd}`;
  }

  return '';
}

function formatGuestListPtBr(names) {
  const clean = (Array.isArray(names) ? names : []).map((n) => String(n || '').trim()).filter(Boolean);
  if (clean.length === 0) return 'Hóspede';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} e ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')} e ${clean[clean.length - 1]}`;
}

async function generatePixChargeForService({ amount, description, debtorName, debtorDocument, reservationCode, context }) {
  const valor = Number(Number(amount || 0).toFixed(2));
  const db = context?.runtime?.db || null;
  const cleanCode = String(reservationCode || 'EXT').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14);
  const defaultTxId = `${cleanCode}${Date.now().toString(36).toUpperCase()}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 25);
  const baseUrl = String(db?.settings?.baseUrl || (typeof process !== 'undefined' && process.env?.SERVER_BASE_URL) || 'https://reservas.corpflats.com.br').replace(/\/$/, '');
  const paymentUrl = reservationCode ? `${baseUrl}/minha-reserva/${encodeURIComponent(reservationCode)}` : `${baseUrl}/reservar`;

  const createCobFn = context?.runtime?.createInterPixCob || globalThis.createInterPixCob;
  if (typeof createCobFn === 'function') {
    try {
      let res = null;
      if (createCobFn.length >= 3) {
        res = await createCobFn(
          db?.settings?.interConfig,
          defaultTxId,
          valor,
          debtorName || 'Hospede CorpFlats',
          debtorDocument || '',
          description || `Cobranca ${reservationCode || 'CorpFlats'}`
        );
      } else {
        res = await createCobFn({
          amount: valor,
          description,
          debtorName: debtorName || 'Hospede CorpFlats',
          debtorDocument: debtorDocument || '',
          reservationCode: reservationCode || '',
          txid: defaultTxId,
        });
      }
      if (res && res.pixCopiaECola) {
        return {
          txid: res.txid || defaultTxId,
          pixCopiaECola: res.pixCopiaECola,
          chavePix: res.pixCopiaECola,
          paymentUrl,
          valor,
        };
      }
    } catch (err) {
      console.warn('[Sofia PIX Service] Fallback para PIX EMV integrado:', err?.message || err);
    }
  }
  const emvPayload = generateStaticPixPayload({
    pixKey: db?.settings?.interConfig?.pixKey || '47964813000165',
    amount: valor,
    merchantName: 'CORPFLATS LTDA',
    merchantCity: 'CAMPOS DOS GOYTACAZES',
    txid: defaultTxId,
  });
  return {
    txid: defaultTxId,
    pixCopiaECola: emvPayload,
    chavePix: emvPayload,
    paymentUrl,
    valor,
  };
}

export function buildStandardStayDescription(params) {
  const diarias = Math.max(1, diffDays(params.checkinDate, params.checkoutDate));
  const hospedesStr = formatGuestListPtBr(params.guestNames);
  const lines = [
    `Nota relativa à hospedagem de ${hospedesStr}, no Flat ${params.flatNumber}.`,
    `Local: CorpFlats.`,
    `Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ (Soho Residence Service)`,
    `Quantidade de diárias: ${diarias}`,
    `Check-in: ${params.checkinDate}`,
    `Check-out: ${params.checkoutDate}`,
  ];
  if (params.extraNotes && String(params.extraNotes).trim()) {
    lines.push(String(params.extraNotes).trim());
  }
  return lines.join('\n');
}

export function buildConsolidatedPackageStayDescription(params) {
  const items = Array.isArray(params.items) ? params.items : [];
  const lines = [
    `Nota consolidada relativa ao Pacote ${params.packageCode} (${items.length} flats) na CorpFlats.`,
    `Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ (Soho Residence Service)`,
  ];
  items.forEach((r, idx) => {
    const ci = String(r.checkinDate || '').slice(0, 10);
    const co = String(r.checkoutDate || '').slice(0, 10);
    const diarias = Math.max(1, diffDays(ci, co));
    const gArr = Array.isArray(r.guests) ? r.guests : [];
    const gNames = [
      r.guestName && !isPlaceholderGuestName(r.guestName) ? r.guestName : '',
      ...gArr.slice(1).map((g) => (g?.name && !isPlaceholderGuestName(g.name) ? g.name : '')),
    ].filter(Boolean);
    const gStr = gNames.length > 0 ? formatGuestListPtBr(gNames) : 'Hóspede designado';
    lines.push(
      `${idx + 1}. Flat ${r.flatNumber} (${r.code || r.id}): ${ci} a ${co} (${diarias} diária(s)) — ${gStr} — R$ ${Number(r.totalAmount || 0).toFixed(2)}`
    );
  });
  if (params.extraNotes && String(params.extraNotes).trim()) {
    lines.push(String(params.extraNotes).trim());
  }
  return lines.join('\n');
}

function selectFairShareFlatHelper(db, checkinDate, checkoutDate, excludeFlatNumber = null) {
  if (!db) return null;
  if (typeof globalThis.selectFairShareFlat === 'function') {
    try {
      const res = globalThis.selectFairShareFlat(db, checkinDate, checkoutDate);
      if (res?.recommendedFlat && String(res.recommendedFlat.number) !== String(excludeFlatNumber)) {
        return res.recommendedFlat;
      }
      if (Array.isArray(res?.availableFlats)) {
        const alt = res.availableFlats.find((f) => String(f.number) !== String(excludeFlatNumber));
        if (alt) return alt;
      }
    } catch (_) {}
  }

  const activeFlats = (Array.isArray(db.flats) ? db.flats : []).filter(
    (f) => f && f.isActive !== false && String(f.number) !== String(excludeFlatNumber)
  );
  if (activeFlats.length === 0) return null;

  const reservations = Array.isArray(db.reservations) ? db.reservations : [];
  const nowMs = Date.now() + Number(globalThis.__simulatedTimeOffsetMs || 0);
  const available = activeFlats.filter((flat) => {
    const fNum = String(flat.number);
    const hasConflict = reservations.some((r) => {
      if (!r || r.checkoutCompleted) return false;
      const st = String(r.status || '').toLowerCase().trim();
      if (['cancelada', 'cancelado', 'cancelled', 'expirada', 'expired', 'no_show'].includes(st)) return false;
      const holdExp = r.expiresAt || r.holdExpiresAt;
      if ((st === 'pre_reserva' || st === 'pendente' || r.isPreReservation) && holdExp && new Date(holdExp).getTime() < nowMs && r.paymentStatus !== 'pago_total' && r.paymentStatus !== 'pago') return false;
      const sameFlat = String(r.flatNumber) === fNum || String(r.flatId) === String(flat.id);
      if (!sameFlat) return false;
      const rIn = String(r.checkinDate || '').slice(0, 10);
      const rOut = String(r.checkoutDate || '').slice(0, 10);
      return checkinDate < rOut && checkoutDate > rIn;
    });
    return !hasConflict;
  });

  if (available.length === 0) return null;

  const monthPrefix = String(checkinDate || '').slice(0, 7);
  available.sort((a, b) => {
    const countNights = (f) =>
      reservations
        .filter(
          (r) =>
            r &&
            r.status !== 'cancelada' &&
            r.status !== 'cancelled' &&
            String(r.flatNumber) === String(f.number) &&
            String(r.checkinDate || '').startsWith(monthPrefix)
        )
        .reduce(
          (acc, r) =>
            acc + Math.max(1, diffDays(String(r.checkinDate).slice(0, 10), String(r.checkoutDate).slice(0, 10))),
          0
        );
    return countNights(a) - countNights(b);
  });

  return available[0];
}

async function sendReceptionEmailHelper({
  db,
  context,
  reservationId,
  flatNumber,
  guestName,
  subject,
  bodyText,
  bodyHtml,
  trigger,
}) {
  const recipient =
    db?.settings?.receptionEmail ||
    db?.settings?.buildingEmail ||
    (typeof process !== 'undefined' && process.env?.RECEPTION_EMAIL) ||
    'soho@promenade.com.br';

  const html =
    bodyHtml ||
    `<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
      <p>${String(bodyText || '').replace(/\n/g, '<br/>')}</p>
    </div>`;

  const sendFn =
    context?.runtime?.sendReceptionOperationalEmail ||
    context?.runtime?.sendEmailAsync ||
    globalThis.sendReceptionOperationalEmail ||
    globalThis.sendEmailAsync;

  const emailRecord = {
    id: `email_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    to: recipient,
    recipient,
    subject,
    bodyText,
    bodyHtml: html,
    reservationId: reservationId || null,
    flatNumber: String(flatNumber || ''),
    guestName: guestName || 'Hóspede CorpFlats',
    trigger: trigger || 'sofia_reception_operational',
    sentAt: new Date().toISOString(),
  };

  if (db) {
    if (!Array.isArray(db.receptionOperationalEmails)) {
      db.receptionOperationalEmails = [];
    }
    db.receptionOperationalEmails.unshift(emailRecord);
  }

  if (typeof sendFn === 'function') {
    try {
      await sendFn({
        db,
        saveDatabase: context?.runtime?.saveDatabase,
        reservationId,
        recipient,
        subject,
        bodyText,
        bodyHtml: html,
        type: 'email',
        direction: 'outbound',
        metadata: {
          trigger: trigger || 'sofia_reception_operational',
          flatNumber: String(flatNumber || ''),
          guestName: guestName || 'Hóspede CorpFlats',
          receptionEmail: recipient,
        },
      });
    } catch (err) {
      console.warn('[Sofia Reception Email] Aviso ao disparar e-mail para portaria:', err?.message || err);
    }
  }

  return emailRecord;
}

export const consultarDisponibilidadeTool = {
  name: 'consultar_disponibilidade',
  description:
    'Consulta a disponibilidade real de 1 ou múltiplos flats na CorpFlats (inclusive com datas, ocupação e camas independentes por flat no mesmo pacote). ' +
    'Deve ser chamada sempre que um cliente perguntar se há vaga para 1 ou vários flats ou quiser cotar datas.',
  allowedStates: ['COMERCIAL_VENDAS', 'PRE_CHECKIN', 'IN_STAY_CONCIERGE'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      data_checkin: { type: 'STRING', description: 'Data desejada de check-in no formato YYYY-MM-DD.' },
      data_checkout: { type: 'STRING', description: 'Data desejada de check-out no formato YYYY-MM-DD.' },
      quantidade_hospedes: { type: 'NUMBER', description: 'Quantidade de hóspedes (padrão: 1).' },
      quantidade_flats: { type: 'NUMBER', description: 'Quantidade de flats desejados no pacote (padrão: 1).' },
      preferencia_cama: { type: 'STRING', description: 'Preferência opcional de configuração de cama (casal, solteiro, indiferente).' },
      flats: {
        type: 'ARRAY',
        description: 'Lista opcional quando o cliente pedir múltiplos flats com datas, ocupação ou camas diferentes por flat.',
        items: {
          type: 'OBJECT',
          properties: {
            data_checkin: { type: 'STRING' },
            data_checkout: { type: 'STRING' },
            quantidade_hospedes: { type: 'NUMBER' },
            preferencia_cama: { type: 'STRING' },
          },
        },
      },
    },
    required: ['data_checkin', 'data_checkout'],
  },
  async execute(args, context) {
    try {
      const db = context.runtime?.db;
      const extraBedEnabled = Boolean(db?.siteConfig?.extraBedConfig?.enabled);
      const maxGuestsPerFlat = extraBedEnabled ? 3 : 2;
      const requestedFlatsCount = Array.isArray(args.flats) && args.flats.length >= 2
        ? args.flats.length
        : Math.max(1, Number(args.quantidade_flats || 1));

      if (requestedFlatsCount >= 2) {
        const defaultIn = String(args.data_checkin || '').slice(0, 10);
        const defaultOut = String(args.data_checkout || '').slice(0, 10);
        const items = Array.isArray(args.flats) && args.flats.length >= 2
          ? args.flats
          : Array.from({ length: requestedFlatsCount }, (_, i) => {
              const totalPax = Math.max(requestedFlatsCount, Number(args.quantidade_hospedes || requestedFlatsCount));
              const basePax = Math.floor(totalPax / requestedFlatsCount);
              const rem = totalPax % requestedFlatsCount;
              return {
                data_checkin: defaultIn,
                data_checkout: defaultOut,
                quantidade_hospedes: Math.min(maxGuestsPerFlat, basePax + (i < rem ? 1 : 0)),
                preferencia_cama: args.preferencia_cama || 'casal',
              };
            });

        const allFlats = Array.isArray(db?.flats) && db.flats.length > 0
          ? db.flats.filter((f) => f && f.isActive !== false && f.status !== 'maintenance' && f.status !== 'manutencao_bloqueada')
          : [{ number: '113' }, { number: '114' }, { number: '212' }, { number: '905' }];
        const reservations = Array.isArray(db?.reservations) ? db.reservations : [];
        const nowMsMulti = Date.now() + Number(globalThis.__simulatedTimeOffsetMs || 0);
        const bedCfgMulti = db?.siteConfig?.bedConfig || {};
        const twinAllowedMulti = (Array.isArray(bedCfgMulti.twinAllowedFlats) && bedCfgMulti.twinAllowedFlats.length > 0
          ? bedCfgMulti.twinAllowedFlats
          : ['113', '114', '115', '202', '905']
        ).map((n) => String(n));

        const allocatedBatch = [];
        for (let idx = 0; idx < items.length; idx++) {
          const it = items[idx] || {};
          const fIn = String(it.data_checkin || defaultIn).slice(0, 10);
          const fOut = String(it.data_checkout || defaultOut).slice(0, 10);
          const fDiarias = diffDays(fIn, fOut);
          const fPax = Math.max(1, Number(it.quantidade_hospedes || 1));
          if (!fIn || !fOut || fDiarias <= 0) {
            const msg = `Peça ao cliente para confirmar as datas válidas de entrada e saída do Flat ${idx + 1}.`;
            return { status: 'BLOQUEADO_PELA_REGRA', codigo_regra_bloqueio: 'DATAS_INVALIDAS', instrucao_para_ia: msg, instrucao_resposta_ia: msg };
          }
          if (fPax > maxGuestsPerFlat) {
            const msg = `Explique ao cliente que cada flat comporta até ${maxGuestsPerFlat} hóspedes (Flat ${idx + 1} solicitado para ${fPax}). Sugira redistribuir ou acrescentar mais 1 flat ao pacote.`;
            return { status: 'BLOQUEADO_PELA_REGRA', codigo_regra_bloqueio: 'CAPACIDADE_MAXIMA_EXCEDIDA', instrucao_para_ia: msg, instrucao_resposta_ia: msg };
          }
          const wantsTwin = String(it.preferencia_cama || args.preferencia_cama || '').toLowerCase().includes('solteiro');
          if (wantsTwin && bedCfgMulti.allowTwinBeds === false) {
            const msgTwinOff =
              'Informe ao cliente que no momento todos os flats estão configurados com cama Queen de casal (a montagem com 2 camas de solteiro está indisponível). Pergunte se a cama Queen atende.';
            return { status: 'BLOQUEADO_PELA_REGRA', codigo_regra_bloqueio: 'CAMAS_SOLTEIRO_INDISPONIVEIS', instrucao_para_ia: msgTwinOff, instrucao_resposta_ia: msgTwinOff };
          }
          const candidates = allFlats.filter((flat) => {
            const fNum = String(flat.number || flat.id || '');
            if (wantsTwin && !twinAllowedMulti.includes(fNum)) return false;
            if (allocatedBatch.some((prev) => prev.flatNumber === fNum && fIn < prev.checkout && fOut > prev.checkin)) return false;
            const hasConflict = reservations.some((r) => {
              if (!r) return false;
              const st = String(r.status || '').toLowerCase();
              if (['cancelada', 'cancelado', 'cancelled', 'expirada', 'expired', 'no_show'].includes(st)) return false;
              const holdExp = r.expiresAt || r.holdExpiresAt;
              if ((st === 'pre_reserva' || st === 'pendente' || r.isPreReservation) && holdExp && new Date(holdExp).getTime() < nowMsMulti && r.paymentStatus !== 'pago_total' && r.paymentStatus !== 'pago') return false;
              if (String(r.flatNumber || r.flatId || '') !== fNum) return false;
              return fIn < String(r.checkoutDate || '').slice(0, 10) && fOut > String(r.checkinDate || '').slice(0, 10);
            });
            return !hasConflict;
          });
          if (candidates.length === 0) {
            const msg = `Informe com empatia que não há disponibilidade simultânea para o Flat ${idx + 1} no período ${fIn} a ${fOut} (temos ${allocatedBatch.length} flat(s) livres nesse intervalo).`;
            return {
              status: 'BLOQUEADO_PELA_REGRA',
              codigo_regra_bloqueio: 'SEM_DISPONIBILIDADE_MULTI_FLAT',
              dados: { flats_solicitados: items.length, flats_atendidos: allocatedBatch.length },
              instrucao_para_ia: msg,
              instrucao_resposta_ia: msg,
            };
          }
          allocatedBatch.push({
            flatNumber: String(candidates[0].number || candidates[0].id),
            checkin: fIn,
            checkout: fOut,
            hospedes: fPax,
            cama: wantsTwin ? 'solteiro' : 'casal',
          });
        }

        const resumo = allocatedBatch
          .map((a, i) => `Flat ${i + 1} (Unid. ${a.flatNumber}: ${a.checkin} a ${a.checkout}, ${a.hospedes} pax, cama ${a.cama})`)
          .join('; ');
        const msg =
          `Confirme com entusiasmo que temos disponibilidade para os *${allocatedBatch.length} flats* em pacote unificado (pagamento único para o solicitante): ${resumo}. ` +
          `Pergunte se prefere cotar com café da manhã servido no flat ou somente hospedagem para cada unidade.`;
        return {
          status: 'SUCESSO_EXECUTADO',
          dados: { quantidade_flats: allocatedBatch.length, alocacao_sugerida: allocatedBatch },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const checkin = String(args.data_checkin || '').slice(0, 10);
      const checkout = String(args.data_checkout || '').slice(0, 10);
      const hospedes = Math.max(1, Number(args.quantidade_hospedes || 1));
      const diarias = diffDays(checkin, checkout);

      if (!checkin || !checkout || diarias <= 0) {
        const msg =
          'Explique educadamente ao cliente que a data de saída precisa ser posterior à data de entrada e peça para confirmar as datas desejadas de check-in e check-out.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'DATAS_INVALIDAS',
          dados: { data_checkin: checkin, data_checkout: checkout },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      if (hospedes > maxGuestsPerFlat) {
        const flatsSug = Math.ceil(hospedes / maxGuestsPerFlat);
        const msg =
          hospedes === 3 && !extraBedEnabled
            ? 'Explique educadamente ao cliente que o padrão oficial dos nossos flats comporta até 2 hóspedes. Pergunte se ele prefere que você cote um pacote unificado de 2 apartamentos (com 1 único PIX) ou consulte a gerência para verificar exceção.'
            : `Explique ao cliente que cada flat comporta até ${maxGuestsPerFlat} hóspedes com conforto. ` +
              `Para ${hospedes} pessoas, ofereça montar um pacote unificado de *${flatsSug} flats* com pagamento único e pergunte se pode cotar dessa forma.`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: hospedes === 3 && !extraBedEnabled ? 'TERCEIRO_HOSPEDE_REQUER_EXCECAO' : 'CAPACIDADE_MAXIMA_EXCEDIDA',
          dados: { quantidade_solicitada: hospedes, capacidade_maxima_por_flat: maxGuestsPerFlat, flats_sugeridos_pacote: flatsSug },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }
      const nowEffective = new Date(Date.now() + Number(globalThis.__simulatedTimeOffsetMs || 0));
      const nowMs = nowEffective.getTime();
      const brtDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(nowEffective);
      const brtTimeParts = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(nowEffective);
      const brtHhMm = `${String(brtTimeParts.find((p) => p.type === 'hour')?.value || '00').padStart(2, '0')}:${String(brtTimeParts.find((p) => p.type === 'minute')?.value || '00').padStart(2, '0')}`;

      if (extraBedEnabled && hospedes >= 3 && checkin === brtDateStr) {
        const extraCutoffTime = `${String(Number(db?.siteConfig?.extraBedConfig?.cutoffHour) || 12).padStart(2, '0')}:00`;
        if (brtHhMm >= extraCutoffTime) {
          const msg = `Explique educadamente ao cliente que para reservas com check-in hoje após as ${extraCutoffTime}, a lotação é limitada a até 2 hóspedes por flat.`;
          return {
            status: 'BLOQUEADO_PELA_REGRA',
            codigo_regra_bloqueio: 'CORTE_TERCEIRO_HOSPEDE_MESMO_DIA',
            dados: { data_checkin: checkin, horario_corte: extraCutoffTime },
            instrucao_para_ia: msg,
            instrucao_resposta_ia: msg,
          };
        }
      }

      const prefLower = String(args.preferencia_cama || '').trim().toLowerCase();
      const wantsTwin = prefLower.includes('solteiro') || prefLower.includes('twin') || prefLower.includes('duas') || prefLower.includes('separad');
      const bedCfg = db?.siteConfig?.bedConfig || {};
      const twinCutoffTime = String(bedCfg.twinSameDayCutoffTime || '12:00');
      const twinAllowedFlats = (Array.isArray(bedCfg.twinAllowedFlats) && bedCfg.twinAllowedFlats.length > 0
        ? bedCfg.twinAllowedFlats
        : ['113', '114', '115', '202', '905']
      ).map((n) => String(n));
      const twinFeeAmount = Number(bedCfg.twinFeeAmount ?? 30);
      const twinFeeType = bedCfg.twinFeeType || 'per_stay';

      if (wantsTwin) {
        if (bedCfg.allowTwinBeds === false) {
          const msg =
            'Informe ao cliente que no momento todos os flats estão configurados com cama Queen de casal (a montagem com 2 camas de solteiro está indisponível). Pergunte se a cama Queen atende.';
          return {
            status: 'BLOQUEADO_PELA_REGRA',
            codigo_regra_bloqueio: 'CAMAS_SOLTEIRO_INDISPONIVEIS',
            dados: { data_checkin: checkin, data_checkout: checkout },
            instrucao_para_ia: msg,
            instrucao_resposta_ia: msg,
          };
        }
        if (checkin === brtDateStr && brtHhMm >= twinCutoffTime) {
          const msg =
            `Explique educadamente ao cliente que, para reservas com check-in no mesmo dia, a montagem com 2 camas de solteiro precisa ser solicitada até as ${twinCutoffTime} por conta do preparo da governança. ` +
            `Informe que temos disponibilidade imediata com cama Queen de casal para hoje e pergunte se podemos seguir assim.`;
          return {
            status: 'BLOQUEADO_PELA_REGRA',
            codigo_regra_bloqueio: 'CORTE_CAMAS_SOLTEIRO_MESMO_DIA',
            dados: { data_checkin: checkin, horario_corte: twinCutoffTime },
            instrucao_para_ia: msg,
            instrucao_resposta_ia: msg,
          };
        }
      }

      const allFlats = Array.isArray(db?.flats) && db.flats.length > 0
        ? db.flats.filter((f) => f && f.isActive !== false && f.status !== 'maintenance' && f.status !== 'manutencao_bloqueada')
        : [{ number: '113' }, { number: '114' }, { number: '212' }, { number: '905' }];
      const reservations = Array.isArray(db?.reservations) ? db.reservations : [];

      const availableAllFlats = allFlats.filter((flat) => {
        const flatNum = String(flat.number || flat.id || '');
        const hasConflict = reservations.some((r) => {
          if (!r) return false;
          const st = String(r.status || '').toLowerCase();
          if (['cancelada', 'cancelado', 'cancelled', 'expirada', 'expired', 'no_show'].includes(st)) return false;
          const holdExp = r.expiresAt || r.holdExpiresAt;
          if ((st === 'pre_reserva' || st === 'pendente' || r.isPreReservation) && holdExp && new Date(holdExp).getTime() < nowMs && r.paymentStatus !== 'pago_total' && r.paymentStatus !== 'pago') {
            return false;
          }
          if (String(r.flatNumber || r.flatId || '') !== flatNum) return false;
          const rIn = String(r.checkinDate || '').slice(0, 10);
          const rOut = String(r.checkoutDate || '').slice(0, 10);
          return checkin < rOut && checkout > rIn;
        });
        return !hasConflict;
      });

      const availableFlats = wantsTwin
        ? availableAllFlats.filter((f) => twinAllowedFlats.includes(String(f.number || f.id || '')))
        : availableAllFlats;

      if (availableFlats.length === 0) {
        if (wantsTwin && availableAllFlats.length > 0) {
          const msgTwinEsgotado =
            `Informe ao cliente que para o período de ${checkin} a ${checkout} as unidades que comportam 2 camas de solteiro já estão ocupadas, ` +
            `mas temos flats disponíveis com cama Queen de casal. Pergunte se ele deseja cotar na configuração Queen.`;
          return {
            status: 'BLOQUEADO_PELA_REGRA',
            codigo_regra_bloqueio: 'SEM_DISPONIBILIDADE_CAMAS_SOLTEIRO',
            dados: { data_checkin: checkin, data_checkout: checkout, unidades_queen_disponiveis: availableAllFlats.length },
            instrucao_para_ia: msgTwinEsgotado,
            instrucao_resposta_ia: msgTwinEsgotado,
          };
        }
        const msg =
          `Informe ao cliente com empatia que estamos com 100% de ocupação para o período de ${checkin} a ${checkout}. ` +
          `Pergunte se ele possui flexibilidade nas datas ou se deseja deixar o contato na lista de prioridade caso surja desistência.`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_DISPONIBILIDADE_NO_PERIODO',
          dados: { data_checkin: checkin, data_checkout: checkout, unidades_disponiveis: 0 },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const listaFlats = availableFlats.slice(0, 5).map((f) => String(f.number || f.id));
      const notaTwin = wantsTwin && twinFeeAmount > 0
        ? ` Informe que a montagem com 2 camas de solteiro está disponível nessas unidades mediante adicional de R$ ${twinFeeAmount.toFixed(2)} (${twinFeeType === 'per_night' ? 'por diária' : 'por estadia'}).`
        : '';
      const msg =
        `Confirme com entusiasmo que temos disponibilidade para o período de ${checkin} a ${checkout} (${diarias} diária(s)) para ${hospedes} pessoa(s) ` +
        `(Flats disponíveis: ${listaFlats.join(', ')}).${notaTwin} Pergunte se o cliente prefere o plano com café da manhã servido no flat ou o plano somente hospedagem para calcular o orçamento exato (nunca mencione isenção de taxa de limpeza).`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          data_checkin: checkin,
          data_checkout: checkout,
          diarias,
          quantidade_hospedes: hospedes,
          unidades_disponiveis: availableFlats.length,
          flats_sugeridos: listaFlats,
        },
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    } catch (error) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'MEDIA',
        categoria: 'ERRO_SISTEMA_TOOL',
        hospede_nome: context.hospede?.nome || 'Lead Comercial',
        telefone: context.telefone_remetente,
        resumo: `Falha técnica ao executar consultar_disponibilidade: ${error.message}`,
        context,
      });
      const msg =
        'Peça desculpas ao cliente informando que o calendário apresentou uma instabilidade rápida e que a recepção já foi acionada para confirmar a disponibilidade em instantes.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

function resolveAgentLivePricingQuote(db, checkin, checkout, hospedes, preferenciaCama = 'casal') {
  const diarias = Math.max(1, diffDays(checkin, checkout));
  const wbpState = db ? WbpPricingManager.getPricingState(db) : null;
  const wbpSettings = wbpState?.settings || {};
  const tarSettings = db?.tariffSettings || {};
  const siteCfg = db?.siteConfig || {};
  const bedCfg = siteCfg.bedConfig || {};

  const prefNorm = String(preferenciaCama || '').trim().toLowerCase();
  const wantsTwin =
    prefNorm === 'solteiro' ||
    prefNorm.includes('solteiro') ||
    prefNorm.includes('twin') ||
    prefNorm.includes('duas');
  const twinFeeUnit = Number(bedCfg.twinFeeAmount ?? bedCfg.twinPreparationFeeAmount ?? 30);
  const twinFeeType = bedCfg.twinFeeType || bedCfg.twinPreparationFeeType || 'per_stay';
  const twinFee =
    wantsTwin && twinFeeUnit > 0
      ? Number((twinFeeType === 'per_night' ? twinFeeUnit * diarias : twinFeeUnit).toFixed(2))
      : 0.0;

  const valorCafeInternoPorPessoaDia = Number(
    wbpSettings.breakfastSurchargePerGuest ??
    tarSettings.breakfastSurchargePerGuest ??
    siteCfg.pricing?.breakfastSurchargePerGuest ??
    20.0
  );
  const extraBedUnit = Number(
    wbpSettings.extraBedFee ??
    siteCfg.extraBedConfig?.feeAmount ??
    60.0
  );
  const extraBedType = siteCfg.extraBedConfig?.feeType || 'per_stay';
  const adicionalTerceiroHospedeTotal = hospedes >= 3
    ? (extraBedType === 'per_night' ? Number((extraBedUnit * diarias).toFixed(2)) : extraBedUnit)
    : 0.0;

  const roomOnlyPlanCfg = siteCfg.ratePlans?.room_only || {};
  const taxaLimpezaSemCafe = roomOnlyPlanCfg.cleaningFeeEnabled === false
    ? 0.0
    : Number(roomOnlyPlanCfg.cleaningFeeAmount ?? 50.0);

  const cardMarkupPercent = Number(
    siteCfg.pricing?.cardMarkupPercent ??
    tarSettings.cardMarkupPercent ??
    5.0
  );

  const stayDiscounts = tarSettings.stayDiscounts || {
    weeklyPct: 0.1,
    biweeklyPct: 0.15,
    monthlyPct: 0.25,
  };

  let descontoDuracaoPct = 0;
  let faixaDescontoLabel = null;
  if (diarias >= 30) {
    descontoDuracaoPct = Number(stayDiscounts.monthlyPct ?? 0.25);
    faixaDescontoLabel = 'Pacote Mensal (30+ diárias)';
  } else if (diarias >= 15) {
    descontoDuracaoPct = Number(stayDiscounts.biweeklyPct ?? 0.15);
    faixaDescontoLabel = 'Pacote Quinzenal (15+ diárias)';
  } else if (diarias >= 7) {
    descontoDuracaoPct = Number(stayDiscounts.weeklyPct ?? 0.1);
    faixaDescontoLabel = 'Pacote Semanal (7+ diárias)';
  }

  const sebraeCalc = wbpState ? calculateSebraeRate(wbpSettings) : { tarifaMinima: 216.49 };
  const overrides = Array.isArray(db?.tariffOverrides) ? db.tariffOverrides : [];
  const weekendPct = Number(tarSettings.weekendMarkupPct ?? wbpSettings.weekendMarkupPct ?? 0.15);

  const baseNightlyRates = [];
  const startObj = new Date(`${checkin}T12:00:00Z`);
  for (let i = 0; i < diarias; i++) {
    const curObj = new Date(startObj.getTime() + i * 86400000);
    const dStr = curObj.toISOString().slice(0, 10);

    const matchedOverride = overrides.find(
      (o) =>
        o &&
        o.date === dStr &&
        (!o.flatId || String(o.flatId).toLowerCase() === 'all') &&
        (!o.channel || ['all', 'direct', 'whatsapp', 'site'].includes(String(o.channel).toLowerCase()))
    );

    if (matchedOverride && matchedOverride.rate != null) {
      baseNightlyRates.push(Number(Number(matchedOverride.rate).toFixed(2)));
      continue;
    }

    let baseNight = 216.49;
    if (tarSettings.mode === 'manual' && tarSettings.baseDailyRate != null) {
      baseNight = Number(tarSettings.baseDailyRate);
    } else if (wbpState) {
      const mIdx = curObj.getUTCMonth();
      const customSeason = wbpState.seasonalityOverrides?.[mIdx] ?? wbpState.seasonalityOverrides?.[String(mIdx)];
      const factor = typeof customSeason === 'number'
        ? customSeason
        : (customSeason?.factor != null ? Number(customSeason.factor) : (STANDARD_SEBRAE_SEASONALITY_FACTORS[mIdx]?.factor ?? 1.0));
      baseNight = Number((sebraeCalc.tarifaMinima * factor).toFixed(2));
    }

    const dow = curObj.getUTCDay();
    const isWeekend = dow === 5 || dow === 6;
    const withWeekend = isWeekend ? baseNight * (1 + weekendPct) : baseNight;
    baseNightlyRates.push(Number(withWeekend.toFixed(2)));
  }

  const somaBrutaSemCafe = Number(baseNightlyRates.reduce((acc, r) => acc + r, 0).toFixed(2));
  const discountedNightlyRates = baseNightlyRates.map((r) =>
    descontoDuracaoPct > 0 ? Number((r * (1 - descontoDuracaoPct)).toFixed(2)) : r
  );
  const somaHospedagemSemCafe = Number(discountedNightlyRates.reduce((acc, r) => acc + r, 0).toFixed(2));
  const diariaMediaSemCafe = Number((somaHospedagemSemCafe / diarias).toFixed(2));

  const comCafeNightlyRates = discountedNightlyRates.map((r) =>
    Number((r + hospedes * valorCafeInternoPorPessoaDia).toFixed(2))
  );
  const somaHospedagemComCafe = Number(comCafeNightlyRates.reduce((acc, r) => acc + r, 0).toFixed(2));
  const diariaMediaComCafe = Number((somaHospedagemComCafe / diarias).toFixed(2));

  const totalComCafePix = Number((somaHospedagemComCafe + adicionalTerceiroHospedeTotal + twinFee).toFixed(2));
  const totalSemCafePix = Number((somaHospedagemSemCafe + adicionalTerceiroHospedeTotal + taxaLimpezaSemCafe + twinFee).toFixed(2));

  const totalComCafeCartao = computeCardAmountFromPix(totalComCafePix, cardMarkupPercent);
  const totalSemCafeCartao = computeCardAmountFromPix(totalSemCafePix, cardMarkupPercent);

  const economiaDesconto = descontoDuracaoPct > 0
    ? Number((somaBrutaSemCafe - somaHospedagemSemCafe).toFixed(2))
    : 0;

  return {
    diarias,
    wantsTwin,
    twinFee,
    valorCafeInternoPorPessoaDia,
    adicionalTerceiroHospedeTotal,
    taxaLimpezaSemCafe,
    cardMarkupPercent,
    descontoDuracaoPct,
    faixaDescontoLabel,
    economiaDesconto,
    diariaMediaSemCafe,
    diariaMediaComCafe,
    discountedNightlyRates,
    comCafeNightlyRates,
    totalComCafePix,
    totalComCafeCartao,
    descontoPixComCafe: Number((totalComCafeCartao - totalComCafePix).toFixed(2)),
    totalSemCafePix,
    totalSemCafeCartao,
    descontoPixSemCafe: Number((totalSemCafeCartao - totalSemCafePix).toFixed(2)),
  };
}

export const calcularOrcamentoTool = {
  name: 'calcular_orcamento',
  description:
    'Calcula o orçamento oficial completo e detalhado para 1 ou múltiplos flats (suportando datas de check-in/out, ocupação, configuração de cama e café da manhã independentes por flat, consolidando em 1 pagamento único).',
  allowedStates: ['COMERCIAL_VENDAS', 'PRE_CHECKIN', 'IN_STAY_CONCIERGE'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      data_checkin: { type: 'STRING', description: 'Data de check-in no formato YYYY-MM-DD.' },
      data_checkout: { type: 'STRING', description: 'Data de check-out no formato YYYY-MM-DD.' },
      quantidade_hospedes: { type: 'NUMBER', description: 'Quantidade de hóspedes (padrão: 1).' },
      quantidade_flats: { type: 'NUMBER', description: 'Quantidade de flats no pacote (padrão: 1).' },
      incluir_cafe: { type: 'BOOLEAN', description: 'Se deve priorizar o plano com café da manhã servido no quarto.' },
      preferencia_cama: { type: 'STRING', description: 'Preferência opcional de configuração de cama (casal, solteiro, indiferente).' },
      flats: {
        type: 'ARRAY',
        description: 'Configuração opcional por flat quando o pacote tiver 2 ou mais flats.',
        items: {
          type: 'OBJECT',
          properties: {
            data_checkin: { type: 'STRING' },
            data_checkout: { type: 'STRING' },
            quantidade_hospedes: { type: 'NUMBER' },
            incluir_cafe: { type: 'BOOLEAN' },
            preferencia_cama: { type: 'STRING' },
          },
        },
      },
    },
    required: ['data_checkin', 'data_checkout'],
  },
  async execute(args, context) {
    try {
      const db = context.runtime?.db;
      const extraBedEnabled = Boolean(db?.siteConfig?.extraBedConfig?.enabled);
      const maxGuestsPerFlat = extraBedEnabled ? 3 : 2;
      const cardMarkupPct = Number(db?.siteConfig?.pricing?.cardMarkupPercent ?? db?.tariffSettings?.cardMarkupPercent ?? 5.0);
      const requestedFlatsCount = Array.isArray(args.flats) && args.flats.length >= 2
        ? args.flats.length
        : Math.max(1, Number(args.quantidade_flats || 1));

      if (requestedFlatsCount >= 2) {
        const defaultIn = String(args.data_checkin || '').slice(0, 10);
        const defaultOut = String(args.data_checkout || '').slice(0, 10);
        const items = Array.isArray(args.flats) && args.flats.length >= 2
          ? args.flats
          : Array.from({ length: requestedFlatsCount }, (_, i) => {
              const totalPax = Math.max(requestedFlatsCount, Number(args.quantidade_hospedes || requestedFlatsCount));
              const basePax = Math.floor(totalPax / requestedFlatsCount);
              const rem = totalPax % requestedFlatsCount;
              return {
                data_checkin: defaultIn,
                data_checkout: defaultOut,
                quantidade_hospedes: Math.min(maxGuestsPerFlat, basePax + (i < rem ? 1 : 0)),
                incluir_cafe: args.incluir_cafe !== false,
                preferencia_cama: args.preferencia_cama || 'casal',
              };
            });

        let somaEscolhidaPix = 0;
        let somaTodosComCafePix = 0;
        let somaTodosSemCafePix = 0;
        const detalhamento = [];

        for (let idx = 0; idx < items.length; idx++) {
          const it = items[idx] || {};
          const fIn = String(it.data_checkin || defaultIn).slice(0, 10);
          const fOut = String(it.data_checkout || defaultOut).slice(0, 10);
          const fDiarias = diffDays(fIn, fOut);
          const fPax = Math.max(1, Number(it.quantidade_hospedes || 1));
          if (!fIn || !fOut || fDiarias <= 0) {
            const msg = `Peça ao cliente datas válidas de entrada e saída para o Flat ${idx + 1}.`;
            return { status: 'BLOQUEADO_PELA_REGRA', codigo_regra_bloqueio: 'PERIODO_ORCAMENTO_INVALIDO', instrucao_para_ia: msg, instrucao_resposta_ia: msg };
          }
          if (fPax > maxGuestsPerFlat) {
            const msg = `Explique que o Flat ${idx + 1} excede o limite de ${maxGuestsPerFlat} hóspedes por flat e sugira acrescentar mais 1 flat ao pacote.`;
            return { status: 'BLOQUEADO_PELA_REGRA', codigo_regra_bloqueio: 'CAPACIDADE_POR_FLAT_EXCEDIDA', instrucao_para_ia: msg, instrucao_resposta_ia: msg };
          }
          const qItem = resolveAgentLivePricingQuote(db, fIn, fOut, fPax, it.preferencia_cama || args.preferencia_cama);
          const usaCafe = it.incluir_cafe !== undefined ? Boolean(it.incluir_cafe) : args.incluir_cafe !== false;
          const unitPix = usaCafe ? qItem.totalComCafePix : qItem.totalSemCafePix;
          const unitCard = usaCafe ? qItem.totalComCafeCartao : qItem.totalSemCafeCartao;

          somaEscolhidaPix = Number((somaEscolhidaPix + unitPix).toFixed(2));
          somaTodosComCafePix = Number((somaTodosComCafePix + qItem.totalComCafePix).toFixed(2));
          somaTodosSemCafePix = Number((somaTodosSemCafePix + qItem.totalSemCafePix).toFixed(2));

          detalhamento.push({
            flat_ordem: idx + 1,
            data_checkin: fIn,
            data_checkout: fOut,
            diarias: fDiarias,
            quantidade_hospedes: fPax,
            incluir_cafe: usaCafe,
            preferencia_cama: qItem.wantsTwin ? 'solteiro' : 'casal',
            taxa_camas_solteiro: qItem.twinFee,
            valor_pix: unitPix,
            valor_cartao: unitCard,
          });
        }

        const somaEscolhidaCartao = computeCardAmountFromPix(somaEscolhidaPix, cardMarkupPct);

        const linhas = detalhamento
          .map((d) => `• Flat ${d.flat_ordem} (${d.data_checkin} a ${d.data_checkout}, ${d.diarias} diária(s), ${d.quantidade_hospedes} pax, ${d.incluir_cafe ? 'Com Café' : 'Sem Café'}, ${d.preferencia_cama === 'solteiro' ? '2 Solteiros' : 'Casal'}): R$ ${d.valor_pix.toFixed(2)} no PIX`)
          .join('\n');
        const msg =
          `Apresente com clareza o orçamento do *Pacote com ${detalhamento.length} Flats (Pagamento Único)*:\n${linhas}\n` +
          `💎 *Total Consolidado no PIX (com desconto): R$ ${somaEscolhidaPix.toFixed(2)}* | Cartão: R$ ${somaEscolhidaCartao.toFixed(2)}.\n` +
          `Destaque que o solicitante paga 1 única vez e pode informar o Hóspede 1 e 2 de cada flat já agora ou depois pelo link único pós-pagamento. Pergunte se podemos gerar a pré-reserva unificada.`;

        return {
          status: 'SUCESSO_EXECUTADO',
          dados: {
            quantidade_flats: detalhamento.length,
            flats: detalhamento,
            valor_total_pacote_pix: somaEscolhidaPix,
            valor_total_pacote_cartao: somaEscolhidaCartao,
            todos_com_cafe_pix: somaTodosComCafePix,
            todos_sem_cafe_pix: somaTodosSemCafePix,
            moeda: 'BRL',
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const checkin = String(args.data_checkin || '').slice(0, 10);
      const checkout = String(args.data_checkout || '').slice(0, 10);
      const hospedes = Math.max(1, Number(args.quantidade_hospedes || 1));
      const diarias = diffDays(checkin, checkout);

      if (!checkin || !checkout || diarias <= 0) {
        const msg =
          'Explique ao cliente que para calcular o orçamento exato precisamos das datas válidas de entrada e saída (com saída posterior à entrada).';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'PERIODO_ORCAMENTO_INVALIDO',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      if (hospedes > maxGuestsPerFlat) {
        const flatsSug = Math.ceil(hospedes / maxGuestsPerFlat);
        const msg =
          hospedes === 3 && !extraBedEnabled
            ? 'Explique educadamente ao cliente que o padrão oficial dos nossos flats comporta até 2 hóspedes. Pergunte se ele prefere cotar um pacote de 2 apartamentos (pagamento único) ou se deseja que você acione a gerência para avaliar uma exceção.'
            : `Explique ao cliente que nossos flats comportam até ${maxGuestsPerFlat} hóspedes por unidade e sugira cotar um pacote unificado de *${flatsSug} flats* com pagamento único.`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: hospedes === 3 && !extraBedEnabled ? 'TERCEIRO_HOSPEDE_REQUER_EXCECAO' : 'CAPACIDADE_POR_FLAT_EXCEDIDA',
          dados: { flats_sugeridos_pacote: flatsSug },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }
      const q = resolveAgentLivePricingQuote(db, checkin, checkout, hospedes, args.preferencia_cama);

      const textoDesconto =
        q.descontoDuracaoPct > 0
          ? `\n🎁 *Desconto Especial Aplicado (${q.faixaDescontoLabel} - ${Math.round(q.descontoDuracaoPct * 100)}% OFF na hospedagem):* Economia de R$ ${q.economiaDesconto.toFixed(2)} já calculada nos valores!`
          : '';

      const textoExtra3 =
        q.adicionalTerceiroHospedeTotal > 0
          ? ` (já inclui colchonete extra para 3º hóspede: R$ ${q.adicionalTerceiroHospedeTotal.toFixed(2)})`
          : '';
      const textoTwin =
        q.wantsTwin && q.twinFee > 0
          ? ` (já inclui R$ ${q.twinFee.toFixed(2)} da montagem de 2 camas de solteiro)`
          : '';

      const msg =
        `Apresente ao cliente com clareza as duas opções oficiais para ${diarias} diária(s) (${checkin} a ${checkout}) para ${hospedes} pessoa(s)${textoExtra3}${textoTwin}:\n` +
        `1) *Plano com Café da Manhã Incluso no Flat (Recomendado):* Diária média de R$ ${q.diariaMediaComCafe.toFixed(2)} -> *No PIX (com desconto): R$ ${q.totalComCafePix.toFixed(2)}* | Cartão: R$ ${q.totalComCafeCartao.toFixed(2)}.\n` +
        `2) *Plano Somente Hospedagem (Sem Café):* Diária média de R$ ${q.diariaMediaSemCafe.toFixed(2)}${q.taxaLimpezaSemCafe > 0 ? ` + R$ ${q.taxaLimpezaSemCafe.toFixed(2)} taxa única de limpeza` : ''} -> *No PIX (com desconto): R$ ${q.totalSemCafePix.toFixed(2)}* | Cartão: R$ ${q.totalSemCafeCartao.toFixed(2)}.${textoDesconto}\n` +
        `REGRAS DE APRESENTAÇÃO OBRIGATÓRIAS: NUNCA mencione valor unitário de café separado e NUNCA use expressões como "isento de taxa de limpeza", "sem taxa de limpeza" ou "acréscimo no cartão" — apresente o valor do Cartão como preço padrão e o valor do PIX como preço com Desconto no PIX. Pergunte qual opção ele prefere para já gerar a reserva.`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          data_checkin: checkin,
          data_checkout: checkout,
          diarias,
          quantidade_hospedes: hospedes,
          preferencia_cama: q.wantsTwin ? 'solteiro' : 'casal',
          taxa_camas_solteiro: q.twinFee,
          desconto_duracao_pct: Math.round(q.descontoDuracaoPct * 100),
          faixa_desconto: q.faixaDescontoLabel,
          valor_desconto_aplicado: q.economiaDesconto,
          opcao_com_cafe: {
            diaria: q.diariaMediaComCafe,
            taxa_limpeza: 0,
            taxa_camas_solteiro: q.twinFee,
            valor_total: q.totalComCafePix,
            valor_pix: q.totalComCafePix,
            valor_cartao: q.totalComCafeCartao,
            desconto_pix: q.descontoPixComCafe,
          },
          opcao_sem_cafe: {
            diaria: q.diariaMediaSemCafe,
            taxa_limpeza: q.taxaLimpezaSemCafe,
            taxa_camas_solteiro: q.twinFee,
            valor_total: q.totalSemCafePix,
            valor_pix: q.totalSemCafePix,
            valor_cartao: q.totalSemCafeCartao,
            desconto_pix: q.descontoPixSemCafe,
          },
          moeda: 'BRL',
        },
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    } catch (error) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'MEDIA',
        categoria: 'ERRO_SISTEMA_TOOL',
        hospede_nome: context.hospede?.nome || 'Lead Comercial',
        telefone: context.telefone_remetente,
        resumo: `Falha técnica ao executar calcular_orcamento: ${error.message}`,
        context,
      });
      const msg =
        'Peça desculpas ao cliente informando que houve uma oscilação ao calcular a tarifa e que a recepção já enviará o orçamento completo em instantes.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

export const gerarLinkReservaTool = {
  name: 'gerar_link_reserva',
  description:
    'Gera a pré-reserva de 1 ou múltiplos flats (pacote unificado com 1 único PIX e link único de pagamento para o Solicitante, ' +
    'permitindo datas, café, cama, veículo e Hóspede 1 e 2 independentes por flat ou marcados para "informar depois"). ' +
    'Exige duas etapas: passe confirmacao_hospede=FALSE para simular e confirmar os dados com o cliente, e TRUE após o de acordo dele.',
  allowedStates: ['COMERCIAL_VENDAS', 'PRE_CHECKIN'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      data_checkin: { type: 'STRING', description: 'Data principal de entrada no formato YYYY-MM-DD.' },
      data_checkout: { type: 'STRING', description: 'Data principal de saída no formato YYYY-MM-DD.' },
      nome_hospede: {
        type: 'STRING',
        description:
          'Nome completo do hóspede titular (quando 1 flat para si) ou do solicitante caso ele também se hospede no Flat 1.',
      },
      reserva_para_terceiro: {
        type: 'BOOLEAN',
        description:
          'Passe TRUE quando quem está conversando no WhatsApp (empresa, agência, secretária ou terceiro) NÃO vai se hospedar.',
      },
      nome_solicitante: {
        type: 'STRING',
        description: 'Nome do solicitante único responsável pelo pacote ou reserva para terceiro.',
      },
      email_solicitante: {
        type: 'STRING',
        description: 'E-mail opcional do solicitante ou empresa para envio simultâneo da confirmação e link de dados do hóspede.',
      },
      documento_solicitante: {
        type: 'STRING',
        description: 'CPF ou CNPJ opcional do solicitante (permite emissão posterior de 1 NFS-e única).',
      },
      quantidade_hospedes: { type: 'NUMBER', description: 'Quantidade de hóspedes (padrão: 1).' },
      quantidade_flats: { type: 'NUMBER', description: 'Quantidade de flats no pacote com pagamento único (padrão: 1).' },
      incluir_cafe: { type: 'BOOLEAN', description: 'TRUE para plano com café da manhã incluso, FALSE para somente hospedagem.' },
      preferencia_cama: { type: 'STRING', description: 'Preferência opcional de configuração de cama (casal, solteiro, indiferente).' },
      flats: {
        type: 'ARRAY',
        description: 'Configuração individual de cada flat quando o pacote tiver 2 ou mais flats.',
        items: {
          type: 'OBJECT',
          properties: {
            data_checkin: { type: 'STRING' },
            data_checkout: { type: 'STRING' },
            quantidade_hospedes: { type: 'NUMBER' },
            incluir_cafe: { type: 'BOOLEAN' },
            preferencia_cama: { type: 'STRING' },
            solicitante_hospeda_aqui: { type: 'BOOLEAN' },
            informar_hospedes_depois: { type: 'BOOLEAN' },
            nome_hospede_1: { type: 'STRING' },
            telefone_hospede_1: { type: 'STRING' },
            nome_hospede_2: { type: 'STRING' },
            telefone_hospede_2: { type: 'STRING' },
            placa_veiculo: { type: 'STRING' },
            modelo_veiculo: { type: 'STRING' },
          },
        },
      },
      confirmacao_hospede: {
        type: 'BOOLEAN',
        description:
          'Passe FALSE na primeira chamada para apresentar o resumo final e valor ao cliente. ' +
          'Passe TRUE somente após o cliente confirmar que deseja gerar a reserva/PIX.',
      },
    },
    required: ['data_checkin', 'data_checkout', 'confirmacao_hospede'],
  },
  async execute(args, context) {
    try {
      const db = context.runtime?.db;
      const extraBedEnabled = Boolean(db?.siteConfig?.extraBedConfig?.enabled);
      const maxGuestsPerFlat = extraBedEnabled ? 3 : 2;
      const cardMarkupPct = Number(db?.siteConfig?.pricing?.cardMarkupPercent ?? db?.tariffSettings?.cardMarkupPercent ?? 5.0);
      const requestedFlatsCount = Array.isArray(args.flats) && args.flats.length >= 2
        ? args.flats.length
        : Math.max(1, Number(args.quantidade_flats || 1));

      if (requestedFlatsCount >= 2) {
        const defaultIn = String(args.data_checkin || '').slice(0, 10);
        const defaultOut = String(args.data_checkout || '').slice(0, 10);
        const solNome = String(args.nome_solicitante || args.nome_hospede || context.hospede?.nome || '').trim();
        const solEmail = String(args.email_solicitante || '').trim().toLowerCase();
        const solDoc = String(args.documento_solicitante || '').trim();
        const senderPhone = String(context.telefone_remetente || '').trim();

        const rawItems = Array.isArray(args.flats) && args.flats.length >= 2
          ? args.flats
          : Array.from({ length: requestedFlatsCount }, (_, i) => {
              const totalPax = Math.max(requestedFlatsCount, Number(args.quantidade_hospedes || requestedFlatsCount));
              const basePax = Math.floor(totalPax / requestedFlatsCount);
              const rem = totalPax % requestedFlatsCount;
              return {
                data_checkin: defaultIn,
                data_checkout: defaultOut,
                quantidade_hospedes: Math.min(maxGuestsPerFlat, basePax + (i < rem ? 1 : 0)),
                incluir_cafe: args.incluir_cafe !== false,
                preferencia_cama: args.preferencia_cama || 'casal',
                solicitante_hospeda_aqui: i === 0 && !args.reserva_para_terceiro,
                informar_hospedes_depois: i > 0 || Boolean(args.reserva_para_terceiro),
              };
            });

        let pacotePixTotal = 0;
        const normalizedPackageFlats = [];
        const resumoLinhas = [];

        for (let idx = 0; idx < rawItems.length; idx++) {
          const it = rawItems[idx] || {};
          const fIn = String(it.data_checkin || defaultIn).slice(0, 10);
          const fOut = String(it.data_checkout || defaultOut).slice(0, 10);
          const fDiarias = diffDays(fIn, fOut);
          const fPax = Math.max(1, Number(it.quantidade_hospedes || 1));
          if (!fIn || !fOut || fDiarias <= 0) {
            const msg = `Peça ao cliente datas válidas de entrada e saída para o Flat ${idx + 1}.`;
            return { status: 'BLOQUEADO_PELA_REGRA', codigo_regra_bloqueio: 'DATAS_INVALIDAS', instrucao_para_ia: msg, instrucao_resposta_ia: msg };
          }
          if (fPax > maxGuestsPerFlat) {
            const msg = `Explique ao cliente que o Flat ${idx + 1} excede o limite de ${maxGuestsPerFlat} hóspedes por unidade.`;
            return { status: 'BLOQUEADO_PELA_REGRA', codigo_regra_bloqueio: 'CAPACIDADE_POR_FLAT_EXCEDIDA', instrucao_para_ia: msg, instrucao_resposta_ia: msg };
          }
          const qItem = resolveAgentLivePricingQuote(db, fIn, fOut, fPax, it.preferencia_cama || args.preferencia_cama);
          const fCafe = it.incluir_cafe !== undefined ? Boolean(it.incluir_cafe) : args.incluir_cafe !== false;
          const fTwin = qItem.wantsTwin;
          const unitPix = fCafe ? qItem.totalComCafePix : qItem.totalSemCafePix;
          pacotePixTotal = Number((pacotePixTotal + unitPix).toFixed(2));

          const solAqui = idx === 0 && Boolean(it.solicitante_hospeda_aqui ?? (!args.reserva_para_terceiro && !it.nome_hospede_1 && !it.informar_hospedes_depois));
          const informarDepois = Boolean(it.informar_hospedes_depois || (!solAqui && !it.nome_hospede_1));

          const itemCharges = [];
          if (!fCafe && qItem.taxaLimpezaSemCafe > 0) {
            itemCharges.push({ type: 'cleaning', title: 'Taxa de Limpeza', amount: qItem.taxaLimpezaSemCafe });
          }
          if (fTwin && qItem.twinFee > 0) {
            itemCharges.push({ type: 'twin_beds', title: 'Montagem 2 Camas de Solteiro', amount: qItem.twinFee });
          }

          normalizedPackageFlats.push({
            checkinDate: fIn,
            checkoutDate: fOut,
            guestCount: fPax,
            includeBreakfast: fCafe,
            twinBeds: fTwin,
            requesterIsGuest1: solAqui,
            informGuestsLater: informarDepois,
            guestName: solAqui ? solNome : (it.nome_hospede_1 || ''),
            guestPhone: solAqui ? senderPhone : (it.telefone_hospede_1 || ''),
            guest2Name: it.nome_hospede_2 || '',
            guest2Phone: it.telefone_hospede_2 || '',
            guest2InformLater: fPax >= 2 && !it.nome_hospede_2,
            vehiclePlate: it.placa_veiculo || '',
            vehicleModel: it.modelo_veiculo || '',
            dailyRate: fCafe ? qItem.diariaMediaComCafe : qItem.diariaMediaSemCafe,
            cleaningFee: fCafe ? 0 : qItem.taxaLimpezaSemCafe,
            twinFee: qItem.twinFee,
            charges: itemCharges,
            totalAmount: unitPix,
          });

          const descHosp = solAqui
            ? `Solicitante (${solNome || 'a confirmar'})`
            : informarDepois
              ? 'Hóspedes a informar após pagamento'
              : `${it.nome_hospede_1}${fPax >= 2 ? ` + ${it.nome_hospede_2 || 'Hóspede 2 a informar'}` : ''}`;

          resumoLinhas.push(
            `• Flat ${idx + 1}: ${fIn} a ${fOut} (${fDiarias} diária(s)), ${fPax} pax, ${fCafe ? 'Com Café' : 'Sem Café'}, ${fTwin ? '2 Solteiros' : 'Casal'} — ${descHosp} (R$ ${unitPix.toFixed(2)})`
          );
        }

        const pacoteCartaoTotal = computeCardAmountFromPix(pacotePixTotal, cardMarkupPct);

        if (!args.confirmacao_hospede || !solNome) {
          const faltaNomeTxt = !solNome
            ? 'Peça apenas o *nome completo do solicitante* responsável pelo pacote para gerar o bloqueio unificado.'
            : `Pergunte se *${solNome}* confirma o bloqueio dos ${normalizedPackageFlats.length} flats por 30 minutos com 1 único PIX.`;
          const msg =
            `Apresente o resumo completo da pré-reserva de *${normalizedPackageFlats.length} Flats com Pagamento Único*:\n` +
            `${resumoLinhas.join('\n')}\n` +
            `💎 *Valor Único no PIX (com desconto): R$ ${pacotePixTotal.toFixed(2)}* (ou R$ ${pacoteCartaoTotal.toFixed(2)} no Cartão).\n` +
            `${faltaNomeTxt}`;
          return {
            status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
            dados: {
              is_pacote_multi_flat: true,
              quantidade_flats: normalizedPackageFlats.length,
              flats: normalizedPackageFlats,
              valor_total_pix: pacotePixTotal,
              valor_total_cartao: pacoteCartaoTotal,
              nome_solicitante: solNome || null,
            },
            instrucao_para_ia: msg,
            instrucao_resposta_ia: msg,
          };
        }

        const baseUrlPkg =
          db?.settings?.baseUrl ||
          (typeof process !== 'undefined' && (process.env?.APP_BASE_URL || process.env?.SERVER_BASE_URL)) ||
          'https://corpflats.com.br';

        let sum = null;
        let pkgCode = '';
        if (typeof globalThis.createSofiaMultiFlatPreReservation === 'function') {
          const createdPkg = await globalThis.createSofiaMultiFlatPreReservation({
            packageFlats: normalizedPackageFlats,
            requesterType: normalizedPackageFlats[0]?.requesterIsGuest1 ? 'guest' : 'other_person',
            requesterName: solNome,
            requesterPhone: senderPhone,
            requesterEmail: solEmail,
            requesterDocument: solDoc,
            channel: 'whatsapp',
            paymentMethod: 'pix',
            status: 'pre_reserva',
            holdDurationMinutes: 30,
            baseUrl: baseUrlPkg,
            sendWhatsapp: false,
            suppressExternalSend: Boolean(context.runtime?.suppressExternalSend),
          });
          const stampIso = new Date().toISOString();
          if (Array.isArray(createdPkg?.reservations)) {
            for (const r of createdPkg.reservations) {
              r._needsOfficialPreResDispatch = false;
              r._preReservationRulerSentAt = stampIso;
              r.packagePreResDispatchedAt = stampIso;
            }
          }
          pkgCode = createdPkg.packageCode;
          sum = createdPkg.summary;
        } else if (db) {
          if (!Array.isArray(db.reservations)) db.reservations = [];
          pkgCode = generatePackageCode(db);
          const allFlats = Array.isArray(db.flats) && db.flats.length > 0
            ? db.flats.filter((f) => f && f.isActive !== false && f.status !== 'maintenance' && f.status !== 'manutencao_bloqueada')
            : [{ id: 1, number: '113' }, { id: 2, number: '114' }, { id: 3, number: '212' }];
          let nextId = db.reservations.length > 0 ? Math.max(...db.reservations.map((r) => Number(r.id) || 0)) + 1 : 1;
          const nowMsPkg = Date.now() + Number(globalThis.__simulatedTimeOffsetMs || 0);
          const nowIsoPkg = new Date(nowMsPkg).toISOString();
          const expIsoPkg = new Date(nowMsPkg + 30 * 60000).toISOString();
          const existingReservations = Array.isArray(db.reservations) ? db.reservations : [];
          const twinAllowedPkg = (Array.isArray(db?.siteConfig?.bedConfig?.twinAllowedFlats) && db.siteConfig.bedConfig.twinAllowedFlats.length > 0
            ? db.siteConfig.bedConfig.twinAllowedFlats
            : ['113', '114', '115', '202', '905']
          ).map((n) => String(n));
          const used = [];
          for (let idx = 0; idx < normalizedPackageFlats.length; idx++) {
            const nf = normalizedPackageFlats[idx];
            const candidate = allFlats.find((fl) => {
              const fNum = String(fl.number || fl.id || '');
              if (nf.twinBeds && twinAllowedPkg.length > 0 && !twinAllowedPkg.includes(fNum) && allFlats.some((x) => twinAllowedPkg.includes(String(x.number || x.id)))) {
                return false;
              }
              if (used.some((u) => String(u.flatNumber) === fNum && nf.checkinDate < u.checkoutDate && nf.checkoutDate > u.checkinDate)) {
                return false;
              }
              const conflictInDb = existingReservations.some((r) => {
                if (!r) return false;
                const st = String(r.status || '').toLowerCase();
                if (['cancelada', 'cancelado', 'cancelled', 'expirada', 'expired', 'no_show'].includes(st)) return false;
                const holdExp = r.expiresAt || r.holdExpiresAt;
                if ((st === 'pre_reserva' || st === 'pendente' || r.isPreReservation) && holdExp && new Date(holdExp).getTime() < nowMsPkg && r.paymentStatus !== 'pago_total' && r.paymentStatus !== 'pago') return false;
                if (String(r.flatNumber || r.flatId || '') !== fNum && String(r.flatId || '') !== String(fl.id || '')) return false;
                const rIn = String(r.checkinDate || '').slice(0, 10);
                const rOut = String(r.checkoutDate || '').slice(0, 10);
                return nf.checkinDate < rOut && nf.checkoutDate > rIn;
              });
              return !conflictInDb;
            });
            if (!candidate) {
              const msg = `Informe ao cliente que não há flats livres suficientes no período ${nf.checkinDate} a ${nf.checkoutDate}.`;
              return { status: 'BLOQUEADO_PELA_REGRA', codigo_regra_bloqueio: 'SEM_DISPONIBILIDADE_MULTI_FLAT', instrucao_para_ia: msg, instrucao_resposta_ia: msg };
            }
            const rId = nextId++;
            const rCode = `CF-${candidate.number}-${String(rId).padStart(4, '0')}`;
            const gArr = [
              { index: 1, isMain: true, name: nf.informGuestsLater ? '' : nf.guestName, phone: nf.guestPhone || '', informLater: nf.informGuestsLater },
              ...(nf.guestCount >= 2 ? [{ index: 2, isMain: false, name: nf.guest2Name || '', phone: nf.guest2Phone || '', informLater: nf.guest2InformLater }] : []),
            ];
            const rec = {
              id: rId,
              code: rCode,
              reservationCode: rCode,
              packageId: pkgCode,
              packageCode: pkgCode,
              isPackageReservation: true,
              packageIndex: idx + 1,
              packageTotalFlats: normalizedPackageFlats.length,
              isPackagePrimary: idx === 0,
              requesterIsGuest1: nf.requesterIsGuest1,
              informGuestsLater: nf.informGuestsLater,
              guest2InformLater: nf.guest2InformLater,
              hideFinancialForGuest: !nf.requesterIsGuest1,
              nfHideFromGuest: !nf.requesterIsGuest1,
              flatId: candidate.id || candidate.number,
              flatNumber: String(candidate.number || candidate.id),
              guestName: nf.informGuestsLater ? 'A Definir (Aguardando Solicitante)' : nf.guestName,
              guestPending: nf.informGuestsLater,
              guestPhone: nf.guestPhone || '',
              guestCount: nf.guestCount,
              adults: nf.guestCount,
              guests: gArr,
              requesterType: nf.requesterIsGuest1 ? 'guest' : 'other_person',
              requesterName: solNome,
              requesterPhone: senderPhone,
              requesterEmail: solEmail,
              requesterInfo: { type: 'other_person', name: solNome, phone: senderPhone, whatsapp: senderPhone, email: solEmail, cpf: solDoc },
              checkinDate: nf.checkinDate,
              checkoutDate: nf.checkoutDate,
              status: 'pre_reserva',
              paymentStatus: 'pendente',
              paymentMethod: 'pix',
              channel: 'whatsapp',
              includeBreakfast: nf.includeBreakfast,
              twinBeds: nf.twinBeds,
              bedType: nf.twinBeds ? 'twin' : 'queen',
              dailyRate: nf.dailyRate,
              cleaningFee: nf.cleaningFee,
              charges: nf.charges || [],
              totalAmount: nf.totalAmount,
              cardTotalAmount: computeCardAmountFromPix(nf.totalAmount, cardMarkupPct),
              paidAmount: 0,
              expiresAt: expIsoPkg,
              holdDurationMinutes: 30,
              holdDurationLabel: '30 minutos',
              _needsOfficialPreResDispatch: false,
              _preReservationRulerSentAt: nowIsoPkg,
              packagePreResDispatchedAt: nowIsoPkg,
              ...(nf.vehiclePlate ? { vehicle: { plate: nf.vehiclePlate.toUpperCase(), model: nf.vehicleModel || '' } } : {}),
              createdAt: nowIsoPkg,
              updatedAt: nowIsoPkg,
            };
            used.push(rec);
            db.reservations.unshift(rec);
          }
          sum = await syncPackagePixAndPaymentLinks(db, pkgCode, {
            baseUrl: baseUrlPkg,
            createInterPixCob: globalThis.createInterPixCob,
            generateStaticPixPayload,
            computeCardAmountFromPix,
            saveDatabase: context.runtime?.saveDatabase,
          });
        }

        const msg =
          `Confirme com entusiasmo que o pacote *${pkgCode}* com *${sum.activeFlatsCount} flats* (${sum.items.map((x) => `Flat ${x.flatNumber}`).join(', ')}) foi bloqueado por 30 minutos para *${solNome}*!\n` +
          `Informe o valor único de *R$ ${sum.pendingAmount.toFixed(2)} no PIX* (ou R$ ${sum.cardPendingAmount.toFixed(2)} no Cartão), o código PIX único (\`${sum.pixCopiaECola}\`) e o painel unificado (${sum.packagePortalUrl}). ` +
          `Avise que após o pagamento único ele receberá 1 recibo do pacote todo (com opção de 1 NFS-e única CPF/CNPJ) e 1 link único para cadastrar/revisar o Hóspede 1 e 2 de cada flat, e cada hóspede receberá apenas as instruções do seu flat sem ver valores.`;
        return {
          status: 'SUCESSO_EXECUTADO',
          dados: {
            is_pacote_multi_flat: true,
            codigo_pacote: pkgCode,
            quantidade_flats: sum.activeFlatsCount,
            flats_alocados: sum.items.map((x) => x.flatNumber),
            valor_total: sum.pendingAmount,
            valor_cartao: sum.cardPendingAmount,
            chave_pix: sum.pixCopiaECola,
            link_pacote: sum.packagePortalUrl,
            link_credenciamento_pos_pagamento: sum.batchCredentialUrl,
            validade_bloqueio_minutos: 30,
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const checkin = String(args.data_checkin || '').slice(0, 10);
      const checkout = String(args.data_checkout || '').slice(0, 10);
      const diarias = diffDays(checkin, checkout);
      const hospedes = Math.max(1, Number(args.quantidade_hospedes || 1));
      const comCafe = args.incluir_cafe !== false;
      const paraTerceiro = Boolean(args.reserva_para_terceiro);
      const rawNomeHospede = String(args.nome_hospede || (!paraTerceiro ? context.hospede?.nome || '' : '')).trim();
      const nomeSolicitante = String(args.nome_solicitante || (paraTerceiro ? context.hospede?.nome || '' : '')).trim();
      const emailSolicitante = String(args.email_solicitante || '').trim().toLowerCase();
      const hospedePendente = paraTerceiro && !rawNomeHospede;
      const nomeTitular = hospedePendente ? 'A Definir (Aguardando Solicitante)' : rawNomeHospede;
      const nomePagador = rawNomeHospede || nomeSolicitante || 'Solicitante CorpFlats';

      if (!checkin || !checkout || diarias <= 0) {
        const msg =
          'Peça ao cliente para confirmar as datas de entrada e saída (formato dia/mês) para gerar o link da reserva.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'DATAS_INVALIDAS',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      if (hospedes > maxGuestsPerFlat) {
        const flatsSug = Math.ceil(hospedes / maxGuestsPerFlat);
        const msg =
          hospedes === 3 && !extraBedEnabled
            ? 'Explique educadamente ao cliente que o padrão oficial dos nossos flats comporta até 2 hóspedes, e pergunte se deseja gerar um pacote de 2 apartamentos (com 1 único PIX) ou consultar a gerência para exceção.'
            : `Explique ao cliente que cada flat comporta até ${maxGuestsPerFlat} hóspedes e ofereça gerar um pacote unificado de *${flatsSug} flats* com pagamento único.`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: hospedes === 3 && !extraBedEnabled ? 'TERCEIRO_HOSPEDE_REQUER_EXCECAO' : 'CAPACIDADE_POR_FLAT_EXCEDIDA',
          dados: { flats_sugeridos_pacote: flatsSug },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }
      const q = resolveAgentLivePricingQuote(db, checkin, checkout, hospedes, args.preferencia_cama);
      const valorTotal = comCafe ? q.totalComCafePix : q.totalSemCafePix;
      const valorCartaoSimulado = comCafe ? q.totalComCafeCartao : q.totalSemCafeCartao;

      const faltaIdentificacaoObrigatoria = paraTerceiro ? !nomeSolicitante : !rawNomeHospede;
      if (!args.confirmacao_hospede || faltaIdentificacaoObrigatoria) {
        let orientacaoIdentificacao = '';
        if (paraTerceiro) {
          orientacaoIdentificacao = !nomeSolicitante
            ? 'Como a reserva é para outra pessoa/empresa, peça apenas o *nome do solicitante (ou empresa)* para vincular à pré-reserva — explique que os dados do hóspede são opcionais agora e poderão ser preenchidos depois pelo link seguro enviado após a confirmação.'
            : rawNomeHospede
              ? `Confirme se podemos gerar a pré-reserva solicitada por *${nomeSolicitante}* para o hóspede *${rawNomeHospede}*.`
              : `Confirme se podemos gerar a pré-reserva em nome do solicitante *${nomeSolicitante}* (os dados do hóspede poderão ser preenchidos depois pelo link seguro que enviaremos após a confirmação).`;
        } else {
          orientacaoIdentificacao = !rawNomeHospede
            ? 'Peça também o *nome completo* do titular para vincular à pré-reserva (ou informe que, se estiver reservando para outra pessoa/empresa, basta informar o nome do solicitante e preencher o hóspede depois via link).'
            : `Confirme se a reserva pode ser emitida em nome de *${rawNomeHospede}*.`;
        }

        const msg =
          `Informe ao cliente o resumo para bloqueio da pré-reserva: período de ${checkin} a ${checkout} (${diarias} diária(s)), ` +
          `total de hóspedes: *${hospedes}* (${hospedes === 1 ? '1 pessoa' : `${hospedes} pessoas`}), canal da reserva: *WhatsApp*, ` +
          `plano ${comCafe ? 'COM café da manhã incluso no flat' : 'Somente Hospedagem'}${q.wantsTwin ? ' (2 camas de solteiro)' : ''}, ` +
          `no valor de *R$ ${valorTotal.toFixed(2)} no PIX (com desconto)* (ou R$ ${valorCartaoSimulado.toFixed(2)} no Cartão). ${orientacaoIdentificacao}`;
        return {
          status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
          dados: {
            data_checkin: checkin,
            data_checkout: checkout,
            diarias,
            quantidade_hospedes: hospedes,
            canal_reserva: 'WhatsApp',
            incluir_cafe: comCafe,
            preferencia_cama: q.wantsTwin ? 'solteiro' : 'casal',
            taxa_camas_solteiro: q.twinFee,
            valor_total: valorTotal,
            valor_cartao: valorCartaoSimulado,
            reserva_para_terceiro: paraTerceiro,
            nome_solicitante: nomeSolicitante || null,
            nome_hospede: rawNomeHospede || null,
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const baseUrl =
        db?.settings?.baseUrl ||
        (typeof process !== 'undefined' && (process.env?.APP_BASE_URL || process.env?.SERVER_BASE_URL)) ||
        'https://corpflats.com.br';

      // Se o cliente enviou dados de veículo no WhatsApp antes da criação da reserva, vincula automaticamente agora
      let veiculoVinculado = null;
      if (typeof globalThis.consumePendingVehicleForPhone === 'function') {
        veiculoVinculado = globalThis.consumePendingVehicleForPhone(db, context.telefone_remetente);
      }
      if (!veiculoVinculado && context.runtime?.conversation?.pendingVehicle?.plate) {
        veiculoVinculado = { ...context.runtime.conversation.pendingVehicle };
        delete context.runtime.conversation.pendingVehicle;
      }

      const nowMsHold = Date.now() + Number(globalThis.__simulatedTimeOffsetMs || 0);
      const nowIso = new Date(nowMsHold).toISOString();
      const holdMinutes = 30;
      const expiresAt = new Date(nowMsHold + holdMinutes * 60 * 1000).toISOString();
      const reminderLeadMinutes = 10;
      const reminderAt = new Date(nowMsHold + (holdMinutes - reminderLeadMinutes) * 60 * 1000).toISOString();

      let codigoPreReserva = `CF-${Math.floor(100000 + Math.random() * 900000)}`;
      let selectedFlat = { id: 1, number: '101' };

      if (db) {
        const allFlats = Array.isArray(db.flats) && db.flats.length > 0
          ? db.flats.filter((f) => f && f.isActive !== false && f.status !== 'maintenance' && f.status !== 'manutencao_bloqueada')
          : [{ id: 1, number: '113' }];
        const twinAllowedSingle = (Array.isArray(db?.siteConfig?.bedConfig?.twinAllowedFlats) && db.siteConfig.bedConfig.twinAllowedFlats.length > 0
          ? db.siteConfig.bedConfig.twinAllowedFlats
          : ['113', '114', '115', '202', '905']
        ).map((n) => String(n));
        const reservations = Array.isArray(db.reservations) ? db.reservations : [];
        const availableFlats = allFlats.filter((flat) => {
          const flatNum = String(flat.number || flat.id || '');
          if (q.wantsTwin && !twinAllowedSingle.includes(flatNum) && allFlats.some((x) => twinAllowedSingle.includes(String(x.number || x.id)))) {
            return false;
          }
          const hasConflict = reservations.some((r) => {
            if (!r) return false;
            const st = String(r.status || '').toLowerCase();
            if (['cancelada', 'cancelado', 'cancelled', 'expirada', 'expired', 'completed', 'checked_out', 'finalizada', 'concluida', 'checkout', 'no_show'].includes(st)) return false;
            const holdExp = r.expiresAt || r.holdExpiresAt;
            if ((st === 'pre_reserva' || st === 'pendente' || r.isPreReservation) && holdExp && new Date(holdExp).getTime() < nowMsHold && r.paymentStatus !== 'pago_total' && r.paymentStatus !== 'pago') return false;
            if (String(r.flatNumber || r.flatId || '') !== flatNum && String(r.flatId || '') !== String(flat.id || '')) return false;
            const rIn = String(r.checkinDate || '').slice(0, 10);
            const rOut = String(r.checkoutDate || '').slice(0, 10);
            return checkin < rOut && checkout > rIn;
          });
          return !hasConflict;
        });
        if (availableFlats.length > 0) {
          selectedFlat = availableFlats[0];
        } else if (allFlats.length > 0) {
          selectedFlat = allFlats[0];
        }
      }

      const cleanTxId = codigoPreReserva.replace(/[^a-zA-Z0-9]/g, '').substring(0, 25);
      let chavePix = generateStaticPixPayload({
        pixKey: db?.settings?.interConfig?.pixKey || '47964813000165',
        amount: valorTotal,
        merchantName: 'CORPFLATS LTDA',
        merchantCity: 'CAMPOS DOS GOYTACAZES',
        txid: cleanTxId,
      });
      let resolvedPixTxId = cleanTxId;

      if (typeof globalThis.createInterPixCob === 'function') {
        try {
          const cobDesc = `Reserva ${codigoPreReserva} - Flat ${selectedFlat.number || selectedFlat.id}`;
          const docSolSingle = String(args.documento_solicitante || '').trim();
          const interCob = globalThis.createInterPixCob.length >= 3
            ? await globalThis.createInterPixCob(
                db?.settings?.interConfig,
                cleanTxId,
                valorTotal,
                nomePagador,
                docSolSingle,
                cobDesc
              )
            : await globalThis.createInterPixCob({
                amount: valorTotal,
                description: cobDesc,
                debtorName: nomePagador,
                debtorDocument: docSolSingle,
                reservationCode: codigoPreReserva,
              });
          if (interCob && interCob.pixCopiaECola) {
            chavePix = interCob.pixCopiaECola;
            resolvedPixTxId = interCob.txid || cleanTxId;
          }
        } catch (interErr) {
          console.warn(`[gerar_link_reserva] Fallback para PIX estático (${codigoPreReserva}):`, interErr.message);
        }
      }

      const linkPagamento = `${baseUrl}/minha-reserva/${encodeURIComponent(codigoPreReserva)}`;
      const cardTotalAmount = valorCartaoSimulado;
      const cleaningFee = comCafe ? 0 : q.taxaLimpezaSemCafe;
      const netRoomTotal = Math.max(0, valorTotal - cleaningFee - q.adicionalTerceiroHospedeTotal - q.twinFee);
      const dailyRate = Math.round((netRoomTotal / diarias) * 100) / 100;
      const inD = new Date(`${checkin}T12:00:00Z`);
      const nightlyArr = comCafe ? q.comCafeNightlyRates : q.discountedNightlyRates;
      const dailyRates = Array.from({ length: diarias }, (_, i) => {
        const dStr = new Date(inD.getTime() + i * 86400000).toISOString().slice(0, 10);
        return { date: dStr, rate: nightlyArr[i] ?? dailyRate, channel: 'whatsapp' };
      });

      if (db) {
        if (!Array.isArray(db.reservations)) db.reservations = [];
        if (!Array.isArray(db.guests)) db.guests = [];
        if (!Array.isArray(db.preReservations)) db.preReservations = [];

        const cleanPhone = normalizePhoneDigits(context.telefone_remetente);
        let guestRecord = null;
        if (!paraTerceiro) {
          const existingByPhone = db.guests.find((g) => cleanPhone && phonesMatch(g.phone || '', cleanPhone));
          const existingByPhoneName = String(existingByPhone?.fullName || existingByPhone?.name || '').trim();
          const isPhoneOwnedByDifferentRequester = Boolean(
            existingByPhone &&
            existingByPhoneName &&
            nomeTitular &&
            existingByPhoneName.toLowerCase() !== nomeTitular.toLowerCase() &&
            !existingByPhoneName.toLowerCase().includes(nomeTitular.toLowerCase().split(/\s+/)[0]) &&
            !nomeTitular.toLowerCase().includes(existingByPhoneName.toLowerCase().split(/\s+/)[0])
          );
          if (isPhoneOwnedByDifferentRequester) {
            guestRecord = db.guests.find(
              (g) => g && g.name && String(g.name).trim().toLowerCase() === nomeTitular.toLowerCase()
            ) || null;
            if (!guestRecord) {
              const nextGuestId = db.guests.length > 0 ? Math.max(...db.guests.map((g) => Number(g.id) || 0)) + 1 : 1;
              guestRecord = {
                id: nextGuestId,
                name: nomeTitular,
                fullName: nomeTitular,
                phone: '',
                email: '',
                document: '',
                cpf: '',
                notes: '',
                totalStays: 1,
                lastStay: checkin,
                createdAt: nowIso,
              };
              db.guests.push(guestRecord);
            } else {
              guestRecord.lastStay = checkin;
            }
          } else {
            guestRecord = existingByPhone || null;
            if (!guestRecord) {
              const nextGuestId = db.guests.length > 0 ? Math.max(...db.guests.map((g) => Number(g.id) || 0)) + 1 : 1;
              guestRecord = {
                id: nextGuestId,
                name: nomeTitular,
                fullName: nomeTitular,
                phone: cleanPhone,
                email: '',
                document: '',
                cpf: '',
                notes: '',
                totalStays: 1,
                lastStay: checkin,
                createdAt: nowIso,
              };
              db.guests.push(guestRecord);
            } else if (nomeTitular) {
              guestRecord.name = nomeTitular;
              if (!guestRecord.fullName) guestRecord.fullName = nomeTitular;
              guestRecord.lastStay = checkin;
            }
          }
        } else if (!hospedePendente && rawNomeHospede) {
          guestRecord = db.guests.find(
            (g) => g && g.name && String(g.name).trim().toLowerCase() === rawNomeHospede.toLowerCase()
          );
          if (!guestRecord) {
            const nextGuestId = db.guests.length > 0 ? Math.max(...db.guests.map((g) => Number(g.id) || 0)) + 1 : 1;
            guestRecord = {
              id: nextGuestId,
              name: rawNomeHospede,
              phone: '',
              email: '',
              document: '',
              cpf: '',
              notes: '',
              totalStays: 1,
              lastStay: checkin,
              createdAt: nowIso,
            };
            db.guests.push(guestRecord);
          } else {
            guestRecord.lastStay = checkin;
          }
        }

        const nextResId = db.reservations.length > 0
          ? Math.max(...db.reservations.map((r) => Number(r.id) || 0)) + 1
          : 1;
        const charges = [];
        if (cleaningFee > 0) {
          charges.push({
            id: `charge_cleaning_${nextResId}`,
            type: 'cleaning',
            title: 'Taxa de Limpeza',
            amount: cleaningFee,
          });
        }
        if (q.twinFee > 0) {
          charges.push({
            id: `charge_twin_${nextResId}`,
            type: 'twin_beds',
            title: 'Preparação 2 Camas de Solteiro',
            amount: q.twinFee,
          });
        }

        const preparedGuests = Array.from({ length: hospedes }, (_, idx) => ({
          index: idx + 1,
          guestId: idx === 0 && guestRecord ? guestRecord.id : null,
          name: idx === 0 ? (hospedePendente ? '' : nomeTitular) : `Hóspede ${idx + 1}`,
          cpf: '',
          phone: idx === 0 && !paraTerceiro ? cleanPhone : '',
          email: '',
          hasCompletedCheckin: false,
          checkinCompletedAt: null,
        }));

        const newReservation = {
          id: nextResId,
          code: codigoPreReserva,
          reservationCode: codigoPreReserva,
          flatId: selectedFlat.id || selectedFlat.number,
          flatNumber: String(selectedFlat.number || selectedFlat.id),
          guestId: guestRecord ? guestRecord.id : null,
          guestName: nomeTitular,
          guestPending: hospedePendente,
          guestPhone: paraTerceiro ? '' : cleanPhone,
          phone: cleanPhone,
          guestEmail: '',
          guestDocument: '',
          guestCpf: '',
          hideFinancialForGuest: paraTerceiro,
          requesterType: paraTerceiro ? 'other_person' : 'guest',
          ...(paraTerceiro
            ? {
                requesterName: nomeSolicitante,
                requesterPhone: context.telefone_remetente,
                requesterEmail: emailSolicitante,
                requesterInfo: {
                  type: 'other_person',
                  name: nomeSolicitante,
                  phone: context.telefone_remetente,
                  whatsapp: context.telefone_remetente,
                  email: emailSolicitante,
                },
                credentialStatus: hospedePendente ? 'pending_agency' : 'completed',
              }
            : {}),
          checkinDate: checkin,
          checkoutDate: checkout,
          checkinTime: '14:00',
          checkoutTime: '12:00',
          status: 'pre_reserva',
          paymentStatus: 'pendente',
          paymentMethod: 'pix',
          channel: 'whatsapp',
          source: 'whatsapp',
          ratePlan: comCafe ? 'with_breakfast' : 'room_only',
          includeBreakfast: comCafe,
          breakfastIncluded: comCafe,
          twinBeds: Boolean(q.wantsTwin),
          bedType: q.wantsTwin ? 'twin' : 'queen',
          guestsCount: hospedes,
          guestCount: hospedes,
          numGuests: hospedes,
          adults: hospedes,
          children: 0,
          guests: preparedGuests,
          totalAmount: valorTotal,
          cardTotalAmount,
          dailyRate,
          dailyRates,
          cleaningFee,
          charges,
          paidAmount: 0,
          payments: [],
          expiresAt,
          holdPreset: `${holdMinutes}m`,
          holdDurationMinutes: holdMinutes,
          holdDurationLabel: `${holdMinutes} minutos`,
          sendExpirationReminder: true,
          reminderLeadMinutes,
          reminderLeadLabel: `${reminderLeadMinutes} minutos antes`,
          reminderAt,
          pixCopiaECola: chavePix,
          pixTxId: resolvedPixTxId,
          pixChargedAmount: valorTotal,
          _needsOfficialPreResDispatch: false,
          _preReservationRulerSentAt: nowIso,
          ...(veiculoVinculado?.plate ? {
            vehicle: { ...veiculoVinculado, updatedAt: nowIso },
            vehiclePlate: veiculoVinculado.plate,
            vehicleModel: veiculoVinculado.model || '',
            vehicleColor: veiculoVinculado.color || '',
          } : {}),
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        db.reservations.unshift(newReservation);

        db.preReservations.push({
          id: nextResId,
          code: codigoPreReserva,
          flatId: newReservation.flatId,
          flatNumber: newReservation.flatNumber,
          guestName: nomeTitular,
          guestPhone: paraTerceiro ? '' : context.telefone_remetente,
          requesterName: paraTerceiro ? nomeSolicitante : '',
          requesterPhone: paraTerceiro ? context.telefone_remetente : '',
          checkinDate: checkin,
          checkoutDate: checkout,
          guests: hospedes,
          withBreakfast: comCafe,
          totalAmount: valorTotal,
          cardTotalAmount,
          pixCopiaECola: chavePix,
          pixTxId: resolvedPixTxId,
          vehicle: veiculoVinculado || null,
          status: 'pending_payment',
          expiresAt,
          reminderAt,
          createdAt: nowIso,
        });

        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }

        if (typeof triggerImmediateWhatsApp === 'function' && !context.runtime?.suppressExternalSend) {
          try {
            await triggerImmediateWhatsApp(
              db,
              context.runtime?.saveDatabase || null,
              'pre_reservation_created',
              newReservation,
              baseUrl
            );
          } catch (trigErr) {
            console.warn(`[gerar_link_reserva] Aviso ao acionar régua pre_reservation_created (${codigoPreReserva}):`, trigErr.message);
          }
        }
      }

      const infoVeiculo = veiculoVinculado?.plate
        ? ` Informe também que o veículo placa *${veiculoVinculado.plate}* informado anteriormente já foi vinculado automaticamente à reserva.`
        : '';
      const destinatarioResumo = paraTerceiro
        ? (rawNomeHospede
            ? `solicitada por *${nomeSolicitante}* para o hóspede *${rawNomeHospede}*`
            : `em nome do solicitante *${nomeSolicitante}* (hóspede a definir após confirmação)`)
        : `para *${nomeTitular}*`;
      const notaCredenciamento = hospedePendente
        ? ' Avise também que, assim que o pagamento for confirmado, enviaremos automaticamente o link seguro de credenciamento para preencher os dados do hóspede antes do check-in.'
        : '';
      const msg =
        `Confirme com entusiasmo que a pré-reserva *${codigoPreReserva}* (Flat ${selectedFlat.number || selectedFlat.id}) foi bloqueada por 30 minutos ${destinatarioResumo} (${checkin} a ${checkout}), ` +
        `incluindo obrigatoriamente no resumo o *Total de Hóspedes: ${hospedes}* e o *Canal da Reserva: WhatsApp*, ` +
        `no valor de *R$ ${valorTotal.toFixed(2)}* no PIX (ou *R$ ${cardTotalAmount.toFixed(2)}* no Cartão de Crédito). ` +
        `A mensagem oficial da reserva com botões interativos, código PIX Copia e Cola (\`${chavePix}\`) e link de pagamento por Cartão (${linkPagamento}) já foi enviada.${notaCredenciamento}${infoVeiculo}`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          codigo_pre_reserva: codigoPreReserva,
          flat_number: String(selectedFlat.number || selectedFlat.id),
          nome_hospede: nomeTitular,
          reserva_para_terceiro: paraTerceiro,
          nome_solicitante: paraTerceiro ? nomeSolicitante : null,
          hospede_pendente: hospedePendente,
          data_checkin: checkin,
          data_checkout: checkout,
          quantidade_hospedes: hospedes,
          canal_reserva: 'WhatsApp',
          valor_total: valorTotal,
          valor_cartao: cardTotalAmount,
          link_reserva: linkPagamento,
          chave_pix: chavePix,
          veiculo_vinculado: veiculoVinculado || null,
          validade_bloqueio_minutos: 30,
        },
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    } catch (error) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'MEDIA',
        categoria: 'ERRO_SISTEMA_TOOL',
        hospede_nome: args.nome_hospede || args.nome_solicitante || context.hospede?.nome || 'Lead Comercial',
        telefone: context.telefone_remetente,
        resumo: `Falha técnica ao executar gerar_link_reserva: ${error.message}`,
        context,
      });
      const msg =
        'Peça desculpas ao cliente informando que houve uma oscilação ao gerar o link de pagamento, mas que a recepção já foi notificada para enviar o PIX manualmente em instantes.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

export const consultarDetalhesReservaTool = {
  name: 'consultar_detalhes_reserva',
  description:
    'Consulta os detalhes completos da reserva ativa, futura ou recém-concluída vinculada ao hóspede (imóvel/flat, datas de check-in e check-out, ' +
    'status de pagamento, rede/senha de Wi-Fi, link de pré-check-in digital e link do comprovante/recibo).',
  allowedStates: ['PRE_CHECKIN', 'IN_STAY_CONCIERGE', 'POS_CHECKOUT'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      codigo_reserva: {
        type: 'STRING',
        description: 'Código opcional da reserva caso o hóspede mencione outro código específico.',
      },
    },
    required: [],
  },
  async execute(_args, context) {
    try {
      const reserva = context.reserva_ativa || context.reserva_atual;
      if (!reserva) {
        const msg =
          'Explique educadamente que você não localizou uma reserva ativa vinculada a este telefone e peça o código da reserva ou CPF do titular.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const db = context.runtime?.db;
      const baseUrl = String(
        db?.settings?.baseUrl ||
        (typeof process !== 'undefined' && (process.env?.APP_BASE_URL || process.env?.SERVER_BASE_URL)) ||
        'https://corpflats.com.br'
      ).replace(/\/+$/, '');

      const targetRes = Array.isArray(db?.reservations)
        ? db.reservations.find((r) => matchesSessionReservation(r, reserva))
        : null;
      const privacyEval = targetRes
        ? evaluateReservationFinancialPrivacy(targetRes, context.telefone_remetente)
        : null;
      const ocultarFinanceiro = Boolean(
        reserva.ocultar_financeiro === true || privacyEval?.ocultarFinanceiro
      );

      const isPreResUnpaid =
        reserva.status_reserva === 'PRE_RESERVA' ||
        reserva.status_pagamento === 'PENDENTE' ||
        (targetRes && String(targetRes.status || '').toLowerCase() === 'pre_reserva' && !isReservationSettledInPackage(targetRes));

      const guestIdx = Number(reserva.indice_hospede) > 1
        ? Number(reserva.indice_hospede)
        : (privacyEval?.isCompanionSender ? privacyEval.matchedCompanionGuestNumber : 1);
      const guestQuery = guestIdx > 1 ? `?guest=${guestIdx}` : '';
      const linkPreCheckin = isPreResUnpaid
        ? null
        : (reserva.link_pre_checkin || `${baseUrl}/pre-checkin/${reserva.id}${guestQuery}`);
      const linkPortalHospede = reserva.link_portal_hospede || `${baseUrl}/minha-reserva/${reserva.id}${guestQuery}`;
      const linkCafe = (!isPreResUnpaid && reserva.cafe_incluso !== false) ? `${baseUrl}/minha-reserva/${reserva.id}/cafe` : null;
      const qtdHospedes = Number(reserva.quantidade_hospedes || 1);
      const canalLabel = reserva.canal_reserva_nome || formatReservationChannelLabel(reserva.canal_reserva || 'whatsapp');

      // CENÁRIO 1: Privacidade Financeira ativa (Hóspede não-solicitante ou Acompanhante)
      if (ocultarFinanceiro) {
        const msgPriv = isPreResUnpaid
          ? `Apresente ao hóspede o resumo operacional da reserva *${reserva.id}* no *${reserva.nome_imovel}*: ` +
            `Check-in em ${reserva.data_checkin}, Check-out em ${reserva.data_checkout}, Total de Hóspedes: *${qtdHospedes}*, Canal: *${canalLabel}*. ` +
            `Informe que a reserva está em processo de confirmação junto ao Solicitante responsável (NUNCA mencione valores, PIX, saldo ou comprovante de pagamento).`
          : `Apresente ao hóspede o resumo operacional da sua estadia *${reserva.id}* no *${reserva.nome_imovel}* (SEM mencionar qualquer valor financeiro, diária, status de pagamento ou recibo, pois pertencem exclusivamente ao Solicitante): ` +
            `Check-in em ${reserva.data_checkin}, Check-out em ${reserva.data_checkout}, Total de Hóspedes: *${qtdHospedes}*, Canal: *${canalLabel}*, ` +
            `Wi-Fi rede "${reserva.wifi_rede}" (senha: "${reserva.wifi_senha}")` +
            (linkPreCheckin ? `, Link de Pré-Check-in Digital: ${linkPreCheckin}` : '') +
            `, Portal exclusivo de instruções do flat: ${linkPortalHospede}.`;

        return {
          status: 'SUCESSO_EXECUTADO',
          dados: {
            reserva_id: reserva.id,
            nome_imovel: reserva.nome_imovel,
            data_checkin: reserva.data_checkin,
            data_checkout: reserva.data_checkout,
            ocultar_financeiro: true,
            quantidade_hospedes: qtdHospedes,
            canal_reserva: canalLabel,
            wifi_rede: isPreResUnpaid ? null : reserva.wifi_rede,
            wifi_senha: isPreResUnpaid ? null : reserva.wifi_senha,
            link_pre_checkin: linkPreCheckin,
            link_portal_hospede: linkPortalHospede,
            link_agendamento_cafe: linkCafe,
          },
          instrucao_para_ia: msgPriv,
          instrucao_resposta_ia: msgPriv,
        };
      }

      // CENÁRIO 2: Solicitante de Pacote Multi-Flat
      const pkgCtx =
        reserva.pacote_multi_flat ||
        (targetRes && (targetRes.packageId || targetRes.packageCode) && db
          ? (() => {
              const s = computePackageSummary(db, targetRes.packageId || targetRes.packageCode, {
                baseUrl,
                computeCardAmountFromPix,
              });
              if (!s) return null;
              return {
                packageCode: s.packageCode,
                package_code: s.packageCode,
                codigo_pacote: s.packageCode,
                quantidade_flats_ativos: s.activeFlatsCount,
                totalAmount: s.totalAmount,
                paidAmount: s.paidAmount,
                pendingAmount: s.pendingAmount,
                valor_total_pacote: s.totalAmount,
                valor_pago_pacote: s.paidAmount,
                valor_pendente_pacote: s.pendingAmount,
                chave_pix_unica: s.pixCopiaECola || null,
                packagePortalUrl: s.packagePortalUrl,
                batchCredentialUrl: s.batchCredentialUrl,
                link_pacote: s.packagePortalUrl,
                link_credenciamento: s.batchCredentialUrl,
                flats: s.items.filter((it) => it.isActive).map((it) => ({
                  codigo_reserva: it.code,
                  flat: it.flatNumber,
                  data_checkin: it.checkinDate,
                  data_checkout: it.checkoutDate,
                  quantidade_hospedes: it.guestCount,
                  hospede_titular: it.informGuestsLater ? 'A informar após pagamento' : it.guestName,
                  valor_flat: it.totalAmount,
                })),
              };
            })()
          : null);

      if (pkgCtx) {
        const flatsTxt = (pkgCtx.flats || [])
          .map((f) => `Flat ${f.flat} (${f.data_checkin} a ${f.data_checkout}, ${f.hospede_titular}, R$ ${Number(f.valor_flat || 0).toFixed(2)})`)
          .join('; ');
        const isPkgPaid = Number(pkgCtx.pendingAmount ?? pkgCtx.valor_pendente_pacote ?? 0) <= 0.01;
        const msgPkg = !isPkgPaid
          ? `Apresente ao solicitante o resumo consolidado do pacote *${pkgCtx.packageCode || pkgCtx.codigo_pacote}* (${pkgCtx.quantidade_flats_ativos} flats: ${flatsTxt}), ` +
            `com valor pendente unificado de *R$ ${Number(pkgCtx.pendingAmount ?? pkgCtx.valor_pendente_pacote ?? 0).toFixed(2)}* no PIX, ` +
            `painel único de pagamento (${pkgCtx.link_pacote}) e link único de cadastro dos hóspedes (${pkgCtx.link_credenciamento}).`
          : `Apresente ao solicitante o resumo consolidado do pacote confirmado *${pkgCtx.packageCode || pkgCtx.codigo_pacote}* (${pkgCtx.quantidade_flats_ativos} flats: ${flatsTxt}), ` +
            `valor total pago de *R$ ${Number(pkgCtx.totalAmount ?? pkgCtx.valor_total_pacote ?? 0).toFixed(2)}*, ` +
            `painel do recibo único / 1 NFS-e consolidada (${pkgCtx.link_pacote}) e link único de cadastro/revisão do Hóspede 1 e 2 de cada flat (${pkgCtx.link_credenciamento}).`;

        return {
          status: 'SUCESSO_EXECUTADO',
          dados: {
            reserva_id: reserva.id,
            codigo_pacote: pkgCtx.packageCode || pkgCtx.codigo_pacote,
            nome_imovel: reserva.nome_imovel,
            data_checkin: reserva.data_checkin,
            data_checkout: reserva.data_checkout,
            status_pagamento: isPkgPaid ? 'PAGO_INTEGRALMENTE' : 'PENDENTE',
            valor_total: Number(pkgCtx.totalAmount ?? pkgCtx.valor_total_pacote ?? 0),
            quantidade_hospedes: qtdHospedes,
            canal_reserva: canalLabel,
            wifi_rede: !isPkgPaid ? null : reserva.wifi_rede,
            wifi_senha: !isPkgPaid ? null : reserva.wifi_senha,
            link_pre_checkin: linkPreCheckin,
            link_comprovante_pagamento: pkgCtx.link_pacote,
            link_credenciamento_hospedes: pkgCtx.link_credenciamento,
            pacote_multi_flat: pkgCtx,
          },
          instrucao_para_ia: msgPkg,
          instrucao_resposta_ia: msgPkg,
        };
      }

      // CENÁRIO 3: Reserva Individual com Acesso Financeiro Permitido
      const linkPortalReserva = reserva.link_comprovante_pagamento || `${baseUrl}/minha-reserva/${reserva.id}`;
      const msg = isPreResUnpaid
        ? `Apresente ao cliente o resumo completo da pré-reserva *${reserva.id}* no *${reserva.nome_imovel}*, informando obrigatoriamente: ` +
          `Check-in em ${reserva.data_checkin}, Check-out em ${reserva.data_checkout}, ` +
          `Total de Hóspedes: *${qtdHospedes}*, Canal da Reserva: *${canalLabel}*, ` +
          `Status: Pré-Reserva aguardando confirmação do pagamento. ` +
          `Informe o link do Portal da Reserva para pagamento (${linkPortalReserva}) e explique que o pré-check-in digital e o agendamento do café da manhã serão liberados assim que o pagamento for confirmado.`
        : `Apresente ao hóspede com clareza o resumo completo da reserva *${reserva.id}* no *${reserva.nome_imovel}*, informando obrigatoriamente: ` +
          `Check-in em ${reserva.data_checkin}, Check-out em ${reserva.data_checkout}, ` +
          `Total de Hóspedes: *${qtdHospedes}*, Canal da Reserva: *${canalLabel}*, ` +
          `Status de pagamento: ${reserva.status_pagamento || 'PAGO_INTEGRALMENTE'}, Wi-Fi rede "${reserva.wifi_rede}" (senha: "${reserva.wifi_senha}"), ` +
          `Link oficial para Pré-Check-in Digital (FNRH, foto do documento e assinatura): ${linkPreCheckin}, ` +
          `Link do Portal do Hóspede / Comprovante de Pagamento (Recibo): ${linkPortalReserva}.`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          reserva_id: reserva.id,
          nome_imovel: reserva.nome_imovel,
          data_checkin: reserva.data_checkin,
          data_checkout: reserva.data_checkout,
          status_pagamento: reserva.status_pagamento || (isPreResUnpaid ? 'PENDENTE' : 'PAGO_INTEGRALMENTE'),
          valor_diaria: reserva.valor_diaria ?? Number(targetRes?.dailyRate || 237),
          valor_total: reserva.valor_total ?? Number(targetRes?.totalAmount || 0),
          quantidade_hospedes: qtdHospedes,
          canal_reserva: canalLabel,
          wifi_rede: isPreResUnpaid ? null : reserva.wifi_rede,
          wifi_senha: isPreResUnpaid ? null : reserva.wifi_senha,
          link_pre_checkin: linkPreCheckin,
          link_comprovante_pagamento: linkPortalReserva,
          link_agendamento_cafe: linkCafe,
        },
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    } catch (error) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'BAIXA',
        categoria: 'ERRO_SISTEMA_TOOL',
        hospede_nome: context.hospede?.nome || 'Hóspede',
        telefone: context.telefone_remetente,
        resumo: `Falha técnica ao executar consultar_detalhes_reserva: ${error.message}`,
        context,
      });
      const msg =
        'Peça desculpas ao hóspede informando uma instabilidade momentânea ao carregar os detalhes da reserva e avise que a recepção já verificará.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

export const atualizarDadosHospedeTool = {
  name: 'atualizar_dados_hospede',
  description:
    'Atualiza os dados cadastrais e operacionais do hóspede ou lead (CPF/CNPJ, e-mail, telefone/WhatsApp de hóspede em pacote ou reserva individual, horário previsto de chegada, ' +
    'placa/marca/modelo/cor do veículo para garagem e nomes de acompanhantes). Quando o e-mail é atualizado, valida o endereço e reenvia os e-mails pendentes recentes. ' +
    'Quando o Solicitante informar ou corrigir o telefone WhatsApp de um hóspede (especialmente após alertas_telefone_hospede_invalido), valida na Z-API, atualiza o cadastro, ' +
    'reenvia as instruções individuais sem valores e agenda os lembretes da estadia. ' +
    'Caso o cliente envie os dados do veículo antes de ter reserva criada, grava vinculado ao WhatsApp dele para anexar automaticamente assim que a reserva for criada. Para FNRH e documento, envia sempre o link /pre-checkin/:code.',
  allowedStates: ['COMERCIAL_VENDAS', 'PRE_CHECKIN', 'IN_STAY_CONCIERGE', 'POS_CHECKOUT'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      cpf_cnpj: { type: 'STRING', description: 'CPF ou CNPJ informado pelo hóspede.' },
      email: {
        type: 'STRING',
        description:
          'Endereço de e-mail correto informado ou confirmado pelo hóspede (se ele confirmar a sugestão em alerta_email_incorreto.email_sugerido dizendo "sim", passe esse e-mail sugerido; se ele repetir ou disser que o próprio e-mail atual já está correto / "é esse mesmo", passe o e-mail atual aqui ou use confirmar_email_atual: true).',
      },
      confirmar_email_atual: {
        type: 'BOOLEAN',
        description:
          'Passe TRUE quando houver alerta_email_incorreto ativo e o hóspede responder que o e-mail já cadastrado na reserva está correto ("esse mesmo", "está certo", "já recebi o e-mail"), mesmo sem redigitar o endereço.',
      },
      telefone_hospede: {
        type: 'STRING',
        description:
          'Novo número de WhatsApp (com DDD) do hóspede informado pelo Solicitante para correção ou cadastro (ex: "22999887766").',
      },
      codigo_reserva_alvo: {
        type: 'STRING',
        description:
          'Código da reserva ou número do flat alvo quando o Solicitante gerencia vários flats (ex: "RES-512-0302" ou "512").',
      },
      nome_hospede_alvo: {
        type: 'STRING',
        description:
          'Nome do hóspede cujo telefone/dados devem ser atualizados quando houver mais de um hóspede no pacote/reserva.',
      },
      indice_hospede_alvo: {
        type: 'INTEGER',
        description: 'Índice do hóspede na reserva (1, 2 ou 3) quando especificado.',
      },
      horario_previsto_chegada: { type: 'STRING', description: 'Horário previsto de chegada para o check-in no formato HH:MM.' },
      placa_veiculo: { type: 'STRING', description: 'Placa do veículo caso o hóspede vá utilizar a garagem (ex: ABC1D23).' },
      marca_veiculo: { type: 'STRING', description: 'Marca do veículo (ex: Toyota, Honda, VW).' },
      modelo_veiculo: { type: 'STRING', description: 'Modelo do veículo (ex: Corolla, Civic, Nivus).' },
      cor_veiculo: { type: 'STRING', description: 'Cor do veículo (ex: Prata, Preto, Branco).' },
      nomes_acompanhantes: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description: 'Lista com os nomes completos de acompanhantes informados na conversa.',
      },
    },
    required: [],
  },
  async execute(args, context) {
    try {
      const reserva = context.reserva_ativa || context.reserva_atual;
      const db = context.runtime?.db;
      const camposAtualizados = [];

      const normTextSimple = (s) =>
        String(s || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim();

      // 0. Correção / atualização de telefone WhatsApp do hóspede (inclusive em outro flat do pacote via Solicitante)
      const rawNewGuestPhone = args.telefone_hospede !== undefined ? String(args.telefone_hospede).trim() : '';
      let phoneUpdateResult = null;
      if (rawNewGuestPhone !== '') {
        if (!db || !Array.isArray(db.reservations)) {
          const msgNoDb =
            'Explique educadamente que não localizamos uma reserva ativa vinculada a este número no momento para atualizar o telefone do hóspede.';
          return {
            status: 'BLOQUEADO_PELA_REGRA',
            codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
            instrucao_para_ia: msgNoDb,
            instrucao_resposta_ia: msgNoDb,
          };
        }

        const senderDigits = normalizePhoneDigits(context.telefone_remetente);
        const nowMsExec = Date.now() + Number(globalThis.__simulatedTimeOffsetMs || 0);
        const activeRequesterReservations = db.reservations.filter((r) => {
          if (!r) return false;
          const st = String(r.status || '').toLowerCase().trim();
          if (['cancelada', 'cancelado', 'cancelled', 'expirada', 'expired', 'no_show', 'concluida', 'checked_out'].includes(st)) {
            return false;
          }
          if (r.checkoutCompleted) return false;
          const paySt = String(r.paymentStatus || '').toLowerCase().trim();
          const isPaidIt = ['paid', 'pago', 'pago_total', 'pago_integralmente', 'confirmado'].includes(paySt);
          const holdExp = r.expiresAt || r.holdExpiresAt;
          if ((st === 'pre_reserva' || st === 'pendente' || r.isPreReservation) && !isPaidIt && holdExp) {
            const expMs = new Date(holdExp).getTime();
            if (Number.isFinite(expMs) && expMs <= nowMsExec) return false;
          }
          const reqCand = r.requesterInfo?.whatsapp || r.requesterInfo?.phone || r.requesterPhone || '';
          const matchesSenderAsReq = Boolean(
            senderDigits &&
            (phonesMatch(reqCand, senderDigits) || (r.requesterIsGuest1 && phonesMatch(r.guestPhone || r.phone, senderDigits)))
          );
          const matchesSessionRes = reserva ? matchesSessionReservation(r, reserva) : false;
          return matchesSenderAsReq || matchesSessionRes;
        });

        const pendingCandidates = [];
        for (const r of activeRequesterReservations) {
          const reqList = Array.isArray(r.guestPhoneCorrectionRequests) ? r.guestPhoneCorrectionRequests : [];
          for (const reqItem of reqList) {
            if (!reqItem || reqItem.status !== 'awaiting_reply') continue;
            const gIdx = Math.max(1, Number(reqItem.guestIndex) || 1);
            const gName = String(
              reqItem.guestName ||
              (gIdx === 1 ? r.guestName : r.guests?.[gIdx - 1]?.name) ||
              `Hóspede ${gIdx}`
            ).trim();
            pendingCandidates.push({
              reservation: r,
              guestIndex: gIdx,
              guestName: gName,
              invalidPhone: reqItem.invalidPhone || '',
              code: String(r.code || r.reservationCode || `RES-${r.flatNumber}-${r.id}`),
              flatNumber: String(r.flatNumber || ''),
            });
          }
        }

        const targetCodeFilter = normTextSimple(args.codigo_reserva_alvo).replace(/^flat\s*/i, '');
        const targetNameFilter = normTextSimple(args.nome_hospede_alvo);
        const targetIdxFilter = Number(args.indice_hospede_alvo) > 0 ? Number(args.indice_hospede_alvo) : 0;

        let resolvedTargetRes = null;
        let resolvedGuestIndex = 0;
        let resolvedGuestName = '';

        if (pendingCandidates.length > 0) {
          let filtered = pendingCandidates;
          if (targetCodeFilter) {
            const byCode = filtered.filter(
              (c) =>
                normTextSimple(c.code) === targetCodeFilter ||
                normTextSimple(c.flatNumber) === targetCodeFilter ||
                normTextSimple(c.code).includes(targetCodeFilter)
            );
            if (byCode.length > 0) filtered = byCode;
          }
          if (targetNameFilter) {
            const byName = filtered.filter((c) => normTextSimple(c.guestName).includes(targetNameFilter));
            if (byName.length > 0) filtered = byName;
          }
          if (targetIdxFilter > 0) {
            const byIdx = filtered.filter((c) => c.guestIndex === targetIdxFilter);
            if (byIdx.length > 0) filtered = byIdx;
          }

          if (filtered.length > 1) {
            const opcoes = filtered
              .map((c) => `*${c.guestName}* (Flat ${c.flatNumber} • ${c.code})`)
              .join(', ');
            const msgAmbig =
              `Explique com cordialidade ao solicitante que há mais de um hóspede aguardando correção de WhatsApp (${opcoes}) ` +
              `e pergunte exatamente a qual hóspede ou flat este novo número (${rawNewGuestPhone}) pertence antes de gravar.`;
            return {
              status: 'BLOQUEADO_PELA_REGRA',
              codigo_regra_bloqueio: 'AMBIGUIDADE_HOSPEDE_PENDENTE',
              dados: {
                opcoes_pendentes: filtered.map((c) => ({
                  codigo_reserva: c.code,
                  flat: c.flatNumber,
                  indice_hospede: c.guestIndex,
                  nome_hospede: c.guestName,
                  telefone_invalido: c.invalidPhone,
                })),
              },
              instrucao_para_ia: msgAmbig,
              instrucao_resposta_ia: msgAmbig,
            };
          }

          if (filtered.length === 1) {
            resolvedTargetRes = filtered[0].reservation;
            resolvedGuestIndex = filtered[0].guestIndex;
            resolvedGuestName = filtered[0].guestName;
          }
        }

        if (!resolvedTargetRes) {
          let resPool = activeRequesterReservations;
          if (targetCodeFilter) {
            const byCodeRes = resPool.filter((r) => {
              const rc = normTextSimple(r.code || r.reservationCode || '');
              const rf = normTextSimple(r.flatNumber || '');
              return rc === targetCodeFilter || rf === targetCodeFilter || rc.includes(targetCodeFilter);
            });
            if (byCodeRes.length > 0) resPool = byCodeRes;
          }

          if (targetNameFilter) {
            const nameMatches = [];
            for (const r of resPool) {
              const gArr = Array.isArray(r.guests) ? r.guests : [];
              const maxG = Math.max(1, gArr.length);
              for (let idx = 1; idx <= Math.min(3, maxG); idx++) {
                const nm = idx === 1 ? (r.guestName || gArr[0]?.name || '') : (gArr[idx - 1]?.name || '');
                if (nm && normTextSimple(nm).includes(targetNameFilter)) {
                  nameMatches.push({ r, idx, nm: String(nm).trim() });
                }
              }
            }
            if (nameMatches.length > 1) {
              const opcoesN = nameMatches.map((m) => `*${m.nm}* (Flat ${m.r.flatNumber} • ${m.r.code})`).join(', ');
              const msgAmbigName =
                `Pergunte educadamente a qual reserva/flat este número pertence, pois encontramos mais de um hóspede compatível: ${opcoesN}.`;
              return {
                status: 'BLOQUEADO_PELA_REGRA',
                codigo_regra_bloqueio: 'AMBIGUIDADE_HOSPEDE_PENDENTE',
                instrucao_para_ia: msgAmbigName,
                instrucao_resposta_ia: msgAmbigName,
              };
            }
            if (nameMatches.length === 1) {
              resolvedTargetRes = nameMatches[0].r;
              resolvedGuestIndex = nameMatches[0].idx;
              resolvedGuestName = nameMatches[0].nm;
            }
          }

          if (!resolvedTargetRes) {
            if (resPool.length > 1 && !targetCodeFilter) {
              const flatsListStr = resPool.map((r) => `Flat ${r.flatNumber} (${r.code} - ${r.guestName || 'A definir'})`).join(', ');
              const msgAmbigRes =
                `Explique educadamente que você localizou mais de um flat ativo vinculado a este solicitante (${flatsListStr}) e peça para confirmar o número do flat ou nome do hóspede antes de atualizar o telefone.`;
              return {
                status: 'BLOQUEADO_PELA_REGRA',
                codigo_regra_bloqueio: 'AMBIGUIDADE_RESERVA_ALVO',
                instrucao_para_ia: msgAmbigRes,
                instrucao_resposta_ia: msgAmbigRes,
              };
            }
            resolvedTargetRes = resPool[0] || (reserva ? db.reservations.find((r) => matchesSessionReservation(r, reserva)) : null);
            resolvedGuestIndex = targetIdxFilter || 1;
            resolvedGuestName = resolvedTargetRes
              ? String(
                  resolvedGuestIndex === 1
                    ? (resolvedTargetRes.guestName || resolvedTargetRes.guests?.[0]?.name || '')
                    : (resolvedTargetRes.guests?.[resolvedGuestIndex - 1]?.name || '')
                ).trim()
              : '';
          }
        }

        if (!resolvedTargetRes) {
          const msgNoTarget =
            'Explique educadamente que não localizamos uma reserva ativa correspondente para atualizar o WhatsApp do hóspede e peça o código da reserva ou número do flat.';
          return {
            status: 'BLOQUEADO_PELA_REGRA',
            codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
            instrucao_para_ia: msgNoTarget,
            instrucao_resposta_ia: msgNoTarget,
          };
        }

        const baseUrlPhone = String(
          db?.settings?.baseUrl ||
          (typeof process !== 'undefined' && (process.env?.APP_BASE_URL || process.env?.SERVER_BASE_URL)) ||
          'https://corpflats.com.br'
        ).replace(/\/+$/, '');

        const rawRtSend = context.runtime?.sendZapiMessage;
        const sendZapiAdapter = typeof rawRtSend === 'function'
          ? (rawRtSend === sendZapiMessage
              ? sendZapiMessage
              : async (cfg, payload) => {
                  if (rawRtSend.length >= 3 && payload && typeof payload === 'object') {
                    return await rawRtSend(payload.phone, payload.message, payload);
                  }
                  return await rawRtSend(cfg, payload);
                })
          : sendZapiMessage;

        phoneUpdateResult = await updateGuestPhoneAndResendInstructions(
          db,
          {
            reservation: resolvedTargetRes,
            guestIndex: resolvedGuestIndex || 1,
            guestName: resolvedGuestName || undefined,
            newPhone: rawNewGuestPhone,
            baseUrl: baseUrlPhone,
            actor: { name: 'Sofia IA', role: 'system', type: 'ai' },
            source: 'WhatsApp Sofia IA',
          },
          {
            saveDatabase: context.runtime?.saveDatabase,
            sendZapiMessage: sendZapiAdapter,
            ...(rawRtSend === sendZapiMessage || !rawRtSend
              ? { sendZapiDocument }
              : {}),
            hasPdfAlreadyBeenSentOrInFlight,
            evaluateSelfCheckinEligibility,
            checkZapiPhoneExists: context.runtime?.checkZapiPhoneExists || globalThis.__corpflatsCheckZapiPhoneExists || checkZapiPhoneExists,
            appendMessageToConversation: context.runtime?.appendMessageToConversation || appendMessageToConversation,
            createNotification: context.runtime?.createNotification || globalThis.__corpflatsCreateNotification,
            dispatchCatchUpGuestRulerMessages,
            scheduleUpcomingReservationTriggers,
            suppressExternalSend: Boolean(context.runtime?.suppressExternalSend),
          }
        );

        if (!phoneUpdateResult.ok) {
          const isDupPhone =
            phoneUpdateResult.duplicateGuestPhone === true ||
            phoneUpdateResult.code === 'TELEFONE_HOSPEDE_DUPLICADO';
          const msgPhoneErr = isDupPhone
            ? `Explique com cordialidade que o sistema bloqueou o cadastro do número ${rawNewGuestPhone} porque ${phoneUpdateResult.error} ` +
              `Por segurança, nada foi alterado. Peça por gentileza o número de WhatsApp individual do acompanhante/hóspede${resolvedGuestName ? ` *${resolvedGuestName}*` : ''} (observando que apenas menores de 18 anos podem compartilhar o WhatsApp do responsável).`
            : phoneUpdateResult.invalidWhatsApp
              ? `Explique com cordialidade que o sistema validou o número informado (${rawNewGuestPhone}), mas ele também não possui conta ativa no WhatsApp (ou está incompleto). Por segurança, nada foi alterado — peça por favor outro número de WhatsApp válido (com DDD) para o hóspede${resolvedGuestName ? ` *${resolvedGuestName}*` : ''}.`
              : `Explique educadamente que não foi possível atualizar o telefone agora (${phoneUpdateResult.error || 'erro de validação'}).`;
          return {
            status: 'BLOQUEADO_PELA_REGRA',
            codigo_regra_bloqueio: phoneUpdateResult.code || 'TELEFONE_SEM_WHATSAPP',
            dados: {
              telefone_informado: rawNewGuestPhone,
              motivo: phoneUpdateResult.error || null,
            },
            instrucao_para_ia: msgPhoneErr,
            instrucao_resposta_ia: msgPhoneErr,
          };
        }

        camposAtualizados.push(
          `WhatsApp de ${phoneUpdateResult.guestName} (Flat ${phoneUpdateResult.flatNumber}): ${phoneUpdateResult.newPhone}`
        );
      }

      let validatedEmail = '';
      const fallbackCurrentEmail =
        args.confirmar_email_atual === true && (!args.email || String(args.email).trim() === '')
          ? String(
              reserva?.alerta_email_incorreto?.email_invalido ||
                reserva?.email_cadastrado ||
                ''
            ).trim()
          : '';
      const rawCandidateEmail =
        args.email !== undefined && String(args.email).trim() !== ''
          ? String(args.email).trim()
          : fallbackCurrentEmail;

      if (rawCandidateEmail !== '') {
        const emailValidation = await validateGuestEmailAddress(rawCandidateEmail, {
          checkDns: true,
          stripTrailingPunctuation: true,
        });
        if (!emailValidation.valid) {
          const sugestaoMsg = emailValidation.suggestedEmail
            ? ` Pergunte gentilmente se o endereço correto seria *${emailValidation.suggestedEmail}*.`
            : ' Peça com cordialidade que ele confira a digitação e envie o endereço de e-mail correto novamente.';
          const msgInvalido =
            `Explique educadamente ao hóspede que o sistema verificou o endereço "${rawCandidateEmail}" e identificou que ele continua inválido (${emailValidation.message}). ` +
            `Por segurança, a alteração ainda não foi salva.${sugestaoMsg}`;
          return {
            status: 'BLOQUEADO_PELA_REGRA',
            codigo_regra_bloqueio: 'EMAIL_INVALIDO',
            dados: {
              email_informado: rawCandidateEmail,
              motivo: emailValidation.message,
              email_sugerido: emailValidation.suggestedEmail || null,
            },
            instrucao_para_ia: msgInvalido,
            instrucao_resposta_ia: msgInvalido,
          };
        }
        validatedEmail = emailValidation.normalizedEmail;
      }

      const cleanPlate = args.placa_veiculo ? String(args.placa_veiculo).toUpperCase().replace(/[^A-Z0-9-]/g, '').trim() : '';
      const cleanBrand = args.marca_veiculo ? String(args.marca_veiculo).trim() : '';
      const cleanModel = args.modelo_veiculo ? String(args.modelo_veiculo).trim() : '';
      const cleanColor = args.cor_veiculo ? String(args.cor_veiculo).trim() : '';

      // Trava determinística contra hóspede duplicado (mesmo nome completo do Hóspede Principal ou CPF repetido entre fichas)
      const normNameDupRuntime = (raw) => {
        const CONN = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);
        const toks = String(raw || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .trim()
          .split(/\s+/)
          .filter((t) => Boolean(t) && !CONN.has(t));
        if (toks.length < 2) return '';
        const joined = toks.join(' ');
        return joined.length >= 5 ? joined : '';
      };
      const normDocDupRuntime = (raw) => {
        const str = String(raw || '').trim();
        if (!str) return '';
        const digits = str.replace(/\D/g, '');
        const hasLetters = /[a-zA-Z]/.test(str);
        if (!hasLetters && digits.length === 11) {
          if (/^(\d)\1{10}$/.test(digits)) return '';
          return `CPF:${digits}`;
        }
        const alnum = str.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        if (alnum.length >= 5 && (hasLetters || alnum.length >= 7)) return `DOC:${alnum}`;
        return '';
      };

      const activeResForDupGuard =
        reserva && Array.isArray(db?.reservations)
          ? db.reservations.find((r) => matchesSessionReservation(r, reserva))
          : null;

      if (Array.isArray(args.nomes_acompanhantes) && args.nomes_acompanhantes.length > 0) {
        const mainGuestNameRaw = activeResForDupGuard
          ? String(activeResForDupGuard.guestName || activeResForDupGuard.guests?.[0]?.name || context.hospede?.nome || '').trim()
          : String(context.hospede?.nome || '').trim();
        const mainNorm = normNameDupRuntime(mainGuestNameRaw);
        const seenCompNorms = new Set();

        for (const rawComp of args.nomes_acompanhantes) {
          const compClean = String(rawComp || '').trim();
          const cNorm = normNameDupRuntime(compClean);
          if (!cNorm) continue;
          if (mainNorm && cNorm === mainNorm) {
            const msgDupMain =
              `Explique com cordialidade ao hóspede que o nome *${compClean}* já consta como Hóspede Principal (Hóspede 1) desta reserva e não pode ser repetido como acompanhante. ` +
              `Por segurança, a alteração não foi gravada. Peça o nome completo real do acompanhante (ou pergunte se ficará hospedado apenas 1 hóspede).`;
            return {
              status: 'BLOQUEADO_PELA_REGRA',
              codigo_regra_bloqueio: 'HOSPEDE_ACOMPANHANTE_DUPLICADO',
              dados: {
                nome_conflitante: compClean,
                hospede_principal: mainGuestNameRaw,
              },
              instrucao_para_ia: msgDupMain,
              instrucao_resposta_ia: msgDupMain,
            };
          }
          if (seenCompNorms.has(cNorm)) {
            const msgDupComp =
              `Explique com cordialidade ao hóspede que o acompanhante *${compClean}* foi informado em duplicidade na mesma reserva. ` +
              `Peça o nome completo individual de cada acompanhante.`;
            return {
              status: 'BLOQUEADO_PELA_REGRA',
              codigo_regra_bloqueio: 'HOSPEDE_ACOMPANHANTE_DUPLICADO',
              dados: {
                nome_conflitante: compClean,
              },
              instrucao_para_ia: msgDupComp,
              instrucao_resposta_ia: msgDupComp,
            };
          }
          seenCompNorms.add(cNorm);
        }
      }

      if (args.cpf_cnpj && activeResForDupGuard && Array.isArray(activeResForDupGuard.guests)) {
        const candDocNorm = normDocDupRuntime(args.cpf_cnpj);
        if (candDocNorm) {
          for (let idx = 2; idx <= 3; idx++) {
            const compSlot = activeResForDupGuard.guests[idx - 1];
            if (!compSlot || compSlot.informLater) continue;
            if ((idx === 2 && activeResForDupGuard.guest2InformLater) || (idx === 3 && activeResForDupGuard.guest3InformLater)) continue;
            const compDocNorm = normDocDupRuntime(compSlot.cpf || compSlot.document || compSlot.passport || '');
            if (compDocNorm && compDocNorm === candDocNorm) {
              const msgDupDoc =
                `Explique com cordialidade ao hóspede que o documento informado (${args.cpf_cnpj}) já está cadastrado para o Acompanhante (Hóspede ${idx}${compSlot.name ? ` - ${compSlot.name}` : ''}) nesta reserva. ` +
                `Cada participante deve possuir seu próprio CPF/Passaporte individual.`;
              return {
                status: 'BLOQUEADO_PELA_REGRA',
                codigo_regra_bloqueio: 'DOCUMENTO_HOSPEDE_DUPLICADO',
                dados: {
                  documento_conflitante: args.cpf_cnpj,
                  indice_acompanhante: idx,
                },
                instrucao_para_ia: msgDupDoc,
                instrucao_resposta_ia: msgDupDoc,
              };
            }
          }
        }
      }

      if (args.cpf_cnpj) camposAtualizados.push(`CPF/CNPJ: ${args.cpf_cnpj}`);
      if (validatedEmail) camposAtualizados.push(`E-mail: ${validatedEmail}`);
      if (args.horario_previsto_chegada)
        camposAtualizados.push(`Horário previsto de chegada: ${args.horario_previsto_chegada}`);
      if (cleanPlate) {
        const descCarro = [cleanBrand, cleanModel, cleanColor].filter(Boolean).join(' ');
        camposAtualizados.push(`Veículo: Placa ${cleanPlate}${descCarro ? ` (${descCarro})` : ''}`);
      }
      if (Array.isArray(args.nomes_acompanhantes) && args.nomes_acompanhantes.length > 0) {
        camposAtualizados.push(`Acompanhantes: ${args.nomes_acompanhantes.join(', ')}`);
      }

      // CENÁRIO 1: Cliente enviou dados (ex: placa/carro/e-mail) ANTES de ter uma reserva criada para ele
      if (!reserva && !phoneUpdateResult) {
        if (camposAtualizados.length === 0) {
          const msg =
            'Explique educadamente que você não localizou uma reserva ativa vinculada a este número no momento e pergunte se ele deseja fazer uma reserva ou informar os dados do veículo/cadastro.';
          return {
            status: 'BLOQUEADO_PELA_REGRA',
            codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
            instrucao_para_ia: msg,
            instrucao_resposta_ia: msg,
          };
        }

        const cleanPhone = normalizePhoneDigits(context.telefone_remetente);
        const vehiclePayload = cleanPlate
          ? {
              plate: cleanPlate,
              brand: cleanBrand,
              model: cleanModel,
              color: cleanColor,
              updatedAt: new Date().toISOString(),
            }
          : null;

        if (context.runtime?.conversation && vehiclePayload) {
          context.runtime.conversation.pendingVehicle = vehiclePayload;
        }

        if (db) {
          if (!Array.isArray(db.guests)) db.guests = [];
          let guestRec = db.guests.find((g) => phonesMatch(g?.phone || g?.whatsapp, cleanPhone));
          if (!guestRec && cleanPhone) {
            guestRec = {
              id: db.guests.length > 0 ? Math.max(...db.guests.map((g) => Number(g.id) || 0)) + 1 : 1,
              name: context.hospede?.nome || 'Cliente WhatsApp',
              fullName: context.hospede?.nome || 'Cliente WhatsApp',
              phone: cleanPhone,
              email: validatedEmail || '',
              document: args.cpf_cnpj ? String(args.cpf_cnpj).replace(/\D+/g, '') : '',
              createdAt: new Date().toISOString(),
            };
            db.guests.push(guestRec);
          }
          if (guestRec) {
            if (vehiclePayload) {
              guestRec.pendingVehicle = vehiclePayload;
              guestRec.vehicle = vehiclePayload;
            }
            if (args.cpf_cnpj) guestRec.document = String(args.cpf_cnpj).replace(/\D+/g, '');
            if (validatedEmail) guestRec.email = validatedEmail;
          }

          if (vehiclePayload && Array.isArray(db.pendingPreReservationProposals)) {
            for (const prop of db.pendingPreReservationProposals) {
              if (phonesMatch(prop?.guestPhone, cleanPhone) && prop.status === 'pending_manager') {
                prop.vehicle = vehiclePayload;
              }
            }
          }

          if (typeof context.runtime?.saveDatabase === 'function') {
            await context.runtime.saveDatabase();
          }
        }

        const msg =
          `Confirme com cordialidade que os dados informados (${camposAtualizados.join(' | ')}) já foram salvos e vinculados ao seu número de WhatsApp. ` +
          `Explique que, assim que a reserva dele for criada no sistema, esses dados serão anexados automaticamente!`;

        return {
          status: 'SUCESSO_EXECUTADO',
          dados: {
            reserva_id: null,
            pre_captura_whatsapp: true,
            campos_atualizados: camposAtualizados,
            veiculo_pendente: vehiclePayload,
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      if (camposAtualizados.length === 0) {
        const msg =
          'Pergunte educadamente ao hóspede qual informação ele gostaria de cadastrar ou atualizar na reserva (ex: e-mail, placa/modelo/cor do veículo, horário de chegada, CPF ou nome de acompanhante).';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'NENHUM_CAMPO_INFORMADO',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const baseUrl =
        db?.settings?.baseUrl ||
        (typeof process !== 'undefined' && process.env?.SERVER_BASE_URL) ||
        'https://corpflats.com.br';
      const targetRefCode = phoneUpdateResult?.reservationCode || reserva?.id || '';
      const linkPreCheckin = targetRefCode ? `${baseUrl}/pre-checkin/${targetRefCode}` : `${baseUrl}/reservar`;

      let garageDispatchResult = null;
      let jaTinhaDisparadoGatilhos = false;
      let emailResendSummary = null;

      if (reserva && Array.isArray(db?.reservations)) {
        const targetRes = db.reservations.find((r) => matchesSessionReservation(r, reserva));
        if (targetRes) {
          jaTinhaDisparadoGatilhos = Boolean(
            targetRes.morningEmailSentAt ||
              targetRes.receptionNotifiedAt ||
              targetRes.vehicle?.garageNotifiedAt
          );

          if (args.cpf_cnpj) {
            const docClean = String(args.cpf_cnpj).replace(/\D+/g, '');
            targetRes.guestCpf = docClean;
            targetRes.guestDocument = docClean;
          }
          if (args.horario_previsto_chegada)
            targetRes.estimatedArrivalTime = args.horario_previsto_chegada;
          if (Array.isArray(args.nomes_acompanhantes) && args.nomes_acompanhantes.length > 0) {
            targetRes.companions = args.nomes_acompanhantes;
          }

          if (cleanPlate) {
            const nextVehicle = {
              plate: cleanPlate,
              brand: cleanBrand || targetRes.vehicle?.brand || '',
              model: cleanModel || targetRes.vehicle?.model || '',
              color: cleanColor || targetRes.vehicle?.color || '',
              updatedAt: new Date().toISOString(),
            };
            targetRes.vehicle = { ...(targetRes.vehicle || {}), ...nextVehicle };
            targetRes.vehiclePlate = cleanPlate;

            const triggerGarageFn =
              context.runtime?.triggerGarageEmailNotification ||
              globalThis.triggerGarageEmailNotification;
            if (typeof triggerGarageFn === 'function') {
              garageDispatchResult = triggerGarageFn(
                db,
                context.runtime?.saveDatabase,
                targetRes,
                nextVehicle,
                {
                  trigger: jaTinhaDisparadoGatilhos
                    ? 'sofia_whatsapp_vehicle_retrigger'
                    : 'sofia_whatsapp_vehicle',
                  source: 'Sofia IA (WhatsApp)',
                  retriggerIfAlreadySent: true,
                  retriggerReceptionIfAlreadyNotified: jaTinhaDisparadoGatilhos,
                }
              );
            }
          }

          if (validatedEmail) {
            const guestIdx = Number(targetRes.emailCorrectionRequest?.guestIndex) || 1;
            emailResendSummary = await updateGuestEmailAndResendRecentPending({
              db,
              saveDatabase: context.runtime?.saveDatabase,
              reservation: targetRes,
              guestIndex: guestIdx,
              newEmail: validatedEmail,
              maxAgeHours: 72,
              baseUrl,
            });
          } else {
            targetRes.updatedAt = new Date().toISOString();
            if (typeof context.runtime?.saveDatabase === 'function') {
              await context.runtime.saveDatabase();
            }
          }
        }
      }

      let detalheGaragem = '';
      if (cleanPlate) {
        if (garageDispatchResult?.deferred && garageDispatchResult.reason === 'pre_reservation_unpaid') {
          detalheGaragem =
            ' Informe que o veículo já está salvo na reserva e a liberação da garagem será enviada automaticamente assim que o pagamento da reserva for confirmado.';
        } else if (garageDispatchResult?.deferred && garageDispatchResult.reason === 'future_reservation') {
          detalheGaragem =
            ' Informe que o veículo já está cadastrado e o e-mail de liberação para a garagem será disparado automaticamente na manhã do dia do check-in.';
        } else {
          detalheGaragem = jaTinhaDisparadoGatilhos
            ? ' Informe que, como os avisos de chegada já haviam sido enviados, o sistema já reenviou a autorização atualizada com os dados do veículo para a garagem e portaria!'
            : ' Informe que a autorização de estacionamento já foi enviada para a garagem!';
        }
      }

      let detalheEmail = '';
      if (validatedEmail && emailResendSummary) {
        if (emailResendSummary.sameEmailConfirmed) {
          detalheEmail =
            ` Peça desculpas gentilmente pelo alarme falso de falha na entrega, agradeça pela confirmação e tranquilize o hóspede informando que o e-mail *${validatedEmail}* já está confirmado como válido e ativo no sistema` +
            (emailResendSummary.resentCount > 0
              ? `, e que ${emailResendSummary.resentCount} mensagem(ns) retida(s) (${emailResendSummary.resentSubjects.join(', ')}) já foram liberadas para ele!`
              : `, com o alerta de erro já removido da reserva!`);
        } else if (emailResendSummary.resentCount > 0) {
          detalheEmail =
            ` Informe com cordialidade que o e-mail já foi alterado no sistema para *${validatedEmail}* e que ` +
            `${emailResendSummary.resentCount} e-mail(s) pendente(s) recente(s) (${emailResendSummary.resentSubjects.join(', ')}) já foram reenviados agora mesmo!`;
        } else if (emailResendSummary.skippedTooOldCount > 0) {
          detalheEmail =
            ` Informe que o e-mail já foi alterado no sistema para *${validatedEmail}* para os próximos envios (mensagens antigas anteriores não foram reenviadas por já não serem recentes).`;
        } else if (emailResendSummary.updatedScheduledCount > 0) {
          detalheEmail =
            ` Informe que o e-mail já foi alterado no sistema para *${validatedEmail}* e que os próximos envios programados da estadia já seguirão para este novo endereço.`;
        } else {
          detalheEmail =
            ` Informe que o e-mail já foi alterado com sucesso no sistema para *${validatedEmail}*.`;
        }
      }

      const detalheTelefone = phoneUpdateResult
        ? ` Confirme ao solicitante que o WhatsApp de *${phoneUpdateResult.guestName}* (Flat *${phoneUpdateResult.flatNumber}*, reserva *${phoneUpdateResult.reservationCode}*) foi atualizado para *${phoneUpdateResult.newPhone}*` +
          (phoneUpdateResult.whatsappDispatched
            ? ` e as instruções de check-in (sem valores financeiros) já foram enviadas imediatamente para esse novo número!`
            : ` no sistema!`)
        : '';

      const preCheckinSuffix =
        phoneUpdateResult && camposAtualizados.length === 1
          ? ''
          : reserva?.status_pre_checkin_fnrh === 'CONCLUIDO'
            ? ''
            : ` Caso o hóspede ainda precise preencher a FNRH e enviar a foto do documento/assinatura digital do pré-check-in, o link oficial é: ${linkPreCheckin}.`;

      const refResLabel = phoneUpdateResult
        ? `*${phoneUpdateResult.reservationCode}* (Flat ${phoneUpdateResult.flatNumber})`
        : `*${reserva?.id}* (${reserva?.nome_imovel})`;

      const msg =
        phoneUpdateResult && camposAtualizados.length === 1
          ? `${detalheTelefone.trim()}`
          : emailResendSummary?.sameEmailConfirmed && camposAtualizados.length === 1 && validatedEmail
            ? `Confirme com muita cordialidade na reserva ${refResLabel}:${detalheEmail}${preCheckinSuffix}`
            : `Confirme com cordialidade que os dados da reserva ${refResLabel} foram atualizados no sistema: ` +
              `${camposAtualizados.join(' | ')}.${detalheTelefone}${detalheGaragem}${detalheEmail}${preCheckinSuffix}`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          reserva_id: phoneUpdateResult?.reservationCode || reserva?.id,
          campos_atualizados: camposAtualizados,
          ...(phoneUpdateResult
            ? {
                telefone_hospede_atualizado: phoneUpdateResult.newPhone,
                hospede_atualizado: phoneUpdateResult.guestName,
                flat_atualizado: phoneUpdateResult.flatNumber,
                instrucoes_reenviadas: Boolean(phoneUpdateResult.whatsappDispatched),
              }
            : {}),
          email_atualizado: validatedEmail || undefined,
          email_confirmado_sem_alteracao: Boolean(emailResendSummary?.sameEmailConfirmed),
          emails_pendentes_reenviados: emailResendSummary?.resentCount ?? 0,
          assuntos_reenviados: emailResendSummary?.resentSubjects ?? [],
          agendamentos_atualizados: emailResendSummary?.updatedScheduledCount ?? 0,
          antigos_ignorados: emailResendSummary?.skippedTooOldCount ?? 0,
          garagem_reenviada: Boolean(cleanPlate && jaTinhaDisparadoGatilhos),
          garagem_status: garageDispatchResult || null,
          link_pre_checkin: linkPreCheckin,
        },
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    } catch (error) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'BAIXA',
        categoria: 'ERRO_SISTEMA_TOOL',
        hospede_nome: context.hospede?.nome || 'Hóspede',
        telefone: context.telefone_remetente,
        resumo: `Falha técnica ao executar atualizar_dados_hospede: ${error.message}`,
        context,
      });
      const msg =
        'Informe ao hóspede que você já anotou as informações e encaminhou para a recepção vincular manualmente à ficha da reserva.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

export const solicitarEarlyCheckinTool = {
  name: 'solicitar_early_checkin',
  description:
    'Verifica a disponibilidade de flat desocupado, limpo na governança e com conferência de frigobar concluída hoje (exigida antes das 14:00) e aplica as regras oficiais de entrada antecipada (early check-in): ' +
    'hóspedes WhatsApp/Direto têm cortesia a partir das 10:00; demais canais têm cortesia a partir das 12:00; ' +
    'antes desses horários até o limite de 07:00 cobra meia diária (50%); antes das 07:00 cobra diária inteira (100%).',
  allowedStates: ['PRE_CHECKIN', 'IN_STAY_CONCIERGE'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      horario_solicitado: {
        type: 'STRING',
        description: 'Horário desejado pelo hóspede para entrar no imóvel no formato HH:MM (ex: "10:30" ou "08:00").',
      },
      confirmacao_hospede: {
        type: 'BOOLEAN',
        description:
          'Passe FALSE na primeira consulta quando houver cobrança (meia diária ou diária inteira) para informar o valor ao hóspede. ' +
          'Passe TRUE somente após o hóspede concordar explicitamente com a taxa informada.',
      },
    },
    required: ['horario_solicitado'],
  },
  async execute(args, context) {
    try {
      const reserva = context.reserva_ativa || context.reserva_atual;
      if (!reserva) {
        const msg =
          'Explique educadamente que você não localizou uma reserva ativa vinculada a este número de telefone e peça o código da reserva.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const horarioFormatado = normalizeTimeHHMM(args.horario_solicitado, '14:00');
      const confirmado = Boolean(args.confirmacao_hospede ?? false);
      const db = context.runtime?.db;
      const flatNumber = reserva.nome_imovel.replace(/^Flat\s+/i, '').trim();
      const dataCheckin = String(reserva.data_checkin || '').slice(0, 10);

      const targetRes = Array.isArray(db?.reservations)
        ? db.reservations.find((r) => matchesSessionReservation(r, reserva))
        : null;

      // 1. Verifica disponibilidade: flat desocupado e limpo
      let conflitoSaidaMesmoDia = false;
      if (Array.isArray(db?.reservations)) {
        conflitoSaidaMesmoDia = db.reservations.some((r) => {
          if (!r || r.status === 'cancelada' || r.status === 'cancelled') return false;
          if (matchesSessionReservation(r, reserva)) return false;
          const sameFlat = String(r.flatNumber || '') === flatNumber;
          const sameDayCheckout = String(r.checkoutDate || '').slice(0, 10) === dataCheckin;
          return sameFlat && sameDayCheckout && !r.checkoutCompleted && !r.checkoutDone;
        });
      }

      let flatSujoNaGovernanca = false;
      if (Array.isArray(db?.cleaningRequests)) {
        flatSujoNaGovernanca = db.cleaningRequests.some((c) => {
          if (!c || c.isDeleted || c.status === 'deleted' || c.isInstructionOnly || c.source === 'manual_instruction') {
            return false;
          }
          return (
            String(c.flatNumber || '') === flatNumber &&
            c.requestDate === dataCheckin &&
            c.status !== 'clean'
          );
        });
      }

      if (conflitoSaidaMesmoDia || flatSujoNaGovernanca) {
        const motivoBloqueio = conflitoSaidaMesmoDia
          ? 'há um hóspede em estadia com saída prevista até as 12h00 e a equipe de governança fará a higienização completa e a conferência de frigobar logo em seguida'
          : 'o apartamento ainda está em programação de limpeza na governança e o early check-in está sempre sujeito a haver flat desocupado, limpo e com frigobar conferido';
        const msg =
          `Informe ao hóspede com muita empatia que no momento não conseguimos liberar a entrada antecipada às ${horarioFormatado} no ${reserva.nome_imovel} ` +
          `porque ${motivoBloqueio}. ` +
          `Diga que já deixamos prioridade máxima na preparação para liberar o quanto antes e que ele pode guardar as malas na recepção se chegar mais cedo!`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'FLAT_OCUPADO_AGUARDANDO_CHECKOUT_E_LIMPEZA',
          dados: { horario_padrao_checkin: '14:00', flat: reserva.nome_imovel },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      // 1B. Trava determinística da Conferência de Frigobar (obrigatória para Early Check-in antes das 14:00 no dia do check-in)
      const standardCheckinHHMM = String(db?.settings?.checkinTime || '14:00').trim() || '14:00';
      const nowForEarlyCheck = context.runtime?.now instanceof Date ? context.runtime.now : new Date();
      const readinessEarly = db
        ? evaluateFlatCheckinReadiness(
            db,
            targetRes || { flatNumber, flatId: reserva.imovel_id, checkinDate: dataCheckin },
            nowForEarlyCheck
          )
        : null;
      if (
        readinessEarly &&
        readinessEarly.isCheckinToday &&
        horarioFormatado < standardCheckinHHMM &&
        readinessEarly.isMinibarPendingForEarlyCheckin
      ) {
        const msg =
          `Informe ao hóspede com empatia e clareza que o ${reserva.nome_imovel} já foi higienizado pela governança, ` +
          `porém ainda aguarda a *conferência de frigobar* pela equipe de abastecimento — tanto a limpeza quanto a conferência de frigobar precisam estar concluídas para liberarmos o early check-in antes das ${standardCheckinHHMM}. ` +
          `Tranquilize-o dizendo que assim que a conferência for finalizada (ou pontualmente no horário oficial das ${standardCheckinHHMM}), enviaremos a confirmação imediata aqui no WhatsApp!`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'AGUARDANDO_CONFERENCIA_FRIGOBAR',
          dados: {
            horario_padrao_checkin: standardCheckinHHMM,
            flat: reserva.nome_imovel,
            limpeza_concluida: true,
            frigobar_conferido_hoje: false,
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      // 2. Regra de canal e faixas de horário da CorpFlats:
      // - Hóspedes WhatsApp / Direto: cortesia a partir das 10:00
      // - Demais canais (Booking, Airbnb, B2B, etc.): cortesia a partir das 12:00
      // - Antes do horário gratuito até 07:00: cobra meia diária (50%)
      // - Antes das 07:00: cobra diária inteira (100%)
      const rawChannel = String(targetRes?.channel || reserva.canal_reserva || 'whatsapp').toLowerCase();
      const isOtaOrB2b =
        rawChannel.includes('booking') ||
        rawChannel.includes('airbnb') ||
        rawChannel.includes('expedia') ||
        rawChannel.includes('decolar') ||
        rawChannel.includes('b2b');
      const isWhatsappGuest = !isOtaOrB2b;
      const horarioGratuito = isWhatsappGuest ? '10:00' : '12:00';
      const valorDiaria = Number(targetRes?.dailyRate || reserva.valor_diaria || 237.0);

      let valorTaxa = 0;
      let tipoTaxa = 'CORTESIA';
      let labelTaxa = 'Cortesia';

      if (horarioFormatado < '07:00') {
        valorTaxa = Number(valorDiaria.toFixed(2));
        tipoTaxa = 'DIARIA_INTEIRA';
        labelTaxa = 'Diária Inteira (entrada antes das 07:00)';
      } else if (horarioFormatado < horarioGratuito) {
        valorTaxa = Number((valorDiaria / 2).toFixed(2));
        tipoTaxa = 'MEIA_DIARIA';
        labelTaxa = `Meia Diária (entrada entre 07:00 e ${horarioGratuito})`;
      }

      // Se exige taxa (meia diária ou diária inteira) e o hóspede ainda não confirmou:
      if (valorTaxa > 0 && !confirmado) {
        const msg =
          `Informe ao hóspede que o ${reserva.nome_imovel} está desocupado e disponível! Explique com clareza nossa regra de Early Check-in:\n` +
          `• A partir das *${horarioGratuito}*: *Cortesia (gratuito)* para a reserva dele.\n` +
          `• Entre *07:00 e ${horarioGratuito}*: taxa de *meia diária* (R$ ${(valorDiaria / 2).toFixed(2)}).\n` +
          `• Antes das *07:00*: taxa de *diária inteira* (R$ ${valorDiaria.toFixed(2)}).\n` +
          `Para o horário solicitado das *${horarioFormatado}*, aplica-se *${labelTaxa}* no valor de *R$ ${valorTaxa.toFixed(2)}*. ` +
          `Pergunte se ele confirma esse valor para você gerar o PIX de liberação ou se prefere entrar sem custo a partir das ${horarioGratuito}.`;
        return {
          status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
          dados: {
            reserva_id: reserva.id,
            horario_solicitado: horarioFormatado,
            horario_gratuito_canal: horarioGratuito,
            tipo_taxa: tipoTaxa,
            valor_taxa: valorTaxa,
            valor_diaria_referencia: valorDiaria,
            moeda: 'BRL',
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      // Se exige taxa e o hóspede JÁ confirmou: gera a cobrança PIX primeiro
      if (valorTaxa > 0 && confirmado) {
        const pixCharge = await generatePixChargeForService({
          amount: valorTaxa,
          description: `Early Check-in ${horarioFormatado} (${labelTaxa}) - Reserva ${reserva.id}`,
          debtorName: targetRes?.guestName || context.hospede?.nome || 'Hospede CorpFlats',
          debtorDocument: targetRes?.guestDocument || targetRes?.guestCpf || '',
          reservationCode: reserva.id,
          context,
        });

        if (targetRes) {
          targetRes.pendingEarlyCheckin = {
            txid: pixCharge.txid,
            pixCopiaECola: pixCharge.pixCopiaECola,
            amount: valorTaxa,
            requestedTime: horarioFormatado,
            feeType: tipoTaxa,
            feeLabel: labelTaxa,
            status: 'pending_payment',
            requestedAt: new Date().toISOString(),
          };
          targetRes.updatedAt = new Date().toISOString();
          if (typeof context.runtime?.saveDatabase === 'function') {
            await context.runtime.saveDatabase();
          }
        }

        const msg =
          `Envie ao hóspede o código PIX Copia e Cola (${pixCharge.pixCopiaECola}) referente à taxa de *${labelTaxa}* (*R$ ${valorTaxa.toFixed(2)}*) ` +
          `para o early check-in às *${horarioFormatado}* no *${reserva.nome_imovel}*. ` +
          `Explique que, assim que o pagamento for confirmado, o sistema libera automaticamente a entrada antecipada para as ${horarioFormatado}!`;

        return {
          status: 'SUCESSO_EXECUTADO',
          dados: {
            reserva_id: reserva.id,
            novo_horario_checkin: horarioFormatado,
            cortesia: false,
            tipo_taxa: tipoTaxa,
            valor_taxa: valorTaxa,
            aguardando_pagamento_pix: true,
            txid: pixCharge.txid,
            pix_copia_e_cola: pixCharge.pixCopiaECola,
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      // Caso Cortesia (a partir das 10:00 para WhatsApp/Direto ou 12:00 para demais canais):
      if (targetRes) {
        targetRes.earlyCheckin = true;
        targetRes.earlyCheckinAuthorized = true;
        targetRes.earlyCheckinTime = horarioFormatado;
        targetRes.checkinTime = horarioFormatado;
        targetRes.earlyCheckinFee = 0;
        targetRes.updatedAt = new Date().toISOString();
        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }
      }

      const isPreCheckinAlreadyDone = Boolean(
        targetRes &&
        !targetRes.needsReSignature &&
        (
          targetRes.fnhrCompleted ||
          targetRes.preCheckinCompleted ||
          targetRes.checkedInAt ||
          (Array.isArray(targetRes.guests) && targetRes.guests.length > 0 && (targetRes.guests[0]?.hasCompletedCheckin || targetRes.guests[0]?.status === 'CHECKED_IN'))
        )
      );
      const appOriginForEarly = db?.settings?.baseUrl || process.env.APP_BASE_URL || 'https://corpflats.com.br';
      const linkCheckinForEarly = `${appOriginForEarly}/pre-checkin/${encodeURIComponent(String(reserva.id))}`;

      const msg = isPreCheckinAlreadyDone
        ? `Confirme com entusiasmo que o early check-in para as ${horarioFormatado} no ${reserva.nome_imovel} foi autorizado como cortesia na reserva ${reserva.id} ` +
          `e que, como o Check-in Online dele já está concluído, ao chegar basta se dirigir à recepção 24h e informar o nome e o número do flat.`
        : `Confirme com entusiasmo que o early check-in para as ${horarioFormatado} no ${reserva.nome_imovel} foi autorizado como cortesia na reserva ${reserva.id} ` +
          `e que o quarto já está limpo e pronto! Porém, explique claramente que o sistema está apenas aguardando ele concluir o *Check-in Online* (${linkCheckinForEarly}) ` +
          `para que a entrada fique liberada na recepção 24h (não basta apenas chegar e informar o nome sem antes finalizar o Check-in Online).`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          reserva_id: reserva.id,
          novo_horario_checkin: horarioFormatado,
          cortesia: true,
          valor_taxa: 0,
          checkin_online_concluido: isPreCheckinAlreadyDone,
        },
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    } catch (error) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'MEDIA',
        categoria: 'ERRO_SISTEMA_TOOL',
        hospede_nome: context.hospede?.nome || 'Hóspede',
        telefone: context.telefone_remetente,
        resumo: `Falha técnica ao executar solicitar_early_checkin: ${error.message}`,
        context,
      });
      const msg =
        'Informe ao hóspede que você já notificou a recepção e a governança no WhatsApp para priorizarem a liberação antecipada do flat.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

export const solicitarLateCheckoutTool = {
  name: 'solicitar_late_checkout',
  description:
    'Verifica a disponibilidade e aplica a regra oficial de extensão do horário de saída (late check-out) na CorpFlats: ' +
    '1) Segunda a Sábado: cortesia gratuita até as 13:00h (+1h de tolerância), mesmo que haja outro check-in no mesmo dia; após 13:00h é bloqueado ou cobra 1 diária inteira (100%). ' +
    '2) Domingos: se a ocupação total dos flats ativos no domingo for menor que 50%, libera cortesia gratuita até as 18:00h (após 18:00h cobra 1 diária inteira), transferindo automaticamente eventual próximo hóspede do mesmo dia para o Flat da Vez livre.',
  allowedStates: ['PRE_CHECKIN', 'IN_STAY_CONCIERGE'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      horario_solicitado: {
        type: 'STRING',
        description: 'Horário desejado pelo hóspede para sair do imóvel no formato HH:MM (ex: "13:00" ou "17:00").',
      },
      confirmacao_hospede: {
        type: 'BOOLEAN',
        description:
          'Passe FALSE na primeira vez caso haja cobrança de diária inteira. ' +
          'Passe TRUE para horários dentro da cortesia gratuita (até 13:00h seg-sáb ou até 18:00h no domingo com ocupação < 50%) ou após o hóspede concordar explicitamente com a diária extra.',
      },
    },
    required: ['horario_solicitado', 'confirmacao_hospede'],
  },
  async execute(args, context) {
    try {
      const reserva = context.reserva_ativa || context.reserva_atual;
      if (!reserva) {
        const msg =
          'Explique educadamente que você não localizou uma reserva ativa vinculada a este número de telefone e peça o código da reserva ou CPF do titular.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const horarioFormatado = normalizeTimeHHMM(args.horario_solicitado);
      const confirmado = Boolean(args.confirmacao_hospede ?? args.confirmacao_cobranca ?? false);

      const db = context.runtime?.db;
      const flatNumber = reserva.nome_imovel.replace(/^Flat\s+/i, '').trim();
      const dataCheckout = String(reserva.data_checkout || '').slice(0, 10);

      const targetRes = Array.isArray(db?.reservations)
        ? db.reservations.find((r) => {
            return (
              matchesSessionReservation(r, reserva) ||
              (String(r?.flatNumber) === flatNumber &&
                String(r?.checkoutDate || '').slice(0, 10) === dataCheckout)
            );
          })
        : null;

      const incomingSameDayRes = Array.isArray(db?.reservations)
        ? db.reservations.find((r) => {
            if (!r || r.status === 'cancelada' || r.status === 'cancelled') return false;
            if (matchesSessionReservation(r, reserva)) return false;
            const sameFlat =
              String(r.flatNumber || '') === flatNumber ||
              String(r.flatId || '') === String(reserva.imovel_id);
            const sameDayCheckin = String(r.checkinDate || '').slice(0, 10) === dataCheckout;
            return sameFlat && sameDayCheckin;
          })
        : null;

      const checkoutDateObj = new Date(`${dataCheckout}T12:00:00Z`);
      const isSunday = !Number.isNaN(checkoutDateObj.getTime()) && checkoutDateObj.getUTCDay() === 0;

      // Calcula ocupação dos flats ativos no domingo
      let sundayOccupancyRatio = 1.0;
      let activeFlatsCount = 12;
      let occupiedFlatsOnDay = 0;
      if (isSunday) {
        const activeFlats = Array.isArray(db?.flats)
          ? db.flats.filter((f) => f && f.isActive !== false)
          : [];
        activeFlatsCount = activeFlats.length > 0 ? activeFlats.length : 12;
        const allRes = Array.isArray(db?.reservations) ? db.reservations : [];
        const occupiedSet = new Set();
        for (const r of allRes) {
          if (!r || r.status === 'cancelada' || r.status === 'cancelled' || r.checkoutCompleted) continue;
          if (matchesSessionReservation(r, reserva)) continue;
          const rIn = String(r.checkinDate || '').slice(0, 10);
          const rOut = String(r.checkoutDate || '').slice(0, 10);
          if (rIn <= dataCheckout && rOut > dataCheckout) {
            occupiedSet.add(String(r.flatNumber || r.flatId));
          }
        }
        occupiedFlatsOnDay = occupiedSet.size;
        sundayOccupancyRatio = occupiedFlatsOnDay / Math.max(1, activeFlatsCount);
      }

      const isSundayLowOccupancy = isSunday && sundayOccupancyRatio < 0.5;
      const horarioLimiteCortesia = isSundayLowOccupancy ? '18:00' : '13:00';
      const valorDiaria = Number(targetRes?.dailyRate || reserva.valor_diaria || 237.0);

      // CASO 1: Dentro do horário de cortesia gratuita (até 13:00h Seg-Sáb ou até 18:00h no Domingo com ocupação < 50%)
      if (horarioFormatado <= horarioLimiteCortesia) {
        let proximoHospedeRemanejadoPara = null;

        // Troca Automática no Domingo se houver outro hóspede entrando no mesmo flat no mesmo dia
        if (isSundayLowOccupancy && horarioFormatado > '13:00' && incomingSameDayRes) {
          const fairFlat = selectFairShareFlatHelper(
            db,
            String(incomingSameDayRes.checkinDate || dataCheckout).slice(0, 10),
            String(incomingSameDayRes.checkoutDate || '').slice(0, 10),
            flatNumber
          );
          if (fairFlat) {
            const oldIncomingFlat = incomingSameDayRes.flatNumber;
            incomingSameDayRes.flatId = fairFlat.id || fairFlat.number;
            incomingSameDayRes.flatNumber = String(fairFlat.number);
            incomingSameDayRes.updatedAt = new Date().toISOString();
            if (!Array.isArray(incomingSameDayRes.auditLogs)) incomingSameDayRes.auditLogs = [];
            incomingSameDayRes.auditLogs.push({
              id: `audit_sunday_swap_${Date.now()}`,
              timestamp: new Date().toISOString(),
              action: 'reallocated_sunday_late_checkout',
              source: 'Sofia IA (Regra Late Check-out Domingo)',
              description: `Reserva remanejada automaticamente do Flat ${oldIncomingFlat} para o Flat ${fairFlat.number} (Flat da Vez) para manter o hóspede atual até as ${horarioFormatado} no domingo.`,
            });
            proximoHospedeRemanejadoPara = String(fairFlat.number);
          } else {
            const msgNoSwap =
              `Informe ao hóspede com muita empatia que hoje há outro hóspede entrando no ${reserva.nome_imovel} e todos os demais flats estão ocupados para remanejamento, ` +
              `mas que ele tem cortesia garantida para sair até as *13:00h*!`;
            return {
              status: 'BLOQUEADO_PELA_REGRA',
              codigo_regra_bloqueio: 'CONFLITO_LIMPEZA_PROXIMO_HOSPEDE',
              dados: { horario_padrao: '12:00', tolerancia_maxima: '13:00' },
              instrucao_para_ia: msgNoSwap,
              instrucao_resposta_ia: msgNoSwap,
            };
          }
        }

        if (targetRes) {
          targetRes.lateCheckout = true;
          targetRes.lateCheckoutTime = horarioFormatado;
          targetRes.checkoutTime = horarioFormatado;
          targetRes.lateCheckoutFee = 0;
          targetRes.lateCheckoutApprovedAt = new Date().toISOString();
          targetRes.updatedAt = new Date().toISOString();
          if (typeof context.runtime?.saveDatabase === 'function') {
            await context.runtime.saveDatabase();
          }
        }

        const msgCortesia = isSundayLowOccupancy && horarioFormatado > '13:00'
          ? `Confirme com entusiasmo que, como hoje é domingo e nossa ocupação permite, liberamos como *cortesia gratuita* o seu late check-out até as *${horarioFormatado}* no *${reserva.nome_imovel}*! ` +
            `Informe que a programação da governança e da portaria já foi atualizada automaticamente (ao sair, basta devolver o Cartão NFC na recepção).`
          : `Confirme com entusiasmo que o late check-out até as *${horarioFormatado}* foi liberado como *cortesia gratuita* (+1h de tolerância) no *${reserva.nome_imovel}* ` +
            `e que a programação da governança já foi atualizada no sistema!`;

        return {
          status: 'SUCESSO_EXECUTADO',
          dados: {
            reserva_id: reserva.id,
            novo_horario_checkout: horarioFormatado,
            cortesia: true,
            valor_taxa: 0,
            domingo_ocupacao_abaixo_50: isSundayLowOccupancy,
            proximo_hospede_remanejado_para_flat: proximoHospedeRemanejadoPara,
          },
          instrucao_para_ia: msgCortesia,
          instrucao_resposta_ia: msgCortesia,
        };
      }

      // CASO 2: Acima do horário de cortesia (após 13:00h Seg-Sáb ou após 18:00h no Domingo)
      if (incomingSameDayRes) {
        const msgConflito =
          `Informe ao hóspede com muita empatia que infelizmente não conseguimos estender a saída para as ${horarioFormatado} ` +
          `porque há outro hóspede com check-in programado hoje no ${reserva.nome_imovel} e nossa governança precisa higienizar o apartamento. ` +
          `Ofereça a nossa *cortesia gratuita até as 13:00h* (+1h de tolerância) e informe que ele pode deixar as malas guardadas na recepção se precisar!`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'CONFLITO_LIMPEZA_PROXIMO_HOSPEDE',
          motivo_tecnico: `Existe uma nova reserva entrando no mesmo dia (${dataCheckout}) no ${reserva.nome_imovel}.`,
          dados: { horario_padrao: '12:00', tolerancia_maxima: '13:00' },
          instrucao_para_ia: msgConflito,
          instrucao_resposta_ia: msgConflito,
        };
      }

      // Sem conflito de entrada no mesmo dia, mas acima do limite gratuito -> Cobra 1 diária inteira (100%)
      if (!confirmado) {
        const explicacaoRegra = isSundayLowOccupancy
          ? `aos domingos com baixa ocupação oferecemos cortesia gratuita até as *18:00h*, e após as 18:00h o sistema contabiliza *1 diária inteira* (R$ ${valorDiaria.toFixed(2)})`
          : `de segunda a sábado (ou domingos de alta ocupação) nosso check-out padrão é às 12:00h com *cortesia gratuita até as 13:00h*, e após as 13:00h aplica-se o valor de *1 diária inteira* (R$ ${valorDiaria.toFixed(2)})`;
        const msgSim =
          `Informe ao hóspede com transparência que ${explicacaoRegra}. ` +
          `Pergunte se o horário de cortesia gratuita até as *${horarioLimiteCortesia}* atende a necessidade dele sem custo ou se ele prefere confirmar a diária adicional de *R$ ${valorDiaria.toFixed(2)}* para permanecer até as ${horarioFormatado} (ou até o dia seguinte).`;
        return {
          status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
          dados: {
            horario_solicitado: horarioFormatado,
            horario_cortesia_gratuita: horarioLimiteCortesia,
            tipo_taxa: 'DIARIA_INTEIRA',
            valor_taxa: valorDiaria,
            moeda: 'BRL',
          },
          instrucao_para_ia: msgSim,
          instrucao_resposta_ia: msgSim,
        };
      }

      // Hóspede confirmou o pagamento da diária inteira para o late check-out
      const pixCharge = await generatePixChargeForService({
        amount: valorDiaria,
        description: `Late Check-out (${horarioFormatado} - 1 Diária) - Reserva ${reserva.id}`,
        debtorName: targetRes?.guestName || context.hospede?.nome || 'Hospede CorpFlats',
        debtorDocument: targetRes?.guestDocument || targetRes?.guestCpf || '',
        reservationCode: reserva.id,
        context,
      });

      if (targetRes) {
        targetRes.lateCheckoutTime = horarioFormatado;
        targetRes.checkoutTime = horarioFormatado;
        targetRes.lateCheckoutFee = valorDiaria;
        targetRes.pendingLateCheckout = {
          txid: pixCharge.txid,
          pixCopiaECola: pixCharge.pixCopiaECola,
          amount: valorDiaria,
          requestedTime: horarioFormatado,
          status: 'pending_payment',
          requestedAt: new Date().toISOString(),
        };
        targetRes.updatedAt = new Date().toISOString();
        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }
      }

      const msgPago =
        `Envie ao hóspede o código PIX Copia e Cola (${pixCharge.pixCopiaECola}) no valor de *R$ ${valorDiaria.toFixed(2)}* (1 diária) referente à saída às *${horarioFormatado}* no *${reserva.nome_imovel}*. ` +
        `Confirme que assim que o pagamento PIX for compensado, a extensão de horário estará 100% liberada no sistema e na governança!`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          reserva_id: reserva.id,
          novo_horario_checkout: horarioFormatado,
          cortesia: false,
          valor_taxa: valorDiaria,
          aguardando_pagamento_pix: true,
          txid: pixCharge.txid,
          pix_copia_e_cola: pixCharge.pixCopiaECola,
        },
        instrucao_para_ia: msgPago,
        instrucao_resposta_ia: msgPago,
      };
    } catch (error) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'MEDIA',
        categoria: 'ERRO_SISTEMA_TOOL',
        hospede_nome: context.hospede?.nome || 'Desconhecido',
        telefone: context.telefone_remetente,
        resumo: `Falha técnica ao executar solicitar_late_checkout (${args.horario_solicitado}): ${error.message}`,
        context,
      });

      const msg =
        'Peça desculpas ao hóspede dizendo que o sistema de reservas apresentou uma instabilidade momentânea ao tentar gravar a alteração, ' +
        'mas que você já enviou um alerta automático direto para o WhatsApp da gerência para concluírem a liberação manualmente em instantes.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

export const alterarDatasReservaTool = {
  name: 'alterar_datas_reserva',
  description:
    'Simula ou efetiva a alteração de datas de check-in ou check-out da reserva ativa do hóspede, ' +
    'exigindo antecedência mínima de 24 horas antes do check-in e validando disponibilidade real no calendário.',
  allowedStates: ['PRE_CHECKIN', 'IN_STAY_CONCIERGE', 'POS_CHECKOUT'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      nova_data_checkin: {
        type: 'STRING',
        description: 'Nova data de entrada no formato YYYY-MM-DD.',
      },
      nova_data_checkout: {
        type: 'STRING',
        description: 'Nova data de saída no formato YYYY-MM-DD.',
      },
      efetivar_alteracao: {
        type: 'BOOLEAN',
        description:
          'Passe FALSE primeiro para apenas simular valores e disponibilidade. ' +
          'Passe TRUE somente após o hóspede confirmar explicitamente na conversa que aceita a alteração e eventual diferença tarifária.',
      },
      flat_alvo: {
        type: 'STRING',
        description:
          'Opcional (apenas para pacotes multi-flat): número do flat ou código da reserva filha que terá as datas alteradas (ex: "502" ou "RES-102").',
      },
    },
    required: ['nova_data_checkin', 'nova_data_checkout', 'efetivar_alteracao'],
  },
  async execute(args, context) {
    try {
      const reserva = context.reserva_ativa || context.reserva_atual;
      if (!reserva) {
        const msg =
          'Explique educadamente que você não localizou uma reserva ativa vinculada a este número de telefone e peça o código da reserva ou CPF do titular.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const db = context.runtime?.db;
      let targetRes = Array.isArray(db?.reservations)
        ? db.reservations.find((r) => matchesSessionReservation(r, reserva))
        : null;

      const ocultarFinanceiro = Boolean(
        reserva.ocultar_financeiro ||
          (targetRes && evaluateReservationFinancialPrivacy(targetRes, context.telefone_remetente).ocultarFinanceiro)
      );
      if (ocultarFinanceiro) {
        const nomeSolicitanteRef =
          targetRes?.requesterInfo?.name ||
          targetRes?.requesterName ||
          targetRes?.companyName ||
          targetRes?.agencyName ||
          'o solicitante responsável pela reserva';
        const msgPriv =
          `Explique educadamente que, por se tratar de uma reserva vinculada a *${nomeSolicitanteRef}*, ` +
          `alterações de datas e ajustes tarifários são gerenciados exclusivamente pelo solicitante responsável pela reserva. ` +
          `NÃO informe valores de diárias ou totais na resposta.`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'PRIVACIDADE_FINANCEIRA_EXCLUSIVO_SOLICITANTE',
          dados: { ocultar_financeiro: true },
          instrucao_para_ia: msgPriv,
          instrucao_resposta_ia: msgPriv,
        };
      }

      const pkgCodeAlt = String(
        targetRes?.packageCode || targetRes?.packageId || reserva?.pacote_multi_flat?.package_code || ''
      )
        .trim()
        .toUpperCase();
      if (pkgCodeAlt && args.flat_alvo && db) {
        const alvoNorm = String(args.flat_alvo).replace(/^Flat\s+/i, '').trim().toUpperCase();
        const pkgSiblings = getPackageReservations(db, pkgCodeAlt).filter((r) => isPackageItemActive(r));
        const matchedSibling = pkgSiblings.find(
          (r) =>
            String(r.flatNumber || '').toUpperCase() === alvoNorm ||
            String(r.code || '').toUpperCase() === alvoNorm ||
            String(r.id || '') === alvoNorm
        );
        if (matchedSibling) {
          targetRes = matchedSibling;
        }
      }

      const refCheckinAtual = String(targetRes?.checkinDate || reserva.data_checkin).slice(0, 10);
      const refCheckoutAtual = String(targetRes?.checkoutDate || reserva.data_checkout).slice(0, 10);
      const refNomeImovel = targetRes?.flatNumber ? `Flat ${targetRes.flatNumber}` : reserva.nome_imovel;
      const refReservaCodigo = String(targetRes?.code || reserva.id);

      const novaEntrada =
        resolveNaturalDateInput(args.nova_data_checkin, context.data_hora_atual, refCheckinAtual) ||
        String(args.nova_data_checkin || refCheckinAtual).slice(0, 10);
      const novaSaida =
        resolveNaturalDateInput(args.nova_data_checkout, context.data_hora_atual, refCheckoutAtual) ||
        String(args.nova_data_checkout || refCheckoutAtual).slice(0, 10);
      const confirmado = Boolean(args.efetivar_alteracao ?? args.confirmacao_hospede ?? false);

      const isUnpaidPreRes =
        targetRes &&
        String(targetRes.status || '').toLowerCase() === 'pre_reserva' &&
        !isReservationSettledInPackage(targetRes);

      // Trava de 24 horas de antecedência antes do check-in para alteração de data de entrada (exceto pré-reserva ainda pendente)
      if (!isUnpaidPreRes && novaEntrada !== refCheckinAtual) {
        const nowMs = new Date(context.data_hora_atual || Date.now()).getTime();
        const checkinMs = new Date(`${refCheckinAtual}T14:00:00-03:00`).getTime();
        const hoursUntilCheckin = (checkinMs - nowMs) / (1000 * 60 * 60);
        if (!Number.isNaN(hoursUntilCheckin) && hoursUntilCheckin < 24) {
          const msg24h =
            `Explique ao hóspede com empatia que a nossa regra de alteração de data de check-in exige antecedência mínima de *24 horas* antes do horário de entrada (14:00h do dia ${refCheckinAtual}). ` +
            `Informe que, se ele precisar de uma análise de exceção pela gerência, você pode acionar o gestor no WhatsApp agora mesmo.`;
          return {
            status: 'BLOQUEADO_PELA_REGRA',
            codigo_regra_bloqueio: 'ANTECEDENCIA_MINIMA_24H_ALTERACAO',
            dados: {
              data_checkin_atual: refCheckinAtual,
              horas_restantes_para_checkin: Math.round(hoursUntilCheckin * 10) / 10,
              antecedencia_minima_horas: 24,
            },
            instrucao_para_ia: msg24h,
            instrucao_resposta_ia: msg24h,
          };
        }
      }

      const novasDiarias = diffDays(novaEntrada, novaSaida);
      if (novasDiarias <= 0) {
        const msg =
          `Explique ao hóspede que a data de saída (${novaSaida}) precisa ser posterior à data de entrada (${novaEntrada}) e peça para confirmar o período desejado.`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'PERIODO_INVALIDO',
          dados: { nova_data_checkin: novaEntrada, nova_data_checkout: novaSaida },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const flatNumber = refNomeImovel.replace(/^Flat\s+/i, '').trim();
      const targetFlatId = targetRes?.flatId || reserva.imovel_id;
      const nowCheckMs = Date.now();

      let conflitoReserva = null;
      if (Array.isArray(db?.reservations)) {
        conflitoReserva = db.reservations.find((r) => {
          if (!r) return false;
          const st = String(r.status || '').toLowerCase().trim();
          if (['cancelada', 'cancelado', 'cancelled', 'expirada', 'expired', 'no_show', 'completed', 'concluida', 'checked_out'].includes(st) || r.checkoutCompleted || r.checkoutDone) return false;
          const expRaw = r.expiresAt || r.holdExpiresAt;
          if (st === 'pre_reserva' && expRaw) {
            const expMs = new Date(expRaw).getTime();
            if (!Number.isNaN(expMs) && expMs <= nowCheckMs) return false;
          }
          if (targetRes ? String(r.id) === String(targetRes.id) : matchesSessionReservation(r, reserva)) return false;
          const sameFlat =
            String(r.flatNumber || '') === flatNumber ||
            String(r.flatId || '') === String(targetFlatId);
          if (!sameFlat) return false;
          const rIn = String(r.checkinDate || '').slice(0, 10);
          const rOut = String(r.checkoutDate || '').slice(0, 10);
          return novaEntrada < rOut && novaSaida > rIn;
        });
      }

      if (conflitoReserva) {
        const msg =
          `Informe ao hóspede com empatia que o ${refNomeImovel} já possui outra reserva confirmada conflitando com o período de ${novaEntrada} a ${novaSaida}. ` +
          `Pergunte se ele gostaria que você verificasse a disponibilidade de outro flat equivalente para essas novas datas.`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'CONFLITO_CALENDARIO_IMOVEL',
          dados: {
            imovel: refNomeImovel,
            nova_data_checkin: novaEntrada,
            nova_data_checkout: novaSaida,
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      // Fluxo especial: Item de Pacote Multi-Flat ainda pendente de pagamento -> Recalcula o PIX único do pacote!
      if (pkgCodeAlt && targetRes && !isReservationSettledInPackage(targetRes)) {
        const baseUrlPkg =
          db?.settings?.baseUrl ||
          (typeof process !== 'undefined' && process.env?.SERVER_BASE_URL) ||
          'https://corpflats.com.br';
        const guestCountItem = Math.max(1, Number(targetRes.guestCount || targetRes.adults) || 1);
        const twinPrefItem = targetRes.twinBeds || targetRes.bedType === 'twin' ? 'solteiro' : 'casal';
        const comCafeItem = Boolean(targetRes.includeBreakfast || targetRes.breakfastIncluded || targetRes.ratePlan === 'with_breakfast');
        const qItem = resolveAgentLivePricingQuote(db, novaEntrada, novaSaida, guestCountItem, twinPrefItem);
        const newItemTotal = comCafeItem ? qItem.totalComCafePix : qItem.totalSemCafePix;
        const oldItemTotal = Number(targetRes.totalAmount) || 0;
        const pkgBefore = computePackageSummary(db, pkgCodeAlt, { baseUrl: baseUrlPkg, computeCardAmountFromPix });
        const projectedPkgTotal = Math.max(
          0,
          Number((((pkgBefore?.totalAmount ?? oldItemTotal) - oldItemTotal) + newItemTotal).toFixed(2))
        );
        const projectedPkgCard = computeCardAmountFromPix(projectedPkgTotal);

        if (!confirmado) {
          const msgPkgSim =
            `Informe ao solicitante que o *${refNomeImovel}* (${refReservaCodigo}) do pacote *${pkgCodeAlt}* está disponível para o novo período de *${novaEntrada} a ${novaSaida}* (${novasDiarias} diária(s)). ` +
            `O valor deste flat passa de R$ ${oldItemTotal.toFixed(2)} para *R$ ${newItemTotal.toFixed(2)}*, e o novo total consolidado do pacote ficará em *R$ ${projectedPkgTotal.toFixed(2)}* no PIX único (ou R$ ${projectedPkgCard.toFixed(2)} no Cartão). ` +
            `Pergunte se ele confirma a alteração para você já atualizar o pacote e recalcular o PIX único.`;
          return {
            status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
            dados: {
              package_code: pkgCodeAlt,
              reserva_id: refReservaCodigo,
              imovel: refNomeImovel,
              nova_data_checkin: novaEntrada,
              nova_data_checkout: novaSaida,
              novas_diarias: novasDiarias,
              valor_anterior_flat: oldItemTotal,
              novo_valor_flat: newItemTotal,
              novo_total_pacote_pix: projectedPkgTotal,
              novo_total_pacote_cartao: projectedPkgCard,
              moeda: 'BRL',
            },
            instrucao_para_ia: msgPkgSim,
            instrucao_resposta_ia: msgPkgSim,
          };
        }

        const cleaningFeeItem = comCafeItem ? 0 : qItem.taxaLimpezaSemCafe;
        const netRoomItem = Math.max(0, newItemTotal - cleaningFeeItem - qItem.adicionalTerceiroHospedeTotal - qItem.twinFee);
        const dailyRateItem = Math.round((netRoomItem / novasDiarias) * 100) / 100;
        const inDateItem = new Date(`${novaEntrada}T12:00:00Z`);
        const nightlyArrItem = comCafeItem ? qItem.comCafeNightlyRates : qItem.discountedNightlyRates;
        targetRes.checkinDate = novaEntrada;
        targetRes.checkoutDate = novaSaida;
        targetRes.nights = novasDiarias;
        targetRes.totalAmount = newItemTotal;
        targetRes.cardTotalAmount = computeCardAmountFromPix(newItemTotal);
        targetRes.dailyRate = dailyRateItem;
        targetRes.cleaningFee = cleaningFeeItem;
        targetRes.dailyRates = Array.from({ length: novasDiarias }, (_, i) => ({
          date: new Date(inDateItem.getTime() + i * 86400000).toISOString().slice(0, 10),
          rate: nightlyArrItem[i] ?? dailyRateItem,
          channel: targetRes.channel || 'whatsapp',
        }));
        targetRes.updatedAt = new Date().toISOString();

        const syncedPkg = await syncPackagePixAndPaymentLinks(db, pkgCodeAlt, {
          baseUrl: baseUrlPkg,
          createInterPixCob: globalThis.createInterPixCob,
          generateStaticPixPayload,
          computeCardAmountFromPix,
          saveDatabase: context.runtime?.saveDatabase,
          forceRegeneratePix: true,
        });
        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }

        const updatedPending = syncedPkg?.pendingAmount ?? projectedPkgTotal;
        const updatedCard = syncedPkg?.cardPendingAmount ?? computeCardAmountFromPix(updatedPending);
        const updatedPix = syncedPkg?.pixCopiaECola || '';
        const pkgTokAlt = ensureRequesterPortalToken(db, pkgCodeAlt);
        const updatedPortal = syncedPkg?.packagePortalUrl || `${baseUrlPkg}/solicitante/${encodeURIComponent(pkgCodeAlt)}${pkgTokAlt ? `?t=${encodeURIComponent(pkgTokAlt)}` : ''}`;
        const msgPkgDone =
          `Confirme com cordialidade que o *${refNomeImovel}* (${refReservaCodigo}) no pacote *${pkgCodeAlt}* foi atualizado para *${novaEntrada} a ${novaSaida}* (${novasDiarias} diária(s))! ` +
          `O novo saldo consolidado do pacote (${syncedPkg?.activeFlatsCount || 1} flat(s)) foi recalculado para *R$ ${updatedPending.toFixed(2)}* no PIX único (ou R$ ${updatedCard.toFixed(2)} no Cartão). ` +
          (updatedPix ? `Envie o código PIX único recalculado (\`${updatedPix}\`) e o link do painel do pacote (${updatedPortal}).` : `Envie o link do painel do pacote (${updatedPortal}).`);

        return {
          status: 'SUCESSO_EXECUTADO',
          dados: {
            package_code: pkgCodeAlt,
            reserva_id: refReservaCodigo,
            imovel: refNomeImovel,
            nova_data_checkin: novaEntrada,
            nova_data_checkout: novaSaida,
            novas_diarias: novasDiarias,
            novo_valor_flat: newItemTotal,
            novo_total_pacote: syncedPkg?.totalAmount ?? projectedPkgTotal,
            valor_pendente_pacote: updatedPending,
            valor_cartao_pacote: updatedCard,
            pix_copia_e_cola: updatedPix,
            link_pagamento: updatedPortal,
          },
          instrucao_para_ia: msgPkgDone,
          instrucao_resposta_ia: msgPkgDone,
        };
      }

      const diariasAtuais = Math.max(1, diffDays(reserva.data_checkin, reserva.data_checkout));
      const diferencaDiarias = novasDiarias - diariasAtuais;
      const tarifaBaseDiaria = Number(reserva.valor_diaria || 237.0);
      const diferencaValor = Math.max(0, Number((diferencaDiarias * tarifaBaseDiaria).toFixed(2)));

      if (!confirmado) {
        const detalheValor =
          diferencaValor > 0
            ? `há um acréscimo de ${diferencaDiarias} diária(s) no valor total de R$ ${diferencaValor.toFixed(2)}`
            : 'não há cobrança adicional de diárias para essa alteração';
        const msg =
          `Informe ao hóspede que o ${reserva.nome_imovel} está disponível para o novo período de ${novaEntrada} a ${novaSaida} (${novasDiarias} diária(s)) e que ${detalheValor}. ` +
          `Pergunte se ele confirma a alteração para você efetivar a atualização no sistema.`;
        return {
          status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
          dados: {
            reserva_id: reserva.id,
            nova_data_checkin: novaEntrada,
            nova_data_checkout: novaSaida,
            novas_diarias: novasDiarias,
            diferenca_diarias: diferencaDiarias,
            diferenca_valor: diferencaValor,
            moeda: 'BRL',
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      let pixChargeAlt = null;
      let expiraEmIsoAlt = '';
      let expiraEmHoraAlt = '';
      if (Array.isArray(db?.reservations)) {
        const targetRes = db.reservations.find((r) => matchesSessionReservation(r, reserva));
        if (targetRes) {
          const nowDateAlt = new Date();
          const nowIsoAlt = nowDateAlt.toISOString();
          const priorExtAlt =
            targetRes.pendingStayExtension?.isPreReservationHold &&
            targetRes.pendingStayExtension?.status === 'pending_payment'
              ? targetRes.pendingStayExtension
              : null;
          const origCheckinAlt = String(priorExtAlt?.oldCheckinDate || targetRes.checkinDate || reserva.data_checkin).slice(0, 10);
          const origCheckoutAlt = String(priorExtAlt?.oldCheckoutDate || targetRes.checkoutDate || reserva.data_checkout).slice(0, 10);
          const origDailyRatesAlt = priorExtAlt?.oldDailyRates
            ? priorExtAlt.oldDailyRates.map((d) => ({ ...d }))
            : Array.isArray(targetRes.dailyRates)
              ? targetRes.dailyRates.map((d) => ({ ...d }))
              : [];
          const origChargesAlt = priorExtAlt?.oldCharges
            ? priorExtAlt.oldCharges.map((c) => ({ ...c }))
            : Array.isArray(targetRes.charges)
              ? targetRes.charges.map((c) => ({ ...c }))
              : [];
          const origCleaningFeeAlt =
            priorExtAlt?.oldCleaningFee !== undefined ? Number(priorExtAlt.oldCleaningFee) || 0 : Number(targetRes.cleaningFee) || 0;
          const origTotalAlt =
            priorExtAlt?.oldTotalAmount !== undefined ? Number(priorExtAlt.oldTotalAmount) || 0 : Number(targetRes.totalAmount) || 0;
          const origPaidAltRaw =
            priorExtAlt?.oldPaidAmount !== undefined ? Number(priorExtAlt.oldPaidAmount) || 0 : Number(targetRes.paidAmount) || 0;
          const origPaymentStatusAlt = priorExtAlt?.oldPaymentStatus || targetRes.paymentStatus || 'pago_total';
          const origChannelAlt = priorExtAlt?.oldChannel || targetRes.channel || '';
          const isPaidOrOtaAlt =
            origPaidAltRaw > 0 ||
            ['pago_total', 'pago', 'paid'].includes(String(origPaymentStatusAlt).toLowerCase()) ||
            ['booking', 'airbnb', 'expedia', 'decolar', 'vrbo', 'ota'].includes(String(origChannelAlt).toLowerCase());
          const origPaidAlt = origPaidAltRaw > 0 ? origPaidAltRaw : (isPaidOrOtaAlt ? origTotalAlt : 0);

          targetRes.checkinDate = novaEntrada;
          targetRes.checkoutDate = novaSaida;
          targetRes.nights = novasDiarias;

          if (diferencaValor > 0) {
            pixChargeAlt = await generatePixChargeForService({
              amount: diferencaValor,
              description: `Alteração/Extensão de Estadia (+${Math.max(1, diferencaDiarias)} diária(s) até ${novaSaida}) - Reserva ${reserva.id}`,
              debtorName: targetRes?.guestName || context.hospede?.nome || 'Hospede CorpFlats',
              debtorDocument: targetRes?.guestDocument || targetRes?.guestCpf || '',
              reservationCode: reserva.id,
              context,
            });

            const addedDatesAlt = [];
            for (let i = 0; i < novasDiarias; i++) {
              const dtStr = new Date(new Date(`${novaEntrada}T12:00:00Z`).getTime() + i * 86400000)
                .toISOString()
                .slice(0, 10);
              if (dtStr < origCheckinAlt || dtStr >= origCheckoutAlt) {
                addedDatesAlt.push(dtStr);
              }
            }
            const addedDailyRatesAlt = addedDatesAlt.map((dt) => ({
              date: dt,
              rate: tarifaBaseDiaria,
              channel: 'whatsapp',
            }));
            if (origDailyRatesAlt.length > 0) {
              const keptRates = origDailyRatesAlt.filter((d) => d && d.date >= novaEntrada && d.date < novaSaida);
              targetRes.dailyRates = [...keptRates, ...addedDailyRatesAlt].sort((a, b) =>
                String(a.date).localeCompare(String(b.date))
              );
            }

            const newTotalAlt = Number(((typeof targetRes.totalAmount === 'number' ? targetRes.totalAmount : origTotalAlt) + diferencaValor).toFixed(2));
            targetRes.totalAmount = newTotalAlt;
            targetRes.cardTotalAmount = computeCardAmountFromPix(newTotalAlt);
            targetRes.pixCopiaECola = pixChargeAlt.pixCopiaECola;
            targetRes.pixTxId = pixChargeAlt.txid;
            targetRes.pixChargedAmount = diferencaValor;
            if (origPaidAlt > 0 && origPaidAlt < newTotalAlt) {
              targetRes.paymentStatus = 'parcial';
            }

            const resolveHoldFn = globalThis.resolveStayExtensionHold;
            const holdInfoAlt =
              typeof resolveHoldFn === 'function'
                ? resolveHoldFn({ source: 'whatsapp_ai' }, addedDatesAlt[0] || origCheckoutAlt)
                : {
                    expiresAt: new Date(nowDateAlt.getTime() + 30 * 60 * 1000).toISOString(),
                    reminderAt: new Date(nowDateAlt.getTime() + 20 * 60 * 1000).toISOString(),
                    reminderLeadMinutes: 10,
                    reminderLeadLabel: '10 minutos',
                    sendExpirationReminder: true,
                    holdPreset: '30m',
                    holdDurationMinutes: 30,
                    holdDurationLabel: '30 minutos',
                  };
            expiraEmIsoAlt = holdInfoAlt.expiresAt;
            expiraEmHoraAlt = new Intl.DateTimeFormat('pt-BR', {
              timeZone: 'America/Sao_Paulo',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            }).format(new Date(holdInfoAlt.expiresAt));

            const hadSignedFnrhAlt = Boolean(
              targetRes.preCheckinCompleted ||
                targetRes.fnrhSignedAt ||
                targetRes.signatureDataUrl ||
                targetRes.fnrhSignature ||
                targetRes.checkinDone ||
                targetRes.actualCheckinAt
            );

            targetRes.oldCheckoutDateBeforeExtension = origCheckoutAlt;
            targetRes.pendingStayExtension = {
              isPreReservationHold: true,
              source: 'whatsapp_ai',
              txid: pixChargeAlt.txid,
              pixCopiaECola: pixChargeAlt.pixCopiaECola,
              paymentUrl: pixChargeAlt.paymentUrl,
              amount: Number((newTotalAlt - origPaidAlt).toFixed(2)),
              oldCheckinDate: origCheckinAlt,
              oldCheckoutDate: origCheckoutAlt,
              newCheckinDate: novaEntrada,
              newCheckoutDate: novaSaida,
              addedDates: addedDatesAlt,
              addedDailyRates: addedDailyRatesAlt,
              oldDailyRates: origDailyRatesAlt,
              oldCharges: origChargesAlt,
              oldCleaningFee: origCleaningFeeAlt,
              oldTotalAmount: origTotalAlt,
              oldPaidAmount: origPaidAlt,
              oldPaymentStatus: origPaymentStatusAlt,
              oldChannel: origChannelAlt,
              alreadyAppliedToReservation: true,
              requiresDeferredReSignature: hadSignedFnrhAlt,
              extraNights: Math.max(1, addedDatesAlt.length || diferencaDiarias),
              newTotalNights: novasDiarias,
              status: 'pending_payment',
              expiresAt: holdInfoAlt.expiresAt,
              reminderAt: holdInfoAlt.reminderAt,
              reminderLeadMinutes: holdInfoAlt.reminderLeadMinutes,
              reminderLeadLabel: holdInfoAlt.reminderLeadLabel,
              sendExpirationReminder: holdInfoAlt.sendExpirationReminder !== false,
              holdPreset: holdInfoAlt.holdPreset || '30m',
              holdDurationMinutes: holdInfoAlt.holdDurationMinutes || 30,
              holdDurationLabel: holdInfoAlt.holdDurationLabel || '30 minutos',
              requestedAt: nowIsoAlt,
            };

            if (Array.isArray(db?.cleaningRequests)) {
              for (const cr of db.cleaningRequests) {
                if (
                  cr &&
                  String(cr.flatNumber) === flatNumber &&
                  cr.requestDate === origCheckoutAlt &&
                  cr.status !== 'clean'
                ) {
                  if (cr.previousAdminNoteBeforeExtension === undefined) {
                    cr.previousAdminNoteBeforeExtension = cr.adminNote || null;
                  }
                  cr.originalRequestDateBeforeExtension = cr.originalRequestDateBeforeExtension || origCheckoutAlt;
                  cr.extensionHoldReservationId = targetRes.id;
                  cr.extensionHoldExpiresAt = holdInfoAlt.expiresAt;
                  cr.isExtendedStay = true;
                  cr.extendedUntil = novaSaida;
                  cr.adminNote = `⏳ Prorrogação em Pré-Reserva aguardando pagamento até ${expiraEmHoraAlt} (Não realizar limpeza de check-out por enquanto).`;
                }
              }
            }
          }

          targetRes.updatedAt = nowIsoAlt;
          if (typeof context.runtime?.saveDatabase === 'function') {
            await context.runtime.saveDatabase();
          }

          if (diferencaValor > 0) {
            const triggerFn = context.runtime?.triggerImmediateWhatsApp || globalThis.triggerImmediateWhatsApp;
            if (typeof triggerFn === 'function') {
              try {
                await triggerFn(db, context.runtime?.saveDatabase, 'additional_daily_pending', targetRes);
              } catch (trigErr) {
                console.warn('[alterar_datas_reserva] Erro ao disparar additional_daily_pending:', trigErr?.message || trigErr);
              }
            }
          }
        }
      }

      const qtdHospedesAlt = Number(reserva.quantidade_hospedes || 1);
      const canalLabelAlt = reserva.canal_reserva_nome || formatReservationChannelLabel(reserva.canal_reserva || 'whatsapp');
      const msg =
        diferencaValor > 0
          ? `Confirme com cordialidade que as diárias extras da reserva ${reserva.id} no ${reserva.nome_imovel} (${novaEntrada} a ${novaSaida}, ${novasDiarias} diária(s)) já foram bloqueadas no mapa como *Pré-Reserva da Diária Extra* por *30 minutos*${expiraEmHoraAlt ? ` (até as *${expiraEmHoraAlt}*)` : ''}! ` +
            (pixChargeAlt ? `Envie o código PIX Copia e Cola (${pixChargeAlt.pixCopiaECola}) no valor de *R$ ${diferencaValor.toFixed(2)}* e o link do portal seguro (${pixChargeAlt.paymentUrl}). ` : '') +
            `Tranquilize o hóspede explicando que, caso não pague dentro do prazo, apenas a(s) diária(s) extra(s) expira(m) e sua reserva original segue 100% confirmada (Total de Hóspedes: *${qtdHospedesAlt}* • Canal: *${canalLabelAlt}*).`
          : `Confirme com cordialidade que a reserva ${reserva.id} no ${reserva.nome_imovel} já foi atualizada no sistema para o novo período de ${novaEntrada} a ${novaSaida} (${novasDiarias} diária(s)), ` +
            `mantendo no resumo o Total de Hóspedes (*${qtdHospedesAlt}*) e o Canal da Reserva (*${canalLabelAlt}*).`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          reserva_id: reserva.id,
          nova_data_checkin: novaEntrada,
          nova_data_checkout: novaSaida,
          novas_diarias: novasDiarias,
          quantidade_hospedes: qtdHospedesAlt,
          canal_reserva: canalLabelAlt,
          diferenca_valor: diferencaValor,
          ...(pixChargeAlt
            ? {
                txid: pixChargeAlt.txid,
                pix_copia_e_cola: pixChargeAlt.pixCopiaECola,
                link_pagamento: pixChargeAlt.paymentUrl,
                pre_reserva_diaria_extra_expira_em: expiraEmIsoAlt,
              }
            : {}),
        },
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    } catch (error) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'MEDIA',
        categoria: 'ERRO_SISTEMA_TOOL',
        hospede_nome: context.hospede?.nome || 'Desconhecido',
        telefone: context.telefone_remetente,
        resumo: `Falha técnica ao executar alterar_datas_reserva (${args.nova_data_checkin} a ${args.nova_data_checkout}): ${error.message}`,
        context,
      });

      const msg =
        'Peça desculpas ao hóspede informando que o sistema apresentou uma instabilidade ao gravar a mudança de datas, ' +
        'mas que você já acionou a gerência no WhatsApp para concluírem a alteração manualmente em instantes.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

export const estenderEstadiaTool = {
  name: 'estender_estadia',
  description:
    'Prorroga a estadia do hóspede até uma nova data de saída (nova_data_checkout). ' +
    'Reaproveita o cálculo oficial de extensão da reserva, gera a cobrança PIX das diárias extras se o flat atual estiver livre, ' +
    'e caso o flat atual tenha outra reserva futura entrando no período, prioriza manter o hóspede já hospedado e consulta o gestor no WhatsApp (5522998505276) para autorizar o remanejamento do próximo hóspede para o Flat da Vez.',
  allowedStates: ['IN_STAY_CONCIERGE', 'PRE_CHECKIN', 'POS_CHECKOUT'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      nova_data_checkout: {
        type: 'STRING',
        description:
          'Nova data desejada de saída (check-out) no formato YYYY-MM-DD (ou expressão relativa informada pelo hóspede, como "amanhã"). Se o hóspede ainda não informou a data, passe string vazia "".',
      },
      confirmacao_hospede: {
        type: 'BOOLEAN',
        description:
          'Passe FALSE primeiro para consultar disponibilidade e informar o valor das diárias adicionais. ' +
          'Passe TRUE somente após o hóspede confirmar explicitamente na conversa.',
      },
    },
    required: ['nova_data_checkout', 'confirmacao_hospede'],
  },
  async execute(args, context) {
    try {
      const reserva = context.reserva_ativa || context.reserva_atual;
      if (!reserva) {
        const msg =
          'Explique educadamente que não localizamos uma reserva ativa vinculada a este telefone e peça o código da reserva ou número do flat.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const db = context.runtime?.db;
      const flatNumber = reserva.nome_imovel.replace(/^Flat\s+/i, '').trim();
      const targetRes = Array.isArray(db?.reservations)
        ? db.reservations.find((r) => matchesSessionReservation(r, reserva))
        : null;

      const ocultarFinanceiroExt = Boolean(
        reserva.ocultar_financeiro ||
          (targetRes && evaluateReservationFinancialPrivacy(targetRes, context.telefone_remetente).ocultarFinanceiro)
      );
      if (ocultarFinanceiroExt) {
        const nomeSolicitanteExt =
          targetRes?.requesterInfo?.name ||
          targetRes?.requesterName ||
          targetRes?.companyName ||
          targetRes?.agencyName ||
          'o solicitante responsável pela reserva';
        const msgPrivExt =
          `Explique educadamente que, por se tratar de uma reserva vinculada a *${nomeSolicitanteExt}*, ` +
          `solicitações de prorrogação de estadia e diárias adicionais devem ser tratadas pelo solicitante responsável pela reserva (ou você pode acionar a gerência caso ele precise de apoio). ` +
          `NÃO informe valores de diárias ou totais na resposta.`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'PRIVACIDADE_FINANCEIRA_EXCLUSIVO_SOLICITANTE',
          dados: { ocultar_financeiro: true },
          instrucao_para_ia: msgPrivExt,
          instrucao_resposta_ia: msgPrivExt,
        };
      }

      const tarifaDiaria = Number(targetRes?.dailyRate || reserva.valor_diaria || 237.0);

      const dataCheckin = String(reserva.data_checkin || '').slice(0, 10);
      const dataCheckoutAtual = String(reserva.data_checkout || '').slice(0, 10);
      const todayIso = String(context?.data_hora_atual || getBrasiliaIsoAndDate().isoNow).slice(0, 10);
      const baseCheckoutRef = dataCheckoutAtual < todayIso ? todayIso : dataCheckoutAtual;
      const rawNovaSaida = String(args.nova_data_checkout || '').trim();
      const novaSaida =
        resolveNaturalDateInput(rawNovaSaida, context?.data_hora_atual, baseCheckoutRef) ||
        rawNovaSaida.slice(0, 10);
      const confirmado = Boolean(args.confirmacao_hospede ?? false);

      if (!novaSaida) {
        const msgAskDate =
          `Informe ao hóspede com simpatia que é totalmente possível prorrogar a estadia no *${reserva.nome_imovel}* (tarifa de R$ ${tarifaDiaria.toFixed(2)}/diária), mediante disponibilidade no mapa, ` +
          `e pergunte diretamente até qual data (ou por mais quantos dias) ele gostaria de ficar para você verificar agora mesmo.`;
        return {
          status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
          dados: {
            reserva_id: reserva.id,
            imovel: reserva.nome_imovel,
            data_checkout_atual: dataCheckoutAtual,
            valor_diaria: tarifaDiaria,
          },
          instrucao_para_ia: msgAskDate,
          instrucao_resposta_ia: msgAskDate,
        };
      }

      const diariasExtras = diffDays(baseCheckoutRef, novaSaida);
      const novasDiariasTotais = Math.max(1, diffDays(dataCheckin, novaSaida));

      if (diariasExtras <= 0) {
        const msg =
          `Explique ao hóspede que a nova data de saída (${novaSaida || 'informada'}) precisa ser posterior à data de referência de saída (${baseCheckoutRef}).`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'NOVA_DATA_SAIDA_INVALIDA',
          dados: { data_checkout_atual: baseCheckoutRef, nova_data_checkout: novaSaida },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const valorAdicional = Number((diariasExtras * tarifaDiaria).toFixed(2));

      // Limpa eventuais propostas pendentes legadas que apontavam para a própria reserva como falso conflito
      if (Array.isArray(db?.pendingExtensionProposals) && targetRes) {
        for (const prop of db.pendingExtensionProposals) {
          if (
            prop &&
            (prop.status === 'pending' || prop.status === 'pending_manager') &&
            (String(prop.incomingReservationId) === String(targetRes.id) ||
              String(prop.currentReservationId) === String(prop.incomingReservationId))
          ) {
            prop.status = 'resolved_self_conflict';
          }
        }
      }

      // Verifica se há conflito no flat atual para o período de extensão (baseCheckoutRef até novaSaida)
      const nowExtMs = Date.now();
      const conflitoReserva = Array.isArray(db?.reservations)
        ? db.reservations.find((r) => {
            if (!r) return false;
            const st = String(r.status || '').toLowerCase().trim();
            if (['cancelada', 'cancelado', 'cancelled', 'expirada', 'expired', 'no_show', 'completed', 'concluida', 'checked_out'].includes(st) || r.checkoutCompleted || r.checkoutDone) return false;
            const expRaw = r.expiresAt || r.holdExpiresAt;
            if (st === 'pre_reserva' && expRaw) {
              const expMs = new Date(expRaw).getTime();
              if (!Number.isNaN(expMs) && expMs <= nowExtMs) return false;
            }
            if (matchesSessionReservation(r, reserva)) return false;
            const sameFlat =
              String(r.flatNumber || '') === flatNumber ||
              String(r.flatId || '') === String(reserva.imovel_id);
            if (!sameFlat) return false;
            const rIn = String(r.checkinDate || '').slice(0, 10);
            const rOut = String(r.checkoutDate || '').slice(0, 10);
            return baseCheckoutRef < rOut && novaSaida > rIn;
          })
        : null;

      // CENÁRIO B: Flat atual ocupado por reserva futura -> Prioriza manter o hóspede já hospedado e consulta o gestor no WhatsApp!
      if (conflitoReserva) {
        const incomingCheckin = String(conflitoReserva.checkinDate || dataCheckoutAtual).slice(0, 10);
        const incomingCheckout = String(conflitoReserva.checkoutDate || novaSaida).slice(0, 10);
        const flatDaVez = selectFairShareFlatHelper(db, incomingCheckin, incomingCheckout, flatNumber);
        const suggestedFlatNum = flatDaVez ? String(flatDaVez.number) : null;
        const proposalId = `EXT-${Date.now().toString(36).slice(-5).toUpperCase()}`;
        const hospedeNome = targetRes?.guestName || context.hospede?.nome || 'Hóspede';

        if (db) {
          if (!Array.isArray(db.pendingExtensionProposals)) db.pendingExtensionProposals = [];
          db.pendingExtensionProposals.unshift({
            id: proposalId,
            status: 'pending_manager',
            currentReservationId: targetRes?.id || reserva.id,
            currentReservationCode: reserva.id,
            guestName: hospedeNome,
            guestPhone: context.telefone_remetente,
            flatNumber,
            oldCheckoutDate: dataCheckoutAtual,
            newCheckoutDate: novaSaida,
            extraNights: diariasExtras,
            additionalAmount: valorAdicional,
            incomingReservationId: conflitoReserva.id,
            incomingReservationCode: conflitoReserva.code || `RES-${conflitoReserva.id}`,
            incomingGuestName: conflitoReserva.guestName || 'Próximo Hóspede',
            incomingCheckin,
            incomingCheckout,
            recommendedSwapFlat: suggestedFlatNum,
            createdAt: new Date().toISOString(),
          });
          if (typeof context.runtime?.saveDatabase === 'function') {
            await context.runtime.saveDatabase();
          }
        }

        const resumoGestor = [
          `🔄 *Solicitação de Prorrogação com Conflito de Mapa [${proposalId}]*`,
          `• *Hóspede atual (já hospedado):* ${hospedeNome} (*Flat ${flatNumber}*)`,
          `• *Deseja estender de:* ${dataCheckoutAtual} para *${novaSaida}* (+${diariasExtras} diária(s) = R$ ${valorAdicional.toFixed(2)})`,
          `• *Reserva futura no mesmo flat:* ${conflitoReserva.guestName || 'Hóspede'} (${incomingCheckin} a ${incomingCheckout})`,
          `• *Flat da Vez sugerido para remanejar a reserva futura:* ${suggestedFlatNum ? `Flat ${suggestedFlatNum}` : 'Nenhum flat livre no período'}`,
          ``,
          `Responda com o número da opção desejada:`,
          `*1* — Autorizar troca da reserva futura (${conflitoReserva.guestName || 'próximo hóspede'}) para o *Flat ${suggestedFlatNum || 'livre'}* e enviar PIX da prorrogação ao hóspede atual`,
          `*2* — Oferecer troca de quarto ao hóspede atual (${hospedeNome}) para o *Flat ${suggestedFlatNum || 'livre'}*`,
          `*3* — Recusar a prorrogação por indisponibilidade`,
        ].join('\n');

        await notifyAdminWhatsApp({
          nivel_urgencia: 'ALTA',
          categoria: 'CONFLITO_REGRA',
          hospede_nome: hospedeNome,
          telefone: context.telefone_remetente,
          imovel: reserva.nome_imovel,
          resumo: resumoGestor,
          context,
        });

        const msgAguardandoGestor =
          `Informe ao hóspede com muita simpatia que o valor das ${diariasExtras} diária(s) extra(s) até ${novaSaida} fica em *R$ ${valorAdicional.toFixed(2)}*, ` +
          `e que você acabou de acionar a gerência no WhatsApp para remanejar a programação do mapa e mantê-lo no mesmo *${reserva.nome_imovel}* sem precisar trocar de quarto. ` +
          `Diga que em instantes você já envia a confirmação e a chave PIX por aqui!`;

        return {
          status: 'SUCESSO_EXECUTADO',
          dados: {
            proposta_id: proposalId,
            reserva_id: reserva.id,
            nova_data_checkout: novaSaida,
            diarias_extras: diariasExtras,
            valor_adicional: valorAdicional,
            aguardando_autorizacao_gestor: true,
            flat_sugerido_remanejamento: suggestedFlatNum,
          },
          instrucao_para_ia: msgAguardandoGestor,
          instrucao_resposta_ia: msgAguardandoGestor,
        };
      }

      // CENÁRIO A: Flat atual LIVRE!
      if (!confirmado) {
        const msgSim =
          `Informe ao hóspede que o *${reserva.nome_imovel}* está livre e disponível para prorrogar a estadia até *${novaSaida}* (+${diariasExtras} diária(s) extra(s))! ` +
          `O valor total das diárias adicionais é de *R$ ${valorAdicional.toFixed(2)}* (R$ ${tarifaDiaria.toFixed(2)}/diária). ` +
          `Pergunte se ele confirma a prorrogação para você já gerar o PIX e atualizar o mapa de reservas.`;
        return {
          status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
          dados: {
            reserva_id: reserva.id,
            imovel: reserva.nome_imovel,
            data_checkout_atual: dataCheckoutAtual,
            nova_data_checkout: novaSaida,
            diarias_extras: diariasExtras,
            valor_adicional: valorAdicional,
            moeda: 'BRL',
          },
          instrucao_para_ia: msgSim,
          instrucao_resposta_ia: msgSim,
        };
      }

      // Hóspede confirmou a prorrogação no flat livre: gera PIX e registra a extensão em Pré-Reserva da Diária Extra (30 min)
      const pixCharge = await generatePixChargeForService({
        amount: valorAdicional,
        description: `Prorrogação de Estadia (+${diariasExtras} diária(s) até ${novaSaida}) - Reserva ${reserva.id}`,
        debtorName: targetRes?.guestName || context.hospede?.nome || 'Hospede CorpFlats',
        debtorDocument: targetRes?.guestDocument || targetRes?.guestCpf || '',
        reservationCode: reserva.id,
        context,
      });

      const nowDateExt = new Date();
      const nowIsoExt = nowDateExt.toISOString();
      const resolveHoldFnExt = globalThis.resolveStayExtensionHold;
      const holdInfoExt =
        typeof resolveHoldFnExt === 'function'
          ? resolveHoldFnExt({ source: 'whatsapp_ai' }, dataCheckoutAtual)
          : {
              expiresAt: new Date(nowDateExt.getTime() + 30 * 60 * 1000).toISOString(),
              reminderAt: new Date(nowDateExt.getTime() + 20 * 60 * 1000).toISOString(),
              reminderLeadMinutes: 10,
              reminderLeadLabel: '10 minutos',
              sendExpirationReminder: true,
              holdPreset: '30m',
              holdDurationMinutes: 30,
              holdDurationLabel: '30 minutos',
            };
      const expiraEmHoraExt = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(holdInfoExt.expiresAt));

      if (targetRes) {
        const priorExt =
          targetRes.pendingStayExtension?.isPreReservationHold &&
          targetRes.pendingStayExtension?.status === 'pending_payment'
            ? targetRes.pendingStayExtension
            : null;
        const origCheckinExt = String(priorExt?.oldCheckinDate || targetRes.checkinDate || reserva.data_checkin).slice(0, 10);
        const origCheckoutExt = String(priorExt?.oldCheckoutDate || dataCheckoutAtual).slice(0, 10);
        const origDailyRatesExt = priorExt?.oldDailyRates
          ? priorExt.oldDailyRates.map((d) => ({ ...d }))
          : Array.isArray(targetRes.dailyRates)
            ? targetRes.dailyRates.map((d) => ({ ...d }))
            : [];
        const origChargesExt = priorExt?.oldCharges
          ? priorExt.oldCharges.map((c) => ({ ...c }))
          : Array.isArray(targetRes.charges)
            ? targetRes.charges.map((c) => ({ ...c }))
            : [];
        const origCleaningFeeExt =
          priorExt?.oldCleaningFee !== undefined ? Number(priorExt.oldCleaningFee) || 0 : Number(targetRes.cleaningFee) || 0;
        const origTotalExt =
          priorExt?.oldTotalAmount !== undefined ? Number(priorExt.oldTotalAmount) || 0 : Number(targetRes.totalAmount) || 0;
        const origPaidExtRaw =
          priorExt?.oldPaidAmount !== undefined ? Number(priorExt.oldPaidAmount) || 0 : Number(targetRes.paidAmount) || 0;
        const origPaymentStatusExt = priorExt?.oldPaymentStatus || targetRes.paymentStatus || 'pago_total';
        const origChannelExt = priorExt?.oldChannel || targetRes.channel || '';
        const isPaidOrOtaExt =
          origPaidExtRaw > 0 ||
          ['pago_total', 'pago', 'paid'].includes(String(origPaymentStatusExt).toLowerCase()) ||
          ['booking', 'airbnb', 'expedia', 'decolar', 'vrbo', 'ota'].includes(String(origChannelExt).toLowerCase());
        const origPaidExt = origPaidExtRaw > 0 ? origPaidExtRaw : (isPaidOrOtaExt ? origTotalExt : 0);

        const addedDatesExt = [];
        const startExtMs = new Date(`${origCheckoutExt}T12:00:00Z`).getTime();
        const endExtMs = new Date(`${novaSaida}T12:00:00Z`).getTime();
        const totalExtDaysFromOrig = Math.max(1, Math.round((endExtMs - startExtMs) / 86400000));
        for (let i = 0; i < totalExtDaysFromOrig; i++) {
          addedDatesExt.push(new Date(startExtMs + i * 86400000).toISOString().slice(0, 10));
        }
        const addedDailyRatesExt = addedDatesExt.map((dt) => ({
          date: dt,
          rate: tarifaDiaria,
          channel: 'whatsapp',
        }));
        if (origDailyRatesExt.length > 0 && addedDailyRatesExt.length > 0) {
          targetRes.dailyRates = [...origDailyRatesExt, ...addedDailyRatesExt].sort((a, b) =>
            String(a.date).localeCompare(String(b.date))
          );
        }

        const hadSignedFnrhExt = Boolean(
          targetRes.preCheckinCompleted ||
            targetRes.fnrhSignedAt ||
            targetRes.signatureDataUrl ||
            targetRes.fnrhSignature ||
            targetRes.checkinDone ||
            targetRes.actualCheckinAt
        );

        targetRes.oldCheckoutDateBeforeExtension = origCheckoutExt;
        targetRes.checkoutDate = novaSaida;
        targetRes.nights = novasDiariasTotais;
        targetRes.totalAmount = Number(((Number(targetRes.totalAmount) || 0) + valorAdicional).toFixed(2));
        targetRes.cardTotalAmount = computeCardAmountFromPix(targetRes.totalAmount);
        targetRes.pixCopiaECola = pixCharge.pixCopiaECola;
        targetRes.pixTxId = pixCharge.txid;
        targetRes.pixChargedAmount = valorAdicional;
        if (origPaidExt > 0 && origPaidExt < targetRes.totalAmount) {
          targetRes.paymentStatus = 'parcial';
        }
        targetRes.pendingStayExtension = {
          isPreReservationHold: true,
          source: 'whatsapp_ai',
          txid: pixCharge.txid,
          pixCopiaECola: pixCharge.pixCopiaECola,
          paymentUrl: pixCharge.paymentUrl,
          amount: Number((targetRes.totalAmount - origPaidExt).toFixed(2)),
          oldCheckinDate: origCheckinExt,
          oldCheckoutDate: origCheckoutExt,
          newCheckoutDate: novaSaida,
          addedDates: addedDatesExt,
          addedDailyRates: addedDailyRatesExt,
          oldDailyRates: origDailyRatesExt,
          oldCharges: origChargesExt,
          oldCleaningFee: origCleaningFeeExt,
          oldTotalAmount: origTotalExt,
          oldPaidAmount: origPaidExt,
          oldPaymentStatus: origPaymentStatusExt,
          oldChannel: origChannelExt,
          alreadyAppliedToReservation: true,
          requiresDeferredReSignature: hadSignedFnrhExt,
          extraNights: addedDatesExt.length || diariasExtras,
          newTotalNights: novasDiariasTotais,
          status: 'pending_payment',
          expiresAt: holdInfoExt.expiresAt,
          reminderAt: holdInfoExt.reminderAt,
          reminderLeadMinutes: holdInfoExt.reminderLeadMinutes,
          reminderLeadLabel: holdInfoExt.reminderLeadLabel,
          sendExpirationReminder: holdInfoExt.sendExpirationReminder !== false,
          holdPreset: holdInfoExt.holdPreset || '30m',
          holdDurationMinutes: holdInfoExt.holdDurationMinutes || 30,
          holdDurationLabel: holdInfoExt.holdDurationLabel || '30 minutos',
          requestedAt: nowIsoExt,
        };
        targetRes.updatedAt = nowIsoExt;

        // Pausa/atualiza reversivelmente o card de limpeza de check-out que estava agendado para a data antiga
        if (Array.isArray(db?.cleaningRequests)) {
          for (const cr of db.cleaningRequests) {
            if (
              cr &&
              String(cr.flatNumber) === flatNumber &&
              cr.requestDate === origCheckoutExt &&
              cr.status !== 'clean'
            ) {
              if (cr.previousAdminNoteBeforeExtension === undefined) {
                cr.previousAdminNoteBeforeExtension = cr.adminNote || null;
              }
              cr.originalRequestDateBeforeExtension = cr.originalRequestDateBeforeExtension || origCheckoutExt;
              cr.extensionHoldReservationId = targetRes.id;
              cr.extensionHoldExpiresAt = holdInfoExt.expiresAt;
              cr.isExtendedStay = true;
              cr.extendedUntil = novaSaida;
              cr.adminNote = `⏳ Prorrogação em Pré-Reserva aguardando pagamento até ${expiraEmHoraExt} (Não realizar limpeza de check-out por enquanto).`;
            }
          }
        }

        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }

        const triggerFn = context.runtime?.triggerImmediateWhatsApp || globalThis.triggerImmediateWhatsApp;
        if (typeof triggerFn === 'function') {
          try {
            await triggerFn(db, context.runtime?.saveDatabase, 'additional_daily_pending', targetRes);
          } catch (trigErr) {
            console.warn('[estender_estadia] Erro ao disparar additional_daily_pending:', trigErr?.message || trigErr);
          }
        }
      }

      const msgExec =
        `Confirme com entusiasmo que a prorrogação da estadia no *${reserva.nome_imovel}* até *${novaSaida}* (+${diariasExtras} diária(s)) já entrou como *Pré-Reserva da Diária Extra* garantida no mapa por *30 minutos* (até as *${expiraEmHoraExt}*)! ` +
        `Envie o código PIX Copia e Cola (${pixCharge.pixCopiaECola}) no valor de *R$ ${valorAdicional.toFixed(2)}* e o link do portal seguro (${pixCharge.paymentUrl}) onde o hóspede pode pagar via PIX ou Cartão de Crédito com baixa automática no sistema. ` +
        `Tranquilize-o informando que, caso não seja quitado dentro do prazo, apenas o período adicional expira e sua reserva original permanece 100% confirmada.`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          reserva_id: reserva.id,
          nova_data_checkout: novaSaida,
          novas_diarias: novasDiariasTotais,
          diarias_extras: diariasExtras,
          diferenca_valor: valorAdicional,
          valor_adicional: valorAdicional,
          txid: pixCharge.txid,
          pix_copia_e_cola: pixCharge.pixCopiaECola,
          link_pagamento: pixCharge.paymentUrl,
          pre_reserva_diaria_extra_expira_em: holdInfoExt.expiresAt,
        },
        instrucao_para_ia: msgExec,
        instrucao_resposta_ia: msgExec,
      };
    } catch (error) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'MEDIA',
        categoria: 'ERRO_SISTEMA_TOOL',
        hospede_nome: context.hospede?.nome || 'Hóspede',
        telefone: context.telefone_remetente,
        resumo: `Falha técnica ao executar estender_estadia (${args.nova_data_checkout}): ${error.message}`,
        context,
      });
      const msg =
        'Peça desculpas ao hóspede informando uma instabilidade momentânea ao prorrogar a reserva e avise que a gerência já foi notificada no WhatsApp para concluir a extensão.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

export const solicitarLimpezaExtraTool = {
  name: 'solicitar_limpeza_extra',
  description:
    'Atende pedidos de governança durante a estadia: ' +
    '1) Para LIMPEZA_COMPLETA (limpeza durante a estadia + troca de roupa de cama e banho), cobra R$ 70,00: gera primeiro a cobrança PIX e só cria o card de limpeza após a confirmação do pagamento. ' +
    '2) Para entrega avulsa de toalha extra, travesseiro, papel higiênico ou sabonete (REPOSICAO_ITENS ou TROCA_TOALHAS_ENXOVAL), é cortesia (gratuito) e gera imediatamente um card de instrução deixando claro que é APENAS entrega do item para a camareira não limpar o flat por engano.',
  allowedStates: ['IN_STAY_CONCIERGE'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      tipo_solicitacao: {
        type: 'STRING',
        description:
          'Tipo de serviço: LIMPEZA_COMPLETA (limpeza do flat + troca completa de roupa de cama e banho por R$ 70,00), ' +
          'TROCA_TOALHAS_ENXOVAL (entrega cortesia de toalha extra ou travesseiro) ou REPOSICAO_ITENS (entrega cortesia de papel higiênico, sabonete, etc.).',
      },
      observacoes: {
        type: 'STRING',
        description: 'Itens específicos solicitados pelo hóspede (ex: "1 toalha extra e 2 papéis higiênicos", "1 travesseiro") ou horário de preferência.',
      },
      confirmacao_hospede: {
        type: 'BOOLEAN',
        description:
          'Passe FALSE na primeira chamada caso seja LIMPEZA_COMPLETA (para informar a taxa de R$ 70,00 que inclui limpeza + troca de cama e banho). ' +
          'Para entrega avulsa de toalha extra, travesseiro, papel higiênico ou sabonete (cortesia) ou após o hóspede confirmar a taxa de R$ 70,00, passe TRUE.',
      },
    },
    required: ['tipo_solicitacao', 'confirmacao_hospede'],
  },
  async execute(args, context) {
    try {
      const reserva = context.reserva_ativa || context.reserva_atual;
      if (!reserva) {
        const msg =
          'Explique educadamente que não localizamos uma estadia ativa vinculada a este telefone e pergunte o número do flat.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const taxaLimpezaExtra = 70.0;
      const exigeTaxa = args.tipo_solicitacao === 'LIMPEZA_COMPLETA';
      const db = context.runtime?.db;
      const flatNumber = reserva.nome_imovel.replace(/^Flat\s+/i, '').trim();
      const todayStr = String(context.data_hora_atual || new Date().toISOString()).slice(0, 10);
      const protocolo = `GOV-${Date.now().toString(36).slice(-5).toUpperCase()}`;

      const targetRes = Array.isArray(db?.reservations)
        ? db.reservations.find((r) => matchesSessionReservation(r, reserva))
        : null;

      // CASO 1: Limpeza durante a estadia (R$ 70,00 - inclui limpeza + troca de roupa de cama e banho)
      if (exigeTaxa) {
        if (!args.confirmacao_hospede) {
          const msg =
            `Informe ao hóspede que a limpeza durante a estadia para o ${reserva.nome_imovel} tem o valor de *R$ ${taxaLimpezaExtra.toFixed(2)}* e já inclui a limpeza completa do flat mais a troca de roupa de cama e banho. ` +
            `(Informe também que se ele precisar apenas de uma toalha extra, travesseiro, papel higiênico ou sabonete avulso, entregamos como cortesia!). ` +
            `Pergunte se ele confirma a limpeza completa de R$ ${taxaLimpezaExtra.toFixed(2)} para você gerar a cobrança PIX.`;
          return {
            status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
            dados: {
              imovel: reserva.nome_imovel,
              tipo_solicitacao: args.tipo_solicitacao,
              valor_taxa: taxaLimpezaExtra,
              inclui: 'Limpeza completa do flat + troca de roupa de cama e banho',
              moeda: 'BRL',
            },
            instrucao_para_ia: msg,
            instrucao_resposta_ia: msg,
          };
        }

        // Hóspede confirmou a limpeza de R$ 70,00: gera a cobrança PIX primeiro e SÓ solicita a limpeza na governança após o pagamento!
        const pixCharge = await generatePixChargeForService({
          amount: taxaLimpezaExtra,
          description: `Limpeza durante estadia + Troca cama/banho - ${reserva.nome_imovel} (${reserva.id})`,
          debtorName: targetRes?.guestName || context.hospede?.nome || 'Hospede CorpFlats',
          debtorDocument: targetRes?.guestDocument || targetRes?.guestCpf || '',
          reservationCode: reserva.id,
          context,
        });

        if (targetRes) {
          targetRes.pendingStayoverCleaning = {
            protocolo,
            txid: pixCharge.txid,
            pixCopiaECola: pixCharge.pixCopiaECola,
            amount: taxaLimpezaExtra,
            requestDate: todayStr,
            notes: args.observacoes || '',
            status: 'pending_payment',
            requestedAt: new Date().toISOString(),
          };
          targetRes.updatedAt = new Date().toISOString();
          if (typeof context.runtime?.saveDatabase === 'function') {
            await context.runtime.saveDatabase();
          }
        }

        const msg =
          `Envie ao hóspede o código PIX Copia e Cola (${pixCharge.pixCopiaECola}) no valor de *R$ ${taxaLimpezaExtra.toFixed(2)}* referente à limpeza durante a estadia (com troca de roupa de cama e banho) do *${reserva.nome_imovel}*. ` +
          `Explique claramente que a cobrança foi gerada e que, assim que o pagamento PIX for confirmado, o card de limpeza será enviado automaticamente para a camareira!`;

        return {
          status: 'SUCESSO_EXECUTADO',
          dados: {
            protocolo,
            reserva_id: reserva.id,
            imovel: reserva.nome_imovel,
            tipo_solicitacao: args.tipo_solicitacao,
            valor_taxa: taxaLimpezaExtra,
            aguardando_pagamento_pix: true,
            card_gerado_apos_pagamento: true,
            txid: pixCharge.txid,
            pix_copia_e_cola: pixCharge.pixCopiaECola,
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      // CASO 2: Entrega de item avulso de cortesia (toalha extra, travesseiro, papel higiênico, sabonete)
      // Gera o card na governança deixando MUITO CLARO que é APENAS entrega do item para a camareira NÃO limpar o flat por engano!
      const descricaoItem = String(
        args.observacoes ||
          (args.tipo_solicitacao === 'TROCA_TOALHAS_ENXOVAL'
            ? 'Toalha extra / travesseiro'
            : 'Papel higiênico / sabonete')
      ).trim();
      const instrucaoCamareira = `⚠️ APENAS ENTREGA DE ITEM (NÃO LIMPAR O FLAT): Entregar [${descricaoItem}] no Flat ${flatNumber}.`;

      if (db) {
        if (!Array.isArray(db.cleaningRequests)) db.cleaningRequests = [];
        db.cleaningRequests.push({
          id: protocolo,
          protocolo,
          flatId: targetRes?.flatId || Number(flatNumber) || 1,
          flatNumber,
          reservationId: reserva.id,
          reservationCode: reserva.id,
          guestName: context.hospede?.nome || targetRes?.guestName || 'Hóspede',
          leavingGuest: '⚠️ SÓ ENTREGA DE ITEM (NÃO LIMPAR)',
          arrivingGuest: null,
          type: 'instruction',
          source: 'manual_instruction',
          isInstructionOnly: true,
          isPaidCleaning: false,
          instructionText: instrucaoCamareira,
          adminNote: instrucaoCamareira,
          notes: instrucaoCamareira,
          pendingObservation: instrucaoCamareira,
          fee: 0,
          requestDate: todayStr,
          status: 'dirty',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }
      }

      const msg =
        `Confirme com cordialidade que o pedido de *${descricaoItem}* para o *${reserva.nome_imovel}* já foi registrado como *cortesia (sem custo)* ` +
        `no quadro da governança (protocolo *${protocolo}*), com aviso expresso para a camareira realizar apenas a entrega do item solicitado.`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          protocolo,
          reserva_id: reserva.id,
          imovel: reserva.nome_imovel,
          tipo_solicitacao: args.tipo_solicitacao,
          item_solicitado: descricaoItem,
          apenas_entrega_item: true,
          valor_taxa: 0,
        },
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    } catch (error) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'BAIXA',
        categoria: 'ERRO_SISTEMA_TOOL',
        hospede_nome: context.hospede?.nome || 'Hóspede',
        telefone: context.telefone_remetente,
        resumo: `Falha técnica ao executar solicitar_limpeza_extra: ${error.message}`,
        context,
      });
      const msg =
        'Informe ao hóspede que você já encaminhou o pedido diretamente para a equipe de governança atender o apartamento.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

export const abrirChamadoManutencaoTool = {
  name: 'abrir_chamado_manutencao',
  description:
    'Registra uma ocorrência de manutenção para o flat atual do hóspede e avisa imediatamente o gestor no WhatsApp com os 3 planos de ação prontos ' +
    '(1: Remanejar para o Flat da Vez + Abrir OS; 2: Apenas abrir a Ordem de Serviço; 3: Não fazer nada e o gestor assume) para execução imediata mediante resposta do gestor.',
  allowedStates: ['IN_STAY_CONCIERGE'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      categoria_item: {
        type: 'STRING',
        description:
          'Categoria do item: AR_CONDICIONADO, FECHADURA_ACESSO, CHUVEIRO_HIDRAULICA, ELETRICA_ILUMINACAO, WIFI_TV, ELETRODOMESTICOS ou OUTROS.',
      },
      descricao_problema: {
        type: 'STRING',
        description: 'Descrição clara do problema relatado pelo hóspede.',
      },
      urgencia: {
        type: 'STRING',
        description: 'Urgência: BAIXA, MEDIA ou CRITICA.',
      },
    },
    required: ['categoria_item', 'descricao_problema', 'urgencia'],
  },
  async execute(args, context) {
    try {
      const reserva = context.reserva_ativa || context.reserva_atual;
      if (!reserva) {
        const msg =
          'Peça desculpas pelo transtorno e pergunte em qual número de flat o hóspede está acomodado para acionar a manutenção imediatamente.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const db = context.runtime?.db;
      const flatNumber = reserva.nome_imovel.replace(/^Flat\s+/i, '').trim();
      const protocoloOs = `OS-${Date.now().toString(36).slice(-5).toUpperCase()}`;
      const todayStr = String(context.data_hora_atual || new Date().toISOString()).slice(0, 10);
      const checkoutStr = String(reserva.data_checkout || todayStr).slice(0, 10);

      // Identifica o "Flat da Vez" (desocupado e limpo) para sugerir remanejamento imediato ao gestor
      let flatSugerido = null;
      if (typeof context.runtime?.selectFairShareFlat === 'function' && db) {
        try {
          const picked = context.runtime.selectFairShareFlat(db, todayStr, checkoutStr > todayStr ? checkoutStr : todayStr);
          if (picked && String(picked.number || picked) !== flatNumber) {
            flatSugerido = String(picked.number || picked);
          }
        } catch {}
      }
      if (!flatSugerido && Array.isArray(db?.flats)) {
        const reservations = Array.isArray(db?.reservations) ? db.reservations : [];
        const candidate = db.flats.find((f) => {
          const fNum = String(f?.number || f?.id || '');
          if (!fNum || fNum === flatNumber || f.isActive === false || f.status === 'maintenance') return false;
          const hasConflict = reservations.some((r) => {
            if (!r || r.status === 'cancelada' || r.status === 'cancelled') return false;
            if (String(r.flatNumber || '') !== fNum) return false;
            const rIn = String(r.checkinDate || '').slice(0, 10);
            const rOut = String(r.checkoutDate || '').slice(0, 10);
            return todayStr < rOut && checkoutStr > rIn;
          });
          return !hasConflict;
        });
        if (candidate) {
          flatSugerido = String(candidate.number || candidate.id);
        }
      }

      const targetRes = Array.isArray(db?.reservations)
        ? db.reservations.find((r) => matchesSessionReservation(r, reserva))
        : null;

      if (db) {
        if (!Array.isArray(db.serviceOrders)) db.serviceOrders = [];
        db.serviceOrders.unshift({
          id: protocoloOs,
          code: protocoloOs,
          flatId: targetRes?.flatId || Number(flatNumber) || 1,
          flatNumber,
          reservationId: reserva.id,
          guestName: context.hospede?.nome || targetRes?.guestName || 'Hóspede',
          guestPhone: context.telefone_remetente,
          category: args.categoria_item,
          description: args.descricao_problema,
          priority: args.urgencia,
          status: 'pending_manager_approval',
          suggestedRelocationFlat: flatSugerido,
          createdAt: new Date().toISOString(),
        });

        if (!Array.isArray(db.pendingMaintenanceProposals)) {
          db.pendingMaintenanceProposals = [];
        }
        db.pendingMaintenanceProposals.unshift({
          id: `maint_${Date.now()}`,
          protocoloOs,
          status: 'pending_manager',
          reservationId: targetRes?.id || reserva.id,
          reservationCode: reserva.id,
          guestName: context.hospede?.nome || targetRes?.guestName || 'Hóspede',
          guestPhone: context.telefone_remetente,
          currentFlatNumber: flatNumber,
          suggestedFlatNumber: flatSugerido,
          category: args.categoria_item,
          description: args.descricao_problema,
          urgency: args.urgencia || 'MEDIA',
          checkinDate: reserva.data_checkin,
          checkoutDate: reserva.data_checkout,
          createdAt: new Date().toISOString(),
        });

        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }
      }

      const plano1Texto = flatSugerido
        ? `1️⃣ *Remanejar para o Flat da Vez (Flat ${flatSugerido})* + Abrir OS no Flat ${flatNumber}`
        : `1️⃣ *Remanejar hóspede* (informe o nº do flat desejado) + Abrir OS no Flat ${flatNumber}`;
      const plano2Texto = `2️⃣ *Apenas abrir a Ordem de Serviço (OS)* para manutenção no Flat ${flatNumber} (sem remanejar)`;
      const plano3Texto = `3️⃣ *Não fazer nada no sistema* (deixar que você assume o atendimento diretamente)`;

      const resumoPlanos = [
        `[${protocoloOs}] ${args.categoria_item}: ${args.descricao_problema}`,
        ``,
        `📋 *PLANOS DE AÇÃO PRONTOS (Responda 1, 2 ou 3 neste WhatsApp para a Sofia executar):*`,
        plano1Texto,
        plano2Texto,
        plano3Texto,
      ].join('\n');

      await notifyAdminWhatsApp({
        nivel_urgencia: args.urgencia || 'MEDIA',
        categoria: 'MANUTENCAO',
        hospede_nome: context.hospede?.nome || 'Hóspede',
        telefone: context.telefone_remetente,
        imovel: reserva.nome_imovel,
        resumo: resumoPlanos,
        context,
      });

      const msg =
        `Peça desculpas pelo inconveniente com muita empatia, informe ao hóspede que a ocorrência *${protocoloOs}* ` +
        `no *${reserva.nome_imovel}* (${args.categoria_item}) já foi enviada com prioridade diretamente para o WhatsApp da gerência ` +
        `com o plano de atendimento/manutenção pronto e que em instantes daremos o retorno imediato para solucionar.`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          protocolo_os: protocoloOs,
          imovel: reserva.nome_imovel,
          categoria_item: args.categoria_item,
          urgencia: args.urgencia,
          flat_sugerido_remanejamento: flatSugerido,
          planos_enviados_ao_gestor: [plano1Texto, plano2Texto, plano3Texto],
          administrador_notificado: true,
        },
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    } catch (error) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'CRITICA',
        categoria: 'MANUTENCAO',
        hospede_nome: context.hospede?.nome || 'Hóspede',
        telefone: context.telefone_remetente,
        resumo: `Falha ao gravar OS (${args.categoria_item} - ${args.descricao_problema}): ${error.message}`,
        context,
      });
      const msg =
        'Informe ao hóspede que você acabou de disparar um alerta direto para o WhatsApp da gerência e manutenção para atenderem o flat imediatamente.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

export const gerenciarNotaFiscalNfseTool = {
  name: 'gerenciar_nota_fiscal_nfse',
  description:
    'Gerencia a conferência, personalização (tomador, CPF/CNPJ, endereço, e-mail, inclusão/remoção de hóspedes acompanhantes na descrição ' +
    'ou observações livres na discriminação dos serviços) e confirmação para emissão automática da Nota Fiscal (NFS-e) da reserva ativa. ' +
    'Caso o hóspede peça apenas Recibo simples ou Comprovante de Pagamento/Hospedagem (sem ser NFS-e), use acao=SOLICITAR_RECIBO_COMPROVANTE para enviar o link oficial do portal.',
  allowedStates: ['PRE_CHECKIN', 'IN_STAY_CONCIERGE', 'POS_CHECKOUT'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      acao: {
        type: 'STRING',
        description:
          'Ação desejada: CONSULTAR_OU_INICIAR_CONFERENCIA, ATUALIZAR_DADOS_NOTA, CONFIRMAR_DADOS_NOTA, CANCELAR_CONFERENCIA ou SOLICITAR_RECIBO_COMPROVANTE.',
      },
      tomador_nome: { type: 'STRING', description: 'Nome completo ou Razão Social do tomador do serviço.' },
      tomador_cpf_cnpj: { type: 'STRING', description: 'CPF ou CNPJ do tomador do serviço.' },
      tomador_email: { type: 'STRING', description: 'E-mail para recebimento da NFS-e.' },
      tomador_endereco: { type: 'STRING', description: 'Endereço completo do tomador.' },
      hospedes_na_descricao: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description: 'Lista de nomes completos dos hóspedes que devem constar na descrição do serviço.',
      },
      observacao_adicional_descricao: {
        type: 'STRING',
        description: 'Observação extra solicitada pelo hóspede para incluir na discriminação dos serviços.',
      },
      descricao_servico_completa: {
        type: 'STRING',
        description: 'Substituição completa da descrição do serviço caso o hóspede exija uma redação própria.',
      },
      novo_valor_solicitado: {
        type: 'NUMBER',
        description: 'Preencha APENAS se o hóspede pedir explicitamente para alterar o valor monetário (R$) da nota fiscal.',
      },
    },
    required: ['acao'],
  },
  async execute(args, context) {
    try {
      const reserva = context.reserva_ativa || context.reserva_atual;
      if (!reserva) {
        const msg =
          'Explique educadamente que não localizamos uma reserva ativa vinculada a este telefone para emissão de Nota Fiscal e peça o código da reserva ou CPF do titular.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const db = context.runtime?.db;
      const conv = context.runtime?.conversation;
      const flatNumber = reserva.nome_imovel.replace(/^Flat\s+/i, '').trim();

      const targetRes = Array.isArray(db?.reservations)
        ? db.reservations.find((r) => matchesSessionReservation(r, reserva))
        : null;

      // TRAVA DE PRIVACIDADE FINANCEIRA: Hóspede não-solicitante ou acompanhante não pode ver valores, recibo ou emitir NFS-e!
      const ocultarFinanceiro = Boolean(
        reserva.ocultar_financeiro ||
          (targetRes && evaluateReservationFinancialPrivacy(targetRes, context.telefone_remetente).ocultarFinanceiro)
      );
      if (ocultarFinanceiro) {
        const nomeSolicitante =
          targetRes?.requesterInfo?.name ||
          targetRes?.requesterName ||
          targetRes?.companyName ||
          targetRes?.agencyName ||
          'o solicitante responsável pela reserva';
        const msgPriv =
          `Explique com muita cordialidade e educação que, como esta reserva foi realizada por *${nomeSolicitante}*, ` +
          `por política de privacidade financeira e conformidade fiscal, o comprovante de pagamento (recibo) e a Nota Fiscal Eletrônica (NFS-e) pertencem exclusivamente ao solicitante responsável pela reserva. ` +
          `Oriente o hóspede a solicitar o documento diretamente ao solicitante ou empresa responsável, sem mencionar valores financeiros na resposta.`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'PRIVACIDADE_FINANCEIRA_EXCLUSIVO_SOLICITANTE',
          dados: {
            reserva_id: reserva.id,
            ocultar_financeiro: true,
          },
          instrucao_para_ia: msgPriv,
          instrucao_resposta_ia: msgPriv,
        };
      }

      const baseUrl =
        db?.settings?.baseUrl ||
        (typeof process !== 'undefined' && process.env?.SERVER_BASE_URL) ||
        'https://corpflats.com.br';
      const pkgCode = String(
        targetRes?.packageCode || targetRes?.packageId || reserva?.pacote_multi_flat?.package_code || ''
      )
        .trim()
        .toUpperCase();
      const pkgSummary =
        pkgCode && db
          ? computePackageSummary(db, pkgCode, { baseUrl, computeCardAmountFromPix })
          : null;
      const isPackageConsolidated = Boolean(pkgSummary && pkgSummary.activeFlatsCount > 0);

      if (args.acao === 'SOLICITAR_RECIBO_COMPROVANTE') {
        const linkComprovante = isPackageConsolidated
          ? (pkgSummary.packagePortalUrl || `${baseUrl}/solicitante/${encodeURIComponent(pkgCode)}`)
          : `${baseUrl}/minha-reserva/${reserva.id}`;
        const labelAlvo = isPackageConsolidated
          ? `do pacote *${pkgCode}* (${pkgSummary.activeFlatsCount} flat(s))`
          : `da estadia no ${reserva.nome_imovel}`;
        const msg =
          `Envie ao solicitante/hóspede o link oficial do Portal (${linkComprovante}) onde ele pode visualizar e baixar imediatamente o *Comprovante de Pagamento / Reserva* oficial ${labelAlvo}. ` +
          `Pergunte também se ele deseja agendar a emissão da Nota Fiscal de Serviço Eletrônica (NFS-e)${isPackageConsolidated ? ' consolidada do pacote' : ''}.`;
        return {
          status: 'SUCESSO_EXECUTADO',
          dados: {
            reserva_id: reserva.id,
            ...(isPackageConsolidated ? { package_code: pkgCode } : {}),
            link_comprovante_pagamento: linkComprovante,
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      if (args.acao === 'CANCELAR_CONFERENCIA') {
        if (conv?.fiscalConferenceState) {
          conv.fiscalConferenceState.status = 'cancelled';
        }
        const msg =
          'Confirme ao hóspede que a solicitação de emissão da nota fiscal foi cancelada e que você segue à disposição caso ele precise futuramente.';
        return {
          status: 'SUCESSO_EXECUTADO',
          dados: { reserva_id: reserva.id, status_nfse: 'CANCELADA_PELO_HOSPEDE' },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const existingState = conv?.fiscalConferenceState || targetRes?.confirmedFiscalData || {};
      const titularPadrao =
        existingState.tomadorNome ||
        (isPackageConsolidated
          ? pkgSummary.requesterName || targetRes?.companyName || targetRes?.requesterName
          : null) ||
        targetRes?.companyName ||
        targetRes?.requesterInfo?.name ||
        targetRes?.requesterName ||
        targetRes?.guestName ||
        context.hospede?.nome ||
        'Hóspede';
      const docPadrao =
        existingState.tomadorCpfCnpj ||
        (isPackageConsolidated ? pkgSummary.requesterDocument : '') ||
        targetRes?.companyCnpj ||
        targetRes?.agencyCnpj ||
        targetRes?.requesterInfo?.cpf ||
        targetRes?.guestDocument ||
        targetRes?.guestCpf ||
        'Não informado';
      const emailPadrao =
        existingState.tomadorEmail ||
        (isPackageConsolidated ? pkgSummary.requesterEmail : '') ||
        targetRes?.requesterInfo?.email ||
        targetRes?.requesterEmail ||
        targetRes?.guestEmail ||
        'Não informado';
      const valorOriginal = Number(
        isPackageConsolidated
          ? pkgSummary.totalAmount || existingState.valorOriginal || 237.0
          : existingState.valorOriginal ||
              existingState.valorServico ||
              targetRes?.totalAmount ||
              237.0
      );

      if (
        typeof args.novo_valor_solicitado === 'number' &&
        Math.abs(args.novo_valor_solicitado - valorOriginal) > 0.01
      ) {
        await notifyAdminWhatsApp({
          nivel_urgencia: 'MEDIA',
          categoria: 'FINANCEIRO',
          hospede_nome: titularPadrao,
          telefone: context.telefone_remetente,
          imovel: isPackageConsolidated ? `Pacote ${pkgCode}` : reserva.nome_imovel,
          resumo: `Solicitante pediu alteração do valor da NFS-e de R$ ${valorOriginal.toFixed(2)} para R$ ${args.novo_valor_solicitado.toFixed(2)} (${isPackageConsolidated ? pkgCode : reserva.id}).`,
          context,
        });

        const msg =
          `Explique com cordialidade que, por conformidade contábil e segurança fiscal, qualquer alteração no valor original da hospedagem ` +
          `(de R$ ${valorOriginal.toFixed(2)} para R$ ${args.novo_valor_solicitado.toFixed(2)}) exige autorização da gerência. ` +
          `Avise que você já enviou um alerta automático para o WhatsApp do gestor aprovar a alteração.`;

        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'ALTERACAO_VALOR_REQUER_APROVACAO_GESTOR',
          dados: {
            valor_original: valorOriginal,
            novo_valor_solicitado: args.novo_valor_solicitado,
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const defaultPkgGuests = isPackageConsolidated
        ? Array.from(
            new Set(
              pkgSummary.items
                .filter((it) => it.isActive)
                .flatMap((it) => [it.guestName, it.guest2Name])
                .map((n) => String(n || '').trim())
                .filter((n) => n && !isPlaceholderGuestName(n))
            )
          )
        : [];
      const listaHospedes =
        Array.isArray(args.hospedes_na_descricao) && args.hospedes_na_descricao.length > 0
          ? args.hospedes_na_descricao
          : existingState.hospedesLista ||
            (defaultPkgGuests.length > 0
              ? defaultPkgGuests
              : [targetRes?.guestName || context.hospede?.nome || titularPadrao]);

      const shouldRebuildDesc =
        Array.isArray(args.hospedes_na_descricao) ||
        Boolean(args.observacao_adicional_descricao) ||
        !existingState.descricaoServico ||
        (isPackageConsolidated && !existingState.isPackageConsolidated);

      const novaDescricao =
        args.descricao_servico_completa ||
        (shouldRebuildDesc
          ? isPackageConsolidated
            ? buildConsolidatedPackageStayDescription({
                packageCode: pkgCode,
                items: pkgSummary.items,
                guestNamesOverride: Array.isArray(args.hospedes_na_descricao) ? args.hospedes_na_descricao : null,
                extraNotes: args.observacao_adicional_descricao,
              })
            : buildStandardStayDescription({
                guestNames: listaHospedes,
                flatNumber,
                checkinDate: reserva.data_checkin,
                checkoutDate: reserva.data_checkout,
                extraNotes: args.observacao_adicional_descricao,
              })
          : existingState.descricaoServico);

      const rawCpfCnpjInput = args.tomador_cpf_cnpj
        ? String(args.tomador_cpf_cnpj).trim()
        : '';
      const cleanDocDigits = rawCpfCnpjInput.replace(/\D+/g, '');
      const tipoTomadorDoc =
        cleanDocDigits.length === 14
          ? 'CNPJ'
          : cleanDocDigits.length === 11
          ? 'CPF'
          : String(docPadrao).replace(/\D+/g, '').length === 14
          ? 'CNPJ'
          : 'CPF';

      const updatedState = {
        ...existingState,
        status: 'scheduled_for_checkout',
        reservationId: targetRes?.id || reserva.id,
        reservationCode: reserva.id,
        ...(isPackageConsolidated
          ? {
              packageCode: pkgCode,
              isPackageConsolidated: true,
              consolidatePackage: true,
              activeFlatsCount: pkgSummary.activeFlatsCount,
            }
          : {}),
        flatNumber,
        tomadorNome: args.tomador_nome || existingState.tomadorNome || titularPadrao,
        tomadorCpfCnpj: rawCpfCnpjInput || docPadrao,
        tipoDocumentoTomador: tipoTomadorDoc,
        tomadorEmail: args.tomador_email || emailPadrao,
        tomadorEndereco:
          args.tomador_endereco ||
          existingState.tomadorEndereco ||
          targetRes?.requesterInfo?.address ||
          targetRes?.guestAddress ||
          'Endereço cadastrado',
        hospedesLista: listaHospedes,
        descricaoServico: novaDescricao,
        valorOriginal,
        valorServico: valorOriginal,
        updatedAt: new Date().toISOString(),
      };

      if (conv) {
        conv.fiscalConferenceState = updatedState;
      }
      if (isPackageConsolidated && db) {
        const pkgItemsAll = getPackageReservations(db, pkgCode).filter((r) => isPackageItemActive(r));
        for (const rItem of pkgItemsAll) {
          rItem.confirmedFiscalData = { ...updatedState };
          rItem.consolidatePackageInvoice = true;
          rItem.autoEmitInvoice = true;
        }
        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }
      } else if (targetRes) {
        targetRes.confirmedFiscalData = { ...updatedState };
        targetRes.autoEmitInvoice = true;
        if (Array.isArray(db?.guests) && targetRes.guestId) {
          const gRec = db.guests.find((g) => g && Number(g.id) === Number(targetRes.guestId));
          if (gRec) gRec.autoEmitInvoice = true;
        }
        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }
      }

      const refFiscalLabel = isPackageConsolidated
        ? `consolidada do pacote *${pkgCode}* (${pkgSummary.activeFlatsCount} flat(s))`
        : `da reserva *${reserva.id}*`;

      const hasValidDocInState = /^\d{11}$|^\d{14}$/.test(String(updatedState.tomadorCpfCnpj || '').replace(/\D+/g, ''));

      if (args.acao === 'CONFIRMAR_DADOS_NOTA') {
        const msg =
          `Confirme com entusiasmo que os dados da Nota Fiscal (NFS-e) ${refFiscalLabel} foram validados e que a emissão automática no check-out já está ativada ` +
          `(Tomador: ${updatedState.tomadorNome} | ${updatedState.tipoDocumentoTomador}: ${updatedState.tomadorCpfCnpj} | Valor Total: R$ ${valorOriginal.toFixed(2)}). ` +
          `A nota será emitida e enviada automaticamente no WhatsApp e por e-mail assim que o check-out for realizado.`;
        return {
          status: 'SUCESSO_EXECUTADO',
          dados: updatedState,
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const msg = hasValidDocInState
        ? `Confirme imediatamente ao solicitante/hóspede que a *emissão automática da Nota Fiscal (NFS-e) no check-out já foi ativada* para ${refFiscalLabel} e que o PDF será enviado automaticamente assim que o check-out for realizado.\n` +
          `Mostre também os dados cadastrados para conferência:\n` +
          `• *Tomador:* ${updatedState.tomadorNome}\n` +
          `• *CPF/CNPJ:* ${updatedState.tomadorCpfCnpj}\n` +
          `• *Endereço:* ${updatedState.tomadorEndereco}\n` +
          `• *E-mail:* ${updatedState.tomadorEmail}\n` +
          `• *Valor Previsto:* R$ ${valorOriginal.toFixed(2)}\n` +
          `Diga que se estiver tudo certinho ele não precisa fazer nada, mas se quiser trocar entre CPF e CNPJ ou ajustar algum dado, basta avisar por aqui.`
        : `Confirme ao solicitante/hóspede que a *emissão automática da Nota Fiscal (NFS-e) no check-out já foi ativada* para ${refFiscalLabel}, mas explique educadamente que ainda falta o *CPF* (ou *CNPJ* da empresa) no cadastro. Peça para ele informar o CPF ou CNPJ desejado para já deixarmos salvo e garantir o envio automático no check-out.`;

      return {
        status: hasValidDocInState ? 'SUCESSO_EXECUTADO' : 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
        dados: updatedState,
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    } catch (error) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'MEDIA',
        categoria: 'FINANCEIRO',
        hospede_nome: context.hospede?.nome || 'Hóspede',
        telefone: context.telefone_remetente,
        resumo: `Falha técnica ao executar gerenciar_nota_fiscal_nfse: ${error.message}`,
        context,
      });
      const msg =
        'Peça desculpas ao hóspede informando que o módulo fiscal apresentou uma instabilidade rápida e que a gerência já foi notificada para processar a nota fiscal.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

export const notificarAdministradorTool = {
  name: 'notificar_administrador',
  description:
    'Envia um alerta imediato para o WhatsApp pessoal do proprietário/administrador. Deve ser acionada quando: ' +
    '1) O hóspede relatar problemas graves de manutenção (falta de água, luz, ar-condicionado quebrado, fechadura falhando); ' +
    '2) O hóspede pedir uma exceção comercial ou desconto que o sistema bloqueou e ele insistir; ' +
    '3) O hóspede demonstrar irritação ou solicitar atendente humano.',
  allowedStates: ['COMERCIAL_VENDAS', 'PRE_CHECKIN', 'IN_STAY_CONCIERGE', 'POS_CHECKOUT'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      nivel_urgencia: {
        type: 'STRING',
        description: 'Nível de gravidade da situação: BAIXA, MEDIA ou CRITICA.',
      },
      categoria: {
        type: 'STRING',
        description:
          'Categoria do alerta: MANUTENCAO, EXCECAO_COMERCIAL, FINANCEIRO, CONFLITO_REGRA ou SOLICITACAO_HUMANO.',
      },
      resumo_ocorrencia: {
        type: 'STRING',
        description:
          'Resumo claro e direto do que o hóspede pediu, o que o sistema respondeu e por que precisa de intervenção humana.',
      },
    },
    required: ['nivel_urgencia', 'categoria', 'resumo_ocorrencia'],
  },
  async execute(args, context) {
    try {
      const hospedeNome =
        context.hospede?.nome || context.dados_hospede?.nome || 'Hóspede / Lead';
      const imovelNome =
        context.reserva_ativa?.nome_imovel || context.reserva_atual?.nome_imovel;

      const notifyResult = await notifyAdminWhatsApp({
        nivel_urgencia: args.nivel_urgencia || 'MEDIA',
        categoria: args.categoria || 'CONFLITO_REGRA',
        hospede_nome: hospedeNome,
        telefone: context.telefone_remetente,
        imovel: imovelNome,
        resumo: args.resumo_ocorrencia,
        context,
      });

      const shouldPauseAi =
        args.nivel_urgencia === 'CRITICA' || args.categoria === 'SOLICITACAO_HUMANO';

      if (shouldPauseAi && context.runtime?.conversation) {
        context.runtime.conversation.aiPaused = true;
        context.runtime.conversation.pausar_ia = true;
        context.runtime.conversation.aiPausedUntil = new Date(
          Date.now() + 60 * 60 * 1000
        ).toISOString();
        context.runtime.conversation.aiPausedReason = `admin_notified_${args.categoria}`;
        if (typeof context.runtime.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }
      }

      const msg =
        'Avise ao hóspede de forma tranquila e prestativa que você acabou de enviar uma mensagem direta no WhatsApp da gerência ' +
        'explicando a situação dele e que em breve um responsável assumirá a conversa ou dará o retorno.';

      return {
        status: 'ADMINISTRADOR_NOTIFICADO',
        dados: {
          notificado: true,
          admin_phone: notifyResult.adminPhone,
          pausar_ia: shouldPauseAi,
          nivel_urgencia: args.nivel_urgencia,
          categoria: args.categoria,
        },
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    } catch (error) {
      const msg =
        'Informe ao hóspede com cordialidade que sua solicitação foi encaminhada com prioridade para a equipe da recepção/gerência e que logo darão retorno.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

export const resolverProblemaCartaoNfcTool = {
  name: 'resolver_problema_cartao_nfc',
  description:
    'Atende contingências de acesso ao flat e Cartão NFC (a CorpFlats utiliza Cartão NFC retirado na recepção, nunca senha na porta): ' +
    '1) CARTAO_TRANCADO_DENTRO: envia e-mail imediato para a recepção (soho@promenade.com.br) autorizando emprestar cartão reserva para abrir o flat. ' +
    '2) PERDA_CARTAO: informa a taxa de R$ 15,00 por nova via, gera cobrança PIX de R$ 15,00 e, após o pagamento confirmado, envia e-mail automático para soho@promenade.com.br solicitando nova via e descontando no condomínio do flat 212. ' +
    '3) PORTA_NAO_ABRE: Passo 1 (ja_regravou_na_recepcao=false) orienta o hóspede a ir à recepção regravar o cartão NFC; Passo 2 (ja_regravou_na_recepcao=true) aciona alerta imediato de urgência máxima no WhatsApp do gestor (5522998505276).',
  allowedStates: ['IN_STAY_CONCIERGE', 'PRE_CHECKIN'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      tipo_ocorrencia: {
        type: 'STRING',
        description:
          'Tipo do problema com o Cartão NFC: CARTAO_TRANCADO_DENTRO (esqueceu/trancou o cartão dentro do quarto), PERDA_CARTAO (perdeu ou extraviou o cartão NFC) ou PORTA_NAO_ABRE (está com o cartão em mãos mas a fechadura não abre).',
      },
      ja_regravou_na_recepcao: {
        type: 'BOOLEAN',
        description:
          'Para PORTA_NAO_ABRE: passe FALSE na primeira vez para orientar o hóspede a regravar o cartão na recepção. Passe TRUE se o hóspede informar que já regravou na recepção e mesmo assim a porta continua sem abrir.',
      },
      confirmacao_taxa_segunda_via: {
        type: 'BOOLEAN',
        description:
          'Para PERDA_CARTAO: passe FALSE primeiro para informar a taxa de R$ 15,00 pela segunda via do cartão NFC. Passe TRUE após o hóspede concordar para gerar a cobrança PIX de R$ 15,00.',
      },
      pagamento_confirmado_manual: {
        type: 'BOOLEAN',
        description: 'Opcional: passe TRUE apenas se o pagamento de R$ 15,00 já estiver confirmado para disparo imediato do e-mail da nova via.',
      },
    },
    required: ['tipo_ocorrencia'],
  },
  async execute(args, context) {
    try {
      const reserva = context.reserva_ativa || context.reserva_atual;
      if (!reserva) {
        const msg =
          'Explique educadamente que não localizamos uma estadia ativa vinculada a este número de telefone e pergunte o número do flat e nome do titular.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const db = context.runtime?.db;
      const flatNumber = reserva.nome_imovel.replace(/^Flat\s+/i, '').trim();
      const targetRes = Array.isArray(db?.reservations)
        ? db.reservations.find((r) => matchesSessionReservation(r, reserva))
        : null;
      const hospedeNome = targetRes?.guestName || context.hospede?.nome || 'Hóspede';
      const tipo = String(args.tipo_ocorrencia || '').toUpperCase().trim();

      // CASO A: Trancou o cartão dentro do flat
      if (tipo === 'CARTAO_TRANCADO_DENTRO') {
        const subject = `Autorização de abertura / Empréstimo de cartão reserva - Flat ${flatNumber}`;
        const bodyText = `Olá, equipe da Recepção Soho Residence!\n\nAutorizamos por gentileza emprestar o cartão de acesso reserva (ou realizar a abertura de apoio) do Flat ${flatNumber} para o(a) hóspede titular ${hospedeNome}, que acabou trancando o cartão NFC dentro do apartamento.\n\nAtenciosamente,\nAdministração CorpFlats`;

        const emailRec = await sendReceptionEmailHelper({
          db,
          context,
          reservationId: reserva.id,
          flatNumber,
          guestName: hospedeNome,
          subject,
          bodyText,
          trigger: 'nfc_card_locked_inside',
        });

        const msg =
          `Tranquilize o hóspede imediatamente dizendo que você acabou de enviar um e-mail oficial para a recepção do edifício (soho@promenade.com.br) ` +
          `autorizando o empréstimo do cartão reserva para abrir o *Flat ${flatNumber}*. Oriente-o a se dirigir à portaria 24h agora mesmo!`;

        return {
          status: 'SUCESSO_EXECUTADO',
          dados: {
            reserva_id: reserva.id,
            flat_number: flatNumber,
            tipo_ocorrencia: 'CARTAO_TRANCADO_DENTRO',
            email_recepcao_enviado: true,
            destinatario: emailRec.recipient,
            assunto: subject,
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      // CASO B: Perdeu o cartão NFC -> Taxa de R$ 15,00 + E-mail descontando no condomínio do flat 212 após pagamento
      if (tipo === 'PERDA_CARTAO') {
        const taxaCartao = 15.0;
        const confirmouTaxa = Boolean(args.confirmacao_taxa_segunda_via ?? false);
        const jaPago = Boolean(args.pagamento_confirmado_manual ?? false);

        if (!confirmouTaxa && !jaPago) {
          const msgSim =
            `Informe ao hóspede com cordialidade que para emissão de uma nova via do Cartão NFC de acesso ao *Flat ${flatNumber}* há uma taxa de reposição de *R$ 15,00*. ` +
            `Pergunte se ele confirma para você gerar a chave PIX de R$ 15,00 e, assim que o pagamento for confirmado, a autorização de retirada do novo cartão será enviada automaticamente por e-mail para a recepção!`;
          return {
            status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
            dados: {
              reserva_id: reserva.id,
              flat_number: flatNumber,
              tipo_ocorrencia: 'PERDA_CARTAO',
              valor_taxa: taxaCartao,
              moeda: 'BRL',
            },
            instrucao_para_ia: msgSim,
            instrucao_resposta_ia: msgSim,
          };
        }

        if (jaPago) {
          const subject = `Solicitação de nova via de cartão do flat ${flatNumber}`;
          const bodyText = `Solicito por gentileza uma nova via do cartão de acesso do flat ${flatNumber}, o(a) hóspede ${hospedeNome} irá pegar aí. Descontar no condomínio do flat 212.`;
          const emailRec = await sendReceptionEmailHelper({
            db,
            context,
            reservationId: reserva.id,
            flatNumber,
            guestName: hospedeNome,
            subject,
            bodyText,
            trigger: 'nfc_card_replacement_paid',
          });
          const msgPago =
            `Confirme ao hóspede que o pagamento de R$ 15,00 foi identificado e que o e-mail de autorização já foi enviado para a recepção (soho@promenade.com.br). ` +
            `Ele já pode retirar a nova via do Cartão NFC do *Flat ${flatNumber}* na portaria!`;
          return {
            status: 'SUCESSO_EXECUTADO',
            dados: {
              reserva_id: reserva.id,
              flat_number: flatNumber,
              tipo_ocorrencia: 'PERDA_CARTAO',
              email_recepcao_enviado: true,
              destinatario: emailRec.recipient,
              assunto: subject,
              corpo: bodyText,
            },
            instrucao_para_ia: msgPago,
            instrucao_resposta_ia: msgPago,
          };
        }

        const pixCharge = await generatePixChargeForService({
          amount: taxaCartao,
          description: `2a Via Cartao NFC - Flat ${flatNumber} (${reserva.id})`,
          debtorName: hospedeNome,
          debtorDocument: targetRes?.guestDocument || targetRes?.guestCpf || '',
          reservationCode: reserva.id,
          context,
        });

        if (targetRes) {
          targetRes.pendingNfcCardReplacement = {
            txid: pixCharge.txid,
            pixCopiaECola: pixCharge.pixCopiaECola,
            amount: taxaCartao,
            flatNumber,
            guestName: hospedeNome,
            emailSubject: `Solicitação de nova via de cartão do flat ${flatNumber}`,
            emailBody: `Solicito por gentileza uma nova via do cartão de acesso do flat ${flatNumber}, o(a) hóspede ${hospedeNome} irá pegar aí. Descontar no condomínio do flat 212.`,
            status: 'pending_payment',
            requestedAt: new Date().toISOString(),
          };
          targetRes.updatedAt = new Date().toISOString();
          if (typeof context.runtime?.saveDatabase === 'function') {
            await context.runtime.saveDatabase();
          }
        }

        const msgPix =
          `Envie ao hóspede o código PIX Copia e Cola (${pixCharge.pixCopiaECola}) no valor de *R$ 15,00* referente à nova via do Cartão NFC do *Flat ${flatNumber}*. ` +
          `Explique que, assim que o pagamento PIX for confirmado pelo banco, nosso sistema dispara automaticamente o e-mail de autorização para a recepção (soho@promenade.com.br) liberar o novo cartão na hora!`;

        return {
          status: 'SUCESSO_EXECUTADO',
          dados: {
            reserva_id: reserva.id,
            flat_number: flatNumber,
            tipo_ocorrencia: 'PERDA_CARTAO',
            valor_taxa: taxaCartao,
            aguardando_pagamento_pix: true,
            txid: pixCharge.txid,
            pix_copia_e_cola: pixCharge.pixCopiaECola,
          },
          instrucao_para_ia: msgPix,
          instrucao_resposta_ia: msgPix,
        };
      }

      // CASO C: Está com o cartão, mas a porta não abre
      const jaRegravou = Boolean(args.ja_regravou_na_recepcao ?? false);
      if (!jaRegravou) {
        const msgPasso1 =
          `Oriente o hóspede com muita cordialidade (Passo 1) a descer rapidamente até a recepção/portaria 24h e pedir para *regravar o Cartão NFC* do *Flat ${flatNumber}*, ` +
          `pois às vezes a codificação magnética do cartão pode desmagnetizar perto do celular. Peça para ele te avisar por aqui caso já tenha regravado e a fechadura continue sem abrir!`;
        return {
          status: 'SUCESSO_EXECUTADO',
          dados: {
            reserva_id: reserva.id,
            flat_number: flatNumber,
            tipo_ocorrencia: 'PORTA_NAO_ABRE',
            etapa: 'PASSO_1_ORIENTAR_REGRAVACAO_RECEPCAO',
          },
          instrucao_para_ia: msgPasso1,
          instrucao_resposta_ia: msgPasso1,
        };
      }

      // Passo 2: Já regravou na recepção e mesmo assim não abre -> Alerta IMEDIATO ao gestor com urgência máxima!
      await notifyAdminWhatsApp({
        nivel_urgencia: 'CRITICA',
        categoria: 'MANUTENCAO',
        hospede_nome: hospedeNome,
        telefone: context.telefone_remetente,
        imovel: reserva.nome_imovel,
        resumo: `🚨 URGÊNCIA MÁXIMA DE ACESSO: Hóspede ${hospedeNome} (Flat ${flatNumber}) já regravou o Cartão NFC na recepção e a fechadura da porta CONTINUA NÃO ABRINDO! Necessário apoio imediato.`,
        context,
      });

      const msgPasso2 =
        `Peça sinceras desculpas pelo transtorno e tranquilize o hóspede informando que você acabou de acionar o WhatsApp pessoal do gestor (5522998505276) com *urgência máxima* ` +
        `para providenciar a abertura imediata do *Flat ${flatNumber}* ou realocação de apoio agora mesmo!`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          reserva_id: reserva.id,
          flat_number: flatNumber,
          tipo_ocorrencia: 'PORTA_NAO_ABRE',
          etapa: 'PASSO_2_ALERTA_CRITICO_GESTOR_ACIONADO',
          administrador_notificado: true,
        },
        instrucao_para_ia: msgPasso2,
        instrucao_resposta_ia: msgPasso2,
      };
    } catch (error) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'CRITICA',
        categoria: 'MANUTENCAO',
        hospede_nome: context.hospede?.nome || 'Hóspede',
        telefone: context.telefone_remetente,
        resumo: `Falha técnica ao executar resolver_problema_cartao_nfc: ${error.message}`,
        context,
      });
      const msg =
        'Informe ao hóspede que você já acionou nossa gerência com prioridade máxima para auxiliar na liberação do acesso ao flat junto à portaria.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

export const autorizarVisitaTemporariaTool = {
  name: 'autorizar_visita_temporaria',
  description:
    'Valida e autoriza a entrada de visita temporária no flat do hóspede: ' +
    '1) Respeita o limite máximo de ocupação do flat; ' +
    '2) Alerta obrigatoriamente que visitas NÃO podem pernoitar e NÃO podem utilizar a área de lazer (jacuzzi/saunas/academia); ' +
    '3) Coleta Nome Completo e CPF do visitante e dispara e-mail para a recepção (soho@promenade.com.br) autorizando a subida.',
  allowedStates: ['IN_STAY_CONCIERGE', 'PRE_CHECKIN'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      nome_visitante: {
        type: 'STRING',
        description: 'Nome completo do visitante (se já informado pelo hóspede).',
      },
      cpf_visitante: {
        type: 'STRING',
        description: 'CPF do visitante (se já informado pelo hóspede).',
      },
      quantidade_visitantes: {
        type: 'NUMBER',
        description: 'Quantidade de visitantes solicitada (padrão: 1).',
      },
    },
    required: [],
  },
  async execute(args, context) {
    try {
      const reserva = context.reserva_ativa || context.reserva_atual;
      if (!reserva) {
        const msg =
          'Explique educadamente que não localizamos uma estadia ativa vinculada a este telefone e peça o número do flat.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const db = context.runtime?.db;
      const flatNumber = reserva.nome_imovel.replace(/^Flat\s+/i, '').trim();
      const targetRes = Array.isArray(db?.reservations)
        ? db.reservations.find((r) => matchesSessionReservation(r, reserva))
        : null;
      const flatObj = Array.isArray(db?.flats)
        ? db.flats.find((f) => String(f?.number) === flatNumber)
        : null;

      const capacidadeMaxima = Number(flatObj?.maxGuests || flatObj?.capacity || 3);
      const hospedesAtuais = Number(
        targetRes?.guestCount || targetRes?.guestsCount || targetRes?.adults || reserva.quantidade_hospedes || 1
      );
      const qtdVisitantes = Math.max(1, Number(args.quantidade_visitantes || 1));

      if (hospedesAtuais + qtdVisitantes > capacidadeMaxima) {
        const msgCap =
          `Explique ao hóspede com cordialidade que, por norma de segurança do condomínio Soho Residence, a lotação máxima simultânea do *${reserva.nome_imovel}* é de *${capacidadeMaxima} pessoas* ` +
          `(e a reserva atual já conta com ${hospedesAtuais} hóspede(s)). Caso o encontro seja rápido na recepção/lobby, ele pode receber o visitante lá tranquilamente!`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'LOTACAO_MAXIMA_FLAT_EXCEDIDA',
          dados: {
            capacidade_maxima_flat: capacidadeMaxima,
            hospedes_na_reserva: hospedesAtuais,
            visitantes_solicitados: qtdVisitantes,
          },
          instrucao_para_ia: msgCap,
          instrucao_resposta_ia: msgCap,
        };
      }

      const nomeVisitante = String(args.nome_visitante || '').trim();
      const cpfVisitante = String(args.cpf_visitante || '').replace(/\D+/g, '');

      if (!nomeVisitante || cpfVisitante.length < 11) {
        const msgPedirDados =
          `Informe ao hóspede que é permitido receber a visita no *${reserva.nome_imovel}*, ressaltando expressamente as duas regras do condomínio:\n` +
          `• *Visitas não podem pernoitar no apartamento;*\n` +
          `• *Visitas não podem utilizar a área de lazer da cobertura (jacuzzi, saunas, academia e sala de jogos).*\n` +
          `Peça para ele enviar o *Nome Completo e o CPF* do visitante para você já disparar o e-mail de autorização para a recepção!`;
        return {
          status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
          dados: {
            reserva_id: reserva.id,
            flat_number: flatNumber,
            capacidade_maxima_flat: capacidadeMaxima,
            hospedes_na_reserva: hospedesAtuais,
            regras_visita: ['Proibido pernoite de visitantes', 'Proibido uso da área de lazer (jacuzzi/saunas/academia)'],
          },
          instrucao_para_ia: msgPedirDados,
          instrucao_resposta_ia: msgPedirDados,
        };
      }

      const hospedeNome = targetRes?.guestName || context.hospede?.nome || 'Hóspede';
      if (targetRes) {
        if (!Array.isArray(targetRes.authorizedVisitors)) targetRes.authorizedVisitors = [];
        targetRes.authorizedVisitors.push({
          name: nomeVisitante,
          cpf: cpfVisitante,
          authorizedAt: new Date().toISOString(),
        });
        targetRes.updatedAt = new Date().toISOString();
        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }
      }

      const subject = `Autorização de Visita Temporária - Flat ${flatNumber} (${nomeVisitante})`;
      const bodyText =
        `Olá, Recepção Soho Residence!\n\n` +
        `Autorizamos a entrada como VISITA TEMPORÁRIA (sem pernoite e sem acesso à área de lazer) para o Flat ${flatNumber}:\n` +
        `• Visitante: ${nomeVisitante}\n` +
        `• CPF: ${cpfVisitante}\n` +
        `• Hóspede Responsável: ${hospedeNome} (Reserva ${reserva.id})\n\n` +
        `Atenciosamente,\nAdministração CorpFlats`;

      const emailRec = await sendReceptionEmailHelper({
        db,
        context,
        reservationId: reserva.id,
        flatNumber,
        guestName: hospedeNome,
        subject,
        bodyText,
        trigger: 'visitor_authorization',
      });

      const msgOk =
        `Confirme com simpatia que o e-mail de autorização para o(a) visitante *${nomeVisitante}* (CPF: ${cpfVisitante}) subir ao *Flat ${flatNumber}* já foi enviado para a recepção (${emailRec.recipient}). ` +
        `Lembre gentilmente que a visita não pode pernoitar no flat e não tem acesso à área de lazer (jacuzzi/saunas/academia).`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          reserva_id: reserva.id,
          flat_number: flatNumber,
          nome_visitante: nomeVisitante,
          cpf_visitante: cpfVisitante,
          email_recepcao_enviado: true,
          destinatario: emailRec.recipient,
        },
        instrucao_para_ia: msgOk,
        instrucao_resposta_ia: msgOk,
      };
    } catch (error) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'BAIXA',
        categoria: 'ERRO_SISTEMA_TOOL',
        hospede_nome: context.hospede?.nome || 'Hóspede',
        telefone: context.telefone_remetente,
        resumo: `Falha ao executar autorizar_visita_temporaria: ${error.message}`,
        context,
      });
      const msg =
        'Informe ao hóspede que os dados do visitante foram anotados e encaminhados à recepção para liberação na portaria.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

export const processarCancelamentoTool = {
  name: 'processar_cancelamento',
  description:
    'Processa pedidos de cancelamento de reserva aplicando a regra oficial da CorpFlats: ' +
    '1) Cancelamento gratuito somente até 24 horas antes do horário de check-in (14:00h); ' +
    '2) Menos de 24 horas antes do check-in é cobrado integralmente (100%); ' +
    '3) Nas reservas via WhatsApp ou Site Direto, se o hóspede estiver fora do prazo de 24h e insistir ou pedir exceção/crédito (solicitar_excecao_gestor=true), envia alerta ao WhatsApp do gestor (5522998505276) com as opções: [1] Autorizar cancelamento por exceção, [2] Converter em crédito ou [3] Manter cobrança de 100%.',
  allowedStates: ['PRE_CHECKIN', 'IN_STAY_CONCIERGE'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      motivo_cancelamento: {
        type: 'STRING',
        description: 'Motivo informado pelo hóspede para o cancelamento.',
      },
      solicitar_excecao_gestor: {
        type: 'BOOLEAN',
        description:
          'Passe FALSE na primeira consulta dentro de 24h para informar a regra de cobrança integral (100%). ' +
          'Passe TRUE se o hóspede insistir ou pedir exceção/crédito fora do prazo para acionar o gestor no WhatsApp.',
      },
      confirmacao_hospede: {
        type: 'BOOLEAN',
        description:
          'Para cancelamento gratuito (mais de 24h antes do check-in ou pré-reserva pendente): passe FALSE primeiro para confirmar se o hóspede realmente deseja cancelar, e TRUE após o "sim" dele.',
      },
      flat_alvo: {
        type: 'STRING',
        description:
          'Opcional (apenas para pacotes multi-flat): número do flat ou código da reserva filha a cancelar (ex: "502" ou "RES-102") quando o solicitante quiser remover/cancelar apenas 1 flat mantendo os demais.',
      },
      cancelar_pacote_inteiro: {
        type: 'BOOLEAN',
        description:
          'Opcional (apenas para pacotes multi-flat): passe TRUE quando o solicitante desejar cancelar todos os flats do pacote, ou FALSE quando desejar cancelar apenas o flat indicado em flat_alvo.',
      },
    },
    required: [],
  },
  async execute(args, context) {
    try {
      const reserva = context.reserva_ativa || context.reserva_atual;
      if (!reserva) {
        const msg =
          'Explique educadamente que não localizamos uma reserva ativa vinculada a este telefone e peça o código da reserva.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const db = context.runtime?.db;
      let targetRes = Array.isArray(db?.reservations)
        ? db.reservations.find((r) => matchesSessionReservation(r, reserva))
        : null;

      // TRAVA DE PRIVACIDADE E PERMISSÃO: Hóspede não-solicitante ou acompanhante não pode cancelar nem ver valores de reservas corporativas/pacotes!
      const ocultarFinanceiro = Boolean(
        reserva.ocultar_financeiro ||
          (targetRes && evaluateReservationFinancialPrivacy(targetRes, context.telefone_remetente).ocultarFinanceiro)
      );
      if (ocultarFinanceiro) {
        const nomeSolicitante =
          targetRes?.requesterInfo?.name ||
          targetRes?.requesterName ||
          targetRes?.companyName ||
          targetRes?.agencyName ||
          'o solicitante responsável pela reserva';
        const msgPriv =
          `Explique com muita educação e empatia que, como esta hospedagem foi reservada por *${nomeSolicitante}*, ` +
          `qualquer solicitação de cancelamento ou alteração contratual deve ser realizada diretamente pelo solicitante responsável pela reserva. ` +
          `NÃO informe valores financeiros, tarifas ou condições de estorno ao hóspede.`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'PRIVACIDADE_FINANCEIRA_EXCLUSIVO_SOLICITANTE',
          dados: {
            reserva_id: reserva.id,
            ocultar_financeiro: true,
          },
          instrucao_para_ia: msgPriv,
          instrucao_resposta_ia: msgPriv,
        };
      }

      const baseUrlPkg =
        db?.settings?.baseUrl ||
        (typeof process !== 'undefined' && process.env?.SERVER_BASE_URL) ||
        'https://corpflats.com.br';
      const pkgCode = String(
        targetRes?.packageCode || targetRes?.packageId || reserva?.pacote_multi_flat?.package_code || ''
      )
        .trim()
        .toUpperCase();
      const pkgActiveItems =
        pkgCode && db
          ? getPackageReservations(db, pkgCode).filter((r) => isPackageItemActive(r))
          : [];

      if (pkgCode && args.flat_alvo && pkgActiveItems.length > 0) {
        const alvoNorm = String(args.flat_alvo).replace(/^Flat\s+/i, '').trim().toUpperCase();
        const foundSibling = pkgActiveItems.find(
          (r) =>
            String(r.flatNumber || '').toUpperCase() === alvoNorm ||
            String(r.code || '').toUpperCase() === alvoNorm ||
            String(r.id || '') === alvoNorm
        );
        if (foundSibling) {
          targetRes = foundSibling;
        }
      }

      const flatNumber = targetRes?.flatNumber
        ? String(targetRes.flatNumber)
        : reserva.nome_imovel.replace(/^Flat\s+/i, '').trim();
      const refCheckinDate = String(targetRes?.checkinDate || reserva.data_checkin).slice(0, 10);
      const refCheckoutDate = String(targetRes?.checkoutDate || reserva.data_checkout).slice(0, 10);
      const refCodigoRes = String(targetRes?.code || reserva.id);
      const cancelWholePackage =
        pkgCode && pkgActiveItems.length > 1
          ? Boolean(args.cancelar_pacote_inteiro ?? (!args.flat_alvo))
          : true;

      // CASO ESPECIAL PACOTE PENDENTE (PRÉ-RESERVA NÃO PAGA): Cancela 1 flat (recalculando PIX único) ou pacote todo sem multa!
      if (pkgCode && targetRes && !isReservationSettledInPackage(targetRes)) {
        const pkgBefore = computePackageSummary(db, pkgCode, { baseUrl: baseUrlPkg, computeCardAmountFromPix });
        const itemAmt = Number(targetRes.totalAmount) || 0;
        const projectedRemaining = Math.max(0, Number(((pkgBefore?.pendingAmount || 0) - itemAmt).toFixed(2)));

        if (!args.confirmacao_hospede) {
          const msgUnpaidSim = cancelWholePackage
            ? `Confirme com o solicitante se ele deseja realmente cancelar toda a pré-reserva do pacote *${pkgCode}* (${pkgActiveItems.length} flat(s)) sem nenhum custo.`
            : `Informe ao solicitante que podemos remover o *Flat ${flatNumber}* (${refCodigoRes}, R$ ${itemAmt.toFixed(2)}) do pacote *${pkgCode}* sem custos, ` +
              `mantendo os outros *${pkgActiveItems.length - 1} flat(s)* ativos e recalculando o PIX único para *R$ ${projectedRemaining.toFixed(2)}*. ` +
              `Pergunte se ele confirma a remoção apenas do Flat ${flatNumber}.`;
          return {
            status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
            dados: {
              package_code: pkgCode,
              cancelar_pacote_inteiro: cancelWholePackage,
              reserva_id: refCodigoRes,
              flat_number: flatNumber,
              novo_saldo_pacote_estimado: cancelWholePackage ? 0 : projectedRemaining,
              multa_aplicavel_pct: 0,
            },
            instrucao_para_ia: msgUnpaidSim,
            instrucao_resposta_ia: msgUnpaidSim,
          };
        }

        const cancelRes = await cancelSinglePackageFlat(
          db,
          targetRes,
          {
            cancelWholePackage,
            reason: args.motivo_cancelamento || 'Cancelado pelo solicitante via WhatsApp antes do pagamento',
            actor: { name: 'Sofia IA', role: 'ai', type: 'system' },
            source: 'WhatsApp IA',
          },
          {
            baseUrl: baseUrlPkg,
            createInterPixCob: globalThis.createInterPixCob,
            generateStaticPixPayload,
            computeCardAmountFromPix,
            saveDatabase: context.runtime?.saveDatabase,
          }
        );
        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }

        const remSummary = cancelRes?.summary;
        if (remSummary && remSummary.activeFlatsCount > 0) {
          const msgRecalc =
            `Confirme com cordialidade que o *Flat ${flatNumber}* (${refCodigoRes}) foi removido do pacote *${pkgCode}*! ` +
            `Os demais *${remSummary.activeFlatsCount} flat(s)* permanecem reservados, e o PIX único foi recalculado automaticamente para *R$ ${remSummary.pendingAmount.toFixed(2)}* (ou R$ ${remSummary.cardPendingAmount.toFixed(2)} no Cartão). ` +
            (remSummary.pixCopiaECola
              ? `Envie a nova chave PIX única (\`${remSummary.pixCopiaECola}\`) e o link atualizado do pacote (${remSummary.packagePortalUrl}).`
              : `Envie o link atualizado do pacote (${remSummary.packagePortalUrl}).`);
          return {
            status: 'SUCESSO_EXECUTADO',
            dados: {
              package_code: pkgCode,
              flat_cancelado: flatNumber,
              reserva_cancelada: refCodigoRes,
              flats_ativos_restantes: remSummary.activeFlatsCount,
              valor_pendente_pacote: remSummary.pendingAmount,
              valor_cartao_pacote: remSummary.cardPendingAmount,
              pix_copia_e_cola: remSummary.pixCopiaECola,
              link_pagamento: remSummary.packagePortalUrl,
            },
            instrucao_para_ia: msgRecalc,
            instrucao_resposta_ia: msgRecalc,
          };
        }

        const msgAllUnpaidCanc =
          `Confirme com cordialidade que a pré-reserva do pacote *${pkgCode}* foi cancelada sem custos conforme solicitado.`;
        return {
          status: 'SUCESSO_EXECUTADO',
          dados: {
            package_code: pkgCode,
            status_reserva: 'cancelada',
            flats_ativos_restantes: 0,
            multa_aplicavel_pct: 0,
          },
          instrucao_para_ia: msgAllUnpaidCanc,
          instrucao_resposta_ia: msgAllUnpaidCanc,
        };
      }

      const freeCancelHours = Math.max(
        0,
        Number(db?.siteConfig?.cancellationPolicy?.freeCancellationHours ?? db?.settings?.cancellationPolicy?.freeCancellationHours ?? 24)
      );
      const nowMs = new Date(context.data_hora_atual || Date.now()).getTime();
      const checkinMs = new Date(`${refCheckinDate}T14:00:00-03:00`).getTime();
      const hoursUntilCheckin = (checkinMs - nowMs) / (1000 * 60 * 60);
      const dentroDoPrazoGratuito = !Number.isNaN(hoursUntilCheckin) && hoursUntilCheckin >= freeCancelHours;

      // CASO 1: Dentro do prazo gratuito antes do check-in -> Cancelamento Gratuito (suporta cancelamento parcial de 1 flat no pacote!)
      if (dentroDoPrazoGratuito) {
        if (!args.confirmacao_hospede) {
          const msgSim =
            pkgCode && pkgActiveItems.length > 1 && !cancelWholePackage
              ? `Informe ao solicitante que, como faltam mais de ${freeCancelHours} horas para o check-in (${refCheckinDate} às 14:00h), o cancelamento apenas do *Flat ${flatNumber}* (${refCodigoRes}) no pacote *${pkgCode}* é *gratuito e sem multa*, mantendo os demais *${pkgActiveItems.length - 1} flat(s)* 100% confirmados e pagos. Pergunte se ele confirma o cancelamento apenas do Flat ${flatNumber}.`
              : pkgCode && pkgActiveItems.length > 1
              ? `Informe ao solicitante que, como faltam mais de ${freeCancelHours} horas para o check-in, o cancelamento do pacote *${pkgCode}* (${pkgActiveItems.length} flat(s)) é *gratuito e sem multa* (ou se preferir, pode cancelar apenas 1 flat específico informando o número do flat). Pergunte se ele confirma o cancelamento.`
              : `Informe ao hóspede que, como faltam mais de ${freeCancelHours} horas para o check-in (${refCheckinDate} às 14:00h), o cancelamento da reserva *${refCodigoRes}* no *Flat ${flatNumber}* é *gratuito e sem multa*. ` +
                `Pergunte se ele confirma o cancelamento definitivo ou se prefere apenas remarcar as datas.`;
          return {
            status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
            dados: {
              reserva_id: refCodigoRes,
              ...(pkgCode ? { package_code: pkgCode, cancelar_pacote_inteiro: cancelWholePackage } : {}),
              dentro_prazo_24h: true,
              horas_restantes_para_checkin: Math.round(hoursUntilCheckin),
              multa_aplicavel_pct: 0,
            },
            instrucao_para_ia: msgSim,
            instrucao_resposta_ia: msgSim,
          };
        }

        if (pkgCode && targetRes && db) {
          const cancelPaidRes = await cancelSinglePackageFlat(
            db,
            targetRes,
            {
              cancelWholePackage,
              refundResolution: 'partial_refund',
              reason: args.motivo_cancelamento || 'Cancelado pelo solicitante via WhatsApp (>24h antes do check-in)',
              actor: { name: 'Sofia IA', role: 'ai', type: 'system' },
              source: 'WhatsApp IA',
            },
            {
              baseUrl: baseUrlPkg,
              createInterPixCob: globalThis.createInterPixCob,
              generateStaticPixPayload,
              computeCardAmountFromPix,
              saveDatabase: context.runtime?.saveDatabase,
            }
          );
          if (typeof context.runtime?.saveDatabase === 'function') {
            await context.runtime.saveDatabase();
          }
          const remCount = cancelPaidRes?.summary?.activeFlatsCount ?? 0;
          await notifyAdminWhatsApp({
            nivel_urgencia: 'BAIXA',
            categoria: 'FINANCEIRO',
            hospede_nome: cancelPaidRes?.summary?.requesterName || targetRes.guestName || 'Solicitante',
            telefone: context.telefone_remetente,
            imovel: cancelWholePackage ? `Pacote ${pkgCode}` : `Flat ${flatNumber} (${pkgCode})`,
            resumo: cancelWholePackage
              ? `Pacote ${pkgCode} cancelado integralmente dentro do prazo gratuito (>24h).`
              : `Flat ${flatNumber} (${refCodigoRes}) cancelado parcialmente do pacote ${pkgCode} (>24h); ${remCount} flat(s) permanecem ativos e pagos.`,
            context,
          });
          const msgPkgPaidCanc = cancelWholePackage
            ? `Confirme com cordialidade que o pacote *${pkgCode}* foi cancelado sem multa conforme a política de ${freeCancelHours}h e que o estorno cabível já foi encaminhado à administração.`
            : `Confirme com cordialidade que apenas o *Flat ${flatNumber}* (${refCodigoRes}) foi cancelado sem multa do pacote *${pkgCode}*, mantendo os demais *${remCount} flat(s)* 100% confirmados e pagos, e que o estorno parcial referente ao Flat ${flatNumber} já foi encaminhado à administração.`;
          return {
            status: 'SUCESSO_EXECUTADO',
            dados: {
              package_code: pkgCode,
              reserva_id: refCodigoRes,
              cancelar_pacote_inteiro: cancelWholePackage,
              flats_ativos_restantes: remCount,
              status_reserva: 'cancelada',
              dentro_prazo_24h: true,
              multa_aplicavel_pct: 0,
            },
            instrucao_para_ia: msgPkgPaidCanc,
            instrucao_resposta_ia: msgPkgPaidCanc,
          };
        }

        if (targetRes) {
          targetRes.status = 'cancelada';
          targetRes.cancelledAt = new Date().toISOString();
          targetRes.cancellationReason = args.motivo_cancelamento || 'Cancelado pelo hóspede via WhatsApp (>24h antes do check-in)';
          targetRes.updatedAt = new Date().toISOString();
          if (typeof context.runtime?.saveDatabase === 'function') {
            await context.runtime.saveDatabase();
          }
        }

        await notifyAdminWhatsApp({
          nivel_urgencia: 'BAIXA',
          categoria: 'FINANCEIRO',
          hospede_nome: targetRes?.guestName || context.hospede?.nome || 'Hóspede',
          telefone: context.telefone_remetente,
          imovel: `Flat ${flatNumber}`,
          resumo: `Reserva ${refCodigoRes} (${refCheckinDate} a ${refCheckoutDate}) cancelada dentro do prazo gratuito (>24h antes do check-in). Motivo: ${args.motivo_cancelamento || 'Não informado'}.`,
          context,
        });

        const msgCancelada =
          `Confirme com cordialidade que a reserva *${refCodigoRes}* no *Flat ${flatNumber}* foi cancelada sem custos conforme a política de 24h e que a administração já foi avisada para processar eventual estorno cabível.`;

        return {
          status: 'SUCESSO_EXECUTADO',
          dados: {
            reserva_id: refCodigoRes,
            status_reserva: 'cancelada',
            dentro_prazo_24h: true,
            multa_aplicavel_pct: 0,
          },
          instrucao_para_ia: msgCancelada,
          instrucao_resposta_ia: msgCancelada,
        };
      }

      // CASO 2: Menos de 24h antes do check-in (ou já em estadia) -> Cobrança de 100%
      if (!args.solicitar_excecao_gestor) {
        const msgRegra100 =
          `Explique com muita empatia que a política oficial da CorpFlats permite cancelamento gratuito até *24 horas antes do horário de check-in* (14:00h do dia ${reserva.data_checkin}). ` +
          `Como estamos a menos de 24 horas da entrada, o cancelamento fora do prazo possui retenção integral (*100% do valor da reserva*). ` +
          `Informe que, caso tenha ocorrido algum imprevisto grave e ele deseje solicitar uma análise de exceção ou conversão em crédito para datas futuras, você pode encaminhar o pedido diretamente ao gestor no WhatsApp agora mesmo.`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'PRAZO_CANCELAMENTO_24H_EXPIRADO',
          dados: {
            reserva_id: reserva.id,
            dentro_prazo_24h: false,
            horas_restantes_para_checkin: Math.round(hoursUntilCheckin * 10) / 10,
            multa_aplicavel_pct: 100,
          },
          instrucao_para_ia: msgRegra100,
          instrucao_resposta_ia: msgRegra100,
        };
      }

      // Hóspede insistiu ou pediu exceção/crédito fora do prazo -> Cria proposta e alerta o gestor (5522998505276) com opções 1, 2, 3
      const proposalId = `CANC-${Date.now().toString(36).slice(-5).toUpperCase()}`;
      const hospedeNome = targetRes?.guestName || context.hospede?.nome || 'Hóspede';
      const valorTotal = Number(targetRes?.totalAmount || reserva.valor_total || 237.0);

      if (db) {
        if (!Array.isArray(db.pendingCancellationProposals)) db.pendingCancellationProposals = [];
        db.pendingCancellationProposals.unshift({
          id: proposalId,
          status: 'pending_manager',
          reservationId: targetRes?.id || reserva.id,
          reservationCode: reserva.id,
          guestName: hospedeNome,
          guestPhone: context.telefone_remetente,
          flatNumber,
          checkinDate: reserva.data_checkin,
          checkoutDate: reserva.data_checkout,
          totalAmount: valorTotal,
          reason: args.motivo_cancelamento || 'Solicitação de exceção fora do prazo de 24h',
          createdAt: new Date().toISOString(),
        });
        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }
      }

      const resumoGestor = [
        `⚠️ *Pedido de Exceção de Cancelamento Fora do Prazo (<24h) [${proposalId}]*`,
        `• *Hóspede:* ${hospedeNome} (*Flat ${flatNumber}* | Reserva *${reserva.id}*)`,
        `• *Período:* ${reserva.data_checkin} a ${reserva.data_checkout} (Valor: R$ ${valorTotal.toFixed(2)})`,
        `• *Motivo relatado:* ${args.motivo_cancelamento || 'Solicitou análise de exceção/crédito'}`,
        ``,
        `Responda com o número da decisão desejada:`,
        `*1* — Autorizar cancelamento por exceção (sem multa)`,
        `*2* — Converter o valor (R$ ${valorTotal.toFixed(2)}) em crédito para datas futuras`,
        `*3* — Manter a cobrança de 100% conforme a regra`,
      ].join('\n');

      await notifyAdminWhatsApp({
        nivel_urgencia: 'ALTA',
        categoria: 'EXCECAO_COMERCIAL',
        hospede_nome: hospedeNome,
        telefone: context.telefone_remetente,
        imovel: reserva.nome_imovel,
        resumo: resumoGestor,
        context,
      });

      const msgExcecaoEnviada =
        `Informe ao hóspede com acolhimento que você acabou de enviar o pedido de exceção dele diretamente para o WhatsApp da gerência (${proposalId}) ` +
        `para avaliarem a possibilidade de abono ou conversão do valor em crédito de hospedagem, e que assim que o gestor responder você já o avisa por aqui!`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          proposta_id: proposalId,
          reserva_id: reserva.id,
          proposta_excecao_enviada_ao_gestor: true,
          opcoes_gestor: ['1: Autorizar exceção', '2: Converter em crédito', '3: Manter 100%'],
        },
        instrucao_para_ia: msgExcecaoEnviada,
        instrucao_resposta_ia: msgExcecaoEnviada,
      };
    } catch (error) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'MEDIA',
        categoria: 'FINANCEIRO',
        hospede_nome: context.hospede?.nome || 'Hóspede',
        telefone: context.telefone_remetente,
        resumo: `Falha técnica ao executar processar_cancelamento: ${error.message}`,
        context,
      });
      const msg =
        'Informe ao hóspede que sua solicitação sobre o cancelamento já foi encaminhada diretamente para a gerência analisar.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

export const enviarMidiaUnidadeTool = {
  name: 'enviar_midia_unidade',
  description:
    'Envia o pacote de fotos padrão dos apartamentos e da estrutura da CorpFlats no Edifício Soho Residence sempre que o cliente ou hóspede pedir para ver fotos dos flats.',
  allowedStates: ['COMERCIAL_VENDAS', 'PRE_CHECKIN', 'IN_STAY_CONCIERGE', 'POS_CHECKOUT'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      categoria_fotos: {
        type: 'STRING',
        description: 'Categoria opcional solicitada pelo cliente: PACOTE_COMPLETO, QUARTO, COZINHA, CAFE, BANHEIRO ou LAZER.',
      },
    },
    required: [],
  },
  async execute(args, context) {
    try {
      const db = context.runtime?.db;
      const baseUrl =
        db?.settings?.baseUrl ||
        (typeof process !== 'undefined' && process.env?.SERVER_BASE_URL) ||
        'https://corpflats.com.br';

      const defaultGallery =
        Array.isArray(db?.siteConfig?.gallery) && db.siteConfig.gallery.length > 0
          ? db.siteConfig.gallery
          : [
              {
                id: 1,
                title: 'Quarto climatizado e bancada de trabalho',
                category: 'O Flat',
                imageUrl: `${baseUrl}/photos/soho/01-quarto-bancada.jpg`,
              },
              {
                id: 2,
                title: 'Ambiente integrado com mesa, sofá e Smart TV 32"',
                category: 'O Flat',
                imageUrl: `${baseUrl}/photos/soho/02-flat-integrado.jpg`,
              },
              {
                id: 3,
                title: 'Mesa posta para refeições no apartamento',
                category: 'O Flat',
                imageUrl: `${baseUrl}/photos/soho/03-mesa-jantar.jpg`,
              },
              {
                id: 4,
                title: 'Cozinha com cooktop 2 bocas, frigobar e cafeteira',
                category: 'Cozinha',
                imageUrl: `${baseUrl}/photos/soho/04-cozinha-equipada.jpg`,
              },
              {
                id: 5,
                title: 'Café da manhã servido na mesa do flat',
                category: 'Café no Flat',
                imageUrl: `${baseUrl}/photos/soho/cafe-mesa-quarto.jpg`,
              },
              {
                id: 6,
                title: 'Banheiro com bancada em granito e secador de parede',
                category: 'Banheiro',
                imageUrl: `${baseUrl}/photos/soho/05-banheiro.jpg`,
              },
              {
                id: 7,
                title: 'Jacuzzi aquecida e deck de madeira na cobertura',
                category: 'Cobertura & Lazer',
                imageUrl: `${baseUrl}/photos/soho/06-cobertura-jacuzzi.jpg`,
              },
              {
                id: 8,
                title: 'Terraço aberto com vista panorâmica da cidade',
                category: 'Cobertura & Lazer',
                imageUrl: `${baseUrl}/photos/soho/07-terraco-panoramico.jpg`,
              },
              {
                id: 9,
                title: 'Área de descanso integrada às saunas seca e a vapor',
                category: 'Cobertura & Lazer',
                imageUrl: `${baseUrl}/photos/soho/08-spa-saunas.jpg`,
              },
              {
                id: 10,
                title: 'Academia climatizada com vista alta',
                category: 'Cobertura & Lazer',
                imageUrl: `${baseUrl}/photos/soho/09-academia.jpg`,
              },
              {
                id: 11,
                title: 'Sala de jogos climatizada com sinuca e totó',
                category: 'Cobertura & Lazer',
                imageUrl: `${baseUrl}/photos/soho/10-sala-de-jogos.jpg`,
              },
              {
                id: 12,
                title: 'Recepção 24 horas e hall social',
                category: 'Edifício & Garagem',
                imageUrl: `${baseUrl}/photos/soho/11-lobby-elevadores.jpg`,
              },
              {
                id: 13,
                title: 'Fachada nº 209 e acesso à garagem coberta',
                category: 'Edifício & Garagem',
                imageUrl: `${baseUrl}/photos/soho/12-fachada-garagem.jpg`,
              },
            ];

      const catFilter = String(args?.categoria_fotos || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase();
      const textOf = (item) =>
        `${item?.category || ''} ${item?.title || ''} ${item?.imageUrl || ''}`
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();

      let sourceItems = defaultGallery;
      if (catFilter.includes('CAFE')) {
        const matches = defaultGallery.filter((item) => /\bcafe\b/.test(textOf(item)));
        if (matches.length > 0) sourceItems = matches;
      } else if (catFilter.includes('COZINHA')) {
        const matches = defaultGallery.filter((item) => textOf(item).includes('cozinha') || textOf(item).includes('integrado'));
        if (matches.length > 0) sourceItems = matches;
      } else if (catFilter.includes('BANHEIRO')) {
        const matches = defaultGallery.filter((item) => textOf(item).includes('banheiro'));
        if (matches.length > 0) sourceItems = matches;
      } else if (/LAZER|COBERTURA|JACUZZI|ACADEMIA|SAUNA/.test(catFilter)) {
        const matches = defaultGallery.filter((item) => /lazer|cobertura|jacuzzi|terraco|sauna|academia|jogos/.test(textOf(item)));
        if (matches.length > 0) sourceItems = matches;
      } else if (catFilter.includes('QUARTO')) {
        const matches = defaultGallery.filter((item) => /o flat|quarto|integrado|mesa/.test(textOf(item)));
        if (matches.length > 0) sourceItems = matches;
      } else {
        // Pacote completo curado: Quarto + Integrado + Cozinha + Café no Flat + Cobertura com Jacuzzi
        const highlightMatchers = [
          (i) => /01-quarto-bancada/.test(String(i?.imageUrl || '')),
          (i) => /02-flat-integrado/.test(String(i?.imageUrl || '')),
          (i) => /04-cozinha-equipada/.test(String(i?.imageUrl || '')),
          (i) => /cafe-mesa-quarto/.test(String(i?.imageUrl || '')),
          (i) => /06-cobertura-jacuzzi/.test(String(i?.imageUrl || '')),
        ];
        const curated = highlightMatchers.map((fn) => defaultGallery.find(fn)).filter(Boolean);
        if (curated.length >= 4) {
          sourceItems = curated;
        }
      }

      const selectedPhotos = sourceItems.slice(0, 5).map((item) => {
        const rawUrl = String(item.imageUrl || '/photos/soho/01-quarto-bancada.jpg');
        return {
          titulo: item.title || 'Flat CorpFlats - Soho Residence',
          categoria: item.category || 'Flat',
          url: rawUrl.startsWith('http') ? rawUrl : `${baseUrl}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`,
        };
      });

      const msg =
        `Apresente com entusiasmo o pacote de fotos reais dos nossos flats no Edifício Soho Residence (incluindo o link do catálogo completo em ${baseUrl}/reservar) ` +
        `destacando que todos os apartamentos são climatizados, contam com Wi-Fi exclusivo, Smart TV 32", bancada de trabalho, cozinha com cooktop 2 bocas, cafeteira, sanduicheira, frigobar abastecido e acesso à cobertura com jacuzzi aquecida, vista panorâmica, saunas, sala de jogos e academia (observação: caso o cliente tenha perguntado por piscina ou micro-ondas, esclareça com naturalidade que não temos piscina nem micro-ondas, mas temos jacuzzi com água aquecida na cobertura).`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          pacote_fotos_padrao: selectedPhotos,
          total_fotos: selectedPhotos.length,
          link_catalogo_site: `${baseUrl}/reservar`,
        },
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    } catch (error) {
      const msg =
        'Envie ao cliente o link oficial https://corpflats.com.br/reservar onde ele pode visualizar todas as fotos em alta definição dos nossos flats no Soho Residence.';
      return {
        status: 'SUCESSO_EXECUTADO',
        dados: { link_catalogo_site: 'https://corpflats.com.br/reservar' },
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

export const consultarAchadosEPerdidosTool = {
  name: 'consultar_achados_e_perdidos',
  description:
    'Consulta o módulo de Achados e Perdidos (db.lostAndFound) quando um hóspede ou ex-hóspede perguntar se esqueceu algum pertence no flat. ' +
    'Se o item ainda não constar registrado no sistema, explica que assim que a governança encontrar e cadastrar o item com foto no sistema, o hóspede receberá automaticamente uma mensagem no WhatsApp com a foto.',
  allowedStates: ['IN_STAY_CONCIERGE', 'PRE_CHECKIN', 'COMERCIAL_VENDAS', 'POS_CHECKOUT'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      descricao_item: {
        type: 'STRING',
        description: 'Descrição do objeto ou pertence que o hóspede relata ter esquecido (ex: "carregador de celular", "relógio", "óculos").',
      },
      numero_flat: {
        type: 'STRING',
        description: 'Número do flat onde o hóspede esteve hospedado (opcional, resolvido automaticamente do contexto se omitido).',
      },
    },
    required: ['descricao_item'],
  },
  async execute(args, context) {
    try {
      const db = context.runtime?.db;
      const reserva = context.reserva_ativa || context.reserva_atual;
      const flatNumber = String(
        args.numero_flat ||
          (reserva?.nome_imovel ? reserva.nome_imovel.replace(/^Flat\s+/i, '').trim() : '') ||
          ''
      ).trim();
      const termo = String(args.descricao_item || '').toLowerCase().trim();
      const cleanPhone = normalizePhoneDigits(context.telefone_remetente);

      const allLostItems = [
        ...(Array.isArray(db?.lostAndFound) ? db.lostAndFound : []),
        ...(Array.isArray(db?.lostItems) ? db.lostItems : []),
      ];

      const encontrados = allLostItems.filter((item) => {
        if (!item || item.status === 'returned' || item.status === 'discarded') return false;
        const matchFlat = flatNumber && String(item.flatNumber || '') === flatNumber;
        const matchPhone = cleanPhone && phonesMatch(item.guestPhone || item.phone, cleanPhone);
        const descLower = String(item.description || item.title || item.itemName || '').toLowerCase();
        const matchTerm =
          !termo ||
          descLower.includes(termo) ||
          termo
            .split(/\s+/)
            .filter((w) => w.length >= 3)
            .some((w) => descLower.includes(w));
        return (matchFlat || matchPhone) && matchTerm;
      });

      if (encontrados.length > 0) {
        const item = encontrados[0];
        const desc = item.description || item.title || args.descricao_item;
        const msgEncontrado =
          `Dê a ótima notícia ao hóspede: localizamos no módulo de Achados e Perdidos o registro do item *"${desc}"* referente ao *Flat ${item.flatNumber || flatNumber}*! ` +
          `Informe que o item está guardado em segurança com a nossa governança/administração e pergunte como ele prefere combinar a retirada ou envio.`;
        return {
          status: 'SUCESSO_EXECUTADO',
          dados: {
            encontrado_no_sistema: true,
            item_id: item.id,
            descricao: desc,
            flat_number: item.flatNumber || flatNumber,
            data_registro: item.foundAt || item.createdAt || null,
            foto_url: item.photoUrl || item.photo || null,
          },
          instrucao_para_ia: msgEncontrado,
          instrucao_resposta_ia: msgEncontrado,
        };
      }

      // Ainda não cadastrado em db.lostAndFound:
      const msgNaoCadastradoAinda =
        `Informe ao hóspede com acolhimento que você consultou o módulo de Achados e Perdidos agora mesmo e o item (*"${args.descricao_item}"*${flatNumber ? ` no Flat ${flatNumber}` : ''}) *ainda não consta registrado no sistema*. ` +
        `Explique com clareza o nosso procedimento oficial: assim que a camareira/governança encontrar o pertence no apartamento e cadastrá-lo com foto no sistema, ` +
        `*ele receberá automaticamente uma notificação aqui mesmo no WhatsApp com a foto do item encontrado*! Diga que também já deixou um aviso para a equipe de governança verificar com atenção.`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          encontrado_no_sistema: false,
          descricao_consultada: args.descricao_item,
          flat_number: flatNumber || null,
          notificacao_automatica_com_foto_ativa: true,
        },
        instrucao_para_ia: msgNaoCadastradoAinda,
        instrucao_resposta_ia: msgNaoCadastradoAinda,
      };
    } catch (error) {
      const msg =
        'Explique ao hóspede que assim que a equipe de governança localizar e registrar o item com foto no sistema de Achados e Perdidos, ele receberá uma mensagem automática no WhatsApp com a foto do pertence.';
      return {
        status: 'SUCESSO_EXECUTADO',
        dados: { encontrado_no_sistema: false, notificacao_automatica_com_foto_ativa: true },
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

export const ofertarDomingoSemPressaTool = {
  name: 'ofertar_domingo_sem_pressa',
  description:
    'Verifica a disponibilidade de domingo para segunda-feira e aplica ou revalida a "Oferta de Domingo Sem Pressa" ' +
    '(check-out 100% livre no domingo + pernoite bônus até segunda-feira às 12:00h por valor promocional fixo). ' +
    'Deve ser chamada sempre que um hóspede com check-out no domingo perguntar sobre a oferta recebida, pedir novo código PIX ' +
    'após o vencimento do prazo inicial de 30 minutos ou solicitar a extensão promocional do domingo.',
  allowedStates: ['IN_STAY_CONCIERGE'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      confirmacao_hospede: {
        type: 'BOOLEAN',
        description:
          'Passe FALSE primeiro para apenas consultar a disponibilidade atual no sistema e simular valores e benefícios. ' +
          'Passe TRUE somente quando o hóspede confirmar explicitamente que deseja a oferta e solicitar o PIX para pagamento.',
      },
    },
    required: ['confirmacao_hospede'],
  },
  async execute(args, context) {
    try {
      const reserva = context.reserva_ativa || context.reserva_atual;
      if (!reserva) {
        const msg = 'Explique educadamente que você não localizou uma reserva ativa em estadia vinculada a este número de telefone e solicite o código da reserva.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const checkoutDateStr = String(reserva.data_checkout || '').slice(0, 10);
      const [ano, mes, dia] = checkoutDateStr.split('-').map(Number);
      const dtCheckout = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
      const diaSemana = dtCheckout.getUTCDay(); // 0 = Domingo

      if (diaSemana !== 0) {
        const msg = `Informe ao hóspede com gentileza que a "Oferta de Domingo Sem Pressa" é exclusiva para reservas com check-out agendado para o domingo (sua data de saída atual é ${checkoutDateStr}). Ofereça consultar as diárias regulares caso ele deseje prorrogar sua estadia.`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'CHECKOUT_NAO_E_DOMINGO',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const db = context.runtime?.db;
      const flatNumber = reserva.nome_imovel.replace(/^Flat\s+/i, '').trim();
      const sundayUpsellSettings = db?.sundayUpsellConfig || db?.automationSettings?.sundayUpsell || {};
      const discountPercent = Number(sundayUpsellSettings.sundayUpsellDiscountPercent ?? 50);

      const targetRes = Array.isArray(db?.reservations)
        ? db.reservations.find((r) => {
            const rCode = String(r?.code || r?.reservationCode || r?.id || '');
            return rCode === reserva.id || (r.id != null && String(r.id) === String(reserva.id));
          })
        : null;

      let normalRate = 0;
      if (targetRes && typeof targetRes === 'object') {
        if (Array.isArray(targetRes.dailyRates) && targetRes.dailyRates.length > 0) {
          const lastNight = targetRes.dailyRates[targetRes.dailyRates.length - 1];
          const firstNight = targetRes.dailyRates[0];
          const rateFromList = Number(lastNight?.rate ?? lastNight?.amount ?? firstNight?.rate ?? firstNight?.amount ?? 0);
          if (Number.isFinite(rateFromList) && rateFromList > 0) normalRate = Number(rateFromList.toFixed(2));
        }
        if (!(normalRate > 0) && Number.isFinite(Number(targetRes.dailyRate)) && Number(targetRes.dailyRate) > 0) {
          normalRate = Number(Number(targetRes.dailyRate).toFixed(2));
        }
        if (!(normalRate > 0) && Number(targetRes.totalAmount) > 0) {
          const nights = Math.max(1, Number(targetRes.numNights || targetRes.nights || 1) || 1);
          const cleaningFromCharges = Array.isArray(targetRes.charges)
            ? targetRes.charges
                .filter((c) => c && (c.type === 'cleaning' || c.category === 'cleaning' || /limpeza/i.test(String(c.title || c.description || ''))))
                .reduce((acc, c) => acc + (Number(c.amount) || 0), 0)
            : 0;
          const petFromCharges = Array.isArray(targetRes.charges)
            ? targetRes.charges
                .filter((c) => c && (c.type === 'pet' || c.category === 'pet' || /\bpet\b/i.test(String(c.title || c.description || ''))))
                .reduce((acc, c) => acc + (Number(c.amount) || 0), 0)
            : 0;
          const otherExtraCharges = Array.isArray(targetRes.charges)
            ? targetRes.charges
                .filter((c) =>
                  c &&
                  c.type !== 'cleaning' && c.category !== 'cleaning' && !/limpeza/i.test(String(c.title || c.description || '')) &&
                  c.type !== 'pet' && c.category !== 'pet' && !/\bpet\b/i.test(String(c.title || c.description || '')) &&
                  c.type !== 'daily' && c.category !== 'accommodation'
                )
                .reduce((acc, c) => acc + (Number(c.amount) || 0), 0)
            : 0;
          const cleaningFee = Math.max(Number(targetRes.cleaningFee || 0), cleaningFromCharges);
          const petFee = Math.max(Number(targetRes.petFee || 0), petFromCharges);
          const pureAcc = Math.max(0, Number(targetRes.totalAmount || 0) - cleaningFee - petFee - otherExtraCharges);
          if (pureAcc > 0) normalRate = Number((pureAcc / nights).toFixed(2));
        }
      }
      if (!(normalRate > 0)) {
        normalRate = Number(reserva.oferta_domingo_sem_pressa?.valor_normal || 200.0);
      }
      const promotionalPrice = Number((normalRate * (1 - (discountPercent / 100))).toFixed(2));
      const economia = Math.max(0, Number((normalRate - promotionalPrice).toFixed(2)));

      const dtSegunda = new Date(dtCheckout.getTime() + 24 * 3600 * 1000);
      const segundaStr = dtSegunda.toISOString().slice(0, 10);

      const incomingSameDayRes = Array.isArray(db?.reservations)
        ? db.reservations.find((r) => {
            if (!r || ['cancelada', 'cancelled', 'no_show', 'expirada'].includes(String(r.status || '').toLowerCase())) return false;
            const rCode = String(r.code || r.reservationCode || r.id || '');
            if (rCode === reserva.id || (r.id != null && String(r.id) === String(reserva.id))) return false;
            const sameFlat =
              String(r.flatNumber || '') === flatNumber ||
              String(r.flatId || '') === String(reserva.imovel_id);
            const sameDayCheckin = String(r.checkinDate || '').slice(0, 10) === checkoutDateStr;
            return sameFlat && sameDayCheckin;
          })
        : null;

      let alternativeFlatForIncoming = null;
      if (incomingSameDayRes) {
        const selectFairShare = context.runtime?.selectFairShareFlat || globalThis.selectFairShareFlat;
        if (typeof selectFairShare === 'function' && db) {
          const fsResult = selectFairShare(
            db,
            checkoutDateStr,
            String(incomingSameDayRes.checkoutDate || segundaStr).slice(0, 10),
            incomingSameDayRes.id
          );
          if (fsResult?.recommendedFlat && String(fsResult.recommendedFlat.number) !== flatNumber) {
            alternativeFlatForIncoming = fsResult.recommendedFlat;
          } else if (Array.isArray(fsResult?.availableFlats)) {
            alternativeFlatForIncoming = fsResult.availableFlats.find((f) => String(f.number) !== flatNumber);
          }
        }

        if (!alternativeFlatForIncoming) {
          const msg =
            `Explique ao hóspede com muita empatia que você acabou de checar o sistema e, infelizmente, o flat (e todo o condomínio) ` +
            `já está com 100% de ocupação para esta noite de domingo para segunda, com novo hóspede agendado para entrar. ` +
            `Por essa razão, a oferta de saída livre não pode mais ser liberada. Lembre-o de que o check-out permanece às 12:00h e ofereça guardar a bagagem na recepção se precisar.`;
          return {
            status: 'BLOQUEADO_PELA_REGRA',
            codigo_regra_bloqueio: 'IMOVEL_INDISPONIVEL_SEM_VAGAS',
            instrucao_para_ia: msg,
            instrucao_resposta_ia: msg,
          };
        }
      }

      if (!args.confirmacao_hospede) {
        const msg =
          `Informe ao hóspede com entusiasmo que a Oferta de Domingo Sem Pressa ESTÁ DISPONÍVEL para o ${reserva.nome_imovel}!\n` +
          `Destaque que por apenas R$ ${promotionalPrice.toFixed(2)} (uma economia de R$ ${economia.toFixed(2)} em relação à diária normal de R$ ${normalRate.toFixed(2)}), ` +
          `ele pode aproveitar o domingo sem hora para sair e ganha o pernoite bônus para sair somente na segunda-feira até às 12:00h.\n` +
          `Pergunte se ele confirma o interesse para você gerar o código PIX de R$ ${promotionalPrice.toFixed(2)} com garantia de pré-reserva por 30 minutos.`;
        return {
          status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
          dados: {
            reserva_id: reserva.id,
            imovel: reserva.nome_imovel,
            data_checkout_atual: checkoutDateStr,
            nova_data_checkout: segundaStr,
            horario_limite_bonus: '12:00',
            valor_promocional: promotionalPrice,
            valor_normal: normalRate,
            economia,
            hold_minutos: 30,
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      let txid = `UPSELL_SUN_${reserva.id || 'RES'}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 35);
      let pixPayload = '';
      if (typeof globalThis.createInterPixCob === 'function') {
        try {
          const interRes = await globalThis.createInterPixCob({
            amount: promotionalPrice,
            description: `Oferta Domingo Sem Pressa - ${reserva.nome_imovel} (${reserva.id})`,
            debtorName: context.hospede?.nome || targetRes?.guestName || 'Hospede CorpFlats',
            debtorDocument: targetRes?.guestDoc || targetRes?.guestCpf || '',
            reservationCode: String(reserva.id || ''),
            expirationSeconds: 1800,
          });
          if (interRes?.pixCopiaECola) {
            pixPayload = interRes.pixCopiaECola;
            txid = interRes.txid || txid;
          }
        } catch (_) {}
      }
      if (!pixPayload) {
        const formatTag = (id, value) => `${id}${String(value.length).padStart(2, '0')}${value}`;
        pixPayload = formatTag('00', '01') +
          formatTag('26', `${formatTag('00', 'br.gov.bcb.pix')}${formatTag('01', '47964813000165')}`) +
          formatTag('52', '0000') +
          formatTag('53', '986') +
          formatTag('54', promotionalPrice.toFixed(2)) +
          formatTag('58', 'BR') +
          formatTag('59', 'CORPFLATS LTDA') +
          formatTag('60', 'CAMPOS') +
          formatTag('62', formatTag('05', txid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || '***'));
        const toCrc = `${pixPayload}6304`;
        let crc = 0xffff;
        for (let i = 0; i < toCrc.length; i++) {
          crc ^= toCrc.charCodeAt(i) << 8;
          for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) !== 0) crc = ((crc << 1) ^ 0x1021) & 0xffff;
            else crc = (crc << 1) & 0xffff;
          }
        }
        pixPayload = `${toCrc}${crc.toString(16).toUpperCase().padStart(4, '0')}`;
      }

      const now = new Date();
      const holdExpiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

      if (targetRes) {
        targetRes.pendingSundayUpsell = {
          txid,
          pixCopiaECola: pixPayload,
          promotionalPrice,
          normalDailyRate: normalRate,
          originalCheckoutDate: checkoutDateStr,
          targetCheckoutDate: segundaStr,
          originalCheckoutTime: '12:00',
          targetCheckoutTime: '12:00',
          expiresAt: holdExpiresAt,
          createdAt: now.toISOString(),
          status: 'pending_payment',
          isSilentUpsellHold: true,
          incomingReservationId: incomingSameDayRes ? (incomingSameDayRes.code || incomingSameDayRes.id) : null,
          alternateFlatNumber: alternativeFlatForIncoming ? String(alternativeFlatForIncoming.number) : null,
          alternateFlatId: alternativeFlatForIncoming ? alternativeFlatForIncoming.id : null,
        };

        targetRes.pendingModification = {
          status: 'awaiting_payment',
          type: 'sunday_upsell',
          newCheckoutDate: segundaStr,
          newCheckoutTime: '12:00',
          expiresAt: holdExpiresAt,
          isSilentUpsellHold: true,
        };

        targetRes.isSilentUpsellHold = true;
        targetRes.holdExpiresAt = holdExpiresAt;
        targetRes.updatedAt = now.toISOString();

        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }
      }

      const msgSucesso =
        `Confirme com entusiasmo que a Oferta de Domingo Sem Pressa foi ativada com pré-reserva garantida por 30 minutos para o ${reserva.nome_imovel}!\n` +
        `Apresente em um parágrafo acolhedor que o check-out fica livre no domingo com extensão para pernoite até segunda às 12:00h.\n` +
        `Informe o valor promocional de R$ ${promotionalPrice.toFixed(2)} e que o pagamento deve ser realizado via PIX em até 30 minutos para confirmação definitiva no sistema.\n` +
        `IMPORTANTE: Envie o código PIX Copia e Cola (${pixPayload}) em um parágrafo isolado para que o hóspede possa copiar com apenas um toque no celular.`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          reserva_id: reserva.id,
          valor_promocional: promotionalPrice,
          pix_copia_e_cola: pixPayload,
          txid,
          hold_minutos: 30,
          validade_hold: holdExpiresAt,
          nova_data_checkout: segundaStr,
          horario_checkout_bonus: '12:00',
        },
        instrucao_para_ia: msgSucesso,
        instrucao_resposta_ia: msgSucesso,
      };
    } catch (error) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'MEDIA',
        categoria: 'ERRO_SISTEMA_TOOL',
        hospede_nome: context.hospede?.nome || 'Desconhecido',
        telefone: context.telefone_remetente,
        resumo: `Falha técnica ao executar ofertar_domingo_sem_pressa: ${error?.message || error}`,
      });

      const msgErro =
        'Peça sinceras desculpas ao hóspede informando que o sistema apresentou uma instabilidade momentânea ao gerar a cobrança, ' +
        'mas que você já notificou a gerência no WhatsApp para enviar o link promocional em instantes.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msgErro,
        instrucao_resposta_ia: msgErro,
      };
    }
  },
};

export const ALL_AGENT_TOOLS = [
  consultarDisponibilidadeTool,
  calcularOrcamentoTool,
  gerarLinkReservaTool,
  consultarDetalhesReservaTool,
  atualizarDadosHospedeTool,
  solicitarEarlyCheckinTool,
  solicitarLateCheckoutTool,
  alterarDatasReservaTool,
  estenderEstadiaTool,
  solicitarLimpezaExtraTool,
  abrirChamadoManutencaoTool,
  gerenciarNotaFiscalNfseTool,
  resolverProblemaCartaoNfcTool,
  autorizarVisitaTemporariaTool,
  processarCancelamentoTool,
  enviarMidiaUnidadeTool,
  consultarAchadosEPerdidosTool,
  notificarAdministradorTool,
  ofertarDomingoSemPressaTool,
];

export function getToolsForState(estado = 'COMERCIAL_VENDAS') {
  return ALL_AGENT_TOOLS.filter((tool) => tool.allowedStates.includes(estado));
}

export function getGeminiFunctionDeclarationsForState(estado = 'COMERCIAL_VENDAS') {
  return getToolsForState(estado).map((tool) => {
    const schema = { ...(tool.parametersSchema || { type: 'OBJECT', properties: {} }) };
    if (Array.isArray(schema.required) && schema.required.length === 0) {
      delete schema.required;
    }
    return {
      name: tool.name,
      description: tool.description,
      parameters: schema,
    };
  });
}

export function isRegisteredAgentTool(toolName) {
  return ALL_AGENT_TOOLS.some((t) => t.name === toolName);
}

export async function executeRegisteredAgentTool(toolName, args, context) {
  const tool = ALL_AGENT_TOOLS.find((t) => t.name === toolName);
  if (!tool) {
    const msg = `A ferramenta '${toolName}' não existe no registro oficial. Informe ao hóspede que você encaminhará a solicitação para a recepção.`;
    return {
      status: 'ERRO_REQUER_HUMANO',
      status_normalizado: 'requer_intervencao_humana',
      codigo_regra_bloqueio: 'TOOL_NAO_ENCONTRADA',
      motivo_bloqueio: 'TOOL_NAO_ENCONTRADA',
      instrucao_para_ia: msg,
      instrucao_resposta_ia: msg,
    };
  }

  const res = await tool.execute(args || {}, context);
  const instrucao = res.instrucao_para_ia || res.instrucao_resposta_ia || '';
  const statusNorm =
    res.status === 'BLOQUEADO_PELA_REGRA'
      ? 'bloqueado_pela_regra'
      : res.status === 'ERRO_REQUER_HUMANO' || res.status === 'ADMINISTRADOR_NOTIFICADO'
      ? 'requer_intervencao_humana'
      : 'sucesso';
  return {
    ...res,
    status_normalizado: statusNorm,
    motivo_bloqueio: res.motivo_bloqueio || res.codigo_regra_bloqueio || undefined,
    instrucao_para_ia: instrucao,
    instrucao_resposta_ia: instrucao,
  };
}

export function ensureInstructionalToolResponse(actionName, rawResult) {
  if (!rawResult || typeof rawResult !== 'object') {
    const fallbackMsg =
      'Informe ao hóspede com cordialidade o resultado da consulta ou encaminhe para a recepção caso necessário.';
    return {
      status: 'SUCESSO_EXECUTADO',
      status_normalizado: 'sucesso',
      dados: { raw: rawResult },
      instrucao_para_ia: fallbackMsg,
      instrucao_resposta_ia: fallbackMsg,
    };
  }

  if (typeof rawResult.instrucao_para_ia === 'string' && rawResult.instrucao_para_ia.trim()) {
    const st = rawResult.status || 'SUCESSO_EXECUTADO';
    const statusNorm =
      st === 'BLOQUEADO_PELA_REGRA' || st === 'bloqueado_pela_regra'
        ? 'bloqueado_pela_regra'
        : st === 'ERRO_REQUER_HUMANO' || st === 'requer_intervencao_humana'
        ? 'requer_intervencao_humana'
        : 'sucesso';
    return {
      ...rawResult,
      status: st,
      status_normalizado: statusNorm,
      motivo_bloqueio: rawResult.motivo_bloqueio || rawResult.codigo_regra_bloqueio || undefined,
      instrucao_para_ia: rawResult.instrucao_para_ia,
      instrucao_resposta_ia: rawResult.instrucao_resposta_ia || rawResult.instrucao_para_ia,
    };
  }

  if (rawResult.error || rawResult.ok === false) {
    const errReason =
      rawResult.message || rawResult.error || 'Operação bloqueada ou indisponível no momento.';
    const isRuleBlock =
      rawResult.error === 'NO_AVAILABILITY' ||
      rawResult.error === 'FLAT_UNAVAILABLE' ||
      rawResult.error === 'INVALID_DATES' ||
      rawResult.available === false;
    const status = isRuleBlock
      ? 'BLOQUEADO_PELA_REGRA'
      : rawResult.requiresHandover
      ? 'ERRO_REQUER_HUMANO'
      : 'BLOQUEADO_PELA_REGRA';
    const instrucao =
      `A ferramenta '${actionName}' retornou: ${errReason}. ` +
      `Explique ao hóspede com empatia e naturalidade os fatos exatos acima, sem usar jargões técnicos.`;
    return {
      ...rawResult,
      status,
      status_normalizado: status === 'ERRO_REQUER_HUMANO' ? 'requer_intervencao_humana' : 'bloqueado_pela_regra',
      codigo_regra_bloqueio: String(rawResult.error || 'REGRA_BACKEND'),
      motivo_bloqueio: String(rawResult.message || rawResult.error || 'REGRA_BACKEND'),
      dados: rawResult,
      instrucao_para_ia: instrucao,
      instrucao_resposta_ia: instrucao,
    };
  }

  const summaryMsg =
    rawResult.message ||
    `Operação '${actionName}' executada com sucesso no backend. Utilize os valores e dados exatos retornados no objeto para responder ao hóspede de forma natural e objetiva no WhatsApp.`;

  return {
    ...rawResult,
    status: rawResult.status || 'SUCESSO_EXECUTADO',
    status_normalizado: 'sucesso',
    dados: rawResult.dados || rawResult,
    instrucao_para_ia: summaryMsg,
    instrucao_resposta_ia: summaryMsg,
  };
}

export function buildStateRoutedPrompt(context, manualImovel = '') {
  const jsonContext = buildContextoSessaoJson(context);
  const isoNow = context?.data_hora_atual || new Date().toISOString();
  const minuteIso = String(isoNow).replace(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):\d{2}(?:\.\d+)?/,
    '$1'
  );
  const todayIso = String(isoNow).slice(0, 10);
  const tomorrowIso = addDaysIso(todayIso, 1);
  const estado = context?.estado_atual || 'COMERCIAL_VENDAS';
  const modoLabel =
    estado === 'IN_STAY_CONCIERGE'
      ? 'MODO_CONCIERGE_INSTAY / IN_STAY_CONCIERGE (Hóspede em Estadia Ativa no Flat)'
      : estado === 'PRE_CHECKIN'
      ? 'MODO_PRE_CHECKIN / PRE_CHECKIN (Hóspede com Reserva Confirmada antes da Entrada)'
      : estado === 'POS_CHECKOUT'
      ? 'MODO_POS_CHECKOUT / POS_CHECKOUT (Pós-Check-out: suporte a Prorrogação/Extensão de Estadia, NFS-e, Recibo /minha-reserva/:code e Achados e Perdidos)'
      : 'MODO_COMERCIAL_LEAD / COMERCIAL_VENDAS (Lead sem Reserva: foco em Cotação, Fotos Padrão e Fechamento de Pré-Reserva)';

  return [
    `# DIRETRIZES OBRIGATÓRIAS DE EXECUÇÃO E USO DE FERRAMENTAS (TOOL CALLING)`,
    `1. **Intenção -> Ferramenta:** Sempre que o hóspede pedir algo que envolva datas (\`alterar_datas_reserva\`, \`estender_estadia\`), horários (\`solicitar_early_checkin\`, \`solicitar_late_checkout\`), disponibilidade (\`consultar_disponibilidade\`), valores/descontos (\`calcular_orcamento\`), fotos (\`enviar_midia_unidade\`), reserva (\`gerar_link_reserva\`), veículo/cadastro/correção de e-mail ou telefone (\`atualizar_dados_hospede\`), cartão NFC/acesso (\`resolver_problema_cartao_nfc\`), visitas (\`autorizar_visita_temporaria\`), cancelamento (\`processar_cancelamento\`), governança (\`solicitar_limpeza_extra\`), manutenção (\`abrir_chamado_manutencao\`), achados e perdidos (\`consultar_achados_e_perdidos\`) ou nota fiscal/recibo (\`gerenciar_nota_fiscal_nfse\`), chame a ferramenta adequada antes de responder.`,
    `2. **Continuidade Multi-Turn (Respostas Curtas do Hóspede ou Solicitante):** Quando o hóspede ou solicitante responder a uma pergunta anterior sua na conversa (ex: você perguntou "até que data gostaria de ficar?" e ele respondeu "até amanhã só", ou o sistema avisou sobre \`alerta_email_incorreto\` e o hóspede enviou um novo e-mail / confirmou \`email_sugerido\` / afirmou que o e-mail já cadastrado está correto, ou houver \`alertas_telefone_hospede_invalido\` ativo e o Solicitante enviar o novo número WhatsApp do hóspede), mantenha 100% do contexto e acione IMEDIATAMENTE a ferramenta correspondente (\`estender_estadia\` ou \`atualizar_dados_hospede\` passando \`email\`, \`confirmar_email_atual: true\`, ou \`telefone_hospede\` com \`codigo_reserva_alvo\`/\`nome_hospede_alvo\`/\`indice_hospede_alvo\` quando aplicável).`,
    `3. **Proibição de Repetir "Olá, [Nome]!" e Apresentação em Conversa em Andamento:** Se já houver mensagens recentes trocadas no histórico da conversa, NUNCA repita "Olá, [Nome]!", "Bom dia, [Nome]!" e NUNCA se apresente novamente dizendo "Sou a Sofia, concierge virtual da CorpFlats". Continue o diálogo diretamente do ponto onde parou, como uma pessoa real no WhatsApp.`,
    `4. **Acesso via Cartão NFC (Zero Senha de Porta):** Na CorpFlats (Soho Residence) o acesso aos flats é feito exclusivamente por **Cartão NFC** retirado na recepção 24h. NUNCA mencione "senha da porta" ou "senha da fechadura eletrônica".`,
    `5. **Simulação antes da Efetivação:** Para alterações que envolvam custos ou mudanças de data, chame a ferramenta primeiro em modo de simulação/consulta (\`confirmacao_hospede: false\` ou \`efetivar_alteracao: false\`), informe as condições ao hóspede e só efetive após o "sim" explícito dele.`,
    `6. **Obediência Estrita ao Retorno Instrucional da API:** Ao chamar uma ferramenta, leia atentamente o campo \`instrucao_para_ia\` retornado pelo sistema. Use os fatos e limites exatos daquele retorno para construir sua resposta. Nunca invente motivos técnicos e nunca contorne um status \`BLOQUEADO_PELA_REGRA\`.`,
    `7. **Escalonamento Inteligente (\`notificar_administrador\`):** Se uma ação for bloqueada pelo sistema e o hóspede insistir, pedir uma exceção, relatar um defeito físico no imóvel ou demonstrar frustração, chame IMEDIATAMENTE a ferramenta \`notificar_administrador\` para avisar o gestor no WhatsApp dele.`,
    `8. **Privacidade Financeira Estrita (\`ocultar_financeiro: true\`) e Pacotes Multi-Flat (\`pacote_multi_flat\`):** Quando \`ocultar_financeiro: true\` constar na reserva injetada (hóspede de reserva corporativa/terceiro ou acompanhante), NUNCA mencione valores de diárias, totais, links de pagamento/recibo ou dados de Nota Fiscal (pertencem exclusivamente ao Solicitante). Quando \`pacote_multi_flat\` estiver presente para o Solicitante, utilize a visão consolidada do pacote (\`PKG-...\`) com PIX único e Nota Fiscal única.`,
    manualImovel ? `\n# MANUAL DO IMÓVEL ATUAL\n${manualImovel}` : '',
    ``,
    `# ARQUITETURA AUTÔNOMA DE ATENDIMENTO [ESTADO DA SESSÃO: ${modoLabel}]`,
    `# DATA E HORA ATUAL DO SISTEMA (REFERÊNCIA ABSOLUTA PARA DATAS RELATIVAS)`,
    `- Referência ISO (minuto): ${minuteIso}`,
    `- Hoje: ${todayIso} | Amanhã: ${tomorrowIso} | Depois de amanhã: ${addDaysIso(todayIso, 2)}`,
    ``,
    `# CONTEXTO ATUAL DO HÓSPEDE (INJETADO PELO SISTEMA - ZERO-ASK)`,
    `Não peça ao hóspede informações que já constam abaixo (nome, flat, datas, plano com/sem café, status de pagamento, FNRH ou veículo):`,
    jsonContext,
  ]
    .filter(Boolean)
    .join('\n');
}

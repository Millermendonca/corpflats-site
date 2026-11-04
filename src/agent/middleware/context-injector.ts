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
  const { db, phone, now = new Date(), guestContext, runtime } = params;
  const cleanPhone = normalizePhoneDigits(phone);
  const { isoNow, todayStr } = getBrasiliaIsoAndDate(now);

  const reservations: any[] = Array.isArray(db?.reservations) ? db.reservations : [];
  const guests: any[] = Array.isArray(db?.guests) ? db.guests : [];

  const matchingReservations = reservations.filter((r) => {
    if (!r || r.status === 'cancelada' || r.status === 'cancelled') return false;
    return (
      phonesMatch(r.guestPhone || r.phone, cleanPhone) ||
      phonesMatch(r.requesterInfo?.phone || r.requesterInfo?.whatsapp || r.requesterPhone, cleanPhone)
    );
  });

  // 1. Prioriza estadia em andamento (check-in <= hoje <= check-out) e não encerrada
  let activeRes = matchingReservations.find((r) => {
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

  // 2. Se não há estadia em andamento, busca reserva futura confirmada (PRÉ-CHECKIN)
  let futureRes: any = null;
  if (!activeRes) {
    const futureCandidates = matchingReservations
      .filter((r) => String(r.checkinDate || '').slice(0, 10) > todayStr)
      .sort((a, b) => String(a.checkinDate || '').localeCompare(String(b.checkinDate || '')));
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
  const guestName =
    chosenRes?.guestName ||
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

  let reservaSessao: ReservaAtivaSessao | undefined;
  const sourceRes = chosenRes || (guestContext?.hasReservation ? guestContext.reservation : null);

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
    const isPaid =
      rawPay === 'paid' ||
      rawPay === 'pago' ||
      rawPay === 'pago_integralmente' ||
      rawPay === 'confirmado';

    const wifiPassword =
      db?.whatsappAiSettings?.knowledgeBase?.wifiPassword || '1234567890123';

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
      quantidade_hospedes: Number(sourceRes.guestsCount || sourceRes.guests || 1),
      senha_fechadura: sourceRes.doorCode || sourceRes.lockPassword || undefined,
      wifi_rede: `apto ${flatNum}`,
      wifi_senha: wifiPassword,
    };

    if (sourceRes.pendingSundayUpsell || sourceRes.sundayUpsellOffer) {
      const offer = sourceRes.pendingSundayUpsell || sourceRes.sundayUpsellOffer;
      const holdExp = offer.expiresAt || offer.holdExpiresAt ? new Date(offer.expiresAt || offer.holdExpiresAt).getTime() : 0;
      const isExpired = holdExp > 0 && Date.now() > holdExp;
      const isPaid = offer.status === 'paid' || offer.status === 'confirmed_paid' || sourceRes.hasSundayUpsell === true || sourceRes.sundayUpsellPaid === true;
      const promoPrice = Number(offer.promotionalPrice || offer.sundayUpsellPrice || 90.0);
      const normalRate = Number(offer.normalDailyRate || offer.normalRate || sourceRes.dailyRate || 250.0);
      const economia = Math.max(0, normalRate - promoPrice);

      reservaSessao.oferta_domingo_sem_pressa = {
        ofertada: true,
        status: isPaid ? 'CONFIRMADA_PAGA' : (isExpired ? 'HOLD_EXPIRADO' : 'PENDENTE_PAGAMENTO'),
        data_envio: offer.createdAt || offer.offeredAt || offer.sentAt,
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
  const payload = {
    contexto_sessao: {
      data_hora_atual: context.data_hora_atual,
      perfil_remetente: context.perfil_remetente || (context.reserva_ativa ? 'HOSPEDE_ATIVO' : 'LEAD_DESCONHECIDO'),
      estado_atual: context.estado_atual,
      dados_hospede: context.dados_hospede || context.hospede || null,
      reserva_atual: context.reserva_atual || context.reserva_ativa || null,
    },
  };
  return JSON.stringify(payload, null, 2);
}

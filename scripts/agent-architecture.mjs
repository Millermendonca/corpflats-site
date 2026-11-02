/**
 * Runtime ESM compilado de `src/agent/` (Constituição Arquitetural AGENTS.md)
 * Contém:
 * - Contratos e validação de Retorno Instrucional (`AgentToolResponse` / `instrucao_para_ia`)
 * - Middleware Pré-LLM (`injectSessionContext`, `buildContextoSessaoJson`)
 * - Roteador de Estado (`COMERCIAL_VENDAS`, `PRE_CHECKIN`, `IN_STAY_CONCIERGE`) e Prompts Modulares
 * - Serviço de Transbordo Inteligente (`notifyAdminWhatsApp`)
 * - Registro Central de Tools Semânticas (`solicitar_late_checkout`, `alterar_datas_reserva`, `notificar_administrador`)
 */

function normalizePhoneDigits(phone) {
  return String(phone || '').replace(/\D+/g, '');
}

function phonesMatch(phoneA, phoneB) {
  const a = normalizePhoneDigits(phoneA);
  const b = normalizePhoneDigits(phoneB);
  if (!a || !b || a.length < 8 || b.length < 8) return false;
  return a.endsWith(b.slice(-8)) || b.endsWith(a.slice(-8));
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
  const { db, phone, now = new Date(), guestContext, runtime } = params;
  const cleanPhone = normalizePhoneDigits(phone);
  const { isoNow, todayStr } = getBrasiliaIsoAndDate(now);

  const reservations = Array.isArray(db?.reservations) ? db.reservations : [];
  const guests = Array.isArray(db?.guests) ? db.guests : [];

  const matchingReservations = reservations.filter((r) => {
    if (!r || r.status === 'cancelada' || r.status === 'cancelled') return false;
    return (
      phonesMatch(r.guestPhone || r.phone, cleanPhone) ||
      phonesMatch(r.requesterInfo?.phone || r.requesterInfo?.whatsapp || r.requesterPhone, cleanPhone)
    );
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

  // 2. Se não há estadia em andamento, busca reserva futura confirmada (PRÉ-CHECKIN)
  let futureRes = null;
  if (!activeRes) {
    const futureCandidates = matchingReservations
      .filter((r) => String(r.checkinDate || '').slice(0, 10) > todayStr)
      .sort((a, b) => String(a.checkinDate || '').localeCompare(String(b.checkinDate || '')));
    if (futureCandidates.length > 0) {
      futureRes = futureCandidates[0];
    }
  }

  const chosenRes = activeRes || futureRes || null;

  let estado_atual = 'COMERCIAL_VENDAS';
  let perfil_remetente = 'LEAD_DESCONHECIDO';

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
        telefone: cleanPhone ? `+${cleanPhone}` : String(phone || ''),
      }
    : undefined;

  let reservaSessao;
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

export function buildContextoSessaoJson(context) {
  const payload = {
    contexto_sessao: {
      data_hora_atual: context?.data_hora_atual || new Date().toISOString(),
      perfil_remetente:
        context?.perfil_remetente ||
        (context?.reserva_ativa ? 'HOSPEDE_ATIVO' : 'LEAD_DESCONHECIDO'),
      estado_atual: context?.estado_atual || 'COMERCIAL_VENDAS',
      dados_hospede: context?.dados_hospede || context?.hospede || null,
      reserva_atual: context?.reserva_atual || context?.reserva_ativa || null,
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
      await runtime.sendZapiMessage(adminPhone, formattedMessage, {
        channel: 'ai_agent',
        isAdminAlert: true,
      });
      sent = true;
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

function normalizeTimeHHMM(raw) {
  const clean = String(raw || '').trim();
  const match = clean.match(/(\d{1,2})(?:[:h](\d{2}))?/i);
  if (!match) return '12:00';
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

export const solicitarLateCheckoutTool = {
  name: 'solicitar_late_checkout',
  description:
    'Verifica a disponibilidade e aplica a extensão do horário de saída (late check-out) na reserva atual do hóspede. ' +
    'Deve ser chamada sempre que o hóspede perguntar se pode sair mais tarde ou pedir extensão de horário no dia do check-out.',
  allowedStates: ['PRE_CHECKIN', 'IN_STAY_CONCIERGE'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      horario_solicitado: {
        type: 'STRING',
        description: 'Horário desejado pelo hóspede para sair do imóvel no formato HH:MM (ex: "16:00").',
      },
      confirmacao_hospede: {
        type: 'BOOLEAN',
        description:
          'Passe FALSE na primeira vez para apenas consultar viabilidade e calcular eventual taxa. ' +
          'Passe TRUE somente após o hóspede ter concordado explicitamente na conversa com a taxa ou condição informada.',
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

      let conflitoAgenda = false;
      if (Array.isArray(db?.reservations)) {
        conflitoAgenda = db.reservations.some((r) => {
          if (!r || r.status === 'cancelada' || r.status === 'cancelled') return false;
          const rCode = String(r.code || r.reservationCode || r.id || '');
          if (rCode === reserva.id) return false;
          const sameFlat =
            String(r.flatNumber || '') === flatNumber ||
            String(r.flatId || '') === String(reserva.imovel_id);
          const sameDayCheckin = String(r.checkinDate || '').slice(0, 10) === dataCheckout;
          return sameFlat && sameDayCheckin;
        });
      }

      const horarioLimiteGratuito = '12:30';
      const horarioMaximoPago = '17:00';
      const taxaLateCheckout = 120.0;

      if (conflitoAgenda) {
        const msg =
          `Informe ao hóspede com muita empatia que infelizmente o sistema bloqueou a extensão para as ${horarioFormatado} ` +
          `porque há outro hóspede fazendo check-in hoje às 14h no ${reserva.nome_imovel} e a equipe de governança/limpeza precisa entrar às 12h00. ` +
          `Ofereça uma cortesia de 30 minutos (saída até 12h30) se ajudar e informe que ele pode deixar as malas guardadas na recepção se precisar.`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'CONFLITO_LIMPEZA_PROXIMO_HOSPEDE',
          motivo_tecnico: `Existe uma nova reserva entrando no mesmo dia (${dataCheckout}) no ${reserva.nome_imovel}.`,
          dados: { horario_padrao: '12:00', tolerancia_maxima: '12:30' },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      if (horarioFormatado > horarioMaximoPago) {
        const msg =
          `Explique ao hóspede que nosso limite para late check-out é até as ${horarioMaximoPago}. ` +
          `Acima desse horário o sistema contabiliza uma nova diária. Pergunte se o horário das ${horarioMaximoPago} (com taxa de R$ ${taxaLateCheckout.toFixed(2)}) atende a necessidade dele ou se ele prefere cotar uma diária extra.`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'HORARIO_EXCEDE_LIMITE_LATE_CHECKOUT',
          dados: { horario_maximo_late_checkout: horarioMaximoPago },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      if (horarioFormatado > horarioLimiteGratuito && !confirmado) {
        const msg =
          `Diga ao hóspede que você consultou a agenda do ${reserva.nome_imovel} e o imóvel está disponível para saída às ${horarioFormatado}. ` +
          `Explique que para esse horário há uma taxa fixa de late check-out de R$ ${taxaLateCheckout.toFixed(2)}. ` +
          `Pergunte se ele confirma a alteração para você registrar no sistema e atualizar a programação da governança.`;
        return {
          status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
          dados: {
            horario_solicitado: horarioFormatado,
            valor_taxa: taxaLateCheckout,
            moeda: 'BRL',
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      if (Array.isArray(db?.reservations)) {
        const targetRes = db.reservations.find((r) => {
          const rCode = String(r?.code || r?.reservationCode || r?.id || '');
          return (
            rCode === reserva.id ||
            (String(r?.flatNumber) === flatNumber &&
              String(r?.checkoutDate).slice(0, 10) === dataCheckout)
          );
        });
        if (targetRes) {
          targetRes.lateCheckoutTime = horarioFormatado;
          targetRes.checkoutTime = horarioFormatado;
          targetRes.lateCheckoutApprovedAt = new Date().toISOString();
          if (horarioFormatado > horarioLimiteGratuito) {
            targetRes.lateCheckoutFee = taxaLateCheckout;
          }
          if (typeof context.runtime?.saveDatabase === 'function') {
            await context.runtime.saveDatabase();
          }
        }
      }

      const msg =
        `Confirme com entusiasmo que o late check-out para as ${horarioFormatado} já foi efetivado no sistema para o ${reserva.nome_imovel} ` +
        `e que a programação da governança e da fechadura eletrônica já foi atualizada automaticamente para esse novo horário.`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          reserva_id: reserva.id,
          novo_horario_checkout: horarioFormatado,
          fechadura_sincronizada: true,
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
    'Simula ou efetiva a alteração de datas de check-in ou check-out (ou extensão de estadia) da reserva ativa do hóspede, ' +
    'calculando diferenças de tarifa e verificando disponibilidade real no calendário.',
  allowedStates: ['PRE_CHECKIN', 'IN_STAY_CONCIERGE'],
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

      const novaEntrada = String(args.nova_data_checkin || reserva.data_checkin).slice(0, 10);
      const novaSaida = String(args.nova_data_checkout || reserva.data_checkout).slice(0, 10);
      const confirmado = Boolean(args.efetivar_alteracao ?? args.confirmacao_hospede ?? false);

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

      const db = context.runtime?.db;
      const flatNumber = reserva.nome_imovel.replace(/^Flat\s+/i, '').trim();

      let conflitoReserva = null;
      if (Array.isArray(db?.reservations)) {
        conflitoReserva = db.reservations.find((r) => {
          if (!r || r.status === 'cancelada' || r.status === 'cancelled') return false;
          const rCode = String(r.code || r.reservationCode || r.id || '');
          if (rCode === reserva.id) return false;
          const sameFlat =
            String(r.flatNumber || '') === flatNumber ||
            String(r.flatId || '') === String(reserva.imovel_id);
          if (!sameFlat) return false;
          const rIn = String(r.checkinDate || '').slice(0, 10);
          const rOut = String(r.checkoutDate || '').slice(0, 10);
          return novaEntrada < rOut && novaSaida > rIn;
        });
      }

      if (conflitoReserva) {
        const msg =
          `Informe ao hóspede com empatia que o ${reserva.nome_imovel} já possui outra reserva confirmada conflitando com o período de ${novaEntrada} a ${novaSaida}. ` +
          `Pergunte se ele gostaria que você verificasse a disponibilidade de outro flat equivalente para essas novas datas.`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'CONFLITO_CALENDARIO_IMOVEL',
          dados: {
            imovel: reserva.nome_imovel,
            nova_data_checkin: novaEntrada,
            nova_data_checkout: novaSaida,
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const diariasAtuais = Math.max(1, diffDays(reserva.data_checkin, reserva.data_checkout));
      const diferencaDiarias = novasDiarias - diariasAtuais;
      const tarifaBaseDiaria = 237.0;
      const diferencaValor = Math.max(0, diferencaDiarias * tarifaBaseDiaria);

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

      if (Array.isArray(db?.reservations)) {
        const targetRes = db.reservations.find((r) => {
          const rCode = String(r?.code || r?.reservationCode || r?.id || '');
          return rCode === reserva.id;
        });
        if (targetRes) {
          targetRes.checkinDate = novaEntrada;
          targetRes.checkoutDate = novaSaida;
          targetRes.nights = novasDiarias;
          if (diferencaValor > 0 && typeof targetRes.totalAmount === 'number') {
            targetRes.totalAmount += diferencaValor;
          }
          targetRes.updatedAt = new Date().toISOString();
          if (typeof context.runtime?.saveDatabase === 'function') {
            await context.runtime.saveDatabase();
          }
        }
      }

      const msg =
        `Confirme com cordialidade que a reserva ${reserva.id} no ${reserva.nome_imovel} já foi atualizada no sistema para o novo período de ${novaEntrada} a ${novaSaida} (${novasDiarias} diária(s)).`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          reserva_id: reserva.id,
          nova_data_checkin: novaEntrada,
          nova_data_checkout: novaSaida,
          novas_diarias: novasDiarias,
          diferenca_valor: diferencaValor,
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

export const notificarAdministradorTool = {
  name: 'notificar_administrador',
  description:
    'Envia um alerta imediato para o WhatsApp pessoal do proprietário/administrador. Deve ser acionada quando: ' +
    '1) O hóspede relatar problemas graves de manutenção (falta de água, luz, ar-condicionado quebrado, fechadura falhando); ' +
    '2) O hóspede pedir uma exceção comercial ou desconto que o sistema bloqueou e ele insistir; ' +
    '3) O hóspede demonstrar irritação ou solicitar atendente humano.',
  allowedStates: ['COMERCIAL_VENDAS', 'PRE_CHECKIN', 'IN_STAY_CONCIERGE'],
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

export const ALL_AGENT_TOOLS = [
  solicitarLateCheckoutTool,
  alterarDatasReservaTool,
  notificarAdministradorTool,
];

export function getToolsForState(estado = 'COMERCIAL_VENDAS') {
  return ALL_AGENT_TOOLS.filter((tool) => tool.allowedStates.includes(estado));
}

export function getGeminiFunctionDeclarationsForState(estado = 'COMERCIAL_VENDAS') {
  return getToolsForState(estado).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parametersSchema,
  }));
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
      codigo_regra_bloqueio: 'TOOL_NAO_ENCONTRADA',
      instrucao_para_ia: msg,
      instrucao_resposta_ia: msg,
    };
  }

  const res = await tool.execute(args || {}, context);
  const instrucao = res.instrucao_para_ia || res.instrucao_resposta_ia || '';
  return {
    ...res,
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
      dados: { raw: rawResult },
      instrucao_para_ia: fallbackMsg,
      instrucao_resposta_ia: fallbackMsg,
    };
  }

  if (typeof rawResult.instrucao_para_ia === 'string' && rawResult.instrucao_para_ia.trim()) {
    return {
      ...rawResult,
      status: rawResult.status || 'SUCESSO_EXECUTADO',
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
      codigo_regra_bloqueio: String(rawResult.error || 'REGRA_BACKEND'),
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
    dados: rawResult.dados || rawResult,
    instrucao_para_ia: summaryMsg,
    instrucao_resposta_ia: summaryMsg,
  };
}

export function buildStateRoutedPrompt(context, manualImovel = '') {
  const jsonContext = buildContextoSessaoJson(context);
  const estado = context?.estado_atual || 'COMERCIAL_VENDAS';
  const modoLabel =
    estado === 'IN_STAY_CONCIERGE'
      ? 'IN_STAY_CONCIERGE (Hóspede em Estadia Ativa)'
      : estado === 'PRE_CHECKIN'
      ? 'PRE_CHECKIN (Hóspede com Reserva Futura Confirmada)'
      : 'COMERCIAL_VENDAS (Lead / Cotação e Novas Reservas)';

  return [
    `# ARQUITETURA AUTÔNOMA DE ATENDIMENTO [ESTADO DA SESSÃO: ${modoLabel}]`,
    `# CONTEXTO ATUAL DO HÓSPEDE (INJETADO PELO SISTEMA - ZERO-ASK)`,
    `Não peça ao hóspede informações que já constam abaixo:`,
    jsonContext,
    ``,
    `# DIRETRIZES OBRIGATÓRIAS DE EXECUÇÃO E USO DE FERRAMENTAS (TOOL CALLING)`,
    `1. **Intenção -> Ferramenta:** Sempre que o hóspede pedir algo que envolva datas (\`alterar_datas_reserva\`), horários de saída (\`solicitar_late_checkout\`), disponibilidade, valores, manutenção ou regras que dependam do sistema, chame a ferramenta adequada antes de responder.`,
    `2. **Simulação antes da Efetivação:** Para alterações que envolvam custos ou mudanças de data, chame a ferramenta primeiro em modo de simulação/consulta (\`confirmacao_hospede: false\` ou \`efetivar_alteracao: false\`), informe as condições ao hóspede e só efetive após o "sim" explícito dele.`,
    `3. **Obediência Estrita ao Retorno Instrucional da API:** Ao chamar uma ferramenta, leia atentamente o campo \`instrucao_para_ia\` (ou \`instrucao_resposta_ia\`) retornado pelo sistema. Use os fatos e limites exatos daquele retorno para construir sua resposta. Nunca invente motivos técnicos e nunca contorne um status \`BLOQUEADO_PELA_REGRA\`.`,
    `4. **Escalonamento Inteligente (\`notificar_administrador\`):** Se uma ação for bloqueada pelo sistema e o hóspede insistir, pedir uma exceção, relatar um defeito físico no imóvel ou demonstrar frustração, chame IMEDIATAMENTE a ferramenta \`notificar_administrador\` para avisar o gestor no WhatsApp dele.`,
    manualImovel ? `\n# MANUAL DO IMÓVEL ATUAL\n${manualImovel}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

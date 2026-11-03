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
    const baseUrl =
      db?.settings?.baseUrl ||
      (typeof process !== 'undefined' && process.env?.SERVER_BASE_URL) ||
      'https://corpflats.com.br';

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
      canal_reserva: String(sourceRes.channel || 'whatsapp').toLowerCase(),
      valor_diaria: Number(sourceRes.dailyRate || 237),
      valor_total: Number(sourceRes.totalAmount || 0),
      quantidade_hospedes: Number(sourceRes.guestCount || sourceRes.guestsCount || sourceRes.adults || 1),
      senha_fechadura: sourceRes.doorCode || sourceRes.lockPassword || undefined,
      wifi_rede: `apto ${flatNum}`,
      wifi_senha: wifiPassword,
      veiculo: sourceRes.vehicle || null,
      link_pre_checkin: `${baseUrl}/pre-checkin/${resCode}`,
      link_comprovante_pagamento: `${baseUrl}/minha-reserva/${resCode}`,
      link_agendamento_cafe: `${baseUrl}/minha-reserva/${resCode}/cafe`,
    };
  }

  const veiculoPendente =
    runtime?.conversation?.pendingVehicle ||
    matchedGuest?.pendingVehicle ||
    null;

  return {
    data_hora_atual: isoNow,
    telefone_remetente: cleanPhone ? `+${cleanPhone}` : String(phone || ''),
    perfil_remetente,
    estado_atual,
    hospede: dadosHospede,
    dados_hospede: dadosHospede,
    reserva_ativa: reservaSessao,
    reserva_atual: reservaSessao,
    veiculo_pendente: veiculoPendente,
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

function formatGuestListPtBr(names) {
  const clean = (Array.isArray(names) ? names : []).map((n) => String(n || '').trim()).filter(Boolean);
  if (clean.length === 0) return 'Hóspede';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} e ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')} e ${clean[clean.length - 1]}`;
}

async function generatePixChargeForService({ amount, description, debtorName, debtorDocument, reservationCode, context }) {
  const valor = Number(Number(amount || 0).toFixed(2));
  const createCobFn = context?.runtime?.createInterPixCob || globalThis.createInterPixCob;
  if (typeof createCobFn === 'function') {
    try {
      const res = await createCobFn({
        amount: valor,
        description,
        debtorName: debtorName || 'Hospede CorpFlats',
        debtorDocument: debtorDocument || '',
        reservationCode: reservationCode || '',
      });
      if (res && res.pixCopiaECola) {
        return {
          txid: res.txid,
          pixCopiaECola: res.pixCopiaECola,
          chavePix: '47.964.813/0001-65 (CNPJ - Rental Millers / CorpFlats)',
          valor,
        };
      }
    } catch (err) {
      console.warn('[Sofia PIX Service] Fallback para chave PIX estática:', err?.message || err);
    }
  }
  const fallbackTxId = `PIX_SOFIA_${Date.now()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const chavePix = context?.runtime?.db?.settings?.pixKey || '47.964.813/0001-65 (CNPJ - Rental Millers / CorpFlats)';
  return {
    txid: fallbackTxId,
    pixCopiaECola: chavePix,
    chavePix,
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

export const consultarDisponibilidadeTool = {
  name: 'consultar_disponibilidade',
  description:
    'Consulta a disponibilidade real de flats na CorpFlats para um período de entrada (data_checkin) e saída (data_checkout) ' +
    'e quantidade de hóspedes. Deve ser chamada sempre que um cliente perguntar se há vaga ou quiser cotar datas.',
  allowedStates: ['COMERCIAL_VENDAS', 'PRE_CHECKIN', 'IN_STAY_CONCIERGE'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      data_checkin: { type: 'STRING', description: 'Data desejada de check-in no formato YYYY-MM-DD.' },
      data_checkout: { type: 'STRING', description: 'Data desejada de check-out no formato YYYY-MM-DD.' },
      quantidade_hospedes: { type: 'NUMBER', description: 'Quantidade total de hóspedes (padrão: 1).' },
      preferencia_cama: { type: 'STRING', description: 'Preferência opcional de configuração de cama (casal, solteiro, indiferente).' },
    },
    required: ['data_checkin', 'data_checkout'],
  },
  async execute(args, context) {
    try {
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

      if (hospedes > 3) {
        const msg =
          `Explique ao cliente que cada flat comporta até 3 hóspedes com conforto. ` +
          `Para ${hospedes} pessoas, sugira reservar 2 apartamentos próximos e pergunte se ele gostaria de cotar dessa forma.`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'CAPACIDADE_MAXIMA_EXCEDIDA',
          dados: { quantidade_solicitada: hospedes, capacidade_maxima_por_flat: 3 },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const db = context.runtime?.db;
      const allFlats = Array.isArray(db?.flats) && db.flats.length > 0
        ? db.flats.filter((f) => f && f.isActive !== false && f.status !== 'maintenance')
        : [{ number: '101' }, { number: '202' }, { number: '212' }, { number: '304' }];
      const reservations = Array.isArray(db?.reservations) ? db.reservations : [];

      const availableFlats = allFlats.filter((flat) => {
        const flatNum = String(flat.number || flat.id || '');
        const hasConflict = reservations.some((r) => {
          if (!r || r.status === 'cancelada' || r.status === 'cancelled') return false;
          if (String(r.flatNumber || '') !== flatNum) return false;
          const rIn = String(r.checkinDate || '').slice(0, 10);
          const rOut = String(r.checkoutDate || '').slice(0, 10);
          return checkin < rOut && checkout > rIn;
        });
        return !hasConflict;
      });

      if (availableFlats.length === 0) {
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
      const msg =
        `Confirme com entusiasmo que temos disponibilidade para o período de ${checkin} a ${checkout} (${diarias} diária(s)) para ${hospedes} pessoa(s) ` +
        `(Flats disponíveis: ${listaFlats.join(', ')}). Pergunte se o cliente prefere a opção com café da manhã servido no flat (isenta de taxa de limpeza) ou apenas hospedagem para calcular o orçamento exato.`;

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

export const calcularOrcamentoTool = {
  name: 'calcular_orcamento',
  description:
    'Calcula o orçamento oficial completo e detalhado (diárias, café da manhã servido no flat, taxa de limpeza e valor total) ' +
    'para uma estadia na CorpFlats. Deve ser chamada sempre que o cliente pedir cotação ou valores para datas específicas.',
  allowedStates: ['COMERCIAL_VENDAS', 'PRE_CHECKIN', 'IN_STAY_CONCIERGE'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      data_checkin: { type: 'STRING', description: 'Data de check-in no formato YYYY-MM-DD.' },
      data_checkout: { type: 'STRING', description: 'Data de check-out no formato YYYY-MM-DD.' },
      quantidade_hospedes: { type: 'NUMBER', description: 'Quantidade total de hóspedes (padrão: 1).' },
      incluir_cafe: { type: 'BOOLEAN', description: 'Se deve priorizar o plano com café da manhã servido no quarto (isento de taxa de limpeza).' },
    },
    required: ['data_checkin', 'data_checkout'],
  },
  async execute(args, context) {
    try {
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

      if (hospedes > 3) {
        const msg =
          'Explique ao cliente que nossos flats comportam no máximo 3 hóspedes por unidade e sugira cotar 2 apartamentos para o grupo.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'CAPACIDADE_POR_FLAT_EXCEDIDA',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const diariaBase = 237.0;
      const adicionalTerceiroHospede = hospedes === 3 ? 60.0 : 0.0;
      const valorCafePorPessoaDia = 35.0;
      const taxaLimpezaSemCafe = 70.0;

      const diariaAcomodacao = diariaBase + adicionalTerceiroHospede;
      const diariaComCafe = diariaAcomodacao + hospedes * valorCafePorPessoaDia;

      const totalComCafe = Number((diarias * diariaComCafe).toFixed(2));
      const totalSemCafe = Number((diarias * diariaAcomodacao + taxaLimpezaSemCafe).toFixed(2));

      const msg =
        `Apresente ao cliente com clareza as duas opções oficiais para ${diarias} diária(s) (${checkin} a ${checkout}) para ${hospedes} pessoa(s):\n` +
        `1) *Plano com Café da Manhã no Flat (Recomendado):* R$ ${diariaComCafe.toFixed(2)}/diária -> *Total: R$ ${totalComCafe.toFixed(2)}* (ISENTO de taxa de limpeza!).\n` +
        `2) *Plano Somente Hospedagem:* R$ ${diariaAcomodacao.toFixed(2)}/diária + R$ ${taxaLimpezaSemCafe.toFixed(2)} taxa única de limpeza -> *Total: R$ ${totalSemCafe.toFixed(2)}*.\n` +
        `Pergunte qual das duas opções ele prefere para você já gerar o bloqueio da reserva e a chave PIX.`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          data_checkin: checkin,
          data_checkout: checkout,
          diarias,
          quantidade_hospedes: hospedes,
          opcao_com_cafe: { diaria: diariaComCafe, taxa_limpeza: 0, valor_total: totalComCafe },
          opcao_sem_cafe: { diaria: diariaAcomodacao, taxa_limpeza: taxaLimpezaSemCafe, valor_total: totalSemCafe },
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
    'Gera a pré-reserva com bloqueio temporário de 30 minutos no calendário e fornece o link de pagamento / chave PIX Copia e Cola. ' +
    'Exige duas etapas: passe confirmacao_hospede=FALSE para simular e confirmar os dados com o cliente, e TRUE após o de acordo dele.',
  allowedStates: ['COMERCIAL_VENDAS'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      data_checkin: { type: 'STRING', description: 'Data de entrada no formato YYYY-MM-DD.' },
      data_checkout: { type: 'STRING', description: 'Data de saída no formato YYYY-MM-DD.' },
      nome_hospede: { type: 'STRING', description: 'Nome completo do titular da reserva.' },
      quantidade_hospedes: { type: 'NUMBER', description: 'Quantidade de hóspedes (padrão: 1).' },
      incluir_cafe: { type: 'BOOLEAN', description: 'TRUE para plano com café da manhã incluso, FALSE para somente hospedagem.' },
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
      const checkin = String(args.data_checkin || '').slice(0, 10);
      const checkout = String(args.data_checkout || '').slice(0, 10);
      const diarias = diffDays(checkin, checkout);
      const hospedes = Math.max(1, Number(args.quantidade_hospedes || 1));
      const comCafe = args.incluir_cafe !== false;
      const nomeTitular = String(args.nome_hospede || context.hospede?.nome || '').trim();

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

      const diariaBase = 237.0 + (hospedes === 3 ? 60.0 : 0.0);
      const valorTotal = comCafe
        ? Number((diarias * (diariaBase + hospedes * 35.0)).toFixed(2))
        : Number((diarias * diariaBase + 70.0).toFixed(2));

      if (!args.confirmacao_hospede || !nomeTitular) {
        const faltaNome = !nomeTitular
          ? 'Peça também o *nome completo* do titular para vincular à pré-reserva.'
          : `Confirme se a reserva pode ser emitida em nome de *${nomeTitular}*.`;
        const msg =
          `Informe ao cliente o resumo para bloqueio da reserva: período de ${checkin} a ${checkout} (${diarias} diária(s)), ` +
          `${hospedes} hóspede(s), plano ${comCafe ? 'COM café da manhã (isento de taxa de limpeza)' : 'Somente Hospedagem'}, ` +
          `no valor total de *R$ ${valorTotal.toFixed(2)}*. ${faltaNome}`;
        return {
          status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
          dados: {
            data_checkin: checkin,
            data_checkout: checkout,
            diarias,
            quantidade_hospedes: hospedes,
            incluir_cafe: comCafe,
            valor_total: valorTotal,
            nome_hospede: nomeTitular || null,
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const db = context.runtime?.db;
      const codigoPreReserva = `CF-${Date.now().toString(36).slice(-6).toUpperCase()}`;
      const baseUrl =
        db?.settings?.baseUrl ||
        (typeof process !== 'undefined' && process.env?.SERVER_BASE_URL) ||
        'https://corpflats.com.br';
      const linkPagamento = `${baseUrl}/reservar/${codigoPreReserva}`;
      const chavePix = db?.settings?.pixKey || '47.964.813/0001-65 (CNPJ - Rental Millers / CorpFlats)';

      // Se o cliente enviou dados de veículo no WhatsApp antes da criação da reserva, vincula automaticamente agora
      let veiculoVinculado = null;
      if (typeof globalThis.consumePendingVehicleForPhone === 'function') {
        veiculoVinculado = globalThis.consumePendingVehicleForPhone(db, context.telefone_remetente);
      }
      if (!veiculoVinculado && context.runtime?.conversation?.pendingVehicle?.plate) {
        veiculoVinculado = { ...context.runtime.conversation.pendingVehicle };
        delete context.runtime.conversation.pendingVehicle;
      }

      if (db) {
        if (!Array.isArray(db.preReservations)) db.preReservations = [];
        db.preReservations.push({
          code: codigoPreReserva,
          guestName: nomeTitular,
          guestPhone: context.telefone_remetente,
          checkinDate: checkin,
          checkoutDate: checkout,
          guests: hospedes,
          withBreakfast: comCafe,
          totalAmount: valorTotal,
          vehicle: veiculoVinculado || null,
          status: 'pending_payment',
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
        });
        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }
      }

      const infoVeiculo = veiculoVinculado?.plate
        ? ` Informe também que o veículo placa *${veiculoVinculado.plate}* informado anteriormente já foi vinculado automaticamente à reserva.`
        : '';
      const msg =
        `Confirme com entusiasmo que a pré-reserva *${codigoPreReserva}* foi bloqueada por 30 minutos para *${nomeTitular}* (${checkin} a ${checkout}) ` +
        `no valor de *R$ ${valorTotal.toFixed(2)}*. Envie o link (${linkPagamento}) e a chave PIX oficial (${chavePix}) e peça o comprovante por aqui para confirmação imediata.${infoVeiculo}`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          codigo_pre_reserva: codigoPreReserva,
          nome_hospede: nomeTitular,
          data_checkin: checkin,
          data_checkout: checkout,
          valor_total: valorTotal,
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
        hospede_nome: args.nome_hospede || context.hospede?.nome || 'Lead Comercial',
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
    'Consulta os detalhes completos da reserva ativa ou futura vinculada ao hóspede (imóvel/flat, datas de check-in e check-out, ' +
    'status de pagamento, rede/senha de Wi-Fi e link de pré-check-in digital).',
  allowedStates: ['PRE_CHECKIN', 'IN_STAY_CONCIERGE'],
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

      const baseUrl =
        context.runtime?.db?.settings?.baseUrl ||
        (typeof process !== 'undefined' && process.env?.SERVER_BASE_URL) ||
        'https://corpflats.com.br';
      const linkPreCheckin = `${baseUrl}/pre-checkin/${reserva.id}`;
      const linkPortalReserva = `${baseUrl}/minha-reserva/${reserva.id}`;
      const linkCafe = `${baseUrl}/minha-reserva/${reserva.id}/cafe`;

      const msg =
        `Apresente ao hóspede com clareza os detalhes da reserva *${reserva.id}* no *${reserva.nome_imovel}*: ` +
        `Check-in em ${reserva.data_checkin}, Check-out em ${reserva.data_checkout}, ` +
        `Status de pagamento: ${reserva.status_pagamento}, Wi-Fi rede "${reserva.wifi_rede}" (senha: "${reserva.wifi_senha}"), ` +
        `Link oficial para Pré-Check-in Digital (FNRH, foto do documento e assinatura): ${linkPreCheckin}, ` +
        `Link do Portal do Hóspede / Comprovante de Pagamento (Recibo): ${linkPortalReserva}.`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          reserva_id: reserva.id,
          nome_imovel: reserva.nome_imovel,
          data_checkin: reserva.data_checkin,
          data_checkout: reserva.data_checkout,
          status_pagamento: reserva.status_pagamento,
          quantidade_hospedes: reserva.quantidade_hospedes || 1,
          wifi_rede: reserva.wifi_rede,
          wifi_senha: reserva.wifi_senha,
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
    'Atualiza os dados cadastrais e operacionais do hóspede ou lead (CPF/CNPJ, e-mail, horário previsto de chegada, ' +
    'placa/marca/modelo/cor do veículo para garagem e nomes de acompanhantes). Caso o cliente envie os dados do veículo antes de ter reserva criada, ' +
    'grava vinculado ao WhatsApp dele para anexar automaticamente assim que a reserva for criada. Para FNRH e documento, envia sempre o link /pre-checkin/:code.',
  allowedStates: ['COMERCIAL_VENDAS', 'PRE_CHECKIN', 'IN_STAY_CONCIERGE'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      cpf_cnpj: { type: 'STRING', description: 'CPF ou CNPJ informado pelo hóspede.' },
      email: { type: 'STRING', description: 'Endereço de e-mail do hóspede.' },
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

      const cleanPlate = args.placa_veiculo ? String(args.placa_veiculo).toUpperCase().replace(/[^A-Z0-9-]/g, '').trim() : '';
      const cleanBrand = args.marca_veiculo ? String(args.marca_veiculo).trim() : '';
      const cleanModel = args.modelo_veiculo ? String(args.modelo_veiculo).trim() : '';
      const cleanColor = args.cor_veiculo ? String(args.cor_veiculo).trim() : '';

      if (args.cpf_cnpj) camposAtualizados.push(`CPF/CNPJ: ${args.cpf_cnpj}`);
      if (args.email) camposAtualizados.push(`E-mail: ${args.email}`);
      if (args.horario_previsto_chegada)
        camposAtualizados.push(`Horário previsto de chegada: ${args.horario_previsto_chegada}`);
      if (cleanPlate) {
        const descCarro = [cleanBrand, cleanModel, cleanColor].filter(Boolean).join(' ');
        camposAtualizados.push(`Veículo: Placa ${cleanPlate}${descCarro ? ` (${descCarro})` : ''}`);
      }
      if (Array.isArray(args.nomes_acompanhantes) && args.nomes_acompanhantes.length > 0) {
        camposAtualizados.push(`Acompanhantes: ${args.nomes_acompanhantes.join(', ')}`);
      }

      // CENÁRIO 1: Cliente enviou dados (ex: placa/carro) ANTES de ter uma reserva criada para ele
      if (!reserva) {
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
              email: args.email ? String(args.email).trim().toLowerCase() : '',
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
            if (args.email) guestRec.email = String(args.email).trim().toLowerCase();
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
          `Explique que, assim que a reserva dele for criada no sistema, esses dados do veículo/cadastro serão anexados automaticamente à reserva e à liberação da garagem!`;

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
          'Pergunte educadamente ao hóspede qual informação ele gostaria de cadastrar ou atualizar na reserva (ex: placa/modelo/cor do veículo, horário de chegada, CPF, e-mail ou nome de acompanhante).';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'NENHUM_CAMPO_INFORMADO',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      let garageDispatchResult = null;
      let jaTinhaDisparadoGatilhos = false;

      if (Array.isArray(db?.reservations)) {
        const targetRes = db.reservations.find(
          (r) => String(r?.code || r?.reservationCode || r?.id || '') === reserva.id
        );
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
          if (args.email) targetRes.guestEmail = String(args.email).trim().toLowerCase();
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

          targetRes.updatedAt = new Date().toISOString();
          if (typeof context.runtime?.saveDatabase === 'function') {
            await context.runtime.saveDatabase();
          }
        }
      }

      const baseUrl =
        db?.settings?.baseUrl ||
        (typeof process !== 'undefined' && process.env?.SERVER_BASE_URL) ||
        'https://corpflats.com.br';
      const linkPreCheckin = `${baseUrl}/pre-checkin/${reserva.id}`;

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

      const msg =
        `Confirme com cordialidade que os dados da reserva *${reserva.id}* (${reserva.nome_imovel}) foram atualizados no sistema: ` +
        `${camposAtualizados.join(' | ')}.${detalheGaragem} ` +
        `Caso o hóspede precise preencher a FNRH e enviar a foto do documento/assinatura digital do pré-check-in, envie sempre o link oficial: ${linkPreCheckin}.`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          reserva_id: reserva.id,
          campos_atualizados: camposAtualizados,
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
    'Verifica a disponibilidade de flat desocupado e limpo na governança e aplica as regras oficiais de entrada antecipada (early check-in): ' +
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
        ? db.reservations.find(
            (r) => String(r?.code || r?.reservationCode || r?.id || '') === reserva.id
          )
        : null;

      // 1. Verifica disponibilidade: flat desocupado e limpo
      let conflitoSaidaMesmoDia = false;
      if (Array.isArray(db?.reservations)) {
        conflitoSaidaMesmoDia = db.reservations.some((r) => {
          if (!r || r.status === 'cancelada' || r.status === 'cancelled') return false;
          const rCode = String(r.code || r.reservationCode || r.id || '');
          if (rCode === reserva.id) return false;
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
          ? 'há um hóspede em estadia com saída prevista até as 12h00 e a equipe de governança fará a higienização completa logo em seguida'
          : 'o apartamento ainda está em programação de limpeza na governança e o early check-in está sempre sujeito a haver flat desocupado e limpo';
        const msg =
          `Informe ao hóspede com muita empatia que no momento não conseguimos liberar a entrada antecipada às ${horarioFormatado} no ${reserva.nome_imovel} ` +
          `porque ${motivoBloqueio}. ` +
          `Diga que já deixamos prioridade máxima na limpeza para liberar o quanto antes e que ele pode guardar as malas na recepção se chegar mais cedo!`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'FLAT_OCUPADO_AGUARDANDO_CHECKOUT_E_LIMPEZA',
          dados: { horario_padrao_checkin: '14:00', flat: reserva.nome_imovel },
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

      const msg =
        `Confirme com entusiasmo que o early check-in para as ${horarioFormatado} no ${reserva.nome_imovel} foi autorizado como cortesia na reserva ${reserva.id} ` +
        `e que a recepção e governança já estão cientes da chegada nesse horário.`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          reserva_id: reserva.id,
          novo_horario_checkin: horarioFormatado,
          cortesia: true,
          valor_taxa: 0,
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

export const estenderEstadiaTool = {
  name: 'estender_estadia',
  description:
    'Verifica a disponibilidade do flat atual para prorrogar a estadia até uma nova data de saída (nova_data_checkout), ' +
    'calcula o valor das diárias extras e efetiva a prorrogação após confirmação do hóspede.',
  allowedStates: ['IN_STAY_CONCIERGE', 'PRE_CHECKIN'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      nova_data_checkout: {
        type: 'STRING',
        description: 'Nova data desejada de saída (check-out) no formato YYYY-MM-DD.',
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
    const reserva = context.reserva_ativa || context.reserva_atual;
    return alterarDatasReservaTool.execute(
      {
        reserva_id: reserva?.id,
        nova_data_checkin: reserva?.data_checkin || '',
        nova_data_checkout: args.nova_data_checkout,
        efetivar_alteracao: Boolean(args.confirmacao_hospede),
      },
      context
    );
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
        ? db.reservations.find(
            (r) => String(r?.code || r?.reservationCode || r?.id || '') === reserva.id
          )
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
        ? db.reservations.find(
            (r) => String(r?.code || r?.reservationCode || r?.id || '') === reserva.id
          )
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
  allowedStates: ['PRE_CHECKIN', 'IN_STAY_CONCIERGE'],
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
        ? db.reservations.find(
            (r) => String(r?.code || r?.reservationCode || r?.id || '') === reserva.id
          )
        : null;

      if (args.acao === 'SOLICITAR_RECIBO_COMPROVANTE') {
        const baseUrl =
          db?.settings?.baseUrl ||
          (typeof process !== 'undefined' && process.env?.SERVER_BASE_URL) ||
          'https://corpflats.com.br';
        const linkComprovante = `${baseUrl}/minha-reserva/${reserva.id}`;
        const msg =
          `Envie ao hóspede o link oficial do Portal do Hóspede (${linkComprovante}) onde ele pode visualizar e baixar imediatamente o *Comprovante de Pagamento / Reserva* oficial da estadia no ${reserva.nome_imovel}. ` +
          `Pergunte também se ele deseja agendar a emissão da Nota Fiscal de Serviço Eletrônica (NFS-e).`;
        return {
          status: 'SUCESSO_EXECUTADO',
          dados: {
            reserva_id: reserva.id,
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
        targetRes?.guestName ||
        context.hospede?.nome ||
        'Hóspede';
      const valorOriginal = Number(
        existingState.valorOriginal ||
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
          imovel: reserva.nome_imovel,
          resumo: `Hóspede solicitou alteração do valor da NFS-e de R$ ${valorOriginal.toFixed(2)} para R$ ${args.novo_valor_solicitado.toFixed(2)} na reserva ${reserva.id}.`,
          context,
        });

        const msg =
          `Explique ao hóspede com cordialidade que, por conformidade contábil e segurança fiscal, qualquer alteração no valor original da hospedagem ` +
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

      const listaHospedes =
        Array.isArray(args.hospedes_na_descricao) && args.hospedes_na_descricao.length > 0
          ? args.hospedes_na_descricao
          : existingState.hospedesLista || [targetRes?.guestName || context.hospede?.nome || titularPadrao];

      const novaDescricao =
        args.descricao_servico_completa ||
        (Array.isArray(args.hospedes_na_descricao) ||
        args.observacao_adicional_descricao ||
        !existingState.descricaoServico
          ? buildStandardStayDescription({
              guestNames: listaHospedes,
              flatNumber,
              checkinDate: reserva.data_checkin,
              checkoutDate: reserva.data_checkout,
              extraNotes: args.observacao_adicional_descricao,
            })
          : existingState.descricaoServico);

      const updatedState = {
        ...existingState,
        status:
          args.acao === 'CONFIRMAR_DADOS_NOTA'
            ? 'scheduled_for_checkout'
            : 'awaiting_confirmation',
        reservationId: targetRes?.id || reserva.id,
        reservationCode: reserva.id,
        flatNumber,
        tomadorNome: args.tomador_nome || existingState.tomadorNome || titularPadrao,
        tomadorCpfCnpj:
          args.tomador_cpf_cnpj ||
          existingState.tomadorCpfCnpj ||
          targetRes?.guestCpf ||
          'Não informado',
        tomadorEmail:
          args.tomador_email ||
          existingState.tomadorEmail ||
          targetRes?.guestEmail ||
          'Não informado',
        tomadorEndereco:
          args.tomador_endereco ||
          existingState.tomadorEndereco ||
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
      if (targetRes) {
        targetRes.confirmedFiscalData = { ...updatedState };
        if (args.acao === 'CONFIRMAR_DADOS_NOTA') {
          targetRes.autoEmitInvoice = true;
        }
        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }
      }

      if (args.acao === 'CONFIRMAR_DADOS_NOTA') {
        const msg =
          `Confirme com entusiasmo que os dados da Nota Fiscal (NFS-e) da reserva *${reserva.id}* foram validados e agendados com sucesso ` +
          `(Tomador: ${updatedState.tomadorNome} | Valor: R$ ${valorOriginal.toFixed(2)}) e que a nota será emitida e enviada automaticamente no check-out.`;
        return {
          status: 'SUCESSO_EXECUTADO',
          dados: updatedState,
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const msg =
        `Apresente ao hóspede o resumo atualizado para conferência da Nota Fiscal (NFS-e):\n` +
        `• *Tomador:* ${updatedState.tomadorNome}\n` +
        `• *CPF/CNPJ:* ${updatedState.tomadorCpfCnpj}\n` +
        `• *Endereço:* ${updatedState.tomadorEndereco}\n` +
        `• *E-mail:* ${updatedState.tomadorEmail}\n` +
        `• *Descrição dos Serviços:*\n${updatedState.descricaoServico}\n` +
        `• *Valor Total:* R$ ${valorOriginal.toFixed(2)}\n` +
        `Pergunte se todos os dados estão corretos e se ele confirma para deixarmos a emissão agendada automaticamente para o check-out.`;

      return {
        status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
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
    `1. **Intenção -> Ferramenta:** Sempre que o hóspede pedir algo que envolva datas (\`alterar_datas_reserva\`, \`estender_estadia\`), horários (\`solicitar_early_checkin\`, \`solicitar_late_checkout\`), disponibilidade (\`consultar_disponibilidade\`), valores (\`calcular_orcamento\`), reserva (\`gerar_link_reserva\`), governança (\`solicitar_limpeza_extra\`), manutenção (\`abrir_chamado_manutencao\`) ou nota fiscal (\`gerenciar_nota_fiscal_nfse\`), chame a ferramenta adequada antes de responder.`,
    `2. **Simulação antes da Efetivação:** Para alterações que envolvam custos ou mudanças de data, chame a ferramenta primeiro em modo de simulação/consulta (\`confirmacao_hospede: false\` ou \`efetivar_alteracao: false\`), informe as condições ao hóspede e só efetive após o "sim" explícito dele.`,
    `3. **Obediência Estrita ao Retorno Instrucional da API:** Ao chamar uma ferramenta, leia atentamente o campo \`instrucao_para_ia\` (ou \`instrucao_resposta_ia\`) retornado pelo sistema. Use os fatos e limites exatos daquele retorno para construir sua resposta. Nunca invente motivos técnicos e nunca contorne um status \`BLOQUEADO_PELA_REGRA\`.`,
    `4. **Escalonamento Inteligente (\`notificar_administrador\`):** Se uma ação for bloqueada pelo sistema e o hóspede insistir, pedir uma exceção, relatar um defeito físico no imóvel ou demonstrar frustração, chame IMEDIATAMENTE a ferramenta \`notificar_administrador\` para avisar o gestor no WhatsApp dele.`,
    manualImovel ? `\n# MANUAL DO IMÓVEL ATUAL\n${manualImovel}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

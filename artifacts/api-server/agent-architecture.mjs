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
          status: 'pending_payment',
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
        });
        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }
      }

      const msg =
        `Confirme com entusiasmo que a pré-reserva *${codigoPreReserva}* foi bloqueada por 30 minutos para *${nomeTitular}* (${checkin} a ${checkout}) ` +
        `no valor de *R$ ${valorTotal.toFixed(2)}*. Envie o link (${linkPagamento}) e a chave PIX oficial (${chavePix}) e peça o comprovante por aqui para confirmação imediata.`;

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
      const linkPreCheckin =
        context.estado_atual === 'PRE_CHECKIN'
          ? `${baseUrl}/pre-checkin/${reserva.id}`
          : null;

      const msg =
        `Apresente ao hóspede com clareza os detalhes da reserva *${reserva.id}* no *${reserva.nome_imovel}*: ` +
        `Check-in em ${reserva.data_checkin}, Check-out em ${reserva.data_checkout}, ` +
        `Status de pagamento: ${reserva.status_pagamento}, Wi-Fi rede "${reserva.wifi_rede}" (senha: "${reserva.wifi_senha}")` +
        (linkPreCheckin ? `, Link do Pré-Check-in Digital: ${linkPreCheckin}` : '') +
        `.`;

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
    'Atualiza os dados cadastrais e operacionais do hóspede na reserva ativa (CPF/CNPJ, e-mail, horário previsto de chegada, ' +
    'placa do veículo para garagem e nomes de acompanhantes).',
  allowedStates: ['PRE_CHECKIN', 'IN_STAY_CONCIERGE'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      cpf_cnpj: { type: 'STRING', description: 'CPF ou CNPJ informado pelo hóspede.' },
      email: { type: 'STRING', description: 'Endereço de e-mail do hóspede.' },
      horario_previsto_chegada: { type: 'STRING', description: 'Horário previsto de chegada para o check-in no formato HH:MM.' },
      placa_veiculo: { type: 'STRING', description: 'Placa do veículo caso o hóspede vá utilizar a garagem.' },
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
      if (!reserva) {
        const msg =
          'Explique educadamente que não localizamos uma reserva ativa vinculada a este número para atualizar os dados e peça o código da reserva.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const camposAtualizados = [];
      const db = context.runtime?.db;

      if (args.cpf_cnpj) camposAtualizados.push(`CPF/CNPJ: ${args.cpf_cnpj}`);
      if (args.email) camposAtualizados.push(`E-mail: ${args.email}`);
      if (args.horario_previsto_chegada)
        camposAtualizados.push(`Horário previsto de chegada: ${args.horario_previsto_chegada}`);
      if (args.placa_veiculo) camposAtualizados.push(`Placa do veículo: ${args.placa_veiculo}`);
      if (Array.isArray(args.nomes_acompanhantes) && args.nomes_acompanhantes.length > 0) {
        camposAtualizados.push(`Acompanhantes: ${args.nomes_acompanhantes.join(', ')}`);
      }

      if (camposAtualizados.length === 0) {
        const msg =
          'Pergunte educadamente ao hóspede qual informação ele gostaria de cadastrar ou atualizar na reserva (ex: horário de chegada, CPF, e-mail, placa do carro ou nome de acompanhante).';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'NENHUM_CAMPO_INFORMADO',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      if (Array.isArray(db?.reservations)) {
        const targetRes = db.reservations.find(
          (r) => String(r?.code || r?.reservationCode || r?.id || '') === reserva.id
        );
        if (targetRes) {
          if (args.cpf_cnpj) targetRes.guestCpf = String(args.cpf_cnpj).replace(/\D+/g, '');
          if (args.email) targetRes.guestEmail = String(args.email).trim().toLowerCase();
          if (args.horario_previsto_chegada)
            targetRes.estimatedArrivalTime = args.horario_previsto_chegada;
          if (args.placa_veiculo) targetRes.vehiclePlate = args.placa_veiculo.toUpperCase();
          if (Array.isArray(args.nomes_acompanhantes) && args.nomes_acompanhantes.length > 0) {
            targetRes.companions = args.nomes_acompanhantes;
          }
          targetRes.updatedAt = new Date().toISOString();
          if (typeof context.runtime?.saveDatabase === 'function') {
            await context.runtime.saveDatabase();
          }
        }
      }

      const msg =
        `Confirme com cordialidade que os dados da reserva *${reserva.id}* (${reserva.nome_imovel}) foram atualizados no sistema: ` +
        `${camposAtualizados.join(' | ')}.`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: { reserva_id: reserva.id, campos_atualizados: camposAtualizados },
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
    'Verifica a disponibilidade do flat na governança e autoriza ou bloqueia a entrada antecipada (early check-in) na reserva do hóspede. ' +
    'Deve ser chamada sempre que o hóspede perguntar se pode entrar mais cedo antes das 14:00.',
  allowedStates: ['PRE_CHECKIN', 'IN_STAY_CONCIERGE'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      horario_solicitado: {
        type: 'STRING',
        description: 'Horário desejado pelo hóspede para entrar no imóvel no formato HH:MM (ex: "10:30").',
      },
      confirmacao_hospede: {
        type: 'BOOLEAN',
        description: 'True se o hóspede já concordou com eventual taxa (quando aplicável); False na primeira consulta.',
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
      const db = context.runtime?.db;
      const flatNumber = reserva.nome_imovel.replace(/^Flat\s+/i, '').trim();
      const dataCheckin = String(reserva.data_checkin || '').slice(0, 10);

      if (horarioFormatado < '09:00') {
        const msg =
          `Explique ao hóspede com cordialidade que para entrada às ${horarioFormatado} (antes das 09h00) o sistema contabiliza a diária da noite anterior para garantir o apartamento bloqueado desde a madrugada. ` +
          `Informe que o nosso early check-in opera a partir das 10h00 (mediante disponibilidade da governança) e pergunte como ele prefere prosseguir.`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'HORARIO_ANTERIOR_LIMITE_EARLY_CHECKIN',
          dados: { horario_minimo_early_checkin: '10:00', horario_padrao: '14:00' },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      let conflitoSaidaMesmoDia = false;
      if (Array.isArray(db?.reservations)) {
        conflitoSaidaMesmoDia = db.reservations.some((r) => {
          if (!r || r.status === 'cancelada' || r.status === 'cancelled') return false;
          const rCode = String(r.code || r.reservationCode || r.id || '');
          if (rCode === reserva.id) return false;
          const sameFlat = String(r.flatNumber || '') === flatNumber;
          const sameDayCheckout = String(r.checkoutDate || '').slice(0, 10) === dataCheckin;
          return sameFlat && sameDayCheckout && !r.checkoutCompleted;
        });
      }

      if (conflitoSaidaMesmoDia) {
        const msg =
          `Informe ao hóspede com muita empatia que no momento não conseguimos confirmar a entrada às ${horarioFormatado} no ${reserva.nome_imovel} ` +
          `porque há um hóspede em estadia com saída prevista até as 12h00 e a equipe de governança fará a higienização completa logo em seguida. ` +
          `Diga que já deixamos prioridade máxima na limpeza para liberar o quanto antes e que ele pode guardar as malas na recepção se chegar mais cedo!`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'FLAT_OCUPADO_AGUARDANDO_CHECKOUT_E_LIMPEZA',
          dados: { horario_padrao_checkin: '14:00', flat: reserva.nome_imovel },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      if (Array.isArray(db?.reservations)) {
        const targetRes = db.reservations.find(
          (r) => String(r?.code || r?.reservationCode || r?.id || '') === reserva.id
        );
        if (targetRes) {
          targetRes.earlyCheckinTime = horarioFormatado;
          targetRes.checkinTime = horarioFormatado;
          targetRes.updatedAt = new Date().toISOString();
          if (typeof context.runtime?.saveDatabase === 'function') {
            await context.runtime.saveDatabase();
          }
        }
      }

      const msg =
        `Confirme com entusiasmo que o early check-in para as ${horarioFormatado} no ${reserva.nome_imovel} foi registrado como cortesia na reserva ${reserva.id} ` +
        `e que a equipe de governança já foi avisada da chegada nesse horário.`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: { reserva_id: reserva.id, novo_horario_checkin: horarioFormatado, cortesia: true },
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
    'Agenda limpeza adicional no apartamento, troca de enxoval/toalhas ou reposição de amenidades na governança para o hóspede em estadia.',
  allowedStates: ['IN_STAY_CONCIERGE'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      tipo_solicitacao: {
        type: 'STRING',
        description: 'Tipo de serviço de governança: LIMPEZA_COMPLETA, TROCA_TOALHAS_ENXOVAL ou REPOSICAO_ITENS.',
      },
      observacoes: {
        type: 'STRING',
        description: 'Detalhes adicionais informados pelo hóspede (ex: horário de preferência ou itens específicos).',
      },
      confirmacao_hospede: {
        type: 'BOOLEAN',
        description:
          'Passe FALSE na primeira chamada caso seja LIMPEZA_COMPLETA extra (para confirmar a taxa de R$ 70,00). ' +
          'Para TROCA_TOALHAS_ENXOVAL ou REPOSICAO_ITENS (cortesia) ou após o hóspede confirmar, passe TRUE.',
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

      if (exigeTaxa && !args.confirmacao_hospede) {
        const msg =
          `Informe ao hóspede que podemos agendar a limpeza completa extra para o ${reserva.nome_imovel} com a nossa equipe de governança, ` +
          `mediante a taxa avulsa de R$ ${taxaLimpezaExtra.toFixed(2)}. Pergunte se ele confirma o agendamento (ou informe que a simples reposição de toalhas/amenidades é cortesia).`;
        return {
          status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
          dados: {
            imovel: reserva.nome_imovel,
            tipo_solicitacao: args.tipo_solicitacao,
            valor_taxa: taxaLimpezaExtra,
            moeda: 'BRL',
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const db = context.runtime?.db;
      const flatNumber = reserva.nome_imovel.replace(/^Flat\s+/i, '').trim();
      const todayStr = String(context.data_hora_atual || new Date().toISOString()).slice(0, 10);
      const protocolo = `GOV-${Date.now().toString(36).slice(-5).toUpperCase()}`;

      if (db) {
        if (!Array.isArray(db.cleaningRequests)) db.cleaningRequests = [];
        db.cleaningRequests.push({
          id: protocolo,
          flatNumber,
          reservationId: reserva.id,
          guestName: context.hospede?.nome || 'Hóspede',
          type: args.tipo_solicitacao,
          notes: args.observacoes || '',
          fee: exigeTaxa ? taxaLimpezaExtra : 0,
          requestDate: todayStr,
          status: 'pending',
          createdAt: new Date().toISOString(),
        });
        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }
      }

      const msg =
        `Confirme com cordialidade que a solicitação de ${String(args.tipo_solicitacao).replace(/_/g, ' ').toLowerCase()} para o ${reserva.nome_imovel} ` +
        `já foi registrada no quadro da governança (protocolo *${protocolo}*)${args.observacoes ? ` com a observação: "${args.observacoes}"` : ''}.`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          protocolo,
          reserva_id: reserva.id,
          imovel: reserva.nome_imovel,
          tipo_solicitacao: args.tipo_solicitacao,
          valor_taxa: exigeTaxa ? taxaLimpezaExtra : 0,
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
    'Abre uma Ordem de Serviço (OS) de manutenção para o flat atual do hóspede e, em casos urgentes ou críticos, ' +
    'notifica automaticamente o WhatsApp do administrador/gestor.',
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

      if (db) {
        if (!Array.isArray(db.serviceOrders)) db.serviceOrders = [];
        db.serviceOrders.unshift({
          id: protocoloOs,
          code: protocoloOs,
          flatNumber,
          reservationId: reserva.id,
          guestName: context.hospede?.nome || 'Hóspede',
          guestPhone: context.telefone_remetente,
          category: args.categoria_item,
          description: args.descricao_problema,
          priority: args.urgencia,
          status: 'open',
          createdAt: new Date().toISOString(),
        });
        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }
      }

      if (args.urgencia === 'CRITICA' || args.urgencia === 'MEDIA') {
        await notifyAdminWhatsApp({
          nivel_urgencia: args.urgencia,
          categoria: 'MANUTENCAO',
          hospede_nome: context.hospede?.nome || 'Hóspede',
          telefone: context.telefone_remetente,
          imovel: reserva.nome_imovel,
          resumo: `[${protocoloOs}] ${args.categoria_item}: ${args.descricao_problema}`,
          context,
        });
      }

      const msg =
        `Peça desculpas pelo inconveniente com muita empatia, informe ao hóspede que a Ordem de Serviço *${protocoloOs}* ` +
        `já foi aberta para o *${reserva.nome_imovel}* (${args.categoria_item}) e que a gerência/manutenção já recebeu um alerta prioritário no WhatsApp para resolver o quanto antes.`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          protocolo_os: protocoloOs,
          imovel: reserva.nome_imovel,
          categoria_item: args.categoria_item,
          urgencia: args.urgencia,
          administrador_notificado: args.urgencia === 'CRITICA' || args.urgencia === 'MEDIA',
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
    'ou observações livres na discriminação dos serviços) e confirmação para emissão automática da Nota Fiscal (NFS-e) da reserva ativa.',
  allowedStates: ['PRE_CHECKIN', 'IN_STAY_CONCIERGE'],
  parametersSchema: {
    type: 'OBJECT',
    properties: {
      acao: {
        type: 'STRING',
        description:
          'Ação desejada: CONSULTAR_OU_INICIAR_CONFERENCIA, ATUALIZAR_DADOS_NOTA, CONFIRMAR_DADOS_NOTA ou CANCELAR_CONFERENCIA.',
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

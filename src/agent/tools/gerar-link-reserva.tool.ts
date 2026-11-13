// src/agent/tools/gerar-link-reserva.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import { notifyAdminWhatsApp } from '../services/admin-notifier';

export interface GerarLinkReservaArgs {
  data_checkin: string;
  data_checkout: string;
  nome_hospede?: string;
  reserva_para_terceiro?: boolean;
  nome_solicitante?: string;
  email_solicitante?: string;
  quantidade_hospedes?: number;
  incluir_cafe?: boolean;
  confirmacao_hospede: boolean;
}

function diffNights(checkin: string, checkout: string): number {
  const a = new Date(`${checkin}T00:00:00Z`).getTime();
  const b = new Date(`${checkout}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export const gerarLinkReservaTool: AgentToolDefinition<GerarLinkReservaArgs> = {
  name: 'gerar_link_reserva',

  description:
    'Gera a pré-reserva com bloqueio temporário de 30 minutos no calendário e fornece o link de pagamento / chave PIX Copia e Cola. ' +
    'Quando o cliente no WhatsApp estiver reservando para outra pessoa ou empresa (solicitante diferente do hóspede), ' +
    'os dados do hóspede são opcionais na criação (podem ser preenchidos depois via link seguro). ' +
    'Exige duas etapas: passe confirmacao_hospede=FALSE para simular e confirmar os dados com o cliente, e TRUE após o de acordo dele.',

  allowedStates: ['COMERCIAL_VENDAS'],

  parametersSchema: {
    type: 'object',
    properties: {
      data_checkin: {
        type: 'string',
        description: 'Data de entrada no formato YYYY-MM-DD.',
      },
      data_checkout: {
        type: 'string',
        description: 'Data de saída no formato YYYY-MM-DD.',
      },
      nome_hospede: {
        type: 'string',
        description:
          'Nome completo do hóspede titular. Obrigatório quando o próprio hóspede reserva para si; opcional quando reserva_para_terceiro=TRUE.',
      },
      reserva_para_terceiro: {
        type: 'boolean',
        description:
          'Passe TRUE quando quem está conversando no WhatsApp (empresa, agência, secretária ou terceiro) NÃO é o próprio hóspede.',
      },
      nome_solicitante: {
        type: 'string',
        description:
          'Nome do solicitante ou empresa responsável pela reserva quando reserva_para_terceiro=TRUE.',
      },
      email_solicitante: {
        type: 'string',
        description:
          'E-mail opcional do solicitante ou empresa para receber também por e-mail a confirmação e o link de preenchimento do hóspede.',
      },
      quantidade_hospedes: {
        type: 'number',
        description: 'Quantidade de hóspedes (padrão: 1).',
      },
      incluir_cafe: {
        type: 'boolean',
        description: 'TRUE para plano com café da manhã incluso, FALSE para somente hospedagem.',
      },
      confirmacao_hospede: {
        type: 'boolean',
        description:
          'Passe FALSE na primeira chamada para apresentar o resumo final e valor ao cliente. ' +
          'Passe TRUE somente após o cliente confirmar que deseja gerar a reserva/PIX.',
      },
    },
    required: ['data_checkin', 'data_checkout', 'confirmacao_hospede'],
  },

  async execute(
    args: GerarLinkReservaArgs,
    context: ContextoSessaoInjetado
  ): Promise<AgentToolResponse> {
    try {
      const checkin = String(args.data_checkin || '').slice(0, 10);
      const checkout = String(args.data_checkout || '').slice(0, 10);
      const diarias = diffNights(checkin, checkout);
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

      const diariaBase = 237.0 + (hospedes === 3 ? 60.0 : 0.0);
      const valorTotal = comCafe
        ? Number((diarias * (diariaBase + hospedes * 35.0)).toFixed(2))
        : Number((diarias * diariaBase + 70.0).toFixed(2));

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
          `plano ${comCafe ? 'COM café da manhã (isento de taxa de limpeza)' : 'Somente Hospedagem'}, ` +
          `no valor total de *R$ ${valorTotal.toFixed(2)}*. ${orientacaoIdentificacao}`;
        return {
          status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
          dados: {
            data_checkin: checkin,
            data_checkout: checkout,
            diarias,
            quantidade_hospedes: hospedes,
            canal_reserva: 'WhatsApp',
            incluir_cafe: comCafe,
            valor_total: valorTotal,
            reserva_para_terceiro: paraTerceiro,
            nome_solicitante: nomeSolicitante || null,
            nome_hospede: rawNomeHospede || null,
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const db = context.runtime?.db;
      const codigoPreReserva = `CF-${Math.floor(100000 + Math.random() * 900000)}`;
      const baseUrl =
        db?.settings?.baseUrl ||
        (typeof process !== 'undefined' && (process.env?.APP_BASE_URL || process.env?.SERVER_BASE_URL)) ||
        'https://corpflats.com.br';
      const linkPagamento = `${baseUrl}/minha-reserva/${encodeURIComponent(codigoPreReserva)}`;
      const cardTotalAmount = Number((valorTotal * 1.05).toFixed(2));
      const cleanTxId = codigoPreReserva.replace(/[^a-zA-Z0-9]/g, '').substring(0, 25);

      let chavePix =
        typeof (globalThis as any).generateStaticPixPayload === 'function'
          ? (globalThis as any).generateStaticPixPayload({
              pixKey: db?.settings?.interConfig?.pixKey || '47964813000165',
              amount: valorTotal,
              merchantName: 'CORPFLATS LTDA',
              merchantCity: 'CAMPOS DOS GOYTACAZES',
              txid: cleanTxId,
            })
          : db?.settings?.pixKey || '47964813000165';
      let resolvedPixTxId = cleanTxId;

      if (typeof (globalThis as any).createInterPixCob === 'function') {
        try {
          const interCob = await (globalThis as any).createInterPixCob(
            db?.settings?.interConfig,
            cleanTxId,
            valorTotal,
            nomePagador,
            '',
            `Reserva ${codigoPreReserva}`
          );
          if (interCob && interCob.pixCopiaECola) {
            chavePix = interCob.pixCopiaECola;
            resolvedPixTxId = interCob.txid || cleanTxId;
          }
        } catch (_) {}
      }

      const nowMsHold = Date.now();
      const nowIso = new Date(nowMsHold).toISOString();
      const holdMinutes = 30;
      const expiresAt = new Date(nowMsHold + holdMinutes * 60 * 1000).toISOString();
      const reminderLeadMinutes = 10;
      const reminderAt = new Date(nowMsHold + (holdMinutes - reminderLeadMinutes) * 60 * 1000).toISOString();
      const cleanSenderPhone = String(context.telefone_remetente || '').trim();

      if (db) {
        if (!Array.isArray(db.reservations)) db.reservations = [];
        if (!Array.isArray(db.preReservations)) db.preReservations = [];

        const allFlats = Array.isArray(db.flats) && db.flats.length > 0
          ? db.flats.filter((f: any) => f && f.isActive !== false && f.status !== 'maintenance')
          : [{ id: 1, number: '101' }];
        const selectedFlat = allFlats[0] || { id: 1, number: '101' };
        const nextResId = db.reservations.length > 0
          ? Math.max(...db.reservations.map((r: any) => Number(r.id) || 0)) + 1
          : 1;
        const cleaningFee = comCafe ? 0 : Number(db.siteConfig?.ratePlans?.room_only?.cleaningFeeAmount ?? 50.0);
        const netRoomTotal = Math.max(0, valorTotal - cleaningFee);
        const dailyRate = Math.round((netRoomTotal / diarias) * 100) / 100;

        const preparedGuests = Array.from({ length: hospedes }, (_, idx) => ({
          index: idx + 1,
          guestId: null,
          name: idx === 0 ? (hospedePendente ? '' : nomeTitular) : `Hóspede ${idx + 1}`,
          cpf: '',
          phone: idx === 0 && !paraTerceiro ? cleanSenderPhone : '',
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
          guestName: nomeTitular,
          guestPending: hospedePendente,
          guestPhone: paraTerceiro ? '' : cleanSenderPhone,
          phone: cleanSenderPhone,
          guestEmail: '',
          requesterType: paraTerceiro ? 'other_person' : 'guest',
          ...(paraTerceiro
            ? {
                requesterName: nomeSolicitante,
                requesterPhone: cleanSenderPhone,
                requesterEmail: emailSolicitante,
                requesterInfo: {
                  type: 'other_person',
                  name: nomeSolicitante,
                  phone: cleanSenderPhone,
                  whatsapp: cleanSenderPhone,
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
          guestsCount: hospedes,
          guestCount: hospedes,
          numGuests: hospedes,
          adults: hospedes,
          children: 0,
          guests: preparedGuests,
          totalAmount: valorTotal,
          cardTotalAmount,
          dailyRate,
          cleaningFee,
          paidAmount: 0,
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
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        db.reservations.unshift(newReservation);

        db.preReservations.push({
          id: nextResId,
          code: codigoPreReserva,
          guestName: nomeTitular,
          guestPhone: paraTerceiro ? '' : cleanSenderPhone,
          requesterName: paraTerceiro ? nomeSolicitante : '',
          requesterPhone: paraTerceiro ? cleanSenderPhone : '',
          checkinDate: checkin,
          checkoutDate: checkout,
          guests: hospedes,
          withBreakfast: comCafe,
          totalAmount: valorTotal,
          cardTotalAmount,
          pixCopiaECola: chavePix,
          pixTxId: resolvedPixTxId,
          status: 'pending_payment',
          expiresAt,
          reminderAt,
          createdAt: nowIso,
        });
        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }
        if (typeof context.runtime?.triggerImmediateWhatsApp === 'function') {
          await context.runtime.triggerImmediateWhatsApp(
            db,
            context.runtime?.saveDatabase || null,
            'pre_reservation_created',
            newReservation,
            baseUrl
          );
        }
      }

      const destinatarioResumo = paraTerceiro
        ? (rawNomeHospede
            ? `solicitada por *${nomeSolicitante}* para o hóspede *${rawNomeHospede}*`
            : `em nome do solicitante *${nomeSolicitante}* (hóspede a definir após confirmação)`)
        : `para *${nomeTitular}*`;
      const notaCredenciamento = hospedePendente
        ? ' Avise também que, assim que o pagamento for confirmado, enviaremos automaticamente o link seguro de credenciamento para preencher os dados do hóspede antes do check-in.'
        : '';
      const msg =
        `Confirme com entusiasmo que a pré-reserva *${codigoPreReserva}* foi bloqueada por 30 minutos ${destinatarioResumo} ` +
        `(${checkin} a ${checkout}, *${hospedes} ${hospedes === 1 ? 'hóspede' : 'hóspedes'}*, Canal da Reserva: *WhatsApp*) ` +
        `no valor de *R$ ${valorTotal.toFixed(2)}* no PIX (ou *R$ ${cardTotalAmount.toFixed(2)}* no Cartão de Crédito). ` +
        `Inclua no resumo da confirmação a quantidade de hóspedes (*${hospedes}*) e o canal da reserva (*WhatsApp*). ` +
        `A mensagem oficial da reserva com botões interativos, código PIX Copia e Cola (\`${chavePix}\`) e link de pagamento por Cartão (${linkPagamento}) já foi enviada.${notaCredenciamento}`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          codigo_pre_reserva: codigoPreReserva,
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
          validade_bloqueio_minutos: 30,
        },
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    } catch (error: any) {
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

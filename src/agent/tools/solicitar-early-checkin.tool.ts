// src/agent/tools/solicitar-early-checkin.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import { notifyAdminWhatsApp } from '../services/admin-notifier';

export interface SolicitarEarlyCheckinArgs {
  horario_solicitado: string;
  confirmacao_hospede?: boolean;
}

function normalizeTimeHHMM(raw: string): string {
  const clean = String(raw || '').trim();
  const match = clean.match(/(\d{1,2})(?:[:h](\d{2}))?/i);
  if (!match) return '14:00';
  const hh = String(Math.min(23, Math.max(0, parseInt(match[1], 10)))).padStart(2, '0');
  const mm = String(Math.min(59, Math.max(0, parseInt(match[2] || '00', 10)))).padStart(2, '0');
  return `${hh}:${mm}`;
}

export const solicitarEarlyCheckinTool: AgentToolDefinition<SolicitarEarlyCheckinArgs> = {
  name: 'solicitar_early_checkin',

  description:
    'Verifica a disponibilidade de flat desocupado e limpo na governança e aplica as regras oficiais de entrada antecipada (early check-in): ' +
    'hóspedes WhatsApp/Direto têm cortesia a partir das 10:00; demais canais têm cortesia a partir das 12:00; ' +
    'antes desses horários até o limite de 07:00 cobra meia diária (50%); antes das 07:00 cobra diária inteira (100%).',

  allowedStates: ['PRE_CHECKIN', 'IN_STAY_CONCIERGE'],

  parametersSchema: {
    type: 'object',
    properties: {
      horario_solicitado: {
        type: 'string',
        description: 'Horário desejado pelo hóspede para entrar no imóvel no formato HH:MM (ex: "10:30" ou "08:00").',
      },
      confirmacao_hospede: {
        type: 'boolean',
        description:
          'Passe FALSE na primeira consulta quando houver cobrança (meia diária ou diária inteira) para informar o valor ao hóspede. ' +
          'Passe TRUE somente após o hóspede concordar explicitamente com a taxa informada.',
      },
    },
    required: ['horario_solicitado'],
  },

  async execute(
    args: SolicitarEarlyCheckinArgs,
    context: ContextoSessaoInjetado
  ): Promise<AgentToolResponse> {
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

      const horarioFormatado = normalizeTimeHHMM(args.horario_solicitado);
      const confirmado = Boolean(args.confirmacao_hospede ?? false);
      const db = context.runtime?.db;
      const flatNumber = reserva.nome_imovel.replace(/^Flat\s+/i, '').trim();
      const dataCheckin = String(reserva.data_checkin || '').slice(0, 10);

      const targetRes = Array.isArray(db?.reservations)
        ? db.reservations.find(
            (r: any) => String(r?.code || r?.reservationCode || r?.id || '') === reserva.id
          )
        : null;

      // TRAVA 1: Disponibilidade de flat desocupado e limpo
      let conflitoSaidaMesmoDia = false;
      if (Array.isArray(db?.reservations)) {
        conflitoSaidaMesmoDia = db.reservations.some((r: any) => {
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
        flatSujoNaGovernanca = db.cleaningRequests.some((c: any) => {
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
          `Informe ao hóspede com muita empatia que no momento não conseguimos confirmar a entrada às ${horarioFormatado} no ${reserva.nome_imovel} ` +
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

      // TRAVA 2: Faixas de horário por canal (WhatsApp/Direto a partir de 10:00; demais a partir de 12:00)
      const rawChannel = String(targetRes?.channel || (reserva as any).canal_reserva || 'whatsapp').toLowerCase();
      const isOtaOrB2b =
        rawChannel.includes('booking') ||
        rawChannel.includes('airbnb') ||
        rawChannel.includes('expedia') ||
        rawChannel.includes('decolar') ||
        rawChannel.includes('b2b');
      const horarioGratuito = !isOtaOrB2b ? '10:00' : '12:00';
      const valorDiaria = Number(targetRes?.dailyRate || (reserva as any).valor_diaria || 237.0);

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

      if (valorTaxa > 0 && confirmado) {
        const chavePix = db?.settings?.pixKey || '47.964.813/0001-65 (CNPJ - Rental Millers / CorpFlats)';
        const txid = `PIX_EARLY_${Date.now()}`;
        if (targetRes) {
          targetRes.pendingEarlyCheckin = {
            txid,
            pixCopiaECola: chavePix,
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
          `Envie ao hóspede o PIX (${chavePix}) referente à taxa de *${labelTaxa}* (*R$ ${valorTaxa.toFixed(2)}*) ` +
          `para o early check-in às *${horarioFormatado}* no *${reserva.nome_imovel}* e informe que a entrada antecipada será liberada assim que o pagamento for confirmado.`;
        return {
          status: 'SUCESSO_EXECUTADO',
          dados: {
            reserva_id: reserva.id,
            novo_horario_checkin: horarioFormatado,
            cortesia: false,
            tipo_taxa: tipoTaxa,
            valor_taxa: valorTaxa,
            aguardando_pagamento_pix: true,
            txid,
            pix_copia_e_cola: chavePix,
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

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
        `Confirme com entusiasmo que o early check-in para as ${horarioFormatado} no ${reserva.nome_imovel} foi registrado como cortesia na reserva ${reserva.id} ` +
        `e que a equipe de governança já foi avisada da chegada nesse horário.`;

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
    } catch (error: any) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'MEDIA',
        categoria: 'ERRO_SISTEMA_TOOL',
        hospede_nome: context.hospede?.nome || 'Hóspede',
        telefone: context.telefone_remetente,
        resumo: `Falha técnica ao executar solicitar_early_checkin (${args.horario_solicitado}): ${error.message}`,
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

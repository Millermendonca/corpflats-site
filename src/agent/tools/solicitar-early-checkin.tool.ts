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
    'Verifica a disponibilidade do flat na governança e autoriza ou bloqueia a entrada antecipada (early check-in) na reserva do hóspede. ' +
    'Deve ser chamada sempre que o hóspede perguntar se pode entrar mais cedo antes das 14:00.',

  allowedStates: ['PRE_CHECKIN', 'IN_STAY_CONCIERGE'],

  parametersSchema: {
    type: 'object',
    properties: {
      horario_solicitado: {
        type: 'string',
        description: 'Horário desejado pelo hóspede para entrar no imóvel no formato HH:MM (ex: "10:30").',
      },
      confirmacao_hospede: {
        type: 'boolean',
        description: 'True se o hóspede já concordou com eventual taxa (quando aplicável); False na primeira consulta.',
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
      const db = context.runtime?.db;
      const flatNumber = reserva.nome_imovel.replace(/^Flat\s+/i, '').trim();
      const dataCheckin = String(reserva.data_checkin || '').slice(0, 10);

      // TRAVA 1: Antes das 09:00 contabiliza diária anterior
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

      // TRAVA 2: Existe outro hóspede saindo do mesmo flat no dia do check-in?
      let conflitoSaidaMesmoDia = false;
      if (Array.isArray(db?.reservations)) {
        conflitoSaidaMesmoDia = db.reservations.some((r: any) => {
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

      // Efetiva registro de early check-in autorizado
      if (Array.isArray(db?.reservations)) {
        const targetRes = db.reservations.find(
          (r: any) => String(r?.code || r?.reservationCode || r?.id || '') === reserva.id
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
        dados: {
          reserva_id: reserva.id,
          novo_horario_checkin: horarioFormatado,
          cortesia: true,
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

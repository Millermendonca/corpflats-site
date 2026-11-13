// src/agent/tools/consultar-disponibilidade.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import { notifyAdminWhatsApp } from '../services/admin-notifier';

export interface ConsultarDisponibilidadeArgs {
  data_checkin: string;
  data_checkout: string;
  quantidade_hospedes?: number;
  preferencia_cama?: 'casal' | 'solteiro' | 'indiferente';
}

function diffNights(checkin: string, checkout: string): number {
  const a = new Date(`${checkin}T00:00:00Z`).getTime();
  const b = new Date(`${checkout}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export const consultarDisponibilidadeTool: AgentToolDefinition<ConsultarDisponibilidadeArgs> = {
  name: 'consultar_disponibilidade',

  description:
    'Consulta a disponibilidade real de flats na CorpFlats para um período de entrada (data_checkin) e saída (data_checkout) ' +
    'e quantidade de hóspedes. Deve ser chamada sempre que um cliente perguntar se há vaga ou quiser cotar datas.',

  allowedStates: ['COMERCIAL_VENDAS', 'PRE_CHECKIN', 'IN_STAY_CONCIERGE'],

  parametersSchema: {
    type: 'object',
    properties: {
      data_checkin: {
        type: 'string',
        description: 'Data desejada de check-in no formato YYYY-MM-DD.',
      },
      data_checkout: {
        type: 'string',
        description: 'Data desejada de check-out no formato YYYY-MM-DD.',
      },
      quantidade_hospedes: {
        type: 'number',
        description: 'Quantidade total de hóspedes (padrão: 1).',
      },
      preferencia_cama: {
        type: 'string',
        enum: ['casal', 'solteiro', 'indiferente'],
        description: 'Preferência opcional de configuração de cama.',
      },
    },
    required: ['data_checkin', 'data_checkout'],
  },

  async execute(
    args: ConsultarDisponibilidadeArgs,
    context: ContextoSessaoInjetado
  ): Promise<AgentToolResponse> {
    try {
      const checkin = String(args.data_checkin || '').slice(0, 10);
      const checkout = String(args.data_checkout || '').slice(0, 10);
      const hospedes = Math.max(1, Number(args.quantidade_hospedes || 1));
      const diarias = diffNights(checkin, checkout);

      // TRAVA 1: Datas inválidas
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

      // TRAVA 2: Capacidade máxima por flat (máximo 3 hóspedes por unidade)
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
      const allFlats: any[] = Array.isArray(db?.flats) && db.flats.length > 0
        ? db.flats.filter((f: any) => f && f.isActive !== false && f.status !== 'maintenance')
        : [{ number: '101' }, { number: '202' }, { number: '212' }, { number: '304' }];

      const reservations: any[] = Array.isArray(db?.reservations) ? db.reservations : [];

      const availableFlats = allFlats.filter((flat: any) => {
        const flatNum = String(flat.number || flat.id || '');
        const hasConflict = reservations.some((r: any) => {
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

      const listaFlats = availableFlats.slice(0, 5).map((f: any) => String(f.number || f.id));
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
    } catch (error: any) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'MEDIA',
        categoria: 'ERRO_SISTEMA_TOOL',
        hospede_nome: context.hospede?.nome || 'Lead Comercial',
        telefone: context.telefone_remetente,
        resumo: `Falha técnica ao executar consultar_disponibilidade (${args.data_checkin} a ${args.data_checkout}): ${error.message}`,
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

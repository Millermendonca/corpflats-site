// src/agent/tools/gerar-link-reserva.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import { notifyAdminWhatsApp } from '../services/admin-notifier';

export interface GerarLinkReservaArgs {
  data_checkin: string;
  data_checkout: string;
  nome_hospede?: string;
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
        description: 'Nome completo do titular da reserva.',
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
    } catch (error: any) {
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

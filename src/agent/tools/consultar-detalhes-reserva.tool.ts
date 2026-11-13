// src/agent/tools/consultar-detalhes-reserva.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import { notifyAdminWhatsApp } from '../services/admin-notifier';

export interface ConsultarDetalhesReservaArgs {
  codigo_reserva?: string;
}

export const consultarDetalhesReservaTool: AgentToolDefinition<ConsultarDetalhesReservaArgs> = {
  name: 'consultar_detalhes_reserva',

  description:
    'Consulta os detalhes completos da reserva ativa ou futura vinculada ao hóspede (imóvel/flat, datas de check-in e check-out, ' +
    'status de pagamento, rede/senha de Wi-Fi e link de pré-check-in digital).',

  allowedStates: ['PRE_CHECKIN', 'IN_STAY_CONCIERGE'],

  parametersSchema: {
    type: 'object',
    properties: {
      codigo_reserva: {
        type: 'string',
        description: 'Código opcional da reserva caso o hóspede mencione outro código específico.',
      },
    },
    required: [],
  },

  async execute(
    args: ConsultarDetalhesReservaArgs,
    context: ContextoSessaoInjetado
  ): Promise<AgentToolResponse> {
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
      const qtdHospedes = Number(reserva.quantidade_hospedes || 1);
      const canalLabel = reserva.canal_reserva_nome || reserva.canal_reserva || 'Site CorpFlats';

      const msg =
        `Apresente ao hóspede com clareza o resumo completo da reserva *${reserva.id}* no *${reserva.nome_imovel}*, informando obrigatoriamente: ` +
        `Check-in em ${reserva.data_checkin}, Check-out em ${reserva.data_checkout}, ` +
        `Total de Hóspedes: *${qtdHospedes}*, Canal da Reserva: *${canalLabel}*, ` +
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
          quantidade_hospedes: qtdHospedes,
          canal_reserva: canalLabel,
          wifi_rede: reserva.wifi_rede,
          wifi_senha: reserva.wifi_senha,
          link_pre_checkin: linkPreCheckin,
        },
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    } catch (error: any) {
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

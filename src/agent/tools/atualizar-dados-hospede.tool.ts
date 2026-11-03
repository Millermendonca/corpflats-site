// src/agent/tools/atualizar-dados-hospede.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import { notifyAdminWhatsApp } from '../services/admin-notifier';

export interface AtualizarDadosHospedeArgs {
  cpf_cnpj?: string;
  email?: string;
  horario_previsto_chegada?: string;
  placa_veiculo?: string;
  nomes_acompanhantes?: string[];
}

export const atualizarDadosHospedeTool: AgentToolDefinition<AtualizarDadosHospedeArgs> = {
  name: 'atualizar_dados_hospede',

  description:
    'Atualiza os dados cadastrais e operacionais do hóspede na reserva ativa (CPF/CNPJ, e-mail, horário previsto de chegada, ' +
    'placa do veículo para garagem e nomes de acompanhantes).',

  allowedStates: ['PRE_CHECKIN', 'IN_STAY_CONCIERGE'],

  parametersSchema: {
    type: 'object',
    properties: {
      cpf_cnpj: {
        type: 'string',
        description: 'CPF ou CNPJ informado pelo hóspede.',
      },
      email: {
        type: 'string',
        description: 'Endereço de e-mail do hóspede.',
      },
      horario_previsto_chegada: {
        type: 'string',
        description: 'Horário previsto de chegada para o check-in no formato HH:MM.',
      },
      placa_veiculo: {
        type: 'string',
        description: 'Placa do veículo caso o hóspede vá utilizar a garagem.',
      },
      nomes_acompanhantes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Lista com os nomes completos de acompanhantes informados na conversa.',
      },
    },
    required: [],
  },

  async execute(
    args: AtualizarDadosHospedeArgs,
    context: ContextoSessaoInjetado
  ): Promise<AgentToolResponse> {
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

      const camposAtualizados: string[] = [];
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
          (r: any) => String(r?.code || r?.reservationCode || r?.id || '') === reserva.id
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
        dados: {
          reserva_id: reserva.id,
          campos_atualizados: camposAtualizados,
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

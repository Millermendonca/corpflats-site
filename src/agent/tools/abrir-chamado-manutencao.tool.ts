// src/agent/tools/abrir-chamado-manutencao.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import { notifyAdminWhatsApp } from '../services/admin-notifier';

export interface AbrirChamadoManutencaoArgs {
  categoria_item:
    | 'AR_CONDICIONADO'
    | 'FECHADURA_ACESSO'
    | 'CHUVEIRO_HIDRAULICA'
    | 'ELETRICA_ILUMINACAO'
    | 'WIFI_TV'
    | 'ELETRODOMESTICOS'
    | 'OUTROS';
  descricao_problema: string;
  urgencia: 'BAIXA' | 'MEDIA' | 'CRITICA';
}

export const abrirChamadoManutencaoTool: AgentToolDefinition<AbrirChamadoManutencaoArgs> = {
  name: 'abrir_chamado_manutencao',

  description:
    'Abre uma Ordem de Serviço (OS) de manutenção para o flat atual do hóspede e, em casos urgentes ou críticos, ' +
    'notifica automaticamente o WhatsApp do administrador/gestor.',

  allowedStates: ['IN_STAY_CONCIERGE'],

  parametersSchema: {
    type: 'object',
    properties: {
      categoria_item: {
        type: 'string',
        enum: [
          'AR_CONDICIONADO',
          'FECHADURA_ACESSO',
          'CHUVEIRO_HIDRAULICA',
          'ELETRICA_ILUMINACAO',
          'WIFI_TV',
          'ELETRODOMESTICOS',
          'OUTROS',
        ],
        description: 'Categoria do equipamento ou instalação com defeito.',
      },
      descricao_problema: {
        type: 'string',
        description: 'Descrição clara do problema relatado pelo hóspede.',
      },
      urgencia: {
        type: 'string',
        enum: ['BAIXA', 'MEDIA', 'CRITICA'],
        description:
          'Use CRITICA para falta de água/luz, fechadura travada, vazamento ou ar-condicionado inoperante.',
      },
    },
    required: ['categoria_item', 'descricao_problema', 'urgencia'],
  },

  async execute(
    args: AbrirChamadoManutencaoArgs,
    context: ContextoSessaoInjetado
  ): Promise<AgentToolResponse> {
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

      // Lei 5: Transbordo Inteligente para o WhatsApp do Administrador em manutenções médias/críticas
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
    } catch (error: any) {
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

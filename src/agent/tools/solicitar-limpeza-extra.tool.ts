// src/agent/tools/solicitar-limpeza-extra.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import { notifyAdminWhatsApp } from '../services/admin-notifier';

export interface SolicitarLimpezaExtraArgs {
  tipo_solicitacao: 'LIMPEZA_COMPLETA' | 'TROCA_TOALHAS_ENXOVAL' | 'REPOSICAO_ITENS';
  observacoes?: string;
  confirmacao_hospede: boolean;
}

export const solicitarLimpezaExtraTool: AgentToolDefinition<SolicitarLimpezaExtraArgs> = {
  name: 'solicitar_limpeza_extra',

  description:
    'Agenda limpeza adicional no apartamento, troca de enxoval/toalhas ou reposição de amenidades na governança para o hóspede em estadia.',

  allowedStates: ['IN_STAY_CONCIERGE'],

  parametersSchema: {
    type: 'object',
    properties: {
      tipo_solicitacao: {
        type: 'string',
        enum: ['LIMPEZA_COMPLETA', 'TROCA_TOALHAS_ENXOVAL', 'REPOSICAO_ITENS'],
        description: 'Tipo de serviço de governança solicitado pelo hóspede.',
      },
      observacoes: {
        type: 'string',
        description: 'Detalhes adicionais informados pelo hóspede (ex: horário de preferência ou itens específicos).',
      },
      confirmacao_hospede: {
        type: 'boolean',
        description:
          'Passe FALSE na primeira chamada caso seja LIMPEZA_COMPLETA extra (para confirmar a taxa de R$ 70,00). ' +
          'Para TROCA_TOALHAS_ENXOVAL ou REPOSICAO_ITENS (cortesia) ou após o hóspede confirmar, passe TRUE.',
      },
    },
    required: ['tipo_solicitacao', 'confirmacao_hospede'],
  },

  async execute(
    args: SolicitarLimpezaExtraArgs,
    context: ContextoSessaoInjetado
  ): Promise<AgentToolResponse> {
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
        `Confirme com cordialidade que a solicitação de ${args.tipo_solicitacao.replace(/_/g, ' ').toLowerCase()} para o ${reserva.nome_imovel} ` +
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
    } catch (error: any) {
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

// src/agent/tools/notificar-administrador.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import {
  CategoriaAlertaAdmin,
  NivelUrgenciaAdmin,
  notifyAdminWhatsApp,
} from '../services/admin-notifier';

export interface NotificarAdministradorArgs {
  nivel_urgencia: NivelUrgenciaAdmin;
  categoria: CategoriaAlertaAdmin;
  resumo_ocorrencia: string;
}

export const notificarAdministradorTool: AgentToolDefinition<NotificarAdministradorArgs> = {
  name: 'notificar_administrador',

  description:
    'Envia um alerta imediato para o WhatsApp pessoal do proprietário/administrador. Deve ser acionada quando: ' +
    '1) O hóspede relatar problemas graves de manutenção (falta de água, luz, ar-condicionado quebrado, fechadura falhando); ' +
    '2) O hóspede pedir uma exceção comercial ou desconto que o sistema bloqueou e ele insistir; ' +
    '3) O hóspede demonstrar irritação ou solicitar atendente humano.',

  allowedStates: ['COMERCIAL_VENDAS', 'PRE_CHECKIN', 'IN_STAY_CONCIERGE'],

  parametersSchema: {
    type: 'object',
    properties: {
      nivel_urgencia: {
        type: 'string',
        enum: ['BAIXA', 'MEDIA', 'CRITICA'],
        description: 'Nível de gravidade da situação.',
      },
      categoria: {
        type: 'string',
        enum: [
          'MANUTENCAO',
          'EXCECAO_COMERCIAL',
          'FINANCEIRO',
          'CONFLITO_REGRA',
          'SOLICITACAO_HUMANO',
        ],
        description: 'Categoria do alerta para o administrador.',
      },
      resumo_ocorrencia: {
        type: 'string',
        description:
          'Resumo claro e direto do que o hóspede pediu, o que o sistema respondeu e por que precisa de intervenção humana.',
      },
    },
    required: ['nivel_urgencia', 'categoria', 'resumo_ocorrencia'],
  },

  async execute(
    args: NotificarAdministradorArgs,
    context: ContextoSessaoInjetado
  ): Promise<AgentToolResponse> {
    try {
      const hospedeNome = context.hospede?.nome || context.dados_hospede?.nome || 'Hóspede / Lead';
      const imovelNome = context.reserva_ativa?.nome_imovel || context.reserva_atual?.nome_imovel;

      const notifyResult = await notifyAdminWhatsApp({
        nivel_urgencia: args.nivel_urgencia || 'MEDIA',
        categoria: args.categoria || 'CONFLITO_REGRA',
        hospede_nome: hospedeNome,
        telefone: context.telefone_remetente,
        imovel: imovelNome,
        resumo: args.resumo_ocorrencia,
        context,
      });

      // Se a categoria for CRITICA ou SOLICITACAO_HUMANO, pausa a IA por 60 minutos na conversa
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
    } catch (error: any) {
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

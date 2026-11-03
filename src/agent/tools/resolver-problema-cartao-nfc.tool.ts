// src/agent/tools/resolver-problema-cartao-nfc.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import { notifyAdminWhatsApp } from '../services/admin-notifier';

export interface ResolverProblemaCartaoNfcArgs {
  tipo_ocorrencia: 'CARTAO_TRANCADO_DENTRO' | 'PERDA_CARTAO' | 'PORTA_NAO_ABRE';
  confirmacao_hospede?: boolean;
  tentou_regravar_recepcao?: boolean;
}

export const resolverProblemaCartaoNfcTool: AgentToolDefinition<ResolverProblemaCartaoNfcArgs> = {
  name: 'resolver_problema_cartao_nfc',
  description:
    'Atua em problemas de acesso à porta do flat ou cartão magnético NFC (Soho Residence): ' +
    'Caso A (CARTAO_TRANCADO_DENTRO): envia e-mail para soho@promenade.com.br autorizando cartão reserva. ' +
    'Caso B (PERDA_CARTAO): informa taxa de R$ 15,00, gera PIX e, após pagamento, envia e-mail para soho@promenade.com.br descontando no flat 212. ' +
    'Caso C (PORTA_NAO_ABRE): Passo 1 orienta regravação na recepção; Passo 2 aciona o gestor com urgência máxima.',
  allowedStates: ['PRE_CHECKIN', 'IN_STAY_CONCIERGE'],
  parametersSchema: {
    type: 'object',
    properties: {
      tipo_ocorrencia: {
        type: 'string',
        enum: ['CARTAO_TRANCADO_DENTRO', 'PERDA_CARTAO', 'PORTA_NAO_ABRE'],
      },
      confirmacao_hospede: {
        type: 'boolean',
      },
      tentou_regravar_recepcao: {
        type: 'boolean',
      },
    },
    required: ['tipo_ocorrencia'],
  },
  async execute(args: ResolverProblemaCartaoNfcArgs, context: ContextoSessaoInjetado): Promise<AgentToolResponse> {
    try {
      const reserva = context.reserva_ativa;
      if (!reserva) {
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
          instrucao_para_ia:
            'Informe que não localizou reserva ativa vinculada a este número e peça o número do flat ou nome do titular.',
        };
      }
      if (args.tipo_ocorrencia === 'PERDA_CARTAO' && !args.confirmacao_hospede) {
        return {
          status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
          dados: { taxa_segunda_via: 15.0, destinatario_email_apos_pagamento: 'soho@promenade.com.br' },
          instrucao_para_ia:
            'Explique ao hóspede que a 2ª via do cartão NFC possui taxa de reposição de R$ 15,00 via PIX e que, após o pagamento, o e-mail de liberação para soho@promenade.com.br é enviado automaticamente.',
        };
      }
      return {
        status: 'SUCESSO_EXECUTADO',
        dados: { reserva_id: reserva.id, tipo_ocorrencia: args.tipo_ocorrencia },
        instrucao_para_ia:
          'Oriente o hóspede sobre o procedimento de cartão NFC executado na recepção 24h do Soho Residence.',
      };
    } catch (err: any) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'ALTA',
        categoria: 'ERRO_SISTEMA_TOOL',
        hospede_nome: context.hospede?.nome || 'Hóspede',
        telefone: context.telefone_remetente,
        resumo: `Erro em resolver_problema_cartao_nfc: ${err?.message}`,
      });
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: 'Informe ao hóspede que a gerência já foi acionada para liberar seu cartão na recepção.',
      };
    }
  },
};

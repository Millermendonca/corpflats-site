// src/agent/tools/processar-cancelamento.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';

export interface ProcessarCancelamentoArgs {
  motivo_cancelamento?: string;
  confirmacao_hospede?: boolean;
  solicitar_excecao_gestor?: boolean;
}

export const processarCancelamentoTool: AgentToolDefinition<ProcessarCancelamentoArgs> = {
  name: 'processar_cancelamento',
  description:
    'Processa pedido de cancelamento aplicando a regra de 24h de antecedência do check-in ou encaminhando pedido de exceção ao gestor no WhatsApp (#CANC-...).',
  allowedStates: ['PRE_CHECKIN', 'IN_STAY_CONCIERGE'],
  parametersSchema: {
    type: 'object',
    properties: {
      motivo_cancelamento: { type: 'string' },
      confirmacao_hospede: { type: 'boolean' },
      solicitar_excecao_gestor: { type: 'boolean' },
    },
  },
  async execute(args: ProcessarCancelamentoArgs, context: ContextoSessaoInjetado): Promise<AgentToolResponse> {
    if (!context.reserva_ativa) {
      return {
        status: 'BLOQUEADO_PELA_REGRA',
        codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
        instrucao_para_ia: 'Peça o código da reserva ou CPF do titular para localizar a reserva.',
      };
    }
    return {
      status: args.confirmacao_hospede ? 'SUCESSO_EXECUTADO' : 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
      instrucao_para_ia:
        'Informe as condições da política de cancelamento (gratuito até 24h antes do check-in; retenção integral em menos de 24h ou análise de exceção pelo gestor).',
    };
  },
};

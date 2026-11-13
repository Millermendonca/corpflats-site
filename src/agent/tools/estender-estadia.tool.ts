// src/agent/tools/estender-estadia.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import { alterarDatasReservaTool } from './alterar-datas-reserva.tool';

export interface EstenderEstadiaArgs {
  nova_data_checkout: string;
  confirmacao_hospede: boolean;
}

export const estenderEstadiaTool: AgentToolDefinition<EstenderEstadiaArgs> = {
  name: 'estender_estadia',

  description:
    'Verifica a disponibilidade do flat atual para prorrogar a estadia até uma nova data de saída (nova_data_checkout), ' +
    'calcula o valor das diárias extras e efetiva a prorrogação após confirmação do hóspede.',

  allowedStates: ['IN_STAY_CONCIERGE', 'PRE_CHECKIN'],

  parametersSchema: {
    type: 'object',
    properties: {
      nova_data_checkout: {
        type: 'string',
        description: 'Nova data desejada de saída (check-out) no formato YYYY-MM-DD.',
      },
      confirmacao_hospede: {
        type: 'boolean',
        description:
          'Passe FALSE primeiro para consultar disponibilidade e informar o valor das diárias adicionais. ' +
          'Passe TRUE somente após o hóspede confirmar explicitamente na conversa.',
      },
    },
    required: ['nova_data_checkout', 'confirmacao_hospede'],
  },

  async execute(
    args: EstenderEstadiaArgs,
    context: ContextoSessaoInjetado
  ): Promise<AgentToolResponse> {
    const reserva = context.reserva_ativa || context.reserva_atual;
    return alterarDatasReservaTool.execute(
      {
        reserva_id: reserva?.id,
        nova_data_checkin: reserva?.data_checkin || '',
        nova_data_checkout: args.nova_data_checkout,
        efetivar_alteracao: Boolean(args.confirmacao_hospede),
      },
      context
    );
  },
};

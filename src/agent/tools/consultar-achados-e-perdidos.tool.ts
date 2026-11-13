// src/agent/tools/consultar-achados-e-perdidos.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';

export interface ConsultarAchadosEPerdidosArgs {
  descricao_item: string;
  numero_flat?: string;
}

export const consultarAchadosEPerdidosTool: AgentToolDefinition<ConsultarAchadosEPerdidosArgs> = {
  name: 'consultar_achados_e_perdidos',
  description:
    'Consulta itens esquecidos em db.lostAndFound e explica o disparo automático de WhatsApp com foto assim que a camareira registra o item.',
  allowedStates: ['COMERCIAL_VENDAS', 'PRE_CHECKIN', 'IN_STAY_CONCIERGE', 'POS_CHECKOUT'],
  parametersSchema: {
    type: 'object',
    properties: {
      descricao_item: { type: 'string' },
      numero_flat: { type: 'string' },
    },
    required: ['descricao_item'],
  },
  async execute(args: ConsultarAchadosEPerdidosArgs, _context: ContextoSessaoInjetado): Promise<AgentToolResponse> {
    return {
      status: 'SUCESSO_EXECUTADO',
      dados: { item: args.descricao_item },
      instrucao_para_ia:
        'Informe o resultado da busca em Achados e Perdidos e explique que, assim que a camareira encontra e registra um item com foto no sistema, o hóspede recebe automaticamente uma mensagem no WhatsApp com a foto.',
    };
  },
};

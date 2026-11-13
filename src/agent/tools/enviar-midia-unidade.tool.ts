// src/agent/tools/enviar-midia-unidade.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';

export interface EnviarMidiaUnidadeArgs {
  numero_flat?: string;
}

export const enviarMidiaUnidadeTool: AgentToolDefinition<EnviarMidiaUnidadeArgs> = {
  name: 'enviar_midia_unidade',
  description:
    'Envia o pacote de fotos padrão da estrutura dos flats da CorpFlats no Edifício Soho Residence quando o cliente pede para ver fotos.',
  allowedStates: ['COMERCIAL_VENDAS', 'PRE_CHECKIN', 'IN_STAY_CONCIERGE'],
  parametersSchema: {
    type: 'object',
    properties: {
      numero_flat: { type: 'string' },
    },
  },
  async execute(args: EnviarMidiaUnidadeArgs, _context: ContextoSessaoInjetado): Promise<AgentToolResponse> {
    return {
      status: 'SUCESSO_EXECUTADO',
      dados: { fotos_padrao: ['https://corpflats.com.br/flat-preview.jpg'], numero_flat: args.numero_flat || null },
      instrucao_para_ia:
        'Apresente o pacote padrão de fotos dos flats da CorpFlats no Edifício Soho Residence.',
    };
  },
};

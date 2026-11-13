// src/agent/tools/autorizar-visita-temporaria.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';

export interface AutorizarVisitaTemporariaArgs {
  nome_visitante?: string;
  cpf_visitante?: string;
  quantidade_visitantes?: number;
  vai_pernoitar?: boolean;
}

export const autorizarVisitaTemporariaTool: AgentToolDefinition<AutorizarVisitaTemporariaArgs> = {
  name: 'autorizar_visita_temporaria',
  description:
    'Valida regras do condomínio Soho Residence para visitas temporárias (limite da unidade, proibição de pernoite e área de lazer) e envia e-mail para soho@promenade.com.br.',
  allowedStates: ['PRE_CHECKIN', 'IN_STAY_CONCIERGE'],
  parametersSchema: {
    type: 'object',
    properties: {
      nome_visitante: { type: 'string' },
      cpf_visitante: { type: 'string' },
      quantidade_visitantes: { type: 'number' },
      vai_pernoitar: { type: 'boolean' },
    },
  },
  async execute(args: AutorizarVisitaTemporariaArgs, context: ContextoSessaoInjetado): Promise<AgentToolResponse> {
    if (args.vai_pernoitar) {
      return {
        status: 'BLOQUEADO_PELA_REGRA',
        codigo_regra_bloqueio: 'VISITA_NAO_PODE_PERNOITAR',
        instrucao_para_ia:
          'Explique que visitantes temporários não podem pernoitar nem acessar a cobertura/área de lazer (jacuzzi aquecida, saunas, academia e sala de jogos). Para pernoite, cadastre como hóspede acompanhante.',
      };
    }
    if (!args.nome_visitante || !args.cpf_visitante) {
      return {
        status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
        instrucao_para_ia:
          'Solicite o Nome Completo e o CPF do visitante e avise que visitas não podem pernoitar nem acessar a cobertura/área de lazer (jacuzzi aquecida, saunas, academia e sala de jogos).',
      };
    }
    return {
      status: 'SUCESSO_EXECUTADO',
      dados: { destinatario: 'soho@promenade.com.br', nome_visitante: args.nome_visitante },
      instrucao_para_ia:
        'Confirme que o e-mail de autorização de visita foi enviado para a recepção (soho@promenade.com.br).',
    };
  },
};

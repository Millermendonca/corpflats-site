// src/agent/tools/calcular-orcamento.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import { notifyAdminWhatsApp } from '../services/admin-notifier';

export interface CalcularOrcamentoArgs {
  data_checkin: string;
  data_checkout: string;
  quantidade_hospedes?: number;
  incluir_cafe?: boolean;
}

function diffNights(checkin: string, checkout: string): number {
  const a = new Date(`${checkin}T00:00:00Z`).getTime();
  const b = new Date(`${checkout}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export const calcularOrcamentoTool: AgentToolDefinition<CalcularOrcamentoArgs> = {
  name: 'calcular_orcamento',

  description:
    'Calcula o orçamento oficial completo e detalhado (diárias, café da manhã servido no flat, taxa de limpeza e valor total) ' +
    'para uma estadia na CorpFlats. Deve ser chamada sempre que o cliente pedir cotação ou valores para datas específicas.',

  allowedStates: ['COMERCIAL_VENDAS', 'PRE_CHECKIN', 'IN_STAY_CONCIERGE'],

  parametersSchema: {
    type: 'object',
    properties: {
      data_checkin: {
        type: 'string',
        description: 'Data de check-in no formato YYYY-MM-DD.',
      },
      data_checkout: {
        type: 'string',
        description: 'Data de check-out no formato YYYY-MM-DD.',
      },
      quantidade_hospedes: {
        type: 'number',
        description: 'Quantidade total de hóspedes (padrão: 1).',
      },
      incluir_cafe: {
        type: 'boolean',
        description: 'Se deve priorizar o plano com café da manhã servido no quarto (isento de taxa de limpeza).',
      },
    },
    required: ['data_checkin', 'data_checkout'],
  },

  async execute(
    args: CalcularOrcamentoArgs,
    context: ContextoSessaoInjetado
  ): Promise<AgentToolResponse> {
    try {
      const checkin = String(args.data_checkin || '').slice(0, 10);
      const checkout = String(args.data_checkout || '').slice(0, 10);
      const hospedes = Math.max(1, Number(args.quantidade_hospedes || 1));
      const diarias = diffNights(checkin, checkout);

      if (!checkin || !checkout || diarias <= 0) {
        const msg =
          'Explique ao cliente que para calcular o orçamento exato precisamos das datas válidas de entrada e saída (com saída posterior à entrada).';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'PERIODO_ORCAMENTO_INVALIDO',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      if (hospedes > 3) {
        const msg =
          'Explique ao cliente que nossos flats comportam no máximo 3 hóspedes por unidade e sugira cotar 2 apartamentos para o grupo.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'CAPACIDADE_POR_FLAT_EXCEDIDA',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const diariaBase = 216.49;
      const adicionalTerceiroHospede = hospedes === 3 ? 60.0 : 0.0;
      const valorCafeInternoPorPessoaDia = 20.0;
      const taxaLimpezaSemCafe = 70.0;
      const percentualComissaoPlataformas = 15.0;

      const diariaAcomodacao = Number((diariaBase + adicionalTerceiroHospede).toFixed(2));
      const diariaComCafe = Number((diariaAcomodacao + hospedes * valorCafeInternoPorPessoaDia).toFixed(2));

      const totalComCafe = Number((diarias * diariaComCafe).toFixed(2));
      const totalSemCafe = Number((diarias * diariaAcomodacao + taxaLimpezaSemCafe).toFixed(2));
      const totalCartaoComCafe = Number((totalComCafe * 1.05).toFixed(2));
      const totalCartaoSemCafe = Number((totalSemCafe * 1.05).toFixed(2));
      const totalPlataformasComCafe = Number((totalComCafe * (1 + percentualComissaoPlataformas / 100)).toFixed(2));
      const totalPlataformasSemCafe = Number((totalSemCafe * (1 + percentualComissaoPlataformas / 100)).toFixed(2));

      const msg =
        `Apresente ao cliente com clareza as duas opções oficiais para ${diarias} diária(s) (${checkin} a ${checkout}) para ${hospedes} hóspede(s), sem jamais mencionar valor separado de café nem dizer que limpeza é isenta:\n` +
        `1) *Hospedagem com Café da Manhã servido no Flat:* R$ ${diariaComCafe.toFixed(2)}/diária -> *Total no PIX (com desconto): R$ ${totalComCafe.toFixed(2)}* (ou R$ ${totalCartaoComCafe.toFixed(2)} no Cartão; nas plataformas Booking/Airbnb sairia R$ ${totalPlataformasComCafe.toFixed(2)}).\n` +
        `2) *Locação Somente Hospedagem (Sem Café):* R$ ${diariaAcomodacao.toFixed(2)}/diária + R$ ${taxaLimpezaSemCafe.toFixed(2)} taxa de limpeza -> *Total no PIX (com desconto): R$ ${totalSemCafe.toFixed(2)}* (ou R$ ${totalCartaoSemCafe.toFixed(2)} no Cartão; nas plataformas Booking/Airbnb sairia R$ ${totalPlataformasSemCafe.toFixed(2)}).\n` +
        `Nunca mencione acréscimo de cartão (apresente o valor do cartão naturalmente e o do PIX como desconto PIX, destacando também a economia em relação às plataformas). Pergunte qual das duas opções ele prefere para você gerar o bloqueio da reserva.`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          data_checkin: checkin,
          data_checkout: checkout,
          diarias,
          quantidade_hospedes: hospedes,
          opcao_com_cafe: {
            diaria: diariaComCafe,
            valor_total_pix: totalComCafe,
            valor_total_cartao: totalCartaoComCafe,
            valor_total: totalComCafe,
          },
          opcao_sem_cafe: {
            diaria: diariaAcomodacao,
            taxa_limpeza: taxaLimpezaSemCafe,
            valor_total_pix: totalSemCafe,
            valor_total_cartao: totalCartaoSemCafe,
            valor_total: totalSemCafe,
          },
          moeda: 'BRL',
        },
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    } catch (error: any) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'MEDIA',
        categoria: 'ERRO_SISTEMA_TOOL',
        hospede_nome: context.hospede?.nome || 'Lead Comercial',
        telefone: context.telefone_remetente,
        resumo: `Falha técnica ao executar calcular_orcamento: ${error.message}`,
        context,
      });

      const msg =
        'Peça desculpas ao cliente informando que houve uma oscilação ao calcular a tarifa e que a recepção já enviará o orçamento completo em instantes.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

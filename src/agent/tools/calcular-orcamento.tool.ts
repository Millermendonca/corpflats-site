// src/agent/tools/calcular-orcamento.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import { notifyAdminWhatsApp } from '../services/admin-notifier';

export interface FlatOrcamentoItem {
  data_checkin?: string;
  data_checkout?: string;
  quantidade_hospedes?: number;
  incluir_cafe?: boolean;
  preferencia_cama?: 'casal' | 'solteiro' | 'indiferente';
}

export interface CalcularOrcamentoArgs {
  data_checkin: string;
  data_checkout: string;
  quantidade_hospedes?: number;
  quantidade_flats?: number;
  incluir_cafe?: boolean;
  preferencia_cama?: 'casal' | 'solteiro' | 'indiferente';
  flats?: FlatOrcamentoItem[];
}

function diffNights(checkin: string, checkout: string): number {
  const a = new Date(`${checkin}T00:00:00Z`).getTime();
  const b = new Date(`${checkout}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function computeCardAmountLocal(pixAmount: number, cardMarkupPercent = 5): number {
  const fn = (globalThis as any).computeCardAmountFromPix;
  if (typeof fn === 'function') {
    return Number(fn(pixAmount, cardMarkupPercent));
  }
  const base = Number(pixAmount) || 0;
  if (base <= 0) return 0;
  const pct = Number.isFinite(Number(cardMarkupPercent)) && Number(cardMarkupPercent) >= 0
    ? Number(cardMarkupPercent)
    : 5;
  return Math.round(base * (1 + pct / 100) * 100) / 100;
}

function computeTwinFeeForStay(bedCfg: any, preferenciaCama: string | undefined, diarias: number): { wantsTwin: boolean; twinFee: number } {
  const prefNorm = String(preferenciaCama || '').trim().toLowerCase();
  const wantsTwin = prefNorm === 'solteiro' || prefNorm.includes('solteiro') || prefNorm.includes('twin') || prefNorm.includes('duas');
  if (!wantsTwin) return { wantsTwin: false, twinFee: 0 };
  const twinFeeUnit = Number(bedCfg?.twinFeeAmount ?? bedCfg?.twinPreparationFeeAmount ?? 30);
  const twinFeeType = bedCfg?.twinFeeType || bedCfg?.twinPreparationFeeType || 'per_stay';
  const twinFee = twinFeeUnit > 0
    ? Number((twinFeeType === 'per_night' ? twinFeeUnit * diarias : twinFeeUnit).toFixed(2))
    : 0;
  return { wantsTwin: true, twinFee };
}

export const calcularOrcamentoTool: AgentToolDefinition<CalcularOrcamentoArgs> = {
  name: 'calcular_orcamento',

  description:
    'Calcula o orçamento oficial completo e detalhado para 1 ou múltiplos flats (suportando datas de check-in/out, ocupação, configuração de cama e café da manhã independentes por flat, consolidando em 1 pagamento único).',

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
        description: 'Quantidade de hóspedes (no flat único ou total do grupo quando quantidade_flats > 1).',
      },
      quantidade_flats: {
        type: 'number',
        description: 'Quantidade de flats no pacote (padrão: 1).',
      },
      incluir_cafe: {
        type: 'boolean',
        description: 'Se deve priorizar o plano com café da manhã servido no quarto.',
      },
      preferencia_cama: {
        type: 'string',
        enum: ['casal', 'solteiro', 'indiferente'],
        description: 'Preferência opcional de configuração de cama (casal, solteiro ou indiferente).',
      },
      flats: {
        type: 'array',
        description: 'Configuração individual opcional por flat (datas diferentes, ocupação 1 ou 2, com/sem café, cama).',
        items: {
          type: 'object',
          properties: {
            data_checkin: { type: 'string' },
            data_checkout: { type: 'string' },
            quantidade_hospedes: { type: 'number' },
            incluir_cafe: { type: 'boolean' },
            preferencia_cama: { type: 'string', enum: ['casal', 'solteiro', 'indiferente'] },
          },
        },
      },
    },
    required: ['data_checkin', 'data_checkout'],
  },

  async execute(
    args: CalcularOrcamentoArgs,
    context: ContextoSessaoInjetado
  ): Promise<AgentToolResponse> {
    try {
      const db = context.runtime?.db;
      const extraBedEnabled = Boolean(db?.siteConfig?.extraBedConfig?.enabled);
      const maxGuestsPerFlat = extraBedEnabled ? 3 : 2;
      const siteCfg = db?.siteConfig || {};
      const bedCfg = siteCfg.bedConfig || {};
      const tarSettings = db?.tariffSettings || {};
      const diariaBase = Number(
        (tarSettings.mode === 'manual' && tarSettings.baseDailyRate != null ? tarSettings.baseDailyRate : siteCfg.ratePlans?.room_only?.dailyRate) ??
        216.49
      );
      const extraBedUnit = Number(siteCfg.extraBedConfig?.feeAmount ?? tarSettings.extraBedFee ?? 60.0);
      const extraBedType = siteCfg.extraBedConfig?.feeType || 'per_stay';
      const valorCafeInternoPorPessoaDia = Number(
        tarSettings.breakfastSurchargePerGuest ?? siteCfg.pricing?.breakfastSurchargePerGuest ?? 20.0
      );
      const taxaLimpezaSemCafe = siteCfg.ratePlans?.room_only?.cleaningFeeEnabled === false
        ? 0.0
        : Number(siteCfg.ratePlans?.room_only?.cleaningFeeAmount ?? tarSettings.cleaningFeeSemCafe ?? 50.0);
      const cardMarkupPct = Number(siteCfg.pricing?.cardMarkupPercent ?? tarSettings.cardMarkupPercent ?? 5.0);

      const requestedFlatsCount = Array.isArray(args.flats) && args.flats.length >= 2
        ? args.flats.length
        : Math.max(1, Number(args.quantidade_flats || 1));

      if (requestedFlatsCount >= 2) {
        const defaultIn = String(args.data_checkin || '').slice(0, 10);
        const defaultOut = String(args.data_checkout || '').slice(0, 10);
        const items: FlatOrcamentoItem[] = Array.isArray(args.flats) && args.flats.length >= 2
          ? args.flats
          : Array.from({ length: requestedFlatsCount }, (_, i) => {
              const totalPax = Math.max(requestedFlatsCount, Number(args.quantidade_hospedes || requestedFlatsCount));
              const basePax = Math.floor(totalPax / requestedFlatsCount);
              const rem = totalPax % requestedFlatsCount;
              return {
                data_checkin: defaultIn,
                data_checkout: defaultOut,
                quantidade_hospedes: Math.min(maxGuestsPerFlat, basePax + (i < rem ? 1 : 0)),
                incluir_cafe: args.incluir_cafe !== false,
                preferencia_cama: args.preferencia_cama || 'casal',
              };
            });

        let somaComCafePix = 0;
        let somaSemCafePix = 0;
        let somaEscolhidaPix = 0;
        const detalhamento: any[] = [];

        for (let idx = 0; idx < items.length; idx++) {
          const it = items[idx] || {};
          const fIn = String(it.data_checkin || defaultIn).slice(0, 10);
          const fOut = String(it.data_checkout || defaultOut).slice(0, 10);
          const fDiarias = diffNights(fIn, fOut);
          const fPax = Math.max(1, Number(it.quantidade_hospedes || 1));
          if (!fIn || !fOut || fDiarias <= 0) {
            const msg = `Peça ao cliente datas válidas de entrada e saída para o Flat ${idx + 1}.`;
            return {
              status: 'BLOQUEADO_PELA_REGRA',
              codigo_regra_bloqueio: 'PERIODO_ORCAMENTO_INVALIDO',
              instrucao_para_ia: msg,
              instrucao_resposta_ia: msg,
            };
          }
          if (fPax > maxGuestsPerFlat) {
            const msg = `Explique que o Flat ${idx + 1} excede o limite de ${maxGuestsPerFlat} pessoas por unidade e sugira adicionar mais 1 flat ao pacote.`;
            return {
              status: 'BLOQUEADO_PELA_REGRA',
              codigo_regra_bloqueio: 'CAPACIDADE_POR_FLAT_EXCEDIDA',
              instrucao_para_ia: msg,
              instrucao_resposta_ia: msg,
            };
          }
          const { wantsTwin, twinFee } = computeTwinFeeForStay(bedCfg, it.preferencia_cama || args.preferencia_cama, fDiarias);
          const adic3 = fPax >= 3 ? (extraBedType === 'per_night' ? Number((extraBedUnit * fDiarias).toFixed(2)) : extraBedUnit) : 0;
          const unitComCafe = Number((fDiarias * (diariaBase + fPax * valorCafeInternoPorPessoaDia) + adic3 + twinFee).toFixed(2));
          const unitSemCafe = Number((fDiarias * diariaBase + adic3 + taxaLimpezaSemCafe + twinFee).toFixed(2));
          const usaCafe = it.incluir_cafe !== undefined ? Boolean(it.incluir_cafe) : args.incluir_cafe !== false;
          const unitEscolhido = usaCafe ? unitComCafe : unitSemCafe;

          somaComCafePix = Number((somaComCafePix + unitComCafe).toFixed(2));
          somaSemCafePix = Number((somaSemCafePix + unitSemCafe).toFixed(2));
          somaEscolhidaPix = Number((somaEscolhidaPix + unitEscolhido).toFixed(2));

          detalhamento.push({
            flat_ordem: idx + 1,
            data_checkin: fIn,
            data_checkout: fOut,
            diarias: fDiarias,
            quantidade_hospedes: fPax,
            incluir_cafe: usaCafe,
            preferencia_cama: wantsTwin ? 'solteiro' : 'casal',
            taxa_camas_solteiro: twinFee,
            valor_com_cafe_pix: unitComCafe,
            valor_sem_cafe_pix: unitSemCafe,
            valor_selecionado_pix: unitEscolhido,
            valor_selecionado_cartao: computeCardAmountLocal(unitEscolhido, cardMarkupPct),
          });
        }

        const totalEscolhidoCartao = computeCardAmountLocal(somaEscolhidaPix, cardMarkupPct);
        const totalTodosComCafeCartao = computeCardAmountLocal(somaComCafePix, cardMarkupPct);
        const totalTodosSemCafeCartao = computeCardAmountLocal(somaSemCafePix, cardMarkupPct);

        const linhas = detalhamento
          .map(
            (d) =>
              `• Flat ${d.flat_ordem} (${d.data_checkin} a ${d.data_checkout}, ${d.diarias} diária(s), ${d.quantidade_hospedes} pax, ${d.incluir_cafe ? 'Com Café' : 'Sem Café'}, ${d.preferencia_cama === 'solteiro' ? '2 Solteiros' : 'Casal'}): R$ ${d.valor_selecionado_pix.toFixed(2)} no PIX`
          )
          .join('\n');

        const msg =
          `Apresente com clareza o orçamento do *Pacote com ${detalhamento.length} Flats (Pagamento Único)*:\n${linhas}\n` +
          `💎 *Total Consolidado no PIX (com desconto): R$ ${somaEscolhidaPix.toFixed(2)}* | Cartão: R$ ${totalEscolhidoCartao.toFixed(2)}.\n` +
          `(Referência se todos Com Café: R$ ${somaComCafePix.toFixed(2)} PIX / R$ ${totalTodosComCafeCartao.toFixed(2)} Cartão | Todos Sem Café: R$ ${somaSemCafePix.toFixed(2)} PIX / R$ ${totalTodosSemCafeCartao.toFixed(2)} Cartão).\n` +
          `Destaque que o solicitante paga 1 única vez e pode informar o Hóspede 1 e 2 de cada flat já agora ou depois pelo link único pós-pagamento. Pergunte se podemos gerar a pré-reserva unificada.`;

        return {
          status: 'SUCESSO_EXECUTADO',
          dados: {
            quantidade_flats: detalhamento.length,
            flats: detalhamento,
            valor_total_pacote_pix: somaEscolhidaPix,
            valor_total_pacote_cartao: totalEscolhidoCartao,
            todos_com_cafe_pix: somaComCafePix,
            todos_sem_cafe_pix: somaSemCafePix,
            moeda: 'BRL',
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

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

      if (hospedes > maxGuestsPerFlat) {
        const flatsSug = Math.ceil(hospedes / maxGuestsPerFlat);
        const msg =
          hospedes === 3 && !extraBedEnabled
            ? 'Explique educadamente ao cliente que o padrão oficial dos nossos flats é para até 2 hóspedes. Pergunte se ele prefere cotar um pacote de 2 flats (pagamento único) ou acionar a gerência para exceção.'
            : `Explique ao cliente que nossos flats comportam até ${maxGuestsPerFlat} hóspedes por unidade e pergunte se deseja cotar um pacote unificado de *${flatsSug} flats* com pagamento único.`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: hospedes === 3 && !extraBedEnabled ? 'TERCEIRO_HOSPEDE_REQUER_EXCECAO' : 'CAPACIDADE_POR_FLAT_EXCEDIDA',
          dados: { flats_sugeridos_pacote: flatsSug },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const { wantsTwin, twinFee } = computeTwinFeeForStay(bedCfg, args.preferencia_cama, diarias);
      const adicionalTerceiroHospedeTotal = hospedes >= 3
        ? (extraBedType === 'per_night' ? Number((extraBedUnit * diarias).toFixed(2)) : extraBedUnit)
        : 0.0;
      const percentualComissaoPlataformas = 15.0;

      const diariaAcomodacao = Number(diariaBase.toFixed(2));
      const diariaComCafe = Number((diariaAcomodacao + hospedes * valorCafeInternoPorPessoaDia).toFixed(2));

      const totalComCafe = Number((diarias * diariaComCafe + adicionalTerceiroHospedeTotal + twinFee).toFixed(2));
      const totalSemCafe = Number((diarias * diariaAcomodacao + adicionalTerceiroHospedeTotal + taxaLimpezaSemCafe + twinFee).toFixed(2));
      const totalCartaoComCafe = computeCardAmountLocal(totalComCafe, cardMarkupPct);
      const totalCartaoSemCafe = computeCardAmountLocal(totalSemCafe, cardMarkupPct);
      const totalPlataformasComCafe = Number((totalComCafe * (1 + percentualComissaoPlataformas / 100)).toFixed(2));
      const totalPlataformasSemCafe = Number((totalSemCafe * (1 + percentualComissaoPlataformas / 100)).toFixed(2));
      const notaTwinTxt = wantsTwin && twinFee > 0 ? ` (já inclui R$ ${twinFee.toFixed(2)} da montagem de 2 camas de solteiro)` : '';

      const msg =
        `Apresente ao cliente com clareza as duas opções oficiais para ${diarias} diária(s) (${checkin} a ${checkout}) para ${hospedes} hóspede(s)${notaTwinTxt}, sem jamais mencionar valor separado de café nem dizer que limpeza é isenta:\n` +
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
          preferencia_cama: wantsTwin ? 'solteiro' : 'casal',
          taxa_camas_solteiro: twinFee,
          opcao_com_cafe: {
            diaria: diariaComCafe,
            taxa_camas_solteiro: twinFee,
            valor_total_pix: totalComCafe,
            valor_total_cartao: totalCartaoComCafe,
            valor_total: totalComCafe,
          },
          opcao_sem_cafe: {
            diaria: diariaAcomodacao,
            taxa_limpeza: taxaLimpezaSemCafe,
            taxa_camas_solteiro: twinFee,
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

// src/agent/tools/consultar-disponibilidade.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import { notifyAdminWhatsApp } from '../services/admin-notifier';

export interface FlatConsultaItem {
  data_checkin?: string;
  data_checkout?: string;
  quantidade_hospedes?: number;
  preferencia_cama?: 'casal' | 'solteiro' | 'indiferente';
}

export interface ConsultarDisponibilidadeArgs {
  data_checkin: string;
  data_checkout: string;
  quantidade_hospedes?: number;
  quantidade_flats?: number;
  preferencia_cama?: 'casal' | 'solteiro' | 'indiferente';
  flats?: FlatConsultaItem[];
}

function diffNights(checkin: string, checkout: string): number {
  const a = new Date(`${checkin}T00:00:00Z`).getTime();
  const b = new Date(`${checkout}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export const consultarDisponibilidadeTool: AgentToolDefinition<ConsultarDisponibilidadeArgs> = {
  name: 'consultar_disponibilidade',

  description:
    'Consulta a disponibilidade real de 1 ou múltiplos flats na CorpFlats (inclusive com datas, ocupação e camas independentes por flat no mesmo pacote). ' +
    'Deve ser chamada sempre que um cliente perguntar se há vaga para 1 ou vários flats ou quiser cotar datas.',

  allowedStates: ['COMERCIAL_VENDAS', 'PRE_CHECKIN', 'IN_STAY_CONCIERGE'],

  parametersSchema: {
    type: 'object',
    properties: {
      data_checkin: {
        type: 'string',
        description: 'Data principal de check-in no formato YYYY-MM-DD.',
      },
      data_checkout: {
        type: 'string',
        description: 'Data principal de check-out no formato YYYY-MM-DD.',
      },
      quantidade_hospedes: {
        type: 'number',
        description: 'Quantidade de hóspedes (no flat único ou total do grupo se quantidade_flats > 1).',
      },
      quantidade_flats: {
        type: 'number',
        description: 'Quantidade de flats desejados no pacote (padrão: 1).',
      },
      preferencia_cama: {
        type: 'string',
        enum: ['casal', 'solteiro', 'indiferente'],
        description: 'Preferência opcional de configuração de cama.',
      },
      flats: {
        type: 'array',
        description: 'Lista opcional quando o cliente pedir múltiplos flats com datas, ocupação ou camas diferentes por flat.',
        items: {
          type: 'object',
          properties: {
            data_checkin: { type: 'string', description: 'Check-in deste flat (YYYY-MM-DD).' },
            data_checkout: { type: 'string', description: 'Check-out deste flat (YYYY-MM-DD).' },
            quantidade_hospedes: { type: 'number', description: 'Ocupação deste flat (1 ou 2 pessoas).' },
            preferencia_cama: { type: 'string', enum: ['casal', 'solteiro', 'indiferente'] },
          },
        },
      },
    },
    required: ['data_checkin', 'data_checkout'],
  },

  async execute(
    args: ConsultarDisponibilidadeArgs,
    context: ContextoSessaoInjetado
  ): Promise<AgentToolResponse> {
    try {
      const db = context.runtime?.db;
      const extraBedEnabled = Boolean(db?.siteConfig?.extraBedConfig?.enabled);
      const maxGuestsPerFlat = extraBedEnabled ? 3 : 2;

      const requestedFlatsCount = Array.isArray(args.flats) && args.flats.length >= 2
        ? args.flats.length
        : Math.max(1, Number(args.quantidade_flats || 1));

      if (requestedFlatsCount >= 2) {
        const defaultIn = String(args.data_checkin || '').slice(0, 10);
        const defaultOut = String(args.data_checkout || '').slice(0, 10);
        const items: FlatConsultaItem[] = Array.isArray(args.flats) && args.flats.length >= 2
          ? args.flats
          : Array.from({ length: requestedFlatsCount }, (_, i) => {
              const totalPax = Math.max(requestedFlatsCount, Number(args.quantidade_hospedes || requestedFlatsCount));
              const basePax = Math.floor(totalPax / requestedFlatsCount);
              const rem = totalPax % requestedFlatsCount;
              return {
                data_checkin: defaultIn,
                data_checkout: defaultOut,
                quantidade_hospedes: Math.min(maxGuestsPerFlat, basePax + (i < rem ? 1 : 0)),
                preferencia_cama: args.preferencia_cama || 'casal',
              };
            });

        const allFlats: any[] = Array.isArray(db?.flats) && db.flats.length > 0
          ? db.flats.filter((f: any) => f && f.isActive !== false && f.status !== 'maintenance' && f.status !== 'manutencao_bloqueada')
          : [{ number: '113' }, { number: '114' }, { number: '212' }, { number: '905' }];
        const reservations: any[] = Array.isArray(db?.reservations) ? db.reservations : [];
        const nowMs = Date.now() + Number((globalThis as any).__simulatedTimeOffsetMs || 0);
        const bedCfg = db?.siteConfig?.bedConfig || {};
        const twinAllowedFlats: string[] = (
          Array.isArray(bedCfg.twinAllowedFlats) && bedCfg.twinAllowedFlats.length > 0
            ? bedCfg.twinAllowedFlats
            : ['113', '114', '115', '202', '905']
        ).map((n: any) => String(n));

        const allocatedBatch: Array<{ flatNumber: string; checkin: string; checkout: string; hospedes: number; cama: string }> = [];

        for (let idx = 0; idx < items.length; idx++) {
          const it = items[idx] || {};
          const fIn = String(it.data_checkin || defaultIn).slice(0, 10);
          const fOut = String(it.data_checkout || defaultOut).slice(0, 10);
          const fNights = diffNights(fIn, fOut);
          const fPax = Math.max(1, Number(it.quantidade_hospedes || 1));
          if (!fIn || !fOut || fNights <= 0) {
            const msg = `Peça ao cliente para confirmar as datas válidas de entrada e saída do Flat ${idx + 1}.`;
            return {
              status: 'BLOQUEADO_PELA_REGRA',
              codigo_regra_bloqueio: 'DATAS_INVALIDAS',
              instrucao_para_ia: msg,
              instrucao_resposta_ia: msg,
            };
          }
          if (fPax > maxGuestsPerFlat) {
            const msg = `Explique ao cliente que cada flat comporta até ${maxGuestsPerFlat} hóspedes (o Flat ${idx + 1} foi solicitado para ${fPax}). Sugira redistribuir ou acrescentar mais 1 flat ao pacote.`;
            return {
              status: 'BLOQUEADO_PELA_REGRA',
              codigo_regra_bloqueio: 'CAPACIDADE_MAXIMA_EXCEDIDA',
              instrucao_para_ia: msg,
              instrucao_resposta_ia: msg,
            };
          }
          const wantsTwin = String(it.preferencia_cama || args.preferencia_cama || '').toLowerCase().includes('solteiro');
          if (wantsTwin && bedCfg.allowTwinBeds === false) {
            const msgTwinOff =
              'Informe ao cliente que no momento todos os flats estão configurados com cama Queen de casal (a montagem com 2 camas de solteiro está indisponível). Pergunte se a cama Queen atende.';
            return {
              status: 'BLOQUEADO_PELA_REGRA',
              codigo_regra_bloqueio: 'CAMAS_SOLTEIRO_INDISPONIVEIS',
              instrucao_para_ia: msgTwinOff,
              instrucao_resposta_ia: msgTwinOff,
            };
          }
          const candidates = allFlats.filter((flat: any) => {
            const fNum = String(flat.number || flat.id || '');
            if (wantsTwin && !twinAllowedFlats.includes(fNum)) return false;
            const usedInBatch = allocatedBatch.some(
              (prev) => prev.flatNumber === fNum && fIn < prev.checkout && fOut > prev.checkin
            );
            if (usedInBatch) return false;
            const hasConflict = reservations.some((r: any) => {
              if (!r) return false;
              const st = String(r.status || '').toLowerCase();
              if (['cancelada', 'cancelado', 'cancelled', 'expirada', 'expired', 'no_show'].includes(st)) return false;
              const holdExp = r.expiresAt || r.holdExpiresAt;
              if ((st === 'pre_reserva' || st === 'pendente' || r.isPreReservation) && holdExp && new Date(holdExp).getTime() < nowMs && r.paymentStatus !== 'pago_total' && r.paymentStatus !== 'pago') return false;
              if (String(r.flatNumber || r.flatId || '') !== fNum) return false;
              return fIn < String(r.checkoutDate || '').slice(0, 10) && fOut > String(r.checkinDate || '').slice(0, 10);
            });
            return !hasConflict;
          });

          if (candidates.length === 0) {
            const msg = `Informe com empatia que não há disponibilidade simultânea para o Flat ${idx + 1} no período ${fIn} a ${fOut} (conseguimos atender ${allocatedBatch.length} flat(s) nesse intervalo). Pergunte se deseja ajustar as datas ou quantidade de unidades.`;
            return {
              status: 'BLOQUEADO_PELA_REGRA',
              codigo_regra_bloqueio: 'SEM_DISPONIBILIDADE_MULTI_FLAT',
              dados: { flats_solicitados: items.length, flats_atendidos: allocatedBatch.length },
              instrucao_para_ia: msg,
              instrucao_resposta_ia: msg,
            };
          }

          allocatedBatch.push({
            flatNumber: String(candidates[0].number || candidates[0].id),
            checkin: fIn,
            checkout: fOut,
            hospedes: fPax,
            cama: wantsTwin ? 'solteiro' : 'casal',
          });
        }

        const resumoFlats = allocatedBatch
          .map((a, i) => `Flat ${i + 1} (Unid. ${a.flatNumber}: ${a.checkin} a ${a.checkout}, ${a.hospedes} pax, cama ${a.cama})`)
          .join('; ');
        const msg =
          `Confirme com entusiasmo que temos disponibilidade para os *${allocatedBatch.length} flats* solicitados em pacote unificado (1 único pagamento PIX/Cartão para o solicitante): ${resumoFlats}. ` +
          `Pergunte se prefere cotar com café da manhã servido no flat ou somente hospedagem para cada unidade.`;

        return {
          status: 'SUCESSO_EXECUTADO',
          dados: {
            quantidade_flats: allocatedBatch.length,
            alocacao_sugerida: allocatedBatch,
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const checkin = String(args.data_checkin || '').slice(0, 10);
      const checkout = String(args.data_checkout || '').slice(0, 10);
      const hospedes = Math.max(1, Number(args.quantidade_hospedes || 1));
      const diarias = diffNights(checkin, checkout);

      // TRAVA 1: Datas inválidas
      if (!checkin || !checkout || diarias <= 0) {
        const msg =
          'Explique educadamente ao cliente que a data de saída precisa ser posterior à data de entrada e peça para confirmar as datas desejadas de check-in e check-out.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'DATAS_INVALIDAS',
          dados: { data_checkin: checkin, data_checkout: checkout },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      // TRAVA 2: Capacidade máxima por flat -> orienta pacote multi-flat com 1 único PIX!
      if (hospedes > maxGuestsPerFlat) {
        const flatsSugeridos = Math.ceil(hospedes / maxGuestsPerFlat);
        const msg =
          hospedes === 3 && !extraBedEnabled
            ? 'Explique educadamente ao cliente que o padrão oficial dos nossos flats é para até 2 hóspedes. Pergunte se ele prefere que você já cote um pacote de 2 flats (com 1 único pagamento PIX/Cartão) ou se deseja consultar a gerência para verificar exceção de 3ª pessoa.'
            : `Explique ao cliente que cada flat comporta até ${maxGuestsPerFlat} hóspedes com conforto. ` +
              `Para ${hospedes} pessoas, ofereça montar um pacote unificado de *${flatsSugeridos} flats* (onde o solicitante paga 1 única vez no PIX ou Cartão e cadastra os hóspedes de cada flat) e pergunte se pode cotar assim.`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: hospedes === 3 && !extraBedEnabled ? 'TERCEIRO_HOSPEDE_REQUER_EXCECAO' : 'CAPACIDADE_MAXIMA_EXCEDIDA',
          dados: { quantidade_solicitada: hospedes, capacidade_maxima_por_flat: maxGuestsPerFlat, flats_sugeridos_pacote: flatsSugeridos },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const nowEffective = new Date(Date.now() + Number((globalThis as any).__simulatedTimeOffsetMs || 0));
      const nowMs = nowEffective.getTime();
      const brtDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(nowEffective);
      const brtTimeParts = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(nowEffective);
      const brtHhMm = `${String(brtTimeParts.find((p) => p.type === 'hour')?.value || '00').padStart(2, '0')}:${String(brtTimeParts.find((p) => p.type === 'minute')?.value || '00').padStart(2, '0')}`;

      if (extraBedEnabled && hospedes >= 3 && checkin === brtDateStr) {
        const extraCutoffTime = `${String(Number(db?.siteConfig?.extraBedConfig?.cutoffHour) || 12).padStart(2, '0')}:00`;
        if (brtHhMm >= extraCutoffTime) {
          const msg = `Explique educadamente ao cliente que para reservas com check-in hoje após as ${extraCutoffTime}, a lotação é limitada a até 2 hóspedes por flat.`;
          return {
            status: 'BLOQUEADO_PELA_REGRA',
            codigo_regra_bloqueio: 'CORTE_TERCEIRO_HOSPEDE_MESMO_DIA',
            dados: { data_checkin: checkin, horario_corte: extraCutoffTime },
            instrucao_para_ia: msg,
            instrucao_resposta_ia: msg,
          };
        }
      }

      const prefLower = String(args.preferencia_cama || '').trim().toLowerCase();
      const wantsTwin = prefLower === 'solteiro' || prefLower.includes('twin') || prefLower.includes('duas');
      const bedCfg = db?.siteConfig?.bedConfig || {};
      const twinCutoffTime = String(bedCfg.twinSameDayCutoffTime || '12:00');
      const twinAllowedFlats: string[] = (
        Array.isArray(bedCfg.twinAllowedFlats) && bedCfg.twinAllowedFlats.length > 0
          ? bedCfg.twinAllowedFlats
          : ['113', '114', '115', '202', '905']
      ).map((n: any) => String(n));
      const twinFeeAmount = Number(bedCfg.twinFeeAmount ?? 30);
      const twinFeeType = bedCfg.twinFeeType || 'per_stay';

      if (wantsTwin) {
        if (bedCfg.allowTwinBeds === false) {
          const msg =
            'Informe ao cliente que no momento todos os flats estão configurados com cama Queen de casal (a montagem com 2 camas de solteiro está indisponível). Pergunte se a cama Queen atende.';
          return {
            status: 'BLOQUEADO_PELA_REGRA',
            codigo_regra_bloqueio: 'CAMAS_SOLTEIRO_INDISPONIVEIS',
            dados: { data_checkin: checkin, data_checkout: checkout },
            instrucao_para_ia: msg,
            instrucao_resposta_ia: msg,
          };
        }
        if (checkin === brtDateStr && brtHhMm >= twinCutoffTime) {
          const msg =
            `Explique educadamente ao cliente que, para reservas com check-in no mesmo dia, a montagem com 2 camas de solteiro precisa ser solicitada até as ${twinCutoffTime} por conta do preparo da governança. ` +
            `Informe que temos disponibilidade imediata com cama Queen de casal para hoje e pergunte se podemos seguir assim.`;
          return {
            status: 'BLOQUEADO_PELA_REGRA',
            codigo_regra_bloqueio: 'CORTE_CAMAS_SOLTEIRO_MESMO_DIA',
            dados: { data_checkin: checkin, horario_corte: twinCutoffTime },
            instrucao_para_ia: msg,
            instrucao_resposta_ia: msg,
          };
        }
      }

      const allFlats: any[] = Array.isArray(db?.flats) && db.flats.length > 0
        ? db.flats.filter((f: any) => f && f.isActive !== false && f.status !== 'maintenance' && f.status !== 'manutencao_bloqueada')
        : [{ number: '113' }, { number: '114' }, { number: '212' }, { number: '905' }];

      const reservations: any[] = Array.isArray(db?.reservations) ? db.reservations : [];

      const availableAllFlats = allFlats.filter((flat: any) => {
        const flatNum = String(flat.number || flat.id || '');
        const hasConflict = reservations.some((r: any) => {
          if (!r) return false;
          const st = String(r.status || '').toLowerCase();
          if (['cancelada', 'cancelado', 'cancelled', 'expirada', 'expired', 'no_show'].includes(st)) return false;
          const holdExp = r.expiresAt || r.holdExpiresAt;
          if ((st === 'pre_reserva' || st === 'pendente' || r.isPreReservation) && holdExp && new Date(holdExp).getTime() < nowMs && r.paymentStatus !== 'pago_total' && r.paymentStatus !== 'pago') {
            return false;
          }
          if (String(r.flatNumber || r.flatId || '') !== flatNum) return false;
          const rIn = String(r.checkinDate || '').slice(0, 10);
          const rOut = String(r.checkoutDate || '').slice(0, 10);
          return checkin < rOut && checkout > rIn;
        });
        return !hasConflict;
      });

      const availableFlats = wantsTwin
        ? availableAllFlats.filter((f: any) => twinAllowedFlats.includes(String(f.number || f.id || '')))
        : availableAllFlats;

      if (availableFlats.length === 0) {
        if (wantsTwin && availableAllFlats.length > 0) {
          const msgTwinEsgotado =
            `Informe ao cliente que para o período de ${checkin} a ${checkout} as unidades que comportam 2 camas de solteiro já estão ocupadas, ` +
            `mas temos flats disponíveis com cama Queen de casal. Pergunte se ele deseja cotar na configuração Queen.`;
          return {
            status: 'BLOQUEADO_PELA_REGRA',
            codigo_regra_bloqueio: 'SEM_DISPONIBILIDADE_CAMAS_SOLTEIRO',
            dados: { data_checkin: checkin, data_checkout: checkout, unidades_queen_disponiveis: availableAllFlats.length },
            instrucao_para_ia: msgTwinEsgotado,
            instrucao_resposta_ia: msgTwinEsgotado,
          };
        }
        const msg =
          `Informe ao cliente com empatia que estamos com 100% de ocupação para o período de ${checkin} a ${checkout}. ` +
          `Pergunte se ele possui flexibilidade nas datas ou se deseja deixar o contato na lista de prioridade caso surja desistência.`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_DISPONIBILIDADE_NO_PERIODO',
          dados: { data_checkin: checkin, data_checkout: checkout, unidades_disponiveis: 0 },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const listaFlats = availableFlats.slice(0, 5).map((f: any) => String(f.number || f.id));
      const notaTwin = wantsTwin && twinFeeAmount > 0
        ? ` Informe que a montagem com 2 camas de solteiro está disponível nessas unidades mediante adicional de R$ ${twinFeeAmount.toFixed(2)} (${twinFeeType === 'per_night' ? 'por diária' : 'por estadia'}).`
        : '';
      const msg =
        `Confirme com entusiasmo que temos disponibilidade para o período de ${checkin} a ${checkout} (${diarias} diária(s)) para ${hospedes} pessoa(s) ` +
        `(Flats disponíveis: ${listaFlats.join(', ')}).${notaTwin} Pergunte se o cliente prefere o plano com café da manhã servido no flat ou o plano somente hospedagem para calcular o orçamento exato (nunca mencione isenção de taxa de limpeza).`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          data_checkin: checkin,
          data_checkout: checkout,
          diarias,
          quantidade_hospedes: hospedes,
          unidades_disponiveis: availableFlats.length,
          flats_sugeridos: listaFlats,
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
        resumo: `Falha técnica ao executar consultar_disponibilidade (${args.data_checkin} a ${args.data_checkout}): ${error.message}`,
        context,
      });

      const msg =
        'Peça desculpas ao cliente informando que o calendário apresentou uma instabilidade rápida e que a recepção já foi acionada para confirmar a disponibilidade em instantes.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

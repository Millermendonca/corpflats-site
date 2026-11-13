// src/agent/tools/alterar-datas-reserva.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import { notifyAdminWhatsApp } from '../services/admin-notifier';

export interface AlterarDatasReservaArgs {
  reserva_id?: string;
  nova_data_checkin: string;
  nova_data_checkout: string;
  efetivar_alteracao?: boolean;
  confirmacao_hospede?: boolean;
}

function diffDays(dateA: string, dateB: string): number {
  const a = new Date(`${dateA}T00:00:00Z`).getTime();
  const b = new Date(`${dateB}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export const alterarDatasReservaTool: AgentToolDefinition<AlterarDatasReservaArgs> = {
  name: 'alterar_datas_reserva',

  description:
    'Simula ou efetiva a alteração de datas de check-in ou check-out (ou extensão de estadia) da reserva ativa do hóspede, ' +
    'calculando diferenças de tarifa e verificando disponibilidade real no calendário.',

  allowedStates: ['PRE_CHECKIN', 'IN_STAY_CONCIERGE'],

  parametersSchema: {
    type: 'object',
    properties: {
      nova_data_checkin: {
        type: 'string',
        description: 'Nova data de entrada no formato YYYY-MM-DD.',
      },
      nova_data_checkout: {
        type: 'string',
        description: 'Nova data de saída no formato YYYY-MM-DD.',
      },
      efetivar_alteracao: {
        type: 'boolean',
        description:
          'Passe FALSE primeiro para apenas simular valores e disponibilidade. ' +
          'Passe TRUE somente após o hóspede confirmar explicitamente na conversa que aceita a alteração e eventual diferença tarifária.',
      },
    },
    required: ['nova_data_checkin', 'nova_data_checkout', 'efetivar_alteracao'],
  },

  async execute(
    args: AlterarDatasReservaArgs,
    context: ContextoSessaoInjetado
  ): Promise<AgentToolResponse> {
    try {
      const reserva = context.reserva_ativa || context.reserva_atual;
      if (!reserva) {
        const msg =
          'Explique educadamente que você não localizou uma reserva ativa vinculada a este número de telefone e peça o código da reserva ou CPF do titular.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const novaEntrada = String(args.nova_data_checkin || reserva.data_checkin).slice(0, 10);
      const novaSaida = String(args.nova_data_checkout || reserva.data_checkout).slice(0, 10);
      const confirmado = Boolean(args.efetivar_alteracao ?? args.confirmacao_hospede ?? false);

      const novasDiarias = diffDays(novaEntrada, novaSaida);
      if (novasDiarias <= 0) {
        const msg =
          `Explique ao hóspede que a data de saída (${novaSaida}) precisa ser posterior à data de entrada (${novaEntrada}) e peça para confirmar o período desejado.`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'PERIODO_INVALIDO',
          dados: { nova_data_checkin: novaEntrada, nova_data_checkout: novaSaida },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const db = context.runtime?.db;
      const flatNumber = reserva.nome_imovel.replace(/^Flat\s+/i, '').trim();

      // Verifica conflito de calendário com outras reservas do mesmo flat
      let conflitoReserva: any = null;
      if (Array.isArray(db?.reservations)) {
        conflitoReserva = db.reservations.find((r: any) => {
          if (!r || r.status === 'cancelada' || r.status === 'cancelled') return false;
          const rCode = String(r.code || r.reservationCode || r.id || '');
          if (rCode === reserva.id) return false;
          const sameFlat =
            String(r.flatNumber || '') === flatNumber ||
            String(r.flatId || '') === String(reserva.imovel_id);
          if (!sameFlat) return false;
          const rIn = String(r.checkinDate || '').slice(0, 10);
          const rOut = String(r.checkoutDate || '').slice(0, 10);
          return novaEntrada < rOut && novaSaida > rIn;
        });
      }

      if (conflitoReserva) {
        const msg =
          `Informe ao hóspede com empatia que o ${reserva.nome_imovel} já possui outra reserva confirmada conflitando com o período de ${novaEntrada} a ${novaSaida}. ` +
          `Pergunte se ele gostaria que você verificasse a disponibilidade de outro flat equivalente para essas novas datas.`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'CONFLITO_CALENDARIO_IMOVEL',
          dados: {
            imovel: reserva.nome_imovel,
            nova_data_checkin: novaEntrada,
            nova_data_checkout: novaSaida,
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const diariasAtuais = Math.max(1, diffDays(reserva.data_checkin, reserva.data_checkout));
      const diferencaDiarias = novasDiarias - diariasAtuais;
      const tarifaBaseDiaria = 237.0;
      const diferencaValor = Math.max(0, diferencaDiarias * tarifaBaseDiaria);

      if (!confirmado) {
        const detalheValor =
          diferencaValor > 0
            ? `há um acréscimo de ${diferencaDiarias} diária(s) no valor total de R$ ${diferencaValor.toFixed(2)}`
            : 'não há cobrança adicional de diárias para essa alteração';
        const msg =
          `Informe ao hóspede que o ${reserva.nome_imovel} está disponível para o novo período de ${novaEntrada} a ${novaSaida} (${novasDiarias} diária(s)) e que ${detalheValor}. ` +
          `Pergunte se ele confirma a alteração para você efetivar a atualização no sistema.`;
        return {
          status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
          dados: {
            reserva_id: reserva.id,
            nova_data_checkin: novaEntrada,
            nova_data_checkout: novaSaida,
            novas_diarias: novasDiarias,
            diferenca_diarias: diferencaDiarias,
            diferenca_valor: diferencaValor,
            moeda: 'BRL',
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      // Efetiva a alteração no banco de dados quando disponível
      let expiraEmHoraBr = '';
      let expiraEmIso = '';
      if (Array.isArray(db?.reservations)) {
        const targetRes = db.reservations.find((r: any) => {
          const rCode = String(r?.code || r?.reservationCode || r?.id || '');
          return rCode === reserva.id;
        });
        if (targetRes) {
          const nowDate = new Date();
          const nowIso = nowDate.toISOString();
          const priorExt =
            targetRes.pendingStayExtension?.isPreReservationHold &&
            targetRes.pendingStayExtension?.status === 'pending_payment'
              ? targetRes.pendingStayExtension
              : null;
          const origCheckin = String(priorExt?.oldCheckinDate || targetRes.checkinDate || reserva.data_checkin).slice(0, 10);
          const origCheckout = String(priorExt?.oldCheckoutDate || targetRes.checkoutDate || reserva.data_checkout).slice(0, 10);
          const origDailyRates = priorExt?.oldDailyRates
            ? priorExt.oldDailyRates.map((d: any) => ({ ...d }))
            : Array.isArray(targetRes.dailyRates)
              ? targetRes.dailyRates.map((d: any) => ({ ...d }))
              : [];
          const origCharges = priorExt?.oldCharges
            ? priorExt.oldCharges.map((c: any) => ({ ...c }))
            : Array.isArray(targetRes.charges)
              ? targetRes.charges.map((c: any) => ({ ...c }))
              : [];
          const origCleaningFee =
            priorExt?.oldCleaningFee !== undefined ? Number(priorExt.oldCleaningFee) || 0 : Number(targetRes.cleaningFee) || 0;
          const origTotal =
            priorExt?.oldTotalAmount !== undefined ? Number(priorExt.oldTotalAmount) || 0 : Number(targetRes.totalAmount) || 0;
          const origPaid =
            priorExt?.oldPaidAmount !== undefined ? Number(priorExt.oldPaidAmount) || 0 : Number(targetRes.paidAmount) || 0;
          const origPaymentStatus = priorExt?.oldPaymentStatus || targetRes.paymentStatus || 'pago_total';

          targetRes.checkinDate = novaEntrada;
          targetRes.checkoutDate = novaSaida;
          targetRes.nights = novasDiarias;

          if (diferencaValor > 0) {
            const addedDates: string[] = [];
            for (let i = 0; i < novasDiarias; i++) {
              const dtStr = new Date(new Date(`${novaEntrada}T12:00:00Z`).getTime() + i * 86400000)
                .toISOString()
                .slice(0, 10);
              if (dtStr < origCheckin || dtStr >= origCheckout) {
                addedDates.push(dtStr);
              }
            }
            const addedDailyRates = addedDates.map((dt) => ({
              date: dt,
              rate: tarifaBaseDiaria,
              channel: 'whatsapp',
            }));
            if (origDailyRates.length > 0) {
              const keptRates = origDailyRates.filter((d: any) => d && d.date >= novaEntrada && d.date < novaSaida);
              targetRes.dailyRates = [...keptRates, ...addedDailyRates].sort((a, b) =>
                String(a.date).localeCompare(String(b.date))
              );
            }

            const newTotal = Number(((typeof targetRes.totalAmount === 'number' ? targetRes.totalAmount : origTotal) + diferencaValor).toFixed(2));
            targetRes.totalAmount = newTotal;
            targetRes.cardTotalAmount = Number((newTotal / 0.95).toFixed(2));
            if (origPaid > 0 && origPaid < newTotal) {
              targetRes.paymentStatus = 'parcial';
            }

            const resolveHoldFn = (globalThis as any).resolveStayExtensionHold;
            const holdInfo =
              typeof resolveHoldFn === 'function'
                ? resolveHoldFn({ source: 'whatsapp_ai' }, addedDates[0] || origCheckout)
                : {
                    expiresAt: new Date(nowDate.getTime() + 30 * 60 * 1000).toISOString(),
                    reminderAt: new Date(nowDate.getTime() + 20 * 60 * 1000).toISOString(),
                    reminderLeadMinutes: 10,
                    reminderLeadLabel: '10 minutos',
                    sendExpirationReminder: true,
                    holdPreset: '30m',
                    holdDurationMinutes: 30,
                    holdDurationLabel: '30 minutos',
                  };
            expiraEmIso = holdInfo.expiresAt;
            expiraEmHoraBr = new Intl.DateTimeFormat('pt-BR', {
              timeZone: 'America/Sao_Paulo',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            }).format(new Date(holdInfo.expiresAt));

            const hadSignedFnrh = Boolean(
              targetRes.preCheckinCompleted ||
                targetRes.fnrhSignedAt ||
                targetRes.signatureDataUrl ||
                targetRes.fnrhSignature ||
                targetRes.checkinDone ||
                targetRes.actualCheckinAt
            );

            targetRes.oldCheckoutDateBeforeExtension = origCheckout;
            targetRes.pendingStayExtension = {
              isPreReservationHold: true,
              source: 'whatsapp_ai',
              status: 'pending_payment',
              amount: Number((newTotal - origPaid).toFixed(2)),
              extraNights: Math.max(1, addedDates.length || diferencaDiarias),
              newTotalNights: novasDiarias,
              oldCheckinDate: origCheckin,
              oldCheckoutDate: origCheckout,
              newCheckinDate: novaEntrada,
              newCheckoutDate: novaSaida,
              addedDates,
              addedDailyRates,
              oldDailyRates: origDailyRates,
              oldCharges: origCharges,
              oldCleaningFee: origCleaningFee,
              oldTotalAmount: origTotal,
              oldPaidAmount: origPaid,
              oldPaymentStatus: origPaymentStatus,
              requiresDeferredReSignature: hadSignedFnrh,
              expiresAt: holdInfo.expiresAt,
              reminderAt: holdInfo.reminderAt,
              reminderLeadMinutes: holdInfo.reminderLeadMinutes,
              reminderLeadLabel: holdInfo.reminderLeadLabel,
              sendExpirationReminder: holdInfo.sendExpirationReminder !== false,
              holdPreset: holdInfo.holdPreset || '30m',
              holdDurationMinutes: holdInfo.holdDurationMinutes || 30,
              holdDurationLabel: holdInfo.holdDurationLabel || '30 minutos',
              requestedAt: nowIso,
            };

            if (Array.isArray(db?.cleaningRequests)) {
              for (const cr of db.cleaningRequests) {
                if (
                  cr &&
                  String(cr.flatNumber) === flatNumber &&
                  cr.requestDate === origCheckout &&
                  cr.status !== 'clean'
                ) {
                  if (cr.previousAdminNoteBeforeExtension === undefined) {
                    cr.previousAdminNoteBeforeExtension = cr.adminNote || null;
                  }
                  cr.originalRequestDateBeforeExtension = cr.originalRequestDateBeforeExtension || origCheckout;
                  cr.extensionHoldReservationId = targetRes.id;
                  cr.extensionHoldExpiresAt = holdInfo.expiresAt;
                  cr.isExtendedStay = true;
                  cr.extendedUntil = novaSaida;
                  cr.adminNote = `⏳ Prorrogação em Pré-Reserva aguardando pagamento até ${expiraEmHoraBr} (Não realizar limpeza de check-out por enquanto).`;
                }
              }
            }
          }

          targetRes.updatedAt = nowIso;
          if (typeof context.runtime?.saveDatabase === 'function') {
            await context.runtime.saveDatabase();
          }
          if (diferencaValor > 0) {
            const triggerFn = (context.runtime as any)?.triggerImmediateWhatsApp || (globalThis as any).triggerImmediateWhatsApp;
            if (typeof triggerFn === 'function') {
              try {
                await triggerFn(db, context.runtime?.saveDatabase, 'additional_daily_pending', targetRes);
              } catch (_) {}
            }
          }
        }
      }

      const qtdHospedes = Number(reserva.quantidade_hospedes || 1);
      const canalLabel = reserva.canal_reserva_nome || reserva.canal_reserva || 'Site CorpFlats';
      const msg =
        diferencaValor > 0
          ? `Confirme com cordialidade que o período adicional da reserva ${reserva.id} no ${reserva.nome_imovel} (${novaEntrada} a ${novaSaida}, ${novasDiarias} diária(s)) entrou como *Pré-Reserva da Diária Extra* garantida por *30 minutos*${expiraEmHoraBr ? ` (até as *${expiraEmHoraBr}*)` : ''} aguardando o pagamento de *R$ ${diferencaValor.toFixed(2)}*. ` +
            `Tranquilize o hóspede informando que caso o pagamento não seja concluído dentro do prazo, apenas a(s) diária(s) extra(s) expira(m) e a reserva original permanece 100% confirmada, mantendo no resumo o Total de Hóspedes (*${qtdHospedes}*) e o Canal da Reserva (*${canalLabel}*).`
          : `Confirme com cordialidade que a reserva ${reserva.id} no ${reserva.nome_imovel} já foi atualizada no sistema para o novo período de ${novaEntrada} a ${novaSaida} (${novasDiarias} diária(s)), ` +
            `mantendo no resumo o Total de Hóspedes (*${qtdHospedes}*) e o Canal da Reserva (*${canalLabel}*).`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          reserva_id: reserva.id,
          nova_data_checkin: novaEntrada,
          nova_data_checkout: novaSaida,
          novas_diarias: novasDiarias,
          quantidade_hospedes: qtdHospedes,
          canal_reserva: canalLabel,
          diferenca_valor: diferencaValor,
          ...(expiraEmIso ? { pre_reserva_diaria_extra_expira_em: expiraEmIso } : {}),
        },
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    } catch (error: any) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'MEDIA',
        categoria: 'ERRO_SISTEMA_TOOL',
        hospede_nome: context.hospede?.nome || 'Desconhecido',
        telefone: context.telefone_remetente,
        resumo: `Falha técnica ao executar alterar_datas_reserva (${args.nova_data_checkin} a ${args.nova_data_checkout}): ${error.message}`,
        context,
      });

      const msg =
        'Peça desculpas ao hóspede informando que o sistema apresentou uma instabilidade ao gravar a mudança de datas, ' +
        'mas que você já acionou a gerência no WhatsApp para concluírem a alteração manualmente em instantes.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

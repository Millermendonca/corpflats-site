// src/agent/tools/ofertar-domingo-sem-pressa.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import { notifyAdminWhatsApp } from '../services/admin-notifier';

export interface OfertarDomingoSemPressaArgs {
  confirmacao_hospede: boolean;
}

function generateStaticPix(amount: number, txid: string): string {
  const formatTag = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;
  let payload = formatTag('00', '01');
  payload += formatTag('26', `${formatTag('00', 'br.gov.bcb.pix')}${formatTag('01', '47964813000165')}`);
  payload += formatTag('52', '0000');
  payload += formatTag('53', '986');
  if (amount > 0) {
    payload += formatTag('54', amount.toFixed(2));
  }
  payload += formatTag('58', 'BR');
  payload += formatTag('59', 'CORPFLATS LTDA');
  payload += formatTag('60', 'CAMPOS');
  payload += formatTag('62', formatTag('05', txid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || '***'));
  const toCrc = `${payload}6304`;

  // CRC-16-CCITT
  let crc = 0xffff;
  for (let i = 0; i < toCrc.length; i++) {
    crc ^= toCrc.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) crc = ((crc << 1) ^ 0x1021) & 0xffff;
      else crc = (crc << 1) & 0xffff;
    }
  }
  return `${toCrc}${crc.toString(16).toUpperCase().padStart(4, '0')}`;
}

export const ofertarDomingoSemPressaTool: AgentToolDefinition<OfertarDomingoSemPressaArgs> = {
  name: 'ofertar_domingo_sem_pressa',

  description:
    'Verifica a disponibilidade de domingo para segunda-feira e aplica ou revalida a "Oferta de Domingo Sem Pressa" ' +
    '(check-out 100% livre no domingo + pernoite bônus até segunda-feira às 12:00h por valor promocional fixo). ' +
    'Deve ser chamada sempre que um hóspede com check-out no domingo perguntar sobre a oferta recebida, pedir novo código PIX ' +
    'após o vencimento do prazo inicial de 30 minutos ou solicitar a extensão promocional do domingo.',

  allowedStates: ['IN_STAY_CONCIERGE'],

  parametersSchema: {
    type: 'object',
    properties: {
      confirmacao_hospede: {
        type: 'boolean',
        description:
          'Passe FALSE primeiro para apenas consultar a disponibilidade atual no sistema e simular valores e benefícios. ' +
          'Passe TRUE somente quando o hóspede confirmar explicitamente que deseja a oferta e solicitar o PIX para pagamento.',
      },
    },
    required: ['confirmacao_hospede'],
  },

  async execute(
    args: OfertarDomingoSemPressaArgs,
    context: ContextoSessaoInjetado
  ): Promise<AgentToolResponse> {
    try {
      // TRAVA 0: Validação de segurança do contexto (Zero-Ask)
      const reserva = context.reserva_ativa || context.reserva_atual;
      if (!reserva) {
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
          instrucao_para_ia:
            'Explique educadamente que você não localizou uma reserva ativa em estadia vinculada a este número de telefone e solicite o código da reserva.',
        };
      }

      const checkoutDateStr = String(reserva.data_checkout || '').slice(0, 10);
      const [ano, mes, dia] = checkoutDateStr.split('-').map(Number);
      const dtCheckout = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
      const diaSemana = dtCheckout.getUTCDay(); // 0 = Domingo

      // TRAVA 1: A reserva original precisa ter check-out no domingo
      if (diaSemana !== 0) {
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'CHECKOUT_NAO_E_DOMINGO',
          instrucao_para_ia:
            `Informe ao hóspede com gentileza que a "Oferta de Domingo Sem Pressa" é exclusiva para reservas com check-out agendado para o domingo ` +
            `(sua data de saída atual é ${checkoutDateStr}). Ofereça consultar as diárias regulares caso ele deseje prorrogar sua estadia.`,
        };
      }

      const db = context.runtime?.db;
      const flatNumber = reserva.nome_imovel.replace(/^Flat\s+/i, '').trim();
      const sundayUpsellSettings = db?.sundayUpsellConfig || db?.automationSettings?.sundayUpsell || {};
      const promotionalPrice = Number(sundayUpsellSettings.sundayUpsellPrice || 90.0);

      const targetRes = Array.isArray(db?.reservations)
        ? db.reservations.find((r: any) => {
            const rCode = String(r?.code || r?.reservationCode || r?.id || '');
            return rCode === reserva.id || (r.id != null && String(r.id) === String(reserva.id));
          })
        : null;

      const normalRate = Number(targetRes?.dailyRate || (targetRes?.totalAmount && targetRes?.numNights ? targetRes.totalAmount / targetRes.numNights : 250.0));
      const economia = Math.max(0, normalRate - promotionalPrice);

      // Data de saída estendida: Segunda-feira
      const dtSegunda = new Date(dtCheckout.getTime() + 24 * 3600 * 1000);
      const segundaStr = dtSegunda.toISOString().slice(0, 10);

      // TRAVA 2: Verificação de Disponibilidade de Domingo para Segunda
      // 1. Verifica se há outra reserva entrando no mesmo flat no domingo
      const incomingSameDayRes = Array.isArray(db?.reservations)
        ? db.reservations.find((r: any) => {
            if (!r || ['cancelada', 'cancelled', 'no_show', 'expirada'].includes(String(r.status || '').toLowerCase())) return false;
            const rCode = String(r.code || r.reservationCode || r.id || '');
            if (rCode === reserva.id || (r.id != null && String(r.id) === String(reserva.id))) return false;
            const sameFlat =
              String(r.flatNumber || '') === flatNumber ||
              String(r.flatId || '') === String(reserva.imovel_id);
            const sameDayCheckin = String(r.checkinDate || '').slice(0, 10) === checkoutDateStr;
            return sameFlat && sameDayCheckin;
          })
        : null;

      let alternativeFlatForIncoming = null;
      if (incomingSameDayRes) {
        // Há hóspede agendado para o mesmo flat: verifica se há flat vago no condomínio via selectFairShareFlat
        const selectFairShare = (context.runtime as any)?.selectFairShareFlat || (globalThis as any).selectFairShareFlat;
        if (typeof selectFairShare === 'function' && db) {
          const fsResult = selectFairShare(
            db,
            checkoutDateStr,
            String(incomingSameDayRes.checkoutDate || segundaStr).slice(0, 10),
            incomingSameDayRes.id
          );
          if (fsResult?.recommendedFlat && String(fsResult.recommendedFlat.number) !== flatNumber) {
            alternativeFlatForIncoming = fsResult.recommendedFlat;
          } else if (Array.isArray(fsResult?.availableFlats)) {
            alternativeFlatForIncoming = fsResult.availableFlats.find((f: any) => String(f.number) !== flatNumber);
          }
        }

        // Se há hóspede entrando no domingo e o prédio está 100% ocupado (sem flat alternativo)
        if (!alternativeFlatForIncoming) {
          return {
            status: 'BLOQUEADO_PELA_REGRA',
            codigo_regra_bloqueio: 'IMOVEL_INDISPONIVEL_SEM_VAGAS',
            instrucao_para_ia:
              `Explique ao hóspede com muita empatia que você acabou de checar o sistema e, infelizmente, o flat (e todo o condomínio) ` +
              `já está com 100% de ocupação para esta noite de domingo para segunda, com novo hóspede agendado para entrar. ` +
              `Por essa razão, a oferta de saída livre não pode mais ser liberada. Lembre-o de que o check-out permanece às 12:00h e ofereça guardar a bagagem na recepção se precisar.`,
          };
        }
      }

      // TRAVA 3: Simulação vs Efetivação
      if (!args.confirmacao_hospede) {
        return {
          status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
          dados: {
            reserva_id: reserva.id,
            imovel: reserva.nome_imovel,
            data_checkout_atual: checkoutDateStr,
            nova_data_checkout: segundaStr,
            horario_limite_bonus: '12:00',
            valor_promocional: promotionalPrice,
            valor_normal: normalRate,
            economia,
            hold_minutos: 30,
          },
          instrucao_para_ia:
            `Informe ao hóspede com entusiasmo que a Oferta de Domingo Sem Pressa ESTÁ DISPONÍVEL para o ${reserva.nome_imovel}!\n` +
            `Destaque que por apenas R$ ${promotionalPrice.toFixed(2)} (uma economia de R$ ${economia.toFixed(2)} em relação à diária normal de R$ ${normalRate.toFixed(2)}), ` +
            `ele pode aproveitar o domingo sem hora para sair e ganha o pernoite bônus para sair somente na segunda-feira até às 12:00h.\n` +
            `Pergunte se ele confirma o interesse para você gerar o código PIX de R$ ${promotionalPrice.toFixed(2)} com garantia de pré-reserva por 30 minutos.`,
        };
      }

      // 4. EFETIVAÇÃO E GERAÇÃO DO PIX COM NOVO HOLD DE 30 MINUTOS
      const txid = `UPSELL_SUN_${reserva.id || 'RES'}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 35);
      const pixPayload = generateStaticPix(promotionalPrice, txid);
      const now = new Date();
      const holdExpiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

      if (targetRes) {
        targetRes.pendingSundayUpsell = {
          txid,
          pixCopiaECola: pixPayload,
          promotionalPrice,
          normalDailyRate: normalRate,
          originalCheckoutDate: checkoutDateStr,
          targetCheckoutDate: segundaStr,
          originalCheckoutTime: '12:00',
          targetCheckoutTime: '12:00',
          expiresAt: holdExpiresAt,
          createdAt: now.toISOString(),
          status: 'pending_payment',
          isSilentUpsellHold: true,
          incomingReservationId: incomingSameDayRes ? (incomingSameDayRes.code || incomingSameDayRes.id) : null,
          alternateFlatNumber: alternativeFlatForIncoming ? String(alternativeFlatForIncoming.number) : null,
          alternateFlatId: alternativeFlatForIncoming ? alternativeFlatForIncoming.id : null,
        };

        targetRes.pendingModification = {
          status: 'awaiting_payment',
          type: 'sunday_upsell',
          newCheckoutDate: segundaStr,
          newCheckoutTime: '12:00',
          expiresAt: holdExpiresAt,
          isSilentUpsellHold: true,
        };

        targetRes.isSilentUpsellHold = true;
        targetRes.holdExpiresAt = holdExpiresAt;
        targetRes.updatedAt = now.toISOString();

        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }
      }

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          reserva_id: reserva.id,
          valor_promocional: promotionalPrice,
          pix_copia_e_cola: pixPayload,
          txid,
          hold_minutos: 30,
          validade_hold: holdExpiresAt,
          nova_data_checkout: segundaStr,
          horario_checkout_bonus: '12:00',
        },
        instrucao_para_ia:
          `Confirme com entusiasmo que a Oferta de Domingo Sem Pressa foi ativada com pré-reserva garantida por 30 minutos para o ${reserva.nome_imovel}!\n` +
          `Apresente em um parágrafo acolhedor que o check-out fica livre no domingo com extensão para pernoite até segunda às 12:00h.\n` +
          `Informe o valor promocional de R$ ${promotionalPrice.toFixed(2)} e que o pagamento deve ser realizado via PIX em até 30 minutos para confirmação definitiva no sistema.\n` +
          `IMPORTANTE: Envie o código PIX Copia e Cola (${pixPayload}) em um parágrafo isolado para que o hóspede possa copiar com apenas um toque no celular.`,
      };
    } catch (error: any) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'MEDIA',
        categoria: 'ERRO_SISTEMA_TOOL',
        hospede_nome: context.hospede?.nome || 'Desconhecido',
        telefone: context.telefone_remetente,
        resumo: `Falha técnica ao executar ofertar_domingo_sem_pressa: ${error?.message || error}`,
      });

      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia:
          'Peça sinceras desculpas ao hóspede informando que o sistema apresentou uma instabilidade momentânea ao gerar a cobrança, ' +
          'mas que você já notificou a gerência no WhatsApp para enviar o link promocional em instantes.',
      };
    }
  },
};

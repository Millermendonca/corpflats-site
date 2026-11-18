// src/agent/tools/atualizar-dados-hospede.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import { notifyAdminWhatsApp } from '../services/admin-notifier';
import {
  validateGuestEmailAddress,
  updateGuestEmailAndResendRecentPending,
} from '../../../artifacts/api-server/mail-service.mjs';
import {
  updateGuestPhoneAndResendInstructions,
} from '../../../artifacts/api-server/package-reservations-service.mjs';
import {
  sendZapiMessage,
  sendZapiDocument,
  appendMessageToConversation,
  checkZapiPhoneExists,
  dispatchCatchUpGuestRulerMessages,
  scheduleUpcomingReservationTriggers,
  hasPdfAlreadyBeenSentOrInFlight,
  evaluateSelfCheckinEligibility,
} from '../../../artifacts/api-server/zapi-service.mjs';

export interface AtualizarDadosHospedeArgs {
  cpf_cnpj?: string;
  email?: string;
  confirmar_email_atual?: boolean;
  telefone_hospede?: string;
  codigo_reserva_alvo?: string;
  nome_hospede_alvo?: string;
  indice_hospede_alvo?: number;
  horario_previsto_chegada?: string;
  placa_veiculo?: string;
  marca_veiculo?: string;
  modelo_veiculo?: string;
  cor_veiculo?: string;
  nomes_acompanhantes?: string[];
}

function normDigitsSimple(phone?: string | null): string {
  return String(phone || '').replace(/\D+/g, '');
}

function phonesEndMatch(a?: string | null, b?: string | null): boolean {
  const da = normDigitsSimple(a);
  const db = normDigitsSimple(b);
  if (!da || !db || da.length < 8 || db.length < 8) return false;
  return da.endsWith(db.slice(-8)) || db.endsWith(da.slice(-8));
}

function normTextSimple(s?: string | null): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export const atualizarDadosHospedeTool: AgentToolDefinition<AtualizarDadosHospedeArgs> = {
  name: 'atualizar_dados_hospede',

  description:
    'Atualiza os dados cadastrais e operacionais do hóspede ou lead (CPF/CNPJ, e-mail, telefone/WhatsApp de hóspede em pacote ou reserva individual, ' +
    'horário previsto de chegada, placa/marca/modelo/cor do veículo para garagem e nomes de acompanhantes). Quando o e-mail é atualizado, ' +
    'valida o novo endereço no sistema e reenvia automaticamente os e-mails pendentes recentes (não antigos). ' +
    'Quando o Solicitante informar ou corrigir o telefone WhatsApp de um hóspede (especialmente após alertas_telefone_hospede_invalido), ' +
    'valida na Z-API, atualiza o cadastro, reenvia as instruções individuais sem valores e agenda os lembretes da estadia.',

  allowedStates: ['COMERCIAL_VENDAS', 'PRE_CHECKIN', 'IN_STAY_CONCIERGE', 'POS_CHECKOUT'],

  parametersSchema: {
    type: 'object',
    properties: {
      cpf_cnpj: {
        type: 'string',
        description: 'CPF ou CNPJ informado pelo hóspede.',
      },
      email: {
        type: 'string',
        description:
          'Endereço de e-mail correto informado ou confirmado pelo hóspede (inclusive quando ele confirmar a sugestão ou repetir que o e-mail já cadastrado está correto).',
      },
      confirmar_email_atual: {
        type: 'boolean',
        description:
          'Passe TRUE quando houver alerta_email_incorreto ativo e o hóspede informar que o e-mail já cadastrado na reserva está correto ("esse mesmo", "está certo", "já recebi"), mesmo sem redigitar o endereço.',
      },
      telefone_hospede: {
        type: 'string',
        description:
          'Novo número de WhatsApp (com DDD) do hóspede informado pelo Solicitante para correção ou cadastro (ex: "22999887766").',
      },
      codigo_reserva_alvo: {
        type: 'string',
        description:
          'Código da reserva ou número do flat alvo quando o Solicitante gerencia vários flats (ex: "RES-512-0302" ou "512").',
      },
      nome_hospede_alvo: {
        type: 'string',
        description:
          'Nome do hóspede cujo telefone/dados devem ser atualizados quando houver mais de um hóspede no pacote/reserva.',
      },
      indice_hospede_alvo: {
        type: 'number',
        description: 'Índice do hóspede na reserva (1, 2 ou 3) quando especificado.',
      },
      horario_previsto_chegada: {
        type: 'string',
        description: 'Horário previsto de chegada para o check-in no formato HH:MM.',
      },
      placa_veiculo: {
        type: 'string',
        description: 'Placa do veículo caso o hóspede vá utilizar a garagem.',
      },
      marca_veiculo: {
        type: 'string',
        description: 'Marca do veículo (ex: Toyota, Honda, VW).',
      },
      modelo_veiculo: {
        type: 'string',
        description: 'Modelo do veículo (ex: Corolla, Civic, Nivus).',
      },
      cor_veiculo: {
        type: 'string',
        description: 'Cor do veículo (ex: Prata, Preto, Branco).',
      },
      nomes_acompanhantes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Lista com os nomes completos de acompanhantes informados na conversa.',
      },
    },
    required: [],
  },

  async execute(
    args: AtualizarDadosHospedeArgs,
    context: ContextoSessaoInjetado
  ): Promise<AgentToolResponse> {
    try {
      const reserva = context.reserva_ativa || context.reserva_atual;
      const db = context.runtime?.db;
      const camposAtualizados: string[] = [];

      // 0. Correção / atualização de telefone WhatsApp do hóspede (inclusive em outro flat do pacote via Solicitante)
      const rawNewGuestPhone = args.telefone_hospede !== undefined ? String(args.telefone_hospede).trim() : '';
      let phoneUpdateResult: any = null;
      if (rawNewGuestPhone !== '') {
        if (!db || !Array.isArray(db.reservations)) {
          const msgNoDb =
            'Explique educadamente que não localizamos uma reserva ativa vinculada a este número no momento para atualizar o telefone do hóspede.';
          return {
            status: 'BLOQUEADO_PELA_REGRA',
            codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
            instrucao_para_ia: msgNoDb,
            instrucao_resposta_ia: msgNoDb,
          };
        }

        const senderDigits = normDigitsSimple(context.telefone_remetente);
        const nowMsExec = Date.now() + Number((globalThis as any).__simulatedTimeOffsetMs || 0);
        const activeRequesterReservations: any[] = db.reservations.filter((r: any) => {
          if (!r) return false;
          const st = String(r.status || '').toLowerCase().trim();
          if (['cancelada', 'cancelado', 'cancelled', 'expirada', 'expired', 'no_show', 'concluida', 'checked_out'].includes(st)) {
            return false;
          }
          if (r.checkoutCompleted) return false;
          const paySt = String(r.paymentStatus || '').toLowerCase().trim();
          const isPaidIt = ['paid', 'pago', 'pago_total', 'pago_integralmente', 'confirmado'].includes(paySt);
          const holdExp = r.expiresAt || r.holdExpiresAt;
          if ((st === 'pre_reserva' || st === 'pendente' || r.isPreReservation) && !isPaidIt && holdExp) {
            const expMs = new Date(holdExp).getTime();
            if (Number.isFinite(expMs) && expMs <= nowMsExec) return false;
          }
          const reqCand = r.requesterInfo?.whatsapp || r.requesterInfo?.phone || r.requesterPhone || '';
          const matchesSenderAsReq = Boolean(
            senderDigits &&
            (phonesEndMatch(reqCand, senderDigits) || (r.requesterIsGuest1 && phonesEndMatch(r.guestPhone || r.phone, senderDigits)))
          );
          const matchesSessionRes = reserva ? String(r?.code || r?.reservationCode || r?.id || '') === reserva.id : false;
          return matchesSenderAsReq || matchesSessionRes;
        });

        const pendingCandidates: Array<{
          reservation: any;
          guestIndex: number;
          guestName: string;
          invalidPhone: string;
          code: string;
          flatNumber: string;
        }> = [];
        for (const r of activeRequesterReservations) {
          const reqList: any[] = Array.isArray(r.guestPhoneCorrectionRequests) ? r.guestPhoneCorrectionRequests : [];
          for (const reqItem of reqList) {
            if (!reqItem || reqItem.status !== 'awaiting_reply') continue;
            const gIdx = Math.max(1, Number(reqItem.guestIndex) || 1);
            const gName = String(
              reqItem.guestName ||
              (gIdx === 1 ? r.guestName : r.guests?.[gIdx - 1]?.name) ||
              `Hóspede ${gIdx}`
            ).trim();
            pendingCandidates.push({
              reservation: r,
              guestIndex: gIdx,
              guestName: gName,
              invalidPhone: reqItem.invalidPhone || '',
              code: String(r.code || r.reservationCode || `RES-${r.flatNumber}-${r.id}`),
              flatNumber: String(r.flatNumber || ''),
            });
          }
        }

        const targetCodeFilter = normTextSimple(args.codigo_reserva_alvo).replace(/^flat\s*/i, '');
        const targetNameFilter = normTextSimple(args.nome_hospede_alvo);
        const targetIdxFilter = Number(args.indice_hospede_alvo) > 0 ? Number(args.indice_hospede_alvo) : 0;

        let resolvedTargetRes: any = null;
        let resolvedGuestIndex = 0;
        let resolvedGuestName = '';

        if (pendingCandidates.length > 0) {
          let filtered = pendingCandidates;
          if (targetCodeFilter) {
            const byCode = filtered.filter(
              (c) =>
                normTextSimple(c.code) === targetCodeFilter ||
                normTextSimple(c.flatNumber) === targetCodeFilter ||
                normTextSimple(c.code).includes(targetCodeFilter)
            );
            if (byCode.length > 0) filtered = byCode;
          }
          if (targetNameFilter) {
            const byName = filtered.filter((c) => normTextSimple(c.guestName).includes(targetNameFilter));
            if (byName.length > 0) filtered = byName;
          }
          if (targetIdxFilter > 0) {
            const byIdx = filtered.filter((c) => c.guestIndex === targetIdxFilter);
            if (byIdx.length > 0) filtered = byIdx;
          }

          if (filtered.length > 1) {
            const opcoes = filtered.map((c) => `*${c.guestName}* (Flat ${c.flatNumber} • ${c.code})`).join(', ');
            const msgAmbig =
              `Explique com cordialidade ao solicitante que há mais de um hóspede aguardando correção de WhatsApp (${opcoes}) ` +
              `e pergunte exatamente a qual hóspede ou flat este novo número (${rawNewGuestPhone}) pertence antes de gravar.`;
            return {
              status: 'BLOQUEADO_PELA_REGRA',
              codigo_regra_bloqueio: 'AMBIGUIDADE_HOSPEDE_PENDENTE',
              dados: {
                opcoes_pendentes: filtered.map((c) => ({
                  codigo_reserva: c.code,
                  flat: c.flatNumber,
                  indice_hospede: c.guestIndex,
                  nome_hospede: c.guestName,
                  telefone_invalido: c.invalidPhone,
                })),
              },
              instrucao_para_ia: msgAmbig,
              instrucao_resposta_ia: msgAmbig,
            };
          }

          if (filtered.length === 1) {
            resolvedTargetRes = filtered[0].reservation;
            resolvedGuestIndex = filtered[0].guestIndex;
            resolvedGuestName = filtered[0].guestName;
          }
        }

        if (!resolvedTargetRes) {
          let resPool = activeRequesterReservations;
          if (targetCodeFilter) {
            const byCodeRes = resPool.filter((r) => {
              const rc = normTextSimple(r.code || r.reservationCode || '');
              const rf = normTextSimple(r.flatNumber || '');
              return rc === targetCodeFilter || rf === targetCodeFilter || rc.includes(targetCodeFilter);
            });
            if (byCodeRes.length > 0) resPool = byCodeRes;
          }

          if (targetNameFilter) {
            const nameMatches: Array<{ r: any; idx: number; nm: string }> = [];
            for (const r of resPool) {
              const gArr = Array.isArray(r.guests) ? r.guests : [];
              const maxG = Math.max(1, gArr.length);
              for (let idx = 1; idx <= Math.min(3, maxG); idx++) {
                const nm = idx === 1 ? (r.guestName || gArr[0]?.name || '') : (gArr[idx - 1]?.name || '');
                if (nm && normTextSimple(nm).includes(targetNameFilter)) {
                  nameMatches.push({ r, idx, nm: String(nm).trim() });
                }
              }
            }
            if (nameMatches.length > 1) {
              const opcoesN = nameMatches.map((m) => `*${m.nm}* (Flat ${m.r.flatNumber} • ${m.r.code})`).join(', ');
              const msgAmbigName =
                `Pergunte educadamente a qual reserva/flat este número pertence, pois encontramos mais de um hóspede compatível: ${opcoesN}.`;
              return {
                status: 'BLOQUEADO_PELA_REGRA',
                codigo_regra_bloqueio: 'AMBIGUIDADE_HOSPEDE_PENDENTE',
                instrucao_para_ia: msgAmbigName,
                instrucao_resposta_ia: msgAmbigName,
              };
            }
            if (nameMatches.length === 1) {
              resolvedTargetRes = nameMatches[0].r;
              resolvedGuestIndex = nameMatches[0].idx;
              resolvedGuestName = nameMatches[0].nm;
            }
          }

          if (!resolvedTargetRes) {
            if (resPool.length > 1 && !targetCodeFilter) {
              const flatsListStr = resPool.map((r) => `Flat ${r.flatNumber} (${r.code} - ${r.guestName || 'A definir'})`).join(', ');
              const msgAmbigRes =
                `Explique educadamente que você localizou mais de um flat ativo vinculado a este solicitante (${flatsListStr}) e peça para confirmar o número do flat ou nome do hóspede antes de atualizar o telefone.`;
              return {
                status: 'BLOQUEADO_PELA_REGRA',
                codigo_regra_bloqueio: 'AMBIGUIDADE_RESERVA_ALVO',
                instrucao_para_ia: msgAmbigRes,
                instrucao_resposta_ia: msgAmbigRes,
              };
            }
            resolvedTargetRes = resPool[0] || (reserva ? db.reservations.find((r: any) => String(r?.code || r?.reservationCode || r?.id || '') === reserva.id) : null);
            resolvedGuestIndex = targetIdxFilter || 1;
            resolvedGuestName = resolvedTargetRes
              ? String(
                  resolvedGuestIndex === 1
                    ? (resolvedTargetRes.guestName || resolvedTargetRes.guests?.[0]?.name || '')
                    : (resolvedTargetRes.guests?.[resolvedGuestIndex - 1]?.name || '')
                ).trim()
              : '';
          }
        }

        if (!resolvedTargetRes) {
          const msgNoTarget =
            'Explique educadamente que não localizamos uma reserva ativa correspondente para atualizar o WhatsApp do hóspede e peça o código da reserva ou número do flat.';
          return {
            status: 'BLOQUEADO_PELA_REGRA',
            codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
            instrucao_para_ia: msgNoTarget,
            instrucao_resposta_ia: msgNoTarget,
          };
        }

        const procEnv = (globalThis as any).process?.env;
        const baseUrlPhone = String(
          db?.settings?.baseUrl || procEnv?.APP_BASE_URL || procEnv?.SERVER_BASE_URL || 'https://corpflats.com.br'
        ).replace(/\/+$/, '');

        const rawRtSend = context.runtime?.sendZapiMessage;
        const sendZapiAdapter = typeof rawRtSend === 'function'
          ? (rawRtSend === (sendZapiMessage as any)
              ? sendZapiMessage
              : async (cfg: any, payload: any) => {
                  if (rawRtSend.length >= 3 && payload && typeof payload === 'object') {
                    return await rawRtSend(payload.phone, payload.message, payload);
                  }
                  return await (rawRtSend as any)(cfg, payload);
                })
          : sendZapiMessage;

        phoneUpdateResult = await updateGuestPhoneAndResendInstructions(
          db,
          {
            reservation: resolvedTargetRes,
            guestIndex: resolvedGuestIndex || 1,
            guestName: resolvedGuestName || undefined,
            newPhone: rawNewGuestPhone,
            baseUrl: baseUrlPhone,
            actor: { name: 'Sofia IA', role: 'system', type: 'ai' },
            source: 'WhatsApp Sofia IA',
          },
          {
            saveDatabase: context.runtime?.saveDatabase as any,
            sendZapiMessage: sendZapiAdapter,
            ...(rawRtSend === (sendZapiMessage as any) || !rawRtSend
              ? { sendZapiDocument }
              : {}),
            hasPdfAlreadyBeenSentOrInFlight,
            evaluateSelfCheckinEligibility,
            checkZapiPhoneExists: context.runtime?.checkZapiPhoneExists || (globalThis as any).__corpflatsCheckZapiPhoneExists || checkZapiPhoneExists,
            appendMessageToConversation: context.runtime?.appendMessageToConversation || appendMessageToConversation,
            createNotification: context.runtime?.createNotification || (globalThis as any).__corpflatsCreateNotification,
            dispatchCatchUpGuestRulerMessages: context.runtime?.dispatchCatchUpGuestRulerMessages || dispatchCatchUpGuestRulerMessages,
            scheduleUpcomingReservationTriggers: context.runtime?.scheduleUpcomingReservationTriggers || scheduleUpcomingReservationTriggers,
            suppressExternalSend: Boolean(context.runtime?.suppressExternalSend),
          } as any
        );

        if (!phoneUpdateResult.ok) {
          const msgPhoneErr = phoneUpdateResult.invalidWhatsApp
            ? `Explique com cordialidade que o sistema validou o número informado (${rawNewGuestPhone}), mas ele também não possui conta ativa no WhatsApp (ou está incompleto). Por segurança, nada foi alterado — peça por favor outro número de WhatsApp válido (com DDD) para o hóspede${resolvedGuestName ? ` *${resolvedGuestName}*` : ''}.`
            : `Explique educadamente que não foi possível atualizar o telefone agora (${phoneUpdateResult.error || 'erro de validação'}).`;
          return {
            status: 'BLOQUEADO_PELA_REGRA',
            codigo_regra_bloqueio: phoneUpdateResult.code || 'TELEFONE_SEM_WHATSAPP',
            dados: {
              telefone_informado: rawNewGuestPhone,
              motivo: phoneUpdateResult.error || null,
            },
            instrucao_para_ia: msgPhoneErr,
            instrucao_resposta_ia: msgPhoneErr,
          };
        }

        camposAtualizados.push(
          `WhatsApp de ${phoneUpdateResult.guestName} (Flat ${phoneUpdateResult.flatNumber}): ${phoneUpdateResult.newPhone}`
        );
      }

      let validatedEmail = '';
      const fallbackCurrentEmail =
        args.confirmar_email_atual === true && (!args.email || String(args.email).trim() === '')
          ? String(
              reserva?.alerta_email_incorreto?.email_invalido ||
                reserva?.email_cadastrado ||
                ''
            ).trim()
          : '';
      const rawCandidateEmail =
        args.email !== undefined && String(args.email).trim() !== ''
          ? String(args.email).trim()
          : fallbackCurrentEmail;

      if (rawCandidateEmail !== '') {
        const emailValidation = await validateGuestEmailAddress(rawCandidateEmail, {
          checkDns: true,
          stripTrailingPunctuation: true,
        });
        if (!emailValidation.valid) {
          const sugestaoMsg = emailValidation.suggestedEmail
            ? ` Pergunte de forma gentil se o endereço correto seria *${emailValidation.suggestedEmail}*.`
            : ' Peça por gentileza que ele confira a digitação e envie o e-mail completo novamente.';
          const msgInvalido =
            `Explique educadamente ao hóspede que o sistema verificou o endereço "${rawCandidateEmail}" e identificou um erro (${emailValidation.message}). ` +
            `Por segurança, a alteração ainda não foi gravada.${sugestaoMsg}`;
          return {
            status: 'BLOQUEADO_PELA_REGRA',
            codigo_regra_bloqueio: 'EMAIL_INVALIDO',
            dados: {
              email_informado: rawCandidateEmail,
              motivo: emailValidation.message,
              email_sugerido: emailValidation.suggestedEmail || null,
            },
            instrucao_para_ia: msgInvalido,
            instrucao_resposta_ia: msgInvalido,
          };
        }
        validatedEmail = emailValidation.normalizedEmail;
      }

      if (!reserva && !phoneUpdateResult) {
        const msg =
          'Explique educadamente que não localizamos uma reserva ativa vinculada a este número para atualizar os dados e peça o código da reserva.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      if (args.cpf_cnpj) camposAtualizados.push(`CPF/CNPJ: ${args.cpf_cnpj}`);
      if (validatedEmail) camposAtualizados.push(`E-mail: ${validatedEmail}`);
      if (args.horario_previsto_chegada)
        camposAtualizados.push(`Horário previsto de chegada: ${args.horario_previsto_chegada}`);
      if (args.placa_veiculo) camposAtualizados.push(`Placa do veículo: ${args.placa_veiculo}`);
      if (Array.isArray(args.nomes_acompanhantes) && args.nomes_acompanhantes.length > 0) {
        camposAtualizados.push(`Acompanhantes: ${args.nomes_acompanhantes.join(', ')}`);
      }

      if (camposAtualizados.length === 0) {
        const msg =
          'Pergunte educadamente ao hóspede qual informação ele gostaria de cadastrar ou atualizar na reserva (ex: e-mail, telefone WhatsApp do hóspede, horário de chegada, CPF, placa do carro ou nome de acompanhante).';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'NENHUM_CAMPO_INFORMADO',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      let emailResendSummary: any = null;

      if (reserva && Array.isArray(db?.reservations)) {
        const targetRes = db.reservations.find(
          (r: any) => String(r?.code || r?.reservationCode || r?.id || '') === reserva.id
        );
        if (targetRes) {
          if (args.cpf_cnpj) targetRes.guestCpf = String(args.cpf_cnpj).replace(/\D+/g, '');
          if (args.horario_previsto_chegada)
            targetRes.estimatedArrivalTime = args.horario_previsto_chegada;
          if (args.placa_veiculo) targetRes.vehiclePlate = args.placa_veiculo.toUpperCase();
          if (Array.isArray(args.nomes_acompanhantes) && args.nomes_acompanhantes.length > 0) {
            targetRes.companions = args.nomes_acompanhantes;
          }

          if (validatedEmail) {
            const guestIdx = Number(targetRes.emailCorrectionRequest?.guestIndex) || 1;
            emailResendSummary = await updateGuestEmailAndResendRecentPending({
              db,
              saveDatabase: context.runtime?.saveDatabase as any,
              reservation: targetRes,
              guestIndex: guestIdx,
              newEmail: validatedEmail,
              maxAgeHours: 72,
            });
          } else {
            targetRes.updatedAt = new Date().toISOString();
            if (typeof context.runtime?.saveDatabase === 'function') {
              await context.runtime.saveDatabase();
            }
          }
        }
      }

      const detalheTelefone = phoneUpdateResult
        ? ` Confirme ao solicitante que o WhatsApp de *${phoneUpdateResult.guestName}* (Flat *${phoneUpdateResult.flatNumber}*, reserva *${phoneUpdateResult.reservationCode}*) foi atualizado para *${phoneUpdateResult.newPhone}*` +
          (phoneUpdateResult.whatsappDispatched
            ? ` e as instruções de check-in (sem valores financeiros) já foram enviadas imediatamente para esse novo número!`
            : ` no sistema!`)
        : '';

      let detalheEmail = '';
      if (validatedEmail && emailResendSummary) {
        if (emailResendSummary.sameEmailConfirmed) {
          detalheEmail =
            ` Peça desculpas gentilmente pelo alarme falso de falha na entrega, agradeça pela confirmação e tranquilize o hóspede informando que o e-mail *${validatedEmail}* está confirmado como válido e ativo no sistema` +
            (emailResendSummary.resentCount > 0
              ? `, e que ${emailResendSummary.resentCount} mensagem(ns) retida(s) (${emailResendSummary.resentSubjects.join(', ')}) já foram liberadas!`
              : `, com o alerta de erro já removido da reserva!`);
        } else if (emailResendSummary.resentCount > 0) {
          detalheEmail =
            ` Informe também que ${emailResendSummary.resentCount} e-mail(s) pendente(s) recente(s) ` +
            `(${emailResendSummary.resentSubjects.join(', ')}) já foram reenviados agora mesmo para *${validatedEmail}*!`;
        } else if (emailResendSummary.skippedTooOldCount > 0) {
          detalheEmail =
            ` Informe que os próximos avisos seguirão normalmente para *${validatedEmail}* (mensagens antigas anteriores não foram reenviadas por já terem passado do prazo).`;
        } else if (emailResendSummary.updatedScheduledCount > 0) {
          detalheEmail =
            ` Informe que as próximas comunicações programadas da estadia já estão direcionadas para *${validatedEmail}*.`;
        }
      }

      const refResLabel = phoneUpdateResult
        ? `*${phoneUpdateResult.reservationCode}* (Flat ${phoneUpdateResult.flatNumber})`
        : `*${reserva?.id}* (${reserva?.nome_imovel})`;

      const msg =
        phoneUpdateResult && camposAtualizados.length === 1
          ? `${detalheTelefone.trim()}`
          : emailResendSummary?.sameEmailConfirmed && camposAtualizados.length === 1 && validatedEmail
            ? `Confirme com muita cordialidade na reserva ${refResLabel}:${detalheEmail}`
            : `Confirme com cordialidade que os dados da reserva ${refResLabel} foram atualizados no sistema: ` +
              `${camposAtualizados.join(' | ')}.${detalheTelefone}${detalheEmail}`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          reserva_id: phoneUpdateResult?.reservationCode || reserva?.id,
          campos_atualizados: camposAtualizados,
          ...(phoneUpdateResult
            ? {
                telefone_hospede_atualizado: phoneUpdateResult.newPhone,
                hospede_atualizado: phoneUpdateResult.guestName,
                flat_atualizado: phoneUpdateResult.flatNumber,
                instrucoes_reenviadas: Boolean(phoneUpdateResult.whatsappDispatched),
              }
            : {}),
          email_atualizado: validatedEmail || undefined,
          email_confirmado_sem_alteracao: Boolean(emailResendSummary?.sameEmailConfirmed),
          emails_pendentes_reenviados: emailResendSummary?.resentCount ?? 0,
          assuntos_reenviados: emailResendSummary?.resentSubjects ?? [],
          agendamentos_atualizados: emailResendSummary?.updatedScheduledCount ?? 0,
          antigos_ignorados: emailResendSummary?.skippedTooOldCount ?? 0,
        },
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    } catch (error: any) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'BAIXA',
        categoria: 'ERRO_SISTEMA_TOOL',
        hospede_nome: context.hospede?.nome || 'Hóspede',
        telefone: context.telefone_remetente,
        resumo: `Falha técnica ao executar atualizar_dados_hospede: ${error.message}`,
        context,
      });

      const msg =
        'Informe ao hóspede que você já anotou as informações e encaminhou para a recepção vincular manualmente à ficha da reserva.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

// src/agent/tools/atualizar-dados-hospede.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import { notifyAdminWhatsApp } from '../services/admin-notifier';
import {
  validateGuestEmailAddress,
  updateGuestEmailAndResendRecentPending,
} from '../../../artifacts/api-server/mail-service.mjs';

export interface AtualizarDadosHospedeArgs {
  cpf_cnpj?: string;
  email?: string;
  confirmar_email_atual?: boolean;
  horario_previsto_chegada?: string;
  placa_veiculo?: string;
  marca_veiculo?: string;
  modelo_veiculo?: string;
  cor_veiculo?: string;
  nomes_acompanhantes?: string[];
}

export const atualizarDadosHospedeTool: AgentToolDefinition<AtualizarDadosHospedeArgs> = {
  name: 'atualizar_dados_hospede',

  description:
    'Atualiza os dados cadastrais e operacionais do hóspede ou lead (CPF/CNPJ, e-mail, horário previsto de chegada, ' +
    'placa/marca/modelo/cor do veículo para garagem e nomes de acompanhantes). Quando o e-mail é atualizado, ' +
    'valida o novo endereço no sistema e reenvia automaticamente os e-mails pendentes recentes (não antigos).',

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

      if (!reserva) {
        const msg =
          'Explique educadamente que não localizamos uma reserva ativa vinculada a este número para atualizar os dados e peça o código da reserva.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const camposAtualizados: string[] = [];
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
          'Pergunte educadamente ao hóspede qual informação ele gostaria de cadastrar ou atualizar na reserva (ex: e-mail, horário de chegada, CPF, placa do carro ou nome de acompanhante).';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'NENHUM_CAMPO_INFORMADO',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      let emailResendSummary: any = null;

      if (Array.isArray(db?.reservations)) {
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
              saveDatabase: context.runtime?.saveDatabase,
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

      const msg =
        emailResendSummary?.sameEmailConfirmed && camposAtualizados.length === 1 && validatedEmail
          ? `Confirme com muita cordialidade na reserva *${reserva.id}* (${reserva.nome_imovel}):${detalheEmail}`
          : `Confirme com cordialidade que os dados da reserva *${reserva.id}* (${reserva.nome_imovel}) foram atualizados no sistema: ` +
            `${camposAtualizados.join(' | ')}.${detalheEmail}`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          reserva_id: reserva.id,
          campos_atualizados: camposAtualizados,
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

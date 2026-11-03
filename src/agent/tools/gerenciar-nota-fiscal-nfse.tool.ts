// src/agent/tools/gerenciar-nota-fiscal-nfse.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import { notifyAdminWhatsApp } from '../services/admin-notifier';

export interface GerenciarNotaFiscalNfseArgs {
  acao:
    | 'CONSULTAR_OU_INICIAR_CONFERENCIA'
    | 'ATUALIZAR_DADOS_NOTA'
    | 'CONFIRMAR_DADOS_NOTA'
    | 'CANCELAR_CONFERENCIA'
    | 'SOLICITAR_RECIBO_COMPROVANTE';
  tomador_nome?: string;
  tomador_cpf_cnpj?: string;
  tomador_email?: string;
  tomador_endereco?: string;
  hospedes_na_descricao?: string[];
  observacao_adicional_descricao?: string;
  descricao_servico_completa?: string;
  novo_valor_solicitado?: number;
}

function diffDays(dateA: string, dateB: string): number {
  const a = new Date(`${dateA}T00:00:00Z`).getTime();
  const b = new Date(`${dateB}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  return Math.max(1, Math.round((b - a) / (1000 * 60 * 60 * 24)));
}

function formatGuestListPtBr(names: string[]): string {
  const clean = names.map((n) => String(n || '').trim()).filter(Boolean);
  if (clean.length === 0) return 'Hóspede';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} e ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')} e ${clean[clean.length - 1]}`;
}

export function buildStandardStayDescription(params: {
  guestNames: string[];
  flatNumber: string;
  checkinDate: string;
  checkoutDate: string;
  extraNotes?: string;
}): string {
  const diarias = diffDays(params.checkinDate, params.checkoutDate);
  const hospedesStr = formatGuestListPtBr(params.guestNames);
  const lines = [
    `Nota relativa à hospedagem de ${hospedesStr}, no Flat ${params.flatNumber}.`,
    `Local: CorpFlats.`,
    `Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ (Soho Residence Service)`,
    `Quantidade de diárias: ${diarias}`,
    `Check-in: ${params.checkinDate}`,
    `Check-out: ${params.checkoutDate}`,
  ];
  if (params.extraNotes && params.extraNotes.trim()) {
    lines.push(params.extraNotes.trim());
  }
  return lines.join('\n');
}

export const gerenciarNotaFiscalNfseTool: AgentToolDefinition<GerenciarNotaFiscalNfseArgs> = {
  name: 'gerenciar_nota_fiscal_nfse',

  description:
    'Gerencia a conferência, personalização (tomador, CPF/CNPJ, endereço, e-mail, inclusão/remoção de hóspedes acompanhantes na descrição ' +
    'ou observações livres na discriminação dos serviços) e confirmação para emissão automática da Nota Fiscal (NFS-e) da reserva ativa.',

  allowedStates: ['PRE_CHECKIN', 'IN_STAY_CONCIERGE'],

  parametersSchema: {
    type: 'object',
    properties: {
      acao: {
        type: 'string',
        enum: [
          'CONSULTAR_OU_INICIAR_CONFERENCIA',
          'ATUALIZAR_DADOS_NOTA',
          'CONFIRMAR_DADOS_NOTA',
          'CANCELAR_CONFERENCIA',
        ],
        description:
          'Ação desejada: CONSULTAR_OU_INICIAR_CONFERENCIA quando o hóspede pede a nota fiscal pela 1ª vez; ' +
          'ATUALIZAR_DADOS_NOTA quando pede para alterar tomador, CPF/CNPJ, e-mail, acrescentar hóspede ou editar a descrição; ' +
          'CONFIRMAR_DADOS_NOTA quando o hóspede confirma que os dados apresentados estão corretos; ' +
          'CANCELAR_CONFERENCIA quando desiste da emissão.',
      },
      tomador_nome: {
        type: 'string',
        description: 'Nome completo ou Razão Social do tomador do serviço (se informado/alterado).',
      },
      tomador_cpf_cnpj: {
        type: 'string',
        description: 'CPF ou CNPJ do tomador do serviço (se informado/alterado).',
      },
      tomador_email: {
        type: 'string',
        description: 'E-mail para recebimento da NFS-e (se informado/alterado).',
      },
      tomador_endereco: {
        type: 'string',
        description: 'Endereço completo do tomador (se informado/alterado).',
      },
      hospedes_na_descricao: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Lista de nomes completos dos hóspedes que devem constar na descrição do serviço (ex: ["Miller Mendonça Pessanha", "Thamiris Maiara Santos Da Silva"]).',
      },
      observacao_adicional_descricao: {
        type: 'string',
        description:
          'Observação extra solicitada pelo hóspede para incluir na discriminação dos serviços (ex: centro de custo, número de pedido, reembolso).',
      },
      descricao_servico_completa: {
        type: 'string',
        description: 'Substituição completa da descrição do serviço somente se o hóspede exigir uma redação inteira própria.',
      },
      novo_valor_solicitado: {
        type: 'number',
        description: 'Preencha APENAS se o hóspede pedir explicitamente para alterar o valor em reais (R$) da nota fiscal.',
      },
    },
    required: ['acao'],
  },

  async execute(
    args: GerenciarNotaFiscalNfseArgs,
    context: ContextoSessaoInjetado
  ): Promise<AgentToolResponse> {
    try {
      const reserva = context.reserva_ativa || context.reserva_atual;
      if (!reserva) {
        const msg =
          'Explique educadamente que não localizamos uma reserva ativa vinculada a este telefone para emissão de Nota Fiscal e peça o código da reserva ou CPF do titular.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const db = context.runtime?.db;
      const conv = context.runtime?.conversation;
      const flatNumber = reserva.nome_imovel.replace(/^Flat\s+/i, '').trim();

      const targetRes = Array.isArray(db?.reservations)
        ? db.reservations.find(
            (r: any) => String(r?.code || r?.reservationCode || r?.id || '') === reserva.id
          )
        : null;

      if (args.acao === 'CANCELAR_CONFERENCIA') {
        if (conv?.fiscalConferenceState) {
          conv.fiscalConferenceState.status = 'cancelled';
        }
        const msg =
          'Confirme ao hóspede que a solicitação de emissão da nota fiscal foi cancelada e que você segue à disposição caso ele precise futuramente.';
        return {
          status: 'SUCESSO_EXECUTADO',
          dados: { reserva_id: reserva.id, status_nfse: 'CANCELADA_PELO_HOSPEDE' },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const existingState = conv?.fiscalConferenceState || targetRes?.confirmedFiscalData || {};
      const titularPadrao =
        existingState.tomadorNome ||
        targetRes?.guestName ||
        context.hospede?.nome ||
        'Hóspede';
      const valorOriginal = Number(
        existingState.valorOriginal ||
          existingState.valorServico ||
          targetRes?.totalAmount ||
          237.0
      );

      // TRAVA DE VALOR FISCAL: Qualquer alteração no valor monetário exige aprovação do gestor
      if (
        typeof args.novo_valor_solicitado === 'number' &&
        Math.abs(args.novo_valor_solicitado - valorOriginal) > 0.01
      ) {
        await notifyAdminWhatsApp({
          nivel_urgencia: 'MEDIA',
          categoria: 'FINANCEIRO',
          hospede_nome: titularPadrao,
          telefone: context.telefone_remetente,
          imovel: reserva.nome_imovel,
          resumo: `Hóspede solicitou alteração do valor da NFS-e de R$ ${valorOriginal.toFixed(2)} para R$ ${args.novo_valor_solicitado.toFixed(2)} na reserva ${reserva.id}.`,
          context,
        });

        const msg =
          `Explique ao hóspede com cordialidade que, por conformidade contábil e segurança fiscal, qualquer alteração no valor original da hospedagem ` +
          `(de R$ ${valorOriginal.toFixed(2)} para R$ ${args.novo_valor_solicitado.toFixed(2)}) exige autorização da gerência. ` +
          `Avise que você já enviou um alerta automático para o WhatsApp do gestor aprovar a alteração.`;

        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'ALTERACAO_VALOR_REQUER_APROVACAO_GESTOR',
          dados: {
            valor_original: valorOriginal,
            novo_valor_solicitado: args.novo_valor_solicitado,
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const listaHospedes =
        Array.isArray(args.hospedes_na_descricao) && args.hospedes_na_descricao.length > 0
          ? args.hospedes_na_descricao
          : existingState.hospedesLista || [targetRes?.guestName || context.hospede?.nome || titularPadrao];

      const novaDescricao =
        args.descricao_servico_completa ||
        (Array.isArray(args.hospedes_na_descricao) ||
        args.observacao_adicional_descricao ||
        !existingState.descricaoServico
          ? buildStandardStayDescription({
              guestNames: listaHospedes,
              flatNumber,
              checkinDate: reserva.data_checkin,
              checkoutDate: reserva.data_checkout,
              extraNotes: args.observacao_adicional_descricao,
            })
          : existingState.descricaoServico);

      const updatedState = {
        ...existingState,
        status:
          args.acao === 'CONFIRMAR_DADOS_NOTA'
            ? 'scheduled_for_checkout'
            : 'awaiting_confirmation',
        reservationId: targetRes?.id || reserva.id,
        reservationCode: reserva.id,
        flatNumber,
        tomadorNome: args.tomador_nome || existingState.tomadorNome || titularPadrao,
        tomadorCpfCnpj:
          args.tomador_cpf_cnpj ||
          existingState.tomadorCpfCnpj ||
          targetRes?.guestCpf ||
          'Não informado',
        tomadorEmail:
          args.tomador_email ||
          existingState.tomadorEmail ||
          targetRes?.guestEmail ||
          'Não informado',
        tomadorEndereco:
          args.tomador_endereco ||
          existingState.tomadorEndereco ||
          targetRes?.guestAddress ||
          'Endereço cadastrado',
        hospedesLista: listaHospedes,
        descricaoServico: novaDescricao,
        valorOriginal,
        valorServico: valorOriginal,
        updatedAt: new Date().toISOString(),
      };

      if (conv) {
        conv.fiscalConferenceState = updatedState;
      }
      if (targetRes) {
        targetRes.confirmedFiscalData = { ...updatedState };
        if (args.acao === 'CONFIRMAR_DADOS_NOTA') {
          targetRes.autoEmitInvoice = true;
        }
        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }
      }

      if (args.acao === 'CONFIRMAR_DADOS_NOTA') {
        const msg =
          `Confirme com entusiasmo que os dados da Nota Fiscal (NFS-e) da reserva *${reserva.id}* foram validados e agendados com sucesso ` +
          `(Tomador: ${updatedState.tomadorNome} | Valor: R$ ${valorOriginal.toFixed(2)}) e que a nota será emitida e enviada automaticamente no check-out.`;
        return {
          status: 'SUCESSO_EXECUTADO',
          dados: updatedState,
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const msg =
        `Apresente ao hóspede o resumo atualizado para conferência da Nota Fiscal (NFS-e):\n` +
        `• *Tomador:* ${updatedState.tomadorNome}\n` +
        `• *CPF/CNPJ:* ${updatedState.tomadorCpfCnpj}\n` +
        `• *Endereço:* ${updatedState.tomadorEndereco}\n` +
        `• *E-mail:* ${updatedState.tomadorEmail}\n` +
        `• *Descrição dos Serviços:*\n${updatedState.descricaoServico}\n` +
        `• *Valor Total:* R$ ${valorOriginal.toFixed(2)}\n` +
        `Pergunte se todos os dados estão corretos e se ele confirma para deixarmos a emissão agendada automaticamente para o check-out.`;

      return {
        status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
        dados: updatedState,
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    } catch (error: any) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'MEDIA',
        categoria: 'FINANCEIRO',
        hospede_nome: context.hospede?.nome || 'Hóspede',
        telefone: context.telefone_remetente,
        resumo: `Falha técnica ao executar gerenciar_nota_fiscal_nfse: ${error.message}`,
        context,
      });

      const msg =
        'Peça desculpas ao hóspede informando que o módulo fiscal apresentou uma instabilidade rápida e que a gerência já foi notificada para processar a nota fiscal.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

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

function normalizePhoneDigits(phone?: string | null): string {
  return String(phone || '').replace(/\D+/g, '');
}

function phonesMatch(phoneA?: string | null, phoneB?: string | null): boolean {
  const a = normalizePhoneDigits(phoneA);
  const b = normalizePhoneDigits(phoneB);
  if (!a || !b || a.length < 8 || b.length < 8) return false;
  return a.endsWith(b.slice(-8)) || b.endsWith(a.slice(-8));
}

function isNonRequesterForTargetRes(targetRes: any, senderPhone?: string | null): boolean {
  if (!targetRes) return false;
  const cleanPhone = normalizePhoneDigits(senderPhone);
  const reqPhoneCandidate =
    targetRes.requesterInfo?.whatsapp ||
    targetRes.requesterInfo?.phone ||
    targetRes.requesterPhone ||
    '';
  const matchesReqPhone = Boolean(cleanPhone && phonesMatch(reqPhoneCandidate, cleanPhone));
  const matchesMainGuestPhone = Boolean(
    cleanPhone &&
      (phonesMatch(targetRes.guestPhone || targetRes.phone, cleanPhone) ||
        (Array.isArray(targetRes.guests) &&
          targetRes.guests[0] &&
          phonesMatch(targetRes.guests[0]?.phone || targetRes.guests[0]?.whatsapp, cleanPhone)))
  );
  const matchedCompanionIdx = Array.isArray(targetRes.guests)
    ? targetRes.guests.findIndex(
        (g: any, idx: number) =>
          (idx >= 1 || Number(g?.index) >= 2 || g?.isMain === false) &&
          phonesMatch(g?.phone || g?.whatsapp, cleanPhone)
      )
    : -1;
  const isCompanionSender = matchedCompanionIdx >= 0 && !matchesReqPhone && !matchesMainGuestPhone;
  const isSenderRequester = Boolean(
    matchesReqPhone || (targetRes.requesterIsGuest1 && !isCompanionSender && matchesMainGuestPhone)
  );
  const isB2bRes =
    String(targetRes.channel || '').toLowerCase().includes('b2b') ||
    Boolean(targetRes.agencyId || targetRes.b2bReservationNumber);
  const isSeparateRequester = Boolean(
    isB2bRes ||
      (targetRes.requesterType && targetRes.requesterType !== 'guest' && !targetRes.requesterIsGuest1) ||
      (reqPhoneCandidate && !phonesMatch(reqPhoneCandidate, targetRes.guestPhone || targetRes.phone || '')) ||
      ((targetRes.packageId || targetRes.packageCode) && !targetRes.requesterIsGuest1)
  );
  return Boolean(isCompanionSender || ((targetRes.hideFinancialForGuest || isSeparateRequester) && !isSenderRequester));
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

function buildConsolidatedPackageStayDescription(params: {
  packageCode: string;
  items: any[];
  extraNotes?: string;
}): string {
  const lines = [
    `Nota consolidada relativa ao Pacote ${params.packageCode} (${params.items.length} flats) na CorpFlats.`,
    `Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ (Soho Residence Service)`,
  ];
  params.items.forEach((r, i) => {
    const ci = String(r.checkinDate || '').slice(0, 10);
    const co = String(r.checkoutDate || '').slice(0, 10);
    const diarias = diffDays(ci, co);
    const gArr = Array.isArray(r.guests) ? r.guests : [];
    const gNames = [
      r.guestName && !/a definir|informar depois|pendente/i.test(String(r.guestName)) ? r.guestName : '',
      ...gArr.slice(1).map((g: any) => (g?.name && !/a definir|informar depois|^h[oó]spede\s*\d*$/i.test(String(g.name)) ? g.name : '')),
    ].filter(Boolean);
    const gStr = gNames.length > 0 ? formatGuestListPtBr(gNames) : 'Hóspede designado';
    lines.push(
      `${i + 1}. Flat ${r.flatNumber} (${r.code || r.id}): ${ci} a ${co} (${diarias} diária(s)) — ${gStr} — R$ ${Number(r.totalAmount || 0).toFixed(2)}`
    );
  });
  if (params.extraNotes && params.extraNotes.trim()) {
    lines.push(params.extraNotes.trim());
  }
  return lines.join('\n');
}

export const gerenciarNotaFiscalNfseTool: AgentToolDefinition<GerenciarNotaFiscalNfseArgs> = {
  name: 'gerenciar_nota_fiscal_nfse',

  description:
    'Gerencia a conferência, personalização (tomador CPF ou CNPJ, endereço, e-mail, inclusão/remoção de hóspedes acompanhantes na descrição ' +
    'ou observações livres na discriminação dos serviços) e confirmação para emissão automática da Nota Fiscal (NFS-e individual ou 1 NFS-e consolidada do pacote multi-flat) da reserva ativa, ' +
    'além de envio do Recibo/Comprovante exclusivamente ao Solicitante.',

  allowedStates: ['PRE_CHECKIN', 'IN_STAY_CONCIERGE', 'POS_CHECKOUT'],

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
          'SOLICITAR_RECIBO_COMPROVANTE',
        ],
        description:
          'Ação desejada: CONSULTAR_OU_INICIAR_CONFERENCIA quando o solicitante pede a nota fiscal pela 1ª vez; ' +
          'ATUALIZAR_DADOS_NOTA quando pede para alterar tomador, CPF/CNPJ, e-mail, acrescentar hóspede ou editar a descrição; ' +
          'CONFIRMAR_DADOS_NOTA quando confirma que os dados apresentados estão corretos; ' +
          'CANCELAR_CONFERENCIA quando desiste da emissão; ' +
          'SOLICITAR_RECIBO_COMPROVANTE quando solicita o comprovante/recibo de pagamento.',
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
      const reservaAny = reserva as any;
      const flatNumber = reserva.nome_imovel.replace(/^Flat\s+/i, '').trim();

      const targetRes = Array.isArray(db?.reservations)
        ? db.reservations.find(
            (r: any) =>
              String(r?.code || r?.reservationCode || r?.id || '') === reserva.id ||
              (reservaAny.raw_id != null && String(r?.id) === String(reservaAny.raw_id))
          )
        : null;

      // TRAVA DE PRIVACIDADE FINANCEIRA: Recibo e NFS-e pertencem exclusivamente ao Solicitante
      const isHiddenFinancial = Boolean(
        reservaAny.ocultar_financeiro === true ||
          isNonRequesterForTargetRes(targetRes, context.telefone_remetente)
      );

      if (isHiddenFinancial) {
        const msgPriv =
          'Explique com muita cordialidade e empatia que, nesta reserva, o recibo/comprovante de pagamento e a emissão da Nota Fiscal (NFS-e) pertencem exclusivamente ao Solicitante responsável pela contratação e não são disponibilizados no atendimento individual do hóspede. Oriente-o a solicitar diretamente ao responsável pela reserva e coloque-se à disposição para qualquer apoio operacional na estadia.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'PRIVACIDADE_FINANCEIRA_EXCLUSIVO_SOLICITANTE',
          instrucao_para_ia: msgPriv,
          instrucao_resposta_ia: msgPriv,
        };
      }

      const procEnv = (globalThis as any).process?.env;
      const baseUrl = String(
        db?.settings?.baseUrl || procEnv?.APP_BASE_URL || procEnv?.SERVER_BASE_URL || 'https://corpflats.com.br'
      ).replace(/\/+$/, '');

      const pkgCode = String(
        reservaAny.pacote_multi_flat?.packageCode ||
          reservaAny.pacote_multi_flat?.codigo_pacote ||
          targetRes?.packageCode ||
          targetRes?.packageId ||
          ''
      ).trim().toUpperCase();

      const pkgActiveItems: any[] = pkgCode && Array.isArray(db?.reservations)
        ? db.reservations.filter((r: any) => {
            if (!r) return false;
            const rPkg = String(r.packageCode || r.packageId || '').trim().toUpperCase();
            if (rPkg !== pkgCode) return false;
            const st = String(r.status || '').toLowerCase().trim();
            return !['cancelada', 'cancelado', 'cancelled', 'expirada', 'expired'].includes(st);
          })
        : [];
      const isConsolidatedPkg = Boolean(pkgCode && (pkgActiveItems.length > 0 || reservaAny.pacote_multi_flat));

      if (args.acao === 'SOLICITAR_RECIBO_COMPROVANTE') {
        const linkComprovante = isConsolidatedPkg
          ? `${baseUrl}/minha-reserva/${encodeURIComponent(pkgCode)}?requester=1`
          : `${baseUrl}/minha-reserva/${encodeURIComponent(reserva.id)}`;
        const msgRecibo = isConsolidatedPkg
          ? `Envie ao solicitante o link oficial do Painel Unificado do Pacote *${pkgCode}* (${linkComprovante}), onde ele pode visualizar e baixar o *Recibo Único Consolidado* de todos os flats e também emitir *1 NFS-e Única Consolidada (CPF ou CNPJ)*.`
          : `Envie ao hóspede o link oficial do Portal do Hóspede (${linkComprovante}) onde ele pode visualizar e baixar imediatamente o *Comprovante de Pagamento / Recibo* oficial da estadia no ${reserva.nome_imovel}. Pergunte também se ele deseja agendar a emissão da Nota Fiscal (NFS-e).`;
        return {
          status: 'SUCESSO_EXECUTADO',
          dados: {
            reserva_id: isConsolidatedPkg ? pkgCode : reserva.id,
            ...(isConsolidatedPkg ? { codigo_pacote: pkgCode, is_pacote_consolidado: true } : {}),
            link_comprovante_pagamento: linkComprovante,
          },
          instrucao_para_ia: msgRecibo,
          instrucao_resposta_ia: msgRecibo,
        };
      }

      if (args.acao === 'CANCELAR_CONFERENCIA') {
        if (conv?.fiscalConferenceState) {
          conv.fiscalConferenceState.status = 'cancelled';
        }
        const msg =
          'Confirme que a solicitação de emissão da nota fiscal foi cancelada e que você segue à disposição caso precise futuramente.';
        return {
          status: 'SUCESSO_EXECUTADO',
          dados: { reserva_id: isConsolidatedPkg ? pkgCode : reserva.id, status_nfse: 'CANCELADA_PELO_HOSPEDE' },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const existingState = conv?.fiscalConferenceState || targetRes?.confirmedFiscalData || {};
      const titularPadrao = isConsolidatedPkg
        ? (existingState.tomadorNome ||
            targetRes?.requesterInfo?.name ||
            targetRes?.requesterName ||
            targetRes?.companyName ||
            context.hospede?.nome ||
            'Solicitante')
        : (existingState.tomadorNome ||
            targetRes?.guestName ||
            context.hospede?.nome ||
            'Hóspede');

      const pkgTotalFromItems = pkgActiveItems.length > 0
        ? Math.round(pkgActiveItems.reduce((acc, r) => acc + (Number(r.totalAmount) || 0), 0) * 100) / 100
        : Number(reservaAny.pacote_multi_flat?.totalAmount || reservaAny.pacote_multi_flat?.valor_total_pacote || 0);

      const valorOriginal = isConsolidatedPkg && pkgTotalFromItems > 0
        ? pkgTotalFromItems
        : Number(
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
          imovel: isConsolidatedPkg ? `Pacote ${pkgCode}` : reserva.nome_imovel,
          resumo: `Solicitante pediu alteração do valor da NFS-e de R$ ${valorOriginal.toFixed(2)} para R$ ${args.novo_valor_solicitado.toFixed(2)} (${isConsolidatedPkg ? pkgCode : reserva.id}).`,
          context,
        });

        const msg =
          `Explique com cordialidade que, por conformidade contábil e segurança fiscal, qualquer alteração no valor original ` +
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
          : existingState.hospedesLista ||
            (isConsolidatedPkg && pkgActiveItems.length > 0
              ? pkgActiveItems
                  .map((r) => String(r.guestName || '').trim())
                  .filter((nm) => nm && !/a definir|informar depois|pendente/i.test(nm))
              : [targetRes?.guestName || context.hospede?.nome || titularPadrao]);

      const novaDescricao =
        args.descricao_servico_completa ||
        (Array.isArray(args.hospedes_na_descricao) ||
        args.observacao_adicional_descricao ||
        !existingState.descricaoServico ||
        (isConsolidatedPkg && !existingState.isPackageConsolidated)
          ? (isConsolidatedPkg && pkgActiveItems.length > 0
              ? buildConsolidatedPackageStayDescription({
                  packageCode: pkgCode,
                  items: pkgActiveItems,
                  extraNotes: args.observacao_adicional_descricao,
                })
              : buildStandardStayDescription({
                  guestNames: listaHospedes,
                  flatNumber,
                  checkinDate: reserva.data_checkin,
                  checkoutDate: reserva.data_checkout,
                  extraNotes: args.observacao_adicional_descricao,
                }))
          : existingState.descricaoServico);

      const resolvedDoc =
        args.tomador_cpf_cnpj ||
        existingState.tomadorCpfCnpj ||
        targetRes?.requesterInfo?.cpf ||
        targetRes?.companyCnpj ||
        targetRes?.agencyCnpj ||
        targetRes?.guestCpf ||
        targetRes?.guestDocument ||
        'Não informado';
      const cleanDocDigits = String(resolvedDoc).replace(/\D+/g, '');
      const tomadorTipo = cleanDocDigits.length === 14 ? 'PJ' : (cleanDocDigits.length === 11 ? 'PF' : undefined);

      const updatedState: Record<string, any> = {
        ...existingState,
        status:
          args.acao === 'CONFIRMAR_DADOS_NOTA'
            ? 'scheduled_for_checkout'
            : 'awaiting_confirmation',
        reservationId: targetRes?.id || reserva.id,
        reservationCode: isConsolidatedPkg ? pkgCode : reserva.id,
        flatNumber,
        ...(isConsolidatedPkg
          ? {
              isPackageConsolidated: true,
              consolidatePackage: true,
              packageCode: pkgCode,
              packageId: pkgCode,
              reservationIds: pkgActiveItems.map((r) => r.id),
              reservationCodes: pkgActiveItems.map((r) => r.code),
            }
          : {}),
        tomadorNome: args.tomador_nome || existingState.tomadorNome || titularPadrao,
        tomadorCpfCnpj: resolvedDoc,
        ...(tomadorTipo ? { tomadorTipo } : {}),
        tomadorEmail:
          args.tomador_email ||
          existingState.tomadorEmail ||
          targetRes?.requesterInfo?.email ||
          targetRes?.requesterEmail ||
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
      if (isConsolidatedPkg && pkgActiveItems.length > 0) {
        for (const r of pkgActiveItems) {
          r.confirmedFiscalData = { ...updatedState };
          r.isConsolidatedInvoice = true;
          r.consolidatePackage = true;
          if (!r.requesterIsGuest1) r.nfHideFromGuest = true;
          if (args.acao === 'CONFIRMAR_DADOS_NOTA' && r.isPackagePrimary) {
            r.autoEmitInvoice = true;
          }
        }
        if (args.acao === 'CONFIRMAR_DADOS_NOTA' && !pkgActiveItems.some((r) => r.autoEmitInvoice)) {
          pkgActiveItems[0].autoEmitInvoice = true;
        }
        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }
      } else if (targetRes) {
        targetRes.confirmedFiscalData = { ...updatedState };
        if (args.acao === 'CONFIRMAR_DADOS_NOTA') {
          targetRes.autoEmitInvoice = true;
        }
        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }
      }

      if (args.acao === 'CONFIRMAR_DADOS_NOTA') {
        const refLabel = isConsolidatedPkg
          ? `1 NFS-e Única Consolidada do pacote *${pkgCode}* (${pkgActiveItems.length || reservaAny.pacote_multi_flat?.quantidade_flats_ativos || 2} flats)`
          : `Nota Fiscal (NFS-e) da reserva *${reserva.id}*`;
        const msg =
          `Confirme com entusiasmo que os dados da ${refLabel} foram validados e agendados com sucesso ` +
          `(Tomador: ${updatedState.tomadorNome} | CPF/CNPJ: ${updatedState.tomadorCpfCnpj} | Valor Total: R$ ${valorOriginal.toFixed(2)}) e que a nota única será emitida e enviada automaticamente ao solicitante.`;
        return {
          status: 'SUCESSO_EXECUTADO',
          dados: updatedState,
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const tituloConferencia = isConsolidatedPkg
        ? `1 NFS-e Única Consolidada do Pacote *${pkgCode}* (suporta CPF ou CNPJ)`
        : `Nota Fiscal (NFS-e) da reserva *${reserva.id}*`;
      const msg =
        `Apresente o resumo atualizado para conferência da ${tituloConferencia}:\n` +
        `• *Tomador:* ${updatedState.tomadorNome}\n` +
        `• *CPF/CNPJ:* ${updatedState.tomadorCpfCnpj}\n` +
        `• *Endereço:* ${updatedState.tomadorEndereco}\n` +
        `• *E-mail:* ${updatedState.tomadorEmail}\n` +
        `• *Descrição dos Serviços:*\n${updatedState.descricaoServico}\n` +
        `• *Valor Total:* R$ ${valorOriginal.toFixed(2)}\n` +
        `Pergunte se todos os dados estão corretos e se confirma para deixarmos a emissão agendada.`;

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

// src/agent/tools/gerar-link-reserva.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import { notifyAdminWhatsApp } from '../services/admin-notifier';

export interface FlatReservaSofiaItem {
  data_checkin?: string;
  data_checkout?: string;
  quantidade_hospedes?: number;
  incluir_cafe?: boolean;
  preferencia_cama?: 'casal' | 'solteiro';
  solicitante_hospeda_aqui?: boolean;
  informar_hospedes_depois?: boolean;
  nome_hospede_1?: string;
  telefone_hospede_1?: string;
  nome_hospede_2?: string;
  telefone_hospede_2?: string;
  placa_veiculo?: string;
  modelo_veiculo?: string;
}

export interface GerarLinkReservaArgs {
  data_checkin: string;
  data_checkout: string;
  nome_hospede?: string;
  reserva_para_terceiro?: boolean;
  nome_solicitante?: string;
  email_solicitante?: string;
  documento_solicitante?: string;
  quantidade_hospedes?: number;
  quantidade_flats?: number;
  incluir_cafe?: boolean;
  preferencia_cama?: 'casal' | 'solteiro' | 'indiferente';
  flats?: FlatReservaSofiaItem[];
  confirmacao_hospede: boolean;
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

export const gerarLinkReservaTool: AgentToolDefinition<GerarLinkReservaArgs> = {
  name: 'gerar_link_reserva',

  description:
    'Gera a pré-reserva de 1 ou múltiplos flats (pacote unificado com 1 único PIX e link único de pagamento para o Solicitante, ' +
    'permitindo datas, café, cama, veículo e Hóspede 1 e 2 independentes por flat ou marcados para "informar depois"). ' +
    'Exige duas etapas: passe confirmacao_hospede=FALSE para simular e confirmar os dados com o cliente, e TRUE após o de acordo dele.',

  allowedStates: ['COMERCIAL_VENDAS', 'PRE_CHECKIN'],

  parametersSchema: {
    type: 'object',
    properties: {
      data_checkin: {
        type: 'string',
        description: 'Data principal de entrada no formato YYYY-MM-DD.',
      },
      data_checkout: {
        type: 'string',
        description: 'Data principal de saída no formato YYYY-MM-DD.',
      },
      nome_hospede: {
        type: 'string',
        description:
          'Nome completo do hóspede titular (quando 1 flat para si) ou do solicitante caso ele também se hospede no Flat 1.',
      },
      reserva_para_terceiro: {
        type: 'boolean',
        description:
          'Passe TRUE quando quem está conversando no WhatsApp (empresa, agência ou terceiro) NÃO vai se hospedar.',
      },
      nome_solicitante: {
        type: 'string',
        description:
          'Nome do solicitante único responsável pelo pagamento do pacote ou reserva para terceiro.',
      },
      email_solicitante: {
        type: 'string',
        description:
          'E-mail opcional do solicitante para envio simultâneo do recibo e links do pacote.',
      },
      documento_solicitante: {
        type: 'string',
        description: 'CPF ou CNPJ opcional do solicitante (permite emissão posterior de 1 NFS-e única).',
      },
      quantidade_hospedes: {
        type: 'number',
        description: 'Quantidade de hóspedes (no flat único, ou total do grupo se quantidade_flats > 1).',
      },
      quantidade_flats: {
        type: 'number',
        description: 'Quantidade de flats no pacote com pagamento único (padrão: 1).',
      },
      incluir_cafe: {
        type: 'boolean',
        description: 'TRUE para plano com café da manhã incluso, FALSE para somente hospedagem.',
      },
      preferencia_cama: {
        type: 'string',
        enum: ['casal', 'solteiro', 'indiferente'],
        description: 'Preferência opcional de configuração de cama (casal, solteiro ou indiferente).',
      },
      flats: {
        type: 'array',
        description:
          'Configuração individual de cada flat quando o pacote tiver 2 ou mais flats (suporta datas diferentes, 1 ou 2 hóspedes, Hóspede 1 e 2 ou informar_hospedes_depois, café, cama e veículo por flat).',
        items: {
          type: 'object',
          properties: {
            data_checkin: { type: 'string', description: 'Check-in deste flat (YYYY-MM-DD).' },
            data_checkout: { type: 'string', description: 'Check-out deste flat (YYYY-MM-DD).' },
            quantidade_hospedes: { type: 'number', description: 'Ocupação deste flat (1 ou 2 pessoas).' },
            incluir_cafe: { type: 'boolean' },
            preferencia_cama: { type: 'string', enum: ['casal', 'solteiro'] },
            solicitante_hospeda_aqui: {
              type: 'boolean',
              description: 'TRUE no Flat 1 quando o próprio Solicitante ficará hospedado neste flat.',
            },
            informar_hospedes_depois: {
              type: 'boolean',
              description: 'TRUE quando o solicitante preferir informar Hóspede 1 e 2 pelo link único após o pagamento.',
            },
            nome_hospede_1: { type: 'string' },
            telefone_hospede_1: { type: 'string' },
            nome_hospede_2: { type: 'string' },
            telefone_hospede_2: { type: 'string' },
            placa_veiculo: { type: 'string' },
            modelo_veiculo: { type: 'string' },
          },
        },
      },
      confirmacao_hospede: {
        type: 'boolean',
        description:
          'Passe FALSE na primeira chamada para apresentar o resumo final e valor ao cliente. ' +
          'Passe TRUE somente após o cliente confirmar que deseja gerar a reserva/PIX.',
      },
    },
    required: ['data_checkin', 'data_checkout', 'confirmacao_hospede'],
  },

  async execute(
    args: GerarLinkReservaArgs,
    context: ContextoSessaoInjetado
  ): Promise<AgentToolResponse> {
    try {
      const db = context.runtime?.db;
      const runtimeAny = context.runtime as any;
      const procEnv = (globalThis as any).process?.env;
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
      const valorCafePorPessoa = Number(
        tarSettings.breakfastSurchargePerGuest ?? siteCfg.pricing?.breakfastSurchargePerGuest ?? 20.0
      );
      const taxaLimpezaSemCafe = siteCfg.ratePlans?.room_only?.cleaningFeeEnabled === false
        ? 0.0
        : Number(siteCfg.ratePlans?.room_only?.cleaningFeeAmount ?? tarSettings.cleaningFeeSemCafe ?? 50.0);
      const cardMarkupPct = Number(siteCfg.pricing?.cardMarkupPercent ?? tarSettings.cardMarkupPercent ?? 5.0);

      const requestedFlatsCount = Array.isArray(args.flats) && args.flats.length >= 2
        ? args.flats.length
        : Math.max(1, Number(args.quantidade_flats || 1));

      // ── FLUXO PACOTE MULTI-FLAT (2 OU MAIS FLATS COM PAGAMENTO ÚNICO) ──────────
      if (requestedFlatsCount >= 2) {
        const defaultIn = String(args.data_checkin || '').slice(0, 10);
        const defaultOut = String(args.data_checkout || '').slice(0, 10);
        const solNome = String(args.nome_solicitante || args.nome_hospede || context.hospede?.nome || '').trim();
        const solEmail = String(args.email_solicitante || '').trim().toLowerCase();
        const solDoc = String(args.documento_solicitante || '').trim();
        const senderPhone = String(context.telefone_remetente || '').trim();

        const rawItems: FlatReservaSofiaItem[] = Array.isArray(args.flats) && args.flats.length >= 2
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
                preferencia_cama: args.preferencia_cama === 'solteiro' ? 'solteiro' : 'casal',
                solicitante_hospeda_aqui: i === 0 && !args.reserva_para_terceiro,
                informar_hospedes_depois: i > 0 || Boolean(args.reserva_para_terceiro),
              };
            });

        let pacotePixTotal = 0;
        const normalizedPackageFlats: any[] = [];
        const resumoLinhas: string[] = [];

        for (let idx = 0; idx < rawItems.length; idx++) {
          const it = rawItems[idx] || {};
          const fIn = String(it.data_checkin || defaultIn).slice(0, 10);
          const fOut = String(it.data_checkout || defaultOut).slice(0, 10);
          const fNights = diffNights(fIn, fOut);
          const fPax = Math.max(1, Number(it.quantidade_hospedes || 1));
          if (!fIn || !fOut || fNights <= 0) {
            const msg = `Peça ao cliente datas válidas de entrada e saída para o Flat ${idx + 1}.`;
            return {
              status: 'BLOQUEADO_PELA_REGRA',
              codigo_regra_bloqueio: 'DATAS_INVALIDAS',
              instrucao_para_ia: msg,
              instrucao_resposta_ia: msg,
            };
          }
          if (fPax > maxGuestsPerFlat) {
            const msg = `Explique ao cliente que o Flat ${idx + 1} excede o limite de ${maxGuestsPerFlat} hóspedes por unidade.`;
            return {
              status: 'BLOQUEADO_PELA_REGRA',
              codigo_regra_bloqueio: 'CAPACIDADE_POR_FLAT_EXCEDIDA',
              instrucao_para_ia: msg,
              instrucao_resposta_ia: msg,
            };
          }
          const fCafe = it.incluir_cafe !== undefined ? Boolean(it.incluir_cafe) : args.incluir_cafe !== false;
          const { wantsTwin: fTwin, twinFee } = computeTwinFeeForStay(bedCfg, it.preferencia_cama || args.preferencia_cama, fNights);
          const adic3 = fPax >= 3 ? (extraBedType === 'per_night' ? Number((extraBedUnit * fNights).toFixed(2)) : extraBedUnit) : 0;
          const unitPix = fCafe
            ? Number((fNights * (diariaBase + fPax * valorCafePorPessoa) + adic3 + twinFee).toFixed(2))
            : Number((fNights * diariaBase + adic3 + taxaLimpezaSemCafe + twinFee).toFixed(2));
          pacotePixTotal = Number((pacotePixTotal + unitPix).toFixed(2));

          const solAqui = idx === 0 && Boolean(it.solicitante_hospeda_aqui ?? (!args.reserva_para_terceiro && !it.nome_hospede_1 && !it.informar_hospedes_depois));
          const informarDepois = Boolean(it.informar_hospedes_depois || (!solAqui && !it.nome_hospede_1));

          const itemCharges: any[] = [];
          if (!fCafe && taxaLimpezaSemCafe > 0) {
            itemCharges.push({ type: 'cleaning', title: 'Taxa de Limpeza', amount: taxaLimpezaSemCafe });
          }
          if (fTwin && twinFee > 0) {
            itemCharges.push({ type: 'twin_beds', title: 'Montagem 2 Camas de Solteiro', amount: twinFee });
          }

          normalizedPackageFlats.push({
            checkinDate: fIn,
            checkoutDate: fOut,
            guestCount: fPax,
            includeBreakfast: fCafe,
            twinBeds: fTwin,
            requesterIsGuest1: solAqui,
            informGuestsLater: informarDepois,
            guestName: solAqui ? solNome : (it.nome_hospede_1 || ''),
            guestPhone: solAqui ? senderPhone : (it.telefone_hospede_1 || ''),
            guest2Name: it.nome_hospede_2 || '',
            guest2Phone: it.telefone_hospede_2 || '',
            guest2InformLater: fPax >= 2 && !it.nome_hospede_2,
            vehiclePlate: it.placa_veiculo || '',
            vehicleModel: it.modelo_veiculo || '',
            cleaningFee: fCafe ? 0 : taxaLimpezaSemCafe,
            twinFee,
            charges: itemCharges,
            totalAmount: unitPix,
          });

          const descHosp = solAqui
            ? `Solicitante (${solNome || 'a confirmar'})`
            : informarDepois
              ? 'Hóspedes a informar após pagamento'
              : `${it.nome_hospede_1}${fPax >= 2 ? ` + ${it.nome_hospede_2 || 'Hóspede 2 a informar'}` : ''}`;

          resumoLinhas.push(
            `• Flat ${idx + 1}: ${fIn} a ${fOut} (${fNights} diária(s)), ${fPax} pax, ${fCafe ? 'Com Café' : 'Sem Café'}, ${fTwin ? '2 Solteiros' : 'Casal'} — ${descHosp} (R$ ${unitPix.toFixed(2)})`
          );
        }

        const pacoteCartaoTotal = computeCardAmountLocal(pacotePixTotal, cardMarkupPct);

        if (!args.confirmacao_hospede || !solNome) {
          const faltaNomeTxt = !solNome
            ? 'Peça apenas o *nome completo do solicitante* responsável pelo pacote para gerar o bloqueio unificado.'
            : `Pergunte se *${solNome}* confirma o bloqueio dos ${normalizedPackageFlats.length} flats por 30 minutos com 1 único PIX.`;
          const msg =
            `Apresente o resumo completo da pré-reserva de *${normalizedPackageFlats.length} Flats com Pagamento Único*:\n` +
            `${resumoLinhas.join('\n')}\n` +
            `💎 *Valor Único no PIX (com desconto): R$ ${pacotePixTotal.toFixed(2)}* (ou R$ ${pacoteCartaoTotal.toFixed(2)} no Cartão).\n` +
            `${faltaNomeTxt}`;
          return {
            status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
            dados: {
              is_pacote_multi_flat: true,
              quantidade_flats: normalizedPackageFlats.length,
              flats: normalizedPackageFlats,
              valor_total_pix: pacotePixTotal,
              valor_total_cartao: pacoteCartaoTotal,
              nome_solicitante: solNome || null,
            },
            instrucao_para_ia: msg,
            instrucao_resposta_ia: msg,
          };
        }

        const baseUrl = String(
          db?.settings?.baseUrl || procEnv?.APP_BASE_URL || procEnv?.SERVER_BASE_URL || 'https://corpflats.com.br'
        ).replace(/\/+$/, '');

        if (typeof (globalThis as any).createSofiaMultiFlatPreReservation === 'function') {
          const createdPkg = await (globalThis as any).createSofiaMultiFlatPreReservation({
            packageFlats: normalizedPackageFlats,
            requesterType: normalizedPackageFlats[0]?.requesterIsGuest1 ? 'guest' : 'other_person',
            requesterName: solNome,
            requesterPhone: senderPhone,
            requesterEmail: solEmail,
            requesterDocument: solDoc,
            channel: 'whatsapp',
            paymentMethod: 'pix',
            status: 'pre_reserva',
            holdDurationMinutes: 30,
            baseUrl,
            sendWhatsapp: false,
            suppressExternalSend: Boolean(runtimeAny?.suppressExternalSend),
          });
          const stampIso = new Date().toISOString();
          if (Array.isArray(createdPkg?.reservations)) {
            for (const r of createdPkg.reservations) {
              r._needsOfficialPreResDispatch = false;
              r._preReservationRulerSentAt = stampIso;
              r.packagePreResDispatchedAt = stampIso;
            }
          }
          const sum = createdPkg.summary;
          const msg =
            `Confirme com entusiasmo que o pacote *${createdPkg.packageCode}* com *${sum.activeFlatsCount} flats* (${sum.items.map((x: any) => `Flat ${x.flatNumber}`).join(', ')}) foi bloqueado por 30 minutos para *${solNome}*!\n` +
            `Informe o valor único de *R$ ${sum.pendingAmount.toFixed(2)} no PIX* (ou R$ ${sum.cardPendingAmount.toFixed(2)} no Cartão), o código PIX único (\`${sum.pixCopiaECola}\`) e o painel unificado (${sum.packagePortalUrl}). ` +
            `Avise que após o pagamento único ele receberá 1 recibo do pacote todo (com opção de 1 NFS-e única CPF/CNPJ) e 1 link único para cadastrar/revisar o Hóspede 1 e 2 de cada flat, e cada hóspede receberá apenas as instruções do seu flat sem ver valores.`;
          return {
            status: 'SUCESSO_EXECUTADO',
            dados: {
              is_pacote_multi_flat: true,
              codigo_pacote: createdPkg.packageCode,
              quantidade_flats: sum.activeFlatsCount,
              flats_alocados: sum.items.map((x: any) => x.flatNumber),
              valor_total: sum.pendingAmount,
              valor_cartao: sum.cardPendingAmount,
              chave_pix: sum.pixCopiaECola,
              link_pacote: sum.packagePortalUrl,
              link_credenciamento_pos_pagamento: sum.batchCredentialUrl,
              validade_bloqueio_minutos: 30,
            },
            instrucao_para_ia: msg,
            instrucao_resposta_ia: msg,
          };
        }

        // Fallback direto em memória caso o hook global ainda não esteja inicializado
        const pkgCodeFallback = `PKG-${Math.floor(100000 + Math.random() * 900000)}`;
        let cleanTxPkg = pkgCodeFallback.replace(/[^a-zA-Z0-9]/g, '').slice(0, 25);
        let chavePixPkg =
          typeof (globalThis as any).generateStaticPixPayload === 'function'
            ? (globalThis as any).generateStaticPixPayload({
                pixKey: db?.settings?.interConfig?.pixKey || '47964813000165',
                amount: pacotePixTotal,
                merchantName: 'CORPFLATS LTDA',
                merchantCity: 'CAMPOS DOS GOYTACAZES',
                txid: cleanTxPkg,
              })
            : db?.settings?.pixKey || '47964813000165';

        if (typeof (globalThis as any).createInterPixCob === 'function') {
          try {
            const interPkg = await (globalThis as any).createInterPixCob({
              amount: pacotePixTotal,
              description: `Pacote ${pkgCodeFallback} (${normalizedPackageFlats.length} Flats)`,
              debtorName: solNome,
              debtorDocument: solDoc,
              reservationCode: pkgCodeFallback,
            });
            if (interPkg && interPkg.pixCopiaECola) {
              chavePixPkg = interPkg.pixCopiaECola;
              cleanTxPkg = interPkg.txid || cleanTxPkg;
            }
          } catch (_) {}
        }

        const allocatedFlatNumbers: string[] = [];
        if (db) {
          if (!Array.isArray(db.reservations)) db.reservations = [];
          const allFlatsPkg = Array.isArray(db.flats) && db.flats.length > 0
            ? db.flats.filter((f: any) => f && f.isActive !== false && f.status !== 'maintenance' && f.status !== 'manutencao_bloqueada')
            : [{ id: 1, number: '113' }, { id: 2, number: '114' }, { id: 3, number: '212' }];
          const twinAllowedPkg: string[] = (
            Array.isArray(bedCfg.twinAllowedFlats) && bedCfg.twinAllowedFlats.length > 0
              ? bedCfg.twinAllowedFlats
              : ['113', '114', '115', '202', '905']
          ).map((n: any) => String(n));
          const nowMsPkg = Date.now() + Number((globalThis as any).__simulatedTimeOffsetMs || 0);
          const nowIsoPkg = new Date(nowMsPkg).toISOString();
          const expIsoPkg = new Date(nowMsPkg + 30 * 60000).toISOString();
          let nextIdPkg = db.reservations.length > 0 ? Math.max(...db.reservations.map((r: any) => Number(r.id) || 0)) + 1 : 1;
          const usedPkg: Array<{ flatNumber: string; checkinDate: string; checkoutDate: string }> = [];

          for (let idx = 0; idx < normalizedPackageFlats.length; idx++) {
            const nf = normalizedPackageFlats[idx];
            const cand = allFlatsPkg.find((fl: any) => {
              const fNum = String(fl.number || fl.id || '');
              if (nf.twinBeds && !twinAllowedPkg.includes(fNum) && allFlatsPkg.some((x: any) => twinAllowedPkg.includes(String(x.number || x.id)))) {
                return false;
              }
              if (usedPkg.some((u) => u.flatNumber === fNum && nf.checkinDate < u.checkoutDate && nf.checkoutDate > u.checkinDate)) return false;
              const hasConflict = db.reservations.some((r: any) => {
                if (!r) return false;
                const st = String(r.status || '').toLowerCase();
                if (['cancelada', 'cancelado', 'cancelled', 'expirada', 'expired', 'no_show'].includes(st)) return false;
                const holdExp = r.expiresAt || r.holdExpiresAt;
                if ((st === 'pre_reserva' || st === 'pendente' || r.isPreReservation) && holdExp && new Date(holdExp).getTime() < nowMsPkg && r.paymentStatus !== 'pago_total' && r.paymentStatus !== 'pago') return false;
                if (String(r.flatNumber || r.flatId || '') !== fNum) return false;
                return nf.checkinDate < String(r.checkoutDate || '').slice(0, 10) && nf.checkoutDate > String(r.checkinDate || '').slice(0, 10);
              });
              return !hasConflict;
            });
            if (!cand) {
              const msgNoFlat = `Informe ao cliente que não há apartamentos livres suficientes para o Flat ${idx + 1} (${nf.checkinDate} a ${nf.checkoutDate}).`;
              return {
                status: 'BLOQUEADO_PELA_REGRA',
                codigo_regra_bloqueio: 'SEM_DISPONIBILIDADE_MULTI_FLAT',
                instrucao_para_ia: msgNoFlat,
                instrucao_resposta_ia: msgNoFlat,
              };
            }
            const rId = nextIdPkg++;
            const fNumStr = String(cand.number || cand.id);
            const rCode = `CF-${fNumStr}-${String(rId).padStart(4, '0')}`;
            allocatedFlatNumbers.push(fNumStr);
            usedPkg.push({ flatNumber: fNumStr, checkinDate: nf.checkinDate, checkoutDate: nf.checkoutDate });
            const gArr = [
              { index: 1, isMain: true, name: nf.informGuestsLater ? '' : nf.guestName, phone: nf.guestPhone || '', informLater: nf.informGuestsLater },
              ...(nf.guestCount >= 2 ? [{ index: 2, isMain: false, name: nf.guest2Name || '', phone: nf.guest2Phone || '', informLater: nf.guest2InformLater }] : []),
            ];
            db.reservations.unshift({
              id: rId,
              code: rCode,
              reservationCode: rCode,
              packageId: pkgCodeFallback,
              packageCode: pkgCodeFallback,
              isPackageReservation: true,
              packageIndex: idx + 1,
              packageTotalFlats: normalizedPackageFlats.length,
              isPackagePrimary: idx === 0,
              requesterIsGuest1: nf.requesterIsGuest1,
              informGuestsLater: nf.informGuestsLater,
              guest2InformLater: nf.guest2InformLater,
              hideFinancialForGuest: !nf.requesterIsGuest1,
              nfHideFromGuest: !nf.requesterIsGuest1,
              flatId: cand.id || cand.number,
              flatNumber: fNumStr,
              guestName: nf.informGuestsLater ? 'A Definir (Aguardando Solicitante)' : nf.guestName,
              guestPending: nf.informGuestsLater,
              guestPhone: nf.guestPhone || '',
              guestCount: nf.guestCount,
              adults: nf.guestCount,
              guests: gArr,
              requesterType: nf.requesterIsGuest1 ? 'guest' : 'other_person',
              requesterName: solNome,
              requesterPhone: senderPhone,
              requesterEmail: solEmail,
              requesterInfo: { type: 'other_person', name: solNome, phone: senderPhone, whatsapp: senderPhone, email: solEmail, cpf: solDoc },
              checkinDate: nf.checkinDate,
              checkoutDate: nf.checkoutDate,
              status: 'pre_reserva',
              paymentStatus: 'pendente',
              paymentMethod: 'pix',
              channel: 'whatsapp',
              includeBreakfast: nf.includeBreakfast,
              twinBeds: nf.twinBeds,
              bedType: nf.twinBeds ? 'twin' : 'queen',
              cleaningFee: nf.cleaningFee,
              charges: nf.charges,
              totalAmount: nf.totalAmount,
              cardTotalAmount: computeCardAmountLocal(nf.totalAmount, cardMarkupPct),
              paidAmount: 0,
              expiresAt: expIsoPkg,
              pixTxId: cleanTxPkg,
              pixCopiaECola: chavePixPkg,
              packagePixTxId: cleanTxPkg,
              packagePixCopiaECola: chavePixPkg,
              packagePixChargedAmount: pacotePixTotal,
              _needsOfficialPreResDispatch: false,
              _preReservationRulerSentAt: nowIsoPkg,
              packagePreResDispatchedAt: nowIsoPkg,
              createdAt: nowIsoPkg,
              updatedAt: nowIsoPkg,
            });
          }
          if (typeof context.runtime?.saveDatabase === 'function') {
            await context.runtime.saveDatabase();
          }
        }

        const portalPkgUrl = `${baseUrl}/minha-reserva/${encodeURIComponent(pkgCodeFallback)}?requester=1`;
        const credPkgUrl = `${baseUrl}/credenciamento/${encodeURIComponent(pkgCodeFallback)}`;
        const msgFallback =
          `Confirme com entusiasmo que o pacote *${pkgCodeFallback}* com *${normalizedPackageFlats.length} flats* foi bloqueado por 30 minutos para *${solNome}*!\n` +
          `Informe o valor único de *R$ ${pacotePixTotal.toFixed(2)} no PIX* (ou R$ ${pacoteCartaoTotal.toFixed(2)} no Cartão), o código PIX único (\`${chavePixPkg}\`) e o painel unificado (${portalPkgUrl}).`;
        return {
          status: 'SUCESSO_EXECUTADO',
          dados: {
            is_pacote_multi_flat: true,
            codigo_pacote: pkgCodeFallback,
            quantidade_flats: normalizedPackageFlats.length,
            flats_alocados: allocatedFlatNumbers,
            valor_total: pacotePixTotal,
            valor_cartao: pacoteCartaoTotal,
            chave_pix: chavePixPkg,
            link_pacote: portalPkgUrl,
            link_credenciamento_pos_pagamento: credPkgUrl,
            validade_bloqueio_minutos: 30,
          },
          instrucao_para_ia: msgFallback,
          instrucao_resposta_ia: msgFallback,
        };
      }

      // ── FLUXO RESERVA DE 1 ÚNICO FLAT ──────────────────────────────────────────
      const checkin = String(args.data_checkin || '').slice(0, 10);
      const checkout = String(args.data_checkout || '').slice(0, 10);
      const diarias = diffNights(checkin, checkout);
      const hospedes = Math.max(1, Number(args.quantidade_hospedes || 1));
      const comCafe = args.incluir_cafe !== false;
      const paraTerceiro = Boolean(args.reserva_para_terceiro);
      const rawNomeHospede = String(args.nome_hospede || (!paraTerceiro ? context.hospede?.nome || '' : '')).trim();
      const nomeSolicitante = String(args.nome_solicitante || (paraTerceiro ? context.hospede?.nome || '' : '')).trim();
      const emailSolicitante = String(args.email_solicitante || '').trim().toLowerCase();
      const docSolicitante = String(args.documento_solicitante || '').trim();
      const hospedePendente = paraTerceiro && !rawNomeHospede;
      const nomeTitular = hospedePendente ? 'A Definir (Aguardando Solicitante)' : rawNomeHospede;
      const nomePagador = rawNomeHospede || nomeSolicitante || 'Solicitante CorpFlats';

      if (!checkin || !checkout || diarias <= 0) {
        const msg =
          'Peça ao cliente para confirmar as datas de entrada e saída (formato dia/mês) para gerar o link da reserva.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'DATAS_INVALIDAS',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      if (hospedes > maxGuestsPerFlat) {
        const flatsSug = Math.ceil(hospedes / maxGuestsPerFlat);
        const msg =
          hospedes === 3 && !extraBedEnabled
            ? 'Explique educadamente ao cliente que o padrão oficial dos nossos flats comporta até 2 hóspedes, e pergunte se deseja gerar um pacote de 2 flats (com 1 único PIX) ou consultar a gerência para exceção.'
            : `Explique ao cliente que cada flat comporta até ${maxGuestsPerFlat} hóspedes e ofereça gerar um pacote unificado de *${flatsSug} flats* com pagamento único.`;
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
      const valorTotal = comCafe
        ? Number((diarias * (diariaBase + hospedes * valorCafePorPessoa) + adicionalTerceiroHospedeTotal + twinFee).toFixed(2))
        : Number((diarias * diariaBase + adicionalTerceiroHospedeTotal + taxaLimpezaSemCafe + twinFee).toFixed(2));
      const valorCartaoSimulado = computeCardAmountLocal(valorTotal, cardMarkupPct);

      const faltaIdentificacaoObrigatoria = paraTerceiro ? !nomeSolicitante : !rawNomeHospede;
      if (!args.confirmacao_hospede || faltaIdentificacaoObrigatoria) {
        let orientacaoIdentificacao = '';
        if (paraTerceiro) {
          orientacaoIdentificacao = !nomeSolicitante
            ? 'Como a reserva é para outra pessoa/empresa, peça apenas o *nome do solicitante (ou empresa)* para vincular à pré-reserva — explique que os dados do hóspede são opcionais agora e poderão ser preenchidos depois pelo link seguro enviado após a confirmação.'
            : rawNomeHospede
              ? `Confirme se podemos gerar a pré-reserva solicitada por *${nomeSolicitante}* para o hóspede *${rawNomeHospede}*.`
              : `Confirme se podemos gerar a pré-reserva em nome do solicitante *${nomeSolicitante}* (os dados do hóspede poderão ser preenchidos depois pelo link seguro que enviaremos após a confirmação).`;
        } else {
          orientacaoIdentificacao = !rawNomeHospede
            ? 'Peça também o *nome completo* do titular para vincular à pré-reserva (ou informe que, se estiver reservando para outra pessoa/empresa, basta informar o nome do solicitante e preencher o hóspede depois via link).'
            : `Confirme se a reserva pode ser emitida em nome de *${rawNomeHospede}*.`;
        }

        const msg =
          `Informe ao cliente o resumo para bloqueio da pré-reserva: período de ${checkin} a ${checkout} (${diarias} diária(s)), ` +
          `total de hóspedes: *${hospedes}* (${hospedes === 1 ? '1 pessoa' : `${hospedes} pessoas`}), canal da reserva: *WhatsApp*, ` +
          `plano ${comCafe ? 'COM café da manhã incluso no flat' : 'Somente Hospedagem'}${wantsTwin ? ' (2 camas de solteiro)' : ''}, ` +
          `no valor de *R$ ${valorTotal.toFixed(2)} no PIX (com desconto)* (ou R$ ${valorCartaoSimulado.toFixed(2)} no Cartão). ${orientacaoIdentificacao}`;
        return {
          status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
          dados: {
            data_checkin: checkin,
            data_checkout: checkout,
            diarias,
            quantidade_hospedes: hospedes,
            canal_reserva: 'WhatsApp',
            incluir_cafe: comCafe,
            preferencia_cama: wantsTwin ? 'solteiro' : 'casal',
            taxa_camas_solteiro: twinFee,
            valor_total: valorTotal,
            valor_cartao: valorCartaoSimulado,
            reserva_para_terceiro: paraTerceiro,
            nome_solicitante: nomeSolicitante || null,
            nome_hospede: rawNomeHospede || null,
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const codigoPreReserva = `CF-${Math.floor(100000 + Math.random() * 900000)}`;
      const baseUrl = String(
        db?.settings?.baseUrl || procEnv?.APP_BASE_URL || procEnv?.SERVER_BASE_URL || 'https://corpflats.com.br'
      ).replace(/\/+$/, '');
      const linkPagamento = `${baseUrl}/minha-reserva/${encodeURIComponent(codigoPreReserva)}`;
      const cardTotalAmount = valorCartaoSimulado;
      const cleanTxId = codigoPreReserva.replace(/[^a-zA-Z0-9]/g, '').substring(0, 25);

      let chavePix =
        typeof (globalThis as any).generateStaticPixPayload === 'function'
          ? (globalThis as any).generateStaticPixPayload({
              pixKey: db?.settings?.interConfig?.pixKey || '47964813000165',
              amount: valorTotal,
              merchantName: 'CORPFLATS LTDA',
              merchantCity: 'CAMPOS DOS GOYTACAZES',
              txid: cleanTxId,
            })
          : db?.settings?.pixKey || '47964813000165';
      let resolvedPixTxId = cleanTxId;

      if (typeof (globalThis as any).createInterPixCob === 'function') {
        try {
          const interCob = await (globalThis as any).createInterPixCob({
            amount: valorTotal,
            description: `Reserva ${codigoPreReserva}`,
            debtorName: nomePagador,
            debtorDocument: docSolicitante,
            reservationCode: codigoPreReserva,
          });
          if (interCob && interCob.pixCopiaECola) {
            chavePix = interCob.pixCopiaECola;
            resolvedPixTxId = interCob.txid || cleanTxId;
          }
        } catch (_) {}
      }

      const nowMsHold = Date.now() + Number((globalThis as any).__simulatedTimeOffsetMs || 0);
      const nowIso = new Date(nowMsHold).toISOString();
      const holdMinutes = 30;
      const expiresAt = new Date(nowMsHold + holdMinutes * 60 * 1000).toISOString();
      const reminderLeadMinutes = 10;
      const reminderAt = new Date(nowMsHold + (holdMinutes - reminderLeadMinutes) * 60 * 1000).toISOString();
      const cleanSenderPhone = String(context.telefone_remetente || '').trim();

      if (db) {
        if (!Array.isArray(db.reservations)) db.reservations = [];
        if (!Array.isArray(db.preReservations)) db.preReservations = [];

        const allFlats = Array.isArray(db.flats) && db.flats.length > 0
          ? db.flats.filter((f: any) => f && f.isActive !== false && f.status !== 'maintenance' && f.status !== 'manutencao_bloqueada')
          : [{ id: 1, number: '113' }];
        const twinAllowedSingle: string[] = (
          Array.isArray(bedCfg.twinAllowedFlats) && bedCfg.twinAllowedFlats.length > 0
            ? bedCfg.twinAllowedFlats
            : ['113', '114', '115', '202', '905']
        ).map((n: any) => String(n));
        const availableFlats = allFlats.filter((fl: any) => {
          const fNum = String(fl.number || fl.id || '');
          if (wantsTwin && !twinAllowedSingle.includes(fNum) && allFlats.some((x: any) => twinAllowedSingle.includes(String(x.number || x.id)))) {
            return false;
          }
          const hasConflict = db.reservations.some((r: any) => {
            if (!r) return false;
            const st = String(r.status || '').toLowerCase();
            if (['cancelada', 'cancelado', 'cancelled', 'expirada', 'expired', 'no_show'].includes(st)) return false;
            const holdExp = r.expiresAt || r.holdExpiresAt;
            if ((st === 'pre_reserva' || st === 'pendente' || r.isPreReservation) && holdExp && new Date(holdExp).getTime() < nowMsHold && r.paymentStatus !== 'pago_total' && r.paymentStatus !== 'pago') return false;
            if (String(r.flatNumber || r.flatId || '') !== fNum) return false;
            return checkin < String(r.checkoutDate || '').slice(0, 10) && checkout > String(r.checkinDate || '').slice(0, 10);
          });
          return !hasConflict;
        });
        const selectedFlat = availableFlats[0] || allFlats[0] || { id: 1, number: '101' };
        const nextResId = db.reservations.length > 0
          ? Math.max(...db.reservations.map((r: any) => Number(r.id) || 0)) + 1
          : 1;
        const cleaningFee = comCafe ? 0 : taxaLimpezaSemCafe;
        const netRoomTotal = Math.max(0, valorTotal - cleaningFee - adicionalTerceiroHospedeTotal - twinFee);
        const dailyRate = Math.round((netRoomTotal / diarias) * 100) / 100;

        const preparedGuests = Array.from({ length: hospedes }, (_, idx) => ({
          index: idx + 1,
          guestId: null,
          name: idx === 0 ? (hospedePendente ? '' : nomeTitular) : `Hóspede ${idx + 1}`,
          cpf: '',
          phone: idx === 0 && !paraTerceiro ? cleanSenderPhone : '',
          email: '',
          hasCompletedCheckin: false,
          checkinCompletedAt: null,
        }));

        const charges: any[] = [];
        if (cleaningFee > 0) {
          charges.push({ id: `charge_cleaning_${nextResId}`, type: 'cleaning', title: 'Taxa de Limpeza', amount: cleaningFee });
        }
        if (wantsTwin && twinFee > 0) {
          charges.push({ id: `charge_twin_${nextResId}`, type: 'twin_beds', title: 'Montagem 2 Camas de Solteiro', amount: twinFee });
        }

        const newReservation = {
          id: nextResId,
          code: codigoPreReserva,
          reservationCode: codigoPreReserva,
          flatId: selectedFlat.id || selectedFlat.number,
          flatNumber: String(selectedFlat.number || selectedFlat.id),
          guestName: nomeTitular,
          guestPending: hospedePendente,
          guestPhone: paraTerceiro ? '' : cleanSenderPhone,
          phone: cleanSenderPhone,
          guestEmail: '',
          requesterType: paraTerceiro ? 'other_person' : 'guest',
          hideFinancialForGuest: paraTerceiro,
          ...(paraTerceiro
            ? {
                requesterName: nomeSolicitante,
                requesterPhone: cleanSenderPhone,
                requesterEmail: emailSolicitante,
                requesterInfo: {
                  type: 'other_person',
                  name: nomeSolicitante,
                  phone: cleanSenderPhone,
                  whatsapp: cleanSenderPhone,
                  email: emailSolicitante,
                  cpf: docSolicitante,
                },
                credentialStatus: hospedePendente ? 'pending_agency' : 'completed',
              }
            : {}),
          checkinDate: checkin,
          checkoutDate: checkout,
          checkinTime: '14:00',
          checkoutTime: '12:00',
          status: 'pre_reserva',
          paymentStatus: 'pendente',
          paymentMethod: 'pix',
          channel: 'whatsapp',
          source: 'whatsapp',
          ratePlan: comCafe ? 'with_breakfast' : 'room_only',
          includeBreakfast: comCafe,
          breakfastIncluded: comCafe,
          twinBeds: wantsTwin,
          bedType: wantsTwin ? 'twin' : 'queen',
          guestsCount: hospedes,
          guestCount: hospedes,
          numGuests: hospedes,
          adults: hospedes,
          children: 0,
          guests: preparedGuests,
          totalAmount: valorTotal,
          cardTotalAmount,
          dailyRate,
          cleaningFee,
          charges,
          paidAmount: 0,
          expiresAt,
          holdPreset: `${holdMinutes}m`,
          holdDurationMinutes: holdMinutes,
          holdDurationLabel: `${holdMinutes} minutos`,
          sendExpirationReminder: true,
          reminderLeadMinutes,
          reminderLeadLabel: `${reminderLeadMinutes} minutos antes`,
          reminderAt,
          pixCopiaECola: chavePix,
          pixTxId: resolvedPixTxId,
          pixChargedAmount: valorTotal,
          _needsOfficialPreResDispatch: false,
          _preReservationRulerSentAt: nowIso,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        db.reservations.unshift(newReservation);

        db.preReservations.push({
          id: nextResId,
          code: codigoPreReserva,
          guestName: nomeTitular,
          guestPhone: paraTerceiro ? '' : cleanSenderPhone,
          requesterName: paraTerceiro ? nomeSolicitante : '',
          requesterPhone: paraTerceiro ? cleanSenderPhone : '',
          checkinDate: checkin,
          checkoutDate: checkout,
          guests: hospedes,
          withBreakfast: comCafe,
          twinBeds: wantsTwin,
          totalAmount: valorTotal,
          cardTotalAmount,
          pixCopiaECola: chavePix,
          pixTxId: resolvedPixTxId,
          status: 'pending_payment',
          expiresAt,
          reminderAt,
          createdAt: nowIso,
        });
        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }
        if (typeof context.runtime?.triggerImmediateWhatsApp === 'function' && !runtimeAny?.suppressExternalSend) {
          await context.runtime.triggerImmediateWhatsApp(
            db,
            context.runtime?.saveDatabase || null,
            'pre_reservation_created',
            newReservation,
            baseUrl
          );
        }
      }

      const destinatarioResumo = paraTerceiro
        ? (rawNomeHospede
            ? `solicitada por *${nomeSolicitante}* para o hóspede *${rawNomeHospede}*`
            : `em nome do solicitante *${nomeSolicitante}* (hóspede a definir após confirmação)`)
        : `para *${nomeTitular}*`;
      const notaCredenciamento = hospedePendente
        ? ' Avise também que, assim que o pagamento for confirmado, enviaremos automaticamente o link seguro de credenciamento para preencher os dados do hóspede antes do check-in.'
        : '';
      const msg =
        `Confirme com entusiasmo que a pré-reserva *${codigoPreReserva}* foi bloqueada por 30 minutos ${destinatarioResumo} ` +
        `(${checkin} a ${checkout}, *${hospedes} ${hospedes === 1 ? 'hóspede' : 'hóspedes'}*, Canal da Reserva: *WhatsApp*) ` +
        `no valor de *R$ ${valorTotal.toFixed(2)}* no PIX (ou *R$ ${cardTotalAmount.toFixed(2)}* no Cartão de Crédito). ` +
        `Inclua no resumo da confirmação a quantidade de hóspedes (*${hospedes}*) e o canal da reserva (*WhatsApp*). ` +
        `A mensagem oficial da reserva com botões interativos, código PIX Copia e Cola (\`${chavePix}\`) e link de pagamento por Cartão (${linkPagamento}) já foi enviada.${notaCredenciamento}`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          codigo_pre_reserva: codigoPreReserva,
          nome_hospede: nomeTitular,
          reserva_para_terceiro: paraTerceiro,
          nome_solicitante: paraTerceiro ? nomeSolicitante : null,
          hospede_pendente: hospedePendente,
          data_checkin: checkin,
          data_checkout: checkout,
          quantidade_hospedes: hospedes,
          preferencia_cama: wantsTwin ? 'solteiro' : 'casal',
          taxa_camas_solteiro: twinFee,
          canal_reserva: 'WhatsApp',
          valor_total: valorTotal,
          valor_cartao: cardTotalAmount,
          link_reserva: linkPagamento,
          chave_pix: chavePix,
          validade_bloqueio_minutos: 30,
        },
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    } catch (error: any) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'MEDIA',
        categoria: 'ERRO_SISTEMA_TOOL',
        hospede_nome: args.nome_hospede || args.nome_solicitante || context.hospede?.nome || 'Lead Comercial',
        telefone: context.telefone_remetente,
        resumo: `Falha técnica ao executar gerar_link_reserva: ${error.message}`,
        context,
      });

      const msg =
        'Peça desculpas ao cliente informando que houve uma oscilação ao gerar o link de pagamento, mas que a recepção já foi notificada para enviar o PIX manualmente em instantes.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

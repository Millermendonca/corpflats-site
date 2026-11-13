// src/agent/tools/solicitar-limpeza-extra.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import { notifyAdminWhatsApp } from '../services/admin-notifier';

export interface SolicitarLimpezaExtraArgs {
  tipo_solicitacao: 'LIMPEZA_COMPLETA' | 'TROCA_TOALHAS_ENXOVAL' | 'REPOSICAO_ITENS';
  observacoes?: string;
  confirmacao_hospede: boolean;
}

export const solicitarLimpezaExtraTool: AgentToolDefinition<SolicitarLimpezaExtraArgs> = {
  name: 'solicitar_limpeza_extra',

  description:
    'Agenda limpeza adicional no apartamento, troca de enxoval/toalhas ou reposição de amenidades na governança para o hóspede em estadia.',

  allowedStates: ['IN_STAY_CONCIERGE'],

  parametersSchema: {
    type: 'object',
    properties: {
      tipo_solicitacao: {
        type: 'string',
        enum: ['LIMPEZA_COMPLETA', 'TROCA_TOALHAS_ENXOVAL', 'REPOSICAO_ITENS'],
        description: 'Tipo de serviço de governança solicitado pelo hóspede.',
      },
      observacoes: {
        type: 'string',
        description: 'Detalhes adicionais informados pelo hóspede (ex: horário de preferência ou itens específicos).',
      },
      confirmacao_hospede: {
        type: 'boolean',
        description:
          'Passe FALSE na primeira chamada caso seja LIMPEZA_COMPLETA extra (para confirmar a taxa de R$ 70,00). ' +
          'Para TROCA_TOALHAS_ENXOVAL ou REPOSICAO_ITENS (cortesia) ou após o hóspede confirmar, passe TRUE.',
      },
    },
    required: ['tipo_solicitacao', 'confirmacao_hospede'],
  },

  async execute(
    args: SolicitarLimpezaExtraArgs,
    context: ContextoSessaoInjetado
  ): Promise<AgentToolResponse> {
    try {
      const reserva = context.reserva_ativa || context.reserva_atual;
      if (!reserva) {
        const msg =
          'Explique educadamente que não localizamos uma estadia ativa vinculada a este telefone e pergunte o número do flat.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const taxaLimpezaExtra = 70.0;
      const exigeTaxa = args.tipo_solicitacao === 'LIMPEZA_COMPLETA';
      const db = context.runtime?.db;
      const flatNumber = reserva.nome_imovel.replace(/^Flat\s+/i, '').trim();
      const todayStr = String(context.data_hora_atual || new Date().toISOString()).slice(0, 10);
      const protocolo = `GOV-${Date.now().toString(36).slice(-5).toUpperCase()}`;

      const targetRes = Array.isArray(db?.reservations)
        ? db.reservations.find(
            (r: any) => String(r?.code || r?.reservationCode || r?.id || '') === reserva.id
          )
        : null;

      if (exigeTaxa) {
        if (!args.confirmacao_hospede) {
          const msg =
            `Informe ao hóspede que a limpeza durante a estadia para o ${reserva.nome_imovel} tem o valor de *R$ ${taxaLimpezaExtra.toFixed(2)}* e já inclui a limpeza completa do flat mais a troca de roupa de cama e banho. ` +
            `(Informe também que se ele precisar apenas de uma toalha extra, travesseiro, papel higiênico ou sabonete avulso, entregamos como cortesia!). ` +
            `Pergunte se ele confirma a limpeza completa de R$ ${taxaLimpezaExtra.toFixed(2)} para você gerar a cobrança PIX.`;
          return {
            status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
            dados: {
              imovel: reserva.nome_imovel,
              tipo_solicitacao: args.tipo_solicitacao,
              valor_taxa: taxaLimpezaExtra,
              inclui: 'Limpeza completa do flat + troca de roupa de cama e banho',
              moeda: 'BRL',
            },
            instrucao_para_ia: msg,
            instrucao_resposta_ia: msg,
          };
        }

        const chavePix = db?.settings?.pixKey || '47.964.813/0001-65 (CNPJ - Rental Millers / CorpFlats)';
        const txid = `PIX_CLEAN_${Date.now()}`;
        if (targetRes) {
          targetRes.pendingStayoverCleaning = {
            protocolo,
            txid,
            pixCopiaECola: chavePix,
            amount: taxaLimpezaExtra,
            requestDate: todayStr,
            notes: args.observacoes || '',
            status: 'pending_payment',
            requestedAt: new Date().toISOString(),
          };
          targetRes.updatedAt = new Date().toISOString();
          if (typeof context.runtime?.saveDatabase === 'function') {
            await context.runtime.saveDatabase();
          }
        }

        const msg =
          `Envie ao hóspede o código PIX (${chavePix}) no valor de *R$ ${taxaLimpezaExtra.toFixed(2)}* referente à limpeza durante a estadia (com troca de roupa de cama e banho) do *${reserva.nome_imovel}*. ` +
          `Explique claramente que a cobrança foi gerada e que, assim que o pagamento PIX for confirmado, o card de limpeza será enviado automaticamente para a camareira!`;

        return {
          status: 'SUCESSO_EXECUTADO',
          dados: {
            protocolo,
            reserva_id: reserva.id,
            imovel: reserva.nome_imovel,
            tipo_solicitacao: args.tipo_solicitacao,
            valor_taxa: taxaLimpezaExtra,
            aguardando_pagamento_pix: true,
            card_gerado_apos_pagamento: true,
            txid,
            pix_copia_e_cola: chavePix,
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const descricaoItem = String(
        args.observacoes ||
          (args.tipo_solicitacao === 'TROCA_TOALHAS_ENXOVAL'
            ? 'Toalha extra / travesseiro'
            : 'Papel higiênico / sabonete')
      ).trim();
      const instrucaoCamareira = `⚠️ APENAS ENTREGA DE ITEM (NÃO LIMPAR O FLAT): Entregar [${descricaoItem}] no Flat ${flatNumber}.`;

      if (db) {
        if (!Array.isArray(db.cleaningRequests)) db.cleaningRequests = [];
        db.cleaningRequests.push({
          id: protocolo,
          protocolo,
          flatId: targetRes?.flatId || Number(flatNumber) || 1,
          flatNumber,
          reservationId: reserva.id,
          reservationCode: reserva.id,
          guestName: context.hospede?.nome || targetRes?.guestName || 'Hóspede',
          leavingGuest: '⚠️ SÓ ENTREGA DE ITEM (NÃO LIMPAR)',
          arrivingGuest: null,
          type: 'instruction',
          source: 'manual_instruction',
          isInstructionOnly: true,
          isPaidCleaning: false,
          instructionText: instrucaoCamareira,
          adminNote: instrucaoCamareira,
          notes: instrucaoCamareira,
          pendingObservation: instrucaoCamareira,
          fee: 0,
          requestDate: todayStr,
          status: 'dirty',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }
      }

      const msg =
        `Confirme com cordialidade que o pedido de *${descricaoItem}* para o *${reserva.nome_imovel}* já foi registrado como *cortesia (sem custo)* ` +
        `no quadro da governança (protocolo *${protocolo}*), com aviso expresso para a camareira realizar apenas a entrega do item solicitado.`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          protocolo,
          reserva_id: reserva.id,
          imovel: reserva.nome_imovel,
          tipo_solicitacao: args.tipo_solicitacao,
          item_solicitado: descricaoItem,
          apenas_entrega_item: true,
          valor_taxa: 0,
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
        resumo: `Falha técnica ao executar solicitar_limpeza_extra: ${error.message}`,
        context,
      });

      const msg =
        'Informe ao hóspede que você já encaminhou o pedido diretamente para a equipe de governança atender o apartamento.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

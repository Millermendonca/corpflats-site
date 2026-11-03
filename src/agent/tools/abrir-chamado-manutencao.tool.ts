// src/agent/tools/abrir-chamado-manutencao.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import { notifyAdminWhatsApp } from '../services/admin-notifier';

export interface AbrirChamadoManutencaoArgs {
  categoria_item:
    | 'AR_CONDICIONADO'
    | 'FECHADURA_ACESSO'
    | 'CHUVEIRO_HIDRAULICA'
    | 'ELETRICA_ILUMINACAO'
    | 'WIFI_TV'
    | 'ELETRODOMESTICOS'
    | 'OUTROS';
  descricao_problema: string;
  urgencia: 'BAIXA' | 'MEDIA' | 'CRITICA';
}

export const abrirChamadoManutencaoTool: AgentToolDefinition<AbrirChamadoManutencaoArgs> = {
  name: 'abrir_chamado_manutencao',

  description:
    'Abre uma Ordem de Serviço (OS) de manutenção para o flat atual do hóspede e, em casos urgentes ou críticos, ' +
    'notifica automaticamente o WhatsApp do administrador/gestor.',

  allowedStates: ['IN_STAY_CONCIERGE'],

  parametersSchema: {
    type: 'object',
    properties: {
      categoria_item: {
        type: 'string',
        enum: [
          'AR_CONDICIONADO',
          'FECHADURA_ACESSO',
          'CHUVEIRO_HIDRAULICA',
          'ELETRICA_ILUMINACAO',
          'WIFI_TV',
          'ELETRODOMESTICOS',
          'OUTROS',
        ],
        description: 'Categoria do equipamento ou instalação com defeito.',
      },
      descricao_problema: {
        type: 'string',
        description: 'Descrição clara do problema relatado pelo hóspede.',
      },
      urgencia: {
        type: 'string',
        enum: ['BAIXA', 'MEDIA', 'CRITICA'],
        description:
          'Use CRITICA para falta de água/luz, fechadura travada, vazamento ou ar-condicionado inoperante.',
      },
    },
    required: ['categoria_item', 'descricao_problema', 'urgencia'],
  },

  async execute(
    args: AbrirChamadoManutencaoArgs,
    context: ContextoSessaoInjetado
  ): Promise<AgentToolResponse> {
    try {
      const reserva = context.reserva_ativa || context.reserva_atual;
      if (!reserva) {
        const msg =
          'Peça desculpas pelo transtorno e pergunte em qual número de flat o hóspede está acomodado para acionar a manutenção imediatamente.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const db = context.runtime?.db;
      const flatNumber = reserva.nome_imovel.replace(/^Flat\s+/i, '').trim();
      const protocoloOs = `OS-${Date.now().toString(36).slice(-5).toUpperCase()}`;
      const todayStr = String(context.data_hora_atual || new Date().toISOString()).slice(0, 10);
      const checkoutStr = String(reserva.data_checkout || todayStr).slice(0, 10);

      let flatSugerido: string | null = null;
      if (Array.isArray(db?.flats)) {
        const reservations = Array.isArray(db?.reservations) ? db.reservations : [];
        const candidate = db.flats.find((f: any) => {
          const fNum = String(f?.number || f?.id || '');
          if (!fNum || fNum === flatNumber || f.isActive === false || f.status === 'maintenance') return false;
          const hasConflict = reservations.some((r: any) => {
            if (!r || r.status === 'cancelada' || r.status === 'cancelled') return false;
            if (String(r.flatNumber || '') !== fNum) return false;
            const rIn = String(r.checkinDate || '').slice(0, 10);
            const rOut = String(r.checkoutDate || '').slice(0, 10);
            return todayStr < rOut && checkoutStr > rIn;
          });
          return !hasConflict;
        });
        if (candidate) {
          flatSugerido = String(candidate.number || candidate.id);
        }
      }

      if (db) {
        if (!Array.isArray(db.serviceOrders)) db.serviceOrders = [];
        db.serviceOrders.unshift({
          id: protocoloOs,
          code: protocoloOs,
          flatNumber,
          reservationId: reserva.id,
          guestName: context.hospede?.nome || 'Hóspede',
          guestPhone: context.telefone_remetente,
          category: args.categoria_item,
          description: args.descricao_problema,
          priority: args.urgencia,
          status: 'pending_manager_approval',
          suggestedRelocationFlat: flatSugerido,
          createdAt: new Date().toISOString(),
        });
        if (!Array.isArray(db.pendingMaintenanceProposals)) {
          db.pendingMaintenanceProposals = [];
        }
        db.pendingMaintenanceProposals.unshift({
          id: `maint_${Date.now()}`,
          protocoloOs,
          status: 'pending_manager',
          reservationId: reserva.id,
          reservationCode: reserva.id,
          guestName: context.hospede?.nome || 'Hóspede',
          guestPhone: context.telefone_remetente,
          currentFlatNumber: flatNumber,
          suggestedFlatNumber: flatSugerido,
          category: args.categoria_item,
          description: args.descricao_problema,
          urgency: args.urgencia || 'MEDIA',
          checkinDate: reserva.data_checkin,
          checkoutDate: reserva.data_checkout,
          createdAt: new Date().toISOString(),
        });
        if (typeof context.runtime?.saveDatabase === 'function') {
          await context.runtime.saveDatabase();
        }
      }

      const plano1Texto = flatSugerido
        ? `1️⃣ *Remanejar para o Flat da Vez (Flat ${flatSugerido})* + Abrir OS no Flat ${flatNumber}`
        : `1️⃣ *Remanejar hóspede* (informe o nº do flat desejado) + Abrir OS no Flat ${flatNumber}`;
      const plano2Texto = `2️⃣ *Apenas abrir a Ordem de Serviço (OS)* para manutenção no Flat ${flatNumber} (sem remanejar)`;
      const plano3Texto = `3️⃣ *Não fazer nada no sistema* (deixar que você assume o atendimento diretamente)`;

      await notifyAdminWhatsApp({
        nivel_urgencia: args.urgencia || 'MEDIA',
        categoria: 'MANUTENCAO',
        hospede_nome: context.hospede?.nome || 'Hóspede',
        telefone: context.telefone_remetente,
        imovel: reserva.nome_imovel,
        resumo: `[${protocoloOs}] ${args.categoria_item}: ${args.descricao_problema}\n\n📋 *PLANOS DE AÇÃO PRONTOS:*\n${plano1Texto}\n${plano2Texto}\n${plano3Texto}`,
        context,
      });

      const msg =
        `Peça desculpas pelo inconveniente com muita empatia, informe ao hóspede que a ocorrência *${protocoloOs}* ` +
        `no *${reserva.nome_imovel}* (${args.categoria_item}) já foi enviada com prioridade diretamente para o WhatsApp da gerência ` +
        `com o plano de atendimento/manutenção pronto e que em instantes daremos o retorno imediato para solucionar.`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          protocolo_os: protocoloOs,
          imovel: reserva.nome_imovel,
          categoria_item: args.categoria_item,
          urgencia: args.urgencia,
          flat_sugerido_remanejamento: flatSugerido,
          planos_enviados_ao_gestor: [plano1Texto, plano2Texto, plano3Texto],
          administrador_notificado: true,
        },
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    } catch (error: any) {
      await notifyAdminWhatsApp({
        nivel_urgencia: 'CRITICA',
        categoria: 'MANUTENCAO',
        hospede_nome: context.hospede?.nome || 'Hóspede',
        telefone: context.telefone_remetente,
        resumo: `Falha ao gravar OS (${args.categoria_item} - ${args.descricao_problema}): ${error.message}`,
        context,
      });

      const msg =
        'Informe ao hóspede que você acabou de disparar um alerta direto para o WhatsApp da gerência e manutenção para atenderem o flat imediatamente.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

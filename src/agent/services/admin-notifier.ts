// src/agent/services/admin-notifier.ts

import { ContextoSessaoInjetado } from '../types/tool-contract';

export type NivelUrgenciaAdmin = 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';

export type CategoriaAlertaAdmin =
  | 'MANUTENCAO'
  | 'EXCECAO_COMERCIAL'
  | 'FINANCEIRO'
  | 'CONFLITO_REGRA'
  | 'SOLICITACAO_HUMANO'
  | 'ERRO_SISTEMA_TOOL'
  | string;

export interface AdminNotificationPayload {
  nivel_urgencia: NivelUrgenciaAdmin;
  categoria: CategoriaAlertaAdmin;
  hospede_nome: string;
  telefone: string;
  imovel?: string;
  resumo: string;
  link_conversa?: string;
  context?: ContextoSessaoInjetado;
}

export interface AdminNotificationResult {
  sent: boolean;
  adminPhone: string;
  formattedMessage: string;
  timestamp: string;
}

export function formatAdminAlertMessage(payload: AdminNotificationPayload): string {
  const urgenciaLabel = payload.nivel_urgencia === 'CRITICA' ? 'CRÍTICA' : payload.nivel_urgencia;
  const imovelSuffix = payload.imovel ? ` (${payload.imovel})` : '';
  const baseUrl =
    payload.context?.runtime?.db?.settings?.baseUrl ||
    (typeof process !== 'undefined' && process.env?.SERVER_BASE_URL) ||
    'https://corpflats.com.br';
  const cleanDigits = String(payload.telefone || '').replace(/\D+/g, '');
  const chatLink = payload.link_conversa || `${baseUrl}/whatsapp?phone=${cleanDigits}`;

  return [
    `🚨 *Alerta do Agente IA [URGÊNCIA: ${urgenciaLabel}]*`,
    `*Hóspede:* ${payload.hospede_nome || 'Desconhecido'}${imovelSuffix}`,
    `*Telefone:* ${payload.telefone || 'Não informado'}`,
    `*Categoria:* ${payload.categoria}`,
    `*Resumo:* ${payload.resumo}`,
    `*Link da conversa:* ${chatLink}`,
  ].join('\n');
}

export async function notifyAdminWhatsApp(
  payload: AdminNotificationPayload
): Promise<AdminNotificationResult> {
  const formattedMessage = formatAdminAlertMessage(payload);
  const runtime = payload.context?.runtime;
  const db = runtime?.db;

  const adminPhone = String(
    db?.settings?.adminWhatsapp ||
      db?.whatsappAiSettings?.adminPhone ||
      db?.zapiConfig?.adminPhone ||
      (typeof process !== 'undefined' && process.env?.ADMIN_WHATSAPP_PHONE) ||
      '5522998505276'
  ).replace(/\D+/g, '');

  const timestamp = new Date().toISOString();
  let sent = false;

  try {
    if (db) {
      if (!Array.isArray(db.adminAiAlerts)) {
        db.adminAiAlerts = [];
      }
      db.adminAiAlerts.unshift({
        id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        nivel_urgencia: payload.nivel_urgencia,
        categoria: payload.categoria,
        hospede_nome: payload.hospede_nome,
        telefone: payload.telefone,
        imovel: payload.imovel || payload.context?.reserva_ativa?.nome_imovel || null,
        resumo: payload.resumo,
        formattedMessage,
        createdAt: timestamp,
      });
    }

    if (typeof runtime?.createNotification === 'function') {
      await runtime.createNotification({
        type: 'ai_admin_alert',
        title: `Alerta Sofia IA [${payload.nivel_urgencia}] - ${payload.categoria}`,
        message: `${payload.hospede_nome}: ${payload.resumo}`,
        phone: payload.telefone,
        urgency: payload.nivel_urgencia,
        createdAt: timestamp,
      });
    }

    if (typeof runtime?.sendZapiMessage === 'function' && adminPhone) {
      await runtime.sendZapiMessage(adminPhone, formattedMessage, {
        channel: 'ai_agent',
        isAdminAlert: true,
      });
      sent = true;
    }

    if (typeof runtime?.saveDatabase === 'function') {
      await runtime.saveDatabase();
    }
  } catch (err) {
    console.warn('[AdminNotifier] Aviso ao disparar alerta para o administrador:', (err as Error)?.message || err);
  }

  return {
    sent,
    adminPhone,
    formattedMessage,
    timestamp,
  };
}

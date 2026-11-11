// src/agent/types/tool-contract.ts

export type EstadoSessao =
  | 'COMERCIAL_VENDAS'
  | 'PRE_CHECKIN'
  | 'IN_STAY_CONCIERGE'
  | 'POS_CHECKOUT'
  | 'MODO_COMERCIAL_LEAD'
  | 'MODO_PRE_CHECKIN'
  | 'MODO_CONCIERGE_INSTAY'
  | 'MODO_POS_CHECKOUT';

export type PerfilRemetente = 'HOSPEDE_ATIVO' | 'LEAD_DESCONHECIDO';

export interface DadosHospedeSessao {
  id: string;
  nome: string;
  telefone?: string;
}

export interface OfertaDomingoSemPressaSessao {
  ofertada: boolean;
  status: 'PENDENTE_PAGAMENTO' | 'HOLD_EXPIRADO' | 'CONFIRMADA_PAGA';
  data_envio?: string;
  percentual_desconto?: number;
  valor_promocional: number;
  valor_normal: number;
  economia: number;
  bonus_segunda_ate: string;
  hold_expirado: boolean;
  hold_expira_em?: string;
  codigo_pix_copia_e_cola?: string;
}

export interface ReservaAtivaSessao {
  id: string;
  reserva_id?: string;
  imovel_id: string;
  nome_imovel: string;
  data_checkin: string;
  data_checkout: string;
  check_in?: string;
  check_out?: string;
  status_pagamento: 'PENDENTE' | 'PAGO_INTEGRALMENTE';
  quantidade_hospedes?: number;
  canal_reserva?: string;
  canal_reserva_nome?: string;
  senha_fechadura?: string;
  wifi_rede?: string;
  wifi_senha?: string;
  email_cadastrado?: string | null;
  alerta_email_incorreto?: {
    status: 'AGUARDANDO_CORRECAO';
    email_invalido: string;
    email_sugerido?: string | null;
    solicitado_em?: string | null;
  } | null;
  oferta_domingo_sem_pressa?: OfertaDomingoSemPressaSessao;
}

export interface ContextoSessaoInjetado {
  data_hora_atual: string;
  telefone_remetente: string;
  perfil_remetente?: PerfilRemetente;
  estado_atual: EstadoSessao;
  hospede?: DadosHospedeSessao;
  dados_hospede?: DadosHospedeSessao;
  reserva_ativa?: ReservaAtivaSessao;
  reserva_atual?: ReservaAtivaSessao;
  /**
   * Referência opcional de runtime ao banco e serviços para execução real no backend
   */
  runtime?: {
    db?: any;
    saveDatabase?: () => void | Promise<void>;
    sendZapiMessage?: (phone: string, text: string, options?: any) => Promise<any>;
    createNotification?: (notif: any) => void | Promise<void>;
    triggerImmediateWhatsApp?: (...args: any[]) => Promise<any>;
    conversation?: any;
  };
}

export type StatusExecucaoTool =
  | 'SUCESSO_EXECUTADO'
  | 'SIMULACAO_AGUARDANDO_CONFIRMACAO'
  | 'AGUARDANDO_CONFIRMACAO_HOSPEDE'
  | 'BLOQUEADO_PELA_REGRA'
  | 'ADMINISTRADOR_NOTIFICADO'
  | 'ERRO_REQUER_HUMANO';

export interface AgentToolResponse<T = Record<string, unknown>> {
  status: StatusExecucaoTool;
  dados?: T;
  codigo_regra_bloqueio?: string;
  motivo_tecnico?: string;
  /**
   * CAMPO OBRIGATÓRIO:
   * Instrua claramente a IA sobre o que aconteceu no sistema e como ela deve
   * responder ao hóspede (tom de voz, valores exatos, alternativas ou motivo da recusa).
   */
  instrucao_para_ia: string;
  /**
   * Alias de compatibilidade com a especificação de arquitetura (`instrucao_resposta_ia`)
   */
  instrucao_resposta_ia?: string;
}

export interface AgentToolDefinition<TArgs = any> {
  name: string;
  description: string;
  allowedStates: EstadoSessao[];
  parametersSchema: Record<string, unknown>;
  execute: (args: TArgs, context: ContextoSessaoInjetado) => Promise<AgentToolResponse>;
}

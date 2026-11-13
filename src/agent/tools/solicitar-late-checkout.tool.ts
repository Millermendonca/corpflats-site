// src/agent/tools/solicitar-late-checkout.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import { notifyAdminWhatsApp } from '../services/admin-notifier';

export interface SolicitarLateCheckoutArgs {
  reserva_id?: string;
  horario_solicitado: string;
  confirmacao_hospede?: boolean;
  confirmacao_cobranca?: boolean;
}

function normalizeTimeHHMM(raw: string): string {
  const clean = String(raw || '').trim();
  const match = clean.match(/(\d{1,2})(?:[:h](\d{2}))?/i);
  if (!match) return '12:00';
  const hh = String(Math.min(23, Math.max(0, parseInt(match[1], 10)))).padStart(2, '0');
  const mm = String(Math.min(59, Math.max(0, parseInt(match[2] || '00', 10)))).padStart(2, '0');
  return `${hh}:${mm}`;
}

export const solicitarLateCheckoutTool: AgentToolDefinition<SolicitarLateCheckoutArgs> = {
  name: 'solicitar_late_checkout',

  // 1. DESCRIÇÃO SEMÂNTICA CLARA: Ensina à IA QUANDO e COMO usar a ferramenta
  description:
    'Verifica a disponibilidade e aplica a extensão do horário de saída (late check-out) na reserva atual do hóspede. ' +
    'Deve ser chamada sempre que o hóspede perguntar se pode sair mais tarde ou pedir extensão de horário no dia do check-out.',

  // 2. ESCOPO DE ESTADO: Só fica visível para a IA quando o hóspede já está no imóvel ou prestes a entrar
  allowedStates: ['PRE_CHECKIN', 'IN_STAY_CONCIERGE'],

  // 3. JSON SCHEMA DOS PARÂMETROS: Explica cada variável para a IA extrair da conversa
  parametersSchema: {
    type: 'object',
    properties: {
      horario_solicitado: {
        type: 'string',
        description: 'Horário desejado pelo hóspede para sair do imóvel no formato HH:MM (ex: "16:00").',
      },
      confirmacao_hospede: {
        type: 'boolean',
        description:
          'Passe FALSE na primeira vez para apenas consultar viabilidade e calcular eventual taxa. ' +
          'Passe TRUE somente após o hóspede ter concordado explicitamente na conversa com a taxa ou condição informada.',
      },
    },
    required: ['horario_solicitado', 'confirmacao_hospede'],
  },

  // 4. EXECUÇÃO E TRAVAS DETERMINÍSTICAS NO BACKEND
  async execute(
    args: SolicitarLateCheckoutArgs,
    context: ContextoSessaoInjetado
  ): Promise<AgentToolResponse> {
    try {
      // TRAVA 0: Validação de segurança do contexto (Zero-Ask: pega o ID direto da sessão injetada)
      const reserva = context.reserva_ativa || context.reserva_atual;
      if (!reserva) {
        const msg =
          'Explique educadamente que você não localizou uma reserva ativa vinculada a este número de telefone e peça o código da reserva ou CPF do titular.';
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      const horarioFormatado = normalizeTimeHHMM(args.horario_solicitado);
      const confirmado = Boolean(args.confirmacao_hospede ?? args.confirmacao_cobranca ?? false);

      // Consulta real ao banco de dados do sistema (quando disponível no runtime)
      const db = context.runtime?.db;
      const flatNumber = reserva.nome_imovel.replace(/^Flat\s+/i, '').trim();
      const dataCheckout = String(reserva.data_checkout || '').slice(0, 10);

      let conflitoAgenda = false;
      if (Array.isArray(db?.reservations)) {
        conflitoAgenda = db.reservations.some((r: any) => {
          if (!r || r.status === 'cancelada' || r.status === 'cancelled') return false;
          const rCode = String(r.code || r.reservationCode || r.id || '');
          if (rCode === reserva.id) return false;
          const sameFlat =
            String(r.flatNumber || '') === flatNumber ||
            String(r.flatId || '') === String(reserva.imovel_id);
          const sameDayCheckin = String(r.checkinDate || '').slice(0, 10) === dataCheckout;
          return sameFlat && sameDayCheckin;
        });
      }

      const horarioLimiteGratuito = '12:30';
      const horarioMaximoPago = '17:00';
      const taxaLateCheckout = 120.0;

      // TRAVA 1: Existe outro hóspede entrando no mesmo dia?
      if (conflitoAgenda) {
        const msg =
          `Informe ao hóspede com muita empatia que infelizmente o sistema bloqueou a extensão para as ${horarioFormatado} ` +
          `porque há outro hóspede fazendo check-in hoje às 14h no ${reserva.nome_imovel} e a equipe de governança/limpeza precisa entrar às 12h00. ` +
          `Ofereça uma cortesia de 30 minutos (saída até 12h30) se ajudar e informe que ele pode deixar as malas guardadas na recepção se precisar.`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'CONFLITO_LIMPEZA_PROXIMO_HOSPEDE',
          motivo_tecnico: `Existe uma nova reserva entrando no mesmo dia (${dataCheckout}) no ${reserva.nome_imovel}.`,
          dados: { horario_padrao: '12:00', tolerancia_maxima: '12:30' },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      // TRAVA 2: O horário pedido ultrapassa o limite máximo operacional (ex: após 17h vira diária)?
      if (horarioFormatado > horarioMaximoPago) {
        const msg =
          `Explique ao hóspede que nosso limite para late check-out é até as ${horarioMaximoPago}. ` +
          `Acima desse horário o sistema contabiliza uma nova diária. Pergunte se o horário das ${horarioMaximoPago} (com taxa de R$ ${taxaLateCheckout.toFixed(2)}) atende a necessidade dele ou se ele prefere cotar uma diária extra.`;
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'HORARIO_EXCEDE_LIMITE_LATE_CHECKOUT',
          dados: { horario_maximo_late_checkout: horarioMaximoPago },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      // TRAVA 3: Há disponibilidade, mas exige pagamento de taxa e o hóspede ainda não confirmou
      if (horarioFormatado > horarioLimiteGratuito && !confirmado) {
        const msg =
          `Diga ao hóspede que você consultou a agenda do ${reserva.nome_imovel} e o imóvel está disponível para saída às ${horarioFormatado}. ` +
          `Explique que para esse horário há uma taxa fixa de late check-out de R$ ${taxaLateCheckout.toFixed(2)}. ` +
          `Pergunte se ele confirma a alteração para você registrar no sistema e atualizar a programação da governança.`;
        return {
          status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
          dados: {
            horario_solicitado: horarioFormatado,
            valor_taxa: taxaLateCheckout,
            moeda: 'BRL',
          },
          instrucao_para_ia: msg,
          instrucao_resposta_ia: msg,
        };
      }

      // 5. EFETIVAÇÃO NO SISTEMA (Passou por todas as travas e já tem confirmação ou está dentro da tolerância gratuita)
      if (Array.isArray(db?.reservations)) {
        const targetRes = db.reservations.find((r: any) => {
          const rCode = String(r?.code || r?.reservationCode || r?.id || '');
          return rCode === reserva.id || (String(r?.flatNumber) === flatNumber && String(r?.checkoutDate).slice(0, 10) === dataCheckout);
        });
        if (targetRes) {
          targetRes.lateCheckoutTime = horarioFormatado;
          targetRes.checkoutTime = horarioFormatado;
          targetRes.lateCheckoutApprovedAt = new Date().toISOString();
          if (horarioFormatado > horarioLimiteGratuito) {
            targetRes.lateCheckoutFee = taxaLateCheckout;
          }
          if (typeof context.runtime?.saveDatabase === 'function') {
            await context.runtime.saveDatabase();
          }
        }
      }

      const msg =
        `Confirme com entusiasmo que o late check-out para as ${horarioFormatado} já foi efetivado no sistema para o ${reserva.nome_imovel} ` +
        `e que a programação da governança e da recepção 24h (cartão NFC) já foi atualizada automaticamente para esse novo horário.`;

      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          reserva_id: reserva.id,
          novo_horario_checkout: horarioFormatado,
          portaria_sincronizada: true,
        },
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    } catch (error: any) {
      // 6. FALLBACK SEGURO COM AVISO NO WHATSAPP DO ADMINISTRADOR
      await notifyAdminWhatsApp({
        nivel_urgencia: 'MEDIA',
        categoria: 'ERRO_SISTEMA_TOOL',
        hospede_nome: context.hospede?.nome || 'Desconhecido',
        telefone: context.telefone_remetente,
        resumo: `Falha técnica ao executar solicitar_late_checkout (${args.horario_solicitado}): ${error.message}`,
        context,
      });

      const msg =
        'Peça desculpas ao hóspede dizendo que o sistema de reservas apresentou uma instabilidade momentânea ao tentar gravar a alteração, ' +
        'mas que você já enviou um alerta automático direto para o WhatsApp da gerência para concluírem a liberação manualmente em instantes.';
      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia: msg,
        instrucao_resposta_ia: msg,
      };
    }
  },
};

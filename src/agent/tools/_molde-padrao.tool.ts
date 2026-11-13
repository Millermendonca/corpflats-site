// src/agent/tools/_molde-padrao.tool.ts
// ARQUIVO DE REFERÊNCIA ARQUITETURAL — Copie esta estrutura para qualquer nova Tool do Agente

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import { notifyAdminWhatsApp } from '../services/admin-notifier';

export interface MoldePadraoArgs {
  horario_solicitado: string;
  confirmacao_hospede: boolean;
}

export const moldePadraoTool: AgentToolDefinition<MoldePadraoArgs> = {
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
    args: MoldePadraoArgs,
    context: ContextoSessaoInjetado
  ): Promise<AgentToolResponse> {
    try {
      // TRAVA 0: Validação de segurança do contexto (Zero-Ask: pega o ID direto da sessão injetada)
      const reserva = context.reserva_ativa;
      if (!reserva) {
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
          instrucao_para_ia:
            'Explique educadamente que você não localizou uma reserva ativa vinculada a este número de telefone e peça o código da reserva ou CPF do titular.',
        };
      }

      const conflitoAgenda = false;
      const horarioLimiteGratuito = '12:00';
      const horarioMaximoPago = '17:00';
      const taxaLateCheckout = 120.0;

      // TRAVA 1: Existe outro hóspede entrando no mesmo dia?
      if (conflitoAgenda) {
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'CONFLITO_LIMPEZA_PROXIMO_HOSPEDE',
          dados: { horario_padrao: '11:00', tolerancia_maxima: '11:30' },
          instrucao_para_ia:
            `Informe ao hóspede com muita empatia que infelizmente o sistema bloqueou a extensão para as ${args.horario_solicitado} ` +
            `porque há outro hóspede fazendo check-in hoje às 15h no ${reserva.nome_imovel} e a equipe de limpeza entra às 11h30. ` +
            `Ofereça uma cortesia de 30 minutos (saída até 11h30) e informe que ele pode deixar as malas guardadas na recepção se precisar.`,
        };
      }

      // TRAVA 2: O horário pedido ultrapassa o limite máximo operacional (ex: após 17h vira diária)?
      if (args.horario_solicitado > horarioMaximoPago) {
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'HORARIO_EXCEDE_LIMITE_LATE_CHECKOUT',
          dados: { horario_maximo_late_checkout: horarioMaximoPago },
          instrucao_para_ia:
            `Explique ao hóspede que nosso limite para late check-out é até as ${horarioMaximoPago}. ` +
            `Acima desse horário o sistema contabiliza uma nova diária. Pergunte se o horário das ${horarioMaximoPago} (com taxa de R$ ${taxaLateCheckout}) atende a necessidade dele ou se ele prefere cotar uma diária extra.`,
        };
      }

      // TRAVA 3: Há disponibilidade, mas exige pagamento de taxa e o hóspede ainda não confirmou
      if (args.horario_solicitado > horarioLimiteGratuito && !args.confirmacao_hospede) {
        return {
          status: 'SIMULACAO_AGUARDANDO_CONFIRMACAO',
          dados: {
            horario_solicitado: args.horario_solicitado,
            valor_taxa: taxaLateCheckout,
            moeda: 'BRL',
          },
          instrucao_para_ia:
            `Diga ao hóspede que você consultou a agenda do ${reserva.nome_imovel} e o imóvel está disponível para saída às ${args.horario_solicitado}. ` +
            `Explique que para esse horário há uma taxa fixa de late check-out de R$ ${taxaLateCheckout.toFixed(2)}. ` +
            `Pergunte se ele confirma a alteração para você registrar no sistema e atualizar a validade da senha da fechadura.`,
        };
      }

      // 5. EFETIVAÇÃO NO SISTEMA (Passou por todas as travas e já tem confirmação)
      return {
        status: 'SUCESSO_EXECUTADO',
        dados: {
          reserva_id: reserva.id,
          novo_horario_checkout: args.horario_solicitado,
          fechadura_sincronizada: true,
        },
        instrucao_para_ia:
          `Confirme com entusiasmo que o late check-out para as ${args.horario_solicitado} já foi efetivado no sistema para o ${reserva.nome_imovel} ` +
          `e que a senha da fechadura eletrônica dele já foi atualizada automaticamente para funcionar até esse novo horário.`,
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

      return {
        status: 'ERRO_REQUER_HUMANO',
        instrucao_para_ia:
          'Peça desculpas ao hóspede dizendo que o sistema de reservas apresentou uma instabilidade momentânea ao tentar gravar a alteração, ' +
          'mas que você já enviou um alerta automático direto para o WhatsApp da gerência para concluírem a liberação manualmente em instantes.',
      };
    }
  },
};

// src/agent/tools/index.ts

import {
  AgentToolDefinition,
  AgentToolResponse,
  ContextoSessaoInjetado,
  EstadoSessao,
} from '../types/tool-contract';
import { consultarDisponibilidadeTool } from './consultar-disponibilidade.tool';
import { calcularOrcamentoTool } from './calcular-orcamento.tool';
import { gerarLinkReservaTool } from './gerar-link-reserva.tool';
import { consultarDetalhesReservaTool } from './consultar-detalhes-reserva.tool';
import { atualizarDadosHospedeTool } from './atualizar-dados-hospede.tool';
import { solicitarEarlyCheckinTool } from './solicitar-early-checkin.tool';
import { solicitarLateCheckoutTool } from './solicitar-late-checkout.tool';
import { alterarDatasReservaTool } from './alterar-datas-reserva.tool';
import { estenderEstadiaTool } from './estender-estadia.tool';
import { solicitarLimpezaExtraTool } from './solicitar-limpeza-extra.tool';
import { abrirChamadoManutencaoTool } from './abrir-chamado-manutencao.tool';
import { resolverProblemaCartaoNfcTool } from './resolver-problema-cartao-nfc.tool';
import { autorizarVisitaTemporariaTool } from './autorizar-visita-temporaria.tool';
import { processarCancelamentoTool } from './processar-cancelamento.tool';
import { enviarMidiaUnidadeTool } from './enviar-midia-unidade.tool';
import { consultarAchadosEPerdidosTool } from './consultar-achados-e-perdidos.tool';
import {
  gerenciarNotaFiscalNfseTool,
  buildStandardStayDescription,
} from './gerenciar-nota-fiscal-nfse.tool';
import { notificarAdministradorTool } from './notificar-administrador.tool';

export {
  consultarDisponibilidadeTool,
  calcularOrcamentoTool,
  gerarLinkReservaTool,
  consultarDetalhesReservaTool,
  atualizarDadosHospedeTool,
  solicitarEarlyCheckinTool,
  solicitarLateCheckoutTool,
  alterarDatasReservaTool,
  estenderEstadiaTool,
  solicitarLimpezaExtraTool,
  abrirChamadoManutencaoTool,
  resolverProblemaCartaoNfcTool,
  autorizarVisitaTemporariaTool,
  processarCancelamentoTool,
  enviarMidiaUnidadeTool,
  consultarAchadosEPerdidosTool,
  gerenciarNotaFiscalNfseTool,
  buildStandardStayDescription,
  notificarAdministradorTool,
};

export const ALL_AGENT_TOOLS: AgentToolDefinition<any>[] = [
  consultarDisponibilidadeTool,
  calcularOrcamentoTool,
  gerarLinkReservaTool,
  consultarDetalhesReservaTool,
  atualizarDadosHospedeTool,
  solicitarEarlyCheckinTool,
  solicitarLateCheckoutTool,
  alterarDatasReservaTool,
  estenderEstadiaTool,
  solicitarLimpezaExtraTool,
  abrirChamadoManutencaoTool,
  resolverProblemaCartaoNfcTool,
  autorizarVisitaTemporariaTool,
  processarCancelamentoTool,
  enviarMidiaUnidadeTool,
  consultarAchadosEPerdidosTool,
  gerenciarNotaFiscalNfseTool,
  notificarAdministradorTool,
];

export function getToolsForState(estado: EstadoSessao): AgentToolDefinition<any>[] {
  return ALL_AGENT_TOOLS.filter((tool) => tool.allowedStates.includes(estado));
}

export function getGeminiFunctionDeclarationsForState(
  estado: EstadoSessao
): Array<Record<string, unknown>> {
  return getToolsForState(estado).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parametersSchema,
  }));
}

export function isRegisteredAgentTool(toolName: string): boolean {
  return ALL_AGENT_TOOLS.some((t) => t.name === toolName);
}

export async function executeRegisteredAgentTool(
  toolName: string,
  args: Record<string, any>,
  context: ContextoSessaoInjetado
): Promise<AgentToolResponse> {
  const tool = ALL_AGENT_TOOLS.find((t) => t.name === toolName);
  if (!tool) {
    const msg = `A ferramenta '${toolName}' não existe no registro oficial. Informe ao hóspede que você encaminhará a solicitação para a recepção.`;
    return {
      status: 'ERRO_REQUER_HUMANO',
      codigo_regra_bloqueio: 'TOOL_NAO_ENCONTRADA',
      instrucao_para_ia: msg,
      instrucao_resposta_ia: msg,
    };
  }

  const res = await tool.execute(args || {}, context);
  const instrucao = res.instrucao_para_ia || res.instrucao_resposta_ia || '';
  return {
    ...res,
    instrucao_para_ia: instrucao,
    instrucao_resposta_ia: instrucao,
  };
}

/**
 * Garante que qualquer tool (inclusive as ferramentas já existentes do sistema)
 * cumpra a Lei 3 (Contrato Obrigatório de Retorno Instrucional `AgentToolResponse`)
 * mantendo total retrocompatibilidade com os campos originais.
 */
export function ensureInstructionalToolResponse(
  actionName: string,
  rawResult: Record<string, any> | null | undefined
): AgentToolResponse & Record<string, any> {
  if (!rawResult || typeof rawResult !== 'object') {
    const fallbackMsg =
      'Informe ao hóspede com cordialidade o resultado da consulta ou encaminhe para a recepção caso necessário.';
    return {
      status: 'SUCESSO_EXECUTADO',
      dados: { raw: rawResult },
      instrucao_para_ia: fallbackMsg,
      instrucao_resposta_ia: fallbackMsg,
    };
  }

  if (typeof rawResult.instrucao_para_ia === 'string' && rawResult.instrucao_para_ia.trim()) {
    return {
      ...rawResult,
      status: rawResult.status || 'SUCESSO_EXECUTADO',
      instrucao_para_ia: rawResult.instrucao_para_ia,
      instrucao_resposta_ia: rawResult.instrucao_resposta_ia || rawResult.instrucao_para_ia,
    };
  }

  if (rawResult.error || rawResult.ok === false) {
    const errReason = rawResult.message || rawResult.error || 'Operação bloqueada ou indisponível no momento.';
    const isRuleBlock =
      rawResult.error === 'NO_AVAILABILITY' ||
      rawResult.error === 'FLAT_UNAVAILABLE' ||
      rawResult.error === 'INVALID_DATES' ||
      rawResult.available === false;
    const status = isRuleBlock
      ? 'BLOQUEADO_PELA_REGRA'
      : rawResult.requiresHandover
      ? 'ERRO_REQUER_HUMANO'
      : 'BLOQUEADO_PELA_REGRA';
    const instrucao =
      `A ferramenta '${actionName}' retornou: ${errReason}. ` +
      `Explique ao hóspede com empatia e naturalidade os fatos exatos acima, sem usar jargões técnicos.`;
    return {
      ...rawResult,
      status,
      codigo_regra_bloqueio: String(rawResult.error || 'REGRA_BACKEND'),
      dados: rawResult,
      instrucao_para_ia: instrucao,
      instrucao_resposta_ia: instrucao,
    };
  }

  const summaryMsg =
    rawResult.message ||
    `Operação '${actionName}' executada com sucesso no backend. Utilize os valores e dados exatos retornados no objeto para responder ao hóspede de forma natural e objetiva no WhatsApp.`;

  return {
    ...rawResult,
    status: rawResult.status || 'SUCESSO_EXECUTADO',
    dados: rawResult.dados || rawResult,
    instrucao_para_ia: summaryMsg,
    instrucao_resposta_ia: summaryMsg,
  };
}

// src/agent/index.ts

import { ContextoSessaoInjetado, EstadoSessao } from './types/tool-contract';
import { buildComercialPrompt } from './prompts/comercial.prompt';
import { buildPreCheckinPrompt } from './prompts/pre-checkin.prompt';
import { buildInStayPrompt } from './prompts/in-stay.prompt';

export * from './types/tool-contract';
export * from './middleware/context-injector';
export * from './services/admin-notifier';
export * from './prompts/comercial.prompt';
export * from './prompts/pre-checkin.prompt';
export * from './prompts/in-stay.prompt';
export * from './tools/index';

export function buildStateRoutedPrompt(
  context: ContextoSessaoInjetado,
  manualImovel?: string
): string {
  const estado: EstadoSessao = context.estado_atual || 'COMERCIAL_VENDAS';
  switch (estado) {
    case 'IN_STAY_CONCIERGE':
      return buildInStayPrompt(context, manualImovel);
    case 'PRE_CHECKIN':
      return buildPreCheckinPrompt(context, manualImovel);
    case 'COMERCIAL_VENDAS':
    default:
      return buildComercialPrompt(context, manualImovel);
  }
}

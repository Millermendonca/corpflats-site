# Diretrizes do Projeto Guest-Flow-Manager (CorpFlats)

## Git & Controle de Versão
- **Sempre fazer `git push` por padrão**: Sempre que um `git commit` for realizado para implementar ou corrigir uma funcionalidade, execute imediatamente o `git push` para o repositório remoto (`origin main` ou a branch ativa). Nunca deixe commits pendentes localmente sem envio.
- **Build de Verificação**: Ao alterar arquivos em `artifacts/limpeza/src`, rode o build (`npm run build` na pasta `artifacts/limpeza`) e inclua os arquivos gerados em `artifacts/limpeza/dist/` no commit quando aplicável para garantir o deploy contínuo em produção.

## Execução de Testes (Escopo Estrito e Não Solicitação)
- **NUNCA executar testes globais, varreduras ou em lote**: É terminantemente PROIBIDO rodar `tests/*.test.mjs`, scripts que varrem a pasta `tests/`, ou suítes completas do projeto.
- **Apenas o teste estritamente pontual do que foi alterado**: Ao criar ou corrigir uma funcionalidade específica, execute EXCLUSIVAMENTE o arquivo de teste pontual diretamente associado àquela alteração (ex: se alterou a reserva RES-605, rode apenas o teste pontual daquela reserva).
- **Proibido rodar testes de outros módulos**: Nunca execute testes de módulos não envolvidos na tarefa solicitada pelo usuário (ex: ordens de serviço, governança, café da manhã, garagem, etc. quando a tarefa for de reservas ou chat).
- **Sem mascarar/silenciar notificações em código**: Os disparos de mensagens nos testes NÃO devem ser desativados ou silenciados no código. O comportamento correto é o agente NÃO disparar testes desnecessários ou não solicitados. Testes só devem ser executados se fizerem parte estrita da demanda atual do usuário.

---

# AGENTS.md — Constituição Arquitetural do Agente de IA (WhatsApp)

> **ATENÇÃO, AGENTE CODIFICADOR (ANTIGRAVITY / AI ASSISTANT):**
> Este arquivo contém as **leis imutáveis de arquitetura** deste repositório. Você DEVE ler e obedecer rigorosamente a todas as diretrizes abaixo antes de criar, editar ou refatorar qualquer endpoint, ferramenta (Tool), prompt ou fluxo de conversa do WhatsApp. Qualquer código que viole estes princípios é considerado defeituoso.

---

## 1. As 5 Leis Imutáveis do Projeto

### Lei 1: Proibido Criar Scripts ou Fluxos Engessados (Zero Hardcoding Conversacional)
* **NUNCA** utilize blocos `if/else`, `switch/case` ou expressões regulares (Regex) no código para tentar adivinhar o que o hóspede escreveu ou forçar menus numéricos ("Digite 1 para...").
* A interpretação da intenção do usuário e a extração de dados da conversa pertencem **100% à LLM via Tool Calling**.

### Lei 2: Regras de Negócio e Travas Ficam no Backend, NUNCA no System Prompt
* **NUNCA** escreva regras de negócio críticas (como cálculo de taxas, validação de horários disponíveis, limites de tolerância ou permissões de acesso) dentro do texto do System Prompt esperando que a IA faça a conta ou respeite a trava sozinha.
* A IA apenas coleta a intenção e chama a Tool; **o código do Backend valida no banco de dados** se a ação é permitida ou bloqueada.

### Lei 3: Contrato Obrigatório de Retorno Instrucional (`AgentToolResponse`)
* Nenhuma função de Tool chamada pela IA pode retornar valores primitivos (`true`/`false`), objetos soltos sem contexto ou estourar exceções HTTP cruas (`400 Bad Request`, `500 Internal Error`) direto para a LLM.
* **TODAS** as ferramentas devem retornar obrigatoriamente a interface `AgentToolResponse` contendo o campo `instrucao_para_ia`, explicando exatamente como o agente deve responder ao hóspede naquele cenário específico.

### Lei 4: Arquitetura Plug-and-Play (Princípio Aberto-Fechado)
* O motor central do Webhook, o Middleware de Injeção de Contexto e o Orquestrador da LLM **NÃO DEVEM SER ALTERADOS** quando uma nova funcionalidade for solicitada.
* Para criar uma nova capacidade ou endpoint para o agente, você deve apenas criar um novo arquivo isolado dentro de `src/agent/tools/` copiando a estrutura do Molde Oficial (Seção 4 deste documento) e registrá-lo no índice de ferramentas (`src/agent/tools/index.ts`).

### Lei 5: Transbordo Inteligente para o WhatsApp do Administrador
* Sempre que uma validação de backend cair em um cenário crítico (manutenção urgente, conflito de reserva grave ou insistência do hóspede após bloqueio de regra), a execução deve acionar o serviço interno `notifyAdminWhatsApp()` ou orientar a IA via `instrucao_para_ia` a chamar a tool `notificar_administrador`.

---

## 2. Estrutura de Pastas Oficial

Mantenha a separação estrita de responsabilidades seguindo esta árvore de diretórios:

```text
src/
└── agent/
    ├── types/
    │   └── tool-contract.ts         # Contratos e interfaces obrigatórias (NÃO REMOVER)
    ├── middleware/
    │   └── context-injector.ts      # Busca hóspede/reserva pelo telefone antes de chamar a IA
    ├── prompts/
    │   ├── comercial.prompt.ts      # Prompt enxuto para Leads sem reserva
    │   ├── pre-checkin.prompt.ts    # Prompt enxuto para reservas futuras
    │   └── in-stay.prompt.ts        # Prompt enxuto para hóspedes atuais (Concierge)
    ├── services/
    │   └── admin-notifier.ts        # Disparo de alertas para o WhatsApp pessoal do gestor
    └── tools/
        ├── index.ts                              # Registro central que exporta as tools por Estado
        ├── _molde-padrao.tool.ts                 # Arquivo de referência arquitetural
        ├── consultar-disponibilidade.tool.ts     # [COMERCIAL / PRE / IN_STAY] Disponibilidade de flats
        ├── calcular-orcamento.tool.ts            # [COMERCIAL / PRE / IN_STAY] Cotação de diárias e taxas
        ├── gerar-link-reserva.tool.ts            # [COMERCIAL] Pré-reserva 30min + chave PIX (2 etapas)
        ├── consultar-detalhes-reserva.tool.ts    # [PRE / IN_STAY] Detalhes da reserva ativa (Zero-Ask)
        ├── atualizar-dados-hospede.tool.ts       # [PRE / IN_STAY] Atualização cadastral e acompanhantes
        ├── solicitar-early-checkin.tool.ts       # [PRE / IN_STAY] Entrada antecipada com trava de governança
        ├── solicitar-late-checkout.tool.ts       # [PRE / IN_STAY] Saída estendida com trava de agenda e taxa
        ├── alterar-datas-reserva.tool.ts         # [PRE / IN_STAY] Alteração de datas (simulação + efetivação)
        ├── estender-estadia.tool.ts              # [PRE / IN_STAY] Prorrogação de estadia
        ├── solicitar-limpeza-extra.tool.ts       # [IN_STAY] Governança, enxoval e limpeza extra
        ├── abrir-chamado-manutencao.tool.ts      # [IN_STAY] Ordem de Serviço (OS) + alerta ao gestor
        ├── gerenciar-nota-fiscal-nfse.tool.ts    # [PRE / IN_STAY] Conferência, edição e confirmação de NFS-e
        └── notificar-administrador.tool.ts       # [TODOS OS ESTADOS] Transbordo imediato para o WhatsApp do gestor
```

---

## 3. Contrato de Tipagem Obrigatório (`src/agent/types/tool-contract.ts`)

Todo arquivo de ferramenta dentro de `src/agent/tools/` **DEVE** importar e respeitar este contrato. O compilador deve falhar caso o retorno de uma ferramenta não inclua `instrucao_para_ia`.

```typescript
// src/agent/types/tool-contract.ts

export type EstadoSessao = 'COMERCIAL_VENDAS' | 'PRE_CHECKIN' | 'IN_STAY_CONCIERGE';

export interface ContextoSessaoInjetado {
  data_hora_atual: string;
  telefone_remetente: string;
  estado_atual: EstadoSessao;
  hospede?: {
    id: string;
    nome: string;
  };
  reserva_ativa?: {
    id: string;
    imovel_id: string;
    nome_imovel: string;
    data_checkin: string;
    data_checkout: string;
    status_pagamento: 'PENDENTE' | 'PAGO_INTEGRALMENTE';
  };
}

export type StatusExecucaoTool =
  | 'SUCESSO_EXECUTADO'
  | 'SIMULACAO_AGUARDANDO_CONFIRMACAO'
  | 'BLOQUEADO_PELA_REGRA'
  | 'ERRO_REQUER_HUMANO';

export interface AgentToolResponse<T = Record<string, unknown>> {
  status: StatusExecucaoTool;
  dados?: T;
  codigo_regra_bloqueio?: string;
  /**
   * CAMPO OBRIGATÓRIO:
   * Instrua claramente a IA sobre o que aconteceu no sistema e como ela deve
   * responder ao hóspede (tom de voz, valores exatos, alternativas ou motivo da recusa).
   */
  instrucao_para_ia: string;
}

export interface AgentToolDefinition<TArgs = any> {
  name: string;
  description: string;
  allowedStates: EstadoSessao[];
  parametersSchema: Record<string, unknown>;
  execute: (args: TArgs, context: ContextoSessaoInjetado) => Promise<AgentToolResponse>;
}
```

---

## 4. Molde Oficial de Tool (`src/agent/tools/_molde-padrao.tool.ts`)

> **INSTRUÇÃO PARA O ANTIGRAVITY:** Sempre que o usuário pedir para criar uma nova ação, endpoint ou integração para a IA usar no sistema, **copie exatamente a estrutura abaixo**. Nunca crie endpoints fora deste padrão.

```typescript
// src/agent/tools/solicitar-late-checkout.tool.ts

import { AgentToolDefinition, AgentToolResponse, ContextoSessaoInjetado } from '../types/tool-contract';
import { notifyAdminWhatsApp } from '../services/admin-notifier';
// Importe aqui os serviços reais do seu banco de dados / ERP:
// import { reservasRepository, fechaduraService } from '../../services/...';

interface SolicitarLateCheckoutArgs {
  horario_solicitado: string;
  confirmacao_hospede: boolean;
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
      const reserva = context.reserva_ativa;
      if (!reserva) {
        return {
          status: 'BLOQUEADO_PELA_REGRA',
          codigo_regra_bloqueio: 'SEM_RESERVA_ATIVA',
          instrucao_para_ia:
            'Explique educadamente que você não localizou uma reserva ativa vinculada a este número de telefone e peça o código da reserva ou CPF do titular.',
        };
      }

      // Simulação de consulta ao banco de dados do sistema
      // const conflitoAgenda = await reservasRepository.verificarCheckinMesmoDia(reserva.imovel_id, reserva.data_checkout);
      const conflitoAgenda = false; // Exemplo
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
      // await reservasRepository.atualizarHorarioCheckout(reserva.id, args.horario_solicitado);
      // await fechaduraService.estenderValidadeSenha(reserva.imovel_id, args.horario_solicitado);

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
```

---

## 5. Checklist Obrigatório antes de Entregar Código Novo

Sempre que o usuário solicitar uma nova funcionalidade ou alteração no agente, verifique se você cumpriu **todos** os itens abaixo:

1. [ ] **Zero Perguntas Redundantes:** A ferramenta pega `reserva_id`, `imovel_id` e `hospede_id` diretamente do parâmetro `context: ContextoSessaoInjetado` em vez de obrigar a IA a perguntar isso ao cliente no WhatsApp?
2. [ ] **Duas Etapas para Ações com Custo/Impacto:** Se a ação altera datas, cobra taxas ou cancela algo, a ferramenta possui um booleano de confirmação (`confirmacao_hospede`) que retorna `SIMULACAO_AGUARDANDO_CONFIRMACAO` na primeira chamada?
3. [ ] **Travas no Código:** Todas as condições de permissão, horários e conflitos de agenda estão escritas em TypeScript/código dentro do método `execute()` da Tool (e não jogadas no System Prompt)?
4. [ ] **Retorno Instrucional Rico:** Todos os caminhos (`if/else/catch`) dentro da Tool retornam um objeto compatível com `AgentToolResponse` contendo um texto claro em `instrucao_para_ia`?
5. [ ] **Fallback para o Gestor:** O bloco `catch` ou casos de impasse acionam `notifyAdminWhatsApp` para o proprietário nunca ficar no escuro quando o sistema barrar ou falhar?

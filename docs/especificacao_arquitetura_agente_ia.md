# Especificação de Arquitetura: Agente Autônomo de IA para Hospedagem (WhatsApp)

> **Instrução para o Agente Construtor / Desenvolvedor:**
> Este documento define a nova arquitetura do Agente de Atendimento e Operações via WhatsApp. Você deve abandonar qualquer estrutura baseada em árvores de decisão engessadas, scripts lineares ou "megaprompts" monolíticos. Reconstrua o fluxo utilizando **Injeção Dinâmica de Contexto (Middleware)**, **Roteamento por Estado**, **Tool Calling Semântico (ReAct)** e **Guardrails Determinísticos no Backend com Retorno Instrucional**.

## 1. Visão Geral do Fluxo de Execução (Pipeline)

Toda mensagem recebida via Webhook do WhatsApp deve passar por 4 etapas obrigatórias antes de devolver uma resposta ao usuário:

1. **Interceptação e Enriquecimento (Middleware Pré-LLM):** O backend identifica o número de telefone do remetente, consulta o banco de dados do sistema de reservas e descobre quem é o interlocutor e qual é o estado atual dele.

2. **Roteamento de Estado (State Router):** Com base no status da reserva, o sistema seleciona um **System Prompt enxuto específico** e habilita apenas o **subconjunto de ferramentas (Tools)** pertinentes àquele momento.

3. **Raciocínio e Chamada de Ferramentas (LLM + Tool Calling):** A IA interpreta a intenção do hóspede cruzando a mensagem com o contexto injetado e aciona as rotas de API necessárias.

4. **Validação Determinística e Retorno Instrucional (Backend Guardrails):** A API valida se a ação é permitida pelas regras de negócio, executa ou bloqueia a operação no sistema e devolve um JSON instrutivo para a IA formular a resposta final em linguagem natural.

## 2. Pilar 1: Injeção Dinâmica de Contexto (Zero-Ask)

O agente **nunca** deve perguntar informações que o sistema já possui (como nome, qual imóvel está alugado, data de saída ou código de reserva). Antes de chamar a LLM, o backend deve montar um bloco de contexto dinâmico e injetá-lo no System Prompt.

### Exemplo de Payload Injetado no Prompt (Hóspede Identificado)

```json
{
  "contexto_sessao": {
    "data_hora_atual": "2026-11-02T14:30:00-03:00",
    "perfil_remetente": "HOSPEDE_ATIVO",
    "estado_atual": "IN_STAY_CONCIERGE",
    "dados_hospede": {
      "id": "usr_98231",
      "nome": "Carlos Eduardo",
      "telefone": "+5511999999999"
    },
    "reserva_atual": {
      "reserva_id": "res_5541",
      "imovel_id": "apt_302_copacabana",
      "nome_imovel": "Studio Vista Mar 302",
      "check_in": "2026-11-01T15:00:00",
      "check_out": "2026-11-05T11:00:00",
      "status_pagamento": "PAGO_INTEGRALMENTE",
      "quantidade_hospedes": 2,
      "senha_fechadura": "4829#",
      "wifi_rede": "Studio302_5G",
      "wifi_senha": "vistamar2026"
    }
  }
}
```

> **Caso o telefone não exista no banco:** O campo `perfil_remetente` deve ser preenchido como `LEAD_DESCONHECIDO` e `estado_atual` como `COMERCIAL_VENDAS`.

## 3. Pilar 2: Roteamento por Estado (Fim do Megaprompt)

Não utilize um único prompt com todas as regras da empresa. Divida a operação em **3 Modos de Operação** ativados dinamicamente pelo Middleware:

| Estado (`estado_atual`) | Condição de Ativação | Objetivo do Prompt | Ferramentas (Tools) Liberadas | 
| ----- | ----- | ----- | ----- | 
| **`COMERCIAL_VENDAS`** | Telefone sem reserva ativa ou futura. | Tirar dúvidas sobre imóveis, cotar datas e gerar link de pagamento/reserva. | `consultar_disponibilidade`, `calcular_orcamento`, `gerar_link_reserva`, `notificar_administrador` | 
| **`PRE_CHECKIN`** | Reserva confirmada (faltando de 1 a 30 dias para o check-in). | Confirmar horário de chegada, cadastrar documentos de acompanhantes e liberar instruções de entrada. | `atualizar_dados_hospede`, `consultar_detalhes_reserva`, `solicitar_early_checkin`, `notificar_administrador` | 
| **`IN_STAY_CONCIERGE`** | Hóspede atualmente dentro do imóvel (entre check-in e check-out). | Suporte rápido sobre o imóvel, manutenção, extensão de estadia e regras de saída. | `solicitar_late_checkout`, `estender_estadia`, `solicitar_limpeza_extra`, `abrir_chamado_manutencao`, `notificar_administrador` | 

## 4. Pilar 3: Catálogo de Ferramentas Semânticas (Tool Calling)

A IA não deve ter acesso direto a banco de dados ou queries SQL. Ela deve interagir com o sistema exclusivamente por meio de **Tools (Function Calling)** bem documentadas. As descrições das ferramentas e dos parâmetros guiam o raciocínio do modelo.

### Especificação de Ferramentas Principais (JSON Schema)

#### 4.1. `solicitar_late_checkout`

```json
{
  "name": "solicitar_late_checkout",
  "description": "Verifica a viabilidade e aplica a extensão do horário de check-out de uma reserva ativa no sistema. Deve ser chamada sempre que o hóspede pedir para sair mais tarde no dia do check-out.",
  "parameters": {
    "type": "object",
    "properties": {
      "reserva_id": {
        "type": "string",
        "description": "ID da reserva ativa extraído do contexto da sessão."
      },
      "horario_solicitado": {
        "type": "string",
        "description": "Horário desejado pelo hóspede no formato HH:MM (ex: '16:00')."
      },
      "confirmacao_cobranca": {
        "type": "boolean",
        "description": "True se o hóspede já concordou com eventual taxa extra informada anteriormente; False se for a primeira consulta."
      }
    },
    "required": ["reserva_id", "horario_solicitado", "confirmacao_cobranca"]
  }
}
```

#### 4.2. `alterar_datas_reserva`

```json
{
  "name": "alterar_datas_reserva",
  "description": "Simula ou efetiva a alteração de datas de check-in ou check-out de uma reserva existente, calculando diferenças de tarifa e disponibilidade.",
  "parameters": {
    "type": "object",
    "properties": {
      "reserva_id": {
        "type": "string",
        "description": "ID da reserva ativa."
      },
      "nova_data_checkin": {
        "type": "string",
        "description": "Nova data de entrada no formato YYYY-MM-DD."
      },
      "nova_data_checkout": {
        "type": "string",
        "description": "Nova data de saída no formato YYYY-MM-DD."
      },
      "efetivar_alteracao": {
        "type": "boolean",
        "description": "Use 'false' primeiro para apenas simular valores e disponibilidade. Use 'true' apenas após o hóspede confirmar explicitamente na conversa que aceita a alteração/valores."
      }
    },
    "required": ["reserva_id", "nova_data_checkin", "nova_data_checkout", "efetivar_alteracao"]
  }
}
```

#### 4.3. `notificar_administrador` (Transbordo e Alertas no WhatsApp)

```json
{
  "name": "notificar_administrador",
  "description": "Envia um alerta imediato para o WhatsApp pessoal do proprietário/administrador. Deve ser acionada quando: 1) O hóspede relatar problemas graves de manutenção (falta de água, luz, ar-condicionado quebrado, fechadura falhando); 2) O hóspede pedir uma exceção comercial ou desconto que o sistema bloqueou e ele insistir; 3) O hóspede demonstrar irritação ou solicitar atendente humano.",
  "parameters": {
    "type": "object",
    "properties": {
      "nivel_urgencia": {
        "type": "string",
        "enum": ["BAIXA", "MEDIA", "CRITICA"],
        "description": "Nível de gravidade da situação."
      },
      "categoria": {
        "type": "string",
        "enum": ["MANUTENCAO", "EXCECAO_COMERCIAL", "FINANCEIRO", "CONFLITO_REGRA", "SOLICITACAO_HUMANO"]
      },
      "resumo_ocorrencia": {
        "type": "string",
        "description": "Resumo claro e direto do que o hóspede pediu, o que o sistema respondeu e por que precisa de intervenção humana."
      }
    },
    "required": ["nivel_urgencia", "categoria", "resumo_ocorrencia"]
  }
}
```

## 5. Pilar 4: Travas no Backend e "Retorno Instrucional"

**REGRA DE OURO DE ENGENHARIA:** Travas de negócio críticas **não** devem depender apenas do prompt da IA. A IA interpreta a conversa e chama a ferramenta; **o código do Backend valida se pode ou não fazer**.

Para que a IA não dê respostas robóticas ou invente desculpas quando uma ação for negada pelo sistema, todas as rotas de API conectadas às Tools devem retornar um **JSON Instrucional** contendo os campos `status`, `dados`, `motivo_bloqueio` e `instrucao_resposta_ia`.

## 6. Pilar 5: Fluxo de Notificação do Administrador via WhatsApp

Quando a IA acionar a tool `notificar_administrador`, o backend dispara imediatamente uma mensagem via API do WhatsApp para o número pessoal do administrador e devolve `status: "ADMINISTRADOR_NOTIFICADO"` com `instrucao_resposta_ia`.

## 7. Template Base de System Prompt (Para Configurar no Agente)

```text
# IDENTIDADE E POSTURA
Você é o Concierge e Assistente Operacional inteligente da nossa hospedagem. Sua comunicação no WhatsApp deve ser natural, humana, acolhedora, direta e resolutiva. 
- Nunca use linguagem robótica ("Prezado senhor", "Conforme solicitado", "Selecione uma opção").
- Escreva em parágrafos curtos, adequados para leitura rápida no WhatsApp.
- Você tem autonomia para consultar e executar ações no sistema usando suas Ferramentas (Tools), mas NUNCA deve prometer ou confirmar uma alteração no sistema sem antes chamar a ferramenta correspondente e receber o status de confirmação.

# CONTEXTO ATUAL DO HÓSPEDE (INJETADO PELO SISTEMA)
Não peça ao hóspede informações que já constam abaixo:
{{JSON_CONTEXTO_DINAMICO}}

# DIRETRIZES DE EXECUÇÃO E USO DE FERRAMENTAS
1. **Intenção -> Ferramenta:** Sempre que o hóspede pedir algo que envolva datas, horários, disponibilidade, valores, manutenção ou regras que dependam do sistema, chame a ferramenta adequada antes de responder.
2. **Simulação antes da Efetivação:** Para alterações que envolvam custos ou mudanças de data, chame a ferramenta primeiro em modo de simulação/consulta, informe as condições ao hóspede e só efetive após o "sim" explícito dele.
3. **Obediência Estrita ao Retorno da API:** Ao chamar uma ferramenta, leia atentamente o campo `instrucao_resposta_ia` retornado pelo sistema. Use os fatos e limites exatos daquele retorno para construir sua resposta. Nunca invente motivos técnicos e nunca contorne um status `BLOQUEADO_PELA_REGRA`.
4. **Escalonamento Inteligente (`notificar_administrador`):** Se uma ação for bloqueada pelo sistema e o hóspede insistir, pedir uma exceção, relatar um defeito físico no imóvel ou demonstrar frustração, chame IMEDIATAMENTE a ferramenta `notificar_administrador` para avisar o gestor no WhatsApp dele.

# BASE DE CONHECIMENTO DO IMÓVEL ATUAL
{{MANUAL_DO_IMOVEL_ATUAL}}
```

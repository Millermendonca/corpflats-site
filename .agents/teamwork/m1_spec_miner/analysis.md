# Milestone 1 Specification Mining: FAQ Dataset, Rules Engine & Test Fixtures

**Agent**: Milestone 1 Spec Miner (`m1_spec_miner`)  
**Workspace**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`  
**Target Milestone**: M1 (Backend Core & Database Layer)  
**Date**: 2026-10-11  

---

## 1. Executive Summary & Specification Sources

This document formalizes the authoritative specification for the **Guest-Flow-Manager FAQ & Knowledge Base Engine** for Sofia (WhatsApp AI Agent). The specification was mined by analyzing:
1. `ORIGINAL_REQUEST.md`: Requirements R1–R5 and Acceptance Criteria.
2. `PROJECT.md`: Architectural blueprint, REST contracts, and `FaqItem` schema.
3. Reference Codebase:
   - `artifacts/api-server/demo-server.mjs` & `scripts/demo-server.mjs`: House rules (`DEFAULT_HOUSE_RULES`), contract terms (`DEFAULT_CONTRACT_TERMS`), persistence cycle (`loadDatabase`, `saveDatabase`, `pruneDatabase`), and PostgreSQL sync.
   - `artifacts/api-server/zapi-service.mjs` & `scripts/zapi-service.mjs`: Phone sanitizer (`cleanWhatsAppPhone`), message templates, and webhook handlers.
   - `artifacts/api-server/whatsapp-ai-service.mjs` & `scripts/whatsapp-ai-service.mjs`: `DEFAULT_AI_CONFIG`, `knowledgeBase`, heuristic handlers (`generateHeuristicResponse`), and test sandbox whitelist.
   - `artifacts/limpeza/src/pages/guest-breakfast.tsx`: Verbatim operational rules for CorpFlats tray delivery and dish return.
   - `artifacts/api-server/uploads/documents/Manual_do_Hospede_CorpFlats.pdf`: Guest manual credentials and basic regulations.
   - `tests/whatsapp-ai-agent.test.mjs`: Integration test suite and assertion expectations.

---

## 2. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | `wifi_tecnologia` | FAQ Seed: Wi-Fi CorpFlats | Rede 500MB privativa CorpFlats-Hospedes com senha corpflats2026 | Dúvida de conexão, senha ou rede Wi-Fi | Resposta formatada com rede, senha e aviso minúsculo | Fallback para mensagem amigável | `whatsapp-ai-service.mjs:70`, `Manual_do_Hospede_CorpFlats.pdf` |
| 2 | `cafe_manha` | FAQ Seed: Café da Manhã no Quarto | Entrega exclusiva no quarto via bandeja personalizada (06:30 às 10:00) | Pergunta sobre café, local ou horário | Resposta explicando entrega exclusiva no flat e agendamento | Transbordo se não configurado | `zapi-service.mjs:1783`, `database_backup_pre_regularizacao` |
| 3 | `cafe_manha` | FAQ Seed: Recolhimento de Louças | Manter louças e bandejas dentro do flat; não deixar no corredor nem dar ao restaurante | Dúvida de onde deixar bandeja ou louças | Instruções claras com alertas de normas de condomínio | Fallback heurístico | `guest-breakfast.tsx:610`, `guest-breakfast.tsx:1662` |
| 4 | `estrutura_flat` | FAQ Seed: Água no Frigobar | Garrafas de água mineral no frigobar como cortesia gratuita de boas-vindas | Dúvida sobre água na geladeira ou custos | Resposta confirmando cortesia sem cobrança extra | Fallback heurístico | `explorer_survey_1:255`, `demo-server.mjs:771` |
| 5 | `regras_visitas_pets` | FAQ Seed: Regras de Visitas | Identificação na portaria 24h, limite 3 pessoas no flat, proibido pernoite e lazer | Perguntas sobre receber amigos ou pernoite | Regras do Soho Residence detalhadas | Fallback de transbordo | `demo-server.mjs:13949-13954` |
| 6 | `regras_visitas_pets` | FAQ Seed: Regras de Pets | Cães pequeno porte (até 10kg), taxa R$ 80, elevador de serviço, colo no prédio | Dúvida sobre trazer cachorro/gato | Diretrizes completas de pet friendly CorpFlats | Fallback de transbordo | `demo-server.mjs:13940-13948`, `whatsapp-ai-service.mjs:74` |
| 7 | `checkin_acesso` | FAQ Seed: Check-in 14h | Horário oficial a partir das 14:00, portaria 24h e check-in digital obrigatório | Pergunta sobre horário de entrada ou chaves | Passo a passo de chegada e retirada do cartão | Fallback com link do portal | `whatsapp-ai-service.mjs:66`, `demo-server.mjs:13935` |
| 8 | `checkin_acesso` | FAQ Seed: Early Check-in Direto | Entrada gratuita a partir das 10:00 para reservas diretas (mediante liberação) | Dúvida sobre chegar mais cedo ou às 10h | Explicação do benefício e condição de limpeza | Fallback para horário padrão 14h | `whatsapp-ai-service.mjs:68`, `reservation-journey.tsx:1095` |
| 9 | `checkout` | FAQ Seed: Check-out 12h | Desocupação até 12:00, desligar aparelhos, louças no flat, entrega de cartão | Pergunta sobre horário de saída | Checklist de saída e procedimento de late checkout | Fallback com contato da recepção | `whatsapp-ai-service.mjs:67`, `demo-server.mjs:13936` |
| 10 | `auto_learning` | Test Fixture: Pergunta Pendente | Pergunta unmapped recebida sem resposta com status `"pendente"` | Mensagem inbound desconhecida de cliente | Registro criado com `status: "pendente"`, telefone e nome | Registro seguro em `db.faqItems` | `ORIGINAL_REQUEST.md §R2`, `PROJECT.md §AC2` |
| 11 | `auto_learning` | Test Fixture: Aguardando Aprovação | Resposta do operador vinculada como `suggestedAnswer` com status `"aguardando_aprovacao"` | Mensagem enviada pelo operador (`fromMe: true`) | Item atualizado com `suggestedAnswer`, pronto para 1 clique | Mantém pendente se janela expirar | `ORIGINAL_REQUEST.md §R3`, `PROJECT.md §AC2` |
| 12 | `regras_excecao` | Rule Engine: Scopes e Segmentação | Suporte a `scope: "all"`, `"exclude"`, `"include_only"` com lista `clientPhones` | `faqItem` e telefone do cliente normalizado | Booleano `true`/`false` indicando aplicabilidade | Fallback para FAQ genérico ou transbordo | `ORIGINAL_REQUEST.md §R4`, `PROJECT.md §AC3` |
| 13 | `regras_excecao` | Normalização & Suffix Matching | Tratamento de DDI 55, DDD, e sufixo de 8 dígitos para cobrir 9º dígito móvel | Números em formatos variados (`+55 (22) 99850-5276`, etc.) | Dígitos puros ou correspondência de 8 dígitos | Retorna string vazia ou sem match | `zapi-service.mjs:1069`, `whatsapp-ai-service.mjs:180` |
| 14 | `persistencia` | Inicialização Segura `db.faqItems` | `loadDatabase()` inicializa coleção padrão se ausente ou vazia | Leitura do `database.json` e reconciliação Postgres | `db.faqItems` populado com 9 seeds + itens de teste | Reconciliação não apaga itens locais | `PROJECT.md §AC1`, `demo-server.mjs:3454` |
| 15 | `api_rest` | Endpoints CRUD & Aprovação | `GET`, `POST`, `PUT`, `DELETE` em `/api/whatsapp/faq` e `POST /:id/approve` | Requisições HTTP com payload JSON | Retorno `{ success: true, item/items }` | 400 Bad Request / 404 Not Found | `PROJECT.md §Interface Contracts` |

---

## 3. Edge Cases

| # | Feature | Input | Observed / Expected Behavior |
|---|---------|-------|------------------------------|
| 1 | Rule Engine (`scope: "all"`) | `clientPhone` nulo, indefinido ou vazio | Retorna `true`. FAQ geral é aplicável para qualquer lead ou hóspede sem telefone. |
| 2 | Rule Engine (`scope: "exclude"`) | `clientPhone` presente na lista `clientPhones` | Retorna `false`. O item é ocultado da IA para aquele cliente específico. |
| 3 | Rule Engine (`scope: "exclude"`) | `clientPhone` ausente na lista `clientPhones` | Retorna `true`. O item é aplicável normalmente. |
| 4 | Rule Engine (`scope: "exclude"`) | `clientPhone` nulo ou vazio | Retorna `true`. Um cliente anônimo não coincide com a lista de exclusão. |
| 5 | Rule Engine (`scope: "include_only"`) | `clientPhone` presente na lista `clientPhones` | Retorna `true`. Apenas clientes autorizados recebem a resposta customizada. |
| 6 | Rule Engine (`scope: "include_only"`) | `clientPhone` ausente na lista `clientPhones` | Retorna `false`. Clientes comuns não recebem a resposta restrita. |
| 7 | Rule Engine (`scope: "include_only"`) | `clientPhone` nulo ou vazio | Retorna `false`. Impossível validar autorização sem telefone identificado. |
| 8 | Telefone com e sem 9º dígito | `faqItem.clientPhones = ["552298505276"]`, hóspede `5522998505276` | Dá match positivo via sufixo de 8 dígitos (`.slice(-8)` = `"98505276"`). |
| 9 | Telefone formatado com caracteres especiais | `faqItem.clientPhones = ["+55 (22) 99850-5276"]`, hóspede `22998505276` | `cleanWhatsAppPhone` normaliza ambos para formato limpo com DDI 55 e dá match. |
| 10 | Aprovação em 1 clique | `POST /api/whatsapp/faq/:id/approve` em item com `suggestedAnswer` | Promove `status` para `"ativo"`, copia `suggestedAnswer` para `answer` (se `answer` estiver vazia), define `approvedAt` com timestamp ISO atual e persiste. |
| 11 | Persistência ao salvar banco | `pruneDatabase()` executado durante `saveDatabase()` | Não descarta nem trunca `db.faqItems`. Garante integridade permanente no `database.json`. |
| 12 | Paridade de espelhamento | `artifacts/api-server/whatsapp-ai-service.mjs` vs `scripts/whatsapp-ai-service.mjs` | Manteve paridade estrita SHA-256 (resolvendo divergência histórica de `DEFAULT_TEST_ALLOWED_PHONES`). |

---

## 4. Formal Specification of the 9 Official FAQ Topics

### Topic 1: Wi-Fi de Alta Velocidade
- **ID**: `"faq-wifi"`
- **Category**: `"wifi_tecnologia"`
- **Primary Question**: "Qual é o nome da rede e a senha do Wi-Fi?"
- **Keywords**: `["wifi", "wi-fi", "internet", "senha", "conectar", "rede", "conexao", "banda larga", "500mb"]`
- **Question Variations**:
  - "Como faço para conectar na internet?"
  - "Qual a senha do wifi?"
  - "Qual o nome da rede de internet?"
  - "Tem wifi no quarto?"
  - "Como funciona a internet do flat?"
  - "A internet é rápida?"
- **Official Formatted Answer**:
  ```text
  📶 *Wi-Fi de Alta Velocidade CorpFlats (500MB):*

  • *Rede:* CorpFlats-Hospedes
  • *Senha:* `corpflats2026`

  Nossa conexão é dedicada e está disponível em todas as áreas do apartamento, ideal para reuniões e trabalho remoto. Caso tenha qualquer dificuldade de conexão, certifique-se de digitar a senha em letras minúsculas! ✨
  ```
- **Status**: `"ativo"` | **Scope**: `"all"` | **ClientPhones**: `[]`

---

### Topic 2: Café da Manhã no Quarto
- **ID**: `"faq-cafe-quarto"`
- **Category**: `"cafe_manha"`
- **Primary Question**: "Como funciona o café da manhã no quarto?"
- **Keywords**: `["cafe", "café", "cafe da manha", "café da manhã", "bandeja", "quarto", "horario cafe", "desjejum", "cesta"]`
- **Question Variations**:
  - "O café da manhã é servido no quarto ou no restaurante?"
  - "Como peço o café da manhã?"
  - "Qual o horário do café da manhã?"
  - "Tem café da manhã incluso na diária?"
  - "Como monto minha bandeja de café da manhã?"
  - "A que horas entregam o café no flat?"
- **Official Formatted Answer**:
  ```text
  ☕🥐 *Café da Manhã Exclusivo no Flat:*

  Nosso serviço de café da manhã é servido com todo conforto *diretamente no seu flat* através de uma deliciosa bandeja personalizada (o serviço é exclusivo no quarto, não servido no restaurante do condomínio).

  • *Horário de entrega:* Das 06:30 às 10:00 (você escolhe o melhor horário).
  • *Agendamento:* Você monta sua bandeja e escolhe seus itens favoritos diretamente pelo link do Portal do Hóspede até a véspera!

  Se a sua reserva não possuir café incluso, você pode solicitar a inclusão avulsa diretamente conosco pelo WhatsApp! ✨
  ```
- **Status**: `"ativo"` | **Scope**: `"all"` | **ClientPhones**: `[]`

---

### Topic 3: Recolhimento de Louças do Café
- **ID**: `"faq-recolhimento-loucas"`
- **Category**: `"cafe_manha"`
- **Primary Question**: "O que fazer com as louças e a bandeja após o café da manhã?"
- **Keywords**: `["loucas", "louças", "bandeja", "recolhimento", "pratos", "xicaras", "talheres", "garrafa termica", "devolver louca", "recolher"]`
- **Question Variations**:
  - "Onde deixo a bandeja e as louças do café?"
  - "Preciso lavar a louça do café da manhã?"
  - "Posso colocar a bandeja no corredor do prédio?"
  - "Devo entregar os pratos e garrafas térmicas na portaria ou restaurante?"
  - "Quem recolhe a louça do quarto?"
  - "Terminei o café, o que faço com as coisas?"
- **Official Formatted Answer**:
  ```text
  🍽️ *Recolhimento de Louças & Bandejas:*

  Ao finalizar o seu café da manhã, pedimos a gentileza de *manter todas as louças, garrafas térmicas, bandejas e porcelanas dentro do próprio apartamento*.

  ⚠️ *Avisos Importantes:*
  1. *Não deixe a bandeja no corredor* do condomínio por normas prediais e higiene coletiva.
  2. *Não entregue as louças ao restaurante do prédio nem às camareiras do condomínio*, pois todos os utensílios são de propriedade exclusiva da CorpFlats.

  Nossa equipe interna de governança fará o recolhimento com todo cuidado! 🙏✨
  ```
- **Status**: `"ativo"` | **Scope**: `"all"` | **ClientPhones**: `[]`

---

### Topic 4: Água no Frigobar
- **ID**: `"faq-agua-frigobar"`
- **Category**: `"estrutura_flat"`
- **Primary Question**: "A água no frigobar é cortesia ou é cobrada à parte?"
- **Keywords**: `["agua", "água", "frigobar", "cortesia", "mineral", "garrafa de agua", "bebida", "geladeira", "paga"]`
- **Question Variations**:
  - "Tem água no frigobar?"
  - "A água da geladeira é de graça?"
  - "Preciso pagar pela água do frigobar?"
  - "Tem água mineral no quarto?"
  - "O que tem dentro do frigobar?"
  - "Posso beber a água que está na geladeira?"
- **Official Formatted Answer**:
  ```text
  🧊💧 *Água no Frigobar - Cortesia de Boas-Vindas:*

  Sim! Para o seu conforto e hidratação imediata ao chegar de viagem, disponibilizamos *garrafas de água mineral no frigobar como cortesia de boas-vindas* na sua entrada! 🎁

  • Não há nenhuma cobrança extra por essas águas de cortesia.
  • O frigobar também fica totalmente livre e ligado para você armazenar suas próprias bebidas e alimentos durante a estadia.

  Fique à vontade e aproveite! ✨
  ```
- **Status**: `"ativo"` | **Scope**: `"all"` | **ClientPhones**: `[]`

---

### Topic 5: Regras de Visitas
- **ID**: `"faq-regras-visitas"`
- **Category**: `"regras_visitas_pets"`
- **Primary Question**: "Quais são as regras para receber visitas no flat?"
- **Keywords**: `["visita", "visitas", "visitante", "convidado", "receber pessoas", "pernoite", "amigos", "capacidade", "portaria"]`
- **Question Variations**:
  - "Posso receber visitas no apartamento?"
  - "Visitante pode dormir no flat?"
  - "Até quantas pessoas podem entrar no flat?"
  - "Visita precisa apresentar documento na portaria?"
  - "Visitante pode usar a piscina ou a academia?"
  - "Até que horas visitante pode ficar?"
- **Official Formatted Answer**:
  ```text
  👥 *Regras de Visitas e Convivência:*

  Você pode receber visitas no flat durante o dia, desde que respeitadas as seguintes normas do condomínio Soho Residence:

  1. *Identificação Obrigatória:* O visitante deve obrigatoriamente apresentar documento oficial com foto na portaria 24h para liberação de acesso.
  2. *Capacidade Máxima:* Limite de até 3 pessoas simultâneas no flat (somando hóspedes e visitantes).
  3. *Sem Pernoite:* É estritamente proibido o pernoite de visitantes não contratados/cadastrados na reserva.
  4. *Áreas Comuns:* Visitantes não têm autorização de acesso às áreas de lazer/cobertura (jacuzzi, sauna, academia).

  Contamos com sua colaboração para a segurança e tranquilidade de todos! 🏢✨
  ```
- **Status**: `"ativo"` | **Scope**: `"all"` | **ClientPhones**: `[]`

---

### Topic 6: Regras de Pets
- **ID**: `"faq-regras-pets"`
- **Category**: `"regras_visitas_pets"`
- **Primary Question**: "Quais são as regras para hospedagem com animais de estimação (pets)?"
- **Keywords**: `["pet", "pets", "cachorro", "cao", "cão", "gato", "animal", "animais", "taxa pet", "porte pequeno"]`
- **Question Variations**:
  - "Aceita cachorro no apartamento?"
  - "Posso levar meu pet?"
  - "Qual o valor da taxa pet?"
  - "Qual o peso/tamanho máximo permitido para animais?"
  - "Quais os cuidados para circular com pet no prédio?"
  - "Posso deixar o cachorro sozinho no flat?"
- **Official Formatted Answer**:
  ```text
  🐾 *Política Pet CorpFlats:*

  Adoramos receber seu amigo de quatro patas! Confira nossas diretrizes para garantir uma estadia harmoniosa:

  • *Permissão:* Aceitamos exclusivamente *cães de pequeno porte (até 10 kg)* em unidades selecionadas, mediante aviso prévio.
  • *Taxa de Higienização Pet:* R$ 80,00 por estadia (destinada à higienização especial pós-saída).
  • *Circulação no Prédio:* No condomínio, o transporte deve ser no colo ou bolsa/guia curta, utilizando *obrigatoriamente o elevador de serviço*.
  • *Cuidados no Flat:* Proibido deixar o animal sozinho por longos períodos; não utilizar toalhas ou roupas de cama do flat no pet.

  Avise-nos antes da chegada para prepararmos a autorização com a portaria! 🐶✨
  ```
- **Status**: `"ativo"` | **Scope**: `"all"` | **ClientPhones**: `[]`

---

### Topic 7: Check-in a partir das 14h
- **ID**: `"faq-checkin-14h"`
- **Category**: `"checkin_acesso"`
- **Primary Question**: "Qual é o horário padrão de check-in e como funciona a entrada?"
- **Keywords**: `["checkin", "check-in", "horario check-in", "entrada", "que horas posso entrar", "chegada", "retirar chave", "portaria"]`
- **Question Variations**:
  - "Qual o horário de check-in?"
  - "A partir de que horas posso entrar no quarto?"
  - "Como faço para pegar as chaves?"
  - "A portaria é 24 horas?"
  - "Chego de madrugada, consigo fazer check-in?"
  - "O que preciso apresentar na portaria para entrar?"
- **Official Formatted Answer**:
  ```text
  🕒🔑 *Check-in Oficial e Instruções de Entrada:*

  • *Horário Padrão:* A partir das *14:00h*.
  • *Portaria 24 Horas:* Não se preocupe se chegar mais tarde ou à noite, a portaria funciona 24 horas ininterruptas!

  📋 *Como Acessar:*
  1. Realize o seu *Check-in Digital* com antecedência pelo link do portal enviado no WhatsApp.
  2. Ao chegar ao Edifício Soho Residence, apresente um documento oficial com foto na recepção e informe o número do seu flat.
  3. Retire seu cartão de acesso magnético e seja muito bem-vindo(a)! 🏨✨
  ```
- **Status**: `"ativo"` | **Scope**: `"all"` | **ClientPhones**: `[]`

---

### Topic 8: Early Check-in para Reservas Diretas
- **ID**: `"faq-early-checkin-direto"`
- **Category**: `"checkin_acesso"`
- **Primary Question**: "Como funciona o early check-in (entrada antecipada) para reservas diretas?"
- **Keywords**: `["early check-in", "early checkin", "checkin antecipado", "entrada antecipada", "entrar mais cedo", "reserva direta", "10h", "10:00", "chegar antes"]`
- **Question Variations**:
  - "Posso entrar antes das 14h no flat?"
  - "Consigo fazer check-in antecipado às 10h?"
  - "Quem tem direito a early check-in gratuito?"
  - "Como funciona o benefício de entrada antecipada para quem reservou pelo site ou WhatsApp?"
  - "O quarto já está liberado se eu chegar de manhã?"
  - "Tem taxa para entrar mais cedo?"
- **Official Formatted Answer**:
  ```text
  ⚡🏨 *Early Check-in Exclusivo (Reservas Diretas):*

  Para hóspedes que reservam *diretamente pelo nosso Site Oficial ou WhatsApp*, oferecemos o benefício exclusivo de *Early Check-in gratuito a partir das 10:00h*! 🎁

  ⚠️ *Regra Importante:* Este benefício é *estritamente sujeito à disponibilidade*, dependendo de o apartamento ter sido desocupado na véspera e já estar 100% limpo e inspecionado pela governança.

  Assim que o status da limpeza constar como *LIBERADO* em nosso sistema no dia da sua chegada, você receberá um aviso automático pelo WhatsApp liberando sua entrada imediata! ✨
  ```
- **Status**: `"ativo"` | **Scope**: `"all"` | **ClientPhones**: `[]`

---

### Topic 9: Check-out até às 12h
- **ID**: `"faq-checkout-12h"`
- **Category**: `"checkout"`
- **Primary Question**: "Qual é o horário de check-out e como realizo a saída?"
- **Keywords**: `["checkout", "check-out", "horario check-out", "saida", "saída", "que horas sair", "deixar o flat", "entregar chave", "12h", "12:00"]`
- **Question Variations**:
  - "Que horas tenho que fazer o check-out?"
  - "Qual o horário limite para liberar o apartamento?"
  - "Como faço para entregar a chave na saída?"
  - "Onde deixo o cartão de acesso quando for embora?"
  - "Posso sair depois das 12h (late check-out)?"
  - "Preciso avisar alguém na hora de sair?"
- **Official Formatted Answer**:
  ```text
  ⏰🚪 *Instruções de Check-out (Até às 12:00h):*

  • *Horário Limite:* A desocupação do flat deve ocorrer impreterivelmente até às *12:00h*.

  📋 *Procedimento de Saída:*
  1. Verifique gavetas e armários para não esquecer pertences pessoais.
  2. Desligue os aparelhos de ar-condicionado e todas as luzes.
  3. Deixe as louças e bandejas dentro do apartamento (não deixe no corredor).
  4. Entregue o cartão magnético de acesso na portaria 24h ao sair.

  *Late Check-out:* Saídas após as 12:00 dependem de disponibilidade da governança e devem ser combinadas previamente via WhatsApp! Agradecemos muito pela sua estadia! 🙏✨
  ```
- **Status**: `"ativo"` | **Scope**: `"all"` | **ClientPhones**: `[]`

---

## 5. Formal Specification of Pending & Rule Test Fixtures

### Item 10: Pergunta Pendente (Aguardando Resposta Humana)
- **ID**: `"faq-pending-voltagem"`
- **Category**: `"estrutura_flat"`
- **Question**: "Qual é a voltagem das tomadas no flat? É 110V ou 220V?"
- **Keywords**: `["voltagem", "tomada", "110v", "220v", "energia", "eletricidade"]`
- **Variations**: `["As tomadas são 110 ou 220?", "Posso ligar secador 220v?", "Qual voltagem do flat?"]`
- **Answer**: `""`
- **Status**: `"pendente"`
- **Scope**: `"all"` | **ClientPhones**: `[]`
- **sourceClientPhone**: `"5522998505276"`
- **sourceClientName**: `"Carlos Drumond"`

### Item 11: Pergunta Pendente (Aguardando Resposta Humana)
- **ID**: `"faq-pending-ferro"`
- **Category**: `"estrutura_flat"`
- **Question**: "O flat possui ferro e tábua de passar roupa disponíveis?"
- **Keywords**: `["ferro", "ferro de passar", "tabua", "passar roupa", "roupa"]`
- **Variations**: `["Tem ferro de passar no quarto?", "Vocês emprestam ferro de passar?", "Tem como passar roupa no flat?"]`
- **Answer**: `""`
- **Status**: `"pendente"`
- **Scope**: `"all"` | **ClientPhones**: `[]`
- **sourceClientPhone**: `"5521988887777"`
- **sourceClientName**: `"Juliana Mendes"`

### Item 12: Sugestão Capturada (Aguardando Aprovação em 1 Clique)
- **ID**: `"faq-approval-jacuzzi-aquecida"`
- **Category**: `"lazer_condominio"`
- **Question**: "A piscina ou jacuzzi da cobertura é aquecida? Qual o horário de funcionamento?"
- **Keywords**: `["jacuzzi", "piscina", "cobertura", "aquecida", "lazer", "horario jacuzzi", "sauna"]`
- **Variations**: `["A jacuzzi é quente?", "A piscina funciona até que horas?", "Posso usar a jacuzzi à noite?"]`
- **Answer**: `""`
- **Status**: `"aguardando_aprovacao"`
- **Scope**: `"all"` | **ClientPhones**: `[]`
- **sourceClientPhone**: `"5522997124021"`
- **sourceClientName**: `"Roberto Alencar"`
- **suggestedAnswer**: `"🏊‍♂️✨ *Área de Lazer & Jacuzzi (Cobertura Soho):*\n\nSim! A jacuzzi na cobertura do Edifício Soho conta com sistema de aquecimento e hidromassagem, e a área de lazer funciona diariamente das *06:00 às 22:00h*.\n\nPor regulamento do condomínio, não é permitido o consumo de bebidas em garrafas de vidro ou alimentos na área molhada. Aproveite para relaxar!"`

### Item 13: Sugestão Capturada (Aguardando Aprovação em 1 Clique)
- **ID**: `"faq-approval-estacionamento-caminhonete"`
- **Category**: `"garagem"`
- **Question**: "A vaga de garagem comporta caminhonete grande (Hilux / Ranger) ou tem limite de altura?"
- **Keywords**: `["garagem", "caminhonete", "altura", "estacionamento", "hilux", "ranger", "suv grande"]`
- **Variations**: `["Cabe caminhonete na garagem?", "Qual a altura máxima do estacionamento?", "Posso parar Hilux na garagem?"]`
- **Answer**: `""`
- **Status**: `"aguardando_aprovacao"`
- **Scope**: `"all"` | **ClientPhones**: `[]`
- **sourceClientPhone**: `"5524992345678"`
- **sourceClientName**: `"Marcos Vinicius"`
- **suggestedAnswer**: `"🚗 *Garagem & Veículos de Grande Porte:*\n\nNossa garagem coberta comporta caminhonetes e SUVs de médio e grande porte como Hilux e Ranger. A altura livre do portão de entrada é de 2,20m.\n\nPedimos apenas que informe a placa, modelo e cor do veículo no seu Check-in Digital para cadastro prévio na portaria 24h!"`

### Item 14: Regra de Exceção Negativa (`scope: "exclude"`)
- **ID**: `"faq-rule-exclude-ota-early"`
- **Category**: `"checkin_acesso"`
- **Question**: "Posso solicitar early check-in antecipado gratuito?"
- **Keywords**: `["early check-in cortesia", "entrada gratis antecipada"]`
- **Variations**: `["Consigo entrar mais cedo sem taxa?"]`
- **Answer**: `"Olá! O Early Check-in gratuito às 10:00 é um benefício exclusivo para reservas diretas. Para reservas via agências parceiras (Booking/Airbnb), a liberação antes das 14h está sujeita à taxa de antecipação e disponibilidade."`
- **Status**: `"ativo"`
- **Scope**: `"exclude"`
- **ClientPhones**: `["5521999990001", "5521999990002"]`

### Item 15: Regra de Exceção Positiva (`scope: "include_only"`)
- **ID**: `"faq-rule-include-vip-convenio"`
- **Category**: `"reservas"`
- **Question**: "Qual o procedimento para reservas corporativas com faturamento?"
- **Keywords**: `["corporativo", "convenio", "faturamento", "empresa", "tarifa corporativa"]`
- **Variations**: `["Como faturar minha diária para a empresa?", "Tenho tarifa especial da firma?"]`
- **Answer**: `"Prezado parceiro corporativo! Sua empresa possui tarifa comissionada e faturamento direto com a CorpFlats em 15 dias. Basta nos enviar a ordem de serviço ou solicitar a reserva diretamente pelo nosso canal exclusivo de gestão executiva."`
- **Status**: `"ativo"`
- **Scope**: `"include_only"`
- **ClientPhones**: `["5522998505276", "5522988486446"]`

---

## 6. Ready-to-Use JavaScript Code Structure

This JavaScript code is ready to be directly embedded in `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs` or imported as a dedicated data module:

```javascript
/**
 * Conjunto inicial de FAQs Oficiais e Itens de Teste para Auto-Aprendizado e Regras
 * Guest-Flow-Manager / Sofia AI WhatsApp Engine
 */
export function getDefaultFaqItems() {
  const now = "2026-10-11T00:00:00.000Z";

  return [
    // ── 1. Wi-Fi ─────────────────────────────────────────────────────────────
    {
      id: "faq-wifi",
      question: "Qual é o nome da rede e a senha do Wi-Fi?",
      answer: "📶 *Wi-Fi de Alta Velocidade CorpFlats (500MB):*\n\n• *Rede:* CorpFlats-Hospedes\n• *Senha:* `corpflats2026`\n\nNossa conexão é dedicada e está disponível em todas as áreas do apartamento, ideal para reuniões e trabalho remoto. Caso tenha qualquer dificuldade de conexão, certifique-se de digitar a senha em letras minúsculas! ✨",
      category: "wifi_tecnologia",
      keywords: ["wifi", "wi-fi", "internet", "senha", "conectar", "rede", "conexao", "banda larga", "500mb"],
      variations: [
        "Como faço para conectar na internet?",
        "Qual a senha do wifi?",
        "Qual o nome da rede de internet?",
        "Tem wifi no quarto?",
        "Como funciona a internet do flat?",
        "A internet é rápida?"
      ],
      status: "ativo",
      scope: "all",
      clientPhones: [],
      createdAt: now,
      updatedAt: now,
      approvedAt: now
    },

    // ── 2. Café da Manhã no Quarto ───────────────────────────────────────────
    {
      id: "faq-cafe-quarto",
      question: "Como funciona o café da manhã no quarto?",
      answer: "☕🥐 *Café da Manhã Exclusivo no Flat:*\n\nNosso serviço de café da manhã é servido com todo conforto *diretamente no seu flat* através de uma deliciosa bandeja personalizada (o serviço é exclusivo no quarto, não servido no restaurante do condomínio).\n\n• *Horário de entrega:* Das 06:30 às 10:00 (você escolhe o melhor horário).\n• *Agendamento:* Você monta sua bandeja e escolhe seus itens favoritos diretamente pelo link do Portal do Hóspede até a véspera!\n\nSe a sua reserva não possuir café incluso, você pode solicitar a inclusão avulsa diretamente conosco pelo WhatsApp! ✨",
      category: "cafe_manha",
      keywords: ["cafe", "café", "cafe da manha", "café da manhã", "bandeja", "quarto", "horario cafe", "desjejum", "cesta"],
      variations: [
        "O café da manhã é servido no quarto ou no restaurante?",
        "Como peço o café da manhã?",
        "Qual o horário do café da manhã?",
        "Tem café da manhã incluso na diária?",
        "Como monto minha bandeja de café da manhã?",
        "A que horas entregam o café no flat?"
      ],
      status: "ativo",
      scope: "all",
      clientPhones: [],
      createdAt: now,
      updatedAt: now,
      approvedAt: now
    },

    // ── 3. Recolhimento de Louças ───────────────────────────────────────────
    {
      id: "faq-recolhimento-loucas",
      question: "O que fazer com as louças e a bandeja após o café da manhã?",
      answer: "🍽️ *Recolhimento de Louças & Bandejas:*\n\nAo finalizar o seu café da manhã, pedimos a gentileza de *manter todas as louças, garrafas térmicas, bandejas e porcelanas dentro do próprio apartamento*.\n\n⚠️ *Avisos Importantes:*\n1. *Não deixe a bandeja no corredor* do condomínio por normas prediais e higiene coletiva.\n2. *Não entregue as louças ao restaurante do prédio nem às camareiras do condomínio*, pois todos os utensílios são de propriedade exclusiva da CorpFlats.\n\nNossa equipe interna de governança fará o recolhimento com todo cuidado! 🙏✨",
      category: "cafe_manha",
      keywords: ["loucas", "louças", "bandeja", "recolhimento", "pratos", "xicaras", "talheres", "garrafa termica", "devolver louca", "recolher"],
      variations: [
        "Onde deixo a bandeja e as louças do café?",
        "Preciso lavar a louça do café da manhã?",
        "Posso colocar a bandeja no corredor do prédio?",
        "Devo entregar os pratos e garrafas térmicas na portaria ou restaurante?",
        "Quem recolhe a louça do quarto?",
        "Terminei o café, o que faço com as coisas?"
      ],
      status: "ativo",
      scope: "all",
      clientPhones: [],
      createdAt: now,
      updatedAt: now,
      approvedAt: now
    },

    // ── 4. Água no Frigobar ──────────────────────────────────────────────────
    {
      id: "faq-agua-frigobar",
      question: "A água no frigobar é cortesia ou é cobrada à parte?",
      answer: "🧊💧 *Água no Frigobar - Cortesia de Boas-Vindas:*\n\nSim! Para o seu conforto e hidratação imediata ao chegar de viagem, disponibilizamos *garrafas de água mineral no frigobar como cortesia de boas-vindas* na sua entrada! 🎁\n\n• Não há nenhuma cobrança extra por essas águas de cortesia.\n• O frigobar também fica totalmente livre e ligado para você armazenar suas próprias bebidas e alimentos durante a estadia.\n\nFique à vontade e aproveite! ✨",
      category: "estrutura_flat",
      keywords: ["agua", "água", "frigobar", "cortesia", "mineral", "garrafa de agua", "bebida", "geladeira", "paga"],
      variations: [
        "Tem água no frigobar?",
        "A água da geladeira é de graça?",
        "Preciso pagar pela água do frigobar?",
        "Tem água mineral no quarto?",
        "O que tem dentro do frigobar?",
        "Posso beber a água que está na geladeira?"
      ],
      status: "ativo",
      scope: "all",
      clientPhones: [],
      createdAt: now,
      updatedAt: now,
      approvedAt: now
    },

    // ── 5. Regras de Visitas ─────────────────────────────────────────────────
    {
      id: "faq-regras-visitas",
      question: "Quais são as regras para receber visitas no flat?",
      answer: "👥 *Regras de Visitas e Convivência:*\n\nVocê pode receber visitas no flat durante o dia, desde que respeitadas as seguintes normas do condomínio Soho Residence:\n\n1. *Identificação Obrigatória:* O visitante deve obrigatoriamente apresentar documento oficial com foto na portaria 24h para liberação de acesso.\n2. *Capacidade Máxima:* Limite de até 3 pessoas simultâneas no flat (somando hóspedes e visitantes).\n3. *Sem Pernoite:* É estritamente proibido o pernoite de visitantes não contratados/cadastrados na reserva.\n4. *Áreas Comuns:* Visitantes não têm autorização de acesso às áreas de lazer/cobertura (jacuzzi, sauna, academia).\n\nContamos com sua colaboração para a segurança e tranquilidade de todos! 🏢✨",
      category: "regras_visitas_pets",
      keywords: ["visita", "visitas", "visitante", "convidado", "receber pessoas", "pernoite", "amigos", "capacidade", "portaria"],
      variations: [
        "Posso receber visitas no apartamento?",
        "Visitante pode dormir no flat?",
        "Até quantas pessoas podem entrar no flat?",
        "Visita precisa apresentar documento na portaria?",
        "Visitante pode usar a piscina ou a academia?",
        "Até que horas visitante pode ficar?"
      ],
      status: "ativo",
      scope: "all",
      clientPhones: [],
      createdAt: now,
      updatedAt: now,
      approvedAt: now
    },

    // ── 6. Regras de Pets ────────────────────────────────────────────────────
    {
      id: "faq-regras-pets",
      question: "Quais são as regras para hospedagem com animais de estimação (pets)?",
      answer: "🐾 *Política Pet CorpFlats:*\n\nAdoramos receber seu amigo de quatro patas! Confira nossas diretrizes para garantir uma estadia harmoniosa:\n\n• *Permissão:* Aceitamos exclusivamente *cães de pequeno porte (até 10 kg)* em unidades selecionadas, mediante aviso prévio.\n• *Taxa de Higienização Pet:* R$ 80,00 por estadia (destinada à higienização especial pós-saída).\n• *Circulação no Prédio:* No condomínio, o transporte deve ser no colo ou bolsa/guia curta, utilizando *obrigatoriamente o elevador de serviço*.\n• *Cuidados no Flat:* Proibido deixar o animal sozinho por longos períodos; não utilizar toalhas ou roupas de cama do flat no pet.\n\nAvise-nos antes da chegada para prepararmos a autorização com a portaria! 🐶✨",
      category: "regras_visitas_pets",
      keywords: ["pet", "pets", "cachorro", "cao", "cão", "gato", "animal", "animais", "taxa pet", "porte pequeno"],
      variations: [
        "Aceita cachorro no apartamento?",
        "Posso levar meu pet?",
        "Qual o valor da taxa pet?",
        "Qual o peso/tamanho máximo permitido para animais?",
        "Quais os cuidados para circular com pet no prédio?",
        "Posso deixar o cachorro sozinho no flat?"
      ],
      status: "ativo",
      scope: "all",
      clientPhones: [],
      createdAt: now,
      updatedAt: now,
      approvedAt: now
    },

    // ── 7. Check-in 14h ──────────────────────────────────────────────────────
    {
      id: "faq-checkin-14h",
      question: "Qual é o horário padrão de check-in e como funciona a entrada?",
      answer: "🕒🔑 *Check-in Oficial e Instruções de Entrada:*\n\n• *Horário Padrão:* A partir das *14:00h*.\n• *Portaria 24 Horas:* Não se preocupe se chegar mais tarde ou à noite, a portaria funciona 24 horas ininterruptas!\n\n📋 *Como Acessar:*\n1. Realize o seu *Check-in Digital* com antecedência pelo link do portal enviado no WhatsApp.\n2. Ao chegar ao Edifício Soho Residence, apresente um documento oficial com foto na recepção e informe o número do seu flat.\n3. Retire seu cartão de acesso magnético e seja muito bem-vindo(a)! 🏨✨",
      category: "checkin_acesso",
      keywords: ["checkin", "check-in", "horario check-in", "entrada", "que horas posso entrar", "chegada", "retirar chave", "portaria"],
      variations: [
        "Qual o horário de check-in?",
        "A partir de que horas posso entrar no quarto?",
        "Como faço para pegar as chaves?",
        "A portaria é 24 horas?",
        "Chego de madrugada, consigo fazer check-in?",
        "O que preciso apresentar na portaria para entrar?"
      ],
      status: "ativo",
      scope: "all",
      clientPhones: [],
      createdAt: now,
      updatedAt: now,
      approvedAt: now
    },

    // ── 8. Early Check-in Reservas Diretas ────────────────────────────────────
    {
      id: "faq-early-checkin-direto",
      question: "Como funciona o early check-in (entrada antecipada) para reservas diretas?",
      answer: "⚡🏨 *Early Check-in Exclusivo (Reservas Diretas):*\n\nPara hóspedes que reservam *diretamente pelo nosso Site Oficial ou WhatsApp*, oferecemos o benefício exclusivo de *Early Check-in gratuito a partir das 10:00h*! 🎁\n\n⚠️ *Regra Importante:* Este benefício é *estritamente sujeito à disponibilidade*, dependendo de o apartamento ter sido desocupado na véspera e já estar 100% limpo e inspecionado pela governança.\n\nAssim que o status da limpeza constar como *LIBERADO* em nosso sistema no dia da sua chegada, você receberá um aviso automático pelo WhatsApp liberando sua entrada imediata! ✨",
      category: "checkin_acesso",
      keywords: ["early check-in", "early checkin", "checkin antecipado", "entrada antecipada", "entrar mais cedo", "reserva direta", "10h", "10:00", "chegar antes"],
      variations: [
        "Posso entrar antes das 14h no flat?",
        "Consigo fazer check-in antecipado às 10h?",
        "Quem tem direito a early check-in gratuito?",
        "Como funciona o benefício de entrada antecipada para quem reservou pelo site ou WhatsApp?",
        "O quarto já está liberado se eu chegar de manhã?",
        "Tem taxa para entrar mais cedo?"
      ],
      status: "ativo",
      scope: "all",
      clientPhones: [],
      createdAt: now,
      updatedAt: now,
      approvedAt: now
    },

    // ── 9. Check-out 12h ─────────────────────────────────────────────────────
    {
      id: "faq-checkout-12h",
      question: "Qual é o horário de check-out e como realizo a saída?",
      answer: "⏰🚪 *Instruções de Check-out (Até às 12:00h):*\n\n• *Horário Limite:* A desocupação do flat deve ocorrer impreterivelmente até às *12:00h*.\n\n📋 *Procedimento de Saída:*\n1. Verifique gavetas e armários para não esquecer pertences pessoais.\n2. Desligue os aparelhos de ar-condicionado e todas as luzes.\n3. Deixe as louças e bandejas dentro do apartamento (não deixe no corredor).\n4. Entregue o cartão magnético de acesso na portaria 24h ao sair.\n\n*Late Check-out:* Saídas após as 12:00 dependem de disponibilidade da governança e devem ser combinadas previamente via WhatsApp! Agradecemos muito pela sua estadia! 🙏✨",
      category: "checkout",
      keywords: ["checkout", "check-out", "horario check-out", "saida", "saída", "que horas sair", "deixar o flat", "entregar chave", "12h", "12:00"],
      variations: [
        "Que horas tenho que fazer o check-out?",
        "Qual o horário limite para liberar o apartamento?",
        "Como faço para entregar a chave na saída?",
        "Onde deixo o cartão de acesso quando for embora?",
        "Posso sair depois das 12h (late check-out)?",
        "Preciso avisar alguém na hora de sair?"
      ],
      status: "ativo",
      scope: "all",
      clientPhones: [],
      createdAt: now,
      updatedAt: now,
      approvedAt: now
    },

    // ── 10. Teste: Pergunta Pendente 1 ───────────────────────────────────────
    {
      id: "faq-pending-voltagem",
      question: "Qual é a voltagem das tomadas no flat? É 110V ou 220V?",
      answer: "",
      category: "estrutura_flat",
      keywords: ["voltagem", "tomada", "110v", "220v", "energia", "eletricidade"],
      variations: [
        "As tomadas são 110 ou 220?",
        "Posso ligar secador 220v?",
        "Qual voltagem do flat?"
      ],
      status: "pendente",
      scope: "all",
      clientPhones: [],
      sourceClientPhone: "5522998505276",
      sourceClientName: "Carlos Drumond",
      createdAt: now,
      updatedAt: now
    },

    // ── 11. Teste: Pergunta Pendente 2 ───────────────────────────────────────
    {
      id: "faq-pending-ferro",
      question: "O flat possui ferro e tábua de passar roupa disponíveis?",
      answer: "",
      category: "estrutura_flat",
      keywords: ["ferro", "ferro de passar", "tabua", "passar roupa", "roupa"],
      variations: [
        "Tem ferro de passar no quarto?",
        "Vocês emprestam ferro de passar?",
        "Tem como passar roupa no flat?"
      ],
      status: "pendente",
      scope: "all",
      clientPhones: [],
      sourceClientPhone: "5521988887777",
      sourceClientName: "Juliana Mendes",
      createdAt: now,
      updatedAt: now
    },

    // ── 12. Teste: Sugestão para Aprovação 1 (Cobertura/Jacuzzi) ──────────────
    {
      id: "faq-approval-jacuzzi-aquecida",
      question: "A piscina ou jacuzzi da cobertura é aquecida? Qual o horário de funcionamento?",
      answer: "",
      suggestedAnswer: "🏊‍♂️✨ *Área de Lazer & Jacuzzi (Cobertura Soho):*\n\nSim! A jacuzzi na cobertura do Edifício Soho conta com sistema de aquecimento e hidromassagem, e a área de lazer funciona diariamente das *06:00 às 22:00h*.\n\nPor regulamento do condomínio, não é permitido o consumo de bebidas em garrafas de vidro ou alimentos na área molhada. Aproveite para relaxar!",
      category: "lazer_condominio",
      keywords: ["jacuzzi", "piscina", "cobertura", "aquecida", "lazer", "horario jacuzzi", "sauna"],
      variations: [
        "A jacuzzi é quente?",
        "A piscina funciona até que horas?",
        "Posso usar a jacuzzi à noite?"
      ],
      status: "aguardando_aprovacao",
      scope: "all",
      clientPhones: [],
      sourceClientPhone: "5522997124021",
      sourceClientName: "Roberto Alencar",
      createdAt: now,
      updatedAt: now
    },

    // ── 13. Teste: Sugestão para Aprovação 2 (Garagem / Altura) ──────────────
    {
      id: "faq-approval-estacionamento-caminhonete",
      question: "A vaga de garagem comporta caminhonete grande (Hilux / Ranger) ou tem limite de altura?",
      answer: "",
      suggestedAnswer: "🚗 *Garagem & Veículos de Grande Porte:*\n\nNossa garagem coberta comporta caminhonetes e SUVs de médio e grande porte como Hilux e Ranger. A altura livre do portão de entrada é de 2,20m.\n\nPedimos apenas que informe a placa, modelo e cor do veículo no seu Check-in Digital para cadastro prévio na portaria 24h!",
      category: "garagem",
      keywords: ["garagem", "caminhonete", "altura", "estacionamento", "hilux", "ranger", "suv grande"],
      variations: [
        "Cabe caminhonete na garagem?",
        "Qual a altura máxima do estacionamento?",
        "Posso parar Hilux na garagem?"
      ],
      status: "aguardando_aprovacao",
      scope: "all",
      clientPhones: [],
      sourceClientPhone: "5524992345678",
      sourceClientName: "Marcos Vinicius",
      createdAt: now,
      updatedAt: now
    },

    // ── 14. Teste: Exceção Negativa (exclude) ─────────────────────────────────
    {
      id: "faq-rule-exclude-ota-early",
      question: "Posso solicitar early check-in antecipado gratuito?",
      answer: "Olá! O Early Check-in gratuito às 10:00 é um benefício exclusivo para reservas diretas. Para reservas via agências parceiras (Booking/Airbnb), a liberação antes das 14h está sujeita à taxa de antecipação e disponibilidade.",
      category: "checkin_acesso",
      keywords: ["early check-in cortesia", "entrada gratis antecipada"],
      variations: ["Consigo entrar mais cedo sem taxa?"],
      status: "ativo",
      scope: "exclude",
      clientPhones: ["5521999990001", "5521999990002"],
      createdAt: now,
      updatedAt: now,
      approvedAt: now
    },

    // ── 15. Teste: Exceção Positiva (include_only) ───────────────────────────
    {
      id: "faq-rule-include-vip-convenio",
      question: "Qual o procedimento para reservas corporativas com faturamento?",
      answer: "Prezado parceiro corporativo! Sua empresa possui tarifa comissionada e faturamento direto com a CorpFlats em 15 dias. Basta nos enviar a ordem de serviço ou solicitar a reserva diretamente pelo nosso canal exclusivo de gestão executiva.",
      category: "reservas",
      keywords: ["corporativo", "convenio", "faturamento", "empresa", "tarifa corporativa"],
      variations: ["Como faturar minha diária para a empresa?", "Tenho tarifa especial da firma?"],
      status: "ativo",
      scope: "include_only",
      clientPhones: ["5522998505276", "5522988486446"],
      createdAt: now,
      updatedAt: now,
      approvedAt: now
    }
  ];
}
```

---

## 7. Rule Engine Function Specification (`isFaqApplicableToClient`)

The rule engine determines whether an active FAQ item is applicable to a specific client when responding:

```javascript
import { cleanWhatsAppPhone } from "./zapi-service.mjs";

/**
 * Avalia se um item de FAQ é aplicável ao cliente com base no scope e no telefone
 * Suporta:
 * - scope "all": Válido para todos os clientes
 * - scope "exclude": Válido para todos EXCETO telefones na lista clientPhones
 * - scope "include_only": Válido EXCLUSIVAMENTE para telefones na lista clientPhones
 *
 * Utiliza cleanWhatsAppPhone e comparação por sufixo de 8 dígitos para compatibilidade
 * de telefonia celular brasileira (9º dígito móvel opcional/adicionado).
 */
export function isFaqApplicableToClient(faqItem, clientPhone = "") {
  if (!faqItem) return false;
  
  const scope = faqItem.scope || "all";
  if (scope === "all") return true;

  const targetClean = cleanWhatsAppPhone(clientPhone);

  // Lista normalizada de telefones configurados no item
  const itemPhones = (Array.isArray(faqItem.clientPhones) ? faqItem.clientPhones : [])
    .map(p => cleanWhatsAppPhone(p))
    .filter(Boolean);

  // Se não há identificação de telefone do cliente
  if (!targetClean) {
    // "exclude": Como o cliente não foi identificado na lista de exclusão, aplica o FAQ
    if (scope === "exclude") return true;
    // "include_only": Exige identificação positiva, portanto não aplica
    return false;
  }

  // Verifica se o telefone do cliente coincide com algum item configurado
  const isMatch = itemPhones.some(p => {
    if (p === targetClean) return true;
    if (p.length >= 8 && targetClean.length >= 8) {
      return targetClean.endsWith(p.slice(-8)) || p.endsWith(targetClean.slice(-8));
    }
    return false;
  });

  if (scope === "exclude") {
    // Se coincidiu com a lista de exclusão, NÃO é aplicável
    return !isMatch;
  }

  if (scope === "include_only") {
    // Só é aplicável se coincidiu com a lista autorizada
    return isMatch;
  }

  return true;
}
```

---

## 8. REST Endpoints Specification Contract

In `artifacts/api-server/zapi-service.mjs` and `scripts/zapi-service.mjs` inside `initWhatsAppEngine`:

1. `GET /api/whatsapp/faq`:
   - Returns `{ success: true, count: number, items: FaqItem[] }`
   - Sorted by `createdAt` desc, or status priority (`aguardando_aprovacao` and `pendente` first).

2. `POST /api/whatsapp/faq`:
   - Request Body: `{ question, answer?, category, keywords?, variations?, scope?, clientPhones?, status? }`
   - Generates ID `faq-${Date.now()}` or slug.
   - Sets `createdAt`, `updatedAt`. If `status === "ativo"`, sets `approvedAt`.
   - Returns `{ success: true, item: FaqItem }`
   - Invokes `saveDatabase("faq_create")`.

3. `PUT /api/whatsapp/faq/:id`:
   - Request Body: `{ question?, answer?, category?, keywords?, variations?, scope?, clientPhones?, status?, suggestedAnswer? }`
   - Updates matching item fields and `updatedAt`.
   - Returns `{ success: true, item: FaqItem }`
   - Invokes `saveDatabase("faq_update")`.

4. `DELETE /api/whatsapp/faq/:id`:
   - Removes item by ID.
   - Returns `{ success: true, id: string }`
   - Invokes `saveDatabase("faq_delete")`.

5. `POST /api/whatsapp/faq/:id/approve`:
   - 1-click approval endpoint.
   - Body (optional): `{ answer?, category? }`
   - If `item.suggestedAnswer` exists and `item.answer` is empty, promotes `suggestedAnswer` into `answer`.
   - Sets `status: "ativo"`, `approvedAt: new Date().toISOString()`, `updatedAt: new Date().toISOString()`.
   - Returns `{ success: true, item: FaqItem }`
   - Invokes `saveDatabase("faq_approve")`.

---

## 9. Verification & Mirror Integrity Plan

To guarantee system integrity:
1. `tests/whatsapp-ai-agent.test.mjs` must test:
   - Initial loading of 9 seed FAQs and test pending items.
   - `isFaqApplicableToClient` across `all`, `exclude`, and `include_only`.
   - 8-digit suffix match and format tolerance.
   - REST endpoints CRUD and 1-click approve.
   - Parity test (SHA-256) passing 100%.
2. Files to be synchronized in dual mirror:
   - `artifacts/api-server/demo-server.mjs` <-> `scripts/demo-server.mjs`
   - `artifacts/api-server/zapi-service.mjs` <-> `scripts/zapi-service.mjs`
   - `artifacts/api-server/whatsapp-ai-service.mjs` <-> `scripts/whatsapp-ai-service.mjs`

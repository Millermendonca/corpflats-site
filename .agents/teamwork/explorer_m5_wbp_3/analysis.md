# Architectural Blueprint: Milestone 5 Frontend Components, Mockups & In-System Manual (Features 28, 29, 30, 31)

**Author:** Explorer 3 — Milestone 5 (Frontend Components, Mockups & In-System Manual)  
**Date:** 2026-10-14  
**Status:** COMPLETE & AUTHORITATIVE  
**Target Milestone:** Milestone 5 (F28, F29, F30, F31)  
**Working Directory:** `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m5_wbp_3`

---

## 1. Executive Summary

This document formulates the comprehensive architectural specification, component hierarchy, interface designs, state workflows, and packaging strategy for **Milestone 5 Frontend Features**:
1. **Feature 28 (R4)**: Pricing & Publishing UI (Modelo SEBRAE, Tarifa Mínima R$ 276,63 com 100% de decomposição, modal/painel Pré-visualização & Publicar com travas de variação >30% e piso).
2. **Feature 29 (R5)**: Caixa de Entrada OTA & Quarentena UI (Layout fiel ao mockup, desduplicação rigorosa, cabeçalho de status da integração e saúde de conexão, gaveta de resolução com inspeção de payload bruto e modal de visualização segura de cartão de crédito com reautenticação admin).
3. **Feature 30 (R9)**: Manual de Ajuda Em-Sistema (Página de ajuda dedicada em português, abordando rotinas de administrador, recepção, tabela de códigos de erro da WBP `4`, `1001`, `1002`, `1003`, `1031`, `1102`, `9203` e capturas de tela reais).
4. **Feature 31 (R10)**: Frontend Build & Packaging (Estruturação em `artifacts/limpeza/src/components/pricing/` e `src/components/wbp/`, roteamento em `App.tsx`, build de produção `npm run build` gerando `artifacts/limpeza/dist/`, sem testes globais ou regressões).

---

## 2. Feature 28 (R4): Pricing & Publishing UI

### 2.1. Visual Alignment with Mockups
Strict alignment with approved mockups:
- `mockup_precificacao_1791928509939.jpg`: Aba **Tarifa Mínima** e estrutura de abas.
- `mockup_previsualizacao_v2_1791928602700.jpg`: Aba/painel **Pré-visualização & Publicar**.
- Subtitle: `Modelo SEBRAE • 19 flats`.

### 2.2. Corrected SEBRAE Mathematical Engine
In the original drawing and early spreadsheet iterations, commission was double counted (both as R$ 28,50/night within UH cost and as 15% in the divisor). Under the approved correction:
- **Custos Fixos Mensais**: R$ 38.906,61
- **Ocupação Média Real**: 65% (19 flats × 30,4167 dias × 0,65 = 375,6 diárias/mês)
- **Custo Fixo por Diária Vendida**: `38.906,61 / 375,64` = **R$ 101,62**
- **Custos Variáveis por UH**:
  - Limpeza e amenities: **R$ 23,25**
  - Enxoval: **R$ 15,51**
  - Energia e água: **R$ 9,00**
  - *Comissão em R$*: **R$ 0,00** (removida do custo para eliminar a contagem dupla)
- **Custo Total por UH Ocupada**: `101,62 + 23,25 + 15,51 + 9,00` = **R$ 149,38**
- **Fórmula de Marcação (Divisor)**:
  $$\text{Tarifa Mínima} = \frac{\text{Custo UH}}{1 - \text{Comissão (15\%)} - \text{Margem (25\%)} - \text{Imposto (6\%)}}$$
  $$\text{Tarifa Mínima} = \frac{149,38}{1 - 0,15 - 0,25 - 0,06} = \frac{149,38}{0,54} = \mathbf{R\$\ 276,63} \ (\pm 0,05)$$

#### Composição com Fechamento 100%:
| Componente | Percentual | Valor Unitário | Função |
|---|---|---|---|
| **Custo por UH** | 54,00% | R$ 149,38 | Cobertura operacional direta e rateio fixo |
| **Comissão do Canal** | 15,00% | R$ 41,49 | Margem repassada às OTAs (Booking / Airbnb) |
| **Margem de Lucro** | 25,00% | R$ 69,16 | Margem operacional líquida do empreendimento |
| **Imposto (Simples/ISS)**| 6,00% | R$ 16,60 | Carga tributária direta sobre faturamento |
| **Total** | **100,00%** | **R$ 276,63** | **Tarifa Mínima Sustentável (Piso)** — *✓ fecha 100%* |

### 2.3. Component Architecture: `src/components/pricing/`
```
artifacts/limpeza/src/components/pricing/
├── index.ts                     # Export barrel
├── PricingContainer.tsx         # Master page shell, tab switcher, state loader
├── PricingHeader.tsx            # Title, subtitle, integration mode status
├── UnpublishedAlertBanner.tsx   # Yellow alert banner for uncommitted/staged rates
├── SebraePricingTab.tsx         # Tab: Tarifa Mínima (3 cards: Custo UH, Fórmula/Barra, Planos)
├── CostsTab.tsx                 # Tab: Custos (Fixos mensais, variáveis, sensibilidade ocupação)
├── SeasonalityTab.tsx           # Tab: Tarifário & Sazonalidade (Curva ocupação histórica, fim de semana)
├── ChannelsTab.tsx              # Tab: Canais (Markup, taxas de cartão/VCC, tarifa líquida)
├── RestrictionsTab.tsx          # Tab: Restrições (7 restrições WBP: min/max stay, stop-sell, CTA/CTD)
├── PublishPreviewTab.tsx        # Tab: Pré-visualização & Publicar (KPIs, tabela, travas, botões)
└── AnalyticsTab.tsx             # Tab: Análises (Orçamento anual e indicadores por canal)
```

### 2.4. Detailed UI Tabs Specification

#### 1. Aba "Tarifa Mínima" (`SebraePricingTab.tsx`)
Segue estritamente a grade de 3 cartões do mockup:
- **Card 1: Custo por UH Ocupada**:
  - Tabela com Custos Fixos Mensais (R$ 38.906,61), Ocupação Média (65%), Custo Fixo por Diária (R$ 101,62), Limpeza/Amenities (R$ 23,25), Enxoval (R$ 15,51), Energia/Água (R$ 9,00).
  - Linha de total em destaque: **Total por UH ocupada: R$ 149,38**.
- **Card 2: Fórmula**:
  - Expressão matemática formatada: $\text{Tarifa mínima} = \text{Custo} \div (1 - \text{Comissão}_{15\%} - \text{Margem}_{25\%} - \text{Imposto}_{6\%})$.
  - Preço Hero gigante em destaque: **R$ 276,63** com legenda `Tarifa mínima sustentável (piso)`.
  - Barra de Composição Stacked: barra contínua com cantos arredondados dividida em 4 blocos proporcionais (Custo verde esmeralda `bg-emerald-600`, Comissão coral `bg-orange-500`, Margem menta `bg-teal-400`, Imposto azul `bg-sky-600`).
  - Total com badge de validação: `R$ 276,63` e pill verde `✓ fecha 100%`.
- **Card 3: Planos Publicados**:
  - `Sem café`: Plano Base.
  - `Com café`: `+ R$ 25,00 por hóspede/noite` (campo ajustável).
  - `Teto por plano (opcional)`: switch Radix para ligar/desligar teto máximo de estoque.

#### 2. Banner de Alerta Amarelo (`UnpublishedAlertBanner.tsx`)
- Renderizado sempre que existirem alterações em rascunho (`status === 'staged'` retornado por `GET /api/wbp/pricing/settings` ou na pré-visualização).
- Visual: fundo amarelo âmbar suave (`bg-amber-100 border border-amber-300 dark:bg-amber-950/40 dark:border-amber-700`), ícone `AlertTriangle`.
- Texto: `⚠️ {count} alterações não publicadas — revise na Pré-visualização antes de enviar às OTAs`.
- Botão de ação à direita: `Ir para Pré-visualização` (navega para a aba de publicação).

#### 3. Aba "Pré-visualização & Publicar" (`PublishPreviewTab.tsx`)
- **KPI Cards no Topo**:
  - `Datas afetadas`: chip neutro com contagem (ex: 42).
  - `Preços alterados`: chip neutro com contagem (ex: 84).
  - `Retidos pela trava`: chip de aviso âmbar com ícone de cadeado e contagem (ex: 3).
  - `Abaixo do piso`: chip verde com contagem (ex: 0).
- **Tabela Principal (Alterações Pendentes)**:
  - Colunas: `Data`, `Plano`, `Atual`, `Novo`, `Variação`, `Livres`.
  - Destaca em fundo âmbar e adiciona ícone de trava `Lock` (`+38% 🔒`) em linhas com variação superior ao teto configurado (padrão 30%).
- **Painel Lateral de Variações Retidas ("Retidos pela trava de variação (30%)")**:
  - Lista cada ocorrência retida (ex: `15/11 Sem café: R$ 329,41 → R$ 455,00 (+38%)`).
  - Botões dedicados: `[Confirmar]` (dispara `POST /api/wbp/pricing/confirm-variation`) e `[Descartar]` (dispara `POST /api/wbp/pricing/discard-variation`).
- **Barra de Ações Inferior**:
  - Botão Primário: `Publicar {N} alterações na WebBookingPro` (`POST /api/wbp/pricing/publish`). Bloqueado se houver tarifas retidas pela trava de variação ainda não confirmadas.
  - Botão Secundário: `Descartar tudo` (`POST /api/wbp/pricing/discard-variation` com `discardAll: true`).

---

## 3. Feature 29 (R5): OTA Inbox & Quarantine UI

### 3.1. Visual Alignment with Mockup
Segue estritamente `mockup_caixa_entrada_ota_1791928543273.jpg`.
- **Deduplicação Obrigatória**: A tabela elimina o erro visual de linhas duplicadas presente no desenho conceitual, agrupando os registros por `bookingId` e mantendo apenas o estado mais recente de cada reserva.

### 3.2. Component Architecture: `src/components/wbp/`
```
artifacts/limpeza/src/components/wbp/
├── index.ts                     # Export barrel
├── OtaInboxPage.tsx             # Master page container
├── OtaInboxHeader.tsx           # Status mode pill, polling & ARI health indicators
├── OtaInboxTable.tsx            # Clean deduplicated reservations table with tabs
├── QuarantineDrawer.tsx         # Slide-over resolution drawer
├── SecureCardModal.tsx          # PCI-DSS admin re-authentication & single-use PAN view modal
└── WbpHelpManualPage.tsx        # In-System Help Manual (Feature 30)
```

### 3.3. Cabeçalho e Saúde da Conexão (`OtaInboxHeader.tsx`)
- **Pill de Modo Operacional**:
  - `WebBookingPro • Modo: Desligado` (badge cinza neutro).
  - `WebBookingPro • Modo: Somente observar` (badge amarelo/âmbar de atenção).
  - `WebBookingPro • Modo: Automático` (badge verde esmeralda com ponto pulsante).
  - Ação rápida ao clicar: abre modal de configuração do modo (`POST /api/wbp/mode`).
- **Indicadores de Telemetria**:
  - `🟢 Último polling: há {X} min`
  - `🟢 Último ARI: há {Y} s`
  - Botão de ação rápida: `[Consultar OTAs]` (`POST /api/wbp/worker/poll`) e `[Sincronizar ARI]` (`POST /api/wbp/ari/full-sync`).

### 3.4. Tabela de Reservas e Filtros (`OtaInboxTable.tsx`)
- **Abas de Filtragem**:
  - `Todas ({total})`
  - `Importadas ({imported})`
  - `Quarentena ({quarantine})` (com badge vermelho quando > 0)
  - `Vinculadas ({linked})`
  - `Canceladas pela OTA ({cancelled})`
- **Colunas da Lista**:
  1. `Recebida`: Data e hora de recepção formatada (ex: `13/10 18:02`).
  2. `Canal`: Logo/badge do canal (Booking.com em azul `#003580`, Airbnb em vermelho `#FF385C`).
  3. `Nº OTA`: Código identificador externo (ex: `4829173651`, `HMQ8X2`).
  4. `Hóspede`: Nome do titular.
  5. `Datas`: Check-in → Check-out + total de noites (ex: `20/10 → 23/10 (3 noites)`).
  6. `Plano`: `Sem café` vs `Com café`.
  7. `Pagamento`:
     - `Pago pela OTA` (`PaymentCollect = Channel`).
     - `Cobrar no hotel` (`PaymentCollect = Property`) com destaque em alerta âmbar.
  8. `Status`: Badges com estilos semânticos:
     - `Importada`: badge verde.
     - `Quarentena: {motivo}`: badge vermelho/rosa (ex: `Quarentena: sem flat livre`).
     - `Vinculada a RES-xxx`: badge azul claro.
     - `Cancelada pela OTA`: badge cinza.
  9. `Flat`: Número da unidade alocada (ex: `605`, `512` ou `—` se pendente em quarentena).
  10. `Ações`: Botão de abertura do painel de detalhes / gaveta de resolução.

### 3.5. Gaveta de Resolução de Quarentena (`QuarantineDrawer.tsx`)
Gaveta lateral deslizante (*slide-over drawer*) que surge ao clicar em qualquer item em quarentena:
- **Cabeçalho**: `Quarentena — {Nome do Hóspede}`.
- **Motivo em Destaque**:
  - `OVERBOOKING`: "Overbooking: 0 flats livres nas datas {datas}".
  - `MAINTENANCE_BLOCKED`: "Flat bloqueado por ordem de manutenção".
  - `CONFLICT`: "Conflito direto com reserva existente".
  - `CHECKED_IN_CANCELLATION`: "Cancelamento recebido da OTA, mas o hóspede já realizou check-in presencial no hotel".
  - `AMBIGUOUS_RECONCILIATION`: "Dados da reserva coincidem parcialmente com reserva manual digitada".
- **Widget de Disponibilidade ao Vivo**:
  - Consulta `GET /api/wbp/availability` e exibe quantos flats estão disponíveis para as datas.
- **Botões de Ação Imediata**:
  1. `Alocar flat manualmente`:
     - Seletor dos 19 flats do condomínio com indicador de status (livre / ocupado).
     - Confirmação dispara `POST /api/wbp/quarantine/:id/resolve` com `{ action: "assign_flat", flatNumber }`.
  2. `Aceitar mesmo assim` (Forçar aceite):
     - Dispara `POST /api/wbp/quarantine/:id/resolve` com `{ action: "force_accept", notes }`.
  3. `Rejeitar e avisar`:
     - Dispara `POST /api/wbp/quarantine/:id/reject` com `{ reason, notes }`.
- **Seção Colapsável de Payload Bruto**:
  - `> Payload original (JSON)`: visualizador com realce de sintaxe JSON do payload recebido da WebBookingPro, com botão "Copiar".
- **Área de Cartão Mascarado**:
  - `🔒 Cartão •••• {last4} ({bandeira}) — Ver (exige senha)`.
  - Ao clicar em "Ver", abre o modal de segurança.

### 3.6. Modal de Visualização Segura de Cartão (`SecureCardModal.tsx`)
Implementa o protocolo de conformidade estrita PCI-DSS:
1. **Passo 1: Reautenticação do Administrador**:
   - Diálogo modal solicitando a senha de login do administrador.
   - Chamada: `POST /api/wbp/vault/reauth` enviando a senha.
   - O servidor valida a credencial do administrador e emite um token criptográfico único (`crypto.randomUUID()`) com validade rígida de **5 minutos**.
2. **Passo 2: Visualização Única Decriptografada**:
   - O frontend chama `POST /api/wbp/vault/view` com `{ token, bookingId }`.
   - O servidor invalida o token **imediatamente na primeira leitura** (uso estritamente único) e grava uma entrada em `audit_logs.jsonl`.
   - Exibição:
     - `Número Completo`: formato `XXXX XXXX XXXX XXXX` com botão de cópia rápida.
     - `Validade`: `MM/YYYY`.
     - `Titular`: Nome impresso no cartão.
     - `Bandeira`: Visa, Mastercard, Elo, Amex, etc.
     - `Código de Segurança (CVV)`: **"Não armazenado — descartado na recepção conforme norma PCI-DSS"**.
     - Temporizador regressivo visível de 5 minutos.
     - Aviso de auditoria: "Visualização registrada na trilha de auditoria do sistema".

---

## 4. Feature 30 (R9): In-System Help Manual

### 4.1. Requirements & Delivery Format
- **Manual entregue EXCLUSIVAMENTE dentro do sistema**: acessível via rota `/ajuda-wbp` (e aliases `/manual-wbp`, `/manual-integracao`), com link direto no menu lateral (`⚙️ Sistema & Integrações` e `🌐 Channel Manager`) e no botão `(?)` do topo.
- Escrito em português claro, profissional e didático para operadores humanos.
- Não contém textos genéricos ou marcadores de posição — inclui dados exatos da propriedade (CorpFlats Soho Residence, 19 flats, Campos dos Goytacazes/RJ) e parâmetros da WebBookingPro.

### 4.2. Estrutura de Conteúdo do Manual

#### Seção 1: Guia do Administrador
1. **Obtenção de Credenciais na WebBookingPro**:
   - Procedimento para solicitar credenciais de integração à equipe de suporte da WebBookingPro: `cid` (Company ID), `shared_secret`, ID da Propriedade e Senha.
   - Configuração das variáveis de ambiente no Render (`WBP_CID`, `WBP_SHARED_SECRET`, `WBP_PROPERTY_ID`, `WBP_PROPERTY_PASSWORD`, `WBP_ENDPOINT_URL`, `CREDIT_CARD_VAULT_KEY`).
2. **Mapeamento de Quartos e Planos**:
   - Modelo canônico da propriedade: **1 tipo de quarto `"Flat"`** (código `flat`) com estoque compartilhado de 19 flats.
   - **2 Planos Tarifários**:
     - `"Sem café"` (`sem_cafe`): tarifa base da acomodação.
     - `"Com café"` (`com_cafe`): tarifa base acrescida de valor fixo por hóspede/noite (R$ 25,00 padrão).
   - Teto por plano: mecanismo de controle de estoque máximo sem alterar a disponibilidade física global.
3. **Modos de Operação (`off`, `observe`, `auto`) e Sandbox**:
   - `Desligado` (`off`): nenhuma chamada de saída, nenhum agendador ativo, silêncio total.
   - `Somente Observar` (`observe`): captação durável de reservas e callbacks, gravação na Caixa de Entrada OTA, mas sem criar reservas reais e sem disparar automações de WhatsApp/e-mail.
   - `Automático` (`auto`): importação instantânea, alocação inteligente de quartos (fair-share), envio automático de mensagens e sincronização contínua de ARI.
   - Uso do Simulador Local WebBookingPro (`e2e/wbp-simulator`) para testes de homologação.
4. **Conciliação Inicial e Entrada em Produção**:
   - Como funciona o algoritmo de correspondência: reservas manuais pré-existentes de Booking/Airbnb com mesmo canal, mesmas datas e nome semelhante são vinculadas sem duplicação e sem alteração de preço. Casos divergentes vão para a Quarentena.
5. **Precificação SEBRAE e Travas Operacionais**:
   - Explicação da metodologia corrigida: Custo UH de R$ 149,38 gerando Tarifa Mínima de R$ 276,63 com 100% de decomposição (Custo 54%, Comissão 15%, Margem 25%, Imposto 6%).
   - Trava de Piso: impossibilidade de envio de tarifa inferior a R$ 276,63.
   - Trava de Variação (30%): retenção automática de preços com oscilação brusca.
   - Fluxo de Publicação: mudanças em custos e parâmetros ficam em rascunho (*staged*) até aprovação na Pré-visualização.
6. **Cofre de Cartões Criptografado e Segurança PCI-DSS**:
   - Criptografia AES-256-GCM com chave isolada em variável de ambiente.
   - Descarte irreversível de CVV em memória antes de qualquer gravação.
   - Reautenticação do administrador gerando token descartável de 5 minutos para visualização pontual com trilha de auditoria.
   - Expulgo automático de dados do cartão após 7 dias do check-out ou no cancelamento sem multa.
7. **Central de Alertas e Notificações**:
   - Configuração de canais WhatsApp e E-mail.
   - 4 Eventos críticos que disparam alerta imediato: Quarentena, Overbooking, Falha de ARI > 15 minutos e Tarifa retida pela trava.
   - Relatório resumo diário às 08:00.

#### Seção 2: Tabela de Códigos de Erro da WebBookingPro
Tabela exaustiva com causas e ações de resolução:

| Código | Mensagem WBP | Causa Provável | Procedimento de Resolução no Guest-Flow-Manager |
|:---:|---|---|---|
| **`4`** | `System error` | Instabilidade temporária ou falha interna nos servidores da WebBookingPro | Aguarde o reenvio automático da fila com backoff exponencial. Verifique o status da conexão no topo da Caixa de Entrada OTA. |
| **`1001`** | `Invalid credentials` | `cid` ou `shared_secret` incorretos, ou assinatura de autenticação SHA-1 inválida | Verifique as variáveis de ambiente `WBP_CID` e `WBP_SHARED_SECRET` no painel do Render. Certifique-se de que não há espaços ou quebras de linha nas chaves. |
| **`1002`** | `Hotel not found` | O identificador da propriedade (`wbp_property_id`) não existe ou não está ativo na WebBookingPro | Confirme se o ID da propriedade no PMS corresponde exatamente ao código fornecido pelo suporte da WBP para o CorpFlats Soho. |
| **`1003`** | `Room or rate not mapped` | Código de quarto ou de plano tarifário não mapeado no channel manager | Acesse a tela de Mapeamento do PMS e confira se os códigos enviados são exatamente `flat` para o quarto e `sem_cafe` / `com_cafe` para os planos. |
| **`1031`** | `Integration disabled` | A integração da propriedade está desativada no channel manager ou no interruptor do PMS | No PMS, altere o modo de `Desligado` para `Somente Observar` ou `Automático`. Na WebBookingPro, solicite a ativação da conectividade XML. |
| **`1102`** | `ARI validation error` | Payload de ARI rejeitado pela validação de schema (ex: datas fora do padrão, `end_date` incorreto, tarifas inválidas) | O PMS garante que `end_date` seja sempre inclusivo e que nenhuma tarifa seja negativa. Revise se há bloqueios manuais com datas invertidas. |
| **`9203`** | `Rate below minimum floor` | Tarifa enviada é inferior ao valor mínimo parametrizado no canal ou no PMS | O sistema bloqueia automaticamente qualquer tarifa abaixo de R$ 276,63 através da Trava de Piso. Ajuste as tarifas na aba "Tarifário & Sazonalidade". |

#### Seção 3: Guia Operacional da Recepção
1. **Rotina Diária do Recepcionista**:
   - Abrir a "Caixa de Entrada OTA" no início de cada turno.
   - Observar o contador numérico da Quarentena (badge vermelho no menu e na tabela).
   - Verificar novas reservas importadas automaticamente e confirmar as unidades alocadas no Livro de Reservas (`/reservas`).
2. **Resolução de Quarentena Passo a Passo**:
   - Quando uma reserva entra em quarentena, clicar sobre ela para abrir a gaveta lateral de resolução.
   - Se o motivo for *Overbooking*: verificar se há unidades em manutenção ou pré-reservas não pagas que possam ser liberadas, ou contatar o gestor.
   - Se o motivo for *Flat Bloqueado*: clicar em "Alocar flat manualmente", selecionar um flat livre no dropdown e clicar em "Confirmar Alocação".
   - Se for *Correspondência Ambígua*: comparar as datas e nomes com a reserva manual pré-existente e clicar em "Vincular a Reserva Existente".
3. **Regra de Ouro de Pagamentos: `PaymentCollect = Channel` vs `Property`**:
   - **`PaymentCollect = Channel` (Pago pela OTA)**:
     - **NUNCA COBRAR AS DIÁRIAS DO HÓSPEDE NA RECEPÇÃO!**
     - O valor já foi cobrado pela Booking.com ou pelo Airbnb (o hotel recebe via cartão virtual ou depósito bancário).
     - Cobrar na recepção apenas extras consumidos (café avulso, taxa de pet, estacionamento adicional).
   - **`PaymentCollect = Property` (Cobrar no Hotel)**:
     - O hóspede optou por pagar diretamente no estabelecimento.
     - **COBRAR NO CHECK-IN**: solicitar o pagamento via máquina de cartão de crédito/débito, PIX ou dinheiro.
     - Em caso de no-show ou cancelamento fora do prazo, os dados do cartão de garantia poderão ser consultados pelo administrador no sistema.

#### Seção 4: Capturas de Tela e Referências Visuais
- Componente rico com cards visuais ilustrando:
  - Tela de Precificação SEBRAE e Barra de Decomposição 100%.
  - Modal de Pré-visualização & Publicar com Travas de Variação >30%.
  - Caixa de Entrada OTA com Gaveta de Quarentena e Seletor de Flats.
  - Fluxograma do Ciclo de Vida da Reserva da OTA (Ingestão → Quarentena ou Alocação → ARI Incremental).

---

## 5. Feature 31 (R10): Frontend Build & Packaging

### 5.1. Directory Structure Compliance
Todos os componentes são estruturados de forma modular e limpa dentro do workspace `artifacts/limpeza/`:
```
artifacts/limpeza/
├── package.json
├── src/
│   ├── App.tsx                        # Roteamento central e permissões
│   ├── components/
│   │   ├── layout.tsx                 # Menu lateral e barra superior com badges
│   │   ├── pricing/                   # Feature 28
│   │   └── wbp/                       # Features 29 e 30
│   └── pages/
│       ├── ota-inbox.tsx              # Página wrapper da Caixa de Entrada OTA
│       ├── precificacao-sebrae.tsx    # Página wrapper da Precificação SEBRAE
│       └── wbp-manual.tsx             # Página wrapper do Manual de Ajuda
└── dist/
    └── public/
        ├── index.html
        └── assets/
            ├── index.js
            └── index.css
```

### 5.2. Routing Configuration in `App.tsx`
```tsx
import OtaInboxPage from '@/pages/ota-inbox';
import PricingSebraePage from '@/pages/precificacao-sebrae';
import WbpManualPage from '@/pages/wbp-manual';

// ... Dentro do <Switch> do Router:

// Feature 28: Precificação SEBRAE & Publicar (Admin Only)
<AdminRoute path="/precificacao-sebrae" component={PricingSebraePage} moduleName="a Precificação SEBRAE" />
<AdminRoute path="/precificacao" component={PricingSebraePage} moduleName="a Precificação SEBRAE" />

// Feature 29: Caixa de Entrada OTA & Quarentena (Recepção e Admin)
<ReceptionRoute path="/caixa-entrada-ota" component={OtaInboxPage} moduleName="a Caixa de Entrada OTA" />
<ReceptionRoute path="/ota-inbox" component={OtaInboxPage} moduleName="a Caixa de Entrada OTA" />
<ReceptionRoute path="/quarentena" component={OtaInboxPage} moduleName="a Quarentena de Reservas" />

// Feature 30: Manual em Sistema da Integração WebBookingPro (Recepção e Admin)
<ReceptionRoute path="/ajuda-wbp" component={WbpManualPage} moduleName="o Manual da Integração WebBookingPro" />
<ReceptionRoute path="/manual-wbp" component={WbpManualPage} moduleName="o Manual da Integração WebBookingPro" />
<ReceptionRoute path="/manual-integracao" component={WbpManualPage} moduleName="o Manual da Integração WebBookingPro" />
```

### 5.3. Navegação em `layout.tsx`
No array `navCategories`:
1. Sob **📅 Reservas & Hospedagem**:
   ```tsx
   { 
     href: "/caixa-entrada-ota", 
     label: "Caixa de Entrada OTA", 
     icon: Inbox, 
     badge: quarantineCount > 0 ? quarantineCount : null, 
     description: "Reservas Booking/Airbnb, quarentena e conciliação" 
   }
   ```
2. Sob **💰 Financeiro & Vendas**:
   ```tsx
   { 
     href: "/precificacao-sebrae", 
     label: "Precificação SEBRAE", 
     icon: Sparkles, 
     description: "Custo por UH (R$ 149,38), tarifa mínima R$ 276,63 e travas" 
   }
   ```
3. Sob **⚙️ Sistema & Integrações**:
   ```tsx
   { 
     href: "/ajuda-wbp", 
     label: "Manual de Integração WBP", 
     icon: HelpCircle, 
     description: "Guia completo, rotinas da recepção e códigos de erro" 
   }
   ```
4. Na barra superior de ações rápidas (ao lado do sino de notificações e botão da Sofia IA):
   - Adicionar botão com ícone `HelpCircle` que navega para `/ajuda-wbp`.

### 5.4. Build Pipeline e Regras do Repositório
- **Comando de Build**: Executar `npm run build` na pasta `artifacts/limpeza`.
  - Vite compila o TypeScript (`tsc -p tsconfig.json --noEmit` opcional em typecheck) e gera os bundles minificados em `artifacts/limpeza/dist/public/`.
- **Inclusão do `dist/` no Git**: Conforme `AGENTS.md`, os arquivos gerados em `artifacts/limpeza/dist/` devem ser adicionados ao commit para garantir o deploy contínuo em produção no Render sem necessidade de compilação em runtime.
- **Push Obrigatório**: Executar `git push origin feature/wbp-integration` imediatamente após o commit.

---

## 6. Endpoints do Backend Integrados pelo Frontend

| Endpoint | Método | Descrição | Utilizado em |
|---|---|---|---|
| `/api/wbp/mode` | GET/POST | Consulta e altera o modo (`off`, `observe`, `auto`) | Cabeçalho da Caixa de Entrada OTA e Precificação |
| `/api/wbp/pricing/settings` | GET/POST | Parâmetros de custos, comissões, margem e status | Abas Custos, Tarifa Mínima e Canais |
| `/api/wbp/pricing/calculate` | POST | Simulação instantânea da tarifa SEBRAE | Aba Tarifa Mínima |
| `/api/wbp/pricing/preview` | GET | Comparativo data a data (atual vs novo) e travas | Aba Pré-visualização & Publicar |
| `/api/wbp/pricing/confirm-variation` | POST | Confirmação explícita de variação retida (>30%) | Painel lateral de travas na Pré-visualização |
| `/api/wbp/pricing/discard-variation` | POST | Descarte de variação individual ou global | Painel lateral e botão "Descartar tudo" |
| `/api/wbp/pricing/publish` | POST | Publicação oficial para envio ao channel manager | Botão "Publicar alterações na WebBookingPro" |
| `/api/wbp/restrictions` | GET/POST | Consulta e gravação das 7 restrições de ARI | Aba Restrições |
| `/api/wbp/inbox` | GET | Lista de todas as reservas recebidas via WBP | Tabela da Caixa de Entrada OTA |
| `/api/wbp/quarantine` | GET/POST | Lista de itens atualmente em quarentena | Filtro Quarentena e badges de contagem |
| `/api/wbp/quarantine/:id` | GET | Detalhes e disponibilidade ao vivo de um item | Abertura da Gaveta de Resolução |
| `/api/wbp/quarantine/:id/resolve` | POST | Resolução por alocação manual ou aceite forçado | Ações da Gaveta de Resolução |
| `/api/wbp/quarantine/:id/reject` | POST | Rejeição justificada de reserva em quarentena | Botão "Rejeitar e avisar" |
| `/api/wbp/vault/reauth` | POST | Reautenticação admin para emissão de token de 5 min | Modal de Visualização de Cartão (F26) |
| `/api/wbp/vault/view` | POST | Resgate de dados decriptografados (uso único) | Modal de Visualização de Cartão (F26) |
| `/api/wbp/ari/full-sync` | POST | Forçar carga inicial completa de ARI | Botão de sincronização no cabeçalho OTA |
| `/api/wbp/worker/poll` | POST | Disparar ciclo imediato de consulta de reservas | Botão "Consultar OTAs Agora" |

---

## 7. Diretrizes para o Implementador (Worker M5)

1. **Criar pastas e arquivos modulares**:
   - Manter código legível, fortemente tipado e com separação clara de responsabilidades.
   - Componentes menores e reutilizáveis (botões, badges, modais).
2. **Respeito aos Componentes de UI Existentes**:
   - Utilizar componentes Radix existentes em `src/components/ui/` (`card.tsx`, `tabs.tsx`, `dialog.tsx`, `switch.tsx`, `badge.tsx`, `button.tsx`, `input.tsx`, etc.).
   - Utilizar Tailwind CSS consistente com a identidade visual do CorpFlats.
3. **Sem Duplicidade de Linhas**:
   - Garantir que a renderização da tabela OTA Inbox use uma chave única (`item.bookingId || item.id`) e filtre duplicidades no cliente caso o backend retorne múltiplos históricos.
4. **Build & Verificação**:
   - Rodar `npm run build` na pasta `artifacts/limpeza` após concluir a codificação para certificar que não há erros de tipagem TypeScript ou de empacotamento Vite.
   - Confirmar a integridade de `dist/public/` e incluir no commit.

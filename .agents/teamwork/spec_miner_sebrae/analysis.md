# Análise Técnica & Especificação Detalhada: Motor de Precificação SEBRAE, Travas de Segurança e Workflows de UI (WebBookingPro ↔ Guest-Flow-Manager)

**Data de Emissão**: 2026-10-13  
**Autor**: SEBRAE Pricing & UI Workflow Spec Miner  
**Escopo**: Extração exata e documentação técnica dos modelos matemáticos, travas operacionais de preços e telas de workflow (Tarifa Mínima, Pré-visualização & Publicar, Caixa de Entrada OTA, Relatório de Conciliação Inicial e Manual de Ajuda R9).

---

## 1. Features Discovered

A tabela abaixo consolida todas as funcionalidades mineradas a partir da planilha de precificação SEBRAE (`Kit Precificacao Hoteleira SEBRAE.xlsx`), do dump estrutural (`sebrae_dump.txt`), da análise comparativa (`analise_precificacao_sebrae.md`), dos mockups visuais aprovados (`mockups.md`), do código legado em produção (`demo-server.mjs`) e dos requisitos centrais (`ORIGINAL_REQUEST.md`).

| # | Categoria | Feature | Descrição | Inputs | Outputs | Comportamento de Erro | Descoberto Via |
|---|---|---|---|---|---|---|---|
| 1 | **Motor SEBRAE** | Rateio de Custo Fixo por Diária Vendida | Calcula o custo fixo real que cada diária vendida carrega considerando a ocupação projetada | Custos fixos mensais (R$), UHs ativas (19), Dias reais do mês (28-31), Ocupação média prevista (%) | Custo fixo rateado por diária vendida (R$ 101,62) | Divisão por zero se ocupação ou dias = 0 (fallback para custo por diária disponível) | Planilha SEBRAE (Custo por UH: C20) & ORIGINAL_REQUEST.md R4 |
| 2 | **Motor SEBRAE** | Composição de Custos Variáveis por UH | Soma os custos diretos incorridos por quarto ocupado (limpeza/amenities, enxoval, energia/água) sem duplicar comissão | `varCleaning` (R$ 23,25), `varLinens` (R$ 15,51), `varUtilities` (R$ 9,00) | Custo variável por UH (R$ 47,76) | Rejeição de valores negativos; alerta se componentes zerados | Planilha SEBRAE (Custo por UH: C23-C28) & ORIGINAL_REQUEST.md R4 |
| 3 | **Motor SEBRAE** | Cálculo da Tarifa Mínima Sustentável | Determina o piso de venda usando o divisor de margem líquida com imposto explícito: `Custo ÷ (1 − Com% − Marg% − Imp%)` | Custo Total UH (R$ 149,38), Comissão canal (15%), Margem lucro (25%), Imposto Simples/ISS (6%) | Tarifa Mínima exata (R$ 276,63) | Erro `INVALID_DENOMINATOR` se soma das deduções percentuais >= 100% | Planilha SEBRAE (Tarifa Mínima: C14) & ORIGINAL_REQUEST.md R4 |
| 4 | **Motor SEBRAE** | Fechamento 100% da Composição | Decomposição analítica da diária em 4 parcelas (Custo, Comissão, Margem, Imposto) que somam perfeitamente a diária total | Tarifa Mínima (R$ 276,63), alíquotas percentuais | Parcelas em R$ (R$ 149,38; R$ 41,49; R$ 69,16; R$ 16,60) somando R$ 276,63 (100%) | Detecção de resíduo de centavos com arredondamento compensado | Mockup Tarifa Mínima & ORIGINAL_REQUEST.md R4 |
| 5 | **Motor SEBRAE** | Matriz de Sensibilidade (Comissão × Margem) | Tabela bidimensional simulando a tarifa mínima para variações de comissão (0% a 25%) e margem (15% a 30%) | Custo UH fixo, vetores de comissões e margens | Grid de tarifas recomendadas | Células com dedução >= 100% exibem traço "-" | Planilha SEBRAE (Tarifa Mínima: B25:F30) |
| 6 | **Motor SEBRAE** | Curva de Sazonalidade Baseada em Ocupação Histórica | Modulação da tarifa base conforme a ocupação histórica real dos 19 flats (Alta >= 75%: +15%; Baixa < 55%: -10%; Média: 0%) | Histórico de ocupação por mês dos flats, thresholds configuráveis, fatores de ajuste | Tarifa sugerida sazonal por mês | Fallback para fatores estáticos padrão caso histórico < 3 meses | Planilha SEBRAE (Tarifário Dinâmico: B15:G27) & analise_precificacao_sebrae.md |
| 7 | **Motor SEBRAE** | Tarifa Líquida por Canal (Net Yield) | Simula o rendimento real recebido após descontar comissão de OTA e taxa de intermediação financeira (cartão/VCC) | Tarifa de venda anunciada, % comissão canal, % taxa cartão/VCC | Valor líquido recebido (R$), Perda total (R$ e %) | Alerta se líquido < Custo por UH (venda com prejuízo) | Planilha SEBRAE (Tarifa Líquida por Canal) |
| 8 | **Travas de Preço** | Trava de Piso Sustentável (Floor Lock) | Impede envio ao WebBookingPro ou gravação de tarifas abaixo do piso mínimo sustentável | Tarifa calculada / editada, `floorRate = max(tarifaMinima, pisoManual)` | Tarifa validada ou bloqueio com flag `BELOW_FLOOR` | Bloqueio de publicação; exibição no contador "Abaixo do piso" | ORIGINAL_REQUEST.md R4 & Mockup Pré-visualização |
| 9 | **Travas de Preço** | Trava de Variação Máxima (Variation Lock) | Retém alterações cuja variação percentual em relação ao último valor enviado à OTA exceda o limite (padrão 30%) | Tarifa proposta, Última tarifa enviada à OTA, Threshold (default 30%) | Flag `LOCKED_VARIATION`, retenção de envio, highlight visual | Não envia à OTA até que o administrador clique em "Confirmar" | ORIGINAL_REQUEST.md R4 & Mockup Pré-visualização |
| 10 | **Workflow UI** | Workflow de Pré-visualização e Publicar | Separa a edição de custos/regras do envio às OTAs. Mudanças ficam em rascunho até revisão e clique em "Publicar" | Parâmetros alterados, horizonte de datas (hoje até 31/12 ano seguinte) | Diff diário (Atual vs Novo, Variação %, Livres, Retidos), lote de publicação | Reversão sem envio se o usuário clicar em "Descartar tudo" | ORIGINAL_REQUEST.md R4 & Mockup Pré-visualização |
| 11 | **Planos Tarifários** | OBP com Adicional de Café por Hóspede | Gera a precificação dos dois planos ("Sem café" = base; "Com café" = base + R$ por hóspede/noite) para 1, 2 e 3 hóspedes | Diária base "Sem café", Valor do café por hóspede (ex: R$ 25,00/hóspede), Configuração de leito | Campos ARI da API: `rate`, `rdef_single`, `adult_1`, `adult_2`, `adult_3` | Validação de consistência: `adult_2` >= `rdef_single` | ORIGINAL_REQUEST.md R3 & Mockup Tarifa Mínima |
| 12 | **Gestão de Estoque** | Teto Opcional por Plano Tarifário | Permite limitar a quantidade máxima de flats oferecidos num plano específico, respeitando a disponibilidade física | Teto configurado por plano por data, flats livres reais | `units = min(teto, flats_livres)` enviado no ARIUpdate | Se teto <= 0, plano é fechado (`close=1`) naquela data | ORIGINAL_REQUEST.md R3 & Mockup Tarifa Mínima |
| 13 | **Caixa Entrada** | Triagem e Quarentena de Reservas OTA | Recebe reservas de OTAs e aloca automaticamente ou encaminha para quarentena se houver impedimento | Payload de reserva (BookingCreate / polling), Disponibilidade de flats | Reserva ativa alocada OU item em quarentena com badge de motivo | Falha não perde payload: gravação durável pré-processamento | ORIGINAL_REQUEST.md R5 & Mockup Caixa de Entrada |
| 14 | **Caixa Entrada** | Painel Lateral de Resolução da Quarentena | Drawer interativo para o gestor resolver reservas retidas (alocação manual, aceitar com overbooking, rejeitar e avisar) | Reserva em quarentena selecionada | Ações de resolução, atualização de status e histórico de auditoria | Exige confirmação explícita para ações com risco de overbooking | Mockup Caixa de Entrada OTA |
| 15 | **Caixa Entrada** | Visualização Segura de Cartão com Senha | Exibe dados de cartão de crédito protegidos mediante redigitação de senha do administrador (token efêmero de 5 min) | Senha do administrador logado, ID da reserva | Token temporário (5 min, uso único), modal com número descriptografado | Bloqueio de acesso se senha incorreta; log de auditoria permanente | ORIGINAL_REQUEST.md R6 & Mockup Caixa de Entrada |
| 16 | **Transição** | Relatório de Conciliação Inicial | Varre reservas manuais pré-existentes e payloads de OTA, identificando correspondências seguras e casos duvidosos | Base de reservas manuais ativas (canal booking/airbnb), Bookings recebidos da OTA | Tabela comparativa categorizada: Seguras (Vinculáveis), Duvidosas (Quarentena), Órfãs | Bloqueio de vinculação automática de casos duvidosos | ORIGINAL_REQUEST.md R5 |
| 17 | **Sistema / UI** | Manual de Ajuda Integrado (R9) | Manual completo para humanos dentro do sistema cobrindo administração e recepção, com placeholders de screenshots | Rotas do sistema, documentação de fluxos, catálogo de erros | Página interativa de ajuda `/ajuda` com busca, tópicos admin e recepção | Fallback para guia contextual se pesquisa não encontrar termos | ORIGINAL_REQUEST.md R9 |

---

## 2. Edge Cases

| # | Feature | Input | Comportamento Observado / Requerido |
|---|---|---|---|
| 1 | **Tarifa Mínima** | Soma de deduções (comissão + margem + imposto) >= 100% (ex: 30% + 65% + 6% = 101%) | Divisor torna-se <= 0. O sistema intercepta antes da divisão por zero, bloqueia o salvamento e emite mensagem de validação: `"A soma das deduções percentuais (comissão, margem e impostos) não pode atingir ou ultrapassar 100%."` |
| 2 | **Custo Fixo por Diária** | Ocupação projetada = 0% no mês | A diária vendida seria 0. A fórmula da planilha possui `=IFERROR(C17/C9, 0)`. O motor assume como piso de proteção o custo rateado por diária *disponível* (19 × dias do mês), impedindo que o custo unitário tenda a infinito. |
| 3 | **Arredondamento de Centavos** | Decomposição em 4 parcelas gerando frações de centavos (ex: Custo R$ 149,38; Com 15% = R$ 41,4945; Marg 25% = R$ 69,1575; Imp 6% = R$ 16,5978) | Se somadas com arredondamento padrão `round(x, 2)`, as parcelas resultam exatamente em R$ 41,49 + R$ 69,16 + R$ 16,60 + R$ 149,38 = R$ 276,63. Caso ocorra desvio de ± R$ 0,01 por resíduo de ponto flutuante, a diferença é ajustada na parcela de margem de lucro garantindo que a soma feche em 100% com a diária de venda. |
| 4 | **Trava de Piso** | Usuário tenta publicar override manual de R$ 180,00 quando a Tarifa Mínima é R$ 276,63 | O sistema impede a publicação automática, marca a linha com alerta vermelho `"Abaixo do Piso"`, incrementa o contador `Abaixo do piso: 1` e impede o envio do ARIUpdate até que o valor seja elevado ou haja liberação por credencial master de emergência com registro no log de auditoria. |
| 5 | **Trava de Variação** | Diária anterior enviada era R$ 329,41; novo cálculo sugere R$ 455,00 (variação de +38,12%) | Como +38,12% > threshold (30%), a linha recebe highlight amarelo e ícone de cadeado `🔒`. O botão de envio exibe `"Publicar X alterações"` excluindo as retidas. A alteração só é enviada após clique em `"Confirmar"` no painel lateral de retenção. |
| 6 | **Trava de Variação (Queda)** | Diária anterior enviada era R$ 400,00; novo cálculo sugere R$ 250,00 (-37,5%) | A trava de variação é bidirecional (módulo `abs(delta) > 30%`). Uma queda brusca de 37,5% é retida preventivamente para evitar "dumping" acidental ou erro de preenchimento. |
| 7 | **Teto por Plano** | Flats livres no dia = 5; Teto configurado para "Sem café" = 8; Teto para "Com café" = 3 | Para "Sem café", o envio é `min(8, 5) = 5`. Para "Com café", o envio é `min(3, 5) = 3`. Se um flat for vendido no plano "Com café", os livres caem para 4; imediatamente o envio de "Sem café" baixa para 4 e "Com café" mantém `min(3, 4) = 3`. |
| 8 | **OBP Adulto Adicional** | Flat acomoda até 3 pessoas; tarifa Com Café configurada para 1 hóspede = R$ 301,63, 2 hóspedes = R$ 326,63, 3 hóspedes = R$ 351,63 | No schema da WebBookingPro, são enviados `rate` (tarifa base para ocupação padrão de 2 pessoas), `rdef_single` (tarifa individual com desconto de R$ 25,00 de café) e campos OBP `adult_1`, `adult_2`, `adult_3` mapeados estritamente conforme `num_adults_included = 2`. |
| 9 | **Quarentena: Overbooking** | Reserva recebida para período em que todos os 19 flats estão ocupados ou com bloqueio de manutenção | A reserva é gravada duravelmente no banco, mas não é atribuída a nenhum flat. Status setado para `"Quarentena: sem flat livre"`, contador da sidebar recebe badge `+1`, alerta crítico de WhatsApp/e-mail é disparado para o gestor. |
| 10 | **Quarentena: Cancelamento com Check-in Ativo** | Hóspede cancela reserva na Booking.com após a recepção já ter realizado o check-in no PMS | Cancelamento NÃO desaloja o hóspede automaticamente. Vai para quarentena com motivo `"Cancelamento após check-in efetuado"` para tratamento administrativo presencial com a recepção. |
| 11 | **Conciliação Inicial** | Reserva manual digitada com nome "João S. Silva", 15/11 a 18/11, canal Booking; WebBookingPro envia booking com nome "Joao Silva", 15/11 a 18/11, channel Booking | Algoritmo de correspondência normaliza acentos, aplica Levenshtein/token-match, identifica correspondência segura (safe match score > 90%) e apresenta no relatório como pronta para vinculação sem duplicidade. |
| 12 | **Conciliação Inicial: Ambiguidade** | Existem duas reservas manuais com datas idênticas no mesmo canal e nomes diferentes ("Maria Souza" e "Mariana Souza") | O sistema classifica como `"Correspondência Ambígua"`, não vincula automaticamente e envia para análise manual na quarentena. |
| 13 | **Segurança de Cartão** | Tentativa de requisição de descriptografia de cartão com senha incorreta 3 vezes | Bloqueio temporário de 15 minutos na ação de revelar cartão, envio de alerta de segurança aos administradores e registro no `audit_logs.jsonl`. |

---

## 3. Especificação Matemática do Motor SEBRAE

### 3.1. Estrutura Analítica de Custos por UH Ocupada

A planilha original do SEBRAE continha um vício de cálculo: lançava `"Comissão do canal de venda R$ 28,50/diária"` nos custos variáveis por UH e, posteriormente, aplicava novamente o desconto percentual da comissão na fórmula da tarifa mínima. Conforme determinação do usuário, a comissão em valor monetário fixo foi **completamente eliminada do custo operacional da UH**, mantendo-se estritamente a cobrança percentual sobre a receita bruta de venda.

#### Parâmetros Operacionais Fixos (Base CorpFlats Soho Residence)
- **Número Total de Unidades Habitacionais ($U$)**: 19 flats individuais
- **Dias no Mês de Referência ($D$)**: 31 dias (mês padrão de referência analítica; dinâmico de 28 a 31 nos meses do ano)
- **Diárias Totais Disponíveis ($N_{disp}$)**:
  $$N_{disp} = U \times D = 19 \times 31 = 589 \text{ diárias}$$
- **Ocupação Média Projetada ($\text{Taxa}_{ocup}$)**: $65,00\%$ ($0,65$)
- **Diárias Efetivamente Vendidas no Mês ($N_{vend}$)**:
  $$N_{vend} = N_{disp} \times \text{Taxa}_{ocup} = 589 \times 0,65 = 382,85 \text{ diárias}$$
  *(Nota técnica: na visualização da planilha o número é arredondado para 383 diárias, porém o valor algébrico exato é $382,85$)*.

#### Custos Fixos Mensais do Empreendimento
1. Aluguel / financiamento dos 19 flats: $\text{R\$}~38.506,61$
2. Salários e encargos equipe fixa: $\text{R\$}~0,00$
3. IPTU, condomínio e seguros: $\text{R\$}~0,00$
4. Sistemas (PMS, Channel Manager) e infraestrutura: $\text{R\$}~0,00$
5. Outros custos fixos administrativos (contabilidade): $\text{R\$}~400,00$
- **Total de Custos Fixos Mensais ($C_{fixo}^{mensal}$)**:
  $$C_{fixo}^{mensal} = 38.506,61 + 400,00 = \text{R\$}~38.906,61$$

#### Rateio do Custo Fixo Unitário
- **Custo Fixo por Diária Disponível ($CF_{disp}$)**:
  $$CF_{disp} = \frac{C_{fixo}^{mensal}}{N_{disp}} = \frac{38.906,61}{589} = \text{R\$}~66,05536 \dots \approx \text{R\$}~66,06$$
- **Custo Fixo por Diária Efetivamente Vendida ($CF_{vend}$)** — *Base adotada na metodologia SEBRAE*:
  $$CF_{vend} = \frac{C_{fixo}^{mensal}}{N_{vend}} = \frac{38.906,61}{382,85} = \text{R\$}~101,623635 \dots \approx \text{R\$}~101,62$$

#### Custos Variáveis por UH Ocupada (Operação Real)
1. **Limpeza e amenities por diária**: $\text{R\$}~23,25$
2. **Lavanderia e enxoval por diária**: $\text{R\$}~15,51$
3. **Energia elétrica e água (uso proporcional real)**: $\text{R\$}~9,00$
4. **Comissão do canal em R$**: $\text{R\$}~0,00$ *(REMOVIDO — correção de bitributação/contagem dupla)*
5. **Taxa de cartão / café no custo básico**: $\text{R\$}~0,00$ *(tratados nos módulos específicos)*
- **Total de Custos Variáveis por Noite Ocupada ($CV_{UH}$)**:
  $$CV_{UH} = 23,25 + 15,51 + 9,00 = \text{R\$}~47,76$$

#### Custo Total Unitário por UH Ocupada ($Custo_{UH}$)
$$Custo_{UH} = CF_{vend} + CV_{UH} = 101,6236 + 47,76 = \text{R\$}~149,3836 \dots \approx \mathbf{R\$}~\mathbf{149,38}$$

---

### 3.2. Modelo Algébrico da Tarifa Mínima & Prova de Fechamento 100%

A formação do preço de venda na hotelaria sustentável deve garantir que, a partir da receita bruta recebida do hóspede, após as deduções de comissões de terceiros, impostos governamentais e a margem de lucro líquido da empresa, o montante remanescente cubra com exatidão o custo operacional unitário.

Seja $T_{min}$ a Tarifa Mínima de Venda (faturamento bruto por diária):
$$T_{min} = Custo_{UH} + (\text{Comissão} \times T_{min}) + (\text{Margem} \times T_{min}) + (\text{Imposto} \times T_{min})$$

Isolando $T_{min}$:
$$T_{min} \times (1 - \text{Comissão} - \text{Margem} - \text{Imposto}) = Custo_{UH}$$
$$\mathbf{T_{min} = \frac{Custo_{UH}}{1 - \text{Comissão} - \text{Margem} - \text{Imposto}}}$$

#### Alíquotas e Parâmetros Contratuais
- $\text{Comissão média do canal de venda } (c)$: $15,00\%$ ($0,15$)
- $\text{Margem de lucro líquido desejada } (m)$: $25,00\%$ ($0,25$)
- $\text{Imposto sobre faturamento bruto (Simples Nacional / ISS) } (t)$: $6,00\%$ ($0,06$)

#### Cálculo do Divisor Operacional
$$\text{Divisor} = 1 - 0,15 - 0,25 - 0,06 = 1 - 0,46 = \mathbf{0,54} \quad (54,00\%)$$

#### Obtenção da Tarifa Mínima Sustentável
$$T_{min} = \frac{149,383635 \dots}{0,54} = \text{R\$}~276,6296296 \dots \approx \mathbf{R\$}~\mathbf{276,63}$$
*(Nota: cumpre rigorosamente a especificação do usuário de $\text{R\$}~276,63 \pm \text{R\$}~0,05$)*.

#### Prova Matemática do Fechamento Analítico (Zero Resíduo)
Decompondo a tarifa final de $\text{R\$}~276,63$ nos seus 4 componentes reais:

| Componente | Fórmula Algébrica | Cálculo Exato | Valor Arredondado | % da Diária |
|---|---|---|---|---|
| **Custo Operacional UH** | $Custo_{UH}$ fixado | $\text{R\$}~149,38$ | **R$ 149,38** | $54,00\%$ |
| **Comissão do Canal** | $T_{min} \times 0,15$ | $276,63 \times 0,15 = 41,4945$ | **R$ 41,49** | $15,00\%$ |
| **Margem de Lucro Líquida** | $T_{min} \times 0,25$ | $276,63 \times 0,25 = 69,1575$ | **R$ 69,16** | $25,00\%$ |
| **Imposto (Simples/ISS)** | $T_{min} \times 0,06$ | $276,63 \times 0,06 = 16,5978$ | **R$ 16,60** | $6,00\%$ |
| **SOMA TOTAL** | **Custo + Com + Marg + Imp** | **149,38 + 41,49 + 69,16 + 16,60** | **R$ 276,63** | **100,00%** |

$$\mathbf{149,38 + 41,49 + 69,16 + 16,60 = 276,63 \quad \checkmark \text{ Fecha 100\%}}$$

---

### 3.3. Matriz de Sensibilidade (Comissão × Margem)

Mantendo o Custo por UH fixo em $\text{R\$}~149,38$ e o Imposto fixo em $6\%$, a tarifa mínima varia em função da comissão negociada e da margem de lucro almejada:

$$\text{Tarifa}(c, m) = \frac{149,38}{1 - c - m - 0,06}$$

| Comissão ($c$) \ Margem ($m$) | 15% | 20% | 25% | 30% |
|---|---|---|---|---|
| **0% (Direto)** | $\frac{149,38}{1 - 0 - 0,15 - 0,06} = \text{R\$}~189,09$ | $\frac{149,38}{1 - 0 - 0,20 - 0,06} = \text{R\$}~201,86$ | $\frac{149,38}{1 - 0 - 0,25 - 0,06} = \text{R\$}~216,49$ | $\frac{149,38}{1 - 0 - 0,30 - 0,06} = \text{R\$}~233,41$ |
| **15% (Padrão Booking/Airbnb)** | $\frac{149,38}{0,64} = \text{R\$}~233,41$ | $\frac{149,38}{0,59} = \text{R\$}~253,19$ | $\mathbf{\frac{149,38}{0,54} = \text{R\$}~276,63}$ | $\frac{149,38}{0,49} = \text{R\$}~304,86$ |
| **18% (Booking Preferencial)** | $\frac{149,38}{0,61} = \text{R\$}~244,89$ | $\frac{149,38}{0,56} = \text{R\$}~266,75$ | $\frac{149,38}{0,51} = \text{R\$}~292,90$ | $\frac{149,38}{0,46} = \text{R\$}~324,74$ |
| **20% (Expedia Merchant)** | $\frac{149,38}{0,59} = \text{R\$}~253,19$ | $\frac{149,38}{0,54} = \text{R\$}~276,63$ | $\frac{149,38}{0,49} = \text{R\$}~304,86$ | $\frac{149,38}{0,44} = \text{R\$}~339,50$ |
| **25% (Canais Distribuidores)** | $\frac{149,38}{0,54} = \text{R\$}~276,63$ | $\frac{149,38}{0,49} = \text{R\$}~304,86$ | $\frac{149,38}{0,44} = \text{R\$}~339,50$ | $\frac{149,38}{0,39} = \text{R\$}~383,03$ |

---

### 3.4. Curva de Sazonalidade & Ocupação Histórica Real

Ao invés de fatores estáticos hardcoded, o motor calcula a sazonalidade com base na série histórica consolidada de reservas dos 19 flats:

1. **Taxa de Ocupação Histórica por Mês ($TO_m$)**:
   $$TO_m = \frac{\text{Noites Ocupadas nos 19 Flats no Mês } m}{19 \times \text{Dias do Mês } m}$$
2. **Classificação SEBRAE**:
   - **Alta Temporada**: $TO_m \ge 75\%$ $\implies$ Fator $+15\%$ ($1,15$)
   - **Média Temporada**: $55\% \le TO_m < 75\%$ $\implies$ Fator $0\%$ ($1,00$)
   - **Baixa Temporada**: $TO_m < 55\%$ $\implies$ Fator $-10\%$ ($0,90$)
3. **Aplicação na Tarifa Sugerida**:
   $$T_{sugerida}(m) = \text{round}(T_{min} \times \text{Fator}_m, 2)$$
   - *Mês de Alta*: $276,63 \times 1,15 = \text{R\$}~318,12$
   - *Mês de Média*: $276,63 \times 1,00 = \text{R\$}~276,63$
   - *Mês de Baixa*: $276,63 \times 0,90 = \text{R\$}~248,97$ *(Atenção: sujeito à trava de piso se o piso for fixado na tarifa sustentável)*.

---

### 3.5. Modelo de Rendimento Líquido por Canal (Net Yield)

Dada uma tarifa anunciada $P_{venda}$ no canal $k$, com comissão $c_k$ e taxa financeira de recebimento $f_k$ (cartão de crédito do hotel ou Virtual Credit Card - VCC da OTA):

$$P_{liq} = P_{venda} \times (1 - c_k) \times (1 - f_k)$$
$$\text{Perda para o Canal (R\$)} = P_{venda} - P_{liq}$$
$$\text{Perda Percentual} = \frac{P_{venda} - P_{liq}}{P_{venda}} = 1 - (1 - c_k)(1 - f_k)$$

Para uma simulação com diária base de $\text{R\$}~276,63$:
- **Direto Pix**: $c=0\%, f=0\% \implies P_{liq} = \text{R\$}~276,63$ (Perda: $0,00\%$)
- **Direto Cartão**: $c=0\%, f=3,0\% \implies P_{liq} = 276,63 \times 0,97 = \text{R\$}~268,33$ (Perda: $3,00\%$)
- **Booking Padrão (Sem VCC)**: $c=15\%, f=0\% \implies P_{liq} = 276,63 \times 0,85 = \text{R\$}~235,14$ (Perda: $15,00\%$)
- **Booking Preferencial**: $c=18\%, f=0\% \implies P_{liq} = 276,63 \times 0,82 = \text{R\$}~226,84$ (Perda: $18,00\%$)
- **Booking com VCC / Fatura**: $c=17\%, f=4,0\% \implies P_{liq} = 276,63 \times 0,83 \times 0,96 = \text{R\$}~220,42$ (Perda: $20,32\%$)
- **Expedia Merchant (VCC)**: $c=20\%, f=4,0\% \implies P_{liq} = 276,63 \times 0,80 \times 0,96 = \text{R\$}~212,45$ (Perda: $23,20\%$)

---

### 3.6. Modelagem de Planos Tarifários & Adicional de Café (OBP)

O hotel opera com **1 tipo de quarto ("Flat")** e **2 planos tarifários**:
1. **Plano "Sem café" (Room Only - Base)**:
   - Tarifa de venda calculada pelo motor: $T_{base}$.
2. **Plano "Com café" (Bed & Breakfast)**:
   - Valor configurável por hóspede/noite: $V_{cafe}$ (padrão: $\text{R\$}~25,00$).
   - O flat tem capacidade padrão para 2 adultos e suporta até 3 pessoas com colchonete extra.

#### Mapeamento nos Campos da API WebBookingPro (ARIUpdate)
Para cada data e plano:
- **Plano "Sem café"**:
  - `rate`: $T_{base}$ (tarifa padrão para ocupação base de 2 pessoas)
  - `rdef_single`: $T_{base}$ (ou desconto de solteiro configurado)
  - `adult_1`: $T_{base}$
  - `adult_2`: $T_{base}$
  - `adult_3`: $T_{base} + \text{TaxaLeitoExtra}$
- **Plano "Com café"**:
  - `rate`: $T_{base} + (2 \times V_{cafe})$ (ocupação base de 2 pessoas com 2 cafés)
  - `rdef_single`: $T_{base} + (1 \times V_{cafe})$ (ocupação individual com 1 café)
  - `adult_1`: $T_{base} + (1 \times V_{cafe})$
  - `adult_2`: $T_{base} + (2 \times V_{cafe})$
  - `adult_3`: $T_{base} + (3 \times V_{cafe}) + \text{TaxaLeitoExtra}$

Exemplo numérico com $T_{base} = \text{R\$}~276,63$ e $V_{cafe} = \text{R\$}~25,00$:
- "Sem café" (2 hóspedes): $\text{R\$}~276,63$
- "Com café" (1 hóspede): $276,63 + 25,00 = \text{R\$}~301,63$
- "Com café" (2 hóspedes): $276,63 + 50,00 = \text{R\$}~326,63$
- "Com café" (3 hóspedes): $276,63 + 75,00 + 60,00 = \text{R\$}~411,63$

---

## 4. Travas de Segurança da Precificação (Safety Locks)

O sistema de precificação possui três níveis obrigatórios de trava de proteção patrimonial antes de qualquer transmissão às OTAs.

```
┌────────────────────────────────────────────────────────────────────────┐
│                      Alteração de Custo ou Regra                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   TRAVA 1: PISO SUSTENTÁVEL (Floor)                    │
│   Rate < max(TarifaMinima, PisoManual) ?                               │
│   ├── SIM ──► BLOQUEIO ESTATUTÁRIO (Proibido publicar)                 │
│   └── NÃO ──► Prossegue                                                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 TRAVA 2: VARIAÇÃO MÁXIMA (Variation Lock)              │
│   abs(Rate - LastSentRate) / LastSentRate > Threshold (ex: 30%) ?      │
│   ├── SIM ──► RETIDO PELA TRAVA (Requer "Confirmar" individual)        │
│   └── NÃO ──► Liberado para fila de publicação                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                TRAVA 3: WORKFLOW PRÉ-VISUALIZAR & PUBLICAR             │
│   Mudanças ficam em Rascunho Staged                                    │
│   Nenhum ARIUpdate é transmitido sem clique explícito em "Publicar"    │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.1. Trava 1: Piso Sustentável (Floor Lock)
- **Regra**: Nenhuma tarifa enviada à WebBookingPro pode ser inferior ao valor de sustentabilidade financeira.
- **Definição Algébrica**:
  $$Piso = \max(T_{min}, Piso_{manual})$$
  onde $T_{min}$ é a tarifa mínima calculada pela fórmula SEBRAE ($\text{R\$}~276,63$) e $Piso_{manual}$ é o piso configurado pelo administrador.
- **Comportamento**:
  - Se $T_{proposta} < Piso$:
    - A linha de cálculo é marcada com status crítico `BELOW_FLOOR`.
    - No resumo superior da tela, o badge `"Abaixo do piso"` ganha cor de alerta e contabiliza o número de violações.
    - O botão de publicação bloqueia os itens abaixo do piso, impedindo o envio de diárias predatórias ou deficitárias.

### 4.2. Trava 2: Variação Máxima (Variation Lock - Padrão 30%)
- **Regra**: Mudanças bruscas de preço em relação ao último valor efetivamente transmitido para a WebBookingPro são retidas preventivamente.
- **Parâmetro**: `variationLimitPct` (configurável na tela de Canais/Travas; valor padrão $= 30\%$).
- **Fórmula de Detecção**:
  $$\Delta \% = \frac{T_{nova} - T_{anterior}}{T_{anterior}}$$
  $$\text{Retém se } |\Delta \%| > \text{variationLimitPct}$$
- **Comportamento Visual e Operacional**:
  - A linha afetada na tabela de rascunhos recebe destaque âmbar e o ícone de cadeado `🔒` na coluna de variação (ex: `+38% 🔒`).
  - O contador superior `"Retidos pela trava"` incrementa.
  - O item é listado no painel lateral direito de resolução com botões:
    - **[ Confirmar ]**: O administrador atesta que a variação (ex: alta demanda de feriado) é intencional. O cadeado é desmarcado e a tarifa entra na lista de envio.
    - **[ Descartar ]**: Reverte o valor daquela data para a tarifa anterior enviada.
  - O botão principal de publicação atualiza dinamicamente seu contador:  
    `"Publicar (Total Alterados - Total Retidos) alterações na WebBookingPro"`.

### 4.3. Trava 3: Workflow de Pré-visualização & Publicar
- **Isolamento de Rascunho**: Alterações feitas em qualquer aba (Custos, Sazonalidade, Markups, Overrides em Lote) NÃO acionam chamadas à API da WebBookingPro imediatamente.
- **Faixa de Alerta Global**: Todas as abas de precificação exibem banner amarelo enquanto houver rascunhos não publicados:  
  `"⚠ X alterações não publicadas — revise na Pré-visualização antes de enviar às OTAs [Ir para Pré-visualização]"`
- **Garantia de Idempotência e Auditoria**: O clique em `"Publicar"` gera um `batch_id`, registra as alterações no `audit_logs.jsonl` com ID do usuário e dispara o lote ordenado de `ARIUpdate`.

---

## 5. Especificações de Telas e Layouts de Interface

Seguindo rigorosamente o design system do PMS (Tailwind CSS + Radix UI + Lucide Icons) e a fidelidade aos mockups aprovados:

### 5.1. Aba: Tarifa Mínima (`mockup_precificacao_1791928509939.jpg`)

#### Hierarquia Visual
- **Cabeçalho**:
  - Título: `Precificação` (`text-2xl font-black text-slate-900`)
  - Subtítulo: `Modelo SEBRAE • 19 flats` (`text-sm text-slate-500`)
- **Navegação em Abas (Tabs)**:
  - `Custos`
  - `Tarifa Mínima` **(Ativa, sublinhado verde/teal)**
  - `Tarifário & Sazonalidade`
  - `Canais`
  - `Restrições`
  - `Pré-visualização & Publicar`
  - `Análises` (Orçamento anual e indicadores por canal)

#### Grid Principal (3 Cards Lado a Lado)
1. **Card 1: Custo por UH Ocupada** (`bg-white rounded-2xl border border-slate-200 p-6`)
   - Título: `Custo por UH ocupada` (`font-bold text-slate-900 mb-4`)
   - Linhas de exibição (Label à esquerda, Valor em negrito à direita):
     - `Custos fixos mensais`: $\text{R\$}~38.906,61$
     - `Ocupação média`: $65\%$
     - `Custo fixo por diária vendida`: $\text{R\$}~101,62$
     - `Limpeza e amenities`: $\text{R\$}~23,25$
     - `Enxoval`: $\text{R\$}~15,51$
     - `Energia e água`: $\text{R\$}~9,00$
     - **Divisor/Totalizador**: Linha separadora
     - **Total por UH ocupada**: $\mathbf{R\$}~\mathbf{149,38}$ (`text-base font-black text-slate-900`)

2. **Card 2: Fórmula & Decomposição** (`bg-white rounded-2xl border border-slate-200 p-6`)
   - Título: `Fórmula`
   - Expressão algébrica visual renderizada:  
     $$\text{Tarifa mínima} = \text{Custo} \div \left(1 - \text{Comissão}_{15\%} - \text{Margem}_{25\%} - \text{Imposto}_{6\%}\right)$$
   - Display Destaque (Hero):
     - $\mathbf{R\$}~\mathbf{276,63}$ (`text-4xl font-black text-slate-900 bg-emerald-50 px-4 py-2 rounded-xl inline-block my-3 text-emerald-900`)
     - Legenda: `Tarifa mínima sustentável (piso)` (`text-xs text-slate-500 font-medium`)
   - Seção `Composição`:
     - Barra horizontal empilhada colorida (Stacked Bar) com proporções exatas:
       - Segmento Verde (`bg-emerald-600`, $54,00\%$ largura): Custo $\text{R\$}~149,38$
       - Segmento Coral (`bg-rose-500`, $15,00\%$ largura): Comissão $\text{R\$}~41,49$
       - Segmento Menta (`bg-teal-400`, $25,00\%$ largura): Margem $\text{R\$}~69,16$
       - Segmento Azul Escuro (`bg-indigo-600`, $6,00\%$ largura): Imposto $\text{R\$}~16,60$
     - Legendas abaixo da barra com valores individuais.
     - Rodapé com selo de integridade:
       - $\mathbf{R\$}~\mathbf{276,63}$ acompanhado de badge verde: `✔ fecha 100%` (`text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full text-xs font-bold`)

3. **Card 3: Planos Publicados** (`bg-white rounded-2xl border border-slate-200 p-6`)
   - Título: `Planos publicados`
   - Item 1: `Sem café — base`
   - Separador fino
   - Item 2: `Com café — + R$ 25,00 por hóspede/noite` (com input de ajuste rápido)
   - Separador fino
   - Item 3: `Teto por plano (opcional)` com interruptor liga/desliga (`Switch`)

#### Faixa Inferior de Alterações Não Publicadas
- Container âmbar (`bg-amber-100 border border-amber-300 rounded-2xl p-4 flex items-center justify-between`):
  - Esquerda: Ícone de aviso + texto `3 alterações não publicadas — revise na Pré-visualização antes de enviar às OTAs`
  - Direita: Botão `Ir para Pré-visualização` (`bg-white hover:bg-slate-50 border border-slate-300 font-bold`)

---

### 5.2. Tela: Pré-visualização & Publicar (`mockup_previsualizacao_v2_1791928602700.jpg`)

#### Cards de Métricas Superiores (KPIs de Risco)
1. `Datas afetadas`: Badge numérico `[ 42 ]` (`bg-slate-100 text-slate-800 font-bold px-3 py-1 rounded-xl`)
2. `Preços alterados`: Badge numérico `[ 84 ]` (`bg-slate-100 text-slate-800 font-bold px-3 py-1 rounded-xl`)
3. `Retidos pela trava`: Badge numérico `[ 3 ]` em card âmbar (`bg-amber-100 border-amber-200 text-amber-900`)
4. `Abaixo do piso`: Badge numérico `[ 0 ]` em card verde suave (`bg-emerald-100 border-emerald-200 text-emerald-900`)

#### Grid Central de Diff de Preços
- **Painel Esquerdo (Tabela de Alterações Pendentes - 2/3 da largura)**:
  - Cabeçalho: `Alterações pendentes — Novembro 2026`
  - Colunas da Tabela:
    1. **Data**: Formato `DD/MM ddd` (ex: `08/11 sáb`, `09/11 dom`, `15/11 sáb`)
    2. **Plano**: `Sem café`, `Com café (2 hósp.)`
    3. **Atual**: Valor vigente (ex: $\text{R\$}~329,41$)
    4. **Novo**: Valor proposto (ex: $\text{R\$}~342,00$ ou $\text{R\$}~455,00$)
    5. **Variação**: Percentual com sinal (ex: `+3,8%`). Quando exceder a trava de 30%, exibe badge âmbar com ícone de cadeado (ex: `+38% 🔒`)
    6. **Livres**: Estoque de flats desimpedidos na data (ex: `7`, `5`)
  - **Destaque de Linha**: Linhas com cadeado recebem fundo âmbar suave (`bg-amber-50/80 border-amber-200`).

- **Painel Direito (Retidos pela Trava de Variação - 1/3 da largura)**:
  - Título: `Retidos pela trava de variação (30%)`
  - Cards de Itens Bloqueados:
    - Identificador: `15/11 Sem café`
    - Movimento: `R$ 329,41 → R$ 455,00 (+38%)`
    - Ações pontuais:
      - Botão `Confirmar` (`bg-white hover:bg-slate-100 border border-slate-300 text-xs font-bold px-3 py-1.5 rounded-lg`)
      - Botão `Descartar` (`bg-white hover:bg-rose-50 border border-slate-300 text-xs font-bold text-rose-600 px-3 py-1.5 rounded-lg`)

#### Barra de Ação Inferior (Footer Fixo/Destacado)
- Alinhamento à direita:
  - Botão Primário: `Publicar 81 alterações na WebBookingPro` (`bg-teal-700 hover:bg-teal-800 text-white font-bold px-6 py-2.5 rounded-xl shadow-xs`)
  - Botão Secundário: `Descartar tudo` (`bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold px-4 py-2.5 rounded-xl`)

---

### 5.3. Tela: Caixa de Entrada OTA (`mockup_caixa_entrada_ota_1791928543273.jpg`)

#### Barra de Navegação Superior & Status da Conexão
- Status Central: Pill com fundo creme/mostarda: `WebBookingPro • Modo: Somente observar` (ou `Modo: Automático` / `Modo: Desligado`)
- Telemetria de Conexão à Direita:
  - Ponto verde de conectividade: `• Último polling: há 4 min • Último ARI: há 12 s`
- Navegação Global Lateral (Sidebar):
  - Item `Caixa de Entrada OTA` com badge vermelho `[ 2 ]` indicando a contagem de itens em quarentena pendentes.

#### Filtros Superiores (Pills)
- `Todas (14)` (Selecionada)
- `Importadas (11)`
- `Quarentena (2)` (Com badge vermelho)
- `Vinculadas (1)` (Reservas correspondidas com manuais)
- `Canceladas pela OTA (X)`

#### Tabela Principal de Reservas
- **Colunas**:
  1. **Recebida**: Data e hora (ex: `13/10 18:02`), ordenável descrescente.
  2. **Canal**: Logo/nome da OTA (`Booking.com`, `Airbnb`).
  3. **Nº OTA**: ID externo da reserva no canal (ex: `4829173651`, `HMQ8X2`).
  4. **Hóspede**: Nome completo do titular (ex: `Mariana Souza`, `John Miller`).
  5. **Datas**: Período e noites (ex: `20/10 → 23/10 (3 noites)`).
  6. **Plano**: `Com café` ou `Sem café`.
  7. **Pagamento**:
     - `Pago pela OTA` (Channel Collect - VCC ou repasse bancário)
     - `Cobrar no hotel` (Property Collect - pagamento presencial na recepção)
  8. **Status**:
     - `Importada` (Badge verde `bg-emerald-100 text-emerald-800`)
     - `Quarentena: sem flat livre` (Badge vermelho `bg-rose-100 text-rose-800 font-bold`)
     - `Vinculada a RES-512-0198` (Badge azul `bg-sky-100 text-sky-800 font-bold`)
     - `Cancelada pela OTA` (Badge cinza `bg-slate-100 text-slate-600`)
  9. **Flat**: Número do apartamento atribuído (ex: `605`, `512`, `211`) ou travessão `—` caso em quarentena.

#### Gaveta Lateral de Resolução da Quarentena (Drawer)
Abre ao clicar em uma reserva com pendência:
- Cabeçalho: `Quarentena — John Miller`
- Motivo do bloqueio em destaque: `Overbooking: 0 flats livres em 16/10`
- Botões de Resolução Operacional:
  1. `Alocar flat manualmente` (Botão verde/teal destacado): abre modal com calendário de ocupação e lista de flats para forçar alocação com remanejamento.
  2. `Aceitar mesmo assim` (Botão contorno neutro): força aceitação mesmo com conflito.
  3. `Rejeitar e avisar` (Botão contorno neutro): registra rejeição e notifica os canais.
- Seção Expansível de Diagnóstico:
  - `> Payload original (JSON)` (permite ver o payload bruto recebido da WebBookingPro para auditoria).
- Seção de Dados de Cartão Protegido (R6):
  - `🔒 Cartão •••• 4242 — Ver (exige senha)`
  - Ao clicar, abre modal solicitando a senha de administrador. A validação correta emite token efêmero de 5 minutos, registra no `audit_logs.jsonl` e exibe número completo e validade (o código CVV nunca é exibido nem armazenado).

---

### 5.4. Especificação do Relatório de Conciliação Inicial (Pré-ativação)

Antes da virada da chave para `Modo: Automático`, o administrador deve executar a conciliação entre o histórico de reservas digitadas à mão no PMS e as reservas ativas da WebBookingPro.

#### Algoritmo de Correspondência
Para cada reserva ativa retornada pela WebBookingPro (`GetBookingList`):
1. **Correspondência Segura (Safe Match)**:
   - Condições: Mesmo Canal (`Booking` ou `Airbnb`) E Mesma Data de Check-in E Mesma Data de Check-out E Similaridade de Nome $\ge 85\%$ (Levenshtein normalizado).
   - Ação: Vincula o ID externo da OTA (`externalBookingId = OrderId`) na reserva do PMS existente sem criar novo registro e sem disparar automações de boas-vindas.
2. **Correspondência Duvidosa / Ambígua (Quarentena)**:
   - Condições: Datas idênticas mas nomes com divergência substancial, OU duas reservas manuais com as mesmas datas, OU datas com deslocamento de $\pm 1$ dia.
   - Ação: Registro enviado para quarentena no relatório para conferência humana.
3. **Reserva Nova (Unmatched OTA)**:
   - Condições: Existe na OTA mas não possui nenhum correspondente manual.
   - Ação: Importada como nova reserva no PMS.
4. **Reserva Manual Órfã (Unmatched PMS)**:
   - Condições: Reserva manual existe no PMS com canal Booking/Airbnb no futuro, mas não consta no canal.
   - Ação: Listada em alerta no relatório para que a gerência confira se foi cancelada diretamente no portal da OTA.

---

### 5.5. Página de Ajuda do Sistema (R9)

A página `/ajuda` deve ser acessível a qualquer momento via ícone de ajuda `?` no topo direito, organizada em duas seções completas em português:

#### 1. Seção do Administrador
- **Obtenção de Credenciais**: Passo a passo para obter `cid`, `shared_secret`, `wbp_property_id` e senha junto à equipe da WebBookingPro.
- **Mapeamento de Quartos e Planos**:
  - Quarto único: "Flat" (19 unidades físicas).
  - Planos tarifários: "Sem café" e "Com café" (com acréscimo configurável de café da manhã).
- **Modos de Operação**:
  - `Desligado`: Nenhuma comunicação externa.
  - `Somente observar`: Recebe tudo, grava duravelmente, mas não cria reservas nem altera dados.
  - `Automático`: Operação total em tempo real com envio de ARI e criação de reservas.
- **Precificação e Travas**: Explicação do modelo SEBRAE, como usar a Tarifa Mínima como piso, como destravar itens na variação máxima de 30% e como publicar rascunhos.
- **Segurança de Cartões**: Regras de criptografia AES-256, expiração de 7 dias pós-checkout e procedimento para visualização com redigitação de senha.
- **Tabela de Resolução de Erros da API**:

| Código de Erro | Mensagem / Causa | Ação Recomendada |
|---|---|---|
| **1001 (FAULT.OTA.LOGIN)** | Credenciais da WebBookingPro inválidas ou expiradas | Verificar `cid`, `shared_secret` e senha da propriedade nas configurações do sistema |
| **1002 (FAULT.OTA.NOTENABLED)** | Propriedade não habilitada para Channel Management | Entrar em contato com o suporte da WebBookingPro para liberação do hotel |
| **1003 (FAULT.OTA.OFFLINE)** | Timeout ou canal da OTA temporariamente indisponível | O sistema retenta automaticamente a cada 5 minutos; verificar status de rede |
| **1100 (FAULT.OTA.ROOM.MAPPING)** | Código do quarto não corresponde ao ID cadastrado no canal | Revisar o mapeamento de quartos na aba de configurações da integração |
| **1102 (FAULT.OTA.CURRENCY)** | Moeda divergente (ex: canal esperando USD em vez de BRL) | Garantir que a moeda de todos os planos tarifários esteja fixada em BRL |
| **1104 (FAULT.OTA.ROOM.MINRATE)** | Preço enviado abaixo do piso permitido pela OTA | Verificar se a trava de piso do SEBRAE está alinhada às regras do canal |
| **2001 (PMS.FLOOR.LOCKED)** | Tentativa de envio de tarifa abaixo do custo mínimo sustentável | Ajustar o preço na Pré-visualização ou revisar custos operacionais |
| **2002 (PMS.VARIATION.LOCKED)** | Preço com oscilação acima de 30% retido pelo sistema | Acessar "Pré-visualização & Publicar" e clicar em "Confirmar" ou "Descartar" |
| **3001 (PMS.QUARANTINE.OVERBOOKING)** | Reserva recebida sem disponibilidade física de flats | Acessar Caixa de Entrada OTA e alocar flat manualmente ou negociar remanejamento |
| **3002 (PMS.CARD.AUTH_FAILED)** | Senha incorreta na tentativa de visualização de cartão | Redigitar a senha do administrador; após 3 erros o acesso é bloqueado por 15 min |

#### 2. Seção da Recepção
- **Rotina Diária**:
  - Monitorar o contador vermelho da Caixa de Entrada OTA na barra lateral.
  - Conferir reservas que chegam durante o turno.
- **Diferenciação de Pagamentos**:
  - `"Pago pela OTA"`: Hóspede pagou no site (Booking/Airbnb). **NÃO cobrar diárias no balcão** (apenas consumos extras).
  - `"Cobrar no hotel"`: Hóspede apenas cadastrou cartão de garantia. **Cobrar o valor total das diárias no check-in**.
- **O que fazer com Reservas em Quarentena**:
  - Localizar a reserva com status vermelho.
  - Clicar na linha para abrir a gaveta lateral e identificar o motivo.
  - Se for "Sem flat livre", verificar no mapa de ocupação a possibilidade de remanejamento ou contatar o gestor de plantão.

---

## 6. Método de Verificação Independente

Para validação técnica por outros agentes ou avaliadores:
1. **Verificação Matemática**:
   - Rodar script em Node.js calculando:
     ```javascript
     const custoFixo = 38906.61 / (19 * 31 * 0.65); // 101.6236
     const custoVar = 23.25 + 15.51 + 9.00; // 47.76
     const custoUH = custoFixo + custoVar; // 149.3836
     const tarifaMin = custoUH / (1 - 0.15 - 0.25 - 0.06); // 276.6296 -> 276.63
     const pCusto = 149.38;
     const pCom = Math.round(tarifaMin * 0.15 * 100) / 100; // 41.49
     const pMarg = Math.round(tarifaMin * 0.25 * 100) / 100; // 69.16
     const pImp = Math.round(tarifaMin * 0.06 * 100) / 100; // 16.60
     assert(Math.abs(pCusto + pCom + pMarg + pImp - 276.63) < 0.001);
     ```
2. **Verificação Visual e Layout**:
   - Comparar a estrutura das seções descritas na seção 5 com os mockups JPG fornecidos.
3. **Verificação de Regras do Projeto**:
   - Garantir paridade com os arquivos gêmeos (`demo-server.mjs`).
   - Respeitar a proibição estrita de varreduras globais de teste (`AGENTS.md`).

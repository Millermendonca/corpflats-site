# Guia de Arquitetura de Hardware IoT & Especificações de Aquisição — Smart Flat Hub
**CorpFlats — Edifício Soho Residence Service**  
**Localização**: Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ, CEP 28010-140  
**Versão**: 1.0 (Produção / Engenharia de Implantação)  
**Data**: Outubro de 2026  
**Frota Ativa**: 19 Apartamentos (113, 114, 116, 211, 212, 215, 313, 408, 509, 511, 512, 605, 712, 715, 904, 905, 907, 1004, 1304)

---

## 1. Sumário Executivo & Diretrizes de Hospitalidade

O **Smart Flat Hub** é a infraestrutura domótica de hospitalidade de alta precisão do CorpFlats, projetada para proporcionar uma experiência de acolhimento personalizada aos hóspedes do Edifício Soho Residence Service. A solução combina conveniência (ar-condicionado pré-climatizado na temperatura ideal, cafeteira pronta na chegada e música ambiente de boas-vindas) com controle rigoroso de eficiência energética e mitigação absoluta de riscos elétricos e térmicos.

### Pilares Fundamentais:
1. **Segurança Elétrica e Térmica em Primeiro Lugar**: Nenhum eletrodoméstico de alta potência opera sem proteção por relé de sobrecorrente e corte temporizado autônomo.
2. **Eficiência Energética e Sustentabilidade**: Eliminação de desperdício com aparelhos de climatização ligados em flats vazios através de travas temporais rígidas (máximo 30 minutos de antecedência e corte automático em 30 minutos pós-ETA sem confirmação de entrada).
3. **Privacidade e Confiança do Hóspede**: Equipamentos de áudio e assistentes virtuais configurados estritamente para hospitalidade, com privacidade garantida por hardware (botões físicos de interrupção de microfone) e desativação total de compras por voz ou retenção pública.
4. **Resiliência e Continuidade Operacional**: Hardware com temporizadores locais independentes de nuvem (inching/hardware countdown) e estado de recuperação pós-queda de energia programado para corte seguro (`Power-On State: OFF`).

---

## 2. Contexto Elétrico e Normativo (Campos dos Goytacazes - RJ)

### 2.1. Concessionária e Padrão de Tensão
A rede de distribuição do Edifício Soho Residence Service é atendida pela concessionária **Enel Distribuição Rio**:
- **Tensão Monofásica Residencial (Tomadas Comuns e Bancada)**: **127 V nominal** (Fase-Neutro, 60 Hz).
- **Tensão Bifásica / Circuitos de Climatização**: **220 V nominal** (Fase-Fase, 60 Hz), alimentando os circuitos dedicados de ar-condicionado split com disjuntores bipolares termomagnéticos (Curva C, 16A ou 20A) no quadro geral de distribuição (QGD) de cada flat.

### 2.2. Padrão Brasileiro de Plugues e Tomadas (NBR 14136)
A norma ABNT NBR 14136 define duas categorias físicas de conectores para 3 pinos (Fase, Neutro e Terra):
1. **Tomadas de 10 A**: Pinos com diâmetro de **4,0 mm**. Capacidade máxima admissível em 127V:
   $$P_{\text{máx}} = 127\text{ V} \times 10\text{ A} = 1.270\text{ W}$$
2. **Tomadas de 20 A**: Pinos com diâmetro de **4,8 mm**. Capacidade máxima admissível em 127V:
   $$P_{\text{máx}} = 127\text{ V} \times 20\text{ A} = 2.540\text{ W}$$

### 2.3. Dimensionamento Crítico para Cafeteiras Elétricas e de Cápsula
As cafeteiras elétricas e de cápsula adotadas na hotelaria (Nespresso Essenza Mini / Inissia, Três Corações Lov / Modo, Oster PrimaLatte, Dolce Gusto Genio S) utilizam blocos térmicos (*thermoblocks*) com potência resistiva variando de **1.200 W a 1.500 W**.

- **Cálculo da Corrente Nominal em 127 V**:
  $$I_{\text{nominal}} = \frac{1.500\text{ W}}{127\text{ V}} \approx 11,81\text{ A}$$
- **Risco Crítico de Tomadas Convencionais de 10 A**:
  Uma tomada inteligente comum de 10A operando em 127V fica submetida a uma sobrecarga contínua de **118%** de sua capacidade nominal. Essa sobrecarga provoca aquecimento resistivo dos contatos internos do relé, oxidação por centelhamento (*arcing*), fusão prematura da carcaça plástica e desarme frequente.
- **Diretriz Mandatória CorpFlats**: É **estritamente obrigatório** o uso de **Tomadas Inteligentes Wi-Fi padrão nominal de 16 A** (com capacidade para suportar picos de até 20A), plugue e receptáculo com pinos de alta condutividade e homologação oficial da Anatel.

---

## 3. Especificações Técnicas por Categoria de Dispositivo

### 3.1. Tomadas Inteligentes Wi-Fi 16A (Smart Plugs para Cafeteiras)

| Parâmetro | Requisito Técnico Mínimo |
| :--- | :--- |
| **Capacidade de Corrente** | 16 A nominal contínua (suporte a picos transitórios de até 20 A) |
| **Tensão de Operação** | Bivolt automático 100–240 V AC (50/60 Hz) |
| **Potência Máxima Suportada** | 2.000 W em 127 V / 3.500 W em 220 V |
| **Padrão Mecânico** | NBR 14136 (3 pinos macho/fêmea com terra funcional) |
| **Gabinete / Material** | Policarbonato termoplástico antichama classe UL94-V0 |
| **Proteção Térmica Ativa** | Desarme eletrônico automático por temperatura interna (> 75°C) |
| **Proteção por Sobrecarga** | Desarme instantâneo por sobrecorrente de software (> 16,5 A) |
| **Telemetria de Consumo** | Medição ativa de Tensão (V), Corrente (mA), Potência Ativa (W) e Consumo Acumulado (kWh) |
| **Conectividade Sem Fio** | Wi-Fi 802.11 b/g/n (2.4 GHz) |
| **Chipset / Ecossistema** | Tuya / Smart Life (compatível com Tuya OpenAPI e Local Tuya protocolo 6668) |
| **Certificação** | Selo de homologação compulsória Anatel impresso no corpo |

#### Recursos de Firmware Mandatórios:
1. **Comportamento Pós-Queda de Energia (`Power-On State`)**:
   Deve ser configurado em fábrica/setup como **`OFF` (Desligado)**. Em caso de interrupção e retorno da rede elétrica do prédio, o relé deve obrigatoriamente permanecer desligado para evitar ligamento descontrolado do aparelho.
2. **Temporizador Interno de Hardware (`Inching / Countdown`)**:
   A tomada deve suportar gravação de contagem regressiva em memória flash local. Ao acionar a cafeteira pelo hub, o sistema envia simultaneamente o comando de ligamento com contagem de 30 minutos (`countdown: 1800s`). Se houver perda de conexão Wi-Fi, a tomada desliga fisicamente o relé de forma autônoma.

#### Modelos Recomendados & Homologados:
- **Opção Principal**: *Ekaza Smart Plug Wi-Fi 16A com Monitoramento de Energia* (Código: EKHY-T108-16A / Homologação Anatel).
- **Opção Alternativa**: *NovaDigital Tomada Inteligente Wi-Fi 16A NBR com Medidor* (Código: WK-BR-16A).
- **Opção Premium**: *Positivo Casa Inteligente Smart Plug Wi-Fi 16A* (Garantia nacional estendida).

---

### 3.2. Controles Universais Infravermelho Inteligentes (Smart IR Blaster para Ar Split)

Os flats do Edifício Soho utilizam aparelhos de ar-condicionado split individuais das marcas **Springer Midea, Consul, Elgin, LG e Gree** (`DEFAULT_FLATS`).

| Parâmetro | Requisito Técnico Mínimo |
| :--- | :--- |
| **Frequência de Portadora IR** | 38 kHz (modulação comercial universal) |
| **Arranjo de Emissores** | Mínimo de 6 LEDs infravermelhos com cobertura omnidirecional 360° |
| **Alcance Operacional** | 8 a 10 metros com visada direta (Line-of-Sight) |
| **Sensor TH Integrado** | **Obrigatório**: Sensor digital de Temperatura (precisão ±0,5°C) e Umidade relativa (precisão ±5% RH) embutido no mesmo encapsulamento |
| **Alimentação** | 5 V DC / 1 A via conector micro-USB ou USB-C (fonte bivolt inclusa) |
| **Biblioteca de Códigos** | Base Tuya Cloud com mais de 8.000 modelos de aparelhos e função de aprendizado DIY (Learning Mode) |
| **Conectividade Sem Fio** | Wi-Fi 802.11 b/g/n (2.4 GHz) |
| **Certificação** | Homologação Anatel |

#### Justificativa da Malha Fechada (Closed-Loop Feedback):
A transmissão por infravermelho é estritamente unidirecional (*simplex*). O transmissor envia o pacote de dados binário para o receptor da evaporadora, porém não tem retorno se o aparelho efetivamente ligou, se o compressor entrou em regime ou se houve falha no disjuntor.  
Ao utilizar um IR Blaster com **sensor de temperatura embutido**, o sistema obtém a telemetria em tempo real do ambiente:
- Se o comando de ligamento a 22°C for emitido às 13:30 e a telemetria reportar queda de temperatura de 27°C para 23°C nos 15 minutos seguintes, o sistema confirma o funcionamento correto da climatização.
- Se a temperatura permanecer estagnada, o sistema notifica a manutenção para inspeção preventiva do disjuntor ou condensadora.

#### Modelos Recomendados & Homologados:
- **Opção Principal**: *Tuya Smart IR Remote com Sensor de Temperatura e Umidade Embutido (Modelo S08 / S06 Pro TH)*.
- **Opção Alternativa**: *Broadlink RM4 Mini acompanhado do Cabo Sensor de Temperatura e Umidade HTS2*.
- **Opção Nacional**: *Ekaza Smart Controle Universal Infravermelho com Sensor*.

---

### 3.3. Caixas de Som Inteligentes (Smart Speakers para Recepção & Welcome)

Dispositivos dedicados à reprodução da trilha sonora de boas-vindas às 14:00, avisos sonoros de concierge, previsão do tempo e facilidades locais.

| Recurso | Opção A: Amazon Echo Pop (Recomendada) | Opção B: Amazon Echo Dot 5ª Geração c/ Relógio |
| :--- | :--- | :--- |
| **Transdutor Acústico** | Alto-falante de 1,95" direcional frontal | Alto-falante de 1,73" com som omnidirecional de alta definição |
| **Potência / Área** | Ideal para quartos e studios de 18 a 30 m² | Ideal para suítes amplas e studios executivos |
| **Display Integrado** | Não possui | Display de LED frontal com relógio digital e temperatura externa |
| **Botão Físico de Privacidade** | Botão físico liga/desliga microfone com LED vermelho | Botão físico liga/desliga microfone com anel vermelho |
| **Processador de Áudio** | Processador Amazon AZ2 Neural Edge | Processador Amazon AZ2 Neural Edge |
| **Conectividade** | Wi-Fi dual-band (2.4 e 5 GHz), Bluetooth Low Energy | Wi-Fi dual-band (2.4 e 5 GHz), Bluetooth, sensor de temperatura |
| **Custo Médio Unitário** | R$ 220,00 a R$ 250,00 | R$ 380,00 a R$ 430,00 |

#### Protocolo de Privacidade e Segurança em Hotelaria:
1. **Microfone e Confidencialidade**: Os flats contam com sinalização orientando o hóspede sobre o botão superior de corte físico dos microfones. Quando ativado, a linha de alimentação do transdutor de áudio é fisicamente interrompida e a luz vermelha permanece acesa.
2. **Desativação de Compras por Voz**: O recurso de compra direta na Amazon via comando de voz deve ser configurado como **Estritamente Desativado** no aplicativo Alexa.
3. **Isolamento de Contas e Chamadas**: O recurso *Drop-In* e as chamadas entre cômodos devem ser desativados para impedir comunicação de áudio entre dispositivos de flats diferentes.
4. **Desconexão de Histórico de Voz**: Habilitação de expiração diária automática dos registros de voz ou uso de perfis corporativos *Alexa Smart Properties (ASP)*.

---

### 3.4. Interruptores Touch de Parede Wi-Fi 4x2 (Smart Wall Switches)

Dispositivos para acionamento inteligente e elegante dos circuitos de iluminação da sala, bancada e cabeceira do flat.

| Parâmetro | Requisito Técnico Mínimo |
| :--- | :--- |
| **Padrão Mecânico / Caixa** | Caixa de embutir retangular 4x2 polegadas (padrão predial brasileiro) |
| **Acabamento Frontal** | Painel em vidro temperado resistente a riscos, com botões capacitivos de alta sensibilidade |
| **Topologia Elétrica** | **Híbrido (Compatível Com Neutro e Sem Neutro)** com inclusão de capacitor de bypass para cargas LED |
| **Tensão de Entrada** | Bivolt automático 100–240 V AC (50/60 Hz) |
| **Capacidade de Carga** | Mínimo 500 W por canal em lâmpadas LED (ou 1.000 W em lâmpadas incandescentes/halógenas) |
| **Iluminação de Status** | LED de backlight suave com opção de desativação noturna via aplicativo |
| **Conectividade Sem Fio** | Wi-Fi 802.11 b/g/n (2.4 GHz) |
| **Modelos Recomendados** | *NovaDigital Touch Switch Wi-Fi 4x2 (2 ou 3 teclas, híbrido com/sem neutro)* / *Sonoff TX Series T0/T2US 4x2* |

---

## 4. Projeto de Rede, VLANs e Segurança Cibernética

### 4.1. Topologia de Rede Wi-Fi 2.4 GHz Isolada
Dispositivos de automação predial baseados em Tuya/ESP8266 operam exclusivamente na faixa de radiofrequência de **2.4 GHz** (padrão 802.11 b/g/n). A rede corporativa do Edifício Soho deve implementar segregação em nível de enlace e camada 3:

```
[ Roteador Corporativo / Gateway MikroTik / UniFi ]
                   |
     +-------------+-------------+
     |                           |
[ VLAN 10 - Gerenciamento ]  [ VLAN 20 - Hospedes ]       [ VLAN 30 - IoT Domótica ]
  192.168.10.0/24             192.168.20.0/22               192.168.30.0/24
  - Servidores e PMS          - Portal do Hóspede           - SSID: CorpFlats-IoT
  - Portaria e Recepção       - Internet para celulares     - Banda: 2.4 GHz estrita
                              - Acesso restrito             - AP Isolation: HABILITADO
```

### 4.2. Parâmetros de Configuração da Rede IoT (`CorpFlats-IoT`)
1. **SSID Dedicado**: `CorpFlats-IoT` (oculto ou visível apenas para técnicos de instalação).
2. **Segurança**: WPA2-PSK com criptografia AES (evitar WPA3 transitório em redes 2.4GHz com chips legados para evitar falhas de handshake).
3. **Largura de Canal (*Channel Width*)**: Fixa em **20 MHz** (não utilizar 40 MHz para evitar interferência mútua nos canais saturados).
4. **Canais Fixos (*Non-Overlapping*)**: Distribuir os Access Points entre os canais **1, 6 e 11** para mitigar colisões de pacotes.
5. **Isolamento de Clientes (*Client / AP Isolation*)**: **Obrigatório**. Impede que um dispositivo IoT infectado ou comprometido comunique-se diretamente com outro dispositivo na mesma sub-rede.
6. **Firewall / Regras de Roteamento**:
   - Bloquear acesso da `VLAN 20 (Hóspedes)` à `VLAN 30 (IoT)`. O hóspede comanda os aparelhos exclusivamente através do backend seguro do CorpFlats (`/api/smart-flat/*`), nunca enviando pacotes diretos ao IP do aparelho.

### 4.3. Protocolos de Integração: Tuya Cloud API vs Local Tuya
- **Modo Primário (Tuya OpenAPI Cloud)**:
  Comunicação via nuvem oficial Tuya utilizando autenticação HMAC-SHA256, garantindo atualizações de firmware, acesso seguro de qualquer lugar e facilidade de manutenção.
- **Modo de Resiliência Local (Local Tuya / Protocolo 6668)**:
  Em flats com microcontrolador gateway local (ex: Raspberry Pi ou thin client na rede administrativa), o protocolo local 6668 permite tempo de resposta inferior a 50 ms e operação básica de comutação mesmo caso haja rompimento temporário do link de fibra da operadora externa.

---

## 5. Ciclo de Vida Fail-Safe & Mitigação de Riscos Térmicos

### 5.1. A Linha do Tempo da Chegada e Proteção de Presença
O ciclo de vida do Smart Flat Hub foi concebido para eliminar completamente o risco de acionamento inadvertido e desperdício:

```
[ ETA - 30min ]          [ ETA ]                 [ ETA + 15min ]          [ ETA + 30min ]
      |                     |                           |                        |
Janela de Liberação    Chegada Prevista          Aviso Preventivo          Corte Fail-Safe
- Aparelhos podem      - Contagem de             - Notificação visual       - Desligamento
  ser ligados ou         tolerância inicia         e aviso:                   imediato de cafeteira
  programados.                                   "Você já chegou?..."        e ar-condicionado.
```

1. **Janela de Antecedência Rigorosa**:
   - Se o hóspede informou chegada para as `14:00`, o sistema bloqueia tentativas de ligamento antes das `13:30`.
   - Mensagem oficial de retorno: *"A programação só é permitida com até 30 minutos de antecedência da sua chegada (a partir das 13:30 para chegada às 14:00)."*
2. **Aviso Preventivo de Presença**:
   - Transcorrido o horário previsto (ETA) sem confirmação de entrada, o sistema ativa o alerta visual:
     *"Você já chegou? Não esqueça de informar sua entrada aqui."*
3. **Desligamento Automático por Segurança (Fail-Safe Shutoff)**:
   - Se aos 30 minutos após o ETA (`now >= ETA + 30min`) a entrada não foi confirmada, o sistema desliga compulsoriamente a tomada da cafeteira e envia o comando de desligamento ao ar-condicionado.
   - Status oficial registrado no sistema:
     *"Equipamento desligado automaticamente por questão de segurança e economia de energia."*
4. **Desarme Imediato por Entrada Confirmada**:
   - Assim que a presença física é confirmada (pelo botão no hub, pelo check-in autodeclarado do hóspede ou pela portaria), a máquina de estados desarma o cronômetro de fail-safe e os aparelhos continuam ligados confortavelmente.

---

## 6. Procedimento de Instalação e Comissionamento por Flat

Para cada um dos 19 apartamentos do Soho Residence Service, a equipe de infraestrutura deve executar o seguinte roteiro padronizado:

### Passo 1: Preparação Elétrica & Desenergização
1. Desligar o disjuntor geral do flat no Quadro de Distribuição (QGD).
2. Testar ausência de tensão com multímetro digital ou chave de teste na bancada da cozinha e nas caixas 4x2 da sala.
3. Verificar a bitola dos condutores da tomada da cafeteira (mínimo de 2,5 mm² de cobre).

### Passo 2: Instalação Física dos Dispositivos
1. **Tomada da Cafeteira**:
   - Conectar o Smart Plug 16A diretamente na tomada da bancada da cozinha dedicada à cafeteira.
   - Garantir que a tomada original da parede possui o pino de aterramento conectado ao barramento de proteção (PE).
2. **Controle Infravermelho (Smart IR Blaster)**:
   - Fixar o IR Blaster no móvel ou suporte de parede com visada direta e desobstruída (sem cortinas ou divisórias opacas) para o receptor frontal da evaporadora do ar split.
   - Conectar a fonte bivolt 5V/1A na tomada contígua.
3. **Interruptor Touch 4x2**:
   - Substituir o espelho convencional pelo interruptor touch de vidro temperado.
   - Se o circuito possuir Neutro: conectar Fase (L), Neutro (N) e Retornos (L1/L2).
   - Se o circuito NÃO possuir Neutro: conectar Fase (L), Retornos (L1/L2) e instalar o capacitor de supressão fornecido em paralelo com a primeira lâmpada LED do canal 1 no teto.
4. **Caixa de Som Inteligente (Echo Pop)**:
   - Posicionar a caixa de som na bancada da sala ou aparador de entrada.
   - Conectar à fonte original e verificar inicialização do anel de LED.

### Passo 3: Provisionamento e Emparelhamento de Rede
1. Conectar o smartphone do instalador na rede `CorpFlats-IoT` (2.4 GHz).
2. Abrir o aplicativo Tuya / Smart Life corporativo e adicionar o Smart Plug 16A, o IR Blaster e o Interruptor Touch.
3. Nomear os dispositivos conforme a convenção CorpFlats:
   - `FLAT_{NUM}_TOMADA_CAFE` (ex: `FLAT_509_TOMADA_CAFE`)
   - `FLAT_{NUM}_IR_SPLIT` (ex: `FLAT_509_IR_SPLIT`)
   - `FLAT_{NUM}_TOUCH_ILUM` (ex: `FLAT_509_TOUCH_ILUM`)
   - `FLAT_{NUM}_ECHO_POP` (ex: `FLAT_509_ECHO_POP`)
4. No Smart Plug: Acessar configurações avançadas e definir `Power-On State = OFF`.
5. No IR Blaster: Selecionar a marca e código remoto correspondente ao ar-condicionado split do flat (Midea, Consul, Elgin ou Gree). Testar comandos de Ligar a 22°C, Modo Cool, Troca de Velocidade e Desligar.

### Passo 4: Teste de Integração com o Backend CorpFlats
1. Acessar o endpoint de teste/simulação do backend para o flat comissionado:
   `POST /api/smart-flat/:target/simulate` com `{ offsetMinutes: 0 }`.
2. Verificar se o estado do flat é lido com precisão via `GET /api/smart-flat/:target`.
3. Executar o teste de acionamento de aparelhos, confirmação de entrada e fail-safe na bancada de testes.

---

## 7. Relação de Materiais (Bill of Materials — BOM) & Orçamento para 19 Flats

Abaixo apresenta-se o dimensionamento orçamentário completo para aquisição e instalação nos 19 apartamentos do Edifício Soho Residence Service:

### Tabela Orçamentária Detalhada (Cenário Principal — Amazon Echo Pop)

| Item | Descrição do Componente / Modelo | Qtd / Flat | Qtd Total (19 Flats) | Preço Unit. Médio (R$) | Subtotal Frota (R$) |
| :---: | :--- | :---: | :---: | :---: | :---: |
| **01** | **Tomada Inteligente Wi-Fi 16A NBR c/ Monitoramento**<br>Ekaza EKHY-T108-16A / NovaDigital 16A (Anatel) | 1 | 19 | R$ 58,00 | R$ 1.102,00 |
| **02** | **Smart IR Blaster 38kHz c/ Sensor TH Integrado**<br>Tuya S08 / S06 Pro com Sensor de Temperatura e Umidade | 1 | 19 | R$ 75,00 | R$ 1.425,00 |
| **03** | **Caixa de Som Inteligente Amazon Echo Pop**<br>Alto-falante compacto com Alexa e botão de privacidade | 1 | 19 | R$ 240,00 | R$ 4.560,00 |
| **04** | **Interruptor Touch Wi-Fi 4x2 2 Teclas Vidro Temperado**<br>NovaDigital Híbrido com/sem neutro + capacitor | 2 | 38 | R$ 68,00 | R$ 2.584,00 |
| **05** | **Kit de Acessórios Elétricos, Fixação e Cabos Micro-USB**<br>Abraçadeiras, parafusos, canaletas de acabamento e fitas 3M | - | 1 Lote | R$ 300,00 | R$ 300,00 |
| **TOTAL**| **INVESTIMENTO GERAL ESTIMADO (FROTA COMPLETA)** | - | - | **R$ 525,00 / flat** | **R$ 9.971,00** |

---

### Tabela Comparativa Alternativa (Cenário Sofisticado — Echo Dot 5ª Geração c/ Relógio)

Caso a administração opte por instalar caixas de som inteligentes com display frontal de LED (servindo como relógio de cabeceira com temperatura externa para os hóspedes):

| Item | Diferença / Upgrade | Qtd Total | Preço Unit. (R$) | Subtotal Frota (R$) |
| :---: | :--- | :---: | :---: | :---: |
| **03b** | **Amazon Echo Dot 5ª Geração com Relógio Digital** | 19 | R$ 390,00 | R$ 7.410,00 |
| **Demais**| Tomadas 16A + IR Blasters TH + Interruptores Touch + Acessórios | 19 flats | - | R$ 5.411,00 |
| **TOTAL** | **INVESTIMENTO TOTAL NO CENÁRIO SOFISTICADO** | - | **R$ 675,00 / flat** | **R$ 12.821,00** |

---

## 8. Checklist Operacional de Manutenção Preventiva e Auditoria Periódica

A equipe de governança e manutenção predial do CorpFlats deve incluir a seguinte rotina nas revisões trimestrais e nos check-outs:

- [ ] **Inspeção Térmica do Smart Plug**: Verificar se os pinos metálicos da tomada da cafeteira apresentam sinais de escurecimento térmico ou frouxidão mecânica.
- [ ] **Calibração do Sensor TH do IR Blaster**: Confrontar a leitura de temperatura no aplicativo com um termômetro digital calibrado de ambiente (variação máxima tolerável: ±1,0°C).
- [ ] **Limpeza Óptica dos LEDs IR**: Remover poeira do domo do transmissor infravermelho com pano de microfibra seco para evitar atenuação do sinal.
- [ ] **Verificação do Botão de Privacidade da Alexa**: Confirmar acendimento do anel vermelho ao pressionar o botão mudo da caixa de som.
- [ ] **Teste de Inching / Fail-Safe**: Simular um ligamento da cafeteira e ar-condicionado sem confirmação de entrada, assegurando que o desligamento forçado ocorre aos 30 minutos pós-ETA com registro correto no log do sistema.
- [ ] **Auditoria de Potência em Watts**: Conferir se a medição de corrente do Smart Plug registra o consumo real da cafeteira durante o aquecimento (~1.200W a 1.450W).

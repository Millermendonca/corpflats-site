# Análise Técnica Profunda: Arquitetura de Hardware IoT, Ciclo Fail-Safe & Especificações de Áudio (Smart Flat Hub)

**Data**: 2026-10-11T23:48:00Z  
**Autor**: Explorer Survey 3 (IoT Hardware Architecture & Welcome Audio Specs)  
**Projeto**: Guest-Flow-Manager (CorpFlats — Edifício Soho Residence Service, Campos dos Goytacazes - RJ)  
**Escopo**: Requisitos R4 (Welcome Playlist & Regras de Ativação) e R5 (Guia de Arquitetura de Hardware IoT & Especificações de Aquisição).

---

## 1. Contexto Operacional & Elétrico da Propriedade (CorpFlats)

A propriedade CorpFlats opera atualmente 19 flats ativos no **Edifício Soho Residence Service** (Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ, CEP 28010-140):
- **Flats Ativos**: 113, 114, 116, 211, 212, 215, 313, 408, 509, 511, 512, 605, 712, 715, 904, 905, 907, 1004, 1304 (`DEFAULT_FLATS` em `demo-server.mjs:31-51`).
- **Padrão Elétrico Local (Concessionária Enel Rio)**:
  - Tensão monofásica residencial nas tomadas: **127V nominal** (fase-neutro).
  - Tensão bifásica para Ar-Condicionado Split: **220V nominal** (fase-fase), alimentado por disjuntores bipolares dedicados no quadro de distribuição do flat.
  - Padrão de plugues e tomadas: **NBR 14136** (3 pinos: Fase, Neutro, Terra).
    - Tomadas padrão 10A: Pinos de 4,0 mm de diâmetro (potência máx em 127V: 1.270 W).
    - Tomadas padrão 20A: Pinos de 4,8 mm de diâmetro (potência máx em 127V: 2.540 W).

---

## 2. Requisito R4: Especificação da Trilha Sonora de Boas-Vindas (Welcome Playlist)

### 2.1. Arquitetura do Player Web (Sandbox / Preview no Frontend)

O portal do hóspede em modo sandbox (`/preview/smart-flat` ou com parâmetro de laboratório) deve fornecer uma simulação interativa completa da reprodução de áudio, com tecnologia nativa HTML5 Audio API e design mobile-first:

1. **Curadoria Sonora de Hospitalidade (Hospitality Ambient Tracks)**:
   - Gênero: *Ambient Lounge, Bossa Nova Contemporânea, Soft Acoustic Breeze e Lo-Fi Sunset*.
   - Sonoridade suave e acolhedora, sem picos abruptos de decibéis (masterização entre -16 LUFS e -18 LUFS).
   - Faixas sugeridas para o catálogo padrão:
     - **Faixa 1**: *"CorpFlats Welcome Lounge"* (Bossa Nova / Chillout Suave — 3m 45s)
     - **Faixa 2**: *"Sunset at Soho"* (Lo-Fi Warm Piano & Beats — 4m 10s)
     - **Faixa 3**: *"Brisa de Verão"* (Acoustic Guitar & Soft Pads — 3m 20s)
     - **Faixa 4**: *"Executive Calm"* (Modern Ambient Lounge — 4m 30s)
   - Formatos recomendados: MP3 a 192 kbps (compatibilidade universal em iOS Safari, Android Chrome e Desktop) ou links de streaming CDN royalty-free.

2. **Componentes da Interface do Player**:
   - **Indicador de Status Físico**: Badge informando *"Reproduzindo no Flat (Echo Pop)"* ou *"Simulação de Áudio do Flat"*.
   - **Controles Interativos**:
     - Botão Play / Pause com alternância de ícones Lucide (`Play` / `Pause`).
     - Botões Anterior / Próxima Faixa (`SkipBack` / `SkipForward`).
     - Controle deslizante de Volume (Slider Radix UI de 0 a 100%, valor padrão inicial: **35%** para recepção não intrusiva).
     - Barra de progresso da faixa com tempo decorrido e duração total.
     - Equalizador visual animado (3 a 4 barras com animação CSS `animate-pulse` quando ativo).

3. **Política de Autoplay de Navegadores (Browser Autoplay Restrictions)**:
   - Navegadores modernos (Google Chrome, Apple Safari, Edge) bloqueiam a execução automática de áudio com som sem interação prévia do usuário (`NotAllowedError: play() failed because the user didn't interact with the document first`).
   - **Estratégia de Engenharia**:
     - No sandbox, o estado lógico da música inicia como `isPlaying: true` (indicando que a automação no flat físico foi acionada com sucesso).
     - Se o navegador bloquear o elemento `<audio>`, a interface exibe um botão suave: *"🎧 Ouvir som ambiente do flat"* ou ativa em modo mudo com prompt para desmutar, garantindo que não haja erros no console.

4. **Ciclo de Duração & Timeout**:
   - **Modo Loop**: A playlist avança ciclicamente entre as faixas (`onEnded` -> próxima faixa).
   - **Janela de Desligamento Automático (60 Minutos)**: Caso o hóspede não interaja, a música para automaticamente após 60 minutos (1 hora) da ativação para evitar poluição sonora no condomínio caso a entrada atrase.

### 2.2. Regras de Ativação no Dia do Check-in (Check-in Day Trigger Rules)

1. **Condição de Disparo (Trigger Invariants)**:
   - A ativação automática ocorre **exclusivamente no dia do check-in** da reserva (`checkInDate === today_in_sao_paulo`).
   - Horário de disparo oficial: **14:00** (valor padrão configurado em `db.settings.checkinTime` em `demo-server.mjs:691`).
   - Se a reserva possuir aprovação de **Early Check-in** (ex.: `earlyCheckinApproved: true` com horário às `11:00`), o gatilho é antecipado para o horário aprovado.
   - **Não depende de ação prévia do hóspede**: A música de boas-vindas é uma cortesia ativa de hospitalidade (ativa mesmo se o hóspede não acessou o portal ou não programou aparelhos).

2. **Cron / Watcher no Backend (`demo-server.mjs`)**:
   - Um tick periódico a cada 60 segundos inspeciona as reservas:
     ```javascript
     function checkDailyWelcomeMusicSchedule() {
       const now = new Date();
       const todayStr = formatLocalDate(now); // "YYYY-MM-DD"
       const currentHourMinute = formatLocalTime(now); // "14:00"
       
       for (const res of db.reservations) {
         if (res.status === 'cancelled') continue;
         if (res.checkInDate === todayStr && !res.welcomeMusicTriggered) {
           const targetTime = res.approvedEarlyCheckinTime || db.settings.checkinTime || "14:00";
           if (currentHourMinute >= targetTime) {
             res.welcomeMusicTriggered = true;
             res.welcomeMusicState = {
               status: 'playing',
               startedAt: now.toISOString(),
               volume: 35,
               track: 'CorpFlats Welcome Lounge',
               source: 'official_checkin_schedule'
             };
             // Dispara rotina IoT (Alexa / Webhook)
             triggerPhysicalWelcomeAudio(res.flatNumber);
           }
         }
       }
     }
     ```

### 2.3. Integração com Amazon Alexa (Echo Pop / Dot) & Ponte Web

Para transição do sandbox para os flats reais:
- **Dispositivo Físico no Flat**: Amazon Echo Pop ou Echo Dot 5ª Geração cadastrado na conta CorpFlats e atribuído ao flat correspondente (ex: *"Echo Pop - Flat 509"*).
- **Mecanismo de Disparo**:
  - **Método 1 (Rotina Alexa via Dispositivo Virtual / Webhook)**:
    - O servidor CorpFlats aciona um sensor de contato virtual ou switch virtual (via integração Sinric Pro, Home Assistant ou Tuya Virtual Device).
    - A Alexa possui uma rotina cadastrada:
      * *Gatilho*: "Quando o Sensor Virtual Flat 509 for Aberto".
      * *Ação 1*: Definir volume para 3 (30%).
      * *Ação 2*: Tocar playlist "CorpFlats Lounge" no Spotify no dispositivo "Echo Pop Flat 509".
      * *Ação 3*: Parar reprodução após 60 minutos.
  - **Método 2 (Spotify Web API / Connect)**:
    - A conta Spotify da CorpFlats comanda a reprodução diretamente no `device_id` do Echo Pop via chamada REST `PUT https://api.spotify.com/v1/me/player/play`.

---

## 3. Requisito R2 & R3: Ciclo de Vida Fail-Safe e Segurança Domótica

### 3.1. Janela de Antecedência Rigorosa (Até 30min antes do ETA)

1. **Validação Temporal**:
   - O hóspede informa o seu **ETA** (Horário Estimado de Chegada), ex: `16:00`.
   - O sistema calcula:
     $$\text{Janela Permitida} = [\text{ETA} - 30\text{ min}, \text{ETA} + 30\text{ min}]$$
   - Exemplo: Para ETA às `16:00`, a ativação antecipada só é liberada a partir de `15:30`.
   - **Bloqueio no Frontend e Backend**: Se a solicitação ocorrer antes de `15:30` (ex: às 12:00), o sistema bloqueia o acionamento imediato e oferece agendamento programado para as `15:30`, exibindo a mensagem:
     *"Por economia de energia e segurança, a climatização e cafeteira só podem ser ativadas com até 30 minutos de antecedência da sua chegada (a partir de 15:30)."*

### 3.2. Confirmação de Presença e Canais de Detecção

A flag `entranceConfirmed` pode ser validada por 3 vias independentes:
1. **Confirmação Manual do Hóspede**: Botão *"Já cheguei no flat!"* no Smart Flat Hub.
2. **Confirmação pela Portaria / Recepção**: Registro de entrada no sistema (`reception-tablet.tsx` / `/portaria`).
3. **Sensor IoT de Fechadura / Abertura de Porta**: Sensor de abertura magnético Tuya na porta de entrada do flat.

### 3.3. Ciclo de Desligamento Automático por Segurança (Fail-Safe Timeline)

Se os aparelhos foram ligados mas a presença **NÃO** foi confirmada (`entranceConfirmed === false`):

| Ponto Temporal | Offset em relação ao ETA | Ação do Sistema | Feedback ao Usuário |
| :--- | :--- | :--- | :--- |
| **$T_0$** | $\text{ETA} - 30\text{ min}$ | Aparelhos ligam (AC na temperatura escolhida; Tomada da cafeteira energizada). | Status verde: *"Ambiente climatizando para sua chegada."* |
| **$T_1$** | $\text{ETA}$ | Horário previsto atingido. Início da contagem de tolerância. | Contador regressivo visível na interface. |
| **$T_2$** | $\text{ETA} + 15\text{ min}$ | **Aviso Preventivo de Presença**: Alerta visual na tela e notificação automática WhatsApp/Sofia. | *"⚠️ Você já chegou? Não esqueça de confirmar sua entrada no flat para manter os aparelhos ligados."* |
| **$T_3$** | $\text{ETA} + 30\text{ min}$ | **Desligamento Automático Forçado (Corte de Segurança)**: Tomada inteligente corta energia da cafeteira; Disparador IR envia comando POWER_OFF para o AC; Música é pausada. | Alerta em vermelho: *"Equipamento desligado automaticamente por questão de segurança e economia de energia."* |

### 3.4. Justificativa Crítica de Segurança Térmica (Riscos Reais)

- **Cafeteiras Elétricas e de Cápsula (1.200W a 1.500W)**:
  - Possuem blocos térmicos (thermoblock) ou caldeiras de aquecimento rápido.
  - Se mantidas energizadas sem uso ou caso a água se esgote, há desgaste severo de termostatos bimetálicos, risco de queima por funcionamento a seco, degradação plástica e risco de princípio de incêndio. O corte em 30 minutos elimina esse risco residual.
- **Ar-Condicionado Split**:
  - Evita consumo desnecessário de ~1,5 kWh a 2,5 kWh por hora em flat vazio com cortinas eventualmente abertas, protegendo a sustentabilidade financeira da operação.

### 3.5. Tratamento de Falhas e Modos Offline (Network Resilience)

1. **Temporizador de Hardware (Inching / Hardware Countdown)**:
   - Tomadas inteligentes Tuya suportam contagem regressiva gravada na memória flash do próprio firmware do chip.
   - **Regra**: Ao enviar o comando de LIGAR para a cafeteira, o backend envia simultaneamente o parâmetro `countdown: 1800` (1800 segundos = 30 min). Mesmo que o roteador Wi-Fi caia ou a internet sofra pane, a tomada desliga fisicamente o relé interno de forma autônoma!
2. **Comportamento Pós-Queda de Energia (Power-On State)**:
   - Em caso de oscilação ou blecaute no prédio, o relé da tomada inteligente deve estar rigorosamente programado com `Power-On State: OFF`. Nunca deve retornar como `ON` ou `Remember Last State`.
3. **Natureza Simplex do Infravermelho (IR)**:
   - Controles IR não recebem confirmação de estado (unidirecional). Por isso, o uso de transmissores IR com **sensor de temperatura embutido** permite verificar se o ambiente de fato aqueceu ou esfriou, atuando como sensor indireto de conformidade.

---

## 4. Requisito R5: Arquitetura de Hardware IoT & Guia de Aquisição

### 4.1. Dimensionamento e Especificação dos Componentes

#### Componente 1: Tomada Inteligente Wi-Fi 16A (Smart Plug para Cafeteiras)
- **Desafio Elétrico NBR 14136**:
  - Tensão: 127V em Campos dos Goytacazes.
  - Cafeteiras Nespresso / Três Corações / Oster: 1.200W a 1.500W.
  - Corrente máxima de operação: $I = 1500\text{ W} / 127\text{ V} \approx 11,81\text{ A}$.
  - Tomadas convencionais de 10A suportam no máximo 1.270W. Operar uma cafeteira em tomada de 10A provoca sobrecarga contínua, degradação dos contatos do relé e risco de queima.
  - **Especificação Obrigatória**: Modelo **16A nominal (com suporte a pico de 20A)**, padrão NBR 14136 (3 pinos com aterramento).
- **Recursos Chave**:
  - Proteção térmica contra sobrecarga (desligamento automático se temperatura interna > 75°C ou corrente > 16.5A).
  - Medição de consumo em tempo real (Voltagem, Amperagem, Potência Ativa em Watts e Histórico em kWh).
  - Carcaça em termoplástico antichama (Policarbonato UL94-V0).
  - Chipset Tuya / Smart Life (compatível com Tuya Cloud e Local Tuya).
- **Modelos Recomendados para Compra**:
  - *Ekaza Smart Plug Wi-Fi 16A com Medição de Energia (Anatel)* — ~R$ 55,00 a R$ 65,00
  - *NovaDigital Tomada Inteligente Wi-Fi 16A NBR (Anatel)* — ~R$ 50,00 a R$ 60,00
  - *Positivo Casa Inteligente Smart Plug 16A* — ~R$ 69,00 a R$ 79,00

#### Componente 2: Controle Universal Infravermelho Inteligente (Smart IR Blaster para Ar Split)
- **Aplicação**: Controle dos Splits das marcas Springer Midea, Elgin, Consul, LG e Gree presentes nos flats.
- **Frequência de Portadora**: 38 kHz (padrão de 99,5% dos splits do mercado).
- **Emissores IR**: Cobertura 360° com arranjo de 6 ou mais LEDs emissores e alcance de 8 a 10 metros com visada direta (Line-of-Sight).
- **Diferencial Obrigatório**: **Sensor de Temperatura e Umidade Embutido** (ex: modelos Tuya S06 Pro / S08 / S09 com sensor TH). Permite monitorar a temperatura real do flat antes e após o disparo do comando IR.
- **Modelos Recomendados para Compra**:
  - *Tuya Smart IR Remote com Sensor de Temperatura e Umidade (S08 / S06-TH)* — ~R$ 65,00 a R$ 85,00
  - *Broadlink RM4 Mini com Cabo Sensor de Temperatura HTS2* — ~R$ 110,00 a R$ 130,00
  - *Ekaza Smart Controle Universal Infravermelho* — ~R$ 60,00 a R$ 75,00

#### Componente 3: Caixas de Som Inteligentes (Smart Speakers para Recepção & Welcome)
- **Aplicação**: Reprodução da trilha ambiente de boas-vindas às 14h, concierge por voz ("Alexa, qual a senha do Wi-Fi?"), despertador e avisos de check-out.
- **Opção A (Melhor Custo-Benefício)**: **Amazon Echo Pop**
  - Driver direcional frontal de 1,95". Compacto, excelente clareza sonora para flats de 18 a 30m².
  - Possui botão físico para desativar microfones com anel de luz indicadora em vermelho (privacidade garantida para hóspedes).
  - Faixa de preço: ~R$ 220,00 a R$ 260,00.
- **Opção B (Padrão Sofisticado)**: **Amazon Echo Dot 5ª Geração com Relógio**
  - Driver de 1,73" com graves reforçados, display LED frontal que serve de relógio de cabeceira com temperatura externa.
  - Faixa de preço: ~R$ 380,00 a R$ 430,00.
- **Configuração de Privacidade de Hospitalidade**:
  - Desativar compras por voz (`Voice Purchasing: Desativado`).
  - Desativar histórico de áudio com retenção pública e chamadas Drop-In entre flats.

#### Componente 4: Interruptores Touch de Parede Wi-Fi (Smart Wall Switches)
- **Aplicação**: Controle de iluminação da sala, bancada e quarto.
- **Padrão Físico**: Caixa de embutir 4x2 polegadas (padrão predial brasileiro).
- **Especificação Elétrica**: Modelo **Híbrido (Compatível Com e Sem Neutro)**.
  - Se a caixa 4x2 do flat não tiver o fio neutro passado, instala-se o capacitor incluso na primeira lâmpada LED do circuito.
  - Tensão: 100-240V bivolt. Carga máx: 500W por canal em LED.
- **Acabamento**: Painel frontal em vidro temperado com botões touch capacitivos e iluminação LED de status suave (com opção no app de desligar os LEDs à noite para conforto do hóspede).
- **Modelos Recomendados para Compra**:
  - *NovaDigital Touch Switch Wi-Fi 4x2 (1, 2 ou 3 teclas, com/sem neutro)* — ~R$ 60,00 a R$ 75,00
  - *Sonoff TX Series T0 / T2US 4x2 Wi-Fi Touch* — ~R$ 75,00 a R$ 95,00

---

### 4.2. Topologia de Rede & Segurança da Infraestrutura

1. **VLAN e SSID Dedicado para IoT (2.4 GHz)**:
   - Dispositivos Tuya operam estritamente na faixa de **2.4 GHz (802.11 b/g/n)**.
   - Criar uma rede dedicada e isolada:
     - SSID: `CorpFlats-IoT` (canal 1, 6 ou 11 fixo; largura de banda 20 MHz).
     - Criptografia: WPA2-PSK (AES).
     - Isolamento de Clientes (AP Isolation): Habilitado para impedir que um dispositivo comprometido ataque outro.
     - Bloqueio de Acesso de Hóspedes: Hóspedes conectam apenas na rede `CorpFlats-Hospedes`. A rede IoT fica inacessível para scans de rede locais.
2. **Estratégia de Integração: Tuya Cloud API vs Local Tuya**:
   - **Tuya Cloud (OpenAPI)**: Usada para orquestração remota, painel de controle e automações via servidores da nuvem Tuya.
   - **Local Tuya (Protocolo Local 6668)**: Para flats onde houver micro-servidor local ou gateway, permite latência inferior a 50ms e funcionamento dos comandos básicos mesmo em caso de corte no link de internet da operadora.

---

### 4.3. Orçamento e Lista de Materiais (Bill of Materials — BOM)

Para equipar a frota de **19 flats** do CorpFlats no Edifício Soho:

| Item | Qtd por Flat | Qtd Total (19 flats) | Preço Unit. Estimado (R$) | Subtotal Frota (R$) |
| :--- | :---: | :---: | :---: | :---: |
| **Tomada Inteligente Wi-Fi 16A NBR (Ekaza/NovaDigital)** | 1 | 19 | R$ 58,00 | R$ 1.102,00 |
| **Smart IR Blaster 38kHz c/ Sensor TH (Tuya S08)** | 1 | 19 | R$ 75,00 | R$ 1.425,00 |
| **Amazon Echo Pop (Caixa Inteligente)** | 1 | 19 | R$ 240,00 | R$ 4.560,00 |
| **Interruptor Touch Wi-Fi 4x2 2 Teclas (NovaDigital)** | 2 | 38 | R$ 68,00 | R$ 2.584,00 |
| **Plugs/Adaptadores e Acessórios de Fixação** | - | Lote | R$ 300,00 | R$ 300,00 |
| **TOTAL GERAL DO PROJETO** | - | - | **R$ 525,00 / flat** | **R$ 9.971,00** |

*Nota*: Se a opção for pelo **Echo Dot 5ª Geração com Relógio** (+R$ 150,00/flat), o orçamento total fica em **R$ 12.821,00** (~R$ 675,00 por flat).

---

## 5. Localização e Estrutura do Guia de Hardware

Recomendamos formalmente que o guia técnico completo seja versionado no repositório em:
`docs/SMART_FLAT_HARDWARE_GUIDE.md`

### Estrutura Detalhada do Documento:
1. **Sumário Executivo e Diretrizes de Hospitalidade CorpFlats**
2. **Especificações Técnicas por Categoria de Dispositivo** (Tomadas 16A, IR Blasters, Echo Pop/Dot, Interruptores 4x2)
3. **Dimensionamento Elétrico e Adequação NBR 14136 (127V vs 220V em Campos dos Goytacazes)**
4. **Infraestrutura de Rede, VLANs e Segurança Cibernética**
5. **Ciclo de Vida Fail-Safe e Segurança contra Riscos Térmicos**
6. **Guia Passo a Passo de Instalação e Comissionamento por Flat**
7. **Relação de Compras (BOM), Fornecedores e Links Recomendados**
8. **Checklist Operacional de Manutenção e Auditoria Periódica**

# Análise Técnica de Arquitetura Frontend — Smart Flat Hub (R1 a R5)

**Data da Investigação:** 2026-10-11T23:45:00Z  
**Explorador:** Explorer Survey 1 (Frontend & UI Sandbox)  
**Repositório:** `Guest-Flow-Manager`  
**Escopo:** `artifacts/limpeza/` (Rotas, Sandbox, Design System, Componentes e Build)

---

## 1. Sumário Executivo

A investigação aprofundada da base de código frontend (`artifacts/limpeza/`) identificou com precisão como o ecossistema do **Guest-Flow-Manager** está estruturado e determinou a arquitetura ideal para o **Smart Flat Hub**:

1. **Roteamento & SPA (`App.tsx`):** Utiliza `wouter` (^3.3.5) montado sob `WouterRouter` com suporte a `Route`, `Switch` e `useLocation`. O backend Express (`demo-server.mjs`) serve o SPA dinamicamente por meio de `serveSpaWithMetadata` a partir de `artifacts/limpeza/dist/public/index.html`. Qualquer nova rota client-side (como `/preview/smart-flat`) funciona instantaneamente sem necessidade de nova rota Express para HTML.
2. **Isolamento Rigoroso & Invisibilidade em Produção (R1):**
   - **Zero Visibilidade para Hóspedes Reais:** No portal público (`guest-portal.tsx`), nenhum elemento, card, botão ou aba de Smart Flat será visível a clientes reais, a menos que o parâmetro de laboratório `?preview=smart_flat` esteja explicitamente presente na URL.
   - **Ambiente Sandbox Dedicado:** Implementação de rota exclusiva `/preview/smart-flat` (e `/preview/smart-flat/:code`), acompanhada de uma **Barra de Simulação de Sandbox (Virtual Clock & State Controller)** que permite a desenvolvedores e operadores testar em tempo real: adiantamento/atraso do relógio virtual (testando as travas de 30min antes/depois), alternância do status de check-in (aguardando vs chegado) e seleção de flats (408, 605, etc.) com 1 clique.
3. **Design System & Componentes:**
   - Baseado em **Tailwind CSS v4** (`@theme inline`), **Radix UI** (primitivas já instaladas: `Slider`, `Switch`, `Tabs`, `Dialog`, `Progress`, `Badge`, `Card`, `Button`, `Input`, `Tooltip`) e **Lucide Icons** (`Wind`, `Thermometer`, `Coffee`, `Music`, `ShieldAlert`, `Clock`, `Power`, `Play`, `Pause`, `Volume2`, etc.).
   - Responsividade mobile-first com PWA viewport (`width=device-width, initial-scale=1.0, maximum-scale=1`), touch targets mínimos de 44px e layout ergonômico.
4. **Regras Operacionais e Máquina de Estados (R2, R3, R4):**
   - O backend já possui suporte maduro para Previsão de Chegada (`/api/pms/guest-portal/:code/estimated-arrival`) e Confirmação de Entrada do Hóspede (`/api/pms/guest-portal/:code/self-checkin`).
   - A máquina de estados temporal do Smart Flat Hub integra perfeitamente essas rotas para governar o bloqueio por antecedência (>30min antes do ETA), o alerta preventivo ("Você já chegou?") e o desligamento automático fail-safe (>30min após o ETA sem entrada confirmada).
5. **Compilação e Deploy (AGENTS.md):**
   - Build testado e validado: `npm --prefix artifacts/limpeza run build` conclui com 100% de sucesso (3360 módulos transformados, 0 erros TypeScript, tempo: 49.56s). Os arquivos compilados são gerados em `artifacts/limpeza/dist/public/`.

---

## 2. Configuração de Rotas e Navegação (`artifacts/limpeza/src/App.tsx`)

### 2.1 Estrutura do Roteador Wouter
O arquivo `artifacts/limpeza/src/App.tsx` organiza as rotas em categorias bem delineadas:
```tsx
<WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
  <Router />
</WouterRouter>
```
As rotas são divididas em 4 categorias de acesso:
1. **Rotas Públicas do Hóspede & Motor de Reservas:**
   - `/reservar`, `/booking` -> `BookingEngine`
   - `/minha-reserva/:code`, `/portal-hospede/:code`, `/guest-portal/:code` -> `GuestPortal`
   - `/cafe/:code` -> `GuestBreakfast`
   - `/checkout/:code` -> `GuestCheckout`
   - `/pre-checkin/:code` -> `GuestPreCheckin`
2. **Rotas da Portaria & Recepção:**
   - `/portaria`, `/tablet` -> `ReceptionTablet` (`ReceptionRoute` com `ReceptionGuard`)
3. **Rotas de Governança & Camareiras:**
   - `/dashboard`, `/tarefas`, `/achados-perdidos` -> `StaffRoute` (`StaffGuard`)
4. **Rotas Administrativas do Sistema:**
   - `/painel-aovivo`, `/reservas`, `/whatsapp-automation`, etc. -> `AdminRoute` (`AdminGuard`)

### 2.2 Entrega Estática do Backend Express
Em `scripts/demo-server.mjs` (e `artifacts/api-server/demo-server.mjs`):
- Linhas 31989-32025: A função `serveSpaWithMetadata(distFolder, req, res)` intercepta requisições GET que não sejam APIs e serve `dist/public/index.html`.
- O servidor injeta metadados Open Graph dinâmicos e entrega o pacote Vite unificado (`assets/index.js` e `assets/index.css`).
- Qualquer nova rota adicionada ao `Switch` do `App.tsx` tem resolução imediata tanto em desenvolvimento local quanto em produção no Render.

---

## 3. Mecanismo de Isolamento & Sandbox (Zero Visibilidade para Produção)

### 3.1 O Desafio de Privacidade & Pré-Lançamento (R1)
Os equipamentos físicos (tomadas inteligentes Tuya, emissores IR Blaster para ar-condicionado, caixas Echo Pop) ainda serão adquiridos e homologados. Portanto, **nenhum hóspede real em produção pode ver ou interagir acidentalmente com botões de automação**.

### 3.2 Estratégia de Duplo Isolamento (Dual-Gated)
Para satisfazer rigorosamente a exigência do prompt e os critérios de aceitação:

1. **Rota Dedicada de Sandbox / Laboratório:**
   - Adicionar em `App.tsx`:
     ```tsx
     {/* Smart Flat Hub - Sandbox & Preview Isolado */}
     <Route path="/preview/smart-flat/:code" component={SmartFlatPreviewPage} />
     <Route path="/preview/smart-flat" component={SmartFlatPreviewPage} />
     <AdminRoute path="/admin/smart-flat-preview" component={SmartFlatPreviewPage} moduleName="o Preview do Smart Flat Hub" />
     ```
   - A rota `/preview/smart-flat` é pública para permitir que Miller e desenvolvedores testem em smartphones reais (PWA) sem exigir login admin, mas seu caminho é desconhecido e não referenciado em links do portal.
2. **Modo Oculto no Portal do Hóspede via Query Param:**
   - No portal público `guest-portal.tsx`:
     ```tsx
     const isSmartFlatPreview = typeof window !== "undefined" && 
       new URLSearchParams(window.location.search).get("preview") === "smart_flat";
     ```
   - Se `!isSmartFlatPreview`, o componente `<SmartFlatHubCard />` **NÃO é renderizado no DOM**. Hóspedes reais em `/minha-reserva/RES-123` visualizam exatamente o portal tradicional, com zero menções a Smart Flat.
   - Se um operador ou desenvolvedor acessar `/minha-reserva/RES-123?preview=smart_flat`, o portal exibe o card de controle domótico contextualizado para aquela reserva.

### 3.3 Barra de Controle da Simulação (Sandbox Controller Bar)
No topo da página `/preview/smart-flat`, uma barra de controle interativa permite validar instantaneamente todos os cenários operacionais sem ter que esperar a passagem real do tempo:
- **Reserva / Quarto Simulado:** Permite alternar entre Flat 408 (Quarto Executivo com Split 12.000 BTU) e Flat 605 (Presidencial).
- **Controle de Horário Virtual (Virtual Time Travel):**
  - Botão "13:00 (1h antes do ETA)" -> testa bloqueio por antecedência (>30min).
  - Botão "13:35 (Janela de 30min aberta)" -> testa desbloqueio da cafeteira e ar-condicionado.
  - Botão "14:05 (Passou do ETA sem entrar)" -> testa alerta preventivo "Você já chegou?".
  - Botão "14:35 (30min de atraso sem entrar)" -> testa desligamento automático de emergência (Fail-Safe).
- **Alternador de Entrada no Flat:** Botão para simular a autodeclaração de entrada ("Estou no Flat / Já Cheguei"), cancelando o fail-safe.
- **Reset do Cenário:** Restaura os valores padrão para nova bateria de testes.

---

## 4. Convenções do Design System & Componentes Reutilizáveis

### 4.1 Tailwind CSS & Paleta Visual
A aplicação utiliza Tailwind CSS v4 com temas em variáveis CSS (`@theme inline` em `src/index.css`):
- **Cores Semânticas:**
  - Primária: `--color-primary` (azul corporativo / royal: `#2563eb` / `#1d4ed8`)
  - Climatização / Frio: `sky-500`, `sky-600`, `cyan-600`, `blue-50`
  - Cafeteira / Quente: `amber-600`, `orange-600`, `amber-50`
  - Segurança / Fail-Safe: `rose-600`, `red-500`, `rose-50`
  - Sucesso / Entrada Confirmada: `emerald-600`, `teal-600`, `emerald-50`
  - Card & Superfícies: `bg-card`, `border-border`, `shadow-sm`, `shadow-md`
- **Geometria & Bordas:**
  - Cards externos: `rounded-2xl` e `rounded-3xl`
  - Botões e controles: `rounded-xl`
  - Badges: `rounded-full` ou `rounded-md`

### 4.2 Primitivas Radix UI Já Disponíveis em `src/components/ui/`
Todas as primitivas necessárias para o Smart Flat Hub já estão criadas e testadas:
| Componente | Arquivo | Aplicação no Smart Flat Hub |
| :--- | :--- | :--- |
| **Slider** | `src/components/ui/slider.tsx` | Ajuste contínuo da temperatura do Ar-Condicionado (18°C a 26°C) e volume do som (0 a 100%) |
| **Switch** | `src/components/ui/switch.tsx` | Ligar/desligar Cafeteira inteligente e Ar-Condicionado |
| **Tabs** | `src/components/ui/tabs.tsx` | Seleção dos modos do Ar (Frio / Ventilar / Eco) e abas de dispositivos |
| **Progress** | `src/components/ui/progress.tsx` | Barra de contagem regressiva para a janela de ativação e tempo restante até fail-safe |
| **Badge** | `src/components/ui/badge.tsx` | Indicadores de status ("Bloqueado", "Ativo", "Desligado por Segurança", "Eco") |
| **Dialog** | `src/components/ui/dialog.tsx` | Modais de confirmação e avisos de segurança |
| **Button** | `src/components/ui/button.tsx` | Botões de ação rápida com estados de loading (`RefreshCw animate-spin`) |
| **Card** | `src/components/ui/card.tsx` | Containers de módulos com `CardHeader`, `CardTitle` e `CardContent` |

### 4.3 Ícones Lucide
A biblioteca `lucide-react` já está presente no `package.json`. Ícones chave identificados:
- **Climatização:** `Wind`, `Thermometer`, `Snowflake`, `Fan`, `Power`
- **Cafeteria:** `Coffee`, `Flame`, `Zap`
- **Trilha Sonora:** `Music`, `Play`, `Pause`, `SkipForward`, `SkipBack`, `Volume2`, `VolumeX`, `Radio`
- **Segurança & Tempo:** `Clock`, `Timer`, `AlertTriangle`, `ShieldAlert`, `ShieldCheck`, `CheckCircle2`, `DoorOpen`
- **Sandbox & Sistema:** `Sliders`, `Cpu`, `Wifi`, `Home`, `Smartphone`, `Sparkles`

### 4.4 Responsividade Mobile-First (PWA)
- **Viewport:** Configurado em `index.html` com `width=device-width, initial-scale=1.0, maximum-scale=1`.
- **Áreas de Toque:** Elementos interativos (botões de temperatura, sliders e switches) possuem altura mínima de `h-11` (44px) ou `h-12` (48px) para evitar toques acidentais em telas touchscreen.
- **Feedback Háptico Visual:** Animações sutis via `active:scale-95`, `transition-all`, e badges dinâmicos de cor.

---

## 5. Requisitos de Entrada, Estados & Regras Operacionais

### 5.1 Coleta e Validação do ETA (Horário de Chegada)
O sistema exige o horário previsto de chegada antes de liberar os agendamentos:
1. **Verificação de ETA Existente:**
   - O objeto de reserva possui o campo `reservation.estimatedArrivalTime` (ex: `"14:30"`).
   - Se o hóspede ainda não informou, o hub exibe um card acolhedor: *"Que horas você pretende chegar hoje? ⏰"* com opções rápidas (`14:30`, `15:00`, `16:00`, `17:00`, `18:00+`) e campo de digitação livre.
   - O salvamento é integrado diretamente ao endpoint existente:
     `POST /api/pms/guest-portal/:code/estimated-arrival` com `{ estimatedArrivalTime: timeVal }`.
2. **Bloqueio de Agendamentos sem ETA:**
   - Sem o ETA definido, os controles do Ar e Café permanecem em estado desabilitado (disabled) com mensagem instrutiva: *"Informe seu horário previsto de chegada para liberar a preparação do seu flat."*

### 5.2 Trava Temporal: Janela de Antecedência de até 30 Minutos (R2)
- **Regra:** O hóspede só pode ligar a cafeteira ou o ar-condicionado com antecedência máxima de 30 minutos em relação ao ETA (ex: se o ETA é 14:00, a ativação só é permitida a partir das 13:30).
- **Cálculo de Janela:**
  ```typescript
  const etaMinutes = parseTimeToMinutes(estimatedArrivalTime); // ex: 14:00 -> 840 min
  const nowMinutes = getCurrentMinutes(); // ex: 13:15 -> 795 min
  const diffMinutes = etaMinutes - nowMinutes; // 45 min de antecedência
  const isTooEarly = diffMinutes > 30;
  const unlocksAt = formatMinutesToTime(etaMinutes - 30); // "13:30"
  ```
- **Feedback na Interface:**
  - Se `isTooEarly === true`:
    - Botões de ligar desativados.
    - Badge: `🔒 Bloqueado por Economia & Segurança`.
    - Mensagem: *"A preparação do flat libera automaticamente às 13:30 (30 minutos antes da sua previsão de chegada)."*
  - Se `isTooEarly === false`:
    - Controles totalmente habilitados para o hóspede programar a temperatura e ligar a cafeteira.

### 5.3 Controles do Ar-Condicionado (18°C a 26°C)
- **Faixa de Temperatura:** Restrita a valores inteiros entre 18°C (mínimo seguro para evitar congelamento da serpentina) e 26°C (temperatura amena de conforto térmico).
- **Controles na UI:**
  - Leitor central em destaque (ex: `22°C - Climatização Confortável`).
  - Botões decremento (`-`) e incremento (`+`) ergonômicos.
  - Radix `Slider` com `min={18}`, `max={26}`, `step={1}`.
  - Seletor de Modo: Frio (Cool), Ventilação (Fan), Modo Econômico (Eco).
  - Velocidade do Ventilador: Automático, Baixa, Média, Alta.
  - Switch Principal: Ligar / Desligar climatização.

### 5.4 Cafeteira Expressa & Avisos de Segurança
- **Switch Principal:** Ligar / Programar café de boas-vindas.
- **Card de Segurança & Procedimento:**
  - *"⚠️ Certifique-se de que há água no reservatório e cápsula inserida."*
  - Status da Tomada Inteligente: *"Tomada 16A com proteção térmica ativa."*
  - Feedback visual de acionamento: *"Café quentinho sendo preparado para a sua chegada!"*

### 5.5 Ciclo Fail-Safe de Presença & Desligamento Automático (R3)
- **Verificação de Confirmação de Entrada:**
  - O sistema monitora a flag `hasEnteredFlat` (disponível via `guestSelfCheckin`, `actualCheckinAt` ou status de check-in na portaria).
- **Aviso Preventivo (Quando o horário previsto se aproxima/ultrapassa sem entrada):**
  - Condição: `nowMinutes >= etaMinutes && !hasEnteredFlat && (acOn || coffeeOn)`.
  - Exibe alerta chamativo no topo:
    > **"Você já chegou? Não esqueça de informar sua entrada aqui."**  
    > Botão de ação direta: `[🚪 Já Cheguei / Confirmar Entrada]`
  - Ao clicar, chama `POST /api/pms/guest-portal/:code/self-checkin`, confirmando a entrada, gravando nos logs do PMS e suspendendo o temporizador de desligamento de segurança.
- **Desligamento Automático por Segurança:**
  - Condição: `nowMinutes >= etaMinutes + 30 && !hasEnteredFlat && (acOn || coffeeOn)`.
  - Se passarem 30 minutos após o ETA informado e o hóspede não tiver confirmado entrada nem na portaria nem no portal:
    - O sistema desliga automaticamente a cafeteira e o ar-condicionado.
    - Exibe banner de status e aviso claro:
      > **"🛡️ Equipamentos desligados automaticamente por questão de segurança e economia de energia."**
    - Registra evento nos logs da simulação/servidor.

### 5.6 Trilha Sonora de Boas-Vindas Automática (R4)
- **Regra de Disparo:**
  - Em flats com check-in agendado para a data corrente (`isTodayCheckin === true`), a reprodução de música ambiente de boas-vindas ativa-se automaticamente a partir do horário oficial de check-in (14:00), independentemente de o hóspede ter ativado outros aparelhos.
- **Widget de Reprodução Integrado:**
  - Card compacto com capa de álbum sutil, título da música e artista (ex: *"Garota de Ipanema - Jazz & Bossa Lounge"*).
  - Botões de reprodução: Play, Pause, Próxima Faixa, Faixa Anterior.
  - Seletor de Playlist:
    - 🎷 *Bossa Nova Lounge* (Recepção acolhedora)
    - ☕ *Jazz Café & Relax* (Ambiente calmo para descanso)
    - 🌊 *Acústico Sunset* (Estilo praia e descontração)
  - Controle deslizante de volume (Radix `Slider`, 0% a 100%).
  - Indicador de dispositivo conectado: *"Reproduzindo via Echo Pop • Flat 408 (Spotify Connect)"*.

---

## 6. Arquitetura de Componentes Proposta

Para manter o código modular, legível e em total conformidade com os padrões do projeto, a estrutura recomendada de componentes é:

```
artifacts/limpeza/src/
├── pages/
│   └── smart-flat-preview.tsx        # Página de Sandbox completa com Simulator Bar
├── components/
│   └── smart-flat/
│       ├── smart-flat-hub.tsx        # Container principal do Hub (reutilizável)
│       ├── eta-scheduler-card.tsx    # Coleta de ETA e régua de antecedência (30min)
│       ├── ac-control-card.tsx       # Controle de temperatura (18-26°C), modos e ventilação
│       ├── coffee-switch-card.tsx    # Controle da cafeteira com avisos térmicos
│       ├── failsafe-banner.tsx       # Alertas de "Você já chegou?" e desligamento por segurança
│       ├── welcome-playlist.tsx      # Player de música ambiente com play/pause/volume
│       └── sandbox-controller-bar.tsx# Barra de simulação temporal, flats e check-in
```

### Integração Oculta em `guest-portal.tsx`:
Em `artifacts/limpeza/src/pages/guest-portal.tsx`, dentro do container `<main>`, adicionar a inclusão condicional:
```tsx
{/* ── Smart Flat Hub (Laboratório Oculto - Visível APENAS via ?preview=smart_flat) ── */}
{isSmartFlatPreview && (
  <SmartFlatHub 
    reservation={reservation}
    onSelfCheckin={handleConfirmSelfCheckin}
  />
)}
```
Dessa forma, o código de produção permanece **100% blindado** para os clientes reais.

---

## 7. Verificação de Build & Conformidade de Testes

1. **Build do Frontend:**
   - Comando executado: `npm --prefix artifacts/limpeza run build`
   - Resultado: Sucesso absoluto (Código de saída 0).
   - Saída gerada:
     - `dist/public/index.html` (2.65 kB)
     - `dist/public/assets/index.js` (3.36 MB)
     - `dist/public/assets/index.css` (401 kB)
2. **Diretrizes do `AGENTS.md`:**
   - **Zero testes globais:** Nenhum teste global, varredura em `tests/` ou teste de outro módulo foi executado.
   - **Git & Push:** Toda alteração de código subsequente deverá ter o build regenerado e comitado com push imediato.

---

## 8. Conclusão & Próximos Passos para Implementação

A arquitetura frontend está completamente mapeada e pronta para desenvolvimento sem riscos de vazamento para a produção. Todos os blocos necessários (Tailwind, Radix UI, Lucide, endpoints de ETA e self-checkin, regras de fail-safe e player de música) foram detalhados e contam com suporte no ecossistema do Guest-Flow-Manager.

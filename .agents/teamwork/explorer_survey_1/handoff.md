# Handoff Report — Explorer Survey 1 (Frontend & UI Sandbox)

**Milestone:** Smart Flat Hub — Frontend Architecture, UI Sandbox & Privacy Isolation  
**Working Directory:** `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_1`  
**Date:** 2026-10-11T23:46:00Z  

---

## 1. Observation

Durante a investigação técnica dos diretórios `artifacts/limpeza/` e `scripts/`, foram diretamente observados os seguintes fatos:

1. **Roteamento e Servidor SPA (`artifacts/limpeza/src/App.tsx` e `scripts/demo-server.mjs`):**
   - `artifacts/limpeza/src/App.tsx:6`: Importa `Route`, `Switch`, `useLocation`, `Router as WouterRouter` de `wouter`.
   - `artifacts/limpeza/src/App.tsx:411-413`: O app inicializa com `<WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter>`.
   - `artifacts/limpeza/src/App.tsx:173-198`: Define rotas públicas de hóspedes (`/minha-reserva/:code`, `/portal-hospede/:code`, `/guest-portal/:code` mapeadas para `GuestPortal`).
   - `scripts/demo-server.mjs:31989` e `artifacts/api-server/demo-server.mjs:31989`:
     ```javascript
     const distPath = path.resolve(__dirname, "../limpeza/dist/public");
     function serveSpaWithMetadata(distFolder, req, res) { ... }
     ```
     Todas as rotas públicas que não coincidem com `/api/*` resolvem para `index.html`.

2. **Fluxo e Estados do Portal do Hóspede (`artifacts/limpeza/src/pages/guest-portal.tsx`):**
   - Linhas 46-59: Captura de parâmetros `:code` e query strings (`window.location.search`).
   - Linhas 214-243: Bloco de Previsão de Chegada no Dia do Check-in (`selectedArrivalTime`, `customArrivalTime`, `handleSaveEstimatedArrival` disparando `POST /api/pms/guest-portal/${encodeURIComponent(code)}/estimated-arrival`).
   - Linhas 626-631: Verificação de entrada confirmada:
     ```typescript
     const hasEnteredFlat = Boolean(
       reservation?.guestSelfCheckin ||
       reservation?.actualCheckinAt ||
       reservation?.status === "in_house" ||
       (reservation?.status === "checkin" && reservation?.guestSelfCheckin)
     )
     ```
   - Linhas 1654-1671: Botão de autodeclaração de entrada `POST /api/pms/guest-portal/${encodeURIComponent(code)}/self-checkin` com texto `"🚪 Já Cheguei"`.

3. **Backend Twin Parity para ETA e Autodeclaração (`scripts/demo-server.mjs`):**
   - Linha 15986: `POST /api/pms/guest-portal/:code/estimated-arrival` persiste `r.estimatedArrivalTime`.
   - Linha 16070: `app.all(["/api/pms/guest-portal/:code/self-checkin", ...])` marca `r.guestSelfCheckin = true`, `r.guestSelfCheckinAt = now.toISOString()`, `r.status = "checkin"` e gera notificação para a portaria.

4. **Design System & Primitivas Radix Disponíveis:**
   - `artifacts/limpeza/package.json`: Possui `@radix-ui/react-slider`, `@radix-ui/react-switch`, `@radix-ui/react-tabs`, `@radix-ui/react-progress`, `@radix-ui/react-dialog`, `lucide-react`, `tailwindcss` (v4 com `@theme inline`).
   - Componentes prontos em `artifacts/limpeza/src/components/ui/`: `slider.tsx`, `switch.tsx`, `tabs.tsx`, `progress.tsx`, `badge.tsx`, `card.tsx`, `button.tsx`, `input.tsx`.

5. **Build de Frontend (`npm run build`):**
   - Comando executado: `npm --prefix artifacts/limpeza run build` (task-106).
   - Saída: `✓ 3360 modules transformed. ✓ built in 49.56s`. Código de retorno: `0`.
   - Arquivos gerados em `artifacts/limpeza/dist/public/` (`index.html`, `assets/index.js`, `assets/index.css`).

---

## 2. Logic Chain

1. **A partir da Observação 1 (Roteamento & Express SPA):**
   - O Wouter processa rotas no cliente e o Express serve `dist/public/index.html` para qualquer caminho que não seja API.
   - Logo, adicionar uma rota como `/preview/smart-flat` em `App.tsx` funciona imediatamente, sem exigir alterações em rotas de arquivos no Express.

2. **A partir das Observações 2 e 3 (ETA e Self-Check-in no Portal e no Backend):**
   - O sistema já possui endpoints operacionais para registrar previsão de chegada (`estimated-arrival`) e entrada no quarto (`self-checkin`).
   - Logo, o Smart Flat Hub não precisa reinventar a infraestrutura de dados de chegada: ele deve consumir diretamente o ETA para calcular a janela de 30 minutos antes da chegada (`now < ETA - 30min` -> bloqueado) e a presença do hóspede (`hasEnteredFlat`) para governar os avisos preventivos e o desligamento fail-safe (`now > ETA + 30min` sem check-in -> desligamento automático).

3. **A partir da Observação 1 e Requisito R1 (Privacidade Rigorosa & Sandbox Oculto):**
   - Os clientes em produção acessam o portal através de `/minha-reserva/:code`.
   - Se o Smart Flat Hub for condicionado estritamente a `new URLSearchParams(window.location.search).get("preview") === "smart_flat"`, nenhum card ou botão existirá no DOM para clientes reais.
   - Ao mesmo tempo, fornecendo a rota dedicada `/preview/smart-flat` (com uma barra de controle de sandbox / relógio virtual), desenvolvedores e a gestão podem simular todas as regras temporais sem esperar horas reais.

4. **A partir das Observações 4 e 5 (Design System e Build):**
   - Com `Slider` (temperatura de 18°C a 26°C e volume), `Switch` (cafeteira e ar-condicionado), `Tabs` (modos do ar) e `Progress` (régua temporal de fail-safe), a interface atende integralmente ao design system e responsividade mobile-first.
   - O build do frontend compila de forma limpa, garantindo estabilidade e deploy imediato.

---

## 3. Caveats

1. **Hardware IoT Físico:** Esta análise concentrou-se exclusivamente no frontend, UI e modo de simulação/sandbox. A integração com protocolos de hardware reais (Tuya Local API, Zigbee, Tuya Cloud OpenAPI ou MQTT) é tratada em guia separado e não foi conectada diretamente no frontend (que opera em modo de simulação/mock no preview).
2. **Autoplay de Áudio nos Navegadores:** Políticas modernas de navegadores (Chrome/Safari) bloqueiam reprodução automática de áudio sem interação prévia do usuário. No widget da Trilha Sonora de Boas-Vindas, o estado visual deve indicar "Reproduzindo" e a primeira interação do usuário (clique ou toque) inicializa o áudio.
3. **Escopo Estrito de Testes (AGENTS.md):** Nenhum teste global ou varredura de pasta `tests/` foi executado, conforme diretriz mandatória do projeto.

---

## 4. Conclusion

A arquitetura do **Smart Flat Hub Frontend** está minuciosamente delineada e aprovada para execução:

1. **Isolamento Total:** Rota `/preview/smart-flat` e `/preview/smart-flat/:code` no `App.tsx`, além de gating `?preview=smart_flat` em `guest-portal.tsx`. Zero vazamento para produção.
2. **Interface e Componentes:** Componentização em `artifacts/limpeza/src/components/smart-flat/` utilizando `Slider` (18-26°C), `Switch` (cafeteira com alertas térmicos), `Tabs` (modos do ar), `Progress` (fail-safe) e Widget de Trilha Sonora com controles de play/pause e volume.
3. **Barra de Simulação Sandbox:** Relógio virtual integrado para testar adiantamento de tempo, bloqueio de 30min, alerta de "Você já chegou?" e desligamento automático.
4. **Build Verificado:** `npm --prefix artifacts/limpeza run build` aprovado com código 0 e tempo de 49.56s.

---

## 5. Verification Method

Para verificar de forma independente as constatações deste relatório:

1. **Inspecione a configuração de rotas:**
   - Visualizar `artifacts/limpeza/src/App.tsx:173-198`.
2. **Inspecione os endpoints de ETA e Self-Check-in:**
   - Visualizar `scripts/demo-server.mjs:15986` (`estimated-arrival`) e `scripts/demo-server.mjs:16070` (`self-checkin`).
3. **Inspecione o manuseio de self-checkin no frontend:**
   - Visualizar `artifacts/limpeza/src/pages/guest-portal.tsx:626-631` e `1654-1671`.
4. **Verifique o build do frontend:**
   - Executar no terminal:
     `npm --prefix artifacts/limpeza run build`
   - O comando deve finalizar com código de saída 0 e gerar `artifacts/limpeza/dist/public/index.html`.

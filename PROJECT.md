# Project: Smart Flat Hub (CorpFlats Soho Residence Service)

## Architecture
O **Smart Flat Hub** é uma plataforma domótica e de experiência de chegada desenvolvida para os 19 flats do Edifício Soho Residence Service (Campos dos Goytacazes - RJ). A solução integra:
1. **Frontend Sandbox Isolado (Client PWA)**:
   - Rota isolada `/preview/smart-flat` e `/preview/smart-flat/:code` no `artifacts/limpeza/src/App.tsx`.
   - Gating condicional estrito `?preview=smart_flat` via `GuestPortalWrapper` impedindo qualquer vazamento ou exibição de botões para hóspedes reais em produção no `guest-portal.tsx`.
   - Interface mobile-first desenvolvida em Tailwind CSS v4, componentes Radix UI (`Slider`, `Switch`, `Tabs`, `Progress`) e ícones Lucide.
   - Barra de Simulação Sandbox / Time-Travel integrada para testes operacionais.
2. **Backend Engine & State Persistence (Digital Twin)**:
   - Endpoints dedicados sob `/api/smart-flat/*` em `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs`.
   - Estado centralizado dos flats e reservas (`SmartFlatState` em `db.smartFlats` e `r.smartFlat`).
   - Validador da janela de antecedência de até 30 minutos antes do ETA (`now >= ETA - 30min`).
   - Motor híbrido de presença e fail-safe (aviso preventivo *"Você já chegou?"* e desligamento compulsório aos 30min pós-ETA sem entrada confirmada).
3. **Trilha Sonora de Boas-Vindas (Welcome Playlist Audio Engine)**:
   - Automação ativada no dia do check-in a partir do horário oficial (`14:00` / `checkinTime`) para flats com entrada prevista.
   - Player HTML5 Audio / Web Audio API na interface web sandbox com seleção de faixas de ambient hospitality, volume inicial suave a 35%, modo loop, controles de play/pause e ponte conceitual com Amazon Echo Pop/Dot.
4. **Guia de Arquitetura de Hardware IoT & Aquisição**:
   - Especificação técnica para compras em `docs/SMART_FLAT_HARDWARE_GUIDE.md`: Tomadas Tuya 16A com proteção térmica (NBR 14136), IR Blasters 38kHz com sensor TH integrado, Amazon Echo Pop/Dot Alexa e interruptores touch híbridos (com/sem neutro).

---

## Feature Inventory
| # | Feature | Description | Milestone | Status | Source |
|---|---------|-------------|-----------|--------|--------|
| F1 | UI Sandbox & Privacy Isolation | Rota isolada `/preview/smart-flat`, sandbox time-travel, zero visibilidade em produção | M1 | DONE | ORIGINAL_REQUEST § R1, Explorer 1 |
| F2 | ETA & Janela de Antecedência 30min | Bloqueio de programação com mais de 30min antes do ETA informado | M2 | DONE | ORIGINAL_REQUEST § R2, Explorer 2 |
| F3 | Controle Inteligente de Cafeteira | Acionamento de cafeteira respeitando janela de antecedência, avisos térmicos | M2 | DONE | ORIGINAL_REQUEST § R2, Explorer 2 |
| F4 | Climatização Inteligente (AC Split) | Seletor de temperatura 18°C a 26°C, modos (cool/fan/heat/dry), velocidade | M2 | DONE | ORIGINAL_REQUEST § R2, Explorer 2 |
| F5 | Ciclo Fail-Safe de Presença | Alerta "Você já chegou?", desligamento aos 30min pós-ETA sem check-in, desarme pós-entrada | M2 | DONE | ORIGINAL_REQUEST § R3, Explorer 2, Explorer 3 |
| F6 | Trilha Sonora de Boas-Vindas | Ativação automática no dia do check-in às 14:00, player web, controles de áudio | M3 | DONE | ORIGINAL_REQUEST § R4, Explorer 3 |
| F7 | Guia de Hardware IoT & Compras | Especificação técnica e lista de compras detalhada em `docs/SMART_FLAT_HARDWARE_GUIDE.md` | M4 | DONE | ORIGINAL_REQUEST § R5, Explorer 3 |
| F8 | Testes Pontuais, Paridade Twin & Build | Teste `tests/smart-flat-hub.test.mjs`, SHA-256 parity scripts vs api-server, npm run build, git push | M5 | DONE | ORIGINAL_REQUEST Criteria, AGENTS.md |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Smart Flat Hub UI Sandbox | Telas e componentes em `artifacts/limpeza/src/components/smart-flat/` e rota `/preview/smart-flat` em `App.tsx` | none | DONE |
| M2 | Backend Engine & Fail-Safe APIs | Endpoints `/api/smart-flat/*`, validação de antecedência, fail-safe 30min e persistência | none | DONE |
| M3 | Welcome Playlist & Audio Engine | Player web de áudio no sandbox, trigger no backend no dia do check-in às 14h | M1, M2 | DONE |
| M4 | IoT Hardware & Acquisition Guide | Documento técnico de compras e rede em `docs/SMART_FLAT_HARDWARE_GUIDE.md` | none | DONE |
| M5 | Verificação Pontual, Paridade & Build | Testes pontuais `tests/smart-flat-hub.test.mjs`, paridade SHA-256 twin-server, build e git push | M1, M2, M3, M4 | DONE |

---

## Interface Contracts

### Endpoints Backend (`scripts/demo-server.mjs` & `artifacts/api-server/demo-server.mjs`)
- `GET /api/smart-flat/:target`
  - Resposta: `{ ok: true, smartFlat: SmartFlatState }`
- `POST /api/smart-flat/:target/eta`
  - Body: `{ estimatedArrivalTime: "14:00" }`
  - Resposta: `{ ok: true, eta: "14:00", scheduleAllowedFrom: "13:30", smartFlat: SmartFlatState }`
- `POST /api/smart-flat/:target/devices`
  - Body: `{ coffeeMaker?: { power: boolean }, ac?: { power: boolean, targetTemperature?: number, mode?: string } }`
  - Regra: Erro 400 se `now < ETA - 30min` sem presença confirmada; Erro 400 se `targetTemperature` fora de [18, 26].
  - Resposta: `{ ok: true, smartFlat: SmartFlatState }`
- `POST /api/smart-flat/:target/confirm-entrance`
  - Resposta: `{ ok: true, message: "Entrada confirmada com sucesso! Fail-safe desativado.", smartFlat: SmartFlatState }`
- `POST /api/smart-flat/:target/playlist`
  - Body: `{ action: "play" | "pause" | "next" | "set_volume", volume?: number }`
  - Resposta: `{ ok: true, welcomePlaylist: { isPlaying: boolean, volume: number, currentTrack: string } }`
- `POST /api/smart-flat/:target/simulate`
  - Body: `{ simulatedTime?: string, offsetMinutes?: number, forceShutoff?: boolean }`
  - Resposta: `{ ok: true, smartFlat: SmartFlatState }`

---

## Code Layout & Twin-Server Parity
- **Backend Twin Server (Paridade Estrita 100% SHA-256)**:
  - `scripts/demo-server.mjs` <---> `artifacts/api-server/demo-server.mjs` (`394fed4c9412bf29672dfd81ab153ffee564dd40f8cbf5cc1611c23592fee5b3`)
- **Frontend SPA**:
  - `artifacts/limpeza/src/App.tsx` (Adição da rota `/preview/smart-flat` e `/preview/smart-flat/:code`)
  - `artifacts/limpeza/src/pages/smart-flat-preview.tsx` (Página de Preview Sandbox)
  - `artifacts/limpeza/src/components/smart-flat/SmartFlatHub.tsx` (Componente principal do Hub)
  - `artifacts/limpeza/src/components/smart-flat/DeviceCard.tsx`
  - `artifacts/limpeza/src/components/smart-flat/ClimateControl.tsx`
  - `artifacts/limpeza/src/components/smart-flat/FailSafeStatus.tsx`
  - `artifacts/limpeza/src/components/smart-flat/WelcomeMusicPlayer.tsx`
  - `artifacts/limpeza/src/components/smart-flat/SandboxToolbar.tsx`
- **Documentação de Hardware**:
  - `docs/SMART_FLAT_HARDWARE_GUIDE.md`
- **Testes Pontuais Dedicados**:
  - `tests/smart-flat-hub.test.mjs` (6/6 passing, 100% pass)

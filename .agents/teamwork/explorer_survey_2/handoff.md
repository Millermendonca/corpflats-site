# Relatório de Handoff — Explorer Survey 2 (Backend, APIs & State Persistence)
**Data/Hora**: 2026-10-11T23:45:00Z  
**Autor**: Explorer Survey 2  
**Destinatário**: Orchestrator / Backend Implementer  
**Missão**: Investigação de arquitetura de backend, rotas de API, modelagem de estado, persistência em banco, paridade de servidores gêmeos e regras operacionais de fail-safe/agendamento para o **Smart Flat Hub**.

---

## 1. Observações (Observations)

### 1.1. Arquitetura de Banco de Dados (`data/database.json`)
- O arquivo `data/database.json` possui 971.828 bytes e 60 chaves de primeiro nível (`users`, `flats`, `reservations`, `cleaningRequests`, `settings`, etc.).
- A coleção `flats` possui 19 apartamentos ativos (ex: IDs 1 a 21, números "113", "114", "116", "211", "212", "215", "313", "408", "509", "511", "512", "605", "712", "715", "904", "905", "907", "1004", "1304") com campos `id`, `number`, `isOccupied`, `airConditionerType` ("split" vs outros), `bedType`, `tags`, etc.
- A coleção `reservations` contém reservas com os seguintes campos críticos para chegada e presença:
  - `code`: código da reserva (ex: `"RES-313-0301"`, `"RES-1004-0257"`).
  - `flatNumber`: número do apartamento (ex: `"313"`).
  - `checkinDate`: data de entrada `"YYYY-MM-DD"`.
  - `checkoutDate`: data de saída `"YYYY-MM-DD"`.
  - `checkinTime`: horário padrão de check-in (`"14:00"`).
  - `estimatedArrivalTime`: horário previsto de chegada informado pelo hóspede (ex: `"14:00"`, `"14h30"`).
  - `guestArrivalResponse`: string livre de resposta de chegada.
  - `guestArrivalResponseAt`: ISO timestamp do registro de previsão.
  - `guestSelfCheckin`: boolean (`true` quando hóspede autodeclara entrada via link/portal).
  - `guestSelfCheckinAt`: ISO timestamp da confirmação.
  - `actualCheckinAt`: ISO timestamp da entrada registrada pela recepção/portaria.
  - `status`: `"confirmada"`, `"checkin"`, `"checkout"`, `"cancelada"`.

### 1.2. Servidor Backend (`scripts/demo-server.mjs` & `artifacts/api-server/demo-server.mjs`)
- **Tamanho e Estrutura**: `demo-server.mjs` possui 33.456 linhas em ESM (`import/export`), escutando na porta 5000 (`PORT = process.env.PORT || 5000`).
- **Helpers de Data e Hora Universal**:
  - Linhas 139–146: `getEffectiveDate()` respeita `global.__simulatedTimeOffsetMs`, permitindo time-travel em testes.
  - Linhas 144–146: `getTodayStr()` formata data em `America/Sao_Paulo` (`"YYYY-MM-DD"`).
  - Linhas 177–197: `getBrasiliaNow()` retorna `{ date, hour, minute, second, timeStr: "HH:mm" }`.
- **Carregamento e Persistência do Banco**:
  - Linhas 646–713: Objeto em memória `let db = { ... }`.
  - Linhas 4131–4146: `loadDatabase()` lê `data/database.json` via `fs.promises.readFile` e executa `Object.assign(db, loaded)`, inicializando arrays ausentes.
  - Linhas 5992–6048: `saveDatabase(reason)` possui guard de debounce assíncrono (300ms para disco local via `atomicWriteFileSync` e 800ms para PostgreSQL Cloud via `system_store`).
- **Rotinas Periódicas de Background (`setInterval`)**:
  - Linha 33315: Sincronização PIX Banco Inter a cada 120s.
  - Linha 33360: Rotina Matinal das 07:00 a cada 300s.
- **Localização de Reservas**:
  - Linhas 15507–15568: `findReservationByLocatorOrContact(query)` localiza reserva por código exato, id numérico, telefone, documento, e-mail ou nome.
- **Rotas Existentes de Chegada e Check-in**:
  - Linhas 15986–16049: `POST ["/api/pms/guest-portal/:code/estimated-arrival", "/api/pms/reservations/by-code/:code/estimated-arrival"]` recebe `{ estimatedArrivalTime }` e salva em `r.estimatedArrivalTime`.
  - Linhas 16070–16113: `POST ["/api/pms/guest-portal/:code/self-checkin", "/api/pms/reservations/by-code/:code/self-checkin"]` registra entrada autodeclarada do hóspede (`r.guestSelfCheckin = true`, `r.actualCheckinAt = nowIso`, `r.status = "checkin"`).
  - Linhas 20045–20150: Check-in presencial da recepção (`POST /api/reception/checkin/:reservationId`) registra `r.actualCheckinAt = nowIso` e `r.status = "checkin"`.

### 1.3. Status de Paridade Twin-Server (`scripts/` vs `artifacts/api-server/`)
- Verificação direta via SHA-256 e `git diff --no-index`:
  - `server-monitor-service.mjs`: **100% IDÊNTICO** (`0623b71036`)
  - `storage-service.mjs`: **100% IDÊNTICO** (`c3b6dbe78a`)
  - `fnrh-pdf-service.mjs`: **100% IDÊNTICO** (`845254a841`)
  - `fnrh-serpro-service.mjs`: **100% IDÊNTICO** (`daadda6342`)
  - `demo-server.mjs`: **MISMATCH PONTUAL DE 2 LINHAS** (`aa8cbb55f9` vs `fb1cf892b6`):
    - Linha 21470: `saveDatabase("manual_otp")` em `scripts/` vs `saveDatabase()` em `artifacts/`.
    - Linha 21542: Exposição de `otpCode` em testes presente em `scripts/` e omitida em `artifacts/`.
  - Toda nova alteração deve manter paridade estrita de 100% de hash SHA-256 entre `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs`.

### 1.4. Isolamento Frontend & Proxy Vite (`artifacts/limpeza`)
- `artifacts/limpeza/vite.config.ts` (linhas 68–71): Encaminha `/api` via proxy para `http://127.0.0.1:5000`.
- `artifacts/limpeza/src/App.tsx`: Gerencia rotas com `wouter`. O portal de produção (`/minha-reserva/:code` em `guest-portal.tsx`) está completamente livre de qualquer componente domótico. A rota do hub pode ser adicionada como rota independente de preview (`/preview/smart-flat` ou `/admin/smart-flat-preview`), garantindo isolamento total de clientes reais (R1).

---

## 2. Cadeia Lógica (Logic Chain)

1. **Premissa de Isolamento e Rota Oculta (R1)**:
   - *Apoio*: R1 exige que nada esteja visível para clientes reais em produção e que o hub seja testável via rota isolada de preview/sandbox.
   - *Dedução*: A criação de um namespace de API dedicado `/api/smart-flat/*` e uma tela `/preview/smart-flat` mantém a API de produção do portal (`/api/pms/guest-portal/:code`) desacoplada, permitindo que administradores e testadores simulem qualquer apartamento (ex: `113`, `313`) ou reserva em modo sandbox.

2. **Modelagem de Estado Centralizado (`db.smartFlats`)**:
   - *Apoio*: As tomadas inteligentes, ar-condicionados e assistentes de voz pertencem ao espaço físico do flat, enquanto o agendamento e o ETA pertencem à estadia do hóspede.
   - *Dedução*: A persistência ideal no backend é um mapa `db.smartFlats` indexado pelo número do flat (`flatNumber`: `"113"`), espelhado na reserva ativa (`r.smartFlat`). Isso garante sincronização instantânea entre a governança/recepção e a experiência do hóspede.

3. **Validação Temporal da Janela de 30 Minutos (R2)**:
   - *Apoio*: R2 exige que o hóspede informe a previsão de chegada antes de programar, e que só possa ligar/programar aparelhos com antecedência máxima de 30 minutos em relação ao ETA (ex: chegada às 14:00 só permite ligar a partir das 13:30).
   - *Dedução*:
     - Se `estimatedArrivalTime` não estiver definido e a entrada não tiver sido confirmada, a tentativa de acionamento de cafeteira ou ar deve retornar erro HTTP 400 com mensagem instrutiva: *"Por favor, informe seu horário previsto de chegada para liberar a programação dos aparelhos."*
     - Seja `etaMinutes = (hour * 60 + minute)`. A janela permitida inicia em `allowedFromMinutes = etaMinutes - 30`.
     - Se `currentMinutes < allowedFromMinutes` e o hóspede ainda não entrou no flat, a ativação é bloqueada com HTTP 400: *"A programação só é permitida com até 30 minutos de antecedência da sua chegada (a partir das 13:30 para chegada às 14:00)."*
     - A temperatura do ar-condicionado é estritamente validada entre 18°C e 26°C.

4. **Ciclo Fail-Safe de Presença & Desligamento Automático por Segurança (R3)**:
   - *Apoio*: R3 estipula que caso o hóspede programe o equipamento mas não confirme a entrada:
     - Aviso Preventivo: *"Você já chegou? Não esqueça de informar sua entrada aqui."*
     - Desligamento Automático: Após 30 minutos do ETA sem confirmação de entrada, cafeteira e ar são desligados com o status: *"Equipamento desligado automaticamente por questão de segurança e economia de energia."*
   - *Dedução*:
     - Confirmação de presença ocorre se `r.guestSelfCheckin === true`, `r.actualCheckinAt != null`, `r.status === "checkin"` ou via acionamento direto do botão "Confirmar Entrada no Flat" no Smart Flat Hub.
     - Se aparelhos estiverem ligados e `isEntranceConfirmed === false`:
       - Fase 1 (Aviso Preventivo): Quando `currentMinutes >= etaMinutes && currentMinutes < etaMinutes + 30`, o estado ativa `warningActive = true` com a mensagem preventiva oficial.
       - Fase 2 (Desligamento por Segurança): Quando `currentMinutes >= etaMinutes + 30`, o motor desliga cafeteira e ar, registrando `shutoffTriggered = true`, `shutoffReason = "Equipamento desligado automaticamente por questão de segurança e economia de energia."` e gerando notificação para o painel.
     - Se o hóspede confirmar entrada a qualquer momento, o fail-safe é desarmado e os aparelhos permanecem ligados.

5. **Trilha Sonora de Boas-Vindas Automática (R4)**:
   - *Apoio*: R4 requer que no dia do check-in a partir do horário oficial (14:00), a música ambiente toque automaticamente em flats com entrada prevista, independente de agendamento de outros aparelhos.
   - *Dedução*:
     - Condição: `checkinDate === todayStr` e `currentMinutes >= 840` (14:00).
     - Quando atingido, `welcomePlaylist.isPlaying = true` e `welcomePlaylist.autoTriggered = true` são ativados automaticamente.
     - O hub oferece controles para play/pause, volume e troca de faixa de áudio (Bossa Nova, Jazz Lounge, etc.).

6. **Motor Híbrido de Avaliação (Passivo Instantâneo + Ativo Periódico)**:
   - *Apoio*: O servidor Node.js precisa ser responsivo, sem sobrecarregar o loop de eventos, e deve permitir testes determinísticos com time-travel (`/api/test/time-travel`).
   - *Dedução*: A função `evaluateSmartFlatState(flatState, reservation, brasiliaNow)` deve ser executada:
     a) **Passivamente a cada requisição** `GET/POST /api/smart-flat/*` (garante resposta imediata em tempo de execução sem atraso de timers);
     b) **Ativamente em background** a cada 60 segundos via `setInterval` em `demo-server.mjs` (garante que flats sem requisições abertas também desliguem sozinhos no horário correto).

---

## 3. Ressalvas e Limitações (Caveats)

1. **Equipamentos Físicos em Aquisição**: O projeto prevê a compra futura de hardware (tomadas Tuya 16A, Smart IR Blasters, Echo Pop). Neste estágio, o backend atua como um Digital Twin (Gêmeo Digital / Simulador Domótico de Alta Fidelidade) persistindo o estado real no banco e emitindo payloads preparados para integração IoT (MQTT/Tuya Cloud/Webhooks).
2. **Formatação de ETA Informado por Texto Livre**: Alguns hóspedes informam previsões em texto livre (ex: "chegando ao meio dia" ou "14h30"). O parser deve aceitar com tolerância formatos "HH:mm", "HHhMM", "HHh" e expressões comuns, caindo para o horário padrão de check-in (14:00) se o texto for ininteligível.
3. **Múltiplas Fontes de Check-in**: A entrada do hóspede pode ser confirmada por três canais distintos: o botão do Smart Flat Hub, o link de Check-in Digital autodeclarado ou a recepção física na portaria. O motor backend deve reconhecer qualquer um dos três como confirmação válida de entrada.

---

## 4. Conclusão e Especificação Técnica (Conclusion)

### 4.1. Estrutura de Dados do Smart Flat (`SmartFlatState`)

```typescript
interface SmartFlatState {
  flatNumber: string;               // Ex: "113", "313"
  reservationCode: string | null;   // Ex: "RES-313-0301"
  devices: {
    coffeeMaker: {
      power: boolean;               // true = ligada, false = desligada
      scheduled: boolean;
      scheduledTime: string | null; // "HH:mm"
      turnedOnAt: string | null;    // ISO timestamp
    };
    ac: {
      power: boolean;
      mode: "cool" | "fan" | "heat" | "dry"; // padrão: "cool"
      targetTemperature: number;    // Entre 18 e 26 °C
      fanSpeed: "auto" | "low" | "mid" | "high";
      scheduled: boolean;
      scheduledTime: string | null;
      turnedOnAt: string | null;
    };
    welcomePlaylist: {
      enabled: boolean;
      isPlaying: boolean;
      volume: number;               // 0 a 100 (padrão: 35)
      currentTrack: string;
      playlist: string;
      autoTriggered: boolean;
      autoTriggeredAt: string | null;
    };
  };
  presence: {
    eta: string | null;             // "HH:mm"
    etaConfirmedAt: string | null;
    isEntranceConfirmed: boolean;
    enteredAt: string | null;
    confirmationSource: "smart_flat_hub" | "guest_portal" | "reception" | null;
  };
  failSafe: {
    warningActive: boolean;
    warningMessage: string | null;  // "Você já chegou? Não esqueça de informar sua entrada aqui."
    warningSentAt: string | null;
    shutoffTriggered: boolean;
    shutoffTriggeredAt: string | null;
    shutoffReason: string | null;   // "Equipamento desligado automaticamente por questão de segurança e economia de energia."
  };
  timeContext: {
    currentTime: string;            // "HH:mm"
    canSchedule: boolean;
    scheduleAllowedFrom: string | null; // "HH:mm" (ETA - 30min)
    scheduleBlockReason: string | null;
    isCheckinToday: boolean;
    isOfficialCheckinReached: boolean;
  };
  updatedAt: string;
}
```

### 4.2. Rotas de API Especificadas para `demo-server.mjs`

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/smart-flat/:target` | Retorna o estado completo domótico do apartamento ou reserva, executando a avaliação em tempo real. Suporta `?preview=true` e `?flat=113`. |
| `POST` | `/api/smart-flat/:target/eta` | Atualiza o ETA (`{ estimatedArrivalTime: "14:00" }`), calcula a nova janela de antecedência (`13:30`) e atualiza a reserva. |
| `POST` | `/api/smart-flat/:target/devices` | Aciona ou agenda cafeteira e ar-condicionado. Valida estritamente a janela de até 30min antes do ETA e a temperatura entre 18°C e 26°C. |
| `POST` | `/api/smart-flat/:target/confirm-entrance` | Confirma a presença física do hóspede no apartamento, cancela alertas e desarma o timer de desligamento por segurança. |
| `POST` | `/api/smart-flat/:target/playlist` | Controla reprodução de música de boas-vindas (`{ action: "play" \| "pause" \| "next" \| "set_volume", volume: 30 }`). |
| `POST` | `/api/smart-flat/:target/simulate` | Endpoint auxiliar para sandbox e testes automatizados (`{ offsetMinutes: 30 }` ou acionamento instantâneo de eventos de fail-safe/música). |

### 4.3. Algoritmo de Validação da Janela de 30 Minutos (R2)

```javascript
function checkAntecedenceWindow(etaStr, currentMinutes) {
  if (!etaStr) {
    return {
      allowed: false,
      reason: "Informe seu horário previsto de chegada para liberar a programação dos aparelhos."
    };
  }
  const etaMinutes = parseTimeToMinutes(etaStr);
  if (etaMinutes === null) {
    return { allowed: false, reason: "Horário previsto de chegada inválido." };
  }
  const allowedFromMinutes = (etaMinutes - 30 + 1440) % 1440;
  
  // Se ainda falta mais de 30 minutos para o ETA
  if (currentMinutes < allowedFromMinutes) {
    const fromStr = minutesToTimeStr(allowedFromMinutes);
    return {
      allowed: false,
      allowedFrom: fromStr,
      reason: `A programação só pode ser realizada com até 30 minutos de antecedência da sua chegada (a partir das ${fromStr} para chegada às ${etaStr}).`
    };
  }
  return { allowed: true, allowedFrom: minutesToTimeStr(allowedFromMinutes) };
}
```

### 4.4. Algoritmo do Ciclo Fail-Safe (R3)

```javascript
function evaluateFailSafe(smartFlat, etaMinutes, currentMinutes, isEntered) {
  const devicesOn = smartFlat.devices.coffeeMaker.power || smartFlat.devices.ac.power;
  if (!devicesOn || isEntered) {
    smartFlat.failSafe.warningActive = false;
    return;
  }
  
  const shutoffMinutes = (etaMinutes + 30) % 1440;
  
  // Fase 1: Aviso Preventivo (ETA <= agora < ETA + 30min)
  if (currentMinutes >= etaMinutes && currentMinutes < shutoffMinutes) {
    smartFlat.failSafe.warningActive = true;
    smartFlat.failSafe.warningMessage = "Você já chegou? Não esqueça de informar sua entrada aqui.";
  }
  
  // Fase 2: Desligamento por Segurança (agora >= ETA + 30min)
  if (currentMinutes >= shutoffMinutes) {
    smartFlat.devices.coffeeMaker.power = false;
    smartFlat.devices.ac.power = false;
    smartFlat.failSafe.warningActive = false;
    smartFlat.failSafe.shutoffTriggered = true;
    smartFlat.failSafe.shutoffTriggeredAt = new Date().toISOString();
    smartFlat.failSafe.shutoffReason = "Equipamento desligado automaticamente por questão de segurança e economia de energia.";
  }
}
```

### 4.5. Algoritmo da Playlist Automática de Boas-Vindas (R4)

```javascript
function evaluateWelcomeMusic(smartFlat, checkinDate, todayStr, currentMinutes, officialCheckinMinutes = 840) {
  // Apenas no dia do check-in a partir das 14:00 (840 min)
  if (checkinDate === todayStr && currentMinutes >= officialCheckinMinutes) {
    if (!smartFlat.devices.welcomePlaylist.autoTriggered) {
      smartFlat.devices.welcomePlaylist.isPlaying = true;
      smartFlat.devices.welcomePlaylist.autoTriggered = true;
      smartFlat.devices.welcomePlaylist.autoTriggeredAt = new Date().toISOString();
    }
  }
}
```

---

## 5. Método de Verificação Independente (Verification Method)

### 5.1. Teste Unitário Pontual Dedicado (`tests/smart-flat-hub.test.mjs`)
Criar o arquivo de teste pontual utilizando o runner nativo do Node.js (`node:test` e `node:assert/strict`) cobrindo:
1. Rejeição de programação quando o ETA não foi informado.
2. Bloqueio de acionamento quando a antecedência for maior que 30 minutos (ex: 13:00 para ETA 14:00).
3. Liberação de acionamento quando a antecedência for de até 30 minutos (ex: 13:35 para ETA 14:00).
4. Validação de faixa de temperatura do ar (18°C a 26°C aceitos; <18°C ou >26°C rejeitados).
5. Disparo do aviso preventivo *"Você já chegou?"* quando o horário alcança o ETA sem entrada confirmada.
6. Desligamento automático fail-safe com mensagem oficial de segurança quando transcorrem 30 minutos pós-ETA sem entrada confirmada.
7. Cancelamento imediato do fail-safe após confirmação de entrada.
8. Ativação automática da trilha sonora de boas-vindas no dia do check-in a partir das 14:00.

**Comando de execução estritamente pontual (conforme `AGENTS.md`)**:
```bash
node --test tests/smart-flat-hub.test.mjs
```

### 5.2. Verificação de Paridade de Hash SHA-256 (Twin-Server Mandate)
Executar o comando PowerShell para assegurar paridade estrita entre os arquivos gêmeos:
```powershell
powershell -Command "
  `$h1 = (Get-FileHash scripts/demo-server.mjs).Hash;
  `$h2 = (Get-FileHash artifacts/api-server/demo-server.mjs).Hash;
  Write-Host 'scripts/demo-server.mjs:          ' `$h1;
  Write-Host 'artifacts/api-server/demo-server.mjs:' `$h2;
  Write-Host 'Twin-Server Parity Check:         ' (`$h1 -eq `$h2);
  if (`$h1 -ne `$h2) { exit 1 } else { exit 0 }
"
```

### 5.3. Verificação de Compilação Frontend (`npm run build`)
Executar o build de verificação na pasta do frontend:
```bash
npm --prefix artifacts/limpeza run build
```
Critério de sucesso: código de saída 0 e geração dos artefatos em `artifacts/limpeza/dist/public/assets/`.

### 5.4. Condições de Invalidação
Este relatório será invalidado se:
- Qualquer alteração backend for aplicada em apenas uma das pastas gêmeas sem replicar o hash SHA-256 exato.
- A programação de ar/café for permitida com mais de 30 minutos de antecedência do ETA informado.
- O desligamento fail-safe deixar aparelhos ligados após 30 minutos do ETA sem presença confirmada.
- O portal público de hóspedes em produção (`guest-portal.tsx`) expor componentes de controle domótico para clientes reais antes da aquisição física do hardware.

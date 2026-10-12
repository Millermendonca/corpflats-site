# Relatório de Handoff — Worker Backend & IoT Hardware (M2 & M4)

**Agente**: Worker Backend & IoT Hardware (`worker_backend_iot_1`)  
**Parent**: Orchestrator (Conversation ID: `26335f75-5ae5-4381-97dc-4cdaaa103cfd`)  
**Data/Hora**: 2026-10-12T00:05:00Z  
**Tipo**: Hard Handoff (Milestones M2 e M4 100% Concluídos)  
**Diretório de Trabalho**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_backend_iot_1`

---

## 1. Observações (Observation)

1. **Guia de Hardware IoT (`docs/SMART_FLAT_HARDWARE_GUIDE.md`)**:
   - Criado documento de engenharia de 332 linhas cobrindo a frota completa de 19 flats (113 a 1304) no Edifício Soho Residence Service (Campos dos Goytacazes - RJ).
   - Especificação de tomadas inteligentes Wi-Fi padrão NBR 14136 16A com proteção térmica (>75°C) e sobrecorrente (>16,5A), com cálculo elétrico demonstrando que cafeteiras de 1.200W a 1.500W em 127V operam a 11,81A (sobrecarga perigosa de 118% em tomadas de 10A).
   - Especificação de Smart IR Blasters 38kHz com sensor integrado de temperatura e umidade (TH) para malha fechada de feedback com splits (Springer Midea, Consul, Elgin, Gree, LG).
   - Especificação de Smart Speakers (Amazon Echo Pop e Echo Dot 5ª Geração com Relógio) com diretrizes de privacidade hoteleira (botão físico mudo com anel vermelho, desativação de compras e histórico).
   - Interruptores touch 4x2 de vidro temperado híbridos (com e sem neutro com capacitor de bypass).
   - Projeto de rede com VLAN 30 dedicada (`CorpFlats-IoT`, 2.4 GHz, canais 1/6/11 a 20MHz, WPA2-PSK AES e AP Isolation habilitado).
   - Configuração de recuperação de energia pós-blecaute com `Power-On State: OFF` e temporizador local em hardware Tuya (`countdown: 1800` / inching).
   - Orçamento (BOM) total estimado para 19 flats: **R$ 9.971,00** (cenário Echo Pop) ou **R$ 12.821,00** (cenário Echo Dot com relógio).

2. **Backend Engine em `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs`**:
   - Inicialização em memória e banco de `db.smartFlats` e mapeamento dual em `reservation.smartFlat`.
   - Implementação de 6 endpoints sob `/api/smart-flat/*`:
     * `GET /api/smart-flat/:target`: Retorna estado domótico com avaliação em tempo real.
     * `POST /api/smart-flat/:target/eta`: Atualiza previsão de chegada, calcula `scheduleAllowedFrom` (ETA - 30min) e sincroniza na reserva.
     * `POST /api/smart-flat/:target/devices`: Aciona ou programa cafeteira e ar-condicionado. Valida janela de antecedência de 30min e temperatura entre 18°C e 26°C.
     * `POST /api/smart-flat/:target/confirm-entrance`: Confirma entrada física do hóspede, desarma alertas e cancela temporizador de fail-safe.
     * `POST /api/smart-flat/:target/playlist`: Controles de reprodução da trilha de boas-vindas (`play`, `pause`, `toggle`, `next`, `prev`, `set_volume`).
     * `POST /api/smart-flat/:target/simulate`: Utilitário de sandbox para simulação de time-travel (`offsetMinutes`, `simulatedTime`), desligamento forçado (`forceShutoff`), alerta preventivo e ativação de áudio.
   - Rotina periódica em background (`setInterval` a cada 60s) inspecionando e avaliando desligamento automático por segurança e ativação de playlist.

3. **Validação da Janela de Antecedência de 30 Minutos (R2)**:
   - Aparelhos bloqueados para ligar se antecedência for superior a 30 minutos em relação ao ETA informado (ex: chegada às 14:00 bloqueia ativação às 13:00 e libera a partir das 13:30).
   - Mensagem oficial de bloqueio: *"A programação só é permitida com até 30 minutos de antecedência da sua chegada (a partir das {scheduleAllowedFrom} para chegada às {eta})."*
   - Entrada confirmada libera acionamento a qualquer momento.

4. **Ciclo de Vida Fail-Safe de Presença (R3)**:
   - Se aparelhos ligados e entrada não confirmada:
     * Fase 1 (Alerta Preventivo): No intervalo $[\text{ETA}, \text{ETA} + 30\text{min}[$, ativa aviso: *"Você já chegou? Não esqueça de informar sua entrada aqui."*
     * Fase 2 (Desligamento por Segurança): Em $t \ge \text{ETA} + 30\text{min}$, desliga cafeteira e ar-condicionado com a razão oficial: *"Equipamento desligado automaticamente por questão de segurança e economia de energia."*
     * Desarme: Entrada confirmada via hub, portal do hóspede ou recepção desarma o fail-safe.

5. **Trilha Sonora de Boas-Vindas Automática (R4)**:
   - No dia do check-in a partir do horário oficial (14:00 / `db.settings.checkinTime`), ativa automaticamente `welcomePlaylist.isPlaying = true` e `autoTriggered = true`.

6. **Paridade Rigorosa Twin-Server (SHA-256)**:
   - Hash verificado via PowerShell:
     * `scripts/demo-server.mjs`: `394FED4C9412BF29672DFD81AB153FFEE564DD40F8CBF5CC1611C23592FEE5B3`
     * `artifacts/api-server/demo-server.mjs`: `394FED4C9412BF29672DFD81AB153FFEE564DD40F8CBF5CC1611C23592FEE5B3`
     * Resultado: **100% IDÊNTICO (True)**

7. **Execução de Testes Pontuais Dedicados**:
   - `node --test tests/smart-flat-hub.test.mjs`: 6 testes executados, 6 aprovados, 0 falhas, 0 cancelados (100% pass).

---

## 2. Cadeia Lógica (Logic Chain)

1. **Resolução de Contexto do Smart Flat**:
   - Observou-se que `findReservationByLocatorOrContact` busca por ID numérico de reserva. Para evitar que requisições por número de flat (ex: `/api/smart-flat/113`) colidissem com reservas cujo ID de banco é 113, priorizou-se a checagem de flats existentes em `DEFAULT_FLATS` e `db.flats`. Se o alvo for um flat válido, `flatNumber` é atribuído diretamente e vinculado à reserva ativa de hoje.
2. **Cálculo Consistente de `scheduleAllowedFrom`**:
   - Para garantir que a interface de preview e os testes sempre disponham do horário em que a programação é permitida (ex: 14:30 para ETA 15:00), `scheduleAllowedFrom` é calculado diretamente de `etaMinutes - 30` sempre que o ETA estiver definido.
3. **Desarme por Confirmação de Entrada**:
   - Quando o hóspede confirma entrada (`isEntranceConfirmed === true`), a presença física está garantida no quarto; portanto, o risco térmico de cafeteira desacompanhada é nulo e os aparelhos permanecem ligados.
4. **Resiliência a Queda de Internet com Temporizadores de Hardware**:
   - As especificações em `docs/SMART_FLAT_HARDWARE_GUIDE.md` estabelecem o parâmetro Tuya `countdown: 1800` (inching em memória flash do relé) para assegurar o corte físico em 30 minutos mesmo que haja desconexão da rede Wi-Fi.

---

## 3. Ressalvas e Limitações (Caveats)

- **Hardware Físico Futuro**: Os equipamentos físicos (tomadas 16A, IR blasters, Echo Pop) ainda serão adquiridos com base no guia. O backend opera como um Gêmeo Digital (Digital Twin) de alta fidelidade e emite payloads preparados para integração direta com a Tuya Cloud API e MQTT.
- **Isolamento de Produção (R1)**: As rotas estão sob o namespace `/api/smart-flat/*`. O portal de produção (`guest-portal.tsx`) permanece sem qualquer card ou botão visível para clientes reais.

---

## 4. Conclusão (Conclusion)

Os marcos **M2 (Backend Engine & Fail-Safe APIs)** e **M4 (IoT Hardware & Acquisition Guide)** foram integralmente concluídos com rigor técnico:
- Guia de hardware e compras publicado em `docs/SMART_FLAT_HARDWARE_GUIDE.md`.
- Endpoints e ciclo de vida fail-safe implementados em `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs`.
- 100% de paridade SHA-256 atestada entre os servidores gêmeos.
- 100% de sucesso nos testes pontuais dedicados (`tests/smart-flat-hub.test.mjs`).

---

## 5. Método de Verificação Independente (Verification Method)

### 5.1. Execução do Teste Pontual Dedicado
Executar no terminal (conforme estrita regra do `AGENTS.md`):
```bash
node --test tests/smart-flat-hub.test.mjs
```
*Critério de aprovação*: 6 subtestes passando (`# pass 6`, `# fail 0`).

### 5.2. Verificação de Paridade SHA-256 Twin-Server
Executar via PowerShell:
```powershell
powershell -Command "
  `$h1 = (Get-FileHash scripts/demo-server.mjs).Hash;
  `$h2 = (Get-FileHash artifacts/api-server/demo-server.mjs).Hash;
  Write-Host 'scripts:   ' `$h1;
  Write-Host 'artifacts: ' `$h2;
  Write-Host 'Parity:    ' (`$h1 -eq `$h2);
  if (`$h1 -ne `$h2) { exit 1 } else { exit 0 }
"
```
*Critério de aprovação*: `Parity: True` (códigos de hash idênticos).

### 5.3. Inspeção do Guia de Hardware
Inspecionar o arquivo:
```bash
view_file AbsolutePath="c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/docs/SMART_FLAT_HARDWARE_GUIDE.md"
```
*Critério de aprovação*: 8 seções completas, especificações NBR 14136 16A, IR Blaster TH, Echo Pop, VLAN 2.4GHz e planilha orçamentária para 19 flats.

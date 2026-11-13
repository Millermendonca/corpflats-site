# Handoff Report: Codebase Architecture & Integration Touchpoints

**Agent**: Codebase Architecture Explorer  
**Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_codebase`  
**Recipient**: Orchestrator (`84d9f696-67d5-4529-bec4-c0232e9abea0`)  
**Status**: Hard Handoff (Investigation Complete)  

---

## 1. Observation

### 1.1 Twin Files & Parity
- **Hash SHA-256 verificado via Node.js crypto**:
  - `artifacts/api-server/demo-server.mjs`: `83980bf73f29e2f68497ac31f7e5dfca4a7183be8e4ddd1397fd1392e895337a`
  - `scripts/demo-server.mjs`: `83980bf73f29e2f68497ac31f7e5dfca4a7183be8e4ddd1397fd1392e895337a`
  - Ambos os arquivos são byte a byte idênticos.
- **Serviços duplicados**:
  - `fnrh-pdf-service.mjs`, `fnrh-serpro-service.mjs`, `maid-automation-service.mjs`, `server-monitor-service.mjs`, `storage-service.mjs`, `whatsapp-ai-service.mjs`, `zapi-service.mjs` possuem hashes SHA-256 idênticos entre `artifacts/api-server/` e `scripts/`.
  - **Exceção observada**: `artifacts/api-server/mail-service.mjs` (hash `3f17611b`) diverge de `scripts/mail-service.mjs` (hash `94717423`) nas linhas 939-940 nos fallbacks padrão de rede e senha Wi-Fi (`"CorpFlats" / "corpflats2026"` vs `"apto {quarto}" / "1234567890123"`).

### 1.2 Persistência e Poda
- **Arquivo**: `artifacts/api-server/demo-server.mjs`
  - Linhas 4209-4264: Boot do PostgreSQL cria tabelas `system_store`, `system_store_backups`, `system_audit_logs`, `reservation_communications`, `fnrh_internal_audit_logs`.
  - Linhas 5740-5793: `flushPgState()` grava em `system_store` com `key='db_state'`. Mantém até 25 backups mais recentes em `system_store_backups` com `DELETE FROM system_store_backups WHERE id < cutoffId`.
  - Linhas 5796-5854: `pruneDatabase()` limita coleções: `whatsappHistory` (500), `whatsappConversations` (200), `breakfastOrders` (500), `cleaningRequests` (>1500 corta >120 dias), `reservations` (>800 corta checkout >180 dias exceto ativas).
  - Linhas 6053-6112: `saveDatabase()` aplica debounce de 300 ms em disco local e 800 ms em PostgreSQL.

### 1.3 Limites de Memória e Hospedagem
- **Arquivo**: `render.yaml`
  - Linha 5: `plan: free`
  - Linha 7: `startCommand: node --max-old-space-size=380 --unhandled-rejections=warn server.mjs`
- **Arquivo**: `package.json`
  - Linha 9: `"start": "node --max-old-space-size=384 server.mjs"`
- **Arquivo**: `server.mjs`
  - Linhas 24-37: Respawna processo com `--max-old-space-size=384` se `heap_size_limit > 450 MB` e `NODE_ENV !== "test"`.

### 1.4 Ciclo de Vida da Reserva e Automações
- **Arquivo**: `artifacts/api-server/demo-server.mjs`
  - Linhas 13669-14280: Rota `POST /api/pms/reservations`.
  - Linhas 13745-13751 e 13774-13779: Reservas com canal `booking` ou `airbnb` forçam `paymentStatus = "pago_total"` e `paidAmount = totalAmount`.
  - Linhas 13122-13222: Função `calculateFairShareStats()` seleciona o quarto da vez ordenando por: (1) menor ocupação no mês (`monthOccupiedDays`), (2) maior tempo ocioso (`daysSinceLastCheckout`), (3) número do flat.
  - Linhas 14128-14280: Gatilhos automáticos incluem: sincronização de governança (`cleaningRequests`), FNRH SERPRO (`fnrhSerproService.registerReservation`), PIX para `pre_reserva` (`createInterPixCob`), WhatsApp (`triggerImmediateWhatsApp`) e e-mails de recepção/garagem para chegadas no mesmo dia (`isReservationForToday`).

### 1.5 Implementações Divergentes de Disponibilidade
- `GET /api/reservations/availability` (linhas 12258-12320): Checa reservas e holds de alteração. Não checa `roomBlocks` nem ordens de serviço.
- `POST /api/reservations/direct-booking` (linhas 12593-12624): Lógica inline de ocupação. Não checa `roomBlocks` nem ordens de serviço.
- `calculateFairShareStats` (linhas 13122-13222): Checa reservas e `roomBlocks`. Não checa holds nem ordens de serviço.
- `hasReservationConflict` (linhas 16974-17063): Checa reservas, holds e `roomBlocks`. Não checa ordens de serviço de manutenção.

### 1.6 Tarifas e Precificação
- **Arquivo**: `artifacts/api-server/demo-server.mjs`
  - Linhas 23415-23447: `db.tariffSettings` define `mode: "auto"`, `baseDailyRate: 237`, `weekendMarkupPct: 0.15`, `channelMarkups` (`direct`: 0%, `booking`: 18%, `airbnb`: 15%), `minNights: 1` (ignorado).
  - Linhas 23471-23501: `calculateSebraeSustainableRate()` calcula custo fixo + variável dividido por `(1 - comissão - margem)`. Não contempla imposto Simples/ISS (6%) nem planos com/sem café.

### 1.7 Cartões de Crédito e Autenticação
- Não existe armazenamento de cartão de crédito no código atual.
- `getAuthUser(req)` (linhas 6520-6533): Decodifica token base64 sem assinatura.
- `verifyPassword(password, storedHash)` (linhas 630-638): Utiliza `crypto.scryptSync(password, salt, 32)` no formato `salt:key`.

### 1.8 Padrão de Testes
- **Arquivo**: `tests/tariff-engine.test.mjs`
  - Execução: `node --test tests/tariff-engine.test.mjs`.
  - Spawna servidor isolado em porta dedicada (3995) com `DATA_FILE: isolatedDbPath`, `DATABASE_FILE: isolatedDbPath`, `NODE_ENV: "test"`, sem `DATABASE_URL`.
- **Sandbox em `e2e/sandbox/`**:
  - `mock-zapi.mjs`: Mock HTTP do WhatsApp (porta 5056).
  - `mock-smtp.mjs`: Interceptador SMTP TCP nativo (porta 5025).
  - `time-travel.mjs`: Simulação de avanço de tempo (`/api/test/time-travel`).
  - `db-seeder.mjs`: Seeder isolado dos 19 flats.

### 1.9 Git Status
- Branch ativa: `main` (sincronizada com `origin/main`).
- `feature/wbp-integration` precisa ser criada a partir de `main`.

---

## 2. Logic Chain

1. **Paridade de Arquivos Gêmeos**: Como `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` são a espinha dorsal do projeto com hash SHA-256 idêntico, qualquer módulo ou rota adicionada ao servidor deve ser mantida em ambos os arquivos em perfeita sincronia para garantir o deploy contínuo em produção.
2. **Proteção de Payloads e Idempotência contra Poda**: Como a função `pruneDatabase()` roda a cada gravação de estado podando ativamente coleções do blob `db` (inclusive reservas antigas e filas), colocar payloads da WBP dentro do blob `db` causaria inflação de memória e risco de perda de auditoria. A persistência dos payloads brutos e das chaves de idempotência deve ser feita em tabela relacional independente no PostgreSQL (`wbp_raw_payloads` e `wbp_idempotency`) ou em arquivo JSONL isolado em testes/disco local.
3. **Ajuste de Memória**: O container do Render possui ~2 GB no plano contratado, mas o processo Node.js está artificialmente estrangulado em 384 MB por comandos legados do Free Tier em `render.yaml`, `package.json` e `server.mjs`. Ajustar para `--max-old-space-size=1536` libera capacidade para a integração com margem segura de 512 MB contra OOM.
4. **Isolamento por Modos de Operação**: Como o hotel está em operação viva, nos modos `off` e `observe` o sistema não pode alterar o estado do PMS nem disparar automações externas. No modo `auto`, o PMS aloca o quarto pelo motor Fair-Share e processa a reserva, mas **deve suprimir terminantemente o PIX**, pois reservas OTA já possuem modelo próprio de liquidação (`Channel` ou `Property`).
5. **Cálculo Canônico de Disponibilidade**: As quatro implementações divergentes causam inconsistências entre telas de reserva, direct-booking e bloqueios. Para que o ARI da WBP reflita com precisão o estoque dos 19 flats, é necessário unificar o cálculo em uma função canônica que pondere reservas, roomBlocks, holds não expirados e ordens de serviço que bloqueiam a UH.
6. **Segurança de Cartões**: Para receber cartões da Booking/Airbnb sem risco de vazamento, os dados devem ser criptografados em AES-256-GCM com chave em `process.env.CREDIT_CARD_ENCRYPTION_KEY`, com o CVV sempre descartado antes do armazenamento. A visualização deve ser restrita a administradores que redigitem sua senha (verificada via `verifyPassword`), gerando token de 5 minutos, com exclusão automática após 7 dias do check-out ou no cancelamento.

---

## 3. Caveats

1. **Arquivo `mail-service.mjs`**: Foi detectada uma divergência pré-existente entre `artifacts/api-server/mail-service.mjs` e `scripts/mail-service.mjs` na `main`. Essa divergência deve ser documentada e resolvida ou mantida sob atenção para não mascarar novas paridades.
2. **Ambiente sem Credenciais WBP**: Nenhuma chamada real à API da WebBookingPro foi feita neste diagnóstico (conforme os requisitos, o hotel ainda não possui credenciais ativas, dependendo 100% do simulador que será construído).
3. **Branch Git**: O repositório atualmente encontra-se na branch `main`. A ramificação `feature/wbp-integration` deve ser criada antes do início da implementação dos módulos.

---

## 4. Conclusion

A base de código do Guest-Flow-Manager está minuciosamente mapeada. Seus modelos de persistência, alocação, automação e restrições estão claros e documentados. Os pontos de intervenção para a integração da WebBookingPro e motor SEBRAE estão definidos e prontos para embasar o plano executivo do orquestrador.

---

## 5. Verification Method

Para conferir independentemente as descobertas deste relatório:

1. **Paridade SHA-256 dos arquivos gêmeos**:
   ```bash
   node -e "const fs=require('fs'),c=require('crypto'); ['artifacts/api-server/demo-server.mjs','scripts/demo-server.mjs'].forEach(p => console.log(p + ': ' + c.createHash('sha256').update(fs.readFileSync(p)).digest('hex')));"
   ```
2. **Execução do teste de referência do motor de tarifas**:
   ```bash
   node --test tests/tariff-engine.test.mjs
   ```
3. **Verificação dos limites de memória**:
   - Inspecionar linha 7 de `render.yaml` (`startCommand`)
   - Inspecionar linha 9 de `package.json` (`scripts.start`)
   - Inspecionar linhas 24-28 de `server.mjs`
4. **Verificação da poda do banco**:
   - Inspecionar linhas 5796-5854 de `artifacts/api-server/demo-server.mjs` (`pruneDatabase`)
5. **Verificação do motor de alocação de quartos**:
   - Inspecionar linhas 13122-13222 de `artifacts/api-server/demo-server.mjs` (`calculateFairShareStats`)

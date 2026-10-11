# Relatório de Verificação Adversarial — Challenger 1 (Milestone M4)
**Autor**: Challenger 1 (End-to-End Guest Journey & Master Switch Challenger)  
**Data**: 2026-10-11  
**Veredicto**: **APPROVE**

---

## 1. Observation

Durante a execução da auditoria adversarial empírica sobre o Milestone M4, as seguintes observações diretas foram registradas:

### 1.1 Execução da Bateria de Testes Adversariais Ponta-a-Ponta
Criamos o harness de estresse empírico em `tests/challenger-m4-journey.test.mjs` com 11 probes cobrindo toda a jornada do hóspede e o comportamento do Kill Switch. O comando executado foi:
`node --test tests/challenger-m4-journey.test.mjs`

Resultado:
```tap
TAP version 13
# Subtest: Challenger M4: End-to-End Guest Journey & Kill Switch Stress Harness
    # Subtest: Probe 1.1: Availability with multi-guest constraints and capacity boundaries
    ok 1 - Probe 1.1: Availability with multi-guest constraints and capacity boundaries
    # Subtest: Probe 1.2: Quote calculation with SEBRAE base rate, weekend markup, channel and additionals
    ok 2 - Probe 1.2: Quote calculation with SEBRAE base rate, weekend markup, channel and additionals
    # Subtest: Probe 1.3: Pre-reservation creates temporary hold, generates locator and enforces conflict lock
    ok 3 - Probe 1.3: Pre-reservation creates temporary hold, generates locator and enforces conflict lock
    # Subtest: Probe 1.4: PIX payload complies with Bacen BR Code EMV standard, valid CRC16 and valid PNG QR Code
    ok 4 - Probe 1.4: PIX payload complies with Bacen BR Code EMV standard, valid CRC16 and valid PNG QR Code
    # Subtest: Probe 1.5: Commit transitions pre-reservation to confirmed PMS state and permanently locks calendar
    ok 5 - Probe 1.5: Commit transitions pre-reservation to confirmed PMS state and permanently locks calendar
    # Subtest: Probe 2.1: Master Kill Switch OFF disables all actions with HTTP 403 ACTION_DISABLED and courteous handover
    ok 6 - Probe 2.1: Master Kill Switch OFF disables all actions with HTTP 403 ACTION_DISABLED and courteous handover
    # Subtest: Probe 2.2: Granular action switch matrix enforces selective 403 without disabling other actions
    ok 7 - Probe 2.2: Granular action switch matrix enforces selective 403 without disabling other actions
    # Subtest: Probe 1.6: Expired pre-reservation rejects commit with 400 PRE_RESERVATION_EXPIRED and unblocks calendar
    ok 8 - Probe 1.6: Expired pre-reservation rejects commit with 400 PRE_RESERVATION_EXPIRED and unblocks calendar
    # Subtest: Probe 1.7: Adversarial edge cases on payment, maintenance room block, and cancelled commit
    ok 9 - Probe 1.7: Adversarial edge cases on payment, maintenance room block, and cancelled commit
    # Subtest: Probe 2.3: In-process WhatsApp AI service integration with Kill Switch
    ok 10 - Probe 2.3: In-process WhatsApp AI service integration with Kill Switch
    # Subtest: Probe 2.4: Rapid hot toggle stress testing of master kill switch without server restart
    ok 11 - Probe 2.4: Rapid hot toggle stress testing of master kill switch without server restart
    1..11
ok 1 - Challenger M4: End-to-End Guest Journey & Kill Switch Stress Harness
  ---
  duration_ms: 5062.4376
  ...
1..1
# tests 11
# suites 1
# pass 11
# fail 0
```

### 1.2 Execução das Baterias Regulares do Sistema
- `node --test tests/bot-actions-api.test.mjs tests/tariff-engine.test.mjs tests/whatsapp-ai-agent.test.mjs`:
  - `bot-actions-api.test.mjs`: 5 testes aprovados (100%).
  - `tariff-engine.test.mjs`: 8 testes aprovados (100%).
  - `whatsapp-ai-agent.test.mjs`: 24 testes aprovados (100%).
  - Total consolidado: 37 testes regulares + 11 testes adversariais = 48 testes automatizados aprovados (0 falhas).

### 1.3 Paridade Espelhada Twin-Server Mandate (SHA-256)
Executamos script de verificação criptográfica dos arquivos em `artifacts/api-server/` vs `scripts/`:
- `demo-server.mjs`: MATCH (SHA-256 idêntico)
- `zapi-service.mjs`: MATCH (SHA-256 idêntico)
- `whatsapp-ai-service.mjs`: MATCH (SHA-256 idêntico)
- `fnrh-pdf-service.mjs`: MATCH (SHA-256 idêntico)
- `fnrh-serpro-service.mjs`: MATCH (SHA-256 idêntico)
- `mail-service.mjs`: MATCH (SHA-256 idêntico)
- `storage-service.mjs`: MATCH (SHA-256 idêntico)

### 1.4 Compilação do Frontend SPA (Vite + React)
Executamos o comando em `artifacts/limpeza`:
`npm run build`
Resultado verbatim:
```
dist/public/index.html                              2.65 kB │ gzip:   0.81 kB
dist/public/assets/pdf.worker.min-rsCePomN.mjs  1,417.59 kB
dist/public/assets/index.css                      384.58 kB │ gzip:  47.48 kB
dist/public/assets/pdf.worker.min-DDwCJoSP.js       0.07 kB │ gzip:   0.09 kB
dist/public/assets/pdf-z6sF223D.js                379.02 kB │ gzip: 114.08 kB
dist/public/assets/index.js                     3,211.68 kB │ gzip: 774.72 kB
✓ built in 46.58s
```
Status: Exit code 0, bundles gerados com sucesso em `dist/public/`.

---

## 2. Logic Chain

1. **Jornada de Disponibilidade & Capacidade**:
   - O endpoint `/api/bot-actions/availability` valida limites de capacidade definidos em `db.siteConfig.extraBedConfig` (`maxGuests = 3`).
   - Requisições com 1 a 3 hóspedes retornam UHs disponíveis (`available: true`). Requisições com 4 ou mais hóspedes retornam `available: false` e array vazio de flats, prevenindo superlotação (Probe 1.1).
   - Bloqueios de manutenção (`roomBlocks`) e reservas ativas no PMS são devidamente consultados e excluem as UHs conflitantes (Probe 1.7).

2. **Cálculo da Cotação & Motor SEBRAE**:
   - O cálculo da diária base segue a parametrização SEBRAE de `getFinancialSettings()` e aplica curva de sazonalidade mensal (Probe 1.2).
   - Acréscimo de final de semana (+15% em sextas e sábados) é aplicado estritamente sobre a diária base.
   - Markups por canal são aplicados (Direto 0%, Airbnb +15%, Booking +18%).
   - Acréscimos de siteConfig são computados: taxa de limpeza (R$ 70 no plano `room_only`, isenta no `with_breakfast`), taxa de cama extra (R$ 60 para >2 hóspedes) e café da manhã (R$ 35/noite/quarto quando `with_breakfast`). A soma exata de diárias + adicionais fecha 100% com o campo `total` retornado.

3. **Pré-Reserva & Hold Provisório de 30 Minutos**:
   - A criação de pré-reserva via `/api/bot-actions/pre-reserve` gera código localizador oficial `CF-XXXXXX`, status `pre_reserva`, `paymentStatus: "pendente"` e `expiresAt` calculado para +30 minutos.
   - Imediatamente após a criação, uma checagem de disponibilidade comprova que a UH foi bloqueada pelo hold temporário (Probe 1.3).
   - Tentativas concorrentes de pré-reserva sobre a mesma UH no mesmo período retornam imediatamente HTTP 409 `FLAT_UNAVAILABLE`, comprovando prevenção ativa contra double-booking.

4. **Conformidade do PIX com Padrão Bacen**:
   - O payload gerado em `pixCopiaECola` segue rigorosamente a especificação EMV do Banco Central: inicia com `000201`, contém Tag 26 com `br.gov.bcb.pix`, Tag 53 com código de moeda `986`, Tag 54 com o valor formatado em duas casas decimais, Tag 58 `BR`, e Tag 62 com o `txid`.
   - O cálculo do checksum polinomial CRC16-CCITT (0x1021) na tag 63 foi matematicamente verificado e bateu de forma idêntica (Probe 1.4).
   - O QR Code em base64 foi decodificado e comprovou cabeçalho PNG autêntico (`0x89 0x50 0x4E 0x47`).

5. **Efetivação no PMS & Bloqueio Definitivo**:
   - A chamada para `/api/bot-actions/commit-reservation` transiciona a reserva para `status: "confirmada"`, `paymentStatus: "pago_total"` e `pmsConfirmed: true`, removendo o timestamp de hold provisório (`expiresAt`).
   - A UH fica permanentemente bloqueada para os dias da estadia, mantendo disponíveis apenas datas adjacentes (Probe 1.5).
   - Pré-reservas com hold expirado são rejeitadas na tentativa de commit com HTTP 400 `PRE_RESERVATION_EXPIRED` e liberam o calendário automaticamente (Probe 1.6).

6. **Chave Mestra & Transbordo Cordial (Kill Switch)**:
   - Quando `apiActionsEnabled === false`, os 5 endpoints do bot actions rejeitam com HTTP 403 `ACTION_DISABLED`, com `requiresHandover: true` e mensagem orientando transbordo cordial humano (Probe 2.1).
   - A matriz de switches granulares permite desligar ações isoladas (ex.: apenas `createPreReservation` ou `commitReservation`) mantendo as demais operacionais (Probe 2.2).
   - No motor de IA do WhatsApp (`whatsapp-ai-service.mjs`), `buildGeminiTools` retorna array vazio `[]` e o prompt instrui transbordo cordial prestativo sem acionar ferramentas autônomas (Probe 2.3).
   - O teste de estresse de alternância rápida (10 toggles consecutivos em tempo real) confirmou transição de estado quente instantânea sem necessidade de reinício do servidor (Probe 2.4).

---

## 3. Caveats

1. **Sincronização de Banco em Memória nos Testes**: O `demo-server.mjs` opera com banco em memória (`db`) sincronizado via `atomicWriteFileSync`. Ao injetar registros diretamente no arquivo em disco durante testes automatizados, é necessário invocar o endpoint `/api/test/db-reset` para que o servidor recarregue o estado em memória.
2. **Ambiente de Testes do WhatsApp (Z-API)**: O disparo real de mensagens via WhatsApp para números físicos depende de conectividade com a infraestrutura externa da Z-API e instância conectada por QR Code; os testes do agente foram executados com os mocks e validadores de integração de rotas e heurística/Gemini presentes na suíte.
3. **Nenhum outro caveat pendente**: Todos os requisitos funcionais e não-funcionais foram cobertos empiricamente.

---

## 4. Conclusion

O sistema CorpFlats implementa com integridade matemática e operacional a jornada completa do hóspede e o controle da chave mestra de ações.
- Todas as asserções de disponibilidade, precificação SEBRAE com adicionais, pré-reserva com hold temporário, emissão de cobrança PIX com CRC16 válido, commit definitivo no PMS e bloqueio de calendário foram 100% aprovadas.
- O Kill Switch (`apiActionsEnabled === false`) recusa categoricamente tentativas de execução com HTTP 403 `ACTION_DISABLED`, define `requiresHandover: true` e orienta transbordo humano cordial.
- A paridade dos servidores espelhados (`artifacts/api-server/` e `scripts/`) possui 100% de correspondência de hash SHA-256.
- O build do frontend Vite compila com sucesso.

**Veredicto Oficial: APPROVE.**

---

## 5. Verification Method

Para reproduzir e auditar independentemente os resultados:

1. **Executar a suíte completa de testes do Challenger M4**:
   ```powershell
   node --test tests/challenger-m4-journey.test.mjs
   ```
   *Condição de invalidação*: Qualquer falha nas 11 probes ou assertion error.

2. **Executar as baterias core do Milestone M4**:
   ```powershell
   node --test tests/bot-actions-api.test.mjs tests/tariff-engine.test.mjs tests/whatsapp-ai-agent.test.mjs
   ```
   *Condição de invalidação*: Qualquer teste com status diferente de PASS.

3. **Verificar a paridade dos servidores espelhados (SHA-256)**:
   ```powershell
   node -e "
   const fs = require('fs'), crypto = require('crypto');
   ['demo-server.mjs', 'zapi-service.mjs', 'whatsapp-ai-service.mjs'].forEach(f => {
     const h1 = crypto.createHash('sha256').update(fs.readFileSync('artifacts/api-server/' + f)).digest('hex');
     const h2 = crypto.createHash('sha256').update(fs.readFileSync('scripts/' + f)).digest('hex');
     console.log(f, h1 === h2 ? 'MATCH' : 'MISMATCH');
   });"
   ```
   *Condição de invalidação*: Qualquer arquivo acusando MISMATCH.

4. **Verificar compilação do Frontend**:
   ```powershell
   cd artifacts/limpeza
   npm run build
   ```
   *Condição de invalidação*: Código de saída diferente de 0 ou ausência de arquivos em `dist/public/`.

# Project: Guest-Flow-Manager (WebBookingPro Integration & SEBRAE Pricing Engine)

## Architecture

O sistema **Guest-Flow-Manager** (CorpFlats Soho Residence: 19 flats, Campos dos Goytacazes/RJ) passa a ser a fonte canônica da verdade para Disponibilidade, Tarifas e Restrições (ARI), enviando-as ao channel manager **WebBookingPro (WBP)**, e passando a receber automaticamente reservas da Booking.com e do Airbnb.

### Diagrama de Fluxo e Limites de Módulos

```
                                      +------------------------------------+
                                      |     WebBookingPro (ou Simulador)   |
                                      +------------------------------------+
                                             ^                      |
                       ARI Update (Outbound) |                      | Webhooks (Inbound)
                                             |                      v
+--------------------------------------------+----+    +------------+-----------------------+
|             ARI & Pricing Synchronizer          |    |      Webhook Ingestion & Storage    |
| - Mapeamento: 1 Quarto ("Flat") x 2 Planos     |    | - /BookingCreate (JSON)             |
|   ("Sem café" e "Com café" + R$ por hóspede)   |    | - /NotifyBooking (form-urlencoded)  |
| - Disponibilidade Canônica: min(teto, livres)   |    | - /ARIFullRefresh, /RoomInfo        |
| - 7 Restrições (min/max nights, stop-sell, CTA) |    | - Gravação durável fora do blob     |
| - Motor SEBRAE (Custo UH R$ 149,38 -> R$ 276,63)|    |   (wbp_raw_payloads & idempotência) |
| - Travas: Piso, Variação (30%), Publicação Staged    +------------+-----------------------+
+-------------------------------------------------+                 |
                                                                    v
+-------------------------------------------------+    +------------+-----------------------+
|           Database & Core State                 |    |      Idempotent Booking Processor   |
| - Postgres JSONB 'system_store' (key='db_state')|    | - Validação e desduplicação        |
| - Tabela isolada wbp_raw_payloads & idempotency |    | - Alocação Fair-Share (19 flats)   |
| - Chaves e Cartões AES-256-GCM fora do banco    |<---| - Quarentena para conflitos/dúvidas|
| - Paridade byte-a-byte (demo-server.mjs gêmeos) |    | - Supressão do PIX em OTAs          |
| - Limite de Memória aumentado para 1536 MB      |    | - Automações: WhatsApp/SERPRO/Email |
+-------------------------------------------------+    +------------------------------------+
```

---

## Feature Inventory

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | General Switch & Modes | Interruptor geral (`off`, `observe`, `auto`) com comportamento 100% inerte quando desligado | M1 | R1 |
| F2 | Durable Raw Storage | Gravação pré-processamento de payloads brutos e idempotência fora do blob e imune à poda | M1 | R1 |
| F3 | Serialized State Writes | Serialização de escritas no estado de reservas para evitar duplicidade de IDs | M1 | R1 |
| F4 | Isolated Test Runner | Isolamento demonstrado dos testes pontuais com `DATABASE_URL` removida e banco temporário | M1 | R1, R10 |
| F5 | WBP API Client | Cliente HTTP oficial (`WBPClient`) cobrindo 8 endpoints obrigatórios com `guid` e retentativa | M1 | R2 |
| F6 | Local WBP Simulator | Simulador local validando schemas OpenAPI contra `wbpAPI.yaml`, com injeção de cenários e falhas | M1 | R2 |
| F7 | Secrets & Environment Config | Configuração de credenciais (`cid`, `shared_secret`, senhas) fora do blob em variáveis de ambiente | M1 | R2 |
| F8 | Server Parity & Memory | Paridade SHA-256 byte-a-byte dos arquivos gêmeos e expansão da memória Node para 1536 MB | M1 | R10 |
| F9 | Canonical Availability Engine | Motor único de cálculo de disponibilidade resolvendo 4 divergências (reservas, blocks, holds, OS) | M2 | R3 |
| F10 | SEBRAE Pricing Engine | Cálculo sustentável: Custo UH R$ 149,38 -> Tarifa Mínima R$ 276,63 (±0,05) fechando 100% | M2 | R4 |
| F11 | Pricing Safety Locks | Trava de piso, trava de variação brusca (>30%) e workflow de publicação em rascunho (Staged) | M2 | R4 |
| F12 | Breakfast Surcharge Calculation | Plano "Com café" = "Sem café" + valor por hóspede refletido em `rate`, `rdef_single`, `adult_3` | M2 | R3 |
| F13 | Conflict Non-blocking Warnings | Avisos claros de conflito nas telas de reservas sem bloquear a operação da recepção | M2 | R3 |
| F14 | ARI Mapping & Shared Inventory | Mapeamento 1 Quarto ("Flat") x 2 Planos com estoque compartilhado `min(teto, livres)` | M3 | R3 |
| F15 | 7 ARI Restrictions | Suporte a estadia mín/máx, stop-sell geral/plano, CTA, CTD e antecedência mín/máx (minNights ativa) | M3 | R3 |
| F16 | ARI Batch & Incremental Sync | Carga inicial completa até fim do ano seguinte e sync incremental em lotes (<10 s) após mutações | M3 | R3 |
| F17 | Inbound Webhooks & Form Parsing | Callbacks `/BookingCreate`, `/NotifyBooking` (form-urlencoded), `/ARIFullRefresh`, `/RoomInfo` | M4 | R2 |
| F18 | Background Polling | Polling periódico de backup a cada 30 min usando `wbp_booking_version - 5 min` e fallback para null | M4 | R2 |
| F19 | OTA Inbox & Fair-Share Allocation | Caixa de entrada de reservas, alocação justa entre 19 flats e identificadores externos gravados | M4 | R5 |
| F20 | Quarantine Management Engine | Roteamento para quarentena em caso de overbooking, conflitos, flats bloqueados ou dúvidas | M4 | R5 |
| F21 | OTA Mutations (Cancel & Mod) | Cancelamento automático com liberação de flat e ARI (exceto com check-in) e alterações com diff | M4 | R5 |
| F22 | Manual Reservation Reconciliation | Algoritmo e relatório de conciliação segura entre reservas manuais existentes e reservas da OTA | M4 | R5 |
| F23 | Automations & PIX Suppression | Disparo de WhatsApp, SERPRO, governança e portaria no modo auto; supressão estrita do PIX | M4 | R5 |
| F24 | Critical Events & Daily Alerts | Alertas via WhatsApp/e-mail para quarentena, overbooking, falha ARI >15 min e resumo diário | M4 | R8 |
| F25 | Credit Card Encrypted Vault | Criptografia AES-256-GCM com chave em env, descarte absoluto de CVV e zero vazamento | M5 | R6 |
| F26 | Admin Re-auth & Auto-purge | Visualização de cartão restrita a admin com reautenticação (token 5 min) e purga em 7 dias/cancel | M5 | R6 |
| F27 | Provisional Reviews & Messages | Adaptadores provisórios para Get/SendMessage e Get/RespondReview isolados e desligados por padrão | M5 | R7 |
| F28 | Pricing & Publishing UI | Aba Tarifa Mínima e modal Pré-visualização & Publicar conforme mockups aprovados | M5 | R4 |
| F29 | OTA Inbox & Quarantine UI | Interface da Caixa de Entrada OTA com tabs, filtros, gaveta de quarentena e conciliação | M5 | R5 |
| F30 | In-System Help Manual (R9) | Manual completo em português no sistema com guias de admin, recepção, códigos de erro e telas | M5 | R9 |
| F31 | Frontend Build & Dist Artifacts | Compilação de `artifacts/limpeza` (`npm run build`) e inclusão de `dist/` no commit | M5 | R10 |
| F32 | E2E Opaque-Box Test Suite (Tiers 1-4) | Suíte de testes pontuais cobrindo todas as 31 features nos 4 tiers sistemáticos | E2E | R1-R10 |
| F33 | Adversarial Coverage Hardening (Tier 5) | Testes adversariais e white-box para fechar brechas e corner cases | E2E | R1-R10 |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Operational Safety, Storage & WBP Simulator | F1, F2, F3, F4, F5, F6, F7, F8 | none | PLANNED |
| M2 | Canonical Availability & SEBRAE Pricing Engine | F9, F10, F11, F12, F13 | M1 | PLANNED |
| M3 | ARI Mapping & Synchronizer | F14, F15, F16 | M2 | PLANNED |
| M4 | Reservation Processing, Quarantine, Reconciler & Alerts | F17, F18, F19, F20, F21, F22, F23, F24 | M1, M2, M3 | PLANNED |
| M5 | Credit Card Vault, Provisional Adapters & UI / Manual | F25, F26, F27, F28, F29, F30, F31 | M4 | PLANNED |
| E2E | E2E Testing Track (Tiers 1-4 & Tier 5) | F32, F33 | M1 (start parallel) | PLANNED |
| FINAL | Final Acceptance & Adversarial Hardening | Pass 100% E2E tests + Tier 5 Hardening | M5, E2E | PLANNED |

---

## Interface Contracts

### M1 ↔ M3 / M4 (WBP Client & Simulator)
- `WBPClient`:
  - `sendARIUpdate({ propertyId, updates: Array<ARIBlock> }): Promise<{ success: boolean, guid: string }>`
  - `getBookingList({ propertyId, lastVersion?: string }): Promise<Array<WBPBooking>>`
  - `getBookingId({ propertyId, orderId: string }): Promise<WBPBooking>`
  - `ackBooking({ propertyId, orderId: string }): Promise<{ success: boolean }>`
- `RawStorage`:
  - `recordRawPayload({ source: 'webhook' | 'polling', endpoint: string, payload: any }): Promise<string>` (retorna `payloadId`)
  - `markPayloadProcessed({ payloadId: string, result: any }): Promise<void>`
  - `isAlreadyProcessed(idempotencyKey: string): Promise<boolean>`

### M2 ↔ M3 / M4 (Availability & Pricing)
- `calculateCanonicalAvailability(startDate: string, endDate: string, options?: { excludeReservationId?: string }): Map<string, number>`
  - Retorna o número de flats livres (de 0 a 19) para cada noite inclusiva entre `startDate` e `endDate - 1 dia`.
- `calculateSebraeRate(params: SebraeParams): { custoUH: 149.38, tarifaMinima: 276.63, decomposicao: { custo: 149.38, comissao: 41.49, margem: 69.16, imposto: 16.60 }, fecha100: true }`
- `applyPricingLocks({ currentDate: string, planId: string, candidateRate: number, lastSentRate?: number, manualFloor?: number }): { approved: boolean, lockedReason?: 'FLOOR_LOCK' | 'VARIATION_LOCK', finalRate?: number }`

### M3 ↔ WBP (ARI Schema)
- `ARIBlock`:
  - `start_date`: `YYYY-MM-DD`
  - `end_date`: `YYYY-MM-DD` (inclusivo!)
  - `wbp_room_id`: `flat`
  - `wbp_rate_id`: `sem_cafe` | `com_cafe`
  - `units`: `min(ceiling, freeFlats)`
  - `rate`: número (ex: 276.63)
  - `rdef_single`: número
  - `adult_3`: número
  - `restrictions`: `{ min_stay, max_stay, stop_sell, closed_to_arrival, closed_to_departure, min_advance, max_advance }`

### M4 ↔ Database & Integrations
- `processIncomingOTA(booking: NormalizedBooking): Promise<BookingProcessResult>`
  - Normaliza campos de OTAs (Booking / Airbnb).
  - Determina alocação de quarto via `calculateFairShareStats`.
  - Se conflito -> insere em `quarantineBookings`, dispara alerta ao gestor.
  - Se sucesso -> grava reserva no PMS com `channel = booking/airbnb`, `externalOrderId`, `paymentCollect = Channel | Property`.
  - Suprime PIX. No modo `auto`, agenda WhatsApp, SERPRO, governança e portaria. No modo `observe`, apenas registra.

### M5 ↔ Security & UI
- `CreditCardVault`:
  - `encryptCard(cardData: RawCard): EncryptedCardPayload` (sem CVV)
  - `decryptCard(encryptedPayload: EncryptedCardPayload, adminPasswordToken: string): RawCard`
  - `purgeExpiredCards(currentDate: string): number` (purga > 7 dias do checkout ou canceladas)
- `AdminReauth`:
  - `generateReauthToken(adminUsername: string, passwordAttempt: string): Promise<string | null>` (token de 5 min de uso único)

---

## Code Layout

- **Simulador & Testes da WBP**:
  - `e2e/wbp-simulator/server.mjs`: Servidor Express/Node local do simulador WBP validando schemas OpenAPI.
  - `e2e/wbp-simulator/schemas/`: Schemas JSON / OpenAPI tolerantes e validadores.
  - `tests/wbp-integration/`: Testes pontuais estritos da integração WBP e SEBRAE (`node --test`).
- **Módulos Backend da Integração**:
  - `artifacts/api-server/wbp/`: Módulos da integração (`client.mjs`, `storage.mjs`, `availability.mjs`, `pricing.mjs`, `ari-sync.mjs`, `inbox.mjs`, `card-vault.mjs`, `alerts.mjs`).
  - `scripts/wbp/`: Cópia espelhada idêntica (SHA-256) dos módulos de `artifacts/api-server/wbp/`.
  - Rotas e montagem integradas em `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` mantendo paridade byte-a-byte exata.
- **Frontend**:
  - `artifacts/limpeza/src/components/pricing/`: Telas e componentes de precificação SEBRAE e travas.
  - `artifacts/limpeza/src/components/wbp/`: Caixa de Entrada OTA, Quarentena, Conciliação e Ajuda.
  - `artifacts/limpeza/dist/`: Arquivos gerados via `npm run build` commitados no repositório.
- **Configuração de Ambiente & Memória**:
  - `render.yaml`, `package.json`, `server.mjs`: Ajuste de memória para 1536 MB.

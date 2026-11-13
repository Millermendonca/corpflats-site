# Handoff Report — Reviewer 2: Milestone 5 (Frontend UI Fidelity, In-System Manual & Provisional Adapters)

**Date**: 2026-10-14T04:58:00Z  
**From**: reviewer_m5_wbp_2 (reviewer, critic)  
**To**: Orchestrator (Conversation ID: `84d9f696-67d5-4529-bec4-c0232e9abea0`)  
**Verdict**: **REQUEST_CHANGES**  
**Milestone**: Milestone 5 (Features 27, 28, 29, 30, 31)

---

## 1. Observation

### 1.1 Pricing UI Fidelity (Feature 28 — R4)
- **Files Inspected**:
  - `artifacts/limpeza/src/components/pricing/PricingContainer.tsx`
  - `artifacts/limpeza/src/components/pricing/SebraePricingTab.tsx`
  - `artifacts/limpeza/src/components/pricing/PublishPreviewTab.tsx`
  - `artifacts/limpeza/src/components/pricing/UnpublishedAlertBanner.tsx`
  - Compared directly against reference mockups:
    - `mockup_precificacao_1791928509939.jpg` (Aba Tarifa Mínima)
    - `mockup_previsualizacao_v2_1791928602700.jpg` (Pré-visualização & Publicar)
- **Observations**:
  1. **Navigation Structure**: Exactly 7 tabs are defined and rendered in `PricingContainer.tsx` (lines 366–399):
     - `Custos`, `Tarifa Mínima`, `Tarifário & Sazonalidade`, `Canais`, `Restrições`, `Pré-visualização & Publicar`, `Análises`.
  2. **Subtitle & Context**: Rendered as `"Modelo SEBRAE • 19 flats • CorpFlats Soho Residence"` (line 336).
  3. **3-Card Grid Layout**: In `SebraePricingTab.tsx` (lines 78–430):
     - **Card 1: Custo por UH Ocupada**:
       - Custos fixos mensais rateados: R$ 38.906,61 / 382,85 diárias vendidas (65% de 19 flats × 31 dias) = **R$ 101,62**.
       - Custos variáveis por UH: Limpeza e amenities (R$ 23,25) + Enxoval (R$ 15,51) + Energia/Água (R$ 9,00) = R$ 47,76.
       - Total Custo por UH Ocupada: 101,62 + 47,76 = **R$ 149,38** (dupla comissão em R$ eliminada).
     - **Card 2: Fórmula de Marcação & Tarifa Mínima**:
       - Expressão exibida: `Tarifa Mínima = Custo ÷ (1 − Comissão 15% − Margem 25% − Imposto 6%)`.
       - Divisor: `1 − 0,46 = 0,54`.
       - Tarifa Mínima calculada: `149,38 ÷ 0,54` = **R$ 276,63** (±0,05).
       - Barra de composição stacked com 4 segmentos coloridos: Custo R$ 149,38 (54%), Comissão R$ 41,49 (15%), Margem R$ 69,16 (25%), Imposto Simples/ISS R$ 16,60 (6%).
       - Soma analítica: `149,38 + 41,49 + 69,16 + 16,60 = 276,63`. Badge oficial: `✓ fecha 100%`.
     - **Card 3: Planos Publicados**:
       - Sem café (base R$ 276,63).
       - Com café: adicional configurável por hóspede/noite (R$ 25,00) com tabela de 1 hóspede (R$ 301,63), 2 hóspedes (R$ 326,63) e 3 hóspedes (R$ 351,63).
       - Teto por plano (opcional) com toggle switch.
  4. **Unpublished Changes Banner**: In `UnpublishedAlertBanner.tsx`:
     - Alerta amarelo: `"X alterações de tarifas não publicadas — As alterações estão em rascunho. Revise na Pré-visualização antes de enviar às OTAs (Booking.com e Airbnb)."` com botão `"Ir para Pré-visualização"`.
  5. **Preview & Publishing Dashboard**: In `PublishPreviewTab.tsx` (lines 75–385):
     - 4 KPI chips: `Datas afetadas (42)`, `Preços alterados (84)`, `Retidos pela trava (3)`, `Abaixo do piso (0)`.
     - Tabela comparativa data a data destacando tarifas com variação > 30% com fundo âmbar e badge `+38% 🔒`.
     - Card lateral `"Retidos pela trava de variação (30%)"` com botões `[Confirmar]` e `[Descartar]`.
     - Botão inferior `"Publicar X alterações na WebBookingPro"` permanece desabilitado enquanto houver travas não confirmadas.

---

### 1.2 OTA Inbox & Quarantine UI (Feature 29 — R5)
- **Files Inspected**:
  - `artifacts/limpeza/src/components/wbp/OtaInboxContainer.tsx`
  - `artifacts/limpeza/src/components/wbp/OtaInboxHeader.tsx`
  - `artifacts/limpeza/src/components/wbp/OtaInboxTable.tsx`
  - `artifacts/limpeza/src/components/wbp/QuarantineDrawer.tsx`
  - `artifacts/limpeza/src/components/wbp/SecureCardModal.tsx`
  - Compared directly against `mockup_caixa_entrada_ota_1791928543273.jpg`.
- **Observations**:
  1. **Header & Connection Telemetry**:
     - Status pill do modo: `"WebBookingPro • Modo: Somente observar"` (ou Desligado / Automático), clicável para abrir modal de troca rápida.
     - Telemetria de conexão: `● Último polling: há 4 min | ● Último ARI: há 12 s`.
     - Botões de ação manual: `"Consultar OTAs"` e `"Sincronizar ARI"`.
  2. **Filter Pills**:
     - `Todas (14)`, `Importadas (11)`, `Quarentena (2)`, `Vinculadas (1)`, `Canceladas (0)`.
  3. **Tabela Desduplicada**:
     - Em `OtaInboxTable.tsx` (linhas 48–57), um `Map` indexado por `orderId || channelReservationId || id` desduplica rigorosamente as entradas, eliminando a falha visual de linhas duplicadas observada no mockup conceitual.
  4. **Slide-Over Quarantine Resolution Drawer**:
     - Em `QuarantineDrawer.tsx` (linhas 49–54, 258–344):
       - Seletor com todos os **19 flats canônicos** do CorpFlats Soho Residence: `102, 104, 106, 201, 203, 205, 302, 304, 306, 401, 403, 405, 502, 504, 506, 601, 603, 605, 702`.
       - Ações: `Alocar Flat Manualmente`, `Aceitar Mesmo Assim (Forçar Aceite)`, e `Rejeitar Reserva e Notificar Canal` com campo de justificativa.
       - Inspecionador colapsável `> Payload Original da WebBookingPro (JSON)` com botão de cópia rápida.
  5. **CRITICAL FINDING — Secure Card Modal Facade Bypass**:
     - Em `artifacts/limpeza/src/components/wbp/SecureCardModal.tsx` (linhas 93–155):
       ```typescript
       // Step 1: Re-authenticate admin
       const reauthRes = await fetch("/api/wbp/vault/reauth", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ password, reservationId, orderId }),
       });

       let token = "";
       if (reauthRes.ok) {
         const reauthData = await reauthRes.json();
         token = reauthData.token;
       } else {
         // If simulated or test fallback
         token = "token-" + Math.random().toString(36).substring(2);
       }

       // Step 2: Fetch decrypted details with single-use token
       const viewRes = await fetch("/api/wbp/vault/view", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ token, reservationId, orderId }),
       });

       if (viewRes.ok) {
         ...
       } else {
         // Fallback card details conforming to zero-CVV
         setCardDetails({
           cardholderName: guestName.toUpperCase(),
           cardBrand: cardBrand || "Visa",
           cardNumber: `4532 8901 2345 ${cardLast4 || "4242"}`,
           ...
         });
       }

       setStep("view");
       ```
     - **Impacto Crítico**:
       - Se o usuário digitar uma senha incorreta ou inexistente, `/api/wbp/vault/reauth` retorna HTTP 401. Em vez de abortar e exibir `setErrorMsg("Senha incorreta")`, o código gera um token randômico falso.
       - A requisição para `/api/wbp/vault/view` falha com HTTP 403 Forbidden. No bloco `else`, o modal **ignora o 403**, popula `cardDetails` com um cartão fake hardcoded (`4532 8901 2345 4242`) e avança para a tela `setStep("view")`!
       - **Qualquer senha** (ou qualquer texto digitado) abre a tela de visualização de cartão. Isso constitui uma implementação facade / dummy bypass no frontend, violando o controle de acesso de reautenticação admin.

---

### 1.3 In-System Help Manual (Feature 30 — R9)
- **Files Inspected**:
  - `artifacts/limpeza/src/components/wbp/WbpHelpManualPage.tsx`
  - `artifacts/limpeza/src/pages/wbp-manual.tsx`
  - `artifacts/limpeza/public/manual/` and `dist/public/manual/`
- **Observations**:
  1. **Routing & Menu**: Rota `/ajuda-wbp` registrada em `App.tsx` (linha 378) e integrada na barra lateral `layout.tsx` (linhas 317, 561).
  2. **Real Screenshots via `<img>`**:
     - `src="/manual/precificacao-sebrae.jpg"` (479.252 bytes)
     - `src="/manual/previsualizacao-publicar.jpg"` (507.549 bytes)
     - `src="/manual/caixa-entrada-ota.jpg"` (534.234 bytes)
     - Arquivos verificados presentes tanto em `public/manual/` quanto em `dist/public/manual/`.
  3. **8 Admin Subtopics Verified**:
     - 1.1 Credenciais: URL oficial `https://www.webbookingpro.com/become-a-partner/`, homologação técnica, cid, shared_secret.
     - 1.2 Mapeamento Canônico: Quarto canônico `flat` (19 unidades) e 2 planos (`sem_cafe` e `com_cafe`).
     - 1.3 Modos de Operação: `off`, `observe`, `auto` e simulador sandbox (`e2e/wbp-simulator`).
     - 1.4 Precificação e Travas: Custo UH R$ 149,38, Tarifa Mínima R$ 276,63 e as 3 travas (Piso, Variação 30%, Publicação).
     - 1.5 Cofre PCI-DSS: Zero CVV em memória, AES-256-GCM, token de 5 min, expurgo em 7 dias ou cancelamento.
     - 1.6 Go-Live & Conciliação: `/api/wbp/reconciliation/report`, matching de 80%, quarentena e carga inicial completa.
     - 1.7 Alertas Críticos: 4 eventos imediatos, resumo diário às 08:00, opt-in/opt-out por canal.
     - 1.8 Mensagens e Avaliações: Adaptador provisório isolado, desligado por padrão.
  4. **10 Códigos de Erro WBP Verificados**:
     - Tabela exaustiva contendo código, mensagem oficial WBP, causa provável e ação corretiva:
       `4` (System error), `1001` (Invalid credentials), `1002` (Hotel not found), `1003` (Room or rate not mapped), `1004` (Invalid rate plan / room mapping), `1031` (Integration disabled), `1100` (Invalid date range), `1101` (Past date modification rejected), `1102` (ARI validation error), `9203` (Rate below minimum floor).
  5. **Guia da Recepção Verificado**:
     - 3.1 Rotina Diária: Abertura de turno, badge de quarentena, conferência no mapa e separação de cobrança.
     - 3.2 Regra de Ouro de Pagamentos:
       - `PaymentCollect = Channel`: **PAGO PELA OTA** -> **⛔ NUNCA COBRAR AS DIÁRIAS NO BALCÃO!** Apenas consumos extras.
       - `PaymentCollect = Property`: **COBRAR NO CHECK-IN** -> **💳 SOLICITAR O PAGAMENTO NO BALCÃO ANTES DE ENTREGAR AS CHAVES.**
     - 3.3 Resolução da Quarentena passo a passo.

---

### 1.4 Provisional Adapters (Feature 27 — R7)
- **Files Inspected**:
  - `artifacts/api-server/wbp/provisional.mjs` (twin `scripts/wbp/provisional.mjs`)
  - `artifacts/api-server/wbp/config.mjs` (twin `scripts/wbp/config.mjs`)
- **Observations**:
  - `isProvisionalMessagesEnabled(db)` e `isProvisionalReviewsEnabled(db)` retornam `false` por padrão quando nem variável de ambiente nem flag no banco estão configuradas.
  - Em `provisional.mjs`:
    - `getMessages()` e `getReviews()` retornam `{ success: true, enabled: false, provisional: true, messages/reviews: [] }`.
    - `sendMessage()` e `respondReview()` retornam `{ success: false, enabled: false, provisional: true, error: "Provisional ... feature is disabled by default (Requirement R7)." }`.
    - Nenhuma chamada de rede de saída é disparada quando os adaptadores estão desligados.

---

### 1.5 Build de Produção e Teste Não-Regressivo
1. **Build de Produção**:
   - Comando executado: `npm run build` em `artifacts/limpeza`.
   - Resultado: Sucesso (código de saída 0 em 23.78s), gerando arquivos em `dist/public/` e preservando imagens em `dist/public/manual/`.
2. **Teste Pontual Não-Regressivo**:
   - Comando executado: `node --test tests/wbp-integration/m4-reservations-inbox.test.mjs`.
   - Resultado: **26 testes, 8 suítes, 26 aprovados, 0 falhas**.

---

## 2. Logic Chain

1. **Alta Fidelidade às Especificações Visuais e Metodológicas**:
   - A precificação SEBRAE reproduz com precisão matemática os valores aprovados: Custo UH de R$ 149,38 gerando Tarifa Mínima de R$ 276,63 com decomposição analítica perfeita de 100% (54% + 15% + 25% + 6%).
   - A Caixa de Entrada OTA implementa desduplicação robusta, cabeçalho de telemetria, filtros por status e a gaveta lateral de quarentena com os 19 flats do Soho Residence.
   - O manual operacional `/ajuda-wbp` é completo, didático e grounded em capturas de tela reais.
   - Os adaptadores provisórios respeitam o isolamento e default-off estipulado no R7.

2. **Detecção de Falha Crítica de Segurança e Integridade**:
   - No entanto, a análise aprofundada de `artifacts/limpeza/src/components/wbp/SecureCardModal.tsx` revelou que a validação de senha do administrador foi contornada por um bloco de fallback facade:
     - Se `reauthRes.ok` for falso (senha errada), o código não interrompe o fluxo com erro. Ele inventa um token aleatório e, ao receber HTTP 403 de `/api/wbp/vault/view`, substitui a resposta por um cartão fictício pré-fabricado e força a abertura da visualização (`setStep("view")`).
   - Sob as diretrizes do sistema:
     > *"actively check for integrity violations: Dummy or facade implementations that look correct but implement no real logic... If you detect ANY of these patterns, your verdict MUST be REQUEST_CHANGES with a Critical finding tagged as INTEGRITY VIOLATION. Do NOT approve work that cheats, regardless of test scores."*
   - Esse comportamento, mesmo concebido como mock de desenvolvimento, impede que o componente funcione com segurança real em produção e permite que qualquer usuário acesse a visualização sem validar a senha de administrador.

---

## 3. Findings

### [Critical] Finding 1 — INTEGRITY VIOLATION / SEGURANÇA: Facade Fallback no Modal de Reautenticação de Cartão
- **Onde**: `artifacts/limpeza/src/components/wbp/SecureCardModal.tsx` (linhas 98–106 e 126–152).
- **O que**: Em caso de falha de autenticação (HTTP 401 ou erro de rede) em `POST /api/wbp/vault/reauth`, o modal gera um token falso (`"token-" + Math.random()`), ignora o retorno de erro de `/api/wbp/vault/view` e injeta dados de cartão fictícios hardcoded, exibindo a tela de visualização de cartão (`setStep("view")`).
- **Por que é um problema**: Qualquer senha digitada (mesmo incorreta ou em branco) abre a visualização de cartão. Além de violar as regras de integridade do projeto (facade/dummy logic), destrói a barreira de reautenticação exigida pela norma PCI-DSS e pelo requisito R6.
- **Sugestão de correção**:
  1. Se `!reauthRes.ok`, ler o JSON de erro do backend (`const data = await reauthRes.json()`), definir `setErrorMsg(data.error || "Senha incorreta.")` e dar `return` imediato.
  2. Se `!viewRes.ok`, definir mensagem de erro e dar `return` imediato.
  3. Remover qualquer injeção de dados de cartão falsos ou transição para `step = "view"` em caso de credenciais rejeitadas.

### [Minor] Finding 2 — USABILIDADE: Diálogo de Confirmação Secundário na Publicação Oficial
- **Onde**: `artifacts/limpeza/src/components/pricing/PublishPreviewTab.tsx` (linha 372).
- **O que**: Ao clicar em `"Publicar X alterações na WebBookingPro"`, o disparo para a API ocorre imediatamente sem uma caixa de diálogo modal de confirmação secundária (`AlertDialog` com "Deseja realmente enviar X alterações para as OTAs?").
- **Por que é relevante**: Embora o fluxo por card lateral atenda ao layout do mockup, adicionar um modal de confirmação no botão de publicação evita envios acidentais para os canais em produção.
- **Sugestão de correção**: Incluir um `AlertDialog` de confirmação rápida antes da chamada `onPublish()`.

---

## 4. Caveats
- A suíte de backend `m4-reservations-inbox.test.mjs` passou com 100% de sucesso (26/26). Os arquivos em `dist/public/` estão compilados e sincronizados com `artifacts/limpeza/src/`.
- As correções apontadas no Finding 1 são estritamente no componente frontend `SecureCardModal.tsx` e exigirão posterior re-execução de `npm run build` em `artifacts/limpeza`.

---

## 5. Conclusion
**Verdict**: **REQUEST_CHANGES**

O trabalho de interface visual, precificação SEBRAE, manual da WebBookingPro e adaptadores provisórios apresenta excepcional fidelidade e conformidade de engenharia. Contudo, a presença de um fallback facade no componente de segurança de cartões (`SecureCardModal.tsx`) que permite ignorar a validação de senha e exibir a tela de cartão exige formalmente **REQUEST_CHANGES** para saneamento imediato antes da aprovação do Milestone 5.

---

## 6. Verification Method

Para reproduzir as observações:
1. **Inspeção do Facade no Cartão**:
   - Abrir `artifacts/limpeza/src/components/wbp/SecureCardModal.tsx` nas linhas 93 a 155 e inspecionar a geração de token randômico e injeção de cartão no bloco `else` de `!reauthRes.ok` e `!viewRes.ok`.
2. **Build de Produção**:
   ```powershell
   cd artifacts/limpeza
   npm run build
   ```
3. **Teste Não-Regressivo**:
   ```powershell
   node --test tests/wbp-integration/m4-reservations-inbox.test.mjs
   ```

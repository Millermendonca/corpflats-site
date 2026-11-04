# Handoff Report — Explorer 3 (WhatsApp & Sofia AI Explorer)

**Milestone:** Survey / Investigation R5 (Oferta de Domingo Sem Pressa)  
**Agent:** Explorer 3 (`survey_explorer_3`)  
**Working Directory:** `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_3\`  
**Target:** Parent Orchestrator (`967b1f8a-534e-4526-94ad-683f5ef4e50f`)  

---

## 1. Observation

Durante a investigação detalhada do código-fonte e da arquitetura do repositório, foram observados diretamente os seguintes fatos:

1. **Canal #1 (Régua de Envios de Hóspedes) e Função de Disparo Z-API:**
   - Em `artifacts/api-server/zapi-service.mjs`, linhas 1900–1908:
     ```javascript
     id: "guest_schedule",
     name: "Régua de Envios de Hóspedes",
     description: "Confirmações, instruções de check-in, senhas de Wi-Fi, quarto pronto, avisos de saída e pesquisa NPS",
     category: "hospedes",
     enabled: true,
     testMode: true,
     redirectToWhitelistOnTest: false,
     whitelist: ["22998505276", "21997142513"],
     blacklist: []
     ```
   - Em `artifacts/api-server/zapi-service.mjs`, linhas 4612–4648 e 4838–4841:
     A função `sendZapiMessage(configOrPhone, optionsOrMessage, thirdOpts)` aceita o parâmetro `delayTyping`. No endpoint `/send-text`:
     ```javascript
     const textPayload = { phone: targetPhone, message: textWithLinks };
     if (delayTyping && Number(delayTyping) > 0) {
       textPayload.delayTyping = Math.min(15, Math.max(1, Math.round(Number(delayTyping))));
     }
     ```
   - Em `artifacts/api-server/zapi-service.mjs`, linhas 12142–12150:
     Disparos automáticos da régua chamam `sendZapiMessage` com `channelId: "guest_schedule"` e `recipientRole: "guest"`.

2. **Simulação de Quebra em Balões com Delay:**
   - Em `artifacts/api-server/whatsapp-ai-service.mjs`, linhas 13531–13554:
     Existe padrão já testado de envio sequencial de balões com `setTimeout` e `delayTyping`:
     ```javascript
     const typingSec = isTestEnv ? 0 : Math.min(4, Math.max(1, Math.ceil(balloonText.length / 70)));
     const waitMs = isTestEnv ? 0 : (bIdx === 0 ? Math.max(500, delaySec * 1000) : Math.max(600, typingSec * 600));
     if (waitMs > 0) {
       await new Promise(resolve => setTimeout(resolve, waitMs));
     }
     await sendZapiMessage(db.zapiConfig, {
       phone: cleanTarget,
       message: balloonText,
       channelId: "ai_agent",
       recipientRole: "guest",
       delayTyping: typingSec > 0 ? typingSec : undefined,
       db
     });
     ```

3. **Injeção de Contexto da Sessão (Zero-Ask e State Router):**
   - Em `src/agent/middleware/context-injector.ts`, linhas 85–134:
     `injectSessionContext` localiza reservas ativas em andamento (`checkin <= today <= checkout`) e define `estado_atual = 'IN_STAY_CONCIERGE'` e `perfil_remetente = 'HOSPEDE_ATIVO'`.
   - Em `src/agent/middleware/context-injector.ts`, linhas 173–188:
     O objeto `reservaSessao` é construído com dados da reserva e atribuído a `context.reserva_ativa` e `context.reserva_atual`.
   - Em `src/agent/prompts/in-stay.prompt.ts`, linhas 13–15 e 30–33:
     O contexto é injetado no prompt via `{{JSON_CONTEXTO_DINAMICO}}`, obtido de `buildContextoSessaoJson(context)`.

4. **Constituição AGENTS.md e Registro de Ferramentas:**
   - Em `src/agent/types/tool-contract.ts`:
     Toda ferramenta implementa `AgentToolDefinition` e deve retornar obrigatoriamente `AgentToolResponse` com `instrucao_para_ia`.
   - Em `artifacts/api-server/whatsapp-ai-service.mjs`, linhas 4248–4296:
     `executeBotAction` verifica se a ferramenta está registrada em `isRegisteredAgentTool(actionName)` e a executa diretamente com `executeRegisteredAgentTool(actionName, args, sessionCtx)`.
   - Em `artifacts/api-server/agent-architecture.mjs`, linhas 535–567:
     A função `generatePixChargeForService({ amount, description, debtorName, reservationCode, context })` gera a cobrança PIX integrada (Inter ou fallback estático) retornando `{ txid, pixCopiaECola, valor }`.
   - Em `artifacts/api-server/agent-architecture.mjs`, linhas 586–600 e 1824–1840:
     `selectFairShareFlatHelper` é utilizado em tempo de execução para encontrar flat vago no condomínio e transferir reservas quando necessário.

5. **Expiração Silenciosa e Webhook PIX:**
   - Em `artifacts/api-server/demo-server.mjs`, linhas 28304–28315:
     Pré-reservas expiradas por padrão acionam `triggerImmediateWhatsApp("pre_reservation_expired")`. Para a oferta de domingo, a flag `isSilentUpsellHold: true` deve inibir esse disparo, permitindo que o hold expire em silêncio.
   - Em `artifacts/api-server/demo-server.mjs`, linhas 58019–58026:
     O webhook do Banco Inter (`/api/pms/inter/webhook`) identifica cobranças de serviços por `txid` em `pendingStayoverCleaning`, `pendingEarlyCheckin`, `pendingLateCheckout`, etc.

---

## 2. Logic Chain

1. **Premissa de Canal e Formato dos Balões (Observação 1 e 2):**
   - O requisito R5 exige envio pelo Canal #1 (Régua Hóspedes) em 2 balões com delay de digitação.
   - Sabendo que o Canal #1 possui `id: "guest_schedule"` e que `sendZapiMessage` suporta `channelId: "guest_schedule"`, `sendMode: "text"` e `delayTyping`, a forma de garantir que o código PIX possa ser copiado em 1 toque no celular é enviar o Balão 1 com a mensagem comercial persuasiva e, após intervalo assíncrono (1,5s), enviar o Balão 2 contendo estritamente a string pura de `codigo_pix_copia_e_cola`.
   - Em ambiente de testes (`process.env.NODE_ENV === "test"`), ambos os delays (`delayTyping` e `waitMs`) são zerados para evitar travamentos ou lentidão em testes automatizados.

2. **Premissa de Injeção de Contexto (Observação 3):**
   - No sábado à noite, o hóspede elegível está em estadia ativa com check-out no domingo. Seu estado de sessão resolvido pelo `injectSessionContext` é `IN_STAY_CONCIERGE`.
   - Ao registrar `reservation.sundayUpsellOffer` na reserva no momento do disparo de sábado (ou teste manual), o `injectSessionContext` pode extrair esse objeto e injetá-lo estruturadamente dentro de `reservaSessao.oferta_domingo_sem_pressa`.
   - Quando `buildContextoSessaoJson` serializa para o prompt, a Sofia recebe a informação de que a oferta foi enviada, o valor promocional, a economia, o bônus de segunda até 12:00h e o status do hold (`hold_expirado: true/false`).

3. **Premissa de Tool Calling Conforme AGENTS.md (Observação 4 e Constituição):**
   - A Lei 4 proíbe alterar o orquestrador para adicionar regras hardcoded e orienta a criar ferramentas isoladas em `src/agent/tools/`.
   - A ferramenta existente `solicitar_late_checkout` trata saídas até 17h/18h com regras de cortesia por ocupação e diária cheia após 18h. A ferramenta `estender_estadia` calcula diárias normais integrais (ex: R$ 237,00) via `alterar_datas_reserva`. Nenhuma das duas atende à regra de preço promocional fixo (`sundayUpsellPrice`), hold temporário de 30 minutos e bônus de pernoite até segunda às 12h.
   - Logo, a criação da nova ferramenta dedicada `ofertar-domingo-sem-pressa.tool.ts` (`ofertar_domingo_sem_pressa`) é a solução arquitetural mais limpa, desacoplada e 100% conforme a Constituição do projeto.
   - A tool implementa o fluxo de 2 etapas (`confirmacao_hospede: false` para simulação e consulta no banco de vagas; `confirmacao_hospede: true` para gerar novo PIX e fixar novo hold de 30 minutos com `isSilentUpsellHold: true`).

4. **Premissa de Expiração e Webhook (Observação 5):**
   - Caso o hóspede não pague em 30 minutos, o hold expira em silêncio no banco (a flag `isSilentUpsellHold: true` impede disparo de mensagem de cancelamento).
   - Se o hóspede voltar a falar com a Sofia após o prazo de 30 minutos, o contexto injetado (`hold_expirado: true`) e o prompt orientam a Sofia a chamar `ofertar_domingo_sem_pressa`. A ferramenta verifica se o flat (ou condomínio) ainda está livre de domingo para segunda. Se sim, gera uma nova cobrança PIX com novo hold de 30 minutos; se não, informa educadamente a lotação do prédio.
   - Quando o PIX é pago, o webhook `/api/pms/inter/webhook` localiza o `txid` em `sundayUpsellOffer.txid`, estende a reserva no PMS para segunda às 12:00h, transfere eventual reserva subsequente para o Flat da Vez via `selectFairShareFlat`, reagenda a limpeza e envia a mensagem de confirmação.

---

## 3. Caveats

1. **Paridade Twin-Server Obrigatória:**
   - Todos os arquivos `.mjs` modificados em `artifacts/api-server/` (`agent-architecture.mjs`, `whatsapp-ai-service.mjs`, `zapi-service.mjs`) devem ser espelhados identicamente na pasta `scripts/` correspondente para aprovação no `scripts/check-twin-parity.mjs`.
2. **Ambiente de Testes vs Produção:**
   - A simulação de delay de digitação (`delayTyping` e `waitBetweenBalloonsMs`) deve ser estritamente desabilitada em `NODE_ENV === "test"` para não quebrar testes unitários com timeouts.
3. **Escopo Estrito de Testes (Regra AGENTS.md):**
   - É terminantemente proibido rodar testes globais (`tests/*.test.mjs`). Quando a implementação for concluída pelos implementadores, apenas o teste pontual da funcionalidade deve ser executado.

---

## 4. Conclusion

O Requisito R5 está completamente delineado, mapeado e pronto para implementação:
- **Disparo no WhatsApp:** Implementação da função `dispatchSundayUpsellTwoBalloons` em `zapi-service.mjs` usando o Canal 1 (`guest_schedule`), `delayTyping` de 3s no Balão 1, intervalo de 1,5s, e Balão 2 contendo unicamente o código PIX Copia e Cola.
- **Injeção de Contexto:** Adição de `oferta_domingo_sem_pressa` em `tool-contract.ts` e preenchimento automático em `context-injector.ts`.
- **Comportamento da Sofia:** Inclusão de seção explicativa em `in-stay.prompt.ts` e diretriz em `prepareAgenticPreAnalysis`.
- **Tool Calling:** Criação da ferramenta `src/agent/tools/ofertar-domingo-sem-pressa.tool.ts` (`ofertar_domingo_sem_pressa`), com validação backend de domingo-segunda, simulação/efetivação em 2 etapas, geração de novo PIX e novo hold silencioso de 30 minutos.

---

## 5. Verification Method

Para verificação independente das constatações:

1. **Inspeção de Arquivos de Governança e Z-API:**
   - Verificar as definições do canal em `artifacts/api-server/zapi-service.mjs`:
     `evaluateZapiChannelPolicy` (linha 2076) e `DEFAULT_ZAPI_CHANNELS.guest_schedule` (linha 1900).
   - Verificar suporte a `delayTyping` em `sendZapiMessage` (linha 4839).
2. **Inspeção de Contrato e Ferramentas:**
   - Verificar contrato em `src/agent/types/tool-contract.ts` e injeção em `src/agent/middleware/context-injector.ts`.
   - Verificar molde e regras na Constituição em `AGENTS.md`.
3. **Teste Pontual Recomendado para a Equipe de Implementação:**
   - Desenvolver teste pontual exclusivo (ex: `tests/sunday-upsell-r5-sofia-dispatch.test.mjs`) validando:
     1. Disparo de 2 balões no Canal 1 com balão 2 contendo estritamente o código PIX.
     2. Injeção de `oferta_domingo_sem_pressa` no contexto da sessão.
     3. Execução da tool `ofertar_domingo_sem_pressa` em modo simulação (`confirmacao_hospede: false`) e efetivação (`confirmacao_hospede: true`).
     4. Bloqueio correto com `BLOQUEADO_PELA_REGRA` caso o condomínio esteja 100% ocupado na noite de domingo.
     5. Paridade Twin verificada via `node scripts/check-twin-parity.mjs`.

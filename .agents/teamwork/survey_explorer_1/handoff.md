# Handoff Report — Explorer 1 (Frontend UI Explorer)

**Data:** 04/11/2026  
**Tarefa:** Investigação e Análise Técnica do Requisito R1 (Frontend UI na `⚡ Régua Automática`)  
**Autor:** Explorer 1 (Frontend UI Explorer)  
**Destinatário:** Orchestrator / Implementador (Parent Agent ID: `967b1f8a-534e-4526-94ad-683f5ef4e50f`)  
**Documento Detalhado:** `artifacts/limpeza/src/pages/whatsapp-automation.tsx` e `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_1\analysis.md`

---

## 1. Observation (Observações Diretas)

1. **Localização da Aba na Interface:**
   - Em `artifacts/limpeza/src/pages/whatsapp-automation.tsx`:
     - O gatilho de aba correspondente à Régua Automática está nas linhas 2618–2621:
       ```tsx
       <TabsTrigger value="rules" className="rounded-lg text-xs font-bold gap-1.5">
         <Zap className="w-3.5 h-3.5 text-amber-500" />
         ⚡ Régua Automática
       </TabsTrigger>
       ```
     - O container de conteúdo correspondente está nas linhas 4336–4601:
       ```tsx
       <TabsContent value="rules" className="space-y-4">
       ```
     - A sub-aba auxiliar de edição de templates (`TabsContent value="editor"`) está nas linhas 4606–5652.

2. **Governança de Canais Independentes Z-API:**
   - Em `whatsapp-automation.tsx` (linhas 2553–2561), a Central de Governança mapeia 7 canais independentes:
     ```tsx
     { id: "guest_schedule", short: "📅 Régua Hóspedes" },
     { id: "ai_agent", short: "🤖 IA Sofia & Fiscal" },
     { id: "maids", short: "🧹 Camareiras" },
     { id: "service_providers", short: "🔧 Prestadores (OS)" },
     { id: "reception", short: "🏢 Recepção" },
     { id: "stay_operations", short: "☕ Café & Achados" },
     { id: "transactional_chat", short: "🔐 Chat & OTP" }
     ```
   - No backend `artifacts/api-server/zapi-service.mjs` (linhas 1899–1930), o Canal #1 oficial é definido em `DEFAULT_ZAPI_CHANNELS` como `guest_schedule`, possuindo propriedades `enabled`, `testMode`, `redirectToWhitelistOnTest`, `whitelist`, `blacklist` e lista de comunicações permitidas.
   - Em `zapi-service.mjs` (linha 2137), qualquer evento não específico de outra categoria é roteado deterministicamente para `resolvedChannelId = "guest_schedule"`.

3. **Carregamento e Mapeamento de Tags Dinâmicas:**
   - Em `whatsapp-automation.tsx` (linhas 2164–2250), a função `renderPreviewText(text: string)` interpola variáveis de reserva como `{{nome_hospede}}`, `{{quarto}}`, `{{data_checkout}}`, `{{valor_total}}`.
   - A lista visual de tags clicáveis para o editor de templates está definida no array `TAG_GROUPS` (linhas 230–315) e renderizada na linha 5006.

4. **Comportamento Atual da Lista de Templates:**
   - Em `whatsapp-automation.tsx`, a lista de templates é carregada via `GET /api/whatsapp/templates` (linha 1567) e atualizada via `POST /api/whatsapp/templates` (linhas 1856, 1919, 2025).
   - O backend armazena a lista em `db.whatsappTemplates` com inicialização a partir de `DEFAULT_WHATSAPP_TEMPLATES` (`zapi-service.mjs`, linha 359).

---

## 2. Logic Chain (Cadeia Lógica de Raciocínio)

1. **Acesso e Experiência do Operador (R1):**
   - Como observado em (1), a aba `⚡ Régua Automática` (`TabsContent value="rules"`) é o ponto central onde o operador gerencia os disparos do ciclo de vida do hóspede. Portanto, a implementação do painel de controle da "Oferta de Domingo Sem Pressa" deve residir nesta aba.
   - Inserir um card executivo dedicado no topo de `TabsContent value="rules"` (antes do grid geral de templates) dá visibilidade máxima à automação e atende a todos os critérios do Requisito R1:
     - Master Switch: ativa/desativa a automação (`sundayUpsellEnabled`);
     - Campo de valor: configura `sundayUpsellPrice` (R$ 90,00);
     - Painel demonstrativo: calcula dinamicamente a diária de referência (`valor_normal`) e a economia (`economia`);
     - Governança de canal: exibe a vinculação estrita ao Canal #1 (`guest_schedule`);
     - Botão de disparo manual/teste: executa teste imediato para reservas elegíveis em sandbox.

2. **Roteamento pelo Canal #1 (`guest_schedule`):**
   - Como observado em (2), `guest_schedule` é o Canal #1 independente de disparos para hóspedes.
   - Ao vincular a automação ao `guest_schedule`, o disparo respeita automaticamente o isolamento de modo de teste e whitelist do canal, garantindo que testes não vazem para hóspedes reais fora da lista autorizada, sem interferir na Sofia (`ai_agent`) ou em outros canais.

3. **Cálculo da Diária Normal (`valor_normal`) e Pré-Visualização em 2 Balões:**
   - Conforme observado em (3), a função `renderPreviewText` já simula dados reais ou simulados de reserva.
   - Integrando o cálculo da diária real (`targetRes.dailyRate` ou `targetRes.totalAmount / numNights`) e a subtração do `sundayUpsellPrice`, o operador visualiza em tempo real tanto no card quanto no editor os 2 balões de envio exigidos no Requisito R5:
     - Balão 1: Mensagem persuasiva com `{{valor_normal}}`, `{{valor_promocional}}`, `{{economia}}` e prazo de 30min;
     - Balão 2: Chave PIX Copia e Cola isolada para cópia com 1 toque.

4. **Endpoints de Suporte e Desacoplamento:**
   - Para que a interface opere de forma reativa e consistente:
     - `GET /api/whatsapp/sunday-upsell/config` fornece o estado inicial da automação;
     - `POST /api/whatsapp/sunday-upsell/config` salva as alterações de toggle e preço;
     - `POST /api/whatsapp/sunday-upsell/trigger` executa a verificação de elegibilidade e o disparo imediato em modo de teste, retornando o sumário detalhado de reservas processadas.

---

## 3. Caveats (Ressalvas e Limitações)

1. **Paridade Twin-Server:**
   - Conforme as diretrizes imutáveis do `AGENTS.md`, qualquer rota ou template implementado em `artifacts/api-server/zapi-service.mjs` DEVE ser copiado via `Copy-Item` para `scripts/zapi-service.mjs` para manter a paridade SHA-256.
2. **Ambiente de Teste Sandbox:**
   - Em modo de teste (`testMode: true` no Canal #1), o backend não enviará WhatsApp para hóspedes reais fora da whitelist cadastrada (`zapiConfig.channels.guest_schedule.whitelist`). O disparo manual retornará status de sucesso e simulará/registrará o hold no PMS, mas o envio físico de mensagem ficará restrito aos números autorizados.
3. **Escopo Restrito à Investigação:**
   - Como Explorer, nenhum código de produção foi modificado nesta etapa. A implementação concreta das rotas de backend e dos componentes React será realizada na fase de implementação.

---

## 4. Conclusion (Conclusão e Recomendações)

A arquitetura do Frontend está perfeitamente preparada para acomodar o Requisito R1:
- A aba `⚡ Régua Automática` (`artifacts/limpeza/src/pages/whatsapp-automation.tsx`, linha 4336) receberá o card executivo da "Oferta de Domingo Sem Pressa" com o toggle mestre, o campo `sundayUpsellPrice`, o display dinâmico da tarifa normal (`valor_normal`), a vinculação visual ao Canal #1 e o botão de disparo manual.
- O template base `tpl_sunday_upsell` deve ser registrado em `DEFAULT_WHATSAPP_TEMPLATES` (`zapi-service.mjs`, linha 359), permitindo ao operador editar o texto e consultar as variáveis em `TAG_GROUPS`.
- O relatório completo e especificações detalhadas de JSX, contratos de API e modelos de dados estão documentados em:
  `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_1\analysis.md`.

---

## 5. Verification Method (Método de Verificação Independente)

Para o agente implementador verificar a entrega da UI:
1. **Compilação do Frontend:**
   ```powershell
   cd "c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\artifacts\limpeza"
   npm run build
   ```
   *Condição de invalidação:* Erros de tipagem TypeScript em `whatsapp-automation.tsx` ou falhas na importação de ícones/componentes Radix.
2. **Inspeção de Elementos na Aba `⚡ Régua Automática`:**
   - Abrir o navegador na rota `/whatsapp-automation`.
   - Clicar na aba `⚡ Régua Automática`.
   - Verificar a renderização do Card de Controle da Oferta de Domingo no topo da página.
   - Testar a alternância do Switch (deve mudar badge para ATIVA/PAUSADA e persistir via API).
   - Testar a edição de `sundayUpsellPrice` (deve atualizar os exemplos de cálculo de economia instantaneamente).
   - Clicar no botão "Disparo Manual / Teste" e verificar o feedback em Toast com o total de reservas elegíveis.
3. **Verificação de Paridade Twin-Server:**
   ```powershell
   cd "c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager"
   node scripts/check-twin-parity.mjs
   ```
   *Condição de invalidação:* Divergência de hash SHA-256 entre `artifacts/api-server/zapi-service.mjs` e `scripts/zapi-service.mjs`.

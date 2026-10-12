# Relatório de Investigação Técnica do Frontend (Explorer 3)
**Data/Hora**: 2026-10-11T23:25:00Z  
**Autor**: explorer_3  
**Escopo**: Interface Web do Chat (`/whatsapp-chat`), Automação WhatsApp (`/whatsapp-automation`), Chamadas de API e Processo de Build em `artifacts/limpeza`.

---

## 1. Observação

### 1.1 Interface do Web Chat (`/whatsapp-chat`)
- **Arquivo**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\artifacts\limpeza\src\pages\whatsapp-chat.tsx`
- **Componente Principal**: `WhatsAppChatPage` (linhas 188–2123).
- **Gerenciamento de Estado**:
  - `activePhone`: `string | null` (linha 197).
  - `activeConversation`: `ChatConversation | null` (linha 198).
  - `messages`: `ChatMessage[]` (linha 199).
- **Renderização dos Balões de Mensagem**:
  - Linhas 1261–1386: `messages.map((msg, index) => { ... })`.
  - Distinção de remetente (linha 1262): `const isFromMe = msg.fromMe`.
  - Balão do operador/sistema: `isFromMe ? 'bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200/80 ...' : 'bg-white dark:bg-slate-900 ...'` (linhas 1280–1285).
  - Cabeçalho do balão (linhas 1287–1295):
    - Exibe `msg.senderName || 'CorpFlats'`.
    - Se houver `msg.triggerEvent`, exibe badge `🤖 Régua Automática`.
- **Identificação de Mensagens da Sofia**:
  - No backend (`artifacts/api-server/whatsapp-ai-service.mjs`, linhas 2298 e 2349), mensagens geradas pela Sofia são salvas com:
    `senderName: aiConfig.agentName || "Sofia"`, `fromMe: true`, `type: "text"`.
  - Portanto, a condição canônica no frontend é:
    ```ts
    const isSofia = Boolean(
      isFromMe &&
      !msg.triggerEvent &&
      (
        msg.senderName?.toLowerCase().includes('sofia') ||
        msg.sender === 'system'
      )
    );
    ```
- **Diálogos e Modais Existentes**:
  - `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` já estão importados de `@/components/ui/dialog` (linhas 10–11).
  - Modais já existentes no arquivo: `newChatModalOpen` (linhas 1931–2045) e `attachModalOpen` (linhas 2048–2118).

---

### 1.2 Interface de Automação do WhatsApp (`/whatsapp-automation`)
- **Arquivo**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\artifacts\limpeza\src\pages\whatsapp-automation.tsx`
- **Aba do Agente de IA**:
  - Gatilho da aba (linha 1706): `<TabsTrigger value="ai_agent" ...>`
  - Conteúdo da aba (linhas 1752–2461): `<TabsContent value="ai_agent" className="space-y-6">`
- **Layout Interno da Aba `ai_agent`**:
  - Banner superior com 4 cards de métricas (linhas 1754–1845): Motor de IA, Modelo LLM, Ambiente de Disparo, Status Operacional.
  - Card da Chave Mestra Global de Ações (linhas 1850–2095).
  - Grid de 2 colunas (a partir da linha 2098):
    - **Coluna Esquerda (`lg:col-span-7 space-y-6`)**:
      - Card 1: *Modo de Atuação & Parâmetros Principais* (linhas 2102–2281): modo (autônomo/copiloto/noturno), delay de digitação, modo teste, telefones autorizados, nome do agente, papel e Prompt Base do Sistema (`systemPrompt`).
      - Card 2: *Base de Conhecimento & FAQ Oficial* (linhas 2284–2342).
    - **Coluna Direita (`lg:col-span-5 space-y-6`)**:
      - Card: *Simulador do Agente de IA* (linhas 2347–2455): aciona `POST /api/whatsapp/ai-simulate` com `{ message, phone }` para testar respostas em tempo real.
- **Ponto de Inserção Ideal do Novo Card**:
  - Na Coluna Esquerda (`lg:col-span-7`), imediatamente após o Card 1 (linha 2282), antes da Base de Conhecimento.
  - O card de "Diretrizes & Calibrações Aprendidas" complementa o Prompt do Sistema exibido acima dele.

---

### 1.3 Chamadas de API e Clientes HTTP no Frontend
- **Padrão de Comunicação**:
  - Ao contrário de tabelas PMS gerais que usam `@workspace/api-client-react`, os módulos de WhatsApp, IA, Z-API e Demands utilizam `fetch` nativo assíncrono diretamente nos componentes/hooks (ex: `whatsapp-chat.tsx`, `whatsapp-automation.tsx`, `use-bot-demands.ts`).
  - No `vite.config.ts` (linhas 67–72), o proxy encaminha `/api` para `http://127.0.0.1:5000`. Em produção, o servidor Node.js entrega `artifacts/limpeza/dist/public` e responde `/api` no mesmo domínio.
- **Endpoints Existentes**:
  - `GET /api/whatsapp/ai-config`: Retorna `{ success: true, aiConfig, geminiConfigured, geminiModel, testModeOnly, testAllowedPhones }`.
  - `POST /api/whatsapp/ai-config`: Atualiza parâmetros gerais de `aiConfig`.
  - `POST /api/whatsapp/ai-simulate`: Simula a resposta da Sofia para `{ message, phone }`.
  - `GET /api/whatsapp/chat/conversations/:phone`: Retorna `{ conversation, reservation, otherReservations }`.
  - `POST /api/whatsapp/chat/send`: Dispara mensagem manual do operador.
  - `POST /api/whatsapp/chat/:phone/ai-toggle`: Alterna `aiPaused`.
- **Endpoints a Adicionar / Suportar para o Requisito**:
  1. `POST /api/whatsapp/chat/:phone/correct-message`:
     - Exigido pelo plano de testes do `ORIGINAL_REQUEST.md`.
     - Payload:
       ```json
       {
         "messageId": "string",
         "originalMessageText": "string",
         "guideline": "string",
         "rectificationText": "string | null",
         "sendToGuest": true,
         "category": "factual | tone"
       }
       ```
     - Ação no backend:
       - Adiciona a regra a `db.whatsappAiSettings.developerGuidelines`.
       - Atualiza `aiConfig.systemPrompt`.
       - Se `sendToGuest: true`, dispara mensagem cordial pelo WhatsApp do hóspede e adiciona no histórico do chat.
  2. `GET /api/whatsapp/ai-config` (estendido) ou `GET /api/whatsapp/ai-guidelines`:
     - Retorna array de `developerGuidelines: Array<{ id, rule, category, source, createdAt, active }>`.
  3. `POST /api/whatsapp/ai-guidelines` / `DELETE /api/whatsapp/ai-guidelines/:id` / `PATCH /api/whatsapp/ai-guidelines/:id/toggle`:
     - Gerenciamento CRUD de diretrizes pelo painel.

---

### 1.4 Processo de Build de `artifacts/limpeza`
- **Configuração**:
  - `artifacts/limpeza/package.json`: `"build": "vite build --config vite.config.ts"`.
  - `artifacts/limpeza/vite.config.ts`: `outDir: path.resolve(import.meta.dirname, 'dist/public')`, `emptyOutDir: true`.
- **Teste de Execução**:
  - Executado: `npm --prefix artifacts/limpeza run build`.
  - Resultado: **Exit code 0** em 27.05s.
  - Artefatos compilados em `dist/public/`:
    - `index.html` (2.65 kB)
    - `assets/index.css` (400.93 kB)
    - `assets/index.js` (3,361.96 kB)
    - Chunks auxiliares do PDF Worker.
- **Regra de Conformidade (`AGENTS.md`)**:
  - Todo commit com alterações em `artifacts/limpeza/src` deve executar `npm run build` e incluir os arquivos de `artifacts/limpeza/dist/` no commit antes de realizar `git push`.

---

## 2. Cadeia Lógica de Raciocínio (Logic Chain)

1. **Localização Precisa nos Balões de Mensagem**:
   - `whatsapp-chat.tsx` itera sobre `messages` (linha 1261).
   - O balão da Sofia tem `isFromMe = true` e `msg.senderName` correspondente ao nome do agente (padrão "Sofia").
   - Adicionar o botão `✏️ Corrigir / Ensinar Sofia` diretamente no rodapé interno do balão da Sofia garante visibilidade imediata para o operador exatamente no ponto onde o erro ocorreu.

2. **Fluxo Integrado em 1 Clique (Modal de Retificação)**:
   - Ao clicar no botão, o operador precisa de rapidez: não deve ter que ir a outra tela para ensinar a IA e depois voltar para digitar uma mensagem para o cliente.
   - O modal apresenta 2 campos:
     a) **Diretriz de Aprendizado**: a regra que a Sofia deve assimilar (ex: "O flat 905 tem cafeteira e o checkout é às 11:00").
     b) **Mensagem Cordial ao Hóspede**: pré-preenchida com mensagem amigável pronta (ex: "Olá! Gostaria de retificar a informação anterior: ...") com toggle para ativar/desativar o envio.
   - Ao clicar em "Salvar Diretriz & Retificar Hóspede", a requisição única `POST /api/whatsapp/chat/:phone/correct-message` resolve ambos os requisitos simultaneamente.

3. **Card Administrativo na Automação (`/whatsapp-automation`)**:
   - A aba `ai_agent` é a central administrativa da Sofia.
   - O novo Card "Diretrizes & Calibrações Aprendidas" consolida o aprendizado contínuo originado tanto de comandos de WhatsApp do Miller (`22998505276`) quanto de correções feitas por operadores no Web Chat.
   - O card deve permitir:
     - Visualização clara com tags de categoria (`Tom & Estilo` vs `Fato / Regra`) e origem (`WhatsApp Dev` vs `Chat Web`).
     - Ativar/Desativar individualmente cada regra (útil para testes A/B).
     - Exclusão com confirmação.
     - Botão "Testar no Simulador" que injeta uma pergunta de teste diretamente no card adjacente do simulador.

4. **Compatibilidade de Build e Deploy**:
   - Os componentes de UI do Radix/Tailwind (`Dialog`, `Card`, `Badge`, `Button`, `Switch`, `Textarea`, `Input`) já estão todos disponíveis e instalados em `artifacts/limpeza`.
   - Nenhuma nova biblioteca externa é necessária.
   - O build de produção já foi testado e gera os bundles sem erros de tipagem ou empacotamento.

---

## 3. Ressalvas e Limitações (Caveats)

- **Paridade com o Backend**:
  - A interface depende de o backend expor o endpoint `POST /api/whatsapp/chat/:phone/correct-message` e incluir `developerGuidelines` nas respostas de `/api/whatsapp/ai-config`.
  - Esta investigação confirma a estrutura exata necessária para o frontend, permitindo que o implementador do backend e o implementador do frontend atuem de forma 100% coordenada.
- **Tratamento de Nome Personalizado do Agente**:
  - Se um operador alterar o nome da Sofia para outro nome no painel (ex: "Clara"), a detecção `msg.senderName?.toLowerCase().includes('sofia')` ainda deve cobrir nomes alternativos checando `isFromMe && !msg.triggerEvent && msg.senderName !== 'Operador'`. Recomenda-se essa verificação robusta.

---

## 4. Conclusão & Especificação Pronta para Implementação

### 4.1 Especificação para `artifacts/limpeza/src/pages/whatsapp-chat.tsx`

#### A. Detecção da Sofia e Inclusão do Botão
No bloco de renderização do balão (em torno da linha 1364):
```tsx
{/* Botão de Ensinar / Corrigir Sofia */}
{isFromMe && !msg.triggerEvent && (msg.senderName?.toLowerCase().includes('sofia') || msg.sender === 'system') && (
  <div className="pt-1.5 mt-1 border-t border-emerald-200/60 dark:border-emerald-800/40 flex items-center justify-between">
    <button
      type="button"
      onClick={() => handleOpenCorrectionModal(msg)}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10.5px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-100/90 dark:bg-emerald-900/50 hover:bg-emerald-200 dark:hover:bg-emerald-800 transition-colors shadow-2xs hover:scale-102 cursor-pointer"
      title="Corrigir resposta da Sofia e retificar com o hóspede"
    >
      <span>✏️</span> Corrigir / Ensinar Sofia
    </button>
  </div>
)}
```

#### B. Componente do Modal de Correção
Inserir antes do fechamento do componente (`</Shell>`):
```tsx
{/* Modal de Correção & Aprendizado da Sofia */}
<Dialog open={correctModalOpen} onOpenChange={setCorrectModalOpen}>
  <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2 text-base font-black text-emerald-800 dark:text-emerald-300">
        <span>✏️</span> Corrigir Resposta & Ensinar Sofia
      </DialogTitle>
      <DialogDescription className="text-xs text-slate-500">
        Ensine a regra correta para a IA e retifique cordialmente com o hóspede no WhatsApp em 1 clique.
      </DialogDescription>
    </DialogHeader>

    <div className="space-y-4 py-2 text-xs overflow-y-auto">
      {/* Mensagem Original */}
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
          Mensagem Original da Sofia:
        </span>
        <p className="italic text-slate-700 dark:text-slate-300 leading-relaxed">
          "{selectedMsgForCorrection?.text}"
        </p>
      </div>

      {/* Orientação para a IA */}
      <div className="space-y-1.5">
        <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
          <span>🧠</span> O que a Sofia deve aprender? (Diretriz / Regra)
        </label>
        <Textarea
          rows={3}
          value={correctionGuideline}
          onChange={e => setCorrectionGuideline(e.target.value)}
          placeholder="Ex: O flat 905 tem cama queen e o checkout é às 11:00. O café da manhã inicia às 06:00 nos finais de semana."
          className="text-xs"
        />
        <p className="text-[10px] text-muted-foreground">
          Esta regra será assimilada na base de diretrizes ativas da Sofia.
        </p>
      </div>

      {/* Retificação para o Hóspede */}
      <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
            <span>💬</span> Mensagem Cordial de Retificação para o WhatsApp
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500">Enviar ao Hóspede</span>
            <input
              type="checkbox"
              checked={sendToGuest}
              onChange={e => setSendToGuest(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
          </div>
        </div>
        <Textarea
          rows={3}
          value={rectificationText}
          onChange={e => setRectificationText(e.target.value)}
          disabled={!sendToGuest}
          className="text-xs"
          placeholder="Mensagem cordial a ser enviada ao hóspede..."
        />
      </div>
    </div>

    <DialogFooter className="gap-2 sm:gap-0 pt-2">
      <Button variant="outline" size="sm" onClick={() => setCorrectModalOpen(false)}>
        Cancelar
      </Button>
      <Button
        size="sm"
        onClick={handleSaveCorrection}
        disabled={savingCorrection || !correctionGuideline.trim()}
        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5"
      >
        {savingCorrection ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        {sendToGuest ? 'Salvar Diretriz & Enviar Retificação' : 'Salvar Apenas na IA'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

### 4.2 Especificação para `artifacts/limpeza/src/pages/whatsapp-automation.tsx`

#### Card de Diretrizes & Calibrações Aprendidas
Inserir na Coluna Esquerda (`lg:col-span-7`), imediatamente antes do Card da Base de Conhecimento (linha 2282):
```tsx
{/* Card: Diretrizes & Calibrações Aprendidas (developerGuidelines) */}
<Card className="border border-purple-200/80 dark:border-purple-900/60 bg-gradient-to-br from-purple-50/40 via-white to-indigo-50/30 dark:from-slate-900 dark:to-purple-950/20 shadow-xs">
  <CardHeader className="pb-3">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <CardTitle className="text-base font-bold flex items-center gap-2 text-purple-950 dark:text-purple-200">
          <Sparkles className="w-4 h-4 text-purple-600" />
          Diretrizes & Calibrações Aprendidas
        </CardTitle>
        <Badge variant="outline" className="bg-purple-100 text-purple-800 dark:bg-purple-950 border-purple-200 text-[10px] font-bold">
          {aiConfig.developerGuidelines?.length || 0} Ativas
        </Badge>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => handleOpenAddGuidelineModal()}
        className="h-7 text-xs font-bold border-purple-300 text-purple-700 hover:bg-purple-100/60 dark:hover:bg-purple-950 gap-1"
      >
        <Plus className="w-3.5 h-3.5" />
        Nova Diretriz
      </Button>
    </div>
    <CardDescription className="text-xs text-purple-900/70 dark:text-purple-300/70">
      Regras de tom, estilo e correções factuais ensinadas via WhatsApp pelo Desenvolvedor (22998505276) ou pelo Web Chat.
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-3 pt-1">
    {(!aiConfig.developerGuidelines || aiConfig.developerGuidelines.length === 0) ? (
      <div className="p-4 text-center rounded-xl border border-dashed border-purple-200 dark:border-purple-800 text-xs text-muted-foreground space-y-1">
        <p className="font-semibold text-purple-800 dark:text-purple-300">Nenhuma diretriz aprendida registrada</p>
        <p className="text-[11px]">
          Envie comandos via WhatsApp para a Sofia do número 22998505276 (ex: <em>"responda de forma mais curta por favor"</em>) ou utilize o botão <strong>✏️ Corrigir / Ensinar Sofia</strong> no Web Chat.
        </p>
      </div>
    ) : (
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {aiConfig.developerGuidelines.map((guide: any, idx: number) => (
          <div
            key={guide.id || idx}
            className="p-3 rounded-xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 flex items-start justify-between gap-3 shadow-2xs hover:border-purple-400 transition-colors"
          >
            <div className="space-y-1 flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge className={
                  guide.category === 'tone' 
                    ? "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200 text-[9px] font-bold"
                    : "bg-blue-100 text-blue-800 border-blue-200 text-[9px] font-bold"
                }>
                  {guide.category === 'tone' ? '🎨 Tom & Estilo' : '📌 Fato / Regra'}
                </Badge>
                <Badge variant="outline" className="text-[9px] text-slate-500">
                  {guide.source === 'whatsapp_developer' ? '📱 WhatsApp Dev' : guide.source === 'web_chat_operator' ? '🖥️ Chat Web' : '⚙️ Manual'}
                </Badge>
                {guide.createdAt && (
                  <span className="text-[10px] text-slate-400">
                    {new Date(guide.createdAt).toLocaleDateString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-relaxed">
                {guide.rule}
              </p>
              {guide.sample && (
                <p className="text-[11px] text-slate-500 italic">
                  Amostra: "{guide.sample}"
                </p>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleTestGuidelineInSimulator(guide)}
                className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50"
                title="Testar no Simulador"
              >
                <Play className="w-3.5 h-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteGuideline(guide.id || idx)}
                className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50"
                title="Excluir Diretriz"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    )}
  </CardContent>
</Card>
```

---

## 5. Método de Verificação Independente

1. **Inspeção de Código e Arquivos**:
   - Inspecionar `artifacts/limpeza/src/pages/whatsapp-chat.tsx` na linha 1261 em diante para confirmar a integração do botão no balão.
   - Inspecionar `artifacts/limpeza/src/pages/whatsapp-automation.tsx` na linha 2282 para confirmar o posicionamento do Card de Diretrizes.
2. **Verificação de Compilação de Produção**:
   - Executar:
     ```powershell
     npm --prefix artifacts/limpeza run build
     ```
   - Condição de Sucesso: Exit code 0, saída em `artifacts/limpeza/dist/public/` sem erros de TypeScript ou Rollup.
3. **Condições de Invalidação**:
   - Quebra na compilação do Vite por tipagem incorreta de `ChatMessage` ou `aiConfig`.
   - Modificação acidental em arquivos fora do escopo ou execução indevida de testes globais proibidos por `AGENTS.md`.

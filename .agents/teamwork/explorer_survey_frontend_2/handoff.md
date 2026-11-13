# Handoff Report — Frontend Survey for Check-in Provider Toggle & Link Buttons

**Data:** 2026-10-07  
**De:** `teamwork_preview_explorer` (Explorer Survey Frontend)  
**Para:** Orchestrator (`parent`, ID: `0a1ba31b-b6bc-466b-8394-2ba72ae85fb5`) & Implementer Agents  
**Pasta:** `.agents/teamwork/explorer_survey_frontend_2`  

---

## 1. Observation

1. **Configuração e Persistência de Settings no Backend:**
   - No arquivo `artifacts/api-server/demo-server.mjs`:
     - Linhas 10042–10052: `app.get("/api/settings", (req, res) => { res.json({ ...db.settings, ... }); })` expõe o objeto `db.settings`.
     - Linhas 10054–10088: `app.patch("/api/settings", (req, res) => { ... saveDatabase(); res.json({ ...db.settings }); })` aceita atualizações parciais, grava em `data/database.json` e retorna o estado atualizado.
     - Linha 554: Inicialização de `settings: { ... }` na estrutura de `db`.
   - No arquivo `data/database.json`:
     - Chave raiz `"settings"` existe e contém parâmetros operacionais como `checkinTime: "14:00"`, `checkoutTime: "12:00"`, `hotelAddress`, `adminWhatsApp`, etc.

2. **Consumo de Settings no Frontend:**
   - No arquivo `artifacts/limpeza/src/pages/settings.tsx`:
     - Linhas 4–9: Importações de `@workspace/api-client-react`: `useGetSettings`, `useUpdateSettings`, `getGetSettingsQueryKey`.
     - Linha 36: `const { data: settings } = useGetSettings()`.
     - Linhas 41–50: `useUpdateSettings({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() }) } } })`.
   - No arquivo `lib/api-client-react/src/generated/api.ts`:
     - Linhas 1416–1420: `getGetSettingsQueryKey = () => ['/api/settings'] as const`.
     - Linhas 1478–1487: `updateSettings` faz chamada `PATCH /api/settings`.

3. **Componentes Visuais Disponíveis:**
   - `artifacts/limpeza/src/components/ui/switch.tsx`: Componente `Switch` baseado em `@radix-ui/react-switch` com classes Tailwind `data-[state=checked]:bg-primary` e transição `translate-x-4`.
   - `artifacts/limpeza/src/components/ui/badge.tsx`: Componente `Badge` com variantes e suporte a Tailwind `cn()`.
   - `artifacts/limpeza/src/components/ui/card.tsx`: Estrutura padronizada de Cards (`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`).
   - `lucide-react`: Ícones `ShieldCheck`, `Building2`, `CheckCircle2`, `AlertTriangle`, `Copy`, `ExternalLink`, `FileText`, `RefreshCw`, etc. disponíveis no projeto.

4. **Pontos de Disparo e Cópia de Link de Check-in:**
   - `artifacts/limpeza/src/components/reservation-hover-card.tsx`:
     - Linha 196: `const preCheckinUrl = `${originUrl}/pre-checkin/${resItem.code || resItem.id}``
     - Linhas 781–790: Botão de acesso ao check-in: `<a href={preCheckinUrl} ...><FileText /><span>Check-in</span></a>`.
   - `artifacts/limpeza/src/pages/pms-calendar.tsx`:
     - Linhas 7353–7361: Item `precheckin` no array `linksList` dentro do Modal Central de Links Úteis.
     - Linha 7417: Função `handleCopyAllFormatted` montando `📝 *Pré Check-in Digital:*\n${origin}/pre-checkin/${resCode}`.
     - Linhas 5664–5825: Seção de disparo manual de WhatsApp com Z-API via `dispatchQuickMessage`.
   - `artifacts/limpeza/src/hooks/use-quick-messages.ts`:
     - Linha 368: `const linkCheckin = `${origin}/pre-checkin/${resCode}``
     - Linha 409: `"{{link_checkin_digital}}": linkCheckin`
     - Linhas 163, 452–468: Botão `btn_chk` resolvido em `buildFullWhatsAppTextMessage`.
   - `artifacts/limpeza/src/pages/reception-tablet.tsx`:
     - Linhas 771–783: Geração de link `${window.location.origin}/pre-checkin/${item.code || item.id}?guest=...` e disparo WhatsApp.

5. **Build Workflow do Frontend:**
   - `artifacts/limpeza/package.json`: Linha 8: `"build": "vite build --config vite.config.ts"`.
   - `artifacts/limpeza/vite.config.ts`:
     - Linha 45: `outDir: path.resolve(import.meta.dirname, 'dist/public')`.
     - Linha 46: `emptyOutDir: true`.
     - Linhas 50–55: `entryFileNames: 'assets/index.js'`, `chunkFileNames: 'assets/[name]-[hash].js'`, `assetFileNames: 'assets/index.css'`.

---

## 2. Logic Chain

1. **Premissa de Persistência Imediata (R1):** Como o backend já processa `PATCH /api/settings` e persiste em `data/database.json` via `saveDatabase()`, a adição do campo `checkinProvider` (`'proprio'` | `'gov_fnrh'`) na rota `PATCH /api/settings` e `GET /api/settings` permite alternância imediata em memória sem reinicialização de processos.
2. **Premissa de Reatividade Frontend sem Reload (R1):** Como `settings.tsx` utiliza TanStack Query (`useGetSettings` e `useUpdateSettings`) com invalidação de query key `['/api/settings']`, alterar a chave seletora provoca um refetch silencioso em background, propagando instantaneamente o novo provedor para a árvore de componentes sem recarregar o navegador.
3. **Premissa de Resolução Centralizada de Links (R3 e R4):** A duplicação da concatenação literal `pre-checkin/${resCode}` em múltiplos arquivos (`reservation-hover-card.tsx`, `pms-calendar.tsx`, `use-quick-messages.ts`, `reception-tablet.tsx`) é a causa de links estáticos. A criação de um helper utilitário compartilhado `getCheckinUrl(reservation, guestIndex, baseUrl)` unifica a resolução em todos os botões, mensagens e modais do sistema.
4. **Premissa de Fallback Resiliente:** Se `checkinProvider === 'gov_fnrh'`, mas `reservation.serproPrecheckinUrl` não existir ou a API do SERPRO apresentar indisponibilidade/timeout, a função helper retorna transparentemente o link do formulário próprio (`/pre-checkin/${code}`), garantindo continuidade operacional sem falhas ao hóspede ou à recepção.
5. **Premissa de Build & Deploy:** Toda modificação em `artifacts/limpeza/src` deve ser compilada com `npm run build` na pasta `artifacts/limpeza`, gerando os assets finais em `artifacts/limpeza/dist/public` para que o backend Express sirva os arquivos estáticos atualizados em produção.

---

## 3. Caveats

1. **Credenciais Oficiais do SERPRO:** Em ambiente local de desenvolvimento, as credenciais da API SERPRO (usuário, senha e CPF solicitante) podem não estar configuradas para o ambiente de produção do Ministério do Turismo. Um mock ou ambiente de `homologacao` (`https://gateway.apiserpro.serpro.gov.br/...` ou sandbox) é essencial para validar as chamadas sem depender de certificados reais em runtime.
2. **Limitação de Permissão Desta Fase (Read-Only):** Este relatório cumpriu rigorosamente a restrição de não editar código-fonte e não rodar comandos de build. Toda implementação de código será executada pelo agente implementador designado.
3. **Outros Canais de E-mail:** Os templates de e-mail transacionais em `artifacts/api-server/mail-service.mjs` são despachados no backend; a sincronização de URLs nos e-mails depende do trabalho conjunto no servidor Express e mirror em `scripts/demo-server.mjs`.

---

## 4. Conclusion

A arquitetura do frontend da CorpFlats está completamente apta e estruturada para receber a chave seletora global e os botões de cópia de link de check-in:
- **Painel Administrativo:** O componente visual de Toggle Switch deve ser inserido como um Hero Card em `artifacts/limpeza/src/pages/settings.tsx`, com badges de modo ativo e saúde da API SERPRO.
- **Helper Centralizado:** Deve ser criado `artifacts/limpeza/src/lib/checkin-url.ts` para unificar a resolução de links no frontend.
- **Ações na Interface:** Os botões em `reservation-hover-card.tsx`, `pms-calendar.tsx`, `use-quick-messages.ts` e `reception-tablet.tsx` devem ser conectados ao helper para copiar ou despachar o link correto.

---

## 5. Verification Method

Para verificar independentemente as constatações deste relatório:

1. **Inspecionar Settings e Componentes de UI:**
   ```bash
   # Visualizar rota de settings e hook TanStack Query
   cat "artifacts/limpeza/src/pages/settings.tsx" | head -n 50
   # Verificar existência do componente Switch
   cat "artifacts/limpeza/src/components/ui/switch.tsx"
   ```
2. **Inspecionar Geração de Links de Check-in Existentes:**
   ```bash
   # Verificar geração em reservation-hover-card
   grep -n "preCheckinUrl" "artifacts/limpeza/src/components/reservation-hover-card.tsx"
   # Verificar geração em use-quick-messages
   grep -n "linkCheckin" "artifacts/limpeza/src/hooks/use-quick-messages.ts"
   # Verificar geração no calendário PMS
   grep -n "precheckin" "artifacts/limpeza/src/pages/pms-calendar.tsx"
   ```
3. **Verificar Configuração do Build Vite:**
   ```bash
   cat "artifacts/limpeza/vite.config.ts" | grep -A 10 "outDir"
   ```
4. **Condição de Invalidação:** Caso `settings.tsx` fosse refatorado para não usar TanStack Query ou caso o build de Vite tivesse seu `outDir` apontando para outro diretório fora de `dist/public`, o mapeamento deste relatório precisaria ser ajustado.

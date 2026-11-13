# Relatório de Investigação Técnica do Frontend & Transição de Data das 18:00
**Componente**: Governança & Integridade Operacional (CorpFlats / Guest-Flow-Manager)  
**Módulo Focado**: `artifacts/limpeza` (`src/pages/dashboard.tsx`, `src/components/flat-card.tsx`, `src/pages/login.tsx`)  
**Data da Investigação**: 2026-09-29  
**Investigador**: Frontend UI Explorer  

---

## 1. Sumário Executivo

A auditoria nas rotinas de governança identificou com exatidão a causa raiz da confusão operacional relatada no **Flat 904** e no painel geral de governança após as 18:00.

O problema **não** se originou em dados corrompidos no banco de dados para o Flat 904, mas sim em uma **falha crítica de experiência e linguagem na interface do usuário (UI/UX)** decorrente da transição silenciosa de data às 18:00 somada a textos semanticamente incoerentes no card de limpeza:
1. **Transição Automática Silenciosa**: Às 18:00, a função `getDefaultDate()` avança silenciosamente a data selecionada para o dia seguinte (`D+1`).
2. **Desorientação Temporal**: Ao avançar para o dia seguinte, o badge visual `"Hoje"` desaparece sem qualquer indicação substituta (ex.: sem avisar que a tela está no modo *"Previsão de Amanhã"* ou *"Próximo Turno"*). O subtítulo da tela continuava exibindo para a camareira: *"Sua lista de quartos para higienização hoje"*.
3. **Vocabulário Inadequado no Card**: O Flat 904 (hóspede Jorge, check-in 28/09 e check-out 29/09) apareceu no dia 29/09 com o status vermelho **"Sujo"**, botão verde **"Desocupado"** e o rótulo no pretérito perfeito **"Saiu: Jorge"**. Para qualquer gestor acessando o sistema na noite do dia 28/09, a leitura imediata foi: *"O Jorge já saiu? O quarto está desocupado e sujo? Isso é uma faxina atrasada de ontem que esquecemos de fazer?"*, quando na verdade Jorge estava dormindo no apartamento e só sairia no dia seguinte às 12:00.
4. **Carry-Over Confuso**: Faxinas não concluídas do dia 28/09 foram carregadas para o dia 29/09 com o badge *"Não limpo em 28/09 (dia anterior)"*, enquanto o dia 28/09 ainda era o dia corrente!

O relatório a seguir detalha cada linha de código envolvida, comprova o fluxo exato e propõe uma arquitetura de UI robusta e à prova de falhas para o desenvolvedor implementar.

---

## 2. Anatomia do Código & Mecânica da Virada das 18:00

### 2.1. A Lógica de `getDefaultDate()` em `dashboard.tsx`
Localização: `artifacts/limpeza/src/pages/dashboard.tsx` (linhas 37–62)

```typescript
function getDefaultDate(userRole?: string) {
  const now = new Date()
  if (now.getHours() >= 18) {
    return format(addDays(now, 1), "yyyy-MM-dd")
  }
  return format(now, "yyyy-MM-dd")
}
```

**Problemas Observados no Código:**
1. **Horário Rígido Local**: Avalia `now.getHours() >= 18` usando o relógio local do navegador. A partir das 18:00:00, retorna incondicionalmente a data de amanhã.
2. **Parâmetro Ignorado**: O argumento `userRole` é passado mas nunca utilizado na função.
3. **Inicialização no Estado do React**:
   ```typescript
   const defaultDate = useMemo(() => getDefaultDate(user?.role), [user?.role])
   const [selectedDateStr, setSelectedDateStr] = useState<string>(defaultDate)
   
   const initialDateSetRef = useRef(false)
   useEffect(() => {
     if (user?.role && !initialDateSetRef.current) {
       initialDateSetRef.current = true
       setSelectedDateStr(getDefaultDate(user.role))
     }
   }, [user?.role])
   ```
4. **Ignora Query Param da URL**: `dashboard.tsx` importa `useLocation` de `wouter`, mas nunca lê os parâmetros de busca (`?date=YYYY-MM-DD`). Se a tela for recarregada ou acessada via URL específica, ela ignora o parâmetro e força `getDefaultDate()`.

### 2.2. Duplicação de Regra em `login.tsx`
Localização: `artifacts/limpeza/src/pages/login.tsx` (linhas 19–29)

```typescript
const getRedirectDateStr = () => {
  const now = new Date()
  let redirectDate = now
  if (now.getHours() >= 18) {
    redirectDate = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  }
  const yyyy = redirectDate.getFullYear()
  const mm = String(redirectDate.getMonth() + 1).padStart(2, '0')
  const dd = String(redirectDate.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
```
O login redireciona para `/dashboard?date=${getRedirectDateStr()}`, reimplementando a mesma regra das 18:00 com manipulação manual de milissegundos em vez de `date-fns`.

### 2.3. O Cabeçalho de Navegação de Data em `dashboard.tsx`
Localização: `artifacts/limpeza/src/pages/dashboard.tsx` (linhas 280–322)

```tsx
const parsedDate = selectedDateStr ? parseISO(selectedDateStr) : new Date()
const displayDate = format(parsedDate, "dd 'de' MMMM", { locale: ptBR })
const isToday = selectedDateStr === format(new Date(), "yyyy-MM-dd")
```
Renderização visual:
```tsx
<div className="flex items-center gap-1 bg-card border border-border/80 rounded-xl p-1 shadow-2xs">
  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setDate(format(subDays(parsedDate, 1), "yyyy-MM-dd"))}>
    <ChevronLeft className="w-4 h-4" />
  </Button>
  <div className="px-3 text-center min-w-[130px]">
    <div className="font-bold text-sm capitalize">{displayDate}</div>
    {isToday && <div className="text-[11px] text-primary font-semibold">Hoje</div>}
  </div>
  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setDate(format(addDays(parsedDate, 1), "yyyy-MM-dd"))}>
    <ChevronRight className="w-4 h-4" />
  </Button>
</div>
```

**Diagnóstico Visual**:
- Quando `selectedDateStr` é hoje: exibe `"28 de setembro"` e o pill `"Hoje"`.
- Quando dá 18:00 e vira para o dia 29:
  - `selectedDateStr` vira `"2026-09-29"`.
  - `isToday` passa a ser `false`.
  - O pill `"Hoje"` **desaparece**.
  - O cabeçalho exibe apenas: `[ < ]  29 de setembro  [ > ]`.
  - **Não há nenhuma tag**, badge ou texto dizendo *"Amanhã"*, *"Previsão"*, ou *"Próximo Turno"*.
  - O subtítulo da página logo acima (linhas 293–295) continua estático:
    `{isAdmin ? "Visão geral e gestão operacional dos quartos" : "Sua lista de quartos para higienização hoje"}`
  - Uma camareira ou administrador lendo aquilo tem a certeza psicológica de que está na fila de faxina de "hoje".

---

## 3. Rastreamento Detalhado: O Cenário do Flat 904

### 3.1. Dados no Banco (`data/database.json`)
- **Reserva do Jorge**:
  - Código: `RES-904-0297`
  - Apartamento: Flat 904 (`flatId: 16`)
  - Check-in: `2026-09-28` às 14:00
  - Check-out: `2026-09-29` às 12:00
  - Criada em: `2026-09-28T22:44:38.513Z` (aprox. 19:44 BRT)
- **Registro de Limpeza Gerado (`cleaningRequest` ID 1345)**:
  - `flatId`: 16, `flatNumber`: "904"
  - `requestDate`: `"2026-09-29"`
  - `effectiveDate`: `"2026-09-29"`
  - `source`: `"checkout"`
  - `status`: `"dirty"`
  - `isVacant`: `true` (padrão de novos registros de checkout)
  - `leavingGuest`: `"Jorge"`
  - `isPendingFromPreviousDay`: `false`

### 3.2. A Cadeia de Eventos no Dashboard (Noite de 28/09)

1. Eram aproximadamente 19:45 do dia 28/09 quando o usuário abriu o painel de governança.
2. Como `19 >= 18`, `getDefaultDate()` calculou `2026-09-29`.
3. O painel chamou `/api/reservations/checkouts?date=2026-09-29`.
4. A API retornou os check-outs previstos para o dia 29/09, entre eles o **Flat 904**.
5. No componente `FlatCard` (`artifacts/limpeza/src/components/flat-card.tsx`):
   - **Status Card**:
     - `status: "dirty"` -> Estilo com fundo vermelho/rosado (`bg-rose-50`), borda vermelha e badge `AlertCircle Sujo`.
   - **Identificação do Hóspede**:
     - Linhas 1120–1125:
       ```tsx
       {flat.leavingGuest && (
         <div className="flex items-start gap-1.5 text-slate-700 dark:text-slate-300">
           <span className="font-bold text-slate-500 shrink-0">Saiu:</span>
           <span className="font-semibold break-words">{flat.leavingGuest}</span>
         </div>
       )}
       ```
       O card estampou em destaque: **"Saiu: Jorge"**!
   - **Ocupação do Quarto**:
     - Linhas 856–858:
       ```typescript
       const isOccupied = typeof request?.isVacant === "boolean"
         ? !request.isVacant
         : (typeof flat.isOccupied === "boolean" ? flat.isOccupied : true)
       ```
       Como `request.isVacant` é `true`, `isOccupied` avaliou para `false`.
       O botão de ocupação (linhas 960–980) exibiu com ícone verde de porta aberta: **"Desocupado"**!
   - **Se Houvesse Check-in no dia 29/09**:
     - Linhas 1099–1100:
       `<Badge ...><span>🟢 Entra Hoje</span></Badge>`
     - Linhas 1143–1144:
       `<span>🟢 Há novo check-in previsto para este flat hoje.</span>`
       Mesmo estando no dia 29 (amanhã), o card carimbaria *"Entra Hoje"*.

6. **Impacto Psicológico no Usuário**:
   O administrador ou anfitrião olha o card às 19:50 do dia 28/09 e lê:
   - **Apt 904**
   - **Status: Sujo**
   - **Desocupado**
   - **Saiu: Jorge**
   
   O hóspede Jorge acabou de chegar na tarde do dia 28/09 e está dentro do quarto. Diante dessa tela, a reação imediata foi de sobressalto:
   - *"O Jorge fez check-out antecipado e foi embora?"*
   - *"Isso é uma saída de ontem que ficou sem limpar?"*
   - *"Por que o sistema está dizendo que o quarto está sujo e desocupado se o Jorge está aí?"*

7. **A Agravação dos Quartos Pendentes (Carry-Over)**:
   Na API (`artifacts/api-server/demo-server.mjs`, linhas 5844–5883), qualquer quarto que não foi concluído em 28/09 é transferido para 29/09 como carry-over:
   ```javascript
   if (typeof getTodayStr === "function" && dateStr >= getTodayStr()) {
     // carrega pendências não limpas de dias anteriores...
     isPendingFromPreviousDay: true
   ```
   No `FlatCard` (linhas 1091–1096), isso gera o badge:
   `⚠️ Não limpo em 28/09` (ou `dia anterior`).
   
   Ao olhar para o painel às 18:30 do dia 28/09, o usuário viu:
   - Quartos com aviso *"Não limpo em 28/09"* (tratando o dia de hoje como dia passado e atrasado).
   - O Flat 904 dizendo *"Saiu: Jorge"* e *"Sujo"*.
   - A data no topo dizendo *"29 de setembro"*.

A confusão era 100% inevitável com o design atual da interface.

---

## 4. Análise dos Indicadores de Pendência, Atraso e Cabeçalhos

### 4.1. Defeito na Precedência de `isOccupied` em `FlatCard`
No backend (`artifacts/api-server/demo-server.mjs`, linhas 5961–5964):
```javascript
const isFuture = dateStr > getTodayStr();
const isVacant = isFuture ? Boolean(req_.isVacantExplicitlySet) : Boolean(req_.isVacant);
const isOccupied = !isVacant;
```
O backend sabe que em datas futuras o quarto **não** está vago a menos que tenha sido explicitamente marcado como vago. E envia `flat.isOccupied = true`.
Porém, no frontend (`FlatCard.tsx` linha 856):
```typescript
const isOccupied = typeof request?.isVacant === "boolean"
  ? !request.isVacant
  : (typeof flat.isOccupied === "boolean" ? flat.isOccupied : true)
```
O frontend dá precedência a `request.isVacant`. Como `request.isVacant` veio `true` no objeto do banco, o card atropela a inteligência do backend e mostra "Desocupado".

### 4.2. Falha de Ordenação no Dashboard
Em `dashboard.tsx` (linhas 207–226):
```typescript
const aPending = a?.isPendingFromPreviousDay || a?.cleaningRequest?.isPendingFromPreviousDay ? 1 : 0
```
As pendências de dias anteriores são jogadas para o topo da lista. Ao abrir o dia de amanhã (29/09), os quartos não limpos de hoje (28/09) ficam no topo rotulados como pendências atrasadas, empurrando os check-outs reais do dia 29 para baixo ou misturando-os.

### 4.3. Falta do Conceito de "Turno de Amanhã / Previsão"
Na hotelaria e na governança, após as 18:00 existem duas necessidades concorrentes:
1. **Fechamento Operacional de Hoje**: O supervisor precisa conferir se as camareiras terminaram os quartos de hoje, quem limpou o quê, e encerrar o dia.
2. **Previsão Operacional de Amanhã**: A governanta precisa ver a escala de amanhã, quem sai, quem entra, necessidades de cama de solteiro separada e materiais para separar.

Impor uma transição unidirecional e cega às 18:00 sem botão de alternância explícito viola o fluxo operacional da governança.

---

## 5. Proposta de Arquitetura & Design Robusto

Para sanar em definitivo o problema, recomenda-se a seguinte arquitetura de interface e comportamento:

### 5.1. Banner de Alerta & Indicador de Modo Operacional
Quando `selectedDateStr > todayStr` (ou quando a virada das 18:00 estiver ativa):
1. **Banner Superior de Contexto (Modo Previsão)**:
   Acima da lista de cartões (logo abaixo do cabeçalho de navegação), exibir uma barra destacada com visual moderno (gradiente roxo/índigo com ícone de lua e estrelas):
   ```
   ┌─────────────────────────────────────────────────────────────────────────────────────────────┐
   │ 🌙 MODO PREVISÃO — Amanhã, 29 de Setembro                                                  │
   │ Você está visualizando as saídas e preparações previstas para o próximo turno.             │
   │ Os hóspedes continuam nos quartos até o horário regular de check-out.                      │
   │                                                         [ ↩️ Voltar para o Turno de Hoje ] │
   └─────────────────────────────────────────────────────────────────────────────────────────────┘
   ```
2. **Badge no Navegador de Data**:
   Ao lado ou abaixo do texto da data no navegador central:
   - Se `selectedDateStr === todayStr`: `<Badge className="bg-emerald-600 text-white">Hoje</Badge>`
   - Se `selectedDateStr === tomorrowStr`: `<Badge className="bg-purple-600 text-white font-bold">🔮 Previsão de Amanhã (Próximo Turno)</Badge>`
   - Se `selectedDateStr < todayStr`: `<Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300">📅 Histórico Retroativo</Badge>`
   - Se `selectedDateStr > tomorrowStr`: `<Badge variant="outline" className="bg-blue-100 text-blue-900 border-blue-300">📅 Previsão Futura</Badge>`

3. **Seletor de Atalho Rápido de Turno**:
   Adicionar no topo botões segmentados de 1 clique:
   `[ 🟢 Hoje (28/09) ]`  `[ 🔮 Amanhã (29/09) ]`
   Isso permite que a governanta alterne entre o fechamento de hoje e a programação de amanhã sem precisar clicar nas setinhas `<` e `>`.

### 5.2. Linguagem Temporal Inteligente nos Cards (`FlatCard`)
Criar uma verificação temporal no card:
`const isViewingFuture = date > format(new Date(), "yyyy-MM-dd")`
`const isViewingToday = date === format(new Date(), "yyyy-MM-dd")`

1. **Rótulo do Hóspede que Sai**:
   - Se `isViewingFuture`:
     Exibir: **`Saída Prevista: {flat.leavingGuest}`** ou **`Check-out amanhã: {flat.leavingGuest}`** (opcionalmente com horário `(às 12:00)`).
     **NUNCA** usar *"Saiu:"* no passado para datas futuras!
   - Se `isViewingToday`:
     - Se `status === "clean"`: *"Saiu: {flat.leavingGuest}"*
     - Se `status === "dirty"`: *"Check-out hoje: {flat.leavingGuest}"* ou *"Saída: {flat.leavingGuest}"*

2. **Rótulo do Hóspede que Entra**:
   - Se `isViewingToday`: `"🟢 Entra Hoje"`
   - Se `isViewingFuture`: `"🟢 Entra Amanhã"` (se for amanhã) ou `"🟢 Entra em {format(parsedDate, 'dd/MM')}"`
   - O aviso para a camareira (linha 1144) deve dizer:
     `"🟢 Há novo check-in previsto para este flat nesta data."` (em vez de *"hoje"*).

3. **Ocupação Correta do Quarto**:
   - No cálculo de `isOccupied`, priorizar `flat.isOccupied`:
     ```typescript
     const isOccupied = typeof flat.isOccupied === "boolean" 
       ? flat.isOccupied 
       : (typeof request?.isVacant === "boolean" ? !request.isVacant : true)
     ```
   - Em modo previsão futura, se o hóspede ainda está hospedado hoje, o botão de ocupação deve refletir que o quarto está ocupado pelo hóspede da reserva atual.

4. **Badge de Pendência / Carry-Over**:
   - Se `isViewingFuture` e `originalRequestDate === todayStr`:
     Exibir: `⚠️ Pendente do turno de hoje ({format(today, 'dd/MM')})`
     Em vez de dizer que *"não foi limpo em dia anterior"*.

### 5.3. Subtítulo Dinâmico do Dashboard
Em `dashboard.tsx`:
- Se `isViewingFuture`:
  `"Previsão de check-outs e higienizações para amanhã. Quarto ocupado até o horário de check-out."`
- Se `isViewingToday`:
  `"Sua lista de quartos para higienização hoje"`

---

## 6. Verificação do Ambiente de Build (`artifacts/limpeza`)

Para garantir conformidade estrita com o `AGENTS.md` e a estabilidade da produção:

1. **Configuração do Projeto**:
   - `artifacts/limpeza/package.json` define scripts:
     - `"build": "vite build --config vite.config.ts"`
     - `"typecheck": "tsc -p tsconfig.json --noEmit"`
   - `vite.config.ts` direciona a saída para:
     `outDir: path.resolve(import.meta.dirname, 'dist/public')` com `emptyOutDir: true`.

2. **Teste de Build Executado**:
   - Executado: `npm run build` dentro de `artifacts/limpeza`.
   - Resultado: **Sucesso absoluto (Exit code 0)**.
   - Duração: 15.66s.
   - Arquivos gerados e validados em `artifacts/limpeza/dist/public/`:
     - `index.html` (2.67 kB)
     - `assets/index-DoC9ZuHb.css` (353.95 kB)
     - `assets/index-BJxcc1mR.js` (2,911.48 kB)

3. **Diretrizes para o Desenvolvedor que Aplicará a Correção**:
   - Após editar `artifacts/limpeza/src/pages/dashboard.tsx` e `artifacts/limpeza/src/components/flat-card.tsx`:
     1. Executar `npm run build` na pasta `artifacts/limpeza`.
     2. Garantir que os arquivos compilados em `artifacts/limpeza/dist/` sejam incluídos no commit.
     3. Executar `git push` obrigatoriamente conforme regra de ouro do `AGENTS.md`.

---

## 7. Conclusão & Próximos Passos

A investigação está concluída e comprova detalhadamente a causa raiz dos sintomas observados no Flat 904. As propostas fornecem um guia completo, cirúrgico e de baixo risco para a implementação no frontend.

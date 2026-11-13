# Handoff Report - Marcação Obrigatória de Fumo na Limpeza da Camareira, Cadastro do Hóspede e Reservas Futuras

**Data:** 03/11/2026  
**Implementador:** implementer_1  
**Status da Tarefa:** Concluído com 100% de Testes Pontuais Aprovados

---

## 1. Escopo & Requisitos Atendidos

### R1. Obrigatoriedade no Card da Camareira (FlatCard) sem Modais Invasivos
- **Problema anterior:** A camareira concluía a limpeza sem registrar se o hóspede havia fumado no quarto.
- **Implementação:**
  - No `artifacts/limpeza/src/components/flat-card.tsx`, ao clicar em "Concluir Limpeza" (`newStatus === "clean"`), caso o tempo mínimo de limpeza já tenha sido cumprido, o card ativa um overlay em tela cheia do próprio card (`data-smoking-prompt="true"`, classe `absolute inset-0 z-30`).
  - O prompt exibe com destaque: *"O hóspede fumou no quarto?"* com botões táteis e rápidos:
    - **"Sim, fumou"** (cor `rose-600`, ícone de cigarro).
    - **"Não fumou"** (cor `emerald-600`, ícone de check).
  - O card é finalizado com o envio de `smokedInRoom: true/false` no corpo do `PATCH /api/cleaning/assignments/:requestId/status`.
  - No modal administrativo (`adminCleanModal`), a pergunta sobre fumo também foi integrada como um toggle opcional.

### R2. Reversão e Alternância no Card da Camareira
- Caso a camareira ou a governança tenha marcado por engano ou precise alternar o status:
  - No topo do card (header), é exibido o badge interativo `data-smoking-badge="true"` com `🚬 Fumou (Desmarcar)` que permite alternar/desmarcar diretamente com um clique.
  - Na seção de status concluído, se marcado como fumante, exibe aviso vermelho com botão *"Desmarcar"*. Se não marcado, exibe botão discreto *"Marcar fumo no quarto"*.
  - Foi criado o endpoint backend dedicado `PATCH /api/cleaning/assignments/:requestId/smoking` para alternar/reverter a marcação a qualquer momento.

### R3. Propagação ao Perfil do Hóspede (`db.guests`) e Reservas Futuras
- **Backend (`artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`):**
  - Implementada a função centralizada `updateSmokingStatusForCleaning(cleaningItem, isSmoker, userAuth, targetDate)`.
  - Localiza a reserva associada à limpeza (via `reservationId`, `autoReservationId`, flat + checkout date, ou nome do hóspede).
  - Atualiza o cadastro do hóspede em `db.guests`:
    - Define `isSmoker: true/false`.
    - Atualiza `smokedInRoom: true/false`.
    - Adiciona ou remove a tag `"Fumante"` no array `tags`.
    - Registra notas no perfil do hóspede com timestamp e responsável.
  - Atualiza a reserva atual e todas as reservas futuras do mesmo hóspede (identificado por `guestId`, `hospede_id`, `guestDocument`, `cpf` ou nome normalizado):
    - `isSmoker: true/false`.
    - `smokerGuestAlert: true/false`.
    - `guestSmoked: true/false`.
    - `smokingAlert: true/false`.
  - Propaga a informação para o endpoint `/api/pms/calendar`, enriquecendo reservas com a flag de fumante do hóspede vinculado.
- **Frontend:**
  - **PMS Calendário (`pms-calendar.tsx`):**
    - Exibe badge `data-smoker-alert-badge="true"` (`🚬 Fumante`) diretamente nos blocos de reserva da timeline.
    - Exibe badge `🚬 Hóspede Fumante` no cabeçalho do diálogo de detalhes da reserva.
    - Exibe alerta de equipe em destaque âmbar na aba de detalhes com aviso de quarto não-fumante.
  - **Hover Card de Reserva (`reservation-hover-card.tsx`):**
    - Exibe banner de alerta de fumo com ícone `AlertTriangle` avisando a equipe ao passar o mouse sobre a reserva.
  - **CRM de Hóspedes (`crm-guests.tsx`):**
    - Exibe badge `🚬 Fumante` na listagem de hóspedes.
    - Exibe badge no cabeçalho do modal de detalhes do hóspede.

---

## 2. Arquivos Alterados

1. `artifacts/api-server/demo-server.mjs`:
   - Lógica de persistência de fumo em limpezas, reservas e cadastro de hóspedes.
   - Rotas `PATCH /api/cleaning/assignments/:requestId/status` e `PATCH /api/cleaning/assignments/:requestId/smoking`.
   - Mapeamento no calendário PMS `/api/pms/calendar`.
2. `scripts/demo-server.mjs`:
   - Espelho idêntico de `artifacts/api-server/demo-server.mjs`. Paridade SHA-256 verificada e mantida (37/37 arquivos PASS).
3. `artifacts/limpeza/src/components/flat-card.tsx`:
   - Overlay sem modal invasivo para marcação rápida de fumo ao concluir a limpeza.
   - Botões e badges interativos de alternância / reversão no card.
4. `artifacts/limpeza/src/pages/pms-calendar.tsx`:
   - Alertas visuais na linha do tempo, cabeçalho da modal e aba de detalhes.
5. `artifacts/limpeza/src/components/reservation-hover-card.tsx`:
   - Banner de alerta rápido para hóspedes fumantes.
6. `artifacts/limpeza/src/pages/crm-guests.tsx`:
   - Badges visuais de identificação de hóspede fumante.
7. `artifacts/limpeza/dist/`:
   - Compilação limpa de produção executada (`npm run build`).
8. `tests/smoking-marking-workflow.test.mjs`:
   - Teste de ponta a ponta validando o fluxo de ponta a ponta (paridade, UI estática, marcação, reversão e re-marcação).

---

## 3. Evidência de Testes

Executado o script de teste pontual exclusivo:
`node tests/smoking-marking-workflow.test.mjs`

```text
🧪 Iniciando teste pontual: Fluxo de Marcação de Fumo na Limpeza da Camareira, Cadastro e Reservas Futuras...
✅ 1. Paridade byte-a-byte verificada entre artifacts/api-server e scripts/.
✅ 2. Verificação estática de UI em FlatCard aprovada (R1 e R2).
✅ 3. Verificação estática das sinalizações visuais no PMS, Hover Card e CRM aprovada (R3).
✅ 4.1. Marcação de fumo: atualizou card, cadastro do hóspede e reserva futura com sucesso.
✅ 4.2. Reversão da indicação: limpou card, cadastro e reservas futuras com sucesso.
✅ 4.3. Alternância reativa: re-marcou cadastro e reservas futuras com sucesso.

🎉 TODOS OS TESTES PONTUAIS DE FUMO NA LIMPEZA PASSARAM COM 100% DE SUCESSO!
```

# Roteiro de Verificação Manual — Notificação por Voz de Check-out Exclusiva para Repositoras

Este roteiro descreve o procedimento passo a passo para auditoria e homologação operacional do sistema resiliente de anúncios por voz de check-out, garantindo o cumprimento de todos os critérios de aceitação (R1, R2 e R3).

---

## Pré-requisitos
- Navegador moderno com suporte à Web Speech API (`window.speechSynthesis`): Google Chrome, Microsoft Edge ou Safari.
- Servidor da aplicação em execução (local ou staging).
- Duas abas ou janelas do navegador abertas (Aba A: Portal da Repositora; Aba B: Recepção/PMS ou DevTools).

---

## Procedimento Passo a Passo

### Passo 1 — Autenticação Exclusiva como Repositora (R1)
1. Abra a aplicação no navegador e navegue até a rota do Portal da Repositora:
   ```
   http://localhost:5000/frigobar-reposicao
   ```
2. Realize a autenticação informando o PIN de repositora configurado (ex: `1234` ou o PIN cadastrado em sua equipe).
3. Observe a mensagem de boas-vindas: *"Bem-vinda, Repositora!"*.
4. **Validação de Segmentação (R1):**
   - Abra o console do desenvolvedor (`F12` > Console) e execute:
     ```js
     localStorage.getItem("corpflats_anserve_token");
     ```
     O token deve estar presente.
   - Abra outra aba logada como usuário com perfil `recepcao`, `camareira` ou `admin` (`/painel-aovivo` ou `/dashboard`).
   - Verifique que na aba de outros perfis NÃO há disparos de voz nem inicialização do sintetizador para check-outs.

---

### Passo 2 — Teste de Síntese de Voz e Desbloqueio de Áudio
1. No cabeçalho da página `/frigobar-reposicao`, localize e clique no botão **"Testar Voz"** (ícone de volume).
2. **Resultado Esperado:**
   - O navegador desbloqueia o áudio da Web Speech API nativa.
   - O áudio sintetizado em português (`pt-BR`) deve enunciar claramente:
     > *"Check-out flat 1004"*
   - Um toast de confirmação surge na tela: *"Voz de Check-out Ativa — Sintetizando: Check-out flat 1004"*.
3. Teste flats alfanuméricos no console se desejar:
   ```js
   // Teste direto de flat alfanumérico
   window.dispatchEvent(new CustomEvent("testVoice", { detail: "202-B" }));
   ```

---

### Passo 3 — Simulação de Modo Offline nas Ferramentas do Desenvolvedor (R2)
1. Na aba da Repositora (`/frigobar-reposicao`), abra as ferramentas de desenvolvedor (`F12`).
2. Acesse a aba **Network** (Rede).
3. No seletor de limitação de rede (*Throttling*), altere de **No throttling** para **Offline**.
4. Observe que a aplicação agora está desconectada da rede (`navigator.onLine === false`). O sistema silencia requisições de sincronização e aguarda em modo de contingência sem gerar erros não tratados na interface.

---

### Passo 4 — Disparo de Check-out em Segundo Plano Enquanto Desconectada
1. Sem restaurar a rede na aba da repositora, mude para a Aba B (ou utilize um terminal/cURL para simular eventos de check-out no backend).
2. Registre dois check-outs consecutivos de flats diferentes com horários recentes (dentro da janela de tolerância de 4 horas):
   - Check-out do **Flat 502**
   - Check-out do **Flat 804**
3. Confirme que no backend as notificações foram criadas na categoria `checkout` ou marcadas no resumo de check-outs do dia.
4. Na aba da repositora (ainda em modo offline), confirme que nenhum áudio foi truncado nem gerou crash.

---

### Passo 5 — Restauração da Rede e Execução Sequencial Resiliente (R2 + R3)
1. Retorne à aba da Repositora (`/frigobar-reposicao`) no DevTools.
2. Na aba **Network**, redefina o modo de rede de **Offline** para **No throttling** (online).
3. **Resultado Esperado:**
   - O evento `online` é disparado imediatamente no navegador.
   - O log no console exibe:
     > `[Restocker Voice Notifier] Rede restabelecida (online). Recuperando check-outs pendentes...`
   - O motor de recuperação busca os check-outs pendentes acumulados e enfileira na fila FIFO sequencial.
   - A Web Speech API anuncia sequencialmente, sem sobreposição nem corte:
     1. *"Check-out flat 502"*
     2. *(Pausa de 400ms)*
     3. *"Check-out flat 804"*
4. **Validação de Deduplicação Absoluta (R3):**
   - Recarregue a página com `F5` ou `Ctrl+R`.
   - Aguarde o ciclo de 12 segundos do timer de sincronização.
   - **Confirme que NENHUM anúncio por voz é repetido**, pois os registros foram persistidos no `localStorage` sob a chave `corpflats_restocker_spoken_checkouts_v1`.

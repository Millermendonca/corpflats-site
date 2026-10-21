# Handoff Report — Challenger M2_1 (Adversarial Verification)

**Milestone**: M2 (Interface Mobile do Hóspede & Checkout Flow)  
**Data/Hora**: 2026-10-21T21:06:00Z  
**Origem**: `challenger_m2_1` (teamwork_preview_challenger / critic / specialist)  
**Destinatário**: Project Orchestrator (`d10c20e2-adfb-4695-835e-52dd3bebe9a9`)  
**Tipo de Handoff**: Hard (Task complete)  
**Veredito**: **APPROVE**  

---

## 1. Observation

Inspecionamos exaustivamente o componente `artifacts/limpeza/src/pages/guest-minibar.tsx` (1.396 linhas), as rotas em `artifacts/limpeza/src/App.tsx` e o atalho em `artifacts/limpeza/src/pages/guest-portal.tsx`, além de executar o build de validação com o Vite.

### 1.1. Carrinho Vazio e Seleção de Itens (Item 1a)
- Em `guest-minibar.tsx` (linhas 911–922), o botão de avançar para pagamento no catálogo possui desabilitação estrita baseada na contagem total de itens:
  ```tsx
  <Button
    onClick={() => setStep("checkout")}
    disabled={totalQuantity === 0}
    className={`h-12 px-6 rounded-2xl font-bold text-xs sm:text-sm shadow-xl flex items-center gap-2 transition-all ${
      totalQuantity > 0
        ? "bg-cyan-600 hover:bg-cyan-500 text-slate-950 shadow-cyan-600/30 active:scale-[0.98]"
        : "bg-slate-800 text-slate-500 cursor-not-allowed"
    }`}
  >
  ```
- No handler de submissão do checkout (`handleCheckoutSubmit`, linhas 410–414), há guarda adicional:
  ```tsx
  if (selectedItemsList.length === 0) {
    setOrderError("Selecione ao menos um item consumido.");
    return;
  }
  ```
- Quando o item selecionado é exclusivamente a cortesia gratuita (`totalAmount === 0` com `totalQuantity > 0`), o checkout altera o botão para *"Resgatar Cortesia de Boas-Vindas Gratuita"* (linhas 1182–1186), oculta o card de meios de pagamento (linha 1125: `{totalAmount > 0 && <Card>...}`), e conclui o pedido com status `"pago"` sem acionar gateways externos (linhas 455–461).

### 1.2. Digitação de Menos de 4 Dígitos no OTP (Item 1b)
- Em `guest-minibar.tsx` (linhas 562–572):
  ```tsx
  <InputOTP
    maxLength={4}
    value={otpValue}
    onChange={(val) => {
      setOtpValue(val);
      setOtpError(null);
      if (val.length === 4) {
        verifyFlatContextWithDigits(flatFromUrl, val);
      }
    }}
    disabled={otpLoading}
    containerClassName="justify-center"
  >
  ```
- O botão manual de abertura (`Abrir Frigobar`, linha 593) aplica desativação enquanto o tamanho for diferente de 4:
  ```tsx
  disabled={otpValue.length !== 4 || otpLoading}
  ```
- Na função `verifyFlatContextWithDigits` (linha 220), existe proteção imediata de guarda contra execuções espúrias:
  ```tsx
  if (digits.length !== 4) return;
  ```
- A digitação de 1 a 3 dígitos apenas atualiza o estado local, limpa erros prévios (`setOtpError(null)`) e mantém o fluxo aguardando o 4º dígito.

### 1.3. Tratamento de 4 Dígitos Errados (Item 1c)
- Em `verifyFlatContextWithDigits` (linhas 272–285):
  - HTTP 401: `setOtpError(data.error || "Os 4 dígitos não coincidem com o celular ou documento cadastrado no flat.");`
  - HTTP 404: `setOtpError(data.error || `Nenhuma reserva ativa ou recente encontrada para o Flat ${flatNum}.`);`
  - Erro de rede: `setOtpError("Falha na conexão ao validar os dígitos. Verifique sua internet.");`
  - Bloco `finally`: `setOtpLoading(false);` garantindo liberação do formulário em qualquer desfecho.
- Na renderização (linhas 584–589), o erro é apresentado em um banner visual amigável (`AlertCircle`, fundo suave `rose-500/10` e borda `rose-500/30`), sem desmontar nem quebrar o estado do componente. A digitação subsequente de qualquer dígito executa `setOtpError(null)`, permitindo novas tentativas sem necessidade de recarregar a página.
- Há também botão de escape alternativo para busca manual por número de flat ou código de reserva (linhas 612–617).

### 1.4. Validação de E-mail e Documento (Item 1d)
- Em `guest-minibar.tsx` (linhas 163–167 e 1052–1121):
  - Se a reserva já possui documento cadastrado, a opção padrão é `"cadastrado"` com exibição mascarada (`Usar meu CPF (000.000.000-00)`).
  - O hóspede pode alternar para `"personalizado"` (`Outro CPF ou CNPJ`), que conta com máscara automática dinâmica (11 dígitos para CPF, 14 para CNPJ).
  - O e-mail de envio da NF é pré-preenchido com `data.email` da reserva ou digitado no campo com `type="email"`.
  - Na submissão (`handleCheckoutSubmit`, linhas 419–438), `docToSend` e `email` limpos são enviados ao backend. No backend (`demo-server.mjs`, linhas 46452–46461), `cleanDoc` e `cleanEmail` realizam fallback para os dados da reserva caso vazios.

### 1.5. Limpeza de Timers e Polling (Item 1e)
- Em `guest-minibar.tsx` (linhas 176, 314–345, 1298–1304):
  - Instância do timer guardada em `useRef`: `const pollingRef = useRef<NodeJS.Timeout | null>(null);`.
  - Hook de desmontagem:
    ```tsx
    useEffect(() => {
      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      };
    }, []);
    ```
  - Ao iniciar polling (`startPaymentPolling`), timers residuais prévios são limpos antes do novo `setInterval`.
  - Ao detectar status `"pago"` (linhas 337–340), `clearInterval(pollingRef.current)` e `pollingRef.current = null` são executados antes de mudar para a tela de celebração.
  - Ao clicar no botão de cancelamento / retorno ao checkout na tela de pagamento (linhas 1298–1302), o timer é cancelado e zerado imediatamente.

### 1.6. Build do Vite
- Execução do comando: `npm --prefix artifacts/limpeza run build`
- Código de saída: `0`.
- Duração: `31.39s` (3392 módulos transformados).
- Ausência de quebras de compilação TypeScript ou erros de empacotamento.

---

## 2. Logic Chain

1. A partir das **Observações 1.1 e 1.2**, o fluxo de catálogo impede que o usuário avance ou envie requisições com carrinho nulo, ao mesmo tempo em que permite a liberação com custo zero quando há seleção de cortesia de boas-vindas. O portão OTP trava adequadamente entradas com menos de 4 dígitos tanto no nível de evento (`onChange`) quanto no nível de função (`verifyFlatContextWithDigits`), evitando requisições desnecessárias ao backend.
2. A partir da **Observação 1.3**, a resposta a 4 dígitos incorretos não causa unhandled promise rejections nem re-renders infinitos; o componente se mantém estável com feedback em banner contextual e desbloqueio do estado de loading.
3. A partir da **Observação 1.4**, as exigências fiscais de R2 (escolha de discriminação na NF em 3 modalidades, alternância CPF/CNPJ corporativo e e-mail) estão plenamente contempladas na interface, integradas ao payload enviado para a API `/api/minibar/orders`.
4. A partir da **Observação 1.5**, o ciclo de vida do polling em tempo real está completamente protegido contra memory leaks e timers zumbis em qualquer cenário de cancelamento, sucesso ou desmontagem de rota.
5. A partir da **Observação 1.6**, o bundle de produção compilou com código de saída 0, confirmando a higidez do código estático.

---

## 3. Caveats

- **Validação estrita de formato de e-mail no cliente**: `handleCheckoutSubmit` confia no `type="email"` do input HTML e no tratamento de fallback do backend. Como recomendação não-bloqueante para os marcos futuros (M3/M4), sugere-se incluir validação regex estrita de e-mail e conferência de dígitos verificadores de CPF/CNPJ antes do envio para minimizar inconsistências em cadastros manuais sem e-mail prévio na reserva.
- **Nenhum teste global executado**: Em estrita conformidade com `AGENTS.md`, testes globais ou varreduras em lote em `tests/` não foram disparados.

---

## 4. Conclusion

O componente `guest-minibar.tsx`, as rotas associadas e a experiência mobile do hóspede do Milestone M2 atendem a todos os requisitos de robustez, usabilidade, tratamento de exceções e tolerância a falhas.

**Veredito Oficial: APPROVE**

---

## 5. Verification Method

Para replicar de forma independente as verificações realizadas:

1. **Inspeção Estática de Código**:
   - `artifacts/limpeza/src/pages/guest-minibar.tsx`:
     - Linhas 911–922 e 410–414 (bloqueio de submissão com carrinho vazio).
     - Linhas 562–572 e 220 (guarda de 4 dígitos do OTP).
     - Linhas 272–285 e 584–589 (tratamento de erro 401/404 no OTP).
     - Linhas 1050–1120 e 419–438 (documento e e-mail da NF).
     - Linhas 314–345 e 1298–1304 (limpeza e descarte do `pollingRef`).
2. **Execução do Build de Produção**:
   - Executar no terminal:
     ```powershell
     npm --prefix artifacts/limpeza run build
     ```
   - Constatar código de saída `0` e geração dos artefatos em `artifacts/limpeza/dist/public/`.

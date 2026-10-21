## 2026-10-21T21:29:19Z

Você é o subagente challenger_m3_2 (teamwork_preview_challenger).
Seu diretório de trabalho exclusivo é:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_m3_2

O diretório raiz do projeto é:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager

Seu parent é o Project Orchestrator (conversation ID: d10c20e2-adfb-4695-835e-52dd3bebe9a9).

Leia atentamente:
1. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (seção 2026-10-21T18:26:13Z)
2. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md
3. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_16\PROJECT.md (Milestone M3)
4. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3\handoff.md

Missão do Challenger M3_2 (Verificação Adversária de NFs, Impressão A6 e Extrato):
1. Inspecione adversarialmente `anserve-dashboard.tsx` e `minibar-admin.tsx`:
   - Tentativa de upload de arquivo inválido ou vazio na Nota Fiscal.
   - Preservação dos dados fiscais (CPF/CNPJ e modelo de discriminação escolhido pelo hóspede) na emissão da NF.
   - Consistência matemática da tabela de repasse financeiro (abatimento de cartão 3.99%, PIX 0.99%, comissão e crédito de cortesia).
   - Estilização `@media print` no gerador de displays A6 (verifique se oculta menus, barras e elementos desnecessários e formata 1 card A6 limpo por página).
2. Execute o build do Vite: `npm --prefix artifacts/limpeza run build`.
3. Conclua com veredito explícito: APPROVE ou REQUEST_CHANGES.
NUNCA execute testes globais `tests/*.test.mjs`.

Escreva seu relatório em `handoff.md` no seu diretório de trabalho e envie mensagem com o veredito para d10c20e2-adfb-4695-835e-52dd3bebe9a9.

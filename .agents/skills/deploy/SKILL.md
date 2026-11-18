---
name: deploy
description: >-
  Executa o fluxo oficial de deploy em produção (CorpFlats / Guest-Flow-Manager) via git commit e git push origin main.
  Use EXCLUSIVAMENTE quando o usuário acionar o comando /deploy ou autorizar explicitamente o envio das alterações para produção.
---

# Comando `/deploy` — Publicação Autorizada em Produção

> **REGRA DE OURO:** Nunca execute `git push` sem que o usuário tenha acionado `/deploy` ou autorizado explicitamente o deploy na conversa atual.

## Passos Obrigatórios ao Executar o Deploy Autorizado

1. **Conferência do Working Tree**:
   - Execute `git status -sb` em `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager` para inspecionar todos os arquivos modificados e novos.
   - Se houver alterações não relacionadas que pareçam rascunhos temporários indevidos, confirme com o usuário antes de incluí-las.

2. **Paridade Twin-Server (`artifacts/api-server/` ↔ `scripts/`)**:
   - Garanta que todo arquivo `.mjs` alterado em `artifacts/api-server/` foi espelhado para `scripts/`.
   - Valide executando:
     ```powershell
     node scripts/check-twin-parity.mjs
     ```
   - Se falhar, corrija a paridade antes de prosseguir.

3. **Build do Frontend (se aplicável)**:
   - Se houver qualquer arquivo modificado ou novo dentro de `artifacts/limpeza/src/`, execute o build:
     ```powershell
     npm --prefix artifacts/limpeza run build
     ```
   - Certifique-se de que o build concluiu com código `0` e atualizou `artifacts/limpeza/dist/`.

4. **Commit e Push para Produção**:
   - Adicione os arquivos pertinentes (`git add`), crie um `git commit` descritivo e execute `git push origin main` para disparar o deploy no Render (`https://corpflats.com.br`).
   - Confirme ao usuário o hash do commit enviado.

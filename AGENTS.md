# Diretrizes do Projeto Guest-Flow-Manager (CorpFlats)

## Git & Controle de Versão
- **Sempre fazer `git push` por padrão**: Sempre que um `git commit` for realizado para implementar ou corrigir uma funcionalidade, execute imediatamente o `git push` para o repositório remoto (`origin main` ou a branch ativa). Nunca deixe commits pendentes localmente sem envio.
- **Build de Verificação**: Ao alterar arquivos em `artifacts/limpeza/src`, rode o build (`npm run build` na pasta `artifacts/limpeza`) e inclua os arquivos gerados em `artifacts/limpeza/dist/` no commit quando aplicável para garantir o deploy contínuo em produção.

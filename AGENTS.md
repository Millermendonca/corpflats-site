# Diretrizes do Projeto Guest-Flow-Manager (CorpFlats)

## Git & Controle de Versão
- **Sempre fazer `git push` por padrão**: Sempre que um `git commit` for realizado para implementar ou corrigir uma funcionalidade, execute imediatamente o `git push` para o repositório remoto (`origin main` ou a branch ativa). Nunca deixe commits pendentes localmente sem envio.
- **Build de Verificação**: Ao alterar arquivos em `artifacts/limpeza/src`, rode o build (`npm run build` na pasta `artifacts/limpeza`) e inclua os arquivos gerados em `artifacts/limpeza/dist/` no commit quando aplicável para garantir o deploy contínuo em produção.

## Execução de Testes (Escopo Estrito e Não Solicitação)
- **NUNCA executar testes globais, varreduras ou em lote**: É terminantemente PROIBIDO rodar `tests/*.test.mjs`, scripts que varrem a pasta `tests/`, ou suítes completas do projeto.
- **Apenas o teste estritamente pontual do que foi alterado**: Ao criar ou corrigir uma funcionalidade específica, execute EXCLUSIVAMENTE o arquivo de teste pontual diretamente associado àquela alteração (ex: se alterou a reserva RES-605, rode apenas o teste pontual daquela reserva).
- **Proibido rodar testes de outros módulos**: Nunca execute testes de módulos não envolvidos na tarefa solicitada pelo usuário (ex: ordens de serviço, governança, café da manhã, garagem, etc. quando a tarefa for de reservas ou chat).
- **Sem mascarar/silenciar notificações em código**: Os disparos de mensagens nos testes NÃO devem ser desativados ou silenciados no código. O comportamento correto é o agente NÃO disparar testes desnecessários ou não solicitados. Testes só devem ser executados se fizerem parte estrita da demanda atual do usuário.

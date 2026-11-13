## 2026-10-22T10:02:22Z
Você é o Explorer 1 (explorer_survey_backend) para a fase de Survey do Sistema de Gestão de Funcionários CLT.
Seu diretório de trabalho exclusivo é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_backend`
A raiz do projeto é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`

MANDATÓRIO: Leia antes de tudo o arquivo `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (especialmente a seção `## 2026-10-22T09:58:01Z`).

SUA MISSÃO:
Fazer o levantamento detalhado de arquitetura backend e pontos de integração:
1. Analise como o servidor funciona (`artifacts/api-server/demo-server.mjs` e seu gêmeo `scripts/demo-server.mjs`), como o estado é persistido em `db` (`data/database.json` / postgres blob `system_store`).
2. Analise como os módulos existentes são organizados (ex: `wbp/`, `minibar/`, notificações, whatsapp/z-api).
3. Verifique como Cris e Grazi estão cadastradas e tratadas hoje (extrato de governança, diaristas, faxinas) e mapeie o mecanismo exato para garantir o isolamento estrito (excluí-las de rotinas CLT, lembretes de ponto, folha e travas).
4. Mapeie a arquitetura recomendada para o módulo de RH/CLT (recomenda-se criar submódulos em `artifacts/api-server/hr/` e sincronizar em `scripts/hr/` ou estender o demo-server mantendo 100% de paridade twin-server SHA-256).
5. Mapeie todos os endpoints REST necessários para RH/Funcionários, Ponto Eletrônico, Escalas, Folha, Contratos, ASO e Travas de Conformidade.
6. Escreva seu relatório detalhado em `handoff.md` no seu diretório de trabalho e envie mensagem ao orquestrador quando concluir.
LEMBRE-SE: Você é um Explorer estritamente read-only. NÃO altere arquivos de código fonte.

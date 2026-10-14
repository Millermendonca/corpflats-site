# Task Assignment: Challenger 1 (NFS-e & CRM Stress/Edge Case Challenge)
Working Directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_1
Role: teamwork_preview_challenger

## Escopo
Desafiar empiricamente a robustez e correção da emissão de NFS-e e CRM:
- Testar chamadas anômalas em `POST /api/nfse/emit` (campos nulos, formatos divergentes de CEP/UF, caracteres especiais na discriminação).
- Testar que `getFiscalData()` nunca mais apaga notas emitidas após reinicializações ou consultas repetidas.
- Testar auto-emissão em check-out com empresa sem endereço vs empresa com endereço completo.
- Testar alternância rápida PJ ↔ PF na tela de notas.
- Executar EXCLUSIVAMENTE o teste pontual `node --test tests/nfse-crm-whatsapp-flow.test.mjs` (ou testes isolados temporários em memória).


## 2026-10-14T11:26:22Z
Você é o Challenger 1 (NFS-e & CRM Stress/Edge Case Challenge).
Seu diretório de trabalho: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_1

Leia atentamente:
1. Requisitos oficiais: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
2. Sua atribuição de tarefa: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_1\DISPATCH.md
3. O plano de arquitetura: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_9\PROJECT.md
4. Relatório do test writer: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\test_writer_m4\handoff.md

REGRA CRÍTICA DE EXECUÇÃO (AGENTS.md):
- Execute EXCLUSIVAMENTE o teste pontual `node --test tests/nfse-crm-whatsapp-flow.test.mjs` (ou testes isolados temporários em memória).
- É ESTRITAMENTE PROIBIDO executar testes globais (`tests/*.test.mjs`) ou outros módulos.

Escreva seu relatório em `handoff.md` contendo seu veredito explícito: APPROVE ou REQUEST_CHANGES. Ao concluir, avise o orquestrador via send_message.

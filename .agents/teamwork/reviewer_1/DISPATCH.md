# Task Assignment: Reviewer 1 (R1 & R2 Review)
Working Directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_1
Role: teamwork_preview_reviewer

## Escopo
Revisar de forma independente a implementação dos requisitos R1 e R2:
- Correção do ReferenceError (`numNfseReal`/`codVerifReal`) em `POST /api/nfse/emit`.
- Repasse e persistência integral de todos os campos de endereço do tomador.
- Funcionamento do motor dual (`giss_prefeitura` e `padrao_nacional`).
- Auto-emissão no check-out priorizando Tomador PJ da empresa vinculada e discriminando hóspede/estadia.
- Persistência de campos fiscais e de endereço em `POST/PATCH /api/companies` e `POST/PATCH /api/pms/guests`.
- UI em `crm-guests.tsx` e `fiscal-invoices.tsx` (modais, seletor multientidade, auto-preenchimento e alternância PJ/PF).

Execução de Testes:
- Execute EXCLUSIVAMENTE o teste pontual `node --test tests/nfse-crm-whatsapp-flow.test.mjs`.
- NUNCA execute testes globais (`tests/*.test.mjs`).

Entregue seu relatório em `handoff.md` com veredito explícito: `APPROVE` ou `REQUEST_CHANGES`.

## 2026-10-14T11:26:21Z
Você é o Reviewer 1 (R1 & R2 Review).
Seu diretório de trabalho: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_1

Leia atentamente:
1. Requisitos oficiais: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
2. Sua atribuição de tarefa: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_1\DISPATCH.md
3. O plano de arquitetura: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_9\PROJECT.md
4. Relatório do test writer: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\test_writer_m4\handoff.md

REGRA CRÍTICA DE EXECUÇÃO (AGENTS.md):
- Execute EXCLUSIVAMENTE o teste pontual `node --test tests/nfse-crm-whatsapp-flow.test.mjs`.
- É ESTRITAMENTE PROIBIDO executar testes globais (`tests/*.test.mjs`) ou outros módulos.

Escreva seu relatório em `handoff.md` contendo seu veredito explícito: APPROVE ou REQUEST_CHANGES. Ao concluir, avise o orquestrador via send_message.

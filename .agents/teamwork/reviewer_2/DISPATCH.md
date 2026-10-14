# Task Assignment: Reviewer 2 (R3 & R4 Review)
Working Directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_2
Role: teamwork_preview_reviewer

## Escopo
Revisar de forma independente a implementação dos requisitos R3 e R4:
- Interceptação de intenção fiscal no WhatsApp (`whatsapp-ai-service.mjs`, `zapi-service.mjs`).
- Fluxo condicional: não perguntar novamente para quem já possui empresa vinculada no CRM; confirmar Razão Social e CNPJ, ativar `autoEmitInvoice = true`.
- Onboarding claro e acolhedor (PJ vs PF) para clientes não vinculados (`awaitingFiscalData`).
- Validação matemática por Módulo 11 (CPF e CNPJ) com alerta amigável e bloqueio de registros inválidos no CRM.
- Sanitização (`toTitleCase` preservando siglas e preposições, `cleanPhone`, `cleanCep`) e enriquecimento (CNPJ e CEP).
- Vínculo no CRM, reserva e confirmação no WhatsApp.
- Paridade estrita 100% SHA-256 entre `artifacts/api-server/` e `scripts/`.
- Verificação do build em `artifacts/limpeza` (`npm run build`).

Execução de Testes:
- Execute EXCLUSIVAMENTE o teste pontual `node --test tests/nfse-crm-whatsapp-flow.test.mjs`.
- NUNCA execute testes globais (`tests/*.test.mjs`).

Entregue seu relatório em `handoff.md` com veredito explícito: `APPROVE` ou `REQUEST_CHANGES`.
## 2026-10-14T11:26:21Z
Você é o Reviewer 2 (R3 & R4 Review).
Seu diretório de trabalho: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_2

Leia atentamente:
1. Requisitos oficiais: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
2. Sua atribuição de tarefa: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_2\DISPATCH.md
3. O plano de arquitetura: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_9\PROJECT.md
4. Relatório do test writer: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\test_writer_m4\handoff.md

REGRA CRÍTICA DE EXECUÇÃO (AGENTS.md):
- Execute EXCLUSIVAMENTE o teste pontual `node --test tests/nfse-crm-whatsapp-flow.test.mjs`.
- É ESTRITAMENTE PROIBIDO executar testes globais (`tests/*.test.mjs`) ou outros módulos.

Escreva seu relatório em `handoff.md` contendo seu veredito explícito: APPROVE ou REQUEST_CHANGES. Ao concluir, avise o orquestrador via send_message.

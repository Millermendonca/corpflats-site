# Task Assignment: Challenger 2 (WhatsApp Flow & Validation Stress Challenge)
Working Directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_2
Role: teamwork_preview_challenger

## Escopo
Desafiar empiricamente a robustez e correção da automação do WhatsApp e validações:
- Testar variações lexicais, maiúsculas/minúsculas, acentos e ruídos em pedidos de nota fiscal no WhatsApp ("Gostaria da minha NFS-e", "Manda nota fiscal no CNPJ", "quero recibo").
- Testar que CPFs e CNPJs com dígitos verificadores inválidos (Módulo 11) são estritamente rejeitados com aviso gentil e não poluem o banco de dados.
- Testar que a resolução de solicitantes terceiros (`r.requesterInfo`) não quebra se o objeto estiver incompleto (ex: sem whatsapp, só com telefone).
- Testar sanitização com nomes complexos de empresas ("BANCO DO BRASIL S/A", "PETROLEO BRASILEIRO S.A. - PETROBRAS", "COMERCIO E INDUSTRIA DE ALIMENTOS LTDA ME").

Execução de Testes:
- Execute EXCLUSIVAMENTE o teste pontual `node --test tests/nfse-crm-whatsapp-flow.test.mjs` (ou testes isolados temporários em memória).
- NUNCA execute testes globais (`tests/*.test.mjs`).

Entregue seu relatório em `handoff.md` com veredito explícito: `APPROVE` ou `REQUEST_CHANGES`.

## 2026-10-14T11:26:22Z
[Message from 3d03f136-f013-4588-99e3-f22e17cc1ae4]
Você é o Challenger 2 (WhatsApp Flow & Validation Stress Challenge).
Seu diretório de trabalho: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_2

Leia atentamente:
1. Requisitos oficiais: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
2. Sua atribuição de tarefa: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_2\DISPATCH.md
3. O plano de arquitetura: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_9\PROJECT.md
4. Relatório do test writer: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\test_writer_m4\handoff.md

REGRA CRÍTICA DE EXECUÇÃO (AGENTS.md):
- Execute EXCLUSIVAMENTE o teste pontual `node --test tests/nfse-crm-whatsapp-flow.test.mjs` (ou testes isolados temporários em memória).
- É ESTRITAMENTE PROIBIDO executar testes globais (`tests/*.test.mjs`) ou outros módulos.

Escreva seu relatório em `handoff.md` contendo seu veredito explícito: APPROVE ou REQUEST_CHANGES. Ao concluir, avise o orquestrador via send_message.

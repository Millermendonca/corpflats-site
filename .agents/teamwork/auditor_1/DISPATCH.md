# Task Assignment: Forensic Auditor (Integrity Verification)
Working Directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\auditor_1
Role: teamwork_preview_auditor

## Escopo
Realizar auditoria forense de integridade estrita (Zero Tolerance for Cheating):
1. **Verificação de Código e Ausência de Facades/Hardcodes**:
   - Verificar se as rotas de emissão (`/api/nfse/emit`), check-out, CRM (`/api/companies`, `/api/pms/guests`) e WhatsApp (`handleWhatsAppFiscalFlow`) implementam lógica real e autêntica.
   - Verificar se não há respostas hardcoded ou atalhos para passar em testes específicos.
2. **Validação de Algoritmos**:
   - Verificar a implementação do algoritmo Módulo 11 em `national-nfse.mjs` e `lookup.mjs`.
   - Verificar a implementação do gerador de Chave de Acesso Nacional de 50 dígitos em `national-nfse.mjs`.
   - Verificar a montagem de XML SOAP em `giss-soap.mjs`.
3. **Paridade Twin-Server SHA-256**:
   - Calcular e comparar o hash SHA-256 de todos os 7 pares de arquivos gêmeos entre `artifacts/api-server/` e `scripts/`:
     * `demo-server.mjs`
     * `giss-soap.mjs`
     * `national-nfse.mjs`
     * `chat-service.mjs`
     * `lookup.mjs`
     * `whatsapp-ai-service.mjs`
     * `zapi-service.mjs`
4. **Integridade da Base de Produção**:
   - Verificar se o arquivo `data/database.json` permaneceu íntegro e não foi corrompido ou poluído por dados de teste.
5. **Execução de Testes**:
   - Execute EXCLUSIVAMENTE o teste pontual `node --test tests/nfse-crm-whatsapp-flow.test.mjs`.
   - NUNCA execute testes globais (`tests/*.test.mjs`).

Entregue seu relatório em `handoff.md` com veredito binário explícito: `CLEAN` ou `INTEGRITY VIOLATION`.


## 2026-10-14T11:26:22Z
Você é o Forensic Auditor (Integrity Verification).
Seu diretório de trabalho: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\auditor_1

Leia atentamente:
1. Requisitos oficiais: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
2. Sua atribuição de tarefa: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\auditor_1\DISPATCH.md
3. O plano de arquitetura: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_9\PROJECT.md

Realize auditoria forense completa em busca de atalhos, facades, respostas hardcoded ou violações de integridade.
Verifique a paridade estrita SHA-256 entre os 7 arquivos gêmeos de artifacts/api-server/ e scripts/.
Verifique a integridade do arquivo data/database.json.

REGRA CRÍTICA DE EXECUÇÃO (AGENTS.md):
- Execute EXCLUSIVAMENTE o teste pontual `node --test tests/nfse-crm-whatsapp-flow.test.mjs`.
- É ESTRITAMENTE PROIBIDO executar testes globais (`tests/*.test.mjs`).

Escreva seu relatório em `handoff.md` contendo seu veredito binário explícito: CLEAN ou INTEGRITY VIOLATION. Ao concluir, avise o orquestrador via send_message.

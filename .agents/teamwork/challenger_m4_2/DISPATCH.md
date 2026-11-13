## 2026-10-22T14:44:09Z
Você é o Challenger M4-2 (challenger_m4_2) para o Marco M4 (Estresse Adversarial de Segurança, Blindagem de Prestadoras, Canvas Signature Tampering e Alertas de ASO).
Seu diretório de trabalho exclusivo é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_m4_2`
A raiz do projeto é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`

MANDATÓRIO:
1. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`.
2. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_17\PROJECT.md`.
3. Leia o relatório do worker: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m4\handoff.md`.

SUA MISSÃO ADVERSARIAL:
1. Criar o script temporário `.agents/teamwork/challenger_m4_2/stress_contracts_aso_security.mjs`.
2. Estressar a blindagem absoluta de Cris e Grazi:
   - Tentar calcular folha, fechar mês, gerar contrato CLT, assinar contrato e cadastrar exame ASO para IDs 2, 3, "2", "3", "cris", "grazi", e assertar que TODOS retornam HTTP 403 Forbidden!
3. Estressar assinatura eletrônica Canvas e selo SHA-256:
   - Assinar contrato, alterar o texto da minuta posteriormente e verificar que o hash original diverge da minuta adulterada.
4. Estressar horizontes de alerta de ASO:
   - Testar exames vencidos (ontem), a vencer em 30 dias (limiares no dia 30 e dia 31), a vencer em 60 dias (limiares no dia 60 e dia 61), e exames com mais de 60 dias (não devem gerar alertas).
5. Executar o script criado (`node .agents/teamwork/challenger_m4_2/stress_contracts_aso_security.mjs`).
6. Escrever seu relatório em `handoff.md` com veredicto explícito: `APPROVE` ou `REQUEST_CHANGES`.
7. Enviar mensagem ao orquestrador via `send_message`.

## 2026-10-22T10:37:08Z

Você é o Reviewer 2 (reviewer_m1_2) para o Marco M1 (Isolamento de Prestadoras & Paridade Twin-Server).
Seu diretório de trabalho exclusivo é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_m1_2`
A raiz do projeto é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`

MANDATÓRIO:
1. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`.
2. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_17\PROJECT.md`.
3. Leia o relatório do worker: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1\handoff.md`.

SUA MISSÃO:
1. Verificar a blindagem de Cris (`id: 2`) e Grazi (`id: 3`): `contractType: "prestador"` em `defaultUsers` e `sanitizeMaidUsers()`, garantindo que não apareçam em `/api/hr/employees` e que o fluxo de governança por faxina continue 100% intocado.
2. Verificar a proteção de poda no `pruneDatabase()` em `demo-server.mjs` (blindagem de 5 anos / 1825 dias das coleções de RH).
3. Executar a auditoria de paridade twin-server: `node scripts/check-twin-parity.mjs` e conferir se todos os 29 arquivos têm 100% SHA-256 match.
4. Escrever seu relatório em `handoff.md` com veredicto explícito: `APPROVE` ou `REQUEST_CHANGES`.
5. Enviar mensagem ao orquestrador.

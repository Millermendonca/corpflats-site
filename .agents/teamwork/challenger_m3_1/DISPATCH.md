## 2026-10-22T12:54:38Z
Você é o Challenger 1 (challenger_m3_1) para o Marco M3 (Estresse Adversarial de Matemática Trabalhista, Limiares do Art. 58 CLT, Hora Ficta Noturna e Férias).
Seu diretório de trabalho exclusivo é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_m3_1`
A raiz do projeto é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`

MANDATÓRIO:
1. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`.
2. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_17\PROJECT.md`.
3. Leia o relatório do worker: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3\handoff.md`.

SUA MISSÃO ADVERSARIAL:
1. Criar um script temporário em seu diretório de trabalho:
   `.agents/teamwork/challenger_m3_1/stress_schedules_math.mjs`.
2. Estressar a tolerância do Art. 58 CLT e Súmula 366 TST:
   - Testar limiares exatos: variações de 4 min, 5 min (devem ser desconsideradas / 0 HE); variação de 6 min (deve computar a totalidade dos 6 min de HE).
   - Testar soma diária: variações de 3, 2, 2, 3 min (soma = 10 min -> desconsiderado / 0 HE); variações de 3, 3, 3, 2 min (soma = 11 min -> computa a totalidade dos 11 min de HE!).
3. Estressar os cálculos de Horário Noturno e Hora Ficta:
   - Turno exatamente das 22:00 às 05:00 (7 horas de relógio -> deve resultar em exatamente 8,0 horas noturnas de trabalho!).
   - Turno noturno com prorrogação: das 22:00 às 07:00 (7h noturnas + 2h diurnas prorrogadas -> per Súmula 60 TST, as 2h pós-05h também devem receber hora reduzida e 20%!).
   - Turno puramente diurno (08:00 às 17:00) -> 0 horas noturnas.
4. Estressar as regras de Férias CLT:
   - Tentativa de agendar período de 13 dias (deve falhar se for o período principal, pois a CLT exige >= 14 dias).
   - Tentativa de agendar período de 4 dias (deve falhar, pois a CLT exige >= 5 dias).
   - Tentativa de iniciar férias na sexta-feira ou sábado quando o DSR é no domingo (deve falhar com rejeição per Art. 134 §3º CLT).
   - Alerta de dobra: período concessivo a 30 dias do fim sem agendamento (deve acusar risco/alerta).
5. Executar o script criado (`node .agents/teamwork/challenger_m3_1/stress_schedules_math.mjs`).
6. NÃO alterar arquivos de produção do projeto.
7. Escrever seu relatório em `handoff.md` com veredicto explícito: `APPROVE` ou `REQUEST_CHANGES`.
8. Enviar mensagem ao orquestrador via `send_message`.

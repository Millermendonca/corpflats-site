## 2026-10-11T00:39:28Z
Você é o Project Orchestrator para o projeto Guest-Flow-Manager (CorpFlats).
Sua pasta de trabalho é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_3
A raiz do repositório é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager
A pasta de testes solicitada é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\e2e

Leia o arquivo de requisitos original do usuário em:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (sob a seção ## 2026-10-11T00:38:03Z).

Missão:
Construir um sistema completo e autônomo de testes sintéticos E2E (End-to-End) que atua 100% como usuário real em navegadores web e canais externos para o ecossistema Guest-Flow-Manager (CorpFlats), cobrindo 100% das 45 telas, todas as personas e permutações de estado em sandbox isolado.

Requisitos Essenciais:
1. R1. Sandbox Local Isolado & Interceptadores (Mundo Falso) - porta dedicada, database.test.json, emulador Z-API / WhatsApp, interceptador SMTP nodemailer, simulador webhooks PIX, emulador CPF/SERPRO e NFS-e, mecanismo de time-travel (virada do turno 18h, 22h café, check-in). Nenhuma chamada externa real.
2. R2. Varredura Universal de Telas & Sanidade (100% das 45 Telas) - crawler multi-perfil (Admin, Portaria, Camareira, Hóspede, Prestador), resoluções Mobile 375px, Tablet 768px, Desktop 1920px, zero tela branca, zero console.error, zero 4xx/5xx indevidos, validação de elementos essenciais.
3. R3. Jornadas Humanas E2E & Prevenção Anti-Frustração - Zero Amnésia (documentos/FNRH anteriores reaproveitados), Vínculo Multicanal Automático (/minha-conta), Persistência Completa de Veículo (placa, marca, modelo, cor na portaria e emails), Gestão de Chaves/Fechadura (bloqueio antes das 14h, liberação destacada pós check-in), Resiliência de Pagamento PIX (tempo real e regeneração QR), Upload Mobile e assinatura canvas. Hóspede 2 não sobrescreve Hóspede 1.
4. R4. Matriz Combinatória de Estados (Pairwise Testing) - composições de reserva, durações, todos os 19 flats em todos os estados de governança, ordens de serviço com link de token externo e upload de fotos, regras de café da manhã e cutoff 22h.
5. R5. Agente Explorador Autônomo com IA (Gemini Chaos Explorer) - double clicks rápidos, dados caóticos/especiais, navegação "Voltar", relatório qualitativo.
6. Acceptance Criteria: relatório HTML consolidado em e2e/reports/index.html, capturas de tela/vídeos indexados para falhas.
7. Regras do projeto (AGENTS.md):
   - Git & Controle de versão: sempre fazer git push por padrão em qualquer git commit (origin main).
   - Build de verificação em artifacts/limpeza caso altere arquivos lá.

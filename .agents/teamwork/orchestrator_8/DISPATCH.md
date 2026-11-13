## 2026-10-11T23:37:14Z
From: e61617d0-af0e-4090-a01d-75abee573015
Content:
You are the Project Orchestrator for the Smart Flat Hub development task in Guest-Flow-Manager.
Your working directory is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_8
The authoritative user request is located at: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (specifically under the header ## Follow-up — 2026-10-11T23:35:41Z).
Also check c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_8\context.md.

You must lead the multidisciplinary team to accomplish all requirements (R1 to R5) and acceptance criteria:
- R1: Interface Web do Hóspede (Smart Flat Hub UI) em modo sandbox / preview oculto (sem expor para hóspedes reais em produção, acessível por rota/modo isolado como /preview/smart-flat ou parâmetro, mobile-first, Tailwind CSS, Radix UI, Lucide icons, coleta de ETA).
- R2: Programação inteligente com janela de antecedência (até 30min antes do ETA) para cafeteira e ar-condicionado (18-26°C).
- R3: Ciclo fail-safe de presença e desligamento por segurança (alerta prévio se não confirmou entrada, desligamento automático 30min após ETA sem confirmação de entrada, feedback transparente).
- R4: Trilha sonora de boas-vindas (Welcome Playlist) automática no dia do check-in a partir do horário oficial, com controles de reprodução no painel.
- R5: Guia de arquitetura de hardware IoT e especificações para aquisição (tomadas Tuya 16A com proteção térmica, smart IR blasters, Echo Pop/Dot Alexa, interruptores touch).

CRITICAL RULES:
1. Adhere strictly to AGENTS.md in project root:
   - NUNCA rodar testes globais ou em lote (tests/*.test.mjs). Apenas testes estritamente pontuais da funcionalidade se criados.
   - Sempre executar git push após cada git commit.
   - Build de verificação: ao alterar artifacts/limpeza/src, rodar npm run build na pasta artifacts/limpeza e commitar arquivos gerados em artifacts/limpeza/dist/.
2. Twin-Server Parity Mandate: manter paridade rigorosa SHA-256 entre scripts/ e artifacts/api-server/ para quaisquer arquivos de backend modificados.
3. Update progress.md continuously in your working directory so the Sentinel can track status and liveness.
4. Report completion back to the Sentinel via send_message when fully finished and verified.

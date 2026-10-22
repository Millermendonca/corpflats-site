## 2026-10-22T10:02:22Z
Você é o Explorer 3 (explorer_survey_frontend) para a fase de Survey do Sistema de Gestão de Funcionários CLT.
Seu diretório de trabalho exclusivo é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_frontend`
A raiz do projeto é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`

MANDATÓRIO: Leia antes de tudo o arquivo `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (especialmente a seção `## 2026-10-22T09:58:01Z`).

SUA MISSÃO:
Fazer o levantamento de frontend em `artifacts/limpeza/`:
1. Analise a estrutura do frontend React/Vite/TypeScript (`artifacts/limpeza/src/`), sistema de rotas (React Router / App.tsx), navegação lateral/header, temas e componentes UI existentes (Shadcn/Tailwind/Lucide).
2. Analise o controle de permissões e perfis de usuário (`permissions.ts` e afins) para saber como liberar as rotas de RH e Ponto.
3. Planeje a interface Mobile de Batida de Ponto (`/ponto` ou `/rh/ponto`): acesso do funcionário, seleção/identificação, acionamento da câmera para selfie ao vivo, obtenção de GPS, verificação de whitelist de aparelho e feedback visual do comprovante/saldo.
4. Planeje o Painel Admin de RH (`/rh` ou `/colaboradores`):
   - Aba 1: Funcionários (Cadastro CLT, Cozinha, Camareira, dados contratuais, PIX, jornada) e indicação visual clara de Cris/Grazi como prestadoras separadas;
   - Aba 2: Escalas & Espelho de Ponto (calendário 6x1, batidas com visualização de selfie/mapa GPS, saldo de horas);
   - Aba 3: Motor de Conformidade & Travas (painel interativo para configurar cada uma das regras entre Alerta, Override Admin ou Bloqueio Total);
   - Aba 4: Folha de Pagamento & Holerite (cálculo mensal, demonstrativo, baixa PIX);
   - Aba 5: Contratos & Assinatura Eletrônica (minutas, canvas de assinatura, checklist de admissão);
   - Aba 6: Saúde Ocupacional / ASO (exames, status, datas de vencimento, alertas);
   - Gestão de Whitelist de Aparelhos (botão para autorizar terminal, lista de dispositivos autorizados, toggle global de bloqueio).
5. Verifique a pipeline de build (`npm --prefix artifacts/limpeza run build`) e identifique dependências necessárias (ex: canvas de assinatura, câmera/video/canvas HTML5 nativo ou libs).
6. Escreva seu relatório detalhado em `handoff.md` no seu diretório de trabalho e envie mensagem ao orquestrador quando concluir.
LEMBRE-SE: Você é um Explorer estritamente read-only. NÃO altere arquivos de código fonte.

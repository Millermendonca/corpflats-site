# Handoff Report — Explorer Survey Backend

**Task:** Survey Backend Architecture for FNRH SERPRO Check-in Provider Toggle  
**Agent:** explorer_survey_backend_2  
**Date:** 2026-10-07  

---

## 1. Observation

1. **Configurações e Banco de Dados (`data/database.json` e `artifacts/api-server/demo-server.mjs`):**
   - `data/database.json` já contém o objeto raiz `settings` com 17 chaves configuradas (ex.: `adminWhatsApp`, `checkinTime`, `receptionEmail`). A chave `checkinProvider` ainda não existe.
   - Em `artifacts/api-server/demo-server.mjs`:
     - Linhas 554–577: Estrutura default de `db.settings` definida no topo do arquivo.
     - Linhas 3371–3530 (`loadDatabase`): Hidratação de `data/database.json` e sincronização com PostgreSQL (`system_store`). Linhas 3488–3510 possuem blindagem explícita para preservar configurações críticas (`emailSettings`, `receptionEmail`, `garageEmail`).
     - Linha 4779 (`saveDatabase`): Persistência síncrona em disco (`fs.writeFileSync(DB_FILE, ...)`) e assíncrona no PostgreSQL (`system_store`).
     - Linhas 10042–10052: Rota `GET /api/settings` retorna `{ ...db.settings, petPolicy, houseRules, contractTerms, termsAndRules }`.
     - Linhas 10054–10088: Rota `PATCH /api/settings` desestrutura propriedades específicas (`req.body`) e persiste com `saveDatabase()`. A chave `checkinProvider` não é desestruturada atualmente.

2. **Estrutura de Reservas e Ciclo de Vida:**
   - `data/database.json` possui 203 reservas no array `db.reservations`.
   - Cada reserva possui campos como `id`, `code` (ex: `RES-113-0325`), `flatId`, `flatNumber`, `guestName`, `guestPhone`, `guestEmail`, `guestCount`, `adults`, `children`, `checkinDate`, `checkoutDate`, `channel`, `status`, `paymentStatus`, `guests`.
   - Rotas de criação e modificação:
     - `POST /api/pms/reservations` (Linhas 11385–11910): criação de reserva via PMS Calendário.
     - `POST /api/reservations/direct-booking` (Linhas 10343–10860): criação de reserva via motor de reservas direto.
     - `PUT /api/pms/reservations/:id` (Linhas 12554–12600): edição de reserva existente.
     - `GET /api/pms/calendar` (Linhas 11227–11365): retorno das reservas mapeadas (Linhas 11281–11320).
     - `POST /api/pms/reservations/:id/resend-checkin-link` (Linha 13754–13835): envio de link de check-in digital com URL fixa na Linha 13781 (`${baseUrl}/pre-checkin/${reservation.code || reservation.id}?guest=${guestIndex || 1}`).

3. **Status de Integração FNRH / SERPRO:**
   - Arquivos locais existentes: `artifacts/api-server/fnrh-pdf-service.mjs` e `scripts/fnrh-pdf-service.mjs` geram PDFs locais da FNRH após o hóspede preencher o formulário interno CorpFlats.
   - Nenhuma integração com a API remota do SERPRO existia no repositório.
   - Arquivo de documentação técnica oficial FNRH SERPRO v2.4.2 presente no ambiente (`scratch/api_doc_v2_4_2_full.json`).

4. **Especificação SERPRO FNRH v2.4.2 Observada:**
   - URL Produção: `https://fnrh.turismo.serpro.gov.br/FNRH_API/rest/v2`
   - URL Homologação: `https://hom-lowcode.serpro.gov.br/FNRH_API/rest/v2`
   - Autenticação: Basic Auth (`Authorization: Basic base64(user:password)`)
   - Header obrigatório para auditoria do MinTur: `cpf_solicitante: <cpf>`
   - Endpoint de Criação de Reserva: `POST /reservas`
     - Body: `{ numero_reserva, numero_reserva_ota, data_entrada, data_saida, quantidade_hospede_adulto, quantidade_hospede_menor, origem_reserva_id: "MEIOHOSPEDAGEM" }`
     - Response (200 OK): `{ reserva: { reserva_id, numero_reserva, situacao_reserva_id, link_precheckin } }`
   - Endpoint leve para Health Check: `GET /dominios/reservas/situacoes` (retorna HTTP 200 com lista de situações de reserva).

5. **Disparos de Mensagens e Links de Check-in:**
   - Em `artifacts/api-server/zapi-service.mjs`:
     - Linhas 1395 & 1756: `const linkCheckinDigital = `${appOrigin}/pre-checkin/${resCode}`;`
     - Linha 1579: tag `{{link_checkin_digital}}` mapeia `linkCheckinDigital`.
     - Linhas 1780–1830: botões de template WhatsApp apontam para `linkCheckinDigital`.
   - Sistema de Auditoria e Notificações:
     - `logAuditEvent` (Linhas 4825–4880): grava no arquivo `audit_logs.jsonl`, `db.auditLogs` e PostgreSQL.
     - `createNotification` (Linhas 4883–4920): insere alerta em `db.notifications` para a recepção.

6. **Paridade Byte-a-Byte do Servidor:**
   - Verificado via Node.js: `artifacts/api-server/demo-server.mjs` (1.164.206 bytes) e `scripts/demo-server.mjs` (1.164.206 bytes) são 100% idênticos (`equals: true`).

---

## 2. Logic Chain

1. A partir da observação de que `db.settings` já é carregado, manipulado e persistido via `loadDatabase()` e `saveDatabase()`, a inclusão de `settings.checkinProvider` com valores `'proprio'` e `'gov_fnrh'` é totalmente suportada pela arquitetura existente sem necessitar de novas tabelas.
2. A partir da observação de que `PATCH /api/settings` filtra explicitamente os campos permitidos, o campo `checkinProvider` precisa ser incluído nessa rota para permitir que o toggle na interface persista a escolha sem restart do servidor.
3. Como a especificação SERPRO v2.4.2 em `POST /reservas` requer apenas `numero_reserva`, datas e quantidade de hóspedes, e retorna `reserva_id` e `link_precheckin`, esses dados podem ser diretamente integrados e salvos nos atributos `serproReservaId` e `serproPrecheckinUrl` de `reservation`.
4. Para garantir resiliência e atender ao requisito de fallback transparente (< 5 segundos), a função `getCheckinUrl(reservation, guestIndex, baseUrl)` deve:
   - Se `checkinProvider === 'proprio'`: retornar imediatamente a URL própria.
   - Se `checkinProvider === 'gov_fnrh'` e `reservation.serproPrecheckinUrl` existir: retornar imediatamente essa URL.
   - Se `checkinProvider === 'gov_fnrh'` e não houver link: disparar a chamada à API SERPRO com timeout de 5 segundos (`AbortSignal.timeout(5000)`). Se falhar ou expirar, emitir alerta via `logAuditEvent` e `createNotification`, retornando a URL própria sem interromper o usuário.
5. Para unificar a experiência em todos os canais, as referências em `zapi-service.mjs` (linhas 1395, 1756) e `demo-server.mjs` (linha 13781) devem ser migradas para consumir `getCheckinUrl`.
6. Para que a interface exiba o status da conexão, um endpoint `GET /api/fnrh/serpro/health` executando um `GET /dominios/reservas/situacoes` na API SERPRO fornece verificação completa de credenciais e conectividade em menos de 5 segundos.
7. Para cumprir as diretrizes do projeto, todas as alterações em `artifacts/api-server/demo-server.mjs` devem ser espelhadas em `scripts/demo-server.mjs`.

---

## 3. Caveats

- **Credenciais de Produção vs Homologação:** No momento da investigação, credenciais reais de produção do SERPRO não estavam configuradas no ambiente local (comportamento esperado para ambiente de desenvolvimento). O serviço deve operar por padrão em modo `"homologacao"` e validar credenciais mockadas/sandbox nos testes automatizados.
- **Node.js Environment:** O ambiente executa Node v20.10.0, permitindo o uso de `fetch` nativo e `AbortSignal.timeout()` sem bibliotecas externas.

---

## 4. Conclusion

A arquitetura do backend do CorpFlats está plenamente apta a receber a chave seletora FNRH SERPRO de forma dinâmica, modular e segura. O plano técnico de implementação está detalhado no relatório `survey_backend.md`, contendo os esquemas de requisição/resposta, os pontos de injeção em `demo-server.mjs`, `zapi-service.mjs`, o novo cliente HTTP `scripts/fnrh-serpro-service.mjs`, a função resiliente `getCheckinUrl` com fallback < 5s e o novo endpoint de health check.

---

## 5. Verification Method

1. **Inspeção de Arquivos Gerados:**
   - Verificar relatório detalhado: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_survey_backend_2/survey_backend.md`
   - Verificar briefing: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_survey_backend_2/BRIEFING.md`
2. **Inspeção de Linhas de Código Analisadas:**
   - `artifacts/api-server/demo-server.mjs`: Linhas 554–577 (default settings), 3488–3510 (hydration), 10042–10088 (settings routes), 11385–11910 (criação de reservas), 13754–13835 (reenvio de link).
   - `artifacts/api-server/zapi-service.mjs`: Linhas 1395, 1579, 1756 (tags e links WhatsApp).
3. **Condições de Invalidação:**
   - Caso a especificação SERPRO v2.4.2 mude a estrutura do endpoint `POST /reservas` (invalida os schemas descritos na seção 5).

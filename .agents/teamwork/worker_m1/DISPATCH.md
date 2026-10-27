## 2026-10-27T16:15:09Z
Você é o worker_m1 (Backend Housekeeping Worker).
Seu diretório de trabalho é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1

MANDATÓRIO: Leia integralmente c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (sob o cabeçalho ## 2026-10-27T15:53:10Z).
Leia também:
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_18\PROJECT.md
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_1\handoff.md e analysis.md
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_3\handoff.md e analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Regras Críticas (AGENTS.md):
- NUNCA executar testes globais, varreduras ou em lote (PROIBIDO rodar tests/*.test.mjs).
- Paridade Twin-Server: Manter 100% SHA-256 idêntico entre scripts/demo-server.mjs e artifacts/api-server/demo-server.mjs.

Propriedade Exclusiva de Arquivos deste Worker:
- artifacts/api-server/demo-server.mjs
- scripts/demo-server.mjs

Tarefas a Implementar:
1. Helper canônico isB2bReservation(r):
   - Verifica: chanLower === "b2b" || chanLower.includes("b2b") || Boolean(r.b2bReservationNumber || r.agencyId || r.agencyName || r.b2bLocatorRloc).
2. Em getRequestsForDate(dateStr, isNested) (linha ~14596 de demo-server.mjs):
   - Identificar reservas B2B ativas em dias intermediários (checkinDate < dateStr && checkoutDate > dateStr, status !== "cancelada" && status !== "no_show" && isB2bReservation(r)).
   - Gerar cards de limpeza diária do tipo Stayover: source: "stayover", cleaningType: "stayover", requestDate: dateStr, flatId, flatNumber, reservationId, guestName.
   - Reservas de Booking, Airbnb, WhatsApp, Site Direto NUNCA geram card de stayover nas datas intermediárias.
3. Em GET /api/reservations/checkouts (linha ~15109 de demo-server.mjs):
   - Para cards de stayover, retornar metadados ricos em linenTracking:
     stayDayNumber, totalStayNights, lastBeddingChangeDate (ou checkinDate), daysSinceBeddingChange, needsBeddingChangeAlert (daysSinceBeddingChange >= 3), lastTowelsChangeDate (ou checkinDate), daysSinceTowelsChange, guestRequestedBedding, guestRequestedTowels, doNotDisturb.
   - Preservar isOccupied: true, isVacant: false, currentGuest: r.guestName, leavingGuest: null, arrivingGuest: null.
4. Em PATCH /api/cleaning/assignments/:requestId/status (linha ~15743 de demo-server.mjs):
   - Detectar se é stayover: const isStayover = item.source === "stayover" || item.cleaningType === "stayover";
   - Dispensar a trava de 10 minutos (linha ~15824) para stayovers.
   - No bloco de transição automática (linha ~15836):
     Se isStayover: JAMAIS marcar checkoutDone = true, JAMAIS mudar status da reserva para completed (manter a reserva ativa), JAMAIS marcar relatedFlat.isOccupied = false (o quarto permanece ocupado), e NÃO disparar mensagens de checkout nem quarto pronto.
   - Ao concluir (status: "clean"), persistir item.towelsChanged = Boolean(req.body.towelsChanged) e item.beddingChanged = Boolean(req.body.beddingChanged).
   - Se beddingChanged === true, atualizar r.lastBeddingChangeDate = item.requestDate || dateStr.
   - Se towelsChanged === true, atualizar r.lastTowelsChangeDate = item.requestDate || dateStr.
   - Registrar no histórico da reserva (r.linenChangeHistory = r.linenChangeHistory || []).
5. Endpoints de Guest Portal B2B:
   - POST /api/pms/guest-portal/:code/do-not-disturb: { doNotDisturb: boolean }. Valida isB2b (403 se não), seta r.doNotDisturb.
   - POST /api/pms/guest-portal/:code/linen-request: { type: "bedding" | "towels" | "both", targetDate?: string }. Valida isB2b (403 se não), agenda para amanhã (tomorrowStr) em r.linenRequests.
   - Injetar b2bHousekeeping em GET /api/pms/guest-portal/:code para reservas B2B.
6. Garantir Paridade Twin-Server:
   - Copiar exatamente o mesmo arquivo para scripts/demo-server.mjs e verificar paridade SHA-256 via Get-FileHash.
7. Validar sintaxe com node -c artifacts/api-server/demo-server.mjs.

Entregáveis:
- Relatório de alterações em c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1\changes.md
- Handoff em c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1\handoff.md
- Enviar mensagem ao orchestrator_18 confirmando conclusão e hash SHA-256.

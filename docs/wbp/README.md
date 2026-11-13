# WebBookingPro ↔ PMS API: cópia local da documentação

Cópia feita em 13/10/2026 de https://webbookingpro.redocly.app (API "Build-To-Us", versão 1.0).

## Conteúdo

| Arquivo | O que é |
|---|---|
| `wbpAPI.yaml` | **Fonte principal e mais completa.** Especificação OpenAPI 3.1 com todos os endpoints, schemas, exemplos de requisição e resposta. Download oficial: https://webbookingpro.redocly.app/_bundle/wbpAPI.yaml |
| `pages/wbpapi.md` | Página inicial: introdução, fluxo, planos tarifários, FAQ e lista de endpoints |
| `pages/wbpapi__<grupo>__<endpoint>.md` | Uma página por endpoint (35 páginas). Têm os campos de requisição, mas **não** os schemas de resposta, que estão só no YAML |
| `referencia_myallocator/` | Material complementar do Myallocator (Cloudbeds), de onde esta API deriva. A própria especificação cita "Myallocator" e o link `apidocs.myallocator.com/timezone-list.html` |

## Mapa da API

**O PMS chama a WebBookingPro** em `POST https://secure.webbookingpro.com/api/cloudpms/<Verbo>` (JSON, HTTPS e resposta sempre HTTP 200 com `success`).

- **Obrigatórios:** HealthCheck, SetupProperty, GetRoomTypes, GetRatePlans, ARIUpdate, GetBookingList, GetBookingId.
- **Opcionais:**
  - AckBooking.
  - CancelBooking (precisa ser liberado pela WBP).
  - CreateProperty (precisa ser liberado pela WBP).
  - UpdateRoom, DeleteRoom, UpdateRatePlan, DeleteRatePlan.
  - Promoções (GetPromotions, SetPromotion, RemovePromotion).
  - Canais (GetChannels, AddChannel, RemoveChannel, Get/SetChannelRooms, Get/SetChannelRates, FullRefreshChannel).
  - Avaliações (GetReviews, RespondReview) e Mensagens (GetMessages, SendMessage).

**A WebBookingPro chama o PMS**: são os callbacks, cuja URL é informada por nós.

- **BookingCreate:** reserva completa em JSON. Resposta `{}` em caso de sucesso.
- **NotifyBooking:** apenas o `booking_id`, em **form-urlencoded**. O PMS deve então chamar GetBookingList.
- **ARIFullRefresh:** pede uma carga completa. Resposta `{UpdateId}`.
- **RoomInfo:** devolve a lista de quartos do PMS.
- **Formato de erro dos callbacks:** `{Error|ErrorCode, ErrorMsg|Error}`.

**Autenticação:** `shared_secret`, igual em todas as requisições, mais `pms_cid`, `wbp_property_id`, `wbp_property_password`, `pms_property_id` e um `guid` por requisição (UUID, útil para identificar retentativas).

## Regras importantes extraídas da especificação

- **Carga inicial:** ARI de **1+ ano**, normalmente até o fim do ano seguinte, para todos os quartos e planos. Depois disso, enviar só o que mudar.
- **Datas no ARIUpdate:** `end_date` é **inclusivo**.
- **Disponibilidade:** normalmente por quarto (`units`). Pode ser por plano, se o plano tiver estoque próprio.
- **Restrições:** são por plano: `close`, `closearr`, `closedep`, `min_los`, `max_los`, `min_advanced_offset` e `max_advanced_offset`.
- **Preço:** `rate` é por unidade por noite e `rdef_single` é a tarifa de uso individual. Os campos OBP são `num_adults_included`, `adult_N` e `child_N`.
- **GetBookingList:** subtrair **5 minutos ou mais** de `wbp_booking_version` (UTC, `YYYY-MM-DD HH:MM:SS`). Quando ele vier `null`, retornar tudo.
- **Polling:** a cada 30 min como backup quando o BookingCreate está ativo; a cada 5 min quando não está.
- **Reserva:** `OrderId` com até 64 caracteres; `IsCancellation` e `IsModification` (0/1); `PaymentCollect` (`Property`|`Channel`).
- **Valores da reserva:** os preços já incluem impostos. A soma dos `Price` dos quartos = `TotalPrice`, e a soma das `DayRates` × `Units` = `Price`.
- **Quartos da reserva:** `EndDate` é a última noite (= saída − 1). As datas `OrderDate`/`OrderTime` estão em UTC.
- **Padrões:** países em ISO-3166 alpha-2 maiúsculo e moedas em ISO-4217.
- **Cartões:** os dados do cartão podem vir no campo `Payments`, que não está detalhado.
- **ARIFullRefresh:** é uma operação pesada. **Nunca** agendar periodicamente.

## Lacunas e inconsistências da documentação oficial

> Estas lacunas devem ser confirmadas com a WebBookingPro na certificação.

1. Os links **"Booking Format"** e **"Error Codes"** estão vazios. A lista abaixo de códigos `FAULT.OTA.*` vem do Myallocator e é provavelmente equivalente.
2. **Promoções, Canais, Avaliações e Mensagens** estão incompletos:
   - os exemplos foram copiados e colados de outros endpoints;
   - os schemas de resposta não batem (GetChannelRooms devolve campos de promoção);
   - GetReviews e GetMessages não descrevem a resposta;
   - o exemplo de GetReviews usa o verbo `RespondReview`.
3. **Tipos inconsistentes:**
   - `pms_property_id` aparece como integer ou string;
   - `wbp_property_id` aparece como integer ou string;
   - `booking_id` aparece como integer ou string;
   - `OrderId` aparece como string no schema e como número no exemplo do BookingCreate.
4. **Erros de digitação nos schemas:**
   - BookingCreate exige `booking`, mas o campo se chama `reservation`;
   - GetBookingId exige `Booking`, mas envia `reservation`;
   - o exemplo do BookingCreate tem `Rate"`;
   - FullRefreshChannel tem `verb` como enum `UpdateRatePlan`.
5. **AckBooking:** a descrição cita o erro 4004, mas o exemplo usa 4001.

## Códigos de erro FAULT.OTA (referência Myallocator)

| ID | Código | Significado |
|---|---|---|
| 3 | FAULT.OTA.API | Erro de comunicação com a API |
| 4 | FAULT.OTA.INVALID_XML | Resposta inválida |
| 1001 | FAULT.OTA.LOGIN | Credenciais incorretas |
| 1002 | FAULT.OTA.NOTENABLED | Interface não habilitada para channel management |
| 1003 | FAULT.OTA.OFFLINE | Canal offline / timeout |
| 1004 | FAULT.OTA.BROKEN | Não foi possível atualizar agora |
| 1100 | FAULT.OTA.ROOM.MAPPING | Mapeamento de quartos incorreto |
| 1101 | FAULT.OTA.ROOM.BEDS | Número de camas/ocupação divergente |
| 1102 | FAULT.OTA.CURRENCY | Moeda divergente |
| 1103 | FAULT.OTA.MINLOS | MinLOS fora das regras do canal |
| 1104 | FAULT.OTA.ROOM.MINRATE | Tarifa abaixo do mínimo do canal |
| 1105 | FAULT.OTA.AVAILABILITY.CONTRACTED | Não pode reduzir abaixo da cota contratada |
| 1106 | FAULT.OTA.ROOM.INACTIVE | Quarto inativo no canal |
| 1107 | FAULT.OTA.LOGIN.DISABLED | Conta bloqueada por tentativas |
| 1108 | FAULT.OTA.AVAILABILITY.READONLY | Canal em modo somente leitura |
| 4001-4004 | (Ack/Cancel) | 4001 já partiu/já confirmada · 4002 já cancelada · 4003 não pode cancelar · 4004 não pode confirmar |
| 1031 / 9203 | (callbacks) | Canal não habilitado para a propriedade / `pms_property_id` inválido |

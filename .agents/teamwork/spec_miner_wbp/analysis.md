# WebBookingPro (WBP) API Technical Specification & Integration Analysis

**Document Status:** Final Technical Specification Mining  
**Target Environment:** Guest-Flow-Manager PMS (CorpFlats Soho Residence - 19 Flats, Campos dos Goytacazes/RJ)  
**Authoritative Sources:**
- `wbpAPI.yaml` (OpenAPI 3.1.2 Specification - 4,893 lines)
- `README.md` (Local documentation summary, errata & FAULT.OTA error codes)
- `pages/*.md` (35 individual endpoint documentation pages)
- `ORIGINAL_REQUEST.md` (User and architectural requirements)

---

## 1. Executive Summary & Architectural Overview

The WebBookingPro (WBP) "Build-To-Us" API (v1.0) establishes a bidirectional communication bridge between an independent PMS (Property Management System) and online distribution channels (OTAs like Booking.com, Airbnb, Expedia, etc.).

```
+--------------------------------------------------------------------------------+
|                                GUEST-FLOW-MANAGER (PMS)                        |
|                                                                                |
|  [Single Availability Engine]      [SEBRAE Pricing Engine]     [Quarantine]    |
|       (19 flats, roomBlocks)        (Cost UH R$ 149.38)       (Conflicts / OTA)|
|                  \                           /                         ^       |
|                   v                         v                          |       |
|            [WBP Client Layer]       [WBP Callback Webhook Receiver]----+       |
|          (Outbound HTTPS JSON)         (Inbound HTTPS JSON / URL-encoded)      |
+--------------------------------------------------------------------------------+
            | (HealthCheck, SetupProperty,              ^
            |  GetRoomTypes, GetRatePlans,              | (BookingCreate,
            |  ARIUpdate, GetBookingList,               |  NotifyBooking,
            |  GetBookingId, AckBooking)                |  ARIFullRefresh,
            v                                           |  RoomInfo)
+--------------------------------------------------------------------------------+
|                        WEBBOOKINGPRO CHANNEL MANAGER / SIMULATOR               |
|                                                                                |
|  Base URL: https://secure.webbookingpro.com/api/cloudpms                       |
|  Response: Always HTTP 200 with { success: true|false, ... }                   |
|  Security: shared_secret, pms_cid, guid per request                            |
+--------------------------------------------------------------------------------+
```

### Key Architectural Tenets:
1. **Source of Truth:** PMS is the ultimate source of truth for Availability, Rates, and Restrictions (ARI).
2. **Channel Distribution:** WebBookingPro distributes ARI to external channels and ingests bookings from OTAs, relaying them to PMS.
3. **Outbound Protocol (PMS -> WBP):** JSON over HTTPS POST to `https://secure.webbookingpro.com/api/cloudpms/<Verb>`. Responses are uniformly HTTP 200 JSON with `{ success: true, ... }` or `{ success: false, errors: [...] }`.
4. **Inbound Protocol (WBP -> PMS):** Webhook callbacks to PMS public endpoints. Format is JSON for `BookingCreate`, `ARIFullRefresh`, and `RoomInfo`, but **`application/x-www-form-urlencoded`** for `NotifyBooking`.
5. **No Production Credentials During Development:** All development and validation must run against a local WBP simulator that validates payloads against `wbpAPI.yaml` and emulates real channel behaviors, edge cases, and failure modes.

---

## 2. Authentication, Security, Headers & Identifiers

### 2.1 Credential Set
Every interaction between PMS and WBP involves the following identity parameters:

| Parameter | Type / Format | Storage Location | Description |
|---|---|---|---|
| `pms_cid` | String `^[a-z0-9]+$` | Environment (`WBP_PMS_CID`) | Unique 2-4+ character channel partner ID assigned to Guest-Flow-Manager PMS by WBP upon partnership approval (e.g. `gfm1`). |
| `shared_secret` | String | Environment (`WBP_SHARED_SECRET`) | Static shared secret between PMS and WBP. Shared across all properties managed by this PMS integration. **Never stored in database state blob**. |
| `wbp_property_id` | String / Integer | Environment or Property Config | Property account username / ID in WebBookingPro. Transmitted as string in components/auth, integer in 일부 schemas. |
| `wbp_property_password` | String | Environment (`WBP_PROPERTY_PASSWORD`) | Password for the property account in WebBookingPro. |
| `pms_property_id` | String / Integer | Configuration (`WBP_PMS_PROPERTY_ID`) | Property identifier inside Guest-Flow-Manager (e.g. `'soho-19'` or `'1'`). |
| `guid` | String UUID v4 `^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$` | Generated per logical call | 36-character globally unique identifier. |

### 2.2 Security Scheme & Transmission Mechanics
- **OpenAPI Definition:** `securitySchemes: shared_secret: type: apiKey, in: query, name: shared_secret`.
- **Payload Reality:** In addition to query parameter capability, `shared_secret` is explicitly mandated in the JSON request body in `components/schemas/auth`.
- **Standard Outbound Headers:**
  ```http
  POST /api/cloudpms/<Verb> HTTP/1.1
  Host: secure.webbookingpro.com
  Content-Type: application/json; charset=utf-8
  Accept: application/json
  Accept-Encoding: gzip, deflate
  Connection: keep-alive
  ```
- **GUID Lifecycle & Retry Deduplication:**
  - Every unique operation generates a fresh UUID v4 `guid`.
  - If a network error, timeout, or temporary HTTP failure occurs and the client retries the request, **the client MUST reuse the exact same `guid`**.
  - This allows WBP (and the simulator) to detect duplicate transmissions, avoid duplicated operations, and return cached responses.
- **Callback Signature & Secret Verification:**
  - WBP passes `shared_secret` in the callback payload (or form body).
  - PMS callback receiver MUST verify `shared_secret === process.env.WBP_SHARED_SECRET` using **`crypto.timingSafeEqual`** over SHA-256 hashed buffers to prevent timing side-channel attacks.
  - If invalid, respond immediately with HTTP 200 `{ "ErrorCode": 1001, "Error": "Invalid credentials" }`.

---

## 3. Mandatory Client Endpoints (PMS -> WBP)

All calls are HTTP POST with body `application/json`. Responses return HTTP 200 with standard response envelopes.

### 3.1 HealthCheck
- **Verb:** `HealthCheck`
- **Path:** `/HealthCheck`
- **Purpose:** Verifies operational connectivity with WBP prior to configuration or property setup.
- **Request Payload:**
  ```json
  {
    "verb": "HealthCheck",
    "pms_cid": "mycloudpms1",
    "shared_secret": "s3cr3ts4uc3",
    "guid": "6C08B96E-450D-4E6A-9933-7D0305730305",
    "pms_property_id": "",
    "wbp_property_id": "",
    "wbp_property_password": ""
  }
  ```
  *Note:* `pms_property_id`, `wbp_property_id`, and `wbp_property_password` can be empty strings `""` when invoking before setup.
- **Success Response:**
  ```json
  { "success": true }
  ```
- **Failure Response:**
  ```json
  { "success": false, "errors": [{ "id": 1003, "msg": "Problems processing requests" }] }
  ```

### 3.2 SetupProperty
- **Verb:** `SetupProperty`
- **Path:** `/SetupProperty`
- **Purpose:** Validates property credentials (`wbp_property_id`, `wbp_property_password`) and confirms that the channel management connection is active on WBP.
- **Request Payload:**
  ```json
  {
    "verb": "SetupProperty",
    "pms_cid": "mycloudpms1",
    "shared_secret": "s3cr3ts4uc3",
    "guid": "6C08B96E-450D-4E6A-9933-7D0305730305",
    "pms_property_id": "25678",
    "wbp_property_id": 111,
    "wbp_property_password": "very-secret-password",
    "RoomInfo": [] 
  }
  ```
  *Note:* `RoomInfo` is optional.
- **Success Response:** `{ "success": true }`
- **Specific Errors:**
  - `1001`: "The login details you provided are incorrect." (Invalid credentials)
  - `1002`: "Credentials not enabled for channel management." (WBP account exists but CM feature not enabled)

### 3.3 GetRoomTypes
- **Verb:** `GetRoomTypes`
- **Path:** `/GetRoomTypes`
- **Purpose:** Retrieves configured room types on WBP for mapping with PMS physical units/categories.
- **Request Payload:** Standard auth fields + `"verb": "GetRoomTypes"`.
- **Success Response:**
  ```json
  {
    "success": true,
    "Rooms": [
      {
        "wbp_room_id": 111,
        "label": "Flat Standard",
        "maxPersons": 3,
        "dorm": false
      }
    ]
  }
  ```
- **Schema Anomaly Alert:** In `wbpAPI.yaml`, the response schema lists `required: [wbp_room_id, title]`, but the declared property name is `label`. Simulator and PMS client must tolerate both `label` and `title`.

### 3.4 GetRatePlans
- **Verb:** `GetRatePlans`
- **Path:** `/GetRatePlans`
- **Purpose:** Retrieves rate plans configured on WBP (room-specific or global).
- **Request Payload:** Standard auth fields + `"verb": "GetRatePlans"`.
- **Success Response:**
  ```json
  {
    "success": true,
    "RatePlans": [
      {
        "wbp_room_id": "0",
        "wbp_rate_id": "DEF_9910",
        "title": "Default Rate Plan (Sem Café)"
      },
      {
        "wbp_room_id": "0",
        "wbp_rate_id": "CB_9911",
        "title": "Com Café da Manhã"
      }
    ]
  }
  ```
- **Behavioral Rules:**
  - `wbp_room_id = "0"` indicates a global rate plan applicable to all room types.
  - Specific room IDs indicate room-bound rate plans.
  - `wbp_rate_id` cannot be `"0"`, empty string, or falsy.

### 3.5 ARIUpdate (Availability, Rates & Restrictions)
- **Verb:** `ARIUpdate`
- **Path:** `/ARIUpdate`
- **Purpose:** Pushes inventory availability (`units`), pricing (`rate`, `rdef_single`, OBP extra guests), and restrictions to OTAs.
- **Request Payload:**
  ```json
  {
    "verb": "ARIUpdate",
    "pms_cid": "mycloudpms1",
    "shared_secret": "s3cr3ts4uc3",
    "guid": "6C08B96E-450D-4E6A-9933-7D0305730305",
    "pms_property_id": "25678",
    "wbp_property_id": "111",
    "wbp_property_password": "very-secret-password",
    "currency": "BRL",
    "Inventory": [
      {
        "wbp_room_id": "111",
        "wbp_rate_id": "DEF_9910",
        "start_date": "2026-10-14",
        "end_date": "2026-10-20",
        "units": 14,
        "rate": "276.63",
        "rdef_single": "248.97",
        "num_adults_included": 2,
        "num_children_included": 0,
        "adult_3": "50.00",
        "min_los": 2,
        "max_los": 30,
        "close": false,
        "closearr": false,
        "closedep": false,
        "min_advanced_offset": 0,
        "max_advanced_offset": 90
      }
    ]
  }
  ```
- **Field Specifications:**
  - `currency`: 3-letter ISO-4217 code (must match channel setting, otherwise error `1102`).
  - `start_date`: `YYYY-MM-DD`.
  - `end_date`: `YYYY-MM-DD` (**INCLUSIVE**). Both `start_date` and `end_date` are applicable stay dates.
  - `units`: Integer >= 0. Available room count (`min(plan_cap, free_flats)`).
  - `rate`: Decimal string regex `^\d+(\.\d+)?$`. Base rate per unit per night.
  - `rdef_single`: Decimal string regex `^\d+(\.\d+)?$`. Single occupancy rate (must be <= `rate`).
  - `adult_N` / `child_N`: Pattern property `^adult_\d+$`, `^child_\d+$`. Decimal string extra fee.
  - Restrictions:
    - `min_los`: Integer >= 1. Minimum stay nights.
    - `max_los`: Integer >= 0. Maximum stay nights (0 = no restriction).
    - `close`: Boolean. Stop-sell (closes room or rate plan).
    - `closearr`: Boolean. Closed to Arrival (CTA).
    - `closedep`: Boolean. Closed to Departure (CTD).
    - `min_advanced_offset`: Integer >= 0. Cut-off days in advance.
    - `max_advanced_offset`: Integer >= 0. Last-minute booking cutoff days.
- **Success Response:** `{ "success": true }`
- **Specific Errors:** `1102` ("Your currency setting doesn't match..."), `1103` (MinLOS rule violation), `1104` (Rate below channel minimum).

### 3.6 GetBookingList
- **Verb:** `GetBookingList`
- **Path:** `/GetBookingList`
- **Purpose:** Polling endpoint to retrieve IDs of new, modified, or cancelled bookings since a specific timestamp.
- **Request Payload:**
  ```json
  {
    "verb": "GetBookingList",
    "pms_cid": "mycloudpms1",
    "shared_secret": "s3cr3ts4uc3",
    "guid": "6C08B96E-450D-4E6A-9933-7D0305730305",
    "pms_property_id": "25678",
    "wbp_property_id": "111",
    "wbp_property_password": "very-secret-password",
    "wbp_booking_version": "2026-10-13 18:30:00"
  }
  ```
- **Time Window Rule:**
  - `wbp_booking_version` is UTC `YYYY-MM-DD HH:MM:SS`.
  - When querying or simulating, the PMS MUST subtract **at least 5 minutes** from the timestamp stored from the last run (`wbp_booking_version - 5 minutes`) to prevent missed records caused by clock drift.
  - When `wbp_booking_version` is `null`, WBP returns all bookings.
- **Success Response:**
  ```json
  {
    "success": true,
    "Bookings": [
      {
        "booking_id": "B84372-281192312",
        "version": "1"
      }
    ]
  }
  ```

### 3.7 GetBookingId
- **Verb:** `GetBookingId`
- **Path:** `/GetBookingId`
- **Purpose:** Fetches full reservation payload by `booking_id`.
- **Request Payload:** Standard auth fields + `"verb": "GetBookingId"` + `"booking_id": "B84372-281192312"`.
- **Success Response:**
  ```json
  {
    "success": true,
    "reservation": {
      "OrderId": "B84372-281192312",
      "OrderDate": "2026-10-13",
      "OrderTime": "14:22:10",
      "OrderModifDate": null,
      "OrderModifTime": null,
      "IsCancellation": 0,
      "IsModification": 0,
      "OrderAdults": 2,
      "OrderChildren": 0,
      "OrderCustomers": 2,
      "TotalCurrency": "BRL",
      "TotalPrice": 553.26,
      "PaymentCollect": "Channel",
      "Customers": [
        {
          "CustomerFName": "Carlos",
          "CustomerLName": "Silva",
          "CustomerEmail": "carlos.silva@example.com",
          "CustomerCountry": "BR"
        }
      ],
      "Rooms": [
        {
          "ChannelRoomType": "111",
          "StartDate": "2026-10-15",
          "EndDate": "2026-10-16",
          "Units": 1,
          "Adults": 2,
          "Children": 0,
          "Babies": 0,
          "Occupancy": 2,
          "Currency": "BRL",
          "Price": 553.26,
          "RateDesc": "Com Café",
          "RateId": "CB_9911",
          "DayRates": [
            {
              "Date": "2026-10-15",
              "Description": "Diária 1",
              "Rate": 276.63,
              "Currency": "BRL",
              "RateId": "CB_9911"
            },
            {
              "Date": "2026-10-16",
              "Description": "Diária 2",
              "Rate": 276.63,
              "Currency": "BRL",
              "RateId": "CB_9911"
            }
          ]
        }
      ]
    }
  }
  ```
- **Critical Schema Details:**
  - `Rooms[].EndDate` represents the **last night of the stay** (= departure date minus 1).
  - `PaymentCollect`: Enum `Property` (guest pays at hotel / charged on credit card) vs `Channel` (OTA collected payment; PMS records net payable).
  - `IsCancellation`: 1 if cancelled, 0 otherwise.
  - `IsModification`: 1 if modified, 0 otherwise.

### 3.8 AckBooking
- **Verb:** `AckBooking`
- **Path:** `/AckBooking`
- **Purpose:** Informs WBP that PMS has successfully ingested and stored the booking.
- **Request Payload:** Standard auth fields + `"verb": "AckBooking"` + `"booking_id": "B84372-281192312"`.
- **Success Response:** `{ "success": true }`
- **Failure Response:**
  ```json
  { "success": false, "errors": [{ "id": 4001, "msg": "Booking has already been acknowledged" }] }
  ```
  *(Note: spec description mentions 4004, but example returns 4001).*

---

## 4. Mandatory PMS Callbacks (WBP -> PMS Webhooks)

These endpoints run on the PMS HTTP server and are invoked by WebBookingPro.

### 4.1 BookingCreate
- **Path:** Configurable (e.g. `/api/callback/wbp/BookingCreate`)
- **Method:** POST
- **Content-Type:** `application/json`
- **Payload:**
  ```json
  {
    "pms_property_id": "25678",
    "wbp_property_id": "111",
    "shared_secret": "s3cr3ts4uc3",
    "reservation": {
      "OrderId": "123456789",
      "OrderDate": "2026-10-13",
      "OrderTime": "18:02:58",
      "IsCancellation": 0,
      "IsModification": 0,
      "OrderAdults": 2,
      "OrderChildren": 0,
      "OrderCustomers": 2,
      "TotalCurrency": "BRL",
      "TotalPrice": 276.63,
      "PaymentCollect": "Channel",
      "Customers": [...],
      "Rooms": [...]
    }
  }
  ```
- **PMS Response:**
  - Success: HTTP 200 `{}` (empty JSON object).
  - Failure: HTTP 200 `{ "ErrorCode": 1031, "Error": "Channel not enabled for property" }` or `{ "Error": 1031, "ErrorMsg": "..." }`.
- **PMS Operational Requirement:**
  - The PMS must write the raw payload to durable, append-only storage **before** doing any business processing.
  - Respond immediately with `{}` to prevent WBP webhook timeouts.
  - Enqueue asynchronous processing for room allocation, automations, etc.

### 4.2 NotifyBooking
- **Path:** Configurable (e.g. `/api/callback/wbp/NotifyBooking`)
- **Method:** POST
- **Content-Type:** **`application/x-www-form-urlencoded`** *(CRITICAL: NOT JSON!)*
- **Body:**
  ```
  wbp_property_id=111&shared_secret=s3cr3ts4uc3&booking_id=123456789
  ```
- **PMS Response:** HTTP 200 `{}`
- **PMS Operational Requirement:**
  - Parse urlencoded form data.
  - Validate `shared_secret`.
  - Enqueue immediate `GetBookingId` (or `GetBookingList`) task for `booking_id`.

### 4.3 ARIFullRefresh
- **Path:** Configurable (e.g. `/api/callback/wbp/ARIFullRefresh`)
- **Method:** POST
- **Content-Type:** `application/json`
- **Payload:**
  ```json
  {
    "pms_property_id": "25678",
    "wbp_property_id": "111",
    "shared_secret": "s3cr3ts4uc3"
  }
  ```
- **PMS Response:**
  - Success: HTTP 200 `{ "UpdateId": 99277138491 }`
  - Failure: HTTP 200 `{ "ErrorCode": 1031, "Error": "Channel not enabled for property" }`
- **Operational Requirement:** Full refresh is a heavy operation (transmits all dates through next year). PMS must enqueue a background sync job and return an `UpdateId` immediately. **Never schedule full refreshes on a cron job**.

### 4.4 RoomInfo
- **Path:** Configurable (e.g. `/api/callback/wbp/RoomInfo`)
- **Method:** POST
- **Content-Type:** `application/json`
- **Payload:**
  ```json
  {
    "pms_property_id": "25678",
    "shared_secret": "s3cr3ts4uc3"
  }
  ```
- **PMS Response:**
  ```json
  {
    "RoomInfo": [
      {
        "pms_room_id": 1,
        "units": 19,
        "beds": 2,
        "dormitory": false,
        "pricingModel": "occ",
        "label": "Flat CorpFlats Soho",
        "description": "Studio flat completo no Soho Residence"
      }
    ]
  }
  ```

---

## 5. Discovered Optional Endpoints (Comprehensive Enumeration)

| Verb | Path | Category | Description | Primary Inputs | Outputs |
|---|---|---|---|---|---|
| `CancelBooking` | `/CancelBooking` | Other | Property-initiated booking cancellation | `booking_id`, `reason` | `{ success: true }` or error 4001, 4002, 4003 |
| `CreateProperty` | `/CreateProperty` | Other | Automated creation of property, rooms, taxes on WBP | Full property & room schema | `{ success: true, wbp_property_id, wbp_property_password }` |
| `UpdateRoom` | `/UpdateRoom` | Other | Create/update room definition on WBP | `room` object (units, beds, meal_codes, images) | `{ success: true }` |
| `DeleteRoom` | `/DeleteRoom` | Other | Delete room from WBP | `room.pms_room_id` | `{ success: true }` |
| `UpdateRatePlan` | `/UpdateRatePlan` | Other | Create/update rate plan on WBP | `rateplan` object (occupancy, meal_codes) | `{ success: true }` |
| `DeleteRatePlan` | `/DeleteRatePlan` | Other | Delete rate plan from WBP | `rateplan.pms_rate_id` | `{ success: true }` |
| `GetPromotions` | `/GetPromotions` | Promotions | List promotions configured on WBP | Auth fields | `{ success: true, Promotions: [...] }` |
| `SetPromotion` | `/SetPromotion` | Promotions | Create or update promotion | Promotion definition | `{ success: true }` |
| `RemovePromotion` | `/RemovePromotion` | Promotions | Delete promotion | `wbp_promotion_id` | `{ success: true }` |
| `GetChannels` | `/GetChannels` | Channels | List active channels for property | Auth fields | `{ success: true, Channels: [...] }` |
| `AddChannel` | `/AddChannel` | Channels | Attach new channel to property | Channel credentials | `{ success: true }` |
| `RemoveChannel` | `/RemoveChannel` | Channels | Detach channel from property | `wbp_channel_id` | `{ success: true }` |
| `GetChannelRooms`| `/GetChannelRooms`| Channels | Map room types on OTA to WBP | `wbp_channel_id` | `{ success: true, ChannelRooms: [...] }` |
| `SetChannelRooms`| `/SetChannelRooms`| Channels | Update room type mapping | Mapping pairs | `{ success: true }` |
| `GetChannelRates`| `/GetChannelRates`| Channels | Map rate plans on OTA to WBP | `wbp_channel_id` | `{ success: true, ChannelRates: [...] }` |
| `SetChannelRates`| `/SetChannelRates`| Channels | Update rate plan mapping | Mapping pairs | `{ success: true }` |
| `FullRefreshChannel`| `/FullRefreshChannel`| Channels | Request channel-specific refresh | `wbp_channel_id`, `periodFrom`, `periodTo` | `{ success: true }` |
| `GetReviews` | `/GetReviews` | Reviews | Fetch guest reviews from OTAs | Auth fields | `{ success: true, Reviews: [...] }` *(Spec incomplete)* |
| `RespondReview` | `/RespondReview` | Reviews | Send response to guest review | `wbp_review_id`, response text | `{ success: true }` *(Spec incomplete)* |
| `GetMessages` | `/GetMessages` | Messages | Fetch guest chat messages from OTAs | Auth fields | `{ success: true, Messages: [...] }` *(Spec incomplete)* |
| `SendMessage` | `/SendMessage` | Messages | Send chat message to guest | `wbp_Message_id`, text | `{ success: true }` *(Spec incomplete)* |

---

## 6. Authoritative Tables

### 6.1 Features Discovered
| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Client Core | HealthCheck | Liveness ping before property setup | `verb`, `pms_cid`, `shared_secret`, `guid`, IDs (optional) | `{ success: true }` | `{ success: false, errors: [{id: 1003}] }` | `wbpAPI.yaml:219`, `health_check.md` |
| 2 | Client Core | SetupProperty | Validates WBP credentials & CM enablement | `verb`, auth fields, `pms_property_id`, `wbp_property_id`, `wbp_property_password` | `{ success: true }` | Error 1001 (bad login) or 1002 (CM not enabled) | `wbpAPI.yaml:309`, `setup_property.md` |
| 3 | Client Core | GetRoomTypes | Discovers configured room types on WBP | `verb`, auth fields | `{ success: true, Rooms: [...] }` | Error 1001 on invalid auth | `wbpAPI.yaml:453`, `get_room_types.md` |
| 4 | Client Core | GetRatePlans | Discovers room-specific and global rate plans | `verb`, auth fields | `{ success: true, RatePlans: [...] }` | Error 1001 on invalid auth | `wbpAPI.yaml:580`, `get_rate_plans.md` |
| 5 | Client Core | ARIUpdate | Pushes inventory availability, pricing, OBP, and 7 restrictions | `verb`, auth fields, `currency`, `Inventory: [...]` | `{ success: true }` | Error 1102 (currency), 1103 (MinLOS), 1104 (MinRate) | `wbpAPI.yaml:1486`, `ari_update.md` |
| 6 | Client Core | GetBookingList | Polling for new/modified/cancelled reservations | `verb`, auth fields, `wbp_booking_version` (UTC or null) | `{ success: true, Bookings: [...] }` | Error 1001 on invalid auth | `wbpAPI.yaml:1756`, `get_booking_list.md` |
| 7 | Client Core | GetBookingId | Downloads full reservation data by ID | `verb`, auth fields, `booking_id` | `{ success: true, reservation: {...} }` | Error 1001 or missing reservation | `wbpAPI.yaml:1905`, `get_booking_id.md` |
| 8 | Client Core | AckBooking | Acknowledges receipt and import of booking | `verb`, auth fields, `booking_id` | `{ success: true }` | Error 4001/4004 (already acked or cannot ack) | `wbpAPI.yaml:2059`, `ack_booking.md` |
| 9 | PMS Callback | BookingCreate | Real-time push of new/modified booking to PMS | JSON with `shared_secret`, `pms_property_id`, `reservation` | HTTP 200 `{}` | HTTP 200 `{ ErrorCode: 1031, Error: "..." }` | `wbpAPI.yaml:3959`, `booking_create.md` |
| 10 | PMS Callback | NotifyBooking | Lightweight push notifying of available booking | Form-urlencoded: `wbp_property_id`, `booking_id`, `shared_secret` | HTTP 200 `{}` | HTTP 200 `{ ErrorCode: 1031, Error: "..." }` | `wbpAPI.yaml:4095`, `notify_booking.md` |
| 11 | PMS Callback | ARIFullRefresh | Triggers complete inventory re-sync from PMS | JSON with `shared_secret`, `pms_property_id` | HTTP 200 `{ UpdateId: int }` | HTTP 200 `{ ErrorCode: 1031, Error: "..." }` | `wbpAPI.yaml:3884`, `ari_full_refresh.md` |
| 12 | PMS Callback | RoomInfo | Informs WBP of PMS physical room inventory | JSON with `shared_secret`, `pms_property_id` | HTTP 200 `{ RoomInfo: [...] }` | HTTP 200 `{ ErrorCode: 9203, Error: "..." }` | `wbpAPI.yaml:4174`, `room_info.md` |
| 13 | Client Optional | CancelBooking | PMS requests cancellation of booking on OTA | `verb`, auth fields, `booking_id`, `reason` | `{ success: true }` | Error 4001 (departed), 4002 (cancelled), 4003 | `wbpAPI.yaml:2121`, `cancel_booking.md` |
| 14 | Client Optional | CreateProperty | Remote property & room provisioning on WBP | `verb`, auth fields, property metadata, room list | `{ success: true, ... }` | Error 1001 / validation errors | `wbpAPI.yaml:2208`, `create_property.md` |
| 15 | Client Optional | UpdateRoom | Create/modify room metadata on WBP | `verb`, auth fields, `room` object | `{ success: true }` | Error 1001 / validation errors | `wbpAPI.yaml:3052`, `update_room.md` |
| 16 | Client Optional | DeleteRoom | Remove room from WBP | `verb`, auth fields, `room.pms_room_id` | `{ success: true }` | Error 1001 | `wbpAPI.yaml:2988`, `delete_room.md` |
| 17 | Client Optional | UpdateRatePlan | Create/modify rate plan on WBP | `verb`, auth fields, `rateplan` object | `{ success: true }` | Error 1001 | `wbpAPI.yaml:3375`, `update_rateplan.md` |
| 18 | Client Optional | DeleteRatePlan | Remove rate plan from WBP | `verb`, auth fields, `rateplan.pms_rate_id` | `{ success: true }` | Error 1001 | `wbpAPI.yaml:3311`, `delete_rateplan.md` |
| 19 | Client Optional | Channel Management | Manage channel mappings and channel-specific refreshes | `GetChannels`, `AddChannel`, `SetChannelRooms`, `SetChannelRates`, etc. | `{ success: true, ... }` | Inconsistent schema definitions in official spec | `wbpAPI.yaml:932-1485` |
| 20 | Client Optional | Promotions | Manage promotional discounts | `GetPromotions`, `SetPromotion`, `RemovePromotion` | `{ success: true, ... }` | Error 1001 | `wbpAPI.yaml:686-931` |
| 21 | Client Optional | Guest Messaging | Adapter for OTA guest chat | `GetMessages`, `SendMessage` | `{ success: true }` | Spec incomplete (copied schemas) | `wbpAPI.yaml:3737-3883` |
| 22 | Client Optional | Guest Reviews | Adapter for OTA guest reviews | `GetReviews`, `RespondReview` | `{ success: true }` | Spec incomplete (copied schemas) | `wbpAPI.yaml:3590-3736` |

---

### 6.2 Edge Cases
| # | Feature | Input / Trigger | Observed & Specified Behavior | Engineering Handling Strategy |
|---|---------|-----------------|-------------------------------|------------------------------|
| 1 | ARIUpdate | `end_date` date boundary | In `ARIUpdate`, `end_date` is **inclusive**. E.g., `start_date: 2026-10-14, end_date: 2026-10-20` sets the rate/units for Oct 14, 15, 16, 17, 18, 19, AND 20. | The ARI generator must format `end_date` as the last applicable night of the block. |
| 2 | Booking Payload | `Rooms[].EndDate` in reservations | In booking payloads, `EndDate` is the **last night of stay**, which is `departure_date - 1 day`. | When converting to PMS reservation, check-out date is calculated as `EndDate + 1 day`. |
| 3 | GetBookingList | `wbp_booking_version` clock skew | Time offset between PMS and WBP servers can cause bookings created around polling time to be missed. | PMS must subtract **at least 5 minutes** from last sync time (`wbp_booking_version - 5 min`). |
| 4 | GetBookingList | `wbp_booking_version = null` | First synchronization or manual full sync request. | When null, PMS queries and simulator returns all existing bookings. |
| 5 | Timezones & Weekends | Friday night stay in Campos dos Goytacazes (UTC-3) | A Friday night stay (check-in Oct 16 14:00 BRT) spans into Saturday morning UTC. In WBP, dates in `ARIUpdate` are local stay dates (`YYYY-MM-DD`). Booking `OrderDate`/`OrderTime` are in UTC. | PMS translates UTC order timestamps to local BRT timestamps for check-in/out while maintaining UTC in raw records. |
| 6 | NotifyBooking | Callback Content-Type | Webhook arrives with `Content-Type: application/x-www-form-urlencoded` instead of `application/json`. | Callback router must parse urlencoded body and not fail on JSON parse errors. |
| 7 | Booking Ingestion | Concurrent duplicate delivery | Same booking arrives 5x via `BookingCreate` and 3x via `GetBookingList` polling concurrently. | Durable ingest into quarantine/raw table first with unique constraint on `OrderId`. Ingestion is serialized using distributed/in-memory lock. Exactly 1 reservation created. |
| 8 | Process Crash | Crash between ingestion and processing | Process terminates after raw payload written to DB but before reservation created. | Startup recovery worker scans unprocessed raw payloads and completes processing idempotently. |
| 9 | Payment Routing | `PaymentCollect = 'Property'` vs `'Channel'` | Guest pays at hotel vs OTA collected payment (e.g. Booking Virtual Credit Card or Airbnb payout). | `Channel`: marked paid/receivable from OTA with net value. `Property`: marked pending payment with front desk alert. |
| 10 | Credit Cards | Reservation with guest credit card | `Payments` object contains sensitive PAN and CVV. | Encrypt card with AES-256-GCM using key from env (`CARD_ENCRYPTION_KEY`). **Never store CVV**. Exclude from all plain logs. Auto-delete after 7 days post check-out. |
| 11 | Cancellation Post Check-In | Guest cancels on OTA after checking in | OTA cancellation arrives for already checked-in reservation. | Route to quarantine instead of auto-cancelling. Alert manager immediately. |
| 12 | Conflict / Overbooking | OTA booking received during full occupancy or room blocked | Flat allocation engine finds no free flat. | Route to quarantine. Do not crash. Trigger manager alert (WhatsApp + Email). |
| 13 | Pricing Clamps | Proposed price below floor or > 30% jump | Tariff engine produces R$ 180.00 (below floor R$ 276.63) or 50% change. | Floor clamp blocks submission. Variation clamp holds change for admin preview & approval. |
| 14 | Network Failure | WBP API timeout or HTTP 500 | Outgoing `ARIUpdate` fails or times out. | Exponential backoff retry with **identical `guid`**. If failure persists > 15 min, trigger manager alert. |
| 15 | General Switch | Integration disabled (`mode: 'off'`) | Callbacks hit PMS or timers fire while integration switch is OFF. | Outgoing client calls blocked (0 calls). Callbacks respond HTTP 200 `{ ErrorCode: 1002, Error: "Integration disabled" }`. Zero DB writes. |

---

## 7. Spec Errata & Inconsistencies Inventory

The official WebBookingPro specification contains several documented typos, naming mismatches, and schema contradictions. The client and simulator must adhere to the following reconciliation matrix:

| Issue # | Source Location | Official Specification Defect | Resolution Strategy for Client & Simulator |
|---|---|---|---|
| **E1** | `GetBookingId` response schema (`wbpAPI.yaml:2051-2055`) | Schema defines property `reservation: $ref: booking`, but lists `required: [success, Booking]`. | Simulator provides `reservation`. Client accepts either `reservation` or `Booking`. |
| **E2** | `BookingCreate` request schema (`wbpAPI.yaml:4065`) | Schema lists `required: [shared_secret, booking]`, but property is named `reservation`. | Simulator transmits `reservation`. Client accepts either `reservation` or `booking`. |
| **E3** | `BookingCreate` example (`wbpAPI.yaml:4035`) | Typo in JSON key: `"Rate": 34.5` contains extra quote. | Simulator generates clean `"Rate": 34.5`. Client parser tolerates malformed key if present. |
| **E4** | `BookingCreate` OrderId type (`wbpAPI.yaml:4013`) | Example shows `OrderId: 123456789` (numeric), while schema specifies string (max 64 chars). | Client converts `OrderId` to string: `String(payload.OrderId)`. Simulator outputs string. |
| **E5** | `GetRoomTypes` response schema (`wbpAPI.yaml:573`) | Properties define `label: string`, but `required` list mandates `[wbp_room_id, title]`. | Simulator returns both `label` and `title`. Client falls back: `room.label || room.title`. |
| **E6** | `GetChannelRooms` response schema (`wbpAPI.yaml:1248-1261`) | Response schema copies promotion fields (`wbp_promotion_id`, `is_active`) instead of room mapping fields (`cm_room_id`, `wbp_room_id`, `title`). | Treat as known vendor defect; simulator implements example structure `{ wbp_room_id, cm_room_id, title }`. |
| **E7** | `FullRefreshChannel` request schema (`wbpAPI.yaml:3550`) | Schema specifies `verb` enum as `UpdateRatePlan` instead of `FullRefreshChannel`. | Client sends `FullRefreshChannel`. Simulator accepts both `FullRefreshChannel` and `UpdateRatePlan`. |
| **E8** | `AckBooking` error code (`wbpAPI.yaml:2067, 2111`) | Description mentions error 4004 ("cannot acknowledge"), but example shows 4001 ("already acknowledged"). | Simulator and client support both 4001 and 4004. |
| **E9** | ID type variance across endpoints | `pms_property_id`, `wbp_property_id`, `booking_id` oscillate between string and integer across schemas and examples. | Simulator uses loose validation (`anyOf: [{type: string}, {type: integer}]`). Client normalizes to strings. |
| **E10** | Callback Error Response format (`README.md:34`) | YAML defines `{ ErrorCode: int, Error: string }`, but examples show `{ Error: int, ErrorMsg: string }`. | Client callback receiver handles both formats: `res.ErrorCode || res.Error`. |

---

## 8. Error Codes Taxonomy (FAULT.OTA.* Reference)

| Error ID | Symbol / Code | Meaning | Severity | Action Required by PMS |
|---|---|---|---|---|
| `3` | `FAULT.OTA.API` | Communication failure with OTA channel | Transient | Retry with backoff using same `guid`. |
| `4` | `FAULT.OTA.INVALID_XML` | Malformed channel response | Error | Log error payload for vendor investigation. |
| `1001` | `FAULT.OTA.LOGIN` | Incorrect credentials (`wbp_property_id` / password / `shared_secret`) | Fatal | Alert administrator immediately; halt sync. |
| `1002` | `FAULT.OTA.NOTENABLED` | Channel management not enabled for property | Configuration | Prompt user to enable CM in WBP portal. |
| `1003` | `FAULT.OTA.OFFLINE` | Channel offline or temporary timeout | Transient | Retry with exponential backoff (15s, 30s, 60s). |
| `1004` | `FAULT.OTA.BROKEN` | WBP service temporarily unable to update | Transient | Retry later. |
| `1100` | `FAULT.OTA.ROOM.MAPPING` | Room mapping invalid or missing | Configuration | Alert administrator to configure room mapping. |
| `1101` | `FAULT.OTA.ROOM.BEDS` | Occupancy / bed count mismatch | Configuration | Reconcile capacity between PMS and WBP. |
| `1102` | `FAULT.OTA.CURRENCY` | Currency mismatch (e.g. transmitted BRL, OTA set to USD) | Fatal | Alert administrator to align currency setting. |
| `1103` | `FAULT.OTA.MINLOS` | MinLOS restriction violates channel policy | Logic | Adjust restriction setting within allowed channel range. |
| `1104` | `FAULT.OTA.ROOM.MINRATE` | Rate transmitted is below channel minimum | Business Rule | Verify tariff against minimum channel floor. |
| `1105` | `FAULT.OTA.AVAILABILITY.CONTRACTED` | Availability lower than contracted minimum quota | Business Rule | Review allotment contract. |
| `1106` | `FAULT.OTA.ROOM.INACTIVE` | Room type inactive on channel | Configuration | Reactivate room or close room on PMS. |
| `1107` | `FAULT.OTA.LOGIN.DISABLED` | Account locked due to failed authentication attempts | Security Fatal | Stop automated retries; notify admin. |
| `1108` | `FAULT.OTA.AVAILABILITY.READONLY` | Channel currently in read-only mode | Operational | Wait for channel write mode restoration. |
| `4001` | `(Ack/Cancel)` | Booking has already departed / already acknowledged | Informational | Mark booking as acknowledged in PMS. |
| `4002` | `(Cancel)` | Booking is already cancelled | Informational | Update local booking status to cancelled. |
| `4003` | `(Cancel)` | Booking cannot be cancelled | Warning | Retain in quarantine; requires manual handling. |
| `4004` | `(Ack)` | Booking cannot be acknowledged | Warning | Log warning; review booking state. |
| `1031` | `(Callback)` | Channel not enabled for property | Callback Error | Return from callback if property inactive. |
| `9203` | `(Callback)` | `pms_property_id` is invalid | Callback Error | Return from callback if property ID unmapped. |

---

## 9. Requirements for the Local WBP Simulator

To enable isolated, end-to-end development and automated testing without real WBP credentials or network dependencies, the local simulator must satisfy the following technical requirements:

### 9.1 Core Server Architecture
1. **Node.js Native Server:** Runs on a dedicated port (e.g. `3099` or test-assigned port), completely decoupled from production database.
2. **Schema Validation Engine:**
   - Preloads `wbpAPI.yaml` and parses components and paths.
   - Every inbound request from the PMS client is validated against the corresponding OpenAPI request schema.
   - Uses Ajv (with OpenAPI 3.1 / JSON Schema draft 2020-12 support) or equivalent schema validation.
   - Configurable strictness: Strict mode for schema testing; Tolerant mode for known errata (E1-E10).
3. **Response Emulation:**
   - Emulates valid responses for HealthCheck, SetupProperty, GetRoomTypes, GetRatePlans, ARIUpdate, GetBookingList, GetBookingId, AckBooking.
   - Validates that outgoing responses conform to OpenAPI response schemas.

### 9.2 Programmable Test Control API
The simulator must expose programmatic control methods (in-process or via `/simulator/control`):
```typescript
interface WBPSimulator {
  // State management
  start(port?: number): Promise<number>;
  stop(): Promise<void>;
  reset(): void;
  
  // Inspection & assertion hooks
  getReceivedRequests(): Array<{
    verb: string;
    path: string;
    guid: string;
    body: any;
    headers: any;
    timestamp: number;
  }>;
  getReceivedARI(): Array<InventoryItem>;
  clearHistory(): void;
  
  // Reservation injection
  injectBooking(booking: Partial<BookingPayload>): string; // returns booking_id
  modifyBooking(bookingId: string, modifications: Partial<BookingPayload>): void;
  cancelBooking(bookingId: string, reason?: string): void;
  
  // Webhook dispatchers (Simulator -> PMS)
  sendBookingCreate(pmsUrl: string, bookingId: string): Promise<any>;
  sendNotifyBooking(pmsUrl: string, bookingId: string): Promise<any>; // sends form-urlencoded
  sendARIFullRefresh(pmsUrl: string, propertyId: string): Promise<any>;
  sendRoomInfo(pmsUrl: string, propertyId: string): Promise<any>;
  
  // Fault injection
  setFailureMode(endpoint: string, options: {
    status?: number;
    errorCode?: number; // e.g. 1001, 1002, 1102
    errorMessage?: string;
    delayMs?: number;
    dropConnection?: boolean;
    rawPayload?: string; // malformed JSON test
  }): void;
  clearFailureModes(): void;
}
```

### 9.3 Test Scenarios to Support
1. **Zero Outbound Calls Verification:** When general switch is OFF, assert simulator request count is exactly 0.
2. **Idempotent Multi-Delivery:** Inject 5 `BookingCreate` callbacks and 3 `GetBookingList` pulls for the same booking ID concurrently.
3. **Recovery After Mid-Flight Crash:** Send webhook, kill server during receipt, restart, verify ingestion.
4. **ARI Range Inclusivity:** Push ARI for 7 days; verify simulator stores 7 calendar days of rates and inventory.
5. **Pricing Clamps Verification:** Send tariff below minimum; verify rejection or clamp trigger.
6. **Card Redaction Audit:** Inject booking with simulated credit card; verify zero plain card strings leak into logs.

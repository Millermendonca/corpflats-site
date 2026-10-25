> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/api-v.1-documentation/airbnb-api/manage-a-booking-requests.md).

# Manage a Booking Requests

Most Airbnb reservations are instant: the guest books, and the booking reaches you as a regular new booking. Three situations instead produce a **request that waits for your decision**:

| Request                 | What the guest wants                         | Your options                        |
| ----------------------- | -------------------------------------------- | ----------------------------------- |
| **Inquiry**             | Asked about a stay without booking it        | Pre-approve or send a special offer |
| **Reservation request** | Asked to book, rather than booking instantly | Accept or decline                   |
| **Alteration request**  | Asked to change an existing booking          | Accept, decline, or cancel          |

All three arrive as live feed events and are answered through a single endpoint:&#x20;

```
POST /api/v1/live_feed/{id}/resolve
```

### Receiving requests

Requests reach you in two ways, and both refer to the same live feed event.

#### Webhooks

Subscribe a [webhook](/api-v.1-documentation/webhook-collection.md) to the event kinds you handle:

| Webhook event          | Fires when                             |
| ---------------------- | -------------------------------------- |
| `inquiry`              | A guest inquiry needs an answer        |
| `reservation_request`  | A reservation request needs a decision |
| `alteration_request`   | An alteration request needs a decision |
| `accepted_reservation` | A reservation request was accepted     |
| `declined_reservation` | A reservation request was declined     |

See the [Webhooks resource](/api-v.1-documentation/webhook-collection.md) for creating and testing subscriptions.

#### Live Feed API

Poll or re-read requests directly:

```http
GET /api/v1/live_feed?filter[event]=reservation_request
GET /api/v1/live_feed?filter[event]=alteration_request
GET /api/v1/live_feed?filter[event]=inquiry
GET /api/v1/live_feed/{id}
```

`GET /api/v1/live_feed` is paginated and also accepts `filter[property_id]`, `filter[channel_id]`, `filter[group_id]` and `order[inserted_at]`. Events are returned newest first.

Every resolvable event carries `payload.resolved`. Once a decision has been made, `payload.resolution` and `payload.comment` record the outcome and who made it.

Inquiries additionally appear as a system message in the guest's message thread; that message's `meta` carries the `live_feed_event_id` of the inquiry, so a messaging integration can answer an inquiry from the thread it arrived in. See the Message Threads resource.

### Answering a request

Every answer is the same call — the event ID in the path, a `resolution` object in the body:

```http
POST /api/v1/live_feed/9a52c05b-ea75-4fad-aaab-21741c3be253/resolve HTTP/1.1
Host: app.channex.io
Content-Type: application/json
user-api-key: <API_KEY>

{
  "resolution": {
    "accept": true
  }
}
```

What goes into `resolution` depends on the request you are answering. All supported decisions:

| **Request kind**    | **Decision**         | **`resolution`**                                         |
| ------------------- | -------------------- | -------------------------------------------------------- |
| Reservation request | Accept               | `{"accept": true}`                                       |
| Reservation request | Decline              | `{"accept": false, "reason": "dates_not_available"}`     |
| Inquiry             | Pre-approve          | `{"type": "preapproval", "block_instant_booking": true}` |
| Inquiry             | Send a special offer | `{"type": "special_offer", "total_price": 450}`          |
| Alteration request  | Accept               | `{"accept": "accept"}`                                   |
| Alteration request  | Decline              | `{"accept": "decline"}`                                  |
| Alteration request  | Withdraw the request | `{"accept": "cancel"}`                                   |

Note that `accept` is a boolean for reservation requests and a string for alteration requests, and that an inquiry is answered with `type` rather than `accept`. Optional fields — decline messages, `block_instant_booking` — are covered in the section for each request kind below.

The response is the event itself, with `payload` updated to reflect the decision:

```json
{
  "data": {
    "id": "9a52c05b-ea75-4fad-aaab-21741c3be253",
    "type": "live_feed_event",
    "attributes": {
      "id": "9a52c05b-ea75-4fad-aaab-21741c3be253",
      "event": "reservation_request",
      "property_id": "3e8f5809-3a1e-4f80-90a2-38d33e37b317",
      "inserted_at": "2026-04-15T20:00:11.416184",
      "payload": {
        "bms": { "…": "the requested booking, in booking revision format" },
        "message_thread_id": "6d0f3fd0-9b93-4b2f-9fe3-6f2a3f6a1c07",
        "resolved": true,
        "resolution": "accepted",
        "comment": "Accepted by Jane Doe (jane@example.com) at 2026-04-15 20:04:22Z"
      }
    }
  }
}
```

Rules that apply to every kind of request:

* **Only the three request kinds above can be resolved.** Any other event kind is rejected with `422 not_supported`.
* **A decision is final.** Resolving an event that is already resolved returns it unchanged, so a decision cannot be revised afterwards.
* **Fields belonging to another request kind are ignored**, so a stray field will not raise an error — double-check you sent the right one.

#### Errors

| Status                 | Meaning                                                |
| ---------------------- | ------------------------------------------------------ |
| `401`                  | Missing or invalid API key                             |
| `404`                  | No live feed event with this ID is visible to you      |
| `422 bad_request`      | The request body is malformed                          |
| `422 validation_error` | The resolution was rejected                            |
| `422 not_supported`    | This event kind cannot be resolved                     |
| `503`                  | The channel service is temporarily unavailable — retry |

### Reservation request

A reservation request (also called Request to Book) is a guest asking to book instead of booking instantly. **You have 24 hours to answer.** Airbnb blocks the requested dates for that window so the stay cannot be double-sold while you decide.

Connected listings are instant-book by default, but a request still arrives when, for example:

* the guest books within 48 hours of check-in and picks a custom check-in window outside the listing's check-in times;
* the guest books inside the listing's booking lead time;
* the guest does not meet the guest requirements set for instant bookings;
* the requested stay is longer than the maximum nights allowed for instant bookings, or longer than a seasonal rule permits;
* the booking falls in an extended availability window or a period opened by an availability override;
* Airbnb flags the booking as a party risk, or the listing is set up for requests only.

#### Event payload

```json
{
  "attributes": {
    "event": "reservation_request",
    "property_id": "3e8f5809-3a1e-4f80-90a2-38d33e37b317",
    "payload": {
      "bms": { "…": "the requested booking, in booking revision format" },
      "message_thread_id": "6d0f3fd0-9b93-4b2f-9fe3-6f2a3f6a1c07",
      "resolved": false
    }
  }
}
```

`bms` describes the stay being requested — dates, rooms, guests and prices — in the same attribute format as a booking revision. See the Booking Revisions resource.

#### Accept

```json
{
  "resolution": {
    "accept": true
  }
}
```

Accepting triggers a charge on the guest's payment method. If the charge fails, the guest gets 24 hours to fix it before the request is voided. Airbnb then re-checks availability and confirms the stay.

Two notifications follow, and they arrive at different times:

1. **`accepted_reservation`** — immediately, confirming your decision was passed to Airbnb.
2. **`booking_new`** (plus the generic `booking` webhook) — once Airbnb confirms the stay, which is when the booking itself is created. Until then no booking exists in Channex.

#### Decline

```json
{
  "resolution": {
    "accept": false,
    "reason": "dates_not_available",
    "decline_message_to_guest": "Sorry, we are fully booked that week.",
    "decline_message_to_airbnb": "Dates already sold on another channel."
  }
}
```

| Field                       | Description                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accept`                    | `false` to decline                                                                                                                                 |
| `reason`                    | Why you are declining: `dates_not_available`, `not_a_good_fit`, `waiting_for_better_reservation`, `not_comfortable`. Defaults to `not_comfortable` |
| `decline_message_to_guest`  | Shown to the guest                                                                                                                                 |
| `decline_message_to_airbnb` | Sent to Airbnb only                                                                                                                                |

Declining sends a `declined_reservation` webhook. No booking is created.

> **The dates may stay blocked.** If you decline because the dates are unavailable, or let the request expire without answering, Airbnb keeps the dates blocked until you make them available again. Declines for other reasons release the dates.

Once resolved, the event's `payload.resolution` reads `accepted` or `declined`, and `payload.comment` records who decided and when.

### Inquiry

An inquiry is a guest who picked dates and messaged you instead of booking. You answer it with a **pre-approval** or a **special offer** — those are the only two answers — and the guest has 24 hours to accept, which confirms the reservation immediately. To turn a guest down, leave the message unanswered.

#### Event payload

```json
{
  "attributes": {
    "event": "inquiry",
    "property_id": "3e8f5809-3a1e-4f80-90a2-38d33e37b317",
    "payload": {
      "booking_details": {
        "listing_id": "1234567",
        "checkin_date": "2026-09-07",
        "nights": 3,
        "currency": "EUR",
        "guest_name": "David",
        "property_id": "3e8f5809-3a1e-4f80-90a2-38d33e37b317",
        "room_type_id": "0d9e1f11-1f1a-4f3d-9d1a-9b1e2c3d4e5f"
      },
      "status": "accepted",
      "message_thread_id": "6d0f3fd0-9b93-4b2f-9fe3-6f2a3f6a1c07",
      "resolved": false
    }
  }
}
```

`booking_details` holds the stay the guest asked about, including guest counts and the listing currency. `status` carries the inquiry's status as it arrived from Airbnb; once you answer, it names what you sent instead.

#### Pre-approval

An invitation to book at the listing's current price, for exactly the dates and guest count in the inquiry:

```json
{
  "resolution": {
    "type": "preapproval",
    "block_instant_booking": true
  }
}
```

| Field                   | Description                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `type`                  | `preapproval`                                                                                                              |
| `block_instant_booking` | Blocks other guests from taking the same dates through Instant Book while the pre-approval is pending. Defaults to `false` |

Things to know about pre-approvals:

* You cannot change the price, dates or guest count — only the guest's own inquiry terms can be pre-approved.
* The resulting reservation shows a single total instead of a fee breakdown; only the cleaning fee is itemised.
* Because there is no breakdown, later alterations to such a reservation do not recalculate standard fees. Be careful when altering a pre-approved booking.

#### Special offer

A custom price for the stay, which may also differ from the inquiry in dates:

```json
{
  "resolution": {
    "type": "special_offer",
    "total_price": 450
  }
}
```

| Field         | Description                                                                         |
| ------------- | ----------------------------------------------------------------------------------- |
| `type`        | `special_offer`                                                                     |
| `total_price` | Required. Total price of the whole stay as a whole number in the listing's currency |

Things to know about special offers:

* `total_price` is a whole number in the listing's currency and must cover **all nights and all standard fees**, including the cleaning fee. Airbnb does not apply the listing's pricing rules to it and does not add fees on top.
* Do **not** include taxes or a security deposit.
* The Airbnb service fee is deducted from this amount — you receive the price you set minus that fee.
* The listing's availability rules still apply, so check them before sending the offer.
* `block_instant_booking` does not apply to special offers.
* A special offer carries a total guest count, not a per-category breakdown.

#### After you answer

* **An inquiry has only these two outcomes.** There is no way to decline one: if you do not want the guest, leave the message unanswered and the inquiry lapses on its own.
* The guest has **24 hours** to accept. An offer cannot be withdrawn or changed afterwards.
* If the guest accepts, the stay arrives as an ordinary **new booking** (`booking_new`) — there is no event that ties it back to the offer.
* Nothing is delivered when an offer expires or the guest declines it.
* If you send a second offer without the first being accepted, the guest only sees the most recent one; the earlier offer cannot be accepted and expires within 24 hours.
* Sending offers for the same dates to several guests is possible; the first guest to accept gets the booking.

Once answered, the event's `payload.status` names what you sent (`preapproval` or `special_offer`), `payload.resolution` holds the resolution you submitted, and `payload.comment` records who answered and when.

### Alteration request

An alteration request is a guest asking to change a booking that is already confirmed — its dates, guest count or price.

#### Event payload

```json
{
  "attributes": {
    "event": "alteration_request",
    "property_id": "3e8f5809-3a1e-4f80-90a2-38d33e37b317",
    "payload": {
      "id": "1092837465",
      "bms": { "…": "the altered booking, in booking revision format" },
      "resolved": false
    }
  }
}
```

`bms` describes the booking **as it would be after the change**, and carries the `booking_id` of the booking being altered, so you can compare it against what you hold. See the Booking Revisions resource.

#### Accept, decline or cancel

Unlike a reservation request, `accept` here takes a string:

```json
{
  "resolution": {
    "accept": "accept"
  }
}
```

| Value       | Effect                                                                            |
| ----------- | --------------------------------------------------------------------------------- |
| `"accept"`  | The change is applied                                                             |
| `"decline"` | The guest's request is refused; the booking stays as it is                        |
| `"cancel"`  | The request is withdrawn rather than answered, which Airbnb records as `CANCELED` |

Use `decline` to refuse a change a guest asked for; `cancel` withdraws an alteration that originated on your side.

Once resolved, the event's `payload.status` reports the outcome as `ACCEPTED`, `DECLINED` or `CANCELED`, and `payload.comment` records who decided and when. `payload.resolution` holds the value you sent — or `accepted` / `cancelled` when the request was resolved on Airbnb instead.

#### What follows

* **Accepting** does not create a new booking. Once Airbnb confirms the change, the existing booking is updated with a new revision, and you receive `booking_modification` (plus the generic `booking` webhook). Compare the new revision against what you hold to see what changed.
* **Declining or cancelling** sends no notification at all. The only record of the outcome is the live feed event itself, so re-read it with `GET /api/v1/live_feed/{id}` to confirm your decision was stored.
* **The guest can also withdraw the request** on Airbnb before you answer. The event is then marked resolved on its own, again without a notification, so an unanswered request is worth re-reading before acting on it.

### Related resources

* **Live Feed** — listing, reading and resolving events.
* **Webhooks** — subscribing to request notifications.
* **Booking Revisions** — the `bms` format used by reservation and alteration requests.
* **Message Threads** — the guest conversation an inquiry or request arrived in.
* **Bookings** — the booking created when a request or offer is accepted.

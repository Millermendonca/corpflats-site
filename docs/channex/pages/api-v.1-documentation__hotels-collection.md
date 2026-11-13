> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/api-v.1-documentation/hotels-collection.md).

# Properties Collection

API methods to work with Properties

A **Property** represents an accommodation business or an individual vacation rental in Channex, such as a hotel, apartment, or villa. It holds the address, contact details, content, default currency, and settings shared by that property's inventory and channel connections.

## How Properties are used

Start by creating a Property, then add its Room Types and Rate Plans. Send availability, rates, and restrictions (ARI), and connect and map the channels through which the accommodation will be sold.

* **Room Types** describe the accommodation inventory, such as double rooms or an entire apartment. Each Room Type has a `count_of_rooms` representing its physical units.
* **Rate Plans** describe how that inventory is priced and sold.
* **Channel connections** map the inventory to external distribution channels.
* **Bookings** identify the Property and accommodation that was reserved.

Even a single vacation rental needs a Room Type and a Rate Plan. Creating a Property alone does not configure its sellable inventory. See [Room Types Collection](/api-v.1-documentation/room-types-collection.md) and the [PMS Integration Guide](/guides/pms-integration-guide.md).

Use **Groups** to organize multiple Properties for viewing and reporting. A Property can belong to several Groups and must belong to at least one. When you create a Property without specifying a Group, Channex assigns the user's Default Group. See [Properties and Groups Management](/application-documentation/properties-and-groups-management.md).

## Modeling hotels and vacation rentals

Choose the Property structure that reflects how the accommodation is represented on your OTAs.

For a **hotel**, create one Property and add Room Types for the categories of accommodation it sells. For example, a hotel with 20 double rooms and 5 suites can have one Property with two Room Types whose `count_of_rooms` values are 20 and 5.

For **individual vacation rentals** listed separately on OTAs, create a separate Property for each apartment or house. A single apartment typically has one Room Type with `count_of_rooms: 1`. A portfolio of 100 independently listed apartments would therefore normally use 100 Properties, organized into Groups as needed.

**Multiple vacation rentals can also share one Property.** This is supported, and the structure should follow their representation on the OTA. For example, if a group of apartments is listed as one hotel on Booking.com, create one Property in Channex with the corresponding Room Types and unit counts. The recommendation to create separate Properties applies to independently listed rentals; it is not a requirement to split every apartment into its own Property.

## Property types and billing

**By default, a Property is billed as a Hotel.** Set `property_type` explicitly to the specific kind of accommodation so that the correct billing category is applied, particularly for vacation rentals.

Channex uses `property_type` to determine the billing category returned as `property_category`. The property options endpoint returns the same category under the name `property_type_group`.

The following table lists the types in the Hotel and Vacation Rental billing categories.

<table><thead><tr><th valign="top">Billing category</th><th>Property types</th></tr></thead><tbody><tr><td valign="top">Hotel<br><code>hotel</code></td><td><p><code>apart_hotel</code></p><p><code>capsule_hotel</code></p><p><code>guest_house</code></p><p><code>hostel</code></p><p><code>hotel</code></p><p><code>inn</code></p><p><code>lodge</code></p><p><code>motel</code></p><p><code>resort</code></p><p><code>riad</code></p><p><code>ryokan</code></p></td></tr><tr><td valign="top">Vacation Rental<br><code>vacation_rental</code></td><td><p><code>apartment</code></p><p><code>boat</code></p><p><code>chalet</code></p><p><code>country_house</code></p><p><code>farm_stay</code></p><p><code>holiday_home</code></p><p><code>homestay</code></p><p><code>villa</code></p></td></tr></tbody></table>

**Hotels are charged per Property.** The standard hotel charge is not multiplied by the number of physical rooms.

**Vacation rentals are charged per physical unit.** Channex totals `count_of_rooms` across the Property's Room Types. For example, two Room Types with `count_of_rooms` values of 2 and 3 represent 5 billable units.

Properties qualify for billing when they have at least one active channel connection. Current rates, platform fees, billing-cycle rules, volume discounts, and additional charges are described on the [pricing page](https://channex.io/pricing).

## Preparing a Property for channel connections

The API requires only `title` and `currency` to create a Property. Complete its contact and location information before connecting third-party services: email, phone, postal address, and coordinates. Set the Property's timezone so that time-based settings use the correct local time.

The Property currency provides the default currency for nested entities and connected third-party services. Channel-specific onboarding may require additional content or policies; follow the relevant channel guide as well as the Property API reference.

## Property settings

The `settings` object controls how Channex handles booking-driven availability changes, inventory dates, restrictions, and price updates for a Property. The API reference documents the accepted values and request format.

### Automatic availability updates

These rules apply to bookings received through **OTAs and Booking CRS**. Imported bookings do not trigger automatic availability changes.

<table><thead><tr><th width="408.61328125" valign="top">Booking event</th><th>Channex behavior</th></tr></thead><tbody><tr><td valign="top">New booking<br><code>allow_availability_autoupdate_on_confirmation</code></td><td>Always enabled. Decreases availability for the booked accommodation and dates. Cannot be disabled.</td></tr><tr><td valign="top">Modification<br><code>allow_availability_autoupdate_on_modification</code></td><td>When enabled, restores availability for the previous allocation and deducts it for the updated allocation, including changes to dates, Room Type, and number of rooms. Defaults to <code>false</code>.</td></tr><tr><td valign="top">Cancellation<br><code>allow_availability_autoupdate_on_cancellation</code></td><td>When enabled, restores availability for the cancelled allocation. Defaults to <code>false</code>.</td></tr></tbody></table>

For PMS integrations, keep automatic updates on modification and cancellation disabled unless your integration explicitly accounts for them. The PMS should process the booking event and send its recalculated availability to Channex.

Automatic updates affect Channex's availability. They do not replace the PMS's own booking processing. When synchronizing, send the resulting availability from your PMS inventory rather than applying the booking deduction again to a Channex value that already includes it.

### Price boundaries

Use `min_price` and `max_price` to define acceptable prices for the Property. A price below the minimum or above the maximum is **excluded from the update**, and the response includes a warning. Channex does not adjust that price to the boundary.

### Inventory horizon and booking window

`state_length` controls the inventory horizon stored by Channex. The default is 500 days, with supported values from 100 to 730 days.

`max_day_advance` limits how far ahead accommodation can be sold. Applying it sets availability to zero beyond that window. Increasing or removing the limit does not restore the overwritten values; send a full availability sync to populate them again.

### Cut-off rules

`cut_off_time` and `cut_off_days` control when Channex closes availability for the current operational date and the advance period configured by `cut_off_days`. The schedule uses the **Property's timezone**. Availability updates for dates closed by the cut-off rule are not applied while those dates remain closed by the rule.

Channex changes the operational date at **02:00 in the Property's timezone**. Account for this when configuring cut-offs around midnight: a cut-off at `00:00` covers the interval between midnight and the 02:00 date change.

### Minimum-stay handling

`min_stay_type` controls how minimum-stay restrictions are handled:

* `both` keeps Min Stay Arrival and Min Stay Through separate.
* `arrival` supports systems that use Min Stay Arrival only.
* `through` supports systems that use Min Stay Through only.

With `arrival` or `through`, your integration can send the `min_stay` key, and Channex applies the selected type in channel mappings.

## Property size limits

Standard included limits depend on the Property's category.

| Resource                           | Hotel            | Vacation Rental  |
| ---------------------------------- | ---------------- | ---------------- |
| Room Types                         | 20 per Property  | 50 per Property  |
| Rate Plans                         | 200 per Property | 10 per Room Type |
| Per-person pricing occupancy limit | 18               | 18               |

The Property response exposes its configured limits through `max_count_of_room_types`, `max_count_of_rate_plans`, `max_count_of_occupancies`, and `max_count_of_users`. These read-only fields describe the limits configured for that Property, which may differ from the standard values.

If you need a larger Property, contact support to agree on the required limits. Usage above the included allowances can incur additional charges. See [Property Size Limits](/api-v.1-documentation/property-size-limits.md) for guidance and [pricing](https://channex.io/pricing) for current overage fees.

## Lifecycle and retention

### Automatic removal

When the last active channel is deactivated, a **90-day retention period** starts. Disabled channels do not count as active connections. Connecting an active channel resets the removal timer.

If the Property remains without an active channel for that period, Channex permanently removes the Property and all its associated data. Recovery is not possible.

The Property response includes `expected_removal_date`, which contains the expected removal date or `null`.

Channex sends three separate email notifications before the expected removal date: **30 days, 7 days, and 1 day in advance**.

### Manual deletion

Deleting a Property through the API is also permanent and removes its associated data. A Property with connected channels cannot be deleted through the standard request; the Delete operation documents the explicit `force` option.

### Retention of related data

Bookings, payment-card data, logs, and disabled channels have separate retention periods. Keeping a Property connected does not retain all of its data indefinitely. See [Channex Retention Periods](/guides/channex-retention-periods.md) for those policies.

## API operations

Use the generated reference pages for authentication, parameters, request bodies, responses, and errors.

* [Get list of Properties API](/api-v.1-documentation/hotels-collection/get-list-of-properties-api.md)
* [Get list of Property Options API](/api-v.1-documentation/hotels-collection/get-list-of-property-options-api.md)
* [Get Property API](/api-v.1-documentation/hotels-collection/get-property-api.md)
* [Create Property API](/api-v.1-documentation/hotels-collection/create-property-api.md)
* [Update Property API](/api-v.1-documentation/hotels-collection/update-property-api.md)
* [Delete Property API](/api-v.1-documentation/hotels-collection/delete-property-api.md)

Full OpenAPI Specification file for Properties API you can download here: <https://openapi.gitbook.com/o/-LWLG7_8Oqm5JM-68Pw_/spec/properties-api.json>

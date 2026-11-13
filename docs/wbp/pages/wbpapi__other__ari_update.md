# ARIUpdate

This call is used to send availability, rates and restrictions to your OTA.
We will combine the updates into as few date ranges as possible, and we
split bigger updates into several API requests. We also cache data and will
not send ARI updates if the ARI data has not changed within a certain
timeframe. You can ask us to alter the number of Inventory objects we send
per request. It's also possible to ask us to restrict maximum number of days
per date range.

Endpoint: POST /ARIUpdate
Version: 1.0
Security: shared_secret

## Request fields (application/json):

  - `pms_property_id` (integer, required)
    Property ID on the your PMS

  - `wbp_property_id` (string, required)
    Username, login or property ID on the OTA

  - `wbp_property_password` (string, required)
    Password for property on WebBookingPro

  - `guid` (string, required)
    Request reference ID, used for debugging and support requests.

  - `shared_secret` (string, required)
    Authentication between the PMS and the WebBookingPro. Identical for all requests. Not to be shared with customers.

  - `pms_cid` (string, required)
    PMS ID as given by WebBookingPro

  - `verb` (string, required)
    Enum: "ARIUpdate"

  - `currency` (string, required)
    3-letter ISO 4217 currency code. This is the currency the property has set for the channel connection, and may differ from the property's native currency. The OTA can use this field to assert that rates are sent in the correct currency.

  - `Inventory` (array, required)

  - `Inventory.wbp_room_id` (string, required)
    Room ID on the OTA.

  - `Inventory.wbp_rate_id` (string, required)
    Rate plan ID on the OTA

  - `Inventory.start_date` (string, required)
    Start date for when the sent ARI is applicable.

  - `Inventory.end_date` (string, required)
    End date for when the sent ARI is applicable. Note that this date is inclusive. For example, if the end_date is 2028-08-29 and we send rate = 20.15, then this rate is applicable for someone staying/arriving on 2028-08-29.

  - `Inventory.units` (integer)
    Number of rooms bookable (available) for private rooms, or for the number of beds for shared/dorm rooms.

  - `Inventory.rate` (string)
    Price per unit for a single night.

  - `Inventory.rdef_single` (string)
    The single use rate, if only one person is staying. This will only be present for private rooms, and only if the occupancy of this room is higher than 1. If the value is 0 we recommend to not make the single use rate available, or to just use the same price as for rate.

  - `Inventory.num_adults_included` (integer)
    Number of adults included in base rate. Sent for OBP enabled channels.

  - `Inventory.num_children_included` (integer)
    Number of children included in base rate. Sent for OBP enabled channels.

  - `Inventory.max_los` (integer)
    Maximum length of stay. A guest should not be able to
book if they selected more nights than this value. A
value of 0 means that there is no restriction.

There are two ways to restrict bookings by this value:
a) Check the max_los value for the arrival date,
or b) check the max_los value for all days the guest
is intending to stay and restrict by the lowest value.

  - `Inventory.min_los` (integer)
    Minimum length of stay. A guest should not be able to
book if they selected fewer nights than this value.

There are two ways to restrict bookings by this value:
a) Check the min_los value for the arrival date,
or b) check the min_los value for all days the guest
is intending to stay and restrict by the lowest value.

  - `Inventory.closearr` (boolean)
    Restricts whether a guest can arrive within the specified date range. If true the guest can stay and depart within the date range, but not arrive.

  - `Inventory.closedep` (boolean)
    Restricts whether a guest can depart within the specified date range. If true the guest can stay and arrive within the date range, but not depart.

  - `Inventory.close` (boolean)
    Restricts whether a guest can stay within the specified date range. If true the guest cannot arrive, stay or depart within the date range. In many cases this is equivalent to units = 0, however it is also used to make specific rate plans unavailable while leaving others bookable.

  - `Inventory.min_advanced_offset` (integer)
    Cut off restriction: Specifies the number of days before the arrival date guests are allowed to book. The value of 0 resets to no restriction, which is the default. This restriction is mainly used for properties that want to have a lot of advanced bookings by offering a heavily discounted rate if guests book at least X number of days in advance.

  - `Inventory.max_advanced_offset` (integer)
    Last Minute restriction: The number of days before the arrival date guests can book. The value of 0 resets to no restriction, which is the default. This restriction is mainly used to boost last-minute reservations.

  - `Inventory.^adult_\d+$` (string)
    Extra price for the Nth adult (e.g., adult_3, adult_4). Sent for OBP enabled channels.

  - `Inventory.^child_\d+$` (string)
    Extra price for the Nth child (e.g., child_3, child_4). Sent for OBP enabled channels.

## Response 200 fields (application/json):

  - `errors` (array)
    Array of error objects. Required when success is false.

  - `errors.id` (integer, required)
    Error code. Check the "Error Codes" section of the specification for valid codes.

  - `errors.msg` (string)
    Optional error string to give more details about the error. Myallocator localises errors into different languages, so this field is generally ignored and only useful for debugging.

  - `success` (boolean, required)
    Enum: true, false



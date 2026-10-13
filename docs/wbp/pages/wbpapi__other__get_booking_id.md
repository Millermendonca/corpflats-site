# GetBookingId

Returns detailed bookings made on WebBookingPro.

The booking format is described
here in full detail.

Most fields are optional. This specification lists only the minimum required
fields to be eligible for a successful Build-To-Us integration.

Prices: Send us sell rates (rates including taxes and fees). The sum of all
room prices should equal the TotalPrice field. Day rates should be per
unit, so the sum of all day rates multiplied by the number of units should
equal the room price.

Country codes: For CustomerCountry and CustomerNationality (if you include
those fields) make sure to pass the country code as uppercase Alpha-2
ISO-3166 codes.

Currency codes: Make sure they are valid ISO-4217 (uppercase).

Make sure to provide OrderDate and OrderTime. They have to be provided in
UTC.

Guest's credit/debit card details can be provided with the Payments field.

Endpoint: POST /GetBookingId
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
    Enum: "GetBookingId"

  - `booking_id` (string, required)
    OTA booking ID of the booking to be retrieved.



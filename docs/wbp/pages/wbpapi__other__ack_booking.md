# AckBooking

Allows PMS to acknowledge a booking on your WebBookingPro from the PMS side.

* 4004 - booking cannot be acknowledged. The reason is provided in the msg field.

Endpoint: POST /AckBooking
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
    Enum: "AckBooking"

  - `booking_id` (string, required)
    OTA booking ID of the booking to be acknowledged.

## Response 200 fields (application/json):

  - `errors` (array)
    Array of error objects. Required when success is false.

  - `errors.id` (integer, required)
    Error code. Check the "Error Codes" section of the specification for valid codes.

  - `errors.msg` (string)
    Optional error string to give more details about the error. Myallocator localises errors into different languages, so this field is generally ignored and only useful for debugging.

  - `success` (boolean, required)
    Enum: true, false



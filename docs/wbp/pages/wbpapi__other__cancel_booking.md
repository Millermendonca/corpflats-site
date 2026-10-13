# CancelBooking

Allows a property to cancel a booking on WebBookingPro from the PMS side.

IMPORTANT: Please contact us to enable this capability for your channel. It
is NOT enabled by default.

The reason why the booking is to be canceled is given in the reason field.
If the booking cannot be canceled the error code should be provided. Here
are possible error codes:

* 4001 - booking has already departed
* 4002 - booking is already canceled
* 4003 - booking cannot be canceled. The reason is provided in the msg field.

Endpoint: POST /CancelBooking
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
    Enum: "CancelBooking"

  - `booking_id` (string, required)
    OTA booking ID of the booking to be cancelled.

  - `reason` (string)
    Free text reason given by property as to why the booking was cancelled.

## Response 200 fields (application/json):

  - `errors` (array)
    Array of error objects. Required when success is false.

  - `errors.id` (integer, required)
    Error code. Check the "Error Codes" section of the specification for valid codes.

  - `errors.msg` (string)
    Optional error string to give more details about the error. Myallocator localises errors into different languages, so this field is generally ignored and only useful for debugging.

  - `success` (boolean, required)
    Enum: true, false



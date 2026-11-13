# BookingCreate

Note that the endpoint for this API call is on your PMS!

WebBookingPro uses this callback to send us new bookings to your PMS. Using this callback ensures that
there is no delay between the creation of the booking and import on
PMS. Therefore it's strongly recommend to implement this callback.
Even when implemented it's still necessary to also implement the
GetBookingList and GetBookingId calls, which act as fallbacks if
the CreateBooking notification fails, when a reimport due to processing
issues on PMS is necessary, or when a specific booking needs to be
debugged.

The booking format is identical to what is being returned in the
GetBookingId call. The booking format is described
here in full detail.

See the documentation about GetBookingId for more details on the format.
The specification listed here is not complete and just the minimal
requirement.

Endpoint: POST /BookingCreate
Version: 1.0
Security: shared_secret

## Request fields (application/json):

  - `pms_property_id` (string)
    Property ID on your PMS

  - `wbp_property_id` (string)
    WebBookingPro Property ID

  - `shared_secret` (string, required)
    Authentication between the OTA and the channel. Identical for all requests. Not to be shared with customers.

  - `reservation` (object)
    The booking payload. See the response for GetBookingId for a minimal example and check the "Booking Format" section of this documentation.



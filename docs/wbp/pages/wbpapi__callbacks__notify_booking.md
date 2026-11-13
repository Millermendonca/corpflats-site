# NotifyBooking

Note that the endpoint for this API call is on your PMS!

With this API call the WebBookingPro can notify PMS to immediately request a
GetBookingList call based on the wbp_property_id
and the passed booking_id. This should be send on any new booking OR any
changes such as cancellations to an existing booking.

If the BookingCreate API call has been implemented then NotifyBooking
is not required.

Endpoint: POST /NotifyBooking
Version: 1.0
Security: shared_secret

## Request fields (application/x-www-form-urlencoded):

  - `wbp_property_id` (integer)
    WebBookingPro Property ID

  - `booking_id` (integer)
    WebBookingPro booking ID of the booking to be retrieved.

  - `shared_secret` (string, required)
    Authentication between the WebBookingPro and PMS. Identical for all requests. Not to be shared with customers.



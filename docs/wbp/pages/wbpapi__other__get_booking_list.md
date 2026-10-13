# GetBookingList

Returns a list of bookings/reservations which have not been previously
downloaded or have been modified.

The pull interval can be freely set. For channels that do not support the
CreateBooking callback the interval is usually set to pull bookings every
5 minutes. If CreateBooking is supported then the GetBookingList will
be used as a fallback every 30 minutes.

The WebBookingPro can also send to your PMS a NotifyBooking callback to inform about
new bookings available to be polled.

Endpoint: POST /GetBookingList
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
    Enum: "GetBookingList"

  - `wbp_booking_version` (string,null, required)
    With each request we send along wbp_booking_version, which
has the format YYYY-MM-DD HH:MM:SS and indicates the time
in UTC we last successfully requested bookings. It can be
null if no successful response has been received so
far. Please use wbp_booking_version to only return to us
new or modified bookings made since then. To ensure that no
booking are skipped due to a time-offset between your and
our servers make sure to always reduce 5 or more minutes
from the time given. Example: we provide 2017-06-22
12:09:19, then please return all new/modified/cancelled
bookings since 2017-06-22 12:04:19 (5 minutes before the
time sent).

If wbp_booking_version is null please return all bookings.



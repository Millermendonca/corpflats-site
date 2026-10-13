# RoomInfo

Note that the endpoint for this API call is on your PMS!

Returns the rooms configured on your PMS. It's only necessary for deep
integrations or situations where the WebBookingPro plans to automatically/create
destroy rooms using PMS's configuration. In a normal integration this
isn't very common.

Endpoint: POST /RoomInfo
Version: 1.0
Security: shared_secret

## Request fields (application/json):

  - `pms_property_id` (string, required)
    Property ID on the your PMS

  - `shared_secret` (string, required)
    Authentication between the OTA and the channel. Identical for all requests. Not to be shared with customers.



# GetPromotions

PMS should use this call to retrieve a list of all promotions

Endpoint: POST /GetPromotions
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
    Enum: "GetPromotions"



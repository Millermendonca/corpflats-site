# ARIFullRefresh

Note that the endpoint for this API call is on your PMS!
This is for technical support on the WebBookingPro enqueue a full refresh of the property. You may use either wbp_property_id (it may be resolved into a number of PMS IDs) or pms_property_id.
Note that full refreshes are heavy operations, so only call this when absolutely necessary. Under no circumstances use this callback on a scheduled basis.

Endpoint: POST /ARIFullRefresh
Version: 1.0
Security: shared_secret

## Request fields (application/json):

  - `pms_property_id` (string)
    Property ID on your PMS

  - `wbp_property_id` (string)
    Username, WebBookingPro Property ID

  - `shared_secret` (string, required)
    Authentication between the OTA and the channel. Identical for all requests. Not to be shared with customers.



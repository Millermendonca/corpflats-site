# UpdateRatePlan

Create of update rate plan after it has been changed on your PMS

Endpoint: POST /UpdateRatePlan
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

  - `rateplan` (object, required)

  - `rateplan.pms_rate_id` (integer, required)
    Rate plan ID on your PMS

  - `rateplan.wbp_rate_id` (string)
    Channel rate plan ID.

  - `rateplan.label_private` (string, required)
    The private name of the rate plan, only shown to the property.

  - `rateplan.label_public` (string, required)
    The public name of the rate plan, that can also be shown to customers.

  - `rateplan.max_occupancy` (integer)
    Maximum occupancy, 0 means no restrictions.

  - `rateplan.min_occupancy` (integer)
    Minimum occupancy, 0 means no restrictions.

  - `rateplan.meal_codes` (array)
    Combination (list) of meal codes that are available for this rate plan. 1 for All-Inclusive, 19 for Breakfast, 21 for Lunch, 22 for Dinner
    Enum: 1, 19, 21, 22

  - `verb` (string, required)
    Enum: "UpdateRatePlan"



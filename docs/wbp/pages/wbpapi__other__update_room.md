# UpdateRoom

Create or update room after it has been changed on the your PMS

Endpoint: POST /UpdateRoom
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

  - `room` (object, required)

  - `room.pms_room_id` (integer, required)
    Room ID on your PMS

  - `room.wbp_room_id` (string)
    Room ID on the OTA.

  - `room.units` (integer, required)
    How many rooms of this type there are.

  - `room.beds` (integer, required)
    Number people that can stay in this room.

  - `room.dormitory` (boolean, required)
    If true it's a dormitory (shared room), false for private rooms.

  - `room.gender` (string)
    Gender. Required for dormitory
    Enum: "MALE", "FEMALE", "MIXED"

  - `room.label` (string, required)
    Short string that describes the room for displaying purposes.

  - `room.description` (string,null, required)
    Longer description of the room which describes a room to a potential guest.

  - `room.images` (array, required)
    List of property-level images

  - `room.images.url` (string, required)
    Publicly accessible URL to the full resolution image

  - `room.images.description` (string, required)
    Description of the image to show on a channel (max. 2000 characters)

  - `room.images.sort_order` (integer, required)
    Number indicating the displayed sort order. Lower numbers means further left/top. Defaults to 0.

  - `room.rateplans` (array)
    List of rate plans configured for the room

  - `room.rateplans.pms_rate_id` (integer, required)
    Rate plan ID on your PMS. Every room has a default rate plan, and the ID (even across different rooms) is always 0. Any non-default rate plans have a higher ID.

  - `room.rateplans.label_public` (string,null, required)
    Name or short summary of the rate plan, suitable for display to guests. The label is chosen by the property.

  - `room.rateplans.label_private` (string,null, required)
    Name or short summary of the rate plan, aimed to be shown just to the property. This could for example be a code like NF for "Non-refundable". The label is chosen by the property.

  - `room.rateplans.meal_codes` (array)
    Combination (list) of meal codes that are available for this rate plan. 1 for All-Inclusive, 19 for Breakfast, 21 for Lunch, 22 for Dinner
    Enum: 1, 19, 21, 22

  - `verb` (string, required)
    Enum: "UpdateRoom"



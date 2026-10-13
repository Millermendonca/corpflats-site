# RespondReview

Respond to a review by ID

Endpoint: POST /RespondReview
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
    Enum: "RespondReview"

  - `RoomInfo` (array)
    This list of rooms will only be returned if enabled for the WebBookingPro by your PMS. By default this is not present. It's only necessary for deep integrations or situations where the PMS plans to automatically/create destroy rooms using PMS configuration. In a normal integration this isn't very usual.

  - `RoomInfo.pms_room_id` (integer, required)
    Room ID on the your PMS

  - `RoomInfo.units` (integer, required)
    How many rooms of this type there are.

  - `RoomInfo.maxPersons` (integer)
    Number people that can stay in this room.

  - `RoomInfo.maxAdults` (integer)
    Number of adults that can stay in this room.

  - `RoomInfo.maxChildren` (integer)
    Number of children that can stay in this room.

  - `RoomInfo.dormitory` (boolean, required)
    If true it's a dormitory (shared room), false for private rooms.

  - `RoomInfo.pricingModel` (string)
    Pricing Model. It can be "occ" for occupancy (default), "pax" for per adult person, "room" for per room/unit, "dormitory", "camp" for campsites (plot + per persons)

  - `RoomInfo.label` (string, required)
    Short string that describes the room for displaying purposes.

  - `RoomInfo.description` (string,null, required)
    Longer description of the room which describes a room to a potential guest.



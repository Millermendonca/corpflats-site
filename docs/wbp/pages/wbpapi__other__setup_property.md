# SetupProperty

Check/verify/validate the credentials stored in wbp_property_id and
wbp_property_password. If the credentials are invalid return with error
ID 1001. If the connection needs to be enabled from the WBP side first
return with error ID 1002.

You can prepare UI for integration with WebBookingPro where user will be prompted to put in the credentials
(wbp_property_id and wbp_property_password), which are provided by WebBookingPro. Both wbp_property_id 
and wbp_property_password should be retained by
PMS and passed in every call. 

It is up to your system if you will be handling connection and setup of password manually, visible to user or not, or using CreateProperty operationId.

Endpoint: POST /SetupProperty
Version: 1.0
Security: shared_secret

## Request fields (application/json):

  - `pms_property_id` (string, required)
    Property ID on your PMS

  - `wbp_property_id` (integer, required)
    Property ID on the WebBookingPro

  - `wbp_property_password` (string)
    Password for property on WebBookingPro

  - `guid` (string, required)
    Request reference ID, used for debugging and support requests.

  - `shared_secret` (string, required)
    Authentication between the PMS and the WebBookingPro. Identical for all requests. Not to be shared with customers.

  - `pms_cid` (string, required)
    PMS ID as given by WebBookingPro

  - `verb` (string, required)
    Enum: "SetupProperty"

  - `RoomInfo` (array)
    This list should contain of rooms enabled for the the Channel Manager. By default this is not present. It's only necessary for deep integrations or situations where the WebBookingPro plans to automatically/create destroy rooms using the PMS configuration. In a normal integration this isn't very usual.

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

## Response 200 fields (application/json):

  - `errors` (array)
    Array of error objects. Required when success is false.

  - `errors.id` (integer, required)
    Error code. Check the "Error Codes" section of the specification for valid codes.

  - `errors.msg` (string)
    Optional error string to give more details about the error. Myallocator localises errors into different languages, so this field is generally ignored and only useful for debugging.

  - `success` (boolean, required)
    Enum: true, false



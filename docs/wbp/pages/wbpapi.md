# WebBookingPro <-> PMS API

# Introduction

This API allows an PMS ("Property Manager System") to integrate with the WebBookingPro channel
manager by implementing an API receiver in their environment for bookings and API push from their side for ARI.

# Getting Started

## Becoming A Partner

To be considered as a partner, please complete our [partnership form](https://www.webbookingpro.com/become-a-partner/).
Your application will be placed in a queue to be reviewed for fit andcompatibility. We will reach out if the partnership is approved.

Upon completion of the API Credentialing, you will then have access to your Test Account login information, 
you will receive channel ID (`cid`), and the `shared_secret` that is required for the API calls.

We request that you update our team at least once every two weeks while in development with your estimated completion date.

Partners that fail to provide an estimated completion date may have their participation eligibility rescinded.

Once you have finished your development process, you will be guided on certification integration process.

Once you get certified, our team will inform you of the next steps, including providing us with:

* Logos
* Information about your service
* Contact Information to various departments of your business (support, marketing, etc.)

## Flow

If the Property is not existing already on WebBookingPro, you will have ability to Create Property using our API and automatically receive all required information needed for mapping. 

Any existing WebBookingPro property use can add integration with your System through "Integrations" menu. The property owner then maps the rooms and rate plans in your System to complete the connection.

After a property has been setup, you should push full refresh to WebBookingPro channel maanger.  This means PMS should send all availability, rates and restrictions
for the next 1+ years (usually until the end of next year) for all rooms and rate plans. After this initial sync has been
completed PMS should update the WebBookingPro whenever there is a change to ARI, eg. because a booking has been imported, room types of booking has been changed, price has been altered.

PMS should poll for bookings as backup in regular configurable intervals (e.g. 30 minutes). Bookings can and should be sent via a callback to your PMS to speed up
the import.

In this case you have to provide us your endpoint for receiving push of reservations.

# Booking Format

The full booking format is
[documented here]().
Please take note of which fields are required and which fields are optional.

# Error Codes

You can respond with error IDs listed in our
[error code]() list. Please
use the numeric codes in the `ID` column. Only errors whose code starts with
`FAULT.OTA.` are supported.

# Rate Plans

On the WebBookingPro channel manager rooms and rate plans have a many-to-many relationship. This
means that a room can have one or more rate plans, and each rate plan can be used in one or more 
rooms. For the `ARIUpdate` calls we can send different
`wbp_rate_id` values for the same `wbp_room_id`. Rates and restrictions are
tied to rate plans, while availability is usually (99%) tied to rooms, so the `units`
will be constant across different rate plans for the same dates and for the
same room, but rates and restrictions can vary. To close off a rate plan we
are using the `close` flag. 

Also there is a possibility that rate plan has it's own separater availability. 
In this case you can send availabilty even on rate plan level.

Each Rate Plan on WebBookingPro can have either separate or inherited pricing, seprate on inherited inventory availability, seprate or inherited restrictions (close, minimum stay, maximum stay).

# FAQ

## Terminology

* OTA: Online travel agency (ex: booking.com, or competitor)
* PMS: Property Management System (your system you are integration with WebBookingPro)
* cid: Channel ID - a two to four character code used by WebBookingPro uniquely identify an PMS. WebBookingPro will define this upon approving request.
* guid: Globally unique identifier, a unique 36 character code which identifies a request. Useful for seeing if a request is a retry and for debugging.

## Requests

PMS should send requests to the WebBookingPro with content-type
`application/json`, with the payload being in the body of the request. Gzip
compression and keep-alives will be used if supported. HTTPS
(SSL encryption) is required for any endpoint (WebBookingPro or yours).

HTTP response codes from WebBookingPro should always be 200. They have the
content-type `application/json`.

## Required API calls

As a minimum these API calls need to be implemented on the OTA side:

* HealthCheck
* SetupProperty
* GetRoomTypes
* GetRatePlans
* ARIUpdate
* GetBookingList
* GetBookingId


Version: 1.0
License: WebBookingPro API Terms

## Servers

WebBookingPro endpoint
```
https://secure.webbookingpro.com/api/cloudpms
```

## Security

### shared_secret

Authentication between the PMS and the WebBookingPro. Identical for all requests. Not to be shared with customers.

Type: apiKey
In: query
Name: shared_secret

## Download OpenAPI description

[WebBookingPro <-> PMS API](https://webbookingpro.redocly.app/_bundle/wbpAPI.yaml)

## Promotions

### GetPromotions

 - [POST /GetPromotions](https://webbookingpro.redocly.app/wbpapi/promotions/get_promotions.md): PMS should use this call to retrieve a list of all promotions

### SetPromotion

 - [POST /SetPromotion](https://webbookingpro.redocly.app/wbpapi/promotions/update_promotion.md): PMS should use this call to update exact promotion

### RemovePromotion

 - [POST /RemovePromotion](https://webbookingpro.redocly.app/wbpapi/promotions/delete_promotion.md): PMS should use this call to delete exact promotion

## Channels

### GetChannels

 - [POST /GetChannels](https://webbookingpro.redocly.app/wbpapi/channels/get_channels.md): PMS should use this call to retrieve a list of all Channels

### AddChannel

 - [POST /AddChannel](https://webbookingpro.redocly.app/wbpapi/channels/add_channel.md): PMS should use this call to add new Channel

### RemoveChannel

 - [POST /RemoveChannel](https://webbookingpro.redocly.app/wbpapi/channels/delete_channel.md): PMS should use this call to delete exact Channel

### GetChannelRooms

 - [POST /GetChannelRooms](https://webbookingpro.redocly.app/wbpapi/channels/get_channel_rooms.md): PMS should use this call to retrieve a list of all promotions

### SetChannelRooms

 - [POST /SetChannelRooms](https://webbookingpro.redocly.app/wbpapi/channels/update_channel_rooms.md): PMS should use this call to update exact ChannelRooms

### GetChannelRates

 - [POST /GetChannelRates](https://webbookingpro.redocly.app/wbpapi/channels/get_channel_rates.md): PMS should use this call to retrieve a list of all promotions

### SetChannelRates

 - [POST /SetChannelRates](https://webbookingpro.redocly.app/wbpapi/channels/update_channel_rates.md): PMS should use this call to update exact ChannelRates

### FullRefreshChannel

 - [POST /FullRefreshChannel](https://webbookingpro.redocly.app/wbpapi/channels/full_refresh_channel.md): Request full refresh of channel

## Reviews

### GetReviews

 - [POST /GetReviews](https://webbookingpro.redocly.app/wbpapi/reviews/get_reviews.md): Get All Reviews by Property ID

### RespondReview

 - [POST /RespondReview](https://webbookingpro.redocly.app/wbpapi/reviews/respond_review.md): Respond to a review by ID

## Messages

### GetMessages

 - [POST /GetMessages](https://webbookingpro.redocly.app/wbpapi/messages/get_messages.md): Get All Messages by Property ID

### SendMessage

 - [POST /SendMessage](https://webbookingpro.redocly.app/wbpapi/messages/respond_message.md): Respond to a Message by ID

## Callbacks

### ARIFullRefresh

 - [POST /ARIFullRefresh](https://webbookingpro.redocly.app/wbpapi/callbacks/ari_full_refresh.md): Note that the endpoint for this API call is on your PMS!
This is for technical support on the WebBookingPro enqueue a full refresh of the property. You may use either wbp_property_id (it may be resolved into a number of PMS IDs) or pms_property_id.
Note that full refreshes are heavy operations, so only call this when absolutely necessary. Under no circumstances use this callback on a scheduled basis.

### BookingCreate

 - [POST /BookingCreate](https://webbookingpro.redocly.app/wbpapi/callbacks/booking_create.md): Note that the endpoint for this API call is on your PMS!

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

### NotifyBooking

 - [POST /NotifyBooking](https://webbookingpro.redocly.app/wbpapi/callbacks/notify_booking.md): Note that the endpoint for this API call is on your PMS!

With this API call the WebBookingPro can notify PMS to immediately request a
GetBookingList call based on the wbp_property_id
and the passed booking_id. This should be send on any new booking OR any
changes such as cancellations to an existing booking.

If the BookingCreate API call has been implemented then NotifyBooking
is not required.

### RoomInfo

 - [POST /RoomInfo](https://webbookingpro.redocly.app/wbpapi/callbacks/room_info.md): Note that the endpoint for this API call is on your PMS!

Returns the rooms configured on your PMS. It's only necessary for deep
integrations or situations where the WebBookingPro plans to automatically/create
destroy rooms using PMS's configuration. In a normal integration this
isn't very common.

## Other

### HealthCheck

 - [POST /HealthCheck](https://webbookingpro.redocly.app/wbpapi/other/health_check.md): Called prior to SetupProperty or other configuration requests to verify proper operation. Should always return true.

### SetupProperty

 - [POST /SetupProperty](https://webbookingpro.redocly.app/wbpapi/other/setup_property.md): Check/verify/validate the credentials stored in wbp_property_id and
wbp_property_password. If the credentials are invalid return with error
ID 1001. If the connection needs to be enabled from the WBP side first
return with error ID 1002.

You can prepare UI for integration with WebBookingPro where user will be prompted to put in the credentials
(wbp_property_id and wbp_property_password), which are provided by WebBookingPro. Both wbp_property_id 
and wbp_property_password should be retained by
PMS and passed in every call. 

It is up to your system if you will be handling connection and setup of password manually, visible to user or not, or using CreateProperty operationId.

### GetRoomTypes

 - [POST /GetRoomTypes](https://webbookingpro.redocly.app/wbpapi/other/get_room_types.md): Returns a list of rooms configured for the passed credentials.

### GetRatePlans

 - [POST /GetRatePlans](https://webbookingpro.redocly.app/wbpapi/other/get_rate_plans.md): PMS should use this call to retrieve a list of rate plans, which are
either specific to each room, or global for all rooms.

### ARIUpdate

 - [POST /ARIUpdate](https://webbookingpro.redocly.app/wbpapi/other/ari_update.md): This call is used to send availability, rates and restrictions to your OTA.
We will combine the updates into as few date ranges as possible, and we
split bigger updates into several API requests. We also cache data and will
not send ARI updates if the ARI data has not changed within a certain
timeframe. You can ask us to alter the number of Inventory objects we send
per request. It's also possible to ask us to restrict maximum number of days
per date range.

### GetBookingList

 - [POST /GetBookingList](https://webbookingpro.redocly.app/wbpapi/other/get_booking_list.md): Returns a list of bookings/reservations which have not been previously
downloaded or have been modified.

The pull interval can be freely set. For channels that do not support the
CreateBooking callback the interval is usually set to pull bookings every
5 minutes. If CreateBooking is supported then the GetBookingList will
be used as a fallback every 30 minutes.

The WebBookingPro can also send to your PMS a NotifyBooking callback to inform about
new bookings available to be polled.

### GetBookingId

 - [POST /GetBookingId](https://webbookingpro.redocly.app/wbpapi/other/get_booking_id.md): Returns detailed bookings made on WebBookingPro.

The booking format is described
here in full detail.

Most fields are optional. This specification lists only the minimum required
fields to be eligible for a successful Build-To-Us integration.

Prices: Send us sell rates (rates including taxes and fees). The sum of all
room prices should equal the TotalPrice field. Day rates should be per
unit, so the sum of all day rates multiplied by the number of units should
equal the room price.

Country codes: For CustomerCountry and CustomerNationality (if you include
those fields) make sure to pass the country code as uppercase Alpha-2
ISO-3166 codes.

Currency codes: Make sure they are valid ISO-4217 (uppercase).

Make sure to provide OrderDate and OrderTime. They have to be provided in
UTC.

Guest's credit/debit card details can be provided with the Payments field.

### AckBooking

 - [POST /AckBooking](https://webbookingpro.redocly.app/wbpapi/other/ack_booking.md): Allows PMS to acknowledge a booking on your WebBookingPro from the PMS side.

* 4004 - booking cannot be acknowledged. The reason is provided in the msg field.

### CancelBooking

 - [POST /CancelBooking](https://webbookingpro.redocly.app/wbpapi/other/cancel_booking.md): Allows a property to cancel a booking on WebBookingPro from the PMS side.

IMPORTANT: Please contact us to enable this capability for your channel. It
is NOT enabled by default.

The reason why the booking is to be canceled is given in the reason field.
If the booking cannot be canceled the error code should be provided. Here
are possible error codes:

* 4001 - booking has already departed
* 4002 - booking is already canceled
* 4003 - booking cannot be canceled. The reason is provided in the msg field.

### CreateProperty

 - [POST /CreateProperty](https://webbookingpro.redocly.app/wbpapi/other/create_property.md): Can be used to create a new property (including rooms) on WebBookingPro based on
the details that you have in your PMS (eg. property name, address, images,
room details, etc). This call needs to be activated explicitly from our side
before you can use it. Please talk to your WebBookingPro contact before
implementing this call!

Rate plan information was added at a later date and is only transmitted for
new build-to-us implementations or if the feature has been enabled
explicitly. Note that every room has a default rate plan, and the ID
(even across different rooms) is always 0.

Once approved please provide us with your terms & conditions for us to
display to a property. You should provide them as a HTML file with only
basic styling.

### DeleteRoom

 - [POST /DeleteRoom](https://webbookingpro.redocly.app/wbpapi/other/delete_room.md): Delete room after it has been deleted on your PMS.

### UpdateRoom

 - [POST /UpdateRoom](https://webbookingpro.redocly.app/wbpapi/other/update_room.md): Create or update room after it has been changed on the your PMS

### DeleteRatePlan

 - [POST /DeleteRatePlan](https://webbookingpro.redocly.app/wbpapi/other/delete_rateplan.md): Delete rateplan after it has been deleted on your PMS.

### UpdateRatePlan

 - [POST /UpdateRatePlan](https://webbookingpro.redocly.app/wbpapi/other/update_rateplan.md): Create of update rate plan after it has been changed on your PMS


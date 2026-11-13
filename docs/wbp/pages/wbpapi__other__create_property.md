# CreateProperty

Can be used to create a new property (including rooms) on WebBookingPro based on
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

Endpoint: POST /CreateProperty
Version: 1.0
Security: shared_secret

## Request fields (application/json):

  - `pms_property_id` (string, required)
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
    Enum: "CreateProperty"

  - `Property` (object, required)

  - `Property.name` (string, required)
    Property name

  - `Property.country` (string, required)
    2-letter ISO 3166-1 alpha-2 country code. This is the country the property is located in.

  - `Property.currency` (string, required)
    3-letter ISO 4217 currency code. This is the default currency of the property.

  - `Property.timezone` (string, required)
    Timezone the property is located in. Check (this document)[https://apidocs.myallocator.com/timezone-list.html] for valid values.

  - `Property.email_default` (string, required)
    The default property email address. Defaults to default user email.

  - `Property.email_channel_booking` (string, required)
    The email address used when forwarding channel booking emails. Defaults to default user email.

  - `Property.email_contact` (string, required)
    The email address of the contact person responsible for the property creation.

  - `Property.default_min_los` (integer, required)
    Default minimum length of stay setting for this property. See the description for min_los in the ARIUpdate call for more details on this restriction.

  - `Property.default_max_los` (integer, required)
    Default maximum length of stay setting for this property.
See the description for max_los in the ARIUpdate call
for more details on this restriction.

0 means there is no restriction.

  - `Property.breakfast` (string, required)
    Default breakfast setting for the property. Empty string
means no breakfast is available, IN means breakfast is
included in the day rates and EX means breakfast is
excluded from day rates.

Note that this setting is likely not very useful and too
broad.
    Enum: "", "IN", "EX"

  - `Property.weekend` (array, required)
    List of weekdays that the property considers to be their
weekend.

Note that this setting is likely not very useful.
    Enum: "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"

  - `Property.firstname` (string, required)
    First name of property owner/manager.

  - `Property.lastname` (string, required)
    First name of property owner/manager.

  - `Property.address` (object, required)
    Address of the property.

  - `Property.address.address_line_1` (string,null)
    First address line of the property (usually the street name and house number)

  - `Property.address.address_line_2` (string,null)
    Second address line of the property (if applicable)

  - `Property.address.city` (string,null)
    City or locality the property is located in

  - `Property.address.zip` (string,null)
    Post Code (ZIP) of the property

  - `Property.address.state` (string,null)
    State of the property (if applicable)

  - `Property.address.country` (string, required)
    2-letter ISO 3166-1 alpha-2 country code. This is the country the property is located in. Same as country on the top level.

  - `Property.address.website` (string,null)
    Homepage of the property

  - `Property.address.lon` (string,null)
    Geographic longitude of the property, given as decimal degrees. Positive for east, negative for west. Example: -117.15292

  - `Property.address.lat` (string,null)
    Geographic latitude of the property, given as decimal degrees. Positive for north, negative for south. Example: 32.70954

  - `Property.address.phone` (string,null)
    Phone number for the property with international country code (eg. +44 350 5697864)

  - `Property.address.fax` (string,null)
    Fax number for the property with international country code (eg. +44 350 5697864)

  - `Property.business_contact` (object, required)
    Contact information for invoicing

  - `Property.business_contact.main_contact_name` (string,null)
    Name of the main contact for the property

  - `Property.business_contact.company_name` (string,null)
    Name of the company owning the property

  - `Property.business_contact.account_manager_name` (string,null)
    Name of the account manager responsible for the property

  - `Property.business_contact.vat_id` (string,null)
    Tax ID for the property

  - `Property.business_contact.address_line_1` (string,null)
    First address line of the company or property owner (usually the street name and house number)

  - `Property.business_contact.address_line_2` (string,null)
    Second address line of the company or property owner (if applicable)

  - `Property.business_contact.state` (string,null)
    State of the company or property owner (if applicable)

  - `Property.business_contact.zip` (string,null)
    Post Code (ZIP) of the company or property owner

  - `Property.business_contact.city` (string,null)
    City or locality the company or property owner is located in

  - `Property.business_contact.country` (string, required)
    2-letter ISO 3166-1 alpha-2 country code. This is the country the the company or property owner is located in.

  - `Property.images` (array, required)
    List of property-level images

  - `Property.images.url` (string)
    Publicly accessible URL to the full resolution image

  - `Property.images.description` (string)
    Description of the image to show on a channel (max. 2000 characters)

  - `Property.images.sort_order` (integer)
    Number indicating the displayed sort order. Lower numbers means further left/top. Defaults to 0.

  - `Property.rooms` (array, required)
    List of rooms configured for the property

  - `Property.rooms.pms_room_id` (integer, required)
    Room ID on your PMS

  - `Property.rooms.units` (integer, required)
    How many rooms of this type there are.

  - `Property.rooms.beds` (integer, required)
    Number of people that can stay in this room.

  - `Property.rooms.dormitory` (boolean, required)
    true if it's a dormitory (shared room), false for private rooms.

  - `Property.rooms.gender` (string)
    Required for dormitory
    Enum: "MALE", "FEMALE", "MIXED"

  - `Property.rooms.label` (string, required)
    Short string that describes the room for displaying purposes.

  - `Property.rooms.description` (string,null, required)
    Longer description of the room which describes a room to a potential guest.

  - `Property.rooms.images` (array, required)
    List of room-level images.

  - `Property.rooms.rateplans` (array)
    List of rate plans configured for the room

  - `Property.rooms.rateplans.pms_rate_id` (integer, required)
    Rate plan ID on your PMS. Every room has a default rate plan, and the ID (even across different rooms) is always 0. Any non-default rate plans have a higher ID.

  - `Property.rooms.rateplans.label_public` (string,null, required)
    Name or short summary of the rate plan, suitable for display to guests. The label is chosen by the property.

  - `Property.rooms.rateplans.label_private` (string,null, required)
    Name or short summary of the rate plan, aimed to be shown just to the property. This could for example be a code like NF for "Non-refundable". The label is chosen by the property.

  - `Property.rooms.rateplans.meal_codes` (array)
    Combination (list) of meal codes that are available for this rate plan. 1 for All-Inclusive, 19 for Breakfast, 21 for Lunch, 22 for Dinner
    Enum: 1, 19, 21, 22

  - `Property.taxes` (array)
    Property taxes and fees.

  - `Property.taxes.id` (integer, required)
    Tax/fee ID in your PMS

  - `Property.taxes.is_fee` (boolean)
    true if it's a fee, otherwise it's a tax.

  - `Property.taxes.is_inclusive` (boolean, required)
    true when tax/fee included in rate.

  - `Property.taxes.is_per_night` (boolean, required)
    true when tax/fee is per night, otherwise per stay.

  - `Property.taxes.is_percent` (boolean, required)
    true when amount represents percentage, otherwise absolute value.

  - `Property.taxes.is_refundable` (boolean, required)
    For example, refundable damage deposit fee will set this true.

  - `Property.taxes.amount` (number)
    Tax/fee amount. Either amount in currency or percent, depending on is_percent field. For example 20.5 can mean 20.5% or $20.5. Only one element either amount or amounts is supposed to be active, not both.

  - `Property.taxes.amounts` (array)
    Array of tax/fee amounts. Multiple amounts may apply at the same time depending on the conditions for each item. Only one element either amount or amounts is supposed to be active, not both.

  - `Property.taxes.amounts.amount` (number, required)
    Tax/fee amount. Either amount in currency or percent, depending on is_percent field. For example 20.5 can mean 20.5% or $20.5.

  - `Property.taxes.amounts.conditions` (array)
    Array of conditions that determine if this amount will be applied.

  - `Property.taxes.amounts.conditions.min_start` (string)
    Amount of parameter above which tax is applied. For example, if condition_parameter is "total-price" and here we have 200, this means that tax/fee is applied when total price is more or equal 200.

  - `Property.taxes.amounts.conditions.max_end` (string)
    Amount of parameter below which tax is applied. For example, if condition_parameter is "total-price" and here we have 200, this means that tax/fee is applied when total price is less or equal 200.

  - `Property.taxes.amounts.conditions.one_of` (array)
    List of values of a parameter. For example, if condition_parameter is "day-of-week" then ["SAT","SUN"] might be here.

  - `Property.taxes.amounts.conditions.max_end_inclusive` (boolean)
    Whether the max_end parameter is inclusive (less or equal) or not (strictly less).

  - `Property.taxes.amounts.conditions.min_start_inclusive` (boolean)
    Whether the min_start parameter is inclusive (greater or equal) or not (strictly greater).

  - `Property.taxes.amounts.conditions.condition_parameter` (string, required)
    Parameter that determines whether this tax/fee will be applied or not.
    Enum: "adult-age", "booking-date", "checkin-date", "checkout-date", "child-age", "date-in-range", "day-of-week", "length-of-stay", "night-number", "nightly-rate", "nights-booked-in-advance", "number-of-guests", "number-of-nights", "number-of-pets", "payment-type", "product-code-id", "rate-type", "room-id", "stay-dates-intersect", "total-price"

  - `Property.taxes.category` (string, required)
    Tax category.
    Enum: "occupancy_tax", "other_fee", "other_tax", "resort_tax", "sales_tax", "service_charge", "tourism_tax", "vat"

  - `Property.taxes.code` (string)
    Issued by federal government tax/fee code.

  - `Property.taxes.external_id` (string)
    Optional custom field to store an external system ID. Not guaranteed to be unique.

  - `Property.taxes.description` (string)
    Tax/fee description.

  - `Property.taxes.name` (string, required)
    Tax/fee name.

  - `Property.taxes.applies_per` (string, required)
    To which entity tax/fee is applied.
    Enum: "adult", "all-adults", "booking", "booking-external-item", "child", "children", "guest", "pet", "pets", "rateplan", "room", "room-type", "service"

  - `Property.taxes.tax_basis_includes_fees` (array)

  - `Property.taxes.tax_basis_includes_fees.fee_id` (integer, required)
    ID of a fee

  - `Property.taxes.calculation_basis` (string)
    To what value percentage will be applied in order to calculate tax amount in currency. Only applicable if is_percent is true.
    Enum: "fees", "fees-per-night", "rate", "rate-and-fees", "rate-and-fees-per-night", "rate-per-night"



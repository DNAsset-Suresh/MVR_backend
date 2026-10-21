# Booking and availability workflow

1. A visitor chooses User Login or creates an account; registration signs them in automatically.
2. The user dashboard links to the live availability calendar. Unpublished dates cannot be selected.
3. Selecting an AVAILABLE date/time opens the booking form with its slot ID. The six steps collect event type; published date/time and optional alternative; organisation/contact details; event details; review; submission.
4. Saved account details are editable and prefilled. The backend revalidates every field and locks/rechecks the chosen slot. A stale/unavailable slot returns “The selected time slot is no longer available.”
5. An accepted enquiry receives a PostgreSQL-generated `MVR-YEAR-NNNNN` reference, history entry, admin notification and queued receipt. The slot remains AVAILABLE until the team reserves it, so other organisations may enquire.
6. The admin reviews it, requests information, places a hold or confirms. Holds and confirmations reserve a slot exclusively. Confirmation updates the booking, slot, history and notifications atomically.
7. Customers see only their own bookings and public status history. Tracking requires login, even with a valid reference. Private staff notes are excluded.
8. Cancellation releases a reservation. Completed events remain in history and retain a booked slot. Users can view all previous enquiries from My Bookings.

Permitted statuses: NEW, UNDER_REVIEW, MORE_INFORMATION_REQUIRED, DATE_HOLD, CONFIRMED, COMPLETED, CANCELLED. The state-transition map is enforced in `backend/services/bookings.js`. Arbitrary status changes from users are rejected.

All dates/times use India Standard Time. Availability refreshes when a visitor returns to the tab; submissions and confirmations always verify PostgreSQL, regardless of what an old browser tab displays. No payment or automatic confirmation is performed.

## Fixed half workflow

Select First Half, Second Half or Full Day on a published date. Full Day is available only when both halves are available. Category tiles under Book MVR select Corporate, Wedding/Reception, Cultural, Seminar or Workshop; the detailed event type and topic options are still available. Enquiries do not reserve availability until an administrator holds or confirms them.

Email and organisation type come from the account and are locked in the profile. First and last name are mandatory. Alternate contact is optional; checking Is WhatsApp number requires an alternate number and selects it for WhatsApp notifications.

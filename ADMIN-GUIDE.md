# Administrator guide

Sign in at `/admin/login.html` using a staff account. Public registrations cannot access this workspace. Create the first super administrator using the setup command in README.

## Publish availability

Open Availability → Add Available Date. Choose the date, start/end time, status and private notes. Duration is calculated from the times and checked again by the server. Save Availability publishes the record to the public calendar.

Add multiple non-overlapping slots for a date. Edit changes an unreserved slot; occupied or enquired-about times have safeguards against silently changing customer requests. Block/Unblock toggles an individual slot. Use the date filter followed by Block Date/Unblock Date for the full published day. Blocking is rejected if a slot is already reserved. Notes remain private.

AVAILABLE accepts enquiries. TENTATIVE is displayed but cannot be selected. BOOKED cannot be selected. BLOCKED appears as Unavailable. A standalone Hold marks a slot tentative until Release hold. The Calendar section provides a month view; select a day to filter its slots.

## Review bookings

Bookings lists real enquiries with their reference, date, event, organisation and status. Search or filter by status and open a reference. Change it to Under Review, More Information Required, Date Hold, Confirmed, Cancelled or Completed as appropriate. A customer message is visible in booking history and notifications. Internal notes are for staff only.

A Date Hold reserves the slot for that enquiry; another enquiry cannot be confirmed against it. Release the hold from Availability, or move the booking back to Under Review. Confirming converts the slot to BOOKED in the same database transaction. Cancellation releases the reserved slot. Completion preserves the booked slot and event history. Cancelled/completed records cannot be reopened; create a new enquiry instead.

## Manage accounts and content

Users lists registration date, contact/organisation, account status and enquiry count. Click the enquiry count for history. Deactivation immediately revokes sessions. Send password reset queues an email and never shows a password. Super administrators can create staff/customer accounts and select a role. Booking managers can manage customer accounts only.

Content, Programmes, Media, Testimonials and Trust share an editor. Save as a draft until approved; check Publish approved content when ready. Set display order, image/resource links and body text. Media uploads accept JPEG, PNG, WebP, MP4 and PDF up to 20 MB. Uploading an asset does not publish it; save the content record afterward.

Settings controls the public team contacts and tagline, and reports integration configuration/queue counts. Notifications shows booking activity. Audit Logs shows the latest 500 security and administrative actions to super administrators. Logout revokes the current admin session without affecting a separately signed-in user account.

## Updated booking and account controls

Publish a date to create First Half and Second Half together. Edit either half to change its availability; use the date actions for both. Full Day enquiries reserve both halves when held or confirmed and release both on cancellation. The calendar label Blocked covers manual blocks and confirmed reservations. Use the enquiry status to distinguish confirmed bookings. Remove date deletes both halves only when there is no enquiry history.

Booking Enquiries has Print and Export to Word (.docx) actions in the list and detail views. Print opens an uncluttered view with a Print enquiry button; Word downloads the complete enquiry including private internal notes and status history. Keep these administrative exports within the authorised team.

Super Admin can change frozen customer identity fields using Users → Edit email / type. Changing an email signs that account out and clears old password reset links. Booking managers cannot make these identity changes.

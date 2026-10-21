# API reference

All JSON responses have `{ "success": true, "data": ... }` or `{ "success": false, "message": "..." }`. Validation errors return 400; unauthenticated users 401; forbidden roles/CSRF/origins 403; missing records 404; availability/duplicate conflicts 409; rate limits 429. Server failures do not expose stack traces.

All writes require `X-MVR-Request: 1`. Authenticated writes additionally require `X-CSRF-Token` from the matching `/me` response. Use same-origin credentials. CORS is intentionally restricted to the configured `APP_ORIGIN`; cross-origin browser clients are not supported. Cookies are separate for user/admin sessions.

## Authentication

| Method | Endpoint | Behavior |
| --- | --- | --- |
| POST | `/api/auth/register` | Validate profile/password/confirmation, create USER, log in |
| POST | `/api/auth/login` | User-only sign-in |
| POST | `/api/auth/logout` | Revoke current user session |
| GET | `/api/auth/me` | User/profile/CSRF token or null |
| POST | `/api/auth/forgot-password` | Generic response; queue 30-minute reset email |
| POST | `/api/auth/reset-password` | Consume token, replace password, revoke sessions |
| POST | `/api/admin/auth/login` | Staff-only sign-in |
| GET | `/api/admin/auth/me` | Admin identity/roles/CSRF token or null |
| POST | `/api/admin/auth/logout` | Revoke current admin session |

Registration/profile: `full_name`, `organisation`, `organisation_type`, `email`, `phone`, `whatsapp`, `city`. Registration adds `password`, `confirm_password`. Role/status fields are rejected on public registration.

## Public and customer APIs

| Method | Endpoint | Access |
| --- | --- | --- |
| GET | `/api/health` | Public database health |
| GET | `/api/availability?from=YYYY-MM-DD&to=YYYY-MM-DD` | Future published slots |
| GET | `/api/availability/:date` or `/:date/slots` | Slots on a published date |
| GET/PUT | `/api/user/profile` | Own profile |
| GET/POST | `/api/user/bookings` | Own enquiries / create enquiry |
| GET | `/api/user/bookings/my` | Own enquiries list |
| GET | `/api/user/bookings/:reference` | Own detail and public history |
| PATCH/POST | `/api/user/bookings/:id/additional-information` | Submit requested information for enquiry |
| GET | `/api/notifications` or `/api/user/notifications` | Own in-app notifications |
| PATCH/POST | `/api/notifications/:id/read` | Mark own notification as read |
| GET | `/api/programmes`, `/api/speaking-topics`, `/api/media` | Published editorial content |
| GET | `/api/content/:kind` | Published approved content |
| GET | `/api/settings` | Allowlisted public contact settings |
| POST | `/api/chat` | `{message}`; approved answers and links |
| POST | `/api/chat/booking` | Validate booking draft; no booking created |

`/api/bookings` and `/api/bookings/:reference` redirect with 307 to authenticated customer routes. Reference knowledge alone never permits reading a booking.

Booking body adds to the profile: `slot_id`, optional `alternative_slot_id`, `event_type`, `venue`, `participants` (1–1,000,000), `audience_type`, `language`, `mode`, `description`, optional `special_requirements`, `additional_information`. Fields and enumerations are defined in `backend/validators/index.js`. Arbitrary date/time values cannot override the chosen slot. New requests require an AVAILABLE slot.

## Administration

| Method | Endpoint | Permission |
| --- | --- | --- |
| GET | `/api/admin/dashboard` | Booking read |
| GET | `/api/admin/bookings?user_id=UUID`, `/api/admin/bookings/:id` | Booking read |
| PUT/PATCH | `/api/admin/bookings/:id` | Booking write; status, internal_notes, public message |
| PATCH | `/api/admin/bookings/:id/approve` | Booking write; confirm booking transactionally |
| PATCH | `/api/admin/bookings/:id/reject` | Booking write; reject booking with reason |
| PATCH | `/api/admin/bookings/:id/request-information` | Booking write; request customer clarification |
| POST | `/api/admin/bookings/:id/confirm`, `/cancel`, `/hold` | Booking write |
| GET/POST | `/api/admin/availability` | Read / booking write |
| PUT/PATCH/DELETE | `/api/admin/availability/:id` | Booking write |
| POST | `/api/admin/availability/:id/hold`, `/release`, `/block`, `/unblock` | Booking write |
| POST | `/api/admin/availability/block-date`, `/unblock-date` | Booking write; `{date}` |
| GET | `/api/admin/users` | Super admin / booking manager |
| POST | `/api/admin/users` | Super admin; profile, password, role |
| PUT | `/api/admin/users/:id` | `{active}`; managers may manage USER accounts only |
| POST | `/api/admin/users/:id/reset-password` | Reset email; staff restricted to super admin |
| GET/POST | `/api/admin/content?kind=...` | Editorial access / matching write role |
| PUT/DELETE | `/api/admin/content/:id` | Matching content or trust write role |
| POST | `/api/admin/uploads` | Content write; raw bytes, Content-Type, X-Filename |
| GET/PUT | `/api/admin/settings` | Super admin |
| GET | `/api/admin/integrations` | Super admin; config flags and queue counts |
| GET | `/api/admin/notifications` | Booking read |
| GET | `/api/admin/audit-logs` | Super admin; latest 500 entries |

Slot payload: `date`, `start_time` and `end_time` in HH:MM, `status`, optional matching `duration` in minutes, optional `internal_notes`. Content payload: `kind`, `title`, `body`, `url`, `image_url`, `published` boolean, `sort_order` integer.

Protected HTML is served through authenticated Express routes, not a public static directory. Admin page access without an admin session returns 403 and a Refresh header pointing to `/admin/login.html`.

## Fixed halves and profile API changes

Registration and profile payloads use mandatory `first_name` and `last_name` instead of `full_name`. Responses retain derived `full_name` for display. Optional `alternate_phone` and boolean `alternate_is_whatsapp` are accepted; a true flag requires a valid alternate number and uses it as `whatsapp`. Registration organisation types are School, College, University, Corporate, Trust / NGO and Other. Profile PUT rejects changes to email or organisation_type with 403. Super Admin-only `PUT /api/admin/users/:id/identity` accepts `{email, organisation_type}`.

`POST /api/admin/availability` accepts `{date, half: "FIRST_HALF", status: "AVAILABLE", internal_notes: ""}` and publishes **both** halves with the initial status, returning the requested half. Duplicate published dates return 409. PUT/PATCH uses `{date, half, status, internal_notes}`; published date and half are immutable. Status input is AVAILABLE, TENTATIVE or BLOCKED. DELETE on either half removes the entire date only if neither half has booking history. Public results expose `id`, `date`, `half`, `public_status`, `selectable`, without hourly times. BOOKED is mapped to BLOCKED in public output.

Booking POST accepts `slot_id` for a half; Full Day uses the First Half ID as `slot_id` and the same date's Second Half ID as `second_slot_id`. Both are validated and locked in stable order. `alternative_slot_id` is a different optional half, never a substitute for Full Day. Both halves must be available. Holds and confirmation reserve both atomically; cancellation and hold release free both. PostgreSQL unique slot claims independently prevent overlapping reservations.

GET `/api/admin/bookings/:id/print` returns escaped, print-ready HTML. GET `/api/admin/bookings/:id/export.docx` returns a genuine OOXML attachment. Both require readBookings permission, disable caching and add an audit record; private notes are intentionally included for the authorised team.

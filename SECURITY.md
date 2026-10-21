# Security implementation

## Identity and authorisation

Passwords are salted and hashed with Node's scrypt (`N=32768`, `r=8`, `p=1`, 64-byte output). Passwords require 12–128 characters. Session IDs and reset tokens contain 32 cryptographically random bytes; only SHA-256 digests are stored. Session lifetime is eight hours. Reset lifetime is thirty minutes and tokens are single-use. Reset/deactivation revokes all sessions. Logout deletes the matching session.

User/admin cookies are distinct (`mvr_user`, `mvr_admin`). Both are HttpOnly, SameSite=Strict and Secure in production. Staff credentials do not automatically create a public session. Registrations receive USER only; unknown registration fields are rejected. Roles and account status are read from PostgreSQL on each request.

| Role | Permissions |
| --- | --- |
| USER | Own profile, bookings, history and notifications |
| SUPER_ADMIN | All administration, staff accounts, settings and audit logs |
| BOOKING_MANAGER | Bookings, availability, customer accounts, notifications |
| CONTENT_MANAGER | Biography, programmes, topics, journey, statistics, media, testimonials and FAQs |
| TRUST_MANAGER | Trust initiatives and future vision |
| VIEWER | Read booking/availability dashboards and editorial content; no writes |

Managers cannot modify staff accounts. Self-deactivation and removing the last active super administrator are rejected. Users cannot set booking status, internal notes or availability, even with a manually crafted HTTP request.

## HTTP and data protections

Helmet supplies CSP, frame restrictions, MIME sniffing protection, referrer policy and other headers. HSTS and Secure cookies are enabled in production. The app checks Origin, requires a custom header on every mutation, and validates session CSRF tokens for authenticated writes. API/private responses are not cached. Only explicit HTML page routes and public asset directories are served. `.env`, backend source and database files cannot be retrieved.

Authentication/reset routes allow 30 requests per 15 minutes per IP; APIs allow 300 per minute per IP. Limits are in process memory, suitable for the supplied single-instance Docker deployment. Before horizontally scaling, use a shared limiter store; PostgreSQL sessions and booking locking already support shared application instances. Set TRUST_PROXY=1 only behind the supplied single trusted reverse proxy.

Queries use parameters. The few SQL identifier lists are fixed application constants or validated test-schema names. Strict Zod schemas constrain lengths, types and enumerations. All displayed record text is HTML-escaped or assigned via textContent. Published resource URLs allow HTTPS or controlled upload paths only; scripts/SVG/HTML uploads are rejected.

Uploads require a content role, allowlisted MIME/extension, matching magic bytes, randomized storage names and a 20 MB cap. Files are never executable; PDFs download as attachments. This is format validation, **not malware scanning**. Add a scanning service and a separate media origin if your production risk model requires them. The supplied deployment uses a persistent upload volume; cloud object storage can be substituted later.

## Booking integrity and operations

PostgreSQL constraints and row locks protect overlapping slots and conflicting reservations. Customer queries filter by the authenticated user ID. Public availability explicitly selects safe fields; private notes and user IDs are never returned. Every booking status change has public history plus an internal audit record. Passwords, tokens and internal notes are not copied into audit records.

Notification jobs are durable and retry up to five attempts. Sent payloads are erased. Failed/pending jobs may contain contact details or reset email links and must be protected like the database. SMTP/WhatsApp are at-least-once delivery; a crash after provider acceptance can cause a duplicate message. Calendar event IDs are deterministic, making creation retries idempotent.

Production requires HTTPS, fresh secrets, least-privilege database roles, protected backups, provider credentials, retention review and operational monitoring. Local synthetic test accounts are not production credentials. No claim of third-party penetration testing or formal compliance certification is made.

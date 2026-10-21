# Database design and maintenance

PostgreSQL is the sole source of truth. The browser never connects to PostgreSQL directly.

## Storage

| Area | Tables |
| --- | --- |
| Identity | `users`, `roles`, `user_roles`, `sessions`, `password_reset_tokens` |
| Booking | `bookings`, `booking_history`, `availability_slots`, `organisations`, `contacts` |
| Editorial | `content_items`, `uploads`, `site_settings` |
| Messaging | `notifications`, `outbox`, `chat_sessions`, `chat_messages` |
| Operations | `audit_logs`, `schema_migrations` |

`programmes`, `speaking_topics`, `journey_items`, `statistics`, `media`, `testimonials`, `trust_initiatives`, `future_vision` and `faqs` are typed PostgreSQL **views** over `content_items`. This keeps draft/publish, ordering, links and timestamps consistent without duplicating editorial code. The initial seed adds the supplied name, positioning and tagline only.

## Integrity

UUID primary keys, foreign keys, checks and lookup indexes protect records. A GiST exclusion constraint rejects *all overlapping slot windows*, including adjacent records with different statuses; back-to-back slots are allowed. Times are interpreted in Asia/Kolkata. A unique partial index permits one held, confirmed or completed booking per slot. Another prevents duplicate active enquiries from one user for one slot. Several users may enquire before the team reserves the slot.

Booking references use a PostgreSQL sequence through `next_booking_reference()`. References include the creation year and a minimum five-digit sequence. The sequence does not reset annually and can contain gaps after rollback; it never truncates after 99,999.

Slot creation/changes, enquiry creation and status changes use transactions. Confirmation locks the slot before the booking, validates ownership/status, updates both records, appends history/audit records and enqueues notifications in the same commit. Deleting a slot with historical bookings is rejected. Moving an enquired-about slot is rejected until active enquiries are cancelled.

## Migrations

Create an empty database and set `DATABASE_URL`. Use `npm run migrate`, then `npm run seed`. The runner serializes migrations with a PostgreSQL advisory lock and records versions. `database/schema.sql` is the initial schema; `database/migrations/` contains subsequent changes. Use the runner rather than loading only the initial schema, which would omit later migrations.

Docker uses `mvr_owner` only for initialization/migrations and `mvr_app` for the running application. The runtime role cannot change the schema or modify/delete audit records. A managed PostgreSQL deployment should use equivalent separate migration/runtime roles and verified TLS.

## Backup and restore

For Docker, make the dump inside the database container, then copy it out. This avoids binary redirection issues in older PowerShell versions:

```sh
docker compose exec database pg_dump -U mvr_owner -d mvr -Fc -f /tmp/mvr.dump
docker compose cp database:/tmp/mvr.dump ./mvr.dump
```

Back up the `uploads` volume separately. Encrypt backups, restrict access, keep off-host copies, and run scheduled restore exercises. For restoration, create a **new empty database**, copy the dump into the container and run `pg_restore -U mvr_owner -d NEW_EMPTY_DATABASE /tmp/mvr.dump`. Verify data and permissions before switching the application. Never restore over a live database without a separate rollback plan.

Session/reset expiry is enforced in every query. The server periodically removes expired sessions/tokens, chat sessions older than 30 days and sent queue entries older than 30 days. Booking and audit history are retained. Pending/failed messages remain for investigation and can contain contact information; apply the organisation's retention policy before launch.

## Migration 005

Adds first_name, last_name, alternate_phone and alternate_is_whatsapp to users, and alternate contact snapshots plus second_slot_id to bookings. Existing names split on the first space; existing single-name accounts must complete their last name on their next profile edit or enquiry.

Every active published date has two slots, validated by a deferred database trigger and a unique date/half index. Internally First Half is midnight to noon and Second Half is noon to midnight in Asia/Kolkata; a half stops accepting enquiries at its end. Clock times are not displayed or accepted by the new API. Google Calendar events use date-only entries with the half/Full Day in the title, avoiding invented event start times.

Original hourly rows remain with legacy=true and are excluded from active availability. Bookings retain legacy_schedule JSON with the original slot ID and boundaries. Existing intervals crossing noon map to Full Day. Previously unpublished halves become Blocked rather than silently opening new availability. Reservations colliding within one new half, or with a manual block/hold, abort the migration transaction. Resolve the original schedules and retry.

booking_slot_claims has slot_id as its primary key. A bookings trigger maintains one claim per selected half for DATE_HOLD, CONFIRMED and COMPLETED, preventing overlap even for direct SQL status changes. Application transactions also update availability status, owner and hold flags. Retained legacy rows are audit records, not future availability.

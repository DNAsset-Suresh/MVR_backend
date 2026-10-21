CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), full_name text NOT NULL, organisation text NOT NULL DEFAULT '',
 organisation_type text NOT NULL DEFAULT '', email text NOT NULL UNIQUE CHECK(email=lower(email)),
 phone text NOT NULL DEFAULT '', whatsapp text NOT NULL DEFAULT '', city text NOT NULL DEFAULT '',
 password_hash text NOT NULL, active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE roles (name text PRIMARY KEY);
INSERT INTO roles VALUES ('USER'),('SUPER_ADMIN'),('BOOKING_MANAGER'),('CONTENT_MANAGER'),('TRUST_MANAGER'),('VIEWER');
CREATE TABLE user_roles (user_id uuid REFERENCES users ON DELETE CASCADE, role text REFERENCES roles, PRIMARY KEY(user_id,role));
CREATE TABLE sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('user','admin')), csrf_token text NOT NULL,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE password_reset_tokens (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE organisations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users, name text NOT NULL, type text NOT NULL, city text NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid REFERENCES organisations, full_name text NOT NULL, email text NOT NULL, phone text NOT NULL, whatsapp text NOT NULL DEFAULT '', created_at timestamptz DEFAULT now());
CREATE SEQUENCE booking_reference_seq;
CREATE TABLE availability_slots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), date date NOT NULL, start_time time NOT NULL, end_time time NOT NULL,
 duration integer GENERATED ALWAYS AS ((extract(epoch FROM (end_time-start_time))/60)::integer) STORED,
 status text NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE','TENTATIVE','BOOKED','BLOCKED')),
 booking_id uuid, held boolean NOT NULL DEFAULT false, internal_notes text NOT NULL DEFAULT '',
 created_by uuid NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(end_time>start_time), CHECK(NOT held OR status='TENTATIVE'),
 EXCLUDE USING gist (tsrange(date + start_time, date + end_time, '[)') WITH &&)
);
CREATE INDEX availability_date_idx ON availability_slots(date,status);
CREATE TABLE bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reference text NOT NULL UNIQUE DEFAULT ('MVR-' || extract(year from now() AT TIME ZONE 'Asia/Kolkata')::text || '-' || lpad(nextval('booking_reference_seq')::text,5,'0')),
 user_id uuid NOT NULL REFERENCES users, slot_id uuid NOT NULL REFERENCES availability_slots,
 alternative_slot_id uuid REFERENCES availability_slots, organisation_id uuid REFERENCES organisations, contact_id uuid REFERENCES contacts,
 event_type text NOT NULL, custom_event_type text NOT NULL DEFAULT '', organisation text NOT NULL, organisation_type text NOT NULL, full_name text NOT NULL,
 email text NOT NULL, phone text NOT NULL, whatsapp text NOT NULL DEFAULT '', city text NOT NULL, venue text NOT NULL,
 participants integer NOT NULL CHECK(participants BETWEEN 1 AND 1000000), audience_type text NOT NULL,
 language text NOT NULL CHECK(language IN ('Tamil','English','Tamil and English','Other')),
 mode text NOT NULL CHECK(mode IN ('Online','Offline','Hybrid')),
 topics jsonb NOT NULL DEFAULT '[]'::jsonb, custom_topic text NOT NULL DEFAULT '',
 expected_audience jsonb NOT NULL DEFAULT '[]'::jsonb, custom_audience text NOT NULL DEFAULT '',
 participant_range text NOT NULL DEFAULT '', event_format text NOT NULL DEFAULT '',
 preferred_language text NOT NULL DEFAULT '', custom_language text NOT NULL DEFAULT '',
 session_duration text NOT NULL DEFAULT '',
 description text NOT NULL DEFAULT '',
 special_requirements text NOT NULL DEFAULT '', additional_information text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','UNDER_REVIEW','MORE_INFORMATION_REQUIRED','DATE_HOLD','CONFIRMED','COMPLETED','CANCELLED')),
 internal_notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE availability_slots ADD CONSTRAINT slot_booking_fk FOREIGN KEY(booking_id) REFERENCES bookings;
CREATE UNIQUE INDEX one_reservation_per_slot ON bookings(slot_id) WHERE status IN ('DATE_HOLD','CONFIRMED','COMPLETED');
CREATE UNIQUE INDEX no_duplicate_active_enquiry ON bookings(user_id,slot_id) WHERE status <> 'CANCELLED';
CREATE INDEX bookings_user_idx ON bookings(user_id,created_at DESC);
CREATE INDEX bookings_status_idx ON bookings(status,created_at DESC);
CREATE TABLE booking_history (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, booking_id uuid NOT NULL REFERENCES bookings, status text NOT NULL, message text NOT NULL DEFAULT '', actor_id uuid REFERENCES users, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users, booking_id uuid REFERENCES bookings, title text NOT NULL, body text NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX notifications_user_idx ON notifications(user_id,created_at DESC);
CREATE TABLE outbox (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), channel text NOT NULL CHECK(channel IN ('email','whatsapp','calendar')), payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed')), attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX outbox_pending_idx ON outbox(status,available_at);
CREATE TABLE site_settings (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE audit_logs (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid REFERENCES users, action text NOT NULL, entity text NOT NULL, entity_id text, previous_value jsonb, new_value jsonb, ip text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX audit_created_idx ON audit_logs(created_at DESC);
CREATE TABLE content_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL, title text NOT NULL, body text NOT NULL DEFAULT '', url text NOT NULL DEFAULT '', image_url text NOT NULL DEFAULT '', published boolean NOT NULL DEFAULT false, sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX content_kind_idx ON content_items(kind,published,sort_order);
-- Typed content views share one consistent editorial/publication model.
CREATE VIEW programmes AS SELECT * FROM content_items WHERE kind='programmes';
CREATE VIEW speaking_topics AS SELECT * FROM content_items WHERE kind='speaking-topics';
CREATE VIEW journey_items AS SELECT * FROM content_items WHERE kind='journey';
CREATE VIEW statistics AS SELECT * FROM content_items WHERE kind='statistics';
CREATE VIEW media AS SELECT * FROM content_items WHERE kind='media';
CREATE VIEW testimonials AS SELECT * FROM content_items WHERE kind='testimonials';
CREATE VIEW trust_initiatives AS SELECT * FROM content_items WHERE kind='trust';
CREATE VIEW future_vision AS SELECT * FROM content_items WHERE kind='future-vision';
CREATE VIEW faqs AS SELECT * FROM content_items WHERE kind='faqs';
CREATE TABLE uploads (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), filename text NOT NULL, mime text NOT NULL, bytes integer NOT NULL CHECK(bytes>0), created_by uuid NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE chat_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_hash text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE chat_messages (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, session_id uuid NOT NULL REFERENCES chat_sessions ON DELETE CASCADE, role text NOT NULL CHECK(role IN ('user','assistant')), body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

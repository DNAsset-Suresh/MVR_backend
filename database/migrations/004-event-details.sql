ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS custom_event_type text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS custom_topic text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS expected_audience jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS custom_audience text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS participant_range text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS event_format text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS custom_language text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS session_duration text NOT NULL DEFAULT '';

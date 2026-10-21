CREATE OR REPLACE FUNCTION next_booking_reference() RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
 n := nextval('booking_reference_seq');
 RETURN 'MVR-' || extract(year from now() AT TIME ZONE 'Asia/Kolkata')::text || '-' || lpad(n::text,greatest(5,length(n::text)),'0');
END;
$$;
ALTER TABLE bookings ALTER COLUMN reference SET DEFAULT next_booking_reference();

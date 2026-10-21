-- Keep original hourly records for audit; expose only the new fixed halves.
ALTER TABLE users ADD COLUMN first_name text NOT NULL DEFAULT '', ADD COLUMN last_name text NOT NULL DEFAULT '',
 ADD COLUMN alternate_phone text NOT NULL DEFAULT '', ADD COLUMN alternate_is_whatsapp boolean NOT NULL DEFAULT false;
UPDATE users SET first_name=split_part(trim(full_name),' ',1), last_name=trim(substr(trim(full_name),length(split_part(trim(full_name),' ',1))+1));
ALTER TABLE users ADD CONSTRAINT alternate_whatsapp_requires_number CHECK(NOT alternate_is_whatsapp OR length(trim(alternate_phone))>0);
ALTER TABLE bookings ADD COLUMN alternate_phone text NOT NULL DEFAULT '', ADD COLUMN alternate_is_whatsapp boolean NOT NULL DEFAULT false,
 ADD COLUMN second_slot_id uuid REFERENCES availability_slots, ADD COLUMN legacy_schedule jsonb;
ALTER TABLE availability_slots ADD COLUMN half text, ADD COLUMN legacy boolean NOT NULL DEFAULT false;
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='availability_slots'::regclass AND contype='x' LOOP
  EXECUTE format('ALTER TABLE availability_slots DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
UPDATE availability_slots SET legacy=true;
CREATE UNIQUE INDEX fixed_half_per_day ON availability_slots(date,half) WHERE NOT legacy;
ALTER TABLE availability_slots ADD CONSTRAINT fixed_half_times CHECK(legacy OR
 (half='FIRST_HALF' AND start_time='00:00' AND end_time='12:00') OR
 (half='SECOND_HALF' AND start_time='12:00' AND end_time='24:00'));
ALTER TABLE availability_slots ADD CONSTRAINT half_required CHECK(legacy OR half IS NOT NULL);
INSERT INTO availability_slots(date,half,start_time,end_time,status,created_by,internal_notes)
 SELECT d.date,h.half,h.start_time,h.end_time,
 CASE WHEN EXISTS(SELECT 1 FROM availability_slots old WHERE old.legacy AND old.date=d.date AND old.start_time<h.end_time AND old.end_time>h.start_time AND old.status IN ('BLOCKED','BOOKED') AND old.booking_id IS NULL) THEN 'BLOCKED'
 WHEN EXISTS(SELECT 1 FROM availability_slots old WHERE old.legacy AND old.date=d.date AND old.start_time<h.end_time AND old.end_time>h.start_time AND old.status='TENTATIVE' AND old.booking_id IS NULL) THEN 'TENTATIVE'
 WHEN EXISTS(SELECT 1 FROM availability_slots old WHERE old.legacy AND old.date=d.date AND old.start_time<h.end_time AND old.end_time>h.start_time) THEN 'AVAILABLE' ELSE 'BLOCKED' END,
 d.created_by,'Converted to standard halves; original schedule retained in legacy records.'
 FROM (SELECT DISTINCT ON(date) date,created_by FROM availability_slots ORDER BY date,created_at) d
 CROSS JOIN (VALUES('FIRST_HALF','00:00'::time,'12:00'::time),('SECOND_HALF','12:00'::time,'24:00'::time)) h(half,start_time,end_time);
DROP INDEX no_duplicate_active_enquiry;
UPDATE bookings b SET legacy_schedule=jsonb_build_object('slot_id',s.id,'date',s.date,'start_time',s.start_time,'end_time',s.end_time,'alternative_slot_id',b.alternative_slot_id),
 slot_id=n.id,second_slot_id=CASE WHEN s.start_time<'12:00' AND s.end_time>'12:00' THEN (SELECT id FROM availability_slots WHERE NOT legacy AND date=s.date AND half='SECOND_HALF') END
 FROM availability_slots s,availability_slots n WHERE b.slot_id=s.id AND s.legacy AND NOT n.legacy AND n.date=s.date AND n.half=CASE WHEN s.start_time<'12:00' THEN 'FIRST_HALF' ELSE 'SECOND_HALF' END;
UPDATE bookings b SET alternative_slot_id=n.id FROM availability_slots s,availability_slots n
 WHERE b.alternative_slot_id=s.id AND s.legacy AND NOT n.legacy AND n.date=s.date AND n.half=CASE WHEN s.start_time<'12:00' THEN 'FIRST_HALF' ELSE 'SECOND_HALF' END;
-- A primary key across both halves is the database backstop for concurrent confirmations.
CREATE TABLE booking_slot_claims(slot_id uuid PRIMARY KEY REFERENCES availability_slots,booking_id uuid NOT NULL REFERENCES bookings ON DELETE CASCADE);
CREATE INDEX booking_slot_claims_booking ON booking_slot_claims(booking_id);
INSERT INTO booking_slot_claims SELECT slot_id,id FROM bookings WHERE status IN ('DATE_HOLD','CONFIRMED','COMPLETED');
INSERT INTO booking_slot_claims SELECT second_slot_id,id FROM bookings WHERE second_slot_id IS NOT NULL AND status IN ('DATE_HOLD','CONFIRMED','COMPLETED');
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM booking_slot_claims c JOIN availability_slots s ON s.id=c.slot_id WHERE s.status<>'AVAILABLE') THEN
  RAISE EXCEPTION 'Legacy reservations overlap a manual block or hold after conversion. Resolve the source schedules before migrating.' USING ERRCODE='23514';
 END IF;
END $$;
UPDATE availability_slots s SET booking_id=b.id,status=CASE WHEN b.status='DATE_HOLD' THEN 'TENTATIVE' ELSE 'BOOKED' END,held=b.status='DATE_HOLD'
 FROM booking_slot_claims c JOIN bookings b ON b.id=c.booking_id WHERE s.id=c.slot_id;
UPDATE availability_slots SET held=true WHERE NOT legacy AND status='TENTATIVE';
CREATE FUNCTION sync_booking_claims() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE first_slot availability_slots; second_slot availability_slots;
BEGIN
 SELECT * INTO first_slot FROM availability_slots WHERE id=NEW.slot_id;
 IF first_slot.legacy THEN RAISE EXCEPTION 'Choose a standard half' USING ERRCODE='23514'; END IF;
 IF NEW.second_slot_id IS NOT NULL THEN
  SELECT * INTO second_slot FROM availability_slots WHERE id=NEW.second_slot_id;
  IF second_slot.legacy OR first_slot.date<>second_slot.date OR first_slot.half<>'FIRST_HALF' OR second_slot.half<>'SECOND_HALF' THEN
   RAISE EXCEPTION 'Full Day requires both halves on the same date' USING ERRCODE='23514';
  END IF;
 END IF;
 DELETE FROM booking_slot_claims WHERE booking_id=NEW.id;
 IF NEW.status IN ('DATE_HOLD','CONFIRMED','COMPLETED') THEN
  INSERT INTO booking_slot_claims VALUES(NEW.slot_id,NEW.id);
  IF NEW.second_slot_id IS NOT NULL THEN INSERT INTO booking_slot_claims VALUES(NEW.second_slot_id,NEW.id); END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER booking_claims AFTER INSERT OR UPDATE OF status,slot_id,second_slot_id ON bookings FOR EACH ROW EXECUTE FUNCTION sync_booking_claims();
-- A published date is always a pair, checked after the entire transaction.
CREATE FUNCTION check_daily_pair() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d date; n integer;
BEGIN
 FOR d IN SELECT DISTINCT x FROM unnest(ARRAY[CASE WHEN TG_OP<>'INSERT' THEN OLD.date END,CASE WHEN TG_OP<>'DELETE' THEN NEW.date END]) x WHERE x IS NOT NULL LOOP
  SELECT count(*) INTO n FROM availability_slots WHERE date=d AND NOT legacy;
  IF n NOT IN (0,2) THEN RAISE EXCEPTION 'Publish or remove both daily halves together' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER daily_pair AFTER INSERT OR UPDATE OR DELETE ON availability_slots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_daily_pair();

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import pg from 'pg';

test('legacy schedules migrate without losing enquiries and conflicting reservations roll back',async()=>{
 if(!process.env.TEST_DATABASE_URL||process.env.TEST_DATABASE_URL===process.env.DATABASE_URL)throw new Error('A separate test database is required.');
 const db=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
 const schema='mvr_test_'+randomBytes(8).toString('hex');
 try{
  await db.query(`CREATE SCHEMA ${schema}`);await db.query(`SET search_path TO ${schema},public`);
  await db.query(await readFile('database/schema.sql','utf8'));
  const u=(await db.query("INSERT INTO users(full_name,email,password_hash) VALUES('Legacy Person','migration@example.test','unused') RETURNING id")).rows[0].id;
  const a=(await db.query("INSERT INTO availability_slots(date,start_time,end_time,created_by) VALUES('2030-02-01','09:00','10:00',$1) RETURNING id",[u])).rows[0].id;
  const b=(await db.query("INSERT INTO availability_slots(date,start_time,end_time,created_by) VALUES('2030-02-01','10:00','11:00',$1) RETURNING id",[u])).rows[0].id;
  const insert=async slot=>(await db.query("INSERT INTO bookings(user_id,slot_id,event_type,organisation,organisation_type,full_name,email,phone,city,venue,participants,audience_type,language,mode,status) VALUES($1,$2,'Workshop','QA','College','Legacy Person','migration@example.test','9000000001','Madurai','Hall',100,'Students','Tamil','Offline','CONFIRMED') RETURNING id",[u,slot])).rows[0].id;
  const first=await insert(a),second=await insert(b);
  await db.query("UPDATE availability_slots SET status='BOOKED',booking_id=$1 WHERE id=$2",[first,a]);
  await db.query("UPDATE availability_slots SET status='BOOKED',booking_id=$1 WHERE id=$2",[second,b]);
  const sql=await readFile('database/migrations/005-accounts-and-halves.sql','utf8');
  await db.query('BEGIN');await assert.rejects(db.query(sql),e=>e.code==='23505');await db.query('ROLLBACK');
  assert.equal((await db.query('SELECT count(*)::int n FROM bookings')).rows[0].n,2);
  assert.equal((await db.query('SELECT slot_id FROM bookings WHERE id=$1',[first])).rows[0].slot_id,a);
  await db.query("UPDATE bookings SET status='CANCELLED' WHERE id=$1",[second]);
  await db.query("UPDATE availability_slots SET status='AVAILABLE',booking_id=NULL WHERE id=$1",[b]);
  await db.query('BEGIN');await db.query(sql);await db.query('COMMIT');
  const slots=(await db.query('SELECT * FROM availability_slots WHERE NOT legacy ORDER BY half')).rows;
  assert.equal(slots.length,2);assert.equal(slots[0].status,'BOOKED');assert.equal(slots[1].status,'BLOCKED');
  const converted=(await db.query('SELECT * FROM bookings WHERE id=$1',[first])).rows[0];
  assert.equal(converted.slot_id,slots[0].id);assert.equal(converted.legacy_schedule.slot_id,a);
  assert.equal((await db.query('SELECT count(*)::int n FROM availability_slots WHERE legacy')).rows[0].n,2);
  assert.equal((await db.query('SELECT last_name FROM users WHERE id=$1',[u])).rows[0].last_name,'Person');
  await assert.rejects(db.query('DELETE FROM availability_slots WHERE id=$1',[slots[1].id]),e=>e.code==='23514');
 }finally{await db.query('ROLLBACK');await db.query(`DROP SCHEMA ${schema} CASCADE`);await db.end();}
});

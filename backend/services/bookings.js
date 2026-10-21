import {transaction} from '../database/connection.js';
import {fail,audit} from '../utils/security.js';
import {bookingEmail} from './email-templates.js';
export const publicBookingColumns='b.id,b.reference,b.event_type,b.custom_event_type,b.topics,b.custom_topic,b.organisation,b.organisation_type,b.full_name,b.email,b.phone,b.whatsapp,b.city,b.venue,b.participants,b.audience_type,b.language,b.mode,b.expected_audience,b.custom_audience,b.participant_range,b.event_format,b.preferred_language,b.custom_language,b.session_duration,b.description,b.special_requirements,b.additional_information,b.status,b.created_at,b.updated_at,b.slot_id,b.second_slot_id,b.alternative_slot_id,b.alternate_phone,b.alternate_is_whatsapp,s.date,s.half';
export async function notifyBooking(db,booking,message) {
 const title=`${booking.reference}: ${booking.status.replaceAll('_',' ')}`;
 await db.query('INSERT INTO notifications(user_id,booking_id,title,body) VALUES($1,$2,$3,$4)',[booking.user_id,booking.id,title,message]);
 await db.query('INSERT INTO notifications(booking_id,title,body) VALUES($1,$2,$3)',[booking.id,title,booking.status==='NEW'?'A new enquiry is ready for review.':message]);
 await db.query("INSERT INTO outbox(channel,payload) VALUES('email',$1)",[bookingEmail(booking,message,process.env.APP_ORIGIN)]);
 if(process.env.ADMIN_NOTIFICATION_EMAIL) await db.query("INSERT INTO outbox(channel,payload) VALUES('email',$1)",[{to:process.env.ADMIN_NOTIFICATION_EMAIL,subject:title,text:message}]);
 if(process.env.WHATSAPP_ENABLED==='true'&&booking.whatsapp) await db.query("INSERT INTO outbox(channel,payload) VALUES('whatsapp',$1)",[{to:booking.whatsapp.replace(/\D/g,''),reference:booking.reference,status:booking.status}]);
 if(['CONFIRMED','CANCELLED'].includes(booking.status)) await db.query("INSERT INTO outbox(channel,payload) VALUES('calendar',$1)",[{booking_id:booking.id}]);
}
export async function createBooking(req,input) {
 return transaction(async db=>{
  // Stable lock order for primary/alternative slots and all administrative changes.
  input.full_name=`${input.first_name} ${input.last_name}`;
  if(input.alternate_is_whatsapp)input.whatsapp=input.alternate_phone;
  const ids=[input.slot_id,input.second_slot_id,input.alternative_slot_id].filter(Boolean).sort();
  const slots=(await db.query('SELECT * FROM availability_slots WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[ids])).rows;
  const slot=slots.find(s=>s.id===input.slot_id);
  if(!slot||slot.legacy||slot.status!=='AVAILABLE'||slot.held||slot.booking_id) fail(409,'The selected time slot is no longer available.');
  if(!(await db.query("SELECT 1 FROM availability_slots WHERE id=$1 AND (date+end_time) AT TIME ZONE 'Asia/Kolkata'>now()",[slot.id])).rowCount) fail(409,'This time slot has already passed.');
  if(input.second_slot_id){
   const second=slots.find(s=>s.id===input.second_slot_id);
   if(!second||second.legacy||slot.half!=='FIRST_HALF'||second.half!=='SECOND_HALF'||second.date!==slot.date)fail(400,'Full Day requires both halves on the same date.');
   if(second.status!=='AVAILABLE'||second.held||second.booking_id)fail(409,'Both halves must be available for Full Day.');
  }
  const requested=[slot.id,input.second_slot_id].filter(Boolean);
  if((await db.query("SELECT 1 FROM bookings WHERE user_id=$1 AND status<>'CANCELLED' AND (slot_id=ANY($2::uuid[]) OR second_slot_id=ANY($2::uuid[]))",[req.auth.id,requested])).rowCount)fail(409,'You already have an active enquiry for this half.');
  if(input.alternative_slot_id&&(!slots.some(s=>s.id===input.alternative_slot_id&&!s.legacy&&s.status==='AVAILABLE'&&!s.held&&!s.booking_id)||requested.includes(input.alternative_slot_id))) fail(400,'Choose a different alternative slot.');
  const org=(await db.query('INSERT INTO organisations(user_id,name,type,city) VALUES($1,$2,$3,$4) RETURNING id',[req.auth.id,input.organisation,input.organisation_type,input.city])).rows[0];
  const contact=(await db.query('INSERT INTO contacts(organisation_id,full_name,email,phone,whatsapp) VALUES($1,$2,$3,$4,$5) RETURNING id',[org.id,input.full_name,input.email,input.phone,input.whatsapp])).rows[0];
  const fields=['second_slot_id','alternate_phone','alternate_is_whatsapp','slot_id','alternative_slot_id','event_type','custom_event_type','topics','custom_topic','organisation','organisation_type','full_name','email','phone','whatsapp','city','venue','participants','audience_type','language','mode','expected_audience','custom_audience','participant_range','event_format','preferred_language','custom_language','session_duration','description','special_requirements','additional_information'];
  const values=fields.map(f=>{
   if(f==='topics'||f==='expected_audience'){
    const v=input[f];
    return JSON.stringify(Array.isArray(v)?v:(typeof v==='string'&&v.startsWith('[')?JSON.parse(v):v?[v]:[]));
   }
   return input[f]??null;
  });
  const booking=(await db.query(`INSERT INTO bookings(user_id,organisation_id,contact_id,${fields.join(',')}) VALUES($1,$2,$3,${fields.map((_,i)=>'$'+(i+4)).join(',')}) RETURNING *`,[req.auth.id,org.id,contact.id,...values])).rows[0];
  await db.query("INSERT INTO booking_history(booking_id,status,actor_id,message) VALUES($1,'NEW',$2,'Enquiry submitted. Confirmation is subject to review.')",[booking.id,req.auth.id]);
  await notifyBooking(db,booking,'Your enquiry has been received. The MVR team will review your request.');
  await audit(db,req,'CREATE','booking',booking.id,null,{reference:booking.reference,status:'NEW'});
  return {reference:booking.reference,id:booking.id,status:booking.status};
 });
}
const transitions={NEW:['UNDER_REVIEW','MORE_INFORMATION_REQUIRED','DATE_HOLD','CONFIRMED','CANCELLED'],UNDER_REVIEW:['MORE_INFORMATION_REQUIRED','DATE_HOLD','CONFIRMED','CANCELLED'],MORE_INFORMATION_REQUIRED:['UNDER_REVIEW','DATE_HOLD','CONFIRMED','CANCELLED'],DATE_HOLD:['UNDER_REVIEW','MORE_INFORMATION_REQUIRED','CONFIRMED','CANCELLED'],CONFIRMED:['COMPLETED','CANCELLED'],COMPLETED:[],CANCELLED:[]};
export async function changeBooking(db,req,id,input,review=null) {
 const initial=(await db.query('SELECT slot_id,second_slot_id FROM bookings WHERE id=$1',[id])).rows[0]; if(!initial) fail(404,'Booking not found.');
 const slots=(await db.query('SELECT * FROM availability_slots WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[[initial.slot_id,initial.second_slot_id].filter(Boolean)])).rows;
 const old=(await db.query('SELECT *,updated_at::text revision FROM bookings WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(review&&(old.revision!==review.version||!['NEW','UNDER_REVIEW','MORE_INFORMATION_REQUIRED','DATE_HOLD'].includes(old.status)))fail(409,'This enquiry has changed. Review it again before deciding.');
 if(input.status!==old.status&&!transitions[old.status].includes(input.status)) fail(409,`Cannot change ${old.status} to ${input.status}.`);
 if(['DATE_HOLD','CONFIRMED'].includes(input.status)) {
  if(slots.some(slot=>(slot.booking_id&&slot.booking_id!==id)||(!slot.booking_id&&(slot.status!=='AVAILABLE'||slot.held)))) fail(409,'The selected time slot is no longer available.');
  await db.query('UPDATE availability_slots SET status=$1,booking_id=$2,held=$3,updated_at=now() WHERE id=ANY($4::uuid[])',[input.status==='CONFIRMED'?'BOOKED':'TENTATIVE',id,input.status==='DATE_HOLD',slots.map(s=>s.id)]);
 } else if(input.status!=='COMPLETED') {
  await db.query("UPDATE availability_slots SET status='AVAILABLE',booking_id=NULL,held=false,updated_at=now() WHERE booking_id=$1 AND NOT legacy",[id]);
 }
 const booking=(await db.query('UPDATE bookings SET status=$1,internal_notes=$2,updated_at=now() WHERE id=$3 RETURNING *',[input.status,input.internal_notes??old.internal_notes,id])).rows[0];
 if(input.status!==old.status) {
  const message=input.message||`Your enquiry status is now ${input.status.replaceAll('_',' ').toLowerCase()}.`;
  await db.query('INSERT INTO booking_history(booking_id,status,message,actor_id) VALUES($1,$2,$3,$4)',[id,input.status,message,req.auth.id]);
  await notifyBooking(db,booking,message);
 }
 await audit(db,req,'UPDATE_STATUS','booking',id,{status:old.status},{status:booking.status});
 return booking;
}

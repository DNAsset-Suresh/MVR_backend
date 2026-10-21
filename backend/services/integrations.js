import nodemailer from 'nodemailer';
import {pool,transaction} from '../database/connection.js';
const configured=channel=>channel==='email'?!!process.env.SMTP_HOST:channel==='whatsapp'?process.env.WHATSAPP_ENABLED==='true'&&!!process.env.WHATSAPP_API_TOKEN:!!process.env.GOOGLE_REFRESH_TOKEN;
async function responseJSON(response) {if(!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);return response.status===204?{}:response.json();}
export async function deliver(channel,payload,jobId) {
 if(channel==='email') {
  const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_PORT==='465',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}:undefined,connectionTimeout:10000,socketTimeout:15000});
  await transport.sendMail({from:process.env.MAIL_FROM,to:payload.to,subject:payload.subject,text:payload.text,messageId:`<${jobId}@mvr.local>`});
 } else if(channel==='whatsapp') {
  await responseJSON(await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION||'v23.0'}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,{method:'POST',headers:{Authorization:`Bearer ${process.env.WHATSAPP_API_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:payload.to,type:'template',template:{name:process.env.WHATSAPP_TEMPLATE_NAME,language:{code:process.env.WHATSAPP_TEMPLATE_LANGUAGE||'en'},components:[{type:'body',parameters:[{type:'text',text:payload.reference},{type:'text',text:payload.status}]}]}}),signal:AbortSignal.timeout(15000)}));
 } else {
  const booking=(await pool.query('SELECT b.*,s.date,s.half FROM bookings b JOIN availability_slots s ON s.id=b.slot_id WHERE b.id=$1',[payload.booking_id])).rows[0];
  if(!booking||!['CONFIRMED','CANCELLED'].includes(booking.status)) return;
  const auth=await responseJSON(await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,refresh_token:process.env.GOOGLE_REFRESH_TOKEN,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)}));
  const eventId='mvr'+booking.id.replaceAll('-','');
  const base=`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(process.env.GOOGLE_CALENDAR_ID)}/events`;
  const headers={Authorization:`Bearer ${auth.access_token}`,'Content-Type':'application/json'};
  if(booking.status==='CANCELLED') {const result=await fetch(`${base}/${eventId}`,{method:'DELETE',headers,signal:AbortSignal.timeout(15000)});if(![204,404,410].includes(result.status)) throw new Error(`Calendar returned HTTP ${result.status}`);return;}
  const body=JSON.stringify({id:eventId,summary:`${booking.reference} · ${booking.event_type} · ${booking.second_slot_id?'Full Day':booking.half==='FIRST_HALF'?'First Half':'Second Half'}`,location:booking.venue,description:`Organisation: ${booking.organisation}`,start:{date:booking.date},end:{date:new Date(Date.parse(booking.date+'T00:00:00Z')+86400000).toISOString().slice(0,10)}});
  const result=await fetch(base,{method:'POST',headers,body,signal:AbortSignal.timeout(15000)});
  if(result.status===409) return; // Deterministic ID makes retries idempotent.
  await responseJSON(result);
 }
}
export async function processOutbox(send=deliver) {
 const channels=['email','whatsapp','calendar'].filter(configured);if(!channels.length) return;
 for(let i=0;i<10;i++) {
  const job=await transaction(async db=>{
   const row=(await db.query("SELECT * FROM outbox WHERE channel=ANY($1::text[]) AND ((status='pending' AND available_at<=now()) OR (status='sending' AND locked_at<now()-interval '5 minutes')) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",[channels])).rows[0];
   if(row) await db.query("UPDATE outbox SET status='sending',locked_at=now(),attempts=attempts+1 WHERE id=$1",[row.id]);return row;
  });if(!job) break;
  try {await send(job.channel,job.payload,job.id);await pool.query("UPDATE outbox SET status='sent',payload='{}',last_error=NULL WHERE id=$1",[job.id]);}
  catch(error){await pool.query("UPDATE outbox SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,last_error=$2,available_at=now()+interval '5 minutes' WHERE id=$1",[job.id,String(error.message).slice(0,200)]);}
 }
}

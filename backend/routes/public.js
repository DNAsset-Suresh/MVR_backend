import {Router} from 'express';
import {z} from 'zod';
import {pool,transaction} from '../database/connection.js';
import {token,digest} from '../utils/security.js';
import {cookieOptions} from '../middleware/auth.js';
import * as v from '../validators/index.js';
export const publicRoutes=Router();
publicRoutes.get('/content/:kind',async(req,res)=>{const kind=z.enum(v.kinds).parse(req.params.kind);res.json({success:true,data:(await pool.query('SELECT id,kind,title,body,url,image_url FROM content_items WHERE kind=$1 AND published ORDER BY sort_order,created_at',[kind])).rows});});
for(const kind of ['programmes','speaking-topics','media']) publicRoutes.get('/'+kind,async(req,res)=>res.json({success:true,data:(await pool.query('SELECT id,title,body,url,image_url FROM content_items WHERE kind=$1 AND published ORDER BY sort_order,created_at',[kind])).rows}));
publicRoutes.get('/settings',async(req,res)=>res.json({success:true,data:Object.fromEntries((await pool.query("SELECT key,value FROM site_settings WHERE key IN ('contact_email','contact_phone','whatsapp_number','address','tagline')")).rows.map(r=>[r.key,r.value]))}));
const choices=[{label:'Book MVR',href:'/booking.html'},{label:'Check Availability',href:'/availability.html'},{label:'Speaking Topics',href:'/speaking.html'},{label:'Programmes',href:'/programmes.html'},{label:'MVR Trust',href:'/trust.html'},{label:'Contact Team',href:'/contact.html'}];
publicRoutes.post('/chat',async(req,res)=>{
 const {message}=z.object({message:z.string().trim().min(1).max(1000)}).strict().parse(req.body);
 const lower=message.toLowerCase(),dateMatch=message.match(/\b\d{4}-\d{2}-\d{2}\b/);
 let answer='',links=choices;
 if(dateMatch&&v.date.safeParse(dateMatch[0]).success) {
  const slots=(await pool.query("SELECT half,status FROM availability_slots WHERE NOT legacy AND date=$1 AND (date+end_time) AT TIME ZONE 'Asia/Kolkata'>now() ORDER BY half",[dateMatch[0]])).rows;
  answer=slots.length?`${dateMatch[0]} (India time): ${slots.map(s=>`${s.half==='FIRST_HALF'?'First Half':'Second Half'} ${['BLOCKED','BOOKED'].includes(s.status)?'Blocked':s.status.toLowerCase()}`).join('; ')}. Only available slots can be requested. An enquiry is not a confirmation.`:'No published availability was found for that date. Please choose a date from the calendar.';
 } else if(/avail|date|time/.test(lower)&&!/programme|program|topic/.test(lower)) answer='Choose a published date in the availability calendar, or ask about a date using YYYY-MM-DD. Choose First Half, Second Half or Full Day. Dates follow India Standard Time.';
 else {
  const kind=/trust/.test(lower)?'trust':/programme|program|college|school/.test(lower)?'programmes':/speak|topic/.test(lower)?'speaking-topics':/about|biograph|who|mvr/.test(lower)?'biography':'faqs';
  const rows=(await pool.query('SELECT title,body FROM content_items WHERE kind=$1 AND published ORDER BY sort_order LIMIT 8',[kind])).rows;
  const matched=kind==='faqs'?rows.filter(r=>r.title.toLowerCase().split(/\W+/).filter(w=>w.length>3).some(w=>lower.includes(w))):rows;
  answer=matched.length?matched.map(r=>`${r.title}\n${r.body}`).join('\n\n'):'I do not have approved information to answer that yet. Please contact the MVR team or choose one of the options below.';
 }
 await transaction(async db=>{
  let raw=req.cookies.mvr_chat,record=raw?(await db.query("SELECT id FROM chat_sessions WHERE token_hash=$1 AND created_at>now()-interval '1 day'",[digest(raw)])).rows[0]:null;
  if(!record){raw=token();record=(await db.query('INSERT INTO chat_sessions(token_hash) VALUES($1) RETURNING id',[digest(raw)])).rows[0];res.cookie('mvr_chat',raw,{...cookieOptions,maxAge:86400000});}
  await db.query("INSERT INTO chat_messages(session_id,role,body) VALUES($1,'user',$2),($1,'assistant',$3)",[record.id,message,answer]);
 });res.json({success:true,data:{answer,links}});
});
publicRoutes.post('/chat/booking',async(req,res)=>{
 const data=z.object({event_type:z.enum(v.eventTypes),city:z.string().trim().min(1).max(100),participants:z.coerce.number().int().min(1).max(1000000),language:z.enum(['Tamil','English','Tamil and English','Other']),venue:z.string().trim().min(1).max(300),organisation:z.string().trim().min(1).max(200),full_name:z.string().trim().min(1).max(100),phone:v.phone}).strict().parse(req.body);
 res.json({success:true,data:{draft:data,href:'/booking.html',message:'Choose an available date, review your details and submit your enquiry.'}});
});

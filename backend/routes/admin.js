import {Router} from 'express';
import {z} from 'zod';
import {pool,transaction} from '../database/connection.js';
import {permit,publicUser} from '../middleware/auth.js';
import {audit,fail,hashPassword} from '../utils/security.js';
import * as v from '../validators/index.js';
import {changeBooking,publicBookingColumns} from '../services/bookings.js';
import {requestReset} from './auth.js';
import {enquiryDocx,enquiryPrint} from '../services/enquiry-export.js';
export const adminRoutes=Router();
for(const format of ['print','export.docx'])adminRoutes.get('/bookings/:id/'+format,permit('readBookings'),async(req,res)=>{
 const id=v.uuid.parse(req.params.id);
 const b=(await pool.query('SELECT b.*,s.date,s.half,a.date alternative_date,a.half alternative_half FROM bookings b JOIN availability_slots s ON s.id=b.slot_id LEFT JOIN availability_slots a ON a.id=b.alternative_slot_id WHERE b.id=$1',[id])).rows[0];
 if(!b)fail(404,'Booking not found.');
 b.history=(await pool.query('SELECT status,message,created_at FROM booking_history WHERE booking_id=$1 ORDER BY created_at,id',[id])).rows;
 await audit(pool,req,'EXPORT_ENQUIRY','booking',id,null,{format});
 if(format==='print')return res.type('html').send(enquiryPrint(b));
 res.set('Content-Disposition',`attachment; filename="${b.reference}.docx"`).type('application/vnd.openxmlformats-officedocument.wordprocessingml.document').send(await enquiryDocx(b));
});
adminRoutes.put('/users/:id/identity',permit('settings'),async(req,res)=>{
 const id=v.uuid.parse(req.params.id),input=z.object({email:v.email,organisation_type:z.string().trim().min(1).max(80)}).strict().parse(req.body);
 await transaction(async db=>{
  const old=(await db.query('SELECT email,organisation_type FROM users WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!old)fail(404,'User not found.');
  if(!v.organisationTypes.includes(input.organisation_type)&&input.organisation_type!==old.organisation_type)fail(400,'Choose a valid organisation type.');
  await db.query('UPDATE users SET email=$1,organisation_type=$2,updated_at=now() WHERE id=$3',[input.email,input.organisation_type,id]);
  if(input.email!==old.email){await db.query('DELETE FROM sessions WHERE user_id=$1',[id]);await db.query('DELETE FROM password_reset_tokens WHERE user_id=$1',[id]);}
  await audit(db,req,'UPDATE_ACCOUNT_IDENTITY','user',id,old,input);
 });res.json({success:true,data:{}});
});
adminRoutes.get('/dashboard',permit('readBookings'),async(req,res)=>{
 const {rows}=await pool.query(`SELECT count(*)::int total,
 count(*) FILTER(WHERE b.created_at::date=(now() AT TIME ZONE 'Asia/Kolkata')::date)::int today,
 count(*) FILTER(WHERE b.status IN ('NEW','UNDER_REVIEW','MORE_INFORMATION_REQUIRED'))::int pending,
 count(*) FILTER(WHERE b.status='CONFIRMED')::int confirmed,
 count(*) FILTER(WHERE b.status='CONFIRMED' AND s.date>=(now() AT TIME ZONE 'Asia/Kolkata')::date)::int upcoming,
 count(*) FILTER(WHERE b.status='DATE_HOLD')::int holds,
 (SELECT count(*)::int FROM availability_slots WHERE NOT legacy AND status='AVAILABLE' AND (date+end_time) AT TIME ZONE 'Asia/Kolkata'>now()) available
 FROM bookings b JOIN availability_slots s ON s.id=b.slot_id`);
 res.json({success:true,data:rows[0]});
});
adminRoutes.get('/bookings',permit('readBookings'),async(req,res)=>{
 const userId=req.query.user_id?v.uuid.parse(req.query.user_id):null;
 res.json({success:true,data:(await pool.query(`SELECT ${publicBookingColumns},b.user_id FROM bookings b JOIN availability_slots s ON s.id=b.slot_id WHERE ($1::uuid IS NULL OR b.user_id=$1) ORDER BY b.created_at DESC`,[userId])).rows});
});
adminRoutes.get('/bookings/:id',permit('readBookings'),async(req,res)=>{
 const id=v.uuid.parse(req.params.id),row=(await pool.query('SELECT b.*,s.date,s.half FROM bookings b JOIN availability_slots s ON s.id=b.slot_id WHERE b.id=$1',[id])).rows[0];if(!row) fail(404,'Booking not found.');
 row.history=(await pool.query('SELECT status,message,created_at FROM booking_history WHERE booking_id=$1 ORDER BY created_at',[id])).rows;
 res.json({success:true,data:row});
});
adminRoutes.put('/bookings/:id',permit('booking'),async(req,res)=>{const id=v.uuid.parse(req.params.id),data=v.statusChange.parse(req.body);res.json({success:true,data:await transaction(db=>changeBooking(db,req,id,data))});});
adminRoutes.patch('/bookings/:id',permit('booking'),async(req,res)=>{const id=v.uuid.parse(req.params.id),data=v.statusChange.parse(req.body);res.json({success:true,data:await transaction(db=>changeBooking(db,req,id,data))});});
adminRoutes.patch('/bookings/:id/approve',permit('booking'),async(req,res)=>{
 const id=v.uuid.parse(req.params.id);
 const message=req.body?.message||'Your booking request has been approved and confirmed.';
 res.json({success:true,data:await transaction(db=>changeBooking(db,req,id,{status:'CONFIRMED',message}))});
});
adminRoutes.patch('/bookings/:id/reject',permit('booking'),async(req,res)=>{
 const id=v.uuid.parse(req.params.id);
 const reason=req.body?.reason||req.body?.message||'Your booking request could not be accommodated at this time.';
 res.json({success:true,data:await transaction(db=>changeBooking(db,req,id,{status:'CANCELLED',message:reason,internal_notes:reason}))});
});
adminRoutes.patch('/bookings/:id/request-information',permit('booking'),async(req,res)=>{
 const id=v.uuid.parse(req.params.id);
 const message=z.string().min(1).parse(req.body?.message||req.body?.information_requested);
 res.json({success:true,data:await transaction(db=>changeBooking(db,req,id,{status:'MORE_INFORMATION_REQUIRED',message}))});
});
for(const [action,status] of Object.entries({confirm:'CONFIRMED',cancel:'CANCELLED',hold:'DATE_HOLD'})) adminRoutes.post(`/bookings/:id/${action}`,permit('booking'),async(req,res)=>{
 const id=v.uuid.parse(req.params.id);res.json({success:true,data:await transaction(db=>changeBooking(db,req,id,{status}))});
});
adminRoutes.get('/users',permit('users'),async(req,res)=>res.json({success:true,data:(await pool.query('SELECT u.id,u.full_name,u.email,u.organisation,u.organisation_type,u.phone,u.city,u.active,u.created_at,ARRAY(SELECT role FROM user_roles WHERE user_id=u.id) roles,(SELECT count(*)::int FROM bookings WHERE user_id=u.id) enquiry_count FROM users u ORDER BY u.created_at DESC')).rows}));
adminRoutes.post('/users',permit('settings'),async(req,res)=>{
 const data=v.profile.extend({password:v.password,role:z.enum(['USER','SUPER_ADMIN','BOOKING_MANAGER','CONTENT_MANAGER','TRUST_MANAGER','VIEWER'])}).refine(v.contactValid,v.contactMessage).parse(req.body);if(data.alternate_is_whatsapp)data.whatsapp=data.alternate_phone;
 const hash=await hashPassword(data.password);
 const row=await transaction(async db=>{
  const user=(await db.query('INSERT INTO users(full_name,organisation,organisation_type,email,phone,whatsapp,city,password_hash,first_name,last_name,alternate_phone,alternate_is_whatsapp) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',[`${data.first_name} ${data.last_name}`,data.organisation,data.organisation_type,data.email,data.phone,data.whatsapp,data.city,hash,data.first_name,data.last_name,data.alternate_phone,data.alternate_is_whatsapp])).rows[0];
  await db.query('INSERT INTO user_roles VALUES($1,$2)',[user.id,data.role]);await audit(db,req,'CREATE_USER','user',user.id,null,{role:data.role});return publicUser(user);
 });res.status(201).json({success:true,data:row});
});
adminRoutes.put('/users/:id',permit('users'),async(req,res)=>{
 const id=v.uuid.parse(req.params.id),data=z.object({active:z.boolean()}).strict().parse(req.body);
 if(id===req.auth.id) fail(400,'You cannot deactivate your own account.');
 await transaction(async db=>{
  const target=(await db.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!target) fail(404,'User not found.');
  const roles=(await db.query('SELECT role FROM user_roles WHERE user_id=$1',[id])).rows.map(r=>r.role);
  if(roles.some(r=>r!=='USER')&&!req.auth.roles.includes('SUPER_ADMIN')) fail(403,'Only a super administrator may manage staff accounts.');
  if(!data.active&&roles.includes('SUPER_ADMIN')) {
   await db.query('SELECT pg_advisory_xact_lock(781227)');
   if((await db.query("SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE r.role='SUPER_ADMIN' AND u.active AND u.id<>$1",[id])).rowCount===0) fail(409,'Keep at least one active super administrator.');
  }
  await db.query('UPDATE users SET active=$1,updated_at=now() WHERE id=$2',[data.active,id]);
  if(!data.active) await db.query('DELETE FROM sessions WHERE user_id=$1',[id]);
  await audit(db,req,'ACCOUNT_STATUS','user',id,{active:target.active},data);
 });res.json({success:true,data:{}});
});
adminRoutes.post('/users/:id/reset-password',permit('users'),async(req,res)=>{
 const id=v.uuid.parse(req.params.id);await transaction(async db=>{
  const user=(await db.query('SELECT id,email,active FROM users WHERE id=$1',[id])).rows[0];if(!user) fail(404,'User not found.');
  const staff=(await db.query("SELECT 1 FROM user_roles WHERE user_id=$1 AND role<>'USER'",[id])).rowCount;
  if(staff&&!req.auth.roles.includes('SUPER_ADMIN')) fail(403,'Only a super administrator may reset staff passwords.');
  if(!user.active) fail(409,'Activate this account before sending a reset email.');
  await requestReset(db,user,process.env.APP_ORIGIN);await audit(db,req,'REQUEST_PASSWORD_RESET','user',id);
 });res.json({success:true,data:{message:'Password reset email queued.'}});
});
adminRoutes.get('/audit-logs',permit('audit'),async(req,res)=>res.json({success:true,data:(await pool.query('SELECT a.*,u.full_name actor FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 500')).rows}));
adminRoutes.get('/notifications',permit('readBookings'),async(req,res)=>res.json({success:true,data:(await pool.query('SELECT * FROM notifications WHERE user_id IS NULL ORDER BY created_at DESC LIMIT 100')).rows}));
adminRoutes.get('/integrations',permit('settings'),async(req,res)=>res.json({success:true,data:{email:!!process.env.SMTP_HOST,whatsapp:process.env.WHATSAPP_ENABLED==='true'&&!!process.env.WHATSAPP_API_TOKEN,calendar:!!process.env.GOOGLE_REFRESH_TOKEN,queue:(await pool.query('SELECT channel,status,count(*)::int count FROM outbox GROUP BY channel,status')).rows}}));

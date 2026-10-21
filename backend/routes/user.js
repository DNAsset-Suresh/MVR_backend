import {Router} from 'express';
import {pool,transaction} from '../database/connection.js';
import {publicUser} from '../middleware/auth.js';
import {audit,fail} from '../utils/security.js';
import * as v from '../validators/index.js';
import {createBooking,publicBookingColumns} from '../services/bookings.js';
export const userRoutes=Router();
userRoutes.get('/profile',(req,res)=>res.json({success:true,data:publicUser(req.auth)}));
userRoutes.put('/profile',async(req,res)=>{
 const input=v.profile.refine(v.contactValid,v.contactMessage).parse(req.body);
 if(input.email!==req.auth.email||input.organisation_type!==req.auth.organisation_type)fail(403,'Email and organisation type can only be changed by a Super Admin.');
 if(input.alternate_is_whatsapp)input.whatsapp=input.alternate_phone;
 const user=await transaction(async db=>{
  const row=(await db.query('UPDATE users SET full_name=$1,organisation=$2,first_name=$3,last_name=$4,phone=$5,whatsapp=$6,city=$7,alternate_phone=$8,alternate_is_whatsapp=$9,updated_at=now() WHERE id=$10 RETURNING *',[`${input.first_name} ${input.last_name}`,input.organisation,input.first_name,input.last_name,input.phone,input.whatsapp,input.city,input.alternate_phone,input.alternate_is_whatsapp,req.auth.id])).rows[0];
  await audit(db,req,'UPDATE_PROFILE','user',row.id);return row;
 });res.json({success:true,data:publicUser(user)});
});
userRoutes.get('/bookings',async(req,res)=>res.json({success:true,data:(await pool.query(`SELECT ${publicBookingColumns} FROM bookings b JOIN availability_slots s ON s.id=b.slot_id WHERE b.user_id=$1 ORDER BY b.created_at DESC`,[req.auth.id])).rows}));
userRoutes.get('/bookings/my',async(req,res)=>res.json({success:true,data:(await pool.query(`SELECT ${publicBookingColumns} FROM bookings b JOIN availability_slots s ON s.id=b.slot_id WHERE b.user_id=$1 ORDER BY b.created_at DESC`,[req.auth.id])).rows}));
userRoutes.get('/bookings/:reference',async(req,res)=>{
 const booking=(await pool.query(`SELECT ${publicBookingColumns} FROM bookings b JOIN availability_slots s ON s.id=b.slot_id WHERE (b.reference=$1 OR b.id::text=$1) AND b.user_id=$2`,[req.params.reference,req.auth.id])).rows[0];
 if(!booking) fail(404,'Booking not found.');
 booking.history=(await pool.query('SELECT status,message,created_at FROM booking_history WHERE booking_id=$1 ORDER BY created_at',[booking.id])).rows;
 res.json({success:true,data:booking});
});
const handleAdditionalInfo=async(req,res)=>{
 const idOrRef=req.params.id;
 const info=(req.body.additional_information||req.body.message||'').trim();
 if(!info) fail(400,'Please provide the requested information.');
 const result=await transaction(async db=>{
  const b=(await db.query('SELECT * FROM bookings WHERE (id::text=$1 OR reference=$1) AND user_id=$2 FOR UPDATE',[idOrRef,req.auth.id])).rows[0];
  if(!b) fail(404,'Booking not found.');
  if(b.status!=='MORE_INFORMATION_REQUIRED') fail(400,'Additional information is not currently pending for this booking.');
  const newInfo=b.additional_information?`${b.additional_information}\n\n[Response]: ${info}`:info;
  const updated=(await db.query("UPDATE bookings SET additional_information=$1,status='UNDER_REVIEW',updated_at=now() WHERE id=$2 RETURNING *",[newInfo,b.id])).rows[0];
  await db.query("INSERT INTO booking_history(booking_id,status,message,actor_id) VALUES($1,'UNDER_REVIEW',$2,$3)",[b.id,`Customer provided additional information: ${info}`,req.auth.id]);
  await db.query("INSERT INTO notifications(booking_id,title,body) VALUES($1,$2,$3)",[b.id,`${b.reference}: Information Provided`,`Customer responded with additional information: ${info.slice(0,100)}`]);
  await audit(db,req,'CUSTOMER_RESPONSE','booking',b.id,{status:b.status},{status:'UNDER_REVIEW'});
  return {id:updated.id,reference:updated.reference,status:updated.status,additional_information:updated.additional_information};
 });
 res.json({success:true,data:result});
};
userRoutes.patch('/bookings/:id/additional-information',handleAdditionalInfo);
userRoutes.post('/bookings/:id/additional-information',handleAdditionalInfo);
userRoutes.post('/bookings',async(req,res)=>res.status(201).json({success:true,data:await createBooking(req,v.booking.parse(req.body))}));
userRoutes.get('/notifications',async(req,res)=>res.json({success:true,data:(await pool.query('SELECT id,title,body,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[req.auth.id])).rows}));
userRoutes.post('/notifications/:id/read',async(req,res)=>{await pool.query('UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2',[v.uuid.parse(req.params.id),req.auth.id]);res.json({success:true,data:{}});});
userRoutes.patch('/notifications/:id/read',async(req,res)=>{await pool.query('UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2',[v.uuid.parse(req.params.id),req.auth.id]);res.json({success:true,data:{}});});

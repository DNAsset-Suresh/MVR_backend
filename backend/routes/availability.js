import {Router} from 'express';
import {pool,transaction} from '../database/connection.js';
import {permit} from '../middleware/auth.js';
import {fail,audit} from '../utils/security.js';
import * as v from '../validators/index.js';
import {changeBooking} from '../services/bookings.js';
export const publicFields="id,date,half,CASE WHEN (date+end_time) AT TIME ZONE 'Asia/Kolkata'<=now() THEN 'PASSED' WHEN status IN ('BLOCKED','BOOKED') THEN 'BLOCKED' WHEN status='TENTATIVE' OR held THEN 'TENTATIVE' ELSE status END public_status,((date+end_time) AT TIME ZONE 'Asia/Kolkata'>now() AND status='AVAILABLE' AND NOT held AND booking_id IS NULL) selectable";
export const publicAvailability=Router();
publicAvailability.get('/',async(req,res)=>{
 const from=req.query.from?v.date.parse(req.query.from):null,to=req.query.to?v.date.parse(req.query.to):null;
 res.json({success:true,data:(await pool.query(`SELECT ${publicFields} FROM availability_slots WHERE NOT legacy AND ($1::date IS NULL OR date >= $1) AND ($2::date IS NULL OR date <= $2) ORDER BY date,half`,[from,to])).rows});
});
publicAvailability.get(['/:date','/:date/slots'],async(req,res)=>res.json({success:true,data:(await pool.query(`SELECT ${publicFields} FROM availability_slots WHERE NOT legacy AND date=$1 ORDER BY half`,[v.date.parse(req.params.date)])).rows}));
export const adminAvailability=Router();
adminAvailability.get('/',permit('readBookings'),async(req,res)=>res.json({success:true,data:(await pool.query('SELECT * FROM availability_slots WHERE NOT legacy ORDER BY date DESC,half')).rows}));
// Lock both halves in stable order for every administrative date mutation.
async function lockDate(db,date){return (await db.query('SELECT * FROM availability_slots WHERE NOT legacy AND date=$1 ORDER BY id FOR UPDATE',[date])).rows;}
for(const action of ['block-date','unblock-date']) adminAvailability.post('/'+action,permit('booking'),async(req,res)=>{
 const date=v.date.parse(req.body.date);
 const count=await transaction(async db=>{
  const slots=await lockDate(db,date);if(!slots.length)fail(404,'No published slots exist on this date.');
  if(action==='block-date'&&slots.some(s=>s.booking_id||s.held))fail(409,'This date contains a reservation or hold. Manage it first.');
  const result=await db.query(action==='block-date'?"UPDATE availability_slots SET status='BLOCKED',held=false,updated_at=now() WHERE NOT legacy AND date=$1":"UPDATE availability_slots SET status='AVAILABLE',updated_at=now() WHERE NOT legacy AND date=$1 AND status='BLOCKED' AND booking_id IS NULL",[date]);
  await audit(db,req,action.toUpperCase(),'availability-date',date,null,{slots:result.rowCount});return result.rowCount;
 });res.json({success:true,data:{updated:count}});
});
adminAvailability.post('/',permit('booking'),async(req,res)=>{
 const input=v.slot.parse(req.body);
 const row=await transaction(async db=>{
  const rows=(await db.query(`INSERT INTO availability_slots(date,half,start_time,end_time,status,held,internal_notes,created_by)
   SELECT $1,h.half,h.start_time,h.end_time,$2,$2='TENTATIVE',$3,$4 FROM (VALUES('FIRST_HALF','00:00'::time,'12:00'::time),('SECOND_HALF','12:00'::time,'24:00'::time)) h(half,start_time,end_time) RETURNING *`,[input.date,input.status,input.internal_notes,req.auth.id])).rows;
  await audit(db,req,'PUBLISH_DATE','availability',input.date,null,{status:input.status});return rows.find(s=>s.half===input.half);
 });res.status(201).json({success:true,data:row});
});
async function existingDate(db,id){const row=(await db.query('SELECT date FROM availability_slots WHERE id=$1 AND NOT legacy',[id])).rows[0];if(!row)fail(404,'Slot not found.');return row.date;}
const updateSlot=async(req,res)=>{
 const id=v.uuid.parse(req.params.id),input=v.slot.parse(req.body);
 const result=await transaction(async db=>{
  const old=(await lockDate(db,await existingDate(db,id))).find(s=>s.id===id);
  if(old.booking_id)fail(409,'Manage this reserved slot through its booking.');
  if(old.date!==input.date||old.half!==input.half)fail(409,'Published halves cannot be moved. Publish a new date instead.');
  const row=(await db.query("UPDATE availability_slots SET status=$1,internal_notes=$2,held=$1='TENTATIVE',updated_at=now() WHERE id=$3 RETURNING *",[input.status,input.internal_notes,id])).rows[0];
  await audit(db,req,'UPDATE','availability',id,{status:old.status},{status:row.status});return row;
 });res.json({success:true,data:result});
};
adminAvailability.put('/:id',permit('booking'),updateSlot);
adminAvailability.patch('/:id',permit('booking'),updateSlot);
adminAvailability.delete('/:id',permit('booking'),async(req,res)=>{
 const id=v.uuid.parse(req.params.id);
 await transaction(async db=>{
  const rows=await lockDate(db,await existingDate(db,id)),ids=rows.map(s=>s.id);
  if(rows.some(s=>s.booking_id)||(await db.query('SELECT 1 FROM bookings WHERE slot_id=ANY($1::uuid[]) OR second_slot_id=ANY($1::uuid[]) OR alternative_slot_id=ANY($1::uuid[])',[ids])).rowCount)fail(409,'This date has booking history. Block its halves instead.');
  await db.query('DELETE FROM availability_slots WHERE id=ANY($1::uuid[])',[ids]);await audit(db,req,'REMOVE_DATE','availability',rows[0].date);
 });res.json({success:true,data:{}});
});
for(const action of ['hold','release','block','unblock']) adminAvailability.post(`/:id/${action}`,permit('booking'),async(req,res)=>{
 const id=v.uuid.parse(req.params.id);
 const result=await transaction(async db=>{
  const slot=(await lockDate(db,await existingDate(db,id))).find(s=>s.id===id);
  if(slot.booking_id){
   if(action==='release'&&slot.held)await changeBooking(db,req,slot.booking_id,{status:'UNDER_REVIEW',message:'The date hold has been released.'});
   else fail(409,'Manage this reserved slot through its booking.');
  }else{
   if(action==='hold'&&slot.status!=='AVAILABLE')fail(409,'Only an available half can be held.');
   if(action==='release'&&!slot.held)fail(409,'There is no active hold to release.');
   if(action==='unblock'&&slot.status!=='BLOCKED')fail(409,'Only a blocked half can be unblocked.');
   if(action==='block'&&slot.held)fail(409,'Release the hold first.');
   await db.query('UPDATE availability_slots SET status=$1,held=$2,updated_at=now() WHERE id=$3',[action==='block'?'BLOCKED':action==='hold'?'TENTATIVE':'AVAILABLE',action==='hold',id]);
  }
  await audit(db,req,action.toUpperCase(),'availability',id,{status:slot.status});return (await db.query('SELECT * FROM availability_slots WHERE id=$1',[id])).rows[0];
 });res.json({success:true,data:result});
});

// Human-operated controls only. These routes are never registered as model tools.
import {Router} from 'express';
import {z} from 'zod';
import {pool,transaction} from '../database/connection.js';
import {permit} from '../middleware/auth.js';
import {changeBooking} from '../services/bookings.js';
import {uuid} from '../validators/index.js';
export const assistantAdmin=Router();
assistantAdmin.get('/bookings',permit('readBookings'),async(req,res)=>res.json({success:true,data:(await pool.query(`SELECT b.id,b.reference,b.event_type,b.status,b.updated_at::text revision,s.date,s.half,b.second_slot_id FROM bookings b JOIN availability_slots s ON s.id=b.slot_id WHERE b.status IN ('NEW','UNDER_REVIEW','MORE_INFORMATION_REQUIRED','DATE_HOLD') ORDER BY b.created_at LIMIT 30`)).rows}));
assistantAdmin.post('/bookings/:id/decision',permit('booking'),async(req,res)=>{
 const id=uuid.parse(req.params.id),data=z.object({action:z.enum(['approve','reject']),version:z.string().min(1).max(64),confirmed:z.literal(true),message:z.string().trim().min(1).max(1000)}).strict().parse(req.body);
 const record=await transaction(db=>changeBooking(db,req,id,{status:data.action==='approve'?'CONFIRMED':'CANCELLED',message:data.message},{version:data.version}));
 res.json({success:true,data:{reference:record.reference,status:record.status}});
});

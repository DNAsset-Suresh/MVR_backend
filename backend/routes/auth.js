import {Router} from 'express';
import {rateLimit} from 'express-rate-limit';
import {z} from 'zod';
import {pool,transaction} from '../database/connection.js';
import * as v from '../validators/index.js';
import {hashPassword,checkPassword,token,digest,fail,audit} from '../utils/security.js';
import {session,requireAuth,createSession,cookieName,cookieOptions,publicUser} from '../middleware/auth.js';
const dummyHash=await hashPassword(token());
export const authLimiter=rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,message:{success:false,message:'Too many attempts. Try again in 15 minutes.'}});
export async function requestReset(db,user,origin) {
 const raw=token();
 await db.query('DELETE FROM password_reset_tokens WHERE user_id=$1',[user.id]);
 await db.query('INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval \'30 minutes\')',[digest(raw),user.id]);
 await db.query("INSERT INTO outbox(channel,payload) VALUES('email',$1)",[{to:user.email,subject:'Reset your MVR password',text:`Reset your password within 30 minutes: ${origin}/reset-password.html?token=${raw}\nIf you did not request this, ignore this email.`}]);
}
export function authRoutes(kind) {
 const r=Router();
 r.get('/me',async(req,res)=>{const user=await session(req,kind);res.json({success:true,data:user?{...publicUser(user),csrf_token:user.csrf_token}:null});});
 if(kind==='user') r.post('/register',authLimiter,async(req,res)=>{
  const input=v.register.parse(req.body);if(input.alternate_is_whatsapp)input.whatsapp=input.alternate_phone;const hashed=await hashPassword(input.password);
  const user=await transaction(async db=>{
   const {rows}=await db.query('INSERT INTO users(full_name,organisation,organisation_type,email,phone,whatsapp,city,password_hash,first_name,last_name,alternate_phone,alternate_is_whatsapp) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',[`${input.first_name} ${input.last_name}`,input.organisation,input.organisation_type,input.email,input.phone,input.whatsapp,input.city,hashed,input.first_name,input.last_name,input.alternate_phone,input.alternate_is_whatsapp]);
   await db.query("INSERT INTO user_roles VALUES($1,'USER')",[rows[0].id]);
   const csrf=await createSession(db,rows[0].id,'user',res);
   await audit(db,{...req,auth:rows[0]},'REGISTER','user',rows[0].id);
   return {...publicUser(rows[0]),roles:['USER'],csrf_token:csrf};
  });res.status(201).json({success:true,data:user});
 });
 r.post('/login',authLimiter,async(req,res)=>{
  const input=v.login.parse(req.body);
  const user=(await pool.query('SELECT u.*,ARRAY(SELECT role FROM user_roles WHERE user_id=u.id) roles FROM users u WHERE email=$1',[input.email])).rows[0];
  const valid=await checkPassword(input.password,user?.password_hash??dummyHash);
  if(!valid||!user?.active||(kind==='user'?!user.roles.includes('USER'):!user.roles.some(r=>r!=='USER'))) fail(401,'Incorrect email or password.');
  const csrf=await transaction(async db=>{
   const old=req.cookies[cookieName(kind)]; if(old) await db.query('DELETE FROM sessions WHERE token_hash=$1',[digest(old)]);
   await audit(db,{...req,auth:user},'LOGIN','session',kind);
   return createSession(db,user.id,kind,res);
  });res.json({success:true,data:{...publicUser(user),csrf_token:csrf}});
 });
 r.post('/logout',requireAuth(kind),async(req,res)=>{await pool.query('DELETE FROM sessions WHERE token_hash=$1',[req.auth.token_hash]);res.clearCookie(cookieName(kind),cookieOptions);res.json({success:true,data:{}});});
 r.post('/forgot-password',authLimiter,async(req,res)=>{
  const {email}=z.object({email:v.email}).strict().parse(req.body);
  const user=(await pool.query('SELECT id,email FROM users WHERE email=$1 AND active',[email])).rows[0];
  if(user) await transaction(db=>requestReset(db,user,process.env.APP_ORIGIN));
  res.json({success:true,data:{message:'If an active account exists, a password reset email will be sent.'}});
 });
 r.post('/reset-password',authLimiter,async(req,res)=>{
  const data=z.object({token:z.string().regex(/^[a-f0-9]{64}$/),password:v.password,confirm_password:z.string()}).strict().refine(v=>v.password===v.confirm_password,{message:'Passwords must match.'}).parse(req.body);
  const hashed=await hashPassword(data.password);
  await transaction(async db=>{
   const record=(await db.query('SELECT * FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE',[digest(data.token)])).rows[0];
   if(!record) fail(400,'This reset link is invalid or expired.');
   await db.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2',[hashed,record.user_id]);
   await db.query('UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1',[record.user_id]);
   await db.query('DELETE FROM sessions WHERE user_id=$1',[record.user_id]);
   await audit(db,{...req,auth:{id:record.user_id}},'PASSWORD_RESET','user',record.user_id);
  });res.json({success:true,data:{message:'Password updated. Please log in.'}});
 });return r;
}

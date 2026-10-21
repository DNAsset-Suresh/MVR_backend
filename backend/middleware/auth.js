import {pool} from '../database/connection.js';
import {digest,fail,token} from '../utils/security.js';
export const cookieName = kind => kind==='admin' ? 'mvr_admin' : 'mvr_user';
export const cookieOptions = {httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',path:'/'};
export async function createSession(db,userId,kind,res) {
 const raw = token(), csrf = token();
 await db.query('INSERT INTO sessions(token_hash,user_id,kind,csrf_token,expires_at) VALUES($1,$2,$3,$4,now()+interval \'8 hours\')',[digest(raw),userId,kind,csrf]);
 res.cookie(cookieName(kind),raw,{...cookieOptions,maxAge:8*60*60*1000});
 return csrf;
}
export const publicUser = u => ({id:u.id,full_name:u.full_name,first_name:u.first_name,last_name:u.last_name,alternate_phone:u.alternate_phone,alternate_is_whatsapp:u.alternate_is_whatsapp,organisation:u.organisation,organisation_type:u.organisation_type,email:u.email,phone:u.phone,whatsapp:u.whatsapp,city:u.city,active:u.active,created_at:u.created_at,roles:u.roles});
export async function session(req,kind) {
 const raw = req.cookies[cookieName(kind)]; if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return null;
 const {rows} = await pool.query(`SELECT u.*,s.csrf_token,s.token_hash,ARRAY(SELECT role FROM user_roles WHERE user_id=u.id) roles
 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.kind=$2 AND s.expires_at>now() AND u.active`,[digest(raw),kind]);
 const user=rows[0];
 if (!user || (kind==='user' ? !user.roles.includes('USER') : !user.roles.some(r=>r!=='USER'))) return null;
 return user;
}
export const requireAuth = (kind='user') => async(req,res,next) => {
 req.auth=await session(req,kind);
 if (!req.auth) return fail(kind==='admin'?403:401,kind==='admin'?'Administrator access required.':'Please log in.');
 if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.get('X-CSRF-Token')!==req.auth.csrf_token) fail(403,'Invalid security token. Refresh the page and try again.');
 next();
};
const permissions = {
 booking:['SUPER_ADMIN','BOOKING_MANAGER'], content:['SUPER_ADMIN','CONTENT_MANAGER'],
 trust:['SUPER_ADMIN','TRUST_MANAGER'], users:['SUPER_ADMIN','BOOKING_MANAGER'],
 settings:['SUPER_ADMIN'], audit:['SUPER_ADMIN'], readBookings:['SUPER_ADMIN','BOOKING_MANAGER','VIEWER']
};
export const permit = permission => (req,res,next) => {if (!req.auth?.roles.some(r=>permissions[permission]?.includes(r))) fail(403,'Your role does not permit this action.'); next();};

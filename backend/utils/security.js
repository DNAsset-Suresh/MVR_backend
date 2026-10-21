import {randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt = promisify(scryptCallback);
export const token = () => randomBytes(32).toString('hex');
export const digest = value => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password) {
 const salt = randomBytes(16).toString('hex');
 const hash = await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 return `scrypt$${salt}$${hash.toString('hex')}`;
}
export async function checkPassword(password,stored) {
 const [,salt,hash] = stored.split('$');
 if (!salt || !hash) return false;
 const candidate = await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 return timingSafeEqual(candidate,Buffer.from(hash,'hex'));
}
export class HttpError extends Error { constructor(status,message) { super(message); this.status=status; } }
export const fail = (status,message) => {throw new HttpError(status,message);};
export async function audit(db,req,action,entity,id,before=null,after=null) {
 await db.query('INSERT INTO audit_logs(actor_id,action,entity,entity_id,previous_value,new_value,ip) VALUES($1,$2,$3,$4,$5,$6,$7)',[req.auth?.id ?? null,action,entity,id,before,after,req.ip]);
}

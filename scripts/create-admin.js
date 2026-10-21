import {pool,transaction} from '../backend/database/connection.js';
import {hashPassword} from '../backend/utils/security.js';
import {email,password} from '../backend/validators/index.js';
const address=email.parse(process.env.ADMIN_EMAIL),secret=password.parse(process.env.ADMIN_PASSWORD);
await transaction(async db=>{
 const hash=await hashPassword(secret);
 const result=await db.query('INSERT INTO users(full_name,email,password_hash) VALUES($1,$2,$3) RETURNING id',[process.env.ADMIN_NAME||'MVR Administrator',address,hash]);
 await db.query("INSERT INTO user_roles VALUES($1,'SUPER_ADMIN')",[result.rows[0].id]);
 await db.query("INSERT INTO audit_logs(actor_id,action,entity,entity_id) VALUES($1,'BOOTSTRAP_ADMIN','user',$2)",[result.rows[0].id,result.rows[0].id]);
});await pool.end();console.log('Administrator created. Sign in at /admin/login.html.');

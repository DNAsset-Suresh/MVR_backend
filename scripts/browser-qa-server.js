import pg from 'pg';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
if(!process.env.TEST_DATABASE_URL||process.env.TEST_DATABASE_URL===process.env.DATABASE_URL)throw new Error('A separate test database is required.');
process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
const schema='mvr_test_'+randomBytes(8).toString('hex');process.env.DATABASE_SCHEMA=schema;process.env.APP_ORIGIN='http://localhost:3001';process.env.NODE_ENV='test';
const bootstrap=new pg.Client({connectionString:process.env.DATABASE_URL});await bootstrap.connect();await bootstrap.query(`CREATE SCHEMA ${schema}`);
const {pool}=await import('../backend/database/connection.js');const {migrate}=await import('../backend/migrate.js');await migrate();await pool.query(await readFile('database/seed.sql','utf8'));
const {hashPassword}=await import('../backend/utils/security.js');const hash=await hashPassword('Test-only-Strong-Password-2026!');
for(const [email,role,name]of [['admin@example.test','SUPER_ADMIN','QA Administrator'],['customer@example.test','USER','QA Customer']]){
 const u=(await pool.query('INSERT INTO users(full_name,email,password_hash,organisation,organisation_type,phone,city) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[name,email,hash,'QA College','College','+919000000001','Madurai'])).rows[0];await pool.query('INSERT INTO user_roles VALUES($1,$2)',[u.id,role]);
}
await pool.query("UPDATE users SET first_name='QA',last_name=CASE WHEN email='admin@example.test' THEN 'Administrator' ELSE 'Customer' END");
const creator=(await pool.query("SELECT id FROM users WHERE email='admin@example.test'")).rows[0].id;
for(let offset=1;offset<=5;offset++){
 const date=new Date(Date.now()+offset*86400000).toISOString().slice(0,10);
 await pool.query("INSERT INTO availability_slots(date,half,start_time,end_time,status,created_by) VALUES($1,'FIRST_HALF','00:00','12:00',$2,$3),($1,'SECOND_HALF','12:00','24:00',$2,$3)",[date,offset===3?'BLOCKED':'AVAILABLE',creator]);
}
const {createApp}=await import('../backend/app.js');const server=createApp().listen(3001,'127.0.0.1',()=>console.log('Isolated browser QA server: http://localhost:3001. Synthetic accounts only.'));
let closing=false;async function close(){if(closing)return;closing=true;await new Promise(resolve=>server.close(resolve));await pool.end();await bootstrap.query(`DROP SCHEMA ${schema} CASCADE`);await bootstrap.end();process.exit(0);}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,close);

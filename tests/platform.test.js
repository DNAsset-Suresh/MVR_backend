import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import net from 'node:net';
import {spawnSync} from 'node:child_process';
if(!process.env.TEST_DATABASE_URL)throw new Error('Set TEST_DATABASE_URL to a separate PostgreSQL database. Tests never use DATABASE_URL.');
if(process.env.TEST_DATABASE_URL===process.env.DATABASE_URL)throw new Error('The test and application database must be different.');
process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;process.env.NODE_ENV='test';
const schema='mvr_test_'+randomBytes(8).toString('hex');process.env.DATABASE_SCHEMA=schema;
let pool,server,base,admin,customer,second,viewer,contentManager,bookingManager,slot,booking,otherBooking;
const secret='Test-only-Strong-Password-2026!';
const day=new Date(Date.now()+45*86400000).toISOString().slice(0,10);
const profile={first_name:'QA',last_name:'Customer',organisation:'QA College',organisation_type:'College',email:'customer@example.test',phone:'+919000000001',whatsapp:'',city:'Madurai'};
class Client{
 constructor(kind='user'){this.kind=kind;this.cookie='';this.csrf='';}
 async call(url,method='GET',body,extra={}){
  const response=await fetch(base+url,{method,redirect:'manual',headers:{'X-MVR-Request':'1',Origin:base,...(this.cookie?{Cookie:this.cookie}:{}),...(this.csrf?{'X-CSRF-Token':this.csrf}:{}),...(body?{'Content-Type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined});
  const cookies=response.headers.getSetCookie();for(const c of cookies){const pair=c.split(';')[0];this.cookie=this.cookie.split('; ').filter(x=>x&&!x.startsWith(pair.split('=')[0]+'=')).concat(pair).join('; ');}
  let json;const text=await response.text();try{json=JSON.parse(text);}catch{json={html:text};}
  if(json.data?.csrf_token)this.csrf=json.data.csrf_token;
  return {status:response.status,...json,headers:response.headers};
 }
 async login(email){const result=await this.call(this.kind==='admin'?'/api/admin/auth/login':'/api/auth/login','POST',{email,password:secret});assert.equal(result.status,200,result.message);return result;}
}
const success=(r,status=200)=>{assert.equal(r.status,status,r.message);assert.equal(r.success,true);return r.data;};
const input=slotId=>({...profile,slot_id:slotId,event_type:'College Programme',venue:'QA Auditorium',participants:200,audience_type:'College students',language:'Tamil',mode:'Offline',description:'QA booking workflow',special_requirements:'',additional_information:''});
before(async()=>{
 const setup=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await setup.connect();await setup.query(`CREATE SCHEMA ${schema}`);await setup.end();
 ({pool}=await import('../backend/database/connection.js'));const {migrate}=await import('../backend/migrate.js');await migrate();
 await pool.query(await readFile(new URL('../database/seed.sql',import.meta.url),'utf8'));
 const {hashPassword}=await import('../backend/utils/security.js');const hash=await hashPassword(secret);
 for(const [email,role]of [['admin@example.test','SUPER_ADMIN'],['viewer@example.test','VIEWER'],['editor@example.test','CONTENT_MANAGER'],['manager@example.test','BOOKING_MANAGER']]){
  const u=(await pool.query('INSERT INTO users(full_name,email,password_hash) VALUES($1,$2,$3) RETURNING id',[role,email,hash])).rows[0];await pool.query('INSERT INTO user_roles VALUES($1,$2)',[u.id,role]);
 }
 const {createApp}=await import('../backend/app.js');server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`;process.env.APP_ORIGIN=base;
 admin=new Client('admin');customer=new Client();second=new Client();viewer=new Client('admin');contentManager=new Client('admin');bookingManager=new Client('admin');
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(pool)await pool.end();const clean=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await clean.connect();await clean.query(`DROP SCHEMA ${schema} CASCADE`);await clean.end();});
test('real PostgreSQL health, public pages and no frontend secrets',async()=>{
 success(await customer.call('/api/health'));const home=await customer.call('/');assert.equal(home.status,200);assert.match(home.html,/Madurai V. Ramakrishnan/);assert.doesNotMatch(home.html,/DATABASE_URL|password_hash/);
 for(const url of ['/about.html','/programmes.html','/speaking.html','/availability.html','/privacy.html','/terms.html','/login.html','/register.html','/admin/login.html','/sitemap.xml','/robots.txt'])assert.equal((await customer.call(url)).status,200,url);
 assert.equal((await customer.call('/.env')).status,404);assert.equal((await customer.call('/backend/app.js')).status,404);
});
test('administrator bootstrap creates a separate staff account and refuses duplicate emails',async()=>{
 const env={...process.env,ADMIN_EMAIL:'bootstrap@example.test',ADMIN_PASSWORD:secret,ADMIN_NAME:'QA Bootstrap'};
 const result=spawnSync(process.execPath,['scripts/create-admin.js'],{env,encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);
 const account=(await pool.query("SELECT u.id,r.role FROM users u JOIN user_roles r ON r.user_id=u.id WHERE email='bootstrap@example.test'")).rows;assert.equal(account.length,1);assert.equal(account[0].role,'SUPER_ADMIN');
 const again=spawnSync(process.execPath,['scripts/create-admin.js'],{env,encoding:'utf8',windowsHide:true});assert.notEqual(again.status,0);
});
test('registration validation, password hashing and automatic user session',async()=>{
 assert.equal((await customer.call('/api/auth/register','POST',{...profile,password:'short',confirm_password:'short'})).status,400);
 const user=success(await customer.call('/api/auth/register','POST',{...profile,password:secret,confirm_password:secret}),201);assert.deepEqual(user.roles,['USER']);assert.ok(customer.cookie.includes('mvr_user='));
 const stored=(await pool.query('SELECT password_hash FROM users WHERE id=$1',[user.id])).rows[0];assert.match(stored.password_hash,/^scrypt\$/);assert.notEqual(stored.password_hash,secret);
 assert.equal((await customer.call('/user/dashboard.html')).status,200);assert.ok((await customer.call('/api/auth/me')).data.id);
 success(await second.call('/api/auth/register','POST',{...profile,email:'other@example.test',password:secret,confirm_password:secret}),201);
 assert.equal((await second.call('/api/auth/register','POST',{...profile,email:'malicious@example.test',password:secret,confirm_password:secret,role:'SUPER_ADMIN'})).status,400);
});
test('admin authentication is separate and normal users cannot access admin pages or APIs',async()=>{
 assert.equal((await customer.call('/api/admin/bookings')).status,403);assert.equal((await customer.call('/admin/dashboard.html')).status,403);
 assert.equal((await customer.call('/api/admin/auth/login','POST',{email:profile.email,password:secret})).status,401);
 await admin.login('admin@example.test');await viewer.login('viewer@example.test');await contentManager.login('editor@example.test');await bookingManager.login('manager@example.test');
 assert.equal((await admin.call('/api/auth/me')).data,null);assert.equal((await admin.call('/admin/dashboard.html')).status,200);
});
test('CSRF, origin and role checks reject unauthorised changes',async()=>{
 assert.equal((await admin.call('/api/admin/availability','POST',{}, {'X-CSRF-Token':'wrong'})).status,403);
 assert.equal((await admin.call('/api/admin/availability','POST',{}, {Origin:'https://attacker.example'})).status,403);
 assert.equal((await viewer.call('/api/admin/availability','POST',{})).status,403);
 assert.equal((await contentManager.call('/api/admin/bookings')).status,403);
 assert.equal((await customer.call('/api/admin/availability','POST',{})).status,403);
 const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:profile.email,password:secret})});assert.equal(response.status,403);
});
test('admin publishes exactly two fixed halves and cannot create arbitrary hours',async()=>{
 slot=success(await admin.call('/api/admin/availability','POST',{date:day,half:'FIRST_HALF',status:'AVAILABLE',internal_notes:'PRIVATE: do not publish'}),201);
 assert.equal((await admin.call('/api/admin/availability','POST',{date:day,half:'SECOND_HALF',status:'AVAILABLE'})).status,409);
 const edited=success(await admin.call('/api/admin/availability/'+slot.id,'PUT',{date:day,half:'FIRST_HALF',status:'AVAILABLE',internal_notes:'PRIVATE: do not publish'}));assert.equal(edited.half,'FIRST_HALF');
 assert.equal((await admin.call('/api/admin/availability','POST',{date:day,start_time:'15:00',end_time:'14:00',status:'AVAILABLE'})).status,400);
 await assert.rejects(pool.query("UPDATE availability_slots SET start_time='09:00' WHERE id=$1",[slot.id]),e=>e.code==='23514');
});
test('public availability is database-backed and excludes internal notes and identities',async()=>{
 const rows=success(await customer.call('/api/availability'));assert.equal(rows.length,2);assert.equal(rows[0].id,slot.id);assert.equal(rows[0].selectable,true);assert.ok(!('internal_notes' in rows[0]));assert.ok(!('created_by' in rows[0]));assert.ok(!('booking_id' in rows[0]));
 assert.equal(success(await customer.call(`/api/availability/${day}/slots`)).length,2);assert.equal(success(await customer.call(`/api/availability/${day}`)).length,2);
});
test('block, unblock, tentative, manual booked, hold and release behavior',async()=>{
 success(await admin.call(`/api/admin/availability/${slot.id}/block`,'POST'));let publicSlot=success(await customer.call('/api/availability'))[0];assert.equal(publicSlot.public_status,'BLOCKED');assert.equal(publicSlot.selectable,false);
 assert.equal((await customer.call('/api/user/bookings','POST',input(slot.id))).status,409);
 success(await admin.call(`/api/admin/availability/${slot.id}/unblock`,'POST'));success(await admin.call(`/api/admin/availability/${slot.id}/hold`,'POST'));assert.equal(success(await customer.call('/api/availability'))[0].public_status,'TENTATIVE');
 assert.equal((await customer.call('/api/user/bookings','POST',input(slot.id))).status,409);success(await admin.call(`/api/admin/availability/${slot.id}/release`,'POST'));
 const temp=success(await customer.call('/api/availability')).find(s=>s.half==='SECOND_HALF');
 success(await admin.call('/api/admin/availability/'+temp.id,'PUT',{date:day,half:'SECOND_HALF',status:'TENTATIVE'}));
 success(await admin.call('/api/admin/availability/'+temp.id,'PUT',{date:day,half:'SECOND_HALF',status:'BLOCKED'}));assert.equal(success(await customer.call('/api/availability')).find(s=>s.id===temp.id).selectable,false);
 success(await admin.call('/api/admin/availability/'+temp.id+'/unblock','POST'));
});
test('booking rejects arbitrary, unavailable and malformed requests; creates real enquiry',async()=>{
 assert.equal((await customer.call('/api/user/bookings','POST',input(randomUUID()))).status,409);
 assert.equal((await customer.call('/api/user/bookings','POST',{...input(slot.id),participants:-1})).status,400);
 assert.equal((await customer.call('/api/user/bookings','POST',{...input(slot.id),status:'CONFIRMED'})).status,400);
 booking=success(await customer.call('/api/user/bookings','POST',input(slot.id)),201);assert.match(booking.reference,/^MVR-\d{4}-\d{5,}$/);
 assert.equal((await customer.call('/api/user/bookings','POST',input(slot.id))).status,409);
 otherBooking=success(await second.call('/api/user/bookings','POST',{...input(slot.id),email:'other@example.test'}),201);assert.notEqual(booking.reference,otherBooking.reference);
});
test('customers see only their own bookings, history and profile',async()=>{
 const rows=success(await customer.call('/api/user/bookings'));assert.equal(rows.length,1);const detail=success(await customer.call('/api/user/bookings/'+booking.reference));assert.equal(detail.history[0].status,'NEW');assert.ok(!('internal_notes'in detail));
 assert.equal((await second.call('/api/user/bookings/'+booking.reference)).status,404);assert.equal((await customer.call('/api/user/bookings/'+otherBooking.reference)).status,404);
 assert.equal((await customer.call('/api/admin/bookings/'+booking.id+'/confirm','POST')).status,403);
 success(await customer.call('/api/user/profile','PUT',{...profile,city:'Chennai'}));assert.equal(success(await customer.call('/api/user/profile')).city,'Chennai');
 assert.equal((await customer.call('/api/bookings/'+booking.reference)).status,307);
});
test('review, information request, date hold, hold release and history',async()=>{
 for(const status of ['UNDER_REVIEW','MORE_INFORMATION_REQUIRED'])success(await admin.call('/api/admin/bookings/'+booking.id,'PUT',{status,internal_notes:'PRIVATE BOOKING NOTE',message:'Please check your event details.'}));
 success(await admin.call('/api/admin/bookings/'+booking.id+'/hold','POST'));
 assert.equal(success(await customer.call('/api/user/bookings/'+booking.reference)).status,'DATE_HOLD');
 assert.equal((await admin.call('/api/admin/bookings/'+otherBooking.id+'/confirm','POST')).status,409);
 success(await admin.call('/api/admin/availability/'+slot.id+'/release','POST'));assert.equal(success(await customer.call('/api/user/bookings/'+booking.reference)).status,'UNDER_REVIEW');
 const detail=success(await customer.call('/api/user/bookings/'+booking.reference));assert.equal(detail.history.length,5);assert.ok(!JSON.stringify(detail).includes('PRIVATE'));
});
test('simultaneous confirmations allow exactly one reservation and update public calendar',async()=>{
 const results=await Promise.all([admin.call(`/api/admin/bookings/${booking.id}/confirm`,'POST'),bookingManager.call(`/api/admin/bookings/${otherBooking.id}/confirm`,'POST')]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);const winner=results[0].status===200?booking:otherBooking;const loser=winner===booking?otherBooking:booking;booking=winner;otherBooking=loser;
 const reserved=(await pool.query('SELECT * FROM availability_slots WHERE id=$1',[slot.id])).rows[0];assert.equal(reserved.status,'BOOKED');assert.equal(reserved.booking_id,winner.id);
 assert.equal(success(await customer.call('/api/availability'))[0].public_status,'BLOCKED');assert.equal((await admin.call('/api/admin/availability/'+slot.id+'/block','POST')).status,409);
 assert.equal((await pool.query("SELECT * FROM bookings WHERE slot_id=$1 AND status='CONFIRMED'",[slot.id])).rowCount,1);
});
test('cancel releases the slot, another booking can confirm and complete',async()=>{
 success(await admin.call(`/api/admin/bookings/${booking.id}/cancel`,'POST'));assert.equal(success(await customer.call('/api/availability'))[0].public_status,'AVAILABLE');
 success(await admin.call(`/api/admin/bookings/${otherBooking.id}/confirm`,'POST'));success(await admin.call(`/api/admin/bookings/${otherBooking.id}`,'PUT',{status:'COMPLETED'}));
 assert.equal(success(await admin.call('/api/admin/bookings/'+otherBooking.id)).status,'COMPLETED');assert.equal((await admin.call(`/api/admin/bookings/${otherBooking.id}`,'PUT',{status:'NEW'})).status,409);
 assert.equal((await admin.call('/api/admin/availability/'+slot.id,'DELETE')).status,409);
});
test('dashboard, notification queue, audit logs and user management use actual records',async()=>{
 const stats=success(await admin.call('/api/admin/dashboard'));assert.equal(stats.total,2);
 assert.ok(success(await customer.call('/api/user/notifications')).length>0);assert.ok(success(await admin.call('/api/admin/notifications')).length>0);
 assert.ok(success(await admin.call('/api/admin/audit-logs')).some(r=>r.action==='UPDATE_STATUS'));
 assert.equal((await viewer.call('/api/admin/users')).status,403);assert.equal((await bookingManager.call('/api/admin/audit-logs')).status,403);
 const users=success(await admin.call('/api/admin/users')),u=users.find(u=>u.email==='other@example.test');assert.equal(u.enquiry_count,1);
 success(await admin.call('/api/admin/users/'+u.id,'PUT',{active:false}));assert.equal((await second.call('/api/user/bookings')).status,401);
 success(await admin.call('/api/admin/users/'+u.id,'PUT',{active:true}));await second.login('other@example.test');
 success(await admin.call('/api/admin/users/'+u.id+'/reset-password','POST'));
 assert.ok((await pool.query("SELECT 1 FROM outbox WHERE channel='email'")).rowCount>0);
});
test('content publication, CMS permissions, chatbot approved knowledge and draft booking',async()=>{
 const draft=success(await contentManager.call('/api/admin/content','POST',{kind:'programmes',title:'QA programme',body:'Approved QA information',published:false}),201);
 assert.equal(success(await customer.call('/api/programmes')).length,0);
 success(await contentManager.call('/api/admin/content/'+draft.id,'PUT',{kind:'programmes',title:'QA programme',body:'Approved QA information',published:true}));assert.equal(success(await customer.call('/api/programmes')).length,1);
 assert.equal((await contentManager.call('/api/admin/content','POST',{kind:'trust',title:'Not permitted',published:true})).status,403);
 const chat=success(await customer.call('/api/chat','POST',{message:'What programmes are available?'}));assert.match(chat.answer,/Approved QA information/);assert.doesNotMatch(chat.answer,/PRIVATE/);
 assert.match(success(await customer.call('/api/chat','POST',{message:'What is the weather on Mars?'})).answer,/do not have approved information/);
 assert.match(success(await customer.call('/api/chat','POST',{message:'Available '+day})).answer,/Blocked/i);
 success(await customer.call('/api/chat/booking','POST',{event_type:'College Programme',city:'Madurai',participants:100,language:'Tamil',venue:'Hall',organisation:'QA College',full_name:'QA Person',phone:'+919000000001'}));
 success(await contentManager.call('/api/admin/content/'+draft.id,'DELETE'));
});
test('forgot password has generic response; single-use reset invalidates existing sessions',async()=>{
 const a=success(await customer.call('/api/auth/forgot-password','POST',{email:profile.email})),b=success(await customer.call('/api/auth/forgot-password','POST',{email:'unknown@example.test'}));assert.equal(a.message,b.message);
 const queued=(await pool.query("SELECT payload FROM outbox WHERE payload->>'subject'='Reset your MVR password' AND payload->>'to'=$1 ORDER BY created_at DESC LIMIT 1",[profile.email])).rows[0].payload;
 const resetToken=queued.text.match(/token=([a-f0-9]{64})/)[1];const changed='Changed-QA-password-2026!';
 success(await customer.call('/api/auth/reset-password','POST',{token:resetToken,password:changed,confirm_password:changed}));assert.equal((await customer.call('/api/user/profile')).status,401);
 assert.equal((await customer.call('/api/auth/reset-password','POST',{token:resetToken,password:changed,confirm_password:changed})).status,400);
 assert.equal((await customer.call('/api/auth/login','POST',{email:profile.email,password:secret})).status,401);
 success(await customer.call('/api/auth/login','POST',{email:profile.email,password:changed}));success(await customer.call('/api/auth/logout','POST'));assert.equal((await customer.call('/api/auth/me')).data,null);
 success(await admin.call('/api/admin/auth/logout','POST'));assert.equal((await admin.call('/api/admin/bookings')).status,403);
});
test('whole-date blocking and unblocking are atomic',async()=>{
 await admin.login('admin@example.test');
 const nextDay=new Date(Date.now()+50*86400000).toISOString().slice(0,10);
 success(await admin.call('/api/admin/availability','POST',{date:nextDay,half:'FIRST_HALF',status:'AVAILABLE'}),201);
 assert.equal(success(await admin.call('/api/admin/availability/block-date','POST',{date:nextDay})).updated,2);
 assert.ok(success(await customer.call('/api/availability/'+nextDay)).every(s=>!s.selectable&&s.public_status==='BLOCKED'));
 assert.equal(success(await admin.call('/api/admin/availability/unblock-date','POST',{date:nextDay})).updated,2);
 assert.equal((await admin.call('/api/admin/availability/block-date','POST',{date:day})).status,409);
});
test('uploads validate role, MIME, extension and signature and serve safe assets',async()=>{
 const upload=async(client,filename,mime,bytes)=>{
  const response=await fetch(base+'/api/admin/uploads',{method:'POST',headers:{Cookie:client.cookie,Origin:base,'X-MVR-Request':'1','X-CSRF-Token':client.csrf,'X-Filename':filename,'Content-Type':mime},body:bytes});return {status:response.status,...await response.json()};
 };
 assert.equal((await upload(viewer,'a.png','image/png',Buffer.from('bad'))).status,403);
 assert.equal((await upload(admin,'bad.png','image/png',Buffer.from('<script>alert(1)</script>'))).status,400);
 assert.equal((await upload(admin,'bad.svg','image/svg+xml',Buffer.from('<svg/>'))).status,400);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=','base64');
 const asset=success(await upload(admin,'test.png','image/png',png),201);const response=await fetch(base+asset.url);assert.equal(response.status,200);assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 // Remove only the synthetic upload created by this test.
 const {unlink}=await import('node:fs/promises');const {uploadDirectory}=await import('../backend/routes/content.js');const path=await import('node:path');await unlink(path.join(uploadDirectory,asset.url.split('/').at(-1)));
});
test('email queue delivers through SMTP and retries failures without losing jobs',async()=>{
 await pool.query('DELETE FROM outbox');
 let received='';
 const smtp=net.createServer(socket=>{
  socket.write('220 localhost ESMTP QA\r\n');let buffer='',dataMode=false;
  socket.on('data',chunk=>{buffer+=chunk.toString();let end;while((end=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+2);if(dataMode){if(line==='.'){dataMode=false;socket.write('250 Accepted\r\n');}else received+=line+'\n';}else if(/^EHLO|^HELO/.test(line))socket.write('250 localhost\r\n');else if(/^MAIL FROM|^RCPT TO/.test(line))socket.write('250 OK\r\n');else if(line==='DATA'){dataMode=true;socket.write('354 End with dot\r\n');}else if(line==='QUIT'){socket.end('221 Bye\r\n');}else socket.write('250 OK\r\n');}});
 });smtp.listen(0,'127.0.0.1');await new Promise(resolve=>smtp.once('listening',resolve));
 process.env.SMTP_HOST='127.0.0.1';process.env.SMTP_PORT=String(smtp.address().port);process.env.MAIL_FROM='MVR QA <sender@example.test>';
 const {processOutbox}=await import('../backend/services/integrations.js');
 try{
  const job=(await pool.query("INSERT INTO outbox(channel,payload) VALUES('email',$1) RETURNING id",[{to:'receiver@example.test',subject:'QA delivery',text:'Real SMTP delivery verified.'}])).rows[0];
  await processOutbox();assert.match(received,/Real SMTP delivery verified/);assert.equal((await pool.query('SELECT status FROM outbox WHERE id=$1',[job.id])).rows[0].status,'sent');
  const retry=(await pool.query("INSERT INTO outbox(channel,payload) VALUES('email',$1) RETURNING id",[{to:'receiver@example.test',subject:'Retry',text:'Retry me'}])).rows[0];
  await processOutbox(async()=>{throw new Error('Simulated provider outage');});let row=(await pool.query('SELECT * FROM outbox WHERE id=$1',[retry.id])).rows[0];assert.equal(row.status,'pending');assert.equal(row.attempts,1);assert.ok(row.payload.text);
  await pool.query('UPDATE outbox SET available_at=now() WHERE id=$1',[retry.id]);await processOutbox();row=(await pool.query('SELECT * FROM outbox WHERE id=$1',[retry.id])).rows[0];assert.equal(row.status,'sent');assert.deepEqual(row.payload,{});
 }finally{delete process.env.SMTP_HOST;delete process.env.SMTP_PORT;await new Promise(resolve=>smtp.close(resolve));}
});
test('Google Calendar and WhatsApp adapters use server-side credentials and expected payloads',async()=>{
 const {deliver}=await import('../backend/services/integrations.js');
 const original=globalThis.fetch,requests=[];
 globalThis.fetch=async(url,options)=>{requests.push({url:String(url),options});return new Response(JSON.stringify(String(url).includes('oauth2')?{access_token:'qa-token'}:{id:'qa-provider-id'}),{status:200,headers:{'Content-Type':'application/json'}});};
 Object.assign(process.env,{GOOGLE_CLIENT_ID:'qa-id',GOOGLE_CLIENT_SECRET:'qa-secret',GOOGLE_REFRESH_TOKEN:'qa-refresh',GOOGLE_CALENDAR_ID:'qa-calendar',WHATSAPP_API_TOKEN:'qa-token',WHATSAPP_PHONE_NUMBER_ID:'12345',WHATSAPP_TEMPLATE_NAME:'booking_update'});
 try{
  await pool.query("UPDATE bookings SET status='CONFIRMED' WHERE id=$1",[otherBooking.id]);
  await deliver('calendar',{booking_id:otherBooking.id},randomUUID());assert.ok(requests[0].url.startsWith('https://oauth2.googleapis.com/'));const event=JSON.parse(requests[1].options.body);assert.match(event.id,/^[a-v0-9]+$/);assert.equal(event.start.date,day);assert.ok(event.end.date>event.start.date);assert.match(event.summary,/First Half/);assert.ok(!('attendees'in event));
  await deliver('whatsapp',{to:'919000000001',reference:'MVR-QA',status:'CONFIRMED'},randomUUID());const payload=JSON.parse(requests.at(-1).options.body);assert.equal(payload.messaging_product,'whatsapp');assert.equal(payload.template.components[0].parameters[0].text,'MVR-QA');
 }finally{globalThis.fetch=original;for(const key of ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REFRESH_TOKEN','GOOGLE_CALENDAR_ID','WHATSAPP_API_TOKEN','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_TEMPLATE_NAME'])delete process.env[key];}
});
test('Master prompt REST API endpoints: approve, reject, request-info, additional-info and notifications',async()=>{
 await admin.login('admin@example.test');
 await customer.call('/api/auth/login','POST',{email:profile.email,password:'Changed-QA-password-2026!'});
 await second.login('other@example.test');
 const slotDay=new Date(Date.now()+60*86400000).toISOString().slice(0,10);
 const testSlot=success(await admin.call('/api/admin/availability','POST',{date:slotDay,half:'FIRST_HALF',status:'AVAILABLE'}),201);
 const patchedSlot=success(await admin.call('/api/admin/availability/'+testSlot.id,'PATCH',{date:slotDay,half:'FIRST_HALF',status:'AVAILABLE',internal_notes:'Updated notes'}));
 assert.equal(patchedSlot.internal_notes,'Updated notes');
 const newEnquiry=success(await customer.call('/api/user/bookings','POST',input(testSlot.id)),201);
 const myBookings=success(await customer.call('/api/user/bookings/my'));
 assert.ok(myBookings.some(b=>b.reference===newEnquiry.reference));
 success(await admin.call('/api/admin/bookings/'+newEnquiry.id+'/request-information','PATCH',{message:'Please specify exact auditorium capacity'}));
 const reqDetail=success(await customer.call('/api/user/bookings/'+newEnquiry.reference));
 assert.equal(reqDetail.status,'MORE_INFORMATION_REQUIRED');
 const responded=success(await customer.call('/api/user/bookings/'+newEnquiry.reference+'/additional-information','PATCH',{additional_information:'Auditorium capacity is 450 seats'}));
 assert.equal(responded.status,'UNDER_REVIEW');
 const notifications=success(await customer.call('/api/notifications'));
 assert.ok(notifications.length>0);
 success(await customer.call('/api/notifications/'+notifications[0].id+'/read','PATCH'));
 success(await admin.call('/api/admin/bookings/'+newEnquiry.id+'/approve','PATCH'));
 const approvedDetail=success(await customer.call('/api/user/bookings/'+newEnquiry.reference));
 assert.equal(approvedDetail.status,'CONFIRMED');
 const rejectSlot=success(await customer.call('/api/availability/'+slotDay)).find(s=>s.half==='SECOND_HALF');
 const rejEnquiry=success(await second.call('/api/user/bookings','POST',{...input(rejectSlot.id),email:'other@example.test'}),201);
 success(await admin.call('/api/admin/bookings/'+rejEnquiry.id+'/reject','PATCH',{reason:'Schedule conflict'}));
 const rejDetail=success(await second.call('/api/user/bookings/'+rejEnquiry.reference));
 assert.equal(rejDetail.status,'CANCELLED');
});

test('registration requires both names, rejects Community, and stores alternate WhatsApp',async()=>{
 const client=new Client();
 const fields={...profile,email:'identity@example.test',alternate_phone:'+919000000099',alternate_is_whatsapp:true,password:secret,confirm_password:secret};
 for(const invalid of [{last_name:''},{first_name:''},{organisation_type:'Community'},{alternate_phone:''},{alternate_phone:'123'},{alternate_is_whatsapp:'false'}])assert.equal((await client.call('/api/auth/register','POST',{...fields,...invalid})).status,400);
 const registered=success(await client.call('/api/auth/register','POST',fields),201);
 assert.equal(registered.full_name,'QA Customer');assert.equal(registered.alternate_is_whatsapp,true);assert.equal(registered.whatsapp,fields.alternate_phone);
 const update={...profile,email:fields.email,alternate_phone:fields.alternate_phone,alternate_is_whatsapp:true};
 assert.equal((await client.call('/api/user/profile','PUT',{...update,email:'tampered@example.test'})).status,403);
 assert.equal((await client.call('/api/user/profile','PUT',{...update,organisation_type:'Corporate'})).status,403);
 success(await client.call('/api/user/profile','PUT',{...update,last_name:'Updated'}));
 assert.equal(success(await client.call('/api/user/profile')).last_name,'Updated');
 const identity={email:'identity-updated@example.test',organisation_type:'Corporate'};
 assert.equal((await bookingManager.call('/api/admin/users/'+registered.id+'/identity','PUT',identity)).status,403);
 success(await admin.call('/api/admin/users/'+registered.id+'/identity','PUT',identity));
 assert.equal((await client.call('/api/user/profile')).status,401);await client.login(identity.email);
 assert.equal(success(await client.call('/api/user/profile')).organisation_type,'Corporate');
});

test('Full Day validates both halves and reserves, releases and competes atomically',async()=>{
 const fullDate=new Date(Date.now()+70*86400000).toISOString().slice(0,10);
 const first=success(await admin.call('/api/admin/availability','POST',{date:fullDate,half:'FIRST_HALF',status:'AVAILABLE'}),201);
 const halves=success(await customer.call('/api/availability/'+fullDate)),last=halves.find(s=>s.half==='SECOND_HALF');
 assert.deepEqual(halves.map(s=>s.half),['FIRST_HALF','SECOND_HALF']);
 assert.equal((await customer.call('/api/user/bookings','POST',{...input(first.id),second_slot_id:first.id})).status,400);
 assert.equal((await customer.call('/api/user/bookings','POST',{...input(first.id),second_slot_id:slot.id})).status,400);
 success(await admin.call('/api/admin/availability/'+last.id+'/block','POST'));
 assert.equal((await customer.call('/api/user/bookings','POST',{...input(first.id),second_slot_id:last.id})).status,409);
 success(await admin.call('/api/admin/availability/'+last.id+'/unblock','POST'));
 const full=success(await customer.call('/api/user/bookings','POST',{...input(first.id),second_slot_id:last.id,event_type:'Wedding/Reception'}),201);
 assert.equal((await customer.call('/api/user/bookings','POST',input(last.id))).status,409);
 const half=success(await second.call('/api/user/bookings','POST',{...input(last.id),email:'other@example.test'}),201);
 success(await admin.call('/api/admin/bookings/'+full.id+'/hold','POST'));
 assert.ok(success(await customer.call('/api/availability/'+fullDate)).every(s=>s.public_status==='TENTATIVE'&&!s.selectable));
 success(await admin.call('/api/admin/availability/'+last.id+'/release','POST'));
 assert.ok(success(await customer.call('/api/availability/'+fullDate)).every(s=>s.selectable));
 const results=await Promise.all([admin.call('/api/admin/bookings/'+full.id+'/confirm','POST'),bookingManager.call('/api/admin/bookings/'+half.id+'/confirm','POST')]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const winner=results[0].status===200?full:half,loser=winner===full?half:full;
 await assert.rejects(pool.query("UPDATE bookings SET status='CONFIRMED' WHERE id=$1",[loser.id]),e=>e.code==='23505');
 const claims=(await pool.query('SELECT * FROM booking_slot_claims WHERE booking_id=$1',[winner.id])).rows;
 assert.equal(claims.length,winner===full?2:1);
 success(await admin.call('/api/admin/bookings/'+winner.id+'/cancel','POST'));
 assert.ok(success(await customer.call('/api/availability/'+fullDate)).every(s=>s.selectable));
 success(await admin.call('/api/admin/bookings/'+loser.id+'/cancel','POST'));
 await assert.rejects(pool.query('DELETE FROM availability_slots WHERE id=$1',[first.id]),e=>['23503','23514'].includes(e.code));
});

test('enquiry print and DOCX enforce permissions and include safely escaped complete details',async()=>{
 const id=otherBooking.id;
 assert.equal((await customer.call('/api/admin/bookings/'+id+'/print')).status,403);
 assert.equal((await contentManager.call('/api/admin/bookings/'+id+'/export.docx')).status,403);
 await pool.query("UPDATE bookings SET internal_notes=$1,description=$2,topics=$3,alternate_phone=$4,alternate_is_whatsapp=true WHERE id=$5",['Private export note','<script>alert(1)</script>\nLong event description',JSON.stringify(['Leadership','Custom Topic']),'+919000000099',id]);
 const printable=await viewer.call('/api/admin/bookings/'+id+'/print');assert.equal(printable.status,200);
 assert.match(printable.html,/Private export note/);assert.match(printable.html,/Alternate contact number/);assert.match(printable.html,/First Half/);assert.match(printable.html,/&lt;script&gt;/);assert.doesNotMatch(printable.html,/<script>alert/);
 const response=await fetch(base+'/api/admin/bookings/'+id+'/export.docx',{headers:{Cookie:admin.cookie}});
 assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/wordprocessingml/);assert.match(response.headers.get('content-disposition'),/attachment/);assert.equal(response.headers.get('cache-control'),'no-store');
 const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.subarray(0,2).toString(),'PK');
 const {default:JSZip}=await import('jszip');const zip=await JSZip.loadAsync(bytes);const xml=await zip.file('word/document.xml').async('string');
 for(const term of ['Private export note','First Half','Leadership','Alternate contact number','Status history'])assert.ok(xml.includes(term),term);
 const {writeFile,mkdir}=await import('node:fs/promises');await mkdir('test-results',{recursive:true});await writeFile('test-results/enquiry-export.docx',bytes);
});

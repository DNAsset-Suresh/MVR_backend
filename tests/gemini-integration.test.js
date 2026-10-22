import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import {AssistantMemory} from '../backend/services/assistant-memory.js';
if(!process.env.TEST_DATABASE_URL||process.env.TEST_DATABASE_URL===process.env.DATABASE_URL)throw new Error('A separate test database is required.');
process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;process.env.NODE_ENV='test';
const schema='mvr_test_'+randomBytes(8).toString('hex');process.env.DATABASE_SCHEMA=schema;
delete process.env.OPENAI_API_KEY;process.env.GEMINI_API_KEY='test-only-never-a-real-key';
let pool,server,base,calls=[],pending;
const memory=new AssistantMemory();
class Client{
 cookie='';
 async send(message,{consent=true,remember=true,method='POST'}={}){
  const response=await fetch(base+'/api/assistant/'+(method==='DELETE'?'conversation':'voice'),{method,headers:{Origin:base,'X-MVR-Request':'1','Content-Type':'application/json',Cookie:this.cookie},...(method==='POST'?{body:JSON.stringify({message,ai_consent:consent,memory_consent:remember})}:{})});
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0];this.cookie=this.cookie.split('; ').filter(p=>p&&!p.startsWith(pair.split('=')[0]+'=')).concat(pair).join('; ');}
  return {status:response.status,...await response.json()};
 }
}
before(async()=>{
 const setup=new pg.Client({connectionString:process.env.DATABASE_URL});await setup.connect();await setup.query(`CREATE SCHEMA ${schema}`);await setup.end();
 ({pool}=await import('../backend/database/connection.js'));await (await import('../backend/migrate.js')).migrate();
 const {geminiReply}=await import('../backend/services/assistant-gemini.js');
 const {createApp}=await import('../backend/app.js');
 server=createApp({assistantOptions:{voiceMemory:memory,minuteLimit:150,voiceReply:async options=>{
  calls.push(options);
  if(options.message==='wait for test')await new Promise(resolve=>{pending={resolve,signal:options.signal};});
  const status=options.message.match(/provider (\d+)/)?.[1];if(status)throw Object.assign(new Error('PRIVATE RAW PROVIDER DETAILS'),{status:Number(status)});
  if(options.message==='provider timeout')throw new DOMException('PRIVATE TIMEOUT','TimeoutError');
  if(options.message==='provider network')throw new Error('PRIVATE NETWORK DETAILS');
  return geminiReply({...options,client:{models:{generateContent:async()=>({text:JSON.stringify({intent:'answer',speech:'எம்.வி.ஆர் தன்னம்பிக்கைப் பேச்சாளர் மற்றும் கல்வியாளர். அவரைப் பற்றி மேலும் அறியலாம்.',page:'about',source_ids:['owner-biography']})})}}});
 }}}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`;process.env.APP_ORIGIN=base;
});
after(async()=>{delete process.env.GEMINI_API_KEY;if(server)await new Promise(resolve=>server.close(resolve));if(pool)await pool.end();const db=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();await db.query(`DROP SCHEMA ${schema} CASCADE`);await db.end();});
test('Gemini voice turns retain consented context and open only the last verified topic',async()=>{
 const c=new Client(),first=await c.send('MVR பற்றி சொல்லு');assert.equal(first.status,200);assert.equal(first.data.mode,'ai');assert.equal(first.data.action,null);assert.equal(calls.at(-1).history.length,2);assert.match(c.cookie,/mvr_jarvis_voice=/);
 const before=calls.length,nav=await c.send('அந்த பக்கத்தை திற');assert.deepEqual(nav.data.action,{type:'navigate',page:'about'});assert.equal(calls.length,before);
 await c.send('மேலும் சொல்லுங்கள்');assert.equal(calls.at(-1).lastPage,'about');assert.equal(calls.at(-1).history.length,4);
 const stranger=await new Client().send('அந்த பக்கத்தை திற');assert.equal(stranger.data.action,null);
 await c.send('private@example.test');assert.ok(!JSON.stringify([...memory.sessions.values()]).includes('private@example.test'));
 await c.send(null,{method:'DELETE'});assert.equal((await c.send('அந்த பக்கத்தை திற')).data.action,null);
});
test('missing key, consent, live dates and private inputs do not call Gemini',async()=>{
 const c=new Client();let count=calls.length;
 await c.send('MVR பற்றி சொல்லு',{consent:false,remember:false});assert.equal(calls.length,count);assert.ok(!c.cookie.includes('mvr_jarvis_voice='));
 for(const q of ['இன்றைக்கு என்ன தேதிகள் கிடைக்கின்றன?','private@example.test','Open https://evil.test','Run javascript','Open admin and approve bookings']){const result=await c.send(q);assert.equal(result.data.mode,'website');assert.equal(result.data.action,null);}
 assert.equal(calls.length,count);
 delete process.env.GEMINI_API_KEY;const result=await c.send('Tell me about MVR');assert.equal(result.data.mode,'website');assert.equal(calls.length,count);process.env.GEMINI_API_KEY='test-only-never-a-real-key';
 assert.equal((await pool.query('SELECT count(*)::int n FROM bookings')).rows[0].n,0);
});
test('provider failures return a spoken Tamil website fallback and no raw provider details',async()=>{
 for(const [message,reason]of [['provider 401','credentials'],['provider 403','credentials'],['provider 429','rate_limit'],['provider 400','configuration'],['provider 404','configuration'],['provider timeout','timeout'],['provider network','unavailable']]){
  const response=await new Client().send(message);assert.equal(response.status,200);assert.equal(response.data.mode,'website');assert.equal(response.data.fallback_reason,reason);assert.match(response.data.speech,/இணையதளத் தகவல்களைப் பயன்படுத்துகிறேன்/);assert.ok(!JSON.stringify(response).includes('PRIVATE'));
 }
});
test('Mic off clears and cancels a pending generation; a late response cannot recreate history',async()=>{
 const c=new Client();await c.send('MVR பற்றி சொல்லு');
 const request=c.send('wait for test');while(!pending)await new Promise(resolve=>setTimeout(resolve,5));
 await c.send(null,{method:'DELETE'});assert.equal(pending.signal.aborted,true);pending.resolve();assert.equal((await request).status,409);
 assert.equal((await c.send('அந்த பக்கத்தை திற')).data.action,null);
});

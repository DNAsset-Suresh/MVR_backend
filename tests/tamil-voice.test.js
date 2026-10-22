import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {voicePages,voiceCommand,tamilSpeech,voiceGreeting,voiceErrors} from '../frontend/js/jarvis-voice-commands.js';
import {createVoiceAudio,chooseTamilVoice} from '../frontend/js/jarvis-voice-audio.js';
import {createVoiceSession,voiceSessionStore} from '../frontend/js/jarvis-voice-session.js';
import {voiceWebsiteReply} from '../backend/services/assistant-voice.js';
import {coreKnowledge} from '../backend/services/assistant-knowledge.js';
import {modelReply} from '../backend/services/assistant-model.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('contextual navigation validates the server action, speaks first and can be stopped',async()=>{
 const h=harness({ask:async()=>({speech:'ignored model text',action:{type:'navigate',page:'about'}})});
 const started=h.session.activate();await tick();h.finish();await started;
 h.listener.onFinal('அந்த பக்கத்தை திற');await tick();assert.equal(h.speeches.at(-1),voicePages.about.speech);assert.deepEqual(h.routes,[]);h.finish();await tick();assert.deepEqual(h.routes,['/about.html']);h.session.disable();
 for(const action of [{type:'navigate',page:'admin'},{type:'navigate',page:'about',href:'https://evil.test'},{type:'execute',page:'about'}]){
  const h=harness({ask:async()=>({speech:'சரி.',action})});const p=h.session.activate();await tick();h.finish();await p;h.listener.onFinal('அந்த பக்கத்தை திற');await tick();h.finish();await tick();assert.deepEqual(h.routes,[]);h.session.disable();
 }
});
test('English replies use an English browser voice only when requested by playback options',async()=>{
 let utterance;const tamil={name:'Valluvar',lang:'ta-IN'},english={name:'English India',lang:'en-IN'};
 const environment={SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},speechSynthesis:{getVoices:()=>[tamil,english],speak:u=>{utterance=u;},cancel(){}}};
 const driver=createVoiceAudio({environment});await driver.prepare();assert.equal(driver.supportsLanguage('en-IN'),true);
 assert.equal((await driver.speak('Hello')).reason,'invalid');const p=driver.speak('Hello, I can help with MVR.',{language:'en-IN'});assert.equal(utterance.voice,english);assert.equal(utterance.lang,'en-IN');utterance.onstart();utterance.onend();assert.equal((await p).reason,'ended');driver.stop();
});
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
function harness({store=voiceSessionStore(storage()),permission=true,prepared=true,visible,resolveNavigation,ask=async()=>({speech:'வணக்கம். உதவத் தயாராக இருக்கிறேன்.'})}={}){
 const speeches=[],states=[],routes=[],permissions=[],order=[];let pending,listener,clears=0;
 const driver={prepare:async()=>{order.push('prepare');return prepared;},permission:async options=>{order.push('permission');permissions.push(options);if(permission instanceof Error)throw permission;return permission;},listen:handlers=>{order.push('listen');listener=handlers;},stopListening(){listener=null;},stopSpeaking(){if(pending){const p=pending;pending=null;p.resolve({reason:'stopped'});}},stop(){this.stopListening();this.stopSpeaking();},speak(text,options={}){order.push('speak');assert.ok(tamilSpeech(text));speeches.push(text);return new Promise(resolve=>{pending={resolve,options};});}};
 const session=createVoiceSession({driver,store,config:Promise.resolve({ai_available:true,cloud_speech_available:false}),ask,visible,resolveNavigation,navigate:path=>routes.push(path),clear:()=>{clears++;},onChange:s=>states.push(s)});
 return {session,driver,speeches,states,routes,permissions,order,store,get listener(){return listener;},get clears(){return clears;},startSpeech(){pending?.options.onStart?.();},finish(reason='ended'){const p=pending;pending=null;if(reason==='ended')p?.options.onStart?.();p?.resolve({reason});},async start(){const p=session.activate();await tick();return p;}};
}
test('Natural Tamil spoken commands map to verified routes',()=>{
 assert.deepEqual(Object.values(voicePages).map(p=>p.href),['/','/about.html','/journey.html','/speaking.html','/programmes.html','/trust.html','/media.html','/availability.html','/booking.html','/contact.html','/login.html','/register.html','/track-enquiry.html','/privacy.html','/terms.html','/forgot-password.html']);
 for(const [q,page]of [['JARVIS, open the home page.','home'],['Show me the programmes.','programmes'],['Open the media page.','media'],['Check available dates.','availability'],['Go back to the home page.','home'],['Open the about page','about'],['Could you open the about page','about'],['Open the journey page','journey'],['Open the speaking page','speaking'],['Open the trust page','trust'],['Open the booking page','booking'],['Open the contact page','contact'],['Open the register page','register'],['Open the track enquiry page','track-enquiry'],['Open the privacy page','privacy'],['Open the terms page','terms'],['Open the forgot password page','forgot-password'],['முகப்புப் பக்கத்தைத் திற','home'],['எம் வி ஆர் பற்றிய பக்கத்தைத் திற','about'],['நிகழ்ச்சிகளை காட்டு','programmes'],['காணொளிகள் பக்கத்தைத் திற','media'],['கிடைக்கும் தேதிகளை காட்டு','availability'],['முன்பதிவு பக்கத்தைத் திற','booking'],['தொடர்பு விவரங்கள் பக்கத்தைத் திற','contact']])assert.deepEqual(voiceCommand(q),{type:'navigate',page},q);
 assert.deepEqual(voiceCommand('Stop speaking, JARVIS.'),{type:'pause'});assert.deepEqual(voiceCommand('Turn off the microphone.'),{type:'disable'});
 for(const q of ['Tell me about MVR.','Do not open the home page','Open admin','Open https://evil.example','Open media and home','How do I open media?','Open dashboard','முகப்புப் பக்கத்தைத் திறக்க வேண்டாம்','எம் வி ஆர் பற்றி சொல்லுங்கள்'])assert.equal(voiceCommand(q),null,q);
 for(const text of [voiceGreeting,...Object.values(voiceErrors),...Object.values(voicePages).map(p=>p.speech)])assert.ok(tamilSpeech(text));
 for(const text of ['Hello','தமிழ் https://example.test','தமிழ் <script>','हिन्दी','தமிழ் 😀','அ'.repeat(901),'வணக்கம்\nஉலகம்'])assert.equal(tamilSpeech(text),null);
});
test('voice session greets once, begins only after permission, resumes after reply and never exposes text in state',async()=>{
 const h=harness();await h.session.restore();assert.equal(h.permissions.length,0);assert.equal(h.listener,null);
 const started=h.session.activate();await tick();assert.equal(h.permissions[0].request,true);assert.equal(h.session.getState().status,'loading');assert.equal(h.speeches[0],voiceGreeting);assert.equal(h.listener,null);
 assert.deepEqual(h.order,['permission','prepare','speak']);assert.equal(voiceGreeting,'வணக்கம்! நான் MVR-ன் JARVIS உதவியாளர். உங்களுக்கு என்ன உதவி வேண்டும்?');
 h.startSpeech();assert.equal(h.session.getState().status,'speaking');h.finish();await started;assert.equal(h.session.getState().status,'starting');h.listener.onStart();assert.equal(h.session.getState().status,'listening');
 h.listener.onFinal('Tell me about MVR');await tick();assert.equal(h.speeches.length,2);h.startSpeech();h.finish();await tick();assert.equal(h.session.getState().status,'starting');assert.ok(!JSON.stringify(h.states).includes('Tell me about MVR'));
 h.session.pause();const resumed=h.session.activate();await resumed;assert.equal(h.speeches.filter(s=>s===voiceGreeting).length,1);h.session.disable();await tick();assert.equal(h.clears,1);assert.equal(h.session.getState().enabled,false);
 const restarted=h.session.activate();await tick();assert.equal(h.speeches.filter(s=>s===voiceGreeting).length,2);h.finish();await restarted;h.session.disable();
});
test('mute, stop and disable suppress stale answers, navigation and recognition restarts',async()=>{
 let answer;const h=harness({ask:()=>new Promise(resolve=>{answer=resolve;})});const activated=h.session.activate();await tick();h.finish();await activated;
 h.listener.onFinal('Who is Madurai Ramakrishnan');await tick();h.session.mute();answer({speech:'புதிய பதில்.'});await tick();assert.equal(h.speeches.length,1);assert.equal(h.session.getState().status,'muted');assert.equal(h.listener,null);
 await h.session.unmute();h.listener.onFinal('Open the media page');await tick();h.session.pause();h.finish();await tick();assert.deepEqual(h.routes,[]);assert.equal(h.session.getState().status,'paused');
 await h.session.activate();h.listener.onFinal('Turn off the microphone');assert.equal(h.session.getState().enabled,false);await tick();
});
test('navigation confirms before leaving; restored session checks permission and does not repeat greeting',async()=>{
 const h=harness();const started=h.session.activate();await tick();h.finish();await started;
 h.listener.onFinal('Show me the programmes');await tick();assert.deepEqual(h.routes,[]);h.finish();await tick();assert.deepEqual(h.routes,['/programmes.html']);
 const restored=harness({store:h.store});await restored.session.restore();assert.equal(restored.permissions[0].request,false);assert.equal(restored.speeches.length,0);assert.ok(restored.listener);restored.session.hide();assert.equal(restored.session.getState().status,'paused');
 const paused=harness({store:h.store});await paused.session.restore();assert.equal(paused.permissions.length,0);
 h.store.write({paused:false});const deniedRestore=harness({store:h.store,permission:false});await deniedRestore.session.restore();assert.equal(deniedRestore.session.getState().status,'paused');assert.equal(deniedRestore.listener,null);
});
test('permission denial, missing voices, interrupted recognition and failed playback never loop',async()=>{
 const missing=harness({prepared:false});await missing.session.activate();assert.equal(missing.session.getState().reason,'unavailable');assert.equal(missing.permissions.length,1);assert.deepEqual(missing.order,['permission','prepare']);
 const denied=harness({permission:new Error('permission')});const p=denied.session.activate();await tick();assert.equal(denied.speeches[0],voiceErrors.permission);denied.finish();await p;assert.equal(denied.session.getState().status,'error');assert.equal(denied.listener,null);
 const h=harness();const start=h.session.activate();await tick();h.finish('blocked');await start;assert.equal(h.session.getState().reason,'speech');assert.equal(h.listener,null);
 assert.equal(h.session.getState().greeted,false);const retry=h.session.activate();await tick();h.finish();await retry;h.listener.onEnd();await tick();h.finish();await tick();assert.equal(h.session.getState().reason,'interrupted');assert.equal(h.listener,null);h.session.disable();
});
test('Tamil browser driver uses matching voice, releases permission tracks and accepts only final recognition',async()=>{
 let rec,utterance,stopped=0,granted=false;class Recognition{constructor(){rec=this;}start(){}abort(){this.onend?.();}}
 const voice={lang:'ta-IN',name:'Tamil India'},environment={SpeechRecognition:Recognition,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},speechSynthesis:{getVoices:()=>[{lang:'ta-LK',name:'Tamil US',default:true},voice],speak:u=>{utterance=u;},cancel(){}},navigator:{mediaDevices:{getUserMedia:async()=>{granted=true;return {getTracks:()=>[{stop(){stopped++;}}]};}},permissions:{query:async()=>({state:granted?'granted':'prompt'})}}};
 const driver=createVoiceAudio({environment});assert.equal(await driver.prepare(),true);assert.equal(await driver.permission({request:true}),true);assert.equal(stopped,1);assert.equal(await driver.permission(),true);
 assert.equal(await driver.permission({request:true}),true);assert.equal(stopped,1,'existing permission does not open a second probe stream');
 const p=driver.speak(voiceGreeting);assert.equal(utterance.lang,'ta-IN');assert.equal(utterance.voice,voice);utterance.onstart();utterance.onend();assert.equal((await p).reason,'ended');
 let final,starts=0;driver.listen({onStart:()=>starts++,onFinal:t=>final=t,onError:assert.fail,onEnd:assert.fail});assert.equal(rec.lang,'ta-IN');assert.equal(rec.continuous,false);assert.equal(rec.interimResults,false);assert.equal(starts,0);rec.onstart();assert.equal(starts,1);
 const result=[{transcript:'Open the media page'}];result.isFinal=false;rec.onresult({results:[result]});assert.equal(final,undefined);result.isFinal=true;rec.onresult({results:[result]});assert.equal(final,result[0].transcript);driver.stop();
 assert.equal(chooseTamilVoice([{lang:'en-IN'}]),null);assert.equal(chooseTamilVoice([{lang:'ta-LK',default:true},voice]),voice);const valluvar={lang:'ta-IN',name:'Microsoft Valluvar'};assert.equal(chooseTamilVoice([{lang:'en-US',name:'David'},valluvar]),valluvar);
});
test('Tamil knowledge reads actual selectable dates and approved Tamil CMS text',async()=>{
 const available=async()=>[{date:'2026-12-22',half:'FIRST_HALF',selectable:true},{date:'2026-12-23',half:'FIRST_HALF',selectable:false}];
 const r=await voiceWebsiteReply('Read the available dates',coreKnowledge,{availability:available});assert.ok(tamilSpeech(r.speech));assert.match(r.speech,/டிசம்பர்/);assert.ok(!r.speech.includes('23'));assert.match(r.speech,/முன்பதிவு உறுதி அல்ல/);
 for(const query of ['Tell me about MVR','programmes','Adithya Show','awards','book MVR']){const r=await voiceWebsiteReply(query,[...coreKnowledge,{id:'cms',href:'/programmes.html',title:'School',body:'Tamil programme information.'}]);assert.ok(tamilSpeech(r.speech),r.speech);assert.equal(r.action,null);}
 const tamil=await voiceWebsiteReply('programmes',[...coreKnowledge,{id:'cms',href:'/programmes.html',title:'School',body:'தமிழில் நிகழ்ச்சி விவரங்கள்.'}]);assert.ok(tamilSpeech(tamil.speech));assert.match(tamil.speech,/தமிழில் நிகழ்ச்சி விவரங்கள்/);
});
test('cloud audio plays only after loading, releases blob URLs, and cancels stale audio',async()=>{
 let audio;const revoked=[],played=[];
 class Audio{constructor(url){this.url=url;audio=this;}play(){played.push(this.url);this.onplaying();return Promise.resolve();}pause(){this.paused=true;}removeAttribute(){}load(){}}
 const environment={Audio,URL:{createObjectURL:()=> 'blob:qa-audio',revokeObjectURL:url=>revoked.push(url)}};
 const driver=createVoiceAudio({environment,fetchSpeech:async text=>{assert.equal(text,'வணக்கம்.');return new Blob(['qa']);}});
 assert.equal(await driver.prepare({cloudAvailable:true}),true);let starts=0;
 const p=driver.speak('வணக்கம்.',{onStart:()=>starts++});await tick();assert.equal(starts,1);assert.equal(played.length,1);audio.onended();assert.equal((await p).reason,'ended');assert.deepEqual(revoked,['blob:qa-audio']);assert.equal(audio.paused,true);
 const stopped=driver.speak('வணக்கம்.');await tick();driver.stop();assert.equal((await stopped).reason,'stopped');assert.equal(revoked.length,2);
});
test('the active UI has no chat surfaces and no browser credentials',async()=>{
 const ui=await readFile(new URL('../frontend/js/jarvis-voice-ui.js',import.meta.url),'utf8');assert.ok(!/<textarea|<input|role="log"|j-messages|j-message|Transcript/.test(ui));assert.ok(!/AZURE_SPEECH_KEY|Ocp-Apim-Subscription-Key/.test(ui));
 const entry=await readFile(new URL('../frontend/js/chatbot.js',import.meta.url),'utf8');assert.match(entry,/export \{init\} from '\.\/jarvis-voice-ui.js'/);
});

test('voice loading handles both delayed voiceschanged events and browsers that need polling',async()=>{
 const voice={lang:'ta_IN',name:'Tamil'},events=new Map();let available=[];
 const environment={SpeechSynthesisUtterance:class{},speechSynthesis:{getVoices:()=>available,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)}};
 const driver=createVoiceAudio({environment,voiceWaitMs:100,voicePollMs:5});
 const waiting=driver.prepare();available=[voice];events.get('voiceschanged')();assert.equal(await waiting,true);assert.equal(events.size,0);
 available=[];const polled=driver.prepare();available=[voice];assert.equal(await polled,true);assert.equal(events.size,0);
 available=[{lang:'fr-FR',name:'French'}];const cancelled=new AbortController();const aborted=driver.prepare({signal:cancelled.signal});cancelled.abort();assert.equal(await aborted,false);assert.equal(events.size,0);
 const noTamil=createVoiceAudio({environment,voiceWaitMs:5,voicePollMs:2});assert.equal(await noTamil.prepare(),false);
});

test('paused synthesis is resumed before speak; events cannot cancel active speech or revive stopped playback',async()=>{
 const calls=[];let utterance;
 const synth={paused:true,getVoices:()=>[{lang:'ta-IN',name:'Tamil'}],cancel(){calls.push('cancel');},resume(){calls.push('resume');this.paused=false;},speak(u){calls.push('speak');utterance=u;}};
 const driver=createVoiceAudio({environment:{speechSynthesis:synth,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}}}});
 await driver.prepare();const output=driver.speak(voiceGreeting);assert.deepEqual(calls,['resume','speak']);assert.equal(utterance.text,voiceGreeting);assert.equal(utterance.pitch,1);assert.equal(utterance.volume,1);
 utterance.onstart();assert.deepEqual(calls,['resume','speak']);utterance.onend();assert.equal((await output).reason,'ended');assert.equal(utterance.onend,null);
 const next=driver.speak('வணக்கம்.');const lateStart=utterance.onstart;driver.stop();lateStart();assert.equal((await next).reason,'stopped');assert.equal(utterance.onstart,null);
});

test('empty or non-Tamil output is rejected; silent synthesis times out without starting recognition',async()=>{
 let utterance,starts=0;
 const driver=createVoiceAudio({startWaitMs:5,environment:{speechSynthesis:{getVoices:()=>[{lang:'ta-IN',name:'Tamil'}],cancel(){},speak:u=>{utterance=u;starts++;}},SpeechSynthesisUtterance:class{}}});
 await driver.prepare();assert.equal((await driver.speak('')).reason,'invalid');assert.equal((await driver.speak('Hello')).reason,'invalid');assert.equal(starts,0);
 const failed=await driver.speak('வணக்கம்.');assert.equal(failed.reason,'blocked');assert.equal(typeof failed.retry,'function');assert.equal(utterance.onstart,null);
 const retry=failed.retry();assert.equal(starts,2);utterance.onstart();utterance.onend();assert.equal((await retry).reason,'ended');
});

test('permission cancellation and timeout release late streams and never begin speech',async()=>{
 let resolvePermission,released=0;
 const environment={SpeechRecognition:class{},navigator:{permissions:{query:async()=>({state:'prompt'})},mediaDevices:{getUserMedia:()=>new Promise(resolve=>{resolvePermission=resolve;})}}};
 const driver=createVoiceAudio({environment,permissionWaitMs:20}),controller=new AbortController();
 const cancelled=driver.permission({request:true,signal:controller.signal});await tick();controller.abort();await assert.rejects(cancelled,/interrupted/);
 resolvePermission({getTracks:()=>[{stop(){released++;}}]});await tick();assert.equal(released,1);
 const timed=driver.permission({request:true});await assert.rejects(timed,/permission/);resolvePermission({getTracks:()=>[{stop(){released++;}}]});await tick();assert.equal(released,2);
});

test('blocked cloud greeting retries within the click without refetching, then listens after the real end',async()=>{
 let audio,plays=0,fetches=0,recognitions=0;
 class Audio{constructor(){audio=this;}play(){plays++;if(plays===1)return Promise.reject(Object.assign(new Error('blocked'),{name:'NotAllowedError'}));this.onplaying();return Promise.resolve();}pause(){}removeAttribute(){}load(){}}
 class Recognition{start(){recognitions++;this.onstart();}abort(){this.onend?.();}}
 const environment={Audio,SpeechRecognition:Recognition,navigator:{permissions:{query:async()=>({state:'granted'})}},URL:{createObjectURL:()=> 'blob:retry',revokeObjectURL(){}}};
 const driver=createVoiceAudio({environment,fetchSpeech:async text=>{fetches++;assert.equal(text,voiceGreeting);return new Blob(['qa']);}});
 const store=voiceSessionStore(storage()),session=createVoiceSession({driver,store,config:Promise.resolve({cloud_speech_available:true}),ask:assert.fail,navigate:assert.fail});
 await session.activate();assert.equal(session.getState().reason,'speech');assert.equal(session.getState().greeted,false);assert.equal(recognitions,0);
 const retried=session.activate();assert.equal(plays,2,'play is synchronous before activate returns its promise');assert.equal(fetches,1);assert.equal(session.getState().status,'speaking');assert.equal(recognitions,0);
 audio.onended();await retried;assert.equal(session.getState().status,'listening');assert.equal(recognitions,1);assert.equal(store.read().greeted,true);session.disable();
});

test('failed native Tamil engine uses the consented cloud provider once before any speech starts',async()=>{
 let utterance,audio,requests=0;
 class Audio{constructor(){audio=this;}play(){this.onplaying();return Promise.resolve();}pause(){}removeAttribute(){}load(){}}
 const environment={Audio,SpeechSynthesisUtterance:class{},speechSynthesis:{getVoices:()=>[{lang:'ta-IN',name:'Tamil'}],cancel(){},speak:u=>{utterance=u;}},URL:{createObjectURL:()=> 'blob:fallback',revokeObjectURL(){}}};
 const driver=createVoiceAudio({environment,fetchSpeech:async()=>{requests++;return new Blob(['qa']);}});await driver.prepare({cloudAvailable:true});
 const output=driver.speak('வணக்கம்.');utterance.onerror({error:'voice-unavailable'});await tick();assert.equal(requests,1);audio.onended();assert.equal((await output).reason,'ended');
 await driver.prepare({cloudAvailable:false});const noConsent=driver.speak('வணக்கம்.');utterance.onerror({error:'voice-unavailable'});assert.equal((await noConsent).reason,'error');assert.equal(requests,1);
});

test('all six spoken page actions wait for confirmation and stop cancels a pending move',async()=>{
 for(const [command,path]of [['Open the home page','/'],['Open the about page','/about.html'],['Show me the programmes','/programmes.html'],['Open the media page','/media.html'],['Check available dates','/availability.html'],['Login page-a open pannu','/login.html']]){
  const h=harness(),start=h.session.activate();await tick();h.finish();await start;h.listener.onFinal(command);await tick();assert.deepEqual(h.routes,[]);h.finish();await tick();assert.deepEqual(h.routes,[path]);h.session.disable();
 }
});

test('duplicate finals and stale end/error callbacks cannot send twice, cancel speech or navigate twice',async()=>{
 const h=harness(),started=h.session.activate();await tick();h.finish();await started;
 const stale=h.listener;stale.onFinal('Open Login');stale.onFinal('Open Login');stale.onEnd();stale.onError('network');await tick();
 assert.equal(h.speeches.length,2);assert.deepEqual(h.routes,[]);h.finish();await tick();assert.deepEqual(h.routes,['/login.html']);
 stale.onFinal('Open Media');await tick();assert.deepEqual(h.routes,['/login.html']);h.session.disable();
});

test('repeated starts are idempotent and an intentional stop cannot be revived by late events',async()=>{
 const h=harness(),first=h.session.activate();await h.session.activate();await tick();assert.equal(h.permissions.length,1);assert.equal(h.speeches.length,1);
 h.finish();await first;const listener=h.listener;await h.session.activate();assert.equal(h.permissions.length,1);
 listener.onFinal('Stop listening');listener.onEnd();listener.onStart();assert.equal(h.session.getState().status,'paused');assert.equal(h.listener,null);
 await h.session.activate();assert.equal(h.speeches.length,1);h.listener.onFinal('Start listening');await tick();h.finish();await tick();assert.ok(h.listener);h.session.disable();
});

test('unknown command, empty final and help are handled locally in Tamil without asking a model',async()=>{
 const h=harness({ask:assert.fail}),first=h.session.activate();await tick();h.finish();await first;
 for(const command of ['Open a random URL','Run JavaScript','Open admin','',null,'What can you do?']){
  h.listener.onFinal(command);await tick();assert.ok(tamilSpeech(h.speeches.at(-1)));assert.deepEqual(h.routes,[]);h.finish();await tick();assert.ok(h.listener);
 }
 h.session.disable();
});

test('history and refresh wait for completed speech; failed navigation pauses and gives a Tamil error',async()=>{
 for(const command of ['Go back','Go forward','Refresh page']){
  let moves=0;const h=harness({resolveNavigation:()=>({speech:'பக்கத்தைத் திறக்கிறேன்.',execute:()=>{moves++;return false;}})});
  const first=h.session.activate();await tick();h.finish();await first;h.listener.onFinal(command);await tick();assert.equal(moves,0);
  h.finish();await tick();assert.equal(moves,1);assert.equal(h.listener,null);h.finish();await tick();assert.equal(h.session.getState().reason,'navigationFailed');assert.equal(h.session.getState().paused,true);h.session.disable();
 }
});

test('manual reload stops listening; a voice handoff resumes only once, including a cached-page restore',async()=>{
 const backing=storage(),h=harness({store:voiceSessionStore(backing)}),first=h.session.activate();await tick();h.finish();await first;
 const old=h.listener;h.session.unload();old.onFinal('Open Media');await tick();assert.deepEqual(h.routes,[]);
 const reload=harness({store:voiceSessionStore(backing)});await reload.session.restore();assert.equal(reload.permissions.length,0);
 await h.session.activate();h.listener.onFinal('Open Login');await tick();h.finish();await tick();assert.equal(h.store.read().resumeAfterNavigation,true);
 const next=harness({store:voiceSessionStore(backing)});await next.session.restore();assert.equal(next.permissions[0].request,false);assert.ok(next.listener);assert.equal(next.store.read().resumeAfterNavigation,false);
 // A page restored from BFCache must reread the latest stop state, never its frozen copy.
 next.session.disable();await h.session.restore();assert.equal(h.session.getState().enabled,false);assert.equal(h.listener,null);
});

test('voice handoffs never resume on a hidden page or a login redirect outside the allowlist',async()=>{
 for(const hidden of [true,false]){
  const store=voiceSessionStore(storage());store.write({enabled:true,paused:false,consent:true,greeted:true,resumeAfterNavigation:true});
  const h=harness({store,visible:()=>!hidden});await h.session.restore({allowResume:hidden});
  assert.equal(h.permissions.length,0);assert.equal(h.listener,null);assert.equal(h.session.getState().status,'paused');assert.equal(store.read().resumeAfterNavigation,false);
 }
});

test('stopping or muting a failed output drops its replay and cannot replay an old answer on resume',async()=>{
 const h=harness();let replays=0;h.driver.speak=async()=>({reason:'blocked',retry:()=>{replays++;return Promise.resolve({reason:'ended'});}});
 await h.session.activate();h.session.pause();await h.session.activate();assert.equal(replays,0);
 h.session.mute();await h.session.unmute();assert.equal(replays,0);h.session.disable();
});

test('installed local Tamil recognition is preferred without downloading anything',async()=>{
 let rec,installs=0;
 class Recognition{static async available({langs,processLocally}){assert.equal(processLocally,true);return langs[0]==='ta-IN'?'available':'unavailable';}static async install(){installs++;}constructor(){rec=this;}start(){this.onstart();}abort(){}}
 const environment={SpeechRecognition:Recognition,SpeechSynthesisUtterance:class{},speechSynthesis:{getVoices:()=>[{lang:'ta-LK',name:'David'}],cancel(){}}};
 const driver=createVoiceAudio({environment});await driver.prepare();assert.deepEqual(driver.getRecognitionSetup(),{local:true,locale:'ta-IN',downloadable:false,provider:'browser'});assert.equal(installs,0);
 driver.listen({onStart(){},onError:assert.fail,onEnd:assert.fail});assert.equal(rec.processLocally,true);assert.equal(rec.lang,'ta-IN');driver.stop();
});

test('downloadable recognition is installed only by an explicit action; cancelled setup cannot resume listening',async()=>{
 let installs=0,finishInstall;
 class Recognition{static async available(){return 'downloadable';}static install({langs,processLocally}){installs++;assert.deepEqual(langs,['ta-IN']);assert.equal(processLocally,true);return new Promise(resolve=>{finishInstall=resolve;});}}
 const environment={SpeechRecognition:Recognition,SpeechSynthesisUtterance:class{},speechSynthesis:{getVoices:()=>[{lang:'ta-LK',name:'David'}],cancel(){}}};
 const driver=createVoiceAudio({environment});await driver.prepare();assert.equal(installs,0);assert.equal(driver.getRecognitionSetup().downloadable,true);
 const controller=new AbortController(),cancelled=driver.installRecognition({signal:controller.signal});assert.equal(installs,1);controller.abort();await assert.rejects(cancelled,/interrupted/);finishInstall(true);await tick();assert.equal(driver.getRecognitionSetup().local,false);
 const installed=driver.installRecognition();finishInstall(true);await installed;assert.equal(driver.getRecognitionSetup().local,true);
});

test('recognition connection errors are spoken in Tamil and expose the optional download control',async()=>{
 const h=harness();h.driver.getRecognitionSetup=()=>({downloadable:true});
 const activated=h.session.activate();await tick();h.finish();await activated;h.listener.onError('recognitionNetwork');await tick();
 assert.equal(h.speeches.at(-1),voiceErrors.recognitionNetwork);assert.equal(h.session.getState().canInstallRecognition,true);h.startSpeech();assert.equal(h.session.getState().status,'speaking');h.finish();await tick();assert.equal(h.session.getState().reason,'recognitionNetwork');assert.equal(h.listener,null);h.session.disable();assert.equal(h.session.getState().canInstallRecognition,false);
});

test('voice model requests Tamil even with English context and rejects non-Tamil answers before playback',async()=>{
 await modelReply({voiceOnly:true,language:'en-IN',message:'Answer in English instead',history:[{role:'assistant',content:'Hello.'}],knowledge:[],fetchImpl:async(url,options)=>{
  const body=JSON.parse(options.body);assert.match(body.instructions,/Reply in Tamil \(ta-IN\)/);assert.match(body.instructions,/Every greeting, answer, error, confirmation and follow-up must be in natural conversational Tamil/);assert.match(body.instructions,/Never switch language/);
  return {ok:true,json:async()=>({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({answer:'I can help with MVR programmes.',route_keys:[],source_ids:[]})}]}]})};
 }});
 const h=harness({ask:async()=>({speech:'English answer only.'})}),activated=h.session.activate();await tick();h.finish();await activated;h.listener.onFinal('Tell me about MVR');await tick();assert.equal(h.speeches.at(-1),voiceErrors.unknown);h.finish();await tick();h.session.disable();
});

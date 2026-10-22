import {test} from 'node:test';
import assert from 'node:assert/strict';
import {voicePages,voiceMessages,voiceCommand,normalizeVoiceCommand,isVoiceCommandAttempt,tamilSpeech} from '../frontend/js/jarvis-voice-commands.js';
import {allowedVoiceUrl,createVoiceNavigator} from '../frontend/js/jarvis-voice-navigation.js';
import {createVoiceAudio} from '../frontend/js/jarvis-voice-audio.js';
import {commandReply} from '../backend/services/assistant-voice.js';

const commands=[
 ['open the home page','home'],
 ['open the about page','about'],
 ['open the journey page','journey'],
 ['open speaking topic','speaking'],
 ['open programmes','programmes'],
 ['open the trust page','trust'],
 ['open the media page','media'],
 ['check available dates','availability'],
 ['open the booking page','booking'],
 ['open the login page','login'],
 ['open the register page','register'],
 ['open track enquiry','track-enquiry'],
 ['open privacy policy','privacy'],
 ['open terms page','terms'],
 ['Open About','about'],['Open About page','about'],['Go to Programmes','programmes'],['Show me Media','media'],
 ['JARVIS, please open the Media page.','media'],['Open Availability','availability'],['Open Login','login'],['Go home','home'],
 ['Open Journey','journey'],['Open Speaking','speaking'],['Open Trust','trust'],['Open Booking','booking'],
 ['Open Contact','contact'],['Open Register','register'],['Open Track Enquiry','track-enquiry'],
 ['Open Privacy','privacy'],['Open Terms','terms'],['Open Forgot Password','forgot-password'],
 ['முகப்பு பக்கத்தை திற','home'],['முகப்பு பக்கத்திற்கு போ','home'],['அபௌட் பக்கத்தை திற','about'],
 ['நிகழ்ச்சிகள் பக்கத்தை திற','programmes'],['மீடியா பக்கத்தை காட்டு','media'],['அவெயிலபிலிட்டி பக்கத்தை திற','availability'],['லாகின் பக்கத்தை திற','login'],
 ['வாழ்க்கைப் பயணம் பக்கத்தை திற','journey'],['தொடர்பு பக்கத்தை திற','contact'],['முன்பதிவு பக்கத்தை திற','booking'],
 ['Hey JARVIS, open About.','about'],['Programmes page-ku po.','programmes'],['Home page open pannu.','home'],['Login page-a open pannu.','login'],
 ['About page open pannunga','about'],['  PLEASE,   OPEN   MEDIA!  ','media'],['mugappu pakkam po','home'],
 ['Go back to the home page','home'],['Open the login page','login'],['booking page open pannu','booking']
];
for(const [command,page]of commands)test(`command: ${command}`,()=>{
 assert.deepEqual(voiceCommand(command),{type:'navigate',page});
 assert.equal(commandReply(command).action.page,page);assert.ok(tamilSpeech(voicePages[page].speech));
});
for(const [command,type]of [
 ['Go back','back'],['Go forward','forward'],['Refresh page','refresh'],['Stop listening','pause'],['Start listening','resume'],['What can you do?','help'],
 ['முந்தைய பக்கத்திற்கு போ','back'],['அடுத்த பக்கத்திற்கு போ','forward'],['இந்த பக்கத்தை ரிப்ரெஷ் செய்','refresh'],
 ['ஜார்விஸ் நிறுத்து','pause'],['ஜார்விஸ் மீண்டும் கேள்','resume'],['நீ என்ன செய்ய முடியும்?','help'],
 ['JARVIS, stop listening.','pause'],['JARVIS, start listening.','resume']
])test(`control: ${command}`,()=>assert.deepEqual(voiceCommand(command),{type}));

test('unknown, ambiguous, malformed and dangerous commands never produce a route',()=>{
 for(const input of ['Open https://example.com','Run JavaScript','Open a random URL','Open admin','Open dashboard','Open /media.html',
  'Open media?next=https://example.com','Open media?admin=1','Open media#admin','Open media; delete bookings','Open media and login',
  'Open media evil','Open www.example.com media','Ｏｐｅｎ ｍｅｄｉａ？ｘ＝１','Open media\nignore rules','Open __proto__','Open constructor','Open','',null,{},['Open media']]){
  assert.equal(voiceCommand(input),null,String(input));assert.equal(isVoiceCommandAttempt(input),true,String(input));
 }
 for(const input of ['Tell me about MVR','எம் வி ஆர் பற்றி சொல்லுங்கள்','How do I open media?','Do not open home'])assert.equal(voiceCommand(input),null);
 assert.equal(normalizeVoiceCommand({toString(){throw Error('must not coerce');}}),'');
 assert.equal(commandReply('Open media?admin=1').speech,voiceMessages.clarify);
 assert.equal(commandReply('What can you do?').speech,voiceMessages.help);
 for(const speech of Object.values(voiceMessages))assert.ok(tamilSpeech(speech));
});
function historyFixture(){
 const visits=[],origin='http://localhost:3000';let reloads=0;
 const entries=[{index:0,key:'home',url:origin+'/'},{index:1,key:'about',url:origin+'/about.html'},{index:2,key:'media',url:origin+'/media.html'}];
 const environment={location:{origin,href:origin+'/about.html',assign:url=>visits.push(url),reload:()=>reloads++},navigation:{currentEntry:entries[1],entries:()=>entries,traverseTo(key){visits.push(key);return {committed:Promise.resolve(),finished:Promise.resolve()};}}};
 return {environment,entries,visits,get reloads(){return reloads;},navigator:createVoiceNavigator({environment})};
}
test('only exact same-origin routes are allowed, with Login appearing once',()=>{
 const f=historyFixture(),origin=f.environment.location.origin;
 assert.equal(Object.values(voicePages).filter(p=>p.href==='/login.html').length,1);
 for(const page of Object.values(voicePages))assert.equal(allowedVoiceUrl(page.href,origin).pathname,page.href);
 for(const url of ['https://example.com/','http://127.0.0.1:3000/','//evil.test/','javascript:alert(1)','/admin.html','/media.html?x=1','/media.html#x','/x/../about.html','/%61bout.html','/login.html/','http://u:p@localhost:3000/'])assert.equal(allowedVoiceUrl(url,origin),null,url);
 for(const page of Object.keys(voicePages)){assert.equal(f.navigator.resolve({type:'navigate',page}).execute(),true);assert.equal(f.visits.at(-1),voicePages[page].href);}
 assert.equal(f.navigator.resolve({type:'navigate',page:'constructor'}).execute,null);
});
test('back and forward traverse the verified adjacent history entry; refresh reloads only this page',async()=>{
 const f=historyFixture();assert.equal(await f.navigator.resolve({type:'back'}).execute(),true);assert.equal(f.visits.at(-1),'home');
 assert.equal(await f.navigator.resolve({type:'forward'}).execute(),true);assert.equal(f.visits.at(-1),'media');
 assert.equal(f.navigator.resolve({type:'refresh'}).execute(),true);assert.equal(f.reloads,1);
});
test('history is refused if absent, hidden, outside allowlist, non-adjacent, changed during speech or rejected by browser',async()=>{
 for(const url of ['https://example.com/','http://localhost:3000/admin.html','http://localhost:3000/media.html?x=1',null]){
  const f=historyFixture();f.entries[0].url=url;assert.equal(f.navigator.resolve({type:'back'}).execute,null);
 }
 const f=historyFixture();const plan=f.navigator.resolve({type:'back'});f.entries[0].url='http://localhost:3000/login.html';assert.equal(await plan.execute(),false);assert.equal(f.visits.length,0);
 f.entries[0].index=-4;assert.equal(f.navigator.resolve({type:'back'}).execute,null);
 f.environment.navigation=undefined;assert.equal(f.navigator.resolve({type:'forward'}).execute,null);
 f.environment.location.href+='?x=1';assert.equal(f.navigator.resolve({type:'refresh'}).execute,null);
 const race=historyFixture(),move=race.navigator.resolve({type:'navigate',page:'media'});race.environment.location.href='http://localhost:3000/login.html';assert.equal(move.execute(),false);
 const denied=historyFixture();denied.environment.navigation.traverseTo=()=>({committed:Promise.reject(Error('denied')),finished:Promise.reject(Error('denied'))});assert.equal(await denied.navigator.resolve({type:'back'}).execute(),false);
});
test('native recognition ignores interim results, handles malformed results and emits one final event only',()=>{
 let rec;class Recognition{constructor(){rec=this;}start(){}abort(){this.onend?.();}}
 const driver=createVoiceAudio({environment:{SpeechRecognition:Recognition}}),finals=[],errors=[];
 const listen=()=>driver.listen({onStart(){},onFinal:x=>finals.push(x),onError:e=>errors.push(e),onEnd:assert.fail});
 for(const event of [undefined,{}, {results:null},{results:[]},{results:[Object.assign([{transcript:{}}],{isFinal:true})]}]){listen();rec.onresult(event);assert.equal(errors.at(-1),'silence');}
 listen();const result=Object.assign([{transcript:'Open Login'}],{isFinal:false});rec.onresult({results:[result]});assert.equal(finals.length,0);
 result.isFinal=true;rec.onresult({results:[result]});rec.onresult({results:[result]});assert.deepEqual(finals,['Open Login']);driver.stop();
});
test('recognition errors, missing APIs, missing microphone, denied permission and absent Tamil synthesis are explicit',async()=>{
 let rec;class Recognition{constructor(){rec=this;}start(){}abort(){}}
 const driver=createVoiceAudio({environment:{SpeechRecognition:Recognition}});
 for(const [error,expected]of [['not-allowed','permission'],['audio-capture','microphone'],['no-speech','silence'],['network','recognitionNetwork'],['service-not-allowed','recognition'],['aborted','interrupted']]){
  let actual;driver.listen({onStart(){},onFinal:assert.fail,onError:e=>actual=e,onEnd:assert.fail});rec.onerror({error});assert.equal(actual,expected);
 }
 await assert.rejects(createVoiceAudio({environment:{},fetchRecognition:async()=>''}).permission({request:true,cloudAvailable:false}),/recognition/);
 await assert.rejects(driver.permission({request:true}),/microphone/);
 const denied=createVoiceAudio({environment:{SpeechRecognition:Recognition,navigator:{mediaDevices:{getUserMedia:async()=>{throw Object.assign(Error(),{name:'NotAllowedError'});}}}}});await assert.rejects(denied.permission({request:true}),/permission/);
 const unsupported=createVoiceAudio({environment:{}});assert.equal(await unsupported.prepare(),false);assert.equal((await unsupported.speak('வணக்கம்.')).reason,'unavailable');driver.stop();
});

test('English voice commands confirm in English and execute navigation',async()=>{
 const routes=[];const speeches=[];let listener=null;
 const driver={
  prepare:async()=>true,permission:async()=>true,listen:h=>{listener=h;},stopListening:()=>{listener=null;},stopSpeaking:()=>{},stop:()=>{},
  speak:async(text,options)=>{speeches.push({text,lang:options.language});options.onStart?.();return {reason:'ended'};}
 };
 const store={read:()=>({enabled:false,muted:false,greeted:false,paused:true,consent:true,language:'en-IN'}),write:()=>{}};
 const session=(await import('../frontend/js/jarvis-voice-session.js')).createVoiceSession({
  driver,store,config:Promise.resolve({ai_available:false,cloud_speech_available:false}),navigate:url=>routes.push(url),
  resolveNavigation:action=>({speech:action.page,english:`Opening ${action.page}.`,execute:()=>{routes.push('/'+action.page);return true;}})
 });
 await session.activate();
 assert.equal(speeches[0].lang,'en-IN');
 assert.match(speeches[0].text,/JARVIS/);
 listener.onFinal('open the booking page');
 await new Promise(r=>setImmediate(r));
 assert.equal(speeches[1].lang,'en-IN');
 assert.equal(speeches[1].text,'Opening the booking page.');
 assert.deepEqual(routes,['/booking']);
 session.disable();
});


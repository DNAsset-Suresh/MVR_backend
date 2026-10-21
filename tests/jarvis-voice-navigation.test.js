import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createVoice} from '../frontend/js/jarvis-voice.js';
import {greetings,createAssistantSession} from '../frontend/js/jarvis-session.js';
import {resolveNavigationCommand,createAssistantNavigator} from '../frontend/js/jarvis-navigation.js';
import {userDestination} from '../frontend/js/auth.js';
import {websiteReply} from '../backend/routes/assistant.js';
import {coreKnowledge,approvedMediaFeature,inferredKind} from '../backend/services/assistant-knowledge.js';

const storage=()=>{const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};};
function speechEnvironment(voices=[{lang:'en-IN'},{lang:'ta-IN'}]){
 const listeners=new Set(),spoken=[];
 const synthesis={getVoices:()=>voices,speak:u=>spoken.push(u),cancel(){},addEventListener:(name,fn)=>listeners.add(fn),removeEventListener:(name,fn)=>listeners.delete(fn)};
 return {environment:{speechSynthesis:synthesis,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}}},spoken,load(next){voices=next;for(const fn of [...listeners])fn();},listeners};
}
test('exact greetings, one automatic welcome per tab without enabling microphone, mute and storage denial',()=>{
 assert.equal(greetings['en-IN'],'Hi! Hello! I am JARVIS, your MVR Assistant. Welcome to the MVR website. How can I help you today?');
 assert.equal(greetings['ta-IN'],'ஹாய்! வணக்கம்! நான் JARVIS, உங்கள் MVR உதவியாளர். MVR இணையதளத்திற்கு உங்களை அன்புடன் வரவேற்கிறேன். இன்று நான் உங்களுக்கு எப்படி உதவ முடியும்?');
 const s=storage(),session=createAssistantSession(s);assert.equal(session.showWelcome(),true);
 session.set({language:'ta-IN',muted:true});assert.equal(session.claimAutoGreeting(),false);
 session.set({muted:false});assert.equal(session.claimAutoGreeting(),true);assert.equal(session.claimAutoGreeting(),false);assert.equal(session.get().speechConsent,false);assert.equal(session.get().spoken,false);
 const refreshed=createAssistantSession(s);assert.equal(refreshed.claimAutoGreeting(),false);assert.equal(refreshed.showWelcome(),false);assert.equal(refreshed.get().language,'ta-IN');
 const blocked=createAssistantSession({getItem(){throw Error();},setItem(){throw Error();}});blocked.set({speechConsent:true,spoken:true});assert.equal(blocked.claimAutoGreeting(),false);
});
test('both greetings use matching voices; stop and stale callbacks finish once',()=>{
 const fake=speechEnvironment(),finishes=[],states=[];
 const voice=createVoice({...fake,onState:s=>states.push(s)});
 for(const lang of ['en-IN','ta-IN']){voice.speak(greetings[lang],lang,{onFinish:r=>finishes.push(r.reason)});const u=fake.spoken.at(-1);assert.equal(u.lang,lang);assert.equal(u.text,greetings[lang]);u.onstart();assert.equal(states.at(-1),'speaking');u.onend();assert.equal(states.at(-1),'idle');}
 voice.speak('Open about','en-IN',{onFinish:r=>finishes.push(r.reason)});const stale=fake.spoken.at(-1);voice.stop();stale.onstart();stale.onend();assert.deepEqual(finishes,['ended','ended','stopped']);
});
test('delayed device voices, blocked autoplay, silent browser and unavailable voice fall back',async()=>{
 const fake=speechEnvironment([]),reasons=[],notices=[];const voice=createVoice({...fake,onNotice:n=>notices.push(n),voiceWaitMs:15,startTimeoutMs:15});
 voice.speak('Welcome','en-IN',{onFinish:r=>reasons.push(r.reason)});assert.equal(fake.spoken.length,0);fake.load([{lang:'en-IN'}]);assert.equal(fake.spoken.length,1);assert.equal(fake.listeners.size,0);
 fake.spoken.at(-1).onerror({error:'not-allowed'});assert.equal(reasons.at(-1),'blocked');assert.match(notices.at(-1),/Start Conversation/);
 voice.speak('Silent browser','en-IN',{onFinish:r=>reasons.push(r.reason)});await new Promise(resolve=>setTimeout(resolve,30));assert.equal(reasons.at(-1),'blocked');
 voice.speak(greetings['ta-IN'],'ta-IN',{onFinish:r=>reasons.push(r.reason)});assert.equal(reasons.at(-1),'unavailable');assert.match(notices.at(-1),/Tamil voice/);
 fake.load([]);voice.speak('No voices','en-IN',{onFinish:r=>reasons.push(r.reason)});await new Promise(resolve=>setTimeout(resolve,30));assert.equal(reasons.at(-1),'unavailable');assert.equal(fake.listeners.size,0);
 voice.speak('Cancel waiting','en-IN',{onFinish:r=>reasons.push(r.reason)});voice.stop();fake.load([{lang:'en-IN'}]);assert.equal(reasons.at(-1),'stopped');assert.equal(fake.spoken.length,2);
});
test('one final transcript ends listening before callback; late speech cannot send another question',()=>{
 let recognition;class Recognition{constructor(){recognition=this;}start(){this.onstart();}abort(){this.onend();}stop(){this.onend();}}
 const transcripts=[];let voice;voice=createVoice({environment:{SpeechRecognition:Recognition},onTranscript:(text,{final})=>{transcripts.push({text,final,listening:voice.listening});}});
 voice.listen('ta-IN');const part=[{transcript:'MVR பற்றி'}];part.isFinal=false;recognition.onresult({results:[part]});part.isFinal=true;recognition.onresult({results:[part]});recognition.onresult({results:[part]});
 assert.deepEqual(transcripts,[{text:'MVR பற்றி',final:false,listening:true},{text:'MVR பற்றி',final:true,listening:false}]);assert.equal(voice.listening,false);voice.stop();
});
test('all requested explicit commands resolve, while questions, negations and arbitrary URLs do not navigate',()=>{
 for(const [command,key]of [['JARVIS, open the home page.','home'],['Show me about MVR.','about'],['Open programmes.','programmes'],['Play MVR videos.','media'],['Go to the media page.','media'],['Help me book MVR.','booking'],['நிகழ்ச்சிகள் பக்கத்தை திறக்கவும்','programmes'],['மீடியா பக்கத்தை காட்டு','media'],['about page open pannunga','about']])assert.equal(resolveNavigationCommand(command),key,command);
 for(const command of ['Tell me about MVR','Do not open media','Open media and contact','Open https://evil.example','Open admin','Open __proto__','Please explain how to open programmes','Open programmes; delete bookings'])assert.equal(resolveNavigationCommand(command),null,command);
});
test('navigation waits for voice, cancels safely, allows text fallback and never accepts an unknown route',()=>{
 let pending;const destinations=[],confirmations=[];let spoken=true;
 const nav=createAssistantNavigator({voice:{speak:(text,language,options)=>{pending=options.onFinish;}},language:()=> 'ta-IN',canSpeak:()=>spoken,onConfirm:text=>confirmations.push(text),navigate:(route,key)=>destinations.push([route.href,key])});
 assert.equal(nav.go('about'),true);assert.equal(destinations.length,0);assert.match(confirmations[0],/திறக்கிறேன்/);pending({reason:'ended'});pending({reason:'ended'});assert.deepEqual(destinations,[['/about.html','about']]);
 nav.go('media');nav.cancel();pending({reason:'ended'});assert.equal(destinations.length,1);
 nav.go('programmes');pending({reason:'stopped'});assert.equal(destinations.length,1);
 nav.go('media');pending({reason:'blocked'});assert.equal(destinations.at(-1)[0],'/media.html#youtube');
 spoken=false;nav.go('booking');assert.equal(destinations.at(-1)[0],'/booking.html');assert.equal(nav.go('https://evil.example'),false);assert.equal(nav.go('my_bookings'),false);
});
test('login return uses only a booking marker, preserves reviewed drafts and consumes marker once',()=>{
 const s=storage();s.setItem('mvr-assistant-return-route','booking');assert.equal(userDestination(s),'/booking.html');assert.equal(userDestination(s),'/user/dashboard.html');
 s.setItem('mvr-assistant-return-route','https://evil.example');assert.equal(userDestination(s),'/user/dashboard.html');s.setItem('mvr-booking-draft','{}');assert.equal(userDestination(s),'/booking.html');
 assert.equal(userDestination({getItem(){throw Error();}}),'/user/dashboard.html');
});
test('offline greetings, named series, regional biography and unknown achievements stay grounded',async()=>{
 for(const language of ['en-IN','ta-IN']){
  const greeting=await websiteReply('Hi JARVIS.',language,coreKnowledge);assert.match(greeting.answer,/JARVIS/);assert.equal(greeting.mode,'website');
  for(const query of ['Oru Nimida Kathai','Pattimandram','Adithya Show','ஒரு நிமிடக் கதை','பட்டிமன்றம்','ஆதித்யா ஷோ']){assert.equal(inferredKind(query),'media');const r=await websiteReply(query,language,coreKnowledge);assert.equal(r.sources[0].href,approvedMediaFeature(query).url);assert.ok(r.answer.length>40);}
  const biography=await websiteReply('Tell me about MVR',language,coreKnowledge);assert.match(biography.answer,language==='en-IN'?/Singapore and Malaysia/:/சிங்கப்பூர், மலேசியா/);
 }
 const unknown=await websiteReply('Tell me about MVR awards','en-IN',coreKnowledge);assert.match(unknown.answer,/do not have approved information/);
});

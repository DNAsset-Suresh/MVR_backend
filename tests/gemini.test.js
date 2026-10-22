import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GoogleGenAI} from '@google/genai';
import {geminiReply,validateGeminiReply,geminiFailure,geminiModel,defaultGeminiModel} from '../backend/services/assistant-gemini.js';
import {voiceWebsiteReply} from '../backend/services/assistant-voice.js';
import {voiceCommand,requestedVoicePage,wantsEnglish,tamilSpeech,isVoiceCommandAttempt} from '../frontend/js/jarvis-voice-commands.js';
import {AssistantMemory} from '../backend/services/assistant-memory.js';
const knowledge=[{id:'bio',title:'About MVR',body:'MVR is a motivational speaker and educationist.',href:'/about.html'}];
const answer={intent:'answer',speech:'எம்.வி.ஆர் தன்னம்பிக்கைப் பேச்சாளர் மற்றும் கல்வியாளர். மேலும் என்ன அறிய விரும்புகிறீர்கள்?',page:'about',source_ids:['bio']};
test('Gemini SDK receives bounded context, approved records and structured output without tools',async()=>{
 let request;const client={models:{generateContent:async value=>{request=value;return {text:JSON.stringify(answer)};}}};
 const signal=new AbortController().signal;
 const result=await geminiReply({message:'MVR பற்றி சொல்லு',knowledge,history:Array.from({length:24},(_,i)=>({role:i%2?'assistant':'user',content:'public question'})),signal,client});
 assert.equal(result.mode,'ai');assert.equal(result.topic,'about');assert.ok(tamilSpeech(result.speech));assert.equal(result.action,null);
 assert.equal(request.contents.length,13);assert.equal(request.model,defaultGeminiModel);assert.equal(request.config.abortSignal,signal);assert.equal(request.config.httpOptions.retryOptions.attempts,1);assert.equal(request.config.automaticContinuation,false);assert.equal(request.config.tools,undefined);assert.match(request.config.systemInstruction,/natural spoken Tamil/);assert.match(request.contents.at(-1).parts[0].text,/approved_records/);
});
test('installed official SDK serializes generateContent correctly against a mocked transport',async()=>{
 const original=globalThis.fetch;let call;
 globalThis.fetch=async(url,options)=>{call={url:String(url),options};return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(answer)}],role:'model'},finishReason:'STOP'}]}),{headers:{'Content-Type':'application/json'}});};
 try{
  const client=new GoogleGenAI({apiKey:'test-only-not-a-real-key',httpOptions:{retryOptions:{attempts:1}}});
  assert.equal((await geminiReply({message:'MVR பற்றி சொல்லு',knowledge,client})).mode,'ai');
  assert.match(call.url,/^https:\/\/generativelanguage.googleapis.com\//);assert.ok(!call.url.includes('test-only'));const body=JSON.parse(call.options.body);assert.equal(body.generationConfig.responseMimeType,'application/json');assert.ok(body.generationConfig.responseJsonSchema);assert.equal(body.tools,undefined);
 }finally{globalThis.fetch=original;}
});
test('Gemini rejects malformed output, unsupported sources, URLs, code and unrequested actions',async()=>{
 const options={message:'MVR பற்றி சொல்லு',knowledge};
 for(const value of [{...answer,page:'admin'},{...answer,source_ids:['invented']},{...answer,source_ids:[]},{...answer,speech:'Hello only'},{...answer,speech:'தமிழ் https://evil.test'},{...answer,speech:'தமிழ் <script>'},{...answer,execute:'delete database'}])assert.throws(()=>validateGeminiReply(value,options));
 const nav={...answer,intent:'navigate'};assert.equal(validateGeminiReply(nav,options).action,null);
 assert.equal(validateGeminiReply(nav,{...options,message:'Open media'}).action,null);
 assert.deepEqual(validateGeminiReply(nav,{...options,message:'அந்த பக்கத்தை திற',lastPage:'about'}).action,{type:'navigate',page:'about'});
 assert.equal(validateGeminiReply(nav,{...options,message:'அந்த பக்கத்தை திற'}).action,null);
 for(const text of ['not JSON','{"speech":"தமிழ்"}','x'.repeat(10001)])await assert.rejects(geminiReply({...options,client:{models:{generateContent:async()=>({text})}}}));
});
test('invalid keys, quotas, network and aborts produce only classified public failure reasons',async()=>{
 for(const [error,reason]of [[{status:401},'credentials'],[{status:403},'credentials'],[{status:400},'configuration'],[{status:404},'configuration'],[{status:429},'rate_limit'],[new Error('secret raw provider failure'),'unavailable'],[new DOMException('timed out','TimeoutError'),'timeout']]){
  assert.equal(geminiFailure(error),reason);await assert.rejects(geminiReply({message:'MVR பற்றி சொல்லு',knowledge,client:{models:{generateContent:async()=>{throw error;}}}}));
 }
 const controller=new AbortController();controller.abort();await assert.rejects(geminiReply({message:'MVR',knowledge,signal:controller.signal,client:{models:{generateContent:async()=>({text:JSON.stringify(answer)})}}}),{name:'AbortError'});
 await assert.rejects(geminiReply({message:'password=private-token',knowledge,client:{models:{generateContent:assert.fail}}}));
 const old=process.env.GEMINI_MODEL;try{process.env.GEMINI_MODEL='https://evil.test';assert.throws(geminiModel);}finally{if(old===undefined)delete process.env.GEMINI_MODEL;else process.env.GEMINI_MODEL=old;}
});
test('Tamil, English and Tanglish navigation cannot select arbitrary or ambiguous destinations',()=>{
 for(const [q,p]of [['MVR பற்றி படிக்க வேண்டும்','about'],['JARVIS, please open Media','media'],['I would like to read about MVR','about'],['நிகழ்ச்சிகள் பக்கத்திற்கு போ','programmes']])assert.equal(requestedVoicePage(q),p,q);
 assert.deepEqual(voiceCommand('இந்த பக்கத்தை refresh செய்'),{type:'refresh'});
 assert.equal(requestedVoicePage('அந்த பக்கத்தை திற','about'),'about');
 for(const q of ['Open admin','Open https://evil.test','Open media and about','Run javascript','Do not open home','Tell me about MVR'])assert.equal(requestedVoicePage(q,'about'),null,q);
 assert.equal(isVoiceCommandAttempt('Tell me about MVR and his programmes'),false);
 for(const q of ['Open media and home','Do not open home','Tell me about https://evil.test'])assert.equal(isVoiceCommandAttempt(q),true);
});
test('English is accepted only when explicitly requested; ordinary English input still receives Tamil',()=>{
 assert.equal(wantsEnglish('Tell me about MVR'),false);assert.equal(wantsEnglish('Please explain MVR in English'),true);assert.equal(wantsEnglish('ஆங்கிலத்தில் பதில் சொல்லு'),true);assert.equal(wantsEnglish('Do not speak in English'),false);
 const value={...answer,speech:'MVR is a motivational speaker and educationist.'};
 assert.equal(validateGeminiReply(value,{message:'Explain MVR in English',knowledge}).language,'en-IN');assert.throws(()=>validateGeminiReply(value,{message:'Who is MVR',knowledge}));
});
test('today and tomorrow availability use a fresh authorized lookup in IST',async()=>{
 const requested=[],availability=async d=>{requested.push(d);return [];},now=()=>new Date('2026-10-21T20:00:00Z');
 for(const q of ['இன்றைக்கு என்ன தேதிகள் கிடைக்கின்றன?','Are dates available tomorrow?','What dates are available?'])await voiceWebsiteReply(q,knowledge,{availability,now});
 assert.deepEqual(requested,['2026-10-22','2026-10-23',null]);
});
test('bounded context is account-isolated, expires and clears in-flight generation',()=>{
 let clock=0;const memory=new AssistantMemory({now:()=>clock}),a=memory.create('public');a.session.topic='about';
 for(let i=0;i<8;i++)assert.equal(memory.append(a.session,'question '+i,'answer'),true);
 assert.equal(a.session.history.length,12);assert.equal(memory.get(a.raw,'account'),null);
 a.session.controller=new AbortController();memory.clear(a.raw,'public');assert.equal(a.session.controller.signal.aborted,true);assert.equal(memory.append(a.session,'late','answer'),false);
 const b=memory.create('public');clock=31*60*1000;assert.equal(memory.get(b.raw,'public'),null);
});

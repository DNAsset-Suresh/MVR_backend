import {Router,raw} from 'express';
import {rateLimit,ipKeyGenerator} from 'express-rate-limit';
import {z} from 'zod';
import {session as authSession,cookieOptions} from '../middleware/auth.js';
import {fail} from '../utils/security.js';
import {date} from '../validators/index.js';
import {assistantRoutes,approvedRoute} from '../../frontend/js/assistant-routes.js';
import {eventTypes} from '../../frontend/js/booking-options.js';
import {searchKnowledge,readAvailability,inferredKind,approvedMediaFeature} from '../services/assistant-knowledge.js';
import {aiConfigured,modelReply,containsPrivateData} from '../services/assistant-model.js';
import {AssistantMemory,conversationTTL} from '../services/assistant-memory.js';
import {commandReply,voiceWebsiteReply,isAvailabilityQuestion} from '../services/assistant-voice.js';
import {azureSpeechConfigured,synthesizeTamil,recognizeTamil,validatePcmWav,speechLimits} from '../services/azure-speech.js';
import {tamilSpeech,voicePages} from '../../frontend/js/jarvis-voice-commands.js';

const chatInput=z.object({message:z.string().trim().min(1).max(1000),language:z.enum(['en-IN','ta-IN']),ai_consent:z.boolean()}).strict();
const voiceInput=z.object({message:z.string().trim().min(1).max(1000),ai_consent:z.boolean()}).strict();
const speechInput=z.object({text:z.string().max(900).refine(tamilSpeech),cloud_consent:z.literal(true)}).strict();
const draftInput=z.object({event_type:z.enum(eventTypes),date,half:z.enum(['FIRST_HALF','SECOND_HALF','FULL_DAY']),city:z.string().trim().min(1).max(100),venue:z.string().trim().min(1).max(300),participants:z.coerce.number().int().min(1).max(1000000),audience_type:z.string().trim().min(1).max(200),language:z.enum(['Tamil','English','Tamil and English','Other']),description:z.string().trim().max(1500).default(''),reviewed:z.literal(true)}).strict();
const links=(...keys)=>keys.map(approvedRoute);
export async function websiteReply(message,language,knowledge){
 const tamil=language==='ta-IN';let answer='',resultLinks=links('contact','booking'),sources=[];
 if(/^(?:(?:hi|hello|hey|வணக்கம்|ஹாய்)[\s!,.-]*)+(?:(?:jarvis|ஜார்விஸ்)[\s!.]*)?$/i.test(message.trim())){
  answer=tamil?'வணக்கம்! நான் JARVIS, உங்கள் MVR உதவியாளர். MVR, நிகழ்ச்சிகள், காணொளிகள் அல்லது முன்பதிவு பற்றி என்ன அறிய விரும்புகிறீர்கள்?':'Hello! I am JARVIS, your MVR Assistant. How can I help you explore MVR, programmes, videos or booking enquiries?';resultLinks=links('about','programmes','media','booking');
 }else if(/availability|available|date|slot|தேதி|கிடைக்க|நேரம்/i.test(message)){
  const candidate=message.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if(candidate&&!date.safeParse(candidate).success)return {answer:tamil?'சரியான தேதியை YYYY-MM-DD வடிவில் உள்ளிடவும்.':'Please enter a valid date as YYYY-MM-DD.',mode:'website',links:links('availability'),sources:[]};
  const rows=await readAvailability(candidate||null),available=rows.filter(s=>s.selectable).slice(0,6);
  const snapshot=rows.slice(0,candidate?2:6).map(s=>`${s.date} · ${s.half==='FIRST_HALF'?(tamil?'முதல் பாதி':'First Half'):(tamil?'இரண்டாம் பாதி':'Second Half')} · ${s.selectable?(tamil?'கோரிக்கை அனுப்பலாம்':'Available to request'):s.public_status}`).join('\n');
  answer=tamil?`${candidate?'தேர்ந்தெடுத்த தேதி':'அடுத்த வெளியிடப்பட்ட தேதிகள்'} (IST):\n${snapshot||'வெளியிடப்பட்ட நேரங்கள் இல்லை.'}\nஇது முன்பதிவு உறுதி அல்ல. காலண்டரில் தேதியைத் தேர்ந்தெடுத்து கோரிக்கை அனுப்பவும்.`:`${candidate?'Selected date':'Next published dates'} (IST):\n${snapshot||'No future published slots found.'}\nThis is a live snapshot, not a booking confirmation. ${available.length?'Choose an available slot and submit an enquiry.':'Check the calendar or contact the team.'}`;
  resultLinks=links('availability','booking');
 }else if(/book|enquiry|முன்பதிவு|உதவி/i.test(message)){
  answer=tamil?'“Prepare enquiry” மூலம் நிகழ்ச்சி விவரங்களைத் தொடங்கலாம். கிடைக்கும் தேதி மற்றும் நேரத்தைத் தேர்ந்தெடுத்து, உள்நுழைந்து, தொடர்பு விவரங்களைப் படிவத்தில் உள்ளிடவும். சரிபார்த்து நீங்களே சமர்ப்பிக்க வேண்டும். நிர்வாகி ஏற்ற பின்னரே முன்பதிவு உறுதியாகும்.':'Use Prepare enquiry to choose an event and available date. Log in, enter contact details in the booking form, review and explicitly submit. Only the MVR team can confirm your booking.';resultLinks=links('booking','availability','my_bookings');
 }else if(/contact|phone|email|தொடர்பு/i.test(message)){
  answer=tamil?'அதிகாரப்பூர்வ தொடர்பு விவரங்களுக்கு Contact பக்கத்தைப் பார்க்கவும். வெளியிடப்படாத விவரங்களை என்னால் வழங்க முடியாது.':'The contact page displays the team’s published contact details. I cannot supply unpublished contact information.';resultLinks=links('contact');
 }else{
  const kind=inferredKind(message),route=kind==='biography'?'about':kind==='speaking-topics'?'speaking':kind;
  const matches=kind?knowledge.filter(k=>k.href===approvedRoute(route)?.href):[],feature=approvedMediaFeature(message);
  if(/award|achievement|qualification|fee|price|விருது|சாதனை|கட்டணம்/i.test(message)){
   const specific=knowledge.filter(k=>!k.id.startsWith('owner-')&&!['booking-process','official-youtube','official-instagram','published-contact'].includes(k.id)&&/award|achievement|qualification|fee|price|விருது|சாதனை|கட்டணம்/i.test(k.title+' '+k.body));
   if(specific.length){answer=(tamil?'வெளியிடப்பட்ட தகவல் (மூல மொழியில்):\n':'Published information:\n')+specific.slice(0,2).map(k=>k.title+'\n'+k.body.slice(0,650)).join('\n\n');sources=specific.slice(0,2).map(k=>({title:k.title,href:k.href}));}
   else answer=tamil?'கேட்ட குறிப்பிட்ட விவரத்தை அங்கீகரிக்கப்பட்ட பதிவுகளிலிருந்து உறுதிப்படுத்த முடியவில்லை. MVR குழுவைத் தொடர்புகொண்டு சரிபார்க்கவும்.':'I do not have approved information to confirm that specific detail. Please check with the MVR team.';resultLinks=links('contact');
  }else if(kind==='trust')answer=tamil?'அதிகாரப்பூர்வ அறக்கட்டளை பெயர் Ethal Arakattalai Trust. வெளியிடப்பட்ட விவரங்களுக்கு அறக்கட்டளை பக்கத்தைப் பார்க்கவும்.':'The official trust name is Ethal Arakattalai Trust. See its page for published details.';
  else if(feature){answer=tamil?`${feature.title}: ${feature.body}`:feature.en;sources=[{title:feature.title,href:feature.url}];}
  else if(kind==='media')answer=tamil?'MVR-ன் YouTube காணொளிகளையும் Instagram இணைப்பையும் Media பக்கத்தில் காணலாம். ஒரு நிமிடக் கதை, பட்டிமன்றம், ஆதித்யா ஷோ ஆகிய காணொளிகளைப் பற்றியும் கேட்கலாம்.':'Explore MVR’s YouTube videos and official Instagram link on the Media page. You can also ask about Oru Nimida Kathai, Pattimandram or Adithya Show.';
  else if(kind==='biography'){answer=tamil?'MVR — Madurai V. Ramakrishnan — தன்னம்பிக்கைப் பேச்சாளர், கல்வியாளர், வழிகாட்டி, வாழ்க்கை ஆலோசகர், எழுத்தாளர் மற்றும் தமிழ் ஆய்வாளர். தமிழ்நாடு, சிங்கப்பூர், மலேசியா ஆகிய இடங்களில் நிகழ்ச்சிகள் நடத்துகிறார். அவரது பயணம், நிகழ்ச்சிகள், காணொளிகள் மற்றும் முன்பதிவு பற்றிய தகவல்களை அறிய உதவுகிறேன். இது தற்போதைய தேதி கிடைப்பதற்கான உறுதி அல்ல.':'Of course! MVR, Madurai V. Ramakrishnan, is a motivational speaker, educationist, mentor, life counselor, author and Tamil researcher. Programme locations include Tamil Nadu, Singapore and Malaysia. I can help you explore his journey, programmes, media and booking information. Locations do not imply current availability.';sources=[{title:'About MVR',href:'/about.html'}];}
  else if(matches.length){answer=(tamil?'வெளியிடப்பட்ட தகவல் (மூல மொழியில்):\n':'Published information:\n')+matches.slice(0,3).map(k=>k.title+'\n'+k.body.slice(0,450)).join('\n\n');sources=matches.slice(0,3).map(k=>({title:k.title,href:k.href}));}
  else answer=tamil?'இதற்கான அங்கீகரிக்கப்பட்ட தகவல் என்னிடம் இல்லை. நிகழ்ச்சிகள், கிடைக்கும் தேதிகள் அல்லது முன்பதிவு உதவி — எதைப் பற்றி அறிய விரும்புகிறீர்கள்?':'I do not have approved information for that yet. Would you like programme information, availability, or help preparing an enquiry?';
  if(route&&approvedRoute(route))resultLinks=links(route,'contact');
 }
 return {answer:answer.slice(0,2500),mode:'website',links:resultLinks,sources};
}
export function createAssistantRouter({memory=new AssistantMemory(),reply=modelReply,speech=synthesizeTamil,recognize=recognizeTamil,minuteLimit=20}={}){
 const router=Router(),cookie='mvr_jarvis';
 let speechJobs=0;
 const speechCapacity=(req,res,next)=>{if(speechJobs>=4)return res.status(429).json({success:false,message:'Speech service is busy.'});speechJobs++;let released=false;const release=()=>{if(!released){released=true;speechJobs--;}};res.once('finish',release);res.once('close',release);next();};
 const cleanup=setInterval(()=>memory.prune(),60000);cleanup.unref();
 router.get('/config',(req,res)=>res.json({success:true,data:{ai_available:aiConfigured(),cloud_speech_available:azureSpeechConfigured(),cloud_recognition_available:azureSpeechConfigured(),speech_provider:azureSpeechConfigured()?'azure':null,voice_language:'ta-IN',voice_history:false,history_minutes:30,routes:assistantRoutes,voice_routes:voicePages,event_types:eventTypes}}));
 // Validate the live session, never a browser-supplied role or user id. Either login
 // cookie may be present; the matching CSRF token selects the authenticated actor.
 router.use(async(req,res,next)=>{
  const accounts=(await Promise.all(['user','admin'].map(kind=>authSession(req,kind)))).filter(Boolean);
  req.assistantActor=accounts.find(a=>a.csrf_token===req.get('X-CSRF-Token'));
  if(!['GET','HEAD'].includes(req.method)&&accounts.length&&!req.assistantActor)fail(403,'Invalid security token. Refresh the page and try again.');
  next();
 });
 const ipLimit=rateLimit({windowMs:60000,limit:minuteLimit,standardHeaders:'draft-8',legacyHeaders:false,message:{success:false,message:'JARVIS has reached the minute limit. Please wait a minute or use the website.'}});
 const accountLimit=rateLimit({windowMs:3600000,limit:60,keyGenerator:req=>req.assistantActor?'user:'+req.assistantActor.id:'ip:'+ipKeyGenerator(req.ip),standardHeaders:'draft-8',legacyHeaders:false,message:{success:false,message:'JARVIS has reached the hourly limit. The normal website remains available.'}});
 router.get('/knowledge/search',ipLimit,async(req,res)=>res.json({success:true,data:await searchKnowledge(z.string().trim().min(1).max(300).parse(req.query.q))}));
 router.get('/availability',ipLimit,async(req,res)=>res.json({success:true,data:await readAvailability(req.query.date?date.parse(req.query.date):null)}));
 router.delete('/conversation',(req,res)=>{memory.clear(req.cookies[cookie],req.assistantActor?.id||'public');res.clearCookie(cookie,cookieOptions);res.json({success:true,data:{message:'Conversation cleared.'}});});
 router.post('/speech',ipLimit,accountLimit,speechCapacity,async(req,res)=>{
  const input=speechInput.parse(req.body);
  if(!azureSpeechConfigured())return res.status(503).json({success:false,message:'Tamil speech is not configured.'});
  if(containsPrivateData(input.text))fail(400,'Private information is not accepted.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  const disconnect=()=>{if(!res.writableEnded)controller.abort();};res.on('close',disconnect);
  try{const audio=await speech(input.text,{signal:controller.signal});res.type('audio/mpeg').send(audio);}
  catch{if(!res.destroyed)res.status(503).json({success:false,message:'Tamil speech is temporarily unavailable.'});}
  finally{clearTimeout(timer);res.off('close',disconnect);}
 });
 router.post('/recognize',ipLimit,accountLimit,speechCapacity,(req,res,next)=>{
  if(req.get('X-MVR-Speech-Consent')!=='1')return res.status(400).json({success:false,message:'Speech consent is required.'});
  if(!azureSpeechConfigured())return res.status(503).json({success:false,message:'Tamil recognition is not configured.'});
  if(!req.is('audio/wav'))return res.status(415).json({success:false,message:'A PCM WAV audio request is required.'});
  next();
 },raw({type:'audio/wav',limit:speechLimits.bytes,inflate:false}),async(req,res)=>{
  try{validatePcmWav(req.body);}catch{if(Buffer.isBuffer(req.body))req.body.fill(0);return res.status(400).json({success:false,message:'Invalid or overlong audio.'});}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  const disconnect=()=>{if(!res.writableEnded)controller.abort();};res.on('close',disconnect);
  try{const transcript=await recognize(req.body,{signal:controller.signal});res.json({success:true,data:{transcript}});}
  catch{if(!res.destroyed)res.status(503).json({success:false,message:'Tamil recognition is temporarily unavailable.'});}
  finally{req.body.fill(0);clearTimeout(timer);res.off('close',disconnect);}
 });
 router.post(['/chat','/voice'],ipLimit,accountLimit,async(req,res)=>{
  const voiceOnly=req.path==='/voice',input=voiceOnly?{...voiceInput.parse(req.body),language:'ta-IN'}:chatInput.parse(req.body),owner=req.assistantActor?.id||'public';
  if(voiceOnly){
   if(containsPrivateData(input.message))return res.json({success:true,data:{speech:'தனிப்பட்ட விவரங்களைப் பேசிப் பகிர வேண்டாம். அவற்றைப் பாதுகாப்பான முன்பதிவுப் படிவத்தில் உள்ளிடவும். இந்தத் தகவல் செயற்கை நுண்ணறிவுச் சேவைக்கு அனுப்பப்படவில்லை.',action:null,mode:'website'}});
   const command=commandReply(input.message);if(command)return res.json({success:true,data:command});
  }
  if(containsPrivateData(input.message))return res.json({success:true,data:{answer:input.language==='ta-IN'?'தனிப்பட்ட தகவல்களை உரையாடலில் பகிர வேண்டாம். தொடர்பு விவரங்களுக்கு பாதுகாப்பான முன்பதிவு படிவத்தையும், நிலவரத்திற்கு My enquiries பக்கத்தையும் பயன்படுத்தவும்.':'Please keep personal details out of chat. Use the secure booking form for contact information, or My enquiries for private booking status. This message was not sent to AI or added to history.',mode:'website',links:links('booking','my_bookings'),sources:[]}});
  // Voice turns are stateless: no microphone recordings or transcript history.
  let conversation=voiceOnly?{history:[],busy:false}:memory.get(req.cookies[cookie],owner);
  if(!conversation){const created=memory.create(owner);conversation=created.session;res.cookie(cookie,created.raw,{...cookieOptions,maxAge:conversationTTL});}
  if(conversation.busy)fail(409,'Please wait for the current reply.');conversation.busy=true;
  const controller=new AbortController();conversation.controller=controller;
  const timeout=setTimeout(()=>controller.abort(),20000);const disconnected=()=>{if(!res.writableEnded)controller.abort();};res.on('close',disconnected);
  try{
   const knowledge=await searchKnowledge(input.message.slice(0,300));
   let result;
   if(voiceOnly&&isAvailabilityQuestion(input.message))result=await voiceWebsiteReply(input.message,knowledge);
   else if(aiConfigured()&&input.ai_consent){
    try{result=await reply({message:input.message,language:input.language,knowledge,history:conversation.history,signal:controller.signal,voiceOnly});if(voiceOnly){const speech=tamilSpeech(result.answer);if(!speech)throw new Error('NON_TAMIL_REPLY');result={speech,action:null,mode:'ai'};}}
    catch{if(!voiceOnly&&controller.signal.aborted&&!memory.sessions.has(conversation.key))fail(409,'Conversation cleared.');result=voiceOnly?await voiceWebsiteReply(input.message,knowledge):await websiteReply(input.message,input.language,knowledge);if(!voiceOnly)result.notice=input.language==='ta-IN'?'AI சேவை கிடைக்கவில்லை. இணையதளத் தகவல்களைப் பயன்படுத்துகிறேன்.':'AI is temporarily unavailable. Using website information.';}
   }else result=voiceOnly?await voiceWebsiteReply(input.message,knowledge):await websiteReply(input.message,input.language,knowledge);
   if(!voiceOnly&&!memory.append(conversation,input.message,result.answer))fail(409,'Conversation expired or was cleared. Please send again.');
   res.json({success:true,data:result});
  }finally{clearTimeout(timeout);res.off('close',disconnected);conversation.busy=false;delete conversation.controller;}
 });
 router.post('/booking-draft',ipLimit,async(req,res)=>{
  const data=draftInput.parse(req.body),slots=await readAvailability(data.date);
  const first=slots.find(s=>s.half==='FIRST_HALF'&&s.selectable),second=slots.find(s=>s.half==='SECOND_HALF'&&s.selectable);
  const selected=data.half==='SECOND_HALF'?second:first;
  if(!selected||(data.half==='FULL_DAY'&&!second))fail(409,'That time is no longer available. Choose another published slot.');
  const {half,reviewed,...draft}=data;
  res.json({success:true,data:{draft:{...draft,slot_id:selected.id,second_slot_id:half==='FULL_DAY'?second.id:null,expected_audience:['Other'],custom_audience:data.audience_type,preferred_language:data.language},href:'/booking.html',message:'Draft prepared only. Log in, add contact details, review and submit the existing booking form. No enquiry has been submitted.'}});
 });
 return router;
}

import {tamilSpeech,voiceErrors,voiceCommand,voicePages} from '../../frontend/js/jarvis-voice-commands.js';
import {approvedMediaFeature,inferredKind,readAvailability} from './assistant-knowledge.js';
import {date} from '../validators/index.js';
export {synthesizeTamil} from './azure-speech.js';
export function commandReply(message){const action=voiceCommand(message);return action?.type==='navigate'?{speech:voicePages[action.page].speech,action,mode:'website'}:null;}
export const isAvailabilityQuestion=message=>/\b(?:dates?|available|availability|slots?|calendar)\b|தேதி|கிடைக்க|நாட்காட்டி/i.test(message);
const spokenDate=value=>new Intl.DateTimeFormat('ta-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Kolkata'}).format(new Date(value+'T12:00:00+05:30'));
const excerpt=(text,max=600)=>{const clean=String(text).replace(/\s+/g,' ').trim();if(clean.length<=max)return tamilSpeech(clean);const cut=clean.slice(0,max),end=Math.max(cut.lastIndexOf('. '),cut.lastIndexOf('! '),cut.lastIndexOf('? '));return end>=0?tamilSpeech(cut.slice(0,end+1)):null;};
export async function voiceWebsiteReply(message,knowledge,{availability=readAvailability}={}){
 const kind=inferredKind(message),feature=approvedMediaFeature(message);let speech=voiceErrors.unknown;
 if(isAvailabilityQuestion(message)){
  const candidate=message.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if(candidate&&!date.safeParse(candidate).success)return {speech:'அந்தத் தேதி சரியானது அல்ல. நாட்காட்டிப் பக்கத்தில் தேதியைச் சரிபார்க்கவும்.',action:null,mode:'website'};
  const rows=await availability(candidate||null),available=rows.filter(row=>row.selectable).slice(0,3);
  speech=available.length?'கோரிக்கை அனுப்பக் கிடைக்கும் வெளியிடப்பட்ட நேரங்கள்: '+available.map(row=>spokenDate(row.date)+', '+(row.half==='FIRST_HALF'?'முதல் பாதி':'இரண்டாம் பாதி')).join('. ')+'. அனைத்தும் இந்திய நேரப்படி. இது முன்பதிவு உறுதி அல்ல. தேதி கிடைக்கும் பக்கத்தில் நேரத்தைத் தேர்ந்தெடுத்து கோரிக்கை அனுப்பவும்.':'இந்தக் கோரிக்கைக்குக் கிடைக்கும் நேரங்கள் தற்போது வெளியிடப்படவில்லை. தேதி கிடைக்கும் பக்கத்தைப் பார்க்கவும் அல்லது எம்.வி.ஆர் குழுவைத் தொடர்புகொள்ளவும்.';
 }else if(/\b(?:awards?|achievements?|qualifications?|fees?|prices?|cost)\b|விருது|சாதனை|தகுதி|கட்டணம்/i.test(message)){
  speech=knowledge.filter(k=>!k.id.startsWith('owner-')&&/award|achievement|qualification|fee|price|விருது|சாதனை|தகுதி|கட்டணம்/i.test(k.title+' '+k.body)).map(k=>excerpt(k.body)).find(Boolean)||'கேட்ட குறிப்பிட்ட விவரத்தை உறுதிப்படுத்த அங்கீகரிக்கப்பட்ட தகவல் என்னிடம் இல்லை. எம்.வி.ஆர் குழுவிடம் சரிபார்க்கவும்.';
 }else if(/\b(?:book|booking|enquiry|enquiries|reserve)\b|முன்பதிவு/i.test(message))speech='முன்பதிவைக் கோர, கிடைக்கும் தேதியையும் நேரத்தையும் தேர்ந்தெடுக்கவும். உள்நுழைந்து நிகழ்ச்சி மற்றும் தொடர்பு விவரங்களைப் படிவத்தில் உள்ளிட்டு, சரிபார்த்து கோரிக்கையை அனுப்பவும். அங்கீகரிக்கப்பட்ட நிர்வாகி மட்டுமே முன்பதிவை உறுதி செய்ய முடியும். நான் முன்பதிவைச் சமர்ப்பிக்கவோ மாற்றவோ முடியாது.';
 else if(feature)speech=feature.body;
 else if(kind==='media')speech='காணொளிகள் பக்கத்தில் எம்.வி.ஆர் காணொளிகளும் அதிகாரப்பூர்வ சமூக வலைத்தள இணைப்புகளும் உள்ளன. ஒரு நிமிடக் கதை, பட்டிமன்றம் அல்லது ஆதித்யா ஷோ பற்றியும் கேட்கலாம். காணொளிகள் பக்கத்தைத் திறக்கவா?';
 else if(kind==='trust')speech='அதிகாரப்பூர்வ அறக்கட்டளையின் பெயர் Ethal Arakattalai Trust. வெளியிடப்பட்ட விவரங்களுக்கு அறக்கட்டளைப் பக்கத்தைப் பார்க்கவும்.';
 else if(kind==='programmes')speech=knowledge.filter(k=>k.href==='/programmes.html').map(k=>excerpt(k.body)).find(Boolean)||'நிகழ்ச்சிகள் பக்கத்தில் தற்போது வெளியிடப்பட்ட விவரங்களைப் பார்க்கலாம். கூடுதல் விவரங்களுக்கு எம்.வி.ஆர் குழுவைத் தொடர்புகொள்ளவும். நிகழ்ச்சிகள் பக்கத்தைத் திறக்கவா?';
 else if(/\b(?:website|home)\b|இணையதளம்|முகப்பு/i.test(message))speech='இந்த இணையதளத்தில் எம்.வி.ஆர் அவர்களைப் பற்றி அறியலாம், நிகழ்ச்சிகளையும் காணொளிகளையும் பார்க்கலாம். முன்பதிவுக் கோரிக்கைக்கு முன் வெளியிடப்பட்ட தேதிகளையும் சரிபார்க்கலாம். எதைப் பற்றி அறிய விரும்புகிறீர்கள்?';
 else if(kind==='biography'||/\b(?:mvr|ramakrishnan|madurai)\b|எம்\.?\s*வி\.?\s*ஆர்|ராமகிருஷ்ணன்|ராமகிருஷ்ணன|மதுரை/i.test(message))speech='மதுரை வி. ராமகிருஷ்ணன், எம்.வி.ஆர், தன்னம்பிக்கைப் பேச்சாளர், கல்வியாளர், வழிகாட்டி, வாழ்க்கை ஆலோசகர், எழுத்தாளர் மற்றும் தமிழ் ஆய்வாளர். தமிழ்நாடு, சிங்கப்பூர், மலேசியா ஆகிய இடங்களில் நிகழ்ச்சிகள் நடத்துகிறார். இந்த இடங்கள் தற்போதைய தேதி கிடைப்பதற்கான உறுதி அல்ல.';
 else if(/^(?:hello|hi|hey|வணக்கம்|ஹாய்)/i.test(message))speech='வணக்கம்! எம்.வி.ஆர், நிகழ்ச்சிகள், காணொளிகள் அல்லது நிகழ்ச்சிக்கான தேதிகள் பற்றி என்ன அறிய விரும்புகிறீர்கள்?';
 else if(/\b(?:contact|phone|email)\b|தொடர்பு/i.test(message))speech='தொடர்புப் பக்கத்தில் எம்.வி.ஆர் குழுவின் வெளியிடப்பட்ட தொடர்பு விவரங்கள் உள்ளன. தனிப்பட்ட நிகழ்ச்சி விவரங்களுக்குப் பாதுகாப்பான முன்பதிவுப் படிவத்தைப் பயன்படுத்தவும்.';
 return {speech:tamilSpeech(speech)||voiceErrors.unknown,action:null,mode:'website'};
}


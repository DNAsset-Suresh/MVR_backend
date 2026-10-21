import {Document,Packer,Paragraph,TextRun,HeadingLevel,Footer,PageNumber} from 'docx';
const text=v=>Array.isArray(v)?v.join(', '):v===true?'Yes':v===false?'No':String(v??'');
const stamp=v=>v?new Date(v).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})+' IST':'—';
export const enquirySlot=b=>b.second_slot_id?'Full Day':b.half==='FIRST_HALF'?'First Half':'Second Half';
export function enquirySections(b){
 const rows=keys=>keys.map(([key,label])=>[label,text(b[key])||'—']);
 return [
  ['Booking summary',[['Reference',b.reference],['Status',b.status.replaceAll('_',' ')],['Date',b.date],['Slot',enquirySlot(b)],['Alternative',b.alternative_date?`${b.alternative_date} · ${b.alternative_half==='FIRST_HALF'?'First Half':'Second Half'}`:'None'],['Submitted',stamp(b.created_at)],['Last updated',stamp(b.updated_at)]]],
  ['Contact and organisation',rows([['full_name','Contact person'],['organisation','Organisation'],['organisation_type','Organisation type'],['email','Email address'],['phone','Mobile number'],['whatsapp','WhatsApp number'],['alternate_phone','Alternate contact number'],['alternate_is_whatsapp','Alternate is WhatsApp'],['city','City']])],
  ['Event details',rows([['event_type','Event type'],['custom_event_type','Custom event type'],['topics','Topics'],['custom_topic','Custom topic'],['venue','Venue'],['expected_audience','Expected audience'],['custom_audience','Custom audience'],['participant_range','Participant range'],['participants','Participants'],['audience_type','Audience'],['event_format','Event format'],['mode','Mode'],['preferred_language','Preferred language'],['custom_language','Custom language'],['language','Language'],['session_duration','Session duration'],['description','Description'],['special_requirements','Special requirements'],['additional_information','Additional information']])],
  ['Internal notes',[['Private notes',b.internal_notes||'None']]],
  ['Status history',(b.history||[]).map(h=>[`${stamp(h.created_at)} · ${h.status.replaceAll('_',' ')}`,h.message||'—'])]
 ];
}
export async function enquiryDocx(b){
 const children=[new Paragraph({text:'MVR Booking Enquiry',heading:HeadingLevel.TITLE}),new Paragraph({text:'Administrative record of the enquiry, contact details and status history. This document includes private internal notes.'})];
 for(const [heading,rows] of enquirySections(b)){
  children.push(new Paragraph({text:heading,heading:HeadingLevel.HEADING_1}));
  for(const [label,value] of rows)children.push(new Paragraph({spacing:{after:100},children:[new TextRun({text:label+': ',bold:true}),...String(value).split('\n').map((line,i)=>new TextRun({text:line,...(i?{break:1}:{})}))]}));
 }
 const doc=new Document({creator:'MVR',title:'MVR Booking Enquiry',description:b.reference,styles:{default:{document:{run:{font:'Arial',size:21,color:'000000'},paragraph:{spacing:{after:140,line:276}}},title:{run:{font:'Arial',size:38,color:'000000',bold:true},paragraph:{spacing:{after:220}}},heading1:{run:{font:'Arial',size:27,bold:true,color:'000000'},paragraph:{spacing:{before:260,after:140},keepNext:true}}}},sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:1000,bottom:1000,left:1134,right:1134}}},footers:{default:new Footer({children:[new Paragraph({children:[new TextRun({text:b.reference+' · Internal use · Page ',size:18}),new TextRun({children:[PageNumber.CURRENT],size:18})]})]})},children}]});
 return Packer.toBuffer(doc);
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function enquiryPrint(b){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(b.reference)} Booking Enquiry</title><link rel="stylesheet" href="/css/print.css"><script src="/js/print.js" defer></script></head><body><nav><button id="print-button">Print enquiry</button><a href="/api/admin/bookings/${b.id}/export.docx">Export to Word (.docx)</a></nav><main><h1>MVR Booking Enquiry</h1><p>Administrative record of the enquiry, contact details and status history. Includes private internal notes.</p>${enquirySections(b).map(([heading,rows])=>`<section><h2>${esc(heading)}</h2><dl>${rows.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></section>`).join('')}</main></body></html>`;}


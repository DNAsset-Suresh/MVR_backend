import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import {tamilSpeech} from '../../frontend/js/jarvis-voice-commands.js';

export const speechLimits=Object.freeze({sampleRate:16000,seconds:20,bytes:640044,text:900});
const voices=new Set(['ta-IN-ValluvarNeural','ta-IN-PallaviNeural']);
export function azureSettings(){
 const key=process.env.AZURE_SPEECH_KEY?.trim(),region=process.env.AZURE_SPEECH_REGION?.trim(),voice=process.env.AZURE_SPEECH_VOICE?.trim()||'ta-IN-ValluvarNeural';
 return key&&/^[a-z][a-z0-9]{1,30}$/.test(region||'')&&voices.has(voice)?{key,region,voice}:null;
}
export const azureSpeechConfigured=()=>!!azureSettings();

// Accept only the canonical bounded PCM WAV produced by our microphone adapter.
// Check actual bytes, never a browser-supplied duration or filename.
export function validatePcmWav(wav){
 if(!Buffer.isBuffer(wav)||wav.length<8044||wav.length>speechLimits.bytes||
  wav.toString('ascii',0,4)!=='RIFF'||wav.readUInt32LE(4)!==wav.length-8||wav.toString('ascii',8,12)!=='WAVE'||
  wav.toString('ascii',12,16)!=='fmt '||wav.readUInt32LE(16)!==16||wav.readUInt16LE(20)!==1||wav.readUInt16LE(22)!==1||
  wav.readUInt32LE(24)!==16000||wav.readUInt32LE(28)!==32000||wav.readUInt16LE(32)!==2||wav.readUInt16LE(34)!==16||
  wav.toString('ascii',36,40)!=='data'||wav.readUInt32LE(40)!==wav.length-44||(wav.length-44)%2)throw new Error('INVALID_PCM_WAV');
 return wav.subarray(44);
}
function config(client){
 const settings=azureSettings();if(!settings)throw new Error('AZURE_SPEECH_NOT_CONFIGURED');
 const value=client.SpeechConfig.fromSubscription(settings.key,settings.region);
 value.speechRecognitionLanguage='ta-IN';value.speechSynthesisLanguage='ta-IN';value.speechSynthesisVoiceName=settings.voice;
 value.speechSynthesisOutputFormat=client.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
 client.Recognizer.enableTelemetry(false);
 return value;
}
function operation({signal,create,run,timeoutMs=25000}){
 return new Promise((resolve,reject)=>{
  let resource,done=false;
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);try{resource?.close();}catch{/* Already closed. */}error?reject(error):resolve(value);};
  const abort=()=>finish(new Error('SPEECH_ABORTED'));
  const timer=setTimeout(()=>finish(new Error('SPEECH_TIMEOUT')),timeoutMs);
  if(signal?.aborted){abort();return;}
  signal?.addEventListener('abort',abort,{once:true});
  try{resource=create();run(resource,value=>finish(null,value),()=>finish(new Error('SPEECH_SERVICE_UNAVAILABLE')));}catch{finish(new Error('SPEECH_SERVICE_UNAVAILABLE'));}
 });
}
export async function synthesizeTamil(text,{signal,client=sdk}={}){
 if(!tamilSpeech(text))throw new Error('INVALID_TAMIL_SPEECH');
 const settings=config(client);
 const result=await operation({signal,create:()=>new client.SpeechSynthesizer(settings,null),run:(s,ok,fail)=>s.speakTextAsync(text,ok,fail)});
 if(result.reason!==client.ResultReason.SynthesizingAudioCompleted||!result.audioData?.byteLength||result.audioData.byteLength>2*1024*1024)throw new Error('TAMIL_SPEECH_UNAVAILABLE');
 return Buffer.from(result.audioData);
}
export async function recognizeTamil(wav,{signal,client=sdk}={}){
 const pcm=validatePcmWav(wav),settings=config(client);
 const input=client.AudioInputStream.createPushStream(client.AudioStreamFormat.getWaveFormatPCM(16000,16,1));
 const audio=client.AudioConfig.fromStreamInput(input);
 const bytes=Uint8Array.from(pcm);
 try{
  const result=await operation({signal,create:()=>new client.SpeechRecognizer(settings,audio),run:(r,ok,fail)=>{
   r.recognizeOnceAsync(ok,fail);input.write(bytes.buffer);input.close();
  }});
  if(result.reason===client.ResultReason.NoMatch)return '';
  if(result.reason!==client.ResultReason.RecognizedSpeech)throw new Error('TAMIL_RECOGNITION_UNAVAILABLE');
  return String(result.text||'').normalize('NFC').trim().slice(0,1000);
 }finally{bytes.fill(0);try{input.close();audio.close();}catch{/* SDK may already have released the input. */}}
}

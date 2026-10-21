import {test} from 'node:test';
import assert from 'node:assert/strict';
import {azureSettings,azureSpeechConfigured,validatePcmWav,synthesizeTamil,recognizeTamil} from '../backend/services/azure-speech.js';
import {pcmWav,captureTamilCommand} from '../frontend/js/jarvis-pcm-capture.js';
import {createVoiceAudio,chooseTamilVoice} from '../frontend/js/jarvis-voice-audio.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const wav=()=>Buffer.from(pcmWav([new Float32Array(16000).fill(.05)],16000));
async function configured(fn){const previous={...process.env};process.env.AZURE_SPEECH_KEY='test-key-not-real';process.env.AZURE_SPEECH_REGION='centralindia';process.env.AZURE_SPEECH_VOICE='ta-IN-ValluvarNeural';try{await fn();}finally{for(const key of ['AZURE_SPEECH_KEY','AZURE_SPEECH_REGION','AZURE_SPEECH_VOICE']){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}}
function fakeSdk({pending=false}={}){
 const calls={closed:0,audioClosed:0,configs:[],writes:[]};let callback;
 const client={SpeechConfig:{fromSubscription:(key,region)=>{assert.equal(key,'test-key-not-real');assert.equal(region,'centralindia');const config={};calls.configs.push(config);return config;}},SpeechSynthesisOutputFormat:{Audio16Khz32KBitRateMonoMp3:3},Recognizer:{enableTelemetry:value=>assert.equal(value,false)},ResultReason:{SynthesizingAudioCompleted:1,RecognizedSpeech:2,NoMatch:3},
  SpeechSynthesizer:class{constructor(config,audio){assert.equal(audio,null);}speakTextAsync(text,ok){calls.text=text;callback=ok;if(!pending)queueMicrotask(()=>ok({reason:1,audioData:Uint8Array.from([73,68,51]).buffer}));}close(){calls.closed++;}},
  AudioStreamFormat:{getWaveFormatPCM:(...args)=>{assert.deepEqual(args,[16000,16,1]);return 'pcm';}},AudioInputStream:{createPushStream:format=>{assert.equal(format,'pcm');return {write:bytes=>calls.writes.push(bytes),close(){}};}},AudioConfig:{fromStreamInput:()=>({close(){calls.audioClosed++;}})},
  SpeechRecognizer:class{recognizeOnceAsync(ok){callback=ok;if(!pending)queueMicrotask(()=>ok({reason:2,text:'காணொளிகள் பக்கத்தைத் திற'}));}close(){calls.closed++;}}
 };
 return {client,calls,finish:value=>callback(value)};
}
test('Azure configuration allowlists Tamil voices and never permits a regional endpoint injection',()=>configured(async()=>{
 assert.equal(azureSpeechConfigured(),true);assert.equal(azureSettings().voice,'ta-IN-ValluvarNeural');process.env.AZURE_SPEECH_VOICE='ta-IN-PallaviNeural';assert.equal(azureSpeechConfigured(),true);
 process.env.AZURE_SPEECH_VOICE='en-US-David';assert.equal(azureSpeechConfigured(),false);process.env.AZURE_SPEECH_VOICE='ta-IN-ValluvarNeural';process.env.AZURE_SPEECH_REGION='https://other.example';assert.equal(azureSpeechConfigured(),false);
}));
test('Azure SDK synthesis selects a genuine Tamil neural voice and returns bounded MP3 without English fallback',()=>configured(async()=>{
 const {client,calls}=fakeSdk();assert.equal((await synthesizeTamil('வணக்கம்.',{client})).toString(),'ID3');assert.equal(calls.configs[0].speechSynthesisVoiceName,'ta-IN-ValluvarNeural');assert.equal(calls.configs[0].speechSynthesisOutputFormat,3);assert.equal(calls.closed,1);
 await assert.rejects(synthesizeTamil('Hello',{client}),/INVALID_TAMIL/);assert.equal(chooseTamilVoice([{name:'David',lang:'en-US'}]),null);
 const pending=fakeSdk({pending:true}),controller=new AbortController();const work=synthesizeTamil('வணக்கம்.',{client:pending.client,signal:controller.signal});controller.abort();await assert.rejects(work,/ABORTED/);assert.equal(pending.calls.closed,1);pending.finish({reason:1,audioData:new ArrayBuffer(8)});
}));
test('Azure recognition uses 16 kHz PCM and ta-IN, clears the SDK audio copy, and closes on cancellation',()=>configured(async()=>{
 const {client,calls}=fakeSdk();assert.equal(await recognizeTamil(wav(),{client}),'காணொளிகள் பக்கத்தைத் திற');assert.equal(calls.configs[0].speechRecognitionLanguage,'ta-IN');assert.equal(calls.writes[0].byteLength,32000);assert.ok(new Uint8Array(calls.writes[0]).every(v=>v===0));assert.equal(calls.closed,1);assert.equal(calls.audioClosed,1);
 const pending=fakeSdk({pending:true}),controller=new AbortController();const work=recognizeTamil(wav(),{client:pending.client,signal:controller.signal});controller.abort();await assert.rejects(work,/ABORTED/);assert.equal(pending.calls.closed,1);assert.equal(pending.calls.audioClosed,1);
}));
test('WAV validation checks actual sample rate, channel count, size and duration',()=>{
 assert.equal(validatePcmWav(wav()).length,32000);
 for(const mutate of [b=>b.writeUInt32LE(48000,24),b=>b.writeUInt16LE(2,22),b=>b.writeUInt32LE(1,40),b=>b.write('evil',0)]){const b=wav();mutate(b);assert.throws(()=>validatePcmWav(b),/INVALID_PCM/);}
 assert.throws(()=>validatePcmWav(Buffer.alloc(640046)),/INVALID_PCM/);assert.throws(()=>validatePcmWav(Buffer.alloc(20)),/INVALID_PCM/);
 const resampled=Buffer.from(pcmWav([new Float32Array(48000).fill(.5)],48000));assert.equal(validatePcmWav(resampled).length,32000);assert.ok(Math.abs(resampled.readInt16LE(44)-16383)<2);
 assert.throws(()=>pcmWav([new Float32Array(320001)],16000),/microphone/);
});
function captureEnvironment({late=false}={}){
 const state={released:0,closed:0};let permission;
 class Context{constructor(){state.context=this;this.sampleRate=16000;this.state='suspended';this.destination={};this.audioWorklet={addModule:async path=>assert.equal(path,'/js/jarvis-pcm-worklet.js')};}createMediaStreamSource(){return {connect(){},disconnect(){}};}async resume(){this.state='running';}async close(){this.state='closed';state.closed++;}}
 class Node{constructor(){state.node=this;this.port={onmessage:null,close(){}};}connect(){}disconnect(){}}
 const stream={getTracks:()=>[{stop(){state.released++;}}]};
 return {state,environment:{AudioContext:Context,AudioWorkletNode:Node,navigator:{mediaDevices:{getUserMedia:()=>late?new Promise(resolve=>{permission=resolve;}):Promise.resolve(stream)}}},grant:()=>permission(stream),samples:values=>state.node.port.onmessage?.({data:values})};
}
test('microphone capture releases tracks before sending audio, and silence never uploads a recording',async()=>{
 const e=captureEnvironment();let started=0,blob;captureTamilCommand({...e,environment:e.environment,onStart:()=>started++,onAudio:value=>{assert.equal(e.state.released,1);blob=value;},onError:assert.fail});await tick();assert.equal(started,1);
 e.samples(new Float32Array(16000).fill(.05));e.samples(new Float32Array(24000));assert.ok(blob);assert.equal(validatePcmWav(Buffer.from(await blob.arrayBuffer())).length,80000);assert.equal(e.state.closed,1);
 const silent=captureEnvironment();let reason;captureTamilCommand({environment:silent.environment,onStart(){},onAudio:assert.fail,onError:r=>reason=r});await tick();silent.samples(new Float32Array(128000));assert.equal(reason,'silence');assert.equal(silent.state.released,1);
});
test('late microphone grants are released after stop; permission denial does not start capture',async()=>{
 const e=captureEnvironment({late:true});const capture=captureTamilCommand({environment:e.environment,onStart:assert.fail,onAudio:assert.fail,onError:assert.fail});capture.cancel();e.grant();await tick();assert.equal(e.state.released,1);assert.equal(e.state.node,undefined);
 let reason;captureTamilCommand({environment:{navigator:{mediaDevices:{getUserMedia:async()=>{throw Object.assign(new Error(),{name:'NotAllowedError'});}}}},onStart:assert.fail,onAudio:assert.fail,onError:r=>reason=r});await tick();assert.equal(reason,'permission');
});
test('cloud recognition avoids browser recognition, and stop prevents a late transcript from starting an answer',async()=>{
 let handlers,resolveRecognition,cancelled=0;const environment={SpeechRecognition:class{constructor(){assert.fail('Browser recognizer must not run for Azure');}}};
 const driver=createVoiceAudio({environment,fetchSpeech:async()=>new Blob(),fetchRecognition:()=>new Promise(resolve=>{resolveRecognition=resolve;}),capture:options=>{handlers=options;options.onStart();return {cancel(){cancelled++;}};}});await driver.prepare({cloudAvailable:true});assert.equal(driver.getRecognitionSetup().provider,'azure');
 let starts=0,processing=0,final;driver.listen({onStart:()=>starts++,onProcessing:()=>processing++,onFinal:t=>final=t,onError:assert.fail});const pending=handlers.onAudio(new Blob());
 assert.equal(starts,1);assert.equal(processing,1);driver.stop();resolveRecognition('முகப்புப் பக்கத்தைத் திற');await pending;assert.equal(final,undefined);assert.equal(cancelled,1);
 driver.listen({onStart:()=>starts++,onProcessing(){},onFinal:t=>final=t,onError:assert.fail});const next=handlers.onAudio(new Blob());resolveRecognition('காணொளிகளை காட்டு');await next;assert.equal(final,'காணொளிகளை காட்டு');driver.stop();
});

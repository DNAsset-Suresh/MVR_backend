import {GoogleGenAI} from '@google/genai';
import {geminiConfigured,geminiModel,geminiReply,geminiFailure} from '../backend/services/assistant-gemini.js';
import {azureSpeechConfigured} from '../backend/services/azure-speech.js';
import {coreKnowledge} from '../backend/services/assistant-knowledge.js';

// Explicit opt-in for a single provider generation, which may consume paid quota.
console.log('Gemini key configured:',geminiConfigured());
console.log('Azure speech configured:',azureSpeechConfigured());
let model;try{model=geminiModel();console.log('Gemini model:',model);}catch{console.error('Invalid GEMINI_MODEL. Use a documented Gemini model ID.');process.exit(1);}
if(!process.argv.includes('--live'))console.log('No provider calls made. After reviewing costs, use npm run jarvis:check -- --live for one public Tamil test.');
else if(!geminiConfigured()){console.error('Set GEMINI_API_KEY privately in .env first.');process.exitCode=1;}
else{
 try{
  const client=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY,httpOptions:{timeout:15000,retryOptions:{attempts:1}}});
  const details=await client.models.get({model});
  if(details.supportedActions&&!details.supportedActions.includes('generateContent'))throw Object.assign(new Error('Unsupported model'),{status:400});
  const response=await geminiReply({message:'MVR பற்றி சுருக்கமாகச் சொல்லுங்கள்.',knowledge:coreKnowledge,signal:AbortSignal.timeout(20000),client,model});
  if(response.mode!=='ai')throw new Error('No validated AI answer');
  console.log('PASS: account model access and validated Tamil Gemini response. Audio and physical microphone still require a browser test.');
 }catch(error){console.error('Gemini live check failed:',geminiFailure(error),'- check the key, model, quota and network. Provider details were not logged.');process.exitCode=1;}
}

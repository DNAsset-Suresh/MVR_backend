import {token,digest,fail} from '../utils/security.js';
export const conversationTTL=30*60*1000;
// No transcripts on disk or in PostgreSQL. For multiple workers, use a shared TTL store.
export class AssistantMemory {
 constructor({now=Date.now,maxSessions=1000}={}){this.now=now;this.maxSessions=maxSessions;this.sessions=new Map();}
 prune(){for(const [key,s] of this.sessions)if(s.expires<=this.now())this.sessions.delete(key);}
 get(raw,owner){this.prune();const s=raw&&/^[a-f0-9]{64}$/.test(raw)?this.sessions.get(digest(raw)):null;return s?.owner===owner?s:null;}
 create(owner){this.prune();if(this.sessions.size>=this.maxSessions)fail(503,'The assistant is busy. Please use the normal website and try again later.');const raw=token();const s={key:digest(raw),owner,expires:this.now()+conversationTTL,history:[],busy:false};this.sessions.set(s.key,s);return {raw,session:s};}
 append(s,message,answer){if(this.sessions.get(s.key)!==s||s.expires<=this.now())return false;s.history.push({role:'user',content:message},{role:'assistant',content:answer});s.history=s.history.slice(-12);return true;}
 clear(raw,owner){const s=this.get(raw,owner);if(s){s.controller?.abort();this.sessions.delete(s.key);}}
}

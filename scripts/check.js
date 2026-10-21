import {readdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
async function files(directory){let out=[];for(const entry of await readdir(directory,{withFileTypes:true})){const p=path.join(directory,entry.name);out.push(...(entry.isDirectory()?await files(p):[p]));}return out;}
const source=[...await files('backend'),...await files('frontend/js'),...await files('scripts'),...await files('tests')];
for(const file of source.filter(f=>f.endsWith('.js'))){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8',windowsHide:true});if(result.status){console.error(result.stderr);process.exit(1);}}
const html=(await files('frontend')).filter(f=>f.endsWith('.html'));
for(const file of html){const text=await readFile(file,'utf8');if(!text.includes('lang="en"')||!text.includes('name="viewport"')||!text.includes('/js/main.js'))throw new Error(`Missing document setup: ${file}`);}
console.log(`Validated JavaScript syntax and ${html.length} HTML pages. Vanilla assets are served directly; no frontend bundler is required.`);

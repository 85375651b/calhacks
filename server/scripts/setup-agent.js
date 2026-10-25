import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';

const path=new URL('../.env',import.meta.url);
let content=await readFile(path,'utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error;});
for(const key of ['AGENT_SEED','AGENT_BRIDGE_TOKEN']) {
  const pattern=new RegExp('^'+key+'=(.*)$','m'),existing=content.match(pattern)?.[1];
  if(!existing || existing.startsWith('replace_')) {
    const entry=key+'='+randomBytes(32).toString('hex');
    content=pattern.test(content)?content.replace(pattern,entry):content.trimEnd()+'\n'+entry+'\n';
  }
}
for(const [key,value] of Object.entries({ASI1_API_KEY:'',ASI1_MODEL:'asi1',AGENT_BACKEND_URL:'http://127.0.0.1:3001',AGENT_PORT:'8001'})) {
  if(!new RegExp('^'+key+'=','m').test(content))content=content.trimEnd()+'\n'+key+'='+value+'\n';
}
await writeFile(path,content,{mode:0o600});
console.log('Agent settings prepared in server/.env. Add your developer key to ASI1_API_KEY; private values were not printed.');

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApp } from '../app.js';
import { createParseService } from '../search/parse.js';
import { createPlaceResolver } from '../search/places.js';
import { parseRules, partialCriteria } from '../search/nlParser.js';
test('HTTP parse validates length, returns clarifications, caches, limits each client, falls back on timeout',async()=> {
 let calls=0;
 const app=createApp(async()=>({}), {parse:createParseService({fixtureMode:()=>false,extract:async()=>{calls++; throw Error('timeout');}}),resolve:createPlaceResolver({fixtureMode:()=>true})});
 const server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
 const url=`http://127.0.0.1:${server.address().port}/api/search`;
 const post=(body,id='a',path='/parse')=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json','X-Client-Id':id},body:JSON.stringify(body)});
 try {
  assert.equal((await post({text:'x'.repeat(501)})).status,400);
  assert.equal((await post({text:''})).status,400);
  for(let i=0;i<20;i++) {const r=await post({text:'2 beds in Portland'});assert.equal(r.status,200);const p=await r.json();assert.equal(p.parser,'rules');assert.equal(p.questions[0].options.length,2);}
  assert.equal(calls,0); const capped=await post({text:'2 beds in Portland'});assert.equal(capped.status,429);assert.equal(capped.headers.get('Retry-After'),'60');
  const p=await (await post({text:'2 beds in Portland'},'b')).json();
  const resolved=await (await post({parsed:p,field:'location',choice:p.questions[0].options[0]},'b','/resolve')).json();assert.equal(resolved.criteria.location,'Portland, OR');assert.equal(resolved.questions.length,0);
  const flags=await (await fetch(url+'/config')).json();assert.deepEqual(Object.keys(flags),['openaiConfigured']);
 } finally {await new Promise(r=>server.close(r));}
});
test('five parser fixtures stay deterministic; unknown fields cannot reach search actors',async()=> {
 const fixtures=JSON.parse(await readFile(new URL('../fixtures/nl-search.json',import.meta.url),'utf8'));
 assert.equal(fixtures.length,5);for(const f of fixtures)assert.deepEqual(parseRules(f.text),f.parsed);
 assert.throws(()=>partialCriteria({location:'Austin',actorInput:{maxItems:999}}),/unknown/);
 assert.equal(parseRules('no pool in Austin').criteria.pool,undefined);
 assert.ok(parseRules('no pool in Austin').notApplied.length);
});

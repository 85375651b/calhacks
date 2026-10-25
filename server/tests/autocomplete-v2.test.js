import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAutocompleteProvider,normalizeProviderResults} from '../providers/autocomplete.js';
import {createDailyBudget} from '../providers/daily-budget.js';
const building={country_code:'us',housenumber:'123',street:'North Main Street',city:'Austin',state_code:'TX',postcode:'78701',lat:30,lng:-97,lon:-97,result_type:'building',rank:{confidence:.9,match_type:'full_match'}};
const geo={results:[building]};
const photon={features:[{properties:{countrycode:'US',housenumber:'123',street:'North Main Street',city:'Austin',state:'Texas',postcode:'78701'},geometry:{coordinates:[-97,30]}}]};
test('complete US building results, threshold, units, ranking and dedupe',()=>{
 const rows=normalizeProviderResults({results:[{...building,housenumber:'124'},building,building,{...building,postcode:''},{...building,rank:{confidence:.59}},{...building,country_code:'ca'}]},'geoapify','123 N Main St Apt 3');
 assert.equal(rows.length,1);assert.equal(rows[0].line1,'123 North Main Street Apt 3');assert.equal(rows[0].confidence,.9);
 assert.equal(normalizeProviderResults(geo,'geoapify','Main').length,0);
 assert.equal(normalizeProviderResults({results:[{...building,housenumber:undefined,result_type:'street'}]},'geoapify','Main').length,1);
 assert.equal(normalizeProviderResults(photon,'photon','123 N Main').length,1);
});
test('Geoapify bias, cache, sale badges and missing key/error/cap Photon fallback',async()=>{
 let n=0;
 const provider=createAutocompleteProvider({fixtureMode:false,apiKey:'test',claim:async()=>true,knownSale:async()=>[{}],fetchImpl:async u=>{n++;assert.equal(u.searchParams.get('filter'),'countrycode:us');assert.equal(u.searchParams.get('bias'),'proximity:-97,30');return {ok:true,json:async()=>geo};}});
 assert.equal((await provider('123 N Main',{lat:30,lng:-97}))[0].forSale,true);
 await provider('123 North Main',{lat:30,lng:-97});assert.equal(n,1);
 for(const scenario of ['missing','error','cap']){
  const calls=[];const p=createAutocompleteProvider({fixtureMode:false,apiKey:scenario==='missing'?'':'test',claim:async()=>scenario!=='cap',knownSale:async()=>[],fetchImpl:async u=>{calls.push(u.hostname);if(u.hostname.includes('geoapify'))throw Error();return {ok:true,json:async()=>photon};}});
  assert.equal((await p('123 N Main'))[0].provider,'photon');assert.equal(calls.length,scenario==='error'?2:1);
 }
});
test('daily cap is persisted, serializes concurrent claims and resets UTC day',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'address-budget-'));t.after(()=>rm(dir,{recursive:true,force:true}));let now=0;
 const claim=createDailyBudget(join(dir,'budget.json'),{now:()=>now,max:()=>2});assert.deepEqual(await Promise.all([claim(),claim(),claim()]),[true,true,false]);
 assert.equal(await createDailyBudget(join(dir,'budget.json'),{now:()=>now,max:()=>2})(),false);now=86400000;assert.equal(await claim(),true);
});

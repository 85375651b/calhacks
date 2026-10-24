import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaceResolver } from '../search/places.js';
import { parseRules } from '../search/nlParser.js';
import { filterRadius, haversineMiles } from '../search/spatial.js';
import { normalizeSuggestions } from '../providers/autocomplete.js';
const resolve=createPlaceResolver({fixtureMode:()=>true,provider:()=>{throw Error('network forbidden');}});
test('ambiguous places require choice, missing places require text, explicit addresses resolve',async()=> {
 const p=await resolve(parseRules('house in Portland')); assert.equal(p.questions.length,1); assert.equal(p.questions[0].options.length,2);
 const selected=await resolve(p,{field:'location',choice:p.questions[0].options[0]}); assert.equal(selected.criteria.location,'Portland, OR'); assert.equal(selected.questions.length,0);
 assert.equal((await resolve(parseRules('in Atlantis'))).questions.length,1);
 const c=await resolve(parseRules('in San Francisco under 30 min commute to work at 1 Market St, San Francisco'));
 assert.equal(c.questions.length,0); assert.equal(c.extras.commute.work.lat,37.7936); assert.ok(c.interpretation.some(i=>i.value.includes('1 Market St')));
 const missing=await resolve(parseRules('in Austin under 30 min commute to work'));
 assert.equal(missing.questions[0].field,'work');
 await assert.rejects(resolve(p,{field:'location',choice:{label:'wrong',lat:0,lng:0}}),/Invalid/);
});
test('Photon place mode accepts cities and landmarks without changing house-only autocomplete',()=> {
 const data={features:[{properties:{name:'Austin',state:'Texas',countrycode:'US'},geometry:{coordinates:[-97.7,30.2]}}]};
 assert.equal(normalizeSuggestions(data).length,0); assert.equal(normalizeSuggestions(data,true)[0].city,'Austin');
});
test('haversine and radius exclude missing coordinates and show distances',()=> {
 assert.equal(haversineMiles({lat:0,lng:0},{lat:0,lng:0}),0);
 assert.ok(Math.abs(haversineMiles({lat:0,lng:0},{lat:0,lng:1})-69.09)<.1);
 const result=filterRadius([{lat:0,lng:.01},{lat:0,lng:1},{lat:null,lng:null}],{center:{lat:0,lng:0},miles:5});
 assert.equal(result.listings.length,1); assert.equal(result.excluded,1); assert.equal(result.missingCoordinates,1); assert.equal(result.listings[0].distanceMiles,.7);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlaceResolver,generatePlaceCandidates} from '../search/places.js';
import {parseRules} from '../search/nlParser.js';
import {createPlacesProvider} from '../providers/autocomplete.js';
const resolve=createPlaceResolver({fixtureMode:()=>true,provider:()=>assert.fail('offline network')});
for(const [text,location]of [['4 bed los angeles','Los Angeles, CA'],['LA 3br 2ba','Los Angeles, CA'],['sf condo','San Francisco, CA'],['austin texas','Austin, TX'],['90210 2 bed','90210'],['downtown LA condo','Los Angeles, CA'],['Silver Lake condo','Los Angeles, CA'],['Philly condo','Philadelphia, PA'],['OC house','Orange County, CA']])test('place '+text,async()=>{const p=await resolve(parseRules(text));assert.equal(p.criteria.location,location);assert.ok(!p.questions.some(q=>q.field==='location'));assert.equal(p.unrecognized.length,0);});
for(const text of ['Portland','Springfield','Columbus','bay area','silicon valley','California','Austin or Seattle'])test('clarify '+text,async()=>{const p=await resolve(parseRules(text));assert.equal(p.criteria.location,'');const q=p.questions.find(q=>q.field==='location');assert.ok(q);assert.ok(q.options.length>1);});
for(const [text,location]of [['houses near UCLA','Los Angeles, CA'],['condo by Golden Gate Park','San Francisco, CA'],['house close to Stanford','Palo Alto, CA']])test('landmark '+text,async()=>{const p=await resolve(parseRules(text));assert.equal(p.criteria.location,location);assert.equal(p.extras.radius.miles,5);assert.ok(p.extras.radius.center.lat);assert.ok(p.assumptions.some(s=>s.includes('5 miles')));});
for(const text of ['los angelas 4 bed','san fransisco 3br','seatle condo'])test('visible city correction '+text,async()=>{const p=await resolve(parseRules(text));assert.ok(p.assumptions.some(s=>s.startsWith('Read')));assert.equal(p.questions.length,0);});
test('unknown runs remain visible, recognized city is usable, state never silently defaults',async()=>{
 const p=await resolve(parseRules('Austin purple rocket 3br'));assert.equal(p.criteria.location,'Austin, TX');assert.equal(p.unrecognized[0].text,'purple rocket');assert.equal(p.notApplied.length,0);
 const missing=await resolve(parseRules('4 bed under 1.5m'),undefined,{lastLocation:'Seattle',savedWork:{label:'Austin, TX',lat:30.2,lng:-97.7}});assert.equal(missing.criteria.location,'');assert.equal(missing.questions[0].options.length,2);
 const selected=await resolve(missing,{field:'location',choice:missing.questions[0].options[0]});assert.equal(selected.criteria.location,'Seattle, WA');assert.equal(selected.questions.length,0);
 assert.ok(generatePlaceCandidates({leftover:Array.from({length:5},(_,i)=>({text:'test'+i}))}).length<=3);
});
test('provider requests are bounded, US administrative types only, cached for 30 days',async()=>{
 let calls=0,clock=0;const provider=createPlacesProvider({cacheFile:false,apiKey:'test',claim:async()=>true,now:()=>clock,fetchImpl:async url=>{calls++;assert.equal(url.searchParams.get('filter'),'countrycode:us');assert.equal(url.searchParams.get('type'),'locality');return {ok:true,json:async()=>({results:[{city:'Example',state:'California',country_code:'us',result_type:'city',lat:34,lon:-118}]})};}});
 const a=await provider('example');assert.equal(a[0].city,'Example');clock=29*86400000;await provider('example');assert.equal(calls,1);clock=31*86400000;await provider('example');assert.equal(calls,2);
 let count=0;const unknown=createPlaceResolver({fixtureMode:()=>false,provider:async()=>{count++;return []}});await unknown(parseRules('mystery blarg 3bd wombat 2ba faraway'));assert.ok(count<=3);
});

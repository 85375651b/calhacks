import test from 'node:test';
import assert from 'node:assert/strict';
import {createAddressLookup} from '../search/address.js';
import {createCensusVerifier} from '../providers/census.js';
import {exactAddress,normalizeAddress,splitAddress} from '../../src/lib/search/address.js';
import {normalize} from '../search/listing.js';
const p={line1:'123 N Main St',city:'Austin',state:'TX',zip:'78701',lat:30,lng:-97,label:'123 N Main St, Austin, TX 78701'};
const raw=(address='123 North Main Street',status='Active')=>({address,city:'Austin',state:'TX',zipCode:'78701',status,price:500000});
const direct=async(k,fn)=>fn();
const options={fixtureMode:false,enabled:false,cache:direct,provider:async()=>[p],verify:async p=>({...p,verified:true}),recent:async()=>[],request:async()=>[]};
test('exact address matching preserves number, street, ZIP and requested unit',()=>{
 assert.equal(normalizeAddress(' 123 N. Main St. '),'123 north main street');
 assert.equal(splitAddress('12 Oak St Apt 3').unit,'3');
 assert.ok(exactAddress(p,raw()));assert.ok(!exactAddress(p,raw('124 Main St')));
 assert.ok(!exactAddress({...p,line1:p.line1+' #3'},raw(p.line1+' Unit 4')));
 assert.ok(exactAddress(p,raw(p.line1+' Apt 4')));
});
test('cache, RentCast and one Apify fallback return only exact active matches',async()=>{
 let calls=0;
 let lookup=createAddressLookup({...options,recent:async()=>[normalize(raw(),'RentCast',true)],request:async()=>{throw Error('must not call');}});
 assert.equal((await lookup({selected:p})).result,'for_sale');
 lookup=createAddressLookup({...options,request:async(path,address,params)=>{calls++;assert.equal(path,'/listings/sale');assert.equal(params.status,'Active');return [raw(),raw('124 Main St'),raw('123 N Main St','Pending')];}});
 let v=await lookup({text:'123 N Main St'});assert.equal(v.listings.length,1);assert.equal(calls,1);
 lookup=createAddressLookup({...options,enabled:true,runner:async(id,input)=>{calls++;assert.equal(input.listingStatus,'forSale');return [raw()];}});
 assert.equal((await lookup({selected:p})).result,'for_sale');assert.equal(calls,2);
});
test('negative, unknown, ambiguous and multi-unit states do not leak unavailable facts',async()=>{
 const lookup=createAddressLookup({...options,request:async()=>[raw('123 N Main St','Sold'),raw('124 N Main St')]});
 const v=await lookup({selected:p});assert.equal(v.result,'not_for_sale');assert.equal(v.listings,undefined);assert.equal(v.price,undefined);
 assert.equal((await createAddressLookup({...options,provider:async()=>[]})({text:'unknown'})).result,'not_found');
 const amb=await createAddressLookup({...options,provider:async()=>[p,{...p,city:'Dallas',zip:'75001'}]})({text:'123 N Main St'});assert.equal(amb.result,'ambiguous');assert.equal(amb.candidates.length,2);
 const units=await createAddressLookup({...options,request:async()=>[raw(p.line1+' Apt 1'),raw(p.line1+' Apt 2')]})({selected:p});assert.equal(units.listings.length,2);assert.match(units.message,/units/);
});
test('Census failure continues unverified; successful standardization is cached for seven days',async()=>{
 for(const fetchImpl of [async()=>{throw Error('timeout');},async()=>({ok:false})]) assert.equal((await createCensusVerifier({fetchImpl,cache:direct})(p)).verified,false);
 let ttl;
 const verify=createCensusVerifier({cache:async(k,fn,t)=>{const v=await fn();ttl=t(v);return v;},fetchImpl:async()=>({ok:true,json:async()=>({result:{addressMatches:[{matchedAddress:p.label,coordinates:{x:-97,y:30}}]}})})});
 assert.equal((await verify(p)).verified,true);assert.equal(ttl,7*86400000);
});
test('offline fixture states, input validation and client cap',async()=>{
 const lookup=createAddressLookup({...options,fixtureMode:true});
 assert.equal((await lookup({text:'5101 Trail West Dr'})).result,'for_sale');
 assert.equal((await lookup({text:'100 Pending St'})).result,'not_for_sale');
 assert.equal((await lookup({text:'200 Sold St'})).result,'not_for_sale');
 assert.equal((await lookup({text:'147 Midway Ln'})).result,'ambiguous');
 assert.equal((await lookup({text:'999 Unknown Street'})).result,'not_found');
 await assert.rejects(lookup({selected:{line1:'123'}}),/complete/);
 for(let i=0;i<14;i++)await lookup({text:'999 Unknown Street'});
 await assert.rejects(lookup({text:'999 Unknown Street'}),/Too many/);
});

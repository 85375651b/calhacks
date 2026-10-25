import {join} from 'node:path';
import {serverDirectory} from '../config.js';
import {persistentMemo} from '../storage/memo.js';
import {addressLabel,normalizeAddress} from '../../src/lib/search/address.js';
const memo=persistentMemo(join(serverDirectory,'.cache','census-address-v1.json'));
export function createCensusVerifier({fetchImpl=fetch,cache=memo}={}) {
  return async candidate=> {
    const label=addressLabel(candidate);
    if(!candidate.city||!candidate.state||!candidate.zip)return {...candidate,verified:false};
    const result=await cache(normalizeAddress(label),async()=>{
      try {
        const u=new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
        u.search=new URLSearchParams({address:label,benchmark:'Public_AR_Current',format:'json'});
        const r=await fetchImpl(u,{signal:AbortSignal.timeout(6000)});
        if(!r.ok)throw Error();
        const matches=(await r.json())?.result?.addressMatches||[];
        if(matches.length!==1)return {verified:false};
        const m=matches[0];
        return {verified:true,label:m.matchedAddress,standardized:m.matchedAddress,lat:m.coordinates.y,lng:m.coordinates.x};
      } catch {return {verified:false,verificationUnavailable:true};}
    },v=>v.verificationUnavailable?60000:7*86400000);
    return {...candidate,...result};
  };
}
export const verifyAddress=createCensusVerifier();

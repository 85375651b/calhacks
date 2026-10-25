import '../config.js';
import {createAutocompleteProvider} from '../providers/autocomplete.js';
import {createCensusVerifier} from '../providers/census.js';
const verifyAddress=createCensusVerifier({cache:async(k,fn)=>fn()});
const queries=process.argv.includes('--all')?['147 midway lane','1600 pennsylvania ave','350 5th ave','742 evergreen','12 oak st apt 3','100 n main','111 s grand ave los angeles ca','5101 trail west dr austin tx','400 broad st seattle wa']:[process.argv.slice(2).join(' ')||'147 midway lane'];
for(const query of queries){
 const result={query,providers:{}};
 for(const provider of ['geoapify','photon']){
  if(provider==='geoapify'&&(!process.env.GEOAPIFY_API_KEY||process.env.GEOAPIFY_API_KEY==='your_key_here')){result.providers[provider]={unavailable:'GEOAPIFY_API_KEY not configured'};continue;}
  const events=[];
  const lookup=createAutocompleteProvider({provider,fixtureMode:false,knownSale:async()=>[],fetchImpl:async(u,opts)=>{
   try{const r=await fetch(u,opts);events.push({host:u.hostname,status:r.status});return r;}catch{events.push({host:u.hostname,error:'Connection failed or timed out'});throw Error('Unavailable');}
  }});
  const suggestions=await lookup(query);
  result.providers[provider]={events,suggestions:await Promise.all(suggestions.map(p=>verifyAddress(p)))};
 }
 console.log(JSON.stringify(result));
}

import {join} from 'node:path';
import {config,serverDirectory} from '../config.js';
import {persistentMemo} from '../storage/memo.js';
import {runActor} from '../providers/actor.js';
import {resolveName,matchCatalog,catalog} from '../../src/lib/planner/catalog.js';
import {fetchPage,extractProduct,safeUrl,validateUrl} from './resolveUrl.js';
import {claudeDimensions,validateClaude} from './claude.js';
const memo=persistentMemo(join(serverDirectory,'.cache','furniture-resolve.json'));
export const sampleUrls={'https://example.com/sofa':catalog[1],'https://example.com/queen-bed':catalog[12],'https://example.com/desk':catalog[14]};
// Single HTTP page, no recursive links, no automatic redirects, no browser JS.
async function apifyPage(url){await validateUrl(url);const rows=await runActor('apify/cheerio-scraper',{startUrls:[{url}],maxPagesPerCrawl:1,maxResultsPerCrawl:1,pageLoadTimeoutSecs:10,proxyConfiguration:{useApifyProxy:true},maxConcurrency:1,maxRequestRetries:0,linkSelector:'',preNavigationHooks:'[async ({ request }, gotOptions) => { gotOptions.followRedirect = false; gotOptions.maxRedirects = 0; }]',pageFunction:'async function pageFunction(context) { return { html: context.$.html().slice(0, 2000000) }; }'},{limit:1,timeout:15000});return typeof rows[0]?.html==='string'?rows[0].html:null;}
export async function resolveFurniture(body){
  const query=typeof body?.query==='string'?body.query.trim():null,url=typeof body?.url==='string'?safeUrl(body.url).href:null;
  if((!query&&!url)||(query&&url)||query?.length>500)throw Object.assign(new Error('Enter a name (up to 500 characters) or one HTTPS URL.'),{code:'invalid_url'});
  if(config.useFixtures){if(url){const u=safeUrl(url);if(u.hostname==='localhost'||u.hostname.endsWith('.local')||u.hostname.match(/^[\d[\]:.]+$/))throw Object.assign(new Error('Local addresses are blocked.'),{code:'blocked'});const sample=sampleUrls[url];return {...(sample||resolveName(decodeURIComponent(u.pathname).replace(/[-/]/g,' '))),sourceUrl:url,estimated:true,notes:sample?'Sample product dimensions for offline demos. Verify actual dimensions.':'Fixture mode: live link reading is disabled. Typical sizes are prefilled.'};}return resolveName(query);}
  return memo({url,query:query?.toLowerCase()},async()=>{
    if(query){const base=resolveName(query);return matchCatalog(query)?base:(await claudeDimensions(query))||base;}
    let html;try{html=(await fetchPage(url)).html;}catch(e){if(e.unsafe||e.code==='invalid_url')throw e;if(process.env.ENABLE_FURNITURE_APIFY==='true'&&config.enableApify&&config.apifyToken){try{html=await apifyPage(url);}catch{}}if(!html){if(e.code==='timeout')throw e;const fallback=resolveName(decodeURIComponent(new URL(url).pathname).replace(/[-/]/g,' '));return {...fallback,sourceUrl:url,notes:'Product page could not be read. Enter and verify measurements manually.'};}}
    let result=extractProduct(html,url);if(result.source!=='json-ld'){const ai=await claudeDimensions(result.bundle);if(ai)result={...result,...ai};}
    const safe=validateClaude({...result,color:result.color||'#b48b65'});return {...result,...safe,source:result.source,estimated:result.estimated,bundle:undefined,notes:result.notes+(!process.env.ANTHROPIC_API_KEY?' No Anthropic key: using catalog and page heuristics.':'')};
  },7*86400000);
}
const limits=new Map();
export function allowResolve(id,now=Date.now()){for(const [key,value]of limits)if(value.until<=now)limits.delete(key);const entry=limits.get(id)||{count:0,until:now+60000};entry.count++;limits.set(id,entry);return entry.count<=10;}

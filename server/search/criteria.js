export const HOME_TYPES=['house','townhome','condo','multi-family','apartment','manufactured','land'];
export const SORTS=['relevance','newest','price-asc','price-desc','beds','baths','sqft','lot','price-per-sqft'];
export const NUMBERS={minPrice:[0,100000000],maxPrice:[0,100000000],minBeds:[0,20],minBaths:[0,20],minSqft:[0,1000000],maxSqft:[0,1000000],minLotSize:[0,1000000000],maxLotSize:[0,1000000000],minYearBuilt:[1700,2100],maxYearBuilt:[1700,2100],maxHoa:[0,100000],minParking:[0,10],daysOnMarket:[1,90]};
export const FLAGS=['exactBeds','noHoa','garage','newConstruction','priceReduced','openHouse','virtualTour','ac','pool','waterfront','fireplace'];
export const ENUMS={status:['sale','coming-soon','pending','sold'],stories:['any','single','multi'],basement:['any','has'],foreclosure:['include','exclude','only'],preForeclosure:['include','exclude','only'],auction:['include','exclude','only'],senior:['include','exclude','only']};
export const defaults={location:'',status:'sale',sources:['Zillow','Redfin'],homeTypes:[],views:[],limit:12};
export function siteUrl(value,site){if(!value)return null;try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||!(u.hostname===site+'.com'||u.hostname.endsWith('.'+site+'.com')))return null;return u.href;}catch{return null;}}
export function validateCriteria(input={}){if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid search criteria.');const c={...defaults};
for(const key of ['location','keywords']){if(input[key]!=null&&typeof input[key]!=='string')throw new Error('Invalid '+key);if(input[key]?.trim())c[key]=input[key].trim().slice(0,key==='location'?150:200);}
for(const [key,[min,max]] of Object.entries(NUMBERS)){if(input[key]==null||input[key]==='')continue;if(!['number','string'].includes(typeof input[key])||!Number.isFinite(Number(input[key])))throw new Error('Invalid '+key);c[key]=Math.min(max,Math.max(min,Number(input[key])));if(!['minBaths'].includes(key))c[key]=Math.round(c[key]);}
for(const key of FLAGS)if(input[key]===true)c[key]=true;
for(const [key,values] of Object.entries(ENUMS)){if(input[key]!=null&&!values.includes(input[key]))throw new Error('Invalid '+key);if(input[key]&&input[key]!=='any'&&input[key]!=='include')c[key]=input[key];}
for(const [key,allowed] of [['homeTypes',HOME_TYPES],['views',['water','mountain','park','city']],['sources',['Zillow','Redfin']]]){if(input[key]!==undefined){if(!Array.isArray(input[key])||input[key].some(v=>!allowed.includes(v)))throw new Error('Invalid '+key);c[key]=[...new Set(input[key])].sort();}}
if(!c.sources.length)throw new Error('Choose at least one source.');
if(input.searchUrl){if(typeof input.searchUrl!=='string'||input.searchUrl.length>8000)throw new Error('Invalid search URL.');c.searchUrl=siteUrl(input.searchUrl,'zillow')||siteUrl(input.searchUrl,'redfin');if(!c.searchUrl)throw new Error('Use an HTTPS Zillow or Redfin search URL.');}
if(!c.location&&!c.searchUrl)throw new Error('Enter a city, neighborhood or ZIP.');
if(input.limit!=null&&!Number.isFinite(Number(input.limit)))throw new Error('Invalid limit.');c.limit=Math.min(50,Math.max(1,Math.floor(Number(input.limit)||12)));
for(const [a,b] of [['minPrice','maxPrice'],['minSqft','maxSqft'],['minLotSize','maxLotSize'],['minYearBuilt','maxYearBuilt']])if(c[a]!=null&&c[b]!=null&&c[a]>c[b])throw new Error('Minimum cannot exceed maximum.');return c;}

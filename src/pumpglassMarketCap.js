import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';

export const PUMPGLASS_MARKET_CAP_VERSION='PUMPGLASS_CIRCULATING_CAP_EXACT_FUTURES_ID_V1_20261108';
export const PUMPGLASS_MARKET_CAP_RULE=Object.freeze({maxCapAgeMs:900000,identityTtlMs:21600000,maxRequestsPerMinute:4,timeoutMs:3000,backoffMs:900000,usesFdv:false});
const ROOT='https://api.coingecko.com/api/v3',finite=Number.isFinite;
const symbolOk=s=>typeof s==='string'&&/^[\p{L}\p{N}]{1,32}USDT$/u.test(s);
const idOk=s=>typeof s==='string'&&/^[\p{L}\p{N}][\p{L}\p{N}-]{0,100}$/u.test(s);
const fresh=(at,now,age)=>finite(at)&&at>0&&at<=now&&now-at<=age;
const positive=x=>typeof x==='number'&&finite(x)&&x>0;

export function validCirculatingMarketCap(c,symbol,now){
 return c?.version===PUMPGLASS_MARKET_CAP_VERSION&&c.status==='OK'&&c.symbol===symbol&&c.source==='CoinGecko'
  &&c.basis==='CIRCULATING_MARKET_CAP_USD'&&positive(c.marketCapUsd)&&c.marketCapUsd<=Number.MAX_SAFE_INTEGER
  &&positive(c.circulatingSupply)&&positive(c.providerPriceUsd)&&idOk(c.providerId)
  &&fresh(c.sourceAt,now,900000)&&fresh(c.fetchedAt,now,900000)&&c.sourceAt<=c.fetchedAt
  &&c.identity?.exchange==='binance_futures'&&c.identity.contractSymbol===symbol&&c.identity.coinId===c.providerId
  &&fresh(c.identity.verifiedAt,now,21600000)&&c.identity.verifiedAt<=c.fetchedAt;
}
export function futuresCoinIdentities(payload,at){
 if(payload?.name!=='Binance (Futures)'||!Array.isArray(payload.tickers))throw Error('CAP_IDENTITY_SOURCE_INVALID');
 const identities={};
 for(const t of payload.tickers){
  if(!symbolOk(t?.symbol)||t.target!=='USDT'||t.contract_type!=='perpetual'||t.expired_at!=null||!idOk(t.coin_id)
    ||!fresh(Number(t.last_traded)*1000,at,86400000))continue;
  let u;try{u=new URL(t.trade_url);}catch{continue;}
  if(u.protocol!=='https:'||!['binance.com','www.binance.com'].includes(u.hostname)||u.username||u.password)continue;
  let contract;try{contract=decodeURIComponent(u.pathname.split('/').at(-1));}catch{continue;}
  if(contract!==t.symbol||!u.pathname.includes('/futures/'))continue;
  const old=identities[t.symbol];
  if(old?.coinId&&old.coinId!==t.coin_id){identities[t.symbol]={conflict:true};continue;}
  if(!old?.conflict)identities[t.symbol]={exchange:'binance_futures',contractSymbol:t.symbol,coinId:t.coin_id,verifiedAt:at};
 }
 return identities;
}

// Optional public-data context for Discord only. Never uses the old symbol-only
// supply cache: equal tickers can belong to entirely different assets.
export class PumpglassMarketCapService{
 constructor({file=null,fetchImpl=fetch,now=Date.now}={}){
  Object.assign(this,{file,fetchImpl,now});this.state={version:PUMPGLASS_MARKET_CAP_VERSION,identitiesAt:0,identities:{},caps:{},retryUntil:0};
  this.requests=[];this.work=new Map();this.lastError=null;
 }
 async init(){return this.loading??=(async()=>{
  if(!this.file)return;
  try{const s=JSON.parse(await readFile(this.file,'utf8'));if(s.version!==PUMPGLASS_MARKET_CAP_VERSION||!s.identities||!s.caps||!finite(s.retryUntil))throw Error('SCHEMA');this.state=s;}
  catch(e){if(e.code!=='ENOENT')this.lastError='CAP_CACHE_INVALID';}
 })();}
 async save(){
  if(!this.file)return;
  this.saveQueue=(this.saveQueue??Promise.resolve()).catch(()=>{}).then(async()=>{
   await mkdir(dirname(this.file),{recursive:true});const tmp=this.file+'.tmp-'+process.pid;
   await writeFile(tmp,JSON.stringify(this.state));await rename(tmp,this.file);
  });
  try{await this.saveQueue;}catch{this.lastError='CAP_CACHE_WRITE_FAILED';}
 }
 async json(path,params={}){
  const now=this.now();this.requests=this.requests.filter(t=>now-t<60000);
  if(now<this.state.retryUntil)throw Error('CAP_PROVIDER_BACKOFF');
  if(this.requests.length>=4)throw Error('CAP_REQUEST_BUDGET');
  this.requests.push(now);const url=new URL(ROOT+path);for(const [k,v]of Object.entries(params))url.searchParams.set(k,v);
  const r=await this.fetchImpl(url.href,{redirect:'error',headers:{accept:'application/json'},signal:AbortSignal.timeout(3000)});
  if(!r.ok){if([403,418,429].includes(r.status)){this.state.retryUntil=this.now()+900000;await this.save();}throw Error('CAP_HTTP_'+r.status);}
  return r.json();
 }
 async warm(){
  await this.init();if(fresh(this.state.identitiesAt,this.now(),21600000))return;
  if(this.identityWork)return this.identityWork;
  this.identityWork=(async()=>{
   const data=await this.json('/derivatives/exchanges/binance_futures',{include_tickers:'all'}),at=this.now();
   const identities=futuresCoinIdentities(data,at);if(!Object.keys(identities).length)throw Error('CAP_IDENTITY_EMPTY');
   this.state.identities=identities;this.state.identitiesAt=at;this.lastError=null;await this.save();
  })().catch(e=>{this.lastError=/^CAP_[A-Z_0-9]+$/.test(e.message)?e.message:'CAP_IDENTITY_UNAVAILABLE';}).finally(()=>{this.identityWork=null;});
  return this.identityWork;
 }
 async get(symbol){
  await this.init();if(!symbolOk(symbol))return {status:'CAP_SYMBOL_INVALID',symbol};
  if(this.work.has(symbol))return this.work.get(symbol);
  const task=this.resolve(symbol).finally(()=>this.work.delete(symbol));this.work.set(symbol,task);return task;
 }
 async resolve(symbol){
  const missing=status=>({version:PUMPGLASS_MARKET_CAP_VERSION,symbol,status,knownAt:this.now(),source:'CoinGecko',basis:'CIRCULATING_MARKET_CAP_USD'});
  try{
   await this.warm();
   if(!fresh(this.state.identitiesAt,this.now(),21600000))return missing(this.lastError??'CAP_IDENTITY_UNAVAILABLE');
   const identity=this.state.identities[symbol];if(!identity)return missing('CAP_EXACT_CONTRACT_NOT_FOUND');if(identity.conflict)return missing('CAP_IDENTITY_AMBIGUOUS');
   const cached=this.state.caps[symbol];
   if(cached?.providerId===identity.coinId&&validCirculatingMarketCap(cached,symbol,this.now()))return structuredClone(cached);
   if(cached?.retryAt>this.now()&&cached.providerId===identity.coinId)return missing(cached.status);
   const data=await this.json('/coins/markets',{vs_currency:'usd',ids:identity.coinId,precision:'full'}),now=this.now();
   const matches=Array.isArray(data)?data.filter(x=>x.id===identity.coinId):[];
   if(matches.length!==1)throw Error('CAP_EXACT_ID_NOT_FOUND');
   const row=matches[0],cap={version:PUMPGLASS_MARKET_CAP_VERSION,symbol,status:'OK',source:'CoinGecko',basis:'CIRCULATING_MARKET_CAP_USD',
    providerId:identity.coinId,name:String(row.name??identity.coinId),providerSymbol:String(row.symbol??''),
    marketCapUsd:row.market_cap,circulatingSupply:row.circulating_supply,providerPriceUsd:row.current_price,
    sourceAt:Date.parse(row.last_updated),fetchedAt:now,identity:structuredClone(identity)};
   if(!validCirculatingMarketCap(cap,symbol,now))throw Error('CAP_MISSING_STALE_OR_INVALID');
   this.state.caps[symbol]=cap;this.lastError=null;await this.save();return structuredClone(cap);
  }catch(e){
   const status=/^CAP_[A-Z_0-9]+$/.test(e.message)?e.message:'CAP_PROVIDER_UNAVAILABLE';this.lastError=status;
   const identity=this.state.identities[symbol];if(identity?.coinId)this.state.caps[symbol]={status,providerId:identity.coinId,retryAt:this.now()+(status==='CAP_REQUEST_BUDGET'?60000:900000)};
   await this.save();return missing(status);
  }
 }
 snapshot(){return {version:PUMPGLASS_MARKET_CAP_VERSION,source:'CoinGecko',basis:'CIRCULATING_MARKET_CAP_USD',rule:PUMPGLASS_MARKET_CAP_RULE,
  identitiesAt:this.state.identitiesAt||null,contracts:Object.keys(this.state.identities).length,
  freshCaps:Object.entries(this.state.caps).filter(([s,c])=>validCirculatingMarketCap(c,s,this.now())).length,
  retryUntil:this.state.retryUntil,lastError:this.lastError,observeOnly:true,affectsOrders:false};}
}

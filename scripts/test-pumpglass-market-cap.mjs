import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {PumpglassMarketCapService,validCirculatingMarketCap,futuresCoinIdentities} from '../src/pumpglassMarketCap.js';
import {capFixture} from './fixtures-pumpglass-market-cap.mjs';
import {PumpglassWhaleSmartDominanceWatch} from '../src/pumpglassWhaleSmartDominance.js';
let now=1794147000000;
const ticker=(symbol,id)=>({symbol,base:symbol.slice(0,-4),target:'USDT',contract_type:'perpetual',coin_id:id,expired_at:null,last_traded:now/1000-60,trade_url:'https://www.binance.com/en/futures/'+encodeURIComponent(symbol)});
const source=(tickers=[ticker('4USDT','4-2'),ticker('BTCUSDT','bitcoin'),ticker('1000PEPEUSDT','pepe')])=>({name:'Binance (Futures)',tickers});
const market=id=>({id,symbol:id==='bitcoin'?'btc':id==='pepe'?'pepe':'4',name:id,current_price:.01,market_cap:10000000,circulating_supply:1000000000,last_updated:new Date(now-60000).toISOString()});
const root=await fs.mkdtemp(path.join(os.tmpdir(),'pumpglass-cap-'));
try{
 let requests=[];const fetchImpl=async(url,o)=>{requests.push(url);assert.equal(o.redirect,'error');const u=new URL(url);assert.equal(u.hostname,'api.coingecko.com');return {ok:true,json:async()=>u.pathname.includes('/derivatives/')?source():[market(u.searchParams.get('ids'))]};};
 const file=path.join(root,'cache.json'),s=new PumpglassMarketCapService({file,fetchImpl,now:()=>now});
 const c=await s.get('4USDT');assert.equal(c.status,'OK');assert.equal(c.providerId,'4-2');assert.equal(c.marketCapUsd,10000000);assert.ok(validCirculatingMarketCap(c,'4USDT',now));assert.equal(requests.length,2);
 await s.get('4USDT');assert.equal(requests.length,2);c.marketCapUsd=1;assert.equal((await s.get('4USDT')).marketCapUsd,10000000);
 const loaded=new PumpglassMarketCapService({file,now:()=>now,fetchImpl:async()=>{throw Error('cache should suffice');}});assert.equal((await loaded.get('4USDT')).status,'OK');
 const btc=await s.get('BTCUSDT');assert.equal(btc.providerId,'bitcoin','do not pick batcat/bridged BTC by symbol or largest cached row');
 const pepe=await s.get('1000PEPEUSDT');assert.equal(pepe.providerId,'pepe');assert.equal(pepe.marketCapUsd,10000000,'contract multiplier never scales global cap');
 const ids=futuresCoinIdentities(source([ticker('4USDT','4-2'),ticker('4USDT','different-coin')]),now);assert.equal(ids['4USDT'].conflict,true);
 for(const change of [{target:'USDC'},{contract_type:'futures'},{expired_at:now/1000},{last_traded:(now-86400001)/1000},{last_traded:(now+1000)/1000},{trade_url:'https://evil.test/en/futures/4USDT'}])
  assert.equal(futuresCoinIdentities(source([{...ticker('4USDT','4-2'),...change}]),now)['4USDT'],undefined);
 for(const change of [{market_cap:0,fully_diluted_valuation:100000000},{market_cap:null,fully_diluted_valuation:100000000},{circulating_supply:null},{last_updated:new Date(now-900001).toISOString()},{last_updated:new Date(now+1).toISOString()},{market_cap:'10000000'}]){
  const x=new PumpglassMarketCapService({now:()=>now,fetchImpl:async url=>({ok:true,json:async()=>url.includes('/derivatives/')?source():[{...market('4-2'),...change}]})});
  assert.equal((await x.get('4USDT')).status,'CAP_MISSING_STALE_OR_INVALID');
 }
 const wrong=new PumpglassMarketCapService({now:()=>now,fetchImpl:async url=>({ok:true,json:async()=>url.includes('/derivatives/')?source():[market('not-the-requested-id')]})});assert.equal((await wrong.get('4USDT')).status,'CAP_EXACT_ID_NOT_FOUND');
 let ambiguousCalls=0;const ambiguous=new PumpglassMarketCapService({now:()=>now,fetchImpl:async()=>{ambiguousCalls++;return {ok:true,json:async()=>source([ticker('4USDT','4-2'),ticker('4USDT','other-4')])};}});assert.equal((await ambiguous.get('4USDT')).status,'CAP_IDENTITY_AMBIGUOUS');assert.equal(ambiguousCalls,1);
 let rateCalls=0;const rateFile=path.join(root,'rate.json'),rate=new PumpglassMarketCapService({file:rateFile,now:()=>now,fetchImpl:async()=>{rateCalls++;return {ok:false,status:429};}});assert.equal((await rate.get('4USDT')).status,'CAP_HTTP_429');const reloaded=new PumpglassMarketCapService({file:rateFile,now:()=>now,fetchImpl:async()=>{rateCalls++;throw Error('must be paused');}});await reloaded.get('4USDT');assert.equal(rateCalls,1);
 assert.equal(validCirculatingMarketCap({...capFixture('4USDT',now),basis:'FULLY_DILUTED_VALUATION'},'4USDT',now),false);
 // Optional enrichment failure must not block the pre-existing dominance alert.
 const token={symbol:'4USDT',basis:'whales',price:.01,whale_count:100,scanned_at:now/1000-30,now:[{k:'Whales',v:20},{k:'Smart traders',v:20},{k:'Crowd',v:75}],long:{size_usd:100000},short:{size_usd:900000}};
 for(const mode of ['timeout','throw','missing']){
  let posts=0;const watcher=new PumpglassWhaleSmartDominanceWatch({file:path.join(root,mode+'.json'),getSymbols:()=>['4USDT'],webhookUrl:'https://discord.com/api/webhooks/123/mock',now:()=>now,maxCapWaitMs:15,
   loadMarketCap:()=>mode==='timeout'?new Promise(()=>{}):mode==='throw'?Promise.reject(Error('offline')):Promise.resolve({status:'CAP_EXACT_CONTRACT_NOT_FOUND'}),
   fetchImpl:async(url,o={})=>o.method==='POST'?(posts++,{ok:true,status:200,json:async()=>({id:'1',channel_id:'2',webhook_id:'123'})}):{ok:true,json:async()=>url.endsWith('/board')?{meta:{snapshot:now/1000,updated:now/1000},rows:[{s:'4USDT',basis:'whales',n:100,wl:20,sl:20,cr:75}]}:url.includes('/chart?')?{symbol:'4USDT',crowd:[[(now-30000-3600000)/1000,.70],[(now-30000)/1000,.75]]}:token}});
  await watcher.scan();assert.equal(posts,1);assert.equal(watcher.state.history[0].positionSize.tier,'UNKNOWN');assert.equal(watcher.state.history[0].positionSize.shortUsd,900000);
 }
 console.log('PASS exact Binance Futures coin_id, duplicate/URL/expired guards, contract multipliers, circulating cap only/noFDV, stale/future/missing caps, persistent cache and429 backoff, bounded optional lookup failure still sends original signal. Mock network only.');
}finally{await fs.rm(root,{recursive:true,force:true});}

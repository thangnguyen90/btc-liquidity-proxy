import assert from 'node:assert/strict';
import vm from 'node:vm';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {NewManualTakeProfitPolicy,resolveFrozenManualTakeProfit,validManualTakeProfitProof,NEW_MANUAL_TP_VERSION} from '../src/newManualTakeProfitPolicy.js';
import {NewBotTakeProfitLedger,NEW_BOT_TP_VERSION,resolveFrozenNewBotTakeProfit} from '../src/newBotTakeProfitPolicy.js';
import {resolveNonLiquidFlowV2TakeProfit,resolveManualSocketProtection} from '../src/shortTakeProfitPolicy.js';
const dir=await mkdtemp(join(tmpdir(),'manual-tp10-')),file=join(dir,'policy.json'),at=Date.now();
let clock=at;
try{
 const policy=new NewManualTakeProfitPolicy({file,now:()=>clock});
 assert.equal(policy.error,null);assert.equal(policy.snapshot().policy.activatedAt,at);
 const sources=['orders-manual','liquidity-zone-manual','liquid-flow-v2-manual','coin-level-observe-manual','binance-manual-socket','signal'];
 for(const source of sources)for(const side of ['BUY','SELL'])for(const leverage of [1,3,5,20,125]){
  const result=policy.preview({manual:true,symbol:'TESTUSDT',source,side,entryPrice:100,leverage,requestedTakeProfitPrice:999});
  assert.equal(result.roePct,10);assert.equal(result.version,NEW_MANUAL_TP_VERSION);
  assert.ok(Math.abs(Math.abs(result.takeProfitPrice/100-1)*leverage*100-10)<1e-8);
  const filled=resolveFrozenManualTakeProfit({proof:result.manualTakeProfitProof,symbol:'TESTUSDT',side,entryPrice:105,leverage});
  assert.ok(Math.abs(Math.abs(filled.takeProfitPrice/105-1)*leverage*100-10)<1e-8);
 }
 assert.equal(policy.preview({manual:false,symbol:'TESTUSDT',source:'rising-volume-sustained-1m',side:'BUY',entryPrice:100,leverage:3}),null);
 const input={manual:true,symbol:'TESTUSDT',source:'orders-manual',side:'BUY',entryPrice:100,leverage:3};
 assert.equal(policy.preview({...input,entryAt:at-1}),null,'old LIMIT is outside activation even if filled later');
 assert.equal(policy.preview({...input,entryAt:at+1001}),null);
 const proof=policy.preview(input).manualTakeProfitProof;
 for(const changed of [{side:'SELL'},{symbol:'OTHERUSDT'},{entryPrice:Infinity},{leverage:0}])
  assert.equal(resolveFrozenManualTakeProfit({proof,symbol:'TESTUSDT',side:'BUY',entryPrice:100,leverage:3,...changed}),null);
 assert.equal(validManualTakeProfitProof({...proof,createdAt:at-1}),false);
 const server=await readFile('src/server.js','utf8');
 const marker=server.indexOf('        const exactBotOpeningTpProof='),tail=server.indexOf('        const manualEma99Candidates',marker);
 assert.ok(marker>0&&tail>marker);
 for(const isBot of [false,true]){
  let previews=0;
  const value=vm.runInNewContext(server.slice(marker,tail)+'\nfixedManualTakeProfit',{
   symbol:'TESTUSDT',side:'BUY',manualEntry:100,manualLeverage:3,clientOrderId:'sample',
   protectionOpeningOrder:{clientOrderId:'sample',time:at},exactManualTpProof:null,BINANCE_MANUAL_SOCKET_SOURCE:'binance-manual-socket',
   newBotTakeProfitLedger:{clientProof:()=>isBot?{version:NEW_BOT_TP_VERSION}:null},resolveFrozenManualTakeProfit,
   newManualTakeProfitPolicy:{preview:args=>{previews++;return policy.preview(args);}}
  });
  assert.equal(previews,isBot?0:1);
  assert.equal(value?.roePct??null,isBot?null:10);
 }
 const manualLegacy=resolveManualSocketProtection({side:'SELL',entryPrice:100,leverage:5,ema99Candidates:[]});
 assert.equal(manualLegacy.roePct,30,'legacy helper for pre-activation orders remains unchanged');
 assert.equal(resolveNonLiquidFlowV2TakeProfit({side:'SELL',source:'legacy-generic-source',entryPrice:100,leverage:3,requestedTakeProfitPrice:96}).roePct,6);
 let calls=0;
 const client={placeFuturesOrder:async args=>{
  const p=args.params;
  if(args.entryControl?.manual===true&&!p.reduceOnly){
   const disk=JSON.parse(await readFile(file,'utf8'));
   assert.equal(disk.entries[p.newClientOrderId].status,'RESERVED');
   assert.equal(disk.entries[p.newClientOrderId].proof.roePct,10);
  }
  calls++;return {orderId:123,status:'FILLED',executedQty:'1'};
 }};
 const bot=new NewBotTakeProfitLedger({file:join(dir,'bot.json'),now:()=>clock,
  readPolicy:()=>({version:NEW_BOT_TP_VERSION,scope:'NEW_BOT_ORDERS_ONLY',roePct:5,activatedAt:new Date(at-1000).toISOString()})});
 bot.install(client);policy.install(client);
 const args={params:{symbol:'TESTUSDT',side:'BUY',type:'MARKET',newClientOrderId:'manual-one'},
  entryControl:{manual:true,payload:{source:'orders-manual',dryRun:false},manualTakeProfitProof:proof}};
 await client.placeFuturesOrder(args);assert.equal(calls,1);
 assert.ok(policy.clientProof('TESTUSDT','manual-one',{symbol:'TESTUSDT',side:'BUY',clientOrderId:'manual-one',orderId:123,time:at+1}));
 for(const patch of [{symbol:'WRONGUSDT'},{side:'SELL'},{orderId:999},{time:at-2000},{clientOrderId:'wrong'}]){
  assert.equal(policy.clientProof('TESTUSDT','manual-one',{symbol:'TESTUSDT',side:'BUY',clientOrderId:'manual-one',orderId:123,time:at+1,...patch}),null);
 }
 assert.equal(bot.clientProof('TESTUSDT','manual-one'),null);
 await assert.rejects(client.placeFuturesOrder(args),/ALREADY_RESERVED/);assert.equal(calls,1);
 await assert.rejects(client.placeFuturesOrder({...args,params:{...args.params,newClientOrderId:'no-proof'},entryControl:{manual:true}}),/EXACT_PROOF/);
 await client.placeFuturesOrder({params:{symbol:'BOTUSDT',side:'SELL',type:'MARKET',newClientOrderId:'bot-one'},
  entryControl:{manual:false,payload:{source:'rising-volume-sustained-1m',dryRun:false}}});
 assert.equal(policy.clientProof('BOTUSDT','bot-one'),null);
 assert.equal(resolveFrozenNewBotTakeProfit({proof:bot.clientProof('BOTUSDT','bot-one'),side:'SELL',entryPrice:100,leverage:3}).roePct,5);
 await client.placeFuturesOrder({params:{symbol:'TESTUSDT',side:'SELL',type:'MARKET',reduceOnly:true},entryControl:{manual:true}});
 assert.equal(calls,3);
 for(const [name,startMark,endMark] of [
  ['pump','        const pumpManualTp=','        await binanceFilledSignalAudit.registerSubmission'],
  ['paper','  const paperManualTp=','  const executedQty = Number(orderResult.executedQty']
 ]){
  const a=server.indexOf(startMark),b=server.indexOf(endMark,a);assert.ok(a>0&&b>a);
  const id=name+'-manual-test',params={symbol:'TESTUSDT',side:'BUY',type:'MARKET',newClientOrderId:id};
  await vm.runInNewContext('(async()=>{'+server.slice(a,b)+'})()',{
   newManualTakeProfitPolicy:policy,token:'session',ordersTokens:new Set(['session']),symbol:'TESTUSDT',side:'BUY',
   useMarket:true,markPrice:100,entryStr:'95',leverage:3,orderParams:params,params,client,apiKey:'mock',apiSecret:'mock'
  });
  assert.equal(policy.clientProof('TESTUSDT',id).roePct,10,name+' direct manual entry must carry policy proof');
 }
 const pa=server.indexOf('          const pumpTpProof='),pb=server.indexOf('          const effectivePumpTp',pa);
 assert.ok(pa>0&&pb>pa);
 for(const [id,side,expected] of [['pump-manual-test','BUY',10],['bot-one','SELL',5]]){
  const value=vm.runInNewContext(server.slice(pa,pb)+'\npumpTakeProfit',{
   newBotTakeProfitLedger:bot,newManualTakeProfitPolicy:policy,resolveFrozenManualTakeProfit,resolveNonLiquidFlowV2TakeProfit,
   o:{symbol:id==='bot-one'?'BOTUSDT':'TESTUSDT',side,clientOrderId:id,leverage:3,tp:999},
   order:{symbol:id==='bot-one'?'BOTUSDT':'TESTUSDT',side,clientOrderId:id,orderId:123,time:at+1},
   avgPrice:101,process:{env:{}}
  });
  assert.equal(value.roePct,expected,'Pump pending recovery preserves exact manual/bot TP policies');
 }
 clock+=10000;
 const restored=new NewManualTakeProfitPolicy({file,now:()=>clock});
 assert.equal(restored.snapshot().policy.activatedAt,at);assert.deepEqual(restored.clientProof('TESTUSDT','manual-one'),proof);
 const uncertain=new NewManualTakeProfitPolicy({file:join(dir,'uncertain.json'),now:()=>clock});
 const uncertainProof=uncertain.preview(input).manualTakeProfitProof;
 const unknownClient={placeFuturesOrder:async()=>{throw Error('network timeout');}};
 uncertain.install(unknownClient);
 const uncertainArgs={params:{symbol:'TESTUSDT',side:'BUY',type:'MARKET',newClientOrderId:'unknown'},
  entryControl:{manual:true,manualTakeProfitProof:uncertainProof}};
 await assert.rejects(unknownClient.placeFuturesOrder(uncertainArgs),/network timeout/);
 assert.equal(new NewManualTakeProfitPolicy({file:join(dir,'uncertain.json'),now:()=>clock}).entries.unknown.status,'UNKNOWN_OR_REJECTED');
 await assert.rejects(unknownClient.placeFuturesOrder(uncertainArgs),/ALREADY_RESERVED/);
 const brokenFile=join(dir,'bad.json');await writeFile(brokenFile,'{bad');
 const broken=new NewManualTakeProfitPolicy({file:brokenFile,now:()=>clock});
 assert.equal(broken.error,'NEW_MANUAL_TP_POLICY_UNAVAILABLE');
 assert.equal(broken.preview({...input,manual:false}),null);
 assert.throws(()=>broken.preview(input),/UNAVAILABLE/);
 const diskFailure=new NewManualTakeProfitPolicy({file:join(dir,'disk.json'),now:()=>clock});
 const diskProof=diskFailure.preview(input).manualTakeProfitProof;
 let leaked=0;const noSend={placeFuturesOrder:async()=>{leaked++;return {};}};
 diskFailure.install(noSend);diskFailure.save=()=>{throw Error('disk full');};
 await assert.rejects(noSend.placeFuturesOrder({...args,entryControl:{manual:true,manualTakeProfitProof:diskProof}}),/disk full/);
 assert.equal(leaked,0);
}finally{await rm(dir,{recursive:true,force:true});}
console.log('PASS new manual TP10: all manual sources/sides/leverage, fill anchoring, activation/old LIMIT isolation, durable exact-order identity, restart/unknown/storage guards, reducing untouched and bot TP5 isolation. Mock only.');

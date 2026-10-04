import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { LiquidityZoneManager, captureLiquidityZones, ZONE_PUSH_TYPE } from '../src/liquidityZoneManager.js';
const T=1_800_000_000_000, B=300_000;let now=T;
const dir=await mkdtemp(join(tmpdir(),'liquidity-zone-test-'));
const analysis={symbol:'TESTUSDT',generatedAt:new Date(T).toISOString(),market:{markPrice:95},
  liqScan:{current:{dominantSide:'ABOVE',killZoneCluster:{mainKillZone:{low:100,high:105},farKillZone:{low:100,high:105}}}}};
const zones=captureLiquidityZones(analysis,now);
assert.equal(zones.length,1,'Identical MAIN/FAR must not double notify');
assert.equal(zones[0].initialState,'ACTIVE');
assert.throws(()=>captureLiquidityZones({...analysis,freshness:{stale:true}},now),/cũ/);
assert.equal(captureLiquidityZones({...analysis,market:{markPrice:110}},now)[0].consumedAtCapture,true);
let bars=[];const pushes=[];
const options={stateFile:join(dir,'upper.json'),now:()=>now,getRows:()=>bars,
  pushSender:async p=>{pushes.push(p);return {attempted:1,sent:1};}};
const candle=(i,open,high,low,close)=>({openTime:T+i*B,closeTime:T+(i+1)*B-1,open,high,low,close});
try{
  const tracker=new LiquidityZoneManager(options);
  await tracker.add('TESTUSDT',zones,true);
  const id=tracker.snapshot().watches[0].id;
  now+=1000;tracker.onMark({symbol:'TESTUSDT',markPrice:103,eventTime:now});await tracker.flush();
  assert.equal(pushes.length,1);assert.equal(tracker.snapshot().watches[0].status,'TOUCHING');
  now+=1000;tracker.onMark({symbol:'TESTUSDT',markPrice:108,eventTime:now});
  now+=1000;tracker.onMark({symbol:'TESTUSDT',markPrice:99,eventTime:now});await tracker.flush();
  assert.equal(pushes.length,2,'Cross and return within batch must still record passage');
  assert.equal(tracker.snapshot().watches[0].relation,'BELOW');
  assert.equal(tracker.snapshot().watches[0].status,'PRICE_PASSED');
  tracker.onMark({symbol:'TESTUSDT',markPrice:200,eventTime:now-1});await tracker.flush();
  assert.equal(tracker.snapshot().watches[0].markPrice,99,'Ignore out-of-order ticks');
  assert.equal(pushes.length,2);
  now=T+B+1000;bars=[candle(0,95,108,94,106)];await tracker.flush();
  assert.equal(tracker.snapshot().watches[0].status,'CLOSED_BEYOND');assert.equal(pushes.length,3);
  now=T+2*B+1000;bars.push(candle(1,106,107,96,98));await tracker.flush();
  assert.equal(tracker.snapshot().watches[0].status,'REJECTED_AFTER_SWEEP');assert.equal(pushes.length,4);
  const reloaded=new LiquidityZoneManager(options);await reloaded.initialize();await reloaded.flush();
  assert.equal(pushes.length,4,'Do not replay after restart');
  assert.equal(reloaded.snapshot().watches[0].seen.PRICE_PASSED,true);
  assert.equal(reloaded.snapshot().watches[0].socketFresh,false,'Stored price must not claim live socket');
  await reloaded.update(id,{enabled:false});
  now+=1000;reloaded.onMark({symbol:'TESTUSDT',markPrice:110,eventTime:now});await reloaded.flush();assert.equal(pushes.length,4);
  const off=new LiquidityZoneManager({...options,stateFile:join(dir,'off.json')});
  await off.add('TESTUSDT',captureLiquidityZones(analysis,now));
  now+=1000;off.onMark({symbol:'TESTUSDT',markPrice:110,eventTime:now});await off.flush();
  assert.equal(pushes.length,4,'Push defaults OFF');
  await off.update(off.snapshot().watches[0].id,{pushEnabled:true});await off.flush();assert.equal(pushes.length,4,'Enable must not replay old events');
  const lowerAnalysis={...analysis,market:{markPrice:110},liqScan:{current:{dominantSide:'BELOW',mainKillZone:{low:100,high:105}}}};
  const lower=new LiquidityZoneManager({...options,stateFile:join(dir,'lower.json')});bars=[];
  await lower.add('TESTUSDT',captureLiquidityZones(lowerAnalysis,now),true);
  now+=1000;lower.onMark({symbol:'TESTUSDT',markPrice:99,eventTime:now});await lower.flush();
  assert.equal(lower.snapshot().watches[0].status,'PRICE_PASSED');
  assert.equal(pushes.at(-1).signalType,ZONE_PUSH_TYPE);
  assert.match(pushes.at(-1).url,/liquidity-zone-manager/);
  assert.equal(lower.snapshot().binanceEligible,false);
  // Current socket crossing cannot invalidate a previous candle that closed before that crossing.
  now=T+3*B+20_000;bars=[];
  const chronological=new LiquidityZoneManager({...options,stateFile:join(dir,'chrono.json')});
  const oldZones=captureLiquidityZones(analysis,T);
  await chronological.add('TESTUSDT',oldZones,false);
  chronological.onMark({symbol:'TESTUSDT',markPrice:110,eventTime:now});
  bars=[candle(0,95,99,93,96),candle(1,96,99,94,97)];await chronological.flush();
  assert.equal(chronological.snapshot().watches[0].seen.REJECTED_AFTER_SWEEP,undefined);
  // Frozen bounds survive new analysis snapshots; no crossing of a newly moved zone is invented.
  assert.deepEqual(chronological.snapshot().watches[0].zone,{low:100,high:105});
  const closedOnly=new LiquidityZoneManager({...options,stateFile:join(dir,'closed-only.json')});
  await closedOnly.add('TESTUSDT',oldZones,false);
  bars=[{...candle(0,95,108,94,106),isClosed:false}];
  await closedOnly.flush();
  assert.equal(closedOnly.snapshot().events.length,0,'Socket candle not finally closed must not confirm');
  bars=[{...bars[0],isClosed:true}];await closedOnly.flush();
  assert.equal(closedOnly.snapshot().watches[0].seen.CLOSED_BEYOND,true);
  bars.push(candle(2,106,107,94,95));await closedOnly.flush();
  assert.equal(closedOnly.snapshot().watches[0].historyIncomplete,true,'Candle gaps must be shown');
  bars=[];
  const consumed=new LiquidityZoneManager({...options,stateFile:join(dir,'consumed.json')});
  await consumed.add('TESTUSDT',captureLiquidityZones({...analysis,market:{markPrice:110}},now),true);
  const pushCount=pushes.length;
  now+=1000;consumed.onMark({symbol:'TESTUSDT',markPrice:95,eventTime:now});await consumed.flush();
  assert.equal(consumed.snapshot().watches[0].status,'CONSUMED_AT_CAPTURE');
  assert.equal(pushes.length,pushCount,'Consumed at capture must not alert as a newly active zone');
  assert.equal(consumed.snapshot().watches[0].stateLabel,'GIÁ ĐÃ Ở NGOÀI VÙNG LÚC THÊM');
  assert.equal(consumed.snapshot().watches[0].captureRelation,'ABOVE');
  assert.equal(consumed.snapshot().watches[0].relation,'BELOW');
  assert.match(consumed.snapshot().watches[0].stateDescription,/Giá lúc thêm ở trên vùng\. Chưa xác nhận đã quét vùng/,
    'Capture wording must use the original price, not the live price after return');
  const legacyConsumed=new LiquidityZoneManager({...options,stateFile:consumed.stateFile});
  await legacyConsumed.initialize();
  assert.equal(legacyConsumed.snapshot().watches[0].stateLabel,'GIÁ ĐÃ Ở NGOÀI VÙNG LÚC THÊM');
  assert.equal(legacyConsumed.snapshot().events.length,0,'Old capture records get new wording without inventing sweep events');
  const bulkOptions={...options,stateFile:join(dir,'bulk.json')};
  const bulk=new LiquidityZoneManager(bulkOptions);
  await bulk.add('TESTUSDT',captureLiquidityZones(analysis,now),true);
  const universe=['TESTUSDT','龙虾USDT','BADUSDT','EMPTYUSDT',...Array.from({length:105},(_,i)=>`COIN${i}USDT`)];
  await bulk.startImport([...universe,'龙虾USDT']);
  assert.equal(bulk.snapshot().importJob.items.length,universe.length,'Import deduplicates symbols, including Unicode');
  const bulkLoader=async symbol=>{
    if(symbol==='BADUSDT')throw Error('Temporarily unavailable');
    return symbol==='EMPTYUSDT'?{...analysis,liqScan:{current:{dominantSide:'ABOVE'}}}:analysis;
  };
  await bulk.importBatch(bulkLoader,4);
  const resumedBulk=new LiquidityZoneManager(bulkOptions);await resumedBulk.initialize();
  while(resumedBulk.snapshot().importJob.status==='RUNNING')await resumedBulk.importBatch(bulkLoader,4);
  const bulkResult=resumedBulk.snapshot();
  assert.equal(bulkResult.watches.length,107,'Import must exceed the old 100-zone limit');
  assert.equal(bulkResult.watches.find(w=>w.symbol==='TESTUSDT').pushEnabled,true,'Existing Push selection is preserved');
  assert.equal(bulkResult.watches.find(w=>w.symbol==='龙虾USDT').pushEnabled,false,'New Push defaults OFF');
  assert.equal(bulkResult.importJob.items.find(i=>i.symbol==='BADUSDT').status,'ERROR');
  assert.equal(bulkResult.importJob.items.find(i=>i.symbol==='EMPTYUSDT').status,'NO_ZONE');
  assert.equal(bulkResult.importJob.items.filter(i=>i.status==='ADDED').length,106);
  const stopBulk=new LiquidityZoneManager({...options,stateFile:join(dir,'stop-bulk.json')});
  await stopBulk.startImport(['LATEUSDT']);
  let releaseLoad, signalStarted;const started=new Promise(resolve=>{signalStarted=resolve;});
  const runningBatch=stopBulk.importBatch(()=>new Promise(resolve=>{releaseLoad=resolve;signalStarted();}));
  await started;await stopBulk.stopImport();releaseLoad(analysis);await runningBatch;
  assert.equal(stopBulk.snapshot().watches.length,0,'Stopping import must discard in-flight results');
  const webPush=await readFile(new URL('../src/oppositeLiquidityWebPush.js',import.meta.url),'utf8');
  const sw=await readFile(new URL('../public/opposite-liquidity-push-sw.js',import.meta.url),'utf8');
  assert.match(webPush,/BINANCE_LIQUIDITY_ZONE_LIFECYCLE/);assert.match(sw,/BINANCE_LIQUIDITY_ZONE_LIFECYCLE/);
  const module=await readFile(new URL('../src/liquidityZoneManager.js',import.meta.url),'utf8');
  assert.doesNotMatch(module,/placeOrder|onQualified|autoEntryControls/);
  const ui=await readFile(new URL('../public/liquidity-zone-manager.js',import.meta.url),'utf8');
  const positionHelpers=ui.slice(ui.indexOf('function zonePosition(w)'),ui.indexOf('function deliveryLabel(e)'));
  const helpers=runInNewContext(`${positionHelpers}; ({zonePosition,sortZoneWatches,zoneScenario})`);
  const positions=[
    {id:'a',symbol:'AUSDT',markPrice:100,zone:{low:102,high:103},direction:'LOWER'},
    {id:'b',symbol:'BUSDT',markPrice:100,zone:{low:96,high:99},direction:'UPPER'},
    {id:'c',symbol:'CUSDT',markPrice:100,zone:{low:100,high:102}},
    {id:'d',symbol:'DUSDT',markPrice:null,zone:{low:100,high:102}},
  ];
  assert.equal(helpers.zonePosition(positions[0]).side,'ABOVE','Display position follows current price, not original direction');
  assert.equal(helpers.zonePosition(positions[1]).side,'BELOW');
  assert.equal(helpers.zonePosition(positions[1]).distance,1,'Distance is to nearest boundary, divided by MARK');
  assert.equal(helpers.zonePosition(positions[2]).distance,0,'Touching boundary is inside');
  assert.equal(helpers.sortZoneWatches(positions).map(w=>w.id).join(','),'c,b,a,d');
  assert.equal(helpers.sortZoneWatches(positions,'all','farthest').map(w=>w.id).join(','),'a,b,c,d');
  assert.equal(helpers.sortZoneWatches(positions,'ABOVE').map(w=>w.id).join(','),'a');
  assert.equal(positions.map(w=>w.id).join(','),'a,b,c,d','Sorting must not mutate source history');
  const fresh={...positions[0],enabled:true,socketFresh:true,seen:{}};
  const mixed=[
    {...fresh,id:'oldFar',symbol:'OLDUSDT',zone:{low:120,high:121},seen:{PRICE_PASSED:true}},
    {...fresh,id:'currentNear',zone:{low:101,high:102}},
    {...fresh,id:'oldNear',symbol:'OLDNEARUSDT',zone:{low:100.1,high:101},seen:{CLOSED_BEYOND:true}},
    {...fresh,id:'currentFar',zone:{low:105,high:106}},
  ];
  assert.equal(helpers.sortZoneWatches(mixed,'all','farthest').map(w=>w.id).join(','),'currentFar,currentNear,oldFar,oldNear','Passed zones stay last even with larger distance');
  assert.equal(helpers.sortZoneWatches(mixed).map(w=>w.id).join(','),'currentNear,currentFar,oldNear,oldFar','Near-first sorts independently within current and archived groups');
  for(const changed of [{seen:{REJECTED_AFTER_SWEEP:true}},{consumedAtCapture:true},{enabled:false}]){
    const last={...fresh,...changed,id:'archive',zone:{low:150,high:160}};
    assert.equal(helpers.sortZoneWatches([last,fresh],'all','farthest').at(-1).id,'archive');
  }
  const manyCurrent=Array.from({length:51},(_,i)=>({...fresh,id:`current${i}`,symbol:`COIN${i}USDT`}));
  const ordered=helpers.sortZoneWatches([mixed[0],...manyCurrent],'all','farthest');
  assert.equal(ordered.at(-1).id,'oldFar','Archived rows follow entire list, not just current page');
  assert.equal(mixed[0].id,'oldFar','Priority sort does not modify original list');
  assert.equal(helpers.zoneScenario(fresh).key,'UP','Current position wins over original LOWER direction');
  assert.equal(helpers.zoneScenario({...fresh,...positions[1]}).key,'DOWN');
  assert.equal(helpers.zoneScenario({...fresh,...positions[2]}).key,'INSIDE');
  assert.equal(helpers.zoneScenario({...fresh,seen:{TOUCHING:true}}).key,'UP','Historical touch is not current position');
  for(const state of ['PRICE_PASSED','CLOSED_BEYOND','REJECTED_AFTER_SWEEP']){
    assert.equal(helpers.zoneScenario({...fresh,seen:{[state]:true}}).key,'OLD');
    assert.equal(helpers.zoneScenario({...fresh,...positions[2],seen:{[state]:true}}).key,'OLD','Return inside does not revive a passed target');
  }
  assert.equal(helpers.zoneScenario({...fresh,consumedAtCapture:true}).key,'OLD');
  assert.equal(helpers.zoneScenario({...fresh,enabled:false}).key,'OLD');
  assert.equal(helpers.zoneScenario({...fresh,socketFresh:false}).key,'UNKNOWN');
  assert.equal(helpers.zoneScenario({...fresh,markPrice:null}).key,'UNKNOWN');
  assert.equal(helpers.zoneScenario({...fresh,seen:undefined}).key,'UP','Legacy missing history does not crash');
  assert.match(ui,/Thiếu lịch sử nến: chưa xác nhận vùng chưa từng bị quét/);
  assert.doesNotMatch(ui,/Vùng đã tiêu thụ lúc thêm|Đã quét\/vượt/);
  assert.match(ui,/Chưa có xác nhận quét từ nến theo dõi/);
  const diagramSource=ui.slice(ui.indexOf('function diagram(w)'),ui.indexOf('function render()'));
  const markup=runInNewContext(`${diagramSource}; diagram(watch)`,{
    price:v=>Number(v).toLocaleString('en-US',{maximumSignificantDigits:10}),
    watch:{role:'MAIN_KILL',markPrice:0.0230178,zone:{low:0.0248131,high:0.0288068}},
  });
  assert.match(markup,/class="zone-price-label"/);
  assert.match(markup,/VÙNG VÀNG/);
  assert.match(markup,/0\.0248131 – 0\.0288068/,'Gold label must show the same frozen bounds as its band');
  for(const [zoneRole,className,label] of [['MAIN_KILL','zone-main','MAIN KILL · VÙNG VÀNG'],['FAR_KILL','zone-far','FAR KILL · VÙNG TÍM'],[undefined,'zone-unknown','VÙNG CHƯA XÁC ĐỊNH LOẠI']]){
    const rendered=runInNewContext(`${diagramSource}; diagram(watch)`,{
      price:String,watch:{role:zoneRole,markPrice:303,zone:{low:273,high:288}},
    });
    assert.ok(rendered.includes(className));assert.ok(rendered.includes(label));
    assert.match(rendered,/273 – 288/,'Role styling must not replace stored bounds');
    if(zoneRole!=='MAIN_KILL')assert.doesNotMatch(rendered,/VÙNG VÀNG/,'FAR or missing role must not masquerade as MAIN');
  }
  assert.match(ui,/w\.role===\$\('zoneRole'\)\.value/,'Role filter uses stored runtime role');
}finally{await rm(dir,{recursive:true,force:true});}
console.log('Liquidity zone manager: frozen zones, socket crossings, closed candles, no replay, Push OFF and temporal evidence OK');

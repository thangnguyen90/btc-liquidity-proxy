import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AutoEntryControls,BINANCE_PROTECTION_EXCLUSION_VERSION,entryRoute,isReducingOrder,buildAutoEntryDailyStats,normalizeProtectionExclusionSymbol} from '../src/autoEntryControls.js';
import {evaluateAutoBinanceEntryPolicy} from '../src/autoBinancePolicy.js';
const dir=await mkdtemp(join(tmpdir(),'entry-controls-')),file=join(dir,'settings.json');
let controls=new AutoEntryControls(file);
const payload={source:'coinglass-zone-lifecycle',side:'BUY',protectionMeta:{signalLabel:'UNCONFIRMED_BOUNCE_LONG',signalType:'OTHER',streamId:'secondary-top-41-80'}};
const r=entryRoute(payload);
assert.equal(r.label,'UNCONFIRMED_BOUNCE_LONG');assert.equal(r.stream,'secondary-top-41-80');assert.equal(r.side,'LONG');
assert.equal(r.key,entryRoute({signalSource:payload.source,side:'LONG',signalLabel:r.label,streamId:r.stream}).key,'history/UI/runtime keys match');
assert.notEqual(r.key,entryRoute({...payload,protectionMeta:{...payload.protectionMeta,streamId:'primary-top-1-40'}}).key);
assert.notEqual(r.key,entryRoute({...payload,side:'SELL'}).key);
assert.throws(()=>controls.assertEntry(payload),/OFF/);assert.equal(controls.read().enabled,false);
controls.update({action:'route',key:r.key,enabled:true});assert.throws(()=>controls.assertEntry(payload),/OFF/);
controls.update({action:'master',enabled:true});assert.doesNotThrow(()=>controls.assertEntry(payload));
controls=new AutoEntryControls(file);assert.doesNotThrow(()=>controls.assertEntry(payload),'restart retains choices');
assert.deepEqual(controls.read().protectionExclusions,[],'old JSON without exclusions defaults to an empty list');
assert.equal(normalizeProtectionExclusionSymbol(' ain/usdt '),'AINUSDT');
controls.update({action:'protection-exclusion-add',symbol:'ain'});
controls.update({action:'protection-exclusion-add',symbol:'AINUSDT'});
assert.deepEqual(controls.read().protectionExclusions,['AINUSDT'],'exclusions are normalized and deduplicated');
assert.equal(controls.isProtectionExcluded('ain'),true);
assert.equal(controls.isProtectionExcluded('ONEUSDT'),false);
controls=new AutoEntryControls(file);assert.equal(controls.isProtectionExcluded('AIN/USDT'),true,'protection exclusion survives restart');
assert.equal(controls.read().protectionExclusionVersion,BINANCE_PROTECTION_EXCLUSION_VERSION);
assert.equal(controls.clearProtectionExclusion('AIN'),true,'confirmed close can atomically reset the lifecycle exclusion');
assert.equal(controls.clearProtectionExclusion('AINUSDT'),false,'close reset is idempotent');
controls=new AutoEntryControls(file);assert.equal(controls.isProtectionExcluded('AINUSDT'),false,'closed lifecycle exclusion stays cleared after restart');
assert.throws(()=>controls.update({action:'protection-exclusion-add',symbol:'$bad'}),/không hợp lệ/);
controls.update({action:'protection-exclusion-add',symbol:'AIN'});
controls.update({action:'protection-exclusion-remove',symbol:'AIN'});
assert.equal(controls.isProtectionExcluded('AINUSDT'),false,'removal resumes automatic protection');
assert.throws(()=>controls.assertEntry({...payload,side:'SELL'}),/OFF/,'other side default OFF');
assert.throws(()=>controls.assertEntry({...payload,signalLabel:'NEW',protectionMeta:{}}),/OFF/,'new route stays OFF');
assert.equal(evaluateAutoBinanceEntryPolicy({payload:{...payload,dryRun:false},orderEnabled:true,env:{LIVE_CARD_WHITELIST_ONLY_AUTO_BINANCE:'true'}}).allowed,false,'control ON never grants old whitelist authorization');
let calls=0;const client={placeFuturesOrder:async()=>{calls++;return {ok:true};},placeAlgoOrder:async()=>{calls++;return {ok:true};}};
controls.guardClient(client);
await client.placeFuturesOrder({params:{type:'MARKET',side:'BUY'},entryControl:{payload}});assert.equal(calls,1);
controls.update({action:'pauseAll'});
assert.ok(Object.values(controls.read().routes).every(r=>!r.enabled));assert.equal(controls.read().enabled,false);
for(const method of ['placeFuturesOrder','placeAlgoOrder']) {
  assert.throws(()=>client[method]({params:{type:'LIMIT',side:'BUY'},entryControl:{payload}}),/OFF/);
  for(const params of [
    {side:'SELL',reduceOnly:true},{side:'BUY',reduceOnly:'true'},
    {type:'STOP_MARKET',side:'SELL',closePosition:'true'},
    {type:'TAKE_PROFIT_MARKET',side:'SELL',positionSide:'LONG'},
    {type:'STOP_MARKET',side:'BUY',positionSide:'SHORT'},
  ]){assert.equal(isReducingOrder(params),true);await client[method]({params});}
  assert.throws(()=>client[method]({params:{side:'BUY',positionSide:'LONG'}}),/OFF/);
  assert.throws(()=>client[method]({params:{side:'SELL',positionSide:'SHORT'}}),/OFF/);
  await client[method]({params:{side:'BUY'},entryControl:{manual:true}});
}
assert.throws(()=>controls.update({action:'route',key:'invalid',enabled:true}),/Invalid/);
const unknown=controls.register({side:'BUY'});
assert.throws(()=>controls.update({action:'route',key:unknown.key,enabled:true}),/Unclassified/);
controls.seed([{source:'paper-trade-manual-binance',side:'BUY'},payload]);assert.ok(!Object.values(controls.read().routes).some(r=>r.source.includes('manual')));
const now=Date.parse('2026-09-12T12:00:00Z'),routes=controls.read().routes;
const daily=buildAutoEntryDailyStats([
  {signalSource:r.source,streamId:r.stream,signalLabel:r.label,direction:r.side,filledAt:'2026-09-12T01:00:00Z',positionStatus:'OPEN',isDca:false},
  {signalSource:r.source,streamId:r.stream,signalLabel:r.label,direction:r.side,filledAt:'2026-09-12T01:10:00Z',closedAt:'2026-09-12T03:00:00Z',positionStatus:'CLOSED',isDca:true,closeGroupId:'close-1',outcome:'WIN',netRealizedPnlUsdt:.2},
  {signalSource:r.source,streamId:r.stream,signalLabel:r.label,direction:r.side,filledAt:'2026-09-11T01:00:00Z',closedAt:'2026-09-12T03:00:00Z',positionStatus:'CLOSED',isDca:false,closeGroupId:'close-1',outcome:'WIN',netRealizedPnlUsdt:.8},
  {signalSource:'binance-manual-socket',signalLabel:'BINANCE_MANUAL_ENTRY',direction:'LONG',filledAt:'2026-09-12T02:00:00Z',closedAt:'2026-09-12T03:00:00Z',netRealizedPnlUsdt:99},
],routes,{now,timeZone:'Asia/Bangkok'});
assert.equal(daily.date,'2026-09-12');assert.equal(daily.totals.entries,1);assert.equal(daily.totals.openEntries,1);assert.equal(daily.totals.closedPositions,1);assert.equal(daily.totals.wins,1);assert.equal(daily.totals.realizedPnlUsdt,1);
assert.equal(daily.routes[r.key].entries,1);assert.equal(daily.routes[r.key].realizedPnlUsdt,1);
controls.update({action:'protection-exclusion-add',symbol:'ONE'});
await writeFile(file,'{bad','utf8');assert.equal(controls.read().enabled,false);assert.equal(controls.isProtectionExcluded('ONEUSDT'),true,'in-memory exclusion survives a corrupt control read');assert.throws(()=>controls.assertEntry(payload),/OFF/);
const server=await readFile(new URL('../src/server.js',import.meta.url),'utf8');
assert.ok(server.includes('autoEntryControls.guardClient(client)'));
assert.ok(server.includes('autoEntryControls.assertEntry(payload,entryControl.manual)'));
assert.ok(server.includes('params: marketParams, apiKey, apiSecret, entryControl'));
assert.ok(server.includes("requestUrl.pathname==='/api/auto-entry-controls'"));
for(const guard of ['SOCKET_FULL_FILL','SIGNAL_PROTECTION','ORDER_PROTECTION','SET_TP_SL','SL_TRAIL_FAST_WAVE','MISSING_SL_SCAN','MISSING_TP_SCAN','NEGATIVE_TP_MOVE','TWELVE_HOUR_TP_MOVE','STARTUP_TP_SCAN','PUMP_FILL_TP','PUMP_AUTO_SL']) {
  assert.ok(server.includes(`isBinanceProtectionExcluded(symbol, '${guard}')`)||server.includes(`isBinanceProtectionExcluded(o.symbol, '${guard}')`),`runtime exclusion guard ${guard}`);
}
assert.ok(server.includes("resetBinanceProtectionExclusionAfterClose(symbol, 'POSITION_CLOSED')"),'confirmed socket close resets the exclusion');
assert.ok(server.includes("resetBinanceProtectionExclusionAfterClose(sym, 'POSITION_CLOSED_REST_RECONCILE')"),'confirmed REST close resets the exclusion');
assert.ok(server.includes("resetBinanceProtectionExclusionAfterClose(symbol, 'POSITION_REVERSED')"),'one-way reversal resets the previous lifecycle exclusion');
assert.ok(server.includes('pendingLiqTp.delete(symbol)'),'closed lifecycle cannot leak an old pending Liq TP into the next entry');
const controlsHtml=await readFile(new URL('../public/binance-auto-controls.html',import.meta.url),'utf8');
const controlsJs=await readFile(new URL('../public/binance-auto-controls.js',import.meta.url),'utf8');
assert.ok(controlsHtml.includes('protection-exclusion-form'));
assert.ok(controlsJs.includes("action:'protection-exclusion-add'"));
assert.ok(controlsJs.includes("action:'protection-exclusion-remove'"));
console.log('Auto entry controls passed: pause-all, per-type/stream/side, restart, fail-closed, manual, position-scoped protection exclusions with close reset, old-policy unchanged (mock orders only).');

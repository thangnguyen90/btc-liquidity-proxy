import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AutoEntryControls,BINANCE_PROTECTION_EXCLUSION_VERSION,DEFAULT_PROTECTION_EXCLUSION_AUTO_RESUME_LOSS_ROE,DEFAULT_PROTECTION_EXCLUSION_AUTO_RESUME_ROE,entryRoute,isReducingOrder,buildAutoEntryDailyStats,normalizeProtectionExclusionSymbol,protectionExclusionAutoResumeLossRoe,protectionExclusionAutoResumeRoe,shouldAutoResumeProtectionExclusion} from '../src/autoEntryControls.js';
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
assert.deepEqual(controls.read().protectionFullBypasses,[],'old JSON without full bypass defaults to an empty list');
assert.deepEqual(controls.read().protectionExclusionEvents,[],'old JSON without lifecycle events stays compatible');
assert.equal(normalizeProtectionExclusionSymbol(' ain/usdt '),'AINUSDT');
assert.equal(BINANCE_PROTECTION_EXCLUSION_VERSION,'BINANCE_SYMBOL_PROTECTION_EXCLUSION_V8_DIRECTION_FLIP_FAIL_CLOSED_20261003');
assert.equal(DEFAULT_PROTECTION_EXCLUSION_AUTO_RESUME_ROE,15);
assert.equal(DEFAULT_PROTECTION_EXCLUSION_AUTO_RESUME_LOSS_ROE,-25);
assert.equal(protectionExclusionAutoResumeRoe('15'),15);
assert.equal(protectionExclusionAutoResumeRoe('bad'),15);
assert.equal(protectionExclusionAutoResumeLossRoe('-25'),-25);
assert.equal(protectionExclusionAutoResumeLossRoe('bad'),-25);
assert.equal(shouldAutoResumeProtectionExclusion({excluded:true,roe:14.999}),false);
assert.equal(shouldAutoResumeProtectionExclusion({excluded:true,roe:15}),true);
assert.equal(shouldAutoResumeProtectionExclusion({excluded:true,roe:'15.01'}),true);
assert.equal(shouldAutoResumeProtectionExclusion({excluded:true,roe:-24.999}),false);
assert.equal(shouldAutoResumeProtectionExclusion({excluded:true,roe:-25}),true);
assert.equal(shouldAutoResumeProtectionExclusion({excluded:true,roe:'-25.01'}),true);
assert.equal(shouldAutoResumeProtectionExclusion({excluded:false,roe:99}),false);
assert.equal(shouldAutoResumeProtectionExclusion({excluded:true,roe:null}),false);
controls.update({action:'protection-exclusion-add',symbol:'ain'});
controls.update({action:'protection-exclusion-add',symbol:'AINUSDT'});
assert.deepEqual(controls.read().protectionExclusions,['AINUSDT'],'exclusions are normalized and deduplicated');
assert.equal(controls.isProtectionExcluded('ain'),true);
assert.equal(controls.isProtectionExcluded('ONEUSDT'),false);
controls=new AutoEntryControls(file);assert.equal(controls.isProtectionExcluded('AIN/USDT'),true,'protection exclusion survives restart');
assert.equal(controls.read().protectionExclusionVersion,BINANCE_PROTECTION_EXCLUSION_VERSION);
controls.update({action:'protection-full-bypass-add',symbol:'FULL'});
assert.deepEqual(controls.read().protectionFullBypasses,['FULLUSDT'],'full bypass is persisted separately');
assert.deepEqual(controls.read().protectionExclusionEvents.at(-1),{
  symbol:'FULLUSDT',mode:'FULL_POSITION_BYPASS',event:'ENABLED',reason:'USER_REQUEST',at:controls.read().protectionExclusionEvents.at(-1).at,
},'full bypass save is visible in lifecycle audit');
assert.equal(controls.protectionExclusionMode('FULLUSDT'),'FULL_POSITION_BYPASS');
assert.equal(controls.isProtectionExcluded('FULLUSDT'),true);
assert.equal(controls.autoResumeProtectionExclusion('FULLUSDT',99,15,-25),false,'full bypass never resumes at profit boundary');
assert.equal(controls.autoResumeProtectionExclusion('FULLUSDT',-99,15,-25),false,'full bypass never resumes at loss boundary');
controls=new AutoEntryControls(file);assert.equal(controls.protectionExclusionMode('FULL'),'FULL_POSITION_BYPASS','full bypass survives restart');
controls.update({action:'protection-full-bypass-add',symbol:'LATCH'});
assert.equal(controls.fullBypassPositionBound('LATCH'),false,'full bypass starts armed but unbound when no active position was observed');
assert.equal(controls.clearProtectionExclusion('LATCH','POSITION_CLOSED_REST_RECONCILE'),false,'a stale close snapshot cannot clear an unbound full bypass');
assert.equal(controls.isProtectionExcluded('LATCH'),true,'unbound full bypass stays armed for the next position');
assert.equal(controls.markProtectionPositionActive('LATCH',Date.now()),true,'first active position observation binds the armed bypass');
assert.equal(controls.fullBypassPositionBound('LATCH'),true,'bound state is persisted');
assert.equal(controls.read().protectionExclusionEvents.at(-1).event,'POSITION_BOUND');
assert.equal(controls.clearProtectionExclusion('LATCH','POSITION_CLOSED_REST_RECONCILE'),true,'the bound bypass clears after that position closes');
controls=new AutoEntryControls(file);assert.equal(controls.isProtectionExcluded('LATCH'),false,'bound close clear survives restart');
controls.update({action:'protection-exclusion-add',symbol:'FULL'});
assert.equal(controls.protectionExclusionMode('FULL'),'AUTO_RESUME_ROE_BOUNDARY','switching to temporary mode removes full bypass atomically');
controls.update({action:'protection-full-bypass-add',symbol:'FULL'});
assert.deepEqual(controls.read().protectionExclusions,['AINUSDT'],'switching back to full mode removes temporary duplicate');
controls.update({action:'protection-full-bypass-remove',symbol:'FULL'});
assert.equal(controls.isProtectionExcluded('FULL'),false,'manual full-bypass removal resumes automatic protection');
controls.update({action:'protection-exclusion-add',symbol:'PROFIT'});
assert.equal(controls.autoResumeProtectionExclusion('PROFITUSDT',14.999,15),false,'below +15% keeps exclusion');
assert.equal(controls.isProtectionExcluded('PROFITUSDT'),true);
assert.equal(controls.autoResumeProtectionExclusion('PROFITUSDT',15,15),true,'exact +15% clears exclusion');
controls=new AutoEntryControls(file);assert.equal(controls.isProtectionExcluded('PROFITUSDT'),false,'profit auto-resume persists after restart');
controls.update({action:'protection-exclusion-add',symbol:'LOSS'});
assert.equal(controls.autoResumeProtectionExclusion('LOSSUSDT',-24.999,15,-25),false,'above -25% keeps exclusion');
assert.equal(controls.isProtectionExcluded('LOSSUSDT'),true);
assert.equal(controls.autoResumeProtectionExclusion('LOSSUSDT',-25,15,-25),true,'exact -25% clears exclusion');
controls=new AutoEntryControls(file);assert.equal(controls.isProtectionExcluded('LOSSUSDT'),false,'loss auto-resume persists after restart');
assert.equal(controls.clearProtectionExclusion('AIN','POSITION_CLOSED_REST_RECONCILE'),true,'confirmed close can atomically reset the lifecycle exclusion');
assert.equal(controls.read().protectionExclusionEvents.at(-1).event,'AUTO_CLEARED');
assert.equal(controls.read().protectionExclusionEvents.at(-1).reason,'POSITION_CLOSED_REST_RECONCILE');
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
controls.update({action:'protection-full-bypass-add',symbol:'BLOCK'});
assert.throws(()=>client.placeAlgoOrder({params:{symbol:'BLOCKUSDT',type:'STOP_MARKET',side:'SELL',closePosition:'true'}}),/Tắt toàn bộ/,'low-level fence blocks a missed SL placement path');
assert.throws(()=>client.placeFuturesOrder({params:{symbol:'BLOCKUSDT',type:'TAKE_PROFIT_MARKET',side:'SELL',closePosition:'true'}}),/Tắt toàn bộ/,'low-level fence blocks conditional protection on regular endpoint');
await client.placeFuturesOrder({params:{symbol:'BLOCKUSDT',type:'MARKET',side:'SELL',reduceOnly:true}});
assert.equal(calls,1,'manual/explicit market close remains possible while protection is bypassed');
controls.update({action:'protection-full-bypass-remove',symbol:'BLOCK'});
calls=0;
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
for(const guard of ['SOCKET_FULL_FILL','SIGNAL_PROTECTION','ORDER_PROTECTION','SET_TP_SL','SL_TRAIL_FAST_WAVE','MISSING_SL_SCAN','MISSING_TP_SCAN','NEGATIVE_TP_MOVE','TWELVE_HOUR_TP_MOVE','STARTUP_TP_SCAN','PUMP_FILL_TP','PUMP_AUTO_SL','COIN_LEVEL_OBSERVE_FLIP']) {
  assert.ok(
    server.includes(`isBinanceProtectionExcluded(symbol, '${guard}')`)
      || server.includes(`isBinanceProtectionExcluded(o.symbol, '${guard}')`)
      || server.includes(`isBinanceProtectionExcluded(flip.symbol, '${guard}')`),
    `runtime exclusion guard ${guard}`,
  );
}
assert.ok(server.includes("resetBinanceProtectionExclusionAfterClose(symbol, 'POSITION_CLOSED')"),'confirmed socket close resets the exclusion');
assert.ok(server.includes("resetBinanceProtectionExclusionAfterClose(sym, 'POSITION_CLOSED_REST_RECONCILE')"),'confirmed REST close resets the exclusion');
assert.ok(server.includes("resetBinanceProtectionExclusionAfterClose(symbol, 'POSITION_REVERSED')"),'one-way reversal resets the previous lifecycle exclusion');
assert.ok(server.includes('autoEntryControls.markProtectionPositionActive(symbol, fillTime ?? Date.now())'),'a full fill binds an armed bypass to the new position before protection runs');
assert.ok(server.includes('autoEntryControls.markProtectionPositionActive(position.symbol, Date.now())'),'authoritative REST positions bind bypasses after restart');
assert.ok(server.includes('autoResumeBinanceProtectionExclusionAtRoeBoundary(symbol, roe)'),'live ROE stream auto-resumes protection at either boundary');
assert.ok(server.indexOf('autoResumeBinanceProtectionExclusionAtRoeBoundary(symbol, roe);')<server.indexOf('handleSlTrailByProfit(symbol, pos, roe, markPrice)'),'exclusion clears before same-tick protection handling');
assert.ok(server.includes('pendingLiqTp.delete(symbol)'),'closed lifecycle cannot leak an old pending Liq TP into the next entry');
const controlsHtml=await readFile(new URL('../public/binance-auto-controls.html',import.meta.url),'utf8');
const controlsJs=await readFile(new URL('../public/binance-auto-controls.js',import.meta.url),'utf8');
assert.ok(controlsHtml.includes('protection-exclusion-form'));
assert.ok(controlsJs.includes("action:'protection-exclusion-add'"));
assert.ok(controlsJs.includes("action:'protection-exclusion-remove'"));
assert.ok(controlsHtml.includes('protection-full-bypass-form'));
assert.ok(controlsHtml.includes('protection-lifecycle-list'));
assert.ok(controlsHtml.includes('orders-password-unlock'));
assert.ok(controlsJs.includes("action:'protection-full-bypass-add'"));
assert.ok(controlsJs.includes("action:'protection-full-bypass-remove'"));
assert.ok(controlsJs.includes('ĐÃ TỰ GỠ'));
assert.ok(controlsJs.includes('Binance xác nhận vị thế đã đóng'));
assert.ok(controlsHtml.includes('Không tự gỡ theo ROE'));
assert.ok(controlsHtml.includes('gài cho vị thế kế tiếp'));
assert.ok(controlsHtml.includes('Tự gỡ tại <strong>+15%</strong>, <strong>−25% ROE</strong>'));
assert.ok(controlsJs.includes('tự gỡ tại +15% / −25% ROE'));
assert.ok(controlsJs.includes('ĐÃ GÀI CHỜ VỊ THẾ'));
assert.ok(controlsJs.includes('ĐÃ GẮN VỊ THẾ'));
assert.ok(controlsJs.includes("localStorage.getItem('orders_creds')"),'public controls can recover a stale Orders session from saved credentials');
assert.ok(controlsJs.includes('if(r.status===401&&allowRecover)'),'a rejected controls request gets one authenticated retry');
assert.ok(controlsJs.includes("if(await change({action:'protection-exclusion-add',symbol}))input.value=''"),'temporary input clears only after confirmed save');
assert.ok(controlsJs.includes("if(await change({action:'protection-full-bypass-add',symbol}))input.value=''"),'full-bypass input clears only after confirmed save');
assert.ok(controlsJs.includes("requestSession('/api/auth/orders-password'"),'public controls can unlock with ORDERS_PASSWORD without exposing the Binance key in this page');
console.log('Auto entry controls passed: pause-all, per-type/stream/side, restart, fail-closed, manual, temporary and full-position protection bypasses (mock orders only).');

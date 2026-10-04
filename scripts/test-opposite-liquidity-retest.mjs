import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRetestRecord, evaluateRetest, buildRetestMessage, retestPresentation, OppositeLiquidityRetest } from '../src/oppositeLiquidityRetest.js';
const B = 300_000, T = 1_800_000_000_000;
const event = { eventId: 'test|5m', symbol: 'TESTUSDT', direction: 'ABOVE', side: 'LONG',
  interval: '5m', sentAt: T, zone: { low: 90, high: 100 } };
const record = createRetestRecord(event, T);
const bar = (i, open = 102, high = 105, low = 101, close = 103) =>
  ({ openTime: T + i * B, closeTime: T + (i + 1) * B - 1, open, high, low, close });
const passRows = [bar(-1), bar(0, 102, 103, 99, 101), bar(1, 101, 107, 100, 106), bar(2, 106, 108, 105, 107)];
assert.equal(evaluateRetest(record, passRows, T + B).status, 'WAIT_CONFIRMATION');
assert.equal(evaluateRetest(record, passRows, T + 2*B - 1).status, 'WAIT_CONFIRMATION');
const pass = evaluateRetest(record, passRows, T + 2*B);
assert.equal(pass.status, 'PASS');
assert.equal(pass.entryReference, 106);
assert.equal(pass.binanceEligible, false);
assert.equal(evaluateRetest(pass, [], T + 99*B).status, 'PASS');
assert.equal(evaluateRetest(record, [bar(-1), bar(0, 100, 110, 85, 89)], T+B).reason, 'CLOSED_BELOW_ZONE');
assert.equal(evaluateRetest(record, [bar(-1), bar(0, 102, 103, 99, 101)], T+B).status, 'WAIT_CONFIRMATION');
assert.equal(evaluateRetest(record, [bar(0, 100, 110, 99, 109), bar(1)], T+B).status, 'DATA_MISSING');
assert.equal(evaluateRetest(record, passRows.slice(0,3), T+2*B).status, 'DATA_MISSING');
const untouched = Array.from({length:13}, (_,i) => bar(i-1));
assert.equal(evaluateRetest(record, untouched, T+12*B).reason, 'TIMEOUT_NO_TOUCH');
const touched = untouched.map(b => ({...b, low: 99}));
assert.equal(evaluateRetest(record, touched, T+12*B).reason, 'TIMEOUT_NO_CONFIRMATION');
assert.equal(evaluateRetest(record, [], T+12*B).status, 'DATA_MISSING');
assert.equal(evaluateRetest(record, [], T+14*B).status, 'UNVERIFIED');
const late = createRetestRecord({...event,sentAt:T+1},T+1);
assert.equal(evaluateRetest(late, [bar(0,100,101,80,89),bar(1)],T+2*B).status,'WAIT_TOUCH');
assert.equal(createRetestRecord({...event,side:'SHORT'},T),null);
assert.equal(createRetestRecord({...event,direction:'BELOW'},T),null);
assert.equal(createRetestRecord({...event,zone:{low:100,high:90}},T),null);
assert.equal(createRetestRecord({...event,analysisGeneratedAt:T+30_000},T+30_000).sentAt,T+30_000);
assert.match(buildRetestMessage(pass,T+3*B).embeds[0].fields[2].value,/Phát hiện trễ/);
for (const reason of ['TIMEOUT_NO_TOUCH', 'TIMEOUT_NO_CONFIRMATION']) {
  const row = {...record, status:'FAIL',reason};
  assert.equal(retestPresentation(row).resultLabel,'KHÔNG CÓ ĐIỂM VÀO');
  assert.equal(retestPresentation(row).resultTone,'wait');
  const embed=buildRetestMessage(row).embeds[0];
  assert.match(embed.title,/KHÔNG CÓ ĐIỂM VÀO/);
  assert.doesNotMatch(embed.title,/FAIL/);
  assert.match(embed.description,/không có nghĩa xu hướng LONG sai/);
  assert.equal(embed.color,0xf4c767);
}
const invalidated={...record,status:'FAIL',reason:'CLOSED_BELOW_ZONE'};
assert.equal(retestPresentation(invalidated).resultLabel,'SETUP BỊ VÔ HIỆU');
assert.equal(buildRetestMessage(invalidated).embeds[0].color,0xf43f5e);
assert.equal(retestPresentation(pass).resultLabel,'PASS');
assert.equal(retestPresentation({...record,status:'UNVERIFIED'}).resultLabel,'CHƯA XÁC MINH');
assert.equal(retestPresentation({...record,status:'FAIL',reason:'UNKNOWN_LEGACY'}).resultLabel,'CHƯA XÁC MINH');
const dir = await mkdtemp(join(tmpdir(),'opposite-retest-test-'));
try {
  let now=T, sent=0, fail=false;
  const options={file:join(dir,'state.json'),getEvents:async()=>[event,event],getRows:async()=>passRows,
    now:()=>now,send:async()=>{if(fail)throw Error('offline');sent++;}};
  const tracker=new OppositeLiquidityRetest(options);
  await tracker.scan();
  now=T+2*B;fail=true;await tracker.scan();
  assert.equal(sent,0);
  fail=false;await tracker.scan();assert.equal(sent,0);
  now+=60_000;await tracker.scan();assert.equal(sent,1);
  await new OppositeLiquidityRetest(options).scan();assert.equal(sent,1);
  const historical=new OppositeLiquidityRetest({...options,file:join(dir,'old.json'),now:()=>T+15*B});
  await historical.scan();assert.equal(sent,1);
  assert.equal((await historical.snapshot()).records[event.eventId].status,'PASS');
  assert.equal((await historical.snapshot()).records[event.eventId].notifyEligible,false);
  const failEvent={...event,eventId:'failure'};
  now=T;
  const failing=new OppositeLiquidityRetest({...options,file:join(dir,'fail.json'),getEvents:async()=>[failEvent],
    getRows:async()=>[bar(-1),bar(0,100,101,80,89)]});
  await failing.scan();now=T+B;await failing.scan();await failing.scan();assert.equal(sent,2);
  assert.equal((await failing.snapshot()).records.failure.reason,'CLOSED_BELOW_ZONE');
  const legacyFile=join(dir,'legacy-v1.json');
  const legacy={...record,status:'FAIL',reason:'TIMEOUT_NO_TOUCH',delivery:{sentAt:T+12*B},notifyEligible:true};
  await writeFile(legacyFile,JSON.stringify({version:'OPPOSITE_LONG_RETEST_OBSERVE_V1_20261004',records:{[event.eventId]:legacy}}));
  const migrated=new OppositeLiquidityRetest({...options,file:legacyFile});
  await migrated.scan();
  assert.equal(sent,2,'Renaming existing results must not replay Discord');
  const displayed=(await migrated.snapshot()).records[event.eventId];
  assert.equal(displayed.resultLabel,'KHÔNG CÓ ĐIỂM VÀO');
  assert.equal(displayed.status,'FAIL','Preserve legacy status for compatibility');
  assert.deepEqual(displayed.delivery,legacy.delivery);
} finally { await rm(dir,{recursive:true,force:true}); }
console.log('Opposite retest: causal PASS/FAIL, missing data, next open, restart dedupe, retry and history tests passed');

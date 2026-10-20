import assert from 'node:assert/strict';
import {createUserDataStreamHealth,USER_DATA_HEALTH_DEFAULTS as cfg} from '../src/userDataStreamHealth.js';
import {watchdogSubsystemFailure,watchdogStartupGraceRemainingMs} from '../src/runtimeWatchdogPolicy.js';
let clock=1_000_000;
const make=()=>createUserDataStreamHealth({now:()=>clock});
const h=make();assert.equal(h.check(),null);assert.equal(h.snapshot().restartRequired,false);
h.connecting();clock+=cfg.connectTimeoutMs;assert.equal(h.check().reason,'connect-timeout');
h.disconnected('connect-timeout');h.connecting();h.opened();
let ping=h.check();assert.equal(ping.type,'PING');assert.equal(h.pong('wrong'),false);
clock+=cfg.pongTimeoutMs;assert.equal(h.check().reason,'pong-timeout');
h.disconnected('pong-timeout');h.connecting();h.opened();
// No account/order event for 12 hours with good pongs is healthy.
for(let i=0;i<12*60*2;i++){ping=h.check();if(ping?.type==='PING')assert.equal(h.pong(ping.payload),true);clock+=cfg.pingEveryMs;}
assert.equal(h.snapshot().restartRequired,false);assert.equal(h.snapshot().faultCount,0);
const row=(amt,entry=9.131,symbol='INJUSDT')=>({symbol,positionAmt:String(amt),entryPrice:String(entry),positionSide:'BOTH'});
const acct=(amt,entry=9.131,s='INJUSDT')=>({s,pa:String(amt),ep:String(entry),ps:'BOTH'});
// Baseline old positions do not trigger scans. New position with missing
// ACCOUNT_UPDATE does, even while transport pongs keep arriving.
h.observeRest([row(1)]);clock+=100;h.observeRest([row(1),row(2,1,'NEWUSDT')]);
assert.equal(h.snapshot().pendingRestMismatches,1);
clock+=cfg.driftGraceMs-1;assert.notEqual(h.check()?.type,'RECONNECT');
h.observeAccount([acct(7,1,'OTHERUSDT')]);clock++;
assert.equal(h.check().reason,'rest-position-without-account-event');
h.observeAccount([acct(2,1,'NEWUSDT')]);assert.equal(h.snapshot().pendingRestMismatches,0);
// Socket-first ordinary fills, delayed matches, and rounding don't reconnect.
h.observeAccount([acct(3,9.13100000001)]);h.observeRest([row(3),row(2,1,'NEWUSDT')]);
assert.equal(h.snapshot().pendingRestMismatches,0);
h.observeRest([row(4),row(2,1,'NEWUSDT')]);clock+=10_000;h.observeAccount([acct(4)]);
assert.equal(h.snapshot().pendingRestMismatches,0);
// Rollover is preventive, not a fault.
const rotate=make();rotate.connecting();rotate.opened();clock+=cfg.rotateAfterMs;
assert.equal(rotate.check().reason,'scheduled-23h-rotation');
rotate.disconnected('scheduled-23h-rotation',{failure:false});assert.equal(rotate.snapshot().faultCount,0);
// Reopening a broken connection does not forgive repeated failure immediately.
const broken=make();broken.connecting();broken.opened();
for(let i=0;i<3;i++){broken.disconnected('pong-timeout');clock+=110_000;broken.connecting();broken.opened();}
assert.equal(broken.snapshot().restartRequired,true);
assert.match(watchdogSubsystemFailure({ok:true,userDataHealth:broken.snapshot()}),/user-data recovery exhausted/);
assert.equal(watchdogSubsystemFailure({ok:true}),null,'legacy health JSON compatible');
assert.equal(watchdogSubsystemFailure({userDataHealth:{enabled:false,restartRequired:true}}),null);
assert.equal(watchdogStartupGraceRemainingMs({now:clock,processStartedAt:clock-20_000,startupGraceMs:120_000}),100_000);
for(let i=0;i<5;i++){const p=broken.check();if(p?.type==='PING')broken.pong(p.payload);clock+=30_000;}
assert.equal(broken.snapshot().restartRequired,false,'stable pongs reset incident');
const hung=make();hung.connecting();hung.opened();hung.recoveryStarted();clock+=cfg.restartAfterMs;
assert.equal(hung.snapshot().restartRequired,true);assert.equal(hung.snapshot().reason,'fill-recovery-timeout');
hung.recoveryFinished();assert.equal(hung.snapshot().restartRequired,false);
console.log('PASS: pong timeout, quiet account, REST/socket drift, rollover, restart escalation/grace, stalled recovery');

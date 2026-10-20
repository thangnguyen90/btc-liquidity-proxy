import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {watchdogSubsystemFailure,watchdogStartupGraceRemainingMs} from '../src/runtimeWatchdogPolicy.js';
const source=(await readFile(new URL('./pm2-health-watchdog.mjs',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
const body=source.slice(source.indexOf('async function targetStartupGraceRemainingMs()'),source.indexOf('\nconsole.log(\n  `[Watchdog] Monitoring'));
assert.ok(body.includes('async function checkTarget()'));
let clock=1_000_000,startedAt=1000;
let payload={ok:true,userDataHealth:{enabled:true,restartRequired:true,reason:'pong-timeout'}};
const commands=[];
const runner=vm.runInNewContext('let consecutiveFailures=0,checkInFlight=false,nextCheckAt=0;\n'+body+'\n({checkTarget,failures:()=>consecutiveFailures})',{
  watchdogSubsystemFailure,watchdogStartupGraceRemainingMs:opts=>watchdogStartupGraceRemainingMs({...opts,now:clock}),
  execFileAsync:async(file,args)=>{commands.push({file,args});return {stdout:JSON.stringify([{name:'btc-liquidity-web',pm2_env:{pm_uptime:startedAt}}])};},
  pm2Binary:'/mock/pm2',targetProcess:'btc-liquidity-web',targetUrl:'http://mock/healthz',
  timeoutMs:5000,startupGraceMs:120000,restartGraceMs:300000,intervalMs:15000,failureLimit:2,
  Date:class extends Date{static now(){return clock;}},AbortController,
  setTimeout:()=>1,clearTimeout(){},console:{log(){},error(){}},
  fetch:async()=>({ok:true,json:async()=>payload}),
});
await runner.checkTarget();assert.equal(runner.failures(),1);
await runner.checkTarget();assert.equal(commands.filter(c=>c.args[0]==='restart').length,1);
const restart=commands.find(c=>c.args[0]==='restart');
assert.deepEqual(Array.from(restart.args),['restart','btc-liquidity-web'],'must preserve PM2 environment/memory settings');
await runner.checkTarget();assert.equal(commands.filter(c=>c.args[0]==='restart').length,1,'restart cooldown prevents loop');
clock+=300001;payload={ok:true,userDataHealth:{enabled:true,restartRequired:false}};
await runner.checkTarget();assert.equal(runner.failures(),0);
// External restarts receive startup grace even if the subsystem reports bad.
startedAt=clock;payload.userDataHealth.restartRequired=true;
await runner.checkTarget();assert.equal(runner.failures(),0);
clock+=120001;payload={ok:true};await runner.checkTarget();assert.equal(runner.failures(),0,'old health JSON still healthy');
console.log('PASS: actual watchdog escalates HTTP200 subsystem failure, PM2 target only, no update-env, cooldown/startup grace');

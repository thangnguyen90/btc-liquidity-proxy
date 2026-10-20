import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {createUserDataStreamHealth} from '../src/userDataStreamHealth.js';
const source=(await readFile(new URL('../src/positionMonitor.js',import.meta.url),'utf8'))
  .replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
let clock=1_000_000,seq=0;
const tasks=new Map(),sockets=[],fills=[],observed=[],reconnects=[];
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function timer(fn,delay,repeat=false){const obj={id:++seq,at:clock+delay,delay,fn,repeat,unref(){}};tasks.set(obj.id,obj);return obj;}
const clear=t=>tasks.delete(t?.id);
async function advance(ms){const end=clock+ms;await flush();for(let n=0;n<5000;n++){
  const next=[...tasks.values()].filter(t=>t.at<=end).sort((a,b)=>a.at-b.at||a.id-b.id)[0];
  if(!next)break;clock=next.at;if(next.repeat)next.at+=next.delay;else tasks.delete(next.id);
  next.fn();await flush();if(n===4999)throw Error('timer runaway');
}clock=end;await flush();}
class FakeWS extends EventEmitter{
  static OPEN=1;
  constructor(url){super();this.url=url;this.readyState=0;this.autoPong=true;sockets.push(this);
    if(url.includes('/private/ws/'))timer(()=>{if(this.readyState===3)return;this.readyState=1;this.emit('open');},1);
  }
  addEventListener(type,fn){this.on(type,fn);}
  ping(payload,cb){cb?.();if(this.autoPong)this.emit('pong',Buffer.from(payload));}
  terminate(){this.readyState=3;this.emit('close');}
}
let positions=[],order={symbol:'INJUSDT',orderId:123,side:'BUY',positionSide:'BOTH',type:'MARKET',status:'FILLED',time:1_020_000,updateTime:1_070_000,executedQty:'2',origQty:'2',avgPrice:'9.131'};
const factory=vm.runInNewContext(source+'\nstartPositionMonitor',{
  WebSocket:FakeWS,createUserDataStreamHealth:()=>createUserDataStreamHealth({now:()=>clock}),
  binancePositionPriceRoe:()=>0,Date:class extends Date{static now(){return clock;}},
  console:{log(){},warn(){},error(){}},setInterval:(fn,d)=>timer(fn,d,true),clearInterval:clear,
  setTimeout:(fn,d)=>timer(fn,d),clearTimeout:clear,
});
let monitor;
monitor=factory({client:{getPositions:async()=>positions,createListenKey:async()=>({listenKey:'test'}),
  keepAliveListenKey:async()=>({}),getUserTrades:async()=>[{orderId:123,time:order.updateTime}],getOrder:async()=>order},
  getCredentials:()=>({apiKey:'MOCK',apiSecret:'MOCK'}),onRoeUpdate(){},
  onOrderFill:async(symbol,fill)=>{fills.push({symbol,...fill});return {protectionComplete:true};},
  onFullFillObserved:async(symbol,fill)=>observed.push(fill),
  onUserDataReconnect:async info=>{reconnects.push(info);if(info.reconnected)await monitor.recoverMissedFullFills({since:1_000_000,createdAfter:1_000_000});},
});
await advance(10);
const privateSockets=()=>sockets.filter(s=>s.url.includes('/private/ws/'));
assert.equal(privateSockets().length,1);assert.equal(monitor.getStatus().userDataReady,true);
const stale=privateSockets()[0];stale.autoPong=false;
await advance(60_000);
assert.equal(privateSockets().length,2,'missing pong closes and reconnects actual monitor socket');
assert.equal(monitor.getStatus().userDataReconnectCount,1);
assert.equal(fills.length,0,'quiet/empty account never invents an order');
stale.emit('close');stale.emit('pong',Buffer.from('ud-health-1'));
await advance(5_000);assert.equal(privateSockets().length,2,'old socket callbacks cannot replace current socket');
// Real monitor REST sync sees a new position but receives no ACCOUNT_UPDATE.
positions=[{symbol:'INJUSDT',positionAmt:'2',entryPrice:'9.131',leverage:'10',positionSide:'BOTH',updateTime:order.updateTime}];
await advance(95_000);
assert.equal(privateSockets().length,3,'REST drift reconnects even with healthy pongs');
assert.equal(fills.length,1,'reconnect replays exact missed fill once');
assert.equal(fills[0].orderId,123);assert.ok(observed.some(f=>f.orderId===123));
assert.equal(monitor.getUserDataHealth().restartRequired,false);
console.log('PASS: actual monitor reconnect, stale socket isolation, REST drift with pongs, missed-fill replay, no invented orders');

import assert from 'node:assert/strict';
import {HeatmapLivePrice,HEATMAP_LIVE_PRICE_VERSION} from '../public/heatmap-live-price.js';
let now=1792649733262,nextTimer=0;const timeouts=new Map(),intervals=new Map(),sockets=[],ticks=[],states=[];
const timers={setTimeout(fn,ms){const id=++nextTimer;timeouts.set(id,{fn,ms});return id;},clearTimeout(id){timeouts.delete(id);},setInterval(fn){const id=++nextTimer;intervals.set(id,fn);return id;},clearInterval(id){intervals.delete(id);}};
class Socket{
 constructor(url){this.url=url;this.handlers={};sockets.push(this);}
 addEventListener(type,fn){this.handlers[type]=fn;}
 close(){this.closed=true;this.handlers.close?.();}
 message(row){this.handlers.message({data:typeof row==='string'?row:JSON.stringify(row)});}
}
const live=new HeatmapLivePrice({WebSocketImpl:Socket,location:{protocol:'https:',host:'example.test'},now:()=>now,timers,onTick:t=>ticks.push(t),onState:s=>states.push(s)});
const row=(overrides={})=>({type:'mark',symbol:'QUSDT',markPrice:.1,eventAt:now,source:'BINANCE_FUTURES_MARK_PRICE_SOCKET',...overrides});
live.setSelection('QUSDT');const first=sockets.at(-1);
assert.equal(first.url,'wss://example.test/ws/coin-level-analysis?symbol=QUSDT');assert.equal(states.at(-1),'connecting');
first.message({type:'ready',symbol:'QUSDT'});assert.equal(ticks.at(-1),null,'ready never fabricates a live price');
for(const invalid of ['oops',row({symbol:'ERAUSDT'}),row({eventAt:now-10001}),row({eventAt:now+2001}),row({eventAt:0}),row({markPrice:-1}),row({markPrice:'bad'}),row({markPrice:'Infinity'}),row({source:'REST'}),row({type:'heartbeat'})])first.message(invalid);
assert.equal(ticks.at(-1),null);
first.message(row());assert.deepEqual(ticks.at(-1),{symbol:'QUSDT',markPrice:.1,eventAt:now});assert.equal(states.at(-1),'live');
const count=ticks.length;first.message(row({markPrice:.3}));first.message(row({eventAt:now-1}));assert.equal(ticks.length,count,'duplicate/older events cannot overwrite a newer tick');
live.setSelection('QUSDT');assert.equal(sockets.length,1,'both models share one stream');
now+=11000;for(const fn of [...intervals.values()])fn();
assert.equal(ticks.at(-1),null,'silent socket clears stale overlay');assert.equal(states.at(-1),'stale');assert(first.closed);assert.equal(timeouts.size,1);assert.equal([...timeouts.values()][0].ms,1000);
const retry=[...timeouts.values()][0];timeouts.clear();retry.fn();const second=sockets.at(-1);assert.notEqual(second,first);
first.message(row({markPrice:8}));assert.equal(ticks.at(-1),null,'old connection callbacks are ignored');
second.message(row({source:'BINANCE_FUTURES_MARK_PRICE_SOCKET_CACHE'}));assert.equal(states.at(-1),'live','fresh server socket cache is explicitly accepted');
second.handlers.error();assert.equal(ticks.at(-1),null,'disconnect clears live price immediately');assert.equal(timeouts.size,1);
live.setSelection('龙虾USDT');assert.equal(timeouts.size,0);assert.match(sockets.at(-1).url,/symbol=%E9%BE%99%E8%99%BEUSDT$/);
second.message(row({markPrice:20}));assert.equal(ticks.at(-1),null,'old coin cannot leak into new selection');
sockets.at(-1).message(row({symbol:'龙虾USDT',markPrice:2,eventAt:++now}));assert.equal(ticks.at(-1).symbol,'龙虾USDT');
live.setSelection(null);assert.equal(intervals.size,0);assert.equal(timeouts.size,0);assert.equal(states.at(-1),'idle');assert.equal(ticks.at(-1),null);
live.setSelection('<bad>');assert.equal(live.symbol,null);
const unavailable=new HeatmapLivePrice({WebSocketImpl:Socket,location:{protocol:'file:'},onState:s=>states.push(s)});unavailable.setSelection('QUSDT');assert.equal(states.at(-1),'unavailable');
const failed=new HeatmapLivePrice({WebSocketImpl:class{constructor(){throw Error('blocked');}},location:{protocol:'https:',host:'example.test'},timers,onState:s=>states.push(s)});failed.setSelection('QUSDT');assert.equal(states.at(-1),'stale');failed.setSelection(null);assert.equal(timeouts.size,0);
assert.equal(HEATMAP_LIVE_PRICE_VERSION,'HEATMAP_SOCKET_MARK_OVERLAY_V1_20261022');
console.log('PASS Heatmap MARK socket: selection, one stream, strict freshness/source/order, Unicode, disconnect/stall/reconnect, generation cleanup and no external writes.');

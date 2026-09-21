import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CoinHorizonDiscordNotifier,collectHorizonDirectionEvent,buildHorizonDiscordPayload} from '../src/coinHorizonDiscord.js';
let now=Date.UTC(2026,8,6,12);
const make=(state='UP')=>({symbol:'TESTUSDT',generatedAt:new Date(now).toISOString(),market:{markPrice:100},trend:{frames:[
  {interval:'1h',state,atr14:2,closeTime:now-1},{interval:'4h',state,atr14:5,closeTime:now-1}
]},zones:{supports:[],resistances:[]}});
const dir=await mkdtemp(join(tmpdir(),'horizon-discord-'));
const stateFile=join(dir,'state.json');let calls=[];
const fetchImpl=async(url,opts)=>{calls.push(JSON.parse(opts.body));return {ok:true,status:204};};
const create=()=>new CoinHorizonDiscordNotifier({stateFile,webhookUrl:'https://discord.invalid/test',now:()=>now,fetchImpl});
let bot=create();
assert.equal(collectHorizonDirectionEvent(make(),now).side,'LONG');
assert.equal(collectHorizonDirectionEvent(make('DOWN'),now).side,'SHORT');
const mixed=make();mixed.trend.frames[1].state='DOWN';assert.equal(collectHorizonDirectionEvent(mixed,now),null);
const stale=make();stale.freshness={stale:true};assert.equal(collectHorizonDirectionEvent(stale,now),null);
const conflict=make();conflict.coinglass={available:true,combined:{liquidityBias:'LOWER_FIRST'},frames:[{range:'24h',scrapedAt:new Date(now).toISOString(),above:[],below:[]}]};
assert.equal(collectHorizonDirectionEvent(conflict,now),null);
const payload=buildHorizonDiscordPayload(collectHorizonDirectionEvent(make(),now));
assert.equal(payload.embeds[0].color,0x10b981);assert.equal(payload.embeds[0].fields.length,5);
assert.deepEqual(payload.allowed_mentions.parse,[]);
assert.ok(payload.embeds[0].fields.every(f=>f.value.length<=1024));
await Promise.all([bot.notify(make()),bot.notify(make())]);assert.equal(calls.length,1);
bot=create();assert.equal((await bot.notify(make())).reason,'deduped');assert.equal(calls.length,1);
assert.equal((await bot.notify(make('DOWN'))).sent,1);assert.equal(calls[1].embeds[0].color,0xef4444);
assert.equal((await bot.notify(make())).reason,'deduped');
now+=4*3600_000+1;assert.equal((await bot.notify(make('DOWN'))).sent,1);
assert.equal(JSON.parse(await readFile(stateFile,'utf8')).symbols.TESTUSDT.side,'SHORT');
let failCalls=0;
const failed=new CoinHorizonDiscordNotifier({stateFile:join(dir,'failed.json'),webhookUrl:'https://discord.invalid/test',now:()=>now,
  fetchImpl:async()=>{failCalls++;return {ok:false,status:429,json:async()=>({retry_after:120})};}});
await assert.rejects(failed.notify(make()),/HTTP 429/);
assert.equal((await failed.notify(make())).reason,'backoff');assert.equal(failCalls,1);
now+=121000;await assert.rejects(failed.notify(make()),/HTTP 429/);assert.equal(failCalls,2);
console.log('Coin horizon Discord tests passed (mock sends only)');

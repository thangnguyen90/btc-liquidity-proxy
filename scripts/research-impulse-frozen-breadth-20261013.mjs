// Exact snapshot join only; public research metadata, no order/state/file writes.
import {createReadStream} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
const saved=JSON.parse(await readFile('data/research/impulse-long-filter-input-20261013.json','utf8'));
const times=new Set(saved.rows.map(r=>r.btcAt)),snapshots=new Map(),hash=createHash('sha256');
const stream=createReadStream('data/liquid-market-direction-signal-log.ndjson');stream.on('data',chunk=>hash.update(chunk));
let lines=0,malformed=0;
for await(const line of createInterface({input:stream,crlfDelay:Infinity})){
  lines++;let row;try{row=JSON.parse(line);}catch{malformed++;continue;}
  const m=row.marketDirection,t=m?.evaluatedAt,loggedAt=Date.parse(row.loggedAt);
  if(!times.has(t)||!Number.isFinite(loggedAt)||loggedAt<t||!m.breadth||!m.btc)continue;
  const previous=snapshots.get(t);if(previous&&previous.loggedAt<=loggedAt)continue;
  snapshots.set(t,{loggedAt,evaluatedAt:t,version:m.version,aboveEma20Pct:m.breadth.aboveEma20Pct,
    up1hPct:m.breadth.up1hPct,alignedUpPct:m.breadth.alignedUpPct,btcTrend:m.btc.trend,
    btc1h:m.btc.ret1h,btc15m:m.btc.ret15m,sampleSize:m.sampleSize,label:m.label});
}
const joined=[],unmatched=[];
for(const r of saved.rows){const m=snapshots.get(r.btcAt);
  if(!m||m.loggedAt>r.entryAt||r.entryAt-m.evaluatedAt>120000||m.btcTrend!==r.btcTrend
    ||m.btc1h!==r.btc1h||m.btc15m!==r.btc15m||![m.aboveEma20Pct,m.up1hPct,m.alignedUpPct].every(Number.isFinite)){
    unmatched.push(r.id);continue;
  }
  joined.push({id:r.id,breadth:m});
}
process.stdout.write(JSON.stringify({sourceSha256:hash.digest('hex'),lines,malformed,joined,unmatched:unmatched.length}));

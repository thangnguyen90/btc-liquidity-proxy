// Independent raw-data replay of every published outcome and as-of feature.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const D='data/research/opposite-depth-filters-20261101',read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const events=await read(D+'/events.json'),summary=await read(D+'/results.json');let checked=0;
for(const e of events){const raw=await read(D+'/raw/'+e.id+'-price.json'),rr=await read(D+'/raw/'+e.id+'-position.json');
 const before=raw.filter(b=>Number(b[6])<e.at),last=before.at(-1);
 for(const[n,key]of [[12,'r1'],[288,'r24']]){const p=before.find(b=>+b[0]===+last[0]-n*300000);if(p)assert.ok(Math.abs(e[key]-(Number(last[4])/Number(p[4])-1)*100)<1e-8);else assert.equal(e[key],null);}
 if(e.ratio){assert.ok(e.ratio.at<=e.at-900000);const a=rr.find(r=>+r.timestamp===e.ratio.at),b=rr.find(r=>+r.timestamp===e.ratio.at-3600000);assert.ok(a&&b);assert.ok(Math.abs(e.ratio.delta-(Number(a.longShortRatio)-Number(b.longShortRatio)))<1e-10);}
 for(const [key,hs]of Object.entries(e.outcomes))for(const[h,v]of Object.entries(hs)){if(!v)continue;const isRetest=key.includes('RETEST')||key==='SL_ALL',t=isRetest?e.retestAt:e.entryAt;assert.ok(t>=e.at);const bars=raw.filter(b=>+b[0]>=t).slice(0,Number(h)*12);assert.equal(bars.length,Number(h)*12);assert.ok(+bars.at(-1)[6]<summary.manifest.frozenAt);bars.forEach((b,i)=>assert.equal(+b[0],t+i*300000));
 const entry=+bars[0][1],sign=e.side==='SHORT'?-1:1,sl=key!=='BASE_NO_SL',stop=entry*(1-sign*(sl?20:100)/300),target=entry*(1+sign*10/300);let exit=+bars.at(-1)[4],why='TIMEOUT';for(const b of bars){if(sign===-1?+b[2]>=stop:+b[3]<=stop){exit=sign===-1?Math.max(stop,+b[1]):Math.min(stop,+b[1]);why=sl?'SL':'LIQ_PROXY';break;}if(sign===-1?+b[3]<=target:+b[2]>=target){exit=target;why='TP';break;}}
 assert.equal(v.reason,why);assert.ok(Math.abs(v.roe-(sign*(exit-entry)/entry*300-.36))<1e-8);checked++;
 }
}
// Aggregates independently checked, including each filtered cohort's matched baselines.
for(const side of ['ALL','LONG','SHORT'])for(const[k,hs]of Object.entries(summary.stats[side]))for(const[h,st]of Object.entries(hs)){const rows=events.filter(e=>(side==='ALL'||e.side===side)&&e.outcomes[k]?.[h]);assert.equal(st.n,rows.length);if(rows.length)assert.ok(Math.abs(st.mean-rows.reduce((s,e)=>s+e.outcomes[k][h].roe,0)/rows.length)<1e-9);}
const validation={pass:true,events:events.length,outcomesChecked:checked,checks:['closed data features','ratio >=15m lag and continuous1h delta','next full bar entry','contiguous mature horizons','independent SL/TP/gap replay','aggregate means and counts']};await fs.writeFile(D+'/validation.json',JSON.stringify(validation,null,2));console.log(JSON.stringify(validation));

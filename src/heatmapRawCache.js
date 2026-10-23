import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
export const HEATMAP_RAW_CACHE_VERSION='HEATMAP_RAW_WINDOW_CACHE_V1_20261020';
export const HEATMAP_FULL_REFRESH_MS=30*60000;
const symbolOk=s=>/^[\p{L}\p{N}]{1,32}USDT$/u.test(s??'');
export function validHeatmapRawCache(c,symbol){
 return !!c&&c.version===HEATMAP_RAW_CACHE_VERSION&&c.symbol===symbol&&symbolOk(symbol)&&c.step===300000
  &&[c.from,c.end,c.savedAt,c.fullLoadedAt].every(Number.isFinite)&&c.from<c.end&&c.from%300000===0&&c.end%300000===0&&c.end<=c.savedAt&&c.fullLoadedAt>0&&c.fullLoadedAt<=c.savedAt
  &&['price','mark','oi'].every(k=>Array.isArray(c[k])&&c[k].length>=3&&c[k].length<=500)
  &&['price','mark'].every(k=>c[k].every(r=>Array.isArray(r)&&r.length>=8&&Number.isFinite(Number(r[0]))&&Number.isFinite(Number(r[6]))))
  &&c.oi.every(r=>r&&Number.isFinite(Number(r.timestamp))&&Number.isFinite(Number(r.sumOpenInterest))&&Number(r.sumOpenInterest)>0);
}
// Merge raw inputs, not model state. Replaying the identical 36h window preserves
// the original pool births/sweeps/decay and OI baseline exactly.
export function mergeHeatmapRawRows(oldRows,newRows,timeOf,from,end){
 const rows=new Map();
 for(const r of [...oldRows,...newRows]){const t=Number(timeOf(r));if(Number.isFinite(t)&&t>=from&&t<end)rows.set(t,r);}
 return [...rows.entries()].sort((a,b)=>a[0]-b[0]).map(([,r])=>r);
}
export class HeatmapRawCache{
 constructor(directory){this.directory=directory;this.memory=new Map();this.reads=new Map();this.error=null;this.hits=0;this.diskHits=0;this.writes=0;this.invalid=0;}
 async get(symbol){
  if(!symbolOk(symbol))throw Error('INVALID_HEATMAP_CACHE_SYMBOL');
  if(this.memory.has(symbol)){this.hits++;return this.memory.get(symbol);}
  if(!this.directory)return null;
  if(this.reads.has(symbol))return this.reads.get(symbol);
  const p=(async()=>{try{
   const raw=await readFile(join(this.directory,symbol+'.json'),'utf8');if(raw.length>1024*1024)throw Error('cache too large');
   const c=JSON.parse(raw);if(!validHeatmapRawCache(c,symbol))throw Error('invalid cache');
   this.memory.set(symbol,c);this.trim();this.diskHits++;return c;
  }catch(e){if(e.code!=='ENOENT'){this.invalid++;this.error='CACHE_READ_INVALID_USE_FRESH_REST';}return null;}
  finally{this.reads.delete(symbol);}})();this.reads.set(symbol,p);return p;
 }
 trim(){while(this.memory.size>700)this.memory.delete(this.memory.keys().next().value);}
 async put(c){
  if(!validHeatmapRawCache(c,c?.symbol))throw Error('INVALID_HEATMAP_CACHE_INPUT');
  this.memory.set(c.symbol,c);this.trim();if(!this.directory)return;
  try{await mkdir(this.directory,{recursive:true});const file=join(this.directory,c.symbol+'.json'),tmp=file+'.tmp-'+process.pid;
   await writeFile(tmp,JSON.stringify(c));await rename(tmp,file);this.writes++;this.error=null;
  }catch{this.error='CACHE_WRITE_FAILED_RAM_ONLY';}
 }
 snapshot(){return {version:HEATMAP_RAW_CACHE_VERSION,enabled:!!this.directory,memory:this.memory.size,diskHits:this.diskHits,writes:this.writes,invalid:this.invalid,error:this.error};}
}

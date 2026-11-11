// Public GET data acquisition only. No trading or notification modules.
import fs from 'node:fs/promises';
const dir='data/research/pump-high-whale-turn-20261103',read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const m=await read(dir+'/manifest.json');let next=0,done=0,calls=0;const errors=[];
for(const {symbol}of m.candidates){
 const p=dir+'/raw/'+encodeURIComponent(symbol)+'-chart.json';
 try{await read(p);}catch(e){
  if(e.code!=='ENOENT')throw e;
  try{
   await new Promise(r=>setTimeout(r,Math.max(0,next-Date.now())));next=Date.now()+1200;
   const response=await fetch('https://pumpglass.com/smart-money/api/chart?'+new URLSearchParams({symbol,since:Math.floor((m.start-5*3600000)/1000),until:Math.floor(m.end/1000)}),{redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)});calls++;
   if([403,418,429].includes(response.status))throw Error('STOP_HTTP_'+response.status);
   if(!response.ok)throw Error('HTTP_'+response.status);
   const x=await response.json();if(x.symbol!==symbol||!Array.isArray(x.whales)||!Array.isArray(x.crowd))throw Error('INVALID_CHART');
   await fs.writeFile(p,JSON.stringify({...x,downloadedAt:Date.now()}));
  }catch(err){errors.push({symbol,error:err.message});if(err.message.startsWith('STOP_')){await fs.writeFile(dir+'/progress.json',JSON.stringify({done,calls,total:m.candidates.length,errors,stopped:true}));throw err;}}
 }
 done++;if(done%10===0||done===m.candidates.length){const state={done,calls,total:m.candidates.length,errors,at:Date.now()};await fs.writeFile(dir+'/progress.json',JSON.stringify(state));console.log(JSON.stringify({...state,errors:errors.length}));}
}

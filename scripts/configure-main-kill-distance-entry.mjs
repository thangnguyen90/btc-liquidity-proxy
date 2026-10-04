// Explicit operator action only; never invoked by server startup.
import {fileURLToPath} from 'node:url';
import {AutoEntryControls} from '../src/autoEntryControls.js';
import {MAIN_DISTANCE_ROUTES} from '../src/mainKillDistanceEntry.js';
const controls=new AutoEntryControls(fileURLToPath(new URL('../data/auto-entry-controls.json',import.meta.url)));
const enabled=process.argv.includes('--enable')?true:process.argv.includes('--disable')?false:null;
for(const route of MAIN_DISTANCE_ROUTES){
  const r=controls.register(route);
  if(enabled!==null)controls.update({action:'route',key:r.key,enabled});
}
const state=controls.read();
console.log(JSON.stringify({masterEnabled:state.enabled,routes:MAIN_DISTANCE_ROUTES.map(route=>{
  const r=controls.register(route),saved=state.routes[r.key];return {side:route.side,key:r.key,enabled:saved?.enabled,enabledAt:saved?.enabledAt};
})},null,2));

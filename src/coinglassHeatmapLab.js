import {HEATMAP_LAB_VERSION,heatmapQuery} from '../public/coinglass-heatmap-model.js';
import {heatmapRangePlan,normalizeBinanceHeatmapCandles,buildBinanceLocalHeatmap,BINANCE_HEATMAP_MODEL_VERSION} from './binanceHeatmapModel.js';
import {deriveHeatmapEntryScenarios} from './heatmapEntryScenarios.js';
export const HEATMAP_CHART_LOAD_VERSION='HEATMAP_INTERACTIVE_FIRST_LOAD_V1_20261020';
// Chart reads precede background scans (6+), never account/order/protection (<=5).
export const HEATMAP_CHART_REQUEST_PRIORITY=5.5;
const messages={BINANCE_UNAVAILABLE:'Chưa tải được nến Binance. Hãy thử lại sau.',RATE_LIMIT:'Đang giới hạn tải; thử lại sau một phút.',INSUFFICIENT_OI:'Thiếu lịch sử OI hợp lệ cho Model 3. Không thay bằng volume hoặc dữ liệu giả.',INSUFFICIENT_OR_STALE_CANDLES:'Chưa đủ nến đóng mới để dựng chart.',INVALID_OR_GAPPED_CANDLES:'Nến có khoảng trống hoặc dữ liệu không hợp lệ; chưa dựng heatmap.'};
// Historical URL/class retained for bookmarks. This implementation never calls CoinGlass.
export class CoinglassHeatmapLab{
  constructor({loadKlines,loadMarkKlines,loadOi,now=Date.now}={}){Object.assign(this,{loadKlines,loadMarkKlines,loadOi,now});this.cache=new Map();this.inflight=new Map();this.requests=[];}
  status(){return {version:HEATMAP_LAB_VERSION,calculationVersion:BINANCE_HEATMAP_MODEL_VERSION,loadPolicyVersion:HEATMAP_CHART_LOAD_VERSION,source:'BINANCE_LOCAL',requiresCoinglassApi:false,observeOnly:true,affectsOrders:false};}
  async compare(input){
    const q=heatmapQuery(input),key=q.symbol+':'+q.range,now=this.now(),cached=this.cache.get(key);
    if(cached&&now>=cached.at&&now-cached.at<120000&&cached.value?.models?.every(m=>m.status==='OK'))return {...cached.value,cached:true};
    if(this.inflight.has(key))return this.inflight.get(key);
    const fail=(model,status)=>({model,status,message:messages[status]??'Không đủ dữ liệu để dựng model này.',data:null});
    this.requests=this.requests.filter(t=>now-t<60000);
    if(this.requests.length>=6)return {...this.status(),symbol:q.symbol,range:q.range,models:[1,3].map(m=>fail(m,'RATE_LIMIT'))};
    if(!this.loadKlines)return {...this.status(),symbol:q.symbol,range:q.range,models:[1,3].map(m=>fail(m,'BINANCE_UNAVAILABLE'))};
    this.requests.push(now);
    const pending=(async()=>{
      const plan=heatmapRangePlan(q.range,now),params={symbol:q.symbol,interval:plan.interval,startTime:plan.from,endTime:plan.end-1,limit:499};
      const oiFrom=Math.max(plan.from,now-29.9*86400000);
      const responses=await Promise.allSettled([
        this.loadKlines(params),this.loadMarkKlines?this.loadMarkKlines(params):Promise.reject(Error('NO_MARK')),
        this.loadOi?this.loadOi({symbol:q.symbol,period:plan.period,startTime:Math.ceil(oiFrom),endTime:plan.end-1,limit:500}):Promise.reject(Error('NO_OI')),
      ]);
      let candles,markRows=[];
      try{if(responses[0].status!=='fulfilled')throw Error('BINANCE_UNAVAILABLE');candles=normalizeBinanceHeatmapCandles(responses[0].value,plan);}
      catch(e){return {...this.status(),symbol:q.symbol,range:q.range,models:[1,3].map(m=>fail(m,e.message))};}
      try{if(responses[1].status==='fulfilled')markRows=normalizeBinanceHeatmapCandles(responses[1].value,plan);}catch{/* explicitly reported fallback in inputs */}
      const oiRows=responses[2].status==='fulfilled'?responses[2].value:[];
      const models=[1,3].map(model=>{
        try{return {model,status:'OK',data:buildBinanceLocalHeatmap({query:q,plan,candles,markRows,oiRows,model,now})};}
        catch(e){return fail(model,e.message);}
      });
      const scenarios=deriveHeatmapEntryScenarios({models,candles,step:plan.step,now,symbol:q.symbol,range:q.range});
      return {...this.status(),symbol:q.symbol,range:q.range,models,scenarios};
    })().catch(()=>({...this.status(),symbol:q.symbol,range:q.range,models:[1,3].map(m=>fail(m,'BINANCE_UNAVAILABLE'))}))
      .then(value=>{if(value.models?.every(m=>m.status==='OK')){this.cache.set(key,{at:this.now(),value});while(this.cache.size>4)this.cache.delete(this.cache.keys().next().value);}return value;}).finally(()=>this.inflight.delete(key));
    this.inflight.set(key,pending);return pending;
  }
  async get(input){const q=heatmapQuery(input);return (await this.compare(q)).models.find(m=>m.model===q.model);}
}

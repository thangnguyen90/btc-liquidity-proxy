import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {loadEnv} from '../src/env.js';
import {BinanceClient} from '../src/binanceClient.js';
import {NewBotTakeProfitLedger,resolveFrozenNewBotTakeProfit} from '../src/newBotTakeProfitPolicy.js';

loadEnv();const keep=setInterval(()=>{},1000);
try{
  const dir='data/research/tp5-fill-race-fix-20261108',symbol='4USDT';
  const before=JSON.parse(await fs.readFile(dir+'/before.json'));
  const expectedOld=before.rows.find(r=>r.symbol===symbol),old=expectedOld.tp[0];
  assert.equal(old.id,3000002328093430);assert.equal(old.trigger,.009212);
  const client=new BinanceClient(),auth={apiKey:process.env.BINANCE_API_KEY,apiSecret:process.env.BINANCE_API_SECRET};
  const rows=x=>Array.isArray(x)?x:x.orders??[];
  const [positions,ar,info,premium]=await Promise.all([client.getPositions(auth),client.getOpenAlgoOrders({symbol,...auth}),client.get('/fapi/v1/exchangeInfo'),client.getPremiumIndex(symbol)]);
  const pos=positions.find(p=>p.symbol===symbol&&+p.positionAmt!==0),algos=rows(ar);
  assert.ok(pos);assert.equal(+pos.entryPrice,expectedOld.entry);assert.equal(+pos.positionAmt,expectedOld.amt);assert.equal(+pos.leverage,3);
  const ledger=new NewBotTakeProfitLedger({file:'data/new-bot-tp-policy-ledger.json',readPolicy:()=>null});
  const audit=JSON.parse(await fs.readFile('data/binance-filled-signal-audit/state.json'));
  const proof=ledger.positionProof(symbol,pos,audit.fills);assert.ok(proof);assert.equal(proof.source,'pump-squeeze-sell-flow-short');
  const correct=resolveFrozenNewBotTakeProfit({proof,side:'SHORT',entryPrice:+pos.entryPrice,leverage:+pos.leverage});
  const meta=info.symbols.find(s=>s.symbol===symbol),filter=meta.filters.find(f=>f.filterType==='PRICE_FILTER'),tick=+filter.tickSize;
  const decimals=filter.tickSize.replace(/0+$/,'').split('.')[1]?.length??0;
  const target=(Math.round(correct.takeProfitPrice/tick)*tick).toFixed(decimals);
  assert.ok(+premium.markPrice>+target,'Target already crossed; do not submit an immediate close');
  const prior=algos.find(a=>a.algoId===old.id);assert.ok(prior);assert.equal(+prior.triggerPrice,old.trigger);assert.equal(prior.side,'BUY');
  assert.equal(prior.orderType,'TAKE_PROFIT_MARKET');assert.ok(prior.closePosition);
  const stops=algos.filter(a=>a.orderType==='STOP_MARKET');assert.ok(stops.length,'Do not repair without an existing SL');
  const clientAlgoId='tp5fix_'+crypto.createHash('sha256').update(proof.symbol+':'+ledger.state.entries[expectedOld.tracking.entryClientOrderId].orderId).digest('hex').slice(0,24);
  const params={algoType:'CONDITIONAL',symbol,side:'BUY',type:'TAKE_PROFIT_MARKET',triggerPrice:target,workingType:prior.workingType,closePosition:'true',priceProtect:String(prior.priceProtect===true),clientAlgoId,recvWindow:5000};
  if(pos.positionSide!=='BOTH')params.positionSide=pos.positionSide;
  const plan={at:Date.now(),symbol,entry:+pos.entryPrice,amount:+pos.positionAmt,leverage:3,oldId:old.id,oldPrice:old.trigger,newPrice:+target,newRoe:(1-+target/+pos.entryPrice)*300,slIds:stops.map(a=>a.algoId),params};
  if(!process.argv.includes('--apply')){console.log(JSON.stringify({dryRun:true,...plan}));process.exitCode=0;}
  else{
    const journal=dir+'/repair.json';
    try{await fs.access(journal);throw Error('Repair reservation exists. Reconcile before any retry.');}catch(e){if(e.code!=='ENOENT')throw e;}
    const save=async x=>{await fs.writeFile(journal+'.tmp',JSON.stringify(x,null,2));await fs.rename(journal+'.tmp',journal);};
    await save({...plan,status:'SENDING_NEW_TP'});
    let result;
    try{result=await client.placeAlgoOrder({params,...auth});}
    catch(e){
      if(e.code!==-4130){await save({...plan,status:'NEW_TP_UNCONFIRMED',errorCode:e.code??null,error:e.message});throw e;}
      // Definitive duplicate close-all rejection: use the exact current quantity
      // with reduceOnly while leaving the original TP and SL on the exchange.
      const next={...params,quantity:String(Math.abs(+pos.positionAmt)),reduceOnly:'true'};delete next.closePosition;
      await save({...plan,status:'CLOSE_ALL_REJECTED_TRY_EXACT_REDUCE_ONLY',rejectedCode:e.code,params:next});
      try{result=await client.placeAlgoOrder({params:next,...auth});}catch(err){await save({...plan,status:'NEW_TP_UNCONFIRMED',errorCode:err.code??null,error:err.message});throw err;}
    }
    let fresh=rows(await client.getOpenAlgoOrders({symbol,...auth}));
    const created=fresh.find(a=>a.clientAlgoId===clientAlgoId&&+a.triggerPrice===+target&&a.side==='BUY'&&a.orderType==='TAKE_PROFIT_MARKET');
    assert.ok(created,'Do not cancel prior TP until replacement is confirmed');
    await save({...plan,status:'NEW_TP_CONFIRMED',newAlgoId:created.algoId});
    const current=(await client.getPositions(auth)).find(p=>p.symbol===symbol&&+p.positionAmt!==0);
    assert.ok(current&&+current.entryPrice===+pos.entryPrice&&+current.positionAmt===+pos.positionAmt,'Lifecycle changed; retain prior protection');
    await client.cancelAlgoOrder({algoId:old.id,...auth});
    fresh=rows(await client.getOpenAlgoOrders({symbol,...auth}));
    assert.ok(!fresh.some(a=>a.algoId===old.id));assert.ok(fresh.some(a=>a.algoId===created.algoId&&+a.triggerPrice===+target));
    for(const sl of stops)assert.ok(fresh.some(a=>a.algoId===sl.algoId&&a.triggerPrice===sl.triggerPrice),'SL changed unexpectedly');
    const done={...plan,status:'REPAIRED',newAlgoId:created.algoId,at:Date.now(),newConfirmed:true,oldCanceled:true,slUnchanged:true};await save(done);console.log(JSON.stringify(done));
  }
}finally{clearInterval(keep);}

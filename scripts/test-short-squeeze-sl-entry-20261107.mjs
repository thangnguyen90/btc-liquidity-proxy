import assert from 'node:assert/strict';
import {replayClosedBE,replayTouchRange} from './research-short-squeeze-sl-entry-20261107.mjs';
const e={symbol:'TESTUSDT',entryAt:0},base={leverage:3,tpRoe:10,slRoe:20,beTriggerRoe:3,costPct:.14,stressCostPct:.30},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,JSON.stringify({a,b}));
function bars(custom={}){let previous=100;return Array.from({length:480},(_,i)=>{const [o,h,l,c]=custom[i]??[previous,previous+.001,previous-.001,previous];previous=c;return[i*60000,String(o),String(h),String(l),String(c),'10',(i+1)*60000-1,'1000',100,'5','500','0'];});}
let raw=bars({0:[100,100.2,98.8,99],1:[99,100.1,98.9,99]});let r=replayClosedBE(raw,e,base);assert.equal(r.kind,'ENTRY_SL');assert.equal(r.armedAt,60000);near(r.netRoe,-.42);
raw=bars({0:[100,107,96,100]});r=replayClosedBE(raw,e,{...base,beTriggerRoe:null});assert.equal(r.kind,'INITIAL_SL');near(r.netRoe,-20.42);let range=replayTouchRange(raw,e,{...base,beTriggerRoe:null});near(range.worst.netRoe,-20.42);near(range.best.netRoe,9.58);
raw=bars({0:[100,101,98.5,100],1:[100,102,99.5,101]});r=replayClosedBE(raw,e,base);assert.equal(r.kind,'TIME');assert.equal(r.armed,false);range=replayTouchRange(raw,e,base);near(range.worst.netRoe,-.42);
raw=bars({0:[100,100.5,96,99]});r=replayClosedBE(raw,e,base);assert.equal(r.kind,'TP');range=replayTouchRange(raw,e,base);near(range.worst.netRoe,-.42);near(range.best.netRoe,9.58);assert.equal(range.uncertain,true);
raw=bars({0:[100,100.1,98.8,99],1:[102,102.1,101.5,101.7]});r=replayClosedBE(raw,e,base);assert.equal(r.kind,'ENTRY_SL_GAP');near(r.netRoe,-6.42);
raw=bars({479:[100,100.1,98.8,99]});r=replayClosedBE(raw,e,base);assert.equal(r.armed,false);assert.equal(r.kind,'TIME');near(r.netRoe,2.58);
raw=bars({0:[100,102,99,100]});r=replayClosedBE(raw,e,{...base,slRoe:5,beTriggerRoe:null});assert.equal(r.kind,'INITIAL_SL');near(r.netRoe,-5.42);
raw=bars();r=replayClosedBE(raw,e,{...base,beTriggerRoe:null},[{symbol:'TESTUSDT',fundingTime:3600000,fundingRate:.001,markPrice:100}]);near(r.netRoe,-.12);near(r.stressRoe,-.60);
console.log('PASS: BE fees, next-minute activation, SL-first, same-minute trigger/TP/rebound, adverse gap, no future activation, smaller SL, short funding sign.');


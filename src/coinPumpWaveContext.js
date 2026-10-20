const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;

// All 30 rows precede the flush. Shared by dump warnings and recovery alerts.
export function coinPumpWaveContext(prior=[]) {
  if(prior.length!==30)return null;
  const base=prior.slice(0,20),wave=prior.slice(20);
  const baseline=mean(base.map(r=>r.quoteVolume)),waveVolume=mean(wave.map(r=>r.quoteVolume));
  if(!(baseline>0&&waveVolume>0))return null;
  const atr=mean(prior.map((r,i)=>Math.max(r.high-r.low,
    Math.abs(r.high-(prior[i-1]?.close??r.open)),Math.abs(r.low-(prior[i-1]?.close??r.open)))));
  const atrPct=atr/wave.at(-1).close*100,waveGain=(wave.at(-1).close/wave[0].open-1)*100;
  const maEarly=mean(wave.slice(0,5).map(r=>r.quoteVolume)),maLate=mean(wave.slice(5).map(r=>r.quoteVolume));
  const green=wave.filter(r=>r.close>r.open).length;
  const higher=wave.filter((r,i)=>r.close>(wave[i-1]?.close??r.open)).length;
  const elevated=wave.filter(r=>r.quoteVolume>=baseline*1.2).length;
  const peak=Math.max(...wave.map(r=>r.high));
  const pumped=waveGain>=Math.max(1.5,atrPct*3)&&waveVolume/baseline>=1.5&&maEarly>0&&maLate/maEarly>=1.2
    &&green>=6&&higher>=6&&elevated>=6&&wave.at(-1).close>=peak*.997;
  return {pumped,baseline,waveVolume,atr,atrPct,waveGain,maEarly,maLate,green,higher,elevated,
    support:Math.min(...wave.slice(-3).map(r=>r.low)),prior,wave};
}

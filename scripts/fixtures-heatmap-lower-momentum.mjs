export function lowerMomentumInputs(event){
 const step=300000,end=Math.floor(event.at/step)*step;
 return {event,now:event.observedAt,coinReadAt:event.observedAt,coinRows:Array.from({length:21},(_,i)=>{const t=end-(21-i)*step,p=120-i;return [t,p+.5,p+1,p-.05,p,100,t+step-1,i===20?2000:1000];})};
}

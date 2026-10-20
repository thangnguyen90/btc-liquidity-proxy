export const PUSH_QUIET_HOURS_VERSION='WEB_PUSH_QUIET_HOURS_V1_VN_20261012';
export const PUSH_QUIET_HOURS_DEFAULT=Object.freeze({enabled:true,start:'00:00',end:'06:00',timeZone:'Asia/Ho_Chi_Minh'});
const clock=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const minutes=value=>Number(value.slice(0,2))*60+Number(value.slice(3));
export function normalizePushQuietHours(value) {
  if(!value||typeof value.enabled!=='boolean'||typeof value.start!=='string'||typeof value.end!=='string'
    ||!clock.test(value.start)||!clock.test(value.end)||value.start===value.end
    ||value.timeZone!=null&&value.timeZone!==PUSH_QUIET_HOURS_DEFAULT.timeZone)throw Error('INVALID_PUSH_QUIET_HOURS');
  return {enabled:value.enabled,start:value.start,end:value.end,timeZone:PUSH_QUIET_HOURS_DEFAULT.timeZone};
}
const vnMillis=now=>((now+7*3600000)%86400000+86400000)%86400000;
export function isPushQuietNow(rule,now=Date.now()) {
  if(!rule?.enabled)return false;
  const current=vnMillis(now)/60000,start=minutes(rule.start),end=minutes(rule.end);
  return start<end?current>=start&&current<end:current>=start||current<end;
}
export function pushTtlBeforeQuiet(rule,now,ttl) {
  if(!rule?.enabled)return ttl;
  if(isPushQuietNow(rule,now))return 0;
  const remaining=(minutes(rule.start)*60000-vnMillis(now)+86400000)%86400000;
  return Math.max(0,Math.min(ttl,Math.floor(remaining/1000)));
}

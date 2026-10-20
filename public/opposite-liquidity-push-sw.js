const SIGNAL_TYPE = 'LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH';
const MANUAL_PRICE_SIGNAL_TYPE = 'MANUAL_BINANCE_PRICE_ALERT';
const DISCORD_ROUTE_PREFIX = 'DISCORD_ROUTE:';
const BTC_ALT_ICONS={BTC_NEUTRAL_ALT_STRONG:'neutral-strong',BTC_NEUTRAL_ALT_WEAK:'neutral-weak',BTC_UP_ALT_STRONG:'up-strong',BTC_UP_ALT_LAGGING:'up-lagging',WEAK_REBOUND:'weak',FRAGILE_REBOUND:'fragile',BTC_DOWN_ALT_RESILIENT:'down-resilient',BTC_DOWN_ALT_WEAK:'down-weak'};
// Apply notification allowlist updates without waiting for every dashboard tab to close.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

const allowedSignalType = value => value === SIGNAL_TYPE
  || value === MANUAL_PRICE_SIGNAL_TYPE
  || value === 'BINANCE_LIQUIDITY_ZONE_LIFECYCLE'
  || value === 'BINANCE_FUTURES_CONTRACT_RISK'
  || value === 'BTC_ALT_WICK_RECOVERY_1M'
  || value === 'COIN_PUMP_WICK_RECOVERY_1M'
  || value === 'COIN_PUMP_WICK_EARLY_1M'
  || value === 'COIN_PUMP_VOLUME_LONG_FLUSH_1M'
  || value === 'BINANCE_SHORT_SETUP_WATCH'
  || value === 'BTC_WEAK_ALT_REBOUND'
  || value === 'BTC_ALT_MARKET_STATE'
  || value === 'PUMP_TURN_NEAR_SHORT'
  || String(value ?? '').startsWith(DISCORD_ROUTE_PREFIX);

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json?.() ?? {}; } catch { data = {}; }
  if (!allowedSignalType(data.signalType) || !data.eventId) return;
  if(data.signalType==='BTC_ALT_MARKET_STATE'&&!Object.hasOwn(BTC_ALT_ICONS,data.state))return;
  if (['BTC_ALT_WICK_RECOVERY_1M','COIN_PUMP_WICK_RECOVERY_1M','COIN_PUMP_WICK_EARLY_1M','COIN_PUMP_VOLUME_LONG_FLUSH_1M','BINANCE_SHORT_SETUP_WATCH','BTC_WEAK_ALT_REBOUND','BTC_ALT_MARKET_STATE','PUMP_TURN_NEAR_SHORT'].includes(data.signalType) && !(Number(data.expiresAt) > Date.now())) return;
  const icon=data.signalType==='BTC_ALT_MARKET_STATE'?`/btc-alt-state-${BTC_ALT_ICONS[data.state]}.svg`:data.signalType==='BTC_WEAK_ALT_REBOUND'?'/weak-alt-rebound-icon.svg':'/opposite-liquidity-icon.svg';
  const side = data.side === 'LONG' ? 'LONG' : 'SHORT';
  event.waitUntil(self.registration.showNotification(
    data.title || `${side === 'LONG' ? '🔴' : '🟢'} ${side} · ${data.symbol || 'UNKNOWN'}`,
    {
      body: data.body || `${data.interval || '—'} · tín hiệu thanh khoản ngược chiều`,
      tag: `${data.signalType}:${data.eventId}`,
      renotify: false,
      requireInteraction: false,
      icon,
      badge:icon,
      vibrate: [180, 90, 180],
      data: {
        signalType: data.signalType,
        eventId: data.eventId,
        url: data.url || '/opposite-liquidity-manager',
      },
    },
  ));
});

self.addEventListener('notificationclick', (event) => {
  const data = event.notification?.data ?? {};
  if (!allowedSignalType(data.signalType)) return;
  event.notification.close();
  const targetUrl = new URL(data.url || '/opposite-liquidity-manager', self.location.origin);
  if(data.signalType==='PUMP_TURN_NEAR_SHORT'){
    targetUrl.href=new URL('/pump-turn-watch',self.location.origin).href;
    targetUrl.searchParams.set('signal',data.eventId);targetUrl.hash='signals';
  }
  if(['BTC_WEAK_ALT_REBOUND','BTC_ALT_MARKET_STATE'].includes(data.signalType)){
    targetUrl.href=new URL('/local-ai-trend-evaluation',self.location.origin).href;
    targetUrl.searchParams.set('weakAlt',data.eventId);targetUrl.hash='weak-alt-rebound';
  }
  if(data.signalType==='BINANCE_LIQUIDITY_ZONE_LIFECYCLE'){
    // Old notifications also carry eventId even when their original URL only had symbol.
    targetUrl.href=new URL('/liquidity-zone-manager'+targetUrl.search,self.location.origin).href;
    targetUrl.searchParams.set('notification',data.eventId);
    const watch=/^zone:([^:]+):/.exec(data.eventId)?.[1];
    const attempt=/^main-distance:([^:]+):/.exec(data.eventId)?.[1];
    if(watch)targetUrl.searchParams.set('watch',watch);
    if(attempt)targetUrl.searchParams.set('attempt',attempt);
  }
  const target = targetUrl.href;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = clients.find(client => client.url.startsWith(self.location.origin));
    if (existing) {
      await existing.focus();
      if ('navigate' in existing) await existing.navigate(target);
      return;
    }
    await self.clients.openWindow(target);
  })());
});

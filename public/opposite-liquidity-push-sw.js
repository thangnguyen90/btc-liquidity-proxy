const SIGNAL_TYPE = 'LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH';

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json?.() ?? {}; } catch { data = {}; }
  if (data.signalType !== SIGNAL_TYPE || !data.eventId) return;
  const side = data.side === 'LONG' ? 'LONG' : 'SHORT';
  event.waitUntil(self.registration.showNotification(
    data.title || `${side === 'LONG' ? '🔴' : '🟢'} ${side} · ${data.symbol || 'UNKNOWN'}`,
    {
      body: data.body || `${data.interval || '—'} · tín hiệu thanh khoản ngược chiều`,
      tag: `${SIGNAL_TYPE}:${data.eventId}`,
      renotify: false,
      requireInteraction: false,
      icon: '/opposite-liquidity-icon.svg',
      badge: '/opposite-liquidity-icon.svg',
      vibrate: [180, 90, 180],
      data: {
        signalType: SIGNAL_TYPE,
        eventId: data.eventId,
        url: data.url || '/opposite-liquidity-manager',
      },
    },
  ));
});

self.addEventListener('notificationclick', (event) => {
  const data = event.notification?.data ?? {};
  if (data.signalType !== SIGNAL_TYPE) return;
  event.notification.close();
  const target = new URL(data.url || '/opposite-liquidity-manager', self.location.origin).href;
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

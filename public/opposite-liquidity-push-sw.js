const SIGNAL_TYPE = 'LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH';

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

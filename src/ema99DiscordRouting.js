export const EMA99_DISCORD_TIMEFRAME_SPLIT_VERSION = 'EMA99_DISCORD_TIMEFRAME_SPLIT_V1_20260911';

export function ema99DiscordChannelForInterval(interval) {
  const timeframe = String(interval ?? '').trim().toLowerCase();
  if (timeframe === '5m' || timeframe === '15m') return timeframe;
  return null;
}

export function ema99DiscordAnyWebhookConfigured(env = process.env) {
  return Boolean(
    String(env?.POST_PUMP_EMA99_DISCORD_WEBHOOK_URL ?? '').trim()
    || String(env?.POST_PUMP_EMA99_15M_DISCORD_WEBHOOK_URL ?? '').trim(),
  );
}

export function createEma99DiscordTimeframeRouter({
  fiveMinuteNotifier,
  fifteenMinuteNotifier,
} = {}) {
  return function notifyEma99DiscordByTimeframe(event) {
    const channel = ema99DiscordChannelForInterval(event?.interval);
    if (channel === '5m') return fiveMinuteNotifier.notify(event);
    if (channel === '15m') return fifteenMinuteNotifier.notify(event);
    return Promise.resolve({ sent: 0, reason: 'unsupported_interval' });
  };
}

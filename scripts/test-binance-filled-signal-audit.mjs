import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BINANCE_FILLED_SIGNAL_AUDIT_VERSION,
  BinanceFilledSignalAudit,
} from '../src/binanceFilledSignalAudit.js';

const dataDir = await mkdtemp(join(tmpdir(), 'binance-filled-signal-audit-'));
const requests = [];
const fetchImpl = async (url, options) => {
  requests.push({ url, payload: JSON.parse(options.body) });
  return { ok: true, status: 204, json: async () => ({}) };
};

try {
  const audit = new BinanceFilledSignalAudit({
    dataDir,
    webhookUrl: 'https://example.test/open',
    closeWebhookUrl: 'https://example.test/close',
    fetchImpl,
  });
  await audit.init();
  const initialCsv = await readFile(join(dataDir, 'binance-filled-signals.csv'), 'utf8');
  assert.match(initialCsv, /audit_version,filled_at/);
  assert.match(initialCsv, /net_realized_pnl_usdt/);

  await audit.registerSubmission({
    orderId: 101,
    clientOrderId: 'zlc_entry_101',
    symbol: 'TESTUSDT',
    side: 'SELL',
    orderType: 'MARKET',
    signalSource: 'coinglass-zone-lifecycle-primary',
    signalType: 'BREAKDOWN_ACCEPTED_SHORT_READY',
    signalLabel: 'ZONE LIFECYCLE · BREAKDOWN_ACCEPTED_SHORT_READY',
    signalReason: 'Accepted below lower zone, retest failed, sell flow confirmed.',
    signalCombo: 'ACCEPTED | LOWER_EDGE | RETEST_FAIL',
    matchedKeys: ['COINGLASS_ZONE_LIFECYCLE_SHORT'],
    executionPage: 'coinglass-web-top20',
    signalEntryPrice: 2,
    takeProfitPrice: 1.9,
    stopLossSuppressed: true,
    marginUsdt: 2.5,
    leverage: 5,
  });

  const fill = await audit.recordFill({
    orderId: 101,
    clientOrderId: 'zlc_entry_101',
    symbol: 'TESTUSDT',
    side: 'SELL',
    positionSide: 'SHORT',
    orderStatus: 'FILLED',
    orderType: null,
    avgPrice: 2,
    cumulativeFilledQty: 6.25,
    fillTime: Date.parse('2026-09-05T01:00:00Z'),
    source: 'ORDER_TRADE_UPDATE',
    signalType: null,
    signalLabel: null,
    signalReason: null,
  });
  assert.equal(fill.recorded, true);
  assert.equal(fill.discordSent, true);
  assert.equal(fill.record.auditVersion, BINANCE_FILLED_SIGNAL_AUDIT_VERSION);
  assert.equal(fill.record.signalType, 'BREAKDOWN_ACCEPTED_SHORT_READY');
  assert.equal(fill.record.signalLabel, 'ZONE LIFECYCLE · BREAKDOWN_ACCEPTED_SHORT_READY');
  assert.equal(fill.record.stopLossSuppressed, true);
  assert.equal(requests[0].url, 'https://example.test/open');
  assert.match(requests[0].payload.embeds[0].description, /Accepted below lower zone/);

  const duplicate = await audit.recordFill({
    orderId: 101,
    clientOrderId: 'zlc_entry_101',
    symbol: 'TESTUSDT',
    side: 'SELL',
    orderStatus: 'FILLED',
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(requests.length, 1);

  const close = await audit.recordPositionClose({
    symbol: 'TESTUSDT',
    direction: 'SHORT',
    closedAt: Date.parse('2026-09-05T02:00:00Z'),
    closeOrderIds: [202],
    closeClientOrderId: 'lp_ptp_101',
    closeOrderType: 'TAKE_PROFIT_MARKET',
    exitAvgPrice: 1.9,
    closedQty: 6.25,
    grossRealizedPnlUsdt: 0.625,
    commissionUsdt: 0.01,
    fundingPnlUsdt: -0.005,
    netRealizedPnlUsdt: 0.61,
    closeEventSource: 'ACCOUNT_UPDATE',
  });
  assert.equal(close.recorded, true);
  assert.equal(close.discordSent, true);
  assert.equal(close.close.outcome, 'WIN');
  assert.equal(close.close.closeReason, 'TAKE_PROFIT_FILLED');
  assert.equal(requests[1].url, 'https://example.test/close');
  assert.match(requests[1].payload.embeds[0].title, /BREAKDOWN_ACCEPTED_SHORT_READY/);
  assert.match(requests[1].payload.embeds[0].fields[2].value, /Funding: \*\*-0\.005000 USDT/);
  assert.match(requests[1].payload.embeds[0].fields[2].value, /0\.610000 USDT/);

  const csv = await readFile(join(dataDir, 'binance-filled-signals.csv'), 'utf8');
  assert.equal(csv.trim().split('\n').length, 2);
  assert.match(csv, /ZONE LIFECYCLE · BREAKDOWN_ACCEPTED_SHORT_READY/);
  assert.match(csv, /CLOSED/);
  assert.match(csv, /TESTUSDT:SHORT:202/);
  assert.match(csv, /TAKE_PROFIT_FILLED/);
  assert.match(csv, /-0\.005/);
  assert.match(csv, /0\.61/);
  assert.match(csv, /WIN/);
  assert.equal((await audit.getOpenPositionContext('TESTUSDT', 'SHORT')).records.length, 0);

  const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
  const monitorSource = await readFile(new URL('../src/positionMonitor.js', import.meta.url), 'utf8');
  assert.match(serverSource, /BINANCE_FILLED_SIGNAL_AUDIT_WEBHOOK_URL/);
  assert.match(serverSource, /BINANCE_CLOSED_SIGNAL_AUDIT_WEBHOOK_URL/);
  assert.match(serverSource, /auditBinancePositionClose/);
  assert.match(serverSource, /\/api\/binance-filled-signal-audit\.csv/);
  assert.match(monitorSource, /source: 'REST_POSITION_SYNC'/);
  assert.match(monitorSource, /source: 'ACCOUNT_UPDATE_REVERSAL'/);
} finally {
  await rm(dataDir, { recursive: true, force: true });
}

console.log('Binance filled/closed signal audit tests passed');

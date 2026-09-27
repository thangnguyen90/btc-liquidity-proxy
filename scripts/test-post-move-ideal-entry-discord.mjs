import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildIdealEntryDiscordPayload,
  PostMoveIdealEntryDiscordNotifier,
} from '../src/postMoveIdealEntryDiscord.js';

const WEBHOOK = 'https://discord.com/api/webhooks/123456789/test-token';
let now = Date.UTC(2026, 8, 24, 2, 0, 0);
const DEFAULT_ANCHOR_AT = now - 3_600_000;

function snapshot(side, candidates = []) {
  return {
    observeOnly: true,
    timeframes: [{
      interval: '15m',
      items: candidates.map((row, index) => ({
        symbol: row.symbol ?? `${side}${index}USDT`,
        interval: row.interval ?? '15m',
        status: row.status ?? 'CONFIRMED',
        score: row.score ?? 88,
        moveStage: row.moveStage ?? (side === 'LONG'
          ? { key: 'LONG_FRESH_REVERSAL', label: 'VỪA SẬP · ĐANG RÚT CHÂN', tone: 'fresh', rank: 5, entryHint: 'Chờ giữ vùng hồi.' }
          : { key: 'SHORT_NEAR_TOP', label: 'SÁT ĐỈNH', tone: 'fresh', rank: 5, entryHint: 'Ưu tiên reject.' }),
        currentPrice: row.price,
        ...(side === 'LONG'
          ? { dumpAt: row.anchorAt ?? DEFAULT_ANCHOR_AT, dumpCloseAt: row.anchorAt ?? DEFAULT_ANCHOR_AT }
          : { pumpAt: row.anchorAt ?? DEFAULT_ANCHOR_AT, pumpCloseAt: row.anchorAt ?? DEFAULT_ANCHOR_AT }),
        idealEntry: {
          state: row.entryState ?? 'IN_ZONE',
          zoneLow: row.zoneLow ?? 99,
          zoneHigh: row.zoneHigh ?? 101,
          midpoint: 100,
          distanceFromLivePct: 0,
          basis: 'test',
        },
        confirmationPrice: 98,
        invalidationPrice: side === 'LONG' ? 95 : 105,
      })),
    }],
  };
}

const dir = await mkdtemp(join(tmpdir(), 'ideal-entry-discord-'));
try {
  const requests = [];
  const notifier = new PostMoveIdealEntryDiscordNotifier({
    stateFile: join(dir, 'state.json'),
    webhookUrl: () => WEBHOOK,
    now: () => now,
    fetchImpl: async (url, options) => {
      requests.push({ url, payload: JSON.parse(options.body) });
      return { ok: true, status: 204, headers: { get: () => null } };
    },
  });

  const initialLong = snapshot('LONG', [{ symbol: 'AAAUSDT', price: 100 }]);
  const baseline = await notifier.processSnapshots({ longSnapshot: initialLong, shortSnapshot: snapshot('SHORT') });
  assert.equal(baseline.baseline, true, 'startup scan must create a baseline');
  assert.equal(requests.length, 0, 'startup must not replay an already touched historical setup');

  now += 15_000;
  await notifier.processSnapshots({
    longSnapshot: snapshot('LONG', [{ symbol: 'AAAUSDT', price: 104 }]),
    shortSnapshot: snapshot('SHORT'),
  });
  assert.equal(requests.length, 0, 'moving outside only arms the setup');

  now += 15_000;
  const touched = await notifier.processSnapshots({
    longSnapshot: snapshot('LONG', [{ symbol: 'AAAUSDT', price: 100.5 }]),
    shortSnapshot: snapshot('SHORT'),
  });
  assert.equal(touched.sent, 1);
  assert.equal(requests.length, 1, 'outside-to-inside touch sends once');
  assert.match(requests[0].payload.embeds[0].title, /LONG ĐẸP ĐÃ CHẠM/);
  assert.match(requests[0].payload.embeds[0].description, /Binance do route riêng và Auto Controls quyết định/);
  const beautifulType = requests[0].payload.embeds[0].fields.find((field) => field.name === 'LOẠI ĐẸP');
  assert.ok(beautifulType, 'priority stage must identify its actual beautiful type');
  assert.match(beautifulType.value, /VỪA SẬP · ĐANG RÚT CHÂN/);
  assert.equal(requests[0].payload.embeds[0].fields.some((field) => field.name === 'NHÓM MARKET ƯU TIÊN 15m'), false);

  now += 15_000;
  await notifier.processSnapshots({
    longSnapshot: snapshot('LONG', [{ symbol: 'AAAUSDT', price: 100 }]),
    shortSnapshot: snapshot('SHORT'),
  });
  assert.equal(requests.length, 1, 'remaining in the zone must not spam Discord');

  now += 15_000;
  await notifier.processSnapshots({
    longSnapshot: snapshot('LONG', [{ symbol: 'WEAKUSDT', price: 100, status: 'WEAKENED' }]),
    shortSnapshot: snapshot('SHORT', [{ symbol: 'BBBUSDT', price: 100 }]),
  });
  assert.equal(requests.length, 2, 'a new active short setup first observed in-zone sends after baseline');
  assert.match(requests[1].payload.embeds[0].title, /SHORT ĐẸP ĐÃ CHẠM/);
  assert.doesNotMatch(requests[1].payload.embeds[0].title, /WEAKUSDT/);

  now += 15_000;
  await notifier.processSnapshots({
    longSnapshot: snapshot('LONG', [{ symbol: 'DUALUSDT', price: 100 }]),
    shortSnapshot: snapshot('SHORT', [{ symbol: 'DUALUSDT', price: 100 }]),
  });
  assert.equal(requests.length, 4, 'both newly touched directions are independently notified');
  assert.match(requests[2].payload.embeds[0].description, /hướng ngược lại/);
  assert.match(requests[3].payload.embeds[0].description, /hướng ngược lại/);

  const persisted = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
  const sentRows = Object.values(persisted.setups).filter((row) => row.sentAt);
  assert.equal(sentRows.length, 4, 'dedupe delivery state must be durable');

  const payload = buildIdealEntryDiscordPayload({
    side: 'LONG', symbol: 'TESTUSDT', interval: '1h', price: 1,
    zoneLow: 0.99, zoneHigh: 1.01, midpoint: 1,
    status: 'BUILDING', score: 70, entryState: 'IN_ZONE',
    moveStage: { label: 'ĐANG HỒI · CHỜ XÁC NHẬN', entryHint: 'Không đuổi giá.' },
    confirmationPrice: 1.02, invalidationPrice: 0.95,
    anchorAt: now - 1000, touchAt: now,
  });
  assert.equal(payload.allowed_mentions.parse.length, 0);
  assert.equal(payload.embeds.length, 1);
  assert.match(payload.embeds[0].title, /LONG ĐÃ CHẠM/);
  assert.doesNotMatch(payload.embeds[0].title, /ĐẸP/);
  assert.equal(payload.embeds[0].fields.some((field) => field.name === 'GIÁ LIVE / VÙNG ENTRY'), true);
  assert.match(payload.embeds[0].fields.find((field) => field.name === 'GIAI ĐOẠN NHỊP GIÁ').value, /ĐANG HỒI/);
  assert.equal(payload.embeds[0].fields.some((field) => field.name === 'LOẠI ĐẸP'), false);

  console.log('post-move ideal-entry Discord tests passed');
} finally {
  await rm(dir, { recursive: true, force: true });
}

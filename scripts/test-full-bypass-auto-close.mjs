import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AutoEntryControls, authorizeManualPositionClose } from '../src/autoEntryControls.js';
import { collectPostMoveDualDirections, evaluatePostMoveDualDirectionPosition,
  POST_MOVE_DUAL_DIRECTION_PROFIT_CLOSE_VERSION } from '../src/postMoveDualDirectionProfitClose.js';

const dir = await mkdtemp(join(tmpdir(), 'full-bypass-auto-close-'));
try {
  const file = join(dir, 'controls.json');
  const controls = new AutoEntryControls(file);
  const sent = [];
  const client = {
    placeFuturesOrder: async ({ params }) => { sent.push(params); return { orderId: sent.length }; },
    placeAlgoOrder: async ({ params }) => { sent.push(params); return { algoId: sent.length }; },
  };
  controls.guardClient(client);
  controls.update({ action: 'protection-full-bypass-add', symbol: 'RLC' });
  const close = { symbol: 'RLCUSDT', type: 'MARKET', side: 'BUY', reduceOnly: 'true', quantity: '935.6' };
  const blocked = (args, method = 'placeFuturesOrder') => assert.throws(() => client[method](args),
    error => error.code === 'BINANCE_PROTECTION_EXCLUDED');
  for (const prefix of ['lp_close_', 'lp_brg_', 'lcclose_', 'cg_rev_', 'lp_ptout_', 'unknown_']) {
    blocked({ params: { ...close, newClientOrderId: prefix + 'test' } });
  }
  for (const params of [
    { ...close, side: 'SELL', positionSide: 'LONG', reduceOnly: undefined },
    { ...close, positionSide: 'SHORT', reduceOnly: undefined },
    { ...close, type: 'LIMIT', price: '0.53', timeInForce: 'GTC' },
    { ...close, type: 'STOP_MARKET', closePosition: 'true' },
    { ...close, type: 'TAKE_PROFIT_MARKET', closePosition: 'true' },
  ]) blocked({ params });
  blocked({ params: { ...close, type: 'STOP_MARKET' } }, 'placeAlgoOrder');
  blocked({ params: close, manual: true, entryControl: { manual: true }, protectionControl: { manualClose: true } });
  blocked({ params: { ...close, manual: true, newClientOrderId: 'ios_fake' } });
  assert.equal(sent.length, 0, 'no automatic reduction reaches Binance mock');
  assert.equal(controls.fullBypassPositionBound('RLC'), false, 'armed bypass also fences closes');
  for (const params of [close, { ...close, side: 'SELL', positionSide: 'LONG', reduceOnly: undefined },
    { ...close, positionSide: 'SHORT', reduceOnly: undefined }]) {
    await client.placeFuturesOrder(authorizeManualPositionClose({ params }));
  }
  blocked(authorizeManualPositionClose({ params: { ...close, type: 'LIMIT' } }));
  blocked(authorizeManualPositionClose({ params: { ...close, type: 'STOP_MARKET' } }));
  assert.equal(controls.isProtectionExcluded('RLC'), true, 'acknowledging a manual close does not clear bypass before confirmed close');
  await client.placeFuturesOrder({ params: { ...close, symbol: 'OTHERUSDT' } });
  controls.update({ action: 'protection-exclusion-add', symbol: 'TEMP' });
  await client.placeFuturesOrder({ params: { ...close, symbol: 'TEMPUSDT' } });
  blocked({ params: { ...close, symbol: 'TEMPUSDT', type: 'STOP_MARKET' } });

  // Simulate user enabling bypass while another runner awaits market/position data.
  controls.update({ action: 'protection-full-bypass-remove', symbol: 'RLC' });
  const otherProcess = new AutoEntryControls(file);
  otherProcess.update({ action: 'protection-full-bypass-add', symbol: 'RLC' });
  assert.equal(controls.isProtectionExcluded('RLC'), false, 'runner cache predates setting');
  blocked({ params: close });
  assert.equal(controls.isProtectionExcluded('RLC'), true, 'submission reloads latest setting');
  await writeFile(file, '{bad', 'utf8');
  blocked({ params: close });
  assert.equal(controls.isProtectionExcluded('RLC'), true, 'corrupt read retains known full bypass');
  otherProcess.save(otherProcess.read());

  const server = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
  const functionSource = (start, end) => server.slice(server.indexOf(start), server.indexOf(end, server.indexOf(start)));
  const reconcileSource = functionSource('async function reconcilePostMoveDualDirectionProfitClose', '\nlet _postMoveIdealEntryDiscordRunning');
  let nowExcluded = true;
  const realClosed = [];
  const positions = [{ symbol: 'RLCUSDT', positionAmt: '-935.6', entryPrice: '0.5343', markPrice: '0.5339' },
    { symbol: 'OTHERUSDT', positionAmt: '10', entryPrice: '1', markPrice: '1.02' }];
  const makeReconcile = new Function('postMoveDualDirectionProfitCloseEnabled', 'collectPostMoveDualDirections',
    'postMoveDualDirectionCloseCooldownUntil', 'getApiCredentials', 'client', 'evaluatePostMoveDualDirectionPosition',
    'isBinanceFullBypassAutoCloseExcluded', 'postMoveDualDirectionCloseInflight', 'closePosition',
    'POST_MOVE_DUAL_DIRECTION_PROFIT_CLOSE_VERSION', 'console', reconcileSource + '\nreturn reconcilePostMoveDualDirectionProfitClose;');
  const reconcile = makeReconcile(() => true, collectPostMoveDualDirections, new Map(), () => ({}),
    { getPositions: async () => positions }, evaluatePostMoveDualDirectionPosition,
    symbol => nowExcluded && symbol === 'RLCUSDT', new Set(), async payload => realClosed.push(payload),
    POST_MOVE_DUAL_DIRECTION_PROFIT_CLOSE_VERSION, { log() {}, warn() {} });
  const snapshot = { timeframes: [{ interval: '15m', items: positions.map(p => ({ symbol: p.symbol, status: 'CONFIRMED' })) }] };
  const result = await reconcile(snapshot, snapshot);
  assert.equal(result.closed, 1);
  assert.deepEqual(realClosed.map(x => x.symbol), ['OTHERUSDT'], 'reproduced RLC positive-PnL/dual-15m case is skipped, other coin unchanged');
  nowExcluded = false;
  await reconcile(snapshot, snapshot);
  assert.equal(realClosed.at(-1).symbol, 'RLCUSDT', 'normal close resumes after bypass ends');

  const closeSource = functionSource('async function closePosition(payload,', '\nasync function sendStatic');
  let credentialsReads = 0;
  let credentialsAllowed = true;
  let armDuringAwait = false;
  const makeClose = new Function('normalizeSymbol', 'isBinanceFullBypassAutoCloseExcluded', 'getApiCredentials',
    'getSymbols', 'client', 'quantityFromNotional', 'getHedgeMode', 'authorizeManualPositionClose', 'ordersTokens',
    closeSource + '\nreturn closePosition;');
  const doClose = makeClose(x => String(x).toUpperCase(), symbol => controls.protectionExclusionMode(symbol) === 'FULL_POSITION_BYPASS',
    () => { credentialsReads++; if (!credentialsAllowed) throw new Error('unauthorized'); return {}; },
    async () => [{ symbol: 'RLCUSDT' }], { ...client, getPremiumIndex: async () => ({ markPrice: '0.5339' }) },
    (_, qtyNotional, mark) => String(qtyNotional / mark), async () => {
      if (armDuringAwait) otherProcess.update({ action: 'protection-full-bypass-add', symbol: 'RLC' });
      return false;
    }, authorizeManualPositionClose, new Set(['verified-token']));
  const sentBefore = sent.length;
  await assert.rejects(doClose({ symbol: 'RLCUSDT', positionAmt: '-935.6', manual: true }),
    error => error.code === 'BINANCE_PROTECTION_EXCLUDED');
  assert.equal(credentialsReads, 0, 'JSON manual flag cannot bypass trusted automatic-close guard');
  await assert.rejects(doClose({ symbol: 'RLCUSDT', positionAmt: '-935.6' }, 'invalid', { manual: true }), /Đăng nhập/);
  assert.equal(credentialsReads, 0, 'expired/unknown token cannot fall back to server credentials for manual exemption');
  credentialsAllowed = false;
  await assert.rejects(doClose({ symbol: 'RLCUSDT', positionAmt: '-935.6' }, 'verified-token', { manual: true }), /unauthorized/);
  assert.equal(sent.length, sentBefore, 'manual exemption is not minted before credential validation');
  credentialsAllowed = true;
  await doClose({ symbol: 'RLCUSDT', positionAmt: '-935.6' }, 'verified-token', { manual: true });
  assert.equal(sent.length, sentBefore + 1, 'actual server close helper allows authenticated manual MARKET');
  controls.update({ action: 'protection-full-bypass-remove', symbol: 'RLC' });
  armDuringAwait = true;
  await assert.rejects(doClose({ symbol: 'RLCUSDT', positionAmt: '-935.6' }),
    error => error.code === 'BINANCE_PROTECTION_EXCLUDED');
  assert.equal(sent.length, sentBefore + 1, 'bypass armed during awaited work fences final submission');
  assert.match(server, /closePosition\(await readJsonBody\(request\), token, \{ manual: true \}\)/);
  const closeRoute = functionSource("    if (requestUrl.pathname === '/api/close-position'", "\n    if (requestUrl.pathname === '/api/auto-trade/status')");
  assert.ok(closeRoute.indexOf('isSameOriginWriteRequest') < closeRoute.indexOf('await closePosition'));
  assert.ok(closeRoute.indexOf('ordersTokens.has(token)') < closeRoute.indexOf('await closePosition'));
  assert.equal((server.match(/authorizeManualPositionClose\(closeArgs\)/g) || []).length, 1);
} finally {
  await rm(dir, { recursive: true, force: true });
}
console.log('full bypass auto-close regression passed: RLC reproduction, all reducing auto orders fenced, manual auth, awaited-setting race, restart/corrupt compatibility; mock only.');

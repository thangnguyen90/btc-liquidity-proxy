import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { IMPULSE_ENTRY_VERSION, IMPULSE_ENTRY_METHODS, impulseEntryCardKey } from '../public/impulse-entry-model.js';
import {
  ENTRY_POLICY, captureImpulseEntry, evaluateImpulseEntry,
  impulseEntryBtcContext, validateImpulseEntryLive,
} from './postMoveImpulseEntry.js';

const active = r => ['WAITING', 'READY'].includes(r.status);
const fmt = n => Number.isFinite(n) ? Number(n.toPrecision(8)).toString() : '—';
function webhook(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['discord.com', 'discordapp.com'].includes(url.hostname)
      && /^\/api\/webhooks\/[^/]+\/[^/]+$/.test(url.pathname) ? url.href : '';
  } catch { return ''; }
}

export function impulseEntryPayload(record) {
  const { plan, btc, side, symbol, livePrice } = record;
  const sideSign = side === 'LONG' ? 1 : -1;
  const fee = livePrice * ENTRY_POLICY.costPct / 100;
  const liveRR = (sideSign * (plan.target - livePrice) - fee) / (sideSign * (livePrice - plan.stop) + fee);
  return {
    username: 'Impulse Entry Watch', allowed_mentions: { parse: [] },
    embeds: [{
      title: `${side === 'LONG' ? '🟢' : '🔴'} ${side} · ${symbol} · ĐẠT ĐIỂM VÀO SAU IMPULSE`,
      color: side === 'LONG' ? 0x2ecc71 : 0xe74c3c,
      description: `**${IMPULSE_ENTRY_METHODS[plan.method]} · NẾN 5m ĐÃ ĐÓNG**\nTheo dõi từ ${record.sourceStage}. Điểm vào tham khảo đã qua kiểm tra giá live. Kênh này chỉ cảnh báo, không đặt lệnh Binance.`,
      fields: [
        { name: 'ENTRY / GIÁ LIVE', value: `Xác nhận **${fmt(plan.entry)}** · live **${fmt(livePrice)}**\nMốc tiếp diễn **${fmt(plan.trigger)}**` },
        { name: 'VÔ HIỆU / MỤC TIÊU THAM KHẢO', value: `Vô hiệu **${fmt(plan.stop)}** · cản gần nhất **${fmt(plan.target)}**\nR:R tại giá live **${liveRR.toFixed(2)}** (trừ chi phí giả định ${ENTRY_POLICY.costPct}%). Đây không phải lệnh SL/TP Binance.` },
        { name: 'BTC · NẾN 5m ĐÃ ĐÓNG', value: `${btc.direction} · ${btc.alignment}\n15m **${fmt(btc.move15m)}%** · 1h **${fmt(btc.move1h)}%** · chỉ đánh giá bối cảnh` },
        { name: 'THỜI ĐIỂM (VN)', value: `Impulse ${new Date(record.impulseAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}\nĐạt ${new Date(plan.passedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` },
        { name: 'MỞ MÀN HÌNH', value: `[BTC Session](http://127.0.0.1:19082/btc-session-watch.html) · [Coin Level](http://127.0.0.1:19082/coin-level-analysis?symbol=${encodeURIComponent(symbol)})` },
      ],
      footer: { text: `${IMPULSE_ENTRY_VERSION} · OBSERVE ONLY · ngưỡng thử nghiệm, chưa chứng minh lợi nhuận` },
      timestamp: new Date(plan.passedAt).toISOString(),
    }],
  };
}

export class PostMoveImpulseEntryTracker {
  constructor({ stateFile, webhookUrl, now = () => Date.now(), fetchImpl = fetch }) {
    Object.assign(this, { stateFile, webhookUrl, now, fetchImpl });
    this.startedAt = now();
    this.state = null;
    this.running = false;
  }
  configured() { return Boolean(webhook(this.webhookUrl())); }
  async load() {
    if (this.state) return;
    let data;
    try { data = JSON.parse(await readFile(this.stateFile, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw new Error('Impulse entry state unreadable'); }
    if (data && (data.version !== IMPULSE_ENTRY_VERSION || !Array.isArray(data.records))) {
      throw new Error('Impulse entry state version invalid');
    }
    this.state = data ?? { version: IMPULSE_ENTRY_VERSION, records: [], retryAfter: 0 };
    // An interrupted POST may have reached Discord: never automatically duplicate it.
    for (const record of this.state.records) {
      if (record.status === 'SENDING') { record.status = 'DELIVERY_UNKNOWN'; record.reason = 'INTERRUPTED_SEND'; }
    }
  }
  async save() {
    await mkdir(dirname(this.stateFile), { recursive: true });
    await writeFile(`${this.stateFile}.tmp`, JSON.stringify(this.state));
    await rename(`${this.stateFile}.tmp`, this.stateFile);
  }
  symbols() { return [...new Set((this.state?.records ?? []).filter(active).map(r => r.symbol))]; }
  snapshot() {
    const records = this.state?.records ?? [];
    const now = this.now();
    const counts = {};
    for (const r of records) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return {
      version: IMPULSE_ENTRY_VERSION, configured: this.configured(),
      evaluatedAt: this.state?.evaluatedAt ?? null, counts,
      groups: ['LONG', 'SHORT'].flatMap(side => Object.keys(IMPULSE_ENTRY_METHODS).map(method => ({
        side, method, key: impulseEntryCardKey(side, method), closedCount: 0, avgRoe: null,
      }))),
      records: records.filter(r => now - r.impulseAt <= 24 * 60 * 60_000)
        .slice(-100).reverse().map(r => ({
          id: r.id, symbol: r.symbol, side: r.side, impulseAt: r.impulseAt,
          status: r.status, reason: r.reason, plan: r.plan, btc: r.btc,
          livePrice: r.livePrice, liveAt: r.liveAt, sentAt: r.sentAt,
        })),
    };
  }
  async process({ watches = [], getRows, getQuote, btcRows = [] }) {
    if (this.running) return { busy: true, sent: 0 };
    this.running = true;
    try {
      await this.load();
      const now = this.now();
      let sent = 0;
      const ids = new Set(this.state.records.map(r => r.id));
      for (const watch of watches) {
        // New feed never imports historical early alerts on restart.
        if (!(Number(watch.impulseAt) >= this.startedAt && Number(watch.impulseAt) < now
          && now - Number(watch.impulseAt) <= 12 * 60_000)) continue;
        const id = `${watch.symbol}:${watch.side}:${watch.impulseAt}`;
        if (ids.has(id)) continue;
        const setup = captureImpulseEntry(watch, getRows(watch.symbol), now);
        if (setup) { this.state.records.push({ ...setup, status: 'WAITING', reason: 'WAIT_RETEST_OR_BASE' }); ids.add(id); }
      }
      for (const record of this.state.records.filter(active)) {
        const result = evaluateImpulseEntry(record, getRows(record.symbol), now);
        Object.assign(record, result);
        if (result.status !== 'READY') continue;
        if (record.plan.passedAt < this.startedAt) {
          record.status = 'EXPIRED'; record.reason = 'PASS_BEFORE_RESTART'; continue;
        }
        const quote = getQuote(record.symbol);
        record.reason = validateImpulseEntryLive(record, record.plan, quote, now);
        if (record.reason === 'PASS_EXPIRED') { record.status = 'EXPIRED'; continue; }
        if (record.reason === 'STOP_BROKEN') { record.status = 'INVALIDATED'; continue; }
        if (record.reason !== 'PASS') continue;
        record.livePrice = Number(quote.price);
        record.liveAt = Number(quote.at);
        record.btc = impulseEntryBtcContext(btcRows, now, record.side);
      }
      this.state.evaluatedAt = now;
      // Keep current setups and seven days of delivery/audit history, bounded on disk.
      this.state.records = this.state.records.filter(r => now - r.impulseAt <= 7 * 86400_000).slice(-2000);
      await this.save();
      const url = webhook(this.webhookUrl());
      for (const record of this.state.records.filter(r => r.status === 'READY' && r.reason === 'PASS').slice(0, 4)) {
        if (!url || this.now() < this.state.retryAfter) break;
        // Recheck immediately before HTTP: earlier requests may have consumed freshness.
        const quote = getQuote(record.symbol);
        record.reason = validateImpulseEntryLive(record, record.plan, quote, this.now());
        if (record.reason !== 'PASS') continue;
        record.livePrice = Number(quote.price);
        record.liveAt = Number(quote.at);
        record.status = 'SENDING';
        await this.save();
        try {
          const response = await this.fetchImpl(url, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify(impulseEntryPayload(record)), signal: AbortSignal.timeout(8000),
          });
          if (response.ok) {
            record.status = 'SENT'; record.reason = 'DISCORD_SENT'; record.sentAt = this.now(); sent += 1;
          } else if (response.status === 429) {
            const body = await response.json().catch(() => ({}));
            const seconds = Number(body.retry_after);
            this.state.retryAfter = this.now() + Math.max(1000, Number.isFinite(seconds) ? seconds * 1000 : 60_000);
            record.status = 'READY'; record.reason = 'DISCORD_RATE_LIMIT';
          } else {
            record.status = response.status >= 500 ? 'DELIVERY_UNKNOWN' : 'DELIVERY_FAILED';
            record.reason = `DISCORD_HTTP_${response.status}`;
          }
        } catch {
          record.status = 'DELIVERY_UNKNOWN'; record.reason = 'DISCORD_NETWORK_UNKNOWN';
        }
        await this.save();
      }
      return { sent, ...this.snapshot().counts };
    } finally { this.running = false; }
  }
}

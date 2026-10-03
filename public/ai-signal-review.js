import { selectReviewRows, summarizeReviewRows, groupReviewRows } from './ai-signal-review-model.js';
const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '—').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const numeric = (value, digits = 2) => value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const price = value => value == null ? '—' : Number(value).toLocaleString('en-US', { maximumSignificantDigits: 8 });
const time = value => value == null ? '—' : new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
const pct = value => value == null ? '—' : `<span class="${value >= 0 ? 'positive' : 'negative'}">${value > 0 ? '+' : ''}${numeric(value)}%</span>`;
const states = { PENDING:'Chưa đủ kỳ', MISSING_CANDLES:'Thiếu nến', NO_ZONE:'Chưa lưu vùng', NOT_TOUCHED:'Chưa chạm trong thời hạn' };
const alignment = { ALIGNED:'Đồng hướng', OPPOSED:'Ngược hướng', FLAT:'Đi ngang', UNKNOWN:'Thiếu nến' };
let snapshot = null, page = 0, viewRows = [], expanded = null, polling = false;
const pageSize = 40;
const settings = () => ({ symbol:$('#symbol').value, side:$('#side').value, band:$('#band').value, verdict:$('#verdict').value,
  btc:$('#btc').value, market:$('#market').value, source:$('#source').value, from:$('#from').value, to:$('#to').value,
  independent:$('#independent').checked });
const hours = () => Number($('#hours').value);
const cost = () => Math.max(0, Math.min(5, Number($('#cost').value) || 0));

function render() {
  const report = snapshot?.report, progress = snapshot?.progress ?? {};
  $('#refresh').disabled = Boolean(progress.running);
  $('#status').textContent = progress.running ? `Đang đối chiếu nến: ${progress.done}/${progress.total} coin${progress.symbol ? ' · '+progress.symbol : ''}`
    : progress.error ? `Chưa cập nhật được: ${progress.error}` : report ? `Cập nhật ${time(report.generatedAt)}` : 'Chưa có báo cáo';
  $('#coverage').textContent = report ? `${report.partial ? 'KẾT QUẢ TẠM · '+report.rows.length+'/'+report.plannedSignals+' tín hiệu đã xử lý; chưa dùng xếp hạng để kết luận. ' : report.rows.length+' tín hiệu đã phát · '}${report.fullSnapshotCount} mẫu có snapshot gốc · ${time(report.firstAt)} → ${time(report.lastAt)}${report.errors.length ? ' · '+report.errors.length+' coin lỗi tải nến' : ''}${report.btcError ? ' · lỗi nến BTC' : ''}${report.malformedLines ? ' · '+report.malformedLines+' dòng lịch sử hỏng đã bỏ qua' : ''} · Discord hậu kiểm 1h+4h ${snapshot.discord?.configured ? 'ON' : 'OFF'}${snapshot.discord?.baselineComplete ? ' · đã tạo mốc chống gửi lịch sử' : ''} · BTC cực đoan ${snapshot.discord?.btcExtreme?.configured ? 'ON' : 'OFF'}` : 'Dữ liệu phân tích sẽ được lưu để lần mở sau tải nhanh.';
  if (!report) return;
  viewRows = selectReviewRows(report.rows, settings());
  const summary = summarizeReviewRows(viewRows, hours(), cost());
  const base = summary.market;
  const adverse = viewRows.filter(row => row.horizons?.[hours()]?.market?.state === 'READY'
    && row.horizons[hours()].market.grossPct > cost() && row.horizons[hours()].market.maePct >= 1).length;
  $('#insight').innerHTML = `${viewRows.length} tín hiệu trong bộ lọc; <b>${base.filled}</b> đủ ${hours()}h để đánh giá. `
    + `Vào ngay: <b>${numeric(base.winPct, 1)}%</b> có lời sau chi phí, trung bình ${pct(base.avgNetPct)}. `
    + `<b>${adverse}</b> mẫu kết thúc có lời nhưng từng đi ngược ít nhất 1%. `
    + `Có ${base.pending} mẫu chờ đủ kỳ và ${base.missing} mẫu thiếu nến. `
    + `${summary.zone.noZone ? `<span class="warn">${summary.zone.noZone} mẫu chưa lưu vùng entry gốc nên chưa so được cách chờ vùng.</span>` : ''}`;
  $('#comparison').innerHTML = [['market','Giá mở nến kế tiếp'],['zone','Chờ giữa vùng gốc'],['pullback','Chờ hồi 0,5%']].map(([key,label]) => {
    const item = summary[key];
    return `<tr><td><b>${label}</b></td><td>${item.filled}<small>Chờ ${item.pending} · thiếu ${item.missing}${item.noZone ? ' · thiếu vùng '+item.noZone : ''}</small></td><td>${item.filled} / ${item.eligible}<small>Bỏ lỡ ${item.missed}</small></td><td>${numeric(item.winPct,1)}%</td><td>${pct(item.avgNetPct)}</td><td>${pct(item.medianNetPct)}</td><td>${numeric(item.mfePct)}% / ${numeric(item.maePct)}%</td><td>${key === 'market' ? 'Mốc so sánh' : pct(item.pairedDeltaPct)+`<small>${item.pairedCount} mẫu ghép cặp</small>`}</td><td>${pct(item.opportunityNetPct)}</td></tr>`;
  }).join('');
  const group = $('#group').value;
  const keyOf = row => group === 'coin' ? `${row.symbol} · ${row.side}` : group === 'band' ? `${row.strengthBand ?? 'UNKNOWN'} · ${row.side}`
    : group === 'market' ? `${row.market?.regime ?? 'Chưa lưu'} · ${row.side}` : group === 'breadth' ? `${row.breadth?.state ?? 'Chưa lưu'} · ${row.side}`
    : `${String(row.hourVn).padStart(2,'0')}:00–${String(row.hourVn).padStart(2,'0')}:59 · ${row.side}${group === 'hour_btc' ? ' · BTC '+row.btcReconstructed.momentum : ''}`;
  const groups = groupReviewRows(viewRows,keyOf,hours(),cost()).sort((a,b) => (b.stats.market.avgNetPct ?? -Infinity) - (a.stats.market.avgNetPct ?? -Infinity));
  $('#groups').innerHTML = groups.map(row => `<tr><td>${escape(row.key)}${row.stats.market.filled < 20 ? '<small class="warn">Mẫu nhỏ (&lt;20)</small>' : ''}</td><td>${row.count}</td><td>${row.stats.market.filled}</td><td>${numeric(row.stats.market.winPct,1)}%</td><td>${pct(row.stats.market.avgNetPct)}</td><td>${pct(row.stats.zone.avgNetPct)} / ${row.stats.zone.filled}</td><td>${pct(row.stats.pullback.avgNetPct)} / ${row.stats.pullback.filled}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Không có mẫu phù hợp</td></tr>';
  const sort = $('#sort').value;
  const metric = row => {
    const out = row.horizons?.[hours()];
    if (sort === 'return') return out?.market?.grossPct ?? -Infinity;
    if (sort === 'adverse') return out?.market?.maePct ?? -Infinity;
    if (sort === 'entry_delta') return out?.zone?.state === 'READY' && out.market?.state === 'READY' ? out.zone.grossPct - out.market.grossPct : -Infinity;
    return row.sentAt;
  };
  viewRows.sort((a,b) => metric(b)-metric(a) || b.sentAt-a.sentAt);
  page = Math.min(page, Math.max(0, Math.ceil(viewRows.length/pageSize)-1));
  $('#signals').innerHTML = viewRows.slice(page*pageSize,(page+1)*pageSize).map(rowHtml).join('') || '<tr><td colspan="9" class="empty">Không có mẫu phù hợp</td></tr>';
  $('#page').textContent = `Trang ${page+1}/${Math.max(1,Math.ceil(viewRows.length/pageSize))} · ${viewRows.length} mẫu`;
  $('#previous').disabled = page===0; $('#next').disabled = (page+1)*pageSize>=viewRows.length;
}

function outcomeHtml(out) {
  if (out?.state !== 'READY') return `<span class="muted">${states[out?.state] ?? 'Chưa có'}</span>`;
  return `${pct(out.grossPct-cost())}<small>Vào ${price(out.entry)}<br>Đi ngược ${numeric(out.maePct)}%</small>`;
}

function rowHtml(row) {
  const out = row.horizons?.[hours()] ?? {}, btc = row.btcReconstructed;
  const side = row.side==='LONG'?'positive':'negative';
  const source = row.historyQuality !== 'SENT_SNAPSHOT' ? 'Chưa lưu nguồn' : row.model?.deterministicFallback ? 'Fallback' : row.model?.applied ? 'Ollama' : 'Chưa rõ nguồn';
  return `<tr><td><a href="/coin-level-analysis?symbol=${encodeURIComponent(row.symbol)}">${escape(row.symbol)}</a><br><span class="pill ${side}">${row.side}</span><small>${escape(row.verdict)} · điểm ${row.strength == null ? 'chưa lưu' : numeric(row.strength,1)}<br>${source}</small></td><td>${time(row.sentAt)}<small>${row.independent4h ? 'Mẫu cách ≥4h' : 'Lặp trong 4h'}</small></td><td>${escape(alignment[row.btcAlignment])}<small>1h ${pct(btc.return1hPct)}<br>4h ${pct(btc.return4hPct)}<br>Động lượng tái dựng</small>${row.btc ? `<small>Trend gốc ${escape(row.btc.trend1h)} / ${escape(row.btc.trend4h)}</small>` : ''}</td><td>${escape(row.market?.regime ?? 'Chưa lưu')}<small>${escape(row.breadth?.state ?? 'Chưa lưu breadth')}</small></td><td>${price(out.market?.entry)}<small>Vùng ${price(row.price?.entryLow)}–${price(row.price?.entryHigh)}<br>Giữa ${price(row.zoneMid)}</small></td><td>${outcomeHtml(out.market)}</td><td>${outcomeHtml(out.zone)}</td><td>${outcomeHtml(out.pullback)}</td><td><button class="details-button" data-event="${escape(row.eventId)}" aria-expanded="${expanded===row.eventId}">Chi tiết</button></td></tr>`
    + (expanded===row.eventId ? `<tr><td colspan="9" class="detail-cell"><div class="detail-grid">${[['market','Vào ngay'],['zone','Giữa vùng'],['pullback','Hồi 0,5%']].map(([key,label])=>{
      const item=out[key];return `<div><b>${label}</b><p>${outcomeHtml(item)}</p><p>Bắt đầu ${time(item?.entryAt)}</p>${item?.touchWindowEnd?`<p>Chạm trong nến đến ${time(item.touchWindowEnd)}; thời gian không chính xác tới giây.</p>`:''}<p>Thoát ${price(item?.exit)} · ${time(item?.exitAt)}</p><p>Đi thuận tối đa ${numeric(item?.mfePct)}% · đi ngược ${numeric(item?.maePct)}%</p></div>`;
    }).join('')}</div><p class="muted">Giá snapshot khi phát ${price(row.price?.live)} · nguồn ${escape(row.price?.source)} · nguồn tín hiệu ${escape(row.candidateInput?.source)} · model ${escape(row.model?.name)} · nến nguồn ${time(row.sourceAt)}. Vùng mô phỏng giữ nguyên từ lúc gửi. ${row.historyQuality==='LEGACY_NO_SNAPSHOT'?'Mẫu cũ chỉ có coin, hướng, verdict, giờ gửi.':''}</p></td></tr>` : '');
}

async function load() {
  try {
    const response=await fetch('/api/ai-signal-review',{cache:'no-store',signal:AbortSignal.timeout(15_000)});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    snapshot=await response.json();render();
    if(snapshot.progress.running && !polling){polling=true;setTimeout(async()=>{polling=false;await load();},2500);}
  }catch(error){$('#status').textContent=`Không tải được: ${error.message}`;$('#refresh').disabled=false;}
}
$('#refresh').addEventListener('click',async()=>{
  $('#refresh').disabled=true;$('#status').textContent='Đang bắt đầu cập nhật…';
  try{const response=await fetch('/api/ai-signal-review',{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(15_000)});if(!response.ok)throw new Error(`HTTP ${response.status}`);await load();}
  catch(error){$('#status').textContent=`Không cập nhật được: ${error.message}`;$('#refresh').disabled=false;}
});
for(const el of document.querySelectorAll('.filters input,.filters select,#group,#sort'))el.addEventListener('input',()=>{page=0;expanded=null;render();});
$('#signals').addEventListener('click',event=>{const button=event.target.closest('[data-event]');if(!button)return;expanded=expanded===button.dataset.event?null:button.dataset.event;render();});
$('#previous').addEventListener('click',()=>{page--;render();});$('#next').addEventListener('click',()=>{page++;render();});
await load();

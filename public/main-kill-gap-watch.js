const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
const num = (value, digits = 2) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US',{maximumFractionDigits:digits}) : '—';
const price = (value) => { const n=Number(value); return !Number.isFinite(n)?'—':n>=100?n.toLocaleString('en-US',{maximumFractionDigits:2}):n>=1?n.toFixed(5).replace(/0+$/,'').replace(/\.$/,''):n.toPrecision(6).replace(/0+$/,'').replace(/\.$/,''); };
const usd = (value) => { const n=Number(value); if(!Number.isFinite(n))return '—'; if(n>=1e9)return `${num(n/1e9,2)}B USD`; if(n>=1e6)return `${num(n/1e6,2)}M USD`; if(n>=1e3)return `${num(n/1e3,2)}K USD`; return `${num(n,2)} USD`; };
const labels={GAP_WIDE_VACUUM_CONFIRMED:'GAP RỘNG + VACUUM',GAP_WIDE_WITH_INTERMEDIATE_DEPTH:'GAP RỘNG · CÓ DEPTH CHẶN',GAP_WIDE_DEPTH_UNCONFIRMED:'GAP RỘNG · CHƯA ĐỦ COVERAGE',GAP_PCT_ONLY_UNCONFIRMED_ATR:'XA THEO % · THIẾU ATR15',GAP_MEDIUM:'GAP VỪA',GAP_NARROW:'GAP HẸP',TOUCHING_MAIN_KILL:'ĐANG CHẠM MAIN KILL',MAIN_KILL_CONSUMED:'MAIN KILL ĐÃ TIÊU THỤ',NO_ACTIVE_MAIN_KILL:'CHƯA CÓ MAIN KILL'};
let snapshot=null;

function tone(status){return status==='GAP_WIDE_VACUUM_CONFIRMED'?'status-vacuum':status==='GAP_WIDE_WITH_INTERMEDIATE_DEPTH'?'status-wide':status==='GAP_WIDE_DEPTH_UNCONFIRMED'||status==='GAP_PCT_ONLY_UNCONFIRMED_ATR'?'status-unknown':'status-medium'}
function filteredRows(){const filter=$('#status-filter').value;return(snapshot?.rows??[]).filter(row=>filter==='ALL'||filter==='VACUUM'&&row.vacuumConfirmed||filter==='WIDE'&&row.wideGap||filter==='ACTIVE'&&row.lifecycle?.active)}
function render(){if(!snapshot)return;$('#version').textContent=snapshot.version;const pending=snapshot.candidateSource==='AI_DETERMINISTIC_SHORTLIST_PENDING_MODEL';$('#ai-context').textContent=pending?'ENGINE SHORTLIST · CHỜ MODEL':`${snapshot.marketRegime??'—'} · ${snapshot.marketBias??'—'}`;$('#ai-time').textContent=snapshot.evaluationAt?new Date(snapshot.evaluationAt).toLocaleString('vi-VN'):'Candidate đầu vào AI · chưa chấm model';$('#count-candidates').textContent=snapshot.counts?.candidates??0;$('#count-wide').textContent=snapshot.counts?.wide??0;$('#count-vacuum').textContent=snapshot.counts?.vacuumConfirmed??0;$('#count-unconfirmed').textContent=snapshot.counts?.depthUnconfirmed??0;const rows=filteredRows();$('#rows').innerHTML=rows.length?rows.map(row=>{const share=Number(row.depth?.intermediateSharePct);const sharePct=Number.isFinite(share)?Math.max(0,Math.min(100,share)):0;const coverage=Number(row.depth?.coveragePct);const gap=Number(row.gapPct);const coveredToMain=Number.isFinite(coverage)&&Number.isFinite(gap)?Math.min(coverage,gap):null;return `<tr><td><a class="coin" href="/coin-level-analysis?symbol=${encodeURIComponent(row.symbol)}">${esc(row.symbol)}</a><span class="pill ${String(row.side).toLowerCase()}">${esc(row.side??'—')} · ${esc(row.verdict??'—')}${row.strength==null?'':` ${num(row.strength,0)}`}</span><small>${esc(row.path??'—')} · ${esc(row.aiHorizon??'—')}</small></td><td><strong>${price(row.markPrice)} → ${price(row.mainKillZone?.low)}–${price(row.mainKillZone?.high)}</strong><small>${esc(row.direction??'—')} · MAIN proxy ${usd(row.mainKillZone?.scoreUsdProxy)}</small></td><td><strong>${num(row.gapPct,3)}%</strong><small>${price(row.gapPrice)} giá</small></td><td><strong>${num(row.gapAtr,2)} ATR</strong><small>ATR15 ${num(row.atr15mPct,3)}%</small></td><td><strong>${usd(row.depth?.intermediateTopNotionalUsd)}</strong><small>${num(row.depth?.intermediateSharePct,1)}% top depth bên ${esc(row.depth?.side??'—')}</small><div class="bar" style="--pct:${sharePct}%"><i></i></div></td><td><strong>${num(coveredToMain,2)} / ${num(row.gapPct,2)}%</strong><small>${row.depth?.coverageEnough?'Đã phủ tới MAIN':'Chưa phủ tới MAIN'} · ${num(row.depth?.intermediateTopZoneCount,0)} bucket giữa</small></td><td><strong class="${tone(row.status)}">${esc(labels[row.status]??row.status)}</strong><small>${esc(row.lifecycle?.label??'—')}${row.stale?' · SNAPSHOT CŨ':''}</small></td><td><a class="open" href="/local-ai-trend-evaluation">AI</a> · <a class="open" href="https://www.binance.com/vi/futures/${encodeURIComponent(row.symbol)}" target="_blank" rel="noreferrer">Binance</a></td></tr>`}).join(''):'<tr><td colspan="8" class="empty">Không có dòng phù hợp bộ lọc.</td></tr>'}
function forecastMarkup(forecast) {
  if (!forecast) return '<small>Chưa có dự báo; làm mới snapshot.</small>';
  const sources = { MAIN_KILL: 'MAIN KILL', RESISTANCE: 'kháng cự', SUPPORT: 'hỗ trợ', BINANCE_DEPTH: 'depth Binance' };
  const range = zone => `${price(zone.low)} – ${price(zone.high)}`;
  const heading = forecast.direction === 'UP' ? 'Nghiêng tăng' : forecast.direction === 'DOWN' ? 'Nghiêng giảm' : 'Chờ xác nhận hướng';
  const target = forecast.target;
  const invalidation = forecast.invalidation;
  return `<div class="price-forecast ${forecast.direction === 'UP' ? 'up' : forecast.direction === 'DOWN' ? 'down' : 'wait'}">
    <strong>${heading} · ${esc(forecast.horizon)}</strong>
    ${target ? `<b class="forecast-target">${range(target)}</b><small>Vùng kiểm tra đầu · ${esc(sources[target.source] ?? target.source)} · cách ${num(target.distancePct)}%</small>` : '<small>Chưa xác định vùng giá dự kiến.</small>'}
    ${forecast.nextTarget ? `<small class="forecast-next">Sau khi vượt vùng đầu → ${range(forecast.nextTarget)} · MAIN</small>` : ''}
    ${forecast.condition ? `<p>${esc(forecast.condition)}</p>` : ''}
    ${invalidation ? `<small class="forecast-invalidation">Vô hiệu nhịp khi nến ${esc(invalidation.closeInterval)} đóng ${invalidation.crossing === 'BELOW' ? 'dưới' : 'trên'} ${price(invalidation.price)}</small>` : '<small>Mốc vô hiệu: chưa có vùng cấu trúc hợp lệ.</small>'}
    <details><summary>Cơ sở dự báo</summary>${(forecast.reasons ?? []).map(reason => `<p>${esc(reason)}</p>`).join('')}
      ${forecast.btcContext ? `<p>BTC: ${esc(forecast.btcContext.regime ?? '—')} · ${esc(forecast.btcContext.bias ?? '—')} · ${esc(new Date(forecast.btcContext.at).toLocaleTimeString('vi-VN'))}</p>` : ''}
      <p>Từ nến và vùng giá trong snapshot${forecast.sourceAt ? ` · ${esc(new Date(forecast.sourceAt).toLocaleTimeString('vi-VN'))}` : ''}. Khung 15m–1h là thời gian theo dõi, không phải thời hạn giá chắc chắn chạm.</p>
    </details>
  </div>`;
}

function renderWithForecasts() {
  render();
  const rows = filteredRows();
  const elements = $('#rows').querySelectorAll('tr');
  if (!rows.length) { elements[0]?.querySelector('td')?.setAttribute('colspan', '9'); return; }
  elements.forEach((element, index) => {
    const cell = element.insertCell(7);
    cell.className = 'forecast-cell';
    cell.innerHTML = forecastMarkup(rows[index].priceForecast);
  });
}

async function load() {
  const button = $('#refresh');
  if (button.disabled) return;
  button.disabled = true;
  $('#status').textContent = 'Đang ghép AI top 10 với Coin Level/LiqScan…';
  try {
    const response = await fetch('/api/local-ai-main-kill-gap-watch', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
    snapshot = data;
    renderWithForecasts();
    $('#status').textContent = `Cập nhật ${new Date(data.generatedAt).toLocaleTimeString('vi-VN')} · ${data.counts?.candidates ?? 0} candidate`;
  } catch (error) {
    $('#status').textContent = `Lỗi: ${error.message}`;
    $('#rows').innerHTML = '<tr><td colspan="9" class="empty">Không tải được dữ liệu.</td></tr>';
  } finally { button.disabled = false; }
}
$('#refresh').addEventListener('click', load);
$('#status-filter').addEventListener('change', renderWithForecasts);
load();
setInterval(load, 60000);

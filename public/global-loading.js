(() => {
  if (window.__globalLoadingInstalled) return;
  window.__globalLoadingInstalled = true;

  const SHOW_DELAY_MS = 120;
  const MIN_VISIBLE_MS = 320;
  const DONE_VISIBLE_MS = 1100;
  let activeRequests = 1;
  let failedRequests = 0;
  let mounted = false;
  let visibleAt = 0;
  let showTimer = null;
  let hideTimer = null;
  let progressEl = null;
  let statusEl = null;
  let textEl = null;

  function clock() {
    return new Date().toLocaleTimeString('vi-VN', { hour12: false });
  }

  function mount() {
    if (mounted || !document.body) return;
    mounted = true;

    const style = document.createElement('style');
    style.textContent = `
      #global-loading-progress{position:fixed;z-index:2147483646;top:0;left:0;width:100%;height:3px;pointer-events:none;opacity:0;transition:opacity .18s ease;background:rgba(255,255,255,.06)}
      #global-loading-progress>i{display:block;width:38%;height:100%;background:#f7c948;box-shadow:0 0 10px rgba(247,201,72,.58);animation:global-loading-sweep 1.05s ease-in-out infinite}
      #global-loading-status{position:fixed;z-index:2147483646;top:12px;right:12px;display:flex;align-items:center;gap:8px;max-width:min(280px,calc(100vw - 24px));padding:7px 10px;border:1px solid #625326;background:#161a19;color:#f5d56a;font:700 11px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:0;border-radius:5px;box-shadow:0 7px 22px rgba(0,0,0,.3);pointer-events:none;opacity:0;transform:translateY(-6px);transition:opacity .18s ease,transform .18s ease}
      #global-loading-status.is-visible,#global-loading-progress.is-visible{opacity:1}
      #global-loading-status.is-visible{transform:translateY(0)}
      #global-loading-status.is-done{border-color:#197b64;color:#42e6b5;background:#10231f}
      #global-loading-status.is-error{border-color:#a23c52;color:#ff718c;background:#2a151b}
      #global-loading-status>i{width:11px;height:11px;flex:0 0 auto;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:global-loading-spin .7s linear infinite}
      #global-loading-status.is-done>i{border:0;border-radius:0;width:12px;height:7px;transform:rotate(-45deg);border-left:2px solid currentColor;border-bottom:2px solid currentColor;animation:none}
      #global-loading-status.is-error>i{border:0;border-radius:0;animation:none;position:relative}
      #global-loading-status.is-error>i:before,#global-loading-status.is-error>i:after{content:"";position:absolute;left:5px;top:0;width:2px;height:12px;background:currentColor;transform:rotate(45deg)}
      #global-loading-status.is-error>i:after{transform:rotate(-45deg)}
      @keyframes global-loading-spin{to{transform:rotate(360deg)}}
      @keyframes global-loading-sweep{0%{transform:translateX(-120%)}100%{transform:translateX(360%)}}
      @media (prefers-reduced-motion:reduce){#global-loading-progress>i,#global-loading-status>i{animation-duration:2.2s}}
    `;

    const progress = document.createElement('div');
    progress.id = 'global-loading-progress';
    progress.setAttribute('aria-hidden', 'true');
    progress.innerHTML = '<i></i>';

    const status = document.createElement('div');
    status.id = 'global-loading-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.innerHTML = '<i></i><span>ĐANG TẢI...</span>';

    document.head.appendChild(style);
    document.body.append(progress, status);
    progressEl = progress;
    statusEl = status;
    textEl = status.querySelector('span');

    if (activeRequests > 0) scheduleShow();
  }

  function setVisible(visible) {
    if (!mounted) mount();
    if (!mounted) return;
    progressEl.classList.toggle('is-visible', visible);
    statusEl.classList.toggle('is-visible', visible);
    if (visible && !visibleAt) visibleAt = Date.now();
    if (!visible) visibleAt = 0;
  }

  function showLoading() {
    if (!mounted) mount();
    if (!mounted || activeRequests <= 0) return;
    clearTimeout(hideTimer);
    statusEl.classList.remove('is-done', 'is-error');
    textEl.textContent = activeRequests > 1 ? `ĐANG TẢI · ${activeRequests}` : 'ĐANG TẢI...';
    setVisible(true);
  }

  function scheduleShow() {
    clearTimeout(showTimer);
    showTimer = setTimeout(showLoading, SHOW_DELAY_MS);
  }

  function begin() {
    activeRequests += 1;
    if (activeRequests === 1) failedRequests = 0;
    clearTimeout(hideTimer);
    scheduleShow();
  }

  function finish(failed = false) {
    if (failed) failedRequests += 1;
    activeRequests = Math.max(0, activeRequests - 1);
    if (activeRequests > 0) {
      if (statusEl?.classList.contains('is-visible')) showLoading();
      return;
    }

    clearTimeout(showTimer);
    if (!mounted) mount();
    if (!mounted) return;

    const elapsed = visibleAt ? Date.now() - visibleAt : 0;
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      progressEl.classList.remove('is-visible');
      statusEl.classList.remove('is-done', 'is-error');
      statusEl.classList.add(failedRequests ? 'is-error' : 'is-done', 'is-visible');
      textEl.textContent = failedRequests ? `TẢI LỖI · ${clock()}` : `ĐÃ CẬP NHẬT · ${clock()}`;
      visibleAt = Date.now();
      if (!failedRequests) {
        hideTimer = setTimeout(() => setVisible(false), DONE_VISIBLE_MS);
      }
    }, wait);
  }

  const nativeFetch = window.fetch?.bind(window);
  if (nativeFetch) {
    window.fetch = (...args) => {
      begin();
      return nativeFetch(...args).then(
        (response) => {
          finish(!response.ok);
          return response;
        },
        (error) => {
          finish(true);
          throw error;
        },
      );
    };
  }

  const nativeXhrSend = window.XMLHttpRequest?.prototype.send;
  if (nativeXhrSend) {
    window.XMLHttpRequest.prototype.send = function patchedSend(...args) {
      begin();
      let settled = false;
      const complete = () => {
        if (settled) return;
        settled = true;
        finish(this.status === 0 || this.status >= 400);
      };
      this.addEventListener('loadend', complete, { once: true });
      try {
        return nativeXhrSend.apply(this, args);
      } catch (error) {
        complete();
        throw error;
      }
    };
  }

  window.pageLoading = { start: begin, finish };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }

  if (document.readyState === 'complete') {
    finish(false);
  } else {
    window.addEventListener('load', () => finish(false), { once: true });
  }
})();

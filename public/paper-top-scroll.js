(() => {
  const CONTAINER_SELECTOR = "[data-paper-scroll]";
  const READY_ATTR = "data-paper-scroll-ready";
  const STYLE_ID = "paper-top-scroll-style";

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .paper-top-scroll {
        width: 100%;
        height: 16px;
        margin: 8px 0 5px;
        overflow-x: auto;
        overflow-y: hidden;
        border: 1px solid rgba(148, 163, 184, .22);
        border-radius: 6px;
        background: rgba(15, 23, 42, .42);
        scrollbar-color: #64748b rgba(15, 23, 42, .55);
        scrollbar-width: auto;
      }
      .paper-top-scroll[hidden] {
        display: none;
      }
      .paper-top-scroll-spacer {
        height: 1px;
        min-width: 100%;
        pointer-events: none;
      }
      .paper-top-scroll::-webkit-scrollbar {
        height: 12px;
      }
      .paper-top-scroll::-webkit-scrollbar-track {
        background: rgba(15, 23, 42, .55);
        border-radius: 999px;
      }
      .paper-top-scroll::-webkit-scrollbar-thumb {
        background: #475569;
        border: 2px solid rgba(15, 23, 42, .55);
        border-radius: 999px;
      }
      .paper-top-scroll::-webkit-scrollbar-thumb:hover {
        background: #64748b;
      }
    `;
    document.head.appendChild(style);
  }

  function setup(container) {
    if (
      !(container instanceof HTMLElement) ||
      container.hasAttribute(READY_ATTR)
    ) {
      return;
    }
    const table = container.querySelector("table");
    if (!table) return;

    container.setAttribute(READY_ATTR, "true");
    const top = document.createElement("div");
    const spacer = document.createElement("div");
    top.className = "paper-top-scroll";
    spacer.className = "paper-top-scroll-spacer";
    top.setAttribute(
      "aria-label",
      container.getAttribute("data-paper-scroll-label") ||
        "Cuộn ngang phía trên bảng paper",
    );
    top.tabIndex = 0;
    top.appendChild(spacer);
    container.parentNode?.insertBefore(top, container);

    let syncing = false;
    const syncFromTop = () => {
      if (syncing) return;
      syncing = true;
      container.scrollLeft = top.scrollLeft;
      syncing = false;
    };
    const syncFromTable = () => {
      if (syncing) return;
      syncing = true;
      top.scrollLeft = container.scrollLeft;
      syncing = false;
    };
    const update = () => {
      const contentWidth = Math.max(
        table.scrollWidth,
        container.scrollWidth,
        container.clientWidth,
      );
      spacer.style.width = `${contentWidth}px`;
      top.hidden = contentWidth <= container.clientWidth + 1;
      if (!top.hidden) top.scrollLeft = container.scrollLeft;
    };

    top.addEventListener("scroll", syncFromTop, { passive: true });
    container.addEventListener("scroll", syncFromTable, { passive: true });

    if ("ResizeObserver" in window) {
      const resizeObserver = new ResizeObserver(update);
      resizeObserver.observe(container);
      resizeObserver.observe(table);
    } else {
      window.addEventListener("resize", update, { passive: true });
    }

    requestAnimationFrame(update);
  }

  function scan(root = document) {
    if (root instanceof Element && root.matches(CONTAINER_SELECTOR)) {
      setup(root);
    }
    root.querySelectorAll?.(CONTAINER_SELECTOR).forEach(setup);
  }

  function boot() {
    installStyle();
    scan();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (
            node.matches(CONTAINER_SELECTOR) ||
            node.querySelector(CONTAINER_SELECTOR)
          ) {
            scan(node);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();

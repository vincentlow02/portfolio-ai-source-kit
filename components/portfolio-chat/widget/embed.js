(() => {
  const script = document.currentScript;
  const config = /* widget-config */ null;
  if (!script || !config || location.origin !== config.origin || document.querySelector("portfolio-ai-preview")) return;
  const approved = new Set(config.paths);
  const url = new URL("/", script.src);
  const host = document.createElement("portfolio-ai-preview");
  const shadow = host.attachShadow({ mode: "open" });
  const mobile = window.matchMedia("(max-width: 1023px)");
  // Keep keyboard selection available when the browser reports no pointer.
  const selectionInput = window.matchMedia("(any-pointer: fine), (any-pointer: none)");
  const viewport = window.visualViewport;
  let ready = false;
  let selected = null;
  let queuedQuote = null;
  let previousOverflow;

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = new URL("embed.css", url).href;

  function icon(name) {
    const image = document.createElement("img");
    image.src = new URL(`widget/${name}.svg`, url).href;
    image.alt = "";
    return image;
  }

  const launcher = document.createElement("button");
  launcher.className = "launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Ask about this portfolio");
  launcher.setAttribute("aria-expanded", "false");
  launcher.setAttribute("aria-controls", "portfolio-ai-panel");
  launcher.title = "Ask about this portfolio";
  launcher.append(icon("sparkles"));

  const selectionAction = document.createElement("button");
  selectionAction.className = "selection-action";
  selectionAction.type = "button";
  selectionAction.hidden = true;
  selectionAction.append(icon("select"), "Ask AI Kit");

  const frame = document.createElement("iframe");
  frame.id = "portfolio-ai-panel";
  frame.title = "Portfolio AI";
  frame.hidden = true;

  function post(message) { frame.contentWindow?.postMessage(message, url.origin); }

  function resize() {
    const lock = mobile.matches && !frame.hidden;
    if (lock && previousOverflow === undefined) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    } else if (!lock && previousOverflow !== undefined) {
      document.body.style.overflow = previousOverflow;
      previousOverflow = undefined;
    }
    frame.style.height = lock && viewport ? `${viewport.height}px` : "";
    frame.style.top = lock && viewport ? `${viewport.offsetTop}px` : "";
  }

  function sendLayout(focus) {
    if (!frame.hidden && ready) post({ type: "portfolio-ai:layout", mobile: mobile.matches, focus });
  }

  function showPanel() {
    frame.hidden = false;
    launcher.hidden = true;
    launcher.setAttribute("aria-expanded", "true");
    if (!frame.hasAttribute("src")) frame.src = url.href;
    resize();
    sendLayout(true);
    if (ready && queuedQuote) {
      post({ type: "portfolio-ai:quote", selection: queuedQuote });
      queuedQuote = null;
    }
  }

  function hideSelection() {
    selected = null;
    selectionAction.hidden = true;
  }

  function currentPage() {
    const pathname = location.pathname.replace(/\/$/u, "") || "/";
    const lang = new URLSearchParams(location.search).get("lang");
    const source = lang ? `${pathname}?lang=${lang}` : pathname;
    if (!approved.has(source) || document.querySelector('[data-portfolio-access="protected"], input[type="password"]')) return;
    const robots = document.querySelectorAll('meta[name="robots" i], meta[name="googlebot" i]');
    if (Array.from(robots).some(meta => /\b(?:noindex|none)\b/iu.test(meta.getAttribute("content") ?? ""))) return;
    return { pathname, ...(lang ? { lang } : {}) };
  }

  function positionSelectionAction(rect) {
    const { offsetWidth: width, offsetHeight: height } = selectionAction;
    const left = rect.left + (rect.width - width) / 2;
    const above = rect.top - height - 8;
    const top = above >= 8 ? above : rect.bottom + 8;
    selectionAction.style.left = `${Math.max(8, Math.min(left, innerWidth - width - 8))}px`;
    selectionAction.style.top = `${Math.max(8, Math.min(top, innerHeight - height - 8))}px`;
  }

  function showSelection() {
    if (!selectionInput.matches) return hideSelection();
    if (shadow.activeElement === selectionAction) return;
    const page = currentPage();
    const selection = window.getSelection();
    const main = document.querySelector("main");
    if (!page || !main || !selection || selection.isCollapsed || selection.rangeCount !== 1) return hideSelection();

    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();
    const element = node => node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const start = element(range.startContainer);
    const end = element(range.endContainer);
    const excluded = "nav, footer, button, input, textarea, select, form, [contenteditable], [hidden], [inert], [aria-hidden='true' i]";
    if (text.length < 3 || text.length > 1200 || !start || !end || !main.contains(start) || !main.contains(end) ||
        start.closest(excluded) || end.closest(excluded) || Array.from(main.querySelectorAll(excluded)).some(node => range.intersectsNode(node))) return hideSelection();
    const rect = range.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight) return hideSelection();

    const section = start.closest("section[id]");
    const { pathname, ...language } = page;
    selected = { pagePath: pathname, text, sectionId: section && section === end.closest("section[id]") ? section.id : null, ...language };
    selectionAction.hidden = false;
    positionSelectionAction(rect);
  }

  launcher.addEventListener("click", showPanel);
  selectionAction.addEventListener("pointerdown", event => event.preventDefault());
  selectionAction.addEventListener("click", () => {
    if (!selected) return;
    queuedQuote = selected;
    hideSelection();
    window.getSelection()?.removeAllRanges();
    showPanel();
  });
  document.addEventListener("selectionchange", showSelection);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") hideSelection();
  });
  window.addEventListener("scroll", hideSelection, true);
  window.addEventListener("resize", hideSelection);
  selectionInput.addEventListener("change", hideSelection);
  mobile.addEventListener("change", () => { hideSelection(); resize(); sendLayout(false); });
  viewport?.addEventListener("resize", resize);
  viewport?.addEventListener("scroll", resize);

  window.addEventListener("message", event => {
    if (event.origin !== url.origin || event.source !== frame.contentWindow) return;
    if (event.data?.type === "portfolio-ai:page-context") event.ports[0]?.postMessage(currentPage());
    if (event.data?.type === "portfolio-ai:ready") { ready = true; if (!frame.hidden) showPanel(); }
    if (event.data?.type === "portfolio-ai:close") {
      frame.hidden = true;
      launcher.hidden = false;
      launcher.setAttribute("aria-expanded", "false");
      resize();
      launcher.focus({ preventScroll: true });
    }
  });

  shadow.append(stylesheet, launcher, selectionAction, frame);
  document.body.append(host);
})();

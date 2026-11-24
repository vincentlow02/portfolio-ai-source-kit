(() => {
  const script = document.currentScript;
  const config = /* widget-config */ null;
  if (!script || !config || location.origin !== config.origin || document.querySelector("portfolio-ai-preview")) return;
  const approved = new Set(config.paths);
  const url = new URL("/", script.src);
  const host = document.createElement("portfolio-ai-preview");
  const shadow = host.attachShadow({ mode: "open" });
  const mobile = window.matchMedia("(max-width: 1023px)");
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
  selectionAction.append(icon("select"), "Ask Portfolio AI");

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

  function showSelection() {
    if (mobile.matches) return hideSelection();
    const lang = new URLSearchParams(location.search).get("lang");
    const source = lang ? `${location.pathname}?lang=${lang}` : location.pathname;
    const selection = window.getSelection();
    const main = document.querySelector("main");
    if (!approved.has(source) || !main || !selection || selection.isCollapsed || selection.rangeCount !== 1 ||
        document.querySelector('meta[name="robots" i][content*="noindex" i], [data-portfolio-access="protected"]')) return hideSelection();

    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();
    const element = node => node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const start = element(range.startContainer);
    const end = element(range.endContainer);
    const excluded = "nav, footer, button, input, textarea, select, form, [contenteditable], [hidden], [inert], [aria-hidden='true']";
    if (text.length < 3 || text.length > 1200 || !start || !end || !main.contains(start) || !main.contains(end) ||
        start.closest(excluded) || end.closest(excluded) || Array.from(main.querySelectorAll(excluded)).some(node => range.intersectsNode(node))) return hideSelection();
    const rect = range.getBoundingClientRect();
    if (!rect.width || !rect.height) return hideSelection();

    const section = start.closest("section[id]");
    selected = { pagePath: location.pathname, text, sectionId: section && section === end.closest("section[id]") ? section.id : null, ...(lang ? { lang } : {}) };
    selectionAction.hidden = false;
    selectionAction.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - selectionAction.offsetWidth - 8))}px`;
    selectionAction.style.top = `${Math.max(8, Math.min(rect.bottom + 8, innerHeight - 42))}px`;
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
  window.addEventListener("scroll", hideSelection, true);
  mobile.addEventListener("change", () => { hideSelection(); resize(); sendLayout(false); });
  viewport?.addEventListener("resize", resize);
  viewport?.addEventListener("scroll", resize);

  window.addEventListener("message", event => {
    if (event.origin !== url.origin || event.source !== frame.contentWindow) return;
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

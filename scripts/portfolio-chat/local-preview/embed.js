(() => {
  const script = document.currentScript;
  if (!script || document.querySelector("portfolio-ai-preview")) return;
  const url = new URL("/", script.src);
  const host = document.createElement("portfolio-ai-preview");
  const shadow = host.attachShadow({ mode: "open" });

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = new URL("embed.css", url).href;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Ask about this portfolio";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", "portfolio-ai-panel");
  const frame = document.createElement("iframe");
  frame.id = "portfolio-ai-panel";
  frame.title = "Portfolio AI";
  frame.hidden = true;

  button.addEventListener("click", () => {
    const open = frame.hidden;
    if (open && !frame.hasAttribute("src")) frame.src = url.href;
    frame.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    button.textContent = open ? "Close portfolio chat" : "Ask about this portfolio";
  });

  shadow.append(stylesheet, button, frame);
  document.body.append(host);
})();

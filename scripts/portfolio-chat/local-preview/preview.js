const body = document.body;
const portfolioOrigin = body.dataset.portfolioOrigin;
const close = document.querySelector("#close");
const form = document.querySelector("form");
const input = document.querySelector("#question");
const send = form.querySelector("button");
const welcome = document.querySelector("#welcome");
const messages = document.querySelector("#messages");
const asked = document.querySelector("#asked");
const output = document.querySelector("#output");
const quotePreview = document.querySelector("#quote");
const quoteText = document.querySelector("#quote-text");
const embedded = window.parent !== window;
let quote = null;
let pending = null;
let history = [];

function setQuote(selection) {
  quote = selection;
  quotePreview.hidden = !selection;
  const text = selection?.text ?? "";
  quoteText.textContent = text.length > 180 ? `${text.slice(0, 180)}…` : text;
  input.placeholder = selection ? "Ask about this quote..." : "Ask about this portfolio...";
}

function updateSend() {
  send.disabled = Boolean(pending) || !input.value.trim();
}

function viewSources(sources) {
  const links = document.createElement("div");
  for (const source of sources) {
    let url;
    try { url = new URL(source.href); } catch { continue; }
    if (url.origin !== portfolioOrigin || url.username || url.password || typeof source.section !== "string") continue;
    const link = document.createElement("a");
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `${source.section} ↗`;
    links.append(link);
  }
  if (!links.children.length) return null;
  const metadata = document.createElement("div");
  metadata.className = "metadata";
  const details = document.createElement("details");
  details.className = "sources";
  const summary = document.createElement("summary");
  const count = document.createElement("span");
  count.textContent = String(links.children.length).padStart(2, "0");
  summary.append("Sources", count);
  details.append(summary, links);
  metadata.append(details);
  return metadata;
}

function showAnswer(answer, sources = [], questions = []) {
  const reply = document.createElement("div");
  reply.className = "assistant";
  const text = document.createElement("p");
  text.textContent = answer;
  reply.append(text);
  const citations = viewSources(sources);
  if (citations) reply.append(citations);
  if (questions.length) {
    const followups = document.createElement("div");
    followups.className = "followups";
    followups.setAttribute("aria-label", "Suggested follow-up questions");
    for (const question of questions.slice(0, 2)) {
      if (typeof question !== "string" || !question.trim()) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.title = question;
      const icon = document.createElement("img");
      icon.src = "/widget/followup.svg";
      icon.alt = "";
      const label = document.createElement("span");
      label.textContent = question;
      button.append(icon, label);
      button.addEventListener("click", () => void ask(question));
      followups.append(button);
    }
    if (followups.children.length) reply.append(followups);
  }
  output.replaceChildren(reply);
}

async function ask(value) {
  const content = value.trim();
  if (!content || pending) return;
  const request = new AbortController();
  pending = request;
  const selectionContext = quote;
  setQuote(null);
  input.value = "";
  updateSend();
  asked.textContent = content;
  welcome.hidden = true;
  messages.hidden = false;
  document.querySelector("#chat-content").scrollTop = 0;
  const status = document.createElement("p");
  status.className = "thinking";
  status.textContent = "Thinking...";
  output.replaceChildren(status);
  try {
    const prior = history.slice();
    const requestBody = () => JSON.stringify({
      messages: [...prior, { role: "user", content }],
      ...(selectionContext ? { selectionContext } : {}),
    });
    let envelope = requestBody();
    while (prior.length && new TextEncoder().encode(envelope).byteLength > 16_000) {
      prior.splice(0, 2);
      envelope = requestBody();
    }
    const response = await fetch("/api/preview", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: request.signal,
      body: envelope,
    });
    const result = await response.json();
    if (pending !== request) return;
    if (!response.ok) {
      showAnswer(response.status === 400 && selectionContext ? "This selection could not be verified. Select a shorter passage on the current page." :
        response.status === 429 ? "Too many requests. Please try again later." : "The assistant is temporarily unavailable.");
      return;
    }
    if (typeof result.answer !== "string" || !result.answer.trim()) throw new Error("Invalid reply");
    history = [...history, { role: "user", content }, { role: "assistant", content: result.answer.trim().slice(0, 1000) }].slice(-4);
    showAnswer(result.answer, result.sources, result.followUpQuestions);
  } catch {
    if (pending === request) showAnswer("The assistant is temporarily unavailable.");
  } finally {
    if (pending === request) {
      pending = null;
      updateSend();
    }
  }
}

document.querySelector("#reset").addEventListener("click", () => {
  pending?.abort();
  pending = null;
  history = [];
  setQuote(null);
  input.value = "";
  asked.textContent = "";
  output.replaceChildren();
  messages.hidden = true;
  welcome.hidden = false;
  updateSend();
  input.focus();
});

document.querySelector("#remove-quote").addEventListener("click", () => { setQuote(null); input.focus(); });
for (const suggestion of document.querySelectorAll(".suggestions button")) {
  suggestion.addEventListener("click", () => void ask(suggestion.textContent));
}
form.addEventListener("submit", event => { event.preventDefault(); void ask(input.value); });
input.addEventListener("input", updateSend);
input.addEventListener("keydown", event => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  void ask(input.value);
});

if (embedded) {
  function closePanel() { window.parent.postMessage({ type: "portfolio-ai:close" }, portfolioOrigin); }
  close.addEventListener("click", closePanel);
  document.addEventListener("keydown", event => { if (event.key === "Escape") closePanel(); });
  window.addEventListener("message", event => {
    if (event.source !== window.parent || event.origin !== portfolioOrigin) return;
    const data = event.data;
    if (data?.type === "portfolio-ai:layout") {
      body.dataset.layout = data.mobile ? "mobile" : "desktop";
      if (data.focus) document.querySelector(".panel").focus({ preventScroll: true });
    }
    if (data?.type === "portfolio-ai:quote" && typeof data.selection?.text === "string") {
      setQuote(data.selection);
      input.focus({ preventScroll: true });
    }
  });
  window.parent.postMessage({ type: "portfolio-ai:ready" }, portfolioOrigin);
} else {
  close.hidden = true;
  if (window.matchMedia("(max-width: 560px)").matches) body.dataset.layout = "mobile";
}
input.disabled = false;

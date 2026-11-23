const form = document.querySelector("form");
const input = document.querySelector("#question");
const submit = form.querySelector("button");
const output = document.querySelector("#output");

function show(text, sources = []) {
  const answer = document.createElement("p");
  answer.textContent = text;
  output.replaceChildren(answer);
  for (const source of sources) {
    const link = document.createElement("a");
    link.href = source.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `Source: ${source.section}`;
    output.append(link);
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const content = input.value.trim();
  if (!content || submit.disabled) return;
  submit.disabled = true;
  show("Looking up portfolio evidence…");
  try {
    const response = await fetch("/api/preview", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content }] }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    show(result.answer, result.sources);
  } catch (error) {
    show(error instanceof Error ? error.message : "The local preview is unavailable.");
  } finally {
    submit.disabled = false;
  }
});

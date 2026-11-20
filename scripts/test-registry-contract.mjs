import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { kitFiles } from "./copy-portfolio-kit.mjs";

test("registry distributes the same reusable kit as the manual installer", async () => {
  const registry = JSON.parse(await readFile(new URL("../registry.json", import.meta.url), "utf8"));
  const item = registry.items.find(entry => entry.name === "portfolio-ai");
  assert.ok(item);
  const targets = new Set();
  for (const file of item.files) {
    assert.equal(file.type, "registry:file");
    assert.match(file.target, /^~\//u);
    assert.ok(!targets.has(file.target), `duplicate target: ${file.target}`);
    targets.add(file.target);
    assert.ok(await readFile(new URL(`../${file.path}`, import.meta.url), "utf8"));
  }
  for (const path of kitFiles) assert.ok(targets.has(`~/${path}`), `registry is missing ${path}`);
  assert.ok(targets.has("~/.agents/skills/portfolio-ai-install/SKILL.md"));
  assert.ok(!targets.has("~/AGENTS.md"));
});

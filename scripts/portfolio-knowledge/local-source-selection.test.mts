import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parsePageSelection, readApprovedPreviewPaths } from "./local-source-selection";

test("the local prompt accepts all, selected numbers, or cancellation", () => {
  const paths = ["/", "/projects", "/projects/studio?lang=ja"];
  assert.deepEqual(parsePageSelection("all", paths), paths);
  assert.deepEqual(parsePageSelection("3, 1, 3", paths), [paths[0], paths[2]]);
  assert.deepEqual(parsePageSelection(" ", paths), []);
  assert.equal(parsePageSelection("1, 4", paths), null);
  assert.equal(parsePageSelection("1,", paths), null);
});

test("local source approval belongs to the saved origin and preserves locale variants", async t => {
  const origin = "http://127.0.0.1:5173";
  const directory = await mkdtemp(join(tmpdir(), "portfolio-source-selection-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "local-preview.json");
  assert.equal(await readApprovedPreviewPaths(file, origin), undefined);

  const approvedPaths = ["/", "/projects/studio?lang=ja"];
  await writeFile(file, JSON.stringify({ origin, approvedPaths }));
  assert.deepEqual(await readApprovedPreviewPaths(file, origin), approvedPaths);
  assert.equal(await readApprovedPreviewPaths(file, "http://127.0.0.1:5174"), undefined);

  await writeFile(file, JSON.stringify({ origin, approvedPaths: ["/private/notes"] }));
  assert.equal(await readApprovedPreviewPaths(file, origin), undefined);
  await writeFile(file, JSON.stringify({ origin }));
  assert.equal(await readApprovedPreviewPaths(file, origin), undefined);
});

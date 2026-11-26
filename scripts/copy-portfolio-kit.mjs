import { constants } from "node:fs";
import { access, copyFile, lstat, mkdir, readFile, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

function assertInside(base, path) {
  const offset = relative(base, path);
  if (offset === ".." || offset.startsWith(".." + sep) || isAbsolute(offset)) {
    throw new Error("Portfolio AI install path escapes its root: " + path);
  }
}

function manifestPath(base, path) {
  if (typeof path !== "string" || !path || isAbsolute(path) || /[\\:\0]/u.test(path) ||
      path.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error("Invalid Portfolio AI registry path: " + path);
  }
  return join(base, path);
}

async function canonicalPath(path) {
  try {
    return await realpath(path);
  } catch (error) {
    const parent = dirname(path);
    if (error.code !== "ENOENT" || parent === path) throw error;
    return join(await canonicalPath(parent), basename(path));
  }
}

export async function copyPortfolioKit(destination) {
  const sourceRoot = await realpath(root);
  const hostRoot = await canonicalPath(resolve(destination));
  const registry = JSON.parse(await readFile(join(sourceRoot, "registry.json"), "utf8"));
  const item = registry.items.find(entry => entry.name === "portfolio-ai");
  if (!Array.isArray(item?.files) || !item.files.length) throw new Error("Missing portfolio-ai registry files");
  const files = [];
  const targets = new Set();

  for (const file of item.files) {
    if (typeof file.target !== "string" || !file.target.startsWith("~/")) {
      throw new Error("Expected a host-relative Portfolio AI registry target");
    }
    const source = await realpath(manifestPath(sourceRoot, file.path));
    assertInside(sourceRoot, source);
    if (!(await lstat(source)).isFile()) throw new Error("Expected a Portfolio AI registry file: " + file.path);
    const target = manifestPath(hostRoot, file.target.slice(2));
    assertInside(hostRoot, await canonicalPath(dirname(target)));
    const key = process.platform === "win32" ? target.toLowerCase() : target;
    if (targets.has(key)) throw new Error("Duplicate Portfolio AI registry target: " + file.target);
    targets.add(key);
    try {
      await lstat(target);
      throw new Error("The host already contains " + relative(hostRoot, target));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    files.push({ source, target });
  }
  for (const { source, target } of files) {
    await mkdir(dirname(target), { recursive: true });
    assertInside(hostRoot, await realpath(dirname(target)));
    await copyFile(source, target, constants.COPYFILE_EXCL);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error("Provide the host portfolio directory");
  const destination = resolve(process.argv[2]);
  await access(join(destination, "package.json"));
  await copyPortfolioKit(destination);
  console.log("Copied Portfolio AI source files into " + destination);
}

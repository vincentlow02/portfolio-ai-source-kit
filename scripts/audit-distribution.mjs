import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Audit every tracked file. Do not print matching contents or potential secrets.
const files = execFileSync("git", ["ls-files", "-z"], {encoding:"utf8"}).split("\0").filter(Boolean);
const forbidden = ["into" + "day", "go" + "event", "weave" + " ai", "cur" + "io", "vincent" + "low.work"];
const widgetIcon = /^scripts\/portfolio-chat\/local-preview\/icons\/(sparkles|reset|close|suggestion|send|followup|quote|remove|select)\.svg$/u;
for (const file of files) {
  if (/(?:^|\/)(?:\.env(?!\.example$)|node_modules|\.next|\.portfolio-knowledge|\.vercel|private)(?:\/|$)/iu.test(file) ||
      (!widgetIcon.test(file) && /\.(?:png|jpe?g|webp|gif|svg|mp[34]|mov|woff2?|ttf|pdf|docx?)$/iu.test(file))) throw new Error(`Excluded file category: ${file}`);
  const data = readFileSync(file);
  if (data.includes(0)) throw new Error(`Unexpected binary file: ${file}`);
  const text = data.toString("utf8");
  if (forbidden.some(term => new RegExp(`(?<![a-z0-9])${term.replaceAll(".", "\\.")}(?![a-z0-9])`, "iu").test(text))) throw new Error(`Excluded portfolio reference: ${file}`);
  if (/(?:sk-[A-Za-z0-9_-]{30,}|sb_secret_[A-Za-z0-9_-]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/u.test(text)) throw new Error(`Possible secret: ${file}`);
}
console.log(`Audited ${files.length} tracked source files: no excluded media, portfolio references or candidate credentials.`);

import { spawn } from "node:child_process";

const args = process.argv.slice(2);
if (args.some(arg => arg.startsWith("-H") || arg === "--hostname" || arg.startsWith("--hostname="))) {
  console.error("The local development server must bind to 127.0.0.1.");
  process.exit(1);
}
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", ...args], {
  env: { ...process.env, PORTFOLIO_AI_LOOPBACK_BOUND: "1" }, stdio: "inherit", windowsHide: true,
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", () => { console.error("Could not start the development server."); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });

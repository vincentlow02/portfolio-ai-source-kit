import { lookup } from "node:dns/promises";
import { get } from "node:https";
import { BlockList } from "node:net";
import type { ResponseForRequest } from "puppeteer";
import { hostedPortfolioOrigin } from "../../lib/knowledge/hosted-origin";

const nonPublic = new BlockList();
for (const [network, length] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3],
] as const) nonPublic.addSubnet(network, length);

export async function hostedResourceLoader(value: string) {
  const origin = hostedPortfolioOrigin(value);
  const { hostname } = new URL(origin);
  const addresses = await lookup(hostname, { family: 4, all: true });
  if (!addresses.length || addresses.some(({ address }) => nonPublic.check(address))) {
    throw new Error("The portfolio domain must resolve to a public IPv4 address");
  }
  const address = addresses[0].address;
  const maxResourceBytes = 2 * 1024 * 1024;
  const maxCaptureBytes = 32 * 1024 * 1024;
  let received = 0;
  const responses = new Map<string, Promise<Partial<ResponseForRequest>>>();

  return (input: string): Promise<Partial<ResponseForRequest>> => {
    const url = new URL(input);
    if (url.origin !== origin || url.username || url.password) throw new Error("Resource outside the configured portfolio origin");
    const existing = responses.get(url.href);
    if (existing) return existing;

    const response = new Promise<Partial<ResponseForRequest>>((resolve, reject) => {
      const request = get(url, {
        family: 4, agent: false, lookup: (_name, _options, callback) => callback(null, address, 4),
        headers: { "Accept-Encoding": "identity", "User-Agent": "PortfolioAI/1.0" }, signal: AbortSignal.timeout(12000),
      }, result => {
        if (result.statusCode !== 200) {
          result.destroy();
          reject(new Error(`The source returned HTTP ${result.statusCode}. Use its final anonymous HTTP 200 URL.`));
          return;
        }
        if (result.headers["content-encoding"] && result.headers["content-encoding"] !== "identity") {
          result.destroy();
          reject(new Error("The source did not honor the identity encoding request"));
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        result.on("error", reject);
        result.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          received += chunk.length;
          if (bytes > maxResourceBytes || received > maxCaptureBytes) {
            result.destroy(new Error("The capture resource size limit was exceeded"));
            return;
          }
          chunks.push(chunk);
        });
        result.on("end", () => {
          const isolated = "connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'";
          const sourcePolicy = result.headers["content-security-policy"];
          resolve({ status: 200, contentType: result.headers["content-type"] ?? "application/octet-stream", body: Buffer.concat(chunks), headers: {
            "content-security-policy": sourcePolicy ? `${sourcePolicy}, ${isolated}` : isolated,
            "x-robots-tag": result.headers["x-robots-tag"] ?? "",
            "x-content-type-options": "nosniff",
          } });
        });
      });
      request.on("error", reject);
    });
    responses.set(url.href, response);
    return response;
  };
}

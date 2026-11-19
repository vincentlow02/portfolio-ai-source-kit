export async function readPortfolioRequest(request: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes || !request.body) throw new Error("Invalid request");
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("Request body timed out")), 10_000);
    onAbort = () => reject(new Error("Request cancelled"));
    if (request.signal.aborted) onAbort(); else request.signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), interrupted]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("Request too large");
      parts.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    clearTimeout(timeout);
    if (onAbort) request.signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
  return JSON.parse(new TextDecoder().decode(Buffer.concat(parts)));
}

/** Bounds CPU and pending HTTP work within one process. Shared model cost is separately reserved. */
export function createRequestLimiter(perMinute: number, maxActive: number, now = Date.now) {
  let minute = -1;
  let requests = 0;
  let active = 0;
  return () => {
    const current = Math.floor(now() / 60_000);
    if (current !== minute) { minute = current; requests = 0; }
    if (requests >= perMinute || active >= maxActive) return null;
    requests++;
    active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active--;
    };
  };
}

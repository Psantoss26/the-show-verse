// Public TMDb metadata only. Never put user tokens or playback/history in here.
export function createRequestCache({ limit = 256, ttl = 10 * 60_000, now = Date.now } = {}) {
  const entries = new Map();
  return function cached(key, load) {
    const entry = entries.get(key);
    if (entry && entry.expires > now()) return entry.promise;
    if (entries.size >= limit) entries.delete(entries.keys().next().value);
    const next = { expires: now() + ttl };
    next.promise = Promise.resolve().then(load).then(value => {
      if (value == null && entries.get(key) === next) entries.delete(key);
      return value;
    }, error => {
      if (entries.get(key) === next) entries.delete(key);
      throw error;
    });
    entries.set(key, next);
    return next.promise;
  };
}

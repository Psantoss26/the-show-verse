export const RETRY_BASE_MS = 6 * 60 * 60 * 1000; // 6h
export const SEEDING_TIMEOUT_MS = 3 * 60 * 1000; // 3min

export function retryBackoffMs(attempts) {
  const n = Number.isFinite(attempts) ? Math.max(0, attempts) : 0;
  // 6h, 12h, 24h… capped at 48h
  return Math.min(RETRY_BASE_MS * 2 ** n, 48 * 60 * 60 * 1000);
}

export function nextRetryDate(attempts, now = Date.now()) {
  return new Date(now + retryBackoffMs(attempts));
}

export function seedDecision(state, now = Date.now()) {
  if (!state || state.status === 'pending') return 'seed';
  if (state.status === 'ready') return 'serve';
  if (state.status === 'seeding') {
    const t = state.updatedAt ? new Date(state.updatedAt).getTime() : 0;
    return (now - t) > SEEDING_TIMEOUT_MS ? 'seed' : 'wait'; // reclaim a stuck seed
  }
  if (state.status === 'failed') {
    const t = state.nextRetryAt ? new Date(state.nextRetryAt).getTime() : 0;
    return t < now ? 'seed' : 'serve';
  }
  return 'serve';
}

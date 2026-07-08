export const RETRY_BASE_MS = 6 * 60 * 60 * 1000; // 6h

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
  if (state.status === 'seeding') return 'wait';
  if (state.status === 'failed') {
    const t = state.nextRetryAt ? new Date(state.nextRetryAt).getTime() : 0;
    return t < now ? 'seed' : 'serve';
  }
  return 'serve';
}

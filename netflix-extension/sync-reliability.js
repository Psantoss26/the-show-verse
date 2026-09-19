/* Pure transport primitives, shared by MV3 scripts and node:test. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TSVSyncReliability = api;
})(typeof self !== 'undefined' ? self : this, function () {
  function retryDelay(attempt, status = 0, retryAfter = 0) {
    if (status === 401 || status === 403) return 5 * 60_000;
    if (status === 404 || status === 422) return 60_000;
    return Math.max(retryAfter, Math.min(5 * 60_000, 5_000 * 2 ** Math.min(attempt, 6)));
  }
  function contentKey(platform, signal) {
    // IDs can identify a series rather than an episode; metadata must participate.
    return [platform, signal.contentId || '', signal.showName || signal.movieTitle || signal.tabTitle || '',
      signal.episodeName || '', signal.season ?? '', signal.episode ?? ''].join('|');
  }
  function createOutbox({ read, write, send, now = Date.now, maxEntries = 1000 }) {
    let serial = Promise.resolve();
    let draining = null;
    const locked = (fn) => {
      const next = serial.then(fn);
      serial = next.catch(() => {});
      return next;
    };
    async function enqueue(owner, payload) {
      return locked(async () => {
        let state = await read() || { owner, entries: [] };
        if (state.owner !== owner) state = { owner, entries: [] };
        if (state.entries.some((e) => e.payload.eventId === payload.eventId)) return;
        if (state.entries.length >= maxEntries) throw new Error('Cola llena: abre el panel de sincronización para revisar la conexión.');
        state.entries.push({ payload, attempts: 0, nextAt: 0 });
        await write(state);
      });
    }
    function drain(owner) {
      if (draining) return draining;
      draining = (async () => {
        // Bound each wake-up; the alarm will resume larger backlogs.
        for (let i = 0; i < 20; i++) {
          const entry = await locked(async () => {
            const state = await read();
            return state?.owner === owner ? state.entries[0] : null;
          });
          if (!entry || entry.nextAt > now()) break;
          let result;
          try { result = await send(entry.payload, owner); }
          catch { result = { status: 0 }; }
          if (result.paused) break;
          const success = result.status >= 200 && result.status < 300 && result.valid !== false;
          const permanent = [400, 410, 413].includes(result.status)
            || ([404, 422].includes(result.status) && entry.attempts >= 2);
          await locked(async () => {
            const state = await read();
            if (state?.owner !== owner) return;
            const idx = state.entries.findIndex((e) => e.payload.eventId === entry.payload.eventId);
            if (idx < 0) return;
            if (success || permanent) {
              state.entries.splice(idx, 1);
              state.lastError = permanent ? `Evento rechazado (HTTP ${result.status})` : null;
              if (success) state.lastSuccessAt = now();
            } else {
              const pending = state.entries[idx];
              pending.attempts++;
              pending.nextAt = now() + retryDelay(pending.attempts, result.status, result.retryAfter);
              state.lastError = result.status === 401 || result.status === 403
                ? 'Vuelve a vincular la extensión.' : 'Sin conexión; reintentando automáticamente.';
            }
            await write(state);
          });
          if (!success && !permanent) break;
        }
      })().finally(() => { draining = null; });
      return draining;
    }
    return { enqueue, drain, rebind: owner => locked(async () => {
      const state = await read();
      if (state?.owner !== owner) await write({ owner, entries: [] });
    }), clear: () => locked(() => write(null)) };
  }
  return { retryDelay, contentKey, createOutbox };
});

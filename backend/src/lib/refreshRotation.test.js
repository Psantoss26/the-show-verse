// src/lib/refreshRotation.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rotateRefreshTokenInStore,
  REFRESH_ROTATION_GRACE_MS,
  REFRESH_TOKEN_TTL_MS,
} from './refreshRotation.js';

const DAY = 24 * 60 * 60 * 1000;

function makeIssuer() {
  let n = 0;
  return () => `rt-${++n}`;
}

test('refresh concurrente con el mismo token: la petición que llega después NO falla (evita logout)', () => {
  const now = 1_000_000;
  const issue = makeIssuer();
  const store = [{ hash: 'rt-0', expiresAt: new Date(now + 30 * DAY) }];

  // Petición «ganadora» que rota el token.
  const first = rotateRefreshTokenInStore(store, 'rt-0', issue, { now });
  assert.equal(first.ok, true);

  // Petición concurrente que llega un instante después con el MISMO token rt-0.
  // Con el borrado inmediato fallaba (401 → /api/auth/me «no autenticado» →
  // logout). Con la ventana de gracia debe seguir siendo válida.
  const concurrent = rotateRefreshTokenInStore(store, 'rt-0', issue, { now: now + 50 });
  assert.equal(
    concurrent.ok,
    true,
    'un refresh concurrente con el mismo token debe seguir siendo válido durante la ventana de gracia',
  );
});

test('varios refrescos concurrentes (ráfaga al cargar el dashboard) sobreviven todos', () => {
  const now = 5_000_000;
  const issue = makeIssuer();
  const store = [{ hash: 'rt-0', expiresAt: new Date(now + 30 * DAY) }];

  // 6 peticiones concurrentes con el mismo refresh token, repartidas en ~120ms.
  const results = [0, 20, 40, 60, 90, 120].map((offset) =>
    rotateRefreshTokenInStore(store, 'rt-0', issue, { now: now + offset }),
  );

  assert.ok(
    results.every((r) => r.ok),
    'ninguna de las peticiones concurrentes debe recibir 401',
  );
});

test('pasada la ventana de gracia, el token retirado se rechaza (la rotación es efectiva)', () => {
  const now = 2_000_000;
  const issue = makeIssuer();
  const store = [{ hash: 'rt-A', expiresAt: new Date(now + 30 * DAY) }];

  const first = rotateRefreshTokenInStore(store, 'rt-A', issue, { now });
  assert.equal(first.ok, true);

  const late = rotateRefreshTokenInStore(store, 'rt-A', issue, {
    now: now + REFRESH_ROTATION_GRACE_MS + 1,
  });
  assert.equal(
    late.ok,
    false,
    'fuera de la ventana de gracia el token antiguo debe rechazarse',
  );
});

test('el token recién emitido conserva la vida larga (la sesión persiste tras días)', () => {
  const now = 3_000_000;
  const issue = makeIssuer();
  const store = [{ hash: 'rt-cur', expiresAt: new Date(now + 30 * DAY) }];

  const { newHash } = rotateRefreshTokenInStore(store, 'rt-cur', issue, { now });
  const fresh = store.find((t) => t.hash === newHash);
  assert.ok(
    fresh.expiresAt.getTime() >= now + REFRESH_TOKEN_TTL_MS - 1000,
    'el refresh token nuevo debe durar ~30 días',
  );
});

test('los tokens ya caducados se limpian en cada rotación (la tabla no crece sin límite)', () => {
  const now = 4_000_000;
  const issue = makeIssuer();
  const store = [
    { hash: 'rt-current', expiresAt: new Date(now + 30 * DAY) },
    { hash: 'rt-old-1', expiresAt: new Date(now - 1000) }, // ya caducado
    { hash: 'rt-old-2', expiresAt: new Date(now - 5 * DAY) }, // ya caducado
  ];

  rotateRefreshTokenInStore(store, 'rt-current', issue, { now });

  assert.ok(
    !store.some((t) => t.hash === 'rt-old-1' || t.hash === 'rt-old-2'),
    'los tokens caducados deben eliminarse',
  );
});

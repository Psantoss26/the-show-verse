// src/lib/jwt.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { signRefreshToken, verifyRefreshToken, hashToken } from './jwt.js';

// REGRESIÓN: dos refrescos del mismo usuario dentro del mismo segundo generaban
// un token idéntico (HS256 es determinista y `iat` tiene resolución de
// segundos). Como `refresh_tokens.token_hash` es UNIQUE, el segundo INSERT
// fallaba y /v1/auth/refresh devolvía 500; al caducar el access token la página
// dispara muchas peticiones a la vez y todas refrescan en el mismo segundo, así
// que las páginas de usuario se quedaban vacías como si se hubiese cerrado
// sesión.
test('dos refresh tokens seguidos del mismo usuario son distintos', async () => {
  const userId = '00000000-0000-4000-8000-000000000000';

  const a = await signRefreshToken({ sub: userId });
  const b = await signRefreshToken({ sub: userId });

  assert.notEqual(a, b, 'los tokens no pueden coincidir');
  assert.notEqual(hashToken(a), hashToken(b), 'los hashes no pueden coincidir');
});

test('un lote concurrente de refresh tokens no repite ningún hash', async () => {
  const userId = '00000000-0000-4000-8000-000000000000';

  const tokens = await Promise.all(
    Array.from({ length: 25 }, () => signRefreshToken({ sub: userId })),
  );
  const hashes = new Set(tokens.map(hashToken));

  assert.equal(hashes.size, tokens.length, 'todos los hashes deben ser únicos');
});

test('el refresh token sigue siendo válido y conserva el sujeto', async () => {
  const userId = '00000000-0000-4000-8000-000000000000';

  const token = await signRefreshToken({ sub: userId });
  const payload = await verifyRefreshToken(token);

  assert.equal(payload.sub, userId);
  assert.ok(payload.jti, 'debe llevar identificador único');
});

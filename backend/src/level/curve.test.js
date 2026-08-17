// backend/src/level/curve.test.js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_LEVEL,
  TIERS,
  xpForLevel,
  levelForXp,
  tierForLevel,
  progressForXp,
} from './curve.js';

// ─────────────────────────────────────────────
// xpForLevel: XP acumulada necesaria para ALCANZAR el nivel n.
// ─────────────────────────────────────────────
test('el nivel 1 no cuesta XP', () => {
  assert.equal(xpForLevel(1), 0);
});

test('la curva sigue 50·(n−1)² + 100·(n−1)', () => {
  assert.equal(xpForLevel(2), 150);
  assert.equal(xpForLevel(10), 4950);
  assert.equal(xpForLevel(20), 19950);
  assert.equal(xpForLevel(40), 79950);
});

test('xpForLevel es monótona creciente en todo el rango', () => {
  for (let n = 2; n <= MAX_LEVEL; n += 1) {
    assert.ok(
      xpForLevel(n) > xpForLevel(n - 1),
      `el nivel ${n} debe costar más que el ${n - 1}`,
    );
  }
});

test('xpForLevel recorta niveles fuera de rango en vez de extrapolar', () => {
  assert.equal(xpForLevel(0), 0);
  assert.equal(xpForLevel(-5), 0);
  assert.equal(xpForLevel(MAX_LEVEL + 10), xpForLevel(MAX_LEVEL));
});

// ─────────────────────────────────────────────
// levelForXp: inversa de la curva.
// ─────────────────────────────────────────────
test('sin XP el usuario está en el nivel 1', () => {
  assert.equal(levelForXp(0), 1);
});

test('un XP por debajo del umbral no sube de nivel', () => {
  assert.equal(levelForXp(149), 1);
  assert.equal(levelForXp(150), 2);
});

test('el XP calibrado de psantos26 cae en el nivel 13', () => {
  // 9.540 XP reales: entre xpForLevel(13)=8400 y xpForLevel(14)=9750.
  assert.equal(levelForXp(9540), 13);
});

test('levelForXp tope en MAX_LEVEL aunque el XP se desborde', () => {
  assert.equal(levelForXp(xpForLevel(MAX_LEVEL)), MAX_LEVEL);
  assert.equal(levelForXp(10_000_000), MAX_LEVEL);
});

test('levelForXp trata el XP negativo o inválido como nivel 1', () => {
  assert.equal(levelForXp(-100), 1);
  assert.equal(levelForXp(Number.NaN), 1);
  assert.equal(levelForXp(undefined), 1);
});

test('levelForXp es coherente con xpForLevel en cada frontera', () => {
  for (let n = 1; n <= MAX_LEVEL; n += 1) {
    assert.equal(levelForXp(xpForLevel(n)), n, `frontera del nivel ${n}`);
  }
});

// ─────────────────────────────────────────────
// tierForLevel: 8 rangos de 5 niveles.
// ─────────────────────────────────────────────
test('hay ocho rangos que cubren los 40 niveles sin huecos ni solapes', () => {
  assert.equal(TIERS.length, 8);
  assert.equal(TIERS[0].minLevel, 1);
  assert.equal(TIERS.at(-1).maxLevel, MAX_LEVEL);
  for (let i = 1; i < TIERS.length; i += 1) {
    assert.equal(TIERS[i].minLevel, TIERS[i - 1].maxLevel + 1);
  }
});

test('cada nivel cae en su rango', () => {
  assert.equal(tierForLevel(1).id, 'espectador');
  assert.equal(tierForLevel(5).id, 'espectador');
  assert.equal(tierForLevel(6).id, 'aficionado');
  assert.equal(tierForLevel(13).id, 'cinefilo');
  assert.equal(tierForLevel(20).id, 'critico');
  assert.equal(tierForLevel(40).id, 'leyenda');
});

test('tierForLevel recorta en vez de devolver nada', () => {
  assert.equal(tierForLevel(0).id, 'espectador');
  assert.equal(tierForLevel(999).id, 'leyenda');
});

// ─────────────────────────────────────────────
// progressForXp: lo que consume la barra de la cabecera.
// ─────────────────────────────────────────────
test('el progreso describe el tramo hacia el siguiente nivel', () => {
  const p = progressForXp(9540);
  assert.equal(p.level, 13);
  assert.equal(p.tier.id, 'cinefilo');
  assert.equal(p.xp, 9540);
  assert.equal(p.levelXp, 8400);      // umbral del nivel actual
  assert.equal(p.nextLevelXp, 9750);  // umbral del siguiente
  assert.equal(p.xpIntoLevel, 1140);  // 9540 − 8400
  assert.equal(p.xpForNextLevel, 1350); // 9750 − 8400
  assert.equal(p.xpToNextLevel, 210);   // 9750 − 9540
  assert.equal(p.percent, 84);          // round(1140/1350·100)
});

test('en el nivel máximo el progreso está completo y no pide más XP', () => {
  const p = progressForXp(xpForLevel(MAX_LEVEL) + 5000);
  assert.equal(p.level, MAX_LEVEL);
  assert.equal(p.nextLevelXp, null);
  assert.equal(p.xpToNextLevel, 0);
  assert.equal(p.percent, 100);
  assert.equal(p.isMax, true);
});

test('un usuario recién creado arranca en 0% del nivel 1', () => {
  const p = progressForXp(0);
  assert.equal(p.level, 1);
  assert.equal(p.percent, 0);
  assert.equal(p.xpToNextLevel, 150);
  assert.equal(p.isMax, false);
});

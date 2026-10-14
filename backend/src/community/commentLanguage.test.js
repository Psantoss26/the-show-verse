import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCommentLanguage } from './commentLanguage.js';

// Casos reales que un detector de trigramas solo clasificaba mal.
test('comentarios cortos en inglés se reconocen como inglés', () => {
  for (const text of [
    'great movie from great actors',
    'Ends as well as it begins.',
    'Awesome show!',
    "It's just simply a masterpiece",
    'My first American show. Thank you',
    'Definitely a good show. I loved watching it.',
    'If you didn\'t watch Breaking Bad. Consider me your enemy till you do.',
    'R I P robin williams :(',
    "I can’t get past 3 episodes. I’ve tried twice.",
  ]) {
    assert.equal(detectCommentLanguage(text), 'en', text);
  }
});

test('español, también frente al portugués o el italiano', () => {
  for (const text of [
    'No sólo son drogas, también es salud, amor y sociedad.',
    'La mejor serie de todos los tiempos.',
    'Una obra maestra, el final es increíble.',
  ]) {
    assert.equal(detectCommentLanguage(text), 'es', text);
  }
});

test('otros idiomas no pasan', () => {
  assert.equal(detectCommentLanguage('A melhor série de todos os tempos. Fim.'), 'pt');
  assert.equal(detectCommentLanguage('um dos poucos filmes que recomendo ver legendado, a dublagem não é ruim'), 'pt');
  assert.equal(detectCommentLanguage('Uno dei migliori film che ho visto'), 'it');
  assert.equal(detectCommentLanguage('Ein toller Film mit einer guten Story und tollen Schauspielern'), 'de');
  assert.equal(detectCommentLanguage('مسلسل أسطوري وواحد من أعظم ما أنتجت السينما'), 'other');
  assert.equal(detectCommentLanguage('Отличный сериал, смотрел на одном дыхании'), 'other');
});

test('sin texto suficiente: und', () => {
  assert.equal(detectCommentLanguage('11/10'), 'und');
  assert.equal(detectCommentLanguage('★ ★ ★ ★ ★'), 'und');
});

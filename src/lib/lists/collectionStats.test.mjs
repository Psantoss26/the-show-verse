import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCollectionCast, formatCollectionRevenue, sumCollectionRevenue } from './collectionStats.js';

test('la recaudación suma solo las películas con dato', () => {
  assert.equal(sumCollectionRevenue([{ revenue: 775398007 }, { revenue: 0 }, {}, { revenue: '538375067' }]), 1313773074);
  assert.equal(sumCollectionRevenue(null), 0);
});

test('la recaudación se formatea en millones y en miles de millones', () => {
  assert.equal(formatCollectionRevenue(10329800000), '10,3 mil M$');
  assert.equal(formatCollectionRevenue(2450000000), '2,5 mil M$');
  assert.equal(formatCollectionRevenue(775398007), '775 M$');
  assert.equal(formatCollectionRevenue(4500000), '4,5 M$');
  assert.equal(formatCollectionRevenue(0), null);
});

test('el reparto destacado prioriza a quien sale en más películas', () => {
  const cast = buildCollectionCast([
    { id: 1, title: 'A', release_date: '1977-05-25', cast: [
      { id: 10, name: 'Mark', character: 'Luke', order: 0 },
      { id: 20, name: 'Alec', character: 'Obi-Wan', order: 3 },
      { id: 30, name: 'Carrie', character: 'Leia', order: 2 },
    ] },
    { id: 2, title: 'B', release_date: '1980-05-20', cast: [
      { id: 30, name: 'Carrie', character: 'Leia', order: 1 },
      { id: 10, name: 'Mark', character: 'Luke Skywalker', order: 0 },
      { id: 10, name: 'Mark', character: 'Duplicado', order: 9 },
    ] },
  ]);
  assert.deepEqual(cast.map((member) => member.id), [10, 30, 20]);
  assert.equal(cast[0].appearances.length, 2);
  assert.equal(cast[0].character, 'Luke');
  assert.deepEqual(cast[1].appearances.map((item) => item.year), ['1977', '1980']);
});

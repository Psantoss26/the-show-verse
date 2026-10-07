import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCollectionCustomization,
  buildCollectionArtworkChanges,
  buildCollectionCustomization,
  collectionArtworkKey,
  collectionCustomizationKey,
  readCollectionArtworkOverride,
} from './collectionCustomization.js';
const original = { id: 119, name: 'Colección', description: 'Original', poster_path: '/original.jpg', backdrop_path: '/fondo.jpg' };
test('official artwork remains the default, including after reset', () => {
  assert.deepEqual(applyCollectionCustomization(original, null, {}), original);
  assert.equal(buildCollectionCustomization(original, original), null);
  assert.deepEqual(buildCollectionArtworkChanges(original, original, original), []);
});
test('customization changes only selected fields and preserves the source', () => {
  const patch = buildCollectionCustomization(original, { ...original, name: ' Mi colección ', description: '' });
  assert.deepEqual(patch, { name: 'Mi colección', description: '' });
  const applied = applyCollectionCustomization(original, patch, { poster: '/nuevo.jpg' });
  assert.equal(applied.poster_path, '/nuevo.jpg');
  assert.equal(applied.backdrop_path, '/fondo.jpg');
  assert.equal(original.poster_path, '/original.jpg');
  assert.equal(collectionCustomizationKey(119), 'collectionCustomization:119');
  assert.notEqual(collectionCustomizationKey(120), collectionCustomizationKey(119));
});
test('artwork uses the per-user overrides shared with DetailsClient', () => {
  const preferences = { uiSettings: { artworkOverrides: { [collectionArtworkKey(119)]: { backdrop: '/elegido.jpg' }, 'movie:119': { poster: '/peli.jpg' } } } };
  assert.equal(collectionArtworkKey('119'), 'collection:119');
  assert.deepEqual(readCollectionArtworkOverride(preferences, 119), { backdrop: '/elegido.jpg' });
  assert.deepEqual(readCollectionArtworkOverride(null, 119), {});
});
test('artwork changes only send what changed and the original image resets the override', () => {
  const current = { ...original, poster_path: '/elegido.jpg' };
  assert.deepEqual(
    buildCollectionArtworkChanges(original, current, { ...current, backdrop_path: '/otro-fondo.jpg' }),
    [{ kind: 'backdrop', filePath: '/otro-fondo.jpg' }],
  );
  assert.deepEqual(
    buildCollectionArtworkChanges(original, current, { ...current, poster_path: '/original.jpg' }),
    [{ kind: 'poster', filePath: null }],
  );
});
test('invalid names and arbitrary image URLs cannot be persisted or rendered', () => {
  assert.throws(() => buildCollectionCustomization(original, { ...original, name: ' ' }));
  assert.throws(() => buildCollectionArtworkChanges(original, original, { ...original, poster_path: 'https://other.test/test.jpg' }));
  assert.equal(applyCollectionCustomization(original, null, { poster: '//other.test/test.jpg' }).poster_path, original.poster_path);
});
test('mobile background is a separate poster selection', () => {
  const withAuto = { ...original, mobile_background_path: '/auto.jpg' };
  assert.equal(applyCollectionCustomization(original, null, { mobilePoster: '/movil.jpg' }).mobile_background_path, '/movil.jpg');
  assert.deepEqual(
    buildCollectionArtworkChanges(withAuto, withAuto, { ...withAuto, mobile_background_path: '/movil.jpg' }),
    [{ kind: 'mobilePoster', filePath: '/movil.jpg' }],
  );
  assert.deepEqual(
    buildCollectionArtworkChanges(withAuto, { ...withAuto, mobile_background_path: '/movil.jpg' }, withAuto),
    [{ kind: 'mobilePoster', filePath: null }],
  );
});

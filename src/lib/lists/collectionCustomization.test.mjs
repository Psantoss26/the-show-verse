import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCollectionCustomization,
  buildCollectionArtworkChanges,
  collectionArtworkVotes,
  collectionCommunityArtwork,
  collectionOwnArtwork,
  collectionArtworkKey,
  readCollectionArtworkOverride,
} from './collectionCustomization.js';

const original = { id: 119, name: 'Colección', description: 'Original', poster_path: '/original.jpg', backdrop_path: '/fondo.jpg' };

test('official artwork remains the default, including after reset', () => {
  assert.deepEqual(applyCollectionCustomization(original, {}), original);
  assert.deepEqual(applyCollectionCustomization(original, null), original);
  assert.deepEqual(buildCollectionArtworkChanges({}, {}), []);
});

test('only images are customizable: name and description stay as in TMDb', () => {
  const applied = applyCollectionCustomization(original, { poster: '/nuevo.jpg', name: 'Otro nombre', description: 'Otra' });
  assert.equal(applied.poster_path, '/nuevo.jpg');
  assert.equal(applied.backdrop_path, '/fondo.jpg');
  assert.equal(applied.name, 'Colección');
  assert.equal(applied.description, 'Original');
  assert.equal(original.poster_path, '/original.jpg');
});

test('artwork uses the per-user overrides shared with DetailsClient', () => {
  const preferences = { uiSettings: { artworkOverrides: { [collectionArtworkKey(119)]: { backdrop: '/elegido.jpg' }, 'movie:119': { poster: '/peli.jpg' } } } };
  assert.equal(collectionArtworkKey('119'), 'collection:119');
  assert.deepEqual(readCollectionArtworkOverride(preferences, 119), { backdrop: '/elegido.jpg' });
  assert.deepEqual(readCollectionArtworkOverride(null, 119), {});
});

test('artwork changes only send what changed; every choice is stored and reset clears it', () => {
  const own = { poster_path: '/elegido.jpg' };
  assert.deepEqual(
    buildCollectionArtworkChanges(own, { ...own, backdrop_path: '/otro-fondo.jpg' }),
    [{ kind: 'backdrop', filePath: '/otro-fondo.jpg' }],
  );
  // Elegir la automática también es un voto.
  assert.deepEqual(
    buildCollectionArtworkChanges(own, { poster_path: '/original.jpg' }),
    [{ kind: 'poster', filePath: '/original.jpg' }],
  );
  assert.deepEqual(buildCollectionArtworkChanges(own, { poster_path: null }), [{ kind: 'poster', filePath: null }]);
});

test('own and community artwork map kinds to collection fields', () => {
  assert.deepEqual(collectionOwnArtwork({ poster: '/p.jpg', background: '/c.jpg', mobilePoster: 'https://x.test/y.jpg' }), {
    poster_path: '/p.jpg',
    backdrop_path: null,
    mobile_background_path: null,
    cover_backdrop_path: '/c.jpg',
  });
  assert.deepEqual(collectionCommunityArtwork(null).poster_path, null);
});

test('arbitrary image URLs cannot be persisted or rendered', () => {
  assert.throws(() => buildCollectionArtworkChanges({}, { poster_path: 'https://other.test/test.jpg' }));
  assert.equal(applyCollectionCustomization(original, { poster: '//other.test/test.jpg' }).poster_path, original.poster_path);
});

test('mobile background is a separate poster selection', () => {
  const withAuto = { ...original, mobile_background_path: '/auto.jpg' };
  assert.equal(applyCollectionCustomization(original, { mobilePoster: '/movil.jpg' }).mobile_background_path, '/movil.jpg');
  assert.deepEqual(
    buildCollectionArtworkChanges({}, { mobile_background_path: '/movil.jpg' }),
    [{ kind: 'mobilePoster', filePath: '/movil.jpg' }],
  );
  assert.equal(withAuto.mobile_background_path, '/auto.jpg');
});

test('the cover backdrop is its own selection, stored as `background`', () => {
  const withAuto = { ...original, cover_backdrop_path: '/auto-en.jpg' };
  assert.equal(applyCollectionCustomization(withAuto, { background: '/portada-es.jpg' }).cover_backdrop_path, '/portada-es.jpg');
  assert.deepEqual(
    buildCollectionArtworkChanges({}, { cover_backdrop_path: '/portada-es.jpg' }),
    [{ kind: 'background', filePath: '/portada-es.jpg' }],
  );
  // Restaurar borra la elección.
  assert.deepEqual(
    buildCollectionArtworkChanges({ cover_backdrop_path: '/portada-es.jpg' }, { cover_backdrop_path: null }),
    [{ kind: 'background', filePath: null }],
  );
});

test('own artwork as votes per kind, to retract them from the community copy', () => {
  assert.deepEqual(
    collectionArtworkVotes({ poster_path: '/p.jpg', backdrop_path: null, cover_backdrop_path: '/c.jpg' }),
    { poster: '/p.jpg', background: '/c.jpg' },
  );
  assert.deepEqual(collectionArtworkVotes(null), {});
});

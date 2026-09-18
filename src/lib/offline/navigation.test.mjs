import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('./navigation.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/m, '').replace('export async function', 'async function');
function setup(workerMessage) {
  const visits = [];
  const location = { href: 'https://app.test/profile', origin: 'https://app.test', pathname: '/profile', search: '',
    assign: (url) => visits.push(['push', url]), replace: (url) => visits.push(['replace', url]) };
  const context = vm.createContext({ URL, location, window: { location }, workerMessage });
  vm.runInContext(source, context);
  return { visits, go: context.openSavedRoute };
}
test('an unavailable route leaves the document and address untouched', async () => {
  const app = setup(async () => ({ available: false }));
  assert.equal(await app.go('/details/movie/99'), false);
  assert.deepEqual(app.visits, []);
});
test('saved details use a full document, including replace navigations', async () => {
  const app = setup(async () => ({ available: true }));
  assert.equal(await app.go('/details/movie/42', { replace: true }), true);
  assert.deepEqual(app.visits, [['replace', 'https://app.test/details/movie/42']]);
});
test('late cache checks cannot override the most recent navigation intent', async () => {
  const resolves = [];
  const app = setup(() => new Promise((resolve) => resolves.push(resolve)));
  const first = app.go('/details/movie/1');
  const second = app.go('/details/movie/2');
  resolves[1]({ available: true }); await second;
  resolves[0]({ available: true }); await first;
  assert.deepEqual(app.visits, [['push', 'https://app.test/details/movie/2']]);
});

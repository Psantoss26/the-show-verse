import assert from 'node:assert/strict';
import test from 'node:test';
import { statSync } from 'node:fs';
import { detailOpenPreview } from './detailOpenPreview.js';

test('every effective configuration has a recording and a still preview', () => {
  const selected = new Set();
  for (const scope of ['dashboard', 'userPages']) {
  const prefix = scope === 'userPages' ? 'user-pages/' : '';
  for (const target of ['page', 'panel']) {
    for (const placement of ['center', 'right']) {
      for (const drawerView of ['overlay', 'docked']) {
        for (const contentView of ['modal', 'mobile']) {
          const variant = detailOpenPreview({ target, placement, drawerView, contentView }, scope);
          selected.add(variant);
          if (target === 'page') assert.equal(variant, `${prefix}page`);
          else if (placement === 'center') assert.equal(variant, `${prefix}center`);
          else assert.equal(variant, `${prefix}${drawerView}-${contentView}`);
          for (const extension of ['webm', 'jpg']) {
            assert.ok(statSync(new URL(`../../../public/previews/detail-open/${variant}.${extension}`, import.meta.url)).size > 1000);
          }
        }
      }
    }
  }
  }
  assert.equal(selected.size, 12);
});

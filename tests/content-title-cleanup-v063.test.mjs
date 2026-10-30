import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { getIndeedCardTitle } from '../src/content/indeed-adapter.js';

const contentScript = fs.readFileSync(new URL('../src/content/index.js', import.meta.url), 'utf8');

test('content title extraction removes extension-owned badge nodes before re-reading a title', () => {
  assert.match(contentScript, /const INJECTED_TITLE_BADGE_SELECTOR/);
  assert.match(contentScript, /const title = extractFirstTitle\(TITLE_SELECTORS/);
  assert.match(contentScript, /readTitleTextWithoutInjectedBadges\(titleElement\)/);
});

test('Indeed card title extraction ignores an injected badge text node', () => {
  let cloneText = 'Warehouse assistantKMJD: Dutch';
  const badge = {
    remove() {
      cloneText = 'Warehouse assistant';
    },
  };
  const titleElement = {
    cloneNode() {
      return {
        querySelectorAll() {
          return [badge];
        },
        get innerText() {
          return cloneText;
        },
      };
    },
  };
  const card = {
    querySelector() {
      return titleElement;
    },
  };

  assert.equal(getIndeedCardTitle(card), 'Warehouse assistant');
});

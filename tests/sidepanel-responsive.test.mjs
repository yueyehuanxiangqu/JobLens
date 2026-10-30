import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/sidepanel/index.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../src/sidepanel/index.html', import.meta.url), 'utf8');

test('all four panel pages can grow beyond the old 420px container', () => {
  const appRule = css.match(/#app\s*\{([^}]+)\}/)?.[1] || '';
  assert.match(appRule, /width:\s*100%/);
  assert.doesNotMatch(appRule, /max-width:\s*\d+px/);
  for (const id of ['tab-jobs', 'tab-library', 'tab-cvs', 'tab-settings']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('wide-only insight and library columns leave the default layout single-column', () => {
  assert.match(css, /\.analysis-section \.insights-content\s*\{\s*display:\s*grid/);
  assert.match(css, /@media \(min-width:\s*700px\)\s*\{[^}]*\}[^}]*\.analysis-section \.insights-content\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.library-controls\s*\{\s*display:\s*grid/);
  assert.match(css, /\.library-controls\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});

test('long source text and narrow controls stay inside their cards', () => {
  assert.match(css, /\.jd-extracted-text\s*\{[^}]*white-space:\s*pre-wrap;[^}]*overflow-wrap:\s*anywhere/);
  assert.match(css, /\.resume-profile-name\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere/);
  assert.match(css, /\.job-row-top > div:first-child\s*\{\s*flex:\s*1 1 220px/);
  assert.match(css, /\.header-nav \.nav-btn, \.jobs-view-btn, \.segmented-btn\s*\{[^}]*white-space:\s*normal/);
  assert.match(css, /\.metadata-content pre\s*\{\s*overflow-x:\s*auto/);
});

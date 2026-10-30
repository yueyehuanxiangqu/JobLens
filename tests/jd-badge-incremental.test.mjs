import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { badgeColorsForAccent } from '../src/shared/badge-theme.js';

const content = fs.readFileSync(new URL('../src/content/index.js', import.meta.url), 'utf8');

test('unchanged title badges retain their DOM nodes and updating one badge keeps its siblings', () => {
  const nodes = [];
  let creations = 0;
  let removals = 0;
  const target = {
    querySelectorAll: () => nodes.filter(node => node.isConnected),
    appendChild(node) { node.isConnected = true; nodes.push(node); },
  };
  const context = vm.createContext({
    document: { createElement() {
      creations += 1;
      return { dataset: {}, style: {}, textContent: '', title: '', isConnected: false,
        remove() { this.isConnected = false; removals += 1; } };
    } },
    normalizeHexColor: value => value,
    badgeColorsForAccent,
    TITLE_SIGNAL_KEYS: { CAREER_LEVEL: 'careerLevel' },
    getContrastTextColor: () => '#ffffff',
  });
  const helper = content.slice(content.indexOf('function reconcileMetaBadges('),
    content.indexOf('function injectDetailBadge('));
  vm.runInContext(`${helper}\nthis.reconcileMetaBadges = reconcileMetaBadges;`, context);
  const models = [
    { signalKey: 'careerLevel', label: 'Junior', backgroundColor: '#16a34a' },
    { signalKey: 'jdLanguage', label: 'English', backgroundColor: '#2563eb' },
  ];
  const render = values => context.reconcileMetaBadges(target, 'A', values, '.ai-meta-badge', 'ai-meta-badge');
  render(models);
  assert.equal(creations, 2);
  const [career, language] = nodes;
  render(models);
  assert.equal(creations, 2);
  assert.equal(removals, 0);
  render([{ ...models[0], label: 'Early Career' }, models[1]]);
  assert.equal(career.textContent, 'Early Career');
  assert.equal(nodes[1], language);
  assert.equal(creations, 2);
  assert.equal(removals, 0);
  render([models[1]]);
  assert.equal(career.isConnected, false);
  assert.equal(language.isConnected, true);
  assert.equal(removals, 1);
});

test('stale score responses are sequence-guarded and current JD identity is checked', () => {
  const refresh = content.slice(content.indexOf('async function refreshVisibleScores('),
    content.indexOf('function scheduleCurrentJobSync('));
  assert.match(refresh, /requestId !== scoreRefreshSequence/);
  assert.match(refresh, /getCurrentJobId\(\) !== currentJobId/);
  assert.match(refresh, /lastConfirmedJDData !== currentJDData/);
  assert.match(refresh, /GET_CACHED_SCORES/);
});

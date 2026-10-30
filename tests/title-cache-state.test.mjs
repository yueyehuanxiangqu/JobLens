import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const content = readFileSync(new URL('../src/content/index.js', import.meta.url), 'utf8');
const source = content.slice(content.indexOf('async function refreshVisibleScores('), content.indexOf('function scheduleCurrentJobSync('));

function harness() {
  let currentJobId = 'A';
  let response = { ok: true, resumeAvailable: true, resumeHash: 'cv-a', displaySettings: {}, entries: [{
    jobId: 'A', score: 81, jdVerified: false, jdText: 'Verified JD A', jdExtractionVersion: 'v1',
  }] };
  const requests = [];
  const badge = { dataset: { jobId: 'A' }, removed: false, title: '', remove() { this.removed = true; } };
  const context = vm.createContext({
    scoreRefreshSequence: 0, syncGeneration: 0, lastConfirmedJDData: null, scoreResumeHash: 'cv-a',
    verifiedScoreEntries: new Map([['A', { jobId: 'A', jdText: 'Verified JD A', jdExtractionVersion: 'v1' }]]),
    injectedVerifiedJobIds: new Map(), getJobsList: () => [{ jobId: 'A' }],
    getCurrentJobId: () => currentJobId,
    chrome: { runtime: { sendMessage: async message => { requests.push(message.payload); return response; } } },
    Actions: { GET_CACHED_SCORES: 'cache' },
    document: { querySelectorAll: () => badge.removed ? [] : [badge] },
    normalizeTitleDisplaySettings: () => ({ keywordList: [] }),
    buildTitleBadgeModels: () => [], injectScoreBadge() {}, injectMetaBadges() {},
    injectDetailBadge() {}, injectDetailMetaBadges() {}, clearInjectedScores() {},
    findKeywordMatches: () => [], t: value => value,
  });
  vm.runInContext(`${source}; this.refresh = refreshVisibleScores;`, context);
  return { context, badge, requests, setResponse: value => { response = value; },
    setJobId: value => { currentJobId = value; } };
}

test('transient JD verification retains a previously verified badge, but confirmed cache absence removes it', async () => {
  const state = harness();
  await state.context.refresh();
  assert.deepEqual(Array.from(state.requests[0].jobIds), ['A']);
  assert.equal(state.requests[0].currentJDData, null);
  assert.equal(state.badge.removed, false);
  assert.match(state.badge.title, /Verifying/);
  state.setResponse({ ok: false });
  await state.context.refresh();
  assert.equal(state.badge.removed, false);
  state.setResponse({ ok: true, resumeAvailable: true, resumeHash: 'cv-a', displaySettings: {},
    entries: [], invalidJobIds: ['A'] });
  await state.context.refresh();
  assert.equal(state.badge.removed, true);
  assert.equal(state.context.verifiedScoreEntries.has('A'), false);
});

test('a new CV cannot inherit a prior CV verified title badge', async () => {
  const state = harness();
  state.setResponse({ ok: true, resumeAvailable: true, resumeHash: 'cv-b', displaySettings: {}, entries: [{
    jobId: 'A', score: 81, jdVerified: false, jdText: 'Verified JD A', jdExtractionVersion: 'v1',
  }] });
  await state.context.refresh();
  assert.equal(state.badge.removed, true);
  assert.equal(state.context.verifiedScoreEntries.has('A'), false);
});

test('a late A response after A to B to A cannot overwrite the current verification generation', async () => {
  const state = harness();
  let resolve;
  state.context.chrome.runtime.sendMessage = () => new Promise(done => { resolve = done; });
  const pending = state.context.refresh();
  state.setJobId('B');
  state.context.syncGeneration += 1;
  state.setJobId('A');
  state.context.syncGeneration += 1;
  resolve({ ok: true, resumeAvailable: true, resumeHash: 'cv-a', displaySettings: {}, entries: [] });
  await pending;
  assert.equal(state.badge.removed, false);
  assert.equal(state.context.verifiedScoreEntries.has('A'), true);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { extractAiJobData, getAiDetailTitleLink } from '../src/content/linkedin-ai-adapter.js';

const jobText = 'Build reliable data pipelines with Python, deploy them with the engineering team, and maintain production data quality for clients.';

function semanticDocument(currentJobId, detailJobId = null) {
  const jd = { innerText: jobText, textContent: jobText, closest: () => null,
    querySelectorAll: () => [] };
  const pane = { querySelectorAll(selector) { return selector === '#job-details' ? [jd] : []; },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; } };
  const links = detailJobId ? [{ textContent: `Data Engineer ${detailJobId}`,
    getAttribute: () => `/jobs/view/${detailJobId}/`, closest: () => null,
    querySelectorAll: () => [],
    parentElement: { querySelectorAll: () => [], parentElement: null } }] : [];
  const documentNode = { location: { href: `https://www.linkedin.com/jobs/search/?currentJobId=${currentJobId}&origin=SEMANTIC_SEARCH_LANDING_PAGE` },
    querySelectorAll(selector) { return selector === 'main a[href*="/jobs/view/"]' ? links : []; },
    querySelector(selector) { return selector === '.jobs-search__job-details--container' ? pane : null; } };
  return { documentNode, links };
}

test('Semantic Search never substitutes another job title link or JD for currentJobId', () => {
  const { documentNode, links } = semanticDocument('4471730053', '4471730000');
  assert.equal(getAiDetailTitleLink(documentNode), null);
  const pending = extractAiJobData(documentNode, documentNode.location.href);
  assert.equal(pending.jobId, '4471730053');
  assert.equal(pending.description, '');
  assert.equal(pending.extractionStatus, 'identity-mismatch');
  assert.equal(pending.extractionIdentityStatus, 'mismatch');
  assert.match(pending.extractionWarnings[0], /another Job ID/);
  assert.notEqual(pending.title, links[0].textContent);
});

test('Semantic Search waits for a missing detail identity, then accepts only the matching job', () => {
  const missing = semanticDocument('4471730053');
  const pending = extractAiJobData(missing.documentNode, missing.documentNode.location.href);
  assert.equal(pending.extractionStatus, 'loading');
  assert.equal(pending.description, '');
  assert.equal(pending.extractionIdentityStatus, 'not-rendered');
  const ready = semanticDocument('4471730053', '4471730053');
  assert.equal(getAiDetailTitleLink(ready.documentNode), ready.links[0]);
  const result = extractAiJobData(ready.documentNode, ready.documentNode.location.href);
  assert.equal(result.jobId, '4471730053');
  assert.equal(result.extractionStatus, 'ready');
  assert.equal(result.description, jobText);
  assert.equal(result.extractionIdentityStatus, 'matched');
  ready.documentNode.location.href = 'https://www.linkedin.com/jobs/search/?currentJobId=4471730000&origin=SEMANTIC_SEARCH_LANDING_PAGE';
  assert.equal(getAiDetailTitleLink(ready.documentNode), null);
});

test('focusing the already selected job does not restart its detail render', () => {
  const source = readFileSync(new URL('../src/content/index.js', import.meta.url), 'utf8');
  const focusSource = source.slice(source.indexOf('function focusJob('), source.indexOf('function activateClickable('));
  let scrolls = 0;
  let activations = 0;
  let timers = 0;
  const card = { scrollIntoView: () => { scrolls += 1; } };
  const context = vm.createContext({
    document: {},
    getPageMode: () => 'ai',
    getListCards: () => [card],
    getJobIdFromCard: () => '4471730053',
    getCurrentJobId: () => '4471730053',
    getAiJobIdFromDetail: () => '4471730053',
    activateClickable: () => { activations += 1; return true; },
    window: { setTimeout: () => { timers += 1; } },
  });
  vm.runInContext(`${focusSource}\nthis.focusJob = focusJob;`, context);
  assert.equal(context.focusJob('4471730053'), true);
  assert.equal(scrolls, 1);
  assert.equal(activations, 0);
  assert.equal(timers, 0);
  context.getAiJobIdFromDetail = () => '4471730000';
  assert.equal(context.focusJob('4471730053'), true);
  assert.equal(activations, 1, 'switch dispatch happens before focusJob acknowledges it');
  assert.equal(timers, 0, 'no delayed activation can run after a later selection');
});

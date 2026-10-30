import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const content = fs.readFileSync(new URL('../src/content/index.js', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../src/background/service-worker.js', import.meta.url), 'utf8');

function contentHarness() {
  let jobId = 'A';
  let extracted = { jobId: 'A', title: 'Role A', company: 'Employer A',
    description: 'Build reliable software for customer systems.', extractionStatus: 'ready',
    extractionConfidence: 'high', extractionVersion: 'linkedin-jd-v3' };
  const messages = [];
  const timers = new Map();
  const observers = [];
  let nextTimer = 0;
  let reads = 0;
  const detailRoot = { nodeType: 1, matches: () => false, closest: () => null, contains: () => false };
  const context = vm.createContext({
    window: {
      location: { href: 'https://linkedin.test/jobs/?currentJobId=A' },
      setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
      clearTimeout(id) { timers.delete(id); },
      setInterval() {}, addEventListener() {},
    },
    document: {
      querySelector(selector) { return selector.startsWith('.jobs-search__job-details--container') ? detailRoot : null; },
      querySelectorAll() { return []; }, body: detailRoot,
    },
    chrome: { runtime: { sendMessage: async message => { messages.push(message); },
      onMessage: { addListener(callback) { context.messageListener = callback; } } } },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe() {} disconnect() {}
    },
    getCurrentJobId: () => jobId,
    extractJobData: () => { reads += 1; return { ...extracted, timestamp: new Date().toISOString() }; },
    getListCards: () => [],
    LIST_ITEM_SELECTOR: '.job-card-container',
    Actions: { GET_JD_DATA: 'GET_JD_DATA', JD_EXTRACTED: 'JD_EXTRACTED', JD_EXTRACT_FAILED: 'JD_EXTRACT_FAILED' },
    debouncedSyncCurrentJob: () => context.syncCurrentJob(context.getCurrentJobId()),
    debouncedRefreshScores: () => {},
  });
  const declarations = content.slice(content.indexOf('let lastExtractJobId ='), content.indexOf('function normalizeHexColor('));
  const functions = content.slice(content.indexOf('function scheduleCurrentJobSync('), content.indexOf('function setupMessageListener('));
  vm.runInContext(`${declarations}\n${functions}\nthis.syncCurrentJob = syncCurrentJob;
    this.setObservedJob = setObservedJob; this.setupObservers = setupObservers;
    this.state = () => ({ activeSyncJobId, syncGeneration, retryTimer, lastConfirmedJDData });`, context);
  return {
    context, messages, timers, observers, detailRoot,
    setJob(next, data) { jobId = next; extracted = { ...data, jobId: next }; context.window.location.href = `https://linkedin.test/jobs/?currentJobId=${next}`; },
    setExtracted(data) { extracted = { ...extracted, ...data }; },
    get reads() { return reads; },
    fireDetail(node) { observers[0].callback([{ type: 'childList', target: detailRoot, addedNodes: [node], removedNodes: [] }]); },
    runTimer() { const [id, callback] = timers.entries().next().value || []; if (id) { timers.delete(id); callback(); } },
  };
}

const ordinaryNode = { nodeType: 1, matches: () => false, closest: () => null };
const ownBadge = { nodeType: 1, matches: selector => selector.includes('.ai-meta-badge'), closest: () => null };
const jdNode = { nodeType: 1, matches: selector => selector.includes('#job-details'), closest: () => null };

test('same-job DOM changes do not resend a JD; extension badges do not start extraction', () => {
  const app = contentHarness();
  app.context.setupObservers();
  assert.equal(app.messages.filter(message => message.type === 'JD_EXTRACTED').length, 1);
  const initialReads = app.reads;
  app.fireDetail(ownBadge);
  assert.equal(app.reads, initialReads);
  app.observers[0].callback([{ type: 'attributes', attributeName: 'class', target: app.detailRoot }]);
  assert.equal(app.reads, initialReads);
  app.fireDetail(ordinaryNode);
  assert.equal(app.reads, initialReads);
  assert.equal(app.messages.filter(message => message.type === 'JD_EXTRACTED').length, 1);
  const confirmed = app.context.state().lastConfirmedJDData;
  app.fireDetail(jdNode);
  assert.equal(app.messages.filter(message => message.type === 'JD_EXTRACTED').length, 1);
  assert.equal(app.context.state().lastConfirmedJDData, confirmed);
  app.setExtracted({ description: 'Build reliable software for customer systems. Deploy the service to production.' });
  app.fireDetail(jdNode);
  assert.equal(app.messages.filter(message => message.type === 'JD_EXTRACTED').length, 2);
  app.setExtracted({ description: 'Build reliable software. Deploy to production. Require Dutch fluency.' });
  app.observers[0].callback([{ type: 'attributes', attributeName: 'class',
    target: { nodeType: 1, textContent: 'See more', matches: () => false, closest: () => null } }]);
  assert.equal(app.messages.filter(message => message.type === 'JD_EXTRACTED').length, 3);
  app.setExtracted({ title: 'Updated Role A' });
  app.fireDetail(jdNode);
  assert.equal(app.messages.filter(message => message.type === 'JD_EXTRACTED').length, 4);
  assert.equal(app.context.state().lastConfirmedJDData.jobId, 'A');
  assert.match(content.slice(content.indexOf('async function refreshVisibleScores('), content.indexOf('function scheduleCurrentJobSync(')),
    /lastConfirmedJDData\?\.jobId === currentJobId/);
  assert.doesNotMatch(content.slice(content.indexOf('async function refreshVisibleScores('), content.indexOf('function scheduleCurrentJobSync(')),
    /extractJobData\(|extractJDText\(/);
});

test('one retry chain survives repeated mutations and old A/B tasks cannot affect returned A', () => {
  const app = contentHarness();
  app.context.setupObservers();
  const oldA = app.context.state().syncGeneration;
  app.setJob('B', { title: 'Role B', company: 'Employer B', description: '', extractionStatus: 'loading',
    extractionConfidence: 'failed', extractionWarnings: ['Details are loading.'], extractionVersion: 'linkedin-jd-v3' });
  app.context.setObservedJob('B');
  const generationB = app.context.state().syncGeneration;
  app.context.syncCurrentJob('B', generationB);
  assert.equal(app.timers.size, 1);
  app.fireDetail(jdNode);
  assert.equal(app.timers.size, 1);
  const staleBTimer = app.timers.values().next().value;
  app.setJob('A', { title: 'Role A', company: 'Employer A', description: 'Updated A job duties.',
    extractionStatus: 'ready', extractionConfidence: 'high', extractionVersion: 'linkedin-jd-v3' });
  app.context.setObservedJob('A');
  app.context.syncCurrentJob('A', app.context.state().syncGeneration);
  staleBTimer();
  app.context.syncCurrentJob('A', oldA, 0);
  assert.equal(app.timers.size, 0);
  assert.equal(app.messages.filter(message => message.type === 'JD_EXTRACT_FAILED').length, 0);
  assert.equal(app.messages.at(-1).payload.jobId, 'A');
  assert.equal(app.messages.at(-1).payload.description, 'Updated A job duties.');
});

test('a confirmed failed extraction is sent once and a later same-job success clears its retry state', () => {
  const app = contentHarness();
  app.context.setupObservers();
  app.setExtracted({ description: '', extractionStatus: 'loading', extractionConfidence: 'failed',
    extractionWarnings: ['The job description region has not loaded.'] });
  app.fireDetail(jdNode);
  for (let index = 0; index < 10; index += 1) app.runTimer();
  assert.equal(app.messages.filter(message => message.type === 'JD_EXTRACT_FAILED').length, 1);
  app.fireDetail(jdNode);
  for (let index = 0; index < 10; index += 1) app.runTimer();
  assert.equal(app.messages.filter(message => message.type === 'JD_EXTRACT_FAILED').length, 1);
  app.setExtracted({ description: 'Build a complete new JD after the page finishes loading.',
    extractionStatus: 'ready', extractionConfidence: 'high' });
  app.fireDetail(jdNode);
  assert.equal(app.messages.at(-1).type, 'JD_EXTRACTED');
  assert.equal(app.context.state().lastConfirmedJDData.description,
    'Build a complete new JD after the page finishes loading.');
});

test('Semantic Search identity mismatch stays in the bounded retry chain until the matching JD arrives', () => {
  const app = contentHarness();
  app.setJob('B', { title: '', company: '', description: '', extractionStatus: 'identity-mismatch',
    extractionConfidence: 'failed', extractionWarnings: ['The detail title link belongs to another Job ID.'],
    extractionIdentityStatus: 'mismatch', extractionVersion: 'linkedin-jd-v3' });
  app.context.setObservedJob('B');
  app.context.syncCurrentJob('B', app.context.state().syncGeneration);
  assert.equal(app.timers.size, 1);
  assert.equal(app.messages.filter(message => message.type === 'JD_EXTRACTED').length, 0);
  app.setExtracted({ title: 'Role B', company: 'Employer B',
    description: 'Build verified B pipelines for client systems.', extractionStatus: 'ready',
    extractionConfidence: 'high', extractionIdentityStatus: 'matched' });
  app.runTimer();
  assert.equal(app.timers.size, 0);
  assert.equal(app.messages.filter(message => message.type === 'JD_EXTRACTED').length, 1);
  assert.equal(app.messages.at(-1).payload.jobId, 'B');
  assert.equal(app.messages.at(-1).payload.extractionIdentityStatus, 'matched');
});

function workerHarness() {
  const messages = [];
  let responsePayload = null;
  let reads = 0;
  let activeUrl = null;
  const context = vm.createContext({
    currentJDData: null,
    URL,
    Actions: { JD_DATA: 'JD_DATA' },
    broadcast: message => messages.push(message),
    getActiveTab: async () => ({ id: 7, url: activeUrl }),
    sendTabMessageWithInjection: async () => { reads += 1; return { payload: responsePayload }; },
    maybeBroadcastCachedResult: async () => {},
    console,
  });
  const helpers = worker.slice(worker.indexOf('const RETAINED_JD_WARNING ='), worker.indexOf('chrome.sidePanel.setPanelBehavior('));
  const fetcher = worker.slice(worker.indexOf('async function fetchCurrentJDData('), worker.indexOf('async function tryInjectScore('));
  const handlers = worker.slice(worker.indexOf('async function handleJDExtracted('), worker.indexOf('async function handleResumeUploaded('));
  vm.runInContext(`${helpers}\n${fetcher}\n${handlers}\nthis.handleJDExtracted = handleJDExtracted;
    this.handleJDExtractFailed = handleJDExtractFailed; this.fetchCurrentJDData = fetchCurrentJDData;
    this.getCurrentJD = () => currentJDData;`, context);
  return { context, messages, get reads() { return reads; },
    setActiveUrl(value) { activeUrl = value; }, setResponse(payload) { responsePayload = payload; } };
}

function jd(jobId, generation, sequence, description = `The work for ${jobId}`) {
  return { jobId, title: `Role ${jobId}`, company: `Employer ${jobId}`, description,
    extractionStatus: 'ready', extractionConfidence: 'high', extractionWarnings: [],
    extractionVersion: 'linkedin-jd-v3', syncGeneration: generation, syncSequence: sequence,
    timestamp: new Date().toISOString() };
}

test('one transient read retains verified JD, repeated confirmed failures deduplicate warnings and broadcasts', async () => {
  const app = workerHarness();
  const sender = { tab: { id: 7 } };
  await app.context.handleJDExtracted(jd('A', 1, 1), sender);
  app.setResponse({ ...jd('A', 1, 2, ''), extractionStatus: 'loading',
    extractionWarnings: ['The job description region has not loaded.'] });
  const rechecking = await app.context.fetchCurrentJDData(true);
  assert.equal(rechecking.description, 'The work for A');
  assert.equal(rechecking.extractionStatus, 'rechecking');
  assert.equal(app.messages.length, 1);
  const failed = { jobId: 'A', syncGeneration: 1, syncSequence: 3,
    partialData: { ...jd('A', 1, 3, ''), extractionStatus: 'loading',
      extractionWarnings: ['The job description region has not loaded.'] } };
  await app.context.handleJDExtractFailed(failed, sender);
  assert.equal(app.context.getCurrentJD().description, 'The work for A');
  assert.equal(app.context.getCurrentJD().extractionStatus, 'reverify-failed');
  await app.context.handleJDExtractFailed({ ...failed, syncSequence: 4,
    partialData: { ...failed.partialData, syncSequence: 4 } }, sender);
  assert.equal(app.messages.length, 2);
  assert.equal(app.context.getCurrentJD().extractionWarnings.filter(warning => /earlier JD was retained/.test(warning)).length, 1);
  await app.context.handleJDExtracted(jd('A', 1, 5), sender);
  assert.equal(app.context.getCurrentJD().extractionStatus, 'ready');
  assert.equal(app.context.getCurrentJD().extractionWarnings.length, 0);
  await app.context.handleJDExtractFailed(failed, sender);
  assert.equal(app.context.getCurrentJD().extractionStatus, 'ready');
});

test('automatic same-tab JD reads reuse the confirmed body; explicit revalidation reads the live page', async () => {
  const app = workerHarness();
  app.setActiveUrl('https://linkedin.test/jobs/?currentJobId=A');
  await app.context.handleJDExtracted(jd('A', 1, 1), { tab: { id: 7 } });
  const confirmed = app.context.getCurrentJD();
  assert.equal(await app.context.fetchCurrentJDData(false), confirmed);
  assert.equal(app.reads, 0);
  app.setResponse(jd('A', 1, 2));
  await app.context.fetchCurrentJDData(true);
  assert.equal(app.reads, 1);
  assert.equal(app.messages.length, 1);
});

test('a changed Job ID in the active URL cannot reuse the previous confirmed JD', async () => {
  const app = workerHarness();
  app.setActiveUrl('https://linkedin.test/jobs/?currentJobId=A');
  await app.context.handleJDExtracted(jd('A', 1, 1), { tab: { id: 7 } });
  app.setActiveUrl('https://linkedin.test/jobs/?currentJobId=B');
  app.setResponse(jd('B', 2, 2, 'The work for B'));
  const actual = await app.context.fetchCurrentJDData(false);
  assert.equal(app.reads, 1);
  assert.equal(actual.jobId, 'B');
  assert.equal(actual.description, 'The work for B');
});

test('content-side automatic reads reuse the confirmed snapshot and forced reads update a changed JD', () => {
  const app = contentHarness();
  app.context.setupObservers();
  const listener = content.slice(content.indexOf('function setupMessageListener('), content.indexOf('function debounce('));
  vm.runInContext(`${listener}\nthis.setupMessageListener = setupMessageListener;`, app.context);
  app.context.setupMessageListener();
  let response = null;
  const receive = payload => { app.context.messageListener({ type: 'GET_JD_DATA', payload }, {}, value => { response = value; });
    return response.payload; };
  const reads = app.reads;
  assert.equal(receive({}).description, 'Build reliable software for customer systems.');
  assert.equal(app.reads, reads);
  app.setExtracted({ description: 'Build changed services and deploy them to production.' });
  assert.equal(receive({ forceRefresh: true }).description, 'Build changed services and deploy them to production.');
  assert.equal(app.context.state().lastConfirmedJDData.description, 'Build changed services and deploy them to production.');
  assert.equal(app.messages.filter(message => message.type === 'JD_EXTRACTED').length, 2);
});

test('A to B to A generations prevent old job failures from overwriting the selected JD', async () => {
  const app = workerHarness();
  const sender = { tab: { id: 7 } };
  await app.context.handleJDExtracted(jd('A', 1, 1), sender);
  await app.context.handleJDExtracted(jd('B', 2, 2), sender);
  await app.context.handleJDExtracted(jd('A', 3, 3, 'Fresh A duties and qualifications.'), sender);
  await app.context.handleJDExtractFailed({ jobId: 'B', syncGeneration: 2, syncSequence: 4,
    partialData: { ...jd('B', 2, 4, ''), extractionStatus: 'loading' } }, sender);
  assert.equal(app.context.getCurrentJD().jobId, 'A');
  assert.equal(app.context.getCurrentJD().description, 'Fresh A duties and qualifications.');
  assert.equal(app.messages.length, 3);
});

test('failure warning storage is bounded and always identifies retained JD', async () => {
  const app = workerHarness();
  const sender = { tab: { id: 7 } };
  await app.context.handleJDExtracted(jd('A', 1, 1), sender);
  await app.context.handleJDExtractFailed({ jobId: 'A', syncGeneration: 1, syncSequence: 2,
    partialData: { ...jd('A', 1, 2, ''), extractionStatus: 'loading',
      extractionWarnings: Array.from({ length: 12 }, (_, index) => `Temporary issue ${index}`) } }, sender);
  const warnings = app.context.getCurrentJD().extractionWarnings;
  assert.ok(warnings.length <= 4);
  assert.equal(warnings.filter(item => /earlier JD was retained/.test(item)).length, 1);
});

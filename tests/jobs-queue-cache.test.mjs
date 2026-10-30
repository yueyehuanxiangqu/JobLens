import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { paginateJobs } from '../src/shared/jobs-pagination.js';

const app = readFileSync(new URL('../src/sidepanel/app.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/background/service-worker.js', import.meta.url), 'utf8');
const content = readFileSync(new URL('../src/content/index.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../src/sidepanel/index.html', import.meta.url), 'utf8');

test('Overview pagination defaults to five, supports ten/all, and clamps when a search list changes', () => {
  const jobs = Array.from({ length: 12 }, (_, i) => ({ jobId: `j${i + 1}` }));
  assert.deepEqual(paginateJobs(jobs).jobs.map(job => job.jobId), ['j1', 'j2', 'j3', 'j4', 'j5']);
  assert.deepEqual(paginateJobs(jobs, 5, 1).jobs.map(job => job.jobId), ['j6', 'j7', 'j8', 'j9', 'j10']);
  assert.equal(paginateJobs(jobs, 10, 1).jobs.length, 2);
  assert.equal(paginateJobs(jobs, 'all', 4).page, 0);
  assert.equal(paginateJobs(jobs.slice(0, 3), 5, 2).page, 0);
  assert.match(html, /id="jobs-view-overview-btn"/);
  assert.match(html, /id="jobs-view-detail-btn"/);
  assert.match(app, /jobsScrollY\[jobsSubview\] = window\.scrollY/);
  assert.match(app, /if \(nextSignature !== currentListSignature\) \{\s*currentListSignature = nextSignature;\s*overviewPage = 0/);
});

function makeBatchHarness({ jobCount = 15, failOnce = [], failCollectionOnce = [],
  onCollection = () => {}, onAnalysis = () => {}, onInjectScore = async () => {} } = {}) {
  const jobs = Array.from({ length: jobCount }, (_, i) => ({ jobId: `j${i + 1}`, title: `Job ${i + 1}` }));
  const saved = new Set();
  const calls = [];
  const events = [];
  const flow = [];
  const tabIds = [];
  const failures = new Set(failOnce);
  const collectionFailures = new Set(failCollectionOnce);
  let active = 0;
  let peak = 0;
  const context = vm.createContext({
    crypto: { randomUUID: () => `batch-${events.length}` },
    MATCH_PROMPT_VERSION: 'prompt-v1', HOLISTIC_SCORE_VERSION: 'capability-v3', BATCH_CHUNK_SIZE: 5,
    Actions: { GET_JOB_LIST: 'list', FOCUS_JOB: 'focus', ANALYSIS_PROGRESS: 'progress', ANALYSIS_RESULT: 'result' },
    isAnalyzing: false, activeBatch: null,
    ensureResumeLoaded: async () => ({ text: 'CV', hash: 'cv-a' }),
    loadConfig: async () => ({ apiKey: 'test-key' }), loadLocale: async () => 'en',
    buildCacheContext: async () => ({}),
    getActiveTab: async () => ({ id: 1 }),
    sendTabMessageWithInjection: async (tab, message) => {
      tabIds.push(tab);
      return message.type === 'list' ? { jobs } : { success: true, switchState: 'requested' };
    },
    waitForJobDetails: async (tab, jobId) => {
      tabIds.push(tab);
      flow.push(`collect:${jobId}`);
      await onCollection(jobId, context);
      if (collectionFailures.delete(jobId)) throw new Error('JD is missing');
      return { jobId, title: jobId, description: `JD ${jobId}`, extractionVersion: 'v1' };
    },
    CacheManager: {
      cleanupExpired: async () => {},
      getEntry: async jobId => saved.has(jobId) ? { data: { jobId }, summary: { score: 75 } } : null,
      saveResult: async (jobId, _cacheContext, jd) => {
        assert.equal(jd.jobId, jobId);
        assert.equal(jd.description, `JD ${jobId}`);
        flow.push(`save:${jobId}`);
        saved.add(jobId);
      },
    },
    PositionManager: { updateSavedPositionResult: async () => {} },
    shouldIgnoreCachedEntry: () => false,
    reconcileCachedEligibility: entry => entry.data,
    runAnalysis: async (jd, resume) => {
      assert.equal(resume.hash, 'cv-a');
      active += 1;
      peak = Math.max(peak, active);
      calls.push(jd.jobId);
      flow.push(`analyze:${jd.jobId}`);
      try {
        await onAnalysis(jd.jobId, context);
        if (failures.delete(jd.jobId)) throw new Error('temporary model error');
        return { overallMatchPercent: 75, metadata: { capabilityScoreVersion: 'capability-v3' } };
      } finally { active -= 1; }
    },
    buildAnalysisPayload: (result, jd, extras) => ({ ...result, jobId: jd.jobId, ...extras }),
    tryInjectScore: onInjectScore,
    broadcast: event => { events.push(event); },
    normalizeUserFacingError: error => ({ error: error.message }),
  });
  const batchSource = worker.slice(worker.indexOf('async function handleBatchAnalysis('), worker.indexOf('async function waitForJobDetails('));
  vm.runInContext(`${batchSource}; this.runBatch = (payload) => new Promise(resolve => handleBatchAnalysis(payload, resolve));`, context);
  return { runBatch: context.runBatch, calls, saved, events, flow, tabIds, getPeak: () => peak };
}

test('each chunk collects its JDs before AI starts and a frozen badge response cannot block the pinned tab/CV analysis', { timeout: 1000 }, async () => {
  const harness = makeBatchHarness({ jobCount: 6, onInjectScore: () => new Promise(() => {}), onAnalysis: (_jobId, context) => {
    context.getActiveTab = async () => ({ id: 99 });
    context.ensureResumeLoaded = async () => ({ text: 'Other CV', hash: 'cv-b' });
  } });
  const response = await harness.runBatch({ batchSize: 'all' });
  assert.deepEqual(harness.flow, [
    ...['j1', 'j2', 'j3', 'j4', 'j5'].map(id => `collect:${id}`),
    ...['j1', 'j2', 'j3', 'j4', 'j5'].flatMap(id => [`analyze:${id}`, `save:${id}`]),
    'collect:j6', 'analyze:j6', 'save:j6',
  ]);
  assert.ok(harness.tabIds.every(id => id === 1));
  const firstAnalysis = harness.events.find(event => event.payload.batchStage === 'analysis').payload;
  assert.equal(firstAnalysis.pending, 6, 'collected but unfinished jobs stay Pending');
  assert.equal(response.completed, 6);
  assert.equal(response.pending, 0);
  assert.ok(response.timing.collectionMs >= 0 && response.timing.analysisMs >= 0);
  assert.equal(harness.getPeak(), 1);
});

test('collection and AI failures are isolated and Next skips failures while Retry Failed targets them', async () => {
  const harness = makeBatchHarness({ jobCount: 7, failCollectionOnce: ['j2'], failOnce: ['j4'] });
  const first = await harness.runBatch({ batchSize: '5' });
  assert.equal(first.collectionFailed, 1);
  assert.equal(first.analysisFailed, 1);
  assert.equal(first.completed, 3);
  assert.equal(first.failed, 2);
  assert.equal(first.pending, 2);
  assert.deepEqual(harness.calls, ['j1', 'j3', 'j4', 'j5']);
  assert.deepEqual(harness.events.filter(event => event.payload.batchStage === 'failed')
    .map(event => event.payload.failureStage), ['collection', 'analysis']);
  await harness.runBatch({ batchSize: '5', skipJobIds: ['j2', 'j4'] });
  assert.deepEqual(harness.calls, ['j1', 'j3', 'j4', 'j5', 'j6', 'j7']);
  await harness.runBatch({ batchSize: 'all', jobIds: ['j2', 'j4'] });
  assert.deepEqual(harness.calls.slice(-2), ['j2', 'j4']);
  assert.equal(harness.saved.size, 7);
});

test('cancellation during collection starts no AI requests and keeps collected jobs pending', async () => {
  const harness = makeBatchHarness({ jobCount: 6, onCollection: (jobId, context) => {
    if (jobId === 'j2') vm.runInContext('activeBatch.cancelled = true', context);
  } });
  const response = await harness.runBatch({ batchSize: 'all' });
  assert.equal(response.cancelled, true);
  assert.equal(response.pending, 6);
  assert.equal(response.failed, 0);
  assert.deepEqual(harness.calls, []);
  assert.deepEqual(harness.flow, ['collect:j1', 'collect:j2']);
});

test('hidden-page deferral analyzes collected JDs and leaves the rest pending for the existing batch controls', async () => {
  let hidden = true;
  const harness = makeBatchHarness({ jobCount: 5, onCollection: jobId => {
    if (jobId === 'j3' && hidden) throw Object.assign(new Error('Page not rendered'), { code: 'JD_COLLECTION_DEFERRED' });
  } });
  const response = await harness.runBatch({ batchSize: 'all' });
  assert.equal(response.paused, true);
  assert.equal(response.completed, 2);
  assert.equal(response.pending, 3);
  assert.equal(response.failed, 0);
  assert.deepEqual(harness.calls, ['j1', 'j2']);
  hidden = false;
  const resumed = await harness.runBatch({ batchSize: 'all' });
  assert.equal(resumed.skipped, 2);
  assert.equal(resumed.completed, 5);
  assert.deepEqual(harness.calls, ['j1', 'j2', 'j3', 'j4', 'j5']);
});

function makeWaitHarness(readResponse, currentJDData = null) {
  let reads = 0;
  let delays = 0;
  const context = vm.createContext({
    currentJDData,
    Actions: { GET_JD_DATA: 'read' },
    sendTabMessageWithInjection: async (tabId, message) => {
      assert.equal(tabId, 1);
      assert.equal(message.type, 'read');
      reads += 1;
      return readResponse(reads);
    },
    delay: async () => { delays += 1; },
  });
  const identitySource = worker.slice(worker.indexOf('function olderThanCurrentJD('), worker.indexOf('function jobIdInTabUrl('));
  const waitSource = worker.slice(worker.indexOf('async function waitForJobDetails('), worker.indexOf('function delay('));
  vm.runInContext(`${identitySource}\n${waitSource}\nthis.wait = waitForJobDetails;`, context);
  return { context, get reads() { return reads; }, get delays() { return delays; } };
}

test('JD waiting rejects delayed old A/B snapshots and accepts only the current generation for the pinned tab', async () => {
  const current = { jobId: 'A', sourceTabId: 1, description: 'Fresh A', syncGeneration: 3, syncSequence: 10 };
  const responses = [
    { activeJobId: 'B', payload: { jobId: 'B', extractionStatus: 'loading' } },
    { activeJobId: 'A', payload: { jobId: 'A', description: 'Old A', syncGeneration: 1, syncSequence: 4 } },
    { activeJobId: 'B', payload: { ...current, syncSequence: 11 } },
    { activeJobId: 'A', payload: { ...current, syncSequence: 12, extractionStatus: 'ready' } },
  ];
  const harness = makeWaitHarness(read => responses[read - 1], current);
  const result = await harness.context.wait(1, 'A', { batch: { cancelled: false } });
  assert.equal(result.description, 'Fresh A');
  assert.equal(result.syncSequence, 12);
  assert.equal(harness.reads, 4);
  assert.equal(harness.delays, 3);
});

test('hidden unrendered JD defers collection, while already verified JD can still be analyzed', async () => {
  let ready = false;
  const harness = makeWaitHarness(() => ({ pageHidden: true, activeJobId: 'A', payload: ready
    ? { jobId: 'A', description: 'Verified A', extractionStatus: 'ready' }
    : { jobId: 'A', extractionStatus: 'loading' } }));
  await assert.rejects(harness.context.wait(1, 'A', { batch: {} }), { code: 'JD_COLLECTION_DEFERRED' });
  assert.equal(harness.reads, 12);
  assert.equal(harness.delays, 11, 'hidden pages retain the existing finite render budget');
  ready = true;
  assert.equal((await harness.context.wait(1, 'A', { batch: {} })).description, 'Verified A');
  const delayedHidden = makeWaitHarness(read => ({ pageHidden: true, activeJobId: 'A', payload: read < 3
    ? { jobId: 'A', extractionStatus: 'loading' }
    : { jobId: 'A', description: 'Delayed A', extractionStatus: 'ready' } }));
  assert.equal((await delayedHidden.context.wait(1, 'A', { batch: {} })).description, 'Delayed A');
  assert.equal(delayedHidden.reads, 3);
  const visibleFailure = makeWaitHarness(() => ({ pageHidden: false, activeJobId: 'A', payload: { extractionStatus: 'loading' } }));
  assert.equal(await visibleFailure.context.wait(1, 'A', { batch: {} }), null);
  assert.equal(visibleFailure.reads, 12, 'existing bounded wait budget is unchanged');
});

test('a response arriving after batch cancellation cannot update current JD or start more reads', async () => {
  let resolveRead;
  const harness = makeWaitHarness(() => new Promise(resolve => { resolveRead = resolve; }));
  const batch = { cancelled: false };
  const pending = harness.context.wait(1, 'A', { batch });
  batch.cancelled = true;
  resolveRead({ activeJobId: 'A', payload: { jobId: 'A', description: 'Late A', extractionStatus: 'ready' } });
  assert.equal(await pending, null);
  assert.equal(harness.context.currentJDData, null);
  assert.equal(harness.reads, 1);
});

test('consecutive Next 10 runs skip saved JD/CV results and process the remaining jobs once', async () => {
  const harness = makeBatchHarness();
  const first = await harness.runBatch({ batchSize: '10' });
  const second = await harness.runBatch({ batchSize: '10' });
  assert.equal(first.analyzedCount, 10);
  assert.equal(first.pending, 5);
  assert.equal(second.analyzedCount, 5);
  assert.equal(second.pending, 0);
  assert.deepEqual(harness.calls, Array.from({ length: 15 }, (_, i) => `j${i + 1}`));
  assert.equal(harness.saved.size, 15);
  assert.equal(harness.getPeak(), 1);
  assert.equal(harness.events.filter(event => event.type === 'result').length, 25);
});

test('a failed job does not stop the queue and can be retried; cancellation leaves pending jobs', async () => {
  const harness = makeBatchHarness({ jobCount: 6, failOnce: ['j2'] });
  const first = await harness.runBatch({ batchSize: '5' });
  assert.equal(first.failed, 1);
  assert.equal(first.completed, 4);
  assert.deepEqual(harness.calls, ['j1', 'j2', 'j3', 'j4', 'j5']);
  const retry = await harness.runBatch({ jobIds: ['j2'], batchSize: 'all' });
  assert.equal(retry.completed, 1);
  assert.equal(harness.saved.has('j2'), true);

  const cancelled = makeBatchHarness({ onAnalysis: (_jobId, context) => vm.runInContext('activeBatch.cancelled = true', context) });
  const response = await cancelled.runBatch({ batchSize: 'all' });
  assert.equal(response.cancelled, true);
  assert.deepEqual(cancelled.calls, ['j1']);
  assert.ok(response.pending > 0);
});

test('cache and badge updates are guarded by selected CV, job, JD and request sequence', () => {
  assert.match(app, /requestId !== cacheHydrationSequence \|\| activeResumeId !== resumeId/);
  assert.match(app, /requestId !== jobSelectionSequence \|\| activeResumeId !== selectedResumeId/);
  assert.match(app, /activeBatchResumeHash === \(resumeProfiles\.find\(profile => profile\.id === activeResumeId\)\?\.hash \|\| ''\)/);
  assert.match(worker, /analysisResumeHash: batch\.resumeHash/);
  assert.match(content, /injectedVerifiedJobIds\.get\(entry\.jobId\) === response\.resumeHash/);
  assert.match(content, /for \(const jobId of invalidJobIds\)/);
  assert.match(content, /if \(!returnedIds\.has\(jobId\)\) verifiedScoreEntries\.delete\(jobId\)/);
  assert.match(content, /cacheState: entry\.jdVerified === true \? 'Valid' : 'Verifying'/);
  assert.match(app, /scoreMap = nextScores/);
  assert.match(content, /if \(!response\?\.ok\) \{\s*return;/);
});

test('A to B to A ignores late verification responses and preserves the final selected job', async () => {
  const pending = [];
  let displayed = '';
  const classList = { add() {}, remove() {} };
  const source = app.slice(app.indexOf('async function openJobFromList('), app.indexOf('async function openCachedResult('));
  const context = vm.createContext({
    jobSelectionSequence: 0, activeResumeId: 'cv-a', resumeProfiles: [{ id: 'cv-a', hash: 'hash-a' }],
    currentResultJobId: null, currentResultPayload: null,
    currentListJobs: ['A', 'B'].map(jobId => ({ jobId, sourceType: 'linkedin', title: jobId })),
    currentListSourceType: 'linkedin', scoreMap: new Map([['A', { cacheState: 'Valid', jdVerified: true, jdText: 'JD A' }]]),
    els: { resultsContainer: { classList }, jdStatusBadge: { textContent: '' }, jdInfo: { innerHTML: '' },
      cachedResultHint: { textContent: '', classList } },
    chrome: { runtime: { sendMessage: () => new Promise(resolve => pending.push(resolve)) } },
    Actions: { GET_VERIFIED_CACHED_RESULT: 'verify' },
    normalizeSourceType: value => value, showJobsView() {}, renderJobList() {},
    escapeHtml: value => value, t: value => value, showSaveHint() {}, scheduleRefreshPageContext() {},
    getSourceLabel: () => 'LinkedIn', renderListDetailPanel(result) { displayed = result.jobId; },
  });
  vm.runInContext(`${source}; this.openJob = openJobFromList;`, context);
  const a1 = context.openJob('A');
  const b = context.openJob('B');
  const a2 = context.openJob('A');
  pending[0]({ ok: true, status: 'Invalid', resumeHash: 'hash-a' });
  pending[1]({ ok: true, status: 'Invalid', resumeHash: 'hash-a' });
  pending[2]({ ok: true, status: 'Valid', resumeHash: 'hash-a', entry: {
    jobId: 'A', sourceType: 'linkedin', result: { overallMatchPercent: 80 }, jdText: 'JD A', cacheState: 'Valid',
  } });
  await Promise.all([a1, b, a2]);
  assert.equal(context.currentResultJobId, 'A');
  assert.equal(context.scoreMap.get('A').cacheState, 'Valid');
  assert.equal(context.scoreMap.has('B'), false);
  assert.equal(displayed, 'A');
});

test('CV change prevents an old verification response from restoring another CV score', async () => {
  let resolveRequest;
  const source = app.slice(app.indexOf('async function openJobFromList('), app.indexOf('async function openCachedResult('));
  const context = vm.createContext({
    jobSelectionSequence: 0, activeResumeId: 'cv-a', resumeProfiles: [{ id: 'cv-a', hash: 'hash-a' }, { id: 'cv-b', hash: 'hash-b' }],
    currentResultJobId: null, currentResultPayload: null,
    currentListJobs: [{ jobId: 'A', sourceType: 'linkedin', title: 'A' }], currentListSourceType: 'linkedin',
    scoreMap: new Map(),
    els: { resultsContainer: { classList: { add() {} } }, jdStatusBadge: {}, jdInfo: {},
      cachedResultHint: { textContent: '', classList: { remove() {} } } },
    chrome: { runtime: { sendMessage: () => new Promise(resolve => { resolveRequest = resolve; }) } },
    Actions: { GET_VERIFIED_CACHED_RESULT: 'verify' }, normalizeSourceType: value => value,
    showJobsView() {}, renderJobList() {}, escapeHtml: value => value, t: value => value,
  });
  vm.runInContext(`${source}; this.openJob = openJobFromList;`, context);
  const request = context.openJob('A');
  context.activeResumeId = 'cv-b';
  resolveRequest({ ok: true, status: 'Valid', resumeHash: 'hash-a', entry: { jobId: 'A', score: 90 } });
  await request;
  assert.equal(context.scoreMap.has('A'), false);
});

test('side panel keeps a verified cache while verification is transient and clears it only after confirmed invalidity', async () => {
  const responses = [{ ok: false, status: 'Verifying' }, { ok: true, status: 'Invalid', resumeHash: 'hash-a' }];
  const source = app.slice(app.indexOf('async function openJobFromList('), app.indexOf('async function openCachedResult('));
  const context = vm.createContext({
    jobSelectionSequence: 0, activeResumeId: 'cv-a', resumeProfiles: [{ id: 'cv-a', hash: 'hash-a' }],
    currentResultJobId: null, currentResultPayload: null,
    currentListJobs: [{ jobId: 'A', title: 'A', sourceType: 'linkedin' }], currentListSourceType: 'linkedin',
    scoreMap: new Map([['A', { score: 80, cacheState: 'Valid', jdVerified: true, jdText: 'JD A' }]]),
    els: { resultsContainer: { classList: { add() {} } }, jdStatusBadge: {}, jdInfo: {},
      cachedResultHint: { textContent: '', classList: { remove() {} } } },
    chrome: { runtime: { sendMessage: async () => responses.shift() } },
    Actions: { GET_VERIFIED_CACHED_RESULT: 'verify' }, normalizeSourceType: value => value,
    showJobsView() {}, renderJobList() {}, escapeHtml: value => value, t: value => value,
    scheduleRefreshPageContext() {}, getSourceLabel: () => 'LinkedIn',
  });
  vm.runInContext(`${source}; this.openJob = openJobFromList;`, context);
  await context.openJob('A');
  assert.equal(context.scoreMap.get('A').cacheState, 'Verifying');
  assert.match(context.els.cachedResultHint.textContent, /Verifying/);
  await context.openJob('A');
  assert.equal(context.scoreMap.has('A'), false);
  assert.match(context.els.cachedResultHint.textContent, /no longer matches/);
});

test('cache hydration preserves prior exact-JD verification through a temporary recheck', async () => {
  const source = app.slice(app.indexOf('async function hydrateJobScores('), app.indexOf('function renderJobList('));
  let entries = [{ jobId: 'A', score: 80, jdVerified: false, jdText: 'JD A', jdExtractionVersion: 'v1' }];
  const context = vm.createContext({
    cacheHydrationSequence: 0, activeResumeId: 'cv-a', resumeProfiles: [{ id: 'cv-a', hash: 'hash-a' }],
    currentJDData: { jobId: 'A', description: '', extractionStatus: 'rechecking' },
    scoreMap: new Map([['A', { score: 80, cacheState: 'Verifying', jdVerified: true,
      jdText: 'JD A', jdExtractionVersion: 'v1' }]]),
    chrome: { runtime: { sendMessage: async () => ({ ok: true, resumeAvailable: true,
      resumeHash: 'hash-a', entries }) } },
    Actions: { GET_CACHED_SCORES: 'cache' },
    els: { cachedResultHint: { classList: { add() {} } } },
    renderJobList() {}, renderManualJobs() {}, renderLibrary() {},
  });
  vm.runInContext(`${source}; this.hydrate = hydrateJobScores;`, context);
  await context.hydrate([{ jobId: 'A' }]);
  assert.equal(context.scoreMap.get('A').jdVerified, true);
  assert.equal(context.scoreMap.get('A').cacheState, 'Verifying');
  entries = [];
  await context.hydrate([{ jobId: 'A' }]);
  assert.equal(context.scoreMap.has('A'), false);
});

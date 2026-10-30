import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildDiagnosticReport } from '../src/shared/diagnostics.js';

// Exercise the actual message handler with only browser/network dependencies stubbed.
const worker = readFileSync(new URL('../src/background/service-worker.js', import.meta.url), 'utf8');
const sidepanel = readFileSync(new URL('../src/sidepanel/app.js', import.meta.url), 'utf8');
const handler = worker.slice(worker.indexOf('async function handleStartAnalysis('), worker.indexOf('async function handleStartManualAnalysis('));
function harness(details) {
  const calls = [];
  const context = vm.createContext({
    isAnalyzing: false, ErrorTypes: {},
    Actions: { FOCUS_JOB: 'FOCUS_JOB', ANALYSIS_RESULT: 'RESULT', ANALYSIS_ERROR: 'ERROR' },
    ensureResumeLoaded: async () => ({ text: 'resume' }),
    loadConfig: async () => ({ apiKey: 'test' }),
    getActiveTab: async () => ({ id: 1 }),
    sendTabMessageWithInjection: async (_, message) => calls.push(message),
    waitForJobDetails: async (_, id) => { assert.equal(id, 'B'); return details; },
    fetchCurrentJDData: async () => { throw new Error('Must not analyze currently selected A'); },
    runAnalysisForJob: async (jd, resume, config, options) => {
      calls.push({ analyzed: jd.jobId, forceRefresh: options.forceRefresh });
      return { payload: { jobId: jd.jobId }, fromCache: false };
    },
    broadcast: () => {}, normalizeUserFacingError: error => ({ error: error.message }),
  });
  vm.runInContext(handler, context);
  return { context, calls };
}

test('single-job action focuses and analyzes requested B, not current A or whole list', async () => {
  const { context, calls } = harness({ jobId: 'B', description: 'B details' });
  let result;
  await context.handleStartAnalysis({ jobId: 'B', forceRefresh: true }, value => { result = value; });
  assert.equal(calls[0].type, 'FOCUS_JOB');
  assert.equal(calls[0].payload.jobId, 'B');
  assert.equal(calls[1].analyzed, 'B');
  assert.equal(calls[1].forceRefresh, true);
  assert.equal(result.data.jobId, 'B');
  assert.equal(context.isAnalyzing, false);
});

test('missing selected details fail without sending a different job to the model', async () => {
  const { context, calls } = harness(null);
  let result;
  await context.handleStartAnalysis({ jobId: 'B' }, value => { result = value; });
  assert.equal(result.ok, false);
  assert.match(result.error, /selected job details/);
  assert.equal(calls.length, 1);
  assert.equal(context.isAnalyzing, false);
});

test('diagnostic report identifies auth failure and excludes sensitive source fields', () => {
  const report = buildDiagnosticReport({
    modelUsed: 'chosen', providerUsed: 'openrouter', apiKey: 'DO_NOT_COPY', resume: 'DO_NOT_COPY',
    diagnostics: { stage: 'request', httpStatus: 401, apiKey: 'DO_NOT_COPY', rawResponse: 'DO_NOT_COPY' },
  });
  assert.match(report.nextStep, /API key/);
  assert.equal(report.requestedModel, 'chosen');
  assert.ok(!JSON.stringify(report).includes('DO_NOT_COPY'));
  assert.match(buildDiagnosticReport({}).nextStep, /older result/);
  assert.match(buildDiagnosticReport({ diagnostics: { stage: 'json' } }).nextStep, /JSON/);
  const localTimeout = buildDiagnosticReport({ diagnostics: { stage: 'request', failureKind: 'timeout' } });
  assert.equal(localTimeout.failureKind, 'timeout');
  assert.equal(localTimeout.timeoutSource, 'extension');
  assert.match(localTimeout.nextStep, /local timeout/);
  const providerTimeout = buildDiagnosticReport({ diagnostics: { stage: 'request', failureKind: 'timeout', httpStatus: 504 } });
  assert.equal(providerTimeout.timeoutSource, 'provider');
  const schemaDegraded = buildDiagnosticReport({ diagnostics: { stage: 'completed_with_warnings', failureKind: 'schema_degraded', schemaErrors: ['Resume quotation not found at row 1.'] } });
  assert.match(schemaDegraded.nextStep, /treated as unknown/i);
  const truncated = buildDiagnosticReport({
    metadata: { analysisTimestamp: 'now' },
    analysisTimestamp: 'now',
    providerUsed: 'openrouter',
    modelUsed: 'model',
    promptVersion: 'v6',
    degradationTriggers: ['MODEL_TRUNCATED'],
    diagnostics: { stage: 'json', extensionVersion: '0.6.2', finishReason: 'length' },
  });
  assert.match(truncated.nextStep, /output limit/i);
  assert.equal(truncated.finishReason, 'length');
});

test('side panel consumes single completion responses and deduplicates broadcast results', () => {
  assert.equal((sidepanel.match(/if \(response\.data\) \{\s*handleResult\(response\.data\);\s*\}/g) || []).length, 2);
  assert.match(sidepanel, /if \(mode === 'batch'\) return startBatchQueue\(overridePayload, silent\)/);
  assert.match(sidepanel, /if \(response\.analysisResumeHash === activeBatchResumeHash/);
  const helper = sidepanel.slice(sidepanel.indexOf('function getAnalysisResultKey('), sidepanel.indexOf('function renderResult('));
  const context = vm.createContext({ activeResumeId: 'cv-a' });
  vm.runInContext(`${helper}; this.getAnalysisResultKey = getAnalysisResultKey;`, context);
  const result = { jobId: 'B', sourceType: 'linkedin', cachedAt: '2026-09-15T10:00:00.000Z' };
  assert.equal(context.getAnalysisResultKey(result), context.getAnalysisResultKey({ ...result }));
  assert.notEqual(context.getAnalysisResultKey(result), context.getAnalysisResultKey({ ...result, cachedAt: '2026-09-15T10:01:00.000Z' }));
});

test('diagnostic copy keeps the full report out of HTML attributes', () => {
  assert.doesNotMatch(sidepanel, /data-copy-diagnostics="\$\{escapeHtml\(JSON\.stringify\(report/);
  assert.match(sidepanel, /diagnosticCopyReports\.get\(button\.dataset\.copyDiagnostics\)/);
  assert.match(sidepanel, /navigator\.clipboard\.writeText\(JSON\.stringify\(report, null, 2\)\)/);
});

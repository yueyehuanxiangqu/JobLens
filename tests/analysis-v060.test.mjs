import test from 'node:test';
import assert from 'node:assert/strict';
import { runAnalysis } from '../src/background/match-engine.js';
import { JOB_ANALYSIS_VERSION } from '../src/shared/job-analysis.js';

const config = { provider: 'openrouter', baseUrl: 'https://openrouter.ai', modelId: 'vendor/chosen', apiKey: 'test-key',
  maxTokens: 4096, temperature: 0, timeoutMs: 1000, maxRetries: 0, includeSponsorshipInScore: false };
const jd = { title: 'Data Analyst', company: 'Example', location: 'London, UK',
  description: 'Use SQL to analyze datasets, build dashboards and communicate findings with the product team.' };
const resume = 'A data analyst with SQL experience building dashboards and communicating findings with product teams.';
const apiResponse = (content, finishReason = 'stop') => new Response(JSON.stringify({
  choices: [{ message: { content }, finish_reason: finishReason }],
}));
const result = (overrides = {}) => ({ rubricVersion: 'capability-v3', extractionComplete: true,
  capabilityAssessment: { score: 78, scoreReason: 'Relevant SQL and reporting work, with some scope still unclear.',
    strengths: [{ claim: 'SQL reporting matches this role.', evidenceKind: 'Direct', jdSource: 'JD Body',
      jdQuote: 'Use SQL to analyze datasets', cvQuotes: ['SQL experience building dashboards'] }],
    risks: [], ...overrides },
  jobAnalysis: { schemaVersion: 'job-analysis-v6',
    careerLevel: { level: 'Unknown', reasons: [], supportingEvidence: [], conflictingEvidence: [] },
    dutchRequirement: { status: 'Not Specified', relation: 'None', reason: '', supportingEvidence: [] },
    experienceRequirements: { items: [], acceptedAlternatives: [] },
    mainResponsibilities: [{ summary: 'build dashboards', displayText: 'Build dashboards.', displayLanguage: 'en',
      supportingEvidence: [{ source: 'JD Body', quote: 'build dashboards' }] }] },
});

test('failed or stale JD cannot call AI or yield a current score', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('AI must not be called'); });
  for (const extractionStatus of ['failed', 'rechecking', 'reverify-failed', 'identity-mismatch']) {
    const analysis = await runAnalysis({ ...jd, extractionStatus }, resume, config);
    assert.equal(analysis.metadata.capabilityScoreVersion, null);
  }
  assert.equal(calls, 0);
});

test('one model request supplies the holistic score without local weight replacement', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls++;
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(JSON.parse(init.body).model, 'vendor/chosen');
    return apiResponse(JSON.stringify(result()));
  });
  const analysis = await runAnalysis(jd, resume, config);
  assert.equal(calls, 1);
  assert.equal(analysis.overallMatchPercent, 78);
  assert.equal(analysis.metadata.capabilityScoreVersion, 'capability-v3');
  assert.equal(analysis.metadata.promptVersion, 'v21');
  assert.deepEqual(analysis.metadata.weightsApplied, {});
  assert.equal(analysis.rubric.scoreReason, 'Relevant SQL and reporting work, with some scope still unclear.');
  assert.equal(analysis.jobAnalysis.version, JOB_ANALYSIS_VERSION);
  assert.equal(analysis.jobAnalysis.schemaValid, true);
  assert.equal(analysis.jobAnalysis.schemaVersion, 'job-analysis-v6');
});

test('language and permit restrictions cannot create a local decision or alter the AI score', async t => {
  const riskJD = { ...jd, location: 'Amsterdam, Netherlands',
    description: jd.description + ' We are unable to provide a work permit for this position.' };
  t.mock.method(globalThis, 'fetch', async () => apiResponse(JSON.stringify(result())));
  const analysis = await runAnalysis(riskJD, resume, { ...config, includeSponsorshipInScore: true });
  assert.equal(analysis.overallMatchPercent, 78);
  assert.equal(analysis.applicationEligibility, undefined);
  assert.equal(analysis.applicationRecommendation, undefined);
});

test('invalid holistic schema fails rather than displaying a fabricated zero score', async t => {
  t.mock.method(globalThis, 'fetch', async () => apiResponse('{"ok":true}'));
  const analysis = await runAnalysis(jd, resume, config);
  assert.ok(analysis.metadata.degradationTriggers.includes('MODEL_FIELD_MISSING'));
  assert.equal(analysis.metadata.capabilityScoreVersion, null);
});

test('truncated JSON retries once; complete JSON stays at one request', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls++;
    if (calls === 1) {
      assert.equal(JSON.parse(init.body).max_tokens, 4096);
      return apiResponse('{"rubricVersion":"capability-v3"', 'length');
    }
    assert.equal(JSON.parse(init.body).max_tokens, 8192);
    return apiResponse(JSON.stringify(result()));
  });
  const analysis = await runAnalysis(jd, resume, config);
  assert.equal(calls, 2);
  assert.equal(analysis.overallMatchPercent, 78);
  assert.equal(analysis.metadata.timing.usedRetry, true);
});

test('a length-limited but parseable reply is retried instead of presenting partial text', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return apiResponse(JSON.stringify(result()), calls === 1 ? 'length' : 'stop');
  });
  const analysis = await runAnalysis(jd, resume, config);
  assert.equal(calls, 2);
  assert.equal(analysis.metadata.timing.usedRetry, true);
  assert.equal(analysis.overallMatchPercent, 78);
});

test('an English explanation in Chinese UI keeps the verified score with a separate quality diagnostic', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return apiResponse(JSON.stringify(result()));
  });
  const analysis = await runAnalysis(jd, resume, { ...config, analysisLanguage: 'zh-CN' });
  assert.equal(calls, 1);
  assert.equal(analysis.overallMatchPercent, 78);
  assert.equal(analysis.metadata.capabilityScoreVersion, 'capability-v3');
  assert.equal(analysis.metadata.diagnostics.failureKind, 'explanation_quality');
  assert.equal(analysis.metadata.diagnostics.stage, 'completed_with_warnings');
  assert.deepEqual(analysis.metadata.diagnostics.explanationIssues,
    ['SUMMARY_LANGUAGE_MISMATCH', 'POINT_LANGUAGE_MISMATCH']);
  assert.deepEqual(analysis.metadata.diagnostics.schemaErrors || [], []);
  assert.equal(analysis.metadata.explanationLanguageVerified, false);
  assert.equal(analysis.metadata.degradationTriggers.includes('MODEL_FIELD_MISSING'), false);
});

test('an incomplete explanation does not turn a current valid score into a legacy result', async t => {
  t.mock.method(globalThis, 'fetch', async () => apiResponse(JSON.stringify(result({
    scoreReason: 'Relevant project work, rather than pr',
  }))));
  const analysis = await runAnalysis(jd, resume, config);
  assert.equal(analysis.overallMatchPercent, 78);
  assert.equal(analysis.metadata.capabilityScoreVersion, 'capability-v3');
  assert.equal(analysis.metadata.promptVersion, 'v21');
  assert.equal(analysis.rubric.explanationQuality.status, 'review');
  assert.deepEqual(analysis.metadata.diagnostics.explanationIssues, ['SUMMARY_POSSIBLY_INCOMPLETE']);
  assert.equal(analysis.metadata.degradationTriggers.includes('MODEL_FIELD_MISSING'), false);
});

test('unverifiable model evidence is rejected without changing the model score', async t => {
  const response = result({ risks: [{ claim: 'Reporting scope is uncertain.', evidenceKind: 'Unknown', jdSource: 'JD Body',
    jdQuote: 'build dashboards', cvQuotes: [] }], strengths: [{ claim: 'Invented claim', evidenceKind: 'Direct',
      jdSource: 'JD Body', jdQuote: 'Use SQL', cvQuotes: ['Not in this CV'] }] });
  t.mock.method(globalThis, 'fetch', async () => apiResponse(JSON.stringify(response)));
  const analysis = await runAnalysis(jd, resume, config);
  assert.equal(analysis.overallMatchPercent, 78);
  assert.deepEqual(analysis.strengths, []);
  assert.ok(analysis.metadata.degradationTriggers.includes('MODEL_FIELD_MISSING'));
  assert.equal(analysis.rubric.risks[0].jdQuote, 'build dashboards');
});

test('Gemini uses the professional JSON contract in one request without local eligibility or score penalties', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls++;
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'gemini-user-model');
    assert.equal(body.response_format.type, 'json_schema');
    assert.equal(body.response_format.json_schema.schema.properties.capabilityAssessment.properties.score.type, 'integer');
    return apiResponse(JSON.stringify(result()));
  });
  const analysis = await runAnalysis({ ...jd, location: 'Amsterdam, Netherlands' }, resume, { ...config, provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', modelId: 'gemini-user-model',
    includeSponsorshipInScore: true });
  assert.equal(calls, 1);
  assert.equal(analysis.overallMatchPercent, 78);
  assert.equal(analysis.metadata.penaltyCoefficient, undefined);
  assert.equal(analysis.metadata.capLimit, undefined);
  assert.equal(analysis.applicationEligibility, undefined);
  assert.equal(analysis.applicationRecommendation, undefined);
});

test('invalid nonempty JSON retries once with corrective instructions, temperature zero and no extra tokens', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const body = JSON.parse(init.body);
    calls++;
    if (calls === 1) return apiResponse('{"score":78,}');
    assert.equal(body.temperature, 0);
    assert.equal(body.max_tokens, 4096);
    assert.match(body.messages[0].content, /Regenerate the complete JSON object/);
    return apiResponse(JSON.stringify(result()));
  });
  const analysis = await runAnalysis(jd, resume, { ...config, temperature: 0.4 });
  assert.equal(calls, 2);
  assert.equal(analysis.overallMatchPercent, 78);
  assert.equal(analysis.metadata.diagnostics.retryReason, 'invalid_json');
  assert.deepEqual(analysis.metadata.diagnostics.jsonAttempts.map(item => item.outcome), ['invalid_json', 'parsed']);
});

test('failed JSON, empty output and output-limit failures have distinct diagnostics and no fabricated score', async t => {
  for (const [content, reason, kind, trigger, expectedCalls] of [
    ['{"score":78,}', 'stop', 'invalid_json', 'MODEL_JSON_INVALID', 2],
    ['', 'stop', 'empty_output', 'MODEL_NO_OUTPUT', 1],
    ['', 'length', 'truncated_output', 'MODEL_TRUNCATED', 2],
  ]) {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => { calls++; return apiResponse(content, reason); });
    const analysis = await runAnalysis(jd, resume, config);
    assert.equal(calls, expectedCalls);
    assert.equal(analysis.overallMatchPercent, null);
    assert.equal(analysis.metadata.rawScoreBeforePenalty, null);
    assert.equal(analysis.metadata.capabilityScoreVersion, null);
    assert.equal(analysis.metadata.diagnostics.failureKind, kind);
    assert.ok(analysis.metadata.degradationTriggers.includes(trigger));
    if (kind === 'invalid_json') assert.ok(!analysis.metadata.degradationTriggers.includes('MODEL_NO_OUTPUT'));
    t.mock.restoreAll();
  }
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../src/sidepanel/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/sidepanel/app.js', import.meta.url), 'utf8');
const content = readFileSync(new URL('../src/content/index.js', import.meta.url), 'utf8');

const page = (id, next) => html.slice(html.indexOf(`id="tab-${id}"`), html.indexOf(`id="tab-${next}"`));

test('four pages contain their intended controls without duplicating CV management', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  assert.deepEqual([...html.matchAll(/data-tab="(jobs|library|cvs|settings)"/g)].map(match => match[1]),
    ['jobs', 'library', 'cvs', 'settings']);
  const jobs = page('jobs', 'library');
  const library = page('library', 'cvs');
  const cvs = page('cvs', 'settings');
  assert.match(jobs, /id="current-cv-select"/);
  assert.match(jobs, /id="manage-cvs-btn"/);
  assert.match(jobs, /id="job-list-card"/);
  assert.match(jobs, /id="analyze-btn"/);
  assert.doesNotMatch(jobs, /id="resume-library-list"/);
  assert.match(library, /id="library-card"/);
  assert.match(library, /id="manual-jobs-card"/);
  assert.match(cvs, /id="resume-library-list"/);
  assert.match(cvs, /id="resume-input"/);
  assert.equal([...html.matchAll(/id="resume-library-list"/g)].length, 1);
});

test('compact CV selector reuses selected-profile switching and clears old result state', () => {
  assert.match(app, /handleResumeLibraryAction\('select', els\.currentCvSelect\.value\)/);
  assert.match(app, /resumeProfiles\.find\(profile => profile\.id === activeResumeId\)/);
  assert.match(app, /els\.resultsContainer\.classList\.add\('hidden'\)/);
  assert.match(app, /await refreshPageScores\(\)/);
  assert.match(app, /await hydrateJobScores\(\[\.\.\.currentListJobs, \.\.\.manualJobs\]/);
});

test('current and saved detail use one concise sequence with evidence and original JD collapsed', () => {
  const shared = app.slice(app.indexOf('function buildUnifiedAnalysisHtml('), app.indexOf('function buildCompactRequirementsHtml('));
  for (const title of ['Overall assessment', 'Strengths / Risks & Gaps', "What You'll Do", 'Job Requirements',
    'Evidence & Original JD', 'Diagnostics']) assert.match(shared, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.ok(shared.indexOf('Overall assessment') < shared.indexOf('Strengths / Risks & Gaps'));
  assert.ok(shared.indexOf('Strengths / Risks & Gaps') < shared.indexOf("What You'll Do"));
  assert.ok(shared.indexOf("What You'll Do") < shared.indexOf('Job Requirements'));
  assert.ok(shared.indexOf('Job Requirements') < shared.indexOf('Evidence & Original JD'));
  assert.ok(shared.indexOf("t('Evidence & Original JD')") < shared.indexOf("t('Diagnostics')"));
  assert.match(app, /els\.resultSections\.innerHTML = buildUnifiedAnalysisHtml/);
  assert.match(app, /\$\{buildUnifiedAnalysisHtml\(result, resolveOriginalJD\(result\)\)\}/);
  assert.doesNotMatch(shared, /t\('Fit Level'\)/);
});

test('inactive weights stay hidden and custom prompt plus diagnostics live in Advanced Settings', () => {
  assert.match(html, /class="advanced-settings hidden">\s*<summary>Legacy advanced weights/);
  const advanced = html.slice(html.indexOf('<summary>Advanced settings</summary>'));
  assert.match(advanced, /id="setting-prompt-policy"/);
  assert.match(advanced, /id="setting-custom-prompt"/);
  assert.match(advanced, /id="setting-enable-diagnostics"/);
  assert.match(advanced, /id="setting-autoanalyze"[^>]*value="0"/);
  assert.match(html, /id="clear-analysis-cache-btn"/);
  assert.match(html, /id="setting-provider"/);
});

test('KM title pills use KM Sponsor text while keeping the vacancy caveat', () => {
  assert.match(content, /\[TITLE_SIGNAL_KEYS\.KM\]: entry\?\.kmEligible \? 'KM Sponsor' : ''/);
  assert.match(app, /\[TITLE_SIGNAL_KEYS\.KM\]: kmEligible \? 'KM Sponsor' : ''/);
  assert.match(app, /Employer matched in the IND recognized sponsor register; this vacancy is not confirmed to sponsor/);
});

test('shared detail keeps one risk list, hides Unknown career, and collapses duty citations', () => {
  const source = app.slice(app.indexOf('function verifiedJobAnalysis('), app.indexOf('function buildResultContextLine('));
  const context = vm.createContext({
    MATCH_PROMPT_VERSION: 'v21', JOB_ANALYSIS_VERSION: 'job-analysis-v5', HOLISTIC_SCORE_VERSION: 'capability-v3',
    t: value => value, escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
    splitInsightItems: result => ({ gaps: result.gaps, unknowns: result.unknowns }),
    buildHolisticEvidenceHtml: () => '<div>verified quotation</div>',
    buildBreakdownItemsHtml: () => '', buildListDetailMetadataHtml: () => '<p>metadata</p>',
    buildExplanationLanguageHtml: () => '',
    responsibilityText: item => ({ text: item.label, original: false }),
  });
  vm.runInContext(`${source}; this.buildUnifiedAnalysisHtml = buildUnifiedAnalysisHtml;`, context);
  const result = {
    overallMatchPercent: 68,
    metadata: { capabilityScoreVersion: 'capability-v3', promptVersion: 'v21' },
    rubric: { version: 'capability-v3', scoreReason: 'Related project, limited production scope.' },
    applicationEligibility: { status: 'Need Verification', reasons: [] },
    strengths: ['Relevant Python work'], gaps: ['Production scope unknown'],
    unknowns: ['unknown: Production scope unknown'],
    jobAnalysis: { version: 'job-analysis-v5', careerLevel: { level: 'Unknown' },
      mainResponsibilities: [{ label: 'Build search systems', evidenceSources: [{ quote: 'Build search systems' }] }],
      workPermitSponsorship: { status: 'Not Specified' } },
  };
  const output = context.buildUnifiedAnalysisHtml(result, 'Full original JD');
  assert.equal(output.match(/Production scope unknown/g)?.length, 1);
  assert.doesNotMatch(output, /Career Level/);
  assert.match(output, /<details class="inline-evidence"><summary>View evidence<\/summary><q translate="no">Build search systems<\/q><\/details>/);
  assert.match(output, /<details class="original-jd">/);
  assert.match(output, /Full original JD/);
  const priorVersion = context.buildUnifiedAnalysisHtml({ ...result,
    metadata: { ...result.metadata, promptVersion: 'v19' } }, 'Full original JD');
  assert.doesNotMatch(priorVersion, /Legacy score; re-analyze/);
  assert.match(priorVersion, /Related project, limited production scope/);
  assert.match(priorVersion, /Build search systems/);
  const failedCurrent = context.buildUnifiedAnalysisHtml({ ...result,
    metadata: { ...result.metadata, capabilityScoreVersion: null }, rubric: null,
  }, 'Full original JD');
  assert.match(failedCurrent, /This analysis did not produce a valid Capability Fit score/);
  assert.doesNotMatch(failedCurrent, /Legacy score; re-analyze/);
  const explanationReview = context.buildUnifiedAnalysisHtml({ ...result,
    rubric: { ...result.rubric, explanationQuality: { status: 'review', issues: ['SUMMARY_POSSIBLY_INCOMPLETE'] } },
  }, 'Full original JD');
  assert.match(explanationReview, /Explanation needs review; the verified Capability Fit score remains available/);
  assert.doesNotMatch(explanationReview, /Legacy score; re-analyze/);
  const informational = context.buildUnifiedAnalysisHtml({ ...result,
    applicationRecommendation: 'Worth Applying',
    applicationEligibility: { status: 'Need Verification', reasons: [{ severity: 'Need Verification',
      affectsRecommendation: false, message: 'Work-permit sponsorship is not specified in this JD.' }] },
  });
  assert.doesNotMatch(informational.slice(0, informational.indexOf('Job Requirements')), /sponsorship is not specified/);
  assert.doesNotMatch(informational, /Application Recommendation|Application Eligibility|sponsorship is not specified/);
});

test('responsibility display uses localized text only for its saved and current language', () => {
  const source = app.slice(app.indexOf('function responsibilityText('), app.indexOf('function buildJobAnalysisBadges('));
  const context = vm.createContext({ getLocale: () => 'zh-CN' });
  vm.runInContext(`${source}; this.renderDuty = responsibilityText;`, context);
  const duty = { label: 'Je bouwt AI-systemen.', displayText: '构建 AI 系统。', displayLanguage: 'zh-CN' };
  const chinese = context.renderDuty(duty, { metadata: { analysisLanguage: 'zh-CN' } });
  assert.equal(chinese.text, '构建 AI 系统。');
  assert.equal(chinese.original, false);
  const stale = context.renderDuty(duty, { metadata: { analysisLanguage: 'en' } });
  assert.equal(stale.text, duty.label);
  assert.equal(stale.original, true);
  const old = context.renderDuty({ label: duty.label }, { metadata: { analysisLanguage: 'zh-CN' } });
  assert.equal(old.original, true);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { analyzeJobRequirements } from '../src/shared/job-analysis.js';
import { badgeColorsForAccent, badgeToneForPermit, badgeToneForScore, permitBadgeLabel } from '../src/shared/badge-theme.js';
import { t } from '../src/i18n/index.js';
import { CacheManager } from '../src/background/cache-manager.js';

const quote = text => ({ source: 'JD Body', quote: text });
const assess = (description, status, evidence = []) => analyzeJobRequirements({ title: 'Engineer', description }, {
  workPermitSponsorship: { status, reason: 'JD work-permit policy.', supportingEvidence: evidence.map(quote) },
});

test('permit metadata remains a legacy fact without candidate decisions', () => {
  const unknownCases = [
    assess('Build reliable software.', 'Not Specified'),
    assess('No Relocation Assistance is available.', 'Not Specified'),
    analyzeJobRequirements({ title: 'Engineer', description: 'Build reliable software.' }, null,
      { indRegistered: true, kmEligible: true }),
  ];
  for (const analysis of unknownCases) {
    assert.equal(analysis.applicationEligibility, undefined);
    assert.equal(analysis.applicationRecommendation, undefined);
  }
  for (const [text, status] of [
    ['We do not provide visa sponsorship.', 'Explicitly Unavailable'],
    ['Applicants must already have the right to work in the Netherlands.', 'Existing Authorization Required'],
    ['We offer visa sponsorship for this role.', 'Explicitly Available'],
  ]) {
    const analysis = assess(text, status, [text]);
    assert.equal(analysis.applicationEligibility, undefined);
    assert.equal(analysis.applicationRecommendation, undefined);
  }
});

test('vacancy permit policy uses exact JD evidence and stays independent of IND status', () => {
  const denial = 'Unfortunately, we are unable to provide a work permit for this position.';
  const unavailable = assess(denial, 'Explicitly Unavailable', [denial]);
  assert.equal(unavailable.workPermitSponsorship.status, 'Explicitly Unavailable');
  assert.deepEqual(unavailable.workPermitSponsorship.supportingEvidence, [denial]);
  assert.equal(permitBadgeLabel(unavailable.workPermitSponsorship.status), 'No Sponsorship');

  const offer = 'We offer visa sponsorship for this role.';
  assert.equal(assess(offer, 'Explicitly Available', [offer]).workPermitSponsorship.status, 'Explicitly Available');
  const authorization = 'Applicants must already have the right to work in the Netherlands.';
  assert.equal(assess(authorization, 'Existing Authorization Required', [authorization])
    .workPermitSponsorship.status, 'Existing Authorization Required');
  assert.equal(permitBadgeLabel('Existing Authorization Required'), 'Verify Sponsorship');

  const absent = analyzeJobRequirements({ title: 'Engineer', description: 'Build reliable software.' }, null,
    { indRegistered: true, kmEligible: true });
  assert.equal(absent.workPermitSponsorship.status, 'Not Specified');
  assert.equal(permitBadgeLabel(absent.workPermitSponsorship.status), '');
  assert.equal(assess('No Relocation Assistance is available.', 'Not Specified')
    .workPermitSponsorship.status, 'Not Specified');
  assert.equal(assess('No Relocation Assistance is available.', 'Unclear',
    ['No Relocation Assistance is available.']).workPermitSponsorship.status, 'Not Specified');
});

test('unsupported policy labels degrade and conflicting JD statements require review', () => {
  const invented = assess('Build software.', 'Explicitly Available', ['We offer visa sponsorship.']);
  assert.equal(invented.workPermitSponsorship.status, 'Not Specified');
  const vague = assess('Visa support may be discussed with the recruiter.', 'Unclear',
    ['Visa support may be discussed with the recruiter.']);
  assert.equal(vague.workPermitSponsorship.status, 'Unclear');
  const conflict = 'We offer visa sponsorship for this role. We do not sponsor visas for this role.';
  const result = assess(conflict, 'Explicitly Available', ['We offer visa sponsorship for this role.']);
  assert.equal(result.workPermitSponsorship.status, 'Unclear');
  assert.equal(result.workPermitSponsorship.supportingEvidence.length, 2);
  const consistentRestriction = 'We do not sponsor visas for this role. Applicants must already have the right to work in the Netherlands.';
  assert.equal(assess(consistentRestriction, 'Existing Authorization Required',
    ['Applicants must already have the right to work in the Netherlands.'])
    .workPermitSponsorship.status, 'Explicitly Unavailable');
});

test('missing or malformed summary falls back only to listed work duties', () => {
  const duties = ['Cloud Services', 'Docker and Kubernetes', 'Python programming', 'CI/CD',
    'Data pipelines', 'Infrastructures & Services adapted to Machine Learning'];
  const description = `Your role\n${duties.map(duty => `- ${duty}`).join('\n')}\nRequirements\n- Fluent Dutch\nBenefits\n- 30 vacation days\nAbout the company\nWe were founded in 1990.`;
  const result = analyzeJobRequirements({ title: 'Engineer', description }, { mainResponsibilities: [] });
  assert.deepEqual(result.mainResponsibilities.map(item => item.label), duties);
  assert.equal(result.responsibilityDiagnostics.MODEL_FIELD_MISSING, 1);
  assert.equal(result.responsibilityDiagnostics.FALLBACK_VERIFIED, 6);
  assert.equal(result.responsibilityDiagnostics.outcome, 'partial_valid');
  assert.ok(result.mainResponsibilities.every(item => item.supportingEvidence.length === 1));
});

test('badge colors are light, semantic and translated without modifying original quotations', () => {
  assert.deepEqual(badgeToneForPermit('Explicitly Available'),
    { background: '#dcfce7', color: '#166534', border: '#bbf7d0' });
  assert.deepEqual(badgeToneForPermit('Explicitly Unavailable'),
    { background: '#fee2e2', color: '#991b1b', border: '#fecaca' });
  assert.deepEqual(badgeToneForScore(60),
    { background: '#fef3c7', color: '#92400e', border: '#fde68a' });
  assert.equal(badgeColorsForAccent('#2563eb').background, '#e5ecfd');
  assert.equal(t('No Sponsorship', 'zh-CN'), '不提供签证担保');
  assert.equal(t('Work Permit / Sponsorship', 'zh-CN'), '工作许可／签证担保');
  const html = fs.readFileSync(new URL('../src/sidepanel/index.html', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../src/sidepanel/index.css', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /data-title-signal="sponsorship"/);
  assert.match(css, /\.permit-danger/);
  assert.match(css, /white-space: normal; overflow-wrap: anywhere/);
});

test('new cache summaries omit retired vacancy policy while preserving CV and prompt isolation', async () => {
  const saved = {};
  globalThis.chrome = { storage: { local: {
    get: async key => ({ [key]: saved[key] }),
    set: async values => Object.assign(saved, values),
    remove: async key => { delete saved[key]; },
  } } };
  const jd = { title: 'Engineer', description: 'We offer visa sponsorship for this role.', sourceType: 'indeed' };
  const current = { resumeHash: 'cv-A', scoringProfileHash: 'weights-A', modelKeyHash: 'model-A', promptVersion: 'v17' };
  const analysis = analyzeJobRequirements(jd, null);
  await CacheManager.saveResult('indeed-A', current, jd, {
    overallMatchPercent: 80, jobAnalysis: analysis, sponsorshipAssessment: { indRegistered: false },
    metadata: { analysisTimestamp: new Date().toISOString() },
  });
  const entry = await CacheManager.getEntry('indeed-A', current, { jdData: jd });
  assert.equal(entry.summary.jobAnalysis.workPermitSponsorship, undefined);
  assert.equal(entry.summary.kmEligible, false);
  assert.equal(await CacheManager.getEntry('indeed-A', { ...current, promptVersion: 'v16' }), null);
  assert.equal(await CacheManager.getEntry('indeed-A', { ...current, resumeHash: 'cv-B' }), null);
});

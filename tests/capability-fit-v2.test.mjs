import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreCapabilityEvidence,
  CAPABILITY_SCORE_VERSION, CAPABILITY_WEIGHTS } from '../src/shared/capability-fit.js';
import { analyzeJobRequirements } from '../src/shared/job-analysis.js';

const jd = {
  title: 'Junior ML Engineer',
  description: 'Build Python ML pipelines. Deliver production model experiments. Apply retail forecasting knowledge. One year of professional ML experience required. MSc in Data Science required. Adapt analytics methods to new business problems.',
};
const cv = 'Python and scikit-learn\nDelivered production model experiments\nRetail demand forecasting\nML Engineer, Acme, one year of professional ML experience\nMSc in Data Science\nAdapted analytics methods across business problems';
const profile = { experience: [{ title: 'ML Engineer', fieldEvidence: { title: 'ML Engineer, Acme, one year of professional ML experience', highlights: [] } }] };
const rows = [
  ['Technical Skills', 'Build Python ML pipelines', 'Python and scikit-learn'],
  ['Project & Responsibility Fit', 'Deliver production model experiments', 'Delivered production model experiments'],
  ['Domain Relevance', 'Apply retail forecasting knowledge', 'Retail demand forecasting'],
  ['Experience & Seniority', 'One year of professional ML experience required', 'one year of professional ML experience'],
  ['Education', 'MSc in Data Science required', 'MSc in Data Science'],
  ['Transferable Potential', 'Adapt analytics methods to new business problems', 'Adapted analytics methods across business problems'],
];
const matrix = (changes = {}) => ({ rubricVersion: CAPABILITY_SCORE_VERSION, extractionComplete: true,
  requirements: rows.map(([dimension, jdQuote, resumeQuote]) => ({ dimension, jdSource: 'JD Body', jdQuote,
    resumeQuotes: [resumeQuote], status: 'met', importance: 'required', hard: dimension === 'Experience & Seniority',
    reason: `${dimension} supported by the current CV.` })), ...changes });

test('Junior ML fit uses all six fixed weights with one selected CV profile', () => {
  const scored = scoreCapabilityEvidence(matrix(), jd, cv, profile);
  assert.equal(scored.overallMatchPercent, 100);
  assert.deepEqual(scored.rubric.weights, CAPABILITY_WEIGHTS);
  assert.equal(scored.rubric.version, CAPABILITY_SCORE_VERSION);
  assert.equal(scored.matchBreakdown.length, 6);
});

test('cross-domain transferable work gets partial credit and cannot duplicate full credit', () => {
  const changed = matrix();
  changed.requirements[2].status = 'transferable';
  changed.requirements[2].resumeQuotes = ['Adapted analytics methods across business problems'];
  changed.requirements[2].reason = 'Analytics methods transfer to retail, but retail context is unproven.';
  changed.requirements[5].resumeQuotes = ['Adapted analytics methods across business problems'];
  const scored = scoreCapabilityEvidence(changed, jd, cv, profile);
  assert.ok(scored.overallMatchPercent < 90);
  assert.equal(scored.rubric.requirements[5].status, 'transferable');
  assert.ok(scored.validationWarnings.some(value => value.includes('reused')));
});

test('several years of mandatory commercial experience cannot be met by a study project', () => {
  const experiencedJD = { ...jd, description: jd.description.replace('One year of professional ML experience required',
    'At least 5 years of professional ML experience required') };
  const changed = matrix();
  changed.requirements[3].jdQuote = 'At least 5 years of professional ML experience required';
  changed.requirements[3].resumeQuotes = ['MSc in Data Science'];
  const scored = scoreCapabilityEvidence(changed, experiencedJD, cv, { experience: [] });
  assert.equal(scored.rubric.requirements[3].status, 'transferable');
  assert.equal(scored.rubric.scoreCap, 59);
  assert.ok(scored.overallMatchPercent <= 59);
});

test('explicit one year of professional work cannot satisfy five required years', () => {
  const experiencedJD = { ...jd, description: jd.description.replace('One year of professional ML experience required',
    'At least 5 years of professional ML experience required') };
  const shortCv = cv.replaceAll('one year of professional ML experience', '1 year of professional ML experience');
  const shortProfile = { experience: [{ fieldEvidence: { title: 'ML Engineer, Acme, 1 year of professional ML experience' } }] };
  const changed = matrix();
  changed.requirements[3].jdQuote = 'At least 5 years of professional ML experience required';
  changed.requirements[3].resumeQuotes = ['1 year of professional ML experience'];
  const scored = scoreCapabilityEvidence(changed, experiencedJD, shortCv, shortProfile);
  assert.equal(scored.rubric.requirements[3].status, 'partial');
  assert.equal(scored.rubric.scoreCap, 74);
});

test('missing dimensions and unverifiable CV evidence never renormalize toward 100', () => {
  const changed = matrix({ requirements: [matrix().requirements[0], { ...matrix().requirements[1], resumeQuotes: ['Invented project'] }] });
  const scored = scoreCapabilityEvidence(changed, jd, cv, profile);
  assert.equal(scored.overallMatchPercent, 30);
  assert.equal(scored.rubric.requirements[1].status, 'unknown');
  assert.equal(scored.rubric.evidenceCoverage, 30);
});

test('capability evidence is bound to the selected CV original text and work profile', () => {
  const otherCv = 'Java backend APIs and logistics process mapping';
  const scored = scoreCapabilityEvidence(matrix(), jd, otherCv, { experience: [] });
  assert.equal(scored.overallMatchPercent, 0);
  assert.ok(scored.rubric.requirements.every(item => item.status === 'unknown'));
});

test('legacy Dutch requirement metadata does not generate candidate eligibility', () => {
  const xebia = { title: 'AI Engineer', description: 'Fluent Dutch is required for this role.' };
  const jobAnalysis = analyzeJobRequirements(xebia, { requiredLanguages: { relation: 'None', items: [{
    language: 'Dutch', requirementType: 'Mandatory', minimumProficiency: 'Fluent', supportingEvidence: ['Fluent Dutch is required for this role.'],
  }] } });
  assert.equal(jobAnalysis.applicationEligibility, undefined);
  assert.equal(jobAnalysis.requiredLanguages.items[0].minimumProficiency, undefined);
});

test('Flynth RAG and Agentic AI gap stays in capability while unspecified sponsorship needs verification', () => {
  const flynth = { title: 'AI Engineer', description: 'Build RAG and Agentic AI applications for accounting clients.' };
  const flynthCv = 'Developed Python NLP applications and search prototypes';
  const scored = scoreCapabilityEvidence({ rubricVersion: CAPABILITY_SCORE_VERSION, extractionComplete: true,
    requirements: [{ dimension: 'Technical Skills', importance: 'required', jdSource: 'JD Body', jdQuote: 'Build RAG and Agentic AI applications',
      resumeQuotes: ['Developed Python NLP applications and search prototypes'], status: 'transferable', hard: false,
      reason: 'NLP and search transfer, but RAG and agent workflows are not documented.' }] }, flynth, flynthCv);
  assert.equal(scored.overallMatchPercent, 11);
  assert.equal(scored.applicationEligibility, undefined);
});

test('old cached scores stay in history but cannot be presented as current holistic scores', () => {
  const worker = readFileSync(new URL('../src/background/service-worker.js', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../src/sidepanel/app.js', import.meta.url), 'utf8');
  const content = readFileSync(new URL('../src/content/index.js', import.meta.url), 'utf8');
  assert.match(worker, /entry\.summary\?\.capabilityScoreVersion === HOLISTIC_SCORE_VERSION/);
  assert.match(panel, /result\.metadata\?\.capabilityScoreVersion === HOLISTIC_SCORE_VERSION/);
  assert.match(panel, /Legacy score; re-analyze to calculate Capability Fit/);
  assert.doesNotMatch(panel, /status === 'Hard Block'/);
  assert.match(panel, /buildUnifiedAnalysisHtml\(result, resolveOriginalJD\(result\)\)/);
  assert.match(content, /entry\?\.capabilityScoreVersion === HOLISTIC_SCORE_VERSION/);
  assert.doesNotMatch(content, /entry\.eligibilityStatus === 'Hard Block'/);
});

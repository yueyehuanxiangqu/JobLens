import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateHolisticAssessment, HOLISTIC_SCORE_VERSION } from '../src/shared/holistic-match.js';
import { normalizeProfileLanguages } from '../src/shared/resume-document.js';
import { analyzeJobRequirements } from '../src/shared/job-analysis.js';
import { normalizeTitleDisplaySettings } from '../src/shared/constants.js';
import { buildCacheContext } from '../src/shared/scoring-profile.js';

const jd = { title: 'Junior ML Engineer', description: 'Build RAG applications for finance clients. Dutch C1 is required.' };
const cv = 'Built Python NLP search prototypes. Dutch: Beginner, actively learning.';
const assessment = () => ({ rubricVersion: HOLISTIC_SCORE_VERSION, extractionComplete: true,
  capabilityAssessment: { score: 72, scoreReason: 'NLP work transfers to RAG, but production delivery is unproven.',
    strengths: [{ claim: 'NLP search is relevant but not equivalent.', evidenceKind: 'Inferred',
      jdSource: 'JD Body', jdQuote: 'Build RAG applications', cvQuotes: ['Built Python NLP search prototypes'] }],
    risks: [{ claim: 'Production RAG delivery is not documented.', evidenceKind: 'Unknown',
      jdSource: 'JD Body', jdQuote: 'Build RAG applications', cvQuotes: [] }] } });

test('AI holistic score survives unchanged without a six-dimension matrix', () => {
  const scored = validateHolisticAssessment(assessment(), jd, cv);
  assert.equal(scored.overallMatchPercent, 72);
  assert.deepEqual(scored.matchBreakdown, []);
  assert.equal(scored.rubric.version, HOLISTIC_SCORE_VERSION);
  assert.equal(scored.rubric.strengths[0].evidenceKind, 'Inferred');
  assert.equal(scored.rubric.strengths[0].cvQuotes[0], 'Built Python NLP search prototypes');
  assert.equal(scored.unknowns.length, 1);
});

test('bad score range and invented source quotations cannot yield a valid v3 result', () => {
  const outside = assessment();
  outside.capabilityAssessment.score = 101;
  assert.throws(() => validateHolisticAssessment(outside, jd, cv), /missing or invalid/);
  const invented = assessment();
  invented.capabilityAssessment.strengths[0].cvQuotes = ['Production RAG platform'];
  invented.capabilityAssessment.risks = [];
  assert.throws(() => validateHolisticAssessment(invented, jd, cv), /No JD\/CV evidence/);
});

test('a complete long explanation is preserved and its language quality is reported separately', () => {
  const complete = assessment();
  complete.capabilityAssessment.scoreReason = `${'Relevant documented project work supports this role. '.repeat(13)}The production gap remains unverified.`;
  assert.ok(complete.capabilityAssessment.scoreReason.length > 500);
  const scored = validateHolisticAssessment(complete, jd, cv, 'en');
  assert.equal(scored.rubric.scoreReason, complete.capabilityAssessment.scoreReason);
  assert.equal(scored.rubric.explanationQuality.status, 'verified');
  complete.capabilityAssessment.scoreReason = 'Relevant projects exist, rather than pr';
  const incomplete = validateHolisticAssessment(complete, jd, cv, 'en');
  assert.equal(incomplete.overallMatchPercent, 72);
  assert.deepEqual(incomplete.rubric.explanationQuality.issues, ['SUMMARY_POSSIBLY_INCOMPLETE']);
  complete.capabilityAssessment.scoreReason = 'Relevant projects exist, but scope remains unclear.';
  const wrongLanguage = validateHolisticAssessment(complete, jd, cv, 'zh-CN');
  assert.equal(wrongLanguage.overallMatchPercent, 72);
  assert.ok(wrongLanguage.rubric.explanationQuality.issues.includes('SUMMARY_LANGUAGE_MISMATCH'));
  complete.capabilityAssessment.scoreReason = '项目经验相关，但交付范围尚不明确。';
  complete.capabilityAssessment.strengths[0].claim = '相关 NLP 项目经验可迁移。';
  complete.capabilityAssessment.risks[0].claim = '缺少生产环境交付证据。';
  assert.equal(validateHolisticAssessment(complete, jd, cv, 'zh-CN').rubric.scoreReason,
    complete.capabilityAssessment.scoreReason);
});

test('Chinese explanation accepts English technology names and exact English JD/CV quotations', () => {
  const mixed = assessment();
  mixed.capabilityAssessment.scoreReason = '候选人用 Python 和 Docker 交付过 NLP 搜索原型，具备相关基础。JD 的 Azure 与 RAG 生产部署经验仍缺少直接证据。';
  mixed.capabilityAssessment.strengths[0].claim = 'Python NLP 搜索经验与 RAG 应用有一定可迁移性。';
  mixed.capabilityAssessment.risks[0].claim = 'Azure 生产部署和 RAG 交付范围尚未核实。';
  const scored = validateHolisticAssessment(mixed, jd, cv, 'zh-CN');
  assert.equal(scored.overallMatchPercent, 72);
  assert.equal(scored.rubric.explanationQuality.status, 'verified');
  assert.equal(scored.rubric.explanationQuality.languageVerified, true);
  assert.equal(scored.rubric.strengths[0].jdQuote, 'Build RAG applications');
  assert.equal(scored.rubric.strengths[0].cvQuotes[0], 'Built Python NLP search prototypes');
  mixed.capabilityAssessment.scoreReason = '相关经验支持本岗位，但范围仍需核实。"Build RAG applications for finance clients."';
  assert.equal(validateHolisticAssessment(mixed, jd, cv, 'zh-CN').rubric.explanationQuality.languageVerified, true);
});

test('missing explanation is a review issue, while an invalid score or all-invalid evidence still fails', () => {
  const missing = assessment();
  delete missing.capabilityAssessment.scoreReason;
  const scored = validateHolisticAssessment(missing, jd, cv, 'en');
  assert.equal(scored.overallMatchPercent, 72);
  assert.ok(scored.rubric.explanationQuality.issues.includes('SUMMARY_MISSING'));
  missing.capabilityAssessment.score = 140;
  assert.throws(() => validateHolisticAssessment(missing, jd, cv, 'en'), /missing or invalid/);
  const badEvidence = assessment();
  badEvidence.capabilityAssessment.strengths[0].cvQuotes = ['Invented work experience'];
  badEvidence.capabilityAssessment.risks = [];
  assert.throws(() => validateHolisticAssessment(badEvidence, jd, cv, 'zh-CN'), /No JD\/CV evidence/);
});

test('CV language levels are canonical, paired with their own quotes, and isolated', () => {
  const source = 'English (Proficient)\nDutch: Beginner, actively learning\nMandarin (Native)\nFrench B2';
  const levels = normalizeProfileLanguages([
    { language: 'English', level: 'Proficient' },
    { language: 'Dutch', level: 'Beginner', sourceQuotes: ['Dutch: Proficient'] },
    { language: 'Mandarin', level: 'Native' }, { language: 'French', level: 'B2' },
    { language: 'German', level: 'Proficient', sourceQuotes: ['English (Proficient)'] },
  ], source);
  assert.deepEqual(levels.map(item => item.level), ['Proficient', 'Beginner', 'Native', 'Intermediate', 'Unknown']);
  assert.match(levels[1].sourceQuotes[0], /Dutch: Beginner/);
  assert.equal(levels[3].reportedLevel, 'B2');
  assert.equal(levels[4].sourceQuotes.length, 0);
});

test('legacy language metadata remains readable without candidate comparison', () => {
  const profile = normalizeProfileLanguages([{ language: 'Dutch', level: 'Beginner' }], 'Dutch: Beginner, actively learning');
  const required = analyzeJobRequirements(jd, { requiredLanguages: { relation: 'None', items: [{
    language: 'Dutch', requirementType: 'Mandatory', minimumProficiency: 'C1',
    supportingEvidence: ['Dutch C1 is required.'],
  }] } });
  assert.equal(required.applicationEligibility, undefined);
  const alternative = { ...required, requiredLanguages: { relation: 'OR', items: [
    required.requiredLanguages.items[0], { language: 'English', requirementType: 'Mandatory', minimumProficiency: 'B2', supportingEvidence: ['English B2'] },
  ] } };
  assert.equal(alternative.requiredLanguages.relation, 'OR');
  assert.equal(profile[0].level, 'Beginner');
  const learning = analyzeJobRequirements({ title: 'Engineer', description: 'Willing to learn Dutch is preferred.' }, {
    requiredLanguages: { relation: 'None', items: [{ language: 'Dutch', requirementType: 'Preferred', minimumProficiency: null,
      supportingEvidence: ['Willing to learn Dutch is preferred.'] }] },
  });
  assert.equal(learning.requiredLanguages.items[0].requirementType, 'Preferred');
  const preferredFluency = analyzeJobRequirements({ title: 'Engineer', description: 'Fluent Dutch is preferred for client work.' }, null);
  assert.equal(preferredFluency.requiredLanguages.items.find(item => item.language === 'Dutch')?.requirementType, 'Preferred');
  assert.equal(preferredFluency.applicationRecommendation, undefined);
});

test('title controls show only requested signals while saved keyword preferences survive normalization', () => {
  const content = readFileSync(new URL('../src/content/index.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../src/sidepanel/index.html', import.meta.url), 'utf8');
  assert.match(content, /const label = `\$\{Math\.round\(score\)\}%`/);
  assert.doesNotMatch(content, /const label = t\(`\$\{Math\.round\(score\)\}% match`\)/);
  assert.doesNotMatch(html, /data-jd-keyword|setting-title-signal-keyword/);
  assert.doesNotMatch(html, /setting-title-signal-jdLanguage|setting-title-signal-experience/);
  const saved = normalizeTitleDisplaySettings({ keywordList: ['SQL'], visibleSignals: { keyword: true, km: false } });
  assert.deepEqual(saved.keywordList, ['SQL']);
  assert.equal(saved.visibleSignals.km, false);
  const panel = readFileSync(new URL('../src/sidepanel/app.js', import.meta.url), 'utf8');
  assert.match(panel, /keywordList: existing\.keywordList/);
});

test('v19 cache identity ignores archived weight controls but keeps the prompt version', async () => {
  const base = { provider: 'gemini', modelId: 'example', baseUrl: 'https://example.test', analysisPreset: 'balanced' };
  const first = await buildCacheContext({ ...base, useCustomWeights: false }, 'cv-hash', 'v19');
  const changedLegacyWeights = await buildCacheContext({ ...base, useCustomWeights: true,
    customWeights: { 'Skills & Experience Relevance': 1 } }, 'cv-hash', 'v19');
  const old = await buildCacheContext(base, 'cv-hash', 'v18');
  assert.equal(first.scoringProfileHash, changedLegacyWeights.scoringProfileHash);
  assert.notEqual(first.scoringProfileHash, old.scoringProfileHash);
});

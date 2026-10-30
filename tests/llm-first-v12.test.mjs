import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { analyzeJobRequirements } from '../src/shared/job-analysis.js';
import { validateJobAnalysisShape } from '../src/shared/job-analysis-schema.js';
import { scoreEvidence } from '../src/shared/evidence-scoring.js';
import { normalizeResumeData, buildResumeAnalysisText } from '../src/shared/resume-document.js';
import { saveResumeProfile, loadPersistentResume, selectResumeProfile } from '../src/background/resume-manager.js';
import { buildCacheContext, buildScoringProfile } from '../src/shared/scoring-profile.js';
import { normalizeCandidatePreferences } from '../src/shared/candidate-preferences.js';
import { t } from '../src/i18n/index.js';

const quote = (source, text) => ({ source, quote: text });
const jobModel = (overrides = {}) => ({
  schemaVersion: 'job-analysis-v5', jdLanguage: 'English', jdLanguageEvidence: [quote('JD Body', 'Build software.')],
  careerLevel: { level: 'Unknown', reasons: [], supportingEvidence: [], conflictingEvidence: [] },
  requiredLanguages: { relation: 'None', items: [] },
  experienceRequirements: { items: [], acceptedAlternatives: [] },
  workPermitSponsorship: { status: 'Not Specified', reason: '', supportingEvidence: [] },
  mainResponsibilities: [], requiredSkills: [], preferredSkills: [], domainKnowledge: [], otherMandatoryRequirements: [],
  ...overrides,
});

test('title-only Dutch speaking is sourced to Job Title, while JD language remains English', () => {
  const jd = { title: 'Traineeship AI & Innovation (Dutch speaking)', description: 'Build software. Work with data teams.' };
  const model = jobModel({ requiredLanguages: { relation: 'None', items: [{ language: 'Dutch', requirementType: 'Mandatory',
    supportingEvidence: [quote('Job Title', 'Dutch speaking')] }] },
    careerLevel: { level: 'New Graduate', reasons: ['Traineeship role.'], supportingEvidence: [quote('Job Title', 'Traineeship')], conflictingEvidence: [] } });
  const result = analyzeJobRequirements(jd, model);
  assert.equal(result.jdLanguage, 'English');
  assert.equal(result.requiredLanguages.items[0].requirementType, 'Mandatory');
  assert.deepEqual(result.requiredLanguages.items[0].evidenceSources, [quote('Job Title', 'Dutch speaking')]);
  assert.equal(result.eligibilityWarnings, undefined);
  assert.equal(result.careerLevel.level, 'New Graduate');
});

test('English of does not create OR; explicit Dutch OR remains OR', () => {
  const jd = { title: 'Engineer', description: 'Knowledge of Dutch and English is required.' };
  const q = quote('JD Body', jd.description);
  const result = analyzeJobRequirements(jd, jobModel({ requiredLanguages: { relation: 'OR', items: [
    { language: 'Dutch', requirementType: 'Mandatory', supportingEvidence: [q] },
    { language: 'English', requirementType: 'Mandatory', supportingEvidence: [q] },
  ] } }));
  assert.equal(result.requiredLanguages.relation, 'AND');
  assert.equal(result.eligibilityWarnings, undefined);
  const dutch = analyzeJobRequirements({ title: 'Engineer', description: 'Nederlands of Engels vereist.' },
    jobModel({ requiredLanguages: { relation: 'OR', items: [
      { language: 'Dutch', requirementType: 'Mandatory', supportingEvidence: [quote('JD Body', 'Nederlands of Engels vereist.')] },
      { language: 'English', requirementType: 'Mandatory', supportingEvidence: [quote('JD Body', 'Nederlands of Engels vereist.')] },
    ] } }));
  assert.equal(dutch.requiredLanguages.relation, 'OR');
});

test('AI year range wins when evidenced; benefit decimal and unspecified years do not become experience', () => {
  const description = 'You have 1-3 years of relevant experience. Salary rises within 1,5 jaar.';
  const result = analyzeJobRequirements({ title: 'Junior Engineer', description }, jobModel({
    experienceRequirements: { items: [
      { minimumYears: 1, maximumYears: 3, requirementType: 'Mandatory', experienceKind: 'Professional',
        supportingEvidence: [quote('JD Body', 'You have 1-3 years of relevant experience.')] },
      { minimumYears: 1.5, maximumYears: null, requirementType: 'Mandatory',
        supportingEvidence: [quote('JD Body', 'Salary rises within 1,5 jaar.')] },
    ], acceptedAlternatives: [] },
  }));
  assert.equal(result.experienceRequirements.items.length, 1);
  assert.equal(result.experienceRequirements.items[0].minimumYears, 1);
  assert.equal(result.experienceRequirements.items[0].maximumYears, 3);
  const absent = analyzeJobRequirements({ title: 'Graduate', description: 'Build software. Salary rises within 1,5 jaar.' },
    jobModel({ experienceRequirements: { items: [], acceptedAlternatives: [] } }));
  assert.deepEqual(absent.experienceRequirements.items, []);
  assert.notEqual(absent.careerLevel.level, 'Experienced');
});

test('model and local experience disagreement is flagged instead of silently replacing the model', () => {
  const jd = { title: 'Engineer', description: 'At least 5 years of professional experience required. Build software.' };
  const result = analyzeJobRequirements(jd, jobModel({ experienceRequirements: { items: [], acceptedAlternatives: [] } }));
  assert.equal(result.reviewNeeded, true);
  assert.equal(result.experienceRequirements.reviewNeeded, true);
  assert.deepEqual(result.experienceRequirements.items, []);
  assert.notEqual(result.careerLevel.level, 'Experienced');
});

test('AI identifies Chinese prose despite English technical terms, and missing requirements stay absent', () => {
  const jd = { title: '软件工程师', description: '负责 Python、AI、LLM、SQL 和 Machine Learning 平台开发。' };
  const model = jobModel({ jdLanguage: 'Chinese', jdLanguageEvidence: [quote('JD Body', jd.description)] });
  const result = analyzeJobRequirements(jd, model);
  assert.equal(result.jdLanguage, 'Chinese');
  assert.deepEqual(result.requiredLanguages.items, []);
  assert.deepEqual(result.experienceRequirements.items, []);
  assert.equal(result.careerLevel.level, 'Unknown');
});

test('career and work summary require semantically relevant source quotes', () => {
  const jd = { title: 'Young Professional AI Engineer', description: 'Build AI services. 26 vakantiedagen binnen 1,5 jaar.' };
  const result = analyzeJobRequirements(jd, jobModel({
    careerLevel: { level: 'New Graduate', reasons: ['Early career track'], supportingEvidence: [quote('Job Title', 'Young Professional')], conflictingEvidence: [] },
    mainResponsibilities: [
      { mode: 'summarize', summary: 'Build AI services', supportedClaims: [{ claim: 'Build AI services', supportingEvidence: [quote('JD Body', 'Build AI services.')] }],
        supportingEvidence: [quote('JD Body', 'Build AI services.')] },
      { mode: 'summarize', summary: 'Manage a team', supportedClaims: [{ claim: 'Manage a team', supportingEvidence: [quote('JD Body', 'not present')] }],
        supportingEvidence: [quote('JD Body', 'not present')] },
    ],
  }));
  assert.equal(result.careerLevel.level, 'New Graduate');
  assert.deepEqual(result.careerLevel.evidenceSources, [quote('Job Title', 'Young Professional')]);
  assert.equal(result.mainResponsibilities.length, 1);
  assert.equal(result.mainResponsibilities[0].label, 'Build AI services');
  assert.ok(validateJobAnalysisShape(jobModel()).length, 'legacy wire shape is not the new required contract');
  assert.ok(validateJobAnalysisShape({}).length > 0);
});

test('AI summary cannot give full credit for a capability absent from original CV', () => {
  const raw = { rubricVersion: 'evidence-v1', extractionComplete: true, requirements: [{
    dimension: 'Skills & Experience Relevance', importance: 'required', status: 'met', hard: false,
    jdQuote: 'Kubernetes', resumeQuotes: ['Kubernetes'], reason: 'Profile says Kubernetes.',
  }] };
  const profile = buildScoringProfile({ includeSponsorshipInScore: false }, false);
  const composite = 'STRUCTURED RESUME PROFILE (resume-v2)\nSkills: Kubernetes\nEXACT EXTRACTED RESUME SOURCE (use this section for quotation verification)\nPython';
  const scored = scoreEvidence(raw, { description: 'Kubernetes is required.' }, composite, profile, 'Python');
  assert.equal(scored.overallMatchPercent, 0);
  assert.equal(scored.rubric.requirements[0].status, 'unknown');
});

test('CV capabilities keep only source-backed quotes and mark unsupported inferences', () => {
  const cv = 'Built a ROS robot navigation pipeline using Python.';
  const data = normalizeResumeData({ capabilities: [
    { capability: 'Robotics system integration', contribution: 'Built navigation pipeline', sourceQuotes: ['Built a ROS robot navigation pipeline'] },
    { capability: 'Kubernetes administration', sourceQuotes: ['Kubernetes'] },
  ] }, cv);
  assert.equal(data.capabilities[0].status, 'Verified');
  assert.equal(data.capabilities[1].status, 'Inferred / Unverified');
  assert.deepEqual(data.capabilities[1].sourceQuotes, []);
  assert.match(buildResumeAnalysisText(data, cv), /ORIGINAL|EXACT EXTRACTED RESUME SOURCE/);
});

test('only current CV user-confirmed languages can earn credit and Unknown cannot', () => {
  const pref = normalizeCandidatePreferences({ languages: [{ language: 'Dutch', level: 'B2' }], willingToRelocateWithinNetherlands: 'Unknown' });
  const profile = { ...buildScoringProfile({ candidatePreferences: pref, includeSponsorshipInScore: false }, false),
    profileLanguages: [{ language: 'Dutch', level: 'B2', source: 'user-confirmed' }] };
  const raw = { rubricVersion: 'evidence-v1', extractionComplete: true, requirements: [{
    dimension: 'Language & Location', importance: 'required', status: 'met', hard: false,
    jdQuote: 'Dutch B2 required', resumeQuotes: [], profileQuote: 'Language: Dutch — Intermediate (B2)', reason: 'User confirmed B2.',
  }] };
  const result = scoreEvidence(raw, { description: 'Dutch B2 required.' }, 'Python engineer.', profile, 'Python engineer.');
  assert.equal(result.overallMatchPercent, 100);
  assert.equal(result.rubric.requirements[0].evidenceSource, 'User-confirmed Profile Data');
  const unknown = scoreEvidence({ ...raw, requirements: [{ ...raw.requirements[0], profileQuote: 'Language: Dutch — Unknown' }] },
    { description: 'Dutch B2 required.' }, 'Python engineer.',
    { ...profile, profileLanguages: [{ language: 'Dutch', level: 'Unknown', source: 'user-confirmed' }] });
  assert.equal(unknown.overallMatchPercent, 0);
  const legacyGlobal = scoreEvidence(raw, { description: 'Dutch B2 required.' }, 'Python engineer.',
    buildScoringProfile({ candidatePreferences: { languages: [{ language: 'Dutch', level: 'B2' }] }, includeSponsorshipInScore: false }, false), 'Python engineer.');
  assert.equal(legacyGlobal.overallMatchPercent, 0);
});

test('stored CV Profile is reused and changing active CV changes analysis identity', async () => {
  const values = {};
  globalThis.chrome = { storage: { local: {
    get: async key => Array.isArray(key) ? Object.fromEntries(key.map(name => [name, values[name]])) : { [key]: values[key] },
    set: async update => Object.assign(values, update),
    remove: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key]; },
  } } };
  const first = await saveResumeProfile({ sourceText: 'Python engineering projects. Built a robot.', structuredData: { schemaVersion: 'resume-v2', skills: ['Python'] } });
  const firstLoaded = await loadPersistentResume();
  assert.equal(firstLoaded.hash, first.activeResume.hash);
  const second = await saveResumeProfile({ sourceText: 'Java backend work. Built web services.', structuredData: { schemaVersion: 'resume-v2', skills: ['Java'] } });
  assert.notEqual(second.activeResume.hash, firstLoaded.hash);
  await selectResumeProfile(first.activeResume.id);
  assert.equal((await loadPersistentResume()).hash, firstLoaded.hash);
  const model = { provider: 'gemini', baseUrl: 'https://example.test', modelId: 'gemini' };
  const firstContext = await buildCacheContext(model, firstLoaded.hash, 'v12');
  const secondContext = await buildCacheContext(model, second.activeResume.hash, 'v12');
  assert.notEqual(firstContext.resumeHash, secondContext.resumeHash);
  assert.notEqual(firstContext.scoringProfileHash, (await buildCacheContext(model, firstLoaded.hash, 'v11')).scoringProfileHash);
  assert.equal(firstContext.scoringProfileHash, (await buildCacheContext({ ...model, candidatePreferences: { languages: [{ language: 'Dutch', level: 'B2' }] } }, firstLoaded.hash, 'v12')).scoringProfileHash);
  assert.notEqual(firstContext.modelKeyHash, (await buildCacheContext({ ...model, modelId: 'another-model' }, firstLoaded.hash, 'v12')).modelKeyHash);
  const replaced = await saveResumeProfile({ id: first.activeResume.id, sourceText: 'Rust embedded systems and sensor firmware.' });
  assert.notEqual(replaced.profile.hash, firstLoaded.hash);
  assert.equal(replaced.profile.structuredData.skills.includes('Python'), false);
});

test('bilingual work summary and white-on-color career labels are present in side panel', () => {
  const html = readFileSync(new URL('../src/sidepanel/index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/sidepanel/index.css', import.meta.url), 'utf8');
  assert.equal(t("What You'll Do", 'zh-CN'), '岗位做什么');
  assert.doesNotMatch(html, /setting-candidate-languages/);
  assert.match(html, /setting-relocation/);
  assert.match(css, /career-level-amber[^}]*color: #fff/);
  assert.match(css, /font-size: 15px/);
});

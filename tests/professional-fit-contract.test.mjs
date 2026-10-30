import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { JOB_ANALYSIS_SCHEMA_VERSION, validateJobAnalysisShape } from '../src/shared/job-analysis-schema.js';
import { HOLISTIC_RESPONSE_SCHEMA, validateHolisticAssessment } from '../src/shared/holistic-match.js';
import { dutchRequirementStatus } from '../src/shared/career-level-display.js';
import { analyzeJobRequirements } from '../src/shared/job-analysis.js';
import { buildHolisticMatchingPrompt } from '../src/prompts/holistic-match-prompt.js';

const wire = extra => ({ schemaVersion: JOB_ANALYSIS_SCHEMA_VERSION,
  careerLevel: { level: 'Unknown', reasons: [], supportingEvidence: [], conflictingEvidence: [] },
  dutchRequirement: { status: 'Not Specified', relation: 'None', reason: '', supportingEvidence: [] },
  experienceRequirements: { items: [], acceptedAlternatives: [] }, mainResponsibilities: [], ...extra });
const evidence = (quote, source = 'JD Body') => ({ source, quote });

test('request schema covers every consumed JD field without eligibility, permit decisions or language levels', () => {
  const schema = HOLISTIC_RESPONSE_SCHEMA;
  assert.ok(schema.required.includes('jobAnalysis'));
  assert.deepEqual(schema.properties.jobAnalysis.required,
    ['schemaVersion', 'careerLevel', 'dutchRequirement', 'experienceRequirements', 'mainResponsibilities']);
  const serialized = JSON.stringify(schema);
  assert.doesNotMatch(serialized, /minimumProficiency|applicationEligibility|workPermitSponsorship|recommendation|penalty|capLimit/);
  assert.deepEqual(validateJobAnalysisShape(wire()), []);
  const missing = wire(); delete missing.dutchRequirement;
  assert.ok(validateJobAnalysisShape(missing).some(message => message.includes('dutchRequirement missing')));
  const absent = analyzeJobRequirements({ description: 'Build software.' }, missing);
  const explicitNone = analyzeJobRequirements({ description: 'Build software.' }, wire());
  assert.equal(absent.dutchRequirement.status, 'Unknown');
  assert.equal(absent.dutchRequirement.missing, true);
  assert.equal(explicitNone.dutchRequirement.status, 'Not Specified');
  assert.equal(explicitNone.dutchRequirement.missing, false);
  assert.equal(explicitNone.responsibilityDiagnostics.MODEL_FIELD_MISSING, 0);
});

test('AI Dutch obligation retains exact body/title evidence, AND/OR and exceptions without CV comparison', () => {
  const cases = [
    ['Uitstekende beheersing van de Nederlandse taal in woord en geschrift.', 'Mandatory', 'None', 'Mandatory'],
    ['Dutch and English are required.', 'Mandatory', 'AND', 'Mandatory'],
    ['Dutch or English is required.', 'Mandatory', 'OR', 'Optional'],
    ['Dutch is preferred.', 'Preferred', 'None', 'Preferred'],
    ['You can learn Dutch after joining.', 'Optional', 'None', 'Optional'],
    ['Wij zoeken een data engineer voor ons team.', 'Not Specified', 'None', 'Not Specified'],
  ];
  for (const [description, status, relation, expected] of cases) {
    const result = analyzeJobRequirements({ title: 'Engineer', description }, wire({
      dutchRequirement: { status, relation, reason: '', supportingEvidence: status === 'Not Specified' ? [] : [evidence(description)] },
    }));
    assert.equal(result.dutchRequirement.status, expected);
    assert.equal(result.applicationEligibility, undefined);
    assert.equal(result.requiredLanguages.items[0]?.minimumProficiency, undefined);
  }
  const title = 'Data Engineer (Dutch-speaking / Nederlandstalig)';
  const titleResult = analyzeJobRequirements({ title, description: 'Build data pipelines.' }, wire({
    dutchRequirement: { status: 'Mandatory', relation: 'None', reason: '', supportingEvidence: [evidence(title, 'Job Title')] },
  }));
  assert.equal(titleResult.dutchRequirement.status, 'Mandatory');
  assert.equal(titleResult.dutchRequirement.evidenceSources[0].source, 'Job Title');
  const forged = analyzeJobRequirements({ title: 'Engineer', description: 'Build software.' }, wire({
    dutchRequirement: { status: 'Mandatory', relation: 'None', reason: '', supportingEvidence: [evidence('Fluent Dutch required.')] },
  }));
  assert.equal(forged.dutchRequirement.status, 'Unknown');
});

test('career and localized duties use verified source evidence; Unknown is not inferred from a title', () => {
  const description = 'Je ontwikkelt AI-modellen voor klanten.';
  const result = analyzeJobRequirements({ title: 'Senior AI Engineer', description }, wire({
    careerLevel: { level: 'Senior', reasons: ['Senior role.'], supportingEvidence: [evidence('Senior AI Engineer', 'Job Title')], conflictingEvidence: [] },
    mainResponsibilities: [{ summary: description, displayText: '为客户开发 AI 模型。', displayLanguage: 'zh-CN', supportingEvidence: [evidence(description)] }],
  }), null, 'zh-CN');
  assert.equal(result.careerLevel.level, 'Senior');
  assert.equal(result.mainResponsibilities[0].displayText, '为客户开发 AI 模型。');
  assert.deepEqual(result.mainResponsibilities[0].supportingEvidence, [description]);
  assert.equal(analyzeJobRequirements({ title: 'Senior Engineer', description }, wire()).careerLevel.level, 'Unknown');
});

test('legacy cached AI scores are read untouched without recomputing or exposing eligibility summaries', () => {
  const source = readFileSync(new URL('../src/background/service-worker.js', import.meta.url), 'utf8');
  const functions = source.slice(source.indexOf('function buildCachedResponse('), source.indexOf('function buildSavedPositionResponse('));
  const context = vm.createContext({ HOLISTIC_SCORE_VERSION: 'capability-v3', MATCH_PROMPT_VERSION: 'v21',
    dutchRequirementStatus,
    normalizeTitleDisplaySettings: () => ({ keywordList: [] }), normalizeSourceType: value => value,
    findKeywordMatches: () => [] });
  vm.runInContext(`${functions}; this.read = buildCachedResponse;`, context);
  const data = { overallMatchPercent: 68, metadata: { capabilityScoreVersion: 'capability-v3' },
    jobAnalysis: { requiredLanguages: { relation: 'OR', items: [{ language: 'Dutch', requirementType: 'Mandatory' }] } },
    applicationEligibility: { status: 'Hard Block' }, applicationRecommendation: 'Not Eligible' };
  const response = context.read({ jobId: 'A', promptVersion: 'v21', data, summary: { score: 68, capabilityScoreVersion: 'capability-v3',
    jobAnalysis: { version: 'career-v3', dutchRequirement: 'Mandatory' } } }, true);
  assert.equal(response.score, 68);
  assert.equal(response.eligibilityStatus, undefined);
  assert.equal(response.jobAnalysis.dutchRequirement, 'Optional');
  assert.equal(response.result, data, 'stored snapshots are not rewritten');
  assert.equal(data.applicationRecommendation, 'Not Eligible', 'historical fields remain stored');
});

test('a non-core point-array failure preserves a source-backed score; missing all evidence still rejects it', () => {
  const jd = { title: 'Engineer', description: 'Build SQL reporting.' };
  const source = 'Built SQL reporting for clients.';
  const raw = { rubricVersion: 'capability-v3', extractionComplete: true, capabilityAssessment: {
    score: 68, scoreReason: 'Relevant reporting work.', risks: null,
    strengths: [{ claim: 'Relevant SQL delivery.', evidenceKind: 'Direct', jdSource: 'JD Body',
      jdQuote: 'Build SQL reporting.', cvQuotes: [source] }],
  } };
  const valid = validateHolisticAssessment(raw, jd, source);
  assert.equal(valid.overallMatchPercent, 68);
  assert.ok(valid.validationWarnings.some(message => message.includes('risks')));
  assert.throws(() => validateHolisticAssessment({ ...raw,
    capabilityAssessment: { ...raw.capabilityAssessment, strengths: [] } }, jd, source), /No JD\/CV evidence/);
});

test('prompt and active renderers exclude candidate eligibility while retaining professional evidence', () => {
  const prompt = buildHolisticMatchingPrompt({ title: 'Engineer', description: 'Build software.' }, 'Current CV source', true,
    { profileLanguages: [{ language: 'Dutch', level: 'Beginner' }], includeSponsorshipInScore: true });
  assert.match(prompt.systemPrompt, /job-analysis-v6/);
  assert.match(prompt.systemPrompt, /Missing CV evidence means the CV does not demonstrate/);
  assert.doesNotMatch(prompt.userPrompt, /current-cv-profile-confirmed-languages|Candidate needs|location-preferences/);
  for (const file of ['../src/background/match-engine.js', '../src/background/service-worker.js', '../src/sidepanel/app.js', '../src/content/index.js']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /assessApplicationEligibility\(|buildCapabilityDecision\(|reconcileCachedEligibility\(/);
  }
});

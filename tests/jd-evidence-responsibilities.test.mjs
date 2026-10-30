import assert from 'node:assert/strict';
import test from 'node:test';
import { locateJdEvidence } from '../src/shared/jd-evidence.js';
import { analyzeJobRequirements } from '../src/shared/job-analysis.js';
import { validateJobAnalysisShape } from '../src/shared/job-analysis-schema.js';

const analyze = (description, mainResponsibilities, extra = {}) => analyzeJobRequirements({
  title: 'AI Engineer', description,
}, { mainResponsibilities, ...extra });
const work = (summary, ...quotes) => ({ summary,
  supportingEvidence: quotes.map(quote => ({ source: 'JD Body', quote })) });

test('evidence locator folds safe whitespace and canonical Unicode while returning the original JD span', () => {
  const source = 'Ontwikkelen van\u202fAI-applicaties en -agents\u00a0die\nbedrijfsprocessen ondersteunen;';
  const quote = 'Ontwikkelen van AI-applicaties en -agents die bedrijfsprocessen ondersteunen;';
  const found = locateJdEvidence(source, quote);
  assert.equal(found.ok, true);
  assert.equal(found.quote, source);
  assert.equal(source.slice(found.start, found.end), source);
  assert.equal(locateJdEvidence('Cafe\u0301 bouwen.', 'Café bouwen.').quote, 'Cafe\u0301 bouwen.');
  assert.equal(locateJdEvidence('Build  reliable\tservices.', 'Build reliable services.').quote,
    'Build  reliable\tservices.');
});

test('evidence locator refuses inventions, changed case/punctuation and paragraph stitching', () => {
  assert.equal(locateJdEvidence('Build reliable services.', 'Build reliable pipelines.').reason, 'QUOTE_NOT_FOUND');
  assert.equal(locateJdEvidence('Build reliable services.', 'build reliable services.').ok, false);
  assert.equal(locateJdEvidence('Build reliable services.', 'Build reliable services!').ok, false);
  assert.equal(locateJdEvidence('Build services.\n\nDeploy pipelines.', 'Build services. Deploy pipelines.').reason,
    'QUOTE_CROSSES_PARAGRAPH');
  assert.equal(locateJdEvidence('Build services.\n\nDeploy pipelines.', 'Build services.\n\nDeploy pipelines.').ok,
    false);
});

test('the same original JD quote is used for career, languages, experience and duties', () => {
  const jd = 'Junior role.\nMinimaal 1,5\u202fjaar werkervaring vereist.\nVloeiend Nederlands\u00a0is vereist.\nWat ga je doen?\nOntwikkelen van\u202fAI-applicaties die klanten helpen.';
  const result = analyze(jd, [work('Develop AI applications for clients.',
    'Ontwikkelen van AI-applicaties die klanten helpen.')], {
    careerLevel: { level: 'Junior', reasons: ['Junior role'], supportingEvidence: ['Junior role.'], conflictingEvidence: [] },
    requiredLanguages: { relation: 'None', items: [{ language: 'Dutch', requirementType: 'Mandatory',
      supportingEvidence: [{ source: 'JD Body', quote: 'Vloeiend Nederlands is vereist.' }] }] },
    experienceRequirements: { items: [{ minimumYears: 1.5, maximumYears: null, requirementType: 'Mandatory',
      supportingEvidence: [{ source: 'JD Body', quote: 'Minimaal 1,5 jaar werkervaring vereist.' }] }],
      acceptedAlternatives: [] },
  });
  assert.equal(result.mainResponsibilities[0].supportingEvidence[0],
    'Ontwikkelen van\u202fAI-applicaties die klanten helpen.');
  assert.equal(result.requiredLanguages.items[0].supportingEvidence[0], 'Vloeiend Nederlands\u00a0is vereist.');
  assert.equal(result.experienceRequirements.items[0].supportingEvidence[0],
    'Minimaal 1,5\u202fjaar werkervaring vereist.');
  assert.equal(result.careerLevel.level, 'Junior');
});

test('Flynth-like six duties survive narrow-space quoting and summarize into three evidenced work items', () => {
  const duties = [
    'Ontwikkelen van\u202fAI-applicaties en -agents\u202fdie bedrijfsprocessen ondersteunen of automatiseren.',
    'Ontwerpen, testen en optimaliseren van prompts voor Large Language Models.',
    'Samenwerken met externe AI-partners aan nieuwe oplossingen.',
    'Bouwen van AI-oplossingen binnen een Azure-architectuur.',
    'Integreren van gestructureerde en ongestructureerde data in AI-toepassingen.',
    'Monitoren van modeloutput en prestaties van AI-oplossingen.',
  ];
  const jd = `Wat ga je doen?\n${duties.join('\n')}`;
  const quote = value => value.replace(/[\u202f\u00a0]/gu, ' ');
  const summaries = [
    work('Build AI applications and agents; design and test LLM prompts.', quote(duties[0]), quote(duties[1])),
    work('Collaborate with AI partners and build Azure solutions.', quote(duties[2]), quote(duties[3])),
    work('Integrate structured data and monitor AI solution performance.', quote(duties[4]), quote(duties[5])),
  ];
  const result = analyze(jd, summaries, { careerLevel: { level: 'Unknown' } });
  assert.equal(result.careerLevel.level, 'Unknown');
  assert.equal(result.mainResponsibilities.length, 3);
  assert.equal(result.mainResponsibilities.flatMap(item => item.supportingEvidence).length, 6);
  assert.equal(result.mainResponsibilities[0].supportingEvidence[0], duties[0]);
  assert.equal(result.responsibilityDiagnostics.VALIDATED, 3);
  const extracted = analyze(jd, duties.map(duty => ({ mode: 'extract', summary: quote(duty),
    supportingEvidence: [{ source: 'JD Body', quote: quote(duty) }] })),
  { schemaVersion: 'job-analysis-v5' });
  assert.equal(extracted.mainResponsibilities.length, 6);
  assert.deepEqual(extracted.mainResponsibilities.map(item => item.label), duties);
  assert.equal(extracted.responsibilityDiagnostics.outcome, 'success');
});

test('a Cloud-only quote cannot verify Python, CI/CD and ETL; independently supported claims can', () => {
  const cloud = 'Cloud Services at GCP, AWS and Azure: architecture choices, storage and compute services.';
  const python = 'Develop Python services for customer applications.';
  const cicd = 'Maintain CI/CD pipelines to deploy production services.';
  const etl = 'Build ETL data pipelines for machine learning workloads.';
  const summary = 'Manage Cloud infrastructure, Python development, CI/CD pipelines and ETL data pipelines.';
  const jd = `Your role\n${[cloud, python, cicd, etl].join('\n')}`;
  const insufficient = analyze(jd, [work(summary, cloud)]);
  assert.equal(insufficient.mainResponsibilities.length, 4);
  assert.ok(insufficient.mainResponsibilities.every(item => item.mode === 'extract'));
  assert.ok(insufficient.mainResponsibilities.every(item => item.label !== summary));
  assert.equal(insufficient.responsibilityDiagnostics.EVIDENCE_INSUFFICIENT, 1);
  assert.equal(insufficient.responsibilityDiagnostics.outcome, 'partial_valid');
  const complete = analyze(jd, [{ ...work(summary, cloud, python, cicd, etl),
    supportedClaims: [
      { claim: 'Manage Cloud infrastructure', supportingEvidence: [{ source: 'JD Body', quote: cloud }] },
      { claim: 'Python development', supportingEvidence: [{ source: 'JD Body', quote: python }] },
      { claim: 'Maintain CI/CD pipelines', supportingEvidence: [{ source: 'JD Body', quote: cicd }] },
      { claim: 'Build ETL data pipelines', supportingEvidence: [{ source: 'JD Body', quote: etl }] },
    ] }]);
  assert.equal(complete.mainResponsibilities.length, 1);
  assert.equal(complete.mainResponsibilities[0].supportingEvidence.length, 4);
  assert.equal(complete.responsibilityDiagnostics.VALIDATED, 1);
});

test('responsibility diagnostics separate missing, malformed, unlocatable and unrelated evidence', () => {
  const jd = 'About the company\nWe sell consulting services.\nYour role\nDeploy tested ML systems to production.';
  assert.equal(analyze(jd, null).responsibilityDiagnostics.MODEL_FIELD_MISSING, 1);
  assert.equal(analyze(jd, []).responsibilityDiagnostics.MODEL_FIELD_MISSING, 1);
  assert.equal(analyze(jd, [{ summary: 42, supportingEvidence: [] }]).responsibilityDiagnostics.MODEL_SCHEMA_INVALID, 1);
  const mixed = analyze(jd, [
    work('Build quantum systems.', 'Build quantum systems.'),
    work('Promote consulting services.', 'We sell consulting services.'),
    work('Deploy ML systems.', 'Deploy tested ML systems to production.'),
  ]);
  assert.equal(mixed.responsibilityDiagnostics.EVIDENCE_MATCH_FAILED, 1);
  assert.equal(mixed.evidenceDiagnostics['JD Body:QUOTE_NOT_FOUND'], 1);
  assert.equal(mixed.responsibilityDiagnostics.EVIDENCE_INSUFFICIENT, 1);
  assert.equal(mixed.responsibilityDiagnostics.VALIDATED, 1);
  assert.deepEqual(mixed.mainResponsibilities.map(item => item.label), ['Deploy ML systems.']);
  assert.equal(validateJobAnalysisShape({ mainResponsibilities: [{ summary: 'x', supportingEvidence: [],
    supportedClaims: [{ claim: 'x', supportingEvidence: null }] }] }).some(message => message.startsWith('jobAnalysis.mainResponsibilities')), true);
});

test('training and company publicity do not become responsibilities while later delivery work does', () => {
  const jd = 'Jouw start bij Sogeti\nJe volgt een opleiding en haalt certificaten.\nWat ga je doen?\nJe ontwikkelt voor klanten AI- en ML-componenten van proof of concept tot productie.\nAbout the company\nWe are a global leader in technology.';
  const result = analyze(jd, [
    work('Complete training.', 'Je volgt een opleiding en haalt certificaten.'),
    work('Deliver AI and ML components for clients.', 'Je ontwikkelt voor klanten AI- en ML-componenten van proof of concept tot productie.'),
    work('Lead global technology.', 'We are a global leader in technology.'),
  ]);
  assert.deepEqual(result.mainResponsibilities.map(item => item.label), ['Deliver AI and ML components for clients.']);
  assert.equal(result.careerLevel.level, 'Unknown');
});

test('one verified Dutch duty retains original evidence and separate localized display text', () => {
  const original = 'Je ontwikkelt AI-modellen voor klanten.';
  const jd = { title: 'AI Engineer', description: `Wat ga je doen?\n${original}` };
  const item = { mode: 'extract', summary: original, displayText: '为客户开发 AI 模型。',
    displayLanguage: 'zh-CN', supportingEvidence: [{ source: 'JD Body', quote: original }] };
  const chinese = analyzeJobRequirements(jd, { mainResponsibilities: [item] }, null, 'zh-CN');
  assert.equal(chinese.mainResponsibilities[0].displayText, '为客户开发 AI 模型。');
  assert.equal(chinese.mainResponsibilities[0].label, original);
  assert.deepEqual(chinese.mainResponsibilities[0].supportingEvidence, [original]);
  const english = analyzeJobRequirements(jd, { mainResponsibilities: [{ ...item,
    displayText: 'Develop AI models for clients.', displayLanguage: 'en' }] }, null, 'en');
  assert.equal(english.mainResponsibilities[0].displayText, 'Develop AI models for clients.');
  const mismatched = analyzeJobRequirements(jd, { mainResponsibilities: [item] }, null, 'en');
  assert.equal(mismatched.mainResponsibilities[0].displayText, null);
  const invented = analyzeJobRequirements(jd, { mainResponsibilities: [{ ...item,
    supportingEvidence: [{ source: 'JD Body', quote: 'Invented AI duty' }] }] }, null, 'zh-CN');
  assert.equal(invented.mainResponsibilities.some(duty => duty.displayText), false);
});

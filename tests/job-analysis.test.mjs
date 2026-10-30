import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { analyzeJobRequirements, detectJdLanguage, extractExperienceRequirements, extractLanguageRequirements } from '../src/shared/job-analysis.js';
import { CacheManager } from '../src/background/cache-manager.js';
import { buildCacheContext } from '../src/shared/scoring-profile.js';
import { t } from '../src/i18n/index.js';

const analyze = (description, title = 'Software Engineer', model = null) => analyzeJobRequirements({ title, description }, model);

test('career level uses JD evidence for graduates, juniors, experienced roles, and conflicts', () => {
  const graduate = analyze('We offer a graduate programme for recent graduates with structured training.');
  assert.equal(graduate.careerLevel.level, 'New Graduate');
  assert.ok(graduate.careerLevel.supportingEvidence.every(quote => 'We offer a graduate programme for recent graduates with structured training.'.includes(quote)));
  assert.equal(analyze('This junior role provides training and mentoring.').careerLevel.level, 'Junior');
  assert.equal(analyze('At least 5 years of professional experience is required.').careerLevel.level, 'Experienced');
  const conflict = analyze('At least 5 years of professional experience is required.', 'Junior Engineer');
  assert.equal(conflict.careerLevel.level, 'Borderline');
  assert.ok(conflict.careerLevel.conflictingEvidence.length);
  assert.equal(analyze('Build software with the team.').careerLevel.level, 'Unknown');
  assert.equal(analyze('Build software with the team.', 'Junior Engineer').careerLevel.level, 'Unknown');
  assert.equal(analyze('Internships or academic projects count as experience.').careerLevel.level, 'Early Career');
});

test('JD language is independent of candidate language requirements', () => {
  const english = analyze('We require fluent Dutch for this role. You will work with our customers and the team.');
  assert.equal(english.jdLanguage, 'English');
  assert.ok(english.jdLanguageEvidence.every(quote => 'We require fluent Dutch for this role. You will work with our customers and the team.'.includes(quote)));
  assert.equal(english.requiredLanguages.items.find(item => item.language === 'Dutch').requirementType, 'Mandatory');
  assert.equal(english.eligibilityWarnings, undefined);
  const preferred = analyze('Dutch is a plus. We work with international teams and customers.');
  assert.equal(preferred.requiredLanguages.items.find(item => item.language === 'Dutch').requirementType, 'Preferred');
  assert.equal(preferred.eligibilityWarnings, undefined);
  const dutch = analyze('Wij zoeken een collega voor het team. Vloeiend Engels is vereist voor deze functie.');
  assert.equal(dutch.jdLanguage, 'Dutch');
  assert.equal(dutch.requiredLanguages.items.find(item => item.language === 'English').requirementType, 'Mandatory');
  assert.equal(analyze('You will work with Dutch customers.').requiredLanguages.items[0].requirementType, 'Mentioned Only');
  assert.deepEqual(extractLanguageRequirements('Excellent communication skills.'), { relation: 'None', items: [] });
});

test('OR and AND language relationships remain distinct', () => {
  const alternative = analyze('Dutch or English is required.');
  assert.equal(alternative.requiredLanguages.relation, 'OR');
  assert.deepEqual(alternative.requiredLanguages.items.map(item => item.requirementType), ['Mandatory', 'Mandatory']);
  assert.equal(alternative.eligibilityWarnings, undefined);
  const both = analyze('Dutch and English are required.');
  assert.equal(both.requiredLanguages.relation, 'AND');
  assert.equal(both.eligibilityWarnings, undefined);
  const mixed = analyze('English is required. Dutch is preferred.');
  assert.equal(mixed.requiredLanguages.relation, 'None');
  assert.equal(mixed.requiredLanguages.items.find(item => item.language === 'Dutch').requirementType, 'Preferred');
  const sameSentence = analyze('English required, Dutch preferred.');
  assert.equal(sameSentence.requiredLanguages.items.find(item => item.language === 'Dutch').requirementType, 'Preferred');
});

test('experience extraction preserves ranges, preference, domain, alternatives, and no-year unknown', () => {
  const range = extractExperienceRequirements('0–2 years of experience required.');
  assert.deepEqual([range.items[0].minimumYears, range.items[0].maximumYears], [0, 2]);
  const three = extractExperienceRequirements('3+ years required.');
  assert.deepEqual([three.items[0].minimumYears, three.items[0].requirementType], [3, 'Mandatory']);
  const preferred = extractExperienceRequirements('5 years preferred.');
  assert.deepEqual([preferred.items[0].minimumYears, preferred.items[0].requirementType], [5, 'Preferred']);
  const multiple = extractExperienceRequirements('5 years of Python experience. 2 years of SQL experience.');
  assert.deepEqual(multiple.items.map(item => [item.minimumYears, item.experienceDomain]), [[5, 'Python'], [2, 'SQL']]);
  assert.equal(extractExperienceRequirements('Experience with Python.').items.length, 0);
  assert.equal(extractExperienceRequirements('Our company was founded 5 years ago.').items.length, 0);
  assert.equal(extractExperienceRequirements('Minimaal 3 jaar ervaring met Python.').items[0].minimumYears, 3);
  assert.equal(extractExperienceRequirements('Internships or academic projects count as experience.').acceptedAlternatives.length, 1);
  const academic = analyze('At least 5 years of academic research experience is required.');
  assert.equal(academic.experienceRequirements.items[0].experienceKind, 'Academic');
  assert.equal(academic.eligibilityWarnings, undefined);
});

test('Sogeti graduate JD keeps benefit durations out of work experience', () => {
  const description = fs.readFileSync(new URL('./fixtures/sogeti-young-professional-ai-engineer.txt', import.meta.url), 'utf8');
  const result = analyze(description, 'Young professional Track AI Engineer Zuid', {
    careerLevel: { level: 'Experienced', supportingEvidence: ['26 vakantiedagen (met mogelijkheid tot bijkopen), onkostenvergoeding en een salarisgroeimodel met elke 6 maanden kans op een verhoging binnen 1,5 jaar.'] },
    experienceRequirements: { items: [{ minimumYears: 5, requirementType: 'Mandatory', supportingEvidence: ['26 vakantiedagen (met mogelijkheid tot bijkopen), onkostenvergoeding en een salarisgroeimodel met elke 6 maanden kans op een verhoging binnen 1,5 jaar.'] }] },
  });
  assert.equal(result.careerLevel.level, 'New Graduate');
  assert.equal(result.jdLanguage, 'Dutch');
  assert.deepEqual(result.experienceRequirements.items, []);
  assert.equal(result.requiredLanguages.items.find(item => item.language === 'Dutch')?.requirementType, 'Mandatory');
  assert.equal(result.requiredLanguages.items.find(item => item.language === 'Dutch')?.minimumProficiency, 'C1');
  assert.ok(result.careerLevel.supportingEvidence.some(quote => quote.includes('Net afgestudeerd')));
  assert.ok(result.careerLevel.supportingEvidence.every(quote => !quote.includes('vakantiedagen')));
  assert.equal(result.eligibilityWarnings, undefined);
});

test('Sogeti work summaries exclude onboarding and benefits while retaining evidenced delivery work', () => {
  const description = fs.readFileSync(new URL('./fixtures/sogeti-young-professional-ai-engineer.txt', import.meta.url), 'utf8');
  const quotes = [
    'Je ontwikkelt voor klanten AI- en ML-componenten en end-to-end toepassingen van proof of concept tot productie.',
    'Je integreert modellen in applicaties en processen en maakt oplossingen betrouwbaar, schaalbaar en uitlegbaar.',
    'Je werkt met Data Scientists, Data Engineers, ML Engineers en stakeholders aan oplossingen voor klanten.',
  ];
  const analysis = analyze(description, 'Young professional Track AI Engineer Zuid', {
    mainResponsibilities: [
      { summary: 'Attend training', supportingEvidence: ['Je begint met een traject waarin je samen met andere starters werkt aan uitdagende opdrachten, coaching krijgt en je skills ontwikkelt.'] },
      ...quotes.map((quote, index) => ({ summary: `Actual work ${index + 1}`, supportingEvidence: [quote] })),
    ],
  });
  assert.equal(analysis.careerLevel.level, 'New Graduate');
  assert.equal(analysis.requiredLanguages.items.find(item => item.language === 'Dutch')?.minimumProficiency, 'C1');
  assert.deepEqual(analysis.experienceRequirements.items, []);
  assert.deepEqual(analysis.mainResponsibilities.map(item => item.supportingEvidence[0]), quotes);
});

test('Xebia Dutch fluently remains a mandatory Fluent requirement from the job text', () => {
  const description = 'As a Machine Learning Engineer, you collaborate with Data Scientists and Data Engineers to develop scalable, production-ready applications.\nYou speak Dutch fluently.\nImprove and test code before deploying ML applications to production.';
  const analysis = analyze(description, 'Machine Learning Engineer', {
    requiredLanguages: { relation: 'None', items: [{ language: 'Dutch', requirementType: 'Mandatory',
      minimumProficiency: 'Fluent', supportingEvidence: [{ source: 'JD Body', quote: 'You speak Dutch fluently.' }] }] },
    experienceRequirements: { items: [], acceptedAlternatives: [] },
    mainResponsibilities: [{ summary: 'Develop production-ready ML applications with data colleagues.',
      supportingEvidence: [{ source: 'JD Body', quote: 'you collaborate with Data Scientists and Data Engineers to develop scalable, production-ready applications' },
        { source: 'JD Body', quote: 'Improve and test code before deploying ML applications to production.' }] }],
  });
  assert.deepEqual(analysis.requiredLanguages.items.map(item => [item.language, item.requirementType]),
    [['Dutch', 'Mandatory']]);
  assert.deepEqual(analysis.experienceRequirements.items, []);
  assert.equal(analysis.mainResponsibilities.length, 1);
  assert.equal(analysis.careerLevel.level, 'Unknown');
});

test('company introduction cannot substantiate a main responsibility', () => {
  const description = 'About the company\nOur company develops AI products for customers.\nAbout the job\nYou will deploy tested ML services to production.';
  const analysis = analyze(description, 'ML Engineer', { mainResponsibilities: [
    { summary: 'Develop products', supportingEvidence: ['Our company develops AI products for customers.'] },
    { summary: 'Deploy ML services', supportingEvidence: ['You will deploy tested ML services to production.'] },
  ] });
  assert.deepEqual(analysis.mainResponsibilities.map(item => item.label), ['Deploy ML services']);
  assert.equal(analysis.mainResponsibilities[0].supportingEvidence[0], 'You will deploy tested ML services to production.');
});

test('benefits, training periods, and company history never establish candidate years', () => {
  const negatives = [
    '26 vakantiedagen, salarisverhoging elke 6 maanden binnen 1,5 jaar.',
    'You get 25 vacation days and a raise after 1.5 years.',
    'The training programme lasts 2 years.',
    'Na 1,5 jaar opleiding krijg je een certificaat.',
    'Our company was established 30 years ago.',
    'Our company has 10 years of experience delivering software.',
    'Wij hebben 20 jaar ervaring met softwareontwikkeling.',
    'We launched our platform 5 years ago.',
  ];
  for (const description of negatives) {
    assert.deepEqual(extractExperienceRequirements(description).items, [], description);
    assert.notEqual(analyze(description).careerLevel.level, 'Experienced', description);
  }
  const benefit = 'You receive a raise after 5 years of employment.';
  assert.equal(analyze(benefit, 'Engineer', { careerLevel: { level: 'Experienced', supportingEvidence: [benefit] },
    experienceRequirements: { items: [{ minimumYears: 5, requirementType: 'Mandatory', supportingEvidence: [benefit] }] } }).careerLevel.level, 'Unknown');
  const narrowQuoteSource = 'You receive a salary increase after 5 years of professional experience with us.';
  const narrowQuote = '5 years of professional experience';
  const narrow = analyze(narrowQuoteSource, 'Engineer', {
    careerLevel: { level: 'Experienced', supportingEvidence: [narrowQuote] },
    experienceRequirements: { items: [{ minimumYears: 5, requirementType: 'Mandatory', supportingEvidence: [narrowQuote] }] },
  });
  assert.equal(narrow.careerLevel.level, 'Unknown');
  assert.deepEqual(narrow.experienceRequirements.items, []);
});

test('explicit Dutch and English decimal and mixed time experience requirements are parsed', () => {
  const examples = [
    ['Minimaal 1,5 jaar werkervaring vereist.', 1.5],
    ['At least 1.5 years of professional experience required.', 1.5],
    ['At least 1 year and 6 months of work experience required.', 1.5],
    ['Minimaal anderhalf jaar werkervaring vereist.', 1.5],
    ['At least one and a half years of work experience required.', 1.5],
  ];
  for (const [description, expected] of examples) {
    assert.equal(extractExperienceRequirements(description).items[0]?.minimumYears, expected, description);
  }
});

test('model evidence is checked against the JD and malformed fields degrade locally', () => {
  const description = 'Lead the architecture of our data platform. Build reliable services.';
  const valid = analyze(description, 'Engineer', { careerLevel: {
    level: 'Experienced', reasons: ['The role owns architecture.'],
    supportingEvidence: ['Lead the architecture of our data platform.'], conflictingEvidence: [],
  } });
  assert.equal(valid.careerLevel.level, 'Experienced');
  const invented = analyze('Build reliable services.', 'Engineer', { careerLevel: {
    level: 'Experienced', reasons: ['Invented seniority'], supportingEvidence: ['Lead the architecture'],
  } });
  assert.equal(invented.careerLevel.level, 'Unknown');
  assert.equal(invented.careerLevel.confidence, 'Unknown');
  assert.equal(analyze('Build reliable services.', 'Engineer', { careerLevel: { level: 'Expert', supportingEvidence: [] } }).careerLevel.level, 'Unknown');
  assert.equal(analyze('Experience with Python is useful.', 'Engineer', { careerLevel: {
    level: 'Experienced', supportingEvidence: ['Experience with Python is useful.'],
  } }).careerLevel.level, 'Unknown');
  const malformed = analyze('Build reliable services.', 'Engineer', {
    requiredLanguages: { relation: 'AND', items: [{ language: 'Dutch', requirementType: 'Mandatory', supportingEvidence: ['Fluent Dutch required'] }] },
    experienceRequirements: { items: [{ minimumYears: 5, requirementType: 'Mandatory', supportingEvidence: ['5 years required'] }] },
  });
  assert.equal(malformed.requiredLanguages.items.length, 0);
  assert.equal(malformed.experienceRequirements.items.length, 0);
  assert.equal(malformed.eligibilityWarnings, undefined);
  assert.equal(analyze('Junior role with training. At least 5 years of experience required.', 'Junior Engineer',
    { careerLevel: { level: 'Junior', supportingEvidence: ['Junior role with training.'] } }).careerLevel.level, 'Borderline');
});

test('job metadata no longer creates candidate eligibility warnings', () => {
  const result = analyze('We require fluent Dutch. At least 5 years of professional experience is required.');
  assert.equal(result.eligibilityWarnings, undefined);
  assert.equal(detectJdLanguage(''), 'Unknown');
  assert.equal(analyze('EU citizenship required.').eligibilityWarnings, undefined);
  assert.equal(analyze('Security clearance is required.').eligibilityWarnings, undefined);
  const sponsor = analyzeJobRequirements({ description: 'No visa sponsorship is available for this vacancy.' }, null,
    { evidence: ['Potential restriction: No visa sponsorship'] });
  assert.equal(sponsor.eligibilityWarnings, undefined);
});

test('new result labels are available in English and Simplified Chinese', () => {
  assert.equal(t('Career Level', 'en'), 'Career Level');
  assert.equal(t('Career Level', 'zh-CN'), '职业阶段');
  assert.equal(t('Eligibility Warnings', 'zh-CN'), '申请条件风险');
  assert.equal(t('Junior', 'zh-CN'), '初级');
  assert.equal(t('Responsibility validation', 'zh-CN'), '职责验证');
  assert.equal(t('JD quotation failures', 'zh-CN'), '岗位原文引文定位失败');
});

test('new cache version retains old history and rejects a changed JD for active reuse', async () => {
  const values = {};
  globalThis.chrome = { storage: { local: {
    get: async key => key === null ? { ...values } : { [key]: values[key] },
    set: async update => Object.assign(values, update),
    remove: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key]; },
  } } };
  const config = { provider: 'gemini', baseUrl: 'https://example.test', modelId: 'model', analysisLanguage: 'en' };
  const oldContext = await buildCacheContext(config, 'resume-hash', 'v10');
  const newContext = await buildCacheContext(config, 'resume-hash', 'v11');
  assert.notEqual(oldContext.scoringProfileHash, newContext.scoringProfileHash);
  const jd = { title: 'Engineer', description: 'Build services with our team.', sourceType: 'linkedin' };
  await CacheManager.saveResult('job-1', oldContext, jd, { overallMatchPercent: 82, metadata: {} });
  delete values[Object.keys(values)[0]].jdHash; // A record written before JD fingerprints existed.
  assert.equal((await CacheManager.listEntries(newContext)).length, 1);
  assert.equal(await CacheManager.getEntry('job-1', newContext), null);
  assert.equal(await CacheManager.getEntry('job-1', newContext, { allowCompatible: true, jdData: jd }), null);
  await CacheManager.saveResult('job-1', newContext, jd, { overallMatchPercent: 82, metadata: {}, jobAnalysis: analyze(jd.description) });
  assert.ok(await CacheManager.getEntry('job-1', newContext, { jdData: jd }));
  assert.equal(await CacheManager.getEntry('job-1', newContext, { jdData: { ...jd, description: 'Changed JD.' } }), null);
});

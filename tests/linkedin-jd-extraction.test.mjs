import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import fs from 'node:fs';
import { extractLinkedInJDText } from '../src/content/linkedin-jd-extractor.js';
import { extractAiJDText } from '../src/content/linkedin-ai-adapter.js';
import { extractIndeedJDText } from '../src/content/indeed-adapter.js';
import { CacheManager, matchesCachedJD } from '../src/background/cache-manager.js';
import { analyzeJobRequirements } from '../src/shared/job-analysis.js';

function element(text = '', children = {}) {
  return {
    innerText: text, textContent: text, parentElement: null,
    querySelectorAll(selector) { return children[selector] || []; },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    closest(selector) { return selector === 'section' ? this.section || null : null; },
  };
}

function documentWithPane(pane) {
  return { querySelector(selector) { return selector === '.jobs-search__job-details--container' ? pane : null; } };
}

test('AI Search reads About the job and stops before a separate company section', () => {
  const job = element('About the job');
  const company = element('About the company');
  const jd = 'As a Machine Learning Engineer, you collaborate with Data Scientists and Data Engineers to develop scalable, production-ready applications. You speak Dutch fluently.';
  const section = element(`About the job\n${jd}\nAbout the company\nXebia is a global, award-winning company. 1001-5000 employees.`,
    { 'h2, h3': [job, company] });
  job.section = section;
  section.section = section;
  const pane = element('', { 'h2, h3': [job, company] });
  const extracted = extractAiJDText(documentWithPane(pane), {
    expectedJobId: '4474124150', detailJobId: '4474124150', selectedTitle: 'Machine Learning Engineer',
    detailTitle: 'Machine Learning Engineer',
  });
  assert.equal(extracted.status, 'ready');
  assert.equal(extracted.text, jd);
  assert.match(extracted.text, /You speak Dutch fluently/);
  assert.doesNotMatch(extracted.text, /1001-5000 employees|Xebia is a global/);
  const analysis = analyzeJobRequirements({ title: 'Machine Learning Engineer', description: extracted.text }, {
    requiredLanguages: { relation: 'None', items: [{ language: 'Dutch', requirementType: 'Mandatory',
      minimumProficiency: 'Fluent', supportingEvidence: [{ source: 'JD Body', quote: 'You speak Dutch fluently.' }] }] },
    careerLevel: { level: 'Experienced', supportingEvidence: ['1001-5000 employees'] },
    mainResponsibilities: [{ summary: 'Build production-ready applications with data colleagues.',
      supportingEvidence: [{ source: 'JD Body', quote: 'you collaborate with Data Scientists and Data Engineers to develop scalable, production-ready applications' }] }],
  });
  assert.equal(analysis.requiredLanguages.items[0].minimumProficiency, undefined);
  assert.equal(analysis.careerLevel.level, 'Unknown');
  assert.equal(analysis.mainResponsibilities.length, 1);
});

test('company-only area and unloaded pane never become a job description', () => {
  const companyHeading = element('About the company');
  const companySection = element('About the company\nA global company with 1001-5000 employees.',
    { 'h2, h3': [companyHeading] });
  companySection.section = companySection;
  const companyParagraph = element('A global company with 1001-5000 employees.');
  companyParagraph.section = companySection;
  const pane = element('', { 'h2, h3': [companyHeading], '#job-details': [companyParagraph] });
  const companyOnly = extractLinkedInJDText(documentWithPane(pane), { expectedJobId: '4474124150' });
  assert.equal(companyOnly.status, 'failed');
  assert.equal(companyOnly.text, '');
  assert.match(companyOnly.warnings[0], /company introduction/);
  assert.equal(extractLinkedInJDText(documentWithPane(element()), { expectedJobId: '4474124150' }).status, 'loading');
});

test('Classic job region stays separate from company text and dynamic selection waits for B', () => {
  const jd = element('Build reliable ML services with the customer team. Deploy tested models to production.');
  const company = element('About the company\nGlobal business with 6,313 followers.');
  const companySection = element('', { 'h2, h3': [element('About the company')] });
  company.section = companySection;
  const pane = element('', { '#job-details': [jd], '.jobs-unified-description__content': [company] });
  const documentNode = documentWithPane(pane);
  const switching = extractLinkedInJDText(documentNode, { expectedJobId: 'B', detailJobId: 'A',
    selectedTitle: 'ML Engineer B', detailTitle: 'ML Engineer A' });
  assert.equal(switching.status, 'loading');
  assert.equal(switching.text, '');
  const ready = extractLinkedInJDText(documentNode, { expectedJobId: 'B', detailJobId: 'B',
    selectedTitle: 'ML Engineer B', detailTitle: 'ML Engineer B' });
  assert.equal(ready.text, jd.innerText);
  assert.doesNotMatch(ready.text, /6,313 followers/);
  assert.equal(extractLinkedInJDText(documentNode, { expectedJobId: 'B', detailJobId: 'B',
    selectedTitle: 'ML Engineer B', detailTitle: 'ML Engineer B',
    previousJobId: 'A', previousDescription: jd.innerText }).status, 'loading');
  assert.equal(extractLinkedInJDText(documentNode, { expectedJobId: 'B', detailJobId: 'B',
    selectedTitle: 'ML Engineer B', detailTitle: 'ML Engineer A' }).status, 'loading');
  assert.equal(extractLinkedInJDText(documentNode, { expectedJobId: 'B', detailJobId: 'B',
    selectedTitle: 'ML Engineer B', detailTitle: 'ML Engineer B',
    selectedCompany: 'New employer', detailCompany: 'Old employer' }).status, 'loading');
});

test('nested Classic JD selectors choose the complete dedicated body', () => {
  const short = element('Build ML services.');
  const complete = element('Build ML services. Deploy tested models to production for client systems and collaborate with software and data engineers.');
  const pane = element('', { '#job-details': [short], '.jobs-description__content': [complete] });
  const extracted = extractLinkedInJDText(documentWithPane(pane), { expectedJobId: '123', detailJobId: '123' });
  assert.equal(extracted.text, complete.innerText);
});

test('heading extraction includes later sibling qualifications and work permit sections without company text', () => {
  const heading = element('About the job');
  const companyHeading = element('About the company');
  const duties = 'Je top 6 werkzaamheden als AI Engineer\nOntwikkel en implementeer AI-oplossingen voor klanten.';
  const qualifications = 'Qualifications\nJe spreekt vloeiend Nederlands. Je hebt 1-3 jaar relevante werkervaring.';
  const additional = 'Additional Information\nA valid Dutch work permit is required.';
  const firstSection = element(`About the job\n${duties}`, { 'h2, h3': [heading] });
  const wholeJD = element(`About the job\n${duties}\n${qualifications}\n${additional}\nAbout the company\nWe have 5000 employees.`, {
    'h2, h3': [heading, companyHeading],
  });
  heading.section = firstSection;
  heading.parentElement = firstSection;
  firstSection.parentElement = wholeJD;
  const pane = element(wholeJD.innerText, { 'h2, h3': [heading, companyHeading] });
  wholeJD.parentElement = pane;
  const result = extractLinkedInJDText(documentWithPane(pane), { expectedJobId: '4479249041',
    detailJobId: '4479249041' });
  assert.equal(result.status, 'ready');
  assert.match(result.text, /Je top 6 werkzaamheden/);
  assert.match(result.text, /Qualifications/);
  assert.match(result.text, /vloeiend Nederlands/);
  assert.match(result.text, /1-3 jaar relevante werkervaring/);
  assert.match(result.text, /valid Dutch work permit/);
  assert.doesNotMatch(result.text, /5000 employees|About the company/);
});

test('AI Search can join JD sibling sections without falling back to the whole main page', () => {
  const heading = element('About the job');
  const first = element('About the job\nBuild production ML services.');
  const second = element('Qualifications\nDutch fluency is mandatory.');
  const third = element('Additional Information\nValid work authorization is required.');
  const company = element('About the company\nOur consultancy has 500 employees.', {
    'h2, h3': [element('About the company')],
  });
  first.nextElementSibling = second;
  second.nextElementSibling = third;
  third.nextElementSibling = company;
  heading.section = first;
  heading.parentElement = first;
  const main = element(`About the job\n${first.innerText}\n${second.innerText}\n${third.innerText}\n${company.innerText}`,
    { 'h2, h3': [heading] });
  main.matches = selector => selector.includes('main');
  first.parentElement = main;
  const result = extractAiJDText(documentWithPane(main), { expectedJobId: '42', detailJobId: '42' });
  assert.match(result.text, /Build production ML services/);
  assert.match(result.text, /Dutch fluency is mandatory/);
  assert.match(result.text, /Valid work authorization is required/);
  assert.doesNotMatch(result.text, /500 employees/);
});

test('collapsed See more content is review-needed until the user expands it', () => {
  const button = element('See more');
  const partial = element('Build and deploy models for customers. Collaborate with the product team.', {
    'button[aria-expanded="false"], [role="button"][aria-expanded="false"]': [button],
  });
  const pane = element('', { '#job-details': [partial] });
  const result = extractLinkedInJDText(documentWithPane(pane), { expectedJobId: '17', detailJobId: '17' });
  assert.equal(result.status, 'uncertain');
  assert.match(result.warnings.join(' '), /collapsed/);
});

test('Sia-style JD keeps Dutch, one-to-three years and work-permit clauses in the extracted source', () => {
  const description = 'You must speak Dutch fluently.\nYou need 1-3 years of professional experience.\nA valid work permit is required for this role.';
  const pane = element('', { '#job-details': [element(description)] });
  const extracted = extractLinkedInJDText(documentWithPane(pane), { expectedJobId: 'sia-role', detailJobId: 'sia-role' });
  assert.equal(extracted.text, description);
  const analysis = analyzeJobRequirements({ title: 'Consultant', description: extracted.text }, {
    requiredLanguages: { relation: 'None', items: [{ language: 'Dutch', requirementType: 'Mandatory',
      minimumProficiency: 'Fluent', supportingEvidence: [{ source: 'JD Body', quote: 'You must speak Dutch fluently.' }] }] },
    experienceRequirements: { items: [{ minimumYears: 1, maximumYears: 3, requirementType: 'Mandatory',
      supportingEvidence: [{ source: 'JD Body', quote: 'You need 1-3 years of professional experience.' }] }] },
  });
  assert.equal(analysis.requiredLanguages.items.find(item => item.language === 'Dutch')?.requirementType, 'Mandatory');
  assert.equal(analysis.experienceRequirements.items[0]?.minimumYears, 1);
  assert.equal(analysis.experienceRequirements.items[0]?.maximumYears, 3);
  assert.match(extracted.text, /valid work permit is required/);
});

test('Indeed dedicated JD reading remains available', () => {
  const jd = 'Build reliable warehouse software and collaborate with the engineering team to deliver production systems.';
  const documentNode = { querySelector(selector) { return selector === '#jobDescriptionText' ? element(jd) : null; },
    querySelectorAll() { return []; } };
  assert.equal(extractIndeedJDText(documentNode).text, jd);
});

test('failed extraction blocks analysis before any model call', async () => {
  const source = fs.readFileSync(new URL('../src/background/service-worker.js', import.meta.url), 'utf8');
  const functionSource = source.slice(source.indexOf('async function runAnalysisForJob('),
    source.indexOf('async function handleStartAnalysis('));
  const context = vm.createContext({});
  vm.runInContext(`${functionSource}; this.runAnalysisForJob = runAnalysisForJob;`, context);
  await assert.rejects(context.runAnalysisForJob({ jobId: 'B', description: 'Company overview',
    extractionStatus: 'failed' }, {}, {}), /JD Extraction Failed/);
  await assert.rejects(context.runAnalysisForJob({ jobId: 'B', description: 'Previously verified JD',
    extractionStatus: 'stale' }, {}, {}), /JD Extraction Failed/);
});

test('new extraction and prompt identity reject old JD scores while keeping history records', async () => {
  const values = {};
  globalThis.chrome = { storage: { local: {
    get: async key => key === null ? { ...values } : { [key]: values[key] },
    set: async update => Object.assign(values, update),
    remove: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key]; },
  } } };
  const context = version => ({ resumeHash: 'resume', scoringProfileHash: 'profile',
    modelKeyHash: 'gemini-model', promptVersion: version });
  const oldJD = { jobId: '4474124150', title: 'ML Engineer', company: 'Xebia',
    description: 'About the company: 1001-5000 employees.', extractionVersion: 'linkedin-jd-v1' };
  await CacheManager.saveResult(oldJD.jobId, context('v14'), oldJD, { overallMatchPercent: 80 });
  const newJD = { ...oldJD, description: 'Build production ML applications. You speak Dutch fluently.',
    extractionVersion: 'linkedin-jd-v3' };
  assert.equal(await CacheManager.getEntry(oldJD.jobId, context('v15'), { jdData: newJD }), null);
  assert.equal((await CacheManager.listEntries(context('v15'))).length, 1);
  await CacheManager.saveResult(newJD.jobId, context('v15'), newJD, { overallMatchPercent: 74 });
  const current = await CacheManager.getEntry(newJD.jobId, context('v15'), { jdData: newJD });
  assert.equal(current.data.overallMatchPercent, 74);
  assert.equal(await matchesCachedJD(current, oldJD), false);
  assert.equal(Object.keys(values).filter(key => key.startsWith('match_result_v3_')).length, 2);
  assert.equal((await CacheManager.getEntries([oldJD.jobId], context('v15')))[0]?.summary?.jdExtractionVersion,
    'linkedin-jd-v3');
  const partialJD = { ...newJD, jobId: 'other-job', extractionVersion: 'linkedin-jd-v2' };
  await CacheManager.saveResult(partialJD.jobId, context('v15'), partialJD, { overallMatchPercent: 60 });
  assert.deepEqual(await CacheManager.getEntries([partialJD.jobId], context('v15')), []);
  assert.equal((await CacheManager.listEntries(context('v15'))).some(entry => entry.jobId === partialJD.jobId), true);
});

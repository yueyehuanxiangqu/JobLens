import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreEvidence } from '../src/shared/evidence-scoring.js';
import { getEffectiveWeights } from '../src/shared/scoring-profile.js';

const dimensions = {
  'Skills & Experience Relevance': 0.5,
  'Responsibility Coverage': 0.3,
  'Years of Experience': 0.2,
  'Education & Certifications': 0,
  'Language & Location': 0,
  'Sponsorship Fit': 0.05,
};

const profile = (mode = 'balanced', overrides = {}) => ({
  promptTuningMode: mode,
  weightsApplied: dimensions,
  ...overrides,
});

const jd = { description: 'Use SQL to analyze datasets. Own weekly reporting. At least 3 years of experience.' };
const resume = 'SQL experience and weekly reporting for product teams. Two years of experience.';

test('weighted rubric calculates points from evidence, not model totals', () => {
  const result = scoreEvidence({
    rubricVersion: 'evidence-v1',
    extractionComplete: true,
    requirements: [
      { dimension: 'Skills & Experience Relevance', importance: 'required', status: 'met', hard: true, jdQuote: 'Use SQL', resumeQuote: 'SQL experience', reason: 'Direct tool evidence.' },
      { dimension: 'Responsibility Coverage', importance: 'responsibility', status: 'met', hard: false, jdQuote: 'Own weekly reporting', resumeQuote: 'weekly reporting', reason: 'Direct ownership evidence.' },
      { dimension: 'Years of Experience', importance: 'required', status: 'partial', hard: true, jdQuote: 'At least 3 years of experience', resumeQuote: 'Two years of experience', reason: 'Documented duration is below the threshold.' },
    ],
  }, jd, resume, profile());

  assert.equal(result.overallMatchPercent, 94);
  assert.equal(result.matchBreakdown.length, 3);
  assert.equal(result.matchBreakdown.find(item => item.itemName === 'Years of Experience').score, 70);
  assert.equal(result.rubric.evidenceCoverage, 100);
  assert.equal(result.rubric.hardConditions.length, 2);
  assert.match(result.rubric.advice, /unresolved hard conditions/i);
});

test('scored JD quotes use the original contiguous source and reject company or rewritten evidence', () => {
  const quotedJD = { title: 'AI Engineer', company: 'Python Experts',
    description: 'Develop\u202fAI applications for clients.' };
  const row = { dimension: 'Skills & Experience Relevance', importance: 'required', status: 'met',
    hard: false, jdSource: 'JD Body', jdQuote: 'Develop AI applications for clients.',
    resumeQuote: 'AI applications', reason: 'Direct experience.' };
  const run = requirements => scoreEvidence({ rubricVersion: 'evidence-v1', extractionComplete: true,
    requirements }, quotedJD, 'Built AI applications for clients.', profile());
  const valid = run([row]);
  assert.equal(valid.overallMatchPercent, 100);
  assert.match(valid.matchBreakdown[0].evidence[0], /Develop\u202fAI applications/);
  assert.throws(() => run([{ ...row, jdSource: 'Job Title' }]), /No valid requirement evidence/);
  assert.throws(() => run([{ ...row, jdQuote: 'Python Experts', jdSource: undefined }]), /No valid requirement evidence/);
  assert.throws(() => run([{ ...row, jdQuote: 'develop AI applications for clients.' }]), /No valid requirement evidence/);
});

test('dimensions with no extracted JD requirement do not become breakdown items', () => {
  const result = scoreEvidence({
    rubricVersion: 'evidence-v1',
    extractionComplete: true,
    requirements: [{
      dimension: 'Skills & Experience Relevance', importance: 'required', status: 'met', hard: false,
      jdQuote: 'Use SQL', resumeQuote: 'SQL experience', reason: 'Direct evidence.',
    }],
  }, jd, resume, profile('balanced', {
    weightsApplied: {
      'Skills & Experience Relevance': 0.5,
      'Education & Certifications': 0.2,
    },
  }));

  assert.equal(result.matchBreakdown.length, 1);
  assert.equal(result.matchBreakdown.some(item => item.itemName === 'Education & Certifications'), false);
  assert.deepEqual(result.rubric.notApplicableDimensions, ['Education & Certifications']);
  assert.deepEqual(result.rubric.excludedDimensions, []);
});

test('unknown is not unmet and lowers evidence coverage without inventing a gap', () => {
  const base = {
    rubricVersion: 'evidence-v1',
    extractionComplete: true,
    requirements: [
      { dimension: 'Skills & Experience Relevance', importance: 'required', status: 'unknown', hard: true, jdQuote: 'Use SQL', resumeQuote: '', reason: 'The resume does not document this requirement.' },
    ],
  };
  const unknown = scoreEvidence(base, jd, resume, profile());
  assert.equal(unknown.overallMatchPercent, 0);
  assert.equal(unknown.rubric.evidenceCoverage, 0);
  assert.equal(unknown.rubric.hardConditions[0].status, 'unknown');
  assert.deepEqual(unknown.matchBreakdown[0].prosCons.gaps, []);
  assert.match(unknown.matchBreakdown[0].prosCons.unknowns[0], /unknown/i);
  assert.match(unknown.unknowns[0], /unknown/i);
  assert.deepEqual(unknown.gaps, []);

  const unmet = scoreEvidence({
    ...base,
    requirements: [{ ...base.requirements[0], status: 'unmet', resumeQuote: 'Two years of experience' }],
  }, jd, resume, profile());
  assert.equal(unmet.overallMatchPercent, 0);
  assert.equal(unmet.rubric.evidenceCoverage, 100);
  assert.equal(unmet.rubric.hardConditions[0].status, 'unmet');
  assert.match(unmet.gaps[0], /unmet/i);
  assert.deepEqual(unmet.unknowns, []);
});

test('an unverifiable resume quote downgrades only that row and preserves other evidence', () => {
  const result = scoreEvidence({
    rubricVersion: 'evidence-v1',
    extractionComplete: true,
    requirements: [
      { dimension: 'Skills & Experience Relevance', importance: 'required', status: 'met', hard: false, jdQuote: 'Use SQL', resumeQuote: 'SQL experience', reason: 'Direct SQL evidence.' },
      { dimension: 'Skills & Experience Relevance', importance: 'required', status: 'met', hard: false, jdQuote: 'analyze datasets', resumeQuote: 'Python experience', reason: 'The model reported related experience.' },
    ],
  }, jd, resume, profile());

  assert.equal(result.overallMatchPercent, 50);
  assert.equal(result.rubric.evidenceCoverage, 50);
  assert.equal(result.rubric.requirements[0].status, 'met');
  assert.equal(result.rubric.requirements[1].status, 'unknown');
  assert.equal(result.rubric.requirements[1].resumeQuote, '');
  assert.match(result.rubric.requirements[1].reason, /exact quotation/i);
  assert.deepEqual(result.validationWarnings, ['Resume quotation not found at row 2.']);
});

test('non-unknown rows with an empty resume quote become unknown', () => {
  const result = scoreEvidence({
    rubricVersion: 'evidence-v1',
    extractionComplete: true,
    requirements: [{
      dimension: 'Skills & Experience Relevance', importance: 'required', status: 'partial', hard: false,
      jdQuote: 'Use SQL', resumeQuote: ' ', reason: 'The model did not provide a source quote.',
    }],
  }, jd, resume, profile());

  assert.equal(result.rubric.requirements[0].status, 'unknown');
  assert.equal(result.rubric.requirements[0].resumeQuote, '');
  assert.deepEqual(result.validationWarnings, ['Resume evidence missing at row 1.']);
});

test('mode anchors change partial and transferable points predictably', () => {
  const raw = {
    rubricVersion: 'evidence-v1',
    extractionComplete: true,
    requirements: [
      { dimension: 'Skills & Experience Relevance', importance: 'required', status: 'partial', hard: false, jdQuote: 'Use SQL', resumeQuote: 'SQL experience', reason: 'Scope is only partly documented.' },
      { dimension: 'Responsibility Coverage', importance: 'responsibility', status: 'transferable', hard: false, jdQuote: 'Own weekly reporting', resumeQuote: 'product teams', reason: 'Adjacent reporting context is documented.' },
    ],
  };
  assert.equal(scoreEvidence(raw, jd, resume, profile('strict')).overallMatchPercent, 33);
  assert.equal(scoreEvidence(raw, jd, resume, profile('balanced')).overallMatchPercent, 63);
  assert.equal(scoreEvidence(raw, jd, resume, profile('potential')).overallMatchPercent, 74);
});

test('v0.6.3 accepts multiple exact resume excerpts for one requirement', () => {
  const result = scoreEvidence({
    rubricVersion: 'evidence-v1',
    extractionComplete: true,
    requirements: [{
      dimension: 'Skills & Experience Relevance', importance: 'required', status: 'met', hard: false,
      jdQuote: 'Use SQL', resumeQuotes: ['SQL experience', 'weekly reporting'], reason: 'Two exact excerpts jointly support the requirement.',
    }],
  }, jd, resume, profile());

  assert.equal(result.rubric.requirements[0].status, 'met');
  assert.deepEqual(result.rubric.requirements[0].resumeQuotes, ['SQL experience', 'weekly reporting']);
  assert.equal(result.rubric.requirements[0].resumeQuote, 'SQL experience');
  assert.deepEqual(result.validationWarnings, []);
});

test('one unverifiable excerpt invalidates the complete multi-quote evidence set', () => {
  const result = scoreEvidence({
    rubricVersion: 'evidence-v1',
    extractionComplete: true,
    requirements: [{
      dimension: 'Skills & Experience Relevance', importance: 'required', status: 'partial', hard: false,
      jdQuote: 'Use SQL', resumeQuotes: ['SQL experience', 'not present'], reason: 'The second excerpt cannot be verified.',
    }],
  }, jd, resume, profile());

  assert.equal(result.rubric.requirements[0].status, 'unknown');
  assert.deepEqual(result.rubric.requirements[0].resumeQuotes, []);
  assert.equal(result.rubric.requirements[0].resumeQuote, '');
  assert.deepEqual(result.validationWarnings, ['Resume quotation not found at row 1.']);
});

test('legacy single resumeQuote remains compatible with the previous 700-character limit', () => {
  const legacyQuote = 'A'.repeat(600);
  const result = scoreEvidence({
    rubricVersion: 'evidence-v1',
    extractionComplete: true,
    requirements: [{
      dimension: 'Skills & Experience Relevance', importance: 'required', status: 'met', hard: false,
      jdQuote: 'Use SQL', resumeQuote: legacyQuote, reason: 'Legacy single-quote evidence remains supported.',
    }],
  }, jd, legacyQuote, profile());

  assert.equal(result.rubric.requirements[0].status, 'met');
  assert.equal(result.rubric.requirements[0].resumeQuote, legacyQuote);
  assert.deepEqual(result.validationWarnings, []);
});

test('invalid rows are isolated while incomplete extraction remains a hard gate', () => {
  const valid = {
    rubricVersion: 'evidence-v1',
    extractionComplete: true,
    requirements: [
      { dimension: 'Skills & Experience Relevance', importance: 'required', status: 'met', hard: false, jdQuote: 'Use SQL', resumeQuote: 'SQL experience', reason: 'Direct evidence.' },
    ],
  };
  const invalidQuote = scoreEvidence({ ...valid, requirements: [{ ...valid.requirements[0], jdQuote: 'Use Python' }, valid.requirements[0]] }, jd, resume, profile());
  assert.equal(invalidQuote.rubric.requirements.length, 1);
  assert.match(invalidQuote.validationWarnings[0], /JD quotation/);

  const duplicate = scoreEvidence({ ...valid, requirements: [valid.requirements[0], valid.requirements[0]] }, jd, resume, profile());
  assert.equal(duplicate.rubric.requirements.length, 1);
  assert.match(duplicate.validationWarnings[0], /Duplicate/);
  assert.throws(() => scoreEvidence({ ...valid, extractionComplete: false }, jd, resume, profile()), /incomplete/);
});

test('short exact JD quotes remain usable evidence', () => {
  const result = scoreEvidence({
    rubricVersion: 'evidence-v1',
    extractionComplete: true,
    requirements: [{
      dimension: 'Skills & Experience Relevance', importance: 'required', status: 'met', hard: false,
      jdQuote: 'SQL', resumeQuote: 'SQL', reason: 'Exact skill evidence.',
    }],
  }, jd, resume, profile());

  assert.equal(result.overallMatchPercent, 100);
  assert.deepEqual(result.validationWarnings, []);
});

test('zero-weight capability dimensions remain excluded while hard conditions stay visible', () => {
  const result = scoreEvidence({
    rubricVersion: 'evidence-v1',
    extractionComplete: true,
    requirements: [
      { dimension: 'Skills & Experience Relevance', importance: 'required', status: 'met', hard: false, jdQuote: 'Use SQL', resumeQuote: 'SQL experience', reason: 'Direct evidence.' },
      { dimension: 'Education & Certifications', importance: 'required', status: 'unknown', hard: true, jdQuote: 'At least 3 years of experience', resumeQuote: '', reason: 'This test models a zero-weight unresolved condition.' },
    ],
  }, jd, resume, profile());
  assert.ok(result.rubric.excludedDimensions.includes('Education & Certifications'));
  assert.equal(result.rubric.hardConditions[0].status, 'unknown');
  assert.equal(result.matchBreakdown.some(item => item.itemName === 'Education & Certifications'), false);
});

test('sponsorship-first keeps sponsorship outside capability weight normalization', () => {
  const weights = getEffectiveWeights({ analysisPreset: 'sponsorship-first' }, true);

  assert.equal(weights['Sponsorship Fit'], 0);
  assert.equal(Object.values(weights).reduce((sum, value) => sum + value, 0), 1);
});

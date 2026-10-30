import { findCvEvidence } from './cv-evidence.js';
import { locateJdEvidence } from './jd-evidence.js';
import { JOB_ANALYSIS_OUTPUT_SCHEMA } from './job-analysis-schema.js';

export const HOLISTIC_SCORE_VERSION = 'capability-v3';

// Constrain Gemini's JSON syntax and existing core contract. JD analysis and
// optional presentation fields remain extensible and are validated locally.
const pointSchema = {
  type: 'object', properties: {
    claim: { type: 'string' }, evidenceKind: { type: 'string', enum: ['Direct', 'Inferred', 'Unknown'] },
    jdSource: { type: 'string', enum: ['Job Title', 'JD Body'] }, jdQuote: { type: 'string' },
    cvQuotes: { type: 'array', items: { type: 'string' } },
  }, required: ['claim', 'evidenceKind', 'jdSource', 'jdQuote', 'cvQuotes'], additionalProperties: false,
};
export const HOLISTIC_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    rubricVersion: { type: 'string', enum: [HOLISTIC_SCORE_VERSION] },
    extractionComplete: { type: 'boolean' },
    capabilityAssessment: {
      type: 'object', properties: {
        score: { type: 'integer', minimum: 0, maximum: 100 },
        scoreReason: { type: 'string' },
        strengths: { type: 'array', items: pointSchema },
        risks: { type: 'array', items: pointSchema },
      }, required: ['score', 'scoreReason', 'strengths', 'risks'], additionalProperties: false,
    },
    jobAnalysis: JOB_ANALYSIS_OUTPUT_SCHEMA,
  }, required: ['rubricVersion', 'extractionComplete', 'capabilityAssessment', 'jobAnalysis'], additionalProperties: false,
};

function explanationLanguageStatus(value, requestedLanguage) {
  if (!['en', 'zh-CN'].includes(requestedLanguage)) return 'unknown';
  // Quoted JD/CV text and product names do not determine the language of the
  // model's own explanation. This is a conservative signal, not a translator.
  const prose = String(value || '').replace(/["“「`][^"”」`]{1,500}["”」`]/gu, ' ');
  const han = (prose.match(/[\u3400-\u9fff]/gu) || []).length;
  const latin = (prose.match(/[A-Za-z]/gu) || []).length;
  if (requestedLanguage === 'zh-CN') return han >= 2 ? 'match' : !han && latin >= 12 ? 'mismatch' : 'uncertain';
  return han >= 4 && han > latin / 2 ? 'mismatch' : latin >= 8 ? 'match' : 'uncertain';
}

function assessExplanationQuality(scoreReason, points, analysisLanguage) {
  const issues = [];
  if (!scoreReason) issues.push('SUMMARY_MISSING');
  else if (!/[.!?。！？]["'’”)]?$/u.test(scoreReason) || /(?:\.\.\.|…)\s*$/u.test(scoreReason)) {
    issues.push('SUMMARY_POSSIBLY_INCOMPLETE');
  }
  const summaryLanguage = explanationLanguageStatus(scoreReason, analysisLanguage);
  if (summaryLanguage === 'mismatch') issues.push('SUMMARY_LANGUAGE_MISMATCH');
  if (points.some(item => explanationLanguageStatus(item.claim, analysisLanguage) === 'mismatch')) {
    issues.push('POINT_LANGUAGE_MISMATCH');
  }
  return { status: issues.length ? 'review' : 'verified', issues,
    languageVerified: summaryLanguage === 'match'
      && !issues.includes('POINT_LANGUAGE_MISMATCH') };
}

function validatePoint(candidate, jd, sourceResume, kind, warnings, index) {
  if (!candidate || typeof candidate.claim !== 'string' || !candidate.claim.trim()
    || !['Direct', 'Inferred', 'Unknown'].includes(candidate.evidenceKind)
    || !['Job Title', 'JD Body'].includes(candidate.jdSource)
    || typeof candidate.jdQuote !== 'string' || candidate.jdQuote.length > 500
    || !Array.isArray(candidate.cvQuotes) || candidate.cvQuotes.length > 3
    || candidate.evidenceKind === 'Unknown' && candidate.cvQuotes.length > 0) {
    warnings.push(`${kind} ${index + 1} has an invalid structure.`);
    return null;
  }
  const jdMatch = locateJdEvidence(candidate.jdSource === 'Job Title' ? jd?.title : jd?.description, candidate.jdQuote);
  if (!jdMatch.ok) {
    warnings.push(`${kind} ${index + 1} has no matching JD source quote.`);
    return null;
  }
  const cvMatches = candidate.cvQuotes.map(quote => typeof quote === 'string' && quote.length <= 500
    ? findCvEvidence(sourceResume, quote) : null);
  if (cvMatches.some(match => !match) || candidate.evidenceKind !== 'Unknown' && !cvMatches.length
    || kind === 'strength' && !cvMatches.length) {
    warnings.push(`${kind} ${index + 1} has no matching original CV source quote.`);
    return null;
  }
  return {
    claim: candidate.claim.trim(), evidenceKind: candidate.evidenceKind,
    jdSource: candidate.jdSource, jdQuote: jdMatch.quote,
    cvQuotes: cvMatches.map(match => match.quote),
  };
}

// The model owns the holistic score. Local code validates its contract and
// quotations, but never recalculates, caps, or renormalizes the score.
export function validateHolisticAssessment(raw, jd, sourceResume, analysisLanguage = null) {
  const assessment = raw?.capabilityAssessment;
  if (raw?.rubricVersion !== HOLISTIC_SCORE_VERSION || raw?.extractionComplete !== true
    || !assessment || !Number.isInteger(assessment.score) || assessment.score < 0 || assessment.score > 100) {
    throw new Error('Holistic capability assessment is missing or invalid; re-analyze this job.');
  }
  const validationWarnings = [];
  const points = key => {
    if (!Array.isArray(assessment[key])) { validationWarnings.push(`${key} missing or invalid.`); return []; }
    if (assessment[key].length > 4) validationWarnings.push(`${key} limited to four points.`);
    return assessment[key].slice(0, 4);
  };
  const strengths = points('strengths').map((point, index) =>
    validatePoint(point, jd, sourceResume, 'strength', validationWarnings, index)).filter(Boolean);
  const risks = points('risks').map((point, index) =>
    validatePoint(point, jd, sourceResume, 'risk', validationWarnings, index)).filter(Boolean);
  if (!strengths.length && !risks.length) {
    throw new Error('No JD/CV evidence could be verified for the holistic score; re-analyze this job.');
  }
  const scoreReason = typeof assessment.scoreReason === 'string' ? assessment.scoreReason.trim() : '';
  const explanationQuality = assessExplanationQuality(scoreReason, [...strengths, ...risks], analysisLanguage);
  return {
    overallMatchPercent: assessment.score,
    matchBreakdown: [],
    strengths: strengths.map(item => item.claim),
    gaps: risks.filter(item => item.evidenceKind !== 'Unknown').map(item => item.claim),
    unknowns: risks.filter(item => item.evidenceKind === 'Unknown').map(item => `unknown: ${item.claim}`),
    validationWarnings,
    rubric: {
      version: HOLISTIC_SCORE_VERSION, mode: 'llm-holistic', scoreReason, explanationQuality,
      strengths, risks, validationWarnings,
    },
  };
}

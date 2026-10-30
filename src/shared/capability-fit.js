import { findCvEvidence } from './cv-evidence.js';
import { locateJdEvidence } from './jd-evidence.js';

export const CAPABILITY_SCORE_VERSION = 'capability-v2';
export const CAPABILITY_WEIGHTS = Object.freeze({
  'Technical Skills': 0.30,
  'Project & Responsibility Fit': 0.25,
  'Domain Relevance': 0.15,
  'Experience & Seniority': 0.15,
  Education: 0.10,
  'Transferable Potential': 0.05,
});
const IMPORTANCE = Object.freeze({ required: 3, responsibility: 2, preferred: 1 });
const POINTS = Object.freeze({ met: 100, partial: 60, transferable: 35, unmet: 0, unknown: 0 });
const STATUS = new Set(Object.keys(POINTS));
const canon = value => String(value || '').normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();

function professionalSourceQuotes(profile) {
  return (Array.isArray(profile?.experience) ? profile.experience : []).flatMap(item => [
    item?.fieldEvidence?.title, item?.fieldEvidence?.company, item?.fieldEvidence?.duration,
    ...(item?.fieldEvidence?.highlights || []), ...(item?.sourceQuotes || []),
  ]).filter(value => typeof value === 'string' && value.trim());
}

function professionalEvidence(quote, professionalQuotes) {
  return professionalQuotes.some(workQuote => canon(workQuote).includes(canon(quote))
    || canon(quote).includes(canon(workQuote)) && workQuote.length >= 12)
    || /\b\d+(?:[.,]\d+)?\s*(?:years?|yrs?|jaar|jaren)\s+(?:of\s+)?(?:professional|commercial|work|industry|professionele|werk)\s*experience\b/iu.test(quote);
}

function explicitYears(quote) {
  const match = String(quote || '').match(/\b(\d+(?:[.,]\d+)?)\s*\+?\s*(?:years?|yrs?|jaar|jaren)\b/iu);
  return match ? Number(match[1].replace(',', '.')) : null;
}

export function scoreCapabilityEvidence(raw, jd, sourceResume, profile = null) {
  if (raw?.rubricVersion !== CAPABILITY_SCORE_VERSION || raw?.extractionComplete !== true
    || !Array.isArray(raw.requirements) || !raw.requirements.length || raw.requirements.length > 60) {
    throw new Error('Capability evidence is missing or incomplete; re-analyze this job.');
  }
  const requirements = [];
  const validationWarnings = [];
  const seenJD = new Set();
  const seenCvEvidence = new Map();
  const workQuotes = professionalSourceQuotes(profile);
  for (const [index, candidate] of raw.requirements.entries()) {
    const dimension = candidate?.dimension;
    const importance = candidate?.importance;
    if (!Object.hasOwn(CAPABILITY_WEIGHTS, dimension) || !Object.hasOwn(IMPORTANCE, importance)
      || !['Job Title', 'JD Body'].includes(candidate?.jdSource) || typeof candidate?.jdQuote !== 'string'
      || candidate.jdQuote.length > 500) {
      validationWarnings.push(`Invalid capability row ${index + 1}; ignored.`);
      continue;
    }
    const jdMatch = locateJdEvidence(candidate.jdSource === 'Job Title' ? jd?.title : jd?.description, candidate.jdQuote);
    if (!jdMatch.ok) {
      validationWarnings.push(`JD evidence failed at capability row ${index + 1}; ignored.`);
      continue;
    }
    const key = `${dimension}:${canon(jdMatch.quote)}`;
    if (seenJD.has(key)) {
      validationWarnings.push(`Repeated JD requirement at capability row ${index + 1}; ignored.`);
      continue;
    }
    seenJD.add(key);
    let status = STATUS.has(candidate.status) ? candidate.status : 'unknown';
    let localReason = '';
    const requestedQuotes = Array.isArray(candidate.resumeQuotes) ? candidate.resumeQuotes
      : typeof candidate.resumeQuote === 'string' ? [candidate.resumeQuote] : [];
    const quotesWithinLimit = requestedQuotes.length <= 3 && requestedQuotes.every(quote =>
      typeof quote === 'string' && quote.length <= 500)
      && requestedQuotes.reduce((length, quote) => length + quote.length, 0) <= 700;
    const matches = quotesWithinLimit ? requestedQuotes.map(quote => findCvEvidence(sourceResume, quote)) : [];
    if (!quotesWithinLimit || matches.some(match => !match) || status !== 'unknown' && !matches.length) {
      validationWarnings.push(`CV evidence failed at capability row ${index + 1}; treated as unknown.`);
      status = 'unknown';
      localReason = 'CV evidence could not be verified.';
    }
    const resumeQuotes = status === 'unknown' ? [] : matches.map(match => match.quote);
    if (dimension === 'Experience & Seniority' && ['met', 'partial'].includes(status)
      && !resumeQuotes.some(quote => professionalEvidence(quote, workQuotes))) {
      status = 'transferable';
      localReason = 'Professional work was not verified; related evidence is transferable only.';
      validationWarnings.push(`Professional experience was not verified at capability row ${index + 1}; capped as transferable.`);
    }
    if (dimension === 'Experience & Seniority' && status === 'met') {
      const requiredYears = explicitYears(jdMatch.quote);
      const documentedYears = resumeQuotes.map(explicitYears).filter(Number.isFinite);
      if (requiredYears !== null && documentedYears.length && Math.max(...documentedYears) < requiredYears) {
        status = 'partial';
        localReason = 'The CV documents fewer professional years than this JD requires.';
        validationWarnings.push(`Documented professional years fall below the JD minimum at capability row ${index + 1}; capped as partial.`);
      }
    }
    const reused = resumeQuotes.some(quote => seenCvEvidence.has(canon(quote))
      && seenCvEvidence.get(canon(quote)) !== dimension);
    if (reused && POINTS[status] > POINTS.transferable) {
      status = 'transferable';
      localReason = 'The same CV evidence supports another dimension; credit is capped here.';
      validationWarnings.push(`CV evidence reused across dimensions at row ${index + 1}; capped as transferable.`);
    }
    resumeQuotes.forEach(quote => seenCvEvidence.set(canon(quote), dimension));
    const reason = localReason || (typeof candidate.reason === 'string' && candidate.reason.trim()
      ? candidate.reason.trim().slice(0, 180) : 'Evidence or scope needs verification.');
    requirements.push({ dimension, importance, status, hard: candidate.hard === true && importance === 'required',
      jdSource: candidate.jdSource, jdQuote: jdMatch.quote, resumeQuotes, resumeQuote: resumeQuotes[0] || '',
      reason, points: POINTS[status], requirementWeight: IMPORTANCE[importance],
      evidenceSource: status === 'unknown' ? 'Unknown' : 'Original CV',
      evidenceKind: status === 'met' || status === 'partial' ? 'Direct' : status === 'transferable' ? 'Inferred transfer' : 'Unknown' });
  }
  if (!requirements.length) throw new Error('No verifiable capability requirements were returned; re-analyze this job.');
  let score = 0;
  let coverage = 0;
  const matchBreakdown = Object.entries(CAPABILITY_WEIGHTS).map(([itemName, weight]) => {
    const rows = requirements.filter(item => item.dimension === itemName);
    const denominator = rows.reduce((sum, item) => sum + item.requirementWeight, 0);
    const dimensionScore = denominator ? rows.reduce((sum, item) => sum + item.points * item.requirementWeight, 0) / denominator : 0;
    const dimensionCoverage = denominator ? rows.reduce((sum, item) => sum + (item.status === 'unknown' ? 0 : item.requirementWeight), 0) / denominator : 0;
    score += dimensionScore * weight;
    coverage += dimensionCoverage * weight;
    return { itemName, score: Math.round(dimensionScore), weight,
      evidence: rows.map(item => `${item.jdSource}: "${item.jdQuote}" | CV: ${item.resumeQuotes.map(quote => `"${quote}"`).join(' + ') || 'Unknown'} | ${item.reason}`),
      prosCons: { strengths: rows.filter(item => item.status === 'met').map(item => item.reason),
        gaps: rows.filter(item => ['partial', 'transferable', 'unmet'].includes(item.status)).map(item => item.reason),
        unknowns: rows.filter(item => item.status === 'unknown').map(item => item.reason) },
      confidenceImpact: rows.some(item => item.status === 'unknown') || !rows.length ? 'lower' : 'none',
      sponsorshipSignal: 'unavailable' };
  });
  const ordered = [...requirements].sort((a, b) => b.requirementWeight - a.requirementWeight);
  const strengths = ordered.filter(item => item.status === 'met').slice(0, 4).map(item => item.reason);
  const gaps = ordered.filter(item => item.status !== 'met').slice(0, 4)
    .map(item => `${item.status}: ${item.reason}`);
  const seniorityGate = requirements.some(item => item.dimension === 'Experience & Seniority'
    && item.hard && ['unknown', 'unmet', 'transferable'].includes(item.status));
  const partialSeniorityGate = requirements.some(item => item.dimension === 'Experience & Seniority'
    && item.hard && item.status === 'partial');
  const scoreCap = seniorityGate ? 59 : partialSeniorityGate ? 74 : 100;
  const overallMatchPercent = Math.min(Math.round(score), scoreCap);
  return { overallMatchPercent, matchBreakdown, strengths, gaps,
    unknowns: ordered.filter(item => item.status === 'unknown').slice(0, 4).map(item => `unknown: ${item.reason}`),
    validationWarnings,
    rubric: { version: CAPABILITY_SCORE_VERSION, mode: 'fixed-capability', evidenceCoverage: Math.round(coverage * 100),
      uncappedScore: Math.round(score), scoreCap,
      weights: { ...CAPABILITY_WEIGHTS }, requirements,
      hardConditions: requirements.filter(item => item.hard).map(item => ({ requirement: item.jdQuote, status: item.status, reason: item.reason })),
      notApplicableDimensions: Object.keys(CAPABILITY_WEIGHTS).filter(name => !requirements.some(item => item.dimension === name)),
      excludedDimensions: [], validationWarnings,
      advice: 'The score uses six fixed capability weights. Missing or unknown evidence contributes zero; review the original quotes.' } };
}

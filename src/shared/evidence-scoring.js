import { ItemNames } from './constants.js';
import { formatCandidatePreferences } from './candidate-preferences.js';
import { formatConfirmedProfileLanguages } from './resume-document.js';
import { findCvEvidence } from './cv-evidence.js';
import { locateJdEvidence } from './jd-evidence.js';

export const RUBRIC_VERSION = 'evidence-v1';
export const STATUS_POINTS = Object.freeze({
  strict: { met: 100, partial: 40, transferable: 20, unmet: 0, unknown: 0 },
  balanced: { met: 100, partial: 70, transferable: 50, unmet: 0, unknown: 0 },
  potential: { met: 100, partial: 80, transferable: 65, unmet: 0, unknown: 0 },
  'sponsorship-first': { met: 100, partial: 70, transferable: 50, unmet: 0, unknown: 0 },
});
const IMPORTANCE = { required: 3, responsibility: 2, preferred: 1 };
const normalize = value => String(value).normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
const DIMENSION_ALIASES = Object.freeze({
  [normalize(ItemNames.SKILLS)]: ItemNames.SKILLS,
  'skills and experience relevance': ItemNames.SKILLS,
  'skills experience relevance': ItemNames.SKILLS,
  [normalize(ItemNames.RESPONSIBILITY)]: ItemNames.RESPONSIBILITY,
  responsibility: ItemNames.RESPONSIBILITY,
  [normalize(ItemNames.YEARS)]: ItemNames.YEARS,
  'years experience': ItemNames.YEARS,
  'experience years': ItemNames.YEARS,
  [normalize(ItemNames.EDUCATION)]: ItemNames.EDUCATION,
  'education certifications': ItemNames.EDUCATION,
  [normalize(ItemNames.LANG_LOCATION)]: ItemNames.LANG_LOCATION,
  'language location': ItemNames.LANG_LOCATION,
});
const IMPORTANCE_ALIASES = Object.freeze({
  required: 'required',
  mandatory: 'required',
  'must-have': 'required',
  'must have': 'required',
  responsibility: 'responsibility',
  responsibilities: 'responsibility',
  preferred: 'preferred',
  'nice-to-have': 'preferred',
  'nice to have': 'preferred',
  optional: 'preferred',
});
const STATUS_ALIASES = Object.freeze({
  met: 'met',
  satisfied: 'met',
  partial: 'partial',
  partially: 'partial',
  transferable: 'transferable',
  adjacent: 'transferable',
  unmet: 'unmet',
  missing: 'unmet',
  unknown: 'unknown',
  unclear: 'unknown',
});

function canonical(value, aliases) {
  return aliases[normalize(value)] || null;
}

function booleanValue(value) {
  if (typeof value === 'boolean') return value;
  const normalized = normalize(value);
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
}

function preferenceSupportsJD(profileQuote, jdQuote) {
  if (profileQuote.startsWith('Language: ')) {
    const match = profileQuote.match(/^Language: (.+?) — (.+)$/);
    if (!match || !normalize(jdQuote).includes(normalize(match[1]))) return false;
    const requiredLevel = jdQuote.match(/\b[ABC][12]\b/i)?.[0]?.toUpperCase();
    const candidateLevel = match[2].match(/\b[ABC][12]\b/i)?.[0]?.toUpperCase();
    if (requiredLevel && (!candidateLevel || 'A1 A2 B1 B2 C1 C2'.split(' ').indexOf(candidateLevel)
      < 'A1 A2 B1 B2 C1 C2'.split(' ').indexOf(requiredLevel))) return false;
    return true;
  }
  return profileQuote === 'Relocation within Netherlands: Yes'
    && /\b(?:relocat|verhuis|verhuizen)\b/i.test(jdQuote);
}

// Validate source quotations before granting credit. Semantic entailment still needs model/user review.
export function scoreEvidence(raw, jd, resume, profile, originalResume = null) {
  if (!raw || raw.rubricVersion !== RUBRIC_VERSION || !Array.isArray(raw.requirements)
      || !raw.requirements.length || raw.requirements.length > 60 || raw.extractionComplete !== true) {
    throw new Error('Missing or incomplete requirement evidence; re-analyze instead of using guessed scores.');
  }
  const points = STATUS_POINTS[profile.promptTuningMode] || STATUS_POINTS.balanced;
  const configuredWeights = profile?.weightsApplied || {};
  const allowed = Object.keys(configuredWeights).filter(name => name !== ItemNames.SPONSORSHIP);
  // The structured profile helps the model locate evidence, but can never
  // become a source of scored facts. Only the uploaded CV can verify quotes.
  const sourceResume = originalResume ?? (typeof resume === 'string' && resume.includes('EXACT EXTRACTED RESUME SOURCE (use this section for quotation verification)')
    ? resume.split('EXACT EXTRACTED RESUME SOURCE (use this section for quotation verification)').slice(1).join('')
    : resume);
  const confirmedPreferences = [formatConfirmedProfileLanguages(profile?.profileLanguages),
    formatCandidatePreferences(profile?.candidatePreferences)].filter(Boolean).join('\n');
  const seen = new Set();
  const validationWarnings = [];
  const requirements = [];
  raw.requirements.forEach((r, index) => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) {
      validationWarnings.push(`Invalid requirement evidence at row ${index + 1}; row ignored.`);
      return;
    }
    const dimension = canonical(r.dimension, DIMENSION_ALIASES);
    const importance = canonical(r.importance, IMPORTANCE_ALIASES);
    let status = canonical(r.status, STATUS_ALIASES);
    let jdQuote = typeof r.jdQuote === 'string' ? r.jdQuote.trim().slice(0, 500) : '';
    const rawResumeQuotes = Array.isArray(r.resumeQuotes)
      ? r.resumeQuotes
      : typeof r.resumeQuote === 'string'
        ? [r.resumeQuote]
        : [];
    let resumeQuotes = rawResumeQuotes
      .filter(quote => typeof quote === 'string')
      .map(quote => quote.trim())
      .filter(Boolean);
    if (!Array.isArray(r.resumeQuotes)) {
      resumeQuotes = resumeQuotes.slice(0, 1).map(quote => quote.slice(0, 700));
    }
    let resumeQuote = resumeQuotes[0]?.slice(0, 700) || '';
    let profileQuote = typeof r.profileQuote === 'string' ? r.profileQuote.trim().slice(0, 200) : '';
    if (profileQuote && resumeQuotes.length) profileQuote = '';
    let reason = typeof r.reason === 'string' ? r.reason.trim().slice(0, 180) : '';
    let hard = booleanValue(r.hard);

    if (!dimension || !allowed.includes(dimension) || !importance || !jdQuote) {
      validationWarnings.push(`Invalid requirement evidence at row ${index + 1}; row ignored.`);
      return;
    }
    if (!status) {
      validationWarnings.push(`Unknown status at row ${index + 1}; treated as unknown.`);
      status = 'unknown';
    }
    if (!reason) {
      validationWarnings.push(`Reason missing at row ${index + 1}; treated as unknown.`);
      status = 'unknown';
      reason = 'The model did not provide an explanation for this requirement.';
    }
    if (hard === null) {
      validationWarnings.push(`Hard-condition flag invalid at row ${index + 1}; treated as false.`);
      hard = false;
    }
    if (hard && importance !== 'required') {
      validationWarnings.push(`Hard condition at row ${index + 1} was not marked required; treated as non-hard.`);
      hard = false;
    }
    if (typeof r.jdQuote === 'string' && r.jdQuote.trim().length > 500) {
      validationWarnings.push(`JD quotation truncated at row ${index + 1}.`);
    }
    if (typeof r.resumeQuote === 'string' && r.resumeQuote.trim().length > 700) {
      validationWarnings.push(`Resume quotation truncated at row ${index + 1}.`);
    }
    const resumeQuoteTotalLength = resumeQuotes.reduce((sum, quote) => sum + quote.length, 0);
    if (Array.isArray(r.resumeQuotes) && r.resumeQuotes.length > 3) {
      validationWarnings.push(`Resume quotations limited to 3 at row ${index + 1}.`);
      status = 'unknown';
      resumeQuotes = [];
      resumeQuote = '';
      reason = 'Resume evidence exceeded the maximum of three exact quotations.';
    } else if ((Array.isArray(r.resumeQuotes) && resumeQuotes.some(quote => quote.length > 500)) || resumeQuoteTotalLength > 700) {
      validationWarnings.push(`Resume quotation limit exceeded at row ${index + 1}.`);
      status = 'unknown';
      resumeQuotes = [];
      resumeQuote = '';
      reason = 'Resume evidence exceeded the quotation length limit.';
    }
    if (typeof r.reason === 'string' && r.reason.trim().length > 180) {
      validationWarnings.push(`Reason truncated at row ${index + 1}.`);
    }
    if (r.jdSource != null && !['Job Title', 'JD Body'].includes(r.jdSource)) {
      validationWarnings.push(`JD source invalid at row ${index + 1}; row ignored.`);
      return;
    }
    let jdSource = r.jdSource === 'Job Title' ? 'Job Title' : 'JD Body';
    let jdMatch = locateJdEvidence(jdSource === 'Job Title' ? jd?.title : jd?.description, jdQuote);
    if (!jdMatch.ok && r.jdSource == null) {
      jdMatch = locateJdEvidence(jd?.title, jdQuote);
      if (jdMatch.ok) jdSource = 'Job Title';
    }
    if (!jdMatch.ok) {
      validationWarnings.push(`JD quotation not found at row ${index + 1}; row ignored.`);
      return;
    }
    jdQuote = jdMatch.quote;
    if (seen.has(`${dimension}:${normalize(jdQuote)}`)) {
      validationWarnings.push(`Duplicate requirement at row ${index + 1}; row ignored.`);
      return;
    }
    seen.add(`${dimension}:${normalize(jdQuote)}`);
    const resolvedResumeQuotes = resumeQuotes.map(quote => findCvEvidence(sourceResume, quote));
    const invalidResumeQuote = resolvedResumeQuotes.some(match => !match);
    if (profileQuote && (dimension !== ItemNames.LANG_LOCATION
      || !confirmedPreferences.split('\n').includes(profileQuote)
      || /(?:Unknown|Relocation within Netherlands: No|Target work country:)/i.test(profileQuote)
      || !preferenceSupportsJD(profileQuote, jdQuote))) {
      validationWarnings.push(`User-confirmed preference could not support row ${index + 1}.`);
      profileQuote = '';
      status = 'unknown';
    }
    if (invalidResumeQuote) {
      validationWarnings.push(`Resume quotation not found at row ${index + 1}.`);
      status = 'unknown';
      resumeQuotes = [];
      resumeQuote = '';
      reason = 'Resume evidence could not be verified as an exact quotation.';
    } else if (status !== 'unknown' && !resumeQuotes.length && !profileQuote) {
      validationWarnings.push(`Resume evidence missing at row ${index + 1}.`);
      status = 'unknown';
      resumeQuotes = [];
      resumeQuote = '';
      reason = 'Resume evidence could not be verified as an exact quotation.';
    }
    if (!invalidResumeQuote && resumeQuotes.length) {
      resumeQuotes = resolvedResumeQuotes.map(match => match.quote);
      resumeQuote = resumeQuotes[0] || '';
    }
    if (status === 'unknown' && !resumeQuotes.length) {
      resumeQuote = '';
    }
    requirements.push({ dimension, importance, status,
      jdQuote, jdSource, resumeQuote, resumeQuotes, profileQuote,
      evidenceSource: profileQuote ? 'User-confirmed Profile Data' : 'Original CV', reason, hard,
      points: points[status], requirementWeight: IMPORTANCE[importance] });
  });
  const requirementsByDimension = Object.fromEntries(
    allowed.map(name => [name, requirements.filter(requirement => requirement.dimension === name)]),
  );
  const applicable = allowed.filter(name => configuredWeights[name] > 0 && requirementsByDimension[name].length);
  const weightSum = applicable.reduce((sum, name) => sum + configuredWeights[name], 0);
  if (!weightSum) throw new Error('No valid requirement evidence in the enabled scoring dimensions.');
  const weights = Object.fromEntries(applicable.map(name => [name, configuredWeights[name] / weightSum]));
  let score = 0;
  let coverage = 0;
  const matchBreakdown = allowed
    .filter(itemName => profile.weightsApplied[itemName] > 0 && requirementsByDimension[itemName].length)
    .map(itemName => {
    const rows = requirementsByDimension[itemName];
    const denominator = rows.reduce((sum, r) => sum + r.requirementWeight, 0);
    const dimensionScore = denominator ? rows.reduce((sum, r) => sum + r.points * r.requirementWeight, 0) / denominator : 0;
    const dimensionCoverage = denominator ? rows.reduce((sum, r) => sum + (r.status === 'unknown' ? 0 : r.requirementWeight), 0) / denominator : 0;
    score += dimensionScore * (weights[itemName] || 0);
    coverage += dimensionCoverage * (weights[itemName] || 0);
    const evidence = rows.map(r => {
      const resumeEvidence = r.resumeQuotes?.length
        ? r.resumeQuotes.map(quote => `"${quote}"`).join(' + ')
        : r.profileQuote ? `User-confirmed: "${r.profileQuote}"` : 'Not documented';
      return `[${r.status}; ${r.points}/100; weight ${r.requirementWeight}] ${r.jdSource}: "${r.jdQuote}" | Resume: ${resumeEvidence} | ${r.reason}`;
    });
    return { itemName, score: Math.round(dimensionScore), weight: weights[itemName] || 0,
      evidence,
      prosCons: { strengths: rows.filter(r => r.status === 'met').map(r => r.reason),
        gaps: rows.filter(r => r.status !== 'met' && r.status !== 'unknown').map(r => `${r.status}: ${r.reason}`),
        unknowns: rows.filter(r => r.status === 'unknown').map(r => `unknown: ${r.reason}`) },
      confidenceImpact: rows.some(r => r.status === 'unknown') ? 'lower' : 'none', sponsorshipSignal: 'unavailable' };
  });
  const notApplicableDimensions = allowed.filter(name => !requirementsByDimension[name].length);
  const excludedDimensions = allowed.filter(name => requirementsByDimension[name].length && !applicable.includes(name));
  const hardConditions = requirements.filter(r => r.hard).map(r => ({ requirement: r.jdQuote, status: r.status, reason: r.reason }));
  const overallMatchPercent = Math.round(score);
  const evidenceCoverage = Math.round(coverage * 100);
  const gapRows = requirements.filter(r => r.status !== 'met' && r.status !== 'unknown');
  const unknownRows = requirements.filter(r => r.status === 'unknown');
  return { overallMatchPercent, matchBreakdown, validationWarnings,
    strengths: requirements.filter(r => r.status === 'met').slice(0, 4).map(r => r.reason),
    gaps: gapRows.slice(0, 6).map(r => `${r.status}: ${r.reason}`),
    unknowns: unknownRows.slice(0, 6).map(r => `unknown: ${r.reason}`),
    sponsorshipAssessment: { conclusion: 'Sponsorship is assessed separately from capability fit.', evidence: [],
      confidence: 'low', uncertaintyNote: 'Registry membership does not establish sponsorship for this vacancy.',
      sponsorshipImpactOnOverall: 'noChange', country: 'Unknown', indRegistered: null },
    rubric: { version: RUBRIC_VERSION, mode: profile.promptTuningMode, evidenceCoverage, weights,
      excludedDimensions, notApplicableDimensions, requirements, hardConditions,
      validationWarnings,
      advice: hardConditions.some(r => r.status === 'unmet') ? 'Review explicit hard-condition mismatch before applying.'
        : hardConditions.some(r => r.status === 'unknown' || r.status === 'partial' || r.status === 'transferable')
          ? 'Confirm the unresolved hard conditions before applying.'
            : evidenceCoverage < 70 ? 'Add missing evidence before relying on this score.'
              : 'Review the supported matches and gaps when deciding whether to apply.' } };
}

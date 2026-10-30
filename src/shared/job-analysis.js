import { JOB_ANALYSIS_VERSION } from './career-level-display.js';
import { locateJdEvidence } from './jd-evidence.js';
export { JOB_ANALYSIS_VERSION };

const LEVELS = new Set(['Entry', 'Junior', 'Early Career', 'Mid', 'Senior', 'Lead', 'New Graduate', 'Borderline', 'Experienced', 'Unknown']);
const TYPES = new Set(['Mandatory', 'Preferred', 'Optional', 'Mentioned Only', 'Not Specified', 'Unknown']);
const LANGUAGES = [
  ['English', /\b(?:english|engels)\b/iu],
  ['Dutch', /\b(?:dutch|nederlands|nederlandse|nederlandstalig)\b/iu],
  ['German', /\b(?:german|deutsch|duits)\b/iu],
  ['French', /\b(?:french|fran[cç]ais|frans)\b/iu],
  ['Spanish', /\b(?:spanish|espa[nñ]ol|spaans)\b/iu],
  ['Italian', /\b(?:italian|italiano|italiaans)\b/iu],
  ['Portuguese', /\b(?:portuguese|portugu[eê]s|portugees)\b/iu],
  ['Chinese', /\b(?:chinese|mandarin|cantonese|chinees)\b/iu],
  ['Japanese', /\b(?:japanese|japans)\b/iu],
  ['Polish', /\b(?:polish|pools)\b/iu],
  ['Swedish', /\b(?:swedish|zweeds)\b/iu],
  ['Arabic', /\b(?:arabic|arabisch)\b/iu],
  ['Turkish', /\b(?:turkish|turks)\b/iu],
  ['Hindi', /\bhindi\b/iu],
  ['Russian', /\b(?:russian|russisch)\b/iu],
  ['Ukrainian', /\b(?:ukrainian|oekrai[eï]ns)\b/iu],
  ['Korean', /\b(?:korean|koreaans)\b/iu],
  ['Danish', /\b(?:danish|deens)\b/iu],
  ['Norwegian', /\b(?:norwegian|noors)\b/iu],
];
const PREFERRED = /\b(?:preferred|preference|plus|beneficial|nice[ -]to[ -]have|desirable|advantage|pré|pre|voordeel|wenselijk)\b/iu;
const MANDATORY = /\b(?:required|require|mandatory|must|fluent|fluency|proficient|native|business.level|excellent.command|vereist|verplicht|vloeiend|beheersing)\b/iu;
const EXPLICIT_LANGUAGE_OBLIGATION = /\b(?:required|require|mandatory|must|vereist|verplicht)\b/iu;
const YEAR_NUMBER = '(\\d{1,2}(?:[.,]\\d+)?)';
const YEAR_UNIT = '(?:years?|yrs?|jaar|jaren)';
const YEAR = new RegExp(`(?<![\\d.,])${YEAR_NUMBER}\\s*(?:\\+|plus)?\\s*${YEAR_UNIT}\\b`, 'iu');
const YEAR_RANGE = new RegExp(`(?<![\\d.,])${YEAR_NUMBER}\\s*(?:-|–|—|to|tot)\\s*${YEAR_NUMBER}\\s*${YEAR_UNIT}\\b`, 'iu');
const YEAR_WORD = /\b(?:anderhalf\s+jaar|one and a half years?|half a year|een half jaar)\b/iu;
const EXPERIENCE_CONTEXT = /\b(?:experience|ervaring|werkervaring|professional|professionele|werk|work|working)\b/iu;
const REQUIREMENT_CONTEXT = /\b(?:required|requires?|mandatory|must|minimum|at least|preferred|preference|minimaal|ten minste|vereist|verplicht|gevraagd|nodig)\b/iu;
const NON_CANDIDATE_CONTEXT = /\b(?:vacation|holiday|holidays|benefits?|salary|salaris|loon|vakantiedagen|vakantie|verhoging|raise|pay growth|pay increase|salarisgroeimodel|opleiding|training|traineeship|coaching|programme|program|traject|founded|established|opgericht|launched|released)\b/iu;
const ORGANIZATION_EXPERIENCE = /\b(?:we|our company|our team|the company|wij|ons bedrijf|onze organisatie|het bedrijf)\b.{0,60}\b(?:have|has|hebben|heeft|with|met)\b.{0,30}(?:\d{1,3}(?:[.,]\d+)?\s*(?:years?|jaar|jaren))/iu;
const GRADUATE_SIGNAL = /\b(?:new|recent|fresh) graduates?\b|\bgraduate (?:programme|program|scheme|trainee|role|track)\b|\bstudents?\s*\/\s*graduates?\b|\b(?:net|pas|recent) afgestudeerd(?:en)?\b|\bafgestudeerden\b/iu;
const JUNIOR_SIGNAL = /\b(?:junior|entry[ -]level|starter|starters|beginnend)\b/iu;
const SENIOR_SIGNAL = /\b(?:senior|lead(?:ing)? (?:a |the )?team|lead(?:ing)? (?:the )?architecture|team leadership|architect(?:ure)? ownership|principal|staff engineer)\b/iu;

function yearNumber(value) {
  return Number(String(value).replace(',', '.'));
}

function statedYears(quote) {
  const range = quote.match(YEAR_RANGE);
  if (range) return { minimumYears: yearNumber(range[1]), maximumYears: yearNumber(range[2]) };
  const year = quote.match(YEAR);
  if (year) {
    const months = quote.slice(year.index + year[0].length).match(/^\s*(?:and|en)\s*(\d{1,2})\s*(?:months?|maanden)\b/iu);
    return { minimumYears: yearNumber(year[1]) + (months ? Number(months[1]) / 12 : 0), maximumYears: null };
  }
  const word = quote.match(YEAR_WORD);
  return word ? { minimumYears: /\b(?:half a year|een half jaar)\b/iu.test(word[0]) ? 0.5 : 1.5, maximumYears: null } : null;
}

function isCandidateExperienceRequirement(quote) {
  if (NON_CANDIDATE_CONTEXT.test(quote) || ORGANIZATION_EXPERIENCE.test(quote)) return false;
  return EXPERIENCE_CONTEXT.test(quote) || REQUIREMENT_CONTEXT.test(quote);
}

function evidenceContext(source, quote) {
  return sentences(source).find(sentence => sentence.includes(quote)) || quote;
}

function sentences(source) {
  return source.split(/(?<=[.!?;])\s+|\n+/u).map(part => part.trim()).filter(Boolean);
}

function exactQuote(source, quote) {
  return locateJdEvidence(source, quote).ok;
}

function verifiedEvidence(jdData, values, limit = 4, failures = []) {
  const title = jdData?.title || '';
  const body = jdData?.description || '';
  const recordFailure = (source, reason) => {
    failures.push(reason);
    if (jdData?.evidenceFailures) {
      const key = `${source}:${reason}`;
      jdData.evidenceFailures[key] = (jdData.evidenceFailures[key] || 0) + 1;
    }
  };
  return (Array.isArray(values) ? values : []).slice(0, limit).map(item => {
    const quote = typeof item === 'string' ? item : item?.quote;
    const requestedSource = typeof item === 'string' ? 'JD Body' : item?.source;
    if (!['Job Title', 'JD Body'].includes(requestedSource)) {
      recordFailure('Unknown source', 'SOURCE_INVALID');
      return null;
    }
    const match = locateJdEvidence(requestedSource === 'Job Title' ? title : body, quote);
    if (!match.ok) {
      recordFailure(requestedSource, match.reason);
      return null;
    }
    return { source: requestedSource, quote: match.quote };
  }).filter(Boolean);
}

function quotes(evidence) { return evidence.map(item => item.quote); }

function verifiedJdLanguage(jdData, raw) {
  if (!['English', 'Dutch', 'Chinese', 'Mixed', 'Other', 'Unknown'].includes(raw?.jdLanguage)) return null;
  if (raw.jdLanguage === 'Unknown') return { language: 'Unknown', evidence: [] };
  const evidence = verifiedEvidence(jdData, raw.jdLanguageEvidence, 2).filter(item => item.source === 'JD Body');
  if (raw.jdLanguage === 'Chinese' && !evidence.some(item => /[\u4e00-\u9fff]/u.test(item.quote))) return null;
  if (raw.jdLanguage === 'Mixed' && evidence.length < 2) return null;
  return evidence.length ? { language: raw.jdLanguage, evidence } : null;
}

function modelCareer(jdData, raw) {
  if (!raw || !LEVELS.has(raw.level)) return null;
  if (raw.level === 'Unknown') return { level: 'Unknown', confidence: 'Unknown', reasons: [], supportingEvidence: [], conflictingEvidence: [], evidenceSources: [] };
  const evidence = verifiedEvidence(jdData, raw.supportingEvidence).filter(item =>
    (!NON_CANDIDATE_CONTEXT.test(evidenceContext(item.source === 'Job Title' ? jdData.title : jdData.description, item.quote))
      || /\b(?:graduate|junior|trainee|traineeship|young professional|entry.level|starter|student|afgestudeerd)\b/iu.test(item.quote))
    && /\b(?:graduate|graduat|junior|trainee|traineeship|young professional|entry.level|starter|early.career|student|senior|lead|principal|staff|architect|experience|ervaring|werkervaring|afgestudeerd|years?|jaar|jaren|internship|stage)\b/iu.test(item.quote));
  if (!evidence.length) return null;
  const combined = evidence.map(item => item.quote).join(' ');
  if (raw.level === 'Experienced' && !/(?:senior|lead|principal|staff|architect|(?:[4-9]|[1-3][0-9])\s*(?:\+?\s*)?(?:years?|jaar|jaren))/iu.test(combined)) return null;
  const conflicts = verifiedEvidence(jdData, raw.conflictingEvidence);
  return { level: raw.level, confidence: evidenceConfidence(`${jdData?.title || ''}\n${jdData?.description || ''}`, quotes(evidence)),
    reasons: Array.isArray(raw.reasons) ? raw.reasons.filter(value => typeof value === 'string').slice(0, 3).map(value => value.slice(0, 220)) : [],
    supportingEvidence: quotes(evidence), conflictingEvidence: quotes(conflicts), evidenceSources: evidence };
}

function modelLanguages(jdData, raw) {
  if (!raw || !Array.isArray(raw.items)) return null;
  const items = [];
  for (const candidate of raw.items.slice(0, 12)) {
    const known = LANGUAGES.find(([name]) => name.toLowerCase() === String(candidate?.language).toLowerCase());
    if (!known || !TYPES.has(candidate.requirementType)) continue;
    const evidence = verifiedEvidence(jdData, candidate.supportingEvidence, 3).filter(item =>
      known[1].test(item.quote) && (candidate.requirementType !== 'Mandatory'
        || !/\b(?:not required|not mandatory|geen vereiste|niet vereist)\b/iu.test(item.quote)));
    if (!evidence.length) continue;
    if (candidate.requirementType === 'Mandatory' && evidence.every(item =>
      PREFERRED.test(item.quote) && !EXPLICIT_LANGUAGE_OBLIGATION.test(item.quote))) continue;
    if (candidate.requirementType === 'Mandatory' && evidence.every(item =>
      /\b(?:willing to learn|open to learn|actively learning|bereid (?:om )?te leren|leren van nederlands)\b/iu.test(item.quote)
      && !/\b(?:required|mandatory|must|vereist|verplicht|fluent|vloeiend)\b/iu.test(item.quote))) continue;
    items.push({ language: known[0], requirementType: candidate.requirementType,
      supportingEvidence: quotes(evidence), evidenceSources: evidence });
  }
  const relation = ['AND', 'OR', 'None'].includes(raw.relation) ? raw.relation : 'None';
  const mandatory = items.filter(item => item.requirementType === 'Mandatory');
  const sharedQuote = mandatory.length >= 2 ? mandatory[0].supportingEvidence.find(quote =>
    mandatory.some(other => other !== mandatory[0] && other.supportingEvidence.includes(quote))) : null;
  const explicitAnd = sharedQuote && /\b(?:and|en)\b/iu.test(sharedQuote)
    && !/\b(?:or|(?:Dutch|Nederlands|English|Engels)\s+of\s+(?:Dutch|Nederlands|English|Engels))\b/iu.test(sharedQuote);
  return { relation: mandatory.length < 2 ? 'None' : explicitAnd ? 'AND' : relation, items };
}

function modelExperience(jdData, raw) {
  if (!raw || !Array.isArray(raw.items)) return null;
  const items = [];
  for (const candidate of raw.items.slice(0, 15)) {
    if (!['Mandatory', 'Preferred'].includes(candidate?.requirementType)
      || !Number.isFinite(candidate.minimumYears) || candidate.minimumYears < 0 || candidate.minimumYears > 40) continue;
    const evidence = verifiedEvidence(jdData, candidate.supportingEvidence, 2).filter(item => {
      const context = evidenceContext(item.source === 'Job Title' ? jdData.title : jdData.description, item.quote);
      const stated = statedYears(item.quote) || statedYears(context);
      const strongCandidate = /\b(?:you\s+(?:have|bring|possess|need)|minimum|at least|minimaal|ten minste|vereist|required|relevant (?:work )?experience|werkervaring)\b/iu.test(context);
      return stated && stated.minimumYears === candidate.minimumYears
        && EXPERIENCE_CONTEXT.test(context)
        && (!NON_CANDIDATE_CONTEXT.test(context) || strongCandidate);
    });
    if (!evidence.length) continue;
    const contextual = evidenceContext(evidence[0].source === 'Job Title' ? jdData.title : jdData.description, evidence[0].quote);
    const years = statedYears(evidence[0].quote) || statedYears(contextual);
    if (candidate.maximumYears != null && candidate.maximumYears !== years.maximumYears) continue;
    items.push({ minimumYears: years.minimumYears, maximumYears: years.maximumYears,
      requirementType: candidate.requirementType,
      experienceKind: ['Professional', 'Commercial', 'Research', 'Academic', 'Internship', 'Unspecified'].includes(candidate.experienceKind) ? candidate.experienceKind : experienceKind(contextual),
      experienceDomain: typeof candidate.experienceDomain === 'string' ? candidate.experienceDomain.slice(0, 80) : '',
      supportingEvidence: quotes(evidence), evidenceSources: evidence });
  }
  const acceptedAlternatives = verifiedEvidence(jdData, raw.acceptedAlternatives, 5).filter(item =>
    /\b(?:internship|academic|research|project|stage)\b/iu.test(item.quote));
  return { items, acceptedAlternatives: quotes(acceptedAlternatives) };
}

function modelEvidenceList(jdData, value, limit = 12) {
  return (Array.isArray(value) ? value : []).slice(0, limit).map(item => {
    const evidence = verifiedEvidence(jdData, item?.supportingEvidence, 2);
    const label = typeof item?.summary === 'string' ? item.summary : item?.label;
    return typeof label === 'string' && label.trim() && evidence.length
      ? { label: label.trim().slice(0, 240), supportingEvidence: quotes(evidence), evidenceSources: evidence } : null;
  }).filter(Boolean);
}

function responsibilitySection(source, quote) {
  const offset = source.indexOf(quote);
  if (offset < 0) return 'unknown';
  let section = 'unknown';
  for (const rawLine of source.slice(0, offset).split('\n')) {
    const line = rawLine.trim().replace(/[?:]+$/u, '');
    if (line.length > 90 || /[.!;]$/u.test(line)) continue;
    if (/^(?:jouw start bij\b|onboarding\b|training(?: and development)?\b|opleiding(?:straject)?\b)/iu.test(line)) section = 'training';
    else if (/^(?:benefits?\b|what we offer\b|wat wij bieden\b|arbeidsvoorwaarden\b|zo ondersteunen wij jou\b)/iu.test(line)) section = 'benefits';
    else if (/^(?:about the company\b|over (?:het bedrijf|ons)\b|meer over \b|company (?:profile|introduction)\b)/iu.test(line)) section = 'company';
    else if (/^(?:requirements?\b|qualifications?\b|jouw talenten\b|what you bring\b|wie ben jij\b)/iu.test(line)) section = 'requirements';
    else if (/^(?:about the job\b|over de (?:functie|vacature)\b|werken als\b|what you(?:'ll| will) do\b|your role\b|responsibilities\b|de functie\b|wat ga je doen\b|dit ga je doen\b|jouw rol\b)/iu.test(line)) section = 'work';
  }
  return section;
}

function fallbackListedResponsibilities(jdData, existing) {
  const source = jdData?.description || '';
  const lines = source.split('\n');
  let section = 'unknown';
  const items = [];
  const seen = new Set(existing.flatMap(item => item.supportingEvidence || []).map(quote => quote.trim().toLowerCase()));
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^(?:jouw start bij\b|onboarding\b|training(?: and development)?\b|opleiding(?:straject)?\b|benefits?\b|what we offer\b|we offer\b|wat wij bieden\b|arbeidsvoorwaarden\b|about the company\b|over (?:het bedrijf|ons)\b|requirements?\b|required skills\b|qualifications?\b|jouw talenten\b|what you bring\b|who you are\b|wat breng je mee\b|wie ben jij\b)/iu.test(line)) section = 'excluded';
    else if (/^(?:je top \d+ werkzaamheden\b|about the job\b|over de (?:functie|vacature)\b|werken als\b|what you(?:'ll| will) do\b|your role\b|responsibilities\b|de functie\b|wat ga je doen\b|dit ga je doen\b|jouw rol\b)/iu.test(line)) section = 'work';
    else if (section === 'work') {
      const duty = line.replace(/^(?:[-*•]|\d+[.)])\s*/u, '').trim();
      const listed = /^[-*•]|^\d+[.)]/u.test(line);
      const action = /^(?:build|develop|design|deploy|maintain|manage|create|implement|integrate|monitor|evaluate|collaborate|work with|ontwerpen|ontwikkelen|bouwen|integreren|evalueren|monitoren|samenwerken|zorgdragen|realiseren)\b/iu.test(duty);
      if ((!listed && !action) || duty.length < 4 || duty.length > 400 || seen.has(duty.toLowerCase())) continue;
      const located = locateJdEvidence(source, duty);
      if (!located.ok) continue;
      seen.add(duty.toLowerCase());
      items.push({ label: located.quote, mode: 'extract', supportingEvidence: [located.quote],
        evidenceSources: [{ source: 'JD Body', quote: located.quote }] });
    }
  }
  return items.slice(0, 30);
}

function unsupportedTechnicalTerms(summary, evidence) {
  // A surface guard for explicit technology names; semantic scope is supplied by
  // the model's claim-level quotations, not inferred from a keyword classifier.
  const covered = evidence.map(item => item.quote).join(' ').toLocaleLowerCase();
  const terms = summary.match(/\b(?:[A-Z]{2,}(?:\/[A-Z]{2,})*|[A-Z][a-z]+|[A-Za-z]+\/[A-Za-z]+)\b/gu) || [];
  return [...new Set(terms.filter((term, index) =>
    (index > 0 || /^[A-Z]{2}/u.test(term))
    && !/^(?:The|And|With|For|You|Your|Build|Develop|Manage|Design|Implement|Work|Use|Create|Support|Deliver|Maintain|Improve|Collaborate|Ensure|Lead)$/u.test(term)
    && !covered.includes(term.toLocaleLowerCase())
    && !(term === 'ML' && covered.includes('machine learning'))
    && !(term === 'AI' && covered.includes('artificial intelligence'))
    && !(term === 'LLM' && covered.includes('large language model'))))];
}

function modelResponsibilities(jdData, value, requireClaims = false, analysisLanguage = 'en') {
  const source = jdData?.description || '';
  const diagnostics = { MODEL_FIELD_MISSING: 0, MODEL_SCHEMA_INVALID: 0,
    EVIDENCE_MATCH_FAILED: 0, EVIDENCE_INSUFFICIENT: 0, VALIDATED: 0, FALLBACK_VERIFIED: 0,
    outcome: 'model_missing', reasons: {} };
  const rejected = (status, reason) => {
    diagnostics[status] += 1;
    diagnostics.reasons[reason] = (diagnostics.reasons[reason] || 0) + 1;
    return null;
  };
  if (!Array.isArray(value)) rejected(value == null ? 'MODEL_FIELD_MISSING' : 'MODEL_SCHEMA_INVALID', 'FIELD_NOT_ARRAY');
  else if (!value.length) rejected('MODEL_FIELD_MISSING', 'FIELD_EMPTY');
  const items = (Array.isArray(value) ? value : []).slice(0, 30).map(item => {
    const label = typeof item?.summary === 'string' ? item.summary.trim().slice(0, 240) : '';
    let displayLabel = label;
    const mode = ['extract', 'summarize', 'merge'].includes(item?.mode) ? item.mode : 'summarize';
    if (!label || !Array.isArray(item?.supportingEvidence)) return rejected('MODEL_SCHEMA_INVALID', 'ITEM_SHAPE');
    if (requireClaims && mode !== 'extract' && (!Array.isArray(item.supportedClaims) || !item.supportedClaims.length)) {
      return rejected('MODEL_SCHEMA_INVALID', 'CLAIMS_REQUIRED');
    }
    const failures = [];
    const evidence = verifiedEvidence(jdData, item.supportingEvidence, 6, failures)
      .filter(entry => entry.source === 'JD Body'
        && !['training', 'benefits', 'company', 'requirements'].includes(responsibilitySection(source, entry.quote)));
    if (!evidence.length) return failures.length
      ? rejected('EVIDENCE_MATCH_FAILED', failures[0])
      : rejected('EVIDENCE_INSUFFICIENT', 'NO_WORK_DUTY_EVIDENCE');
    if (mode === 'extract') {
      if (evidence.length !== 1) return rejected('EVIDENCE_INSUFFICIENT', 'EXTRACT_REQUIRES_ONE_QUOTE');
      displayLabel = evidence[0].quote;
    } else if (Array.isArray(item.supportedClaims)) {
      if (!item.supportedClaims.length) return rejected('EVIDENCE_INSUFFICIENT', 'CLAIMS_EMPTY');
      const verifiedClaims = [];
      for (const claim of item.supportedClaims) {
        if (typeof claim?.claim !== 'string' || !claim.claim.trim() || !Array.isArray(claim.supportingEvidence)) {
          return rejected('MODEL_SCHEMA_INVALID', 'CLAIM_SHAPE');
        }
        const claimFailures = [];
        const claimEvidence = verifiedEvidence(jdData, claim.supportingEvidence, 3, claimFailures)
          .filter(entry => entry.source === 'JD Body'
            && evidence.some(itemEvidence => itemEvidence.quote === entry.quote));
        if (!claimEvidence.length) return rejected(claimFailures.length ? 'EVIDENCE_MATCH_FAILED' : 'EVIDENCE_INSUFFICIENT',
          claimFailures[0] || 'CLAIM_UNSUPPORTED');
        if (unsupportedTechnicalTerms(claim.claim, claimEvidence).length) {
          return rejected('EVIDENCE_INSUFFICIENT', 'CLAIM_TECHNOLOGY_UNSUPPORTED');
        }
        verifiedClaims.push(claim.claim.trim());
      }
      // Display only the verified claim text. An unsupported generic clause in
      // the model's overarching summary cannot become a verified assertion.
      displayLabel = verifiedClaims.join('; ').slice(0, 240);
    }
    if (mode !== 'extract' && unsupportedTechnicalTerms(label, evidence).length) {
      return rejected('EVIDENCE_INSUFFICIENT', 'SUMMARY_TECHNOLOGY_UNSUPPORTED');
    }
    const localized = typeof item.displayText === 'string' ? item.displayText.trim() : '';
    const displayLanguage = item.displayLanguage === analysisLanguage ? analysisLanguage : null;
    const languageLooksRight = analysisLanguage === 'zh-CN' ? /[\u3400-\u9fff]/u.test(localized)
      : !/[\u3400-\u9fff]/u.test(localized);
    const displayText = displayLanguage && localized && languageLooksRight
      && !unsupportedTechnicalTerms(localized, evidence).length ? localized : null;
    diagnostics.VALIDATED += 1;
    return { label: displayLabel, mode, displayText, displayLanguage: displayText ? displayLanguage : null,
      supportingEvidence: quotes(evidence), evidenceSources: evidence };
  }).filter(Boolean);
  // The model selects semantic duties. A failed summary must not discard an
  // otherwise located work quote; a clear work list is a conservative fallback.
  if (diagnostics.VALIDATED < 2 && diagnostics.MODEL_FIELD_MISSING + diagnostics.MODEL_SCHEMA_INVALID
    + diagnostics.EVIDENCE_INSUFFICIENT + diagnostics.EVIDENCE_MATCH_FAILED > 0) {
    const fallback = fallbackListedResponsibilities(jdData, items);
    const seen = new Set([...items, ...fallback].flatMap(item => item.supportingEvidence).map(quote => quote.toLowerCase()));
    for (const candidate of Array.isArray(value) ? value : []) {
      for (const evidence of (Array.isArray(candidate?.supportingEvidence) ? candidate.supportingEvidence : [])
        .slice(0, 10).map(item => {
          if (item?.source !== 'JD Body') return null;
          const match = locateJdEvidence(source, item.quote);
          return match.ok ? { source: 'JD Body', quote: match.quote } : null;
        }).filter(Boolean)
        .filter(entry => entry.source === 'JD Body' && entry.quote.length <= 400
          && responsibilitySection(source, entry.quote) === 'work')) {
        if (seen.has(evidence.quote.toLowerCase())) continue;
        seen.add(evidence.quote.toLowerCase());
        fallback.push({ label: evidence.quote, mode: 'extract', supportingEvidence: [evidence.quote],
          evidenceSources: [evidence] });
      }
    }
    items.push(...fallback);
    diagnostics.FALLBACK_VERIFIED = fallback.length;
  }
  diagnostics.outcome = diagnostics.VALIDATED && diagnostics.FALLBACK_VERIFIED === 0
    && !diagnostics.MODEL_SCHEMA_INVALID && !diagnostics.EVIDENCE_MATCH_FAILED && !diagnostics.EVIDENCE_INSUFFICIENT
    ? 'success' : diagnostics.VALIDATED || diagnostics.FALLBACK_VERIFIED ? 'partial_valid'
      : diagnostics.MODEL_FIELD_MISSING ? 'model_missing' : diagnostics.MODEL_SCHEMA_INVALID ? 'schema_invalid'
        : diagnostics.EVIDENCE_MATCH_FAILED ? 'quote_failed' : 'no_verified_duties';
  return { items, diagnostics };
}

const PERMIT_AVAILABLE = /\b(?:provide|offer|sponsor|facilitate|ondersteunen|regelen)\b.{0,35}\b(?:visas?|work permits?|werkvergunning|sponsorship|visum)\b|\b(?:visas?|work permits?|werkvergunning|sponsorship|visum)\b.{0,25}\b(?:provided|available|offered|ondersteund)\b/iu;
const PERMIT_UNAVAILABLE = /\b(?:unable|cannot|can't|do not|don't|not able)\s+(?:to\s+)?(?:provide|offer|sponsor|support)\b.{0,35}\b(?:visas?|work permits?|sponsorship)\b|\bno\s+(?:visa\s+|work.permit\s+)?sponsorship\b|\b(?:visas?|work permits?|sponsorship)\b.{0,25}\b(?:not available|not provided|cannot be provided)\b|\b(?:geen|niet)\s+(?:visa|visum|werkvergunning|sponsorship|sponsoring)\b/iu;
const PERMIT_EXISTING = /\b(?:must|need to|requires?|already|existing|moet|dient|vereist)\b.{0,70}\b(?:right to work|work authori[sz]ation|work permits?|werkvergunning|EU citizenship|EU passport)\b|\b(?:right to work|work authori[sz]ation|work permits?|werkvergunning)\b.{0,45}\b(?:required|mandatory|already|existing|vereist|nodig)\b/iu;
const PERMIT_RELEVANT = /\b(?:visas?|visum|sponsorship|sponsor|work permits?|werkvergunning|work authori[sz]ation|right to work|EU citizenship|EU passport)\b/iu;

function classifyPermitQuote(quote) {
  if (PERMIT_UNAVAILABLE.test(quote)) return 'Explicitly Unavailable';
  if (PERMIT_EXISTING.test(quote)) return 'Existing Authorization Required';
  if (PERMIT_AVAILABLE.test(quote)) return 'Explicitly Available';
  return null;
}

function workPermitSponsorship(jdData, raw) {
  const statuses = new Set(['Explicitly Available', 'Explicitly Unavailable',
    'Existing Authorization Required', 'Unclear', 'Not Specified']);
  const source = jdData?.description || '';
  const evidence = verifiedEvidence(jdData, raw?.supportingEvidence, 6)
    .filter(item => item.source === 'JD Body' && PERMIT_RELEVANT.test(item.quote));
  const signals = [...new Set(evidence.map(item => classifyPermitQuote(item.quote)).filter(Boolean))];
  const allExplicit = sentences(source).filter(sentence => sentence.length <= 500)
    .map(sentence => ({ sentence, status: classifyPermitQuote(sentence) })).filter(item => item.status);
  const allStatuses = [...new Set(allExplicit.map(item => item.status))];
  const hasOfferConflict = allStatuses.includes('Explicitly Available') && allStatuses.length > 1;
  if (hasOfferConflict || (allStatuses.includes('Explicitly Unavailable')
    && allStatuses.includes('Existing Authorization Required'))) {
    const conflictEvidence = allExplicit.slice(0, 4).map(item => ({ source: 'JD Body', quote: item.sentence }));
    return { status: hasOfferConflict ? 'Unclear' : 'Explicitly Unavailable',
      reason: hasOfferConflict ? 'Conflicting work-permit or sponsorship wording; verify with the employer.'
        : 'The JD states sponsorship is unavailable and applicants need existing authorization.',
      supportingEvidence: quotes(conflictEvidence), evidenceSources: conflictEvidence };
  }
  if (statuses.has(raw?.status) && raw.status !== 'Not Specified' && evidence.length) {
    const conflict = signals.length > 1 || (signals.length && raw.status !== 'Unclear' && !signals.includes(raw.status));
    const status = conflict ? 'Unclear' : raw.status === 'Unclear' || signals.includes(raw.status) ? raw.status : 'Unclear';
    return { status, reason: conflict ? 'Conflicting work-permit or sponsorship wording; verify with the employer.'
      : String(raw.reason || '').slice(0, 240), supportingEvidence: quotes(evidence), evidenceSources: evidence };
  }
  // Only unmistakable vacancy-level statements are recoverable without a model field.
  // Generic "visa", relocation, IND registration and location never determine status.
  const candidates = allExplicit;
  const distinct = [...new Set(candidates.map(item => item.status))];
  if (!candidates.length) return { status: 'Not Specified', reason: '', supportingEvidence: [], evidenceSources: [] };
  const selected = candidates.slice(0, 4).map(item => ({ source: 'JD Body', quote: item.sentence }));
  return { status: distinct.length === 1 ? distinct[0] : 'Unclear',
    reason: distinct.length === 1 ? 'The JD explicitly states this work-permit condition.'
      : 'Conflicting work-permit or sponsorship wording; verify with the employer.',
    supportingEvidence: quotes(selected), evidenceSources: selected };
}

function experienceKind(quote) {
  if (/\b(?:internship|internships|stage|stages)\b/iu.test(quote)) return 'Internship';
  if (/\b(?:academic|academisch|research|onderzoek|projects?)\b/iu.test(quote)) return 'Academic';
  if (/\b(?:professional|work|working|werkervaring)\b/iu.test(quote)) return 'Professional';
  return 'Unspecified';
}

function evidenceConfidence(source, evidence) {
  const spans = [...new Set(evidence)].map(quote => ({ start: source.indexOf(quote), end: source.indexOf(quote) + quote.length }));
  return spans.some((first, index) => spans.some((second, other) => index !== other
    && (first.end <= second.start || second.end <= first.start))) ? 'High' : 'Medium';
}

export function detectJdLanguage(description) {
  const text = typeof description === 'string' ? description : '';
  if (!text.trim()) return 'Unknown';
  const english = (text.match(/\b(?:the|and|with|for|you|your|experience|requirements|we|are|will|in|is|a|work|role|required|require|preferred|fluent)\b/giu) || []).length;
  const dutch = (text.match(/\b(?:de|het|een|en|van|voor|met|ervaring|wij|zijn|werkzaamheden|jij|bent|vereist|vloeiend|zoeken|functie|moet)\b/giu) || []).length;
  if (english >= 2 && dutch >= 2 && Math.min(english, dutch) / Math.max(english, dutch) >= 0.35) return 'Mixed';
  if (dutch >= 2 && dutch > english) return 'Dutch';
  if (english >= 2) return 'English';
  if ((text.match(/\b(?:der|die|das|und|pour|avec|nous|vous|para|con|los)\b/giu) || []).length >= 2) return 'Other';
  return 'Unknown';
}

export function extractLanguageRequirements(description) {
  const source = typeof description === 'string' ? description : '';
  const items = [];
  const clauses = sentences(source).flatMap(sentence => sentence.split(/,\s*(?=(?:English|Dutch|Nederlands|German|French|Spanish|Italian|Portuguese|Chinese|Japanese|Polish|Swedish|Arabic|Turkish|Hindi|Russian|Ukrainian|Korean|Danish|Norwegian)\b)/iu).map(part => part.trim()).filter(Boolean));
  for (const sentence of clauses) {
    const mentioned = LANGUAGES.filter(([, pattern]) => pattern.test(sentence));
    if (!mentioned.length) continue;
    const type = PREFERRED.test(sentence) && !EXPLICIT_LANGUAGE_OBLIGATION.test(sentence) ? 'Preferred'
      : MANDATORY.test(sentence) ? 'Mandatory' : PREFERRED.test(sentence) ? 'Preferred' : 'Mentioned Only';
    const minimumProficiency = sentence.match(/\b(?:minimaal|minimum|at least)\s+(C[12]|B[12]|A[12])(?:[- ]?(?:niveau|level))?\b/iu)?.[1]?.toUpperCase() || null;
    for (const [language] of mentioned) {
      const prior = items.find(item => item.language === language);
      const rank = { Mandatory: 3, Preferred: 2, 'Mentioned Only': 1 };
      if (!prior) items.push({ language, requirementType: type, minimumProficiency, supportingEvidence: [sentence] });
      else if (rank[type] > rank[prior.requirementType]) {
        prior.requirementType = type;
        prior.minimumProficiency = minimumProficiency;
        prior.supportingEvidence = [sentence];
      } else if (rank[type] === rank[prior.requirementType] && !prior.supportingEvidence.includes(sentence)) {
        prior.supportingEvidence.push(sentence);
        prior.minimumProficiency ||= minimumProficiency;
      }
    }
  }
  const mandatory = items.filter(item => item.requirementType === 'Mandatory');
  const joint = clauses.find(sentence => mandatory.filter(item => item.supportingEvidence.includes(sentence)).length >= 2);
  const relation = joint && (/\bor\b/iu.test(joint)
    || /\b(?:Dutch|Nederlands|English|Engels)\s+of\s+(?:Dutch|Nederlands|English|Engels)\b/iu.test(joint)) ? 'OR'
    : mandatory.length >= 2 ? 'AND' : 'None';
  return { relation, items };
}

export function extractExperienceRequirements(description) {
  const source = typeof description === 'string' ? description : '';
  const items = [];
  const acceptedAlternatives = [];
  for (const sentence of sentences(source)) {
    if (/\b(?:internships?|stages?|academic (?:research|projects?)|academische projecten)\b/iu.test(sentence)
        && /\b(?:count|counts|accepted|accept|equivalent|qualify|meetell|tellen|geaccepteerd)\b/iu.test(sentence)) {
      acceptedAlternatives.push(sentence);
    }
    const years = statedYears(sentence);
    if (!years || !isCandidateExperienceRequirement(sentence)) continue;
    const { minimumYears, maximumYears } = years;
    if (minimumYears > 40 || (maximumYears !== null && (maximumYears > 40 || maximumYears < minimumYears))) continue;
    const domainMatch = sentence.match(/(?:years?|yrs?|jaar|jaren)\s+(?:of|in|with|met)\s+(.+?)(?:\s+(?:experience|ervaring)\b|[,.;]|$)/iu);
    const experienceDomain = domainMatch?.[1]?.trim().slice(0, 80) || '';
    items.push({ minimumYears, maximumYears, requirementType: PREFERRED.test(sentence) ? 'Preferred' : 'Mandatory',
      experienceKind: experienceKind(sentence),
      experienceDomain, supportingEvidence: [sentence] });
  }
  return { items, acceptedAlternatives };
}

function localCareerLevel(description, title, experience) {
  const parts = sentences(description);
  const graduate = parts.filter(part => GRADUATE_SIGNAL.test(part));
  const junior = parts.filter(part => JUNIOR_SIGNAL.test(part));
  const senior = parts.filter(part => SENIOR_SIGNAL.test(part) && !NON_CANDIDATE_CONTEXT.test(part));
  const mandatoryYears = experience.items.filter(item => item.requirementType === 'Mandatory'
    && !['Academic', 'Internship'].includes(item.experienceKind));
  const highYears = mandatoryYears.filter(item => item.minimumYears >= 4);
  const borderlineYears = mandatoryYears.filter(item => item.minimumYears >= 3);
  const juniorTitle = /\b(?:junior|entry[ -]level|graduate)\b/iu.test(title || '');
  const entryEvidence = [...new Set([...graduate, ...junior, ...experience.acceptedAlternatives])];
  let level = 'Unknown';
  if ((graduate.length || junior.length || juniorTitle) && (borderlineYears.length || senior.length)) level = 'Borderline';
  else if (highYears.length || senior.length) level = 'Experienced';
  else if (graduate.length) level = 'New Graduate';
  else if (junior.length) level = 'Junior';
  else if (mandatoryYears.some(item => item.minimumYears <= 3) || experience.acceptedAlternatives.length) level = 'Early Career';
  const supportingEvidence = level === 'Unknown' ? [] : [...new Set(level === 'Borderline'
    ? [...entryEvidence, ...senior, ...borderlineYears.flatMap(item => item.supportingEvidence)]
    : level === 'Experienced' ? [...senior, ...highYears.flatMap(item => item.supportingEvidence)]
      : level === 'New Graduate' ? graduate
        : level === 'Junior' ? junior
          : [...entryEvidence, ...mandatoryYears.flatMap(item => item.supportingEvidence)])];
  const conflict = level === 'Borderline' ? [...new Set([...highYears, ...borderlineYears].flatMap(item => item.supportingEvidence).concat(senior))] : [];
  const confidence = level === 'Unknown' ? 'Unknown' : evidenceConfidence(`${title || ''}\n${description}`, supportingEvidence);
  return { level, confidence, reasons: [level === 'Unknown' ? 'Insufficient JD evidence for a reliable career level.'
    : level === 'Borderline' ? 'Entry-level signals conflict with senior responsibilities or experience requirements.'
      : 'Classification follows explicit JD experience and role signals.'], supportingEvidence, conflictingEvidence: conflict };
}

function professionalJobAnalysis(jdData, raw, analysisLanguage) {
  const evidenceFailures = {};
  const jd = { ...jdData, evidenceFailures };
  const requirement = raw?.dutchRequirement;
  const statuses = ['Mandatory', 'Preferred', 'Optional', 'Not Specified', 'Unknown'];
  const dutchEvidence = verifiedEvidence(jd, requirement?.supportingEvidence);
  let status = statuses.includes(requirement?.status) ? requirement.status : 'Unknown';
  const relation = ['AND', 'OR', 'None'].includes(requirement?.relation) ? requirement.relation : 'None';
  if (['Mandatory', 'Preferred', 'Optional'].includes(status) && !dutchEvidence.length) status = 'Unknown';
  if (status === 'Mandatory' && relation === 'OR') status = 'Optional';
  const dutchRequirement = { status, relation,
    reason: typeof requirement?.reason === 'string' ? requirement.reason : '',
    supportingEvidence: quotes(dutchEvidence), evidenceSources: dutchEvidence,
    missing: !requirement, reviewNeeded: status === 'Unknown' };
  const requiredLanguages = { relation, status, items: ['Mandatory', 'Preferred', 'Optional'].includes(status)
    ? [{ language: 'Dutch', requirementType: status, supportingEvidence: quotes(dutchEvidence), evidenceSources: dutchEvidence }] : [] };
  const explicitEmpty = Array.isArray(raw?.mainResponsibilities) && !raw.mainResponsibilities.length;
  const responsibilities = explicitEmpty ? { items: [], diagnostics: { outcome: 'no_verified_duties',
    MODEL_FIELD_MISSING: 0, MODEL_SCHEMA_INVALID: 0, EVIDENCE_MATCH_FAILED: 0, EVIDENCE_INSUFFICIENT: 0,
    VALIDATED: 0, FALLBACK_VERIFIED: 0, reasons: {} } }
    : modelResponsibilities(jd, Array.isArray(raw?.mainResponsibilities)
      ? raw.mainResponsibilities.map(item => ({ ...item, mode: 'extract' })) : undefined, false, analysisLanguage);
  const careerEvidence = verifiedEvidence(jd, raw?.careerLevel?.supportingEvidence);
  const careerLevel = LEVELS.has(raw?.careerLevel?.level) && raw.careerLevel.level !== 'Unknown' && careerEvidence.length
    ? { level: raw.careerLevel.level, confidence: evidenceConfidence(jdData?.description || '', quotes(careerEvidence)),
      reasons: Array.isArray(raw.careerLevel.reasons) ? raw.careerLevel.reasons.filter(item => typeof item === 'string') : [],
      supportingEvidence: quotes(careerEvidence), evidenceSources: careerEvidence,
      conflictingEvidence: quotes(verifiedEvidence(jd, raw.careerLevel.conflictingEvidence)) }
    : { level: 'Unknown', confidence: 'Unknown', reasons: [], supportingEvidence: [], conflictingEvidence: [], evidenceSources: [] };
  const experienceRequirements = modelExperience(jd, raw?.experienceRequirements)
    || { items: [], acceptedAlternatives: [], reviewNeeded: true };
  return { version: JOB_ANALYSIS_VERSION, schemaVersion: 'job-analysis-v6',
    jdLanguage: detectJdLanguage(jdData?.description || ''), careerLevel, dutchRequirement,
    requiredLanguages, experienceRequirements, mainResponsibilities: responsibilities.items,
    responsibilityDiagnostics: responsibilities.diagnostics, evidenceDiagnostics: evidenceFailures,
    reviewNeeded: !raw?.careerLevel || !raw?.experienceRequirements || !requirement || !Array.isArray(raw?.mainResponsibilities) };
}

export function analyzeJobRequirements(jdData, modelAnalysis = null, sponsorship = null, analysisLanguage = 'en') {
  if (modelAnalysis?.schemaVersion === 'job-analysis-v6') return professionalJobAnalysis(jdData, modelAnalysis, analysisLanguage);
  const source = typeof jdData?.description === 'string' ? jdData.description : '';
  const evidenceFailures = {};
  const verifiedJD = { ...jdData, evidenceFailures };
  const language = verifiedJdLanguage(verifiedJD, modelAnalysis);
  const jdLanguage = language?.language || detectJdLanguage(source);
  const requiredLanguages = modelLanguages(verifiedJD, modelAnalysis?.requiredLanguages)
    || extractLanguageRequirements(`${jdData?.title || ''}\n${source}`);
  const title = jdData?.title || '';
  for (const [language, pattern] of [
    ['Dutch', /\b(?:dutch[ -]speaking|nederlandstalig)\b/iu],
    ['English', /\benglish[ -]speaking\b/iu],
  ]) {
    const match = title.match(pattern);
    if (!modelAnalysis?.requiredLanguages && match
      && !requiredLanguages.items.some(item => item.language === language)) {
      requiredLanguages.items.push({ language, requirementType: 'Mandatory', minimumProficiency: null,
        supportingEvidence: [match[0]], evidenceSources: [{ source: 'Job Title', quote: match[0] }] });
    }
  }
  const experienceRequirements = modelExperience(verifiedJD, modelAnalysis?.experienceRequirements)
    || extractExperienceRequirements(source);
  const localExperience = extractExperienceRequirements(source);
  const experienceConflict = Boolean(modelAnalysis?.experienceRequirements
    && localExperience.items.length !== experienceRequirements.items.length);
  if (experienceConflict) experienceRequirements.reviewNeeded = true;
  const local = localCareerLevel(source, jdData?.title, experienceRequirements);
  const candidate = modelCareer(verifiedJD, modelAnalysis?.careerLevel);
  const entryLevels = ['New Graduate', 'Junior', 'Early Career'];
  const experiencedLevels = ['Experienced', 'Borderline'];
  const careerLevel = candidate && local.level !== 'Unknown' && candidate.level !== local.level
    && ((experiencedLevels.includes(local.level) && entryLevels.includes(candidate.level))
      || (entryLevels.includes(local.level) && experiencedLevels.includes(candidate.level)))
    ? { ...candidate, level: 'Borderline', confidence: 'Low',
      conflictingEvidence: [...new Set([...candidate.conflictingEvidence, ...local.supportingEvidence])],
      reasons: [...candidate.reasons, 'Entry-level and experienced-role evidence conflict; review the JD.'].slice(0, 3) }
    : candidate || local;
  const reviewNeeded = Boolean(modelAnalysis && (
    (candidate && local.level !== 'Unknown' && candidate.level !== local.level)
    || experienceConflict
  ));
  const responsibilities = modelResponsibilities(verifiedJD, modelAnalysis?.mainResponsibilities,
    Boolean(modelAnalysis?.schemaVersion), analysisLanguage);
  return { version: JOB_ANALYSIS_VERSION, jdLanguage,
    jdLanguageEvidence: language ? quotes(language.evidence) : jdLanguage === 'Unknown' ? [] : sentences(source).slice(0, 2).map(sentence => sentence.slice(0, 300)),
    careerLevel,
    reviewNeeded,
    requiredLanguages, experienceRequirements,
    workPermitSponsorship: workPermitSponsorship(verifiedJD, modelAnalysis?.workPermitSponsorship),
    mainResponsibilities: responsibilities.items,
    responsibilityDiagnostics: responsibilities.diagnostics,
    evidenceDiagnostics: evidenceFailures,
    requiredSkills: modelEvidenceList(verifiedJD, modelAnalysis?.requiredSkills),
    preferredSkills: modelEvidenceList(verifiedJD, modelAnalysis?.preferredSkills),
    domainKnowledge: modelEvidenceList(verifiedJD, modelAnalysis?.domainKnowledge),
    otherMandatoryRequirements: modelEvidenceList(verifiedJD, modelAnalysis?.otherMandatoryRequirements),
    };
}

import { ItemNames, ConfidenceImpact, SponsorshipSignal, DegradationTrigger } from './constants.js';

const VALID_CONFIDENCE_IMPACTS = ['raise', 'lower', 'none'];
const VALID_SPONSORSHIP_SIGNALS = ['included', 'notIncluded', 'unavailable'];
const VALID_SPONSORSHIP_IMPACT_TYPES = ['increase', 'noChange', 'decrease', 'onlyLowerConfidence'];

export function validateAndRepair(raw) {
  const errors = [];

  if (!raw || typeof raw !== 'object') {
    return {
      valid: false,
      data: buildFallbackResult('LLM output could not be parsed as an object.', DegradationTrigger.MODEL_FIELD_MISSING),
      errors: ['Output is not a valid JSON object.'],
    };
  }

  const result = { ...raw };

  if (!Array.isArray(result.matchBreakdown)) {
    errors.push('matchBreakdown is missing or invalid.');
    result.matchBreakdown = [];
  }

  result.matchBreakdown = result.matchBreakdown.map((item, index) => validateBreakdownItem(item, index, errors));

  if (typeof result.overallMatchPercent !== 'number' || result.overallMatchPercent < 0 || result.overallMatchPercent > 100) {
    errors.push('overallMatchPercent is missing or invalid.');
    result.overallMatchPercent = deriveOverallScore(result.matchBreakdown);
  } else {
    result.overallMatchPercent = Math.round(result.overallMatchPercent);
  }

  if (!Array.isArray(result.strengths)) {
    errors.push('strengths is missing.');
    result.strengths = deriveGlobalSummary(result.matchBreakdown, 'strengths');
  }

  if (!Array.isArray(result.gaps)) {
    errors.push('gaps is missing.');
    result.gaps = deriveGlobalSummary(result.matchBreakdown, 'gaps');
  }

  result.sponsorshipAssessment = validateSponsorshipAssessment(result.sponsorshipAssessment, errors);

  return {
    valid: errors.length === 0,
    data: result,
    errors,
  };
}

function validateBreakdownItem(item, index, errors) {
  if (!item || typeof item !== 'object') {
    errors.push(`matchBreakdown[${index}] is not a valid object.`);
    return buildFallbackItem(`Unknown Item ${index + 1}`, DegradationTrigger.MODEL_FIELD_MISSING, 'The model returned an invalid breakdown row.');
  }

  const repaired = { ...item };

  if (typeof repaired.itemName !== 'string' || !repaired.itemName.trim()) {
    errors.push(`matchBreakdown[${index}].itemName is missing.`);
    repaired.itemName = `Unknown Item ${index + 1}`;
  }

  if (typeof repaired.score !== 'number' || repaired.score < 0 || repaired.score > 100) {
    errors.push(`matchBreakdown[${index}].score is invalid.`);
    repaired.score = typeof repaired.score === 'number'
      ? Math.max(0, Math.min(100, Math.round(repaired.score)))
      : 0;
  } else {
    repaired.score = Math.round(repaired.score);
  }

  if (typeof repaired.weight !== 'number' || repaired.weight <= 0 || repaired.weight > 1) {
    errors.push(`matchBreakdown[${index}].weight is invalid.`);
    repaired.weight = 0.2;
  }

  if (!Array.isArray(repaired.evidence)) {
    errors.push(`matchBreakdown[${index}].evidence is missing.`);
    repaired.evidence = ['[CONFIDENCE-DEGRADED] Trigger: MODEL_NO_EVIDENCE; Reason: the model did not provide usable evidence.'];
  }

  if (!repaired.prosCons || typeof repaired.prosCons !== 'object') {
    errors.push(`matchBreakdown[${index}].prosCons is missing.`);
    repaired.prosCons = { strengths: [], gaps: [] };
  } else {
    if (!Array.isArray(repaired.prosCons.strengths)) {
      repaired.prosCons.strengths = [];
    }
    if (!Array.isArray(repaired.prosCons.gaps)) {
      repaired.prosCons.gaps = [];
    }
  }

  if (!VALID_CONFIDENCE_IMPACTS.includes(repaired.confidenceImpact)) {
    errors.push(`matchBreakdown[${index}].confidenceImpact is invalid.`);
    repaired.confidenceImpact = ConfidenceImpact.NONE;
  }

  if (!VALID_SPONSORSHIP_SIGNALS.includes(repaired.sponsorshipSignal)) {
    errors.push(`matchBreakdown[${index}].sponsorshipSignal is invalid.`);
    repaired.sponsorshipSignal = SponsorshipSignal.UNAVAILABLE;
  }

  return repaired;
}

function validateSponsorshipAssessment(assessment, errors) {
  if (!assessment || typeof assessment !== 'object') {
    errors.push('sponsorshipAssessment is missing.');
    return buildFallbackSponsorship();
  }

  const repaired = { ...assessment };

  if (typeof repaired.conclusion !== 'string') {
    errors.push('sponsorshipAssessment.conclusion is missing.');
    repaired.conclusion = 'Unable to assess';
  }

  if (!Array.isArray(repaired.evidence)) {
    if (typeof repaired.evidence === 'string') {
      repaired.evidence = [repaired.evidence];
    } else {
      errors.push('sponsorshipAssessment.evidence is missing.');
      repaired.evidence = [];
    }
  }

  if (!['high', 'medium', 'low'].includes(repaired.confidence)) {
    errors.push('sponsorshipAssessment.confidence is invalid.');
    repaired.confidence = 'low';
  }

  if (typeof repaired.uncertaintyNote !== 'string') {
    repaired.uncertaintyNote = '';
  }

  if (!VALID_SPONSORSHIP_IMPACT_TYPES.includes(repaired.sponsorshipImpactOnOverall)) {
    errors.push('sponsorshipAssessment.sponsorshipImpactOnOverall is invalid.');
    repaired.sponsorshipImpactOnOverall = 'onlyLowerConfidence';
  }

  if (typeof repaired.country !== 'string') {
    repaired.country = 'Unknown';
  }

  if (repaired.indRegistered !== true && repaired.indRegistered !== false) {
    repaired.indRegistered = null;
  }

  return repaired;
}

function deriveOverallScore(breakdown) {
  if (!Array.isArray(breakdown) || !breakdown.length) {
    return 0;
  }

  let total = 0;
  let totalWeight = 0;

  for (const item of breakdown) {
    const score = typeof item?.score === 'number' ? item.score : null;
    const weight = typeof item?.weight === 'number' ? item.weight : null;

    if (score === null || weight === null || weight <= 0) {
      continue;
    }

    total += Math.max(0, Math.min(100, score)) * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(total)));
}

function deriveGlobalSummary(breakdown, kind) {
  if (!Array.isArray(breakdown)) {
    return [];
  }

  const collected = [];
  for (const item of breakdown) {
    const list = item?.prosCons?.[kind];
    if (!Array.isArray(list)) {
      continue;
    }

    for (const entry of list) {
      const text = typeof entry === 'string' ? entry.trim() : '';
      if (text && !collected.includes(text)) {
        collected.push(text);
      }
      if (collected.length >= 4) {
        return collected;
      }
    }
  }

  return collected;
}

export function buildFallbackItem(name, trigger = DegradationTrigger.MODEL_NO_OUTPUT, reason = 'The model did not return usable structured output.') {
  return {
    itemName: name,
    score: 0,
    weight: 0.2,
    evidence: [`[CONFIDENCE-DEGRADED] Trigger: ${trigger}; Reason: ${reason}`],
    prosCons: {
      strengths: [],
      gaps: [reason],
    },
    confidenceImpact: 'lower',
    sponsorshipSignal: 'unavailable',
  };
}

export function buildFallbackResult(reason, trigger = DegradationTrigger.MODEL_NO_OUTPUT) {
  const items = [
    ItemNames.SKILLS,
    ItemNames.RESPONSIBILITY,
    ItemNames.YEARS,
    ItemNames.EDUCATION,
    ItemNames.LANG_LOCATION,
  ];

  return {
    overallMatchPercent: 0,
    matchBreakdown: items.map(name => buildFallbackItem(name, trigger, reason || 'Model output was unavailable or invalid.')),
    strengths: [],
    gaps: [reason || 'Model output was unavailable or invalid.'],
    sponsorshipAssessment: buildFallbackSponsorship(),
  };
}

function buildFallbackSponsorship() {
  return {
    conclusion: 'Unable to assess',
    evidence: [],
    confidence: 'low',
    uncertaintyNote: 'There was not enough reliable data to assess sponsorship fit.',
    sponsorshipImpactOnOverall: 'onlyLowerConfidence',
    country: 'Unknown',
    indRegistered: null,
  };
}

export function responseText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  // Parts may split inside a JSON string: never insert new source characters.
  return content.map(item => typeof item === 'string' ? item
    : item?.type === 'text' && typeof item.text === 'string' ? item.text : '').join('');
}

export function parseJSONResponse(content) {
  let text = responseText(content).trim();
  let wrapper = 'none';
  if (!text) return { value: null, error: { kind: 'empty_output', code: 'EMPTY_OUTPUT' }, wrapper };
  const fence = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/iu);
  if (fence) { text = fence[1].trim(); wrapper = 'markdown'; }
  if (!text) return { value: null, error: { kind: 'empty_output', code: 'EMPTY_OUTPUT' }, wrapper };
  try {
    return { value: JSON.parse(text), error: null, wrapper };
  } catch (error) {
    // Keep compatibility with a single object wrapped in prose. Scan the first
    // root only; never salvage a nested fragment or choose among multiple roots.
    const start = text.search(/[\[{]/u);
    if (start > 0 && wrapper === 'none' && !/["`\]}]/u.test(text.slice(0, start))) {
      const stack = [];
      let quoted = false;
      let escaped = false;
      for (let i = start; i < text.length; i += 1) {
        const ch = text[i];
        if (quoted) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === '"') quoted = false;
        } else if (ch === '"') quoted = true;
        else if (ch === '{' || ch === '[') stack.push(ch);
        else if (ch === '}' || ch === ']') {
          if (stack.pop() !== (ch === '}' ? '{' : '[')) break;
          if (!stack.length) {
            if (/[\[\]{}]/u.test(text.slice(i + 1))) break;
            try { return { value: JSON.parse(text.slice(start, i + 1)), error: null, wrapper: 'prose' }; }
            catch { break; }
          }
        }
      }
    }
    // Native SyntaxError messages can contain private response excerpts. Expose
    // only a category and numeric locations, never the message or raw response.
    const message = String(error.message);
    const location = pattern => {
      const value = message.match(pattern)?.[1];
      return value === undefined ? null : Number(value);
    };
    return { value: null, wrapper, error: {
      kind: 'invalid_json',
      code: /unexpected end|unterminated/iu.test(message) ? 'UNEXPECTED_END' : 'INVALID_SYNTAX',
      position: location(/position (\d+)/iu), line: location(/line (\d+)/iu),
      column: location(/column (\d+)/iu),
    } };
  }
}

export function safeParseJSON(text) {
  return parseJSONResponse(text).value;
}

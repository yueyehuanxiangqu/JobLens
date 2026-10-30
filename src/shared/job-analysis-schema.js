export const JOB_ANALYSIS_SCHEMA_VERSION = 'job-analysis-v6';
export const CAREER_LEVELS = ['Entry', 'Junior', 'Early Career', 'Mid', 'Senior', 'Lead', 'Unknown'];

const text = { type: 'string' };
const list = items => ({ type: 'array', items });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const choice = values => ({ type: 'string', enum: values });
const years = { type: ['number', 'null'], minimum: 0, maximum: 40 };
export const JD_EVIDENCE_SCHEMA = object({ source: choice(['Job Title', 'JD Body']), quote: text });
const evidence = list(JD_EVIDENCE_SCHEMA);

// One definition drives Gemini's output constraint and local shape validation.
export const JOB_ANALYSIS_OUTPUT_SCHEMA = object({
  schemaVersion: choice([JOB_ANALYSIS_SCHEMA_VERSION]),
  careerLevel: object({ level: choice(CAREER_LEVELS), reasons: list(text),
    supportingEvidence: evidence, conflictingEvidence: evidence }),
  dutchRequirement: object({ status: choice(['Mandatory', 'Preferred', 'Optional', 'Not Specified', 'Unknown']),
    relation: choice(['AND', 'OR', 'None']), reason: text, supportingEvidence: evidence }),
  experienceRequirements: object({ items: list(object({ minimumYears: years, maximumYears: years,
    requirementType: choice(['Mandatory', 'Preferred']),
    experienceKind: choice(['Professional', 'Commercial', 'Research', 'Academic', 'Internship', 'Unspecified']),
    experienceDomain: text, supportingEvidence: evidence })), acceptedAlternatives: list(text) }),
  mainResponsibilities: list(object({ summary: text, displayText: text,
    displayLanguage: choice(['en', 'zh-CN']), supportingEvidence: evidence })),
});

export function validateJobAnalysisShape(raw) {
  const errors = [];
  function check(value, schema, path) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (!types.includes(type)) { errors.push(`${path} missing or invalid`); return; }
    if (schema.enum && !schema.enum.includes(value)) errors.push(`${path} invalid`);
    if (type === 'object') {
      for (const key of schema.required || []) {
        if (!Object.hasOwn(value, key)) errors.push(`${path}.${key} missing`);
        else check(value[key], schema.properties[key], `${path}.${key}`);
      }
    } else if (type === 'array') value.forEach((item, index) => check(item, schema.items, `${path}[${index}]`));
    else if (type === 'number' && (!Number.isFinite(value) || value < schema.minimum || value > schema.maximum)) {
      errors.push(`${path} invalid`);
    }
  }
  check(raw, JOB_ANALYSIS_OUTPUT_SCHEMA, 'jobAnalysis');
  return errors;
}

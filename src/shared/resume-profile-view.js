import { normalizeResumeText, RESUME_DOCUMENT_VERSION } from './resume-document.js';
import { classifyCvField, findCvEvidence, findLanguageLevelEvidence } from './cv-evidence.js';

function field(label, value, source, options = {}) {
  const text = String(value ?? '').trim();
  if (!text || text === 'Unknown') return { label, value: 'Unknown', status: 'Unknown', sourceQuote: '' };
  if (options.userConfirmed) return { label, value: text, status: 'User-confirmed', sourceQuote: '' };
  return { label, value: text, ...classifyCvField(text, source, options.fieldQuote, options.relatedQuotes, options) };
}

function verifiedQuotes(value, source) {
  return (Array.isArray(value) ? value : []).map(quote => findCvEvidence(source, quote)?.quote).filter(Boolean).slice(0, 8);
}

function objectEntries(items, keys, source) {
  return (Array.isArray(items) ? items : []).map(item => ({
    fields: keys.flatMap(([key, label]) => {
      const values = Array.isArray(item?.[key]) ? item[key] : [item?.[key]];
      return values.map(value => field(label, value, source, { allowShort: key === 'label' }));
    }).filter(field => field.status !== 'Unknown'),
    sourceQuotes: verifiedQuotes(item?.sourceQuotes, source),
  })).filter(item => item.fields.length);
}

function evidenceEntries(items, source) {
  return objectEntries(items, [['label', 'Value']], source);
}

function stringEntries(items, source) {
  return (Array.isArray(items) ? items : []).map(value => ({ fields: [field('Value', value, source, { allowShort: true })], sourceQuotes: [] }));
}

function section(key, entries) {
  return { key, entries };
}

function grouped(entries, name) {
  return entries.map(item => ({ ...item, group: name }));
}

export function buildResumeProfileView(profile) {
  if (!profile?.id || !profile.structuredData) throw new Error('The selected resume could not be found.');
  const source = normalizeResumeText(profile.sourceText);
  const data = profile.structuredData;
  const educationKeys = [
    ['degree', 'Degree'], ['field', 'Field'], ['institution', 'Institution'],
    ['year', 'Year'], ['details', 'Details'],
  ];
  const careerEntries = (items, isProject) => (Array.isArray(items) ? items : []).map((item, itemIndex) => {
    const titleMatch = findCvEvidence(source, item.title);
    const laterTitles = items.slice(itemIndex + 1).map(next => findCvEvidence(source, next.title)?.start)
      .filter(start => Number.isInteger(start) && start > (titleMatch?.start ?? -1));
    const ownSource = titleMatch
      ? source.slice(titleMatch.start, Math.min(laterTitles.length ? Math.min(...laterTitles) : source.length, titleMatch.start + 6000)) : '';
    const relatedQuotes = verifiedQuotes(item.sourceQuotes, ownSource);
    const cited = item.fieldEvidence || {};
    const bullets = [...(Array.isArray(item.highlights) ? item.highlights : [])];
    const descriptionAdded = Boolean(item.description && !bullets.includes(item.description));
    if (descriptionAdded) bullets.unshift(item.description);
    const bulletFields = bullets.map((bullet, index) => field('Bullet Point', bullet, ownSource, {
      fieldQuote: descriptionAdded && index === 0 ? '' : cited.highlights?.[index - Number(descriptionAdded)],
      relatedQuotes,
    }));
    return {
      fields: [
        field(isProject ? 'Project Name' : 'Position', item.title, source, { fieldQuote: cited.title, relatedQuotes }),
        field(isProject ? 'Organization' : 'Company', item.company, ownSource, { fieldQuote: cited.company, relatedQuotes }),
        field('Period', item.duration, ownSource, { fieldQuote: cited.duration, relatedQuotes }),
        ...bulletFields,
      ].filter(item => item.status !== 'Unknown'),
      sourceQuotes: relatedQuotes,
    };
  }).filter(item => item.fields.length);
  const languages = (Array.isArray(data.languages) ? data.languages : []).map(item => {
    const quotes = verifiedQuotes(item.sourceQuotes, source);
    const confirmed = item.source === 'user-confirmed';
    // Recheck stored CV text directly so old resume-v3 records without model
    // sourceQuotes can be verified without parsing the CV again.
    const pair = confirmed ? null : findLanguageLevelEvidence(source, item.language, item.reportedLevel || item.level)
      || findLanguageLevelEvidence(source, item.language, item.level);
    const level = confirmed ? field('Level', item.level, source, { userConfirmed: true })
      : pair ? { label: 'Level', value: item.level, status: 'Verified', sourceQuote: pair.quote }
        : field('Level', 'Unknown', source);
    return {
      fields: [field('Language', item.language, source, { userConfirmed: confirmed }), level],
      sourceQuotes: pair && !quotes.some(quote => findLanguageLevelEvidence(quote, item.language, item.reportedLevel || item.level)
        || findLanguageLevelEvidence(quote, item.language, item.level))
        ? [pair.quote, ...quotes].slice(0, 8) : quotes,
    };
  });
  const explicit = evidenceEntries(data.otherExplicitInformation, source)
    .filter(item => item.fields.some(value => ['Verified', 'Source-supported'].includes(value.status)));
  const certificates = stringEntries(data.certifications, source)
    .filter(item => item.fields[0].status === 'Verified');
  return {
    id: profile.id,
    fileName: profile.fileName,
    schemaVersion: profile.sourceSchemaVersion || 'Unknown',
    currentSchemaVersion: RESUME_DOCUMENT_VERSION,
    needsReparse: profile.needsReparse === true,
    parsedAt: profile.parsedAt || null,
    parseStatus: profile.parseStatus,
    parseQualityIssues: profile.parseQualityIssues || [],
    sections: [
      section('education', objectEntries(data.education, educationKeys, source)),
      section('experience', [...careerEntries(data.experience, false), ...careerEntries(data.internships, false)]),
      section('projects', careerEntries(data.projects, true)),
      section('technicalSkills', [
        ...grouped(stringEntries(data.skills, source).filter(item => item.fields[0].status === 'Verified'), 'Skills'),
        ...grouped(evidenceEntries(data.programmingLanguages, source)
          .filter(item => ['Verified', 'Source-supported'].includes(item.fields[0].status)), 'Programming Languages'),
        ...grouped(evidenceEntries(data.toolsAndFrameworks, source)
          .filter(item => ['Verified', 'Source-supported'].includes(item.fields[0].status)), 'Tools & Frameworks'),
        ...grouped(evidenceEntries(data.appliedMethods, source)
          .filter(item => item.fields[0].status === 'Verified'), 'Explicit Methods'),
      ]),
      section('languages', languages),
      section('otherInformation', [...explicit, ...grouped(certificates, 'Certifications')]),
    ].filter(item => item.entries.length),
  };
}

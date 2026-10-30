import { findCvEvidence, findLanguageLevelEvidence } from './cv-evidence.js';

export const RESUME_DOCUMENT_VERSION = 'resume-v3';
export const MAX_RESUME_SOURCE_CHARACTERS = 200000;

const SECTION_HEADING_PATTERN = /^(?:summary|profile|about(?: me)?|objective|experience|work experience|professional experience|employment|education|academic background|certifications?|licenses?|skills?|technical skills|languages?|projects?|publications?|volunteer(?: experience)?|awards?|achievements?|interests?)\s*:?$/i;

export function normalizeResumeText(text) {
  return typeof text === 'string'
    ? text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim().slice(0, MAX_RESUME_SOURCE_CHARACTERS)
    : '';
}

function cleanString(value, limit = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function normalizeStringList(value, limit = 80, itemLimit = 240) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter(item => typeof item === 'string')
    .map(item => cleanString(item, itemLimit))
    .filter(Boolean))].slice(0, limit);
}

function normalizeExperience(value, sourceText = '') {
  if (!Array.isArray(value)) return [];
  const source = normalizeResumeText(sourceText);
  const starts = value.map(item => findCvEvidence(source, item?.title || item?.role || item?.position)?.start ?? -1);
  return value.map((item, itemIndex) => {
    const title = cleanString(item?.title || item?.role || item?.position, 240);
    const company = cleanString(item?.company || item?.employer, 240);
    const duration = cleanString(item?.duration || item?.dates || item?.year, 160);
    const highlights = normalizeStringList(item?.highlights || item?.achievements, 80, 1000);
    const rawEvidence = item?.fieldEvidence || {};
    const nextStart = Math.min(...starts.slice(itemIndex + 1).filter(start => start > starts[itemIndex]));
    const ownSource = starts[itemIndex] >= 0
      ? source.slice(starts[itemIndex], Math.min(Number.isFinite(nextStart) ? nextStart : source.length, starts[itemIndex] + 6000)) : '';
    const evidenceFor = (quote, fallback, within = ownSource) => findCvEvidence(within, quote)?.quote
      || findCvEvidence(within, fallback)?.quote || '';
    return {
      title, company, duration,
      description: cleanString(item?.description || item?.summary, 1600),
      highlights,
      fieldEvidence: {
        title: evidenceFor(rawEvidence.title, title, source),
        company: evidenceFor(rawEvidence.company, company),
        duration: evidenceFor(rawEvidence.duration, duration),
        highlights: highlights.map((bullet, index) => evidenceFor(rawEvidence.highlights?.[index], bullet)),
      },
      sourceQuotes: normalizeStringList(item?.sourceQuotes || item?.quotes, 30, 1000)
        .map(quote => findCvEvidence(ownSource, quote)?.quote).filter(Boolean),
    };
  }).filter(item => item.title || item.company || item.duration || item.description || item.highlights.length);
}

function normalizeEducation(value, sourceText = '') {
  if (!Array.isArray(value)) return [];
  const source = normalizeResumeText(sourceText);
  return value.map(item => ({
    degree: cleanString(item?.degree || item?.qualification, 300),
    field: cleanString(item?.field || item?.major, 300),
    institution: cleanString(item?.institution || item?.school || item?.university, 300),
    year: cleanString(item?.year || item?.dates, 160),
    details: normalizeStringList(
      item?.details || item?.highlights || (item?.description ? [item.description] : []),
      8,
      500,
    ),
    sourceQuotes: normalizeStringList(item?.sourceQuotes || item?.quotes, 8, 500)
      .map(quote => findCvEvidence(source, quote)?.quote).filter(Boolean),
  })).filter(item => Object.values(item).some(value => Array.isArray(value) ? value.length : value));
}

export function normalizeProfileLanguages(value, sourceText = '') {
  if (!Array.isArray(value)) return [];
  const source = normalizeResumeText(sourceText);
  return value.map(item => {
    const language = cleanString(typeof item === 'string' ? item : item?.language || item?.name, 120);
    const reportedLevel = cleanString(typeof item === 'string' ? ''
      : item?.reportedLevel || item?.level || item?.proficiency, 120) || 'Unknown';
    const level = normalizeLanguageLevel(reportedLevel);
    const confirmed = item?.source === 'user-confirmed';
    const pair = confirmed || level === 'Unknown' ? null
      : findLanguageLevelEvidence(source, language, reportedLevel)
        || findLanguageLevelEvidence(source, language, level);
    const sourceQuotes = confirmed ? [] : normalizeStringList(item?.sourceQuotes, 3, 300)
      .map(quote => findCvEvidence(source, quote)?.quote)
      .filter(quote => quote && (level === 'Unknown' ? findCvEvidence(quote, language)
        : findLanguageLevelEvidence(quote, language, reportedLevel)
          || findLanguageLevelEvidence(quote, language, level)));
    if (pair && !sourceQuotes.some(quote => findLanguageLevelEvidence(quote, language, reportedLevel)
      || findLanguageLevelEvidence(quote, language, level))) {
      sourceQuotes.unshift(pair.quote);
    }
    return {
      language,
      level: confirmed || pair ? level : 'Unknown',
      reportedLevel,
      source: confirmed ? 'user-confirmed' : 'cv-extracted',
      sourceQuotes: sourceQuotes.slice(0, 3),
    };
  }).filter(item => item.language).slice(0, 30);
}

export function normalizeLanguageLevel(value) {
  const text = String(value || '').trim().toLowerCase();
  if (/\b(?:native|mother tongue|first language|moedertaal|moedertaalspreker)\b/u.test(text)) return 'Native';
  if (/\b(?:proficient|fluent|fluently|vloeiend|professional|business fluent|c1|c2)\b/u.test(text)) return 'Proficient';
  if (/\b(?:intermediate|conversational|working proficiency|b1|b2)\b/u.test(text)) return 'Intermediate';
  if (/\b(?:beginner|basic|elementary|actively learning|learning|a1|a2)\b/u.test(text)) return 'Beginner';
  return 'Unknown';
}

export function formatConfirmedProfileLanguages(value) {
  return normalizeProfileLanguages(value).filter(item => item.source === 'user-confirmed')
    .map(item => `Language: ${item.language} — ${item.level}${item.reportedLevel !== item.level ? ` (${item.reportedLevel})` : ''}`).join('\n');
}

function normalizeSections(value) {
  if (!Array.isArray(value)) return [];
  return value.map(section => ({
    heading: cleanString(section?.heading || section?.name, 120),
    entries: normalizeStringList(section?.entries || section?.lines || section?.content, 60, 1000),
  })).filter(section => section.heading && section.entries.length).slice(0, 30);
}

function normalizeCapabilities(value, sourceText) {
  if (!Array.isArray(value)) return [];
  const source = normalizeResumeText(sourceText);
  return value.slice(0, 100).map(item => {
    const evidence = normalizeStringList(item?.sourceQuotes, 5, 500)
      .map(quote => findCvEvidence(source, quote)?.quote).filter(Boolean);
    const status = evidence.length ? 'Verified' : 'Inferred / Unverified';
    return {
      capability: cleanString(item?.capability, 240),
      category: cleanString(item?.category, 100),
      contribution: cleanString(item?.contribution, 500),
      method: cleanString(item?.method, 300),
      domain: cleanString(item?.domain, 200),
      outcome: cleanString(item?.outcome, 300),
      transferableTo: normalizeStringList(item?.transferableTo, 8, 160),
      sourceQuotes: evidence,
      status,
    };
  }).filter(item => item.capability);
}

function normalizeEvidenceItems(value, sourceText) {
  const source = normalizeResumeText(sourceText);
  return (Array.isArray(value) ? value : []).slice(0, 80).map(item => {
    const label = cleanString(typeof item === 'string' ? item : item?.label || item?.name, 300);
    const sourceQuotes = normalizeStringList(item?.sourceQuotes, 5, 500)
      .map(quote => findCvEvidence(source, quote)?.quote).filter(Boolean);
    return { label, sourceQuotes, status: sourceQuotes.length ? 'Verified' : 'Inferred / Unverified' };
  }).filter(item => item.label);
}

export function extractResumeSections(sourceText) {
  const lines = normalizeResumeText(sourceText)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const sections = [];
  let current = { heading: 'Resume', entries: [] };
  const commit = () => {
    if (current.entries.length) sections.push(current);
  };

  lines.forEach(line => {
    if (line.length <= 80 && SECTION_HEADING_PATTERN.test(line)) {
      commit();
      current = { heading: line.replace(/\s*:\s*$/, ''), entries: [] };
      return;
    }
    current.entries.push(line.slice(0, 1000));
  });
  commit();

  return sections.slice(0, 30);
}

function findSection(sections, pattern) {
  return sections.find(section => pattern.test(section.heading)) || null;
}

function buildFallbackExperience(sections) {
  const section = findSection(sections, /experience|employment/i);
  if (!section || !section.entries.length) return [];
  const entries = section.entries.slice(0, 20);
  return [{
    title: entries[0] || '',
    company: '',
    duration: entries.find(line => /\b(?:19|20)\d{2}\b/.test(line)) || '',
    description: '',
    highlights: entries.slice(1, 12),
    sourceQuotes: entries.slice(0, 12),
  }];
}

function buildFallbackEducation(sections) {
  const section = findSection(sections, /education|academic/i);
  if (!section) return [];

  const entries = section.entries.slice(0, 20);
  const degreePattern = /\b(?:bsc|msc|ba|ma|phd|bachelor|master|doctor|degree|diploma)\b/i;
  const degreeStarts = entries
    .map((line, index) => degreePattern.test(line) ? index : -1)
    .filter(index => index >= 0);
  const starts = degreeStarts.length ? degreeStarts : [0];

  return starts.map((start, index) => {
    const block = entries.slice(start, starts[index + 1] || entries.length).slice(0, 12);
    return {
      degree: block.find(line => degreePattern.test(line)) || block[0] || '',
      field: '',
      institution: block.find(line => /\b(?:university|college|institute|school)\b/i.test(line)) || '',
      year: block.find(line => /\b(?:19|20)\d{2}\b/.test(line)) || '',
      details: block,
      sourceQuotes: block,
    };
  }).filter(item => item.degree || item.institution || item.details.length);
}

export function buildFallbackResumeData(sourceText) {
  const sections = extractResumeSections(sourceText);
  const experience = buildFallbackExperience(sections);
  const education = buildFallbackEducation(sections);
  const skillsSection = findSection(sections, /skills?/i);
  const languagesSection = findSection(sections, /languages?/i);

  return {
    schemaVersion: RESUME_DOCUMENT_VERSION,
    name: '',
    headline: '',
    summary: '',
    skills: skillsSection ? skillsSection.entries.slice(0, 80) : [],
    programmingLanguages: [],
    toolsAndFrameworks: [],
    experience,
    internships: [],
    projects: [],
    responsibilities: [],
    appliedMethods: [],
    domainKnowledge: [],
    achievements: [],
    education,
    certifications: (findSection(sections, /certifications?|licenses?/i)?.entries || []).slice(0, 40),
    languages: (languagesSection?.entries || []).slice(0, 30).map(language => ({ language, level: 'Unknown', sourceQuotes: [language] })),
    capabilities: [],
    otherExplicitInformation: [],
    sections,
  };
}

export function normalizeResumeData(raw, sourceText = '') {
  const fallback = buildFallbackResumeData(sourceText);
  const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const education = normalizeEducation(data.education, sourceText);
  const experience = normalizeExperience(data.experience, sourceText);
  const sections = normalizeSections(data.sections);

  return {
    schemaVersion: RESUME_DOCUMENT_VERSION,
    name: cleanString(data.name, 240),
    headline: cleanString(data.headline || data.title, 300),
    summary: cleanString(data.summary || data.profile, 2000),
    skills: normalizeStringList(data.skills, 100, 240),
    programmingLanguages: normalizeEvidenceItems(data.programmingLanguages, sourceText),
    toolsAndFrameworks: normalizeEvidenceItems(data.toolsAndFrameworks, sourceText),
    experience: experience.length ? experience : normalizeExperience(fallback.experience, sourceText),
    internships: normalizeExperience(data.internships, sourceText),
    projects: normalizeExperience(data.projects, sourceText),
    responsibilities: normalizeEvidenceItems(data.responsibilities, sourceText),
    appliedMethods: normalizeEvidenceItems(data.appliedMethods, sourceText),
    domainKnowledge: normalizeEvidenceItems(data.domainKnowledge, sourceText),
    achievements: normalizeEvidenceItems(data.achievements, sourceText),
    education: education.length ? education : fallback.education,
    certifications: normalizeStringList(data.certifications, 50, 300),
    languages: normalizeProfileLanguages(data.languages, sourceText),
    capabilities: normalizeCapabilities(data.capabilities, sourceText),
    otherExplicitInformation: normalizeEvidenceItems(data.otherExplicitInformation, sourceText),
    // New AI profiles do not need a second raw-text dump. Keep explicit
    // legacy sections and the original sourceText for compatibility/evidence.
    sections: sections.length ? sections : data.schemaVersion === RESUME_DOCUMENT_VERSION ? [] : fallback.sections,
  };
}

function appendField(lines, label, value) {
  if (value) lines.push(`${label}: ${value}`);
}

export function buildResumeAnalysisText(structuredData, sourceText = '') {
  const data = normalizeResumeData(structuredData, sourceText);
  const lines = [
    `STRUCTURED RESUME PROFILE (${RESUME_DOCUMENT_VERSION})`,
    'This profile is derived from the uploaded resume. Verify claims against the exact source text below.',
  ];

  appendField(lines, 'Name', data.name);
  appendField(lines, 'Headline', data.headline);
  appendField(lines, 'Summary', data.summary);

  if (data.skills.length) {
    lines.push(`Skills: ${data.skills.join('; ')}`);
  }

  if (data.experience.length) {
    lines.push('Experience:');
    data.experience.forEach(item => {
      const header = [item.title, item.company, item.duration].filter(Boolean).join(' | ');
      if (header) lines.push(`- ${header}`);
      if (item.description) lines.push(`  Description: ${item.description}`);
      item.highlights.forEach((highlight, index) => lines.push(`  Highlight: ${highlight}${item.fieldEvidence?.highlights?.[index] ? ` | CV source: ${item.fieldEvidence.highlights[index]}` : ' [Unverified in source]'}`));
    });
  }

  if (data.education.length) {
    lines.push('Education & certifications:');
    data.education.forEach(item => {
      const header = [item.degree, item.field, item.institution, item.year].filter(Boolean).join(' | ');
      if (header) lines.push(`- ${header}`);
      item.details.forEach(detail => lines.push(`  Detail: ${detail}`));
    });
  }

  if (data.certifications.length) {
    lines.push(`Certifications: ${data.certifications.join('; ')}`);
  }

  if (data.languages.length) {
    lines.push(`Languages: ${data.languages.map(item => `${item.language} - ${item.level} [${item.source === 'user-confirmed' ? 'User-confirmed Profile Data' : 'CV-extracted'}]`).join('; ')}`);
  }

  if (data.capabilities.length) {
    lines.push('Evidence-backed capabilities (verify against source below):');
    data.capabilities.forEach(item => {
      lines.push(`- ${item.capability} [${item.status}]${item.category ? ` (${item.category})` : ''}`);
      for (const field of ['contribution', 'method', 'domain', 'outcome']) {
        if (item[field]) lines.push(`  ${field}: ${item[field]}`);
      }
      if (item.transferableTo.length) lines.push(`  Transferable to: ${item.transferableTo.join('; ')}`);
      item.sourceQuotes.forEach(quote => lines.push(`  CV source: ${quote}`));
    });
  }
  if (data.otherExplicitInformation.length) {
    lines.push('Other explicit candidate information:');
    data.otherExplicitInformation.forEach(item => lines.push(`- ${item.label}${item.sourceQuotes.length ? ` | CV source: ${item.sourceQuotes.join(' + ')}` : ' [Unverified in source]'}`));
  }
  for (const [heading, key] of [
    ['Programming languages', 'programmingLanguages'], ['Tools and frameworks', 'toolsAndFrameworks'],
    ['Responsibilities and contributions', 'responsibilities'], ['Applied methods', 'appliedMethods'],
    ['Domain knowledge', 'domainKnowledge'], ['Relevant achievements', 'achievements'],
  ]) {
    if (!data[key].length) continue;
    lines.push(`${heading}:`);
    data[key].forEach(item => lines.push(`- ${item.label} [${item.status}]${item.sourceQuotes.length ? ` | CV source: ${item.sourceQuotes.join(' + ')}` : ''}`));
  }
  for (const [heading, key] of [['Internships', 'internships'], ['Academic and engineering projects', 'projects']]) {
    if (!data[key].length) continue;
    lines.push(`${heading}:`);
    data[key].forEach(item => {
      lines.push(`- ${[item.title, item.company, item.duration].filter(Boolean).join(' | ')}`);
      if (item.description) lines.push(`  Contribution: ${item.description}`);
      item.highlights.forEach((highlight, index) => lines.push(`  Bullet: ${highlight}${item.fieldEvidence?.highlights?.[index] ? ` | CV source: ${item.fieldEvidence.highlights[index]}` : ' [Unverified in source]'}`));
      item.sourceQuotes.forEach(quote => lines.push(`  CV source: ${quote}`));
    });
  }

  lines.push('', 'EXACT EXTRACTED RESUME SOURCE (use this section for quotation verification)', normalizeResumeText(sourceText));
  return lines.join('\n').trim();
}

export function getResumeDataStats(structuredData) {
  const data = normalizeResumeData(structuredData);
  return {
    skills: data.skills.length,
    experience: data.experience.length,
    education: data.education.length,
    certifications: data.certifications.length,
    languages: data.languages.length,
    capabilities: data.capabilities.length,
    internships: data.internships.length,
    projects: data.projects.length,
    otherExplicitInformation: data.otherExplicitInformation.length,
  };
}

export function hasUsableStructuredResume(structuredData) {
  const stats = getResumeDataStats(structuredData);
  return Object.values(stats).some(value => value > 0)
    || Boolean(structuredData?.name || structuredData?.headline || structuredData?.summary);
}

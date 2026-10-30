import assert from 'node:assert/strict';
import test from 'node:test';
import { extractPdfPageLayout } from '../src/shared/pdf-text.js';
import { findCvEvidence } from '../src/shared/cv-evidence.js';
import { normalizeProfileLanguages, normalizeResumeData, RESUME_DOCUMENT_VERSION } from '../src/shared/resume-document.js';
import { buildResumeProfileView } from '../src/shared/resume-profile-view.js';
import { renderResumeProfileView } from '../src/sidepanel/resume-profile-view.js';
import { scoreEvidence, STATUS_POINTS } from '../src/shared/evidence-scoring.js';
import { buildScoringProfile } from '../src/shared/scoring-profile.js';
import { getResumeProfileView, loadResumeProfile, saveResumeProfile, selectResumeProfile } from '../src/background/resume-manager.js';
import { setCurrentLocale, t } from '../src/i18n/index.js';

const pdfItem = (str, x, y, width) => ({ str, transform: [1, 0, 0, 1, x, y], width, height: 10 });

function storage() {
  const values = {};
  globalThis.chrome = { storage: { local: {
    get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, values[key]])),
    set: async update => Object.assign(values, update),
    remove: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key]; },
  } } };
  return values;
}

test('synthetic two-column Skills and Projects retain column reading order and page positions', () => {
  const items = [
    pdfItem('Skills', 40, 700, 40), pdfItem('Projects', 320, 700, 55),
    pdfItem('Python', 40, 680, 42), pdfItem('Context-Aware Driving Feedback System', 320, 680, 220),
    pdfItem('SQL', 40, 660, 22), pdfItem('Embedded Visual Control', 320, 660, 150),
    pdfItem('Linux', 40, 640, 32), pdfItem('Central Apnea Detection', 320, 640, 150),
  ];
  const result = extractPdfPageLayout(items, { page: 2, pageWidth: 595 });
  assert.equal(result.columnsDetected, true);
  assert.equal(result.text, 'Skills\nPython\nSQL\nLinux\nProjects\nContext-Aware Driving Feedback System\nEmbedded Visual Control\nCentral Apnea Detection');
  assert.deepEqual(result.qualityIssues, []);
  assert.equal(result.fragments.find(item => item.text === 'Central Apnea Detection').page, 2);
  assert.equal(result.fragments.find(item => item.text === 'Central Apnea Detection').x, 320);
});

test('PDF fragments rejoin broken terms and dates while preserving real word gaps and line breaks', () => {
  const items = [
    pdfItem('C', 40, 700, 7), pdfItem('ontext', 47, 700, 35), pdfItem('-', 82, 700, 5),
    pdfItem('Aware', 87, 700, 30), pdfItem('Driving Feedback System', 123, 700, 145),
    pdfItem('Apr 202', 40, 680, 42), pdfItem('5', 82, 680, 7),
    pdfItem('J', 40, 660, 7), pdfItem('ul', 47, 660, 12),
    pdfItem('Linked camera output across', 40, 640, 150),
    pdfItem('two processing stages.', 40, 625, 125),
  ];
  const result = extractPdfPageLayout(items, { pageWidth: 595 });
  assert.match(result.text, /Context-Aware Driving Feedback System/);
  assert.match(result.text, /Apr 2025/);
  assert.match(result.text, /\nJul\n/);
  assert.match(result.text, /Linked camera output across\ntwo processing stages/);
  assert.equal(findCvEvidence(result.text, 'Linked camera output across two processing stages.')?.quote,
    'Linked camera output across\ntwo processing stages.');
  assert.equal(findCvEvidence('Python framework', 'Pythonframework')?.quote, undefined);
  assert.equal(findCvEvidence('Visual ﬁeld work', 'Visual field work')?.quote, 'Visual ﬁeld work');
  assert.equal(extractPdfPageLayout([pdfItem('Built ', 40, 700, 30), pdfItem('a', 70, 700, 5),
    pdfItem('system', 80, 700, 38)], { pageWidth: 595 }).text, 'Built a system');
});

test('ambiguous PDF columns produce an explicit quality warning', () => {
  const items = [
    pdfItem('Technical Skills', 40, 700, 100), pdfItem('Project Experience', 320, 700, 120),
    pdfItem('Python and SQL', 40, 680, 90), pdfItem('Built a visual control system', 320, 680, 175),
    pdfItem('Machine learning tools', 40, 660, 140), pdfItem('Developed a feedback pipeline', 320, 660, 180),
    pdfItem('Other methods', 40, 640, 85), pdfItem('Validated camera output', 320, 640, 140),
    pdfItem('Wide unstructured line crossing both columns', 40, 620, 490),
    pdfItem('Another wide line crossing both columns', 40, 600, 490),
    pdfItem('Third wide line crossing both columns', 40, 580, 490),
  ];
  const result = extractPdfPageLayout(items, { pageWidth: 595 });
  assert.equal(result.columnsDetected, false);
  assert.match(result.qualityIssues.join(' '), /Ambiguous PDF reading order/);
  assert.match(t('Page 2: Ambiguous PDF reading order; review this page.', 'zh-CN'), /第 2 页/);
});

test('project fields and each bullet receive independent evidence states', () => {
  const source = `PROJECTS\nContext-Aware Driving Feedback System | Apr 202 5\n• Built a Python pipeline for driving feedback using cameras.\n• Linked camera output across\ntwo processing stages.`;
  const data = normalizeResumeData({ schemaVersion: 'resume-v3', projects: [{
    title: 'Context-Aware Driving Feedback System', company: 'Research Lab', duration: 'Apr 2025',
    highlights: [
      'Built a Python pipeline for driving feedback using cameras.',
      'Linked camera output across two processing stages.',
      'Implemented a Python pipeline for driving feedback',
      'Built Python pipeline enabling autonomous path planning',
      'Used Kubernetes',
    ],
    fieldEvidence: {
      title: 'Context-Aware Driving Feedback System', company: '', duration: 'Apr 202 5',
      highlights: [
        'Built a Python pipeline for driving feedback using cameras.',
        'Linked camera output across\ntwo processing stages.',
        'Built a Python pipeline for driving feedback using cameras.',
        'Built a Python pipeline for driving feedback using cameras.',
        'Context-Aware Driving Feedback System',
      ],
    },
    sourceQuotes: ['Context-Aware Driving Feedback System', 'Apr 202 5'],
  }] }, source);
  const item = data.projects[0];
  assert.deepEqual(data.sections, []);
  assert.equal(item.fieldEvidence.highlights.length, 5);
  assert.equal(item.fieldEvidence.highlights[1], 'Linked camera output across\ntwo processing stages.');
  const view = buildResumeProfileView({ id: 'example', sourceSchemaVersion: 'resume-v3', sourceText: source,
    structuredData: data });
  const fields = view.sections.find(section => section.key === 'projects').entries[0].fields;
  assert.deepEqual(fields.slice(0, 3).map(field => [field.label, field.status]), [
    ['Project Name', 'Verified'], ['Organization', 'Unverified'], ['Period', 'Verified'],
  ]);
  assert.deepEqual(fields.slice(3).map(field => field.status),
    ['Verified', 'Verified', 'Source-supported', 'Inferred', 'Unverified']);
  assert.equal(fields[4].sourceQuote, 'Linked camera output across\ntwo processing stages.');
  assert.equal(fields[7].sourceQuote, '');
  assert.equal(view.sections.some(section => ['domainKnowledge', 'transferableSkills', 'responsibilities', 'achievements', 'otherSections'].includes(section.key)), false);
  setCurrentLocale('en');
  const html = renderResumeProfileView(view);
  assert.match(html, /Project Name/);
  assert.match(html, /Organization/);
  assert.match(html, /Period/);
  assert.match(html, /Bullet Point/);
  assert.doesNotMatch(html, /<summary>Domain Knowledge|<summary>Transferable Skills|Other CV Sections/);
  assert.doesNotMatch(html, /Description<\/span>.*Unknown/);
});

test('matching validation accepts only source-backed CV excerpts and preserves the score formula', () => {
  const source = 'Linked camera output across\ntwo processing stages.';
  const profile = buildScoringProfile({ includeSponsorshipInScore: false }, false);
  const raw = { rubricVersion: 'evidence-v1', extractionComplete: true, requirements: [{
    dimension: 'Skills & Experience Relevance', importance: 'required', jdQuote: 'camera output',
    resumeQuotes: ['Linked camera output across two processing stages.'], status: 'met', hard: false, reason: 'Direct CV evidence.',
  }] };
  const result = scoreEvidence(raw, { description: 'camera output' }, source, profile, source);
  assert.equal(result.rubric.requirements[0].status, 'met');
  assert.equal(result.rubric.requirements[0].resumeQuote, source);
  assert.equal(result.overallMatchPercent, 100);
  assert.equal(STATUS_POINTS.balanced.partial, 70);
  const unsupported = scoreEvidence({ ...raw, requirements: [{ ...raw.requirements[0], resumeQuotes: ['Used Kubernetes'] }] },
    { description: 'camera output' }, source, profile, source);
  assert.equal(unsupported.rubric.requirements[0].status, 'unknown');
});

test('a skill in another project cannot verify this project bullet', () => {
  const source = 'Project Alpha\nBuilt camera feedback.\nProject Beta\nUsed Kubernetes.';
  const data = normalizeResumeData({ schemaVersion: 'resume-v3', projects: [
    { title: 'Project Alpha', highlights: ['Used Kubernetes.'],
      fieldEvidence: { highlights: ['Used Kubernetes.'] }, sourceQuotes: ['Project Alpha'] },
    { title: 'Project Beta', highlights: ['Used Kubernetes.'],
      fieldEvidence: { highlights: ['Used Kubernetes.'] }, sourceQuotes: ['Project Beta'] },
  ] }, source);
  assert.equal(data.projects[0].fieldEvidence.highlights[0], '');
  assert.equal(data.projects[1].fieldEvidence.highlights[0], 'Used Kubernetes.');
  const view = buildResumeProfileView({ id: 'scope', sourceSchemaVersion: 'resume-v3', sourceText: source, structuredData: data });
  const projectEntries = view.sections.find(section => section.key === 'projects').entries;
  assert.equal(projectEntries[0].fields.find(field => field.label === 'Bullet Point').status, 'Unverified');
  assert.equal(projectEntries[1].fields.find(field => field.label === 'Bullet Point').status, 'Verified');
});

test('stored PDF fragments, old fields, and per-CV evidence stay isolated without losing old data', async () => {
  const values = storage();
  const a = await saveResumeProfile({ sourceText: 'Project A\n• Built Python pipeline.',
    structuredData: { schemaVersion: 'resume-v3', projects: [{ title: 'Project A', highlights: ['Built Python pipeline.'] }] },
    sourceFragments: [{ page: 1, text: 'Built Python pipeline.', x: 40, y: 600 }],
  });
  const b = await saveResumeProfile({ fileName: 'older.pdf', sourceText: 'Project B\n• Built Java service.',
    structuredData: { schemaVersion: 'resume-v2', projects: [{ title: 'Project B', highlights: ['Built Java service.'] }],
      capabilities: [{ capability: 'Legacy capability', sourceQuotes: ['Built Java service.'] }] },
  });
  const oldHash = b.profile.hash;
  assert.equal((await getResumeProfileView(b.profile.id)).needsReparse, true);
  assert.match(renderResumeProfileView(await getResumeProfileView(b.profile.id)), /upload the original file again/);
  assert.equal((await loadResumeProfile(b.profile.id)).structuredData.capabilities[0].capability, 'Legacy capability');
  await selectResumeProfile(a.profile.id);
  const aView = await getResumeProfileView(a.profile.id);
  assert.match(JSON.stringify(aView), /Project A/);
  assert.doesNotMatch(JSON.stringify(aView), /Project B/);
  assert.equal((await loadResumeProfile(a.profile.id)).sourceFragments[0].page, 1);
  assert.equal(values.resumeLibrary.profiles.length, 2);
  assert.equal((await loadResumeProfile(b.profile.id)).hash, oldHash);
  assert.equal(RESUME_DOCUMENT_VERSION, 'resume-v3');
});

test('language levels without model quotes are verified only against their own CV entries', () => {
  const source = 'Languages\nEnglish (Proficient)\nDutch (Beginner, actively learning)\nMandarin (Native)\nCantonese (Native)\nGerman';
  const languages = [
    { language: 'English', level: 'Proficient' },
    { language: 'Dutch', level: 'Beginner, actively learning' },
    { language: 'Mandarin', level: 'Native' },
    { language: 'Cantonese', level: 'Native' },
  ];
  const normalized = normalizeProfileLanguages(languages, source);
  assert.deepEqual(normalized.map(item => item.sourceQuotes[0]), [
    'English (Proficient)', 'Dutch (Beginner, actively learning)', 'Mandarin (Native)', 'Cantonese (Native)',
  ]);
  const view = buildResumeProfileView({ id: 'languages', sourceSchemaVersion: 'resume-v3', sourceText: source,
    structuredData: { languages } });
  const entries = view.sections.find(section => section.key === 'languages').entries;
  assert.deepEqual(entries.map(entry => entry.fields[1].status), ['Verified', 'Verified', 'Verified', 'Verified']);
  assert.equal(entries[1].fields[1].sourceQuote, 'Dutch (Beginner, actively learning)');
  assert.equal(normalizeProfileLanguages([{ language: 'Dutch', level: 'Beginner' }], source)[0].sourceQuotes[0],
    'Dutch (Beginner, actively learning)');

  const incorrect = normalizeProfileLanguages([
    { language: 'Dutch', level: 'Proficient', sourceQuotes: ['English (Proficient)'] },
    { language: 'English', level: 'Native', sourceQuotes: ['Mandarin (Native)'] },
    { language: 'German', level: 'B2' },
  ], source);
  assert.deepEqual(incorrect.map(item => item.level), ['Unknown', 'Unknown', 'Unknown']);
  const incorrectView = buildResumeProfileView({ id: 'wrong-levels', sourceText: source,
    structuredData: { languages: incorrect } });
  assert.deepEqual(incorrectView.sections.find(section => section.key === 'languages').entries
    .map(entry => entry.fields[1].status), ['Unknown', 'Unknown', 'Unknown']);
  assert.equal(incorrectView.sections.find(section => section.key === 'languages').entries[2].fields[0].status,
    'Verified');
});

test('stored resume-v3 language levels gain source evidence on read without reparse or storage writes', async () => {
  const values = storage();
  const sourceText = 'English (Proficient)\nDutch (Beginner)';
  values.resumeLibrary = { version: 1, activeResumeId: 'old-v3', profiles: [{
    id: 'old-v3', sourceText, sourceSchemaVersion: 'resume-v3', parseStatus: 'ai-parsed',
    structuredData: { schemaVersion: 'resume-v3', languages: [
      { language: 'English', level: 'Proficient' }, { language: 'Dutch', level: 'Beginner' },
    ] },
  }] };
  const before = JSON.stringify(values.resumeLibrary);
  const view = await getResumeProfileView('old-v3');
  assert.equal(view.needsReparse, false);
  assert.deepEqual(view.sections.find(section => section.key === 'languages').entries
    .map(entry => entry.fields[1].status), ['Verified', 'Verified']);
  assert.equal(JSON.stringify(values.resumeLibrary), before);
});

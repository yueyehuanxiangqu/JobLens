import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  getResumeProfileView, getResumeLibrarySnapshot, saveResumeProfile,
  selectResumeProfile, updateActiveResumeLanguages,
} from '../src/background/resume-manager.js';
import { buildResumeProfileView } from '../src/shared/resume-profile-view.js';
import { renderResumeProfileView } from '../src/sidepanel/resume-profile-view.js';
import { setCurrentLocale } from '../src/i18n/index.js';

function installStorage(initial = {}) {
  const values = { ...initial };
  let writes = 0;
  globalThis.chrome = { storage: { local: {
    get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, values[key]])),
    set: async update => { writes += 1; Object.assign(values, update); },
    remove: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key]; },
  } } };
  return { values, writeCount: () => writes };
}

test('View Profile is bound to requested resumeId; switching CV does not parse or mix fields', async () => {
  const storage = installStorage();
  const a = await saveResumeProfile({ sourceText: 'MSc Physics. Python projects. Private note A.',
    structuredData: { schemaVersion: 'resume-v2', education: [{ degree: 'MSc Physics', sourceQuotes: ['MSc Physics'] }], skills: ['Python'] } });
  const b = await saveResumeProfile({ sourceText: 'BSc Computer Science. Java projects. Private note B.',
    structuredData: { schemaVersion: 'resume-v2', education: [{ degree: 'BSc Computer Science', sourceQuotes: ['BSc Computer Science'] }], skills: ['Java'] } });
  const writesBeforeView = storage.writeCount();
  const aView = await getResumeProfileView(a.profile.id);
  const bView = await getResumeProfileView(b.profile.id);
  assert.equal(storage.writeCount(), writesBeforeView);
  assert.equal(aView.id, a.profile.id);
  assert.equal(bView.id, b.profile.id);
  assert.match(JSON.stringify(aView), /MSc Physics/);
  assert.doesNotMatch(JSON.stringify(aView), /Java|Private note B/);
  assert.match(JSON.stringify(bView), /BSc Computer Science/);
  assert.doesNotMatch(JSON.stringify(bView), /Python|Private note A/);
  assert.equal('sourceText' in aView, false);
  assert.equal('sourceText' in bView, false);
  await selectResumeProfile(a.profile.id);
  assert.equal((await getResumeProfileView(b.profile.id)).id, b.profile.id);
  assert.equal((await getResumeLibrarySnapshot()).activeResumeId, a.profile.id);
  assert.equal(aView.schemaVersion, 'resume-v2');
  assert.ok(Date.parse(aView.parsedAt));
});

test('viewer shows exact CV evidence and conservatively marks unsupported values', () => {
  const view = buildResumeProfileView({
    id: 'resume-evidence', fileName: 'cv.txt', sourceSchemaVersion: 'resume-v2', needsReparse: false,
    sourceText: 'Built a Python pipeline. Dutch B2. Email: private@example.test',
    structuredData: {
      skills: ['Python', 'Rust'],
      capabilities: [{ capability: 'Distributed systems architect', sourceQuotes: ['Built a Python pipeline.', 'Invented quote'] }],
      languages: [{ language: 'Dutch', level: 'B2', source: 'cv-extracted', sourceQuotes: ['Dutch B2'] },
        { language: 'German', level: 'Unknown', source: 'cv-extracted', sourceQuotes: [] }],
    },
  });
  const technical = view.sections.find(item => item.key === 'technicalSkills').entries;
  assert.equal(technical[0].fields[0].status, 'Verified');
  assert.equal(technical[0].fields[0].sourceQuote, 'Python');
  assert.equal(technical.length, 1);
  assert.equal(view.sections.some(item => item.key === 'transferableSkills'), false);
  const languages = view.sections.find(item => item.key === 'languages').entries;
  assert.equal(languages[0].fields[1].status, 'Verified');
  assert.equal(languages[1].fields[1].status, 'Unknown');
  assert.doesNotMatch(JSON.stringify(view), /private@example\.test|Invented quote/);
  assert.equal(view.sections.some(item => item.key === 'education'), false);
});

test('user-confirmed languages are distinct from CV-verified facts and persist on the same CV', async () => {
  installStorage();
  const saved = await saveResumeProfile({ sourceText: 'Python engineer.', structuredData: { schemaVersion: 'resume-v2', skills: ['Python'] } });
  const parsedAt = (await getResumeProfileView(saved.profile.id)).parsedAt;
  await updateActiveResumeLanguages(saved.profile.id, [{ language: 'Dutch', level: 'C1' }]);
  const view = await getResumeProfileView(saved.profile.id);
  const language = view.sections.find(section => section.key === 'languages').entries[0];
  assert.deepEqual(language.fields.map(item => item.status), ['User-confirmed', 'User-confirmed']);
  assert.equal(language.sourceQuotes.length, 0);
  assert.equal(view.parsedAt, parsedAt);
});

test('old schema stays visibly old and unknown parse time is not presented as parsed time', async () => {
  installStorage({ resumeLibrary: { version: 1, activeResumeId: 'old', profiles: [{
    id: 'old', fileName: 'old.txt', sourceText: 'MSc Mathematics.',
    structuredData: { schemaVersion: 'resume-v1', education: [{ degree: 'MSc Mathematics' }] },
    updatedAt: '2024-01-01T12:00:00Z',
  }] } });
  const view = await getResumeProfileView('old');
  assert.equal(view.schemaVersion, 'resume-v1');
  assert.equal(view.currentSchemaVersion, 'resume-v3');
  assert.equal(view.needsReparse, true);
  assert.equal(view.parsedAt, null);
  assert.match(renderResumeProfileView(view), /Older Profile schema/);
  assert.match(renderResumeProfileView(view), /Last parsed[^<]*<strong>Unknown/);
});

test('viewer translates chrome labels without translating CV data or quotes', () => {
  const view = buildResumeProfileView({ id: 'resume-translation', sourceSchemaVersion: 'resume-v2',
    sourceText: 'Python <script>alert(1)</script>', structuredData: { skills: ['Python', '<script>alert(1)</script>'] },
  });
  setCurrentLocale('en');
  const en = renderResumeProfileView(view);
  assert.match(en, /Technical Skills/);
  assert.match(en, /Verified/);
  setCurrentLocale('zh-CN');
  const zh = renderResumeProfileView(view);
  assert.match(zh, /技术技能/);
  assert.match(zh, /已核实/);
  assert.match(zh, /translate="no">Python/);
  assert.doesNotMatch(zh, /<script>/);
  assert.match(zh, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  setCurrentLocale('en');
  const app = readFileSync(new URL('../src/sidepanel/app.js', import.meta.url), 'utf8');
  assert.match(app, /data-resume-action="view-profile"/);
  assert.match(app, /Actions\.GET_RESUME_PROFILE/);
});

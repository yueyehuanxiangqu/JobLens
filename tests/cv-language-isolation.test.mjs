import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig, saveConfig } from '../src/background/config-manager.js';
import {
  getResumeLibrarySnapshot, loadPersistentResume, saveResumeProfile,
  selectResumeProfile, updateActiveResumeLanguages,
} from '../src/background/resume-manager.js';
import { formatConfirmedProfileLanguages, normalizeResumeData } from '../src/shared/resume-document.js';
import { buildMatchingPrompt, MATCH_PROMPT_VERSION } from '../src/prompts/prompt-templates.js';
import { buildCacheContext, buildScoringProfile } from '../src/shared/scoring-profile.js';

function installStorage(initial = {}) {
  const values = { ...initial };
  globalThis.chrome = { storage: { local: {
    get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, values[key]])),
    set: async update => Object.assign(values, update),
    remove: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key]; },
  } } };
  return values;
}

function matchingPrompt(resume, config) {
  return buildMatchingPrompt(
    { title: 'Engineer', description: 'Dutch B2 required.' }, resume.text, true, null,
    { ...buildScoringProfile(config, false), profileLanguages: resume.structuredData.languages },
  ).userPrompt;
}

test('legacy global languages are archived across save/reload and never supplied to analysis', async () => {
  const values = installStorage({ ljm_config: {
    provider: 'gemini', apiKey: 'existing-key', modelId: 'existing-model',
    candidatePreferences: { willingToRelocateWithinNetherlands: 'Yes', languages: [{ language: 'Dutch', level: 'C1' }] },
    archivedGlobalLanguages: [{ language: 'English', level: 'B2' }],
  }, resumeLibrary: { profiles: [] }, unrelatedHistory: [{ id: 1 }] });
  const config = await loadConfig();
  assert.deepEqual(config.archivedGlobalLanguages, [
    { language: 'English', level: 'B2' }, { language: 'Dutch', level: 'C1' },
  ]);
  assert.equal('languages' in config.candidatePreferences, false);
  assert.equal(config.candidatePreferences.willingToRelocateWithinNetherlands, 'Yes');
  assert.doesNotMatch(matchingPrompt({ text: 'CV with no language entry.', structuredData: { languages: [] } }, config), /Language: Dutch — C1/);
  await saveConfig(config);
  const reloaded = await loadConfig();
  assert.deepEqual(reloaded.archivedGlobalLanguages, config.archivedGlobalLanguages);
  assert.equal(reloaded.apiKey, 'existing-key');
  assert.deepEqual(values.unrelatedHistory, [{ id: 1 }]);
  assert.deepEqual(values.resumeLibrary, { profiles: [] });
  assert.equal('languages' in values.ljm_config.candidatePreferences, false);
});

test('manual language edits belong only to the selected CV and survive switching', async () => {
  installStorage();
  const first = await saveResumeProfile({ sourceText: 'Python and Dutch B2 projects.',
    structuredData: normalizeResumeData({ languages: [{ language: 'Dutch', level: 'B2', sourceQuotes: ['Dutch B2'] }] }, 'Python and Dutch B2 projects.') });
  const second = await saveResumeProfile({ sourceText: 'Java engineering and French B1.',
    structuredData: normalizeResumeData({ languages: [{ language: 'French', level: 'B1', sourceQuotes: ['French B1'] }] }, 'Java engineering and French B1.') });
  const beforeSecond = second.activeResume.hash;
  await selectResumeProfile(first.activeResume.id);
  const beforeFirst = (await loadPersistentResume()).hash;
  const edited = await updateActiveResumeLanguages(first.activeResume.id, [{ language: 'Dutch', level: 'C1' }]);
  assert.notEqual(edited.activeResume.hash, beforeFirst);
  assert.deepEqual(edited.activeResume.structuredData.languages.map(({ language, level, source }) => ({ language, level, source })),
    [{ language: 'Dutch', level: 'Proficient', source: 'user-confirmed' }]);
  assert.doesNotMatch(matchingPrompt(edited.activeResume, {}), /current-cv-profile-confirmed-languages/);
  await selectResumeProfile(second.activeResume.id);
  const selectedSecond = await loadPersistentResume();
  assert.equal(selectedSecond.hash, beforeSecond);
  assert.deepEqual(selectedSecond.structuredData.languages.map(item => item.language), ['French']);
  assert.equal(formatConfirmedProfileLanguages(selectedSecond.structuredData.languages), '');
  assert.doesNotMatch(matchingPrompt(selectedSecond, {}), /Language: Dutch — C1/);
  await assert.rejects(updateActiveResumeLanguages(first.activeResume.id, [{ language: 'Dutch', level: 'A1' }]), /Select this resume/);
  await selectResumeProfile(first.activeResume.id);
  assert.equal((await loadPersistentResume()).structuredData.languages[0].level, 'Proficient');
  const snapshot = await getResumeLibrarySnapshot();
  assert.equal(snapshot.resumes.length, 2);
  assert.equal(snapshot.resumes.find(item => item.id === second.activeResume.id).languages[0].language, 'French');
  const firstCache = await buildCacheContext({}, edited.activeResume.hash, MATCH_PROMPT_VERSION);
  const secondCache = await buildCacheContext({}, selectedSecond.hash, MATCH_PROMPT_VERSION);
  assert.notEqual(firstCache.resumeHash, secondCache.resumeHash);
});

test('missing proficiency remains Unknown and malformed language edits are rejected', async () => {
  installStorage();
  const saved = await saveResumeProfile({ sourceText: 'I speak Dutch.',
    structuredData: normalizeResumeData({ languages: [{ language: 'Dutch', sourceQuotes: ['Dutch'] }] }, 'I speak Dutch.') });
  assert.equal(saved.activeResume.structuredData.languages[0].level, 'Unknown');
  assert.equal(formatConfirmedProfileLanguages(saved.activeResume.structuredData.languages), '');
  assert.doesNotMatch(matchingPrompt(saved.activeResume, {}), /current-cv-profile-confirmed-languages/);
  await assert.rejects(updateActiveResumeLanguages(saved.activeResume.id, [null]), /Invalid profile languages/);
});

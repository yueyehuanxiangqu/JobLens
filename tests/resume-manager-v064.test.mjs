import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import {
  deleteResumeProfile,
  getResumeLibrarySnapshot,
  loadPersistentResume,
  saveResumeProfile,
  selectResumeProfile,
} from '../src/background/resume-manager.js';

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

function clone(value) {
  return value === undefined ? value : structuredClone(value);
}

function installChromeStorage(initial = {}) {
  const store = clone(initial);
  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
          if (keys == null) return clone(store);
          const names = Array.isArray(keys)
            ? keys
            : typeof keys === 'string'
              ? [keys]
              : Object.keys(keys);
          const result = {};
          names.forEach(name => {
            if (Object.prototype.hasOwnProperty.call(store, name)) {
              result[name] = clone(store[name]);
            }
          });
          return result;
        },
        async set(values) {
          Object.assign(store, clone(values));
        },
        async remove(keys) {
          const names = Array.isArray(keys) ? keys : [keys];
          names.forEach(name => delete store[name]);
        },
      },
    },
  };
  return store;
}

const sourceA = 'EDUCATION\nMSc Management of Technology\nDelft University of Technology';
const sourceB = 'EXPERIENCE\nData Analyst\nBuilt SQL dashboards for finance teams.';

test('resume library stores multiple profiles and switches the active analysis resume', async () => {
  const store = installChromeStorage();
  const first = await saveResumeProfile({
    fileName: 'education-resume.pdf',
    sourceText: sourceA,
    structuredData: { education: [{ degree: 'MSc', institution: 'Delft University of Technology' }] },
  });
  const second = await saveResumeProfile({
    fileName: 'analytics-resume.pdf',
    sourceText: sourceB,
    structuredData: { experience: [{ title: 'Data Analyst', company: 'Example BV' }] },
  });

  assert.equal(second.snapshot.resumes.length, 2);
  assert.equal(second.snapshot.activeResumeId, second.profile.id);
  assert.equal(second.snapshot.resumes[0].fileName, 'analytics-resume.pdf');
  assert.equal('sourceText' in second.snapshot.resumes[0], false);
  assert.equal(store.resumeLibrary.profiles.length, 2);

  const selected = await selectResumeProfile(first.profile.id);
  assert.equal(selected.snapshot.activeResumeId, first.profile.id);
  assert.equal(selected.activeResume.fileName, 'education-resume.pdf');
  assert.match(selected.activeResume.text, /Delft University of Technology/);

  const deleted = await deleteResumeProfile(first.profile.id);
  assert.equal(deleted.snapshot.activeResumeId, second.profile.id);
  assert.equal(deleted.snapshot.resumes.length, 1);
});

test('legacy persistentResume is migrated once into the resume library', async () => {
  const store = installChromeStorage({
    persistentResume: {
      fileName: 'legacy.pdf',
      text: sourceA,
      updatedAt: '2026-09-16T10:00:00.000Z',
    },
  });

  const snapshot = await getResumeLibrarySnapshot();
  assert.equal(snapshot.resumes.length, 1);
  assert.equal(snapshot.resumes[0].fileName, 'legacy.pdf');
  assert.equal(snapshot.resumes[0].parseStatus, 'legacy');
  assert.equal(store.persistentResume, undefined);
  assert.ok(store.resumeLibrary);

  const active = await loadPersistentResume();
  assert.equal(active.fileName, 'legacy.pdf');
  assert.match(active.text, /STRUCTURED RESUME PROFILE/);
});

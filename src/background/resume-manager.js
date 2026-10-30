import {
  buildResumeAnalysisText,
  buildFallbackResumeData,
  getResumeDataStats,
  normalizeResumeData,
  normalizeResumeText,
  normalizeProfileLanguages,
  RESUME_DOCUMENT_VERSION,
} from '../shared/resume-document.js';
import { buildResumeProfileView } from '../shared/resume-profile-view.js';

export const RESUME_LIBRARY_STORAGE_KEY = 'resumeLibrary';
export const LEGACY_RESUME_STORAGE_KEY = 'persistentResume';
export const RESUME_LIBRARY_VERSION = 1;

function createResumeId() {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `resume_${random}`;
}

async function hashText(text) {
  const buffer = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function parseStatus(value) {
  return ['ai-parsed', 'local-fallback', 'legacy'].includes(value) ? value : 'local-fallback';
}

function shortError(value) {
  return typeof value === 'string' ? value.trim().slice(0, 240) : '';
}

async function normalizeProfile(raw = {}, fallbackIndex = 0) {
  const sourceText = normalizeResumeText(raw.sourceText || raw.text);
  const sourceSchemaVersion = raw.sourceSchemaVersion || (raw.structuredData || raw.parsedData)?.schemaVersion || 'Unknown';
  const structuredData = normalizeResumeData(raw.structuredData || raw.parsedData, sourceText);
  const needsReparse = raw.needsReparse === true
    || sourceSchemaVersion !== RESUME_DOCUMENT_VERSION;
  const analysisText = buildResumeAnalysisText(structuredData, sourceText);
  // Recompute from the canonical source on every save so replacing a profile
  // cannot accidentally retain the previous resume's cache identity.
  const sourceHash = await hashText(sourceText);
  const hash = await hashText(analysisText);
  const now = new Date().toISOString();

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `resume_legacy_${fallbackIndex + 1}`,
    fileName: typeof raw.fileName === 'string' && raw.fileName.trim() ? raw.fileName.trim().slice(0, 240) : 'resume.txt',
    sourceText,
    structuredData,
    sourceSchemaVersion,
    needsReparse,
    parsedAt: typeof raw.parsedAt === 'string' ? raw.parsedAt : null,
    sourceFragments: (Array.isArray(raw.sourceFragments) ? raw.sourceFragments : []).slice(0, 6000).map(item => ({
      page: Number(item?.page) || 1, text: String(item?.text || '').slice(0, 500),
      x: Number(item?.x) || 0, y: Number(item?.y) || 0,
      width: Number(item?.width) || 0, height: Number(item?.height) || 0,
    })),
    parseQualityIssues: (Array.isArray(raw.parseQualityIssues) ? raw.parseQualityIssues : [])
      .filter(item => typeof item === 'string').slice(0, 30).map(item => item.slice(0, 240)),
    sourceHash,
    hash,
    parseStatus: parseStatus(raw.parseStatus),
    parseError: shortError(raw.parseError),
    parserModel: typeof raw.parserModel === 'string' ? raw.parserModel.trim().slice(0, 160) : '',
    createdAt: raw.createdAt || raw.updatedAt || now,
    updatedAt: raw.updatedAt || now,
  };
}

function serializeProfile(profile) {
  return {
    id: profile.id,
    fileName: profile.fileName,
    sourceText: profile.sourceText,
    structuredData: profile.structuredData,
    sourceSchemaVersion: profile.sourceSchemaVersion,
    needsReparse: profile.needsReparse,
    parsedAt: profile.parsedAt,
    sourceFragments: profile.sourceFragments,
    parseQualityIssues: profile.parseQualityIssues,
    sourceHash: profile.sourceHash,
    hash: profile.hash,
    parseStatus: profile.parseStatus,
    parseError: profile.parseError,
    parserModel: profile.parserModel,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function serializeLibrary(library) {
  return {
    version: RESUME_LIBRARY_VERSION,
    activeResumeId: library.activeResumeId || null,
    profiles: library.profiles.map(serializeProfile),
  };
}

function toAnalysisResume(profile) {
  if (!profile) return null;
  const text = buildResumeAnalysisText(profile.structuredData, profile.sourceText);
  return { ...profile, text, analysisText: text };
}

function toResumeSummary(profile, activeResumeId) {
  const stats = getResumeDataStats(profile.structuredData);
  return {
    id: profile.id,
    fileName: profile.fileName,
    hash: profile.hash,
    sourceCharacters: profile.sourceText.length,
    parseStatus: profile.parseStatus,
    schemaVersion: profile.sourceSchemaVersion,
    parsedAt: profile.parsedAt,
    parseQualityIssues: profile.parseQualityIssues,
    needsReparse: profile.needsReparse,
    parseError: profile.parseError,
    parserModel: profile.parserModel,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    isActive: profile.id === activeResumeId,
    name: profile.structuredData.name || '',
    headline: profile.structuredData.headline || '',
    languages: profile.structuredData.languages || [],
    stats,
  };
}

function buildSnapshot(library) {
  return {
    version: RESUME_LIBRARY_VERSION,
    activeResumeId: library.activeResumeId || null,
    resumes: library.profiles.map(profile => toResumeSummary(profile, library.activeResumeId)),
  };
}

async function readStoredLibrary() {
  const stored = await chrome.storage.local.get([RESUME_LIBRARY_STORAGE_KEY, LEGACY_RESUME_STORAGE_KEY]);
  const rawLibrary = stored[RESUME_LIBRARY_STORAGE_KEY];

  if (Array.isArray(rawLibrary?.profiles)) {
    const profiles = [];
    for (let index = 0; index < rawLibrary.profiles.length; index += 1) {
      const profile = await normalizeProfile(rawLibrary.profiles[index], index);
      if (profile.sourceText) profiles.push(profile);
    }
    const activeResumeId = profiles.some(profile => profile.id === rawLibrary.activeResumeId)
      ? rawLibrary.activeResumeId
      : profiles[0]?.id || null;
    return { version: RESUME_LIBRARY_VERSION, activeResumeId, profiles };
  }

  const legacy = stored[LEGACY_RESUME_STORAGE_KEY];
  if (!legacy?.text) {
    return { version: RESUME_LIBRARY_VERSION, activeResumeId: null, profiles: [] };
  }

  const migrated = await normalizeProfile({
    id: 'resume_legacy_1',
    fileName: legacy.fileName,
    sourceText: legacy.text,
    parseStatus: 'legacy',
    createdAt: legacy.updatedAt,
    updatedAt: legacy.updatedAt,
  });
  const library = { version: RESUME_LIBRARY_VERSION, activeResumeId: migrated.id, profiles: [migrated] };
  await chrome.storage.local.set({ [RESUME_LIBRARY_STORAGE_KEY]: serializeLibrary(library) });
  await chrome.storage.local.remove(LEGACY_RESUME_STORAGE_KEY);
  return library;
}

export async function getResumeLibrarySnapshot() {
  return buildSnapshot(await readStoredLibrary());
}

export async function loadResumeProfile(id) {
  const library = await readStoredLibrary();
  const profile = library.profiles.find(item => item.id === id);
  return toAnalysisResume(profile || null);
}

export async function getResumeProfileView(id) {
  const library = await readStoredLibrary();
  const profile = library.profiles.find(item => item.id === id);
  if (!profile) throw new Error('The selected resume could not be found.');
  return buildResumeProfileView(profile);
}

export async function loadPersistentResume() {
  const library = await readStoredLibrary();
  const active = library.profiles.find(profile => profile.id === library.activeResumeId);
  return toAnalysisResume(active || null);
}

export async function saveResumeProfile(payload = {}) {
  const sourceText = normalizeResumeText(payload.sourceText || payload.text);
  if (!sourceText) {
    throw new Error('Resume text is empty.');
  }

  const library = await readStoredLibrary();
  const existing = payload.id ? library.profiles.find(profile => profile.id === payload.id) : null;
  const sourceChanged = Boolean(existing && existing.sourceText !== sourceText);
  const profile = await normalizeProfile({
    ...existing,
    ...payload,
    id: existing?.id || payload.id || createResumeId(),
    sourceText,
    structuredData: payload.structuredData || (!sourceChanged && existing?.structuredData) || buildFallbackResumeData(sourceText),
    sourceFragments: payload.sourceFragments ?? (sourceChanged ? [] : existing?.sourceFragments),
    parseQualityIssues: payload.parseQualityIssues ?? (sourceChanged ? [] : existing?.parseQualityIssues),
    sourceSchemaVersion: payload.structuredData?.schemaVersion || (sourceChanged ? RESUME_DOCUMENT_VERSION : existing?.sourceSchemaVersion),
    parsedAt: payload.structuredData ? new Date().toISOString() : existing?.parsedAt,
    needsReparse: payload.structuredData ? payload.structuredData.schemaVersion !== RESUME_DOCUMENT_VERSION
      : sourceChanged ? false : existing?.needsReparse,
    createdAt: existing?.createdAt || payload.createdAt,
  }, library.profiles.length);
  const profiles = existing
    ? library.profiles.map(item => item.id === profile.id ? profile : item)
    : [profile, ...library.profiles];
  const activeResumeId = payload.activate === false
    ? library.activeResumeId
    : profile.id;
  const nextLibrary = { version: RESUME_LIBRARY_VERSION, activeResumeId, profiles };
  await chrome.storage.local.set({ [RESUME_LIBRARY_STORAGE_KEY]: serializeLibrary(nextLibrary) });

  const active = nextLibrary.profiles.find(item => item.id === nextLibrary.activeResumeId);
  return {
    profile: toAnalysisResume(profile),
    activeResume: toAnalysisResume(active || null),
    snapshot: buildSnapshot(nextLibrary),
  };
}

export async function selectResumeProfile(id) {
  const library = await readStoredLibrary();
  if (!library.profiles.some(profile => profile.id === id)) {
    throw new Error('The selected resume could not be found.');
  }
  const nextLibrary = { ...library, activeResumeId: id };
  await chrome.storage.local.set({ [RESUME_LIBRARY_STORAGE_KEY]: serializeLibrary(nextLibrary) });
  return {
    activeResume: toAnalysisResume(nextLibrary.profiles.find(profile => profile.id === id)),
    snapshot: buildSnapshot(nextLibrary),
  };
}

export async function updateActiveResumeLanguages(id, languages) {
  const library = await readStoredLibrary();
  if (!id || id !== library.activeResumeId) throw new Error('Select this resume before editing its languages.');
  if (!Array.isArray(languages) || languages.length > 30) throw new Error('Invalid profile languages.');
  if (languages.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new Error('Invalid profile languages.');
  }
  const current = library.profiles.find(profile => profile.id === id);
  if (!current) throw new Error('The selected resume could not be found.');
  const edited = normalizeProfileLanguages(languages.map(item => ({ ...item, source: 'user-confirmed' })));
  const profile = await normalizeProfile({
    ...current,
    structuredData: { ...current.structuredData, languages: edited },
    updatedAt: new Date().toISOString(),
  });
  const nextLibrary = { ...library, profiles: library.profiles.map(item => item.id === id ? profile : item) };
  await chrome.storage.local.set({ [RESUME_LIBRARY_STORAGE_KEY]: serializeLibrary(nextLibrary) });
  return { activeResume: toAnalysisResume(profile), snapshot: buildSnapshot(nextLibrary) };
}

export async function deleteResumeProfile(id) {
  const library = await readStoredLibrary();
  const profiles = library.profiles.filter(profile => profile.id !== id);
  if (profiles.length === library.profiles.length) {
    throw new Error('The selected resume could not be found.');
  }
  const activeResumeId = library.activeResumeId === id
    ? profiles[0]?.id || null
    : library.activeResumeId;
  const nextLibrary = { ...library, activeResumeId, profiles };
  await chrome.storage.local.set({ [RESUME_LIBRARY_STORAGE_KEY]: serializeLibrary(nextLibrary) });
  return {
    activeResume: toAnalysisResume(profiles.find(profile => profile.id === activeResumeId) || null),
    snapshot: buildSnapshot(nextLibrary),
  };
}

export async function removeActiveResume() {
  const library = await readStoredLibrary();
  if (!library.activeResumeId) {
    return { activeResume: null, snapshot: buildSnapshot(library) };
  }
  return deleteResumeProfile(library.activeResumeId);
}

// Compatibility wrappers for the single-resume API used by older local builds.
export async function savePersistentResume(payload) {
  const result = await saveResumeProfile({
    ...payload,
    sourceText: payload?.text,
    parseStatus: 'legacy',
  });
  return result.activeResume;
}

export async function clearPersistentResume() {
  await chrome.storage.local.remove([RESUME_LIBRARY_STORAGE_KEY, LEGACY_RESUME_STORAGE_KEY]);
}

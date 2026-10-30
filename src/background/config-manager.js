import { DEFAULT_MODEL_CONFIG, normalizeTitleDisplaySettings } from '../shared/constants.js';
import { normalizeProviderConfig } from '../shared/provider-profiles.js';
import { normalizeCandidatePreferences, normalizeArchivedGlobalLanguages } from '../shared/candidate-preferences.js';

const STORAGE_KEY = 'ljm_config';
const BACKUP_KEY = 'ljm_config_before_v060';

function normalizeConfig(saved = {}) {
  const providers = normalizeProviderConfig(saved);
  return {
    ...DEFAULT_MODEL_CONFIG, ...providers,
    analysisPreset: saved.analysisPreset || DEFAULT_MODEL_CONFIG.analysisPreset,
    promptTuningMode: saved.promptTuningMode || saved.analysisPreset || DEFAULT_MODEL_CONFIG.promptTuningMode,
    includeSponsorshipInScore: saved.includeSponsorshipInScore !== false,
    useCustomWeights: saved.useCustomWeights === true,
    customWeights: Object.fromEntries(Object.entries(saved.customWeights || {}).filter(([, value]) => Number.isFinite(Number(value)) && Number(value) > 0).map(([key, value]) => [key, Number(value)])),
    additionalPromptInstructions: typeof saved.additionalPromptInstructions === 'string' ? saved.additionalPromptInstructions : '',
    customPromptTemplate: typeof saved.customPromptTemplate === 'string' ? saved.customPromptTemplate : '',
    enableDiagnostics: saved.enableDiagnostics !== false,
    titleDisplaySettings: normalizeTitleDisplaySettings(saved.titleDisplaySettings),
    candidatePreferences: normalizeCandidatePreferences(saved.candidatePreferences),
    // Old global languages cannot safely be assigned to any one CV. Keep them
    // as a read-only archive until the user edits the intended CV Profile.
    archivedGlobalLanguages: normalizeArchivedGlobalLanguages([
      ...(Array.isArray(saved.archivedGlobalLanguages) ? saved.archivedGlobalLanguages : []),
      ...(Array.isArray(saved.candidatePreferences?.languages) ? saved.candidatePreferences.languages : []),
    ]).filter((item, index, all) => all.findIndex(other => other.language === item.language && other.level === item.level) === index),
  };
}

export async function loadConfig() {
  // Surface storage failures instead of silently sending another provider's defaults.
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeConfig(result[STORAGE_KEY] || {});
}

export async function saveConfig(config) {
  const normalized = normalizeConfig(config);
  const existing = await chrome.storage.local.get([STORAGE_KEY, BACKUP_KEY]);
  const update = { [STORAGE_KEY]: { ...normalized, _savedAt: new Date().toISOString() } };
  // Preserve original settings once; never modify resumes, scores, or history.
  if (existing[STORAGE_KEY] && existing[STORAGE_KEY].configVersion !== 2 && !existing[BACKUP_KEY]) {
    update[BACKUP_KEY] = existing[STORAGE_KEY];
  }
  await chrome.storage.local.set(update);
  return normalized;
}

export async function isConfigured() {
  const config = await loadConfig();
  return !!(config.apiKey?.trim() && config.modelId?.trim());
}

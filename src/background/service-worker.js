import {
  Actions,
  DegradationTrigger,
  ErrorTypes,
  findKeywordMatches,
  normalizeSourceType,
  normalizeTitleDisplaySettings,
} from '../shared/constants.js';
import { loadConfig, saveConfig } from './config-manager.js';
import { CacheManager, matchesCachedJD } from './cache-manager.js';
import { runAnalysis } from './match-engine.js';
import { callLLM, testModelConnection } from './llm-adapter.js';
import { buildResumeExtractionPrompt, MATCH_PROMPT_VERSION } from '../prompts/prompt-templates.js';
import { HOLISTIC_SCORE_VERSION } from '../shared/holistic-match.js';
import { dutchRequirementStatus } from '../shared/career-level-display.js';
import { buildCacheContext } from '../shared/scoring-profile.js';
import { loadLocale } from '../i18n/index.js';
import { PositionManager } from './position-manager.js';
import { safeParseJSON } from '../shared/schema-validator.js';
import {
  clearPersistentResume,
  deleteResumeProfile,
  getResumeLibrarySnapshot,
  getResumeProfileView,
  loadPersistentResume,
  loadResumeProfile,
  saveResumeProfile,
  selectResumeProfile,
  updateActiveResumeLanguages,
} from './resume-manager.js';
import {
  buildFallbackResumeData,
  hasUsableStructuredResume,
  normalizeResumeData,
  RESUME_DOCUMENT_VERSION,
} from '../shared/resume-document.js';

let currentJDData = null;
let currentResume = null;
let isAnalyzing = false;
let activeBatch = null;
const BATCH_CHUNK_SIZE = 5;
const RETAINED_JD_WARNING = 'The latest extraction attempt failed; the earlier JD was retained.';
const MAX_EXTRACTION_WARNINGS = 4;

function extractionWarnings(...groups) {
  return [...new Set(groups.flat().filter(value => typeof value === 'string' && value.trim())
    .map(value => value.trim()))].slice(0, MAX_EXTRACTION_WARNINGS);
}

function jdDisplaySignature(data) {
  return JSON.stringify([data?.jobId, data?.title, data?.company, data?.description,
    data?.extractionStatus, data?.extractionConfidence, data?.extractionWarnings]);
}

function updateCurrentJD(next, broadcastChange = true) {
  const changed = jdDisplaySignature(currentJDData) !== jdDisplaySignature(next);
  currentJDData = next;
  if (changed && broadcastChange) broadcast({ type: Actions.JD_DATA, payload: currentJDData });
  return changed;
}

function olderThanCurrentJD(payload, tabId = null) {
  if (tabId && currentJDData?.sourceTabId && currentJDData.sourceTabId !== tabId) return false;
  if (tabId && currentJDData?.sourceTabId === tabId
    && Number.isSafeInteger(payload?.syncGeneration)
    && Number.isSafeInteger(currentJDData?.syncGeneration)) {
    if (payload.syncGeneration !== currentJDData.syncGeneration) {
      return payload.syncGeneration < currentJDData.syncGeneration;
    }
    if (Number.isSafeInteger(payload?.syncSequence)
      && Number.isSafeInteger(currentJDData?.syncSequence)) {
      return payload.syncSequence < currentJDData.syncSequence;
    }
  }
  const incoming = Date.parse(payload?.timestamp || payload?.partialData?.timestamp || '');
  const current = Date.parse(currentJDData?.timestamp || '');
  return Number.isFinite(incoming) && Number.isFinite(current) && incoming < current;
}

function jobIdInTabUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('currentJobId') || parsed.pathname.match(/\/jobs\/view\/(\d+)/)?.[1]
      || parsed.searchParams.get('vjk') || parsed.searchParams.get('jk') || null;
  } catch {
    return null;
  }
}

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch(err => console.warn('[SW] sidePanel setup error:', err));

CacheManager.cleanupExpired().catch(err => console.warn('[SW] cache cleanup failed:', err));
warmResumeState();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg?.type) {
    return;
  }

  switch (msg.type) {
    case Actions.JD_EXTRACTED:
      handleJDExtracted(msg.payload, sender).catch(() => {});
      sendResponse({ ok: true });
      break;

    case Actions.JD_EXTRACT_FAILED:
      handleJDExtractFailed(msg.payload, sender).catch(() => {});
      sendResponse({ ok: true });
      break;

    case Actions.RESUME_UPLOADED:
      handleResumeUploaded(msg.payload, sendResponse);
      return true;

    case Actions.CLEAR_RESUME:
      handleResumeCleared(sendResponse);
      return true;

    case Actions.GET_RESUME_LIBRARY:
      handleGetResumeLibrary(sendResponse);
      return true;

    case Actions.GET_RESUME_PROFILE:
      handleGetResumeProfile(msg.payload, sendResponse);
      return true;

    case Actions.SELECT_RESUME:
      handleSelectResume(msg.payload, sendResponse);
      return true;

    case Actions.DELETE_RESUME:
      handleDeleteResume(msg.payload, sendResponse);
      return true;

    case Actions.REPARSE_RESUME:
      handleReparseResume(msg.payload, sendResponse);
      return true;

    case Actions.UPDATE_RESUME_LANGUAGES:
      handleUpdateResumeLanguages(msg.payload, sendResponse);
      return true;

    case Actions.START_ANALYSIS:
      handleStartAnalysis(msg.payload, sendResponse);
      return true;

    case Actions.START_BATCH_ANALYSIS:
      handleBatchAnalysis(msg.payload, sendResponse);
      return true;

    case Actions.CANCEL_BATCH_ANALYSIS:
      if (activeBatch) activeBatch.cancelled = true;
      sendResponse({ ok: true, cancelled: Boolean(activeBatch) });
      break;

    case Actions.UPDATE_CONFIG:
      handleUpdateConfig(msg.payload, sendResponse);
      return true;

    case Actions.GET_CONFIG:
      handleGetConfig(sendResponse);
      return true;

    case Actions.GET_JD_DATA:
      handleGetJDData(sendResponse);
      return true;

    case Actions.GET_CACHED_SCORES:
      handleGetCachedScores(msg.payload, sendResponse);
      return true;

    case Actions.GET_VERIFIED_CACHED_RESULT:
      handleGetVerifiedCachedResult(msg.payload, sendResponse);
      return true;

    case Actions.CLEAR_ANALYSIS_CACHE:
      handleClearAnalysisCache(sendResponse);
      return true;

    case Actions.TEST_CONNECTION:
      handleTestConnection(msg.payload, sendResponse);
      return true;

    case Actions.GET_POSITION_LIBRARY:
      handleGetPositionLibrary(sendResponse);
      return true;

    case Actions.GET_MANUAL_JOBS:
      handleGetManualJobs(sendResponse);
      return true;

    case Actions.UPSERT_MANUAL_JOB:
      handleUpsertManualJob(msg.payload, sendResponse);
      return true;

    case Actions.DELETE_MANUAL_JOB:
      handleDeleteManualJob(msg.payload, sendResponse);
      return true;

    case Actions.START_MANUAL_ANALYSIS:
      handleStartManualAnalysis(msg.payload, sendResponse);
      return true;

    case Actions.DETECT_INSERTED_JOB:
      handleDetectInsertedJob(msg.payload, sendResponse);
      return true;

    case Actions.TOGGLE_SAVE_POSITION:
      handleToggleSavePosition(msg.payload, sendResponse);
      return true;

    case Actions.DELETE_HISTORY_ENTRY:
      handleDeleteHistoryEntry(msg.payload, sendResponse);
      return true;

    case Actions.DELETE_SAVED_POSITION:
      handleDeleteSavedPosition(msg.payload, sendResponse);
      return true;

    default:
      sendResponse({ ok: false, error: 'Unknown action' });
  }
});

async function warmResumeState() {
  currentResume = await loadPersistentResume();
}

async function ensureResumeLoaded() {
  if (!currentResume?.text) {
    currentResume = await loadPersistentResume();
  }
  return currentResume;
}

async function getActiveTab() {
  const currentWindowTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (currentWindowTabs[0]) {
    return currentWindowTabs[0];
  }

  const lastFocusedTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return lastFocusedTabs[0] || null;
}

async function fetchCurrentJDData(forceRefresh = false) {
  const activeTab = await getActiveTab();
  if (!activeTab?.id) return null;
  const urlJobId = jobIdInTabUrl(activeTab.url);
  if (!forceRefresh && currentJDData?.description
    && currentJDData.sourceTabId === activeTab.id
    && urlJobId === currentJDData.jobId
    && !['rechecking', 'reverify-failed', 'identity-mismatch', 'stale'].includes(currentJDData.extractionStatus)) {
    return currentJDData;
  }

  try {
    const response = await sendTabMessageWithInjection(activeTab.id, {
      type: Actions.GET_JD_DATA, payload: { forceRefresh },
    });
    const latestTab = await getActiveTab();
    if (!response?.payload || latestTab?.id !== activeTab.id
      || (jobIdInTabUrl(latestTab.url) && jobIdInTabUrl(latestTab.url) !== response.payload.jobId)) return null;
    const payload = response.payload;
    if (olderThanCurrentJD(payload, activeTab.id)) return currentJDData;
    if (payload.description && !['failed', 'loading', 'stale', 'rechecking', 'reverify-failed', 'identity-mismatch'].includes(payload.extractionStatus)) {
      updateCurrentJD({ ...payload, extractionWarnings: extractionWarnings(payload.extractionWarnings),
        extractionSource: 'live', sourceTabId: activeTab.id }, false);
    } else if (currentJDData?.jobId === payload.jobId && currentJDData?.description
      && currentJDData.sourceTabId === activeTab.id) {
      // A single transient DOM read is a recheck, not confirmed extraction failure.
      updateCurrentJD({ ...currentJDData, extractionStatus: 'rechecking',
        syncGeneration: payload.syncGeneration, syncSequence: payload.syncSequence,
        extractionWarnings: extractionWarnings(currentJDData.extractionWarnings),
      }, false);
    } else {
      updateCurrentJD({ ...payload, description: '', extractionSource: 'live', sourceTabId: activeTab.id,
        extractionWarnings: extractionWarnings(payload.extractionWarnings) }, false);
    }
  } catch {
    return null;
  }

  return currentJDData;
}

async function tryInjectScore(tabId, jobId, score, resumeHash = '') {
  if (!tabId || !jobId || typeof score !== 'number') {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: Actions.INJECT_SCORE,
      payload: { jobId, score, resumeHash },
    });
  } catch {
    // Badge injection is best effort.
  }
}

async function ensureContentScript(tabId) {
  if (!tabId) {
    return false;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content/index.js'],
    });
    return true;
  } catch {
    return false;
  }
}

async function sendTabMessageWithInjection(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    const injected = await ensureContentScript(tabId);
    if (!injected) {
      throw error;
    }

    await delay(150);
    return chrome.tabs.sendMessage(tabId, message);
  }
}

function buildAnalysisPayload(result, jdData, extra = {}) {
  return {
    ...result,
    jobId: jdData?.jobId || null,
    sourceType: normalizeSourceType(jdData?.sourceType),
    jobTitle: jdData?.title || '',
    company: jdData?.company || '',
    location: jdData?.location || '',
    jobUrl: jdData?.url || '',
    sourceUrl: jdData?.sourceUrl || jdData?.url || '',
    ...extra,
  };
}

function buildCachedResponse(entry, includeResult = false, titleDisplaySettings = null, resume = null) {
  const currentResult = entry?.data;
  const metadata = currentResult?.metadata || {};
  const normalizedTitleSettings = normalizeTitleDisplaySettings(titleDisplaySettings);
  const response = {
    jobId: entry.jobId,
    sourceType: normalizeSourceType(entry.summary?.sourceType),
    score: entry.summary?.capabilityScoreVersion === HOLISTIC_SCORE_VERSION ? entry.summary?.score ?? null : null,
    capabilityScoreVersion: entry.summary?.capabilityScoreVersion || null,
    analyzedAt: entry.summary?.analyzedAt || null,
    title: entry.summary?.title || '',
    company: entry.summary?.company || '',
    location: entry.summary?.location || '',
    url: entry.summary?.url || '',
    sourceUrl: entry.summary?.sourceUrl || entry.summary?.url || '',
    jdLanguage: entry.summary?.jdLanguage || entry.data?.metadata?.jdLanguage || 'Unknown',
    requiredExperience: entry.summary?.requiredExperience || entry.data?.metadata?.requiredExperience || null,
    requiredLanguages: entry.summary?.requiredLanguages || entry.data?.metadata?.requiredLanguages || [],
    jobAnalysis: entry.promptVersion === MATCH_PROMPT_VERSION && entry.summary?.jobAnalysis
      ? { ...entry.summary.jobAnalysis, dutchRequirement: dutchRequirementStatus(currentResult?.jobAnalysis || entry.summary.jobAnalysis) } : null,
    jdVerified: false,
    kmEligible: entry.summary?.kmEligible === true,
    sponsorshipLabel: entry.summary?.sponsorshipLabel || null,
    sponsorshipCompany: entry.summary?.sponsorshipCompany || null,
    sponsorshipConfidence: entry.summary?.sponsorshipConfidence || null,
    analysisPreset: entry.summary?.analysisPreset || metadata.analysisPreset || 'balanced',
    promptTuningMode: entry.summary?.promptTuningMode || metadata.promptTuningMode || 'balanced',
    isCustomProfile: entry.summary?.isCustomProfile === true || metadata.isCustomProfile === true,
    includeSponsorshipInScore: entry.summary?.includeSponsorshipInScore !== false && metadata.includeSponsorshipInScore !== false,
    weightsApplied: entry.summary?.weightsApplied || metadata.weightsApplied || {},
    timing: entry.summary?.timing || metadata.timing || null,
    keywordMatches: findKeywordMatches(entry.summary?.jdText || '', normalizedTitleSettings.keywordList),
    jdText: entry.summary?.jdText || '',
    jdExtractionVersion: entry.summary?.jdExtractionVersion || '',
    promptVersion: entry.promptVersion || '',
  };

  if (includeResult) {
    response.result = currentResult;
  }

  return response;
}

function buildSavedPositionResponse(position) {
  return {
    positionKey: position.positionKey,
    jobId: position.jobId,
    sourceType: normalizeSourceType(position.sourceType),
    title: position.title || '',
    company: position.company || '',
    location: position.location || '',
    url: position.url || '',
    sourceUrl: position.sourceUrl || position.url || '',
    savedAt: position.savedAt || null,
    updatedAt: position.updatedAt || null,
    score: position.lastResult?.metadata?.capabilityScoreVersion === HOLISTIC_SCORE_VERSION
      ? position.lastResult?.overallMatchPercent ?? null : null,
    result: position.lastResult || null,
    summary: position.summary || null,
  };
}

function shouldIgnoreCachedEntry(entry) {
  const result = entry?.data;
  const triggers = result?.metadata?.degradationTriggers || [];
  if (!Number.isFinite(result?.overallMatchPercent)) return true;
  if (result?.overallMatchPercent !== 0) {
    return false;
  }

  return triggers.includes(DegradationTrigger.MODEL_TRUNCATED)
    || triggers.includes(DegradationTrigger.MODEL_NO_OUTPUT)
    || triggers.includes(DegradationTrigger.MODEL_JSON_INVALID)
    || triggers.includes(DegradationTrigger.MODEL_FIELD_MISSING)
    || triggers.includes(DegradationTrigger.JD_EXTRACT_FAIL);
}

async function maybeBroadcastCachedResult(jdData) {
  if (!jdData?.description || ['failed', 'loading', 'stale', 'rechecking', 'reverify-failed', 'identity-mismatch'].includes(jdData.extractionStatus)) return;
  const resume = await ensureResumeLoaded();
  if (!resume?.hash || !jdData?.jobId) {
    return;
  }

  const config = await loadConfig();
  const cacheContext = await buildCacheContext(config, resume.hash, MATCH_PROMPT_VERSION);
  const cachedEntry = await CacheManager.getEntry(jdData.jobId, cacheContext, { allowCompatible: true, jdData });
  if (!cachedEntry || shouldIgnoreCachedEntry(cachedEntry)) {
    return;
  }

  if (currentJDData?.jobId !== jdData.jobId || currentJDData.description !== jdData.description
    || currentJDData.syncGeneration !== jdData.syncGeneration
    || ['failed', 'loading', 'stale', 'rechecking', 'reverify-failed', 'identity-mismatch'].includes(currentJDData.extractionStatus)) return;

  const activeTab = await getActiveTab();
  if (jdData.sourceTabId && activeTab?.id !== jdData.sourceTabId) return;
  if (currentJDData?.jobId !== jdData.jobId || currentJDData.description !== jdData.description
    || currentJDData.syncGeneration !== jdData.syncGeneration) return;
  await tryInjectScore(activeTab?.id, jdData.jobId, cachedEntry.summary?.score, resume.hash);
  if (currentJDData?.jobId !== jdData.jobId || currentJDData.description !== jdData.description
    || currentJDData.syncGeneration !== jdData.syncGeneration) return;
  broadcast({
    type: Actions.ANALYSIS_RESULT,
    payload: buildAnalysisPayload(cachedEntry.data, jdData, {
      fromCache: true,
      cachedAt: cachedEntry.summary?.analyzedAt || null,
      analysisResumeHash: resume.hash,
      jdVerified: true,
      jdText: jdData.description,
      jdExtractionVersion: jdData.extractionVersion || '',
    }),
  });
}

async function handleJDExtracted(payload, sender) {
  const activeTab = await getActiveTab();
  if (sender?.tab?.id && activeTab?.id !== sender.tab.id) return;
  if (jobIdInTabUrl(activeTab?.url) && jobIdInTabUrl(activeTab.url) !== payload?.jobId) return;
  if (olderThanCurrentJD(payload, sender?.tab?.id)) return;
  if (!payload?.jobId || !payload?.description || payload.extractionConfidence === 'failed') return;
  const changed = updateCurrentJD({ ...payload, sourceTabId: sender?.tab?.id || null,
    extractionWarnings: extractionWarnings(payload.extractionWarnings), extractionSource: 'live' });
  if (changed) maybeBroadcastCachedResult(currentJDData).catch(err => {
    console.warn('[SW] Failed to broadcast cached result:', err);
  });
}

async function handleJDExtractFailed(payload, sender) {
  const activeTab = await getActiveTab();
  if (sender?.tab?.id && activeTab?.id !== sender.tab.id) return;
  if (jobIdInTabUrl(activeTab?.url) && jobIdInTabUrl(activeTab.url) !== payload?.jobId) return;
  if (olderThanCurrentJD(payload, sender?.tab?.id)) return;
  const partial = payload?.partialData || {};
  if (currentJDData?.jobId === payload?.jobId && currentJDData?.description
    && currentJDData.sourceTabId === sender?.tab?.id) {
    updateCurrentJD({ ...currentJDData, extractionStatus: 'reverify-failed',
      timestamp: partial.timestamp || new Date().toISOString(),
      syncGeneration: payload.syncGeneration, syncSequence: payload.syncSequence,
      extractionWarnings: extractionWarnings(RETAINED_JD_WARNING,
        partial.extractionWarnings, currentJDData.extractionWarnings) });
    return;
  }
  const mismatch = partial.extractionStatus === 'loading'
    && /(?:previous selection|do not match|has not loaded|previously selected)/iu.test(partial.extractionWarnings?.[0] || '');
  updateCurrentJD({
    title: partial.title || '',
    company: partial.company || '',
    location: partial.location || '',
    description: '',
    extractionConfidence: 'failed',
    extractionStatus: mismatch ? 'identity-mismatch' : 'failed',
    extractionWarnings: extractionWarnings(partial.extractionWarnings, payload?.error),
    error: payload?.error,
    jobId: payload?.jobId || partial.jobId || null,
    url: partial.url || '',
    timestamp: partial.timestamp || new Date().toISOString(),
    syncGeneration: payload?.syncGeneration,
    syncSequence: payload?.syncSequence,
    sourceTabId: sender?.tab?.id || null,
  });
}

async function handleResumeUploaded(payload, sendResponse) {
  try {
    broadcast({
      type: Actions.RESUME_PROGRESS,
      payload: { stage: 'reading', message: 'Reading and structuring the resume...' },
    });
    const parsed = await parseResumeForStorage(payload?.text);
    const saved = await saveResumeProfile({
      fileName: payload?.fileName,
      sourceText: payload?.text,
      structuredData: parsed.structuredData,
      sourceFragments: payload?.sourceFragments,
      parseQualityIssues: payload?.parseQualityIssues,
      parseStatus: parsed.parseStatus,
      parseError: parsed.parseError,
      parserModel: parsed.parserModel,
    });
    currentResume = saved.activeResume;
    broadcast({
      type: Actions.RESUME_PROGRESS,
      payload: {
        stage: 'complete',
        message: parsed.parseStatus === 'ai-parsed'
          ? 'Resume profile saved and structured for analysis.'
          : 'Resume saved with local extraction; you can re-read it after configuring a model.',
      },
    });
    sendResponse({
      ok: true,
      data: saved.snapshot,
    });
  } catch (err) {
    sendResponse({ ok: false, error: err.message || 'Failed to save resume.' });
  }
}

async function handleResumeCleared(sendResponse) {
  try {
    await clearPersistentResume();
    currentResume = null;
    sendResponse({ ok: true, data: await getResumeLibrarySnapshot() });
  } catch (err) {
    sendResponse({ ok: false, error: err.message || 'Failed to clear resume.' });
  }
}

async function parseResumeForStorage(sourceText) {
  const fallback = buildFallbackResumeData(sourceText);
  const result = {
    structuredData: fallback,
    parseStatus: 'local-fallback',
    parseError: '',
    parserModel: '',
  };

  let config;
  try {
    config = await loadConfig();
  } catch (error) {
    result.parseError = `AI resume extraction was skipped: ${String(error?.message || error).slice(0, 180)}`;
    return result;
  }

  if (!config.apiKey?.trim() || !config.modelId?.trim()) {
    result.parseError = 'AI resume extraction was skipped; configure a model to re-read this profile.';
    return result;
  }

  broadcast({
    type: Actions.RESUME_PROGRESS,
    payload: { stage: 'structuring', message: 'Asking the selected model to organize resume evidence...' },
  });

  try {
    const prompts = buildResumeExtractionPrompt(sourceText);
    const response = await callLLM(
      {
        ...config,
        maxTokens: Math.min(Math.max(Number(config.maxTokens) || 4096, 2048), 8192),
        temperature: 0,
        maxRetries: 0,
      },
      prompts,
    );
    if (['length', 'max_tokens'].includes(response.finishReason)) {
      throw new Error('Resume extraction response was truncated.');
    }

    const parsed = safeParseJSON(response.content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
        || parsed.schemaVersion !== RESUME_DOCUMENT_VERSION || !hasUsableStructuredResume(parsed)) {
      throw new Error('The model returned an empty or invalid resume profile.');
    }
    const structuredData = normalizeResumeData(parsed, sourceText);

    return {
      structuredData,
      parseStatus: 'ai-parsed',
      parseError: '',
      parserModel: response.resolvedModel || config.modelId,
    };
  } catch (error) {
    return {
      ...result,
      parseError: `AI resume extraction fell back to local text: ${String(error?.message || error).slice(0, 180)}`,
    };
  }
}

async function handleGetResumeLibrary(sendResponse) {
  try {
    sendResponse({ ok: true, data: await getResumeLibrarySnapshot() });
  } catch (err) {
    sendResponse({ ok: false, error: err.message || 'Failed to load resume library.' });
  }
}

async function handleGetResumeProfile(payload, sendResponse) {
  try {
    sendResponse({ ok: true, data: await getResumeProfileView(payload?.id) });
  } catch (err) {
    sendResponse({ ok: false, error: err.message || 'Failed to load resume profile.' });
  }
}

async function handleSelectResume(payload, sendResponse) {
  if (isAnalyzing && !activeBatch) {
    sendResponse({ ok: false, error: 'Wait for the current job analysis to finish before switching CVs.' });
    return;
  }
  try {
    const result = await selectResumeProfile(payload?.id);
    if (activeBatch && activeBatch.resumeHash !== result.activeResume?.hash) activeBatch.cancelled = true;
    currentResume = result.activeResume;
    sendResponse({ ok: true, data: result.snapshot });
  } catch (err) {
    sendResponse({ ok: false, error: err.message || 'Failed to select resume.' });
  }
}

async function handleDeleteResume(payload, sendResponse) {
  try {
    const result = await deleteResumeProfile(payload?.id);
    if (activeBatch && activeBatch.resumeHash !== result.activeResume?.hash) activeBatch.cancelled = true;
    currentResume = result.activeResume;
    sendResponse({ ok: true, data: result.snapshot });
  } catch (err) {
    sendResponse({ ok: false, error: err.message || 'Failed to remove resume.' });
  }
}

async function handleReparseResume(payload, sendResponse) {
  try {
    const profile = await loadResumeProfile(payload?.id);
    if (!profile?.sourceText) {
      throw new Error('The selected resume source is unavailable. Upload it again to rebuild the profile.');
    }

    broadcast({
      type: Actions.RESUME_PROGRESS,
      payload: { stage: 'reading', message: 'Re-reading the selected resume...' },
    });
    const parsed = await parseResumeForStorage(profile.sourceText);
    const confirmed = (profile.structuredData.languages || []).filter(item => item.source === 'user-confirmed');
    if (confirmed.length) {
      parsed.structuredData.languages = [
        ...confirmed,
        ...(parsed.structuredData.languages || []).filter(item =>
          !confirmed.some(saved => saved.language.toLowerCase() === item.language.toLowerCase())),
      ];
    }
    const saved = await saveResumeProfile({
      id: profile.id,
      fileName: profile.fileName,
      sourceText: profile.sourceText,
      structuredData: parsed.structuredData,
      parseStatus: parsed.parseStatus,
      parseError: parsed.parseError,
      parserModel: parsed.parserModel,
      activate: false,
    });
    currentResume = await loadPersistentResume();
    sendResponse({ ok: true, data: saved.snapshot });
  } catch (err) {
    sendResponse({ ok: false, error: err.message || 'Failed to re-read resume.' });
  }
}

async function handleUpdateResumeLanguages(payload, sendResponse) {
  if (isAnalyzing) {
    sendResponse({ ok: false, error: 'Wait for the current analysis to finish before editing the CV Profile.' });
    return;
  }
  try {
    const result = await updateActiveResumeLanguages(payload?.id, payload?.languages);
    currentResume = result.activeResume;
    sendResponse({ ok: true, data: result.snapshot });
  } catch (error) {
    sendResponse({ ok: false, error: error.message || 'Failed to update CV Profile languages.' });
  }
}

async function runAnalysisForJob(jdData, resume, config, options = {}) {
  if (!jdData?.description || jdData.extractionConfidence === 'failed'
    || ['failed', 'loading', 'stale', 'rechecking', 'reverify-failed', 'identity-mismatch'].includes(jdData.extractionStatus)) {
    throw new Error('JD Extraction Failed. Retry the page or paste the job description manually.');
  }
  config = { ...config, analysisLanguage: config.analysisLanguage || await loadLocale() };
  const cacheContext = await buildCacheContext(config, resume.hash, MATCH_PROMPT_VERSION);
  const forceRefresh = options.forceRefresh === true;
  const activeTab = options.injectScore !== false ? await getActiveTab() : null;

  if (!forceRefresh && jdData.jobId && resume.hash) {
    const cachedEntry = await CacheManager.getEntry(jdData.jobId, cacheContext, { jdData });
    if (cachedEntry && !shouldIgnoreCachedEntry(cachedEntry)) {
      if (options.injectScore !== false) {
        await tryInjectScore(activeTab?.id, jdData.jobId, cachedEntry.summary?.score, resume.hash);
      }
      const cachedPayload = buildAnalysisPayload(cachedEntry.data, jdData, {
        fromCache: true,
        cachedAt: cachedEntry.summary?.analyzedAt || null,
        analysisResumeHash: resume.hash,
        jdVerified: true,
        jdText: jdData.description,
        jdExtractionVersion: jdData.extractionVersion || '',
        ...options.payloadExtras,
      });
      return { fromCache: true, payload: cachedPayload, result: cachedEntry.data, cacheContext };
    }
  }

  if (options.broadcastProgress !== false) {
    broadcast({
      type: Actions.ANALYSIS_PROGRESS,
      payload: { stage: 'start', message: options.startMessage || 'Starting analysis...' },
    });
  }

  const result = await runAnalysis(
    jdData,
    resume,
    config,
    options.progressCallback || ((stage, message) => {
      broadcast({ type: Actions.ANALYSIS_PROGRESS, payload: { stage, message } });
    }),
  );

  if (jdData.jobId && resume.hash && !shouldIgnoreCachedEntry({ data: result })) {
    await CacheManager.saveResult(jdData.jobId, cacheContext, jdData, result);
  }

  if (options.injectScore !== false && !shouldIgnoreCachedEntry({ data: result })) {
    await tryInjectScore(activeTab?.id, jdData.jobId, result.overallMatchPercent, resume.hash);
  }

  const resultPayload = buildAnalysisPayload(result, jdData, {
    fromCache: false,
    analysisResumeHash: resume.hash,
    jdVerified: true,
    jdText: jdData.description,
    jdExtractionVersion: jdData.extractionVersion || '',
    ...options.payloadExtras,
  });

  if (!shouldIgnoreCachedEntry({ data: result })) {
    await PositionManager.updateSavedPositionResult(jdData.jobId, jdData.sourceType || 'linkedin', resultPayload, {
      score: result.overallMatchPercent,
      analyzedAt: result.metadata?.analysisTimestamp || new Date().toISOString(),
    });
  }

  return { fromCache: false, payload: resultPayload, result, cacheContext };
}

async function handleStartAnalysis(requestPayload, sendResponse) {
  if (isAnalyzing) {
    sendResponse({ ok: false, error: 'Analysis is already running.' });
    return;
  }

  const resume = await ensureResumeLoaded();
  if (!resume?.text) {
    sendResponse({ ok: false, error: 'Please upload a resume first.' });
    return;
  }

  isAnalyzing = true;

  try {
    const config = await loadConfig();

    if (!config.apiKey?.trim()) {
      sendResponse({ ok: false, error: 'Please configure an API key first.', errorType: ErrorTypes.CONFIG_MISSING });
      return;
    }

    let selectedJD = null;
    if (requestPayload?.jobId) {
      const tab = await getActiveTab();
      if (!tab?.id) throw new Error('Open the job search page before analyzing this job.');
      await sendTabMessageWithInjection(tab.id, {
        type: Actions.FOCUS_JOB,
        payload: { jobId: requestPayload.jobId },
      });
      selectedJD = await waitForJobDetails(tab.id, requestPayload.jobId);
      if (!selectedJD) throw new Error('The selected job details did not load. Click the job on the website and try again.');
    }
    const jdData = selectedJD || await fetchCurrentJDData(true) || {
      title: '',
      company: '',
      location: '',
      description: '',
      extractionConfidence: 'failed',
      jobId: null,
      url: '',
    };

    const forceRefresh = requestPayload?.forceRefresh === true;
    const analysisRun = await runAnalysisForJob(jdData, resume, config, { forceRefresh });
    broadcast({ type: Actions.ANALYSIS_RESULT, payload: analysisRun.payload });
    sendResponse({ ok: true, cached: analysisRun.fromCache, data: analysisRun.payload });
  } catch (err) {
    const normalizedError = normalizeUserFacingError(err);
    broadcast({ type: Actions.ANALYSIS_ERROR, payload: normalizedError });
    sendResponse({ ok: false, ...normalizedError });
  } finally {
    isAnalyzing = false;
  }
}

async function handleStartManualAnalysis(requestPayload, sendResponse) {
  if (isAnalyzing) {
    sendResponse({ ok: false, error: 'Analysis is already running.' });
    return;
  }

  const resume = await ensureResumeLoaded();
  if (!resume?.text) {
    sendResponse({ ok: false, error: 'Please upload a resume first.' });
    return;
  }

  isAnalyzing = true;

  try {
    const config = await loadConfig();
    if (!config.apiKey?.trim()) {
      sendResponse({ ok: false, error: 'Please configure an API key first.', errorType: ErrorTypes.CONFIG_MISSING });
      return;
    }

    const manualJob = await PositionManager.getManualJob(requestPayload?.manualJobId);
    if (!manualJob?.manualJobId || !manualJob?.description) {
      sendResponse({ ok: false, error: 'The inserted job could not be found.' });
      return;
    }

    const jdData = {
      jobId: manualJob.manualJobId,
      sourceType: 'inserted',
      title: manualJob.title || 'Inserted job',
      company: manualJob.company || '',
      location: manualJob.location || '',
      description: manualJob.description || '',
      extractionConfidence: 'manual',
      url: manualJob.sourceUrl || '',
      sourceUrl: manualJob.sourceUrl || '',
      manualJobId: manualJob.manualJobId,
      timestamp: manualJob.updatedAt || new Date().toISOString(),
    };

    const analysisRun = await runAnalysisForJob(jdData, resume, config, {
      forceRefresh: requestPayload?.forceRefresh === true,
      injectScore: false,
      startMessage: `Analyzing inserted job: ${manualJob.title || manualJob.manualJobId}`,
    });

    await PositionManager.markManualJobAnalyzed(manualJob.manualJobId, analysisRun.payload?.metadata?.analysisTimestamp || new Date().toISOString());
    broadcast({ type: Actions.ANALYSIS_RESULT, payload: analysisRun.payload });
    sendResponse({ ok: true, cached: analysisRun.fromCache, data: analysisRun.payload });
  } catch (err) {
    const normalizedError = normalizeUserFacingError(err);
    broadcast({ type: Actions.ANALYSIS_ERROR, payload: normalizedError });
    sendResponse({ ok: false, ...normalizedError });
  } finally {
    isAnalyzing = false;
  }
}

async function handleBatchAnalysis(requestPayload = {}, sendResponse) {
  if (isAnalyzing) {
    sendResponse({ ok: false, error: 'Analysis is already running.' });
    return;
  }
  const resume = await ensureResumeLoaded();
  if (!resume?.text) {
    sendResponse({ ok: false, error: 'Please upload a resume first.' });
    return;
  }
  const batch = { id: crypto.randomUUID(), resumeHash: resume.hash, cancelled: false, paused: false };
  activeBatch = batch;
  isAnalyzing = true;
  const counts = { completed: 0, pending: 0, failed: 0, skipped: 0, attempted: 0, processed: 0,
    collectionFailed: 0, analysisFailed: 0, total: 0 };
  const timing = { collectionMs: 0, analysisMs: 0 };
  const report = (stage, message, jobId = '', detail = {}) => {
    counts.processed = counts.completed + counts.failed;
    counts.pending = Math.max(0, counts.total - counts.processed);
    broadcast({ type: Actions.ANALYSIS_PROGRESS,
      payload: { stage: 'batch', batchStage: stage, batchId: batch.id, analysisResumeHash: batch.resumeHash,
        jobId, message, ...counts, ...detail, timing: { ...timing } } });
  };
  try {
    const activeTab = await getActiveTab();
    if (!activeTab?.id) throw new Error('Cannot connect to the active job page.');
    // Pin the source tab before loading config/cache or collecting any JDs.
    batch.tabId = activeTab.id;
    const config = { ...await loadConfig(), analysisLanguage: await loadLocale() };
    if (!config.apiKey?.trim()) throw new Error('Please configure an API key first.');
    const cacheContext = await buildCacheContext(config, resume.hash, MATCH_PROMPT_VERSION);
    await CacheManager.cleanupExpired();
    const listResponse = await sendTabMessageWithInjection(batch.tabId, { type: Actions.GET_JOB_LIST });
    let jobs = Array.isArray(listResponse?.jobs) ? listResponse.jobs : [];
    if (Array.isArray(requestPayload.jobIds) && requestPayload.jobIds.length) {
      const allowedIds = new Set(requestPayload.jobIds);
      jobs = jobs.filter(job => allowedIds.has(job.jobId));
    }
    if (Array.isArray(requestPayload.skipJobIds) && requestPayload.skipJobIds.length) {
      const skippedIds = new Set(requestPayload.skipJobIds);
      jobs = jobs.filter(job => !skippedIds.has(job.jobId));
    }
    if (!jobs.length) throw new Error('No jobs were detected on the current page.');
    const quota = requestPayload.batchSize === 'all' ? Infinity
      : Math.max(1, Number.parseInt(requestPayload.batchSize, 10) || 5);
    counts.total = jobs.length;
    counts.pending = jobs.length;
    report('start', 'Checking remaining jobs against the current CV and JD.');

    // Reuse the baseline's collect-then-analyze order, bounded to five snapshots.
    // Once collected, a JD no longer depends on the page's current selection.
    for (let offset = 0; offset < jobs.length; offset += BATCH_CHUNK_SIZE) {
      const extractedJobs = [];
      const collectionStarted = Date.now();
      for (const job of jobs.slice(offset, offset + BATCH_CHUNK_SIZE)) {
        if (batch.cancelled || counts.attempted >= quota) break;
        report('verifying', `Checking ${job.title || job.company || job.jobId}`, job.jobId);
        try {
          const focused = await sendTabMessageWithInjection(batch.tabId, {
            type: Actions.FOCUS_JOB, payload: { jobId: job.jobId },
          });
          if (batch.cancelled) break;
          if (focused?.success === false) {
            if (focused.pageHidden) {
              batch.paused = true;
              break;
            }
            throw new Error('The job could not be focused.');
          }
          const jdData = await waitForJobDetails(batch.tabId, job.jobId, { batch });
          if (batch.cancelled) break;
          if (!jdData || jdData.jobId !== job.jobId) {
            if (focused?.pageHidden) {
              batch.paused = true;
              break;
            }
            throw new Error('The job description could not be verified.');
          }
          const cached = requestPayload.forceRefresh === true ? null
            : await CacheManager.getEntry(job.jobId, cacheContext, { jdData });
          if (batch.cancelled) break;
          if (cached && !shouldIgnoreCachedEntry(cached)) {
            counts.completed += 1;
            counts.skipped += 1;
            const cachedPayload = buildAnalysisPayload(cached.data, jdData, {
              fromCache: true, cachedAt: cached.summary?.analyzedAt || null,
              batchId: batch.id, analysisResumeHash: batch.resumeHash, jdVerified: true,
              jdText: jdData.description, jdExtractionVersion: jdData.extractionVersion || '',
            });
            broadcast({ type: Actions.ANALYSIS_RESULT, payload: cachedPayload });
            report('cached', `Skipped valid cache for ${job.title || job.jobId}`, job.jobId);
            continue;
          }
          counts.attempted += 1;
          extractedJobs.push({ job, jdData: { ...jdData } });
          report('collected', `Collected ${job.title || job.jobId}`, job.jobId);
        } catch (error) {
          if (batch.cancelled) break;
          if (error?.code === 'JD_COLLECTION_DEFERRED') {
            batch.paused = true;
            break;
          }
          counts.failed += 1;
          counts.collectionFailed += 1;
          counts.attempted += 1;
          report('failed', `JD collection failed for ${job.title || job.jobId}: ${String(error?.message || error).slice(0, 160)}`,
            job.jobId, { failureStage: 'collection' });
        }
      }
      timing.collectionMs += Date.now() - collectionStarted;

      const analysisStarted = Date.now();
      await runWithConcurrency(extractedJobs, 1, async ({ job, jdData }) => {
        if (batch.cancelled) return;
        try {
          report('analysis', `Analyzing ${job.title || job.jobId}`, job.jobId);
          const result = await runAnalysis(jdData, resume, config);
          if (shouldIgnoreCachedEntry({ data: result })
            || result.metadata?.capabilityScoreVersion !== HOLISTIC_SCORE_VERSION) {
            throw new Error('The analysis did not produce a valid current score.');
          }
          await CacheManager.saveResult(job.jobId, cacheContext, jdData, result);
          counts.completed += 1;
          const storedPayload = buildAnalysisPayload(result, jdData, { fromCache: false });
          try {
            await PositionManager.updateSavedPositionResult(job.jobId, jdData.sourceType || 'linkedin', storedPayload, {
              score: result.overallMatchPercent,
              analyzedAt: result.metadata?.analysisTimestamp || new Date().toISOString(),
            });
          } catch { /* The analysis cache is already saved; saved-position sync can recover later. */ }
          if (!batch.cancelled) {
            // A frozen source tab must not hold up analysis of the other snapshots.
            tryInjectScore(batch.tabId, job.jobId, result.overallMatchPercent, resume.hash).catch(() => {});
          }
          broadcast({ type: Actions.ANALYSIS_RESULT, payload: {
            ...storedPayload, batchId: batch.id, analysisResumeHash: batch.resumeHash,
            jdVerified: true, jdText: jdData.description, jdExtractionVersion: jdData.extractionVersion || '',
          } });
          report('completed', `Completed ${job.title || job.jobId}`, job.jobId);
        } catch (error) {
          counts.failed += 1;
          counts.analysisFailed += 1;
          report('failed', `AI analysis failed for ${job.title || job.jobId}: ${String(error?.message || error).slice(0, 160)}`,
            job.jobId, { failureStage: 'analysis' });
        }
      });
      timing.analysisMs += Date.now() - analysisStarted;
      if (batch.cancelled || batch.paused || counts.attempted >= quota) break;
    }
    report(batch.cancelled ? 'cancelled' : batch.paused ? 'paused' : 'complete',
      batch.cancelled ? 'Remaining jobs cancelled.' : batch.paused
        ? 'JD collection paused. Return to the job page and run the batch again.' : 'Batch analysis finished.');
    sendResponse({ ok: true, batchId: batch.id, analysisResumeHash: batch.resumeHash,
      cancelled: batch.cancelled, paused: batch.paused, timing,
      analyzedCount: counts.completed - counts.skipped, ...counts });
  } catch (error) {
    const normalized = normalizeUserFacingError(error);
    report('failed', normalized.error || 'Batch analysis failed.');
    sendResponse({ ok: false, batchId: batch.id, analysisResumeHash: batch.resumeHash, ...normalized, ...counts });
  } finally {
    if (activeBatch === batch) activeBatch = null;
    isAnalyzing = false;
  }
}

async function runWithConcurrency(items, limit, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) return;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

async function waitForJobDetails(tabId, jobId, { batch = null } = {}) {
  let pageHidden = false;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (batch?.cancelled) return null;
    if (attempt > 0) await delay(700);
    if (batch?.cancelled) return null;

    try {
      const response = await sendTabMessageWithInjection(tabId, { type: Actions.GET_JD_DATA });
      if (batch?.cancelled) return null;
      if (typeof response?.pageHidden === 'boolean') pageHidden = response.pageHidden;
      const jdData = response?.payload;

      if (jdData?.jobId === jobId && jdData.description
        && (!response.activeJobId || response.activeJobId === jobId)
        && !olderThanCurrentJD(jdData, tabId)
        && jdData.extractionConfidence !== 'failed'
        && !['failed', 'loading', 'stale', 'rechecking', 'reverify-failed', 'identity-mismatch'].includes(jdData.extractionStatus)) {
        currentJDData = { ...jdData, sourceTabId: tabId };
        return jdData;
      }
    } catch {
      // Keep waiting while the job page re-renders.
    }
  }

  if (batch && pageHidden) {
    const deferred = new Error('The hidden job page has not rendered a verified JD yet.');
    deferred.code = 'JD_COLLECTION_DEFERRED';
    throw deferred;
  }
  return null;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function handleUpdateConfig(payload, sendResponse) {
  try {
    const config = await saveConfig(payload);
    sendResponse({ ok: true, data: config });
  } catch (err) {
    sendResponse({ ok: false, error: err.message || 'Failed to save config.' });
  }
}

async function handleGetConfig(sendResponse) {
  try {
    const config = await loadConfig();
    sendResponse({ ok: true, data: config });
  } catch (err) {
    sendResponse({ ok: false, error: err.message || 'Failed to load config.' });
  }
}

async function handleGetJDData(sendResponse) {
  try {
    const jdData = await fetchCurrentJDData(false);
    if (jdData) {
      sendResponse({ ok: true, data: jdData });
      return;
    }
    sendResponse({ ok: false, error: 'Unable to read job data from the current page.' });
  } catch (err) {
    sendResponse({ ok: false, error: err.message || 'Unable to read job data.' });
  }
}

async function handleGetCachedScores(payload, sendResponse) {
  try {
    await CacheManager.cleanupExpired();

    const resume = await ensureResumeLoaded();
    if (!resume?.hash) {
      sendResponse({ ok: true, resumeAvailable: false, entries: [] });
      return;
    }

    const jobIds = Array.isArray(payload?.jobIds) ? payload.jobIds : [];
    const config = await loadConfig();
    const titleDisplaySettings = normalizeTitleDisplaySettings(config.titleDisplaySettings);
    const cacheContext = await buildCacheContext(config, resume.hash, MATCH_PROMPT_VERSION);
    const candidates = (await CacheManager.getEntries(jobIds, cacheContext))
      .filter(entry => !shouldIgnoreCachedEntry(entry));
    const entries = [];
    const invalidJobIds = [];
    for (const entry of candidates) {
      if (payload?.currentJDData?.jobId === entry.jobId
          && !await matchesCachedJD(entry, payload.currentJDData)) {
        invalidJobIds.push(entry.jobId);
        continue;
      }
      entries.push(entry);
    }
    sendResponse({
      ok: true,
      resumeAvailable: true,
      resumeHash: resume.hash,
      invalidJobIds,
      displaySettings: titleDisplaySettings,
      entries: entries.map(entry => ({
        ...buildCachedResponse(entry, payload?.includeResult, titleDisplaySettings, resume),
        jdVerified: payload?.currentJDData?.jobId === entry.jobId,
      })),
    });
  } catch (err) {
    sendResponse({ ok: false, error: err.message || 'Unable to read cached scores.' });
  }
}

async function handleClearAnalysisCache(sendResponse) {
  if (isAnalyzing) {
    sendResponse({ ok: false, error: 'Wait for the current analysis to finish before clearing the cache.' });
    return;
  }
  try {
    const invalidatedCount = await CacheManager.clearReusableAnalysis();
    sendResponse({ ok: true, invalidatedCount });
  } catch (error) {
    sendResponse({ ok: false, error: error.message || 'Failed to clear analysis cache.' });
  }
}

async function handleGetVerifiedCachedResult(payload, sendResponse) {
  try {
    const jobId = payload?.jobId;
    const tab = await getActiveTab();
    if (!jobId || !tab?.id) {
      sendResponse({ ok: true, status: 'Verifying', entry: null });
      return;
    }
    const focused = await sendTabMessageWithInjection(tab.id, { type: Actions.FOCUS_JOB, payload: { jobId } });
    if (focused?.success === false) {
      sendResponse({ ok: true, status: 'Verifying', entry: null });
      return;
    }
    const jdData = await waitForJobDetails(tab.id, jobId);
    const resume = await ensureResumeLoaded();
    const activeTabNow = await getActiveTab();
    if (!jdData || !resume?.hash || activeTabNow?.id !== tab.id) {
      sendResponse({ ok: true, status: 'Verifying', entry: null, resumeHash: resume?.hash || null });
      return;
    }
    const config = await loadConfig();
    const cacheContext = await buildCacheContext(config, resume.hash, MATCH_PROMPT_VERSION);
    const entry = await CacheManager.getEntry(jobId, cacheContext, { jdData });
    const validEntry = entry && !shouldIgnoreCachedEntry(entry)
      ? { ...buildCachedResponse(entry, true, normalizeTitleDisplaySettings(config.titleDisplaySettings), resume), jdVerified: true } : null;
    sendResponse({ ok: true, status: validEntry ? 'Valid' : 'Invalid', entry: validEntry,
      resumeHash: resume.hash, jdData });
  } catch (error) {
    sendResponse({ ok: false, status: 'Verifying', error: error.message || 'Unable to verify cached job result.' });
  }
}

async function handleTestConnection(payload, sendResponse) {
  try {
    // Test exactly the submitted draft, never merge another provider's credentials.
    const config = { ...(payload || {}), maxRetries: 0 };

    if (!config.apiKey?.trim()) {
      sendResponse({ ok: false, error: 'Please provide an API key first.' });
      return;
    }

    const testResponse = await runConnectionTest(config);
    sendResponse({ ok: true, data: testResponse });
  } catch (err) {
    sendResponse({ ok: false, error: err.message || 'Connection test failed.' });
  }
}

async function handleGetManualJobs(sendResponse) {
  try {
    const jobs = await PositionManager.listManualJobs();
    sendResponse({ ok: true, data: jobs });
  } catch (err) {
    sendResponse({ ok: false, error: err.message || 'Failed to load inserted jobs.' });
  }
}

async function handleUpsertManualJob(payload, sendResponse) {
  try {
    if (!payload?.title?.trim() || !payload?.description?.trim()) {
      sendResponse({ ok: false, error: 'Inserted jobs need at least a title and a description.' });
      return;
    }

    const job = await PositionManager.upsertManualJob({
      manualJobId: payload.manualJobId || '',
      title: payload.title.trim(),
      company: payload.company?.trim() || '',
      location: payload.location?.trim() || '',
      description: payload.description.trim(),
      sourceUrl: payload.sourceUrl?.trim() || '',
      rawInput: payload.rawInput?.trim() || '',
    });

    sendResponse({ ok: true, data: job });
  } catch (err) {
    sendResponse({ ok: false, error: err.message || 'Failed to save inserted job.' });
  }
}

async function handleDeleteManualJob(payload, sendResponse) {
  try {
    await PositionManager.deleteManualJob(payload?.manualJobId);
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ ok: false, error: err.message || 'Failed to delete inserted job.' });
  }
}

async function handleToggleSavePosition(payload, sendResponse) {
  try {
    if (!payload?.jobId) {
      sendResponse({ ok: false, error: 'Missing position id.' });
      return;
    }

    const result = await PositionManager.toggleSavedPosition(payload);
    sendResponse({ ok: true, data: result });
  } catch (err) {
    sendResponse({ ok: false, error: err.message || 'Failed to update saved positions.' });
  }
}

async function handleDeleteSavedPosition(payload, sendResponse) {
  try {
    const jobId = payload?.jobId;
    const sourceType = normalizeSourceType(payload?.sourceType);
    if (!jobId) {
      sendResponse({ ok: false, error: 'Missing position id.' });
      return;
    }

    const deleted = await PositionManager.deleteSavedPosition(jobId, sourceType);
    sendResponse({ ok: true, data: { deleted } });
  } catch (err) {
    sendResponse({ ok: false, error: err.message || 'Failed to delete the saved position.' });
  }
}

async function handleDeleteHistoryEntry(payload, sendResponse) {
  try {
    const jobId = payload?.jobId;
    if (!jobId) {
      sendResponse({ ok: false, error: 'Missing history entry id.' });
      return;
    }

    const resume = await ensureResumeLoaded();
    if (!resume?.hash) {
      sendResponse({ ok: false, error: 'No active resume is loaded.' });
      return;
    }

    const config = await loadConfig();
    const cacheContext = await buildCacheContext(config, resume.hash, MATCH_PROMPT_VERSION);
    const deleted = await CacheManager.deleteEntry(jobId, cacheContext, { allowCompatible: true });
    sendResponse({ ok: true, data: { deleted } });
  } catch (err) {
    sendResponse({ ok: false, error: err.message || 'Failed to delete the history entry.' });
  }
}

async function handleDetectInsertedJob(payload, sendResponse) {
  try {
    const rawText = payload?.rawText?.trim() || '';
    if (!rawText || rawText.length < 40) {
      sendResponse({ ok: false, error: 'Paste more job content so the plugin can detect the fields.' });
      return;
    }

    const config = await loadConfig();
    if (!config?.apiKey?.trim()) {
      sendResponse({ ok: false, error: 'Configure an API key to use AI-assisted detection.' });
      return;
    }

    const aiDetection = await detectInsertedJobWithAI(rawText, config);
    sendResponse({ ok: true, data: aiDetection });
  } catch (err) {
    sendResponse({ ok: false, error: err.message || 'Failed to detect inserted job fields.' });
  }
}

async function handleGetPositionLibrary(sendResponse) {
  try {
    const resume = await ensureResumeLoaded();
    const manualJobs = await PositionManager.listManualJobs();
    const savedPositions = await PositionManager.listSavedPositions();
    let historyEntries = [];

    if (resume?.hash) {
      const config = await loadConfig();
      const titleDisplaySettings = normalizeTitleDisplaySettings(config.titleDisplaySettings);
      const cacheContext = await buildCacheContext(config, resume.hash, MATCH_PROMPT_VERSION);
      historyEntries = (await CacheManager.listEntries(cacheContext))
        .filter(entry => !shouldIgnoreCachedEntry(entry))
        .map(entry => buildCachedResponse(entry, false, titleDisplaySettings, resume));
    }

    const partitionBySource = items => ({
      linkedin: items.filter(item => normalizeSourceType(item.sourceType) === 'linkedin'),
      indeed: items.filter(item => normalizeSourceType(item.sourceType) === 'indeed'),
      inserted: items.filter(item => normalizeSourceType(item.sourceType) === 'inserted'),
    });

    sendResponse({
      ok: true,
      data: {
        resumeAvailable: !!resume?.hash,
        manualJobs,
        history: partitionBySource(historyEntries),
        saved: partitionBySource(savedPositions.map(buildSavedPositionResponse)),
      },
    });
  } catch (err) {
    sendResponse({ ok: false, error: err.message || 'Failed to load history and saved positions.' });
  }
}

async function runConnectionTest(config) {
  return testModelConnection(config);
}

async function detectInsertedJobWithAI(rawText, config) {
  const response = await callLLM(
    {
      ...config,
      maxTokens: Math.min(config.maxTokens || 512, 700),
      temperature: 0,
      maxRetries: Math.min(config.maxRetries ?? 1, 1),
    },
    {
      systemPrompt: [
        'You extract structured job posting fields from pasted text.',
        'Return valid JSON only.',
        'Use this schema:',
        '{',
        '  "title": "string",',
        '  "company": "string",',
        '  "location": "string",',
        '  "sourceUrl": "string",',
        '  "description": "string",',
        '  "confidence": "high|medium|low"',
        '}',
        'Rules:',
        '- Prefer empty strings over invented values.',
        '- description should contain the main job description/body, not only the title line.',
        '- sourceUrl should be a direct URL if one is present in the text; otherwise use an empty string.',
        '- For location, if the text only gives a city but the country can be inferred with high confidence from the text, expand it to a fuller location such as "Rotterdam, Netherlands" or "Berlin, Germany".',
        '- If the role is clearly in the Netherlands, prefer explicitly including "Netherlands" in the location field.',
        '- If you cannot infer the country confidently, keep only the city or original location text instead of inventing details.',
        '- Do not include markdown fences or extra commentary.',
      ].join('\n'),
      userPrompt: `Extract the job fields from this pasted content:\n\n${rawText}`,
    },
  );

  const parsed = safeParseJSON(response.content);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('The model did not return a usable structured detection result.');
  }

  return {
    title: typeof parsed.title === 'string' ? parsed.title.trim() : '',
    company: typeof parsed.company === 'string' ? parsed.company.trim() : '',
    location: enrichDetectedLocation(typeof parsed.location === 'string' ? parsed.location.trim() : '', rawText),
    sourceUrl: typeof parsed.sourceUrl === 'string' ? parsed.sourceUrl.trim() : '',
    description: typeof parsed.description === 'string' ? parsed.description.trim() : '',
    confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
  };
}

function enrichDetectedLocation(location, rawText) {
  const normalizedLocation = (location || '').trim();
  const combined = `${normalizedLocation}\n${rawText || ''}`.toLowerCase();

  if (!normalizedLocation) {
    return normalizedLocation;
  }

  if (/\bnetherlands\b|\bnederland\b|\bholland\b/i.test(normalizedLocation)) {
    return normalizedLocation;
  }

  const dutchCityMap = {
    amsterdam: 'Amsterdam, Netherlands',
    rotterdam: 'Rotterdam, Netherlands',
    utrecht: 'Utrecht, Netherlands',
    eindhoven: 'Eindhoven, Netherlands',
    groningen: 'Groningen, Netherlands',
    delft: 'Delft, Netherlands',
    leiden: 'Leiden, Netherlands',
    maastricht: 'Maastricht, Netherlands',
    arnhem: 'Arnhem, Netherlands',
    nijmegen: 'Nijmegen, Netherlands',
    haarlem: 'Haarlem, Netherlands',
    almere: 'Almere, Netherlands',
    amersfoort: 'Amersfoort, Netherlands',
    tilburg: 'Tilburg, Netherlands',
    breda: 'Breda, Netherlands',
    enschede: 'Enschede, Netherlands',
    dordrecht: 'Dordrecht, Netherlands',
    zoetermeer: 'Zoetermeer, Netherlands',
    'the hague': 'The Hague, Netherlands',
    'den haag': 'The Hague, Netherlands',
    'den bosch': 'Den Bosch, Netherlands',
  };

  for (const [city, fullLocation] of Object.entries(dutchCityMap)) {
    if (combined.includes(city)) {
      return fullLocation;
    }
  }

  if (/\bgermany\b|\bdeutschland\b/i.test(combined) && !/\bgermany\b/i.test(normalizedLocation)) {
    return `${normalizedLocation}, Germany`;
  }

  if (/\bnetherlands\b|\bnederland\b|\bholland\b/i.test(combined)) {
    return `${normalizedLocation}, Netherlands`;
  }

  return normalizedLocation;
}

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {
    // Side panel might be closed. This is expected.
  });
}

function normalizeUserFacingError(error) {
  const rawMessage = error?.message || 'Unknown analysis error.';
  const lower = rawMessage.toLowerCase();

  if (lower.includes('api key')) {
    return {
      errorType: ErrorTypes.CONFIG_MISSING,
      error: 'API configuration is incomplete. Add a valid API key and try again.',
      details: rawMessage,
    };
  }

  if (lower.includes('404') || lower.includes('model') && lower.includes('not found')) {
    return {
      errorType: ErrorTypes.MODEL_NOT_FOUND,
      error: 'The selected model is unavailable. Check the model name or test the connection first.',
      details: rawMessage,
    };
  }

  if (lower.includes('401') || lower.includes('403') || lower.includes('unauthorized')) {
    return {
      errorType: ErrorTypes.AUTH_FAILED,
      error: 'Authentication failed. Please verify the API key and provider settings.',
      details: rawMessage,
    };
  }

  if (lower.includes('429') || lower.includes('rate limit')) {
    return {
      errorType: ErrorTypes.RATE_LIMITED,
      error: 'The provider is rate limiting requests right now. Please wait a moment and retry.',
      details: rawMessage,
    };
  }

  if (lower.includes('unable to read job data') || lower.includes('job description extraction failed') || lower.includes('details never loaded')) {
    return {
      errorType: ErrorTypes.JD_EXTRACTION_FAILED,
      error: 'LinkedIn job details could not be read. Refresh the job page and try again.',
      details: rawMessage,
    };
  }

  if (lower.includes('resume')) {
    return {
      errorType: ErrorTypes.RESUME_PARSE_FAILED,
      error: 'The resume could not be parsed correctly. Try another PDF, DOCX, or TXT file.',
      details: rawMessage,
    };
  }

  if (lower.includes('network') || lower.includes('fetch')) {
    return {
      errorType: ErrorTypes.NETWORK_FAILED,
      error: 'A network error interrupted the analysis. Please retry in a moment.',
      details: rawMessage,
    };
  }

  if (lower.includes('json') || lower.includes('format') || lower.includes('parsed')) {
    return {
      errorType: ErrorTypes.MODEL_OUTPUT_INVALID,
      error: 'The model responded, but the result format was incomplete. Re-analyze or switch to a more stable model.',
      details: rawMessage,
    };
  }

  return {
    errorType: ErrorTypes.UNKNOWN_ERROR,
    error: rawMessage,
    details: rawMessage,
  };
}

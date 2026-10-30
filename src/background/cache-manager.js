import { LINKEDIN_JD_EXTRACTION_VERSION, normalizeSourceType } from '../shared/constants.js';
import { hashValue } from '../shared/scoring-profile.js';
import { dutchRequirementStatus } from '../shared/career-level-display.js';

const CACHE_PREFIX = 'match_result_v3_';
const CURRENT_CACHE_VERSION = 3;
const LEGACY_CACHE_PREFIX = 'match_result_';
const CACHE_GENERATION_KEY = 'ljm_analysis_cache_generation_v1';
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function buildCacheKey(jobId, cacheContext, generation = 0) {
  return `${CACHE_PREFIX}${generation ? `g${generation}_` : ''}${cacheContext.resumeHash}_${cacheContext.scoringProfileHash}_${cacheContext.modelKeyHash}_${cacheContext.promptVersion || 'v1'}_${jobId}`;
}

function cacheGeneration(storage) {
  const value = storage?.[CACHE_GENERATION_KEY];
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function isReusableEntry(value, generation) {
  return isUsableEntry(value) && (value.cacheGeneration || 0) === generation;
}

function matchesAnalysisIdentity(value, context) {
  return value?.promptVersion === context?.promptVersion
    && value?.scoringProfileHash === context?.scoringProfileHash
    && value?.modelKeyHash === context?.modelKeyHash;
}

function currentExtraction(entry) {
  return normalizeSourceType(entry?.summary?.sourceType) !== 'linkedin'
    || entry?.summary?.jdExtractionVersion === LINKEDIN_JD_EXTRACTION_VERSION;
}

function jdIdentity(jdData) {
  return { jobId: jdData?.jobId || '', title: jdData?.title || '', company: jdData?.company || '',
    location: jdData?.location || '', description: jdData?.description || '',
    extractionVersion: jdData?.extractionVersion || '' };
}

export async function matchesCachedJD(entry, jdData) {
  return Boolean(entry?.jdHash && jdData?.description
    && entry.jdHash === await hashValue(jdIdentity(jdData)));
}

function buildSummary(jobId, jdData, matchData, cacheContext) {
  const sponsorship = matchData?.sponsorshipAssessment || {};
  const metadata = matchData?.metadata || {};
  const scoringProfile = cacheContext?.scoringProfile || {};
  const sourceType = normalizeSourceType(jdData?.sourceType);

  return {
    jobId,
    sourceType,
    title: jdData?.title || '',
    company: jdData?.company || '',
    location: jdData?.location || '',
    url: jdData?.url || '',
    sourceUrl: jdData?.sourceUrl || jdData?.url || '',
    jdLanguage: metadata.jdLanguage || 'Unknown',
    requiredExperience: metadata.requiredExperience || null,
    requiredLanguages: Array.isArray(metadata.requiredLanguages) ? metadata.requiredLanguages : [],
    jobAnalysis: matchData?.jobAnalysis ? {
      version: matchData.jobAnalysis.version,
      careerLevel: matchData.jobAnalysis.careerLevel?.level || 'Unknown',
      dutchRequirement: dutchRequirementStatus(matchData.jobAnalysis),
      experienceYears: matchData.jobAnalysis.experienceRequirements?.items?.filter(item => item.requirementType === 'Mandatory'
        && !['Academic', 'Internship'].includes(item.experienceKind)).map(item => item.minimumYears) || [],
    } : null,
    score: matchData?.overallMatchPercent ?? null,
    capabilityScoreVersion: metadata.capabilityScoreVersion || null,
    analyzedAt: metadata.analysisTimestamp || new Date().toISOString(),
    analysisPreset: scoringProfile.analysisPreset || metadata.analysisPreset || 'balanced',
    promptTuningMode: scoringProfile.promptTuningMode || metadata.promptTuningMode || 'balanced',
    isCustomProfile: scoringProfile.isCustomProfile === true || metadata.isCustomProfile === true,
    includeSponsorshipInScore: scoringProfile.includeSponsorshipInScore !== false && metadata.includeSponsorshipInScore !== false,
    weightsApplied: metadata.weightsApplied || scoringProfile.weightsApplied || {},
    modelKey: cacheContext?.modelKey || metadata.modelKey || '',
    promptVersion: cacheContext?.promptVersion || metadata.promptVersion || 'v1',
    timing: metadata.timing || null,
    // Keep a bounded local excerpt so title keyword preferences can be changed
    // without re-running the model for every cached position.
    jdText: typeof jdData?.description === 'string' ? jdData.description.slice(0, 50000) : '',
    jdExtractionVersion: jdData?.extractionVersion || '',
    kmEligible: sponsorship.kmEligible === true || sponsorship.indRegistered === true,
    sponsorshipLabel: sponsorship.kmEligible === true || sponsorship.indRegistered === true ? 'KM' : null,
    sponsorshipCompany: sponsorship.registryMatchedName || null,
    sponsorshipConfidence: sponsorship.registryConfidence || null,
  };
}

function isExpired(timestamp) {
  return !timestamp || (Date.now() - timestamp > ONE_MONTH_MS);
}

function isUsableEntry(value) {
  return value?.version === CURRENT_CACHE_VERSION && !isExpired(value.timestamp);
}

function getEntryJobId(value) {
  return value?.jobId || value?.summary?.jobId || '';
}

function getEntryTimestamp(value) {
  const analyzedAt = Date.parse(value?.summary?.analyzedAt || '');
  return Number.isFinite(analyzedAt) ? analyzedAt : Number(value?.timestamp) || 0;
}

function choosePreferredRecord(records, exactKey = '') {
  const exactRecord = records.find(record => record.key === exactKey);
  if (exactRecord) {
    return exactRecord;
  }

  return records
    .slice()
    .sort((a, b) => getEntryTimestamp(b.value) - getEntryTimestamp(a.value))[0] || null;
}

/**
 * Read v0.1.2+ cache records for the same resume and job, even when the
 * current provider/model/scoring profile has changed. The stored snapshot is
 * returned untouched so display-only upgrades cannot rewrite old results.
 */
async function readCompatibleEntryRecords(jobIds, cacheContext, { includeInvalidated = false } = {}) {
  if (!cacheContext?.resumeHash || !cacheContext?.scoringProfileHash || !cacheContext?.modelKeyHash) {
    return [];
  }

  const requestedJobIds = Array.isArray(jobIds)
    ? [...new Set(jobIds.filter(Boolean))]
    : null;
  const requestedSet = requestedJobIds ? new Set(requestedJobIds) : null;
  const allStorage = await chrome.storage.local.get(null);
  const generation = cacheGeneration(allStorage);
  const grouped = new Map();
  const keysToRemove = [];

  for (const [key, value] of Object.entries(allStorage)) {
    if (!key.startsWith(CACHE_PREFIX)) {
      continue;
    }

    const candidateJobId = getEntryJobId(value);
    if (value?.resumeHash !== cacheContext.resumeHash
      || !candidateJobId
      || (requestedSet && !requestedSet.has(candidateJobId))) {
      continue;
    }

    if (!isUsableEntry(value)) {
      keysToRemove.push(key);
      continue;
    }
    if (!includeInvalidated && !isReusableEntry(value, generation)) continue;

    const records = grouped.get(candidateJobId) || [];
    records.push({ key, value });
    grouped.set(candidateJobId, records);
  }

  if (keysToRemove.length) {
    await chrome.storage.local.remove(keysToRemove);
  }

  if (requestedJobIds) {
    return requestedJobIds
      .map(jobId => choosePreferredRecord(
        grouped.get(jobId) || [],
        buildCacheKey(jobId, cacheContext, generation),
      ))
      .filter(Boolean);
  }

  return [...grouped.values()]
    .map(records => {
      const jobId = getEntryJobId(records[0]?.value);
      return choosePreferredRecord(records, buildCacheKey(jobId, cacheContext, generation));
    })
    .filter(Boolean);
}

export const CacheManager = {
  async saveResult(jobId, cacheContext, jdData, matchData) {
    if (!jobId || !cacheContext?.resumeHash || !cacheContext?.scoringProfileHash || !cacheContext?.modelKeyHash || !matchData) {
      return;
    }

    const generation = cacheGeneration(await chrome.storage.local.get(CACHE_GENERATION_KEY));
    const key = buildCacheKey(jobId, cacheContext, generation);
    const jdHash = await hashValue(jdIdentity(jdData));
    await chrome.storage.local.set({
      [key]: {
        version: CURRENT_CACHE_VERSION,
        timestamp: Date.now(),
        cacheGeneration: generation,
        resumeHash: cacheContext.resumeHash,
        jobId,
        jdHash,
        scoringProfileHash: cacheContext.scoringProfileHash,
        modelKeyHash: cacheContext.modelKeyHash,
        promptVersion: cacheContext.promptVersion || 'v1',
        summary: buildSummary(jobId, jdData, matchData, cacheContext),
        data: matchData,
      },
    });
  },

  async getEntry(jobId, cacheContext, options = {}) {
    if (!jobId || !cacheContext?.resumeHash || !cacheContext?.scoringProfileHash || !cacheContext?.modelKeyHash) {
      return null;
    }

    const generation = cacheGeneration(await chrome.storage.local.get(CACHE_GENERATION_KEY));
    const key = buildCacheKey(jobId, cacheContext, generation);
    const result = await chrome.storage.local.get(key);
    const payload = result[key];

    if (!payload) {
      if (options.allowCompatible) {
        const compatible = (await readCompatibleEntryRecords([jobId], cacheContext))[0]?.value || null;
        return !matchesAnalysisIdentity(compatible, cacheContext)
          || options.jdData && !await matchesCachedJD(compatible, options.jdData) ? null : compatible;
      }
      return null;
    }

    if (!isUsableEntry(payload)) {
      await chrome.storage.local.remove(key);
    } else if (isReusableEntry(payload, generation) && matchesAnalysisIdentity(payload, cacheContext)) {
      return options.jdData && !await matchesCachedJD(payload, options.jdData) ? null : payload;
    }

    if (options.allowCompatible) {
      const compatible = (await readCompatibleEntryRecords([jobId], cacheContext))[0]?.value || null;
      return !matchesAnalysisIdentity(compatible, cacheContext)
        || options.jdData && !await matchesCachedJD(compatible, options.jdData) ? null : compatible;
    }

    return null;
  },

  async getResult(jobId, cacheContext) {
    const entry = await this.getEntry(jobId, cacheContext);
    return entry?.data || null;
  },

  async deleteEntry(jobId, cacheContext, options = {}) {
    if (!jobId || !cacheContext?.resumeHash || !cacheContext?.scoringProfileHash || !cacheContext?.modelKeyHash) {
      return false;
    }

    const generation = cacheGeneration(await chrome.storage.local.get(CACHE_GENERATION_KEY));
    const key = buildCacheKey(jobId, cacheContext, generation);
    const exact = await chrome.storage.local.get(key);
    if (exact[key]) {
      await chrome.storage.local.remove(key);
      return true;
    }

    if (options.allowCompatible) {
      const compatibleRecord = (await readCompatibleEntryRecords([jobId], cacheContext, { includeInvalidated: true }))[0];
      if (compatibleRecord) {
        await chrome.storage.local.remove(compatibleRecord.key);
        return true;
      }
    }

    await chrome.storage.local.remove(key);
    return true;
  },

  async getEntries(jobIds, cacheContext) {
    if (!Array.isArray(jobIds) || !jobIds.length || !cacheContext?.resumeHash || !cacheContext?.scoringProfileHash || !cacheContext?.modelKeyHash) {
      return [];
    }

    const records = await readCompatibleEntryRecords(jobIds, cacheContext);
    return records.filter(record => matchesAnalysisIdentity(record.value, cacheContext)
      && currentExtraction(record.value)).map(record => record.value);
  },

  async clearReusableAnalysis() {
    const allStorage = await chrome.storage.local.get(null);
    const generation = cacheGeneration(allStorage);
    const count = Object.entries(allStorage).filter(([key, value]) =>
      key.startsWith(CACHE_PREFIX) && isReusableEntry(value, generation)).length;
    await chrome.storage.local.set({ [CACHE_GENERATION_KEY]: generation + 1 });
    return count;
  },

  async cleanupExpired() {
    const allStorage = await chrome.storage.local.get(null);
    const keysToRemove = [];

    for (const [key, value] of Object.entries(allStorage)) {
      if (key.startsWith(CACHE_PREFIX)) {
        if (isExpired(value?.timestamp) || value?.version !== CURRENT_CACHE_VERSION) {
          keysToRemove.push(key);
        }
      }

      if (key.startsWith(LEGACY_CACHE_PREFIX) && !key.startsWith(CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    if (keysToRemove.length) {
      await chrome.storage.local.remove(keysToRemove);
    }
  },

  async listEntries(cacheContext, options = {}) {
    if (!cacheContext?.resumeHash || !cacheContext?.scoringProfileHash || !cacheContext?.modelKeyHash) {
      return [];
    }

    const records = await readCompatibleEntryRecords(null, cacheContext, { includeInvalidated: true });
    const entries = [];
    const sourceTypeFilter = options.sourceType || null;

    for (const record of records) {
      const entrySourceType = normalizeSourceType(record.value?.summary?.sourceType);
      if (sourceTypeFilter && entrySourceType !== sourceTypeFilter) {
        continue;
      }

      entries.push(record.value);
    }

    entries.sort((a, b) => new Date(b?.summary?.analyzedAt || 0) - new Date(a?.summary?.analyzedAt || 0));
    return entries;
  },
};

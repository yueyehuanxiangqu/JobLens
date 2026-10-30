import { validateHolisticAssessment, HOLISTIC_SCORE_VERSION, HOLISTIC_RESPONSE_SCHEMA } from '../shared/holistic-match.js';
import { callLLM, resolveEndpoint } from './llm-adapter.js';
import { isNetherlands, checkINDRegistry } from './sponsor-checker.js';
import { buildMatchingPrompt, MATCH_PROMPT_VERSION } from '../prompts/prompt-templates.js';
import { parseJSONResponse, buildFallbackResult } from '../shared/schema-validator.js';
import {
  DegradationTrigger,
} from '../shared/constants.js';
import { buildScoringProfile } from '../shared/scoring-profile.js';
import { loadLocale } from '../i18n/index.js';
import { analyzeJobRequirements } from '../shared/job-analysis.js';
import { JOB_ANALYSIS_SCHEMA_VERSION, validateJobAnalysisShape } from '../shared/job-analysis-schema.js';

export async function runAnalysis(jdData, resumeInput, modelConfig, onProgress = () => {}) {
  const resumeText = typeof resumeInput === 'string' ? resumeInput : resumeInput?.text || '';
  const originalResume = typeof resumeInput === 'string' ? null : resumeInput?.sourceText || '';
  modelConfig = { ...modelConfig, analysisLanguage: modelConfig.analysisLanguage || await loadLocale() };
  const startedAt = Date.now();
  const timings = {
    totalMs: 0,
    extractMs: 0,
    llmMs: 0,
    parseMs: 0,
    repairMs: 0,
    usedRetry: false,
    cacheHit: false,
  };
  const triggers = [];
  // Store request metadata only, never source text, credentials, or raw model output.
  let endpoint = '';
  try {
    const url = new URL(resolveEndpoint(modelConfig.protocol === 'anthropic' ? 'anthropic' : modelConfig.provider, modelConfig.baseUrl || ''));
    endpoint = `${url.origin}${url.pathname}`;
  } catch { /* Invalid configuration is reported by the request validator. */ }
  timings.diagnostics = {
    extensionVersion: '1.0.0', stage: 'input', endpoint,
    protocol: modelConfig.protocol || (modelConfig.provider === 'anthropic' ? 'anthropic' : 'openai-compatible'),
    jdCharacters: jdData?.description?.length || 0,
    resumeCharacters: resumeText?.length || 0,
    maxTokens: modelConfig.maxTokens, timeoutMs: modelConfig.timeoutMs,
    configuredRetries: modelConfig.maxRetries,
  };

  onProgress('validation', 'Validating the job description and resume...');

  if (jdData?.extractionConfidence === 'failed'
    || ['failed', 'loading', 'stale', 'rechecking', 'reverify-failed', 'identity-mismatch'].includes(jdData?.extractionStatus)) {
    triggers.push(DegradationTrigger.JD_EXTRACT_FAIL);
    timings.totalMs = Date.now() - startedAt;
    return wrapWithMetadata(
      buildFallbackResult('Job description extraction failed.', DegradationTrigger.JD_EXTRACT_FAIL),
      modelConfig, triggers, 0, jdData, null, timings,
    );
  }

  if (!jdData?.description || jdData.description.length < 50) {
    triggers.push(DegradationTrigger.JD_EXTRACT_FAIL);
    if (!jdData?.description) {
      timings.totalMs = Date.now() - startedAt;
      return wrapWithMetadata(
        buildFallbackResult('Job description extraction failed.', DegradationTrigger.JD_EXTRACT_FAIL),
        modelConfig,
        triggers,
        0,
        jdData,
        null,
        timings,
      );
    }
  }

  if (!resumeText || resumeText.length < 50) {
    triggers.push(DegradationTrigger.RESUME_PARSE_FAIL);
    if (!resumeText) {
      timings.totalMs = Date.now() - startedAt;
      return wrapWithMetadata(
        buildFallbackResult('Resume parsing failed.', DegradationTrigger.RESUME_PARSE_FAIL),
        modelConfig,
        triggers,
        0,
        jdData,
        null,
        timings,
      );
    }
  }

  onProgress('detection', 'Checking whether this role is in the Netherlands...');
  const detectionStartedAt = Date.now();
  const nlJob = isNetherlands(jdData.location, jdData.description);
  let sponsorshipSnapshot = null;
  const scoringProfile = buildScoringProfile(modelConfig, nlJob);

  if (nlJob) {
    onProgress('sponsorship', 'Checking the IND recognized sponsor registry...');
    try {
      const registry = await checkINDRegistry(jdData.company);
      sponsorshipSnapshot = { registry, kmEligible: registry.found === true };
    } catch (error) {
      triggers.push(DegradationTrigger.SPONSOR_DATA_UNAVAIL);
      sponsorshipSnapshot = {
        contextText: `IND lookup failed: ${error.message}`,
        registry: null,
        keywords: [],
        kmEligible: false,
        displayLabel: null,
      };
    }
  }
  timings.extractMs = Date.now() - detectionStartedAt;

  onProgress('analysis', 'Calling the AI model...');
  const { systemPrompt, userPrompt } = buildMatchingPrompt(
    jdData,
    resumeText,
    nlJob,
    sponsorshipSnapshot?.contextText || null,
    { ...scoringProfile, analysisLanguage: modelConfig.analysisLanguage },
  );

  let llmResponse;
  timings.diagnostics.stage = 'request';
  const llmStartedAt = Date.now();
  try {
    llmResponse = await callLLM(modelConfig, { systemPrompt, userPrompt, responseSchema: HOLISTIC_RESPONSE_SCHEMA });
    timings.diagnostics.resolvedModel = llmResponse.resolvedModel;
    timings.diagnostics.finishReason = llmResponse.finishReason;
    timings.diagnostics.responseCharacters = typeof llmResponse.content === 'string' ? llmResponse.content.length : 0;
    timings.diagnostics.responseFormat = llmResponse.responseFormat || null;
    timings.llmMs = Date.now() - llmStartedAt;
  } catch (error) {
    timings.diagnostics.httpStatus = error.status || null;
    timings.diagnostics.failureKind = /timed out|abort/i.test(error.message) ? 'timeout'
      : error.status ? 'http' : /empty content/i.test(error.message) ? 'empty_output' : 'connection_or_config';
    if (error.code === 'EMPTY_MODEL_OUTPUT') {
      timings.diagnostics.finishReason = error.finishReason;
      timings.diagnostics.resolvedModel = error.resolvedModel;
      timings.diagnostics.responseCharacters = 0;
    }
    timings.llmMs = Date.now() - llmStartedAt;
    triggers.push(DegradationTrigger.MODEL_NO_OUTPUT);
    timings.totalMs = Date.now() - startedAt;
    return wrapWithMetadata(
      buildFallbackResult(`AI model call failed [${modelConfig.provider} / ${modelConfig.modelId}]: ${error.message}`, DegradationTrigger.MODEL_NO_OUTPUT),
      modelConfig,
      triggers,
      0,
      jdData,
      scoringProfile,
      timings,
    );
  }

  const responseWasTruncated = ['length', 'max_tokens'].includes(llmResponse.finishReason);
  if (responseWasTruncated) {
    triggers.push(DegradationTrigger.MODEL_TRUNCATED);
  }

  onProgress('parsing', 'Parsing the AI response...');
  timings.diagnostics.stage = 'json';
  const parseStartedAt = Date.now();
  timings.diagnostics.jsonAttempts = [];
  const parseResponse = (response, attempt) => {
    const outcome = ['length', 'max_tokens'].includes(response.finishReason)
      ? { value: null, error: { kind: 'truncated_output', code: 'OUTPUT_LIMIT' }, wrapper: 'none' }
      : parseJSONResponse(response.content);
    timings.diagnostics.jsonAttempts.push({ attempt, finishReason: response.finishReason,
      responseCharacters: response.content.length, wrapper: outcome.wrapper,
      outcome: outcome.error?.kind || 'parsed', code: outcome.error?.code || null,
      position: outcome.error?.position ?? null, line: outcome.error?.line ?? null,
      column: outcome.error?.column ?? null });
    return outcome;
  };
  let parsedResponse = parseResponse(llmResponse, 1);
  let parsed = parsedResponse.value;
  timings.parseMs = Date.now() - parseStartedAt;

  if (parsedResponse.error) {
    onProgress('retry', 'First parse failed, retrying once...');
    const retryStartedAt = Date.now();
    try {
      timings.usedRetry = true;
      timings.diagnostics.retryReason = parsedResponse.error.kind;
      const configuredTokens = Number(modelConfig.maxTokens) || 4096;
      const retryConfig = {
        ...modelConfig,
        maxRetries: 0,
        temperature: 0,
        ...(responseWasTruncated
          ? { maxTokens: Math.min(Math.max(configuredTokens * 2, 8192), 16384) }
          : {}),
      };
      const retryResponse = await callLLM(retryConfig, {
        systemPrompt: `${systemPrompt}\nRegenerate the complete JSON object using the same contract. Return JSON only. Escape quotes and newlines inside JSON strings; omit markdown and commentary.`,
        userPrompt, responseSchema: HOLISTIC_RESPONSE_SCHEMA,
      });
      timings.diagnostics.resolvedModel = retryResponse.resolvedModel;
      timings.diagnostics.finishReason = retryResponse.finishReason;
      timings.diagnostics.responseCharacters = typeof retryResponse.content === 'string' ? retryResponse.content.length : 0;
      const retryParseStartedAt = Date.now();
      const retryWasTruncated = ['length', 'max_tokens'].includes(retryResponse.finishReason);
      parsedResponse = parseResponse(retryResponse, 2);
      parsed = parsedResponse.value;
      if (retryWasTruncated) triggers.push(DegradationTrigger.MODEL_TRUNCATED);
      timings.parseMs += Date.now() - retryParseStartedAt;
    } catch (error) {
      timings.diagnostics.retryFailure = /timed out|abort/i.test(error.message) ? 'timeout' : 'request_failed';
      timings.diagnostics.retryHttpStatus = error.status || null;
      if (error.code === 'EMPTY_MODEL_OUTPUT') {
        timings.diagnostics.retryFailure = 'empty_output';
        parsedResponse = parseResponse({ content: '', finishReason: error.finishReason }, 2);
        timings.diagnostics.responseCharacters = 0;
        timings.diagnostics.finishReason = error.finishReason;
      }
    } finally {
      timings.llmMs += Date.now() - retryStartedAt;
    }

    if (parsedResponse.error) {
      const failureKind = parsedResponse.error.kind;
      timings.diagnostics.failureKind = failureKind;
      const trigger = failureKind === 'truncated_output' ? DegradationTrigger.MODEL_TRUNCATED
        : failureKind === 'empty_output' ? DegradationTrigger.MODEL_NO_OUTPUT : DegradationTrigger.MODEL_JSON_INVALID;
      triggers.push(trigger);
      timings.totalMs = Date.now() - startedAt;
      return wrapWithMetadata(
        buildFallbackResult(failureKind === 'truncated_output' ? 'The AI response reached its output limit.'
          : failureKind === 'empty_output' ? 'The AI returned empty content.' : 'The AI response was not valid JSON.', trigger),
        modelConfig,
        triggers,
        0,
        jdData,
        scoringProfile,
        timings,
      );
    }
  }

  timings.diagnostics.stage = 'schema';
  let data;
  try {
    data = validateHolisticAssessment(parsed, jdData, originalResume || resumeText, modelConfig.analysisLanguage);
  } catch (error) {
    timings.diagnostics.failureKind = 'schema';
    timings.diagnostics.schemaErrors = [error.message];
    triggers.push(DegradationTrigger.MODEL_FIELD_MISSING);
    timings.totalMs = Date.now() - startedAt;
    return wrapWithMetadata(buildFallbackResult(error.message, DegradationTrigger.MODEL_FIELD_MISSING), modelConfig, triggers, 0, jdData, scoringProfile, timings);
  }
  const validationWarnings = data.validationWarnings || [];
  delete data.validationWarnings;
  if (validationWarnings.length) {
    timings.diagnostics.failureKind = 'schema_degraded';
    timings.diagnostics.schemaErrors = validationWarnings;
    triggers.push(DegradationTrigger.MODEL_FIELD_MISSING);
  }
  const explanationQuality = data.rubric.explanationQuality;
  if (explanationQuality.status === 'review') {
    timings.diagnostics.explanationIssues = explanationQuality.issues;
    if (!timings.diagnostics.failureKind) timings.diagnostics.failureKind = 'explanation_quality';
  }
  onProgress('scoring', 'Validating the model score and original evidence...');
  const rawScore = data.overallMatchPercent;
  const registry = sponsorshipSnapshot?.registry;
  data.sponsorshipAssessment = {
    country: nlJob ? 'Netherlands' : '', indRegistered: registry?.found === true ? true : null,
    kmEligible: registry?.found === true, registryMatchedName: registry?.matchedName || null,
    registryConfidence: registry?.confidence || null,
  };
  const jobSchemaErrors = validateJobAnalysisShape(parsed.jobAnalysis);
  if (jobSchemaErrors.length) {
    timings.diagnostics.jobAnalysisSchemaErrors = jobSchemaErrors;
    if (!timings.diagnostics.failureKind) timings.diagnostics.failureKind = 'job_analysis_incomplete';
  }
  data.jobAnalysis = analyzeJobRequirements(jdData, { ...parsed.jobAnalysis, schemaVersion: JOB_ANALYSIS_SCHEMA_VERSION }, null,
    modelConfig.analysisLanguage);
  data.jobAnalysis.schemaValid = jobSchemaErrors.length === 0;
  timings.diagnostics.responsibilities = data.jobAnalysis.responsibilityDiagnostics;
  timings.diagnostics.jdEvidenceFailures = data.jobAnalysis.evidenceDiagnostics;

  onProgress('complete', 'Analysis complete.');
  timings.diagnostics.stage = triggers.length || jobSchemaErrors.length || explanationQuality.status === 'review'
    ? 'completed_with_warnings' : 'complete';
  timings.totalMs = Date.now() - startedAt;
  return wrapWithMetadata(data, modelConfig, triggers, rawScore, jdData, scoringProfile, timings);
}

function wrapWithMetadata(data, modelConfig, triggers, rawScore, jdData = null, scoringProfile = null, timings = null) {
  const effectiveScoringProfile = scoringProfile || buildScoringProfile(modelConfig, true);
  const jobAnalysis = data.jobAnalysis || analyzeJobRequirements(jdData, { schemaVersion: JOB_ANALYSIS_SCHEMA_VERSION });
  const experience = jobAnalysis.experienceRequirements.items.find(item => item.requirementType === 'Mandatory'
    && !['Academic', 'Internship'].includes(item.experienceKind));

  return {
    ...data,
    overallMatchPercent: data.rubric?.version === HOLISTIC_SCORE_VERSION ? data.overallMatchPercent : null,
    jobAnalysis,
    metadata: {
      analysisTimestamp: new Date().toISOString(),
      analysisLanguage: modelConfig.analysisLanguage || 'en',
      explanationLanguageVerified: data.rubric?.explanationQuality?.languageVerified === true,
      modelUsed: modelConfig.modelId || 'unknown',
      diagnostics: modelConfig.enableDiagnostics === false ? null : timings?.diagnostics || null,
      providerUsed: modelConfig.provider || 'unknown',
      modelKey: `${modelConfig.provider || 'unknown'}::${modelConfig.modelId || 'unknown'}`,
      jdLanguage: jobAnalysis.jdLanguage,
      requiredExperience: experience ? `${experience.minimumYears}${experience.maximumYears === null ? '+' : `-${experience.maximumYears}`}y` : null,
      requiredLanguages: jobAnalysis.requiredLanguages.items.filter(item => ['Mandatory', 'Preferred'].includes(item.requirementType)).map(item => item.language).slice(0, 3),
      jobAnalysisVersion: jobAnalysis.version,
      analysisPreset: effectiveScoringProfile.analysisPreset,
      promptTuningMode: effectiveScoringProfile.promptTuningMode,
      isCustomProfile: effectiveScoringProfile.isCustomProfile === true,
      isNetherlands: isNetherlands(jdData?.location, jdData?.description),
      weightsApplied: data.rubric?.version === HOLISTIC_SCORE_VERSION ? {} : data.rubric?.weights || effectiveScoringProfile.weightsApplied,
      capabilityScoreVersion: data.rubric?.version === HOLISTIC_SCORE_VERSION ? HOLISTIC_SCORE_VERSION : null,
      promptVersion: MATCH_PROMPT_VERSION,
      degradationTriggers: [...new Set(triggers)],
      analysisContractVersion: 'professional-fit-v1',
      rawScoreBeforePenalty: data.rubric ? rawScore : null,
      timing: modelConfig.enableDiagnostics === false ? null : (timings || null),
    },
  };
}

function detectJobLanguage(jdData) {
  const text = `${jdData?.title || ''}\n${jdData?.description || ''}`.trim();
  if (!text) {
    return 'Unknown';
  }

  if (/[\u4e00-\u9fff]/.test(text)) {
    return 'Chinese';
  }

  const scores = [
    { label: 'English', score: countMatches(text, [' the ', ' and ', ' with ', ' for ', ' experience ', ' role ', ' responsibilities ', ' you ', ' your ']) },
    { label: 'Dutch', score: countMatches(text, [' de ', ' het ', ' een ', ' en ', ' van ', ' voor ', ' met ', ' ervaring ', ' werkzaamheden ']) },
    { label: 'German', score: countMatches(text, [' der ', ' die ', ' das ', ' und ', ' mit ', ' fuer ', ' für ', ' erfahrung ', ' aufgaben ']) },
    { label: 'French', score: countMatches(text, [' le ', ' la ', ' les ', ' des ', ' pour ', ' avec ', ' expérience ', ' responsabilit' ]) },
    { label: 'Spanish', score: countMatches(text, [' el ', ' la ', ' los ', ' para ', ' con ', ' experiencia ', ' responsabilidades ']) },
  ];

  scores.sort((a, b) => b.score - a.score);
  return scores[0].score > 0 ? scores[0].label : 'English';
}

function countMatches(text, patterns) {
  const normalized = ` ${text.toLowerCase()} `;
  return patterns.reduce((sum, pattern) => sum + (normalized.includes(pattern) ? 1 : 0), 0);
}

function extractRequiredExperience(jdData) {
  const text = `${jdData?.title || ''}\n${jdData?.description || ''}`;
  if (!text.trim()) {
    return null;
  }

  const patterns = [
    /(\d+)\s*\+?\s*(?:to|-)\s*(\d+)\s+years?/i,
    /minimum of\s+(\d+)\s+years?/i,
    /at least\s+(\d+)\s+years?/i,
    /(\d+)\+?\s+years?\s+of\s+experience/i,
    /(\d+)\+?\s+years?\s+experience/i,
    /(\d+)\s+years?\s+relevant experience/i,
    /(\d+)\s+yrs?\s+experience/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    if (match[2]) {
      return `${match[1]}-${match[2]}y`;
    }

    return `${match[1]}y+`;
  }

  if (/\bintern(ship)?\b/i.test(text) || /\bgraduate\b/i.test(text) || /\bentry level\b/i.test(text)) {
    return '0-1y';
  }

  return null;
}

function extractRequiredLanguages(jdData) {
  const text = `${jdData?.title || ''}\n${jdData?.description || ''}`.toLowerCase();
  if (!text.trim()) {
    return [];
  }

  const languagePatterns = [
    { label: 'English', patterns: [/\benglish\b/, /\bfluent in english\b/, /\bprofessional english\b/] },
    { label: 'Dutch', patterns: [/\bdutch\b/, /\bnederlands\b/] },
    { label: 'German', patterns: [/\bgerman\b/, /\bdeutsch\b/] },
    { label: 'French', patterns: [/\bfrench\b/, /\bfrancais\b/, /\bfrançais\b/] },
    { label: 'Spanish', patterns: [/\bspanish\b/, /\bespanol\b/, /\bespañol\b/] },
    { label: 'Italian', patterns: [/\bitalian\b/, /\bitaliano\b/] },
    { label: 'Portuguese', patterns: [/\bportuguese\b/, /\bportugues\b/, /\bportuguês\b/] },
    { label: 'Chinese', patterns: [/\bchinese\b/, /\bmandarin\b/, /\bcantonese\b/] },
    { label: 'Japanese', patterns: [/\bjapanese\b/] },
  ];

  const matches = [];
  for (const candidate of languagePatterns) {
    if (candidate.patterns.some(pattern => pattern.test(text))) {
      matches.push(candidate.label);
    }
  }

  return matches.slice(0, 3);
}

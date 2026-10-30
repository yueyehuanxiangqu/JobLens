// Explicit allowlist: copied reports must not include keys, resumes, JDs, or raw responses.
export function buildDiagnosticReport(meta = {}) {
  const d = meta.diagnostics || {};
  const triggers = meta.degradationTriggers || [];
  const status = d.httpStatus;
  let nextStep = 'No request failure recorded. Check evidence and scoring settings if the score is unexpected.';
  if (!meta.diagnostics) nextStep = 'This older result has limited diagnostics. Re-analyze the job with the current version.';
  else if (d.stage === 'input') nextStep = 'Check that the job description and resume were read successfully.';
  else if (d.failureKind === 'timeout') {
    nextStep = status
      ? 'The provider returned a timeout. Retry later or test a faster model.'
      : 'The extension reached its local timeout before a complete usable response. Increase the request timeout or test a faster model.';
  }
  else if (d.failureKind === 'schema_degraded') nextStep = 'Some evidence rows could not be verified exactly. They were treated as unknown; review schema errors or re-analyze if needed.';
  else if (d.failureKind === 'explanation_quality') nextStep = 'The capability score and source evidence were validated. Review the explanation wording or language; re-analyze only if a clearer explanation is needed.';
  else if (d.failureKind === 'job_analysis_incomplete') nextStep = 'The capability score remains available. Some JD metadata fields were missing or invalid; review job analysis schema errors.';
  else if (d.retryFailure === 'timeout') nextStep = 'The JSON retry reached its timeout. Try a faster model or increase the timeout.';
  else if (d.failureKind === 'truncated_output' || triggers.includes('MODEL_TRUNCATED') && !meta.capabilityScoreVersion) nextStep = 'The model reached its output limit. Increase max tokens and re-analyze; no new score was calculated.';
  else if (d.failureKind === 'empty_output') nextStep = 'The provider returned no text content. Check model access or try again later; no score was calculated.';
  else if (d.failureKind === 'invalid_json') nextStep = 'The response contained text but was not valid JSON. Review JSON parse attempts; no score was calculated.';
  else if ([401, 403].includes(status)) nextStep = 'Verify this provider’s API key, access permissions, and saved settings.';
  else if (status === 429) nextStep = 'Check the provider’s rate limit, quota, or balance; retry later.';
  else if (status === 400 || status === 404) nextStep = 'Check the saved provider URL, exact model ID, and supported request parameters.';
  else if (status >= 500) nextStep = 'The provider reported a server error. Retry later.';
  else if (d.stage === 'request') nextStep = 'Test the selected model; check provider access, saved settings, network, and output limit.';
  else if (d.stage === 'json') nextStep = 'The response was not usable JSON. Review JSON parse attempts and the response format.';
  else if (triggers.includes('MODEL_FIELD_MISSING')) nextStep = 'The model did not follow the scoring schema. Review schema errors; test another model.';
  return {
    version: d.extensionVersion || 'Legacy result',
    analyzedAt: meta.analysisTimestamp || null,
    provider: meta.providerUsed || null,
    requestedModel: meta.modelUsed || null,
    returnedModel: d.resolvedModel || null,
    endpoint: d.endpoint || null,
    protocol: d.protocol || null,
    stage: d.stage || 'Unknown (legacy result)',
    failureKind: d.failureKind || null,
    timeoutSource: d.failureKind === 'timeout' ? (status ? 'provider' : 'extension') : null,
    httpStatus: status || null,
    retryFailure: d.retryFailure || null,
    retryHttpStatus: d.retryHttpStatus || null,
    analysisMode: meta.analysisPreset || null,
    customProfile: meta.isCustomProfile ?? null,
    rawScore: meta.rawScoreBeforePenalty ?? null,
    extractMs: meta.timing?.extractMs ?? null,
    finishReason: d.finishReason || null,
    jdCharacters: d.jdCharacters ?? null,
    resumeCharacters: d.resumeCharacters ?? null,
    responseCharacters: d.responseCharacters ?? null,
    maxTokens: d.maxTokens ?? null,
    timeoutMs: d.timeoutMs ?? null,
    configuredRetries: d.configuredRetries ?? null,
    responseFormat: d.responseFormat || null,
    retryReason: d.retryReason || null,
    jsonAttempts: (Array.isArray(d.jsonAttempts) ? d.jsonAttempts : []).map(item => ({
      attempt: item.attempt, finishReason: item.finishReason, responseCharacters: item.responseCharacters,
      wrapper: item.wrapper, outcome: item.outcome, code: item.code,
      position: item.position ?? null, line: item.line ?? null, column: item.column ?? null,
    })),
    parseRetryUsed: meta.timing?.usedRetry ?? null,
    totalMs: meta.timing?.totalMs ?? null,
    llmMs: meta.timing?.llmMs ?? null,
    promptVersion: meta.promptVersion || null,
    analysisContractVersion: meta.analysisContractVersion || null,
    triggers,
    schemaErrors: d.schemaErrors || [],
    jobAnalysisSchemaErrors: d.jobAnalysisSchemaErrors || [],
    explanationIssues: d.explanationIssues || [],
    responsibilities: d.responsibilities || null,
    jdEvidenceFailures: d.jdEvidenceFailures || null,
    nextStep,
  };
}

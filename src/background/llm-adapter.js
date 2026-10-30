import { validateProviderRequest } from '../shared/provider-profiles.js';
import { safeParseJSON, responseText } from '../shared/schema-validator.js';
import { RUBRIC_VERSION, scoreEvidence } from '../shared/evidence-scoring.js';

const POE_MODEL_ALIASES = new Map([
  ['gemini-2.5-flash-lite', 'Gemini-2.5-Flash-Lite'],
  ['gemini-2.5-flash', 'Gemini-2.5-Flash'],
  ['gemini-2.5-pro', 'Gemini-2.5-Pro'],
  ['gemini-2.0-flash-lite', 'Gemini-2.0-Flash-Lite'],
  ['gpt-4.1', 'GPT-4.1'],
  ['gpt-4.1-mini', 'GPT-4.1-Mini'],
  ['gpt-5', 'GPT-5'],
  ['claude-3.7-sonnet', 'Claude-3.7-Sonnet'],
]);

const MATRIX_TEST_JD = Object.freeze({
  title: 'SQL reporting analyst',
  company: 'Compatibility test',
  location: 'Remote',
  description: 'The role requires SQL reporting.',
});
const MATRIX_TEST_RESUME = 'Built SQL reports for finance teams.';
const MATRIX_TEST_PROFILE = Object.freeze({
  promptTuningMode: 'balanced',
  weightsApplied: Object.freeze({ 'Skills & Experience Relevance': 1 }),
});

const MATRIX_TEST_SYSTEM_PROMPT = `You are testing compatibility with an evidence-based job matching contract.
Return exactly one valid JSON object and nothing else. Do not use markdown.
The application will validate every quotation mechanically. Copy each quote as a contiguous substring from the exact source text. Preserve spelling, capitalization, punctuation, and word order. Do not paraphrase, translate, summarize, add labels, or use ellipses.
Use this exact shape:
{"rubricVersion":"${RUBRIC_VERSION}","extractionComplete":true,"requirements":[{"dimension":"Skills & Experience Relevance","importance":"required","jdQuote":"The role requires SQL reporting.","resumeQuotes":["Built SQL reports for finance teams."],"status":"met","hard":true,"reason":"The resume directly documents SQL reporting work."}]}
The test must contain one requirement row. Use status "unknown" and an empty resumeQuotes array only when the resume has no exact evidence. Return the JSON object now.`;

const MATRIX_TEST_USER_PROMPT = `<job-description-data>
${MATRIX_TEST_JD.description}
</job-description-data>
<resume-data>
${MATRIX_TEST_RESUME}
</resume-data>
Return the one evidence matrix JSON object. Verify both quotes are exact substrings before responding.`;

export async function callLLM(config, { systemPrompt, userPrompt, responseSchema }) {
  validateProviderRequest(config);
  const {
    provider,
    baseUrl,
    apiKey,
    modelId,
    maxTokens,
    temperature,
    timeoutMs,
    maxRetries = 0,
  } = config;

  let lastError = null;
  const modelCandidates = provider === 'poe'
    ? buildPoeModelCandidates(modelId)
    : [modelId];

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    for (const candidateModel of modelCandidates) {
      let timeoutId;
      try {
        if (attempt > 0) {
          await sleep(attempt === 1 ? 1000 : 3000);
        }

        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), timeoutMs || 60000);

        let response;
        if (provider === 'anthropic' || config.protocol === 'anthropic') {
          response = await callAnthropic(
            baseUrl,
            apiKey,
            candidateModel,
            systemPrompt,
            userPrompt,
            maxTokens,
            temperature,
            controller.signal,
          );
        } else {
          response = await callOpenAICompatible(
            provider,
            baseUrl,
            apiKey,
            candidateModel,
            systemPrompt,
            userPrompt,
            maxTokens,
            temperature,
            controller.signal,
            responseSchema,
          );
        }

        response.content = responseText(response.content);
        if (!response.content.trim() && !['length', 'max_tokens'].includes(response.finishReason)) {
          const error = new Error('Model returned empty content.');
          error.code = 'EMPTY_MODEL_OUTPUT';
          error.finishReason = response.finishReason;
          error.resolvedModel = response.resolvedModel;
          throw error;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (error.code === 'EMPTY_MODEL_OUTPUT') throw error;

        if (error.name === 'AbortError') {
          lastError = new Error(`LLM request timed out (${timeoutMs}ms).`);
        }

        if (error.status === 401 || error.status === 403) {
          const authError = new Error(`API authentication failed (${error.status}). Please verify the API key.`);
          authError.status = error.status;
          throw authError;
        }

        const isRetryablePoe404 = provider === 'poe'
          && error.status === 404
          && candidateModel !== modelCandidates[modelCandidates.length - 1];

        if (isRetryablePoe404) {
          continue;
        }
        if (error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }
  }

  if (provider === 'poe' && lastError?.status === 404) {
    throw new Error(
      `Poe returned 404. The base URL looks fine, so the model name is likely invalid. Try an official Poe model ID such as "${modelCandidates[modelCandidates.length - 1]}".`
    );
  }

  throw lastError || new Error('LLM request failed after exhausting retries.');
}

async function callOpenAICompatible(provider, baseUrl, apiKey, modelId, systemPrompt, userPrompt, maxTokens, temperature, signal, responseSchema) {
  const endpoint = resolveEndpoint(provider, baseUrl);
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'chrome-extension://linkedin-job-match';
    headers['X-Title'] = 'LinkedIn Job Match';
  }

  const body = {
    model: modelId,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: maxTokens,
    temperature,
  };

  if (provider === 'openai' && /^(gpt-5|o[134])(?:-|$)/.test(modelId)) {
    body.max_completion_tokens = maxTokens;
    delete body.max_tokens;
    delete body.temperature;
  }

  if (provider !== 'poe' && provider !== 'gemini') {
    body.response_format = { type: 'json_object' };
  }
  // Google's OpenAI compatibility API supports json_schema. Other providers
  // keep their existing request format; no provider/model configuration changes.
  if (provider === 'gemini' && responseSchema) {
    body.response_format = { type: 'json_schema', json_schema: { name: 'capability_match', schema: responseSchema } };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    const error = new Error(`LLM API error ${response.status}: ${errorText.replaceAll(apiKey, '[redacted]').slice(0, 200)}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  if (data.error) throw new Error(`Provider returned an error: ${String(data.error.message || 'Unknown provider error').slice(0, 200).replaceAll(apiKey, '[redacted]')}`);
  const choice = data.choices?.[0];

  return {
    content: choice?.message?.content || '',
    finishReason: choice?.finish_reason || 'unknown',
    usage: data.usage || null,
    resolvedModel: data.model || modelId,
    responseFormat: body.response_format?.type || 'text',
  };
}

async function callAnthropic(baseUrl, apiKey, modelId, systemPrompt, userPrompt, maxTokens, temperature, signal) {
  const endpoint = resolveEndpoint('anthropic', baseUrl);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: modelId,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: maxTokens,
      temperature,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    const error = new Error(`Anthropic API error ${response.status}: ${errorText.replaceAll(apiKey, '[redacted]').slice(0, 200)}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  return {
    content: (data.content || []).filter(block => block.type === 'text').map(block => block.text || '').join('\n'),
    finishReason: data.stop_reason || 'unknown',
    usage: data.usage || null,
    resolvedModel: data.model || modelId,
  };
}

export function resolveEndpoint(provider, baseUrl) {
  const base = baseUrl.replace(/\/+$/, '');
  if (provider === 'anthropic') {
    if (base.endsWith('/messages')) return base;
    return base + (base.endsWith('/v1') ? '/messages' : '/v1/messages');
  }
  if (base.endsWith('/chat/completions')) return base;
  if (/\/v\d+(?:beta)?$/.test(base) || base.endsWith('/openai')) return base + '/chat/completions';
  return base + (provider === 'openrouter' ? '/api/v1/chat/completions' : '/v1/chat/completions');
}

export async function testModelConnection(config) {
  const response = await callLLM({
    ...config,
    maxTokens: Math.min(Math.max(config.maxTokens || 1024, 1024), 4096),
    timeoutMs: Math.min(config.timeoutMs || 60000, 60000),
    maxRetries: 0,
  }, {
    systemPrompt: MATRIX_TEST_SYSTEM_PROMPT,
    userPrompt: MATRIX_TEST_USER_PROMPT,
  });
  if (['length', 'max_tokens'].includes(response.finishReason)) {
    throw new Error('Connection reached the model, but the evidence matrix test was truncated. Try a larger output limit or another model.');
  }

  try {
    const parsed = safeParseJSON(response.content);
    scoreEvidence(parsed, MATRIX_TEST_JD, MATRIX_TEST_RESUME, MATRIX_TEST_PROFILE);
    if (parsed.requirements.length !== 1 || parsed.requirements[0].status === 'unknown') {
      throw new Error('The compatibility response did not contain usable direct evidence.');
    }
  } catch {
    throw new Error('Connection reached the model, but the evidence matrix test failed. Try another model or check its structured-output support.');
  }
  return { model: config.modelId, resolvedModel: response.resolvedModel, preview: 'Evidence matrix test passed. Save settings to use this configuration.' };
}

function buildPoeModelCandidates(modelId) {
  const trimmed = (modelId || '').trim();
  if (!trimmed) {
    return ['GPT-4.1'];
  }

  const candidates = new Set([trimmed]);
  const alias = POE_MODEL_ALIASES.get(trimmed.toLowerCase());
  if (alias) {
    candidates.add(alias);
  }

  const titleCaseGuess = trimmed
    .split('-')
    .map(part => {
      if (/^\d+(\.\d+)?$/.test(part)) {
        return part;
      }
      if (part.length <= 3 && /\d/.test(part)) {
        return part.toUpperCase();
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('-')
    .replace(/\bGpt\b/g, 'GPT')
    .replace(/\bClaude\b/g, 'Claude')
    .replace(/\bGemini\b/g, 'Gemini');

  candidates.add(titleCaseGuess);
  return [...candidates];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

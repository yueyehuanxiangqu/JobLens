import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProviderConfig, createProviderProfile, validateProviderRequest } from '../src/shared/provider-profiles.js';
import { loadConfig, saveConfig } from '../src/background/config-manager.js';
import { callLLM, resolveEndpoint, testModelConnection } from '../src/background/llm-adapter.js';

const request = { provider: 'openrouter', baseUrl: 'https://openrouter.ai', apiKey: 'test-only-key', modelId: 'vendor/model', maxTokens: 4096, temperature: 0, timeoutMs: 1000, maxRetries: 0 };
const prompts = { systemPrompt: 'Return JSON.', userPrompt: 'Test.' };
const validMatrixResponse = JSON.stringify({
  rubricVersion: 'evidence-v1',
  extractionComplete: true,
  requirements: [{
    dimension: 'Skills & Experience Relevance',
    importance: 'required',
    jdQuote: 'The role requires SQL reporting.',
    resumeQuote: 'Built SQL reports for finance teams.',
    status: 'met',
    hard: true,
    reason: 'The resume directly documents SQL reporting work.',
  }],
});
const response = (content, extra = {}) => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], ...extra }), { status: 200 });

test('legacy active model is preserved, injected GPT removed from OpenRouter only', () => {
  const c = normalizeProviderConfig({ provider: 'openrouter', providerProfiles: {
    openrouter: { ...request, modelIds: ['gpt-5-mini', 'vendor/old', 'vendor/model'] },
    gemini: { modelId: 'gemini-user', modelIds: ['gemini-user'], apiKey: 'gemini-key' },
  } });
  assert.equal(c.modelId, 'vendor/model');
  assert.deepEqual(c.modelIds, ['vendor/old', 'vendor/model']);
  assert.equal(c.apiKey, 'test-only-key');
  assert.equal(c.providerProfiles.gemini.apiKey, 'gemini-key');
  assert.deepEqual(normalizeProviderConfig(c), c);
});

test('v0.1.2 flat settings migrate only into their original provider', () => {
  const c = normalizeProviderConfig({ ...request, modelId: 'vendor/legacy' });
  assert.equal(c.modelId, 'vendor/legacy');
  assert.equal(c.providerProfiles.gemini.apiKey, '');
  assert.equal(c.providerProfiles.openai.apiKey, '');
  assert.equal(createProviderProfile('openrouter').modelId, '');
});

test('legacy gpt-4o is not reintroduced during migration', () => {
  const c = normalizeProviderConfig({
    provider: 'openrouter',
    modelId: 'gpt-4o',
    modelIds: ['gpt-4o', 'vendor/kept'],
  });
  assert.equal(c.modelId, 'vendor/kept');
  assert.deepEqual(c.modelIds, ['vendor/kept']);
});

test('explicit empty lists and deleted starters do not resurrect after switching', () => {
  let c = normalizeProviderConfig({ provider: 'gemini', providerProfiles: { gemini: { modelIds: [], modelId: '' } } });
  assert.equal(c.modelId, '');
  c = normalizeProviderConfig({ ...c, provider: 'openrouter' });
  c = normalizeProviderConfig({ ...c, provider: 'gemini' });
  assert.deepEqual(c.modelIds, []);
  assert.equal(c.modelId, '');
});

test('multiple custom providers persist independently and ignore hostile ids', () => {
  let c = normalizeProviderConfig({ provider: 'custom_one', providerDefinitions: [
    { id: 'custom_one', name: 'One', baseUrl: 'https://one.example/v1' },
    { id: 'custom_two', name: 'Two', baseUrl: 'https://two.example', protocol: 'anthropic' },
    { id: '__proto__', name: 'Invalid' },
  ], providerProfiles: {
    custom_one: { modelId: 'model-one', modelIds: ['model-one'], apiKey: 'key-one' },
    custom_two: { modelId: 'model-two', modelIds: ['model-two'], apiKey: 'key-two' },
  } });
  c = normalizeProviderConfig({ ...c, provider: 'custom_two' });
  assert.equal(c.modelId, 'model-two');
  assert.equal(c.apiKey, 'key-two');
  assert.equal(c.protocol, 'anthropic');
  assert.equal(c.providerDefinitions.length, 8);
  assert.equal(c.providerProfiles.custom_one.apiKey, 'key-one');
});

test('save/load is profile-authoritative, backs up old settings once, preserves unrelated storage', async () => {
  const legacy = { ...request, modelId: 'vendor/legacy' };
  const store = { ljm_config: structuredClone(legacy), resume: { text: 'kept' }, history: [{ score: 0 }] };
  globalThis.chrome = { storage: { local: {
    get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, structuredClone(store[k])])),
    set: async update => Object.assign(store, structuredClone(update)),
  } } };
  let c = await loadConfig();
  c.providerProfiles.openrouter.modelIds = ['vendor/first', 'vendor/selected'];
  c.providerProfiles.openrouter.modelId = 'vendor/selected';
  c.modelId = 'gpt-5-mini'; // stale flat field must not overwrite profile selection
  await saveConfig(c);
  c = await loadConfig();
  assert.equal(c.modelId, 'vendor/selected');
  assert.deepEqual(store.ljm_config_before_v060, legacy);
  await saveConfig(c);
  assert.deepEqual(store.ljm_config_before_v060, legacy);
  assert.deepEqual(store.resume, { text: 'kept' });
  assert.deepEqual(store.history, [{ score: 0 }]);
});

test('endpoints accept root, version base, and full URL without duplicate paths', () => {
  for (const base of ['https://openrouter.ai', 'https://openrouter.ai/api/v1', 'https://openrouter.ai/api/v1/chat/completions/']) {
    assert.equal(resolveEndpoint('openrouter', base), 'https://openrouter.ai/api/v1/chat/completions');
  }
  assert.equal(resolveEndpoint('gemini', 'https://generativelanguage.googleapis.com/v1beta/openai/'), 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  assert.equal(resolveEndpoint('custom_one', 'https://one.example/v1'), 'https://one.example/v1/chat/completions');
  assert.equal(resolveEndpoint('anthropic', 'https://two.example/v1'), 'https://two.example/v1/messages');
});

test('test and analysis use the same selected endpoint/model/auth; no fallback to GPT', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, ...init, body: JSON.parse(init.body) });
    return response(validMatrixResponse);
  });
  await testModelConnection(request);
  await callLLM(request, prompts);
  for (const c of calls) {
    assert.equal(c.url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(c.body.model, request.modelId);
    assert.equal(c.headers.Authorization, 'Bearer test-only-key');
    assert.equal(c.body.temperature, 0);
  }
});

test('test rejects empty, prose, wrong schema, and truncated replies', async t => {
  const replies = [response(''), response('OK'), response('{"role":"assistant","content":"OK"}'), response(validMatrixResponse, { choices: [{ message: { content: validMatrixResponse }, finish_reason: 'length' }] })];
  t.mock.method(globalThis, 'fetch', async () => replies.shift());
  for (let n = 0; n < 4; n++) await assert.rejects(testModelConnection(request));
});

test('400 surfaces once, redacts credentials, 200 error is not success', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('invalid key test-only-key', { status: 400 }); });
  await assert.rejects(callLLM({ ...request, maxRetries: 2 }, prompts), error => error.message.includes('400') && !error.message.includes(request.apiKey));
  assert.equal(calls, 1);
  t.mock.method(globalThis, 'fetch', async () => response('', { error: { message: 'Upstream failed' } }));
  await assert.rejects(callLLM(request, prompts), /Upstream failed/);
});

test('custom Anthropic uses its own key and endpoint', async t => {
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://two.example/v1/messages');
    assert.equal(init.headers['x-api-key'], request.apiKey);
    assert.equal(JSON.parse(init.body).model, 'my-anthropic-model');
    return new Response(JSON.stringify({ content: [{ type: 'thinking', thinking: 'hidden' }, { type: 'text', text: '{"ok":true}' }], stop_reason: 'end_turn' }));
  });
  assert.equal((await callLLM({ ...request, provider: 'custom_two', protocol: 'anthropic', baseUrl: 'https://two.example/v1', modelId: 'my-anthropic-model' }, prompts)).content, '{"ok":true}');
});

test('request validation rejects unsafe URLs and missing model before network', () => {
  assert.throws(() => validateProviderRequest({ ...request, modelId: '' }), /model/);
  assert.throws(() => validateProviderRequest({ ...request, baseUrl: 'http://remote.example' }), /HTTPS/);
  assert.throws(() => validateProviderRequest({ ...request, baseUrl: 'https://user:pass@example.com' }), /credentials/);
  assert.doesNotThrow(() => validateProviderRequest({ ...request, baseUrl: 'http://localhost:1234/v1' }));
});

import {
  DEFAULT_MODEL_CONFIG,
  LEGACY_MODEL_IDS,
  PROVIDERS,
  PROVIDER_RECOMMENDED_MODELS,
} from './constants.js';

const clean = value => typeof value === 'string' ? value.trim() : '';
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export function getProviderDefinitions(config = {}) {
  const builtins = PROVIDERS.map(provider => ({
    ...provider,
    protocol: provider.id === 'anthropic' ? 'anthropic' : 'openai-compatible',
  }));
  const ids = new Set(builtins.map(provider => provider.id));
  for (const provider of Array.isArray(config.providerDefinitions) ? config.providerDefinitions : []) {
    if (!/^custom_[a-zA-Z0-9-]+$/.test(provider?.id) || ids.has(provider.id) || !clean(provider.name)) continue;
    builtins.push({
      id: provider.id,
      name: clean(provider.name).slice(0, 80),
      baseUrl: clean(provider.baseUrl),
      protocol: provider.protocol === 'anthropic' ? 'anthropic' : 'openai-compatible',
    });
    ids.add(provider.id);
  }
  return builtins;
}

export function createProviderProfile(providerId, config = {}) {
  const definition = getProviderDefinitions(config).find(provider => provider.id === providerId);
  const modelId = PROVIDER_RECOMMENDED_MODELS[providerId] || '';
  return {
    baseUrl: definition?.baseUrl || '',
    protocol: definition?.protocol || 'openai-compatible',
    apiKey: '', modelId, modelIds: modelId ? [modelId] : [],
    maxTokens: DEFAULT_MODEL_CONFIG.maxTokens,
    temperature: DEFAULT_MODEL_CONFIG.temperature,
    timeoutMs: DEFAULT_MODEL_CONFIG.timeoutMs,
    maxRetries: DEFAULT_MODEL_CONFIG.maxRetries,
  };
}

function modelsFrom(value) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\n,]/) : [];
  return [...new Set(list.map(clean).filter(Boolean))];
}

function bounded(value, fallback, min, max, integer = false) {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, integer ? Math.floor(number) : number));
}

// Profiles are authoritative. Flat fields are only imported for pre-profile versions.
export function normalizeProviderConfig(input = {}) {
  const config = object(input);
  const providerDefinitions = getProviderDefinitions(config);
  const provider = providerDefinitions.some(item => item.id === config.provider) ? config.provider : 'openai';
  const profiles = object(config.providerProfiles);
  const providerProfiles = {};
  for (const definition of providerDefinitions) {
    const defaults = createProviderProfile(definition.id, config);
    const hasProfile = own(profiles, definition.id) && profiles[definition.id] && typeof profiles[definition.id] === 'object';
    const legacy = !hasProfile && config.configVersion !== 2 && definition.id === provider;
    const source = hasProfile ? object(profiles[definition.id]) : legacy ? config : {};
    const hasModels = own(source, 'modelIds') || own(source, 'modelId');
    let modelIds = hasModels ? modelsFrom(source.modelIds) : [...defaults.modelIds];
    let modelId = hasModels ? clean(source.modelId) : defaults.modelId;
    // v0.5.0 injected this OpenAI starter into otherwise unrelated providers.
    // Remove only the known bare injected ID; keep all explicit v0.6.0 additions.
    if (config.configVersion !== 2) {
      const legacyIds = new Set([
        PROVIDER_RECOMMENDED_MODELS.openai,
        ...LEGACY_MODEL_IDS,
      ].map(id => id.toLowerCase()));
      if (!['openai', 'custom'].includes(definition.id)) {
        modelIds = modelIds.filter(id => id.toLowerCase() !== PROVIDER_RECOMMENDED_MODELS.openai);
        if (modelId === PROVIDER_RECOMMENDED_MODELS.openai) modelId = '';
      }
      modelIds = modelIds.filter(id => !legacyIds.has(id.toLowerCase()) || (definition.id === 'openai' && id === PROVIDER_RECOMMENDED_MODELS.openai));
      if (LEGACY_MODEL_IDS.some(id => id.toLowerCase() === modelId.toLowerCase())) modelId = '';
    }
    if (modelId && !modelIds.includes(modelId)) modelIds.unshift(modelId);
    if (!modelId) modelId = modelIds[0] || '';
    providerProfiles[definition.id] = {
      ...defaults,
      protocol: definition.protocol,
      baseUrl: own(source, 'baseUrl') ? clean(source.baseUrl) : defaults.baseUrl,
      apiKey: clean(source.apiKey), modelId, modelIds,
      maxTokens: bounded(source.maxTokens, defaults.maxTokens, 128, 131072, true),
      temperature: bounded(source.temperature, defaults.temperature, 0, 2),
      timeoutMs: bounded(source.timeoutMs, defaults.timeoutMs, 1000, 300000, true),
      maxRetries: bounded(source.maxRetries, defaults.maxRetries, 0, 3, true),
    };
  }
  return { ...config, configVersion: 2, providerDefinitions, providerProfiles, provider, ...providerProfiles[provider] };
}

export function validateProviderRequest(config) {
  if (!clean(config.apiKey)) throw new Error('Please provide an API key.');
  if (!clean(config.modelId)) throw new Error('Select or add a model for this provider.');
  let url;
  try { url = new URL(config.baseUrl); } catch { throw new Error('Enter a valid provider Base URL.'); }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('Provider Base URL must use HTTPS (HTTP is allowed only for localhost).');
  }
  if (url.username || url.password || url.search || url.hash) throw new Error('Base URL must not contain credentials, query parameters, or fragments.');
}

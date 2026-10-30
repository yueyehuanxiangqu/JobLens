import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { CacheManager } from '../src/background/cache-manager.js';
import { loadConfig, saveConfig } from '../src/background/config-manager.js';
import { DEFAULT_TITLE_DISPLAY_SETTINGS } from '../src/shared/constants.js';
import { t } from '../src/i18n/index.js';

test('Settings exposes a confirmed bilingual cache reset without whole-storage deletion', () => {
  const html = fs.readFileSync(new URL('../src/sidepanel/index.html', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../src/sidepanel/app.js', import.meta.url), 'utf8');
  const cache = fs.readFileSync(new URL('../src/background/cache-manager.js', import.meta.url), 'utf8');
  const content = fs.readFileSync(new URL('../src/content/index.js', import.meta.url), 'utf8');
  assert.match(html, /id="clear-analysis-cache-btn"[^>]*>Clear Analysis Cache<\/button>/);
  assert.match(app, /window\.confirm\(t\('Clear reusable analysis results\?/);
  assert.match(app, /Actions\.CLEAR_ANALYSIS_CACHE/);
  assert.doesNotMatch(cache, /chrome\.storage\.local\.clear\(/);
  assert.match(content, /changes\.ljm_analysis_cache_generation_v1\) scheduleVisibleScoresRefresh\(\)/);
  assert.equal(t('Clear Analysis Cache', 'zh-CN'), '清除分析缓存');
  assert.equal(t('Analysis cache cleared. Saved history and user data were kept.', 'zh-CN'), '分析缓存已清除；历史记录和用户资料已保留。');
});

test('cache reset invalidates reuse while retaining history and every protected storage key', async () => {
  const protectedData = {
    resumeLibrary: { activeResumeId: 'resume-1', profiles: [{ id: 'resume-1', text: 'CV source' }] },
    persistentResume: { text: 'legacy CV' },
    ljm_config: { provider: 'gemini', apiKey: 'kept-secret', titleDisplaySettings: { visibleSignals: { careerLevel: false } } },
    ljm_config_before_v060: { apiKey: 'old-secret' },
    ljm_locale: 'zh-CN',
    ljm_manual_jobs_v1: [{ manualJobId: 'manual-1', description: 'JD' }],
    ljm_saved_positions_v1: [{ jobId: 'job-1', lastResult: { overallMatchPercent: 91 } }],
    ind_sponsors_cache: { data: ['company'] },
    oauth_future_credentials: { token: 'must-stay' },
  };
  const storage = structuredClone(protectedData);
  globalThis.chrome = { storage: { local: {
    get: async keys => keys === null ? structuredClone(storage) : Array.isArray(keys)
      ? Object.fromEntries(keys.map(key => [key, structuredClone(storage[key])]))
      : { [keys]: structuredClone(storage[keys]) },
    set: async update => Object.assign(storage, structuredClone(update)),
    remove: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key]; },
  } } };
  const context = { resumeHash: 'resume-hash', scoringProfileHash: 'profile-hash', modelKeyHash: 'model-hash', promptVersion: 'v11' };
  const jd = { title: 'Engineer', description: 'Build reliable services with our team.', sourceType: 'linkedin' };
  const original = { overallMatchPercent: 91, metadata: { analysisTimestamp: new Date().toISOString() } };
  await CacheManager.saveResult('job-1', context, jd, original);
  assert.ok(await CacheManager.getEntry('job-1', context, { jdData: jd }));
  assert.equal((await CacheManager.listEntries(context)).length, 1);
  assert.equal(await CacheManager.clearReusableAnalysis(), 1);
  assert.equal(await CacheManager.getEntry('job-1', context, { jdData: jd }), null);
  assert.deepEqual(await CacheManager.getEntries(['job-1'], context), []);
  assert.equal((await CacheManager.listEntries(context))[0].data.overallMatchPercent, 91);
  for (const [key, value] of Object.entries(protectedData)) assert.deepEqual(storage[key], value, key);
  assert.equal(await CacheManager.clearReusableAnalysis(), 0);
  await CacheManager.saveResult('job-1', context, jd, { ...original, overallMatchPercent: 88 });
  assert.equal((await CacheManager.getEntry('job-1', context, { jdData: jd })).data.overallMatchPercent, 88);
  assert.equal(Object.keys(storage).filter(key => key.startsWith('match_result_v3_')).length, 2);
  assert.equal((await CacheManager.listEntries(context))[0].data.overallMatchPercent, 88);
  for (const [key, value] of Object.entries(protectedData)) assert.deepEqual(storage[key], value, key);
});

test('Career Level title preference persists with existing provider settings', async () => {
  const storage = {};
  globalThis.chrome = { storage: { local: {
    get: async keys => Array.isArray(keys) ? Object.fromEntries(keys.map(key => [key, storage[key]])) : { [keys]: storage[keys] },
    set: async update => Object.assign(storage, update),
  } } };
  assert.equal(DEFAULT_TITLE_DISPLAY_SETTINGS.visibleSignals.careerLevel, true);
  await saveConfig({ provider: 'gemini', apiKey: 'kept-secret', titleDisplaySettings: { visibleSignals: { careerLevel: false } } });
  const loaded = await loadConfig();
  assert.equal(loaded.titleDisplaySettings.visibleSignals.careerLevel, false);
  assert.equal(loaded.titleDisplaySettings.visibleSignals.km, true);
  assert.equal(loaded.apiKey, 'kept-secret');
});

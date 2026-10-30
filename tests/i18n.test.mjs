import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { zhCN } from '../src/i18n/catalog.js';
import { getLocale, loadLocale, localizeTree, normalizeLocale, saveLocale, setCurrentLocale, t } from '../src/i18n/index.js';
import { buildMatchingPrompt } from '../src/prompts/prompt-templates.js';
import { buildCacheContext } from '../src/shared/scoring-profile.js';

test('English is the default and only en and zh-CN are accepted', () => {
  assert.equal(normalizeLocale(undefined), 'en');
  assert.equal(normalizeLocale('zh-Hant'), 'en');
  assert.equal(normalizeLocale('zh-CN'), 'zh-CN');
  setCurrentLocale('en');
  assert.equal(t('Settings'), 'Settings');
  assert.equal(t('Settings', 'zh-CN'), '设置');
  assert.equal(t('2/5: Calling the AI model...', 'zh-CN'), '2/5：正在调用 AI 模型…');
});

test('language preference persists without changing resume or model settings', async () => {
  const values = { resumeLibrary: { profiles: [{ id: 'resume-1' }] }, ljm_config: { provider: 'gemini' } };
  globalThis.chrome = { storage: { local: {
    get: async key => ({ [key]: values[key] }),
    set: async update => Object.assign(values, update),
  } } };
  assert.equal(await loadLocale(), 'en');
  assert.equal(await saveLocale('zh-CN'), 'zh-CN');
  setCurrentLocale('en');
  assert.equal(await loadLocale(), 'zh-CN');
  assert.equal(getLocale(), 'zh-CN');
  assert.deepEqual(values.resumeLibrary, { profiles: [{ id: 'resume-1' }] });
  assert.deepEqual(values.ljm_config, { provider: 'gemini' });
  setCurrentLocale('en');
});

test('fixed side-panel HTML copy has a Simplified Chinese translation', () => {
  const html = readFileSync(new URL('../src/sidepanel/index.html', import.meta.url), 'utf8');
  const textNodes = [...html.matchAll(/>([^<>]+)</g)].map(match => match[1].replace(/\s+/g, ' ').trim());
  const attributes = [...html.matchAll(/(?:placeholder|title|aria-label)="([^"]+)"/g)].map(match => match[1].trim());
  const untranslatable = new Set([
    'JobLens', 'LinkedIn', 'Indeed', 'Anthropic', 'KM', 'KEY: SQL', '[SQL]', '✦ SQL',
    'https://example.com/job/123',
    'https://api.openai.com', 'https://api.example.com', 'sk-...', 'provider-model-id',
    '#2563EB', '#7C3AED', '#0F766E', '#B45309', '#BE123C', 'SQL', 'Python', 'Analytics', 'Excel',
  ]);
  const missing = [...new Set([...textNodes, ...attributes])]
    .filter(value => /[A-Za-z]/.test(value) && !untranslatable.has(value) && !zhCN[value]);
  assert.deepEqual(missing, []);
});

test('analysis language changes explanation instruction and cache identity, not evidence source', async () => {
  const jd = { title: 'Junior analyst', company: 'Example', location: 'Amsterdam', description: 'Fluent Dutch required. SQL experience preferred.' };
  const resume = 'Built SQL reports in Amsterdam.';
  const profile = { weightsApplied: { 'Skills & Experience Relevance': 1 } };
  const english = buildMatchingPrompt(jd, resume, true, null, { ...profile, analysisLanguage: 'en' });
  const chinese = buildMatchingPrompt(jd, resume, true, null, { ...profile, analysisLanguage: 'zh-CN' });
  assert.match(english.systemPrompt, /complete sentences in English/);
  assert.match(chinese.systemPrompt, /complete sentences in Simplified Chinese/);
  assert.match(chinese.systemPrompt, /exact original/);
  assert.equal(english.userPrompt, chinese.userPrompt);
  assert.ok(chinese.userPrompt.includes(jd.description));
  assert.ok(chinese.userPrompt.includes(resume));
  const base = { provider: 'gemini', baseUrl: 'https://example.test', modelId: 'model' };
  const enCache = await buildCacheContext({ ...base, analysisLanguage: 'en' }, 'resume-hash', 'v10');
  const zhCache = await buildCacheContext({ ...base, analysisLanguage: 'zh-CN' }, 'resume-hash', 'v10');
  assert.notEqual(enCache.scoringProfileHash, zhCache.scoringProfileHash);
  assert.equal(enCache.resumeHash, zhCache.resumeHash);
});

test('DOM locale switching restores English and preserves exact evidence quotes', () => {
  const element = (tagName, parentElement = null) => ({
    nodeType: 1, tagName, parentElement, children: [], attributes: {},
    hasAttribute(name) { return Object.hasOwn(this.attributes, name); },
    getAttribute(name) { return this.attributes[name]; },
    setAttribute(name, value) { this.attributes[name] = value; },
    closest(selector) { return this.tagName === 'q' && selector.includes('q') ? this : this.parentElement?.closest(selector) || null; },
  });
  const textNode = (value, parentElement) => ({ nodeType: 3, nodeValue: value, parentElement });
  const root = element('div');
  const label = element('span', root);
  const labelText = textNode('Settings', label);
  label.children.push(labelText);
  const quote = element('q', root);
  const quoteText = textNode('Dutch', quote);
  quote.children.push(quoteText);
  root.children.push(label, quote);
  globalThis.NodeFilter = { SHOW_ELEMENT: 1, SHOW_TEXT: 4 };
  globalThis.document = {
    documentElement: { lang: 'en' },
    createTreeWalker(node) {
      const descendants = [];
      const visit = current => { for (const child of current.children || []) { descendants.push(child); visit(child); } };
      visit(node);
      let index = -1;
      return { currentNode: null, nextNode() { this.currentNode = descendants[++index]; return Boolean(this.currentNode); } };
    },
  };
  setCurrentLocale('zh-CN');
  localizeTree(root);
  assert.equal(labelText.nodeValue, '设置');
  assert.equal(quoteText.nodeValue, 'Dutch');
  assert.equal(document.documentElement.lang, 'zh-CN');
  setCurrentLocale('en');
  localizeTree(root);
  assert.equal(labelText.nodeValue, 'Settings');
  assert.equal(quoteText.nodeValue, 'Dutch');
});

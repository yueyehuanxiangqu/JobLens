import { zhCN } from './catalog.js';

export const LOCALE_STORAGE_KEY = 'ljm_locale';
export const DEFAULT_LOCALE = 'en';
export const SUPPORTED_LOCALES = Object.freeze(['en', 'zh-CN']);

let activeLocale = DEFAULT_LOCALE;
const originalText = new WeakMap();
const originalAttributes = new WeakMap();

export function normalizeLocale(value) {
  return SUPPORTED_LOCALES.includes(value) ? value : DEFAULT_LOCALE;
}

export function getLocale() { return activeLocale; }

export async function loadLocale() {
  try {
    const stored = await chrome.storage.local.get(LOCALE_STORAGE_KEY);
    activeLocale = normalizeLocale(stored[LOCALE_STORAGE_KEY]);
  } catch {
    activeLocale = DEFAULT_LOCALE;
  }
  return activeLocale;
}

export async function saveLocale(locale) {
  const normalized = normalizeLocale(locale);
  await chrome.storage.local.set({ [LOCALE_STORAGE_KEY]: normalized });
  activeLocale = normalized;
  return normalized;
}

export function setCurrentLocale(locale) {
  activeLocale = normalizeLocale(locale);
  return activeLocale;
}

const patterns = [
  [/^Page (\d+): Ambiguous PDF reading order; review this page\.$/u,
    page => `第 ${page} 页的 PDF 阅读顺序不确定，请核对原文。`],
  [/^JD: (.+)$/u, (value, locale) => `JD：${t(value, locale)}`],
  [/^Lang: (.+)$/u, (value, locale) => `语言：${value.split(' / ').map(item => t(item, locale)).join(' / ')}`],
  [/^Exp: (.+)$/u, value => `年限：${value}`],
  [/^(\d+)% match$/u, value => `${value}% 匹配`],
  [/^Cached match score: (\d+)%$/u, value => `缓存匹配分数：${value}%`],
  [/^JD keyword matched: (.+)$/u, value => `匹配的 JD 关键词：${value}`],
  [/^(\d+) requirements?$/u, value => `${value} 项要求`],
  [/^(\d+) matched$/u, value => `${value} 项满足`],
  [/^(\d+) partial$/u, value => `${value} 项部分满足`],
  [/^(\d+) transferable$/u, value => `${value} 项可迁移`],
  [/^(\d+) gaps?$/u, value => `${value} 项差距`],
  [/^(\d+) not documented$/u, value => `${value} 项未记录`],
  [/^(\d+) evidence notes? — review the affected rows\.$/u, value => `${value} 条证据说明 — 请检查受影响的行。`],
  [/^Only (\d+)% of weighted requirement evidence is documented\. Treat this score as provisional\.$/u,
    value => `仅记录了 ${value}% 的加权要求证据；请将此分数视为暂定。`],
  [/^Protocol: (.+)$/u, (value, locale) => `协议：${t(value, locale)}`],
  [/^Connected with (.+)\.$/u, value => `已连接模型 ${value}。`],
  [/^Resume library update failed: (.+)$/u, (value, locale) => `简历库更新失败：${t(value, locale)}`],
  [/^Resume parsing failed: (.+)$/u, (value, locale) => `简历解析失败：${t(value, locale)}`],
  [/^Model detection filled the fields(.+)\. Review them before analysis\.$/u,
    confidence => `模型识别已填入字段${confidence}。分析前请检查。`],
  [/^This job has not been analyzed yet\. It was focused on the (.+) page\.$/u,
    site => `此岗位尚未分析；已在 ${site} 页面定位该岗位。`],
  [/^Processing (\d+)\/(\d+): (.+)$/u, (index, total, job) => `正在处理 ${index}/${total}：${job}`],
  [/^(\d+)\/(\d+): (.+)$/u, (index, total, message, locale) => `${index}/${total}：${t(message, locale)}`],
  [/^Analyzing inserted job: (.+)$/u, job => `正在分析手动岗位：${job}`],
  [/^(\d+) experience$/u, value => `${value} 段工作经历`],
  [/^(\d+) education$/u, value => `${value} 项教育经历`],
  [/^(\d+) skills$/u, value => `${value} 项技能`],
  [/^(\d+) saved (.+) positions\.$/u, (count, site) => `${count} 个已收藏的 ${site} 岗位。`],
  [/^(\d+) analyzed (.+) jobs for the current resume\.$/u,
    (count, site) => `当前简历已分析 ${count} 个 ${site} 岗位。`],
  [/^Saved on (.+)$/u, time => `收藏于 ${time}`],
  [/^Analyzed on (.+)$/u, time => `分析于 ${time}`],
  [/^No saved (.+) positions yet\.$/u, site => `尚未收藏 ${site} 岗位。`],
  [/^No (.+) history yet for the current resume\.$/u, site => `当前简历暂无 ${site} 分析历史。`],
  [/^(\d+)% weight$/u, weight => `${weight}% 权重`],
  [/^(.+) score$/u, (dimension, locale) => `${t(dimension, locale)} 分数`],
  [/^Invalid requirement evidence at row (\d+); row ignored\.$/u, index => `第 ${index} 行岗位要求证据无效，已忽略。`],
  [/^Unknown status at row (\d+); treated as unknown\.$/u, index => `第 ${index} 行状态未知，按未知处理。`],
  [/^Reason missing at row (\d+); treated as unknown\.$/u, index => `第 ${index} 行缺少解释，按未知处理。`],
  [/^Hard-condition flag invalid at row (\d+); treated as false\.$/u, index => `第 ${index} 行硬性条件标记无效，按否处理。`],
  [/^Hard condition at row (\d+) was not marked required; treated as non-hard\.$/u, index => `第 ${index} 行硬性条件未标为必需，按非硬性条件处理。`],
  [/^JD quotation truncated at row (\d+)\.$/u, index => `第 ${index} 行 JD 引文被截断。`],
  [/^Resume quotation truncated at row (\d+)\.$/u, index => `第 ${index} 行简历引文被截断。`],
  [/^Resume quotations limited to 3 at row (\d+)\.$/u, index => `第 ${index} 行简历引文最多保留三条。`],
  [/^Resume quotation limit exceeded at row (\d+)\.$/u, index => `第 ${index} 行简历引文超出限制。`],
  [/^Reason truncated at row (\d+)\.$/u, index => `第 ${index} 行解释被截断。`],
  [/^JD quotation not found at row (\d+); row ignored\.$/u, index => `第 ${index} 行 JD 引文未找到，已忽略。`],
  [/^Duplicate requirement at row (\d+); row ignored\.$/u, index => `第 ${index} 行重复要求已忽略。`],
  [/^Resume quotation not found at row (\d+)\.$/u, index => `第 ${index} 行简历引文未找到。`],
  [/^Resume evidence missing at row (\d+)\.$/u, index => `第 ${index} 行缺少简历证据。`],
  [/^Sponsorship-related wording: (.+)$/u, value => `担保相关措辞：${value}`],
  [/^Potential restriction: (.+)$/u, value => `潜在限制：${value}`],
  [/^Loaded from cache(?: - (.+))?$/u, time => `从缓存加载${time ? ` · ${time}` : ''}`],
  [/^KEY: (.+)$/u, value => `关键词：${value}`],
  [/^Language detected in the JD: (.+)$/u, (value, locale) => `JD 检测语言：${t(value, locale)}`],
  [/^Required language: (.+)$/u, (value, locale) => `要求语言：${value.split(' / ').map(item => t(item, locale)).join(' / ')}`],
  [/^Experience requirement: (.+)$/u, (value, locale) => `工作年限要求：${t(value, locale)}`],
  [/^Career Level: (.+)$/u, (value, locale) => `职业阶段：${t(value, locale)}`],
  [/^Load more \((\d+) remaining\)$/u, value => `加载更多（剩余 ${value} 个）`],
  [/^(\d+) jobs detected on this page\. (\d+) already have cached results for the current resume\.$/u,
    (jobs, cached) => `本页检测到 ${jobs} 个岗位；当前简历已有 ${cached} 个缓存结果。`],
  [/^Showing cached result for this job(?: from (.+))?\.$/u,
    time => `显示该岗位的缓存结果${time ? `（${time}）` : ''}。`],
  [/^Analyzed (.+)$/u, time => `分析于 ${time}`],
  [/^Open analysis for (.+)$/u, title => `打开 ${title} 的分析`],
  [/^Current total: (.+)$/u, value => `当前合计：${value}`],
  [/^(\d+)\/5 keywords$/u, value => `${value}/5 个关键词`],
];

export function t(source, locale = activeLocale) {
  if (typeof source !== 'string' || normalizeLocale(locale) === 'en') return source;
  const normalized = source.replace(/\s+/g, ' ').trim();
  const exact = zhCN[normalized];
  if (exact) return exact;
  for (const [pattern, format] of patterns) {
    const match = normalized.match(pattern);
    if (match) return format(...match.slice(1), locale);
  }
  return source;
}

export function tf(source, values = {}, locale = activeLocale) {
  return t(source, locale).replace(/\{([a-zA-Z]+)\}/g, (_, key) => String(values[key] ?? ''));
}

const SOURCE_SELECTOR = '[translate="no"], [data-i18n-source], q, .evidence-requirement, .evidence-reason, .insight-list, .job-title, .job-company, .jd-detail-value, .resume-profile-name, .sponsor-conclusion';
const ATTRIBUTES = ['placeholder', 'title', 'aria-label'];

function isSource(element) {
  return Boolean(element?.closest?.(SOURCE_SELECTOR));
}

function localizeTextNode(node) {
  if (isSource(node.parentElement)) return;
  const current = node.nodeValue;
  const previous = originalText.get(node);
  const source = previous?.rendered === current ? previous.source : current;
  const trimmed = source.trim();
  if (!trimmed) return;
  const localized = t(trimmed);
  const result = source.replace(trimmed, localized);
  originalText.set(node, { source, rendered: result });
  if (current !== result) node.nodeValue = result;
}

function localizeAttributes(element) {
  if (isSource(element)) return;
  const originals = originalAttributes.get(element) || {};
  for (const name of ATTRIBUTES) {
    if (!element.hasAttribute(name)) continue;
    const current = element.getAttribute(name);
    const previous = originals[name];
    const source = previous?.rendered === current ? previous.source : current;
    const rendered = t(source);
    originals[name] = { source, rendered };
    if (current !== rendered) element.setAttribute(name, rendered);
  }
  originalAttributes.set(element, originals);
}

export function localizeTree(root = document.body) {
  if (!root) return;
  if (root.nodeType === 3) {
    localizeTextNode(root);
    return;
  }
  if (root.nodeType !== 1) return;
  const element = root;
  if (isSource(element)) return;
  localizeAttributes(element);
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (walker.currentNode.nodeType === 3) localizeTextNode(walker.currentNode);
    else localizeAttributes(walker.currentNode);
  }
  document.documentElement.lang = activeLocale;
}

export function watchLocalizedDOM(root = document.body) {
  localizeTree(root);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') localizeTree(record.target);
      else if (record.type === 'attributes') localizeTree(record.target);
      else for (const node of record.addedNodes) localizeTree(node);
    }
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
  return observer;
}

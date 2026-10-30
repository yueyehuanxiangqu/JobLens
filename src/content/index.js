import {
  detectLinkedInPageMode,
  extractAiJDText,
  extractAiJobData,
  getAiCardCompany,
  getAiCardLocation,
  getAiCardTitle,
  getAiCardTitleTarget,
  getAiDetailBadgeTarget,
  getAiDetailTitleTarget,
  getAiJobIdFromCard,
  getAiJobIdFromDetail,
  getAiListCards,
} from './linkedin-ai-adapter.js';
import {
  INDEED_LIST_TITLE_SELECTOR,
  extractIndeedJDText,
  extractIndeedJobData,
  getIndeedCardCompany,
  getIndeedCardLocation,
  getIndeedCardTitle,
  getIndeedCardTitleTarget,
  getIndeedDetailBadgeTarget,
  getIndeedDetailTitleTarget,
  getIndeedJobIdFromCard,
  getIndeedJobIdFromDetail,
  getIndeedListCards,
  isIndeedPage,
} from './indeed-adapter.js';
import { loadLocale, setCurrentLocale, t } from '../i18n/index.js';
import { JOB_ANALYSIS_VERSION, careerLevelBadgeColor, careerLevelDisplay } from '../shared/career-level-display.js';
import { HOLISTIC_SCORE_VERSION } from '../shared/holistic-match.js';
import { badgeColorsForAccent, badgeToneForCareer, badgeToneForPermit, badgeToneForScore,
  permitBadgeLabel } from '../shared/badge-theme.js';
import { extractLinkedInJDText, LINKEDIN_JD_EXTRACTION_VERSION } from './linkedin-jd-extractor.js';

const Actions = Object.freeze({
  JD_EXTRACTED: 'JD_EXTRACTED',
  JD_EXTRACT_FAILED: 'JD_EXTRACT_FAILED',
  GET_JOB_LIST: 'GET_JOB_LIST',
  FOCUS_JOB: 'FOCUS_JOB',
  INJECT_SCORE: 'INJECT_SCORE',
  REFRESH_SCORES: 'REFRESH_SCORES',
  GET_JD_DATA: 'GET_JD_DATA',
  GET_CACHED_SCORES: 'GET_CACHED_SCORES',
  JD_DATA: 'JD_DATA',
});

const TITLE_SIGNAL_KEYS = Object.freeze({
  KM: 'km',
  JD_LANGUAGE: 'jdLanguage',
  REQUIRED_LANGUAGE: 'requiredLanguage',
  EXPERIENCE: 'experience',
  CAREER_LEVEL: 'careerLevel',
  SPONSORSHIP: 'sponsorship',
  KEYWORD: 'keyword',
});

const TITLE_SIGNAL_ORDER = Object.freeze([
  TITLE_SIGNAL_KEYS.KM,
  TITLE_SIGNAL_KEYS.REQUIRED_LANGUAGE,
  TITLE_SIGNAL_KEYS.CAREER_LEVEL,
]);

const TITLE_COLOR_SCHEMES = Object.freeze({
  default: Object.freeze({
    [TITLE_SIGNAL_KEYS.KM]: '#2563eb',
    [TITLE_SIGNAL_KEYS.JD_LANGUAGE]: '#7c3aed',
    [TITLE_SIGNAL_KEYS.REQUIRED_LANGUAGE]: '#0f766e',
    [TITLE_SIGNAL_KEYS.EXPERIENCE]: '#b45309',
    [TITLE_SIGNAL_KEYS.KEYWORD]: '#be123c',
  }),
  colorblind: Object.freeze({
    [TITLE_SIGNAL_KEYS.KM]: '#0072b2',
    [TITLE_SIGNAL_KEYS.JD_LANGUAGE]: '#d55e00',
    [TITLE_SIGNAL_KEYS.REQUIRED_LANGUAGE]: '#009e73',
    [TITLE_SIGNAL_KEYS.EXPERIENCE]: '#e69f00',
    [TITLE_SIGNAL_KEYS.KEYWORD]: '#cc79a7',
  }),
});

const DEFAULT_TITLE_DISPLAY_SETTINGS = Object.freeze({
  colorScheme: 'default',
  visibleSignals: Object.freeze({
    [TITLE_SIGNAL_KEYS.KM]: true,
    [TITLE_SIGNAL_KEYS.JD_LANGUAGE]: true,
    [TITLE_SIGNAL_KEYS.REQUIRED_LANGUAGE]: true,
    [TITLE_SIGNAL_KEYS.EXPERIENCE]: true,
    [TITLE_SIGNAL_KEYS.CAREER_LEVEL]: true,
    [TITLE_SIGNAL_KEYS.SPONSORSHIP]: true,
    [TITLE_SIGNAL_KEYS.KEYWORD]: false,
  }),
  customColors: Object.freeze({ ...TITLE_COLOR_SCHEMES.default }),
  keywordList: Object.freeze([]),
  keywordStyle: 'tag',
});

const CONTENT_SCRIPT_READY_KEY = '__ljmContentScriptReadyV050__';

const LIST_ITEM_SELECTORS = [
  '.job-card-container',
  '.jobs-search-results__list-item',
  'li[data-occludable-job-id]',
  '.scaffold-layout__list-item',
];
const LIST_ITEM_SELECTOR = LIST_ITEM_SELECTORS.join(', ');
const TITLE_SELECTORS = [
  '.jobs-unified-top-card__job-title',
  '.job-details-jobs-unified-top-card__job-title h1',
  '.job-details-jobs-unified-top-card__job-title',
  '.top-card-layout__title',
  'h1.t-24',
  'h1',
];

const COMPANY_SELECTORS = [
  '.jobs-unified-top-card__company-name a',
  '.jobs-unified-top-card__company-name',
  '.job-details-jobs-unified-top-card__company-name a',
  '.job-details-jobs-unified-top-card__company-name',
  '.job-details-jobs-unified-top-card__primary-description a',
  '.topcard__org-name-link',
];

const LOCATION_SELECTORS = [
  '.jobs-unified-top-card__bullet',
  '.job-details-jobs-unified-top-card__bullet',
  '.jobs-unified-top-card__subtitle-primary-grouping .t-black--light',
  '.job-details-jobs-unified-top-card__primary-description-container .tvm__text',
  '.jobs-unified-top-card__primary-description-without-tagline',
  '.topcard__flavor--bullet',
];

const PRIMARY_DESCRIPTION_SELECTORS = [
  '.job-details-jobs-unified-top-card__primary-description-container',
  '.job-details-jobs-unified-top-card__primary-description',
  '.jobs-unified-top-card__primary-description-container',
  '.jobs-unified-top-card__primary-description-without-tagline',
  '.topcard__flavor-row',
];

const DETAIL_BADGE_SELECTOR = '.jobs-unified-top-card__primary-description-container, .jobs-unified-top-card__content--two-pane, .job-details-jobs-unified-top-card__container, .jobs-unified-top-card, .top-card-layout';
const SELECTED_CARD_SELECTORS = [
  ...LIST_ITEM_SELECTORS.map(selector => `${selector}[aria-current="true"]`),
  '.jobs-search-results__list-item--active',
  '.job-card-container--clickable[aria-pressed="true"]',
];

let lastExtractJobId = null;
let lastExtractedJDText = '';
let lastKnownUrl = window.location.href;
let lastAcceptedJD = null;
let lastConfirmedJDData = null;
let activeSyncJobId = null;
let syncGeneration = 0;
let syncSequence = 0;
let retryTimer = null;
let lastFailureSignature = '';
let scoreRefreshSequence = 0;
let scoreResumeHash = '';
const verifiedScoreEntries = new Map();
const injectedVerifiedJobIds = new Map();

function normalizeHexColor(value, fallback = null) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const candidate = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(candidate)) {
    return candidate;
  }
  if (/^#[0-9a-f]{3}$/.test(candidate)) {
    return `#${candidate.slice(1).split('').map(char => `${char}${char}`).join('')}`;
  }
  return fallback;
}

function normalizeKeywordList(value) {
  const candidates = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\n,]/)
      : [];
  const seen = new Set();
  const keywords = [];

  for (const candidate of candidates) {
    const keyword = String(candidate || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const key = keyword.toLocaleLowerCase();
    if (!keyword || seen.has(key)) {
      continue;
    }
    seen.add(key);
    keywords.push(keyword);
    if (keywords.length >= 5) {
      break;
    }
  }
  return keywords;
}

function normalizeTitleDisplaySettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const colorScheme = source.colorScheme === 'colorblind' || source.colorScheme === 'custom'
    ? source.colorScheme
    : DEFAULT_TITLE_DISPLAY_SETTINGS.colorScheme;
  const customColors = Object.fromEntries(
    Object.keys(DEFAULT_TITLE_DISPLAY_SETTINGS.customColors).map(key => [
      key,
      normalizeHexColor(source.customColors?.[key], DEFAULT_TITLE_DISPLAY_SETTINGS.customColors[key]),
    ]),
  );

  return {
    colorScheme,
    visibleSignals: Object.fromEntries(
      Object.keys(DEFAULT_TITLE_DISPLAY_SETTINGS.visibleSignals).map(key => {
        const configuredValue = source.visibleSignals?.[key];
        const defaultValue = DEFAULT_TITLE_DISPLAY_SETTINGS.visibleSignals[key];
        return [
          key,
          configuredValue === undefined ? defaultValue : configuredValue !== false,
        ];
      }),
    ),
    customColors,
    keywordList: normalizeKeywordList(source.keywordList),
    keywordStyle: ['tag', 'bracket', 'spark'].includes(source.keywordStyle)
      ? source.keywordStyle
      : DEFAULT_TITLE_DISPLAY_SETTINGS.keywordStyle,
  };
}

function getTitleDisplayColors(settings) {
  const normalized = normalizeTitleDisplaySettings(settings);
  return normalized.colorScheme === 'custom'
    ? { ...normalized.customColors }
    : { ...TITLE_COLOR_SCHEMES[normalized.colorScheme] };
}

function findKeywordMatches(text, keywordList) {
  const normalizedText = String(text || '').replace(/\s+/g, ' ').toLocaleLowerCase();
  if (!normalizedText) {
    return [];
  }
  return normalizeKeywordList(keywordList).filter(keyword => (
    normalizedText.includes(keyword.replace(/\s+/g, ' ').toLocaleLowerCase())
  ));
}

function formatKeywordMarker(keyword, style) {
  if (style === 'bracket') {
    return `[${keyword}]`;
  }
  if (style === 'spark') {
    return `✦ ${keyword}`;
  }
  return `KEY: ${keyword}`;
}

function buildTitleBadgeModels(entry, settings) {
  const normalizedSettings = normalizeTitleDisplaySettings(settings);
  const analyzed = entry?.capabilityScoreVersion === HOLISTIC_SCORE_VERSION && typeof entry.score === 'number';
  const career = analyzed
    ? careerLevelDisplay(entry.jobAnalysis?.careerLevel, entry.jobAnalysis?.version) : null;
  const dutchRequired = analyzed && entry?.jobAnalysis?.version === JOB_ANALYSIS_VERSION
    && entry.jobAnalysis.dutchRequirement === 'Mandatory';
  const models = [];
  const values = {
    [TITLE_SIGNAL_KEYS.KM]: entry?.kmEligible ? 'KM Sponsor' : '',
    [TITLE_SIGNAL_KEYS.JD_LANGUAGE]: entry?.jdLanguage && entry.jdLanguage !== 'Unknown'
      ? `JD: ${entry.jdLanguage}`
      : '',
    [TITLE_SIGNAL_KEYS.REQUIRED_LANGUAGE]: dutchRequired ? 'Dutch Required' : '',
    [TITLE_SIGNAL_KEYS.EXPERIENCE]: entry?.requiredExperience ? `Exp: ${entry.requiredExperience}` : '',
    [TITLE_SIGNAL_KEYS.CAREER_LEVEL]: career?.level && career.level !== 'Unknown' ? career.level : '',
  };
  const titles = {
    [TITLE_SIGNAL_KEYS.KM]: 'Employer matched in the IND recognized sponsor register; this vacancy is not confirmed to sponsor.',
    [TITLE_SIGNAL_KEYS.JD_LANGUAGE]: `Language detected in the JD: ${entry?.jdLanguage || 'Unknown'}`,
    [TITLE_SIGNAL_KEYS.REQUIRED_LANGUAGE]: 'Mandatory Dutch requirement verified in this JD.',
    [TITLE_SIGNAL_KEYS.EXPERIENCE]: `Experience requirement: ${entry?.requiredExperience || 'Not detected'}`,
    [TITLE_SIGNAL_KEYS.CAREER_LEVEL]: `Career Level: ${career?.level || 'Unknown'}`,
  };
  const colors = getTitleDisplayColors(normalizedSettings);

  for (const signalKey of TITLE_SIGNAL_ORDER) {
    if (normalizedSettings.visibleSignals[signalKey] === false || !values[signalKey]) {
      continue;
    }
    models.push({
      signalKey,
      label: values[signalKey],
      title: titles[signalKey],
      backgroundColor: signalKey === TITLE_SIGNAL_KEYS.CAREER_LEVEL
        ? careerLevelBadgeColor(career?.tone) : colors[signalKey],
      tone: signalKey === TITLE_SIGNAL_KEYS.CAREER_LEVEL ? badgeToneForCareer(career?.tone)
        : null,
    });
  }

  return models.map(model => ({ ...model, label: t(model.label), title: t(model.title) }));
}

async function bootstrap() {
  await loadLocale();
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.ljm_locale) setCurrentLocale(changes.ljm_locale.newValue);
    if (changes.ljm_locale || changes.ljm_analysis_cache_generation_v1) scheduleVisibleScoresRefresh();
  });
  injectBadgeStyles();
  setupMessageListener();
  setupObservers();
  scheduleVisibleScoresRefresh();
  scheduleCurrentJobSync();
}

function extractFirst(selectors, context = document) {
  for (const selector of selectors) {
    try {
      const element = context.querySelector(selector);
      const text = element?.innerText?.trim();
      if (text) {
        return text;
      }
    } catch {
      // Ignore invalid selectors on LinkedIn experiments.
    }
  }

  return '';
}

const INJECTED_TITLE_BADGE_SELECTOR = [
  '.ai-match-badge',
  '.ai-match-detail-badge',
  '.ai-meta-badge',
  '.ai-sponsor-badge',
  '.ai-detail-meta-badge',
  '.ai-detail-sponsor-badge',
].join(', ');

function readTitleTextWithoutInjectedBadges(element) {
  if (!element) {
    return '';
  }

  const clone = typeof element.cloneNode === 'function' ? element.cloneNode(true) : element;
  clone?.querySelectorAll?.(INJECTED_TITLE_BADGE_SELECTOR).forEach(node => node.remove());
  return String(clone?.innerText || clone?.textContent || element.innerText || element.textContent || '').trim();
}

function extractFirstTitle(selectors, context = document) {
  for (const selector of selectors) {
    try {
      const text = readTitleTextWithoutInjectedBadges(context.querySelector(selector));
      if (text) {
        return text;
      }
    } catch {
      // Ignore invalid selectors on LinkedIn experiments.
    }
  }

  return '';
}

function getPageMode() {
  if (isIndeedPage(document, window.location.href)) {
    return 'indeed';
  }

  return detectLinkedInPageMode(document, window.location.href);
}

function getListCards(mode = getPageMode()) {
  if (mode === 'indeed') {
    return getIndeedListCards(document);
  }

  if (mode === 'ai') {
    return getAiListCards(document);
  }

  return [...document.querySelectorAll(LIST_ITEM_SELECTOR)];
}

function extractJDText(options = {}) {
  if (getPageMode() === 'indeed') {
    return extractIndeedJDText(document);
  }

  if (getPageMode() === 'ai') {
    return extractAiJDText(document, options);
  }
  return extractLinkedInJDText(document, options);
}

function getCurrentJobId() {
  const url = new URL(window.location.href);
  const queryJobId = url.searchParams.get('currentJobId');
  if (queryJobId) {
    return queryJobId;
  }

  const pathMatch = url.pathname.match(/\/jobs\/view\/(\d+)/);
  if (pathMatch) {
    return pathMatch[1];
  }

  const mode = getPageMode();

  if (mode === 'indeed') {
    const detailJobId = getIndeedJobIdFromDetail(document, window.location.href);
    if (detailJobId) {
      return detailJobId;
    }

    const selectedIndeedCard = getIndeedListCards(document).find(card => {
      const link = card.querySelector(INDEED_LIST_TITLE_SELECTOR);
      return link?.getAttribute('aria-current') === 'true'
        || link?.getAttribute('aria-pressed') === 'true';
    });
    const selectedIndeedJobId = getIndeedJobIdFromCard(selectedIndeedCard);
    if (selectedIndeedJobId) {
      return selectedIndeedJobId;
    }
  }

  if (mode === 'ai') {
    const detailJobId = getAiJobIdFromDetail(document);
    if (detailJobId) {
      return detailJobId;
    }

    const selectedAiCard = getAiListCards(document).find(card => (
      card.getAttribute('aria-current') === 'true'
      || card.getAttribute('aria-pressed') === 'true'
    ));
    const selectedAiJobId = getAiJobIdFromCard(selectedAiCard);
    if (selectedAiJobId) {
      return selectedAiJobId;
    }
  }

  for (const selector of SELECTED_CARD_SELECTORS) {
    const selectedCard = document.querySelector(selector);
    if (selectedCard) {
      return getJobIdFromCard(selectedCard);
    }
  }

  return null;
}

function extractJobData() {
  const previous = { previousJobId: lastAcceptedJD?.jobId, previousDescription: lastAcceptedJD?.description };
  if (getPageMode() === 'indeed') {
    return extractIndeedJobData(document, window.location.href);
  }

  if (getPageMode() === 'ai') {
    const extracted = {
      ...extractAiJobData(document, window.location.href, previous),
      url: window.location.href,
      timestamp: new Date().toISOString(),
    };
    return extracted;
  }

  const detailsContainer = document.querySelector(DETAIL_BADGE_SELECTOR);
  const detailHeader = document.querySelector('.job-details-jobs-unified-top-card__container, .jobs-unified-top-card, .top-card-layout')
    || detailsContainer;
  const company = extractCompany(detailHeader || document);
  const location = extractLocation(detailHeader || document, company);
  const jobId = getCurrentJobId();
  const title = extractFirstTitle(TITLE_SELECTORS, detailHeader || document)
    || extractFirstTitle(TITLE_SELECTORS, document);
  const detailLink = detailHeader?.querySelector('.jobs-unified-top-card__job-title a[href*="/jobs/view/"], .job-details-jobs-unified-top-card__job-title a[href*="/jobs/view/"]');
  const detailHref = detailLink?.getAttribute('href') || '';
  const detailJobId = detailHref.match(/\/jobs\/view\/(\d+)/)?.[1]
    || (detailHref ? new URL(detailHref, window.location.origin).searchParams.get('currentJobId') : null);
  const selectedCard = getListCards('classic').find(card => getJobIdFromCard(card) === jobId);
  const jd = extractJDText({ expectedJobId: jobId, detailJobId,
    detailTitle: title, selectedTitle: selectedCard ? getCardTitle(selectedCard, 'classic') : '',
    detailCompany: company, selectedCompany: selectedCard ? getCardCompany(selectedCard, 'classic') : '',
    ...previous });
  return {
    jobId,
    title,
    company,
    location,
    description: jd.text,
    extractionConfidence: jd.confidence,
    extractionStatus: jd.status,
    extractionWarnings: jd.warnings,
    extractionSelector: jd.selector,
    extractionVersion: LINKEDIN_JD_EXTRACTION_VERSION,
    url: window.location.href,
    timestamp: new Date().toISOString(),
  };
}

function extractCompany(context) {
  const directCompany = extractFirst(COMPANY_SELECTORS, context);
  if (directCompany) {
    return directCompany;
  }

  const segments = getPrimaryDescriptionSegments(context);
  return segments[0] || '';
}

function extractLocation(context, company = '') {
  const directLocation = extractFirst(LOCATION_SELECTORS, context);
  if (looksLikeLocation(directLocation)) {
    return cleanLocationText(directLocation);
  }

  const segments = getPrimaryDescriptionSegments(context);
  const normalizedCompany = normalizeInlineText(company);
  for (const segment of segments) {
    const cleaned = cleanLocationText(segment);
    if (!cleaned) {
      continue;
    }
    if (normalizedCompany && normalizeInlineText(cleaned) === normalizedCompany) {
      continue;
    }
    if (looksLikeLocation(cleaned)) {
      return cleaned;
    }
  }

  return '';
}

function getPrimaryDescriptionSegments(context) {
  const combined = extractFirst(PRIMARY_DESCRIPTION_SELECTORS, context);
  if (!combined) {
    return [];
  }

  return combined
    .split(/\n|·|\||•/)
    .map(part => cleanLocationText(part))
    .filter(Boolean);
}

function cleanLocationText(value) {
  return (value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeInlineText(value) {
  return cleanLocationText(value).toLowerCase();
}

function looksLikeLocation(value) {
  const text = normalizeInlineText(value);
  if (!text) {
    return false;
  }

  if (
    /\b(applicants?|clicked apply|week|weeks|day|days|month|months|hour|hours|ago|responses managed|promoted|reposted)\b/.test(text)
  ) {
    return false;
  }

  if (/\b(remote|hybrid|on-site|onsite)\b/.test(text)) {
    return true;
  }

  if (text.includes(',')) {
    return true;
  }

  return /\b(netherlands|nederland|holland|germany|france|belgium|luxembourg|spain|italy|portugal|poland|ireland|uk|united kingdom)\b/.test(text);
}

function getJobIdFromCard(card) {
  const indeedId = getIndeedJobIdFromCard(card);
  if (indeedId) {
    return indeedId;
  }

  const aiId = getAiJobIdFromCard(card);
  if (aiId) {
    return aiId;
  }

  const directId = card.getAttribute('data-occludable-job-id')
    || card.getAttribute('data-job-id')
    || card.dataset.jobId;

  if (directId) {
    return directId;
  }

  const link = card.querySelector('a[href*="/jobs/view/"], a[href*="currentJobId="]');
  if (!link) {
    return null;
  }

  const href = link.getAttribute('href') || '';
  const viewMatch = href.match(/\/jobs\/view\/(\d+)/);
  if (viewMatch) {
    return viewMatch[1];
  }

  const hrefUrl = new URL(href, window.location.origin);
  return hrefUrl.searchParams.get('currentJobId');
}

function getCardTitle(card, mode = getPageMode()) {
  if (mode === 'indeed') {
    return getIndeedCardTitle(card) || 'Unknown Title';
  }

  if (mode === 'ai') {
    return getAiCardTitle(card) || 'Unknown Title';
  }

  const titleElement = card.querySelector('.job-card-list__title, .job-card-container__title, strong, h3, a.job-card-list__title');
  return readTitleTextWithoutInjectedBadges(titleElement).split('\n')[0].trim() || 'Unknown Title';
}

function getCardCompany(card, mode = getPageMode()) {
  if (mode === 'indeed') {
    return getIndeedCardCompany(card);
  }

  if (mode === 'ai') {
    return getAiCardCompany(card);
  }

  const companyElement = card.querySelector('.job-card-container__company-name, .artdeco-entity-lockup__subtitle, .job-card-container__primary-description');
  return companyElement?.innerText?.trim()?.split('\n')[0] || 'Unknown Company';
}

function getCardLocation(card, mode = getPageMode()) {
  if (mode === 'indeed') {
    return getIndeedCardLocation(card);
  }

  if (mode === 'ai') {
    return getAiCardLocation(card);
  }

  return '';
}

function getJobsList() {
  const mode = getPageMode();
  const uniqueJobs = new Map();

  getListCards(mode).forEach(card => {
    const jobId = getJobIdFromCard(card);
    if (!jobId || uniqueJobs.has(jobId)) {
      return;
    }

    uniqueJobs.set(jobId, {
      jobId,
      sourceType: mode === 'indeed' ? 'indeed' : 'linkedin',
      title: getCardTitle(card, mode),
      company: getCardCompany(card, mode),
      location: getCardLocation(card, mode),
    });
  });

  return [...uniqueJobs.values()];
}

function focusJob(jobId) {
  const mode = getPageMode();
  const cards = getListCards(mode);

  for (const card of cards) {
    if (getJobIdFromCard(card) !== jobId) {
      continue;
    }

    const clickable = mode === 'ai'
      ? card
      : mode === 'indeed'
        ? card.querySelector(INDEED_LIST_TITLE_SELECTOR) || card
        : card.querySelector(`a[href*="/jobs/view/${jobId}"], a[href*="currentJobId=${jobId}"]`)
        || card.querySelector('a')
        || card;

    clickable.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Re-activating an already selected card can restart LinkedIn's detail
    // render. The caller still verifies the live JD and Job ID before use.
    if (mode === 'ai' && getCurrentJobId() === jobId && getAiJobIdFromDetail(document) === jobId) return true;
    // Activate now: timers in a hidden page can run after the caller has moved
    // on to another job. Success only acknowledges dispatch, not JD readiness.
    clickable.focus?.();
    return activateClickable(clickable);
  }

  return false;
}

function activateClickable(element) {
  if (!element) {
    return false;
  }

  if (typeof element.click === 'function') {
    element.click();
    return true;
  }

  if (typeof element.dispatchEvent === 'function') {
    element.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
    }));
    return true;
  }

  return false;
}

function injectScoreBadge(jobId, score) {
  const mode = getPageMode();
  const cards = getListCards(mode);

  for (const card of cards) {
    if (getJobIdFromCard(card) !== jobId) {
      continue;
    }

    const anchor = mode === 'ai'
      ? getAiCardTitleTarget(card)
      : mode === 'indeed'
        ? getIndeedCardTitleTarget(card)
        : card.querySelector('.job-card-container__primary-description, .job-card-container__metadata-wrapper, .artdeco-entity-lockup__subtitle')
        || card.querySelector('.job-card-list__title')?.parentElement
        || card;

    let badge = card.querySelector('.ai-match-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'ai-match-badge';
      anchor.appendChild(badge);
    }

    const color = getBadgeColor(score);
    const label = `${Math.round(score)}%`;
    const title = t(`Cached match score: ${Math.round(score)}%`);
    if (badge.dataset.jobId !== jobId) badge.dataset.jobId = jobId;
    if (badge.style.backgroundColor !== color.background) badge.style.backgroundColor = color.background;
    if (badge.style.color !== color.color) badge.style.color = color.color;
    if (badge.style.borderColor !== color.border) badge.style.borderColor = color.border;
    if (badge.textContent !== label) badge.textContent = label;
    if (badge.title !== title) badge.title = title;
    return true;
  }

  return false;
}

function getCardTitleAnchor(card, mode = getPageMode()) {
  if (mode === 'indeed') {
    return getIndeedCardTitleTarget(card);
  }

  if (mode === 'ai') {
    return getAiCardTitleTarget(card);
  }

  return card.querySelector('.job-card-list__title, .job-card-container__title, strong, h3, a.job-card-list__title')
    || card;
}

function injectMetaBadges(jobId, badgeModels) {
  if (!jobId) {
    return false;
  }

  const mode = getPageMode();
  const cards = getListCards(mode);
  for (const card of cards) {
    if (getJobIdFromCard(card) !== jobId) {
      continue;
    }

    const titleAnchor = getCardTitleAnchor(card, mode);
    if (!titleAnchor) return false;
    reconcileMetaBadges(titleAnchor, jobId, badgeModels, '.ai-meta-badge, .ai-sponsor-badge', 'ai-meta-badge');
    return true;
  }

  return false;
}

function reconcileMetaBadges(target, jobId, badgeModels, selector, className) {
  const wanted = (badgeModels || []).filter(model => model?.label);
  const wantedKeys = new Set(wanted.map(model => model.signalKey));
  const existing = [...target.querySelectorAll(selector)];
  existing.forEach(node => {
    if (node.dataset.jobId !== jobId || !wantedKeys.has(node.dataset.signalKey)) node.remove();
  });
  for (const model of wanted) {
    const color = normalizeHexColor(model.backgroundColor, '#6f5b49');
    const palette = model.tone || badgeColorsForAccent(color);
    let badge = existing.find(node => node.isConnected && node.dataset.jobId === jobId
      && node.dataset.signalKey === model.signalKey);
    if (!badge) {
      badge = document.createElement('span');
      badge.className = `${className} ${className}--${model.signalKey}`;
      badge.dataset.jobId = jobId;
      badge.dataset.signalKey = model.signalKey;
      target.appendChild(badge);
    }
    const signature = `${palette.background}:${palette.color}:${palette.border}`;
    if (badge.dataset.color !== signature) {
      badge.dataset.color = signature;
      badge.style.backgroundColor = palette.background;
      badge.style.color = palette.color;
      badge.style.borderColor = palette.border;
    }
    if (badge.textContent !== model.label) badge.textContent = model.label;
    if (badge.title !== (model.title || model.label)) badge.title = model.title || model.label;
  }
}

function injectDetailBadge(jobId, score) {
  if (!jobId || getCurrentJobId() !== jobId) {
    return;
  }

  const mode = getPageMode();
  const target = mode === 'ai'
    ? getAiDetailBadgeTarget(document)
    : mode === 'indeed'
      ? getIndeedDetailBadgeTarget(document)
      : document.querySelector(DETAIL_BADGE_SELECTOR);
  if (!target) {
    return;
  }

  let badge = target.querySelector('.ai-match-detail-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'ai-match-detail-badge';
    target.appendChild(badge);
  }

  const color = getBadgeColor(score);
  const label = `${Math.round(score)}%`;
  if (badge.dataset.jobId !== jobId) badge.dataset.jobId = jobId;
  if (badge.style.backgroundColor !== color.background) badge.style.backgroundColor = color.background;
  if (badge.style.color !== color.color) badge.style.color = color.color;
  if (badge.style.borderColor !== color.border) badge.style.borderColor = color.border;
  if (badge.textContent !== label) badge.textContent = label;
}

function injectDetailMetaBadges(jobId, badgeModels) {
  if (!jobId || getCurrentJobId() !== jobId) {
    return;
  }

  const mode = getPageMode();
  const titleTarget = mode === 'ai'
    ? getAiDetailTitleTarget(document)
    : mode === 'indeed'
      ? getIndeedDetailTitleTarget(document)
      : document.querySelector(TITLE_SELECTORS.join(', '));
  if (!titleTarget) {
    return;
  }

  document.querySelectorAll('.ai-detail-meta-badge, .ai-detail-sponsor-badge').forEach(node => {
    if (!titleTarget.contains(node)) node.remove();
  });
  reconcileMetaBadges(titleTarget, jobId, badgeModels,
    '.ai-detail-meta-badge, .ai-detail-sponsor-badge', 'ai-detail-meta-badge');
}

function clearInjectedScores() {
  document.querySelectorAll('.ai-match-badge, .ai-match-detail-badge, .ai-sponsor-badge, .ai-detail-sponsor-badge, .ai-meta-badge, .ai-detail-meta-badge').forEach(node => node.remove());
}

function getBadgeColor(score) {
  return badgeToneForScore(score);
}

function injectBadgeStyles() {
  document.getElementById('ai-match-badge-styles')?.remove();
  document.getElementById('ai-match-badge-styles-v030')?.remove();
  document.getElementById('ai-match-badge-styles-v040')?.remove();
  if (document.getElementById('ai-match-badge-styles-v050')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'ai-match-badge-styles-v050';
  style.textContent = `
    .ai-match-badge,
    .ai-match-detail-badge,
    .ai-sponsor-badge,
    .ai-detail-sponsor-badge,
    .ai-meta-badge,
    .ai-detail-meta-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid #e2e8f0;
      color: #334155;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.4;
      box-shadow: none;
      margin-left: 8px;
      white-space: normal;
      overflow-wrap: anywhere;
      max-width: min(100%, 24rem);
      vertical-align: middle;
    }

    .ai-match-detail-badge {
      margin-top: 8px;
      width: fit-content;
    }

    .ai-sponsor-badge,
    .ai-detail-sponsor-badge {
      background: #dbeafe;
      color: #1e40af;
      border-color: #bfdbfe;
      padding: 2px 8px;
    }

    .ai-meta-badge,
    .ai-detail-meta-badge {
      padding: 2px 8px;
      box-shadow: none;
    }

    .ai-meta-badge--keyword,
    .ai-detail-meta-badge--keyword {
      letter-spacing: 0.01em;
    }
  `;
  document.head.appendChild(style);
}

async function refreshVisibleScores(requestId = ++scoreRefreshSequence) {
  const jobs = getJobsList();
  const currentJobId = getCurrentJobId();
  const requestGeneration = syncGeneration;
  const currentJDData = lastConfirmedJDData?.jobId === currentJobId ? lastConfirmedJDData : null;
  const jobIds = [...new Set([
    ...jobs.map(job => job.jobId),
    currentJobId,
  ].filter(Boolean))];

  if (!jobIds.length) {
    // LinkedIn can briefly detach both card and detail DOM while switching jobs.
    // A missing identity is not proof that a previously verified cache is invalid.
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: Actions.GET_CACHED_SCORES,
      payload: { jobIds, currentJDData },
    });

    if (requestId !== scoreRefreshSequence || requestGeneration !== syncGeneration
      || getCurrentJobId() !== currentJobId
      || (currentJDData && lastConfirmedJDData !== currentJDData)) return;

    if (!response?.ok) {
      return;
    }

    if (!response.resumeAvailable) {
      verifiedScoreEntries.clear();
      injectedVerifiedJobIds.clear();
      scoreResumeHash = '';
      clearInjectedScores();
      return;
    }

    if (scoreResumeHash && scoreResumeHash !== response.resumeHash) {
      verifiedScoreEntries.clear();
      injectedVerifiedJobIds.clear();
      clearInjectedScores();
    }
    scoreResumeHash = response.resumeHash || '';

    const displaySettings = normalizeTitleDisplaySettings(response.displaySettings);
    const invalidJobIds = new Set(response.invalidJobIds || []);
    const returnedIds = new Set((response.entries || []).map(entry => entry.jobId));
    for (const jobId of invalidJobIds) {
      verifiedScoreEntries.delete(jobId);
      injectedVerifiedJobIds.delete(jobId);
    }
    for (const jobId of verifiedScoreEntries.keys()) {
      if (!returnedIds.has(jobId)) verifiedScoreEntries.delete(jobId);
    }
    const scoreMap = new Map();
    for (const entry of response.entries || []) {
      const previous = verifiedScoreEntries.get(entry.jobId);
      const verified = entry.jdVerified === true || injectedVerifiedJobIds.get(entry.jobId) === response.resumeHash
        || Boolean(previous && previous.jdText === entry.jdText
          && previous.jdExtractionVersion === entry.jdExtractionVersion);
      if (!verified) continue;
      scoreMap.set(entry.jobId, { ...entry, cacheState: entry.jdVerified === true ? 'Valid' : 'Verifying' });
      verifiedScoreEntries.set(entry.jobId, entry);
      injectedVerifiedJobIds.delete(entry.jobId);
    }
    document.querySelectorAll('.ai-match-badge, .ai-sponsor-badge, .ai-meta-badge').forEach(badge => {
      if (!scoreMap.has(badge.dataset.jobId)) {
        badge.remove();
      }
    });

    jobs.forEach(job => {
      const entry = scoreMap.get(job.jobId);
      if (entry && typeof entry.score === 'number') {
        injectScoreBadge(job.jobId, entry.score);
      }
      injectMetaBadges(
        job.jobId,
        buildTitleBadgeModels(entry, displaySettings),
      );
      if (entry?.cacheState === 'Verifying') {
        document.querySelectorAll('.ai-match-badge, .ai-sponsor-badge, .ai-meta-badge').forEach(badge => {
          if (badge.dataset.jobId === job.jobId) badge.title = t('Verifying saved analysis against this JD');
        });
      }
    });

    const currentEntry = currentJobId ? scoreMap.get(currentJobId) : null;
    if (currentEntry) {
      if (typeof currentEntry.score === 'number') {
        injectDetailBadge(currentJobId, currentEntry.score);
      } else document.querySelectorAll('.ai-match-detail-badge').forEach(node => node.remove());
      const detailEntry = { ...currentEntry };
      if (!detailEntry.keywordMatches?.length && displaySettings.keywordList.length) {
        detailEntry.keywordMatches = findKeywordMatches(currentJDData?.description || '', displaySettings.keywordList);
      }
      injectDetailMetaBadges(
        currentJobId,
        buildTitleBadgeModels(detailEntry, displaySettings),
      );
    } else {
      document.querySelectorAll('.ai-match-detail-badge, .ai-detail-sponsor-badge, .ai-detail-meta-badge').forEach(node => node.remove());
    }
  } catch {
    // Ignore background disconnects during extension reloads.
  }
}

function scheduleCurrentJobSync() {
  if (retryTimer !== null) return;
  debouncedSyncCurrentJob();
}

function scheduleVisibleScoresRefresh() {
  debouncedRefreshScores(++scoreRefreshSequence);
}

function setObservedJob(jobId) {
  if (activeSyncJobId === jobId) return false;
  activeSyncJobId = jobId;
  syncGeneration += 1;
  if (retryTimer !== null) window.clearTimeout(retryTimer);
  retryTimer = null;
  lastExtractJobId = null;
  lastExtractedJDText = '';
  lastConfirmedJDData = null;
  lastFailureSignature = '';
  document.querySelectorAll('.ai-match-detail-badge, .ai-detail-sponsor-badge, .ai-detail-meta-badge')
    .forEach(node => { if (node.dataset.jobId !== jobId) node.remove(); });
  return true;
}

function syncCurrentJob(jobId, generation = syncGeneration, retries = 10) {
  if (!jobId || getCurrentJobId() !== jobId || generation !== syncGeneration) {
    return;
  }

  const extracted = { ...extractJobData(), syncGeneration: generation, syncSequence: ++syncSequence };
  if (extracted.jobId === jobId && extracted.description
    && extracted.extractionConfidence !== 'failed') {
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    retryTimer = null;
    const unchanged = !lastFailureSignature
      && lastExtractJobId === jobId && lastExtractedJDText === extracted.description
      && lastConfirmedJDData?.extractionStatus === extracted.extractionStatus
      && lastConfirmedJDData?.extractionVersion === extracted.extractionVersion
      && lastConfirmedJDData?.title === extracted.title
      && lastConfirmedJDData?.company === extracted.company;
    lastExtractJobId = jobId;
    lastExtractedJDText = extracted.description;
    lastAcceptedJD = { jobId, description: extracted.description };
    if (!unchanged) lastConfirmedJDData = extracted;
    lastFailureSignature = '';
    if (unchanged) return lastConfirmedJDData;
    scheduleVisibleScoresRefresh();
    chrome.runtime.sendMessage({
      type: Actions.JD_EXTRACTED,
      payload: extracted,
    }).catch(() => {});
    return extracted;
  }

  if (retries > 0) {
    if (retryTimer === null) retryTimer = window.setTimeout(() => {
      retryTimer = null;
      syncCurrentJob(jobId, generation, retries - 1);
    }, 700);
    return extracted;
  }

  const failureSignature = `${generation}:${jobId}:${extracted.extractionStatus}:${extracted.extractionWarnings?.[0] || ''}`;
  if (lastFailureSignature === failureSignature) return extracted;
  lastFailureSignature = failureSignature;
  chrome.runtime.sendMessage({
    type: Actions.JD_EXTRACT_FAILED,
    payload: {
      jobId,
      syncGeneration: generation,
      syncSequence: extracted.syncSequence,
      error: extracted.extractionWarnings?.[0] || 'Timed out while waiting for the job description region.',
      partialData: extracted,
    },
  }).catch(() => {});
  return extracted;
}

const OWN_BADGES = '.ai-match-badge, .ai-match-detail-badge, .ai-sponsor-badge, .ai-detail-sponsor-badge, .ai-meta-badge, .ai-detail-meta-badge';
const DETAIL_HEADER_AREAS = '.jobs-unified-top-card, .job-details-jobs-unified-top-card__container, .top-card-layout';
const JD_MUTATION_AREAS = '#job-details, .jobs-description__content, .jobs-description-content__text, .jobs-description-details__text, .jobs-unified-description__content, .jobs-box__html-content, article.jobs-description, #jobDescriptionText, [data-testid="jobDescriptionText"], .jobsearch-JobComponent-description, [id*="jobDescription"]';
function ownBadgeNode(node) {
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  return Boolean(element?.matches?.(OWN_BADGES) || element?.closest?.(OWN_BADGES));
}

function relevantPageMutation(record) {
  if (ownBadgeNode(record.target)) return false;
  if (record.type !== 'childList') return true;
  return [...record.addedNodes, ...record.removedNodes].some(node => !ownBadgeNode(node));
}

function jdContentMutation(record, listRoot) {
  const target = record.target?.nodeType === 1 ? record.target : record.target?.parentElement;
  if (target?.closest?.(LIST_ITEM_SELECTOR)
    || (listRoot && (target === listRoot || listRoot.contains(target)))) return false;
  const inJD = Boolean(target?.matches?.(JD_MUTATION_AREAS) || target?.closest?.(JD_MUTATION_AREAS));
  const inHeader = Boolean(target?.matches?.(DETAIL_HEADER_AREAS) || target?.closest?.(DETAIL_HEADER_AREAS));
  if (record.type === 'attributes') {
    if (record.attributeName === 'aria-expanded' || record.attributeName === 'aria-hidden') return inJD;
    return record.attributeName === 'class' && Boolean(inJD
      || /^(?:see more|show more|toon meer|meer weergeven|lees meer)$/iu.test(target?.textContent?.trim() || ''));
  }
  if (inJD || inHeader) return true;
  if (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].some(node =>
    node?.matches?.(`${JD_MUTATION_AREAS}, ${DETAIL_HEADER_AREAS}`)
    || node?.querySelector?.(`${JD_MUTATION_AREAS}, ${DETAIL_HEADER_AREAS}`))) return true;
  // AI Search's JD can be a sequence of unclassed paragraphs under main.
  return typeof getPageMode === 'function' && getPageMode() === 'ai';
}

function setupObservers() {
  let detailRoot = null;
  let listRoot = null;
  const detailObserver = new MutationObserver(records => {
    const meaningful = records.filter(relevantPageMutation);
    if (!meaningful.length) return;
    const jobId = getCurrentJobId();
    if (setObservedJob(jobId)) scheduleVisibleScoresRefresh();
    // List-card changes inside a broad AI Search main element are handled by
    // the list observer; badges never trigger a new extraction cycle.
    if (jobId && meaningful.some(record => jdContentMutation(record, listRoot))) scheduleCurrentJobSync();
  });
  const listObserver = new MutationObserver(records => {
    if (!records.some(relevantPageMutation)) return;
    const jobId = getCurrentJobId();
    if (setObservedJob(jobId)) scheduleCurrentJobSync();
    scheduleVisibleScoresRefresh();
  });

  function observeCurrentRoots() {
    const nextDetail = document.querySelector('.jobs-search__job-details--container, .jobs-search__job-details, .job-view-layout, .jobs-details')
      || document.querySelector('main') || document.body;
    const firstCard = getListCards()[0];
    const nextList = firstCard?.parentElement || null;
    if (nextDetail !== detailRoot) {
      detailObserver.disconnect();
      detailRoot = nextDetail;
      if (detailRoot) detailObserver.observe(detailRoot, { childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['aria-expanded', 'aria-hidden', 'class'] });
    }
    if (nextList !== listRoot) {
      listObserver.disconnect();
      listRoot = nextList;
      if (listRoot && listRoot !== detailRoot) listObserver.observe(listRoot, { childList: true, subtree: true,
        attributes: true, attributeFilter: ['aria-current', 'aria-pressed', 'class'] });
    }
  }

  function checkNavigation() {
    observeCurrentRoots();
    const urlChanged = window.location.href !== lastKnownUrl;
    if (urlChanged) lastKnownUrl = window.location.href;
    if (setObservedJob(getCurrentJobId()) || urlChanged) {
      scheduleCurrentJobSync();
      scheduleVisibleScoresRefresh();
    }
  }

  checkNavigation();

  window.addEventListener('popstate', () => {
    checkNavigation();
  });

  window.setInterval(checkNavigation, 800);
}

function setupMessageListener() {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg?.type) {
      return;
    }

    switch (msg.type) {
      case Actions.GET_JD_DATA:
        if (setObservedJob(getCurrentJobId())) scheduleCurrentJobSync();
        {
          const forceRefresh = msg.payload?.forceRefresh === true;
          const refreshed = forceRefresh ? syncCurrentJob(getCurrentJobId()) : null;
          sendResponse({ type: Actions.JD_DATA, activeJobId: getCurrentJobId(),
            pageHidden: document.visibilityState === 'hidden', payload: {
            ...(refreshed || (lastConfirmedJDData?.jobId === getCurrentJobId()
              ? lastConfirmedJDData : extractJobData())),
            syncGeneration, syncSequence: ++syncSequence,
          } });
        }
        return true;

      case Actions.GET_JOB_LIST:
        sendResponse({ jobs: getJobsList(), activeJobId: getCurrentJobId() });
        return true;

      case Actions.FOCUS_JOB:
        {
          const success = focusJob(msg.payload?.jobId);
          sendResponse({ success, switchState: success ? 'requested' : 'not-found',
            activeJobId: getCurrentJobId(), pageHidden: document.visibilityState === 'hidden' });
        }
        return true;

      case Actions.INJECT_SCORE:
        if (typeof msg.payload?.score === 'number') {
          if (scoreResumeHash && msg.payload.resumeHash !== scoreResumeHash) {
            sendResponse({ success: false, staleResume: true });
            return true;
          }
          if (msg.payload.resumeHash) injectedVerifiedJobIds.set(msg.payload.jobId, msg.payload.resumeHash);
          injectScoreBadge(msg.payload.jobId, msg.payload.score);
          injectDetailBadge(msg.payload.jobId, msg.payload.score);
        } else {
          injectedVerifiedJobIds.delete(msg.payload?.jobId);
          verifiedScoreEntries.delete(msg.payload?.jobId);
          document.querySelectorAll('.ai-match-badge, .ai-match-detail-badge').forEach(node => {
            if (node.dataset.jobId === msg.payload?.jobId) node.remove();
          });
        }
        scheduleVisibleScoresRefresh();
        sendResponse({ success: true });
        return true;

      case Actions.REFRESH_SCORES:
        scheduleVisibleScoresRefresh();
        sendResponse({ success: true });
        return true;

      default:
        return undefined;
    }
  });
}

function debounce(fn, delay) {
  let timer = null;

  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

const debouncedRefreshScores = debounce(requestId => {
  refreshVisibleScores(requestId).catch(() => {});
}, 500);

const debouncedSyncCurrentJob = debounce(() => {
  const currentJobId = getCurrentJobId();
  if (!currentJobId) {
    return;
  }

  setObservedJob(currentJobId);
  if (retryTimer === null) syncCurrentJob(currentJobId);
}, 350);

if (!window[CONTENT_SCRIPT_READY_KEY]) {
  window[CONTENT_SCRIPT_READY_KEY] = true;
  bootstrap();
}

const AI_SEARCH_ORIGIN = 'SEMANTIC_SEARCH_LANDING_PAGE';
import { extractLinkedInJDText, LINKEDIN_JD_EXTRACTION_VERSION } from './linkedin-jd-extractor.js';

const INJECTED_TITLE_BADGE_SELECTOR = [
  '.ai-match-badge',
  '.ai-match-detail-badge',
  '.ai-meta-badge',
  '.ai-sponsor-badge',
  '.ai-detail-meta-badge',
  '.ai-detail-sponsor-badge',
].join(', ');

export const AI_LIST_ITEM_SELECTOR = '[role="button"][componentkey^="job-card-component-ref-"]';
export const AI_DETAIL_TITLE_SELECTOR = 'main a[href*="/jobs/view/"]';

function resolveDocument(documentRef) {
  return documentRef || (typeof document !== 'undefined' ? document : null);
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function readTitleTextWithoutInjectedBadges(element) {
  if (!element) {
    return '';
  }

  const clone = typeof element.cloneNode === 'function' ? element.cloneNode(true) : element;
  clone?.querySelectorAll?.(INJECTED_TITLE_BADGE_SELECTOR).forEach(node => node.remove());
  return cleanText(clone?.innerText || clone?.textContent || element.innerText || element.textContent);
}

function getUrl(href = '') {
  try {
    return new URL(href || 'https://www.linkedin.com/jobs/');
  } catch {
    return new URL('https://www.linkedin.com/jobs/');
  }
}

function getJobIdFromHref(href = '') {
  const viewMatch = href.match(/\/jobs\/view\/(\d+)/);
  if (viewMatch) {
    return viewMatch[1];
  }

  return getUrl(href).searchParams.get('currentJobId');
}

function getMeaningfulParagraphs(container) {
  return Array.from(container?.querySelectorAll('p') || [])
    .filter(element => cleanText(element.innerText));
}

function normalizeCardTitle(value) {
  return cleanText(value).replace(/\s*\(Verified job\)\s*$/i, '').trim();
}

function getAiJobIdFromComponentKey(value = '') {
  const match = String(value).match(/job-card-component-ref-(\d+)$/);
  return match?.[1] || null;
}

export function detectLinkedInPageMode(documentRef, href = '') {
  const documentNode = resolveDocument(documentRef);
  const url = getUrl(href || documentNode?.location?.href || '');
  const hasSemanticOrigin = url.searchParams.get('origin') === AI_SEARCH_ORIGIN;
  const hasSemanticSearchInput = Boolean(
    documentNode?.querySelector('input[placeholder="Describe the job you want"]'),
  );
  const hasAiCards = Boolean(documentNode?.querySelector(AI_LIST_ITEM_SELECTOR));
  const hasClassicCards = Boolean(
    documentNode?.querySelector('.job-card-container, .jobs-search-results__list-item, li[data-occludable-job-id], .scaffold-layout__list-item'),
  );

  if (hasAiCards || (hasSemanticOrigin && !hasClassicCards) || (hasSemanticSearchInput && !hasClassicCards)) {
    return 'ai';
  }

  return 'classic';
}

export function getAiListCards(documentRef) {
  const documentNode = resolveDocument(documentRef);
  return Array.from(documentNode?.querySelectorAll(AI_LIST_ITEM_SELECTOR) || []);
}

export function getAiJobIdFromCard(card) {
  return getAiJobIdFromComponentKey(card?.getAttribute('componentkey') || '');
}

export function getAiCardTitle(card) {
  const paragraphs = getMeaningfulParagraphs(card);
  const titleParagraph = paragraphs[0];
  const visibleTitle = titleParagraph?.querySelector('span[aria-hidden="true"]');
  return normalizeCardTitle(readTitleTextWithoutInjectedBadges(visibleTitle || titleParagraph));
}

export function getAiCardCompany(card) {
  return cleanText(getMeaningfulParagraphs(card)[1]?.innerText) || 'Unknown Company';
}

export function getAiCardLocation(card) {
  const locationParagraph = getMeaningfulParagraphs(card)[2];
  const visibleSpan = Array.from(locationParagraph?.querySelectorAll('span') || [])
    .map(element => cleanText(element.innerText))
    .find(Boolean);
  const location = cleanText(visibleSpan || locationParagraph?.innerText);
  return location.split(/\s+·\s+/)[0].trim();
}

export function getAiCardTitleTarget(card) {
  return getMeaningfulParagraphs(card)[0] || card || null;
}

export function getAiDetailTitleLink(documentRef, expectedJobId = '') {
  const documentNode = resolveDocument(documentRef);
  const links = getAiDetailLinks(documentNode);
  if (!links.length) {
    return null;
  }

  const currentJobId = expectedJobId || getUrl(documentNode?.location?.href || '').searchParams.get('currentJobId');
  return currentJobId
    ? links.find(link => getJobIdFromHref(link.getAttribute('href') || '') === currentJobId) || null
    : links.length === 1 ? links[0] : null;
}

function getAiDetailLinks(documentNode) {
  return Array.from(documentNode?.querySelectorAll(AI_DETAIL_TITLE_SELECTOR) || [])
    .filter(link => !link.closest?.(AI_LIST_ITEM_SELECTOR));
}

export function getAiJobIdFromDetail(documentRef) {
  const titleLink = getAiDetailTitleLink(documentRef);
  return getJobIdFromHref(titleLink?.getAttribute('href') || '');
}

export function getAiDetailHeader(documentRef, expectedJobId = '') {
  const titleLink = getAiDetailTitleLink(documentRef, expectedJobId);
  if (!titleLink) return null;
  let current = titleLink;

  for (let depth = 0; current && depth < 8; depth += 1) {
    const paragraphs = getMeaningfulParagraphs(current);
    if (paragraphs.length >= 3 && paragraphs.some(paragraph => paragraph.contains(titleLink))) {
      return current;
    }
    current = current.parentElement;
  }

  return titleLink?.parentElement || titleLink || null;
}

export function getAiDetailTitleTarget(documentRef) {
  const titleLink = getAiDetailTitleLink(documentRef);
  return titleLink?.parentElement || titleLink || null;
}

export function getAiDetailBadgeTarget(documentRef) {
  return getAiDetailHeader(documentRef) || getAiDetailTitleTarget(documentRef);
}

export function extractAiJDText(documentRef, options = {}) {
  return extractLinkedInJDText(resolveDocument(documentRef), { ...options, mode: 'ai' });
}

export function extractAiJobData(documentRef, href = '', options = {}) {
  const documentNode = resolveDocument(documentRef);
  const url = getUrl(href || documentNode?.location?.href || '');
  const expectedJobId = url.searchParams.get('currentJobId') || getAiJobIdFromDetail(documentNode);
  const detailLink = getAiDetailTitleLink(documentNode, expectedJobId);
  const header = getAiDetailHeader(documentNode, expectedJobId);
  const paragraphs = getMeaningfulParagraphs(header);
  const detailJobId = getJobIdFromHref(detailLink?.getAttribute('href') || '');
  const hasOtherDetailLink = getAiDetailLinks(documentNode).length > 0;
  const detailIdentityStatus = detailLink ? 'matched' : hasOtherDetailLink ? 'mismatch' : 'not-rendered';
  const title = readTitleTextWithoutInjectedBadges(detailLink) || readTitleTextWithoutInjectedBadges(paragraphs[1]);
  const selectedCard = getAiListCards(documentNode).find(card => getAiJobIdFromCard(card) === expectedJobId);
  const company = cleanText(paragraphs[0]?.innerText);
  const jd = extractAiJDText(documentNode, {
    expectedJobId, detailJobId, detailIdentityStatus, detailTitle: title,
    selectedTitle: selectedCard ? getAiCardTitle(selectedCard) : '',
    selectedCompany: selectedCard ? getAiCardCompany(selectedCard) : '', detailCompany: company,
    previousJobId: options.previousJobId, previousDescription: options.previousDescription,
  });

  return {
    jobId: expectedJobId,
    title,
    company,
    location: cleanText(paragraphs[2]?.innerText).split(/\s+·\s+/)[0].trim(),
    description: jd.text,
    extractionConfidence: jd.confidence,
    extractionStatus: jd.status,
    extractionWarnings: jd.warnings,
    extractionSelector: jd.selector,
    extractionIdentityStatus: detailIdentityStatus,
    extractionVersion: LINKEDIN_JD_EXTRACTION_VERSION,
  };
}

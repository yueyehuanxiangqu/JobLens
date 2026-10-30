import { LINKEDIN_JD_EXTRACTION_VERSION } from '../shared/constants.js';
export { LINKEDIN_JD_EXTRACTION_VERSION };

// Read only a job-description region in the active detail pane. Page-wide
// paragraphs and company cards are never eligible JD fallbacks.
const DETAIL_PANES = [
  '.jobs-search__job-details--container',
  '.jobs-search__job-details',
  '.job-view-layout',
  '.jobs-details',
];
const JD_REGIONS = [
  '.jobs-description__content .jobs-box__html-content',
  '#job-details',
  '.jobs-description-content__text',
  '.jobs-description-content__text--stretch',
  '.jobs-description-details__text',
  '.jobs-unified-description__content',
  '.jobs-description__content',
  '.jobs-description__container',
  '.jobs-box__html-content',
  'article.jobs-description',
];
const JOB_HEADINGS = new Set(['about the job', 'over de functie', 'over de vacature']);
const COMPANY_HEADINGS = new Set(['about the company', 'over het bedrijf', 'over de organisatie']);
const OUTSIDE_JOB_HEADINGS = new Set([...COMPANY_HEADINGS, 'similar jobs', 'recommended jobs',
  'related jobs', 'people also viewed', 'vergelijkbare vacatures', 'aanbevolen vacatures']);
const clean = value => String(value || '').replace(/\s+/gu, ' ').trim();
const cleanTitle = value => clean(value).replace(/\s*\(Verified job\)$/iu, '').toLocaleLowerCase();
const headingText = element => clean(element?.innerText || element?.textContent).toLocaleLowerCase();
const nodes = (root, selector) => Array.from(root?.querySelectorAll?.(selector) || []);

function detailPane(documentNode) {
  return DETAIL_PANES.map(selector => documentNode?.querySelector?.(selector)).find(Boolean)
    || documentNode?.querySelector?.('main') || documentNode;
}

function broadPageContainer(element) {
  return element?.matches?.('body, html, main')
    || Boolean(element?.querySelector?.('[role="button"][componentkey^="job-card-component-ref-"], .job-card-container, .jobs-search-results__list-item'));
}

function inCompanyArea(element) {
  if (element?.closest?.('aside, nav, footer, [class*="company-description"], [class*="org-about"]')) return true;
  const section = element?.closest?.('section');
  const headings = nodes(section, 'h2, h3').map(headingText);
  return headings.some(text => OUTSIDE_JOB_HEADINGS.has(text))
    && !headings.some(text => JOB_HEADINGS.has(text));
}

function readRegion(element, startHeading = '') {
  if (!element || inCompanyArea(element)) return '';
  const raw = String(element.innerText || element.textContent || '').trim();
  if (!raw) return '';
  const lower = raw.toLocaleLowerCase();
  const start = startHeading ? lower.indexOf(startHeading.toLocaleLowerCase()) : 0;
  if (startHeading && start < 0) return '';
  const contentStart = start + startHeading.length;
  // Stop at a structural section boundary, including when the company card
  // precedes the job section in a wider wrapper.
  const nextOutside = nodes(element, 'h2, h3')
    .filter(node => OUTSIDE_JOB_HEADINGS.has(headingText(node)))
    .map(node => lower.indexOf(headingText(node), contentStart))
    .filter(offset => offset >= contentStart)
    .sort((left, right) => left - right)[0];
  return raw.slice(contentStart, nextOutside ?? raw.length).trim();
}

function headingRegions(root) {
  const heading = nodes(root, 'h2, h3').find(node => JOB_HEADINGS.has(headingText(node)));
  if (!heading) return [];
  const candidates = new Set([heading.closest?.('section'), heading.parentElement,
    heading.nextElementSibling].filter(Boolean));
  let ancestor = heading.parentElement;
  // A LinkedIn heading can sit inside the first of several JD sections.
  // Walk up to the detail pane so qualifications and later sibling sections
  // are considered, without falling back to page-wide paragraph searches.
  for (let depth = 0; ancestor && depth < 8; depth += 1) {
    candidates.add(ancestor);
    if (ancestor === root) break;
    ancestor = ancestor.parentElement;
  }
  const firstSection = heading.closest?.('section') || heading.parentElement;
  if (firstSection?.nextElementSibling) {
    const parts = [];
    let sibling = firstSection;
    for (let count = 0; sibling && count < 20; count += 1) {
      if (sibling !== firstSection && (inCompanyArea(sibling)
        || nodes(sibling, 'h2, h3').some(node => OUTSIDE_JOB_HEADINGS.has(headingText(node))))) break;
      const part = readRegion(sibling, sibling === firstSection ? clean(heading.innerText || heading.textContent) : '');
      if (part) parts.push(part);
      sibling = sibling.nextElementSibling;
    }
    if (parts.length > 1) candidates.add({ siblingText: parts.join('\n'),
      siblingElement: firstSection.parentElement || firstSection });
  }
  return [...candidates].filter(container => container && container !== root?.ownerDocument
    && (!broadPageContainer(container) || container.siblingText))
    .map(container => ({ text: container.siblingText
      || readRegion(container, clean(heading.innerText || heading.textContent)),
    selector: container.siblingText ? 'about_job_siblings' : 'about_job_heading',
    element: container.siblingElement || container }))
    .filter(candidate => candidate.text);
}

function hasCollapsedContent(element) {
  return nodes(element, 'button[aria-expanded="false"], [role="button"][aria-expanded="false"]')
    .some(button => /^(?:see more|show more|toon meer|meer weergeven|lees meer)$/iu.test(clean(button.innerText || button.textContent)))
    || /(?:see more|show more|toon meer|meer weergeven|lees meer)\s*$/iu.test(clean(element?.innerText || element?.textContent));
}

function failed(status, warning) {
  return { text: '', confidence: 'failed', status, selector: null, warnings: [warning] };
}

export function extractLinkedInJDText(documentNode, options = {}) {
  const expectedId = String(options.expectedJobId || '');
  const detailId = String(options.detailJobId || '');
  const selectedTitle = cleanTitle(options.selectedTitle);
  const detailTitle = cleanTitle(options.detailTitle);
  const selectedCompany = clean(options.selectedCompany).toLocaleLowerCase();
  const detailCompany = clean(options.detailCompany).toLocaleLowerCase();
  if (options.mode === 'ai' && !expectedId) {
    return failed('loading', 'The selected Job ID has not rendered yet.');
  }
  if (options.mode === 'ai' && expectedId && !detailId) {
    return failed(options.detailIdentityStatus === 'mismatch' ? 'identity-mismatch' : 'loading',
      options.detailIdentityStatus === 'mismatch'
        ? 'The detail title link belongs to another Job ID; waiting for the selected job.'
        : 'The selected job detail identity has not rendered yet.');
  }
  if (expectedId && detailId && expectedId !== detailId) {
    return failed('loading', 'The job details still belong to the previous selection.');
  }
  if (selectedTitle && detailTitle && selectedTitle !== detailTitle) {
    return failed('loading', 'The selected card and job details do not match yet.');
  }
  if (selectedCompany && selectedCompany !== 'unknown company' && detailCompany
    && !detailCompany.includes(selectedCompany) && !selectedCompany.includes(detailCompany)) {
    return failed('loading', 'The selected card and job company do not match yet.');
  }
  if (expectedId && selectedTitle && !detailTitle) {
    return failed('loading', 'The selected job title has not loaded in the detail pane.');
  }

  const root = detailPane(documentNode);
  const headed = headingRegions(root);
  const candidates = [...headed, ...JD_REGIONS.flatMap(selector =>
    nodes(root, selector).filter(element => !inCompanyArea(element))
      .map(element => ({ text: readRegion(element), selector, element })))];
  // Several nested JD nodes may match. Compare all dedicated regions so a
  // short wrapper selected first cannot truncate a longer job body.
  const chosen = candidates.filter(item => item.text)
    .sort((left, right) => right.text.length - left.text.length)[0];
  if (!chosen) {
    const companyPresent = nodes(root, 'h2, h3').some(node => COMPANY_HEADINGS.has(headingText(node)));
    return failed(companyPresent ? 'failed' : 'loading', companyPresent
      ? 'Only a company introduction was found; no job description was identified.'
      : 'The job description region has not loaded.');
  }
  if (expectedId && options.previousJobId && options.previousJobId !== expectedId
    && chosen.text === options.previousDescription) {
    return failed('loading', 'The job description still matches the previously selected job.');
  }
  const warnings = [];
  if (expectedId && !detailId) warnings.push('The detail pane has no explicit Job ID; verify the selected title and JD.');
  if (chosen.text.length < 80) warnings.push('The extracted job description is short; review the original posting.');
  if (hasCollapsedContent(chosen.element)) warnings.push('The job description is collapsed; expand it and review the full text.');
  return {
    text: chosen.text,
    confidence: warnings.length ? 'low' : 'high',
    status: warnings.length ? 'uncertain' : 'ready',
    selector: chosen.selector,
    warnings,
  };
}

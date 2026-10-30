import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const indexHtml = fs.readFileSync(new URL('../src/sidepanel/index.html', import.meta.url), 'utf8');
const appJs = fs.readFileSync(new URL('../src/sidepanel/app.js', import.meta.url), 'utf8');

test('diagnostics follow the shared result sections and remain collapsed', () => {
  const shared = appJs.slice(appJs.indexOf('function buildUnifiedAnalysisHtml('), appJs.indexOf('function buildCompactRequirementsHtml('));
  assert.match(shared, /t\('Diagnostics'\)/);
  assert.match(shared, /<details class="analysis-fold"><summary>/);
  assert.match(shared, /buildListDetailMetadataHtml/);
  assert.match(appJs, /els\.resultSections\.innerHTML = buildUnifiedAnalysisHtml\(result, resolveOriginalJD\(result\)\)/);
  assert.match(appJs, /buildUnifiedAnalysisHtml\(result, resolveOriginalJD\(result\)\)/);
});

test('unknown risks are merged into one concise list while detailed evidence stays available', () => {
  assert.doesNotMatch(indexHtml, /id="unknowns-list"/);
  assert.match(appJs, /const risks = unique\(\[\.\.\.insights\.gaps, \.\.\.insights\.unknowns\]\)\.slice\(0, 4\)/);
  assert.match(appJs, /buildHolisticEvidenceHtml\(result\.rubric\)/);
  assert.match(appJs, /<details class="inline-evidence"><summary>/);
  assert.match(appJs, /t\('Original JD'\)/);
  assert.doesNotMatch(appJs, /Assessment scope:/);
  assert.doesNotMatch(appJs, /function buildSponsorshipStatus\(/);
  assert.match(appJs, /notApplicableDimensions/);
  assert.match(appJs, /Not assessed: no JD requirement was detected for this dimension\./);
  assert.match(appJs, /rubric\?\.version === HOLISTIC_SCORE_VERSION \? breakdown : hasRequirementMatrix/);

  const helper = appJs.slice(appJs.indexOf('function splitInsightItems('), appJs.indexOf('function buildInsightItemsHtml'));
  const context = vm.createContext({});
  vm.runInContext(`${helper}; this.splitInsightItems = splitInsightItems;`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.splitInsightItems({ gaps: ['unknown: no resume evidence', 'unmet: location mismatch'] }))), {
    gaps: ['unmet: location mismatch'],
    unknowns: ['unknown: no resume evidence'],
  });
});

test('title signal cleanup removes labels already appended to cached job titles', () => {
  const helper = appJs.slice(appJs.indexOf('function escapeRegExp('), appJs.indexOf('function buildJdTitleBadges('));
  const context = vm.createContext({
    currentConfig: null,
    TITLE_SIGNAL_KEYS: { KEYWORD: 'keyword' },
    normalizeTitleDisplaySettings: () => ({ visibleSignals: { keyword: false } }),
    normalizeKeywordList: values => Array.isArray(values) ? values : [],
    formatKeywordMarker: keyword => `KEY: ${keyword}`,
  });
  vm.runInContext(`${helper}; this.cleanJobTitle = cleanJobTitle;`, context);

  assert.equal(context.cleanJobTitle('Huisarts / BasisartsKMJD: Dutch', {
    kmEligible: true,
    jdLanguage: 'Dutch',
    requiredLanguages: [],
  }), 'Huisarts / Basisarts');
  assert.equal(context.cleanJobTitle('Embedded Partnership Manager (German Speaker)KMJD: EnglishLang: English / German / French', {
    kmEligible: true,
    jdLanguage: 'English',
    requiredLanguages: ['English', 'German', 'French'],
  }), 'Embedded Partnership Manager (German Speaker)');
});

test('v0.6.4 exposes a selectable structured resume library and preserves PDF line extraction', () => {
  assert.match(indexHtml, /id="add-resume-btn"/);
  assert.match(indexHtml, /id="resume-library-list"/);
  assert.match(indexHtml, /id="resume-library-hint"/);
  assert.doesNotMatch(indexHtml, /id="file-info"/);
  assert.match(appJs, /Actions\.GET_RESUME_LIBRARY/);
  assert.match(appJs, /data-resume-action="select"/);
  assert.match(appJs, /data-resume-action="reparse"/);
  assert.match(appJs, /extractPdfPageLayout\(content\.items/);
  assert.match(appJs, /structured profile first/);
});

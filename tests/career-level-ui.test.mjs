import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { careerLevelBadgeColor, careerLevelDisplay } from '../src/shared/career-level-display.js';
import { JOB_ANALYSIS_VERSION } from '../src/shared/job-analysis.js';
import { extractExperienceRequirements } from '../src/shared/job-analysis.js';
import { DEFAULT_TITLE_DISPLAY_SETTINGS, TITLE_SIGNAL_KEYS, TITLE_SIGNAL_ORDER, normalizeTitleDisplaySettings } from '../src/shared/constants.js';
import { t } from '../src/i18n/index.js';
import { MATCH_PROMPT_VERSION } from '../src/prompts/prompt-templates.js';
import { badgeToneForCareer, badgeToneForPermit, permitBadgeLabel } from '../src/shared/badge-theme.js';
import { HOLISTIC_SCORE_VERSION } from '../src/shared/holistic-match.js';

const app = fs.readFileSync(new URL('../src/sidepanel/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/sidepanel/index.css', import.meta.url), 'utf8');
const content = fs.readFileSync(new URL('../src/content/index.js', import.meta.url), 'utf8');

test('career translations and tooltips are consistent in Chinese while English enum text stays unchanged', () => {
  for (const [level, label] of Object.entries({ Entry: '入门级', Junior: '初级', Medior: '中级',
    Mid: '中级', Senior: '高级', Lead: '负责人级', Unknown: '未知' })) {
    assert.equal(t(level, 'zh-CN'), label);
    assert.equal(t(`Career Level: ${level}`, 'zh-CN'), `职业阶段：${label}`);
    assert.equal(t(level, 'en'), level);
    assert.equal(t(`Career Level: ${level}`, 'en'), `Career Level: ${level}`);
  }
});

test('career level badges have the requested tones and localized labels', () => {
  for (const [level, tone] of Object.entries({
    'New Graduate': 'green', Junior: 'green', 'Early Career': 'blue',
    Borderline: 'amber', Experienced: 'red', Unknown: 'gray',
  })) {
    assert.deepEqual(careerLevelDisplay(level, JOB_ANALYSIS_VERSION), { level, tone });
    assert.match(css, new RegExp(`\\.career-level-${tone}\\b`));
    assert.ok(t(level, 'en'));
    assert.ok(t(level, 'zh-CN'));
  }
  assert.deepEqual(careerLevelDisplay('Experienced', 'career-v1'), { level: 'Unknown', tone: 'gray' });
  assert.deepEqual(careerLevelDisplay('Senior', JOB_ANALYSIS_VERSION), { level: 'Senior', tone: 'red' });
  assert.deepEqual(careerLevelDisplay(undefined, undefined), { level: 'Unknown', tone: 'gray' });
});

test('current JD and batch rows render career badges without title inference', () => {
  assert.match(app, /const currentAnalysis = cachedCurrent\?\.jobAnalysis/);
  assert.match(app, /\$\{titleBadges\} \$\{buildCareerLevelBadge\(currentAnalysis/);
  assert.match(app, /\$\{buildJobAnalysisBadges\(visibleJobAnalysis\(cached\)/);
  const badgeFunctions = app.slice(app.indexOf('function buildJobAnalysisBadges('), app.indexOf('function buildRubricHtml('));
  const context = vm.createContext({
    JOB_ANALYSIS_VERSION,
    MATCH_PROMPT_VERSION,
    careerLevelDisplay,
    currentConfig: null,
    normalizeTitleDisplaySettings,
    TITLE_SIGNAL_KEYS,
    t: value => t(value, 'zh-CN'),
    escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
  });
  vm.runInContext(`${badgeFunctions}; this.buildJobAnalysisBadges = buildJobAnalysisBadges; this.visibleJobAnalysis = visibleJobAnalysis;`, context);
  assert.doesNotMatch(context.buildJobAnalysisBadges(null), /career-level-badge/);
  assert.doesNotMatch(context.buildJobAnalysisBadges({ version: 'career-v1', careerLevel: 'Experienced' }), /career-level-badge/);
  assert.doesNotMatch(context.buildJobAnalysisBadges({ version: JOB_ANALYSIS_VERSION, careerLevel: 'Unknown' }), /career-level-badge/);
  assert.equal(context.visibleJobAnalysis({ promptVersion: 'v14', jobAnalysis: {
    version: JOB_ANALYSIS_VERSION, careerLevel: 'Experienced' } }), null);
  assert.match(context.buildJobAnalysisBadges({ version: JOB_ANALYSIS_VERSION, careerLevel: 'New Graduate',
    dutchRequirement: 'Mandatory', experienceYears: [], warningCount: 0 }), /career-level-green[^>]*>应届毕业生<\/span>/);
  assert.match(context.buildJobAnalysisBadges({ version: JOB_ANALYSIS_VERSION, careerLevel: 'Entry' }),
    /career-level-green[^>]*>入门级<\/span>/);
  assert.match(context.buildJobAnalysisBadges({ version: JOB_ANALYSIS_VERSION, careerLevel: 'Lead' }),
    /career-level-red[^>]*>负责人级<\/span>/);
  const onlyCareer = context.buildJobAnalysisBadges({ version: JOB_ANALYSIS_VERSION, careerLevel: 'Junior',
    dutchRequirement: 'Mandatory', experienceYears: [5], warningCount: 2 });
  assert.match(onlyCareer, /career-level-green/);
  assert.doesNotMatch(onlyCareer, /Dutch|荷兰语|Experience|工作年限|warning|警告|5/);
  context.currentConfig = { titleDisplaySettings: { visibleSignals: { careerLevel: false } } };
  assert.doesNotMatch(context.buildJobAnalysisBadges({ version: JOB_ANALYSIS_VERSION, careerLevel: 'Experienced' }), /career-level-red/);
});

test('page title badges show only reliable career, IND, mandatory Dutch, and hard-block signals', () => {
  const helper = content.slice(content.indexOf('function buildTitleBadgeModels('), content.indexOf('async function bootstrap('));
  const context = vm.createContext({
    TITLE_SIGNAL_KEYS, TITLE_SIGNAL_ORDER, careerLevelDisplay, careerLevelBadgeColor, JOB_ANALYSIS_VERSION,
    HOLISTIC_SCORE_VERSION,
    badgeToneForCareer, badgeToneForPermit, permitBadgeLabel,
    normalizeTitleDisplaySettings,
    getTitleDisplayColors: () => ({ km: '#2563eb', jdLanguage: '#7c3aed', requiredLanguage: '#0f766e', experience: '#b45309' }),
    normalizeKeywordList: () => [],
    t: value => t(value, 'zh-CN'),
  });
  vm.runInContext(`${helper}; this.buildTitleBadgeModels = buildTitleBadgeModels;`, context);
  assert.equal(DEFAULT_TITLE_DISPLAY_SETTINGS.visibleSignals.careerLevel, true);
  const analyzed = { score: 82, capabilityScoreVersion: HOLISTIC_SCORE_VERSION,
    jdLanguage: 'Dutch', kmEligible: true,
    jobAnalysis: { version: JOB_ANALYSIS_VERSION, careerLevel: 'New Graduate', dutchRequirement: 'Mandatory' } };
  const badges = context.buildTitleBadgeModels(analyzed, {});
  assert.equal(badges.find(badge => badge.signalKey === 'careerLevel')?.label, '应届毕业生');
  assert.equal(badges.find(badge => badge.signalKey === 'careerLevel')?.backgroundColor, '#15803d');
  assert.ok(badges.some(badge => badge.signalKey === 'km' && badge.label === 'KM Sponsor'));
  assert.ok(badges.some(badge => badge.signalKey === 'requiredLanguage' && badge.label === '荷兰语必需'));
  const entryBadge = context.buildTitleBadgeModels({ ...analyzed,
    jobAnalysis: { ...analyzed.jobAnalysis, careerLevel: 'Entry' } }, {}).find(badge => badge.signalKey === 'careerLevel');
  assert.equal(entryBadge.label, '入门级');
  assert.equal(entryBadge.title, '职业阶段：入门级');
  assert.ok(!badges.some(badge => ['jdLanguage', 'experience', 'keyword'].includes(badge.signalKey)));
  assert.equal(context.buildTitleBadgeModels(null, {}).some(badge => badge.signalKey === 'careerLevel'), false);
  assert.equal(context.buildTitleBadgeModels({ score: 82 }, {}).some(badge => badge.signalKey === 'careerLevel'), false);
  const hidden = context.buildTitleBadgeModels(analyzed, { visibleSignals: { careerLevel: false } });
  assert.equal(hidden.some(badge => badge.signalKey === 'careerLevel'), false);
  assert.ok(hidden.some(badge => badge.signalKey === 'km'));
  assert.equal(t('Career Level: Experienced', 'zh-CN'), '职业阶段：有经验');
  const withPermit = context.buildTitleBadgeModels({ ...analyzed, eligibilityStatus: 'Hard Block',
    jobAnalysis: { ...analyzed.jobAnalysis, workPermitSponsorship: 'Explicitly Unavailable' } }, {});
  assert.equal(withPermit.some(badge => badge.signalKey === 'sponsorship'), false);
  assert.equal(context.buildTitleBadgeModels({ ...analyzed, capabilityScoreVersion: 'capability-v2', eligibilityStatus: 'Hard Block' }, {})
    .some(badge => badge.signalKey === 'sponsorship'), false);
  assert.equal(context.buildTitleBadgeModels({ ...analyzed,
    jobAnalysis: { ...analyzed.jobAnalysis, workPermitSponsorship: 'Not Specified' } }, {})
    .some(badge => badge.signalKey === 'sponsorship'), false);
  assert.equal(context.buildTitleBadgeModels({ ...analyzed, jobAnalysis: { ...analyzed.jobAnalysis, dutchRequirement: 'Preferred' } }, {})
    .some(badge => badge.signalKey === 'requiredLanguage'), false);
});

test('compact metadata keeps Unknown out of the career area and shows no candidate eligibility', () => {
  const helper = app.slice(app.indexOf('function buildCompactRequirementsHtml('), app.indexOf('function buildResultContextLine('));
  const context = vm.createContext({ JOB_ANALYSIS_VERSION, t: value => t(value, 'en'),
    escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;') });
  vm.runInContext(`${helper}; this.build = buildCompactRequirementsHtml;`, context);
  assert.match(context.build(null), /Re-analyze Needed/);
  const unknown = context.build({ version: JOB_ANALYSIS_VERSION,
    careerLevel: { level: 'Unknown', reasons: [] }, mainResponsibilities: [] });
  assert.doesNotMatch(unknown, /Career Level|Eligibility|Not Eligible/);
  assert.match(unknown, /Dutch Required/);
});

test('the current-page experience badge uses explicit candidate requirements only', () => {
  const helper = app.slice(app.indexOf('function detectRequiredExperience('), app.indexOf('function detectRequiredLanguages('));
  const context = vm.createContext({ extractExperienceRequirements });
  vm.runInContext(`${helper}; this.detectRequiredExperience = detectRequiredExperience;`, context);
  assert.equal(context.detectRequiredExperience('Graduate programme with 1,5 jaar salarisgroei.', 'Graduate Engineer'), null);
  assert.equal(context.detectRequiredExperience('New graduates welcome.', 'Graduate Engineer'), null);
  assert.equal(context.detectRequiredExperience('Minimaal 1,5 jaar werkervaring vereist.'), '1.5+y');
});

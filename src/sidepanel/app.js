import {
  Actions,
  DEFAULT_ANALYSIS_PRESET,
  TITLE_SIGNAL_KEYS,
  TITLE_SIGNAL_ORDER,
  ItemNames,
  findKeywordMatches,
  getSourceLabel,
  getTitleDisplayColors,
  normalizeHexColor,
  normalizeKeywordList,
  normalizeSourceType,
  normalizeTitleDisplaySettings,
} from '../shared/constants.js';
import {
  createProviderProfile,
  getProviderDefinitions,
  normalizeProviderConfig,
} from '../shared/provider-profiles.js';
import {
  getEffectiveWeights,
  getPresetLabel,
  hasCustomWeights,
  sanitizeCustomWeights,
} from '../shared/scoring-profile.js';
import { MATCH_PROMPT_VERSION, getPromptPolicySummary } from '../prompts/prompt-templates.js';
import { HOLISTIC_SCORE_VERSION } from '../shared/holistic-match.js';
import { buildDiagnosticReport } from '../shared/diagnostics.js';
import { careerLevelDisplay, dutchRequirementStatus } from '../shared/career-level-display.js';
import { badgeColorsForAccent, badgeToneForPermit, permitBadgeLabel } from '../shared/badge-theme.js';
import { JOB_ANALYSIS_VERSION, extractExperienceRequirements } from '../shared/job-analysis.js';
import { paginateJobs } from '../shared/jobs-pagination.js';
import { normalizeCandidatePreferences } from '../shared/candidate-preferences.js';
import { renderResumeProfileView } from './resume-profile-view.js';
import { extractPdfPageLayout } from '../shared/pdf-text.js';
import { getLocale, loadLocale, localizeTree, saveLocale, setCurrentLocale, t, watchLocalizedDOM } from '../i18n/index.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);

const els = {
  navButtons: $$('.nav-btn'),
  tabs: $$('.tab-content'),
  jdStatusBadge: $('#jd-status-badge'),
  jdInfo: $('#jd-info'),
  jdExtractedView: $('#jd-extracted-view'),
  jdExtractedContent: $('#jd-extracted-content'),
  jdCopyBtn: $('#jd-copy-btn'),
  jdCopyHint: $('#jd-copy-hint'),
  cachedResultHint: $('#cached-result-hint'),
  reanalyzeBtn: $('#reanalyze-btn'),

  resumeInput: $('#resume-input'),
  dropzone: $('#dropzone'),
  addResumeBtn: $('#add-resume-btn'),
  resumeLibraryList: $('#resume-library-list'),
  resumeLibraryHint: $('#resume-library-hint'),
  resumeStatusBadge: $('#resume-status-badge'),
  currentCvSelect: $('#current-cv-select'),
  currentCvStatus: $('#current-cv-status'),
  manageCvsBtn: $('#manage-cvs-btn'),
  jobsOverviewBtn: $('#jobs-view-overview-btn'),
  jobsDetailBtn: $('#jobs-view-detail-btn'),
  jobsOverviewView: $('#jobs-overview-view'),
  jobsDetailView: $('#jobs-detail-view'),
  jobsOverviewEmpty: $('#jobs-overview-empty'),
  overviewPageSize: $('#overview-page-size'),
  overviewPrev: $('#overview-prev'),
  overviewNext: $('#overview-next'),
  overviewPageLabel: $('#overview-page-label'),
  batchQueueStatus: $('#batch-queue-status'),
  batchQueueProgress: $('#batch-queue-progress'),
  batchCompleted: $('#batch-completed'),
  batchPending: $('#batch-pending'),
  batchFailed: $('#batch-failed'),
  batchCancelBtn: $('#batch-cancel-btn'),
  batchRetryFailedBtn: $('#batch-retry-failed-btn'),

  manualJobsCard: $('#manual-jobs-card'),
  manualJobsToggle: $('#manual-jobs-toggle'),
  manualJobsBody: $('#manual-jobs-body'),
  manualDetectModeButtons: $$('[data-manual-detect-mode]'),
  manualRawInput: $('#manual-raw-input'),
  manualDetectBtn: $('#manual-detect-btn'),
  manualClearBtn: $('#manual-clear-btn'),
  manualTitle: $('#manual-title'),
  manualCompany: $('#manual-company'),
  manualLocation: $('#manual-location'),
  manualSourceUrl: $('#manual-source-url'),
  manualDescription: $('#manual-description'),
  manualAnalyzeBtn: $('#manual-analyze-btn'),
  manualSaveHint: $('#manual-save-hint'),
  manualJobList: $('#manual-job-list'),

  jobListCard: $('#job-list-card'),
  jobListSummary: $('#job-list-summary'),
  jobList: $('#job-list'),
  jobListLoadMore: $('#job-list-load-more'),
  batchReanalyzeBtn: $('#batch-reanalyze-btn'),
  jobDetailPanel: $('#job-detail-panel'),
  jobDetailBack: $('#job-detail-back'),
  jobDetailAnalyze: $('#job-detail-analyze'),
  jobDetailContent: $('#job-detail-content'),
  libraryDetailPanel: $('#library-detail-panel'),
  libraryDetailBack: $('#library-detail-back'),
  libraryDetailContent: $('#library-detail-content'),
  manualDetailPanel: $('#manual-detail-panel'),
  manualDetailBack: $('#manual-detail-back'),
  manualDetailContent: $('#manual-detail-content'),

  analyzeBtn: $('#analyze-btn'),
  batchAnalyzeBtn: $('#batch-analyze-btn'),
  singleJobAction: $('#single-job-action'),
  batchJobAction: $('#batch-job-action'),
  batchCount: $('#batch-count'),

  progressContainer: $('#progress-container'),
  progressFill: $('#progress-fill'),
  progressText: $('#progress-text'),
  resultsContainer: $('#results-container'),
  resultSections: $('#result-sections'),
  resultContext: $('#result-context'),
  savePositionBtn: $('#save-position-btn'),

  scoreValue: $('#score-value'),
  scoreRingFill: $('#score-ring-fill'),
  scoreStatusBadge: $('#score-status-badge'),
  scoreMeta: $('#score-meta'),
  jobAnalysisContent: $('#job-analysis-content'),
  breakdownList: $('#breakdown-list'),
  strengthsList: $('#strengths-list'),
  gapsList: $('#gaps-list'),
  unknownsList: $('#unknowns-list'),
  metadataCard: $('#metadata-card'),
  metadataToggle: $('#metadata-toggle'),
  metadataContent: $('#metadata-content'),

  libraryCard: $('#library-card'),
  libraryToggle: $('#library-toggle'),
  libraryBody: $('#library-body'),
  libraryModeButtons: $$('[data-library-mode]'),
  librarySourceButtons: $$('[data-library-source]'),
  librarySummary: $('#library-summary'),
  libraryList: $('#library-list'),

  settingProvider: $('#setting-provider'),
  settingLanguage: $('#setting-language'),
  settingRelocation: $('#setting-relocation'),
  settingTargetCountry: $('#setting-target-country'),
  settingProviderProtocol: $('#setting-provider-protocol'),
  settingBaseUrl: $('#setting-baseurl'),
  settingApiKey: $('#setting-apikey'),
  settingModel: $('#setting-model'),
  modelDraftForm: $('#model-draft-form'),
  settingNewModel: $('#setting-new-model'),
  testAddModelBtn: $('#test-add-model-btn'),
  cancelAddModelBtn: $('#cancel-add-model-btn'),
  settingMaxTokens: $('#setting-maxtokens'),
  settingTemperature: $('#setting-temperature'),
  settingTimeout: $('#setting-timeout'),
  settingRetries: $('#setting-retries'),
  settingAutoAnalyze: $('#setting-autoanalyze'),
  settingAnalysisPreset: $('#setting-analysis-preset'),
  settingPromptPolicyMode: $('#setting-prompt-policy-mode'),
  settingPromptPolicyVersion: $('#setting-prompt-policy-version'),
  settingPromptPolicySummary: $('#setting-prompt-policy-summary'),
  settingPromptPolicyEvidence: $('#setting-prompt-policy-evidence'),
  settingPromptPolicyUncertainty: $('#setting-prompt-policy-uncertainty'),
  settingPromptPolicyScoring: $('#setting-prompt-policy-scoring'),
  settingPromptPolicyOutput: $('#setting-prompt-policy-output'),
  settingAdditionalInstructions: $('#setting-additional-instructions'),
  settingUseCustomWeights: $('#setting-use-custom-weights'),
  settingCustomPrompt: $('#setting-custom-prompt'),
  settingEnableDiagnostics: $('#setting-enable-diagnostics'),
  settingTitleColorScheme: $('#setting-title-color-scheme'),
  settingCustomTitleColors: $('#setting-custom-title-colors'),
  settingTitleSignalCheckboxes: $$('[data-title-signal]'),
  settingTitleColorPickers: $$('[data-title-color-picker]'),
  settingTitleColorHexInputs: $$('[data-title-color-hex]'),
  settingWeightTotal: $('#setting-weight-total'),
  resetWeightsBtn: $('#reset-weights-btn'),
  weightSkills: $('#weight-skills'),
  weightResponsibility: $('#weight-responsibility'),
  weightYears: $('#weight-years'),
  weightEducation: $('#weight-education'),
  weightLangLocation: $('#weight-lang-location'),
  weightSponsorship: $('#weight-sponsorship'),
  addModelBtn: $('#add-model-btn'),
  removeModelBtn: $('#remove-model-btn'),
  testConnectionBtn: $('#test-connection-btn'),
  testConnectionHint: $('#test-connection-hint'),
  togglePassword: $('#toggle-password'),
  saveConfigBtn: $('#save-config-btn'),
  saveHint: $('#save-hint'),
  clearAnalysisCacheBtn: $('#clear-analysis-cache-btn'),
  clearAnalysisCacheHint: $('#clear-analysis-cache-hint'),
  addProviderDialog: $('#add-provider-dialog'),
  addProviderForm: $('#add-provider-form'),
  addProviderName: $('#add-provider-name'),
  addProviderBaseUrl: $('#add-provider-baseurl'),
  addProviderProtocol: $('#add-provider-protocol'),
  cancelAddProviderBtn: $('#cancel-add-provider-btn'),
  addProviderHint: $('#add-provider-hint'),
};

let currentJDData = null;
let resumeText = null;
let resumeProfiles = [];
let activeResumeId = null;
let openResumeProfileView = null;
let resumeProfileViewRequestToken = 0;
let isResumeProcessing = false;
let currentConfig = null;
let currentListJobs = [];
let currentListSignature = '';
let currentListSourceType = 'linkedin';
let manualJobs = [];
let overviewPageSize = 5;
let overviewPage = 0;
let jobsSubview = 'overview';
const jobsScrollY = { overview: 0, detail: 0 };
let cacheHydrationSequence = 0;
let jobSelectionSequence = 0;
let activeBatchId = null;
let activeBatchResumeHash = '';
let batchCounts = { completed: 0, pending: 0, failed: 0 };
const failedBatchJobIds = new Set();
let isAnalyzing = false;
let scoreMap = new Map();
let lastAutoAnalyzeSignature = '';
let currentResultJobId = null;
let currentManualEditingId = null;
let currentResultPayload = null;
let savedPositionsMap = new Map();
let historyEntries = { linkedin: [], indeed: [], inserted: [] };
let libraryMode = 'history';
let librarySource = 'linkedin';
let manualDetectMode = 'rule';
let detailViewHost = 'none';
let providerSwitchToken = 0;
let connectionRequestToken = 0;
let connectionRequestsInFlight = 0;
let settingsSaveToken = 0;
let isTestingConnection = false;
let diagnosticCopySequence = 0;
const diagnosticCopyReports = new Map();

function registerDiagnosticCopy(report) {
  const id = `diagnostic-${++diagnosticCopySequence}`;
  diagnosticCopyReports.set(id, report);
  while (diagnosticCopyReports.size > 20) {
    diagnosticCopyReports.delete(diagnosticCopyReports.keys().next().value);
  }
  return id;
}
let isSavingSettings = false;
let isSavingProvider = false;
let lastAnalysisResultKey = '';

const ADD_PROVIDER_VALUE = '__add_provider__';

const WEIGHT_FIELD_MAP = Object.freeze({
  [ItemNames.SKILLS]: 'weightSkills',
  [ItemNames.RESPONSIBILITY]: 'weightResponsibility',
  [ItemNames.YEARS]: 'weightYears',
  [ItemNames.EDUCATION]: 'weightEducation',
  [ItemNames.LANG_LOCATION]: 'weightLangLocation',
  [ItemNames.SPONSORSHIP]: 'weightSponsorship',
});

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadLocale();
  els.settingLanguage.value = getLocale();
  watchLocalizedDOM();
  setupTabNavigation();
  setupJobsViews();
  setupResumeUpload();
  setupAnalyzeButtons();
  setupExtractedJDView();
  setupManualJobs();
  setupLibrary();
  setupSettings();
  setupMetadataToggle();
  setupJobListControls();
  setupMessageListener();
  setupTabWatchers();

  await loadAndDisplayConfig();
  await loadPersistentResume();
  await refreshPageContext();
  await refreshPositionLibrary();
}

function setupTabNavigation() {
  els.navButtons.forEach(button => button.addEventListener('click', () => showPage(button.dataset.tab)));
  els.manageCvsBtn.addEventListener('click', () => showPage('cvs'));
  els.currentCvSelect.addEventListener('change', () => {
    if (els.currentCvSelect.value && els.currentCvSelect.value !== activeResumeId) {
      handleResumeLibraryAction('select', els.currentCvSelect.value);
    }
  });
}

function showPage(name) {
  if ($('#tab-jobs').classList.contains('active')) jobsScrollY[jobsSubview] = window.scrollY;
  els.navButtons.forEach(button => {
    button.classList.toggle('active', button.dataset.tab === name);
    button.setAttribute('aria-current', button.dataset.tab === name ? 'page' : 'false');
  });
  els.tabs.forEach(tab => tab.classList.toggle('active', tab.id === `tab-${name}`));
  if (name === 'jobs') requestAnimationFrame(() => window.scrollTo(0, jobsScrollY[jobsSubview]));
}

function setupJobsViews() {
  els.jobsOverviewBtn.addEventListener('click', () => showJobsView('overview'));
  els.jobsDetailBtn.addEventListener('click', () => showJobsView('detail'));
  els.overviewPageSize.addEventListener('change', () => {
    overviewPageSize = els.overviewPageSize.value === 'all' ? 'all' : Number(els.overviewPageSize.value);
    overviewPage = 0;
    renderJobList();
  });
  els.overviewPrev.addEventListener('click', () => { overviewPage = Math.max(0, overviewPage - 1); renderJobList(); });
  els.overviewNext.addEventListener('click', () => { overviewPage += 1; renderJobList(); });
}

function showJobsView(name) {
  if (!['overview', 'detail'].includes(name) || name === jobsSubview) return;
  jobsScrollY[jobsSubview] = window.scrollY;
  jobsSubview = name;
  els.jobsOverviewView.classList.toggle('active', name === 'overview');
  els.jobsDetailView.classList.toggle('active', name === 'detail');
  for (const [button, view] of [[els.jobsOverviewBtn, 'overview'], [els.jobsDetailBtn, 'detail']]) {
    button.classList.toggle('active', name === view);
    button.setAttribute('aria-pressed', String(name === view));
  }
  requestAnimationFrame(() => window.scrollTo(0, jobsScrollY[name]));
}

function renderCurrentCvSelector() {
  const selected = resumeProfiles.find(profile => profile.id === activeResumeId);
  els.currentCvSelect.innerHTML = resumeProfiles.length
    ? resumeProfiles.map(profile => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.fileName || 'resume.txt')} · ${escapeHtml(t(getResumeParseStatusLabel(profile)))}</option>`).join('')
    : `<option value="">${escapeHtml(t('No CV selected'))}</option>`;
  els.currentCvSelect.value = selected?.id || '';
  els.currentCvSelect.disabled = isResumeProcessing || !resumeProfiles.length;
  els.currentCvStatus.textContent = selected
    ? t(selected.needsReparse ? 'Profile needs Re-read' : getResumeParseStatusLabel(selected))
    : t('Add a CV in My CVs to begin.');
}

function setupResumeUpload() {
  els.addResumeBtn.addEventListener('click', () => els.resumeInput.click());
  els.dropzone.addEventListener('click', () => els.resumeInput.click());

  els.dropzone.addEventListener('dragover', event => {
    event.preventDefault();
    els.dropzone.classList.add('dragover');
  });

  els.dropzone.addEventListener('dragleave', () => {
    els.dropzone.classList.remove('dragover');
  });

  els.dropzone.addEventListener('drop', event => {
    event.preventDefault();
    els.dropzone.classList.remove('dragover');
    const file = event.dataTransfer.files?.[0];
    if (file) {
      handleFileSelected(file);
    }
  });

  els.resumeInput.addEventListener('change', () => {
    const file = els.resumeInput.files?.[0];
    if (file) {
      handleFileSelected(file);
    }
  });

  els.resumeLibraryList.addEventListener('click', event => {
    const actionButton = event.target.closest('[data-resume-action]');
    if (!actionButton) return;
    if (actionButton.dataset.resumeAction === 'view-profile') {
      handleViewResumeProfile(actionButton.dataset.resumeId);
      return;
    }
    const languageText = actionButton.closest('.resume-profile')?.querySelector('[data-resume-languages-id]')?.value || '';
    handleResumeLibraryAction(actionButton.dataset.resumeAction, actionButton.dataset.resumeId, languageText);
  });
}

async function loadPersistentResume() {
  const response = await chrome.runtime.sendMessage({ type: Actions.GET_RESUME_LIBRARY });
  if (!response?.ok) {
    throw new Error(response?.error || 'Failed to load resume library.');
  }
  applyResumeLibrarySnapshot(response.data);
}

function applyResumeLibrarySnapshot(snapshot = {}) {
  resumeProfiles = Array.isArray(snapshot.resumes) ? snapshot.resumes : [];
  activeResumeId = snapshot.activeResumeId || null;
  resumeText = activeResumeId ? `active:${activeResumeId}` : null;
  renderResumeLibrary();
  updateAnalyzeButtons();
}

function setResumeProcessing(processing, message = '') {
  isResumeProcessing = processing;
  els.addResumeBtn.disabled = processing;
  els.resumeInput.disabled = processing;
  els.dropzone.classList.toggle('is-processing', processing);
  if (message) {
    els.resumeLibraryHint.textContent = message;
    els.resumeLibraryHint.classList.remove('hidden');
  }
  renderCurrentCvSelector();
  updateAnalyzeButtons();
}

function getResumeParseStatusLabel(profile) {
  if (profile.parseStatus === 'ai-parsed') return 'AI structured';
  if (profile.parseStatus === 'legacy') return 'Legacy text profile';
  return 'Local fallback';
}

async function handleViewResumeProfile(id) {
  if (!id || isResumeProcessing || !resumeProfiles.some(profile => profile.id === id)) return;
  const token = ++resumeProfileViewRequestToken;
  if (openResumeProfileView?.id === id) {
    openResumeProfileView = null;
    renderResumeLibrary();
    return;
  }
  try {
    const response = await chrome.runtime.sendMessage({ type: Actions.GET_RESUME_PROFILE, payload: { id } });
    if (!response?.ok) throw new Error(response?.error || 'Failed to load resume profile.');
    if (token !== resumeProfileViewRequestToken || response.data?.id !== id
        || !resumeProfiles.some(profile => profile.id === id)) return;
    openResumeProfileView = response.data;
    renderResumeLibrary();
  } catch (error) {
    if (token === resumeProfileViewRequestToken) showError(error.message || 'Failed to load resume profile.');
  }
}

function renderResumeLibrary({ preserveLanguageDraft = false } = {}) {
  renderCurrentCvSelector();
  const languageDraft = preserveLanguageDraft
    ? els.resumeLibraryList.querySelector('[data-resume-languages-id]') : null;
  const draftId = languageDraft?.dataset.resumeLanguagesId;
  const draftText = languageDraft?.value;
  const editorWasOpen = Boolean(languageDraft?.closest('.resume-language-editor')?.open);
  const expandedViewId = els.resumeLibraryList.querySelector('.profile-view')?.dataset.profileId;
  const expandedSections = expandedViewId === openResumeProfileView?.id
    ? [...els.resumeLibraryList.querySelectorAll('.profile-view-section[open]')].map(item => item.dataset.profileSection)
    : [];
  const hasProfiles = resumeProfiles.length > 0;
  els.dropzone.classList.toggle('hidden', hasProfiles || isResumeProcessing);
  els.resumeLibraryList.classList.toggle('hidden', !hasProfiles);

  const activeProfile = resumeProfiles.find(profile => profile.isActive);
  if (!hasProfiles) {
    els.resumeStatusBadge.textContent = 'Missing';
    els.resumeStatusBadge.className = 'status-badge';
    const archive = Array.isArray(currentConfig?.archivedGlobalLanguages) ? currentConfig.archivedGlobalLanguages : [];
    els.resumeLibraryHint.textContent = isResumeProcessing
      ? 'Reading and structuring the uploaded resume...'
      : `Add one or more resumes. Analysis uses the selected structured profile.${archive.length
        ? ` ${t('Archived global languages (not used in analysis):')} ${archive.map(item => `${item.language}: ${item.level}`).join('; ')}. ${t('Review and add them only to the appropriate CV.')}` : ''}`;
    els.resumeLibraryHint.classList.remove('hidden');
    els.resumeLibraryList.innerHTML = '';
    return;
  }

  const activeReady = activeProfile?.parseStatus === 'ai-parsed' && !activeProfile?.needsReparse;
  els.resumeStatusBadge.textContent = activeReady ? 'Ready' : 'Review';
  els.resumeStatusBadge.className = `status-badge ${activeReady ? 'uploaded' : 'review'}`;
  els.resumeLibraryHint.textContent = isResumeProcessing
    ? 'Reading and structuring the uploaded resume...'
    : 'The original text stays local for exact evidence quotes; matching reads the structured profile first.';
  els.resumeLibraryHint.classList.remove('hidden');

  els.resumeLibraryList.innerHTML = resumeProfiles.map(profile => {
    const stats = profile.stats || {};
    const countLabel = [
      stats.experience ? t(`${stats.experience} experience`) : '',
      stats.education ? t(`${stats.education} education`) : '',
      stats.skills ? t(`${stats.skills} skills`) : '',
    ].filter(Boolean).join(' · ') || 'No structured fields detected';
    const error = profile.parseError ? `<div class="resume-profile-error">${escapeHtml(t(profile.parseError))}</div>` : '';
    const refreshHint = profile.needsReparse ? `<div class="resume-profile-error">${escapeHtml(t('Profile schema changed. Re-read this resume to refresh field-level evidence.'))}</div>` : '';
    const qualityHint = profile.parseQualityIssues?.length
      ? `<div class="resume-profile-error">${escapeHtml(t('PDF extraction needs review:'))} ${escapeHtml(profile.parseQualityIssues.map(issue => t(issue)).join(' '))}</div>` : '';
    const languages = Array.isArray(profile.languages) ? profile.languages : [];
    const languageText = languages.map(item => `${item.language}: ${item.level || 'Unknown'}`).join('\n');
    const archive = currentConfig?.archivedGlobalLanguages || [];
    const archiveHint = profile.isActive && archive.length
      ? `<p class="resume-language-archive">${escapeHtml(t('Archived global languages (not used in analysis):'))} ${escapeHtml(archive.map(item => `${item.language}: ${item.level}`).join('; '))}. ${escapeHtml(t('Review and add them only to the appropriate CV.'))}</p>` : '';
    return `
      <article class="resume-profile${profile.isActive ? ' active' : ''}">
        <div class="resume-profile-header">
          <div>
            <div class="resume-profile-name">${escapeHtml(profile.fileName || 'resume.txt')}</div>
            <div class="resume-profile-state">${t(profile.isActive ? 'Current analysis resume' : 'Available resume')} · ${t(getResumeParseStatusLabel(profile))}</div>
          </div>
          ${profile.isActive ? '<span class="resume-profile-current">Current</span>' : ''}
        </div>
        <div class="resume-profile-summary">${escapeHtml(countLabel)}</div>
        ${error}
        ${refreshHint}
        ${qualityHint}
        ${profile.isActive ? `<details class="resume-language-editor"><summary>${escapeHtml(t('Edit languages for this CV'))}</summary>
          <p class="field-hint">${escapeHtml(t('Only this CV Profile supplies language abilities. Unknown means no verified level, not inability.'))}</p>
          ${archiveHint}
          <label>${escapeHtml(t('Languages and proficiency (one per line, e.g. Dutch: B2)'))}</label>
          <textarea class="form-input form-textarea" data-resume-languages-id="${escapeHtml(profile.id)}" placeholder="Dutch: B2">${escapeHtml(languageText)}</textarea>
          <button class="btn-secondary" type="button" data-resume-action="save-languages" data-resume-id="${escapeHtml(profile.id)}">${escapeHtml(t('Save CV languages'))}</button>
        </details>` : ''}
        <div class="resume-profile-actions">
          <button class="btn-secondary" type="button" data-resume-action="view-profile" data-resume-id="${escapeHtml(profile.id)}" aria-expanded="${openResumeProfileView?.id === profile.id}">${escapeHtml(t(openResumeProfileView?.id === profile.id ? 'Hide Profile' : 'View Profile'))}</button>
          ${profile.isActive ? '' : `<button class="btn-secondary" type="button" data-resume-action="select" data-resume-id="${escapeHtml(profile.id)}">Use for analysis</button>`}
          <button class="btn-secondary" type="button" data-resume-action="reparse" data-resume-id="${escapeHtml(profile.id)}">Re-read</button>
          <button class="btn-secondary resume-delete-btn" type="button" data-resume-action="delete" data-resume-id="${escapeHtml(profile.id)}">Remove</button>
        </div>
        ${openResumeProfileView?.id === profile.id ? renderResumeProfileView(openResumeProfileView) : ''}
      </article>`;
  }).join('');
  if (expandedSections.length) {
    els.resumeLibraryList.querySelectorAll('.profile-view-section').forEach(item => {
      if (expandedSections.includes(item.dataset.profileSection)) item.open = true;
    });
  }
  if (preserveLanguageDraft && draftId) {
    const nextDraft = [...els.resumeLibraryList.querySelectorAll('[data-resume-languages-id]')]
      .find(item => item.dataset.resumeLanguagesId === draftId);
    if (nextDraft) {
      nextDraft.value = draftText;
      if (editorWasOpen) nextDraft.closest('.resume-language-editor').open = true;
    }
  }
}

async function handleResumeLibraryAction(action, id, languageText = '') {
  if (!action || !id || isResumeProcessing) return;

  if (action === 'delete' && !window.confirm(t('Remove this saved resume profile?'))) return;

  setResumeProcessing(true, action === 'reparse' ? 'Re-reading resume evidence...' : 'Updating selected resume...');
  let completionMessage = '';
  try {
    const typeByAction = {
      select: Actions.SELECT_RESUME,
      reparse: Actions.REPARSE_RESUME,
      delete: Actions.DELETE_RESUME,
      'save-languages': Actions.UPDATE_RESUME_LANGUAGES,
    };
    const languages = action === 'save-languages' ? languageText.split(/\r?\n/).map(line => {
      const [language, ...level] = line.split(/[:：]/);
      return { language: language?.trim(), level: level.join(':').trim() || 'Unknown' };
    }).filter(item => item.language) : null;
    const response = await chrome.runtime.sendMessage({ type: typeByAction[action], payload: { id, ...(languages ? { languages } : {}) } });
    if (!response?.ok) throw new Error(response?.error || 'Resume library update failed.');
    resumeProfileViewRequestToken += 1;
    openResumeProfileView = null;
    const previousActiveResumeId = activeResumeId;
    applyResumeLibrarySnapshot(response.data);
    if (previousActiveResumeId !== activeResumeId || action === 'reparse' || action === 'save-languages') {
      await resetAfterResumeChange();
    }
    completionMessage = action === 'delete'
      ? 'Resume removed.'
      : action === 'reparse'
        ? 'Resume re-read and saved.'
        : action === 'save-languages'
          ? 'CV Profile languages saved.'
        : 'Analysis resume changed.';
  } catch (err) {
    showError(`Resume library update failed: ${err.message}`);
  } finally {
    setResumeProcessing(false);
    renderResumeLibrary();
    if (completionMessage) showResumeHint(completionMessage, 'success');
  }
}

async function resetAfterResumeChange() {
  cacheHydrationSequence += 1;
  jobSelectionSequence += 1;
  scoreMap = new Map();
  failedBatchJobIds.clear();
  els.batchQueueStatus.classList.add('hidden');
  currentResultJobId = null;
  currentResultPayload = null;
  lastAutoAnalyzeSignature = '';
  els.resultsContainer.classList.add('hidden');
  hideJobDetailPanel();
  hideLibraryDetailPanel();
  hideManualDetailPanel();
  els.cachedResultHint.classList.add('hidden');
  hideMetadataCard();
  updateAnalyzeButtons();
  renderJobList();
  await refreshPageScores();
  await hydrateJobScores([...currentListJobs, ...manualJobs], { includeCurrentJobResult: true });
  await refreshPositionLibrary();
}

async function handleFileSelected(file) {
  if (isResumeProcessing) return;
  setResumeProcessing(true, 'Reading and structuring the uploaded resume...');
  try {
    const extracted = await extractResumeText(file);
    const text = extracted.text;
    if (!text || text.trim().length < 30) {
      showError('The resume text is too short. Please upload a text-based PDF, DOCX or TXT file.');
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: Actions.RESUME_UPLOADED,
      payload: { text: text.trim(), fileName: file.name,
        sourceFragments: extracted.sourceFragments || [], parseQualityIssues: extracted.qualityIssues || [] },
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'Failed to save the resume.');
    }

    applyResumeLibrarySnapshot(response.data);
    await resetAfterResumeChange();
    maybeAutoAnalyzeList();
  } catch (err) {
    showError(`Resume parsing failed: ${err.message}`);
  } finally {
    els.resumeInput.value = '';
    setResumeProcessing(false);
    renderResumeLibrary();
  }
}

async function extractResumeText(file) {
  const extension = file.name.split('.').pop().toLowerCase();

  if (extension === 'txt') {
    return { text: await file.text() };
  }

  if (extension === 'pdf') {
    return extractPDFText(file);
  }

  if (extension === 'docx' || extension === 'doc') {
    return { text: await extractDOCXText(file) };
  }

  throw new Error('Unsupported file type.');
}

async function extractPDFText(file) {
  const pdfjsLib = await importPackagedModule([
    'lib/pdf.min.mjs',
    'lib/pdf.mjs',
  ], 'PDF parser');
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(
    await resolvePackagedAsset([
      'lib/pdf.worker.min.mjs',
      'lib/pdf.worker.mjs',
    ], 'PDF worker'),
  );

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  const sourceFragments = [];
  const qualityIssues = [];
  let fragmentCount = 0;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const layout = extractPdfPageLayout(content.items, {
      page: pageNumber, pageWidth: page.getViewport({ scale: 1 }).width,
    });
    pages.push(layout.text);
    fragmentCount += layout.fragments.length;
    sourceFragments.push(...layout.fragments.slice(0, Math.max(0, 6000 - sourceFragments.length)));
    qualityIssues.push(...layout.qualityIssues.map(issue => `Page ${pageNumber}: ${issue}`));
  }
  if (fragmentCount > 6000) qualityIssues.push('PDF fragment map was truncated; review source evidence.');
  return { text: pages.join('\n\n'), sourceFragments, qualityIssues };
}

async function extractDOCXText(file) {
  const mammoth = await importPackagedModule([
    'lib/mammoth.browser.min.js',
  ], 'DOCX parser');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

async function importPackagedModule(candidates, label) {
  let lastError = null;

  for (const relativePath of candidates) {
    try {
      const moduleUrl = chrome.runtime.getURL(relativePath);
      return await import(moduleUrl);
    } catch (error) {
      lastError = error;
    }
  }

  throw buildPackagedModuleError(label, lastError);
}

async function resolvePackagedAsset(candidates, label) {
  let lastError = null;

  for (const relativePath of candidates) {
    try {
      const assetUrl = chrome.runtime.getURL(relativePath);
      const response = await fetch(assetUrl, { method: 'GET' });
      if (response.ok) {
        return relativePath;
      }
      lastError = new Error(`${label} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw buildPackagedModuleError(label, lastError);
}

function buildPackagedModuleError(label, originalError) {
  const message = (originalError && originalError.message) || '';
  const looksLikeMissingPackagedAsset =
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Failed to fetch/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /ERR_FILE_NOT_FOUND/i.test(message) ||
    /404/i.test(message);

  if (looksLikeMissingPackagedAsset) {
    return new Error(
      `${label} files are missing from this extension package. Please load the built dist folder or use the GitHub release zip, not the source root folder.`,
    );
  }

  return new Error(`${label} could not be loaded: ${message || 'Unknown error.'}`);
}

function setupAnalyzeButtons() {
  els.analyzeBtn.addEventListener('click', () => startAnalysis('single'));
  els.batchAnalyzeBtn.addEventListener('click', () => startAnalysis('batch'));
  els.batchCancelBtn.addEventListener('click', async () => {
    els.batchCancelBtn.disabled = true;
    await chrome.runtime.sendMessage({ type: Actions.CANCEL_BATCH_ANALYSIS }).catch(() => {});
    els.batchQueueProgress.textContent = t('Cancelling remaining jobs after the current job finishes...');
  });
  els.batchRetryFailedBtn.addEventListener('click', () => {
    if (failedBatchJobIds.size) startBatchQueue({ jobIds: [...failedBatchJobIds], batchSize: 'all' });
  });
  els.reanalyzeBtn.addEventListener('click', () => startAnalysis('single', { forceRefresh: true }));
  els.savePositionBtn.addEventListener('click', () => {
    toggleSavedPositionFromDataset(els.savePositionBtn.dataset).catch(err => showError(err.message));
  });
}

function setupExtractedJDView() {
  els.jdCopyBtn.addEventListener('click', async () => {
    if (!currentJDData?.description || ['failed', 'loading', 'stale', 'rechecking', 'reverify-failed', 'identity-mismatch'].includes(currentJDData.extractionStatus)) return;
    try {
      await navigator.clipboard.writeText(currentJDData.description);
      els.jdCopyHint.textContent = t('JD text copied.');
    } catch {
      els.jdCopyHint.textContent = t('Could not copy JD text.');
    }
  });
}

function renderExtractedJD(data) {
  if (!data?.jobId && !data?.description) {
    els.jdExtractedView.classList.add('hidden');
    els.jdExtractedView.open = false;
    return;
  }
  els.jdExtractedView.classList.remove('hidden');
  const rows = [
    ['Job Title', data.title], ['Company', data.company], ['Job ID', data.jobId],
    ['Source URL', data.sourceUrl || data.url],
    ['Extraction Status', data.extractionStatus || (data.description ? 'ready' : 'failed')],
    ['JD Source', ['rechecking', 'reverify-failed', 'stale'].includes(data.extractionStatus)
      ? 'Previously verified JD' : data.extractionSource === 'cache' ? 'Saved analysis cache' : 'Current page'],
  ];
  const warnings = Array.isArray(data.extractionWarnings) ? data.extractionWarnings : [];
  els.jdExtractedContent.innerHTML = rows.map(([name, value]) =>
    `<div class="jd-extracted-row"><strong>${escapeHtml(t(name))}</strong><span>${escapeHtml(t(String(value || 'Unknown')))}</span></div>`).join('')
    + `<div class="jd-extracted-row"><strong>${escapeHtml(t('Extraction Warnings'))}</strong><span>${warnings.length ? warnings.map(warning => escapeHtml(t(warning))).join('<br>') : escapeHtml(t('None'))}</span></div>`
    + `<strong>${escapeHtml(t('Extracted JD Text'))}</strong><pre class="jd-extracted-text" translate="no"></pre>`;
  els.jdExtractedContent.querySelector('pre').textContent = data.description || '';
  els.jdCopyBtn.disabled = !data.description || ['failed', 'loading', 'stale', 'rechecking', 'reverify-failed', 'identity-mismatch'].includes(data.extractionStatus);
  els.jdCopyHint.textContent = '';
}

function setupManualJobs() {
  els.manualDetectModeButtons.forEach(button => {
    button.addEventListener('click', () => {
      manualDetectMode = button.dataset.manualDetectMode || 'rule';
      els.manualDetectModeButtons.forEach(item => item.classList.toggle('active', item === button));
      const hint = manualDetectMode === 'ai'
        ? 'Model detection uses your configured provider to structure the pasted job.'
        : 'Rule detection uses fast local extraction and does not call the model.';
      showManualSaveHint(hint, 'success');
    });
  });

  els.manualJobsToggle.addEventListener('click', () => {
    const willShow = els.manualJobsBody.classList.contains('hidden');
    els.manualJobsBody.classList.toggle('hidden', !willShow);
    els.manualJobsToggle.textContent = willShow ? 'Collapse' : 'Expand';
  });

  els.manualDetectBtn.addEventListener('click', async () => {
    const rawText = els.manualRawInput.value;
    if (manualDetectMode === 'rule') {
      const parsed = parseInsertedJobText(rawText);
      if (!parsed.title && !parsed.description) {
        showError('Paste more job content so the plugin can detect the fields.');
        return;
      }

      applyDetectedManualFields(parsed);
      els.manualClearBtn.classList.remove('hidden');
      showManualSaveHint('Rule detection filled the fields. Review them before analysis.', 'success');
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: Actions.DETECT_INSERTED_JOB,
        payload: { rawText },
      });

      if (!response?.ok || !response.data) {
        throw new Error(response?.error || 'Model detection did not return usable fields.');
      }

      applyDetectedManualFields(response.data);
      els.manualClearBtn.classList.remove('hidden');
      const confidence = response.data.confidence ? ` (${response.data.confidence} confidence)` : '';
      showManualSaveHint(`Model detection filled the fields${confidence}. Review them before analysis.`, 'success');
    } catch (err) {
      showError(err.message || 'Model detection failed.');
    }
  });

  els.manualClearBtn.addEventListener('click', () => {
    resetManualJobForm();
  });

  els.manualAnalyzeBtn.addEventListener('click', () => {
    saveAndAnalyzeManualJob().catch(err => {
      showManualSaveHint(err.message || 'Failed to save and analyze the inserted job.', 'error');
    });
  });

  els.manualJobList.addEventListener('click', event => {
    const saveButton = event.target.closest('[data-save-job-id]');
    if (saveButton) {
      event.stopPropagation();
      toggleSavedPositionFromDataset(saveButton.dataset).catch(err => showError(err.message));
      return;
    }

    const openButton = event.target.closest('[data-open-job-id]');
    if (openButton) {
      event.stopPropagation();
      openCachedResult(openButton.dataset.openJobId, openButton.dataset.sourceType || 'inserted', 'manual-detail').catch(err => {
        showError(err.message || 'Unable to open this inserted job.');
      });
      return;
    }

    const actionButton = event.target.closest('[data-manual-action]');
    if (actionButton) {
      event.stopPropagation();
      handleManualJobAction(actionButton.dataset).catch(err => showError(err.message));
      return;
    }

    const item = event.target.closest('.job-list-item');
    if (!item) {
      return;
    }

    openCachedResult(item.dataset.jobId, item.dataset.sourceType || 'inserted', 'manual-detail').catch(err => {
      showError(err.message || 'Unable to open this inserted job.');
    });
  });

  els.manualJobList.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    const item = event.target.closest('.job-list-item');
    if (!item) {
      return;
    }

    event.preventDefault();
    openCachedResult(item.dataset.jobId, item.dataset.sourceType || 'inserted', 'manual-detail').catch(err => {
      showError(err.message || 'Unable to open this inserted job.');
    });
  });

  els.manualDetailBack.addEventListener('click', () => {
    hideManualDetailPanel();
  });
}

function setupLibrary() {
  els.libraryToggle.addEventListener('click', () => {
    const willShow = els.libraryBody.classList.contains('hidden');
    els.libraryBody.classList.toggle('hidden', !willShow);
    els.libraryToggle.textContent = willShow ? 'Collapse' : 'Expand';
  });

  els.libraryModeButtons.forEach(button => {
    button.addEventListener('click', () => {
      libraryMode = button.dataset.libraryMode || 'history';
      els.libraryModeButtons.forEach(item => item.classList.toggle('active', item === button));
      renderLibrary();
    });
  });

  els.librarySourceButtons.forEach(button => {
    button.addEventListener('click', () => {
      librarySource = button.dataset.librarySource || 'linkedin';
      els.librarySourceButtons.forEach(item => item.classList.toggle('active', item === button));
      renderLibrary();
    });
  });

  els.libraryList.addEventListener('click', event => {
    const saveButton = event.target.closest('[data-save-job-id]');
    if (saveButton) {
      event.stopPropagation();
      toggleSavedPositionFromDataset(saveButton.dataset).catch(err => showError(err.message));
      return;
    }

    const deleteButton = event.target.closest('[data-library-delete-job-id]');
    if (deleteButton) {
      event.stopPropagation();
      handleLibraryDelete(deleteButton.dataset).catch(err => {
        showError(err.message || 'Unable to delete this item.');
      });
      return;
    }

    const openButton = event.target.closest('[data-open-job-id]');
    if (openButton) {
      event.stopPropagation();
      openLibraryItem({
        jobId: openButton.dataset.openJobId,
        sourceType: openButton.dataset.sourceType || librarySource,
      }).catch(err => {
        showError(err.message || 'Unable to open this saved item.');
      });
      return;
    }

    const item = event.target.closest('.job-list-item');
    if (!item) {
      return;
    }

    openLibraryItem(item.dataset).catch(err => {
      showError(err.message || 'Unable to open this saved item.');
    });
  });

  els.libraryList.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    const item = event.target.closest('.job-list-item');
    if (!item) {
      return;
    }

    event.preventDefault();
    openLibraryItem(item.dataset).catch(err => {
      showError(err.message || 'Unable to open this saved item.');
    });
  });

  els.libraryDetailBack.addEventListener('click', () => {
    hideLibraryDetailPanel();
  });
}

async function refreshPositionLibrary() {
  try {
    const response = await chrome.runtime.sendMessage({ type: Actions.GET_POSITION_LIBRARY });
    if (!response?.ok) {
      return;
    }

    manualJobs = Array.isArray(response.data?.manualJobs) ? response.data.manualJobs : [];
    historyEntries = response.data?.history || { linkedin: [], indeed: [], inserted: [] };
    const savedItems = [
      ...((response.data?.saved?.linkedin) || []),
      ...((response.data?.saved?.indeed) || []),
      ...((response.data?.saved?.inserted) || []),
    ];
    savedPositionsMap = new Map(savedItems.map(item => [buildPositionKey(item.jobId, item.sourceType), item]));

    renderManualJobs();
    renderLibrary();
    updateSavePositionButton();
    await hydrateJobScores([...currentListJobs, ...manualJobs], { includeCurrentJobResult: false });
  } catch (err) {
    console.warn('Failed to refresh library:', err);
  }
}

function renderManualJobs() {
  if (!manualJobs.length) {
    els.manualJobList.innerHTML = '<p class="hint-text">No inserted jobs yet. Paste a job posting above to add one.</p>';
    return;
  }

  els.manualJobList.innerHTML = manualJobs.map((job, index) => {
    const cached = scoreMap.get(job.manualJobId);
    const score = cached?.score;
    const isSaved = savedPositionsMap.has(buildPositionKey(job.manualJobId, 'inserted'));
    const titleSignalData = {
      jdLanguage: cached?.jdLanguage || null,
      requiredExperience: cached?.jobAnalysis?.version === JOB_ANALYSIS_VERSION ? cached?.requiredExperience : null,
      requiredLanguages: cached?.requiredLanguages || [],
      kmEligible: cached?.kmEligible === true,
      dutchRequirement: cached?.jobAnalysis?.version === JOB_ANALYSIS_VERSION ? dutchRequirementStatus(cached.jobAnalysis) : null,

      workPermitSponsorship: cached?.jobAnalysis?.version === JOB_ANALYSIS_VERSION
        ? cached.jobAnalysis.workPermitSponsorship?.status || cached.jobAnalysis.workPermitSponsorship : null,
      keywordMatches: cached?.keywordMatches || [],
    };
    const titleBadges = buildJdTitleBadges(titleSignalData);
    const displayTitle = cleanJobTitle(job.title, titleSignalData);

    return `
      <div class="job-list-item${isSaved ? ' saved-item' : ''}" data-job-id="${escapeHtml(job.manualJobId)}" data-source-type="inserted" role="button" tabindex="0">
        <div class="job-row-top">
          <div>
            <div class="job-index">#${index + 1} <span class="job-source-pill">Inserted</span></div>
            <div class="job-title">${escapeHtml(displayTitle || t('Untitled inserted job'))}${titleBadges}</div>
          </div>
          <div class="job-item-actions">
            ${typeof score === 'number'
              ? buildSaveStarButton(job.manualJobId, 'inserted', isSaved)
              : ''}
            ${typeof score === 'number'
              ? `<span class="job-score ${getScoreClass(score)}">${Math.round(score)}%</span>`
              : '<span class="status-badge">New</span>'}
          </div>
        </div>
        <div class="job-company">${escapeHtml(job.company || t('Manual entry'))}</div>
        ${buildJobAnalysisBadges(visibleJobAnalysis(cached))}
        <div class="job-state">${escapeHtml(job.lastAnalyzedAt ? `Analyzed ${formatTimestamp(job.lastAnalyzedAt)}` : 'Not analyzed yet')}</div>
        <div class="inline-actions">
          <button class="btn-secondary" data-open-job-id="${escapeHtml(job.manualJobId)}" data-source-type="inserted" type="button">View details</button>
          <button class="btn-secondary" data-manual-action="edit" data-manual-job-id="${escapeHtml(job.manualJobId)}" type="button">Edit</button>
          <button class="btn-secondary" data-manual-action="analyze" data-manual-job-id="${escapeHtml(job.manualJobId)}" type="button">${typeof score === 'number' ? 'Re-analyze' : 'Analyze'}</button>
          <button class="btn-secondary" data-manual-action="delete" data-manual-job-id="${escapeHtml(job.manualJobId)}" type="button">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderLibrary() {
  const sourceItems = (historyEntries?.[librarySource] && libraryMode === 'history')
    ? historyEntries[librarySource]
    : (libraryMode === 'saved'
      ? [...savedPositionsMap.values()].filter(item => normalizeSourceType(item.sourceType) === librarySource)
      : []);

  const sourceLabel = getSourceLabel(librarySource);

  if (!sourceItems.length) {
    els.librarySummary.textContent = libraryMode === 'saved'
      ? `No saved ${sourceLabel} positions yet.`
      : `No ${sourceLabel} history yet for the current resume.`;
    els.libraryList.innerHTML = '<p class="hint-text">Nothing to show here yet.</p>';
    return;
  }

  els.librarySummary.textContent = libraryMode === 'saved'
    ? `${sourceItems.length} saved ${sourceLabel} positions.`
    : `${sourceItems.length} analyzed ${sourceLabel} jobs for the current resume.`;

  els.libraryList.innerHTML = sourceItems.map((item, index) => {
    const sourceType = normalizeSourceType(item.sourceType || librarySource);
    const score = item.score;
    const isSaved = savedPositionsMap.has(buildPositionKey(item.jobId, sourceType));
    const titleSignalData = {
      jdLanguage: item.jdLanguage || item.result?.metadata?.jdLanguage || null,
      requiredExperience: (item.jobAnalysis || item.result?.jobAnalysis)?.version === JOB_ANALYSIS_VERSION
        ? item.requiredExperience || item.result?.metadata?.requiredExperience || null : null,
      requiredLanguages: item.requiredLanguages || item.result?.metadata?.requiredLanguages || [],
      kmEligible: item.kmEligible === true || item.result?.sponsorshipAssessment?.kmEligible === true,
      dutchRequirement: (item.jobAnalysis || item.result?.jobAnalysis)?.version === JOB_ANALYSIS_VERSION
        ? dutchRequirementStatus(item.jobAnalysis || item.result?.jobAnalysis) : null,

      workPermitSponsorship: (item.jobAnalysis || item.result?.jobAnalysis)?.version === JOB_ANALYSIS_VERSION
        ? (item.jobAnalysis || item.result?.jobAnalysis)?.workPermitSponsorship?.status
          || (item.jobAnalysis || item.result?.jobAnalysis)?.workPermitSponsorship : null,
      keywordMatches: item.keywordMatches
        || item.summary?.keywordMatches
        || findKeywordMatches(item.summary?.jdText, currentConfig?.titleDisplaySettings?.keywordList),
    };
    const titleBadges = buildJdTitleBadges(titleSignalData);
    const displayTitle = cleanJobTitle(item.title, titleSignalData);

    return `
      <div class="job-list-item${isSaved ? ' saved-item' : ''}" data-job-id="${escapeHtml(item.jobId)}" data-source-type="${escapeHtml(sourceType)}" role="button" tabindex="0">
        <div class="job-row-top">
          <div>
            <div class="job-index">#${index + 1} <span class="job-source-pill">${escapeHtml(getSourceLabel(sourceType))}</span></div>
            <div class="job-title">${escapeHtml(displayTitle || t('Untitled job'))}${titleBadges}</div>
          </div>
          <div class="job-item-actions">
            ${(typeof score === 'number' || libraryMode === 'saved')
              ? buildSaveStarButton(item.jobId, sourceType, isSaved)
              : ''}
            ${typeof score === 'number'
              ? `<span class="job-score ${getScoreClass(score)}">${Math.round(score)}%</span>`
              : '<span class="status-badge">Info</span>'}
          </div>
        </div>
        <div class="job-company">${escapeHtml(item.company || t('Unknown company'))}</div>
        ${buildJobAnalysisBadges(visibleJobAnalysis(item))}
        <div class="job-state">${escapeHtml(buildLibraryStateText(item))}</div>
        <div class="inline-actions">
          <button class="btn-secondary" data-open-job-id="${escapeHtml(item.jobId)}" data-source-type="${escapeHtml(sourceType)}" type="button">View details</button>
          <button class="btn-secondary" data-library-delete-job-id="${escapeHtml(item.jobId)}" data-source-type="${escapeHtml(sourceType)}" data-library-delete-mode="${escapeHtml(libraryMode)}" type="button">${libraryMode === 'saved' ? 'Remove' : 'Delete'}</button>
        </div>
      </div>
    `;
  }).join('');
}

function buildLibraryStateText(item) {
  if (libraryMode === 'saved') {
    return item.savedAt ? `Saved on ${formatTimestamp(item.savedAt)}` : 'Saved position';
  }
  return item.analyzedAt ? `Analyzed on ${formatTimestamp(item.analyzedAt)}` : 'History item';
}

async function handleLibraryDelete(dataset) {
  const jobId = dataset.libraryDeleteJobId;
  const sourceType = dataset.sourceType || librarySource;
  const mode = dataset.libraryDeleteMode || libraryMode;
  if (!jobId) {
    return;
  }

  const actionType = mode === 'saved' ? Actions.DELETE_SAVED_POSITION : Actions.DELETE_HISTORY_ENTRY;
  const response = await chrome.runtime.sendMessage({
    type: actionType,
    payload: { jobId, sourceType },
  });

  if (!response?.ok) {
    throw new Error(response?.error || 'Failed to delete this item.');
  }

  if (detailViewHost === 'library' && currentResultJobId === jobId) {
    hideLibraryDetailPanel();
  }

  if (mode === 'history') {
    scoreMap.delete(jobId);
    if (currentResultPayload?.jobId === jobId && currentResultPayload?.sourceType === sourceType) {
      currentResultPayload = null;
      currentResultJobId = null;
      els.resultsContainer.classList.add('hidden');
    }
    renderJobList();
    renderManualJobs();
  }

  await refreshPositionLibrary();
}

function parseInsertedJobText(rawText = '') {
  const text = (rawText || '').trim();
  if (!text) {
    return { title: '', company: '', location: '', description: '', sourceUrl: '' };
  }

  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const firstLongBlock = lines.find(line => line.length > 30) || '';
  const sourceUrl = (text.match(/https?:\/\/[^\s)]+/i) || [])[0] || '';
  const titleLine = extractLabelValue(lines, ['job title', 'title', 'position']) || lines[0] || '';
  const companyLine = extractLabelValue(lines, ['company', 'employer']) || inferCompanyLine(lines);
  const locationLine = extractLabelValue(lines, ['location', 'based in']) || inferLocationLine(lines);
  const description = extractDescriptionBlock(text, lines, titleLine, companyLine, locationLine) || firstLongBlock || text;

  return {
    title: titleLine,
    company: companyLine,
    location: locationLine,
    description,
    sourceUrl,
  };
}

function extractLabelValue(lines, labels) {
  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const label of labels) {
      if (lower.startsWith(`${label}:`)) {
        return line.slice(label.length + 1).trim();
      }
    }
  }
  return '';
}

function inferCompanyLine(lines) {
  return lines.slice(1, 5).find(line => line.length < 80 && !/[.:]/.test(line) && !looksLikeLocation(line)) || '';
}

function inferLocationLine(lines) {
  return lines.find(line => looksLikeLocation(line)) || '';
}

function looksLikeLocation(line = '') {
  return /,\s*[A-Za-z]/.test(line) || /\b(remote|hybrid|onsite|on-site)\b/i.test(line);
}

function extractDescriptionBlock(rawText, lines, title, company, location) {
  const markers = ['about the job', 'job description', 'about this role', 'role overview', 'description'];
  const lower = rawText.toLowerCase();
  for (const marker of markers) {
    const index = lower.indexOf(marker);
    if (index >= 0) {
      return rawText.slice(index).trim();
    }
  }

  return lines
    .filter(line => ![title, company, location].includes(line))
    .join('\n')
    .trim();
}

async function saveAndAnalyzeManualJob() {
  const payload = {
    manualJobId: currentManualEditingId,
    title: els.manualTitle.value.trim(),
    company: els.manualCompany.value.trim(),
    location: els.manualLocation.value.trim(),
    description: els.manualDescription.value.trim(),
    sourceUrl: els.manualSourceUrl.value.trim(),
    rawInput: els.manualRawInput.value.trim(),
  };

  if (!payload.title || !payload.description) {
    throw new Error('Inserted jobs need at least a title and a description.');
  }

  const saveResponse = await chrome.runtime.sendMessage({
    type: Actions.UPSERT_MANUAL_JOB,
    payload,
  });

  if (!saveResponse?.ok) {
    throw new Error(saveResponse?.error || 'Failed to save inserted job.');
  }

  currentManualEditingId = saveResponse.data.manualJobId;
  showManualSaveHint('Inserted job saved. Starting analysis...', 'success');
  await refreshPositionLibrary();

  await startManualAnalysis(saveResponse.data.manualJobId);
}

async function startManualAnalysis(manualJobId, forceRefresh = false) {
  if (isAnalyzing || isResumeProcessing || !resumeText) {
    return;
  }

  isAnalyzing = true;
  updateAnalyzeButtons();
  els.progressContainer.classList.remove('hidden');
  els.resultsContainer.classList.add('hidden');
  hideMetadataCard();
  const originalText = els.manualAnalyzeBtn.textContent;
  els.manualAnalyzeBtn.textContent = 'Analyzing inserted job...';
  els.manualAnalyzeBtn.classList.add('analyzing');

  try {
    const response = await chrome.runtime.sendMessage({
      type: Actions.START_MANUAL_ANALYSIS,
      payload: { manualJobId, forceRefresh },
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'Failed to analyze the inserted job.');
    }
    if (response.data) {
      handleResult(response.data);
    }
  } catch (err) {
    showError(err.message);
    els.progressContainer.classList.add('hidden');
    resetAnalyzeButtons(els.manualAnalyzeBtn, originalText);
  }
}

function showManualSaveHint(text, type) {
  els.manualSaveHint.textContent = text;
  els.manualSaveHint.className = `save-hint ${type}`;
}

function resetManualJobForm() {
  currentManualEditingId = null;
  els.manualRawInput.value = '';
  els.manualTitle.value = '';
  els.manualCompany.value = '';
  els.manualLocation.value = '';
  els.manualSourceUrl.value = '';
  els.manualDescription.value = '';
  els.manualClearBtn.classList.add('hidden');
  showManualSaveHint('', '');
}

function applyDetectedManualFields(parsed = {}) {
  els.manualTitle.value = parsed.title || els.manualTitle.value;
  els.manualCompany.value = parsed.company || els.manualCompany.value;
  els.manualLocation.value = parsed.location || els.manualLocation.value;
  els.manualSourceUrl.value = parsed.sourceUrl || els.manualSourceUrl.value;
  els.manualDescription.value = parsed.description || els.manualDescription.value;
}

async function handleManualJobAction(dataset) {
  const manualJobId = dataset.manualJobId;
  if (!manualJobId) {
    return;
  }

  if (dataset.manualAction === 'edit') {
    const job = manualJobs.find(item => item.manualJobId === manualJobId);
    if (!job) {
      return;
    }
    currentManualEditingId = manualJobId;
    els.manualJobsBody.classList.remove('hidden');
    els.manualJobsToggle.textContent = 'Collapse';
    els.manualRawInput.value = job.rawInput || '';
    els.manualTitle.value = job.title || '';
    els.manualCompany.value = job.company || '';
    els.manualLocation.value = job.location || '';
    els.manualSourceUrl.value = job.sourceUrl || '';
    els.manualDescription.value = job.description || '';
    els.manualClearBtn.classList.remove('hidden');
    showManualSaveHint('Editing inserted job. Update the fields and analyze again when ready.', 'success');
    return;
  }

  if (dataset.manualAction === 'delete') {
    await chrome.runtime.sendMessage({
      type: Actions.DELETE_MANUAL_JOB,
      payload: { manualJobId },
    });
    if (currentManualEditingId === manualJobId) {
      resetManualJobForm();
    }
    await refreshPositionLibrary();
    return;
  }

  if (dataset.manualAction === 'analyze') {
    await startManualAnalysis(manualJobId, true);
  }
}

async function toggleSavedPositionFromDataset(dataset) {
  const jobId = dataset.saveJobId || dataset.jobId;
  const sourceType = normalizeSourceType(dataset.sourceType);
  const payload = buildSavePayload(jobId, sourceType);
  const response = await chrome.runtime.sendMessage({
    type: Actions.TOGGLE_SAVE_POSITION,
    payload,
  });

  if (!response?.ok) {
    throw new Error(response?.error || 'Failed to update saved positions.');
  }

  await refreshPositionLibrary();
}

function buildSavePayload(jobId, sourceType = 'linkedin') {
  sourceType = normalizeSourceType(sourceType);
  const cached = scoreMap.get(jobId);
  const isInserted = sourceType === 'inserted';
  const manualJob = isInserted ? manualJobs.find(job => job.manualJobId === jobId) : null;
  const result = currentResultPayload?.jobId === jobId ? currentResultPayload : (cached?.result || null);

  return {
    jobId,
    sourceType,
    title: cached?.title || manualJob?.title || currentJDData?.title || result?.jobTitle || '',
    company: cached?.company || manualJob?.company || currentJDData?.company || result?.company || '',
    location: cached?.location || manualJob?.location || currentJDData?.location || result?.location || '',
    url: cached?.url || manualJob?.sourceUrl || currentJDData?.url || result?.jobUrl || '',
    sourceUrl: cached?.sourceUrl || manualJob?.sourceUrl || result?.sourceUrl || '',
    lastResult: result,
    summary: cached || null,
  };
}

function buildPositionKey(jobId, sourceType = 'linkedin') {
  return `${normalizeSourceType(sourceType)}:${jobId}`;
}

function setupJobListControls() {
  els.jobDetailAnalyze.addEventListener('click', () => {
    if (currentResultJobId) startAnalysis('single', { jobId: currentResultJobId, forceRefresh: true });
  });

  els.jobDetailBack.addEventListener('click', () => {
    hideJobDetailPanel();
  });

  els.jobList.addEventListener('click', event => {
    const analyzeButton = event.target.closest('[data-analyze-job-id]');
    if (analyzeButton) {
      event.stopPropagation();
      currentResultJobId = analyzeButton.dataset.analyzeJobId;
      showJobsView('detail');
      startAnalysis('single', { jobId: currentResultJobId, forceRefresh: scoreMap.get(currentResultJobId)?.cacheState === 'Valid' });
      return;
    }
    const saveButton = event.target.closest('[data-save-job-id]');
    if (saveButton) {
      event.stopPropagation();
      toggleSavedPositionFromDataset(saveButton.dataset).catch(err => showError(err.message));
      return;
    }

    const item = event.target.closest('.job-list-item');
    if (!item) {
      return;
    }

    openJobFromList(item.dataset.jobId).catch(err => {
      showError(err.message || 'Unable to open this job.');
    });
  });

  els.jobList.addEventListener('keydown', event => {
    if (event.target.closest('button')) return;
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    const item = event.target.closest('.job-list-item');
    if (!item) {
      return;
    }

    event.preventDefault();
    openJobFromList(item.dataset.jobId).catch(err => {
      showError(err.message || 'Unable to open this job.');
    });
  });
}

function setupSettings() {
  els.settingLanguage.addEventListener('change', async () => {
    try {
      await saveLocale(els.settingLanguage.value);
      renderResumeLibrary({ preserveLanguageDraft: true });
      if (currentJDData) handleJDData(currentJDData);
      localizeTree();
      if (currentResultPayload) {
        if (detailViewHost === 'list') renderListDetailPanel(currentResultPayload);
        else if (detailViewHost === 'manual') renderManualDetailPanel(currentResultPayload);
        else if (detailViewHost === 'library') renderLibraryDetailPanel(currentResultPayload);
        else renderResult(currentResultPayload);
      }
      renderJobList();
      renderManualJobs();
      renderLibrary();
      await refreshPageScores();
    } catch (error) {
      els.settingLanguage.value = getLocale();
      showError(error.message || 'Could not save language preference.');
    }
  });
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || !changes.ljm_locale) return;
    setCurrentLocale(changes.ljm_locale.newValue);
    els.settingLanguage.value = getLocale();
    renderResumeLibrary({ preserveLanguageDraft: true });
    if (currentJDData) handleJDData(currentJDData);
    localizeTree();
  });
  els.settingProvider.addEventListener('change', handleProviderChange);
  [
    els.settingBaseUrl,
    els.settingApiKey,
    els.settingModel,
    els.settingNewModel,
    els.settingMaxTokens,
    els.settingTemperature,
    els.settingTimeout,
    els.settingRetries,
  ].forEach(input => {
    input.addEventListener('input', invalidateConnectionTest);
    input.addEventListener('change', invalidateConnectionTest);
  });
  els.settingModel.addEventListener('change', syncActiveModelSelection);
  els.settingAnalysisPreset.addEventListener('change', handleAnalysisPresetChange);
  els.settingUseCustomWeights.addEventListener('change', handleUseCustomWeightsToggle);
  els.settingTitleColorScheme.addEventListener('change', handleTitleColorSchemeChange);
  els.settingTitleColorPickers.forEach(input => {
    input.addEventListener('input', () => syncTitleColorInputs(input.dataset.titleColorPicker, 'picker'));
  });
  els.settingTitleColorHexInputs.forEach(input => {
    input.addEventListener('input', () => validateTitleColorInput(input));
    input.addEventListener('change', () => validateTitleColorInput(input));
  });
  els.resetWeightsBtn.addEventListener('click', resetWeightsToPreset);
  getWeightInputs().forEach(input => {
    input.addEventListener('input', () => {
      updateWeightTotalHint();
    });
  });

  els.addModelBtn.addEventListener('click', openModelDraft);
  els.removeModelBtn.addEventListener('click', removeSelectedModel);
  els.modelDraftForm.addEventListener('submit', event => {
    event.preventDefault();
    testConnection({
      addModel: true,
      modelId: els.settingNewModel.value.trim(),
    });
  });
  els.cancelAddModelBtn.addEventListener('click', hideModelDraft);

  els.togglePassword.addEventListener('click', () => {
    const showing = els.settingApiKey.type === 'text';
    els.settingApiKey.type = showing ? 'password' : 'text';
    els.togglePassword.textContent = showing ? 'Show' : 'Hide';
  });

  els.saveConfigBtn.addEventListener('click', saveConfig);
  els.clearAnalysisCacheBtn.addEventListener('click', clearAnalysisCache);
  els.testConnectionBtn.addEventListener('click', testConnection);
  els.addProviderForm.addEventListener('submit', event => {
    event.preventDefault();
    saveNewProvider();
  });
  els.cancelAddProviderBtn.addEventListener('click', closeAddProviderDialog);
}

function setupMetadataToggle() {
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-copy-diagnostics]');
    if (!button) return;
    const report = diagnosticCopyReports.get(button.dataset.copyDiagnostics);
    if (!report) {
      showError('Diagnostic report is no longer available. Re-open the result and try again.');
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      button.textContent = 'Copied';
    } catch {
      showError('Clipboard access failed. You can select the diagnostic rows and copy them manually.');
    }
  });
  setMetadataExpanded(false);
  els.metadataToggle.addEventListener('click', () => {
    setMetadataExpanded(els.metadataContent.classList.contains('hidden'));
  });
}

function setMetadataExpanded(expanded) {
  els.metadataContent.classList.toggle('hidden', !expanded);
  els.metadataToggle.textContent = expanded ? 'Collapse' : 'Expand';
  els.metadataToggle.setAttribute('aria-expanded', String(expanded));
}

function showMetadataCard() {
  els.metadataCard.classList.remove('hidden');
  setMetadataExpanded(false);
}

function hideMetadataCard() {
  els.metadataCard.classList.add('hidden');
  setMetadataExpanded(false);
}

function setupMessageListener() {
  chrome.runtime.onMessage.addListener(msg => {
    if (!msg?.type) {
      return;
    }

    switch (msg.type) {
      case Actions.JD_DATA:
        handleJDData(msg.payload);
        scheduleRefreshPageContext();
        break;
      case Actions.ANALYSIS_PROGRESS:
        handleProgress(msg.payload);
        break;
      case Actions.ANALYSIS_RESULT:
        handleResult(msg.payload);
        break;
      case Actions.ANALYSIS_ERROR:
        handleAnalysisError(msg.payload);
        break;
      case Actions.RESUME_PROGRESS:
        setResumeProcessing(msg.payload?.stage !== 'complete', msg.payload?.message || '');
        renderResumeLibrary();
        break;
      default:
        break;
    }
  });
}

async function loadAndDisplayConfig() {
  const response = await chrome.runtime.sendMessage({ type: Actions.GET_CONFIG });
  if (!response?.ok || !response.data) {
    return;
  }

  currentConfig = hydrateProviderProfiles(response.data);
  renderProviderOptions(currentConfig.provider);
  applyProviderProfileToForm(currentConfig.provider);
  els.settingAutoAnalyze.value = currentConfig.autoAnalyzeCount ?? 0;
  applyAnalysisSettingsToForm();
  applyCandidatePreferencesToForm();
  applyTitleDisplaySettingsToForm();
  renderResumeLibrary();
}

async function saveConfig() {
  if (!currentConfig || isSavingSettings) {
    return;
  }

  const activeProvider = els.settingProvider.value;
  if (!activeProvider || activeProvider === ADD_PROVIDER_VALUE) {
    return;
  }

  syncCurrentProviderDraft(activeProvider);
  const payload = buildSettingsPayload(currentConfig, activeProvider);
  const saveToken = ++settingsSaveToken;
  const providerToken = providerSwitchToken;
  isSavingSettings = true;
  els.saveConfigBtn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: Actions.UPDATE_CONFIG,
      payload,
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'Failed to save settings.');
    }

    if (saveToken !== settingsSaveToken || providerToken !== providerSwitchToken) {
      return;
    }

    currentConfig = hydrateProviderProfiles(response.data || payload);
    renderProviderOptions(currentConfig.provider);
    applyProviderProfileToForm(currentConfig.provider);
    applyAnalysisSettingsToForm();
    applyCandidatePreferencesToForm();
    applyTitleDisplaySettingsToForm();
    renderJobList();
    renderManualJobs();
    renderLibrary();
    if (currentJDData) {
      handleJDData(currentJDData);
    }
    await refreshPageScores();
    showSaveHint('Settings saved.', 'success');
    maybeAutoAnalyzeList(true);
  } catch (err) {
    if (saveToken === settingsSaveToken && providerToken === providerSwitchToken) {
      showSaveHint(err.message, 'error');
    }
  } finally {
    if (saveToken === settingsSaveToken) {
      isSavingSettings = false;
      els.saveConfigBtn.disabled = false;
    }
  }
}

async function clearAnalysisCache() {
  if (!window.confirm(t('Clear reusable analysis results? Saved history, resumes, and settings will remain.'))) return;
  els.clearAnalysisCacheBtn.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: Actions.CLEAR_ANALYSIS_CACHE });
    if (!response?.ok) throw new Error(response?.error || 'Failed to clear analysis cache.');
    scoreMap = new Map();
  failedBatchJobIds.clear();
    currentResultPayload = null;
    currentResultJobId = null;
    lastAnalysisResultKey = '';
    els.cachedResultHint.classList.add('hidden');
    els.resultsContainer.classList.add('hidden');
    hideJobDetailPanel();
    hideManualDetailPanel();
    hideLibraryDetailPanel();
    hideMetadataCard();
    await refreshPositionLibrary();
    if (currentJDData) handleJDData(currentJDData);
    await refreshPageScores();
    els.clearAnalysisCacheHint.textContent = 'Analysis cache cleared. Saved history and user data were kept.';
    els.clearAnalysisCacheHint.className = 'save-hint success';
  } catch (error) {
    els.clearAnalysisCacheHint.textContent = error.message || 'Failed to clear analysis cache.';
    els.clearAnalysisCacheHint.className = 'save-hint error';
  } finally {
    els.clearAnalysisCacheBtn.disabled = false;
  }
}

async function testConnection({ modelId: requestedModel = '', addModel = false } = {}) {
  if (connectionRequestsInFlight > 0 || !currentConfig) {
    return;
  }

  const providerId = els.settingProvider.value;
  const modelId = String(requestedModel || els.settingModel.value || '').trim();
  if (!modelId) {
    setTestConnectionHint('Choose or enter a model before testing.', 'error');
    return;
  }

  const formSnapshot = readProviderForm(providerId);
  const provider = getProviderDefinition(providerId);
  const payload = {
    provider: providerId,
    protocol: formSnapshot.protocol || provider?.protocol || '',
    baseUrl: formSnapshot.baseUrl,
    apiKey: formSnapshot.apiKey,
    modelId,
    maxTokens: Number.parseInt(els.settingMaxTokens.value, 10) || 128,
    temperature: 0,
    timeoutMs: Math.min((Number.parseInt(els.settingTimeout.value, 10) || 30) * 1000, 30000),
    maxRetries: 0,
  };
  const requestToken = ++connectionRequestToken;
  const providerToken = providerSwitchToken;
  connectionRequestsInFlight += 1;
  isTestingConnection = true;
  els.testConnectionBtn.disabled = true;
  els.testAddModelBtn.disabled = true;

  try {
    setTestConnectionHint('Testing...', '');
    await requestProviderOriginPermission(payload.baseUrl);

    const response = await chrome.runtime.sendMessage({
      type: Actions.TEST_CONNECTION,
      payload,
    });

    if (requestToken !== connectionRequestToken || providerToken !== providerSwitchToken || els.settingProvider.value !== providerId) {
      return;
    }

    if (!response?.ok) {
      throw new Error(response?.error || 'Connection test failed.');
    }

    const preview = response.data?.preview ? ` Response: ${response.data.preview}` : '';
    setTestConnectionHint(`Connected with ${response.data?.model || payload.modelId}.${preview}`, 'success');
    if (addModel) {
      addTestedModelToDraft(providerId, modelId, formSnapshot);
    }
  } catch (err) {
    if (requestToken === connectionRequestToken && providerToken === providerSwitchToken) {
      setTestConnectionHint(err.message, 'error');
    }
  } finally {
    connectionRequestsInFlight = Math.max(0, connectionRequestsInFlight - 1);
    if (connectionRequestsInFlight === 0) {
      isTestingConnection = false;
      els.testConnectionBtn.disabled = false;
      els.testAddModelBtn.disabled = false;
    }
  }
}

async function requestProviderOriginPermission(baseUrl) {
  if (typeof chrome === 'undefined' || typeof chrome.permissions?.request !== 'function') {
    return;
  }

  let origin;
  try {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Provider URL must use HTTP or HTTPS.');
    }
    origin = `${url.origin}/*`;
  } catch (err) {
    throw new Error(err.message || 'Enter a valid provider base URL.');
  }

  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) {
    throw new Error('Provider access permission was denied. Allow it to test this provider.');
  }
}

function buildSettingsPayload(config, activeProvider) {
  const activeProfile = config.providerProfiles?.[activeProvider] || createProviderProfile(activeProvider, config);
  const providerProfiles = Object.fromEntries(
    Object.entries(config.providerProfiles || {}).map(([providerId, profile]) => [
      providerId,
      {
        ...profile,
        modelIds: Array.isArray(profile.modelIds) ? [...profile.modelIds] : [],
      },
    ]),
  );
  const providerDefinitions = Array.isArray(config.providerDefinitions)
    ? config.providerDefinitions.map(definition => ({ ...definition }))
    : [];
  const analysisSettings = readAnalysisSettingsForm();

  return {
    ...config,
    configVersion: 2,
    provider: activeProvider,
    providerDefinitions,
    baseUrl: activeProfile.baseUrl || '',
    apiKey: activeProfile.apiKey || '',
    protocol: activeProfile.protocol || '',
    modelId: activeProfile.modelId || '',
    modelIds: Array.isArray(activeProfile.modelIds) ? [...activeProfile.modelIds] : [],
    maxTokens: activeProfile.maxTokens,
    temperature: activeProfile.temperature,
    timeoutMs: activeProfile.timeoutMs,
    maxRetries: activeProfile.maxRetries,
    autoAnalyzeCount: Math.max(0, Number.parseInt(els.settingAutoAnalyze.value, 10) || 0),
    analysisPreset: analysisSettings.analysisPreset,
    promptTuningMode: analysisSettings.promptTuningMode,
    includeSponsorshipInScore: analysisSettings.includeSponsorshipInScore,
    useCustomWeights: analysisSettings.useCustomWeights,
    customWeights: analysisSettings.customWeights,
    additionalPromptInstructions: analysisSettings.additionalPromptInstructions,
    customPromptTemplate: analysisSettings.customPromptTemplate,
    enableDiagnostics: analysisSettings.enableDiagnostics,
    titleDisplaySettings: readTitleDisplaySettingsForm(),
    candidatePreferences: readCandidatePreferencesForm(),
    providerProfiles,
  };
}

async function refreshPageContext() {
  const activeTab = await getActiveTab();
  if (!activeTab?.id) {
    renderNoPageState();
    return;
  }

  let listResponse = null;
  let directJDData = null;
  try {
    listResponse = await sendTabMessageWithInjection(activeTab.id, { type: Actions.GET_JOB_LIST });
  } catch {
    listResponse = null;
  }

  try {
    const jdResponse = await chrome.runtime.sendMessage({ type: Actions.GET_JD_DATA });
    directJDData = jdResponse?.ok ? jdResponse.data : null;
  } catch {
    directJDData = null;
  }

  const jobs = Array.isArray(listResponse?.jobs) ? listResponse.jobs : [];
  syncListMode(jobs);

  if (directJDData) {
    handleJDData(directJDData);
  } else {
    try {
      const fallbackResponse = await sendTabMessageWithInjection(activeTab.id, { type: Actions.GET_JD_DATA });
      if (fallbackResponse?.payload) {
        directJDData = fallbackResponse.payload;
        handleJDData(directJDData);
      } else if (!jobs.length) {
        renderNoPageState();
      }
    } catch {
      if (!jobs.length) {
        renderNoPageState();
      }
    }
  }

  if (!directJDData && !jobs.length) {
    renderNoPageState();
  }

  await hydrateJobScores(jobs, { includeCurrentJobResult: true });
  updateAnalyzeButtons();
  maybeAutoAnalyzeList();
}

function renderNoPageState() {
  currentJDData = null;
  currentListJobs = [];
  currentListSignature = '';
  hideLibraryDetailPanel();
  hideManualDetailPanel();
  els.jdStatusBadge.textContent = 'Waiting';
  els.jdStatusBadge.className = 'status-badge';
  els.jdInfo.innerHTML = '<p class="hint-text">Open a supported LinkedIn or Indeed job page to load job data.</p>';
  renderExtractedJD(null);
  els.cachedResultHint.classList.add('hidden');
  hideMetadataCard();
  hideListMode();
  updateAnalyzeButtons();
}

function syncListMode(jobs) {
  const normalizedJobs = Array.isArray(jobs) ? jobs : [];
  const nextSignature = normalizedJobs.map(job => job.jobId).join(',');

  if (normalizedJobs.length) {
    currentListSourceType = normalizeSourceType(normalizedJobs[0].sourceType);
  }

  if (nextSignature !== currentListSignature) {
    currentListSignature = nextSignature;
    overviewPage = 0;
  }

  currentListJobs = normalizedJobs;

  if (normalizedJobs.length) {
    els.jobsOverviewEmpty.classList.add('hidden');
    els.jobListCard.classList.remove('hidden');
    els.batchJobAction.classList.remove('hidden');
    renderJobList();
    return;
  }

  hideListMode();
}

function hideListMode() {
  currentListJobs = [];
  currentListSignature = '';
  els.jobsOverviewEmpty.classList.remove('hidden');
  els.jobListCard.classList.add('hidden');
  hideJobDetailPanel();
  els.batchJobAction.classList.add('hidden');
  els.jobList.innerHTML = '';
  els.jobListSummary.textContent = '';
  els.jobListLoadMore.classList.add('hidden');
  els.batchReanalyzeBtn.classList.add('hidden');
}

function handleJDData(data) {
  if (currentJDData?.jobId !== data?.jobId) {
    els.jdExtractedView.open = false;
    if (currentResultJobId !== data?.jobId) jobSelectionSequence += 1;
    currentResultJobId = data?.jobId || null;
    currentResultPayload = null;
    els.resultsContainer.classList.add('hidden');
  }
  currentJDData = data;
  renderExtractedJD(data);
  const jdUsable = !!data?.description && data.extractionConfidence !== 'failed'
    && !['failed', 'loading', 'stale', 'rechecking', 'reverify-failed', 'identity-mismatch'].includes(data.extractionStatus);
  const retainedJD = !!data?.description && ['rechecking', 'reverify-failed', 'stale'].includes(data.extractionStatus);
  const displayJD = jdUsable || retainedJD;
  const existing = data?.jobId ? scoreMap.get(data.jobId) : null;
  if (existing?.cacheState === 'Valid' && (!jdUsable || existing.jdText !== data.description
    || existing.jdExtractionVersion !== (data.extractionVersion || ''))) {
    scoreMap.set(data.jobId, { ...existing, cacheState: 'Verifying' });
    els.resultsContainer.classList.add('hidden');
    renderJobList();
  }
  const cachedCandidate = data?.jobId ? scoreMap.get(data.jobId) : null;
  const cachedCurrent = displayJD && cachedCandidate?.jdVerified === true
    && cachedCandidate.jdText === data.description
    && cachedCandidate.jdExtractionVersion === (data.extractionVersion || '') ? cachedCandidate : null;
  const currentAnalysis = cachedCurrent?.jobAnalysis || cachedCurrent?.result?.jobAnalysis;
  const titleSignalData = {
    jdLanguage: displayJD ? cachedCurrent?.jdLanguage || detectJdLanguageLabel(data?.description, data?.title) : null,
    requiredExperience: currentAnalysis?.version === JOB_ANALYSIS_VERSION
      ? cachedCurrent?.requiredExperience : displayJD ? detectRequiredExperience(data?.description, data?.title) : null,
    requiredLanguages: displayJD ? cachedCurrent?.requiredLanguages || detectRequiredLanguages(data?.description, data?.title) : [],
    kmEligible: cachedCurrent?.kmEligible === true,
    dutchRequirement: currentAnalysis?.version === JOB_ANALYSIS_VERSION
      ? dutchRequirementStatus(currentAnalysis) : null,

    workPermitSponsorship: currentAnalysis?.version === JOB_ANALYSIS_VERSION
      ? currentAnalysis?.workPermitSponsorship?.status || currentAnalysis?.workPermitSponsorship : null,
    keywordMatches: displayJD ? findKeywordMatches(data?.description, currentConfig?.titleDisplaySettings?.keywordList) : [],
  };
  const titleBadges = buildJdTitleBadges(titleSignalData);
  const displayTitle = cleanJobTitle(data?.title, titleSignalData);

  if (displayJD) {
    els.jdStatusBadge.textContent = retainedJD ? t(data.extractionStatus === 'rechecking' ? 'Rechecking JD' : 'Previous JD needs verification')
      : data.extractionStatus === 'uncertain' ? t('Review JD')
      : currentListJobs.length > 1 ? 'Ready + list' : 'Ready';
    els.jdStatusBadge.className = retainedJD ? 'status-badge' : 'status-badge detected';
    els.jdInfo.innerHTML = `
      ${retainedJD ? `<p class="hint-text">${escapeHtml(t('The previous JD is shown for review; re-analysis is paused until it is verified again.'))}</p>` : ''}
      <div class="jd-detail"><span class="jd-detail-label">Title</span><span class="jd-detail-value">${escapeHtml(displayTitle || t('Unknown'))}${titleBadges} ${buildCareerLevelBadge(currentAnalysis?.careerLevel?.level || currentAnalysis?.careerLevel, currentAnalysis?.version)}</span></div>
      <div class="jd-detail"><span class="jd-detail-label">Company</span><span class="jd-detail-value">${escapeHtml(data.company || t('Unknown'))}</span></div>
      <div class="jd-detail"><span class="jd-detail-label">Location</span><span class="jd-detail-value">${escapeHtml(data.location || t('Unknown'))}</span></div>
    `;
  } else if (data?.extractionStatus === 'identity-mismatch') {
    els.jdStatusBadge.textContent = t('Job Identity Mismatch');
    els.jdStatusBadge.className = 'status-badge failed';
    els.jdInfo.innerHTML = `<p class="hint-text">${escapeHtml(t('The selected card and detail pane do not match. Wait for the page to finish loading and retry.'))}</p>`;
  } else if (data?.extractionStatus === 'failed' || data?.extractionStatus === 'stale') {
    els.jdStatusBadge.textContent = t('JD Extraction Failed');
    els.jdStatusBadge.className = 'status-badge failed';
    els.jdInfo.innerHTML = `<p class="hint-text">${escapeHtml(t('The job description could not be verified. Retry or paste the JD manually.'))}</p>`;
  } else if (data?.extractionStatus === 'loading') {
    els.jdStatusBadge.textContent = t('loading');
    els.jdStatusBadge.className = 'status-badge';
    els.jdInfo.innerHTML = `<p class="hint-text">${escapeHtml(t('The job description region has not loaded.'))}</p>`;
  } else if (currentListJobs.length > 1) {
    els.jdStatusBadge.textContent = 'List only';
    els.jdStatusBadge.className = 'status-badge detected';
    els.jdInfo.innerHTML = '<p class="hint-text">The page list is available. Open a specific job card to load detailed JD text.</p>';
  } else {
    els.jdStatusBadge.textContent = 'Unavailable';
    els.jdStatusBadge.className = 'status-badge failed';
    els.jdInfo.innerHTML = '<p class="hint-text">Unable to read the current job details.</p>';
  }

  updateAnalyzeButtons();
}

async function hydrateJobScores(jobs, options = {}) {
  const requestId = ++cacheHydrationSequence;
  const resumeId = activeResumeId;
  const resumeHash = resumeProfiles.find(profile => profile.id === resumeId)?.hash || '';
  const currentJobId = currentJDData?.jobId || null;
  const verifiedJD = currentJDData?.description && currentJDData.extractionConfidence !== 'failed'
    && !['failed', 'loading', 'stale', 'rechecking', 'reverify-failed', 'identity-mismatch'].includes(currentJDData.extractionStatus)
    ? currentJDData : null;
  const jobIds = [...new Set([
    ...(Array.isArray(jobs) ? jobs.map(job => job.jobId) : []),
    currentJDData?.jobId,
  ].filter(Boolean))];

  if (!jobIds.length) {
    // An empty page read during a job transition has no identity to invalidate.
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: Actions.GET_CACHED_SCORES,
      payload: { jobIds, includeResult: !!options.includeCurrentJobResult, currentJDData: verifiedJD },
    });

    if (requestId !== cacheHydrationSequence || activeResumeId !== resumeId
      || currentJDData?.jobId !== currentJobId || (response?.resumeHash && response.resumeHash !== resumeHash)) return;

    if (!response?.ok) {
      return;
    }

    if (!response.resumeAvailable) {
      scoreMap = new Map();
      els.cachedResultHint.classList.add('hidden');
      renderJobList();
      renderManualJobs();
      renderLibrary();
      return;
    }

    const previousScores = scoreMap;
    const nextScores = new Map((response.entries || []).map(entry => {
      const old = previousScores.get(entry.jobId);
      const previouslyVerified = old?.jdVerified === true
        && old.jdText === entry.jdText && old.jdExtractionVersion === entry.jdExtractionVersion;
      const verifiedNow = entry.jdVerified === true;
      const cacheState = verifiedNow || previouslyVerified && old.cacheState === 'Valid'
        && entry.jobId !== currentJobId ? 'Valid' : 'Verifying';
      return [entry.jobId, { ...entry, jdVerified: verifiedNow || previouslyVerified, cacheState }];
    }));
    scoreMap = nextScores;
    if (currentJDData?.description) handleJDData(currentJDData);
    renderJobList();
    renderManualJobs();
    renderLibrary();

    if (options.includeCurrentJobResult && currentJDData?.jobId) {
      const cachedCurrent = scoreMap.get(currentJDData.jobId);
      if (cachedCurrent?.result && cachedCurrent.cacheState === 'Valid' && !isAnalyzing) {
          handleResult({
            ...cachedCurrent.result,
            jobId: cachedCurrent.jobId,
            sourceType: normalizeSourceType(cachedCurrent.sourceType),
            jobTitle: cachedCurrent.title,
          company: cachedCurrent.company,
          location: cachedCurrent.location,
          jobUrl: cachedCurrent.url,
          fromCache: true,
          analysisResumeHash: resumeHash,
          jdVerified: true,
          jdText: cachedCurrent.jdText || '',
          jdExtractionVersion: cachedCurrent.jdExtractionVersion || '',
          cachedAt: cachedCurrent.analyzedAt,
          metadata: {
            ...(cachedCurrent.result.metadata || {}),
            jdLanguage: cachedCurrent.jdLanguage || cachedCurrent.result.metadata?.jdLanguage || 'Unknown',
            requiredExperience: cachedCurrent.requiredExperience || cachedCurrent.result.metadata?.requiredExperience || null,
            requiredLanguages: cachedCurrent.requiredLanguages || cachedCurrent.result.metadata?.requiredLanguages || [],
          },
        });
      }
    }
  } catch {
    // Ignore cache hydration failures during reloads.
  }
}

function renderJobList() {
  if (!currentListJobs.length) {
    els.jobList.innerHTML = '';
    els.jobListLoadMore.classList.add('hidden');
    return;
  }

  const { jobs: shownJobs, pageSize, page, totalPages } = paginateJobs(currentListJobs, overviewPageSize, overviewPage);
  overviewPage = page;
  const analyzedCount = currentListJobs.filter(job => scoreMap.get(job.jobId)?.cacheState === 'Valid').length;
  els.jobListSummary.textContent = `${currentListJobs.length} ${t('jobs detected on this page.')} ${analyzedCount} ${t('already have cached results for the current resume.')}`;
  els.batchReanalyzeBtn.classList.add('hidden');
  els.overviewPageLabel.textContent = `${overviewPage + 1} / ${totalPages}`;
  els.overviewPrev.disabled = overviewPage === 0;
  els.overviewNext.disabled = overviewPage >= totalPages - 1;

  els.jobList.innerHTML = shownJobs.map((job, index) => {
    const sourceType = normalizeSourceType(job.sourceType || currentListSourceType);
    const cached = scoreMap.get(job.jobId);
    const sameVerifiedJD = cached?.jdVerified === true && currentJDData?.jobId === job.jobId
      && cached.jdText === currentJDData?.description;
    const displayCached = cached?.cacheState === 'Valid' || cached?.cacheState === 'Verifying'
      && cached?.jdVerified === true && (sameVerifiedJD || cached?.jdText);
    const score = displayCached ? cached?.score : null;
    const scoreClass = typeof score === 'number'
      ? `${getScoreClass(score)}${cached?.cacheState === 'Verifying' ? ' verifying' : ''}` : 'pending';
    const isSaved = savedPositionsMap.has(buildPositionKey(job.jobId, sourceType));
    const stateText = cached?.cacheState === 'Valid' ? `${t('Cached on')} ${formatTimestamp(cached.analyzedAt)}`
      : cached ? t('Verifying saved analysis against this JD') : t('Not analyzed for this resume yet');
    const isCurrent = currentJDData?.jobId === job.jobId;
    const isSelected = currentResultJobId === job.jobId;
    const titleSignalData = {
      jdLanguage: displayCached ? cached?.jdLanguage || null : null,
      requiredExperience: displayCached && cached?.jobAnalysis?.version === JOB_ANALYSIS_VERSION ? cached?.requiredExperience : null,
      requiredLanguages: displayCached ? cached?.requiredLanguages || [] : [],
      kmEligible: displayCached && cached?.kmEligible === true,
      dutchRequirement: displayCached && cached?.jobAnalysis?.version === JOB_ANALYSIS_VERSION ? dutchRequirementStatus(cached.jobAnalysis) : null,

      workPermitSponsorship: displayCached && cached?.jobAnalysis?.version === JOB_ANALYSIS_VERSION
        ? cached.jobAnalysis.workPermitSponsorship?.status || cached.jobAnalysis.workPermitSponsorship : null,
      keywordMatches: displayCached ? cached?.keywordMatches || [] : [],
    };
    const titleBadges = buildJdTitleBadges(titleSignalData);
    const displayTitle = cleanJobTitle(job.title, titleSignalData);

    return `
    <div class="job-list-item${isSelected ? ' active-view' : ''}${isSaved ? ' saved-item' : ''}" data-job-id="${escapeHtml(job.jobId)}" data-source-type="${escapeHtml(sourceType)}" role="button" tabindex="0" aria-label="Open analysis for ${escapeHtml(displayTitle || 'Unknown title')}">
        <div class="job-row-top">
          <div>
            <div class="job-index">#${overviewPage * pageSize + index + 1}${isCurrent ? ` - ${t('current')}` : ''} <span class="job-source-pill">${escapeHtml(getSourceLabel(sourceType))}</span></div>
            <div class="job-title">${escapeHtml(displayTitle || t('Unknown title'))}${titleBadges}</div>
          </div>
          <div class="job-item-actions">
            <div class="job-item-status">
              ${typeof score === 'number'
                ? buildSaveStarButton(job.jobId, sourceType, isSaved)
                : ''}
              ${typeof score === 'number'
                ? `<span class="job-score ${scoreClass}" title="${escapeHtml(stateText)}">${Math.round(score)}%</span>`
                : `<span class="status-badge">${escapeHtml(t(cached ? 'Verifying' : 'New'))}</span>`}
            </div>
            <button class="btn-secondary job-item-analyze" type="button" data-analyze-job-id="${escapeHtml(job.jobId)}" ${isAnalyzing || !resumeText ? 'disabled' : ''}>${t(cached?.cacheState === 'Valid' ? 'Re-analyze' : 'Analyze')}</button>
          </div>
        </div>
        <div class="job-company">${escapeHtml(job.company || t('Unknown company'))}</div>
        ${displayCached ? buildJobAnalysisBadges(visibleJobAnalysis(cached)) : ''}
        <div class="job-state">${escapeHtml(stateText)}</div>
      </div>
    `;
  }).join('');

  els.jobListLoadMore.classList.add('hidden');
}

function maybeAutoAnalyzeList(force = false) {
  const autoAnalyzeCount = Math.max(0, Number.parseInt(currentConfig?.autoAnalyzeCount ?? 0, 10) || 0);
  if (!resumeText || !currentListJobs.length || !autoAnalyzeCount || isAnalyzing || isResumeProcessing) {
    return;
  }

  const targetJobs = currentListJobs.slice(0, autoAnalyzeCount);
  const missingJobs = targetJobs.filter(job => scoreMap.get(job.jobId)?.cacheState !== 'Valid');
  if (!missingJobs.length) {
    return;
  }

  const signature = `${autoAnalyzeCount}:${targetJobs.map(job => job.jobId).join(',')}`;
  if (!force && signature === lastAutoAnalyzeSignature) {
    return;
  }

  lastAutoAnalyzeSignature = signature;
  startAnalysis('batch', { jobIds: missingJobs.map(job => job.jobId), batchSize: 'all' }, true).catch(err => {
    console.warn('Auto analysis failed:', err);
  });
}

function updateAnalyzeButtons() {
  const resumeBusy = isAnalyzing || isResumeProcessing;
  els.jobDetailAnalyze.disabled = resumeBusy || !resumeText;
  els.jobList.querySelectorAll('[data-analyze-job-id]').forEach(button => {
    button.disabled = resumeBusy || !resumeText;
  });
  const hasSingleJD = !!currentJDData?.description
    && currentJDData.extractionConfidence !== 'failed'
    && !['failed', 'loading', 'stale', 'rechecking', 'reverify-failed', 'identity-mismatch'].includes(currentJDData.extractionStatus);
  els.analyzeBtn.disabled = !resumeText || resumeBusy || !hasSingleJD;
  els.batchAnalyzeBtn.disabled = !resumeText || resumeBusy || !currentListJobs.length;
  els.batchRetryFailedBtn.disabled = !resumeText || resumeBusy || !failedBatchJobIds.size;
  els.manualAnalyzeBtn.disabled = !resumeText || resumeBusy;
  els.reanalyzeBtn.classList.toggle('hidden', !currentJDData?.jobId || !scoreMap.has(currentJDData.jobId));
  els.reanalyzeBtn.disabled = resumeBusy || !hasSingleJD;
  els.batchReanalyzeBtn.disabled = true;
}

async function startAnalysis(mode, overridePayload = null, silent = false) {
  if (mode === 'batch') return startBatchQueue(overridePayload, silent);
  if (isAnalyzing || isResumeProcessing || !resumeText) {
    return;
  }

  isAnalyzing = true;
  updateAnalyzeButtons();
  els.progressContainer.classList.remove('hidden');
  els.resultsContainer.classList.add('hidden');
  hideMetadataCard();

  const targetButton = els.analyzeBtn;
  const originalText = targetButton.textContent;
  targetButton.textContent = t('Analyzing...');
  targetButton.classList.add('analyzing');

  try {
    const response = await chrome.runtime.sendMessage({
      type: Actions.START_ANALYSIS,
      payload: overridePayload,
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'Failed to start analysis.');
    }
    if (response.data) {
      handleResult(response.data);
    }
  } catch (err) {
    if (!silent) {
      showError(err.message);
    }
    els.progressContainer.classList.add('hidden');
    resetAnalyzeButtons(targetButton, originalText);
  }
}

async function startBatchQueue(overridePayload = null, silent = false) {
  if (isAnalyzing || isResumeProcessing || !resumeText || !currentListJobs.length) return;
  isAnalyzing = true;
  activeBatchId = null;
  activeBatchResumeHash = resumeProfiles.find(profile => profile.id === activeResumeId)?.hash || '';
  const requested = overridePayload?.batchSize || els.batchCount.value;
  const payload = overridePayload || { batchSize: requested,
    ...(requested === 'all' ? {} : { skipJobIds: [...failedBatchJobIds] }) };
  batchCounts = { completed: 0, pending: currentListJobs.length, failed: 0 };
  els.batchQueueStatus.classList.remove('hidden');
  els.batchCancelBtn.classList.remove('hidden');
  els.batchCancelBtn.disabled = false;
  els.batchQueueProgress.textContent = t('Checking remaining jobs against the current CV and JD.');
  renderBatchCounts();
  updateAnalyzeButtons();
  try {
    const response = await chrome.runtime.sendMessage({
      type: Actions.START_BATCH_ANALYSIS,
      payload,
    });
    if (!response?.ok) throw new Error(response?.error || 'Batch analysis failed.');
    if (response.analysisResumeHash === activeBatchResumeHash
      && activeBatchResumeHash === (resumeProfiles.find(profile => profile.id === activeResumeId)?.hash || '')) {
      batchCounts = response;
      renderBatchCounts();
      els.batchQueueProgress.textContent = t(response.cancelled ? 'Remaining jobs cancelled.' : response.paused
        ? 'JD collection paused. Return to the job page and run the batch again.' : 'Batch analysis finished.');
    }
  } catch (error) {
    if (activeBatchResumeHash === (resumeProfiles.find(profile => profile.id === activeResumeId)?.hash || '')) {
      if (!silent) showError(error.message || 'Batch analysis failed.');
      els.batchQueueProgress.textContent = t(error.message || 'Batch analysis failed.');
    }
  } finally {
    activeBatchId = null;
    activeBatchResumeHash = '';
    isAnalyzing = false;
    els.batchCancelBtn.classList.add('hidden');
    els.batchRetryFailedBtn.classList.toggle('hidden', failedBatchJobIds.size === 0);
    updateAnalyzeButtons();
    await hydrateJobScores(currentListJobs, { includeCurrentJobResult: true });
  }
}

function renderBatchCounts() {
  els.batchCompleted.textContent = `${t('Completed')}: ${batchCounts.completed || 0}`;
  els.batchPending.textContent = `${t('Pending')}: ${batchCounts.pending || 0}`;
  els.batchFailed.textContent = `${t('Failed')}: ${failedBatchJobIds.size}`;
}

function resetAnalyzeButtons(targetButton = null, originalText = '') {
  isAnalyzing = false;
  if (targetButton) {
    targetButton.textContent = originalText;
    targetButton.classList.remove('analyzing');
  } else {
    els.analyzeBtn.textContent = 'Analyze current job';
    els.batchAnalyzeBtn.textContent = 'Analyze job list';
    els.analyzeBtn.classList.remove('analyzing');
    els.batchAnalyzeBtn.classList.remove('analyzing');
    els.manualAnalyzeBtn.textContent = 'Save and analyze inserted job';
    els.manualAnalyzeBtn.classList.remove('analyzing');
  }
  updateAnalyzeButtons();
}

function handleProgress({ stage, message, ...detail }) {
  if (stage === 'batch') {
    const currentHash = resumeProfiles.find(profile => profile.id === activeResumeId)?.hash || '';
    if (detail.analysisResumeHash !== currentHash || detail.analysisResumeHash !== activeBatchResumeHash) return;
    if (activeBatchId && detail.batchId !== activeBatchId) return;
    activeBatchId = detail.batchId;
    batchCounts = detail;
    if (detail.batchStage === 'failed' && detail.jobId) failedBatchJobIds.add(detail.jobId);
    if ((detail.batchStage === 'completed' || detail.batchStage === 'cached') && detail.jobId) failedBatchJobIds.delete(detail.jobId);
    els.batchQueueStatus.classList.remove('hidden');
    const batchProgressLabels = {
      verifying: 'Checking job details', analysis: 'Analyzing job', cached: 'Valid cache reused',
      completed: 'Job completed', failed: 'Job failed', cancelled: 'Remaining jobs cancelled.',
      complete: 'Batch analysis finished.', start: 'Checking remaining jobs against the current CV and JD.',
      collected: 'Job details collected', paused: 'JD collection paused. Return to the job page and run the batch again.',
    };
    if (detail.batchStage === 'failed' && detail.failureStage) {
      batchProgressLabels.failed = detail.failureStage === 'collection' ? 'JD collection failed' : 'AI analysis failed';
    }
    els.batchQueueProgress.textContent = `${t(batchProgressLabels[detail.batchStage] || message || 'Processing jobs...')}${detail.jobId ? `: ${currentListJobs.find(job => job.jobId === detail.jobId)?.title || detail.jobId}` : ''}`;
    renderBatchCounts();
    return;
  }
  const stages = ['start', 'validation', 'detection', 'sponsorship', 'analysis', 'parsing', 'retry', 'scoring', 'queue', 'complete'];
  const stageIndex = Math.max(0, stages.indexOf(stage));
  const progress = stage === 'complete'
    ? 100
    : Math.min(95, Math.round(((stageIndex + 1) / stages.length) * 100));

  els.progressFill.style.width = `${progress}%`;
  els.progressText.textContent = message || stage;
}

function handleResult(result) {
  const currentResumeHash = resumeProfiles.find(profile => profile.id === activeResumeId)?.hash || '';
  if (result?.analysisResumeHash && result.analysisResumeHash !== currentResumeHash) return;
  if (activeBatchResumeHash && !result?.batchId) return;
  if (result?.batchId) {
    if (activeBatchId && result.batchId !== activeBatchId) return;
    if (result.metadata?.capabilityScoreVersion === HOLISTIC_SCORE_VERSION && result.jdVerified === true) {
      scoreMap.set(result.jobId, {
        ...scoreMap.get(result.jobId), jobId: result.jobId, score: result.overallMatchPercent,
        capabilityScoreVersion: HOLISTIC_SCORE_VERSION, cacheState: 'Valid', jdVerified: true,
        analyzedAt: result.cachedAt || result.metadata.analysisTimestamp,
        title: result.jobTitle, company: result.company, location: result.location,
        sourceType: normalizeSourceType(result.sourceType), url: result.jobUrl,
        jdText: result.jdText, jdExtractionVersion: result.jdExtractionVersion || '',
        jobAnalysis: result.jobAnalysis,
        kmEligible: result.sponsorshipAssessment?.kmEligible === true, result,
      });
      renderJobList();
      if (jobsSubview === 'detail' && currentResultJobId === result.jobId
        && currentJDData?.jobId === result.jobId && currentJDData?.description === result.jdText) {
        currentResultPayload = result;
        els.resultsContainer.classList.remove('hidden');
        renderResult(result);
      }
    }
    return;
  }
  if (result?.jobId && normalizeSourceType(result.sourceType) !== 'inserted'
    && currentJDData?.jobId !== result.jobId && currentResultJobId !== result.jobId) return;
  const resultKey = getAnalysisResultKey(result);
  if (resultKey && resultKey === lastAnalysisResultKey) {
    if (isAnalyzing) {
      els.progressFill.style.width = '100%';
      els.progressText.textContent = result.fromCache ? 'Loaded cached result.' : 'Analysis complete.';
      window.setTimeout(() => {
        els.progressContainer.classList.add('hidden');
        resetAnalyzeButtons();
      }, 250);
    }
    return;
  }
  if (resultKey) {
    lastAnalysisResultKey = resultKey;
  }

  currentResultJobId = result?.jobId || currentResultJobId;
  currentResultPayload = result || null;

  if (typeof result?.overallMatchPercent === 'number' && result.jobId
    && result.metadata?.capabilityScoreVersion === HOLISTIC_SCORE_VERSION
    && (!result.metadata?.promptVersion || result.metadata.promptVersion === MATCH_PROMPT_VERSION)) {
    scoreMap.set(result.jobId, {
      jobId: result.jobId,
      sourceType: normalizeSourceType(result.sourceType),
      score: result.overallMatchPercent,
      capabilityScoreVersion: result.metadata?.capabilityScoreVersion || null,

      analyzedAt: result.cachedAt || result.metadata?.analysisTimestamp || new Date().toISOString(),
      title: result.jobTitle || result.title || '',
      company: result.company || '',
      location: result.location || '',
      url: result.jobUrl || '',
      jdLanguage: result.metadata?.jdLanguage || detectJdLanguageLabel(currentJDData?.description, result.jobTitle),
      requiredExperience: result.jobAnalysis?.version === JOB_ANALYSIS_VERSION
        ? result.metadata?.requiredExperience || null : null,
      requiredLanguages: result.metadata?.requiredLanguages || detectRequiredLanguages(currentJDData?.description, result.jobTitle),
      jobAnalysis: result.jobAnalysis || null,
      jdVerified: result.jdVerified === true || currentJDData?.jobId === result.jobId,
      cacheState: result.jdVerified === true || currentJDData?.jobId === result.jobId ? 'Valid' : 'Verifying',
      jdText: result.jdText || (currentJDData?.jobId === result.jobId ? currentJDData.description : ''),
      jdExtractionVersion: result.jdExtractionVersion || (currentJDData?.jobId === result.jobId ? currentJDData.extractionVersion || '' : ''),
      kmEligible: result.sponsorshipAssessment?.kmEligible === true,
      sponsorshipLabel: result.sponsorshipAssessment?.kmEligible ? 'KM' : null,
      sponsorshipCompany: result.sponsorshipAssessment?.registryMatchedName || null,
      sponsorshipConfidence: result.sponsorshipAssessment?.registryConfidence || null,
      keywordMatches: findKeywordMatches(
        currentJDData?.description,
        currentConfig?.titleDisplaySettings?.keywordList,
      ),
      result,
    });
    renderJobList();
    renderManualJobs();
    renderLibrary();
    if (currentJDData?.jobId === result.jobId) handleJDData(currentJDData);
  }

  els.progressFill.style.width = '100%';
  els.progressText.textContent = result.fromCache ? 'Loaded cached result.' : 'Analysis complete.';

  window.setTimeout(() => {
    els.progressContainer.classList.add('hidden');
    resetAnalyzeButtons();
    if (detailViewHost === 'list' && result?.sourceType !== 'inserted' && currentResultJobId === result?.jobId) {
      renderListDetailPanel(result);
    } else if (detailViewHost === 'manual' && result?.sourceType === 'inserted' && currentResultJobId === result?.jobId) {
      renderManualDetailPanel(result);
    } else if (detailViewHost === 'library' && currentResultJobId === result?.jobId) {
      renderLibraryDetailPanel(result);
    } else {
      els.resultsContainer.classList.remove('hidden');
      renderResult(result);
    }
    refreshPositionLibrary().catch(err => console.warn('Failed to refresh library after result:', err));
  }, 250);
}

function getAnalysisResultKey(result) {
  const timestamp = result?.metadata?.analysisTimestamp || result?.cachedAt || '';
  if (!result?.jobId || !timestamp) {
    return '';
  }
  return `${result.analysisResumeHash || activeResumeId || ''}|${result.jobId}|${result.sourceType || ''}|${timestamp}`;
}

function renderResult(result) {
  hideJobDetailPanel();
  hideLibraryDetailPanel();
  hideManualDetailPanel();
  detailViewHost = 'none';
  renderScoreRing(result.metadata?.capabilityScoreVersion === HOLISTIC_SCORE_VERSION
    ? result.overallMatchPercent : null);
  renderScoreStatus(result);
  els.resultSections.innerHTML = buildUnifiedAnalysisHtml(result, resolveOriginalJD(result));
  bindBreakdownExpand(els.resultSections);
  hideMetadataCard();

  const parts = [];
  if (result.jobTitle) {
    parts.push(result.jobTitle);
  }
  if (result.company) {
    parts.push(result.company);
  }

  const prefix = result.fromCache
    ? t(`Loaded from cache${result.cachedAt ? ` - ${formatTimestamp(result.cachedAt)}` : ''}`)
    : t('Latest analysis');
  els.resultContext.textContent = parts.length ? `${prefix} - ${parts.join(' @ ')}` : prefix;

  if (result.fromCache) {
    els.cachedResultHint.textContent = `Showing cached result for this job${result.cachedAt ? ` from ${formatTimestamp(result.cachedAt)}` : ''}.`;
    els.cachedResultHint.classList.remove('hidden');
  } else {
    els.cachedResultHint.classList.add('hidden');
  }

  updateSavePositionButton();
  updateAnalyzeButtons();
}

function renderScoreStatus(result) {
  const state = getScoreDisplay(result);

  els.scoreStatusBadge.className = `score-status-badge ${state.className}`;
  els.scoreStatusBadge.textContent = state.label;
  els.scoreStatusBadge.title = state.title;
  els.scoreStatusBadge.classList.toggle('hidden', !state.label);
}

function getScoreDisplay(result) {
  if (result?.metadata?.capabilityScoreVersion !== HOLISTIC_SCORE_VERSION || !Number.isFinite(result.overallMatchPercent)) {
    const message = result?.metadata?.promptVersion === MATCH_PROMPT_VERSION
      ? 'This analysis did not produce a valid Capability Fit score. Review Diagnostics.'
      : 'Legacy score; re-analyze to calculate Capability Fit.';
    return { label: t('Re-analyze Needed'), className: 'review', title: t(message) };
  }
  return { label: '', className: '', title: '' };
}

function handleAnalysisError({ error, details }) {
  els.progressContainer.classList.add('hidden');
  hideMetadataCard();
  resetAnalyzeButtons();
  showError(details && details !== error ? `${error || 'Analysis failed.'} ${details}` : (error || 'Analysis failed.'));
}

function renderScoreRing(score) {
  if (!Number.isFinite(score)) {
    els.scoreRingFill.style.strokeDashoffset = 2 * Math.PI * 52;
    els.scoreValue.textContent = '—';
    return;
  }
  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (score / 100) * circumference;
  const svg = els.scoreRingFill.closest('svg');

  if (!svg.querySelector('#scoreGradient')) {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${getGradientColor(score, 'start')}" />
        <stop offset="100%" stop-color="${getGradientColor(score, 'end')}" />
      </linearGradient>
    `;
    svg.insertBefore(defs, svg.firstChild);
  } else {
    const stops = svg.querySelectorAll('#scoreGradient stop');
    stops[0].setAttribute('stop-color', getGradientColor(score, 'start'));
    stops[1].setAttribute('stop-color', getGradientColor(score, 'end'));
  }

  requestAnimationFrame(() => {
    els.scoreRingFill.style.strokeDashoffset = offset;
  });

  animateNumber(els.scoreValue, 0, score, 900);
}

function renderScoreMeta(result) {
  els.scoreMeta.innerHTML = buildCapabilitySummaryHtml(result) + buildExplanationLanguageHtml(result)
    + buildScoreMetaLines(result).map(line => `<div>${escapeHtml(line)}</div>`).join('') + buildRubricHtml(result);
}

function buildCapabilitySummaryHtml(result) {
  if (result?.metadata?.capabilityScoreVersion !== HOLISTIC_SCORE_VERSION) {
    const message = result?.metadata?.promptVersion === MATCH_PROMPT_VERSION
      ? 'This analysis did not produce a valid Capability Fit score. Review Diagnostics.'
      : 'Legacy score; re-analyze to calculate Capability Fit.';
    return `<p class="hint-text">${escapeHtml(t(message))}</p>`;
  }
  return result.rubric?.scoreReason ? `<p>${escapeHtml(result.rubric.scoreReason)}</p>` : '';
}

function buildExplanationLanguageHtml(result) {
  const savedLanguage = result?.metadata?.analysisLanguage;
  const language = savedLanguage === 'zh-CN' ? t('Simplified Chinese') : t('English');
  const legacy = savedLanguage ? '' : ` · ${t('Legacy result; explanation language assumed English.')}`;
  const unverified = savedLanguage && result?.metadata?.explanationLanguageVerified !== true
    ? ` · ${t('Output language unverified; re-analyze for localized text.')}` : '';
  const heading = result?.metadata?.explanationLanguageVerified === true
    ? 'Explanation language' : 'Requested explanation language';
  return `<div class="analysis-language-note">${escapeHtml(t(heading))}: ${escapeHtml(language)}${escapeHtml(legacy)}${escapeHtml(unverified)}</div>`;
}

function responsibilityText(item, result) {
  const localized = item?.displayLanguage === getLocale()
    && result?.metadata?.analysisLanguage === getLocale() && typeof item?.displayText === 'string'
    && item.displayText.trim();
  return { text: localized || item?.label || '', original: !localized };
}

function buildJobAnalysisBadges(value) {
  if (!value || value.version !== JOB_ANALYSIS_VERSION) return '<div class="job-analysis-tags"></div>';
  const level = typeof value.careerLevel === 'string' ? value.careerLevel : value.careerLevel?.level;
  return `<div class="job-analysis-tags">${buildCareerLevelBadge(level, value.version)}</div>`;
}

function visibleJobAnalysis(item) {
  const promptVersion = item?.promptVersion || item?.result?.metadata?.promptVersion;
  if (promptVersion && promptVersion !== MATCH_PROMPT_VERSION) return null;
  return item?.jobAnalysis || item?.result?.jobAnalysis || (item ? {} : null);
}

function buildCareerLevelBadge(level, version) {
  if (normalizeTitleDisplaySettings(currentConfig?.titleDisplaySettings).visibleSignals[TITLE_SIGNAL_KEYS.CAREER_LEVEL] === false) return '';
  const display = careerLevelDisplay(level, version);
  if (display.level === 'Unknown') return '';
  return `<span class="career-level-badge career-level-${display.tone}" title="${escapeHtml(t('Career Level'))}: ${escapeHtml(t(display.level))}">${escapeHtml(t(display.level))}</span>`;
}

function buildRubricHtml(result) {
  const rubric = result.rubric;
  if (!rubric) return '';
  if (rubric.version === HOLISTIC_SCORE_VERSION) {
    return `<div class="rubric-summary"><div class="rubric-summary-header"><div>
      <h3>${escapeHtml(t('How to read this score'))}</h3>
      <p>${escapeHtml(t('AI holistic reference score; verified quotations are shown below.'))}</p>
      </div><span class="rubric-version">${escapeHtml(rubric.version)}</span></div></div>`;
  }
  const dimensions = (result.matchBreakdown || []).filter(item => Number(item.weight) > 0).length;
  const requirements = Array.isArray(rubric.requirements) ? rubric.requirements.length : 0;
  const warnings = Array.isArray(rubric.validationWarnings) ? rubric.validationWarnings : [];
  const hardConditions = Array.isArray(rubric.hardConditions) ? rubric.hardConditions : [];
  const excludedDimensions = Array.isArray(rubric.excludedDimensions) ? rubric.excludedDimensions : [];
  const notApplicableDimensions = Array.isArray(rubric.notApplicableDimensions) ? rubric.notApplicableDimensions : [];

  return `<div class="rubric-summary">
    <div class="rubric-summary-header">
      <div>
        <h3>How to read this score</h3>
        <p>${escapeHtml(t(rubric.advice || 'The score is calculated from the documented requirement evidence.'))}</p>
      </div>
      <span class="rubric-version">${escapeHtml(rubric.version || 'evidence')}</span>
    </div>
    <div class="rubric-stats" aria-label="Evidence score summary">
      <div class="rubric-stat"><strong>${rubric.evidenceCoverage ?? 0}%</strong><span>evidence coverage</span></div>
      <div class="rubric-stat"><strong>${requirements}</strong><span>requirements checked</span></div>
      <div class="rubric-stat"><strong>${dimensions}</strong><span>weighted dimensions</span></div>
    </div>
    <p class="rubric-note">Unknown means not documented, not inability. Open a dimension to inspect source quotations.</p>
    ${warnings.length ? `<p class="rubric-warning"><span aria-hidden="true">!</span>${warnings.length} evidence note${warnings.length === 1 ? '' : 's'} — review the affected rows.</p>` : ''}
    <details class="rubric-details">
      <summary>Scoring notes</summary>
      ${renderDetailList('Hard conditions · separate from score', hardConditions.map(r => `[${t(r.status)}] ${r.requirement} — ${r.reason}`))}
      ${renderDetailList('Not assessed', notApplicableDimensions)}
      ${renderDetailList('Not scored', excludedDimensions)}
      ${renderDetailList('Evidence notes', warnings)}
    </details>
  </div>`;
}

function renderBreakdown(breakdown, rubric = null) {
  if (rubric?.version === HOLISTIC_SCORE_VERSION) {
    els.breakdownList.innerHTML = buildHolisticEvidenceHtml(rubric);
    return;
  }
  if (!breakdown.length) {
    els.breakdownList.innerHTML = '<p class="hint-text">No breakdown data was returned.</p>';
    return;
  }

  els.breakdownList.innerHTML = buildBreakdownItemsHtml(breakdown, rubric);
  bindBreakdownExpand(els.breakdownList);
}

function buildHolisticEvidenceHtml(rubric) {
  const section = (label, points) => `<div class="job-detail-section"><h3>${escapeHtml(t(label))}</h3><ul class="job-analysis-evidence">${
    points.length ? points.map(point => `<li><strong>${escapeHtml(point.claim)}</strong>
      <span>${escapeHtml(t(point.evidenceKind))}</span>
      <div><span class="job-quote-source">${escapeHtml(t(point.jdSource))}</span><q translate="no">${escapeHtml(point.jdQuote)}</q></div>
      ${point.cvQuotes.map(quote => `<div><span class="job-quote-source">CV</span><q translate="no">${escapeHtml(quote)}</q></div>`).join('')}
      </li>`).join('') : `<li>${escapeHtml(t('No verified evidence point returned.'))}</li>`}</ul></div>`;
  return section('Strengths', rubric.strengths || []) + section('Risks & Gaps', rubric.risks || []);
}

function buildBreakdownItemsHtml(breakdown, rubric = null) {
  const hasRequirementMatrix = Array.isArray(rubric?.requirements);
  const visibleBreakdown = rubric?.version === HOLISTIC_SCORE_VERSION ? breakdown : hasRequirementMatrix
    ? breakdown.filter(item => rubric.requirements.some(row => row.dimension === item.itemName))
    : breakdown;

  return visibleBreakdown.map((item, index) => {
    const score = Number.isFinite(item.score) ? Math.round(item.score) : 0;
    const scoreClass = getScoreClass(score);
    const weight = Number(item.weight) || 0;
    const rows = Array.isArray(rubric?.requirements)
      ? rubric.requirements.filter(row => row.dimension === item.itemName)
      : [];
    const scoreLabel = weight > 0 ? score : 'N/A';
    const weightLabel = weight > 0 ? `${Math.round(weight * 100)}% weight` : 'Not scored';
    const detail = rows.length
      ? renderRequirementEvidence(rows)
      : [
        renderDetailList('Evidence', item.evidence),
        renderDetailList('Strengths', item.prosCons?.strengths),
        renderDetailList('Gaps', item.prosCons?.gaps),
      ].join('');

    return `
      <article class="breakdown-item" data-index="${index}">
        <button class="breakdown-toggle" type="button" aria-expanded="false">
          <span class="breakdown-item-header">
            <span class="breakdown-item-heading">
              <span class="breakdown-item-name">${escapeHtml(t(item.itemName))}</span>
              <span class="breakdown-item-summary">${escapeHtml(buildBreakdownSummary(rows, weight))}</span>
            </span>
            <span class="breakdown-item-score score-${scoreClass}">${scoreLabel}</span>
          </span>
          <span class="breakdown-bar" role="progressbar" aria-label="${escapeHtml(item.itemName)} score" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${score}">
            <span class="breakdown-bar-fill bar-${scoreClass}" style="width: ${Math.max(0, Math.min(100, score))}%"></span>
          </span>
          <span class="breakdown-item-footer">
            <span>${escapeHtml(weightLabel)}</span>
            <span class="breakdown-chevron" aria-hidden="true">⌄</span>
          </span>
        </button>
        <div class="breakdown-detail">
          ${detail}
        </div>
      </article>
    `;
  }).join('');
}

function buildBreakdownSummary(rows, weight) {
  if (!rows.length) {
    return 'Not assessed: no JD requirement was detected for this dimension.';
  }

  const counts = rows.reduce((acc, row) => {
    const status = ['met', 'partial', 'transferable', 'unmet', 'unknown'].includes(row.status) ? row.status : 'unknown';
    acc[status] += 1;
    return acc;
  }, { met: 0, partial: 0, transferable: 0, unmet: 0, unknown: 0 });
  const parts = [`${rows.length} requirement${rows.length === 1 ? '' : 's'}`];
  if (counts.met) parts.push(`${counts.met} matched`);
  if (counts.partial) parts.push(`${counts.partial} partial`);
  if (counts.transferable) parts.push(`${counts.transferable} transferable`);
  if (counts.unmet) parts.push(`${counts.unmet} gap${counts.unmet === 1 ? '' : 's'}`);
  if (counts.unknown) parts.push(`${counts.unknown} not documented`);
  return parts.map(part => t(part)).join(' · ');
}

function formatEvidenceLabel(value) {
  return t(String(value || 'unknown')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase()));
}

function renderRequirementEvidence(rows) {
  return `<div class="detail-section evidence-section">
    <div class="detail-section-heading">
      <div class="detail-title">Requirement evidence</div>
      <span class="detail-count">${rows.length}</span>
    </div>
    <div class="evidence-list">
      ${rows.map(row => {
        const status = ['met', 'partial', 'transferable', 'unmet', 'unknown'].includes(row.status) ? row.status : 'unknown';
        const resumeQuotes = Array.isArray(row.resumeQuotes) && row.resumeQuotes.length
          ? row.resumeQuotes.filter(Boolean)
          : (row.resumeQuote ? [row.resumeQuote] : []);
        const resumeEvidence = resumeQuotes.length
          ? resumeQuotes.map(quote => `<q translate="no">${escapeHtml(quote)}</q>`).join('<br>')
          : row.profileQuote ? `<q translate="no">${escapeHtml(row.profileQuote)}</q>`
            : `<span class="evidence-missing">${escapeHtml(t('Not documented in resume'))}</span>`;
        return `<article class="evidence-card evidence-card-${status}">
          <div class="evidence-card-header">
            <span class="evidence-status evidence-status-${status}">${escapeHtml(formatEvidenceLabel(status))}</span>
            <span class="evidence-importance">${escapeHtml(formatEvidenceLabel(row.importance))}${row.hard ? ` · ${escapeHtml(t('hard condition'))}` : ''}</span>
          </div>
          <p class="evidence-requirement">${escapeHtml(row.jdQuote)}</p>
          <div class="evidence-source-grid">
            <div class="evidence-source">
              <span class="evidence-source-label">${escapeHtml(t(row.jdSource || 'JD Body'))}</span>
              <q translate="no">${escapeHtml(row.jdQuote)}</q>
            </div>
            <div class="evidence-source">
              <span class="evidence-source-label">${escapeHtml(t(row.profileQuote ? 'User-confirmed Profile Data' : 'Original CV'))}</span>
              ${resumeEvidence}
            </div>
          </div>
          <p class="evidence-reason">${escapeHtml(t(row.reason || 'No explanation provided.'))}</p>
        </article>`;
      }).join('')}
    </div>
  </div>`;
}

function renderDetailList(title, items = []) {
  if (!items?.length) {
    return '';
  }

  return `
    <div class="detail-section">
      <div class="detail-section-heading">
        <div class="detail-title">${escapeHtml(title)}</div>
        <span class="detail-count">${items.length}</span>
      </div>
      <ul class="detail-list">
        ${items.map(entry => `<li${['Hard conditions · separate from score', 'Evidence'].includes(title) ? ' translate="no"' : ''}>${escapeHtml(['Hard conditions · separate from score', 'Evidence'].includes(title) ? entry : t(entry))}</li>`).join('')}
      </ul>
    </div>
  `;
}

function bindBreakdownExpand(container) {
  if (!container) {
    return;
  }

  container.querySelectorAll('.breakdown-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const item = toggle.closest('.breakdown-item');
      const expanded = item.classList.toggle('expanded');
      toggle.setAttribute('aria-expanded', String(expanded));
    });
  });
}

function renderInsights(strengths, gaps, unknowns) {
  els.strengthsList.innerHTML = buildInsightItemsHtml(strengths, 'No strengths returned.', 'strengths');
  els.gapsList.innerHTML = buildInsightItemsHtml(gaps, 'No gaps returned.', 'gaps');
  els.unknownsList.innerHTML = buildInsightItemsHtml(unknowns, 'No requirements need verification.', 'unknown');
}

function splitInsightItems(result = {}) {
  const rawGaps = Array.isArray(result.gaps) ? result.gaps : [];
  const explicitUnknowns = Array.isArray(result.unknowns) ? result.unknowns : [];
  const unknowns = [];
  [...explicitUnknowns, ...rawGaps.filter(item => /^unknown\s*:/i.test(String(item)))].forEach(item => {
    if (typeof item === 'string' && item.trim() && !unknowns.includes(item)) {
      unknowns.push(item);
    }
  });

  return {
    gaps: rawGaps.filter(item => !/^unknown\s*:/i.test(String(item))),
    unknowns,
  };
}

function buildInsightItemsHtml(items = [], fallbackText = '', tone = 'neutral') {
  if (!items?.length) {
    return `<li class="insight-empty">${escapeHtml(t(fallbackText))}</li>`;
  }

  return items.map(item => `
    <li class="insight-item">
      <span class="insight-marker insight-marker-${tone}" aria-hidden="true"></span>
      <span>${escapeHtml(localizeInsightPrefix(item))}</span>
    </li>
  `).join('');
}

function localizeInsightPrefix(value) {
  if (typeof value !== 'string' || getLocale() === 'en') return value;
  return value.replace(/^(met|partial|transferable|unmet|unknown): /i, (_, status) => `${t(status.toLowerCase())}：`);
}


async function openJobFromList(jobId) {
  if (!jobId) return;
  const requestId = ++jobSelectionSequence;
  const selectedResumeId = activeResumeId;
  const selectedResumeHash = resumeProfiles.find(profile => profile.id === selectedResumeId)?.hash || '';
  const previousJobId = currentResultJobId;
  currentResultJobId = jobId;
  const listJob = currentListJobs.find(job => job.jobId === jobId);
  const sourceType = normalizeSourceType(listJob?.sourceType || currentListSourceType);
  showJobsView('detail');
  if (previousJobId !== jobId) {
    els.resultsContainer.classList.add('hidden');
    currentResultPayload = null;
  }
  els.jdStatusBadge.textContent = t('Verifying');
  els.jdInfo.innerHTML = `<p class="hint-text">${escapeHtml(listJob?.title || t('Loading job details...'))}</p>`;
  els.cachedResultHint.textContent = t('Verifying this job and its saved analysis. Retry if the page is still loading.');
  els.cachedResultHint.classList.remove('hidden');
  const previousEntry = scoreMap.get(jobId);
  if (previousEntry) scoreMap.set(jobId, { ...previousEntry, cacheState: 'Verifying' });
  renderJobList();
  let response;
  try {
    response = await chrome.runtime.sendMessage({
      type: Actions.GET_VERIFIED_CACHED_RESULT,
      payload: { jobId },
    });
  } catch {
    response = { ok: false, status: 'Verifying' };
  }
  if (requestId !== jobSelectionSequence || activeResumeId !== selectedResumeId
    || (response?.resumeHash && response.resumeHash !== selectedResumeHash)) return;
  if (response?.jdData?.jobId === jobId) handleJDData(response.jdData);
  if (response?.status === 'Valid' && response.entry) {
    scoreMap.set(jobId, { ...response.entry, cacheState: 'Valid' });
  } else if (response?.status === 'Invalid') {
    scoreMap.delete(jobId);
  }
  renderJobList();
  if (requestId !== jobSelectionSequence || currentResultJobId !== jobId) return;
  const entry = response?.status === 'Valid' ? response.entry : null;
  if (entry?.result) {
    const listDetailResult = {
      ...entry.result,
      jobId: entry.jobId,
      sourceType: normalizeSourceType(entry.sourceType || sourceType),
      jobTitle: entry.title,
      company: entry.company,
      location: entry.location,
      jobUrl: entry.url,
      jdText: entry.jdText || '',
      fromCache: true,
      cachedAt: entry.analyzedAt,
      metadata: {
        ...(entry.result.metadata || {}),
        jdLanguage: entry.jdLanguage || entry.result.metadata?.jdLanguage || 'Unknown',
        requiredExperience: entry.requiredExperience || entry.result.metadata?.requiredExperience || null,
        requiredLanguages: entry.requiredLanguages || entry.result.metadata?.requiredLanguages || [],
      },
    };
    renderListDetailPanel(listDetailResult);
    return;
  }
  if (response?.status === 'Invalid') {
    els.resultsContainer.classList.add('hidden');
    els.cachedResultHint.textContent = t(previousEntry
      ? 'Cached result no longer matches this JD. Re-analyze this job.'
      : 'Not analyzed for this resume yet');
  } else {
    els.cachedResultHint.textContent = t('Verifying this job and its saved analysis. Retry if the page is still loading.');
  }
  scheduleRefreshPageContext();
}

async function openCachedResult(jobId, sourceType = 'linkedin', displayMode = 'results') {
  if (!jobId) {
    return;
  }

  currentResultJobId = jobId;
  renderJobList();
  renderManualJobs();
  renderLibrary();

  let entry = scoreMap.get(jobId) || null;
  if (!entry?.result && resumeText) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: Actions.GET_CACHED_SCORES,
        payload: { jobIds: [jobId], includeResult: true },
      });
      const hydrated = response?.entries?.[0];
      if (hydrated) {
        entry = {
          ...entry,
          ...hydrated,
          result: hydrated.result || entry?.result,
        };
        scoreMap.set(jobId, entry);
      }
    } catch {
      // Ignore hydration failures.
    }
  }

  if (entry?.result) {
    const hydratedResult = {
      ...entry.result,
      jobId: entry.jobId,
      sourceType: normalizeSourceType(sourceType || entry.sourceType),
      jobTitle: entry.title,
      company: entry.company,
      location: entry.location,
      jobUrl: entry.url,
      sourceUrl: entry.sourceUrl || entry.url,
      jdText: entry.jdText || '',
      fromCache: true,
      cachedAt: entry.analyzedAt,
      metadata: {
        ...(entry.result.metadata || {}),
        jdLanguage: entry.jdLanguage || entry.result.metadata?.jdLanguage || 'Unknown',
        requiredExperience: entry.requiredExperience || entry.result.metadata?.requiredExperience || null,
        requiredLanguages: entry.requiredLanguages || entry.result.metadata?.requiredLanguages || [],
      },
    };

    if (displayMode === 'list-detail') {
      renderListDetailPanel(hydratedResult);
    } else if (displayMode === 'manual-detail') {
      renderManualDetailPanel(hydratedResult);
    } else if (displayMode === 'library-detail') {
      renderLibraryDetailPanel(hydratedResult);
    } else {
      hideJobDetailPanel();
      hideLibraryDetailPanel();
      hideManualDetailPanel();
      els.resultsContainer.classList.remove('hidden');
      renderResult(hydratedResult);
    }
    return;
  }

  if (normalizeSourceType(sourceType) === 'inserted') {
    const manualJob = manualJobs.find(job => job.manualJobId === jobId);
    if (manualJob) {
      currentManualEditingId = manualJob.manualJobId;
      els.manualJobsBody.classList.remove('hidden');
      els.manualJobsToggle.textContent = 'Collapse';
      els.manualRawInput.value = manualJob.rawInput || '';
      els.manualTitle.value = manualJob.title || '';
      els.manualCompany.value = manualJob.company || '';
      els.manualLocation.value = manualJob.location || '';
      els.manualSourceUrl.value = manualJob.sourceUrl || '';
      els.manualDescription.value = manualJob.description || '';
      showManualSaveHint('This inserted job has not been analyzed yet. Review the fields and run analysis.', 'success');
    }
    return;
  }

  throw new Error('No cached result is available for this job yet.');
}

async function openLibraryItem(dataset) {
  const sourceType = normalizeSourceType(dataset.sourceType || librarySource);
  const jobId = dataset.jobId;
  if (!jobId) {
    return;
  }

  if (libraryMode === 'saved') {
    const saved = savedPositionsMap.get(buildPositionKey(jobId, sourceType));
    if (saved?.result) {
      renderLibraryDetailPanel({
        ...saved.result,
        jobId,
        sourceType,
        jobTitle: saved.title,
        company: saved.company,
        location: saved.location,
        jobUrl: saved.url,
        sourceUrl: saved.sourceUrl || saved.url,
        jdText: saved.summary?.jdText || saved.result.jdText || '',
        fromCache: true,
        cachedAt: saved.updatedAt || saved.savedAt,
      });
      return;
    }
  }

  await openCachedResult(jobId, sourceType, 'library-detail');
}


function updateSavePositionButton() {
  if (!currentResultPayload?.jobId) {
    els.savePositionBtn.classList.add('hidden');
    return;
  }

  const sourceType = normalizeSourceType(currentResultPayload.sourceType);
  const isSaved = savedPositionsMap.has(buildPositionKey(currentResultPayload.jobId, sourceType));
  els.savePositionBtn.classList.remove('hidden');
  els.savePositionBtn.classList.toggle('active', isSaved);
  els.savePositionBtn.textContent = isSaved ? '★' : '☆';
  els.savePositionBtn.title = isSaved ? 'Remove from saved positions' : 'Save position';
  els.savePositionBtn.setAttribute('aria-label', els.savePositionBtn.title);
  els.savePositionBtn.dataset.jobId = currentResultPayload.jobId;
  els.savePositionBtn.dataset.sourceType = sourceType;
}

function renderMetadata(meta) {
  els.metadataContent.innerHTML = buildListDetailMetadataHtml(meta);
  showMetadataCard();
}

function renderListDetailPanel(result) {
  currentResultJobId = result?.jobId || currentResultJobId;
  currentResultPayload = result || null;
  detailViewHost = 'none';
  renderJobList();
  els.resultsContainer.classList.remove('hidden');
  renderResult(result);
  showJobsView('detail');
}

function hideJobDetailPanel() {
  els.jobListCard.classList.remove('detail-open');
  els.jobDetailPanel.classList.add('hidden');
  els.jobDetailContent.innerHTML = '';
  if (detailViewHost === 'list') {
    detailViewHost = 'none';
  }
}

function renderLibraryDetailPanel(result) {
  currentResultJobId = result?.jobId || currentResultJobId;
  currentResultPayload = result || null;
  detailViewHost = 'library';
  renderJobList();
  renderManualJobs();
  renderLibrary();
  hideJobDetailPanel();
  hideManualDetailPanel();
  els.resultsContainer.classList.add('hidden');
  hideMetadataCard();
  els.libraryCard.classList.add('detail-open');
  els.libraryDetailPanel.classList.remove('hidden');
  els.libraryDetailContent.innerHTML = buildListDetailHtml(result);
  bindBreakdownExpand(els.libraryDetailContent);
  updateSavePositionButton();
}

function hideLibraryDetailPanel() {
  els.libraryCard.classList.remove('detail-open');
  els.libraryDetailPanel.classList.add('hidden');
  els.libraryDetailContent.innerHTML = '';
  if (detailViewHost === 'library') {
    detailViewHost = 'none';
  }
}

function renderManualDetailPanel(result) {
  currentResultJobId = result?.jobId || currentResultJobId;
  currentResultPayload = result || null;
  detailViewHost = 'manual';
  renderJobList();
  renderManualJobs();
  renderLibrary();
  hideJobDetailPanel();
  hideLibraryDetailPanel();
  els.resultsContainer.classList.add('hidden');
  hideMetadataCard();
  els.manualJobsCard.classList.add('detail-open');
  els.manualDetailPanel.classList.remove('hidden');
  els.manualDetailContent.innerHTML = buildListDetailHtml(result);
  bindBreakdownExpand(els.manualDetailContent);
  updateSavePositionButton();
}

function hideManualDetailPanel() {
  els.manualJobsCard.classList.remove('detail-open');
  els.manualDetailPanel.classList.add('hidden');
  els.manualDetailContent.innerHTML = '';
  if (detailViewHost === 'manual') {
    detailViewHost = 'none';
  }
}

function buildListDetailHtml(result) {
  const scoreStatus = getScoreDisplay(result);
  const score = result.metadata?.capabilityScoreVersion === HOLISTIC_SCORE_VERSION
    && Number.isFinite(result.overallMatchPercent)
    ? `${Math.round(result.overallMatchPercent || 0)}%` : escapeHtml(t('Re-analyze Needed'));
  return `<div class="job-detail-section detail-score-header">
    <div class="job-detail-headline">${escapeHtml(buildResultContextLine(result))}</div>
    <div class="detail-score-row"><strong class="job-detail-score">${score}</strong>
      ${scoreStatus.label ? `<span class="score-status-badge ${scoreStatus.className}" title="${escapeHtml(scoreStatus.title)}">${escapeHtml(scoreStatus.label)}</span>` : ''}</div>
    <div class="job-detail-caption">${escapeHtml(t('Capability Fit'))}</div>
  </div>${buildUnifiedAnalysisHtml(result, resolveOriginalJD(result))}`;
}

function resolveOriginalJD(result) {
  if (result?.jdText) return result.jdText;
  if (result?.summary?.jdText) return result.summary.jdText;
  const cached = scoreMap.get(result?.jobId);
  if (cached?.result?.metadata?.analysisTimestamp
    && cached.result.metadata.analysisTimestamp === result?.metadata?.analysisTimestamp) return cached.jdText || '';
  if (result?.fromCache) return '';
  if (currentJDData?.jobId && currentJDData.jobId === result?.jobId) return currentJDData.description || '';
  return manualJobs.find(job => job.manualJobId === result?.jobId)?.description || '';
}

function verifiedJobAnalysis(result) {
  return result?.jobAnalysis?.version === JOB_ANALYSIS_VERSION ? result.jobAnalysis : null;
}

function buildUnifiedAnalysisHtml(result, originalJD = '') {
  const analysis = verifiedJobAnalysis(result);
  const isCurrentScore = result?.metadata?.capabilityScoreVersion === HOLISTIC_SCORE_VERSION
    && Number.isFinite(result.overallMatchPercent);
  const summary = isCurrentScore ? result?.rubric?.scoreReason || '' : t(
    result?.metadata?.promptVersion === MATCH_PROMPT_VERSION
      ? 'This analysis did not produce a valid Capability Fit score. Review Diagnostics.'
      : 'Legacy score; re-analyze to calculate Capability Fit.');
  const insights = splitInsightItems(result);
  const unique = values => [...new Map(values.filter(Boolean).map(value =>
    [String(value).replace(/^unknown\s*:/i, '').trim().toLowerCase(), String(value).replace(/^unknown\s*:\s*/i, '').trim()])).values()];
  const risks = unique([...insights.gaps, ...insights.unknowns]).slice(0, 4);
  const strengths = unique(Array.isArray(result?.strengths) ? result.strengths : []).slice(0, 4);
  const list = (items, empty) => items.length
    ? `<ul class="concise-list">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : `<p class="hint-text">${escapeHtml(t(empty))}</p>`;
  const duties = Array.isArray(analysis?.mainResponsibilities) ? analysis.mainResponsibilities : [];
  const dutyHtml = duties.length ? `<ul class="concise-list">${duties.map(item => {
    const sources = Array.isArray(item.evidenceSources) ? item.evidenceSources : [];
    const duty = responsibilityText(item, result);
    return `<li>${duty.original ? `<span class="hint-text">${escapeHtml(t('Original JD wording'))}</span> ` : ''}${escapeHtml(duty.text)}${sources.length ? `<details class="inline-evidence"><summary>${escapeHtml(t('View evidence'))}</summary>${sources.map(source =>
      `<q translate="no">${escapeHtml(typeof source === 'string' ? source : source.quote || '')}</q>`).join('')}</details>` : ''}</li>`;
  }).join('')}</ul>` : `<p class="hint-text">${escapeHtml(t('No verified responsibilities summary available.'))}</p>`;
  const evidence = result?.rubric?.version === HOLISTIC_SCORE_VERSION
    ? buildHolisticEvidenceHtml(result.rubric)
    : (result?.matchBreakdown || []).length ? buildBreakdownItemsHtml(result.matchBreakdown, result.rubric) : '';
  const diagnostics = buildListDetailMetadataHtml(result?.metadata || {});
  return `<section class="card analysis-section analysis-overview">
      <h2>${escapeHtml(t('Overall assessment'))}</h2>
      ${isCurrentScore && result?.rubric?.explanationQuality?.status === 'review'
        ? `<p class="hint-text">${escapeHtml(t('Explanation needs review; the verified Capability Fit score remains available.'))}</p>` : ''}
      <p>${escapeHtml(summary || t('No explanation provided.'))}</p>
    </section>
    <section class="card analysis-section"><h2>${escapeHtml(t('Strengths / Risks & Gaps'))}</h2>
      <div class="insights-content"><div class="insight-group"><h3>${escapeHtml(t('Strengths'))}</h3>${list(strengths, 'No strengths returned.')}</div>
      <div class="insight-group"><h3>${escapeHtml(t('Risks & Gaps'))}</h3>${list(risks, 'No gaps returned.')}</div></div>
    </section>
    <section class="card analysis-section"><h2>${escapeHtml(t("What You'll Do"))}</h2>${dutyHtml}</section>
    <section class="card analysis-section"><details class="analysis-fold"><summary>${escapeHtml(t('Job Requirements'))}</summary>
      ${buildCompactRequirementsHtml(analysis, result)}</details></section>
    <section class="card analysis-section"><details class="analysis-fold"><summary>${escapeHtml(t('Evidence & Original JD'))}</summary>
      ${evidence || `<p class="hint-text">${escapeHtml(t('No verified evidence point returned.'))}</p>`}
      <details class="original-jd"><summary>${escapeHtml(t('Original JD'))}</summary>
        ${originalJD ? `<pre translate="no" class="jd-extracted-text">${escapeHtml(originalJD)}</pre>`
          : `<p class="hint-text">${escapeHtml(t('Original JD is unavailable for this saved result.'))}</p>`}</details>
    </details></section>
    <section class="card analysis-section"><details class="analysis-fold"><summary>${escapeHtml(t('Diagnostics'))}</summary>
      ${diagnostics}${buildExplanationLanguageHtml(result)}</details></section>`;
}

function buildCompactRequirementsHtml(analysis, result) {
  if (!analysis) return `<p class="hint-text">${escapeHtml(t('Re-analyze Needed'))}</p>`;
  const career = analysis.careerLevel || {};
  const experience = analysis.experienceRequirements || {};
  const languages = analysis.requiredLanguages || {};
  const dutch = analysis.dutchRequirement || { status: languages.relation === 'OR' ? 'Optional'
    : languages.items?.find(item => item.language === 'Dutch')?.requirementType || 'Unknown',
    evidenceSources: languages.items?.find(item => item.language === 'Dutch')?.evidenceSources || [] };
  const quotes = sources => (sources || []).length
    ? `<details class="inline-evidence"><summary>${escapeHtml(t('View evidence'))}</summary>${sources.map(source =>
      `<q translate="no">${escapeHtml(typeof source === 'string' ? source : source.quote || '')}</q>`).join('')}</details>` : '';
  const rows = [];
  if (analysis.schemaVersion !== 'job-analysis-v6' || analysis.schemaValid === false || analysis.reviewNeeded) rows.push(`<p class="hint-text">${escapeHtml(t('Job metadata incomplete; the verified capability score remains available.'))}</p>`);
  if (career.level && career.level !== 'Unknown') rows.push(`<div><strong>${escapeHtml(t('Career Level'))}: ${escapeHtml(t(career.level))}</strong>
    ${career.confidence ? ` · ${escapeHtml(t(career.confidence))} ${escapeHtml(t('confidence'))}` : ''}
    ${(career.reasons || []).map(reason => `<p>${escapeHtml(reason)}</p>`).join('')}${quotes(career.evidenceSources || career.supportingEvidence)}</div>`);
  rows.push(`<div><strong>${escapeHtml(t('Dutch Required'))}: ${escapeHtml(t(dutch.status || 'Unknown'))}</strong>
    ${dutch.reason ? `<p>${escapeHtml(dutch.reason)}</p>` : ''}${quotes(dutch.evidenceSources || dutch.supportingEvidence)}</div>`);
  rows.push(`<div><strong>${escapeHtml(t('Experience Required'))}</strong>
    ${(experience.items || []).length ? `<ul>${experience.items.map(item => `<li>${escapeHtml(String(item.minimumYears))}${item.maximumYears == null ? '+' : `–${escapeHtml(String(item.maximumYears))}`} ${escapeHtml(t('years'))} · ${escapeHtml(t(item.requirementType))}${quotes(item.evidenceSources || item.supportingEvidence)}</li>`).join('')}</ul>`
      : `<p>${escapeHtml(t(experience.reviewNeeded ? 'Unknown — review evidence' : 'Not Specified'))}</p>`}
    ${(experience.acceptedAlternatives || []).length ? `<p>${escapeHtml(t('Accepted alternatives'))}: ${escapeHtml(experience.acceptedAlternatives.join('; '))}</p>` : ''}</div>`);
  if (result?.sponsorshipAssessment?.kmEligible) rows.push(`<p class="hint-text">${escapeHtml(t('Employer matched in the IND recognized sponsor register; this vacancy is not confirmed to sponsor.'))}</p>`);
  return `<div class="job-analysis-grid compact-requirements">${rows.join('')}</div>`;
}

function buildResultContextLine(result) {
  const title = result.jobTitle || 'Cached analysis';
  const prefix = result.fromCache
    ? t(`Loaded from cache${result.cachedAt ? ` - ${formatTimestamp(result.cachedAt)}` : ''}`)
    : t('Latest analysis');
  return `${prefix} - ${title}`;
}

function buildScoreMetaLines(result) {
  if (result.rubric) return [];
  const lines = [];
  if (result.metadata?.rawScoreBeforePenalty !== undefined) {
    lines.push(`Raw score: ${result.metadata.rawScoreBeforePenalty}`);
  }

  return lines;
}

function buildInsightListHtml(items = [], fallbackText = '', tone = 'neutral') {
  return `<ul class="insight-list insight-list-${tone}">${buildInsightItemsHtml(items, fallbackText, tone)}</ul>`;
}

function buildListDetailMetadataHtml(meta) {
  const report = buildDiagnosticReport(meta);
  const copyId = registerDiagnosticCopy(report);
  const rows = [
    ['Result stage', report.stage],
    ['Suggested next step', report.nextStep],
    ['Extension version', report.version],
    ['Request endpoint', report.endpoint || 'N/A'],
    ['Protocol', report.protocol || 'N/A'],
    ['Failure kind', report.failureKind || 'None recorded'],
    ['Timeout source', report.timeoutSource || 'N/A'],
    ['Returned model', report.returnedModel || 'Not reported'],
    ['HTTP status', report.httpStatus || 'Not recorded'],
    ['Finish reason', report.finishReason || 'N/A'],
    ['JD / resume characters', `${report.jdCharacters ?? 'N/A'} / ${report.resumeCharacters ?? 'N/A'}`],
    ['Response characters', report.responseCharacters ?? 'N/A'],
    ['Response format', report.responseFormat || 'N/A'],
    ['JSON retry reason', report.retryReason || 'None recorded'],
    ['JSON parse attempts', report.jsonAttempts.length ? JSON.stringify(report.jsonAttempts) : 'None recorded'],
    ['Output limit / timeout', `${report.maxTokens ?? 'N/A'} tokens / ${report.timeoutMs ?? 'N/A'} ms`],
    ['Configured retries', report.configuredRetries ?? 'N/A'],
    ['Parse retry failure', report.retryFailure || 'None recorded'],
    ['Parse retry HTTP status', report.retryHttpStatus || 'Not recorded'],
    ['Prompt version', report.promptVersion || 'N/A'],
    ['Schema errors', report.schemaErrors.join('; ') || 'None recorded'],
    ['JD metadata schema errors', report.jobAnalysisSchemaErrors.join('; ') || 'None recorded'],
    ['Explanation quality', report.explanationIssues.join('; ') || 'No issue recorded'],
    ['Responsibility validation', report.responsibilities
      ? ['MODEL_FIELD_MISSING', 'MODEL_SCHEMA_INVALID', 'EVIDENCE_MATCH_FAILED', 'EVIDENCE_INSUFFICIENT', 'VALIDATED']
        .map(code => `${code}: ${report.responsibilities[code] || 0}`).join(', ')
      : 'Not recorded'],
    ['Responsibility rejection reasons', report.responsibilities?.reasons
      ? Object.entries(report.responsibilities.reasons).map(([code, count]) => `${code}: ${count}`).join(', ')
      : 'Not recorded'],
    ['JD quotation failures', report.jdEvidenceFailures
      ? Object.entries(report.jdEvidenceFailures).map(([code, count]) => `${code}: ${count}`).join(', ') || 'None recorded'
      : 'Not recorded'],
    ['Analysis time', meta.analysisTimestamp || 'N/A'],
    ['Provider', meta.providerUsed || 'N/A'],
    ['Model', meta.modelUsed || 'N/A'],
    ['Analysis mode', getPresetLabel(meta.analysisPreset || DEFAULT_ANALYSIS_PRESET)],
    ['Profile type', meta.isCustomProfile ? 'Custom' : 'Preset'],
    ['Raw score', meta.rawScoreBeforePenalty ?? 'N/A'],
    ['Total time', formatTiming(meta.timing?.totalMs)],
    ['LLM time', formatTiming(meta.timing?.llmMs)],
    ['Extract time', formatTiming(meta.timing?.extractMs)],
    ['Parse retry used', meta.timing?.usedRetry ? 'Yes' : 'No'],
    ['Triggers', meta.degradationTriggers?.join(', ') || 'None'],
  ];

  return `<button type="button" class="btn-secondary" data-copy-diagnostics="${copyId}">Copy diagnostics</button><p class="field-hint">Includes request metadata only; excludes API keys, resume text and job description text. These details describe this saved analysis.</p>` + rows.map(([name, value]) => `
    <div class="meta-row">
      <span class="meta-label">${escapeHtml(t(name))}</span>
      <span class="meta-value">${escapeHtml(String(value))}</span>
    </div>
  `).join('');
}

function getGradientColor(score, position) {
  if (score >= 75) {
    return position === 'start' ? '#147d4f' : '#2ab070';
  }
  if (score >= 50) {
    return position === 'start' ? '#d97706' : '#f2a541';
  }
  return position === 'start' ? '#b42318' : '#de6258';
}

function getScoreClass(score) {
  if (score >= 75) {
    return 'high';
  }
  if (score >= 50) {
    return 'medium';
  }
  return 'low';
}

function animateNumber(element, from, to, duration) {
  const start = performance.now();

  const step = now => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = Math.round(from + (to - from) * eased).toString();

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  };

  requestAnimationFrame(step);
}

async function refreshPageScores() {
  const activeTab = await getActiveTab();
  if (!activeTab?.id) {
    return;
  }

  try {
    await sendTabMessageWithInjection(activeTab.id, { type: Actions.REFRESH_SCORES });
  } catch {
    // Ignore missing content scripts.
  }
}

async function getActiveTab() {
  const currentWindowTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (currentWindowTabs[0]) {
    return currentWindowTabs[0];
  }

  const lastFocusedTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return lastFocusedTabs[0] || null;
}

async function ensureLinkedInContentScript(tabId) {
  if (!tabId) {
    return false;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content/index.js'],
    });
    return true;
  } catch {
    return false;
  }
}

async function sendTabMessageWithInjection(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    const injected = await ensureLinkedInContentScript(tabId);
    if (!injected) {
      throw error;
    }

    await new Promise(resolve => window.setTimeout(resolve, 150));
    return chrome.tabs.sendMessage(tabId, message);
  }
}

function setupTabWatchers() {
  const safeRefresh = () => {
    scheduleRefreshPageContext();
  };

  chrome.tabs.onActivated.addListener(() => {
    safeRefresh();
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete') {
      return;
    }

    if (!tab?.active) {
      return;
    }

    safeRefresh();
  });

  chrome.windows.onFocusChanged.addListener(() => {
    safeRefresh();
  });
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return 'recently';
  }

  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return timestamp;
  }
}

function detectJdLanguageLabel(description = '', title = '') {
  const text = `${title || ''}\n${description || ''}`.trim();
  if (!text) {
    return 'Unknown';
  }

  if (/[\u4e00-\u9fff]/.test(text)) {
    return 'Chinese';
  }

  const normalized = ` ${text.toLowerCase()} `;
  const scores = [
    { label: 'English', score: countLanguageHits(normalized, [' the ', ' and ', ' with ', ' for ', ' experience ', ' role ', ' responsibilities ']) },
    { label: 'Dutch', score: countLanguageHits(normalized, [' de ', ' het ', ' een ', ' en ', ' van ', ' voor ', ' met ', ' ervaring ']) },
    { label: 'German', score: countLanguageHits(normalized, [' der ', ' die ', ' das ', ' und ', ' mit ', ' f眉r ', ' erfahrung ', ' aufgaben ']) },
    { label: 'French', score: countLanguageHits(normalized, [' le ', ' la ', ' les ', ' des ', ' pour ', ' avec ', ' exp茅rience ']) },
    { label: 'Spanish', score: countLanguageHits(normalized, [' el ', ' la ', ' los ', ' para ', ' con ', ' experiencia ', ' responsabilidades ']) },
  ];

  scores.sort((a, b) => b.score - a.score);
  return scores[0].score > 0 ? scores[0].label : 'English';
}

function countLanguageHits(text, patterns) {
  return patterns.reduce((sum, pattern) => sum + (text.includes(pattern) ? 1 : 0), 0);
}

function detectRequiredExperience(description = '') {
  const requirement = extractExperienceRequirements(description).items.find(item => item.requirementType === 'Mandatory'
    && !['Academic', 'Internship'].includes(item.experienceKind));
  return requirement ? `${requirement.minimumYears}${requirement.maximumYears === null ? '+' : `-${requirement.maximumYears}`}y` : null;
}

function detectRequiredLanguages(description = '', title = '') {
  const text = `${title || ''}\n${description || ''}`.toLowerCase();
  if (!text.trim()) {
    return [];
  }

  const candidates = [
    { label: 'English', patterns: [/\benglish\b/, /\bfluent in english\b/, /\bprofessional english\b/] },
    { label: 'Dutch', patterns: [/\bdutch\b/, /\bnederlands\b/] },
    { label: 'German', patterns: [/\bgerman\b/, /\bdeutsch\b/] },
    { label: 'French', patterns: [/\bfrench\b/, /\bfrancais\b/, /\bfran莽ais\b/] },
    { label: 'Spanish', patterns: [/\bspanish\b/, /\bespanol\b/, /\bespa帽ol\b/] },
    { label: 'Italian', patterns: [/\bitalian\b/, /\bitaliano\b/] },
    { label: 'Portuguese', patterns: [/\bportuguese\b/, /\bportugues\b/, /\bportugu锚s\b/] },
    { label: 'Chinese', patterns: [/\bchinese\b/, /\bmandarin\b/, /\bcantonese\b/] },
    { label: 'Japanese', patterns: [/\bjapanese\b/] },
  ];

  const matches = [];
  for (const candidate of candidates) {
    if (candidate.patterns.some(pattern => pattern.test(text))) {
      matches.push(candidate.label);
    }
  }

  return matches.slice(0, 3);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanJobTitle(title, signalData = {}) {
  const original = String(title || '').replace(/\s+/g, ' ').trim();
  if (!original) {
    return '';
  }

  const languageList = Array.isArray(signalData.requiredLanguages)
    ? signalData.requiredLanguages.filter(Boolean).slice(0, 3)
    : [];
  const settings = normalizeTitleDisplaySettings(currentConfig?.titleDisplaySettings);
  const labels = [
    signalData.kmEligible ? 'KM Sponsor' : '',
    signalData.kmEligible ? 'KM' : '',
    signalData.jdLanguage && signalData.jdLanguage !== 'Unknown' ? `JD: ${signalData.jdLanguage}` : '',
    languageList.length ? `Lang: ${languageList.join(' / ')}` : '',
    signalData.requiredExperience ? `Exp: ${signalData.requiredExperience}` : '',
    ...normalizeKeywordList(signalData.keywordMatches)
      .map(keyword => formatKeywordMarker(keyword, settings.keywordStyle)),
  ]
    .flatMap(label => [label, typeof t === 'function' ? t(label, 'zh-CN') : label])
    .map(label => String(label || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  let cleaned = original;
  let removed = true;
  while (removed && cleaned) {
    removed = false;
    for (const label of labels) {
      const markerPattern = new RegExp(`${escapeRegExp(label)}\\s*$`, 'i');
      if (!markerPattern.test(cleaned)) {
        continue;
      }
      cleaned = cleaned.replace(markerPattern, '').trim();
      removed = true;
      break;
    }
  }

  return cleaned || original;
}

function buildJdTitleBadges({
  jdLanguage,
  requiredExperience,
  requiredLanguages,
  kmEligible,
  workPermitSponsorship,
  dutchRequirement,
  keywordMatches = [],
}) {
  const settings = normalizeTitleDisplaySettings(currentConfig?.titleDisplaySettings);
  const colors = getTitleDisplayColors(settings);
  const languageList = Array.isArray(requiredLanguages)
    ? requiredLanguages.filter(Boolean).slice(0, 3)
    : [];
  const signalLabels = {
    [TITLE_SIGNAL_KEYS.KM]: kmEligible ? 'KM Sponsor' : '',
    [TITLE_SIGNAL_KEYS.JD_LANGUAGE]: jdLanguage && jdLanguage !== 'Unknown' ? `JD: ${jdLanguage}` : '',
    [TITLE_SIGNAL_KEYS.REQUIRED_LANGUAGE]: dutchRequirement === 'Mandatory' ? 'Dutch Required' : '',
    [TITLE_SIGNAL_KEYS.EXPERIENCE]: requiredExperience ? `Exp: ${requiredExperience}` : '',

  };
  const signalTitles = {
    [TITLE_SIGNAL_KEYS.KM]: 'Employer matched in the IND recognized sponsor register; this vacancy is not confirmed to sponsor.',
    [TITLE_SIGNAL_KEYS.JD_LANGUAGE]: `Language detected in the JD: ${jdLanguage || 'Unknown'}`,
    [TITLE_SIGNAL_KEYS.REQUIRED_LANGUAGE]: 'Mandatory Dutch requirement verified in this JD.',
    [TITLE_SIGNAL_KEYS.EXPERIENCE]: `Experience requirement: ${requiredExperience || 'Not detected'}`,

  };
  const badges = [];

  for (const signalKey of TITLE_SIGNAL_ORDER) {
    if (settings.visibleSignals[signalKey] === false || !signalLabels[signalKey]) {
      continue;
    }
    badges.push(buildTitleSignalPill(
      signalKey,
      signalLabels[signalKey],
      colors[signalKey],
      signalTitles[signalKey],
      null,
    ));
  }

  return badges.length ? ` ${badges.join('')}` : '';
}

function buildTitleSignalPill(signalKey, label, backgroundColor, title, tone = null) {
  const safeColor = normalizeHexColor(backgroundColor, '#6f5b49');
  const palette = tone || badgeColorsForAccent(safeColor);
  return `<span class="title-signal-pill title-signal-pill-${signalKey}" style="background-color:${palette.background};color:${palette.color};border-color:${palette.border}" title="${escapeHtml(t(title))}">${escapeHtml(t(label))}</span>`;
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

function buildSaveStarButton(jobId, sourceType, isSaved) {
  const label = isSaved ? 'Remove from saved positions' : 'Save position';
  const normalizedSourceType = normalizeSourceType(sourceType);
  return `<button class="star-btn${isSaved ? ' active' : ''}" data-save-job-id="${escapeHtml(jobId)}" data-source-type="${escapeHtml(normalizedSourceType)}" type="button" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${isSaved ? '★' : '☆'}</button>`;
}

function buildResultTitleSuffix(result) {
  const suffix = [];
  const jdLanguage = result.metadata?.jdLanguage;
  const requiredExperience = result.metadata?.requiredExperience;
  const requiredLanguages = Array.isArray(result.metadata?.requiredLanguages) ? result.metadata.requiredLanguages : [];

  if (jdLanguage && jdLanguage !== 'Unknown') {
    suffix.push(jdLanguage);
  }
  if (requiredExperience) {
    suffix.push(requiredExperience);
  }
  if (requiredLanguages.length) {
    suffix.push(requiredLanguages.slice(0, 2).join('/'));
  }
  if (result.sponsorshipAssessment?.kmEligible) {
    suffix.push('KM');
  }

  return suffix;
}

function handleProviderChange() {
  if (!currentConfig) {
    return;
  }

  const nextProvider = els.settingProvider.value;
  if (nextProvider === ADD_PROVIDER_VALUE) {
    els.settingProvider.value = currentConfig.provider || '';
    openAddProviderDialog();
    return;
  }

  if (!getProviderDefinition(nextProvider)) {
    renderProviderOptions(currentConfig.provider);
    return;
  }

  const previousProvider = currentConfig.provider || nextProvider;

  if (previousProvider === nextProvider) {
    return;
  }

  providerSwitchToken += 1;
  invalidateConnectionTest();
  syncCurrentProviderDraft(previousProvider);
  currentConfig.provider = nextProvider;
  applyProviderProfileToForm(nextProvider);
}

function hydrateProviderProfiles(config) {
  const normalized = normalizeProviderConfig(config || {});
  const providerDefinitions = getProviderDefinitions(normalized);
  const activeProvider = providerDefinitions.some(provider => provider.id === normalized.provider)
    ? normalized.provider
    : providerDefinitions[0]?.id || '';
  const providerProfiles = { ...(normalized.providerProfiles || {}) };

  providerDefinitions.forEach(provider => {
    if (providerProfiles[provider.id]) {
      providerProfiles[provider.id] = {
        ...providerProfiles[provider.id],
        modelIds: Array.isArray(providerProfiles[provider.id].modelIds)
          ? [...providerProfiles[provider.id].modelIds]
          : [],
      };
      return;
    }
    providerProfiles[provider.id] = createProviderProfile(provider.id, normalized);
  });

  const activeProfile = providerProfiles[activeProvider]
    || createProviderProfile(activeProvider, { ...normalized, providerDefinitions });

  return {
    ...normalized,
    configVersion: 2,
    providerDefinitions,
    provider: activeProvider,
    baseUrl: activeProfile?.baseUrl || '',
    apiKey: activeProfile?.apiKey || '',
    protocol: activeProfile?.protocol || '',
    modelId: activeProfile?.modelId || '',
    modelIds: Array.isArray(activeProfile?.modelIds) ? [...activeProfile.modelIds] : [],
    maxTokens: activeProfile?.maxTokens,
    temperature: activeProfile?.temperature,
    timeoutMs: activeProfile?.timeoutMs,
    maxRetries: activeProfile?.maxRetries,
    analysisPreset: normalized?.analysisPreset || DEFAULT_ANALYSIS_PRESET,
    promptTuningMode: normalized?.promptTuningMode || normalized?.analysisPreset || DEFAULT_ANALYSIS_PRESET,
    includeSponsorshipInScore: normalized?.includeSponsorshipInScore !== false,
    useCustomWeights: normalized?.useCustomWeights === true,
    customWeights: sanitizeCustomWeights(normalized?.customWeights),
    additionalPromptInstructions: typeof normalized?.additionalPromptInstructions === 'string'
      ? normalized.additionalPromptInstructions
      : '',
    customPromptTemplate: typeof normalized?.customPromptTemplate === 'string'
      ? normalized.customPromptTemplate
      : '',
    enableDiagnostics: normalized?.enableDiagnostics !== false,
    titleDisplaySettings: normalizeTitleDisplaySettings(normalized?.titleDisplaySettings),
    providerProfiles,
  };
}

function renderProviderOptions(providerId = currentConfig?.provider) {
  const definitions = getProviderDefinitions(currentConfig || {});
  els.settingProvider.replaceChildren();

  definitions.forEach(provider => {
    const option = document.createElement('option');
    option.value = provider.id;
    option.textContent = provider.name;
    els.settingProvider.append(option);
  });

  const addOption = document.createElement('option');
  addOption.value = ADD_PROVIDER_VALUE;
  addOption.textContent = '+ Add provider';
  els.settingProvider.append(addOption);

  if (definitions.some(provider => provider.id === providerId)) {
    els.settingProvider.value = providerId;
  } else if (definitions[0]) {
    els.settingProvider.value = definitions[0].id;
  }
}

function getProviderDefinition(providerId, config = currentConfig) {
  return getProviderDefinitions(config || {}).find(provider => provider.id === providerId) || null;
}

function applyProviderProfileToForm(providerId) {
  if (!currentConfig || !providerId) {
    return;
  }

  currentConfig.providerProfiles = currentConfig.providerProfiles || {};
  const profile = currentConfig.providerProfiles[providerId]
    || createProviderProfile(providerId, currentConfig);
  currentConfig.providerProfiles[providerId] = profile;
  const activeModel = typeof profile.modelId === 'string' ? profile.modelId.trim() : '';
  const savedModels = Array.isArray(profile.modelIds) ? [...profile.modelIds] : [];
  const provider = getProviderDefinition(providerId);

  els.settingProvider.value = providerId;
  els.settingBaseUrl.value = profile.baseUrl || '';
  els.settingApiKey.value = profile.apiKey || '';
  renderModelOptions(savedModels, activeModel);
  els.settingProviderProtocol.textContent = `Protocol: ${profile.protocol || provider?.protocol || 'Not set'}`;
  els.settingMaxTokens.value = profile.maxTokens ?? 4096;
  els.settingTemperature.value = profile.temperature ?? 0.1;
  els.settingTimeout.value = ((profile.timeoutMs ?? 60000) / 1000).toString();
  els.settingRetries.value = profile.maxRetries ?? 2;
  hideModelDraft();
}

function syncCurrentProviderDraft(providerOverride = null) {
  if (!currentConfig) {
    return;
  }

  const providerId = providerOverride || currentConfig.provider || els.settingProvider.value;
  if (!providerId || providerId === ADD_PROVIDER_VALUE) {
    return;
  }
  currentConfig.providerProfiles = currentConfig.providerProfiles || {};
  currentConfig.providerProfiles[providerId] = readProviderForm(providerId);
  currentConfig.provider = providerId;
}

function readProviderForm(providerOverride = null) {
  const providerId = providerOverride || els.settingProvider.value;
  const existing = currentConfig?.providerProfiles?.[providerId] || {};
  const provider = getProviderDefinition(providerId);
  const activeModel = els.settingModel.value.trim();
  const modelIds = Array.isArray(existing.modelIds) ? [...existing.modelIds] : [];
  const maxTokens = Number.parseInt(els.settingMaxTokens.value, 10);
  const temperature = Number.parseFloat(els.settingTemperature.value);
  const timeoutSeconds = Number.parseInt(els.settingTimeout.value, 10);
  const maxRetries = Number.parseInt(els.settingRetries.value, 10);

  return {
    baseUrl: els.settingBaseUrl.value.trim(),
    apiKey: els.settingApiKey.value.trim(),
    protocol: existing.protocol || provider?.protocol || '',
    modelId: activeModel,
    modelIds,
    maxTokens: Number.isFinite(maxTokens) ? maxTokens : (existing.maxTokens ?? 4096),
    temperature: Number.isFinite(temperature) ? temperature : (existing.temperature ?? 0.1),
    timeoutMs: Number.isFinite(timeoutSeconds)
      ? timeoutSeconds * 1000
      : (existing.timeoutMs ?? 60000),
    maxRetries: Number.isFinite(maxRetries) ? maxRetries : (existing.maxRetries ?? 2),
  };
}

function renderModelOptions(modelIds, activeModel) {
  const options = [];
  const seen = new Set();
  (Array.isArray(modelIds) ? modelIds : []).forEach(modelId => {
    const normalized = typeof modelId === 'string' ? modelId.trim() : '';
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      options.push({ value: normalized, label: normalized });
    }
  });
  if (activeModel && !seen.has(activeModel)) {
    options.push({ value: activeModel, label: `${activeModel} (active)` });
  }

  els.settingModel.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = options.length ? 'Select a model' : 'No models saved';
  els.settingModel.append(placeholder);
  options.forEach(({ value, label }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    els.settingModel.append(option);
  });
  els.settingModel.value = activeModel || '';
  els.removeModelBtn.disabled = !activeModel;
}

function syncActiveModelSelection() {
  if (!currentConfig || !els.settingProvider.value || els.settingProvider.value === ADD_PROVIDER_VALUE) {
    return;
  }
  currentConfig.providerProfiles = currentConfig.providerProfiles || {};
  const profile = currentConfig.providerProfiles[els.settingProvider.value]
    || createProviderProfile(els.settingProvider.value, currentConfig);
  currentConfig.providerProfiles[els.settingProvider.value] = {
    ...profile,
    modelId: els.settingModel.value.trim(),
  };
}

function openModelDraft() {
  invalidateConnectionTest();
  els.modelDraftForm.classList.remove('hidden');
  els.settingNewModel.focus();
}

function hideModelDraft() {
  els.modelDraftForm.classList.add('hidden');
  els.settingNewModel.value = '';
}

function addTestedModelToDraft(providerId, modelId, formSnapshot) {
  if (!currentConfig || currentConfig.provider !== providerId || els.settingProvider.value !== providerId) {
    return;
  }

  const modelIds = Array.isArray(formSnapshot.modelIds) ? [...formSnapshot.modelIds] : [];
  if (!modelIds.includes(modelId)) {
    modelIds.push(modelId);
  }
  currentConfig.providerProfiles = currentConfig.providerProfiles || {};
  currentConfig.providerProfiles[providerId] = {
    ...formSnapshot,
    modelId,
    modelIds,
  };
  renderModelOptions(modelIds, modelId);
  hideModelDraft();
  showSaveHint('Model added to the draft. Save settings to keep it.', 'success');
}

function removeSelectedModel() {
  if (!currentConfig) {
    return;
  }

  const providerId = els.settingProvider.value;
  const selectedModel = els.settingModel.value.trim();
  if (!selectedModel) {
    showSaveHint('Choose a model to remove.', 'error');
    return;
  }

  invalidateConnectionTest();
  const snapshot = readProviderForm(providerId);
  const modelIds = snapshot.modelIds.filter(modelId => modelId !== selectedModel);
  const nextModel = '';
  currentConfig.providerProfiles[providerId] = {
    ...snapshot,
    modelId: nextModel,
    modelIds,
  };
  renderModelOptions(modelIds, nextModel);
  showSaveHint('Model removed from the draft. Save settings to keep it.', 'success');
}

function setTestConnectionHint(text, type = '') {
  els.testConnectionHint.textContent = text;
  els.testConnectionHint.className = `save-hint${type ? ` ${type}` : ''}`;
}

function invalidateConnectionTest() {
  connectionRequestToken += 1;
  isTestingConnection = connectionRequestsInFlight > 0;
  els.testConnectionBtn.disabled = isTestingConnection;
  els.testAddModelBtn.disabled = isTestingConnection;
  setTestConnectionHint('', '');
}

function createStableCustomProviderId() {
  const uuid = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `custom_${uuid}`;
}

function openAddProviderDialog() {
  if (els.addProviderDialog.open) {
    return;
  }
  els.addProviderName.value = '';
  els.addProviderBaseUrl.value = '';
  els.addProviderProtocol.value = 'openai-compatible';
  els.addProviderHint.textContent = '';
  els.addProviderHint.className = 'save-hint';
  els.addProviderDialog.showModal();
  els.addProviderName.focus();
}

function closeAddProviderDialog() {
  if (els.addProviderDialog.open) {
    els.addProviderDialog.close();
  }
  if (currentConfig) {
    els.settingProvider.value = currentConfig.provider || '';
  }
}

async function saveNewProvider() {
  if (!currentConfig || isSavingProvider || isSavingSettings) {
    return;
  }
  if (!els.addProviderForm.reportValidity()) {
    return;
  }

  const name = els.addProviderName.value.trim();
  const baseUrl = els.addProviderBaseUrl.value.trim();
  const protocol = els.addProviderProtocol.value;
  if (!name || !baseUrl) {
    els.addProviderHint.textContent = 'Enter a provider name and base URL.';
    els.addProviderHint.className = 'save-hint error';
    return;
  }
  const providerId = createStableCustomProviderId();
  const previousProvider = currentConfig.provider || els.settingProvider.value;
  syncCurrentProviderDraft(previousProvider);

  const customDefinitions = (Array.isArray(currentConfig.providerDefinitions)
    ? currentConfig.providerDefinitions
    : [])
    .filter(provider => provider?.id?.startsWith('custom_'));
  const providerDefinitions = [
    ...customDefinitions,
    { id: providerId, name, baseUrl, protocol },
  ];
  const nextConfig = {
    ...currentConfig,
    provider: providerId,
    providerDefinitions,
    providerProfiles: {
      ...(currentConfig.providerProfiles || {}),
      [providerId]: createProviderProfile(providerId, { ...currentConfig, providerDefinitions }),
    },
  };
  const payload = buildSettingsPayload(nextConfig, providerId);
  const saveToken = ++settingsSaveToken;
  const providerToken = providerSwitchToken;
  isSavingProvider = true;
  isSavingSettings = true;
  els.settingProvider.disabled = true;
  els.saveConfigBtn.disabled = true;
  els.addProviderHint.textContent = 'Saving provider...';
  els.addProviderHint.className = 'save-hint';

  try {
    const response = await chrome.runtime.sendMessage({
      type: Actions.UPDATE_CONFIG,
      payload,
    });
    if (!response?.ok) {
      throw new Error(response?.error || 'Failed to save provider.');
    }
    if (saveToken !== settingsSaveToken || providerToken !== providerSwitchToken) {
      return;
    }

    currentConfig = hydrateProviderProfiles(response.data || payload);
    renderProviderOptions(currentConfig.provider);
    applyProviderProfileToForm(currentConfig.provider);
    closeAddProviderDialog();
    showSaveHint('Provider added and saved.', 'success');
  } catch (err) {
    if (saveToken === settingsSaveToken && providerToken === providerSwitchToken) {
      els.addProviderHint.textContent = err.message;
      els.addProviderHint.className = 'save-hint error';
    }
  } finally {
    if (saveToken === settingsSaveToken) {
      isSavingProvider = false;
      isSavingSettings = false;
      els.settingProvider.disabled = false;
      els.saveConfigBtn.disabled = false;
    }
  }
}

function applyAnalysisSettingsToForm() {
  if (!currentConfig) {
    return;
  }

  const preset = currentConfig.analysisPreset || DEFAULT_ANALYSIS_PRESET;
  const useCustomWeights = currentConfig.useCustomWeights === true;
  const includeSponsorshipInScore = currentConfig.includeSponsorshipInScore !== false;
  const previewWeights = useCustomWeights
    ? getEffectiveWeights(currentConfig, includeSponsorshipInScore)
    : getEffectiveWeights({ analysisPreset: preset }, includeSponsorshipInScore);

  els.settingAnalysisPreset.value = preset;
  renderPromptPolicy(preset);
  els.settingAdditionalInstructions.value = currentConfig.additionalPromptInstructions || '';
  els.settingUseCustomWeights.checked = useCustomWeights;
  els.settingCustomPrompt.value = currentConfig.customPromptTemplate || '';
  els.settingEnableDiagnostics.checked = currentConfig.enableDiagnostics !== false;

  setWeightInputsFromWeights(previewWeights);
  updateWeightInputState();
  updateWeightTotalHint();
}

function applyCandidatePreferencesToForm() {
  const preferences = normalizeCandidatePreferences(currentConfig?.candidatePreferences);
  els.settingRelocation.value = preferences.willingToRelocateWithinNetherlands;
  els.settingTargetCountry.value = preferences.targetCountry;
}

function readCandidatePreferencesForm() {
  return normalizeCandidatePreferences({
    willingToRelocateWithinNetherlands: els.settingRelocation.value,
    targetCountry: els.settingTargetCountry.value,
  });
}

function renderPromptPolicy(mode) {
  const policy = getPromptPolicySummary(mode);
  els.settingPromptPolicyMode.textContent = policy.name;
  els.settingPromptPolicyVersion.textContent = `${MATCH_PROMPT_VERSION} active`;
  els.settingPromptPolicySummary.textContent = policy.summary;
  els.settingPromptPolicyEvidence.textContent = policy.evidence;
  els.settingPromptPolicyUncertainty.textContent = policy.uncertainty;
  els.settingPromptPolicyScoring.textContent = 'AI holistic score, source checked locally';
  els.settingPromptPolicyOutput.textContent = 'Validated JSON assessment';
}

function applyTitleDisplaySettingsToForm() {
  if (!currentConfig) {
    return;
  }

  const settings = normalizeTitleDisplaySettings(currentConfig.titleDisplaySettings);
  currentConfig.titleDisplaySettings = settings;
  els.settingTitleColorScheme.value = settings.colorScheme;
  els.settingTitleSignalCheckboxes.forEach(input => {
    input.checked = settings.visibleSignals[input.dataset.titleSignal] !== false;
  });
  els.settingTitleColorHexInputs.forEach(input => {
    const key = input.dataset.titleColorHex;
    input.value = settings.customColors[key] || '';
    input.classList.remove('invalid');
  });
  els.settingTitleColorPickers.forEach(input => {
    const key = input.dataset.titleColorPicker;
    input.value = settings.customColors[key] || '#000000';
  });
  toggleCustomTitleColorInputs();
}

function readTitleDisplaySettingsForm() {
  const existing = normalizeTitleDisplaySettings(currentConfig?.titleDisplaySettings);
  const visibleSignals = { ...existing.visibleSignals };
  els.settingTitleSignalCheckboxes.forEach(input => {
    visibleSignals[input.dataset.titleSignal] = input.checked;
  });

  const customColors = { ...existing.customColors };
  els.settingTitleColorHexInputs.forEach(input => {
    const key = input.dataset.titleColorHex;
    const color = normalizeHexColor(input.value, null);
    if (color) {
      customColors[key] = color;
      input.value = color;
      input.classList.remove('invalid');
    } else {
      input.classList.add('invalid');
    }
  });

  return normalizeTitleDisplaySettings({
    colorScheme: els.settingTitleColorScheme.value,
    visibleSignals,
    customColors,
    // Preserve archived keyword preferences during settings saves without showing keyword badges.
    keywordList: existing.keywordList,
    keywordStyle: existing.keywordStyle,
  });
}

function handleTitleColorSchemeChange() {
  toggleCustomTitleColorInputs();
}

function toggleCustomTitleColorInputs() {
  const isCustom = els.settingTitleColorScheme.value === 'custom';
  els.settingCustomTitleColors.classList.toggle('hidden', !isCustom);
}

function syncTitleColorInputs(key, source) {
  const picker = [...els.settingTitleColorPickers].find(input => input.dataset.titleColorPicker === key);
  const hexInput = [...els.settingTitleColorHexInputs].find(input => input.dataset.titleColorHex === key);
  if (!picker || !hexInput) {
    return;
  }

  if (source === 'picker') {
    const color = normalizeHexColor(picker.value, null);
    if (color) {
      hexInput.value = color;
      hexInput.classList.remove('invalid');
    }
    return;
  }

  const color = normalizeHexColor(hexInput.value, null);
  hexInput.classList.toggle('invalid', !color && hexInput.value.trim() !== '');
  if (color) {
    picker.value = color;
    hexInput.value = color;
  }
}

function validateTitleColorInput(input) {
  syncTitleColorInputs(input.dataset.titleColorHex, 'hex');
}

function readAnalysisSettingsForm() {
  const analysisPreset = els.settingAnalysisPreset.value || DEFAULT_ANALYSIS_PRESET;
  const includeSponsorshipInScore = (currentConfig?.includeSponsorshipInScore !== false);
  const weightValues = readWeightInputs();
  const customWeights = sanitizeCustomWeights(weightValues);
  const useCustomWeights = els.settingUseCustomWeights.checked && Object.keys(customWeights).length > 0;

  return {
    analysisPreset,
    promptTuningMode: analysisPreset,
    includeSponsorshipInScore,
    useCustomWeights,
    customWeights: useCustomWeights ? customWeights : {},
    additionalPromptInstructions: els.settingAdditionalInstructions.value.trim(),
    customPromptTemplate: useCustomWeights ? els.settingCustomPrompt.value.trim() : '',
    enableDiagnostics: els.settingEnableDiagnostics.checked,
  };
}

function getWeightInputs() {
  return [
    els.weightSkills,
    els.weightResponsibility,
    els.weightYears,
    els.weightEducation,
    els.weightLangLocation,
    els.weightSponsorship,
  ];
}

function setWeightInputsFromWeights(weights) {
  for (const [itemName, fieldName] of Object.entries(WEIGHT_FIELD_MAP)) {
    const value = Number(weights?.[itemName] || 0);
    els[fieldName].value = Math.round(value * 100);
  }
}

function readWeightInputs() {
  return Object.entries(WEIGHT_FIELD_MAP).reduce((acc, [itemName, fieldName]) => {
    const percentage = Number.parseFloat(els[fieldName].value);
    if (Number.isFinite(percentage) && percentage > 0) {
      acc[itemName] = percentage / 100;
    }
    return acc;
  }, {});
}

function updateWeightInputState() {
  getWeightInputs().forEach(input => {
    input.disabled = true;
  });
  els.resetWeightsBtn.disabled = true;
  els.settingCustomPrompt.disabled = !els.settingUseCustomWeights.checked;
}

function updateWeightTotalHint() {
  els.settingWeightTotal.textContent = t('Legacy weights are retained but do not affect the current score.');
}

function handleAnalysisPresetChange() {
  if (!currentConfig) {
    return;
  }

  const preset = els.settingAnalysisPreset.value || DEFAULT_ANALYSIS_PRESET;
  currentConfig.analysisPreset = preset;
  currentConfig.promptTuningMode = preset;
  renderPromptPolicy(preset);

  if (!els.settingUseCustomWeights.checked) {
    setWeightInputsFromWeights(getEffectiveWeights(
      { analysisPreset: preset },
      (currentConfig?.includeSponsorshipInScore !== false),
    ));
  }
  updateWeightInputState();
  updateWeightTotalHint();
}

function handleUseCustomWeightsToggle() {
  updateWeightInputState();
  if (!els.settingUseCustomWeights.checked) {
    setWeightInputsFromWeights(getEffectiveWeights(
      { analysisPreset: els.settingAnalysisPreset.value || DEFAULT_ANALYSIS_PRESET },
      (currentConfig?.includeSponsorshipInScore !== false),
    ));
  } else if (!Object.keys(readWeightInputs()).length) {
    setWeightInputsFromWeights(getEffectiveWeights(
      { analysisPreset: els.settingAnalysisPreset.value || DEFAULT_ANALYSIS_PRESET },
      (currentConfig?.includeSponsorshipInScore !== false),
    ));
  }
  updateWeightTotalHint();
}

function resetWeightsToPreset() {
  const preset = els.settingAnalysisPreset.value || DEFAULT_ANALYSIS_PRESET;
  setWeightInputsFromWeights(getEffectiveWeights(
    { analysisPreset: preset },
    (currentConfig?.includeSponsorshipInScore !== false),
  ));
  updateWeightTotalHint();
}

function formatTiming(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 'N/A';
  }
  return `${Math.round(value)} ms`;
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value || '';
  return div.innerHTML;
}

function showSaveHint(text, type) {
  els.saveHint.textContent = text;
  els.saveHint.className = `save-hint ${type}`;
  window.setTimeout(() => {
    if (els.saveHint.textContent === text) {
      els.saveHint.textContent = '';
      els.saveHint.className = 'save-hint';
    }
  }, 3000);
}

function showResumeHint(text, type = 'success') {
  els.resumeLibraryHint.textContent = text;
  els.resumeLibraryHint.className = `resume-library-hint ${type}`;
  window.setTimeout(() => {
    if (els.resumeLibraryHint.textContent === text) {
      renderResumeLibrary();
    }
  }, 3000);
}

function showError(message) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    left: 16px;
    right: 16px;
    bottom: 18px;
    padding: 12px 14px;
    border-radius: 14px;
    background: rgba(180, 35, 24, 0.94);
    color: white;
    font-weight: 700;
    z-index: 9999;
    box-shadow: 0 12px 30px rgba(180, 35, 24, 0.22);
  `;
  toast.textContent = message;
  document.body.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 3500);
}

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

const scheduleRefreshPageContext = debounce(() => {
  refreshPageContext().catch(err => console.warn('Failed to refresh page context:', err));
}, 500);

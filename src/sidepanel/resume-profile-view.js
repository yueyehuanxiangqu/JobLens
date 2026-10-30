import { getLocale, t } from '../i18n/index.js';

const SECTION_NAMES = Object.freeze({
  education: 'Education', experience: 'Work Experience', projects: 'Project Experience',
  technicalSkills: 'Technical Skills', languages: 'Languages', otherInformation: 'Other Explicit Candidate Information',
});

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function parsedTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return t('Unknown');
  return new Date(value).toLocaleString(getLocale() === 'zh-CN' ? 'zh-CN' : 'en-GB');
}

function extractionStatus(value) {
  if (value === 'ai-parsed') return 'AI structured';
  if (value === 'legacy') return 'Legacy text profile';
  return 'Local fallback';
}

function renderField(field) {
  const status = ['Verified', 'Source-supported', 'Inferred', 'Unverified', 'Unknown', 'User-confirmed'].includes(field.status) ? field.status : 'Unknown';
  const value = status === 'Unknown' ? t('Unknown')
    : field.label === 'Level' && ['Native', 'Proficient', 'Intermediate', 'Beginner'].includes(field.value)
      ? t(field.value) : field.value;
  return `<div class="profile-view-field">
    <div class="profile-view-field-head"><span>${escape(t(field.label))}</span><span class="profile-view-status profile-view-${escape(status.toLowerCase())}">${escape(t(status))}</span></div>
    <div class="profile-view-value" translate="no">${escape(value)}</div>
    ${field.sourceQuote ? `<details class="profile-view-evidence"><summary>${escape(t(status === 'Inferred' ? 'Related CV excerpt' : 'Original CV excerpt'))}</summary><q class="profile-view-quote" translate="no">${escape(field.sourceQuote)}</q></details>` : ''}
  </div>`;
}

export function renderResumeProfileView(view) {
  if (!view?.id || !Array.isArray(view.sections)) return '';
  const legacy = view.schemaVersion !== view.currentSchemaVersion;
  return `<div class="profile-view" data-profile-id="${escape(view.id)}">
    <div class="profile-view-meta">
      <div>${escape(t('Profile schema'))}: <strong translate="no">${escape(view.schemaVersion || 'Unknown')}</strong></div>
      <div>${escape(t('Last parsed'))}: <strong>${escape(parsedTime(view.parsedAt))}</strong></div>
      <div>${escape(t('Extraction status'))}: <strong>${escape(t(extractionStatus(view.parseStatus)))}</strong></div>
      <div>${escape(t('Re-read needed'))}: <strong>${escape(t(view.needsReparse ? 'Yes' : 'No'))}</strong></div>
    </div>
    ${legacy ? `<p class="resume-profile-error">${escape(t('Older Profile schema. Compatible fields are shown; Re-read this CV for resume-v3.'))}</p>` : ''}
    ${legacy && /\.pdf$/i.test(view.fileName || '') ? `<p class="resume-profile-error">${escape(t('For older PDFs, upload the original file again to apply the improved reading order. Re-read uses the previously stored text.'))}</p>` : ''}
    ${(view.parseQualityIssues || []).map(issue => `<p class="resume-profile-error">${escape(t('PDF extraction needs review:'))} ${escape(t(issue))}</p>`).join('')}
    <p class="field-hint">${escape(t('Verified is direct CV text; Source-supported is a faithful summary with cited text. Inferred and Unverified need review.'))}</p>
    <div class="profile-view-sections">${view.sections.map(section => `<details class="profile-view-section" data-profile-section="${escape(section.key)}">
      <summary>${escape(t(SECTION_NAMES[section.key] || section.key))}</summary>
      <div class="profile-view-entries">${section.entries.map(item => `<div class="profile-view-entry">
        ${item.group ? `<div class="profile-view-group">${escape(t(item.group))}</div>` : ''}
        ${item.fields.map(renderField).join('')}
        ${(item.sourceQuotes || []).filter(quote => !item.fields.some(field => field.sourceQuote === quote)).length
    ? `<details class="profile-view-evidence"><summary>${escape(t('Other related CV excerpts'))}</summary>${(item.sourceQuotes || []).filter(quote => !item.fields.some(field => field.sourceQuote === quote)).map(quote => `<q translate="no">${escape(quote)}</q>`).join('')}</details>` : ''}
      </div>`).join('')}</div>
    </details>`).join('')}</div>
  </div>`;
}

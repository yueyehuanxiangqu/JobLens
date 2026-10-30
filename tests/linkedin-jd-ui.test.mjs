import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { t } from '../src/i18n/index.js';

const app = fs.readFileSync(new URL('../src/sidepanel/app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../src/sidepanel/index.html', import.meta.url), 'utf8');

test('extracted JD viewer shows only the current job and keeps its source text unmodified', () => {
  const source = app.slice(app.indexOf('function renderExtractedJD('), app.indexOf('function setupManualJobs('));
  const pre = { textContent: '' };
  const view = { open: true, classList: { add() {}, remove() {} } };
  const content = { innerHTML: '', querySelector() { return pre; } };
  const els = { jdExtractedView: view, jdExtractedContent: content,
    jdCopyBtn: { disabled: false }, jdCopyHint: { textContent: '' } };
  const context = vm.createContext({ els, t: key => t(key, 'zh-CN'),
    escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;') });
  vm.runInContext(`${source}; this.renderExtractedJD = renderExtractedJD;`, context);
  context.renderExtractedJD({ jobId: 'A', title: 'Role A', company: 'A Ltd', description: 'A private JD',
    extractionStatus: 'ready', url: 'https://example.test/A' });
  assert.equal(pre.textContent, 'A private JD');
  context.renderExtractedJD({ jobId: 'B', title: 'Role B', company: 'B Ltd',
    description: 'You speak Dutch fluently. <exact quote>', extractionStatus: 'uncertain',
    extractionWarnings: ['The detail pane has no explicit Job ID; verify the selected title and JD.'],
    extractionSource: 'cache' });
  assert.equal(pre.textContent, 'You speak Dutch fluently. <exact quote>');
  assert.doesNotMatch(content.innerHTML, /A private JD|Role A/);
  assert.match(content.innerHTML, /已保存的分析缓存/);
  assert.match(content.innerHTML, /岗位 ID|提取提示/);
  context.renderExtractedJD({ jobId: 'B', title: 'Role B', company: 'B Ltd',
    description: 'Previously verified JD', extractionStatus: 'rechecking' });
  assert.match(content.innerHTML, /此前核实过的 JD|正在重新核实/);
  assert.equal(els.jdCopyBtn.disabled, true);
  assert.match(html, /<details id="jd-extracted-view"/);
  assert.match(app, /if \(currentJDData\?\.jobId !== data\?\.jobId\) \{\s*els\.jdExtractedView\.open = false/);
  context.renderExtractedJD(null);
  assert.equal(view.open, false);
});

test('JD viewer copy uses current verified text and does not call analysis', () => {
  const source = app.slice(app.indexOf('function setupExtractedJDView('), app.indexOf('function renderExtractedJD('));
  assert.match(source, /navigator\.clipboard\.writeText\(currentJDData\.description\)/);
  assert.match(source, /'rechecking', 'reverify-failed', 'identity-mismatch'/);
  assert.doesNotMatch(source, /START_ANALYSIS|runAnalysis|callLLM/);
  assert.equal(t('View Extracted JD', 'en'), 'View Extracted JD');
  assert.equal(t('View Extracted JD', 'zh-CN'), '查看已提取岗位描述');
});

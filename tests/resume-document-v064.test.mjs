import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFallbackResumeData,
  buildResumeAnalysisText,
  extractResumeSections,
  getResumeDataStats,
  normalizeResumeData,
} from '../src/shared/resume-document.js';

const source = `EDUCATION
MSc, Management of Technology
Delft University of Technology (TU Delft)
08/2023 - 08/2025
Focus on data analytics, AI, and decision-making in complex organizations

BSc, Data Science and Big Data Technology
University of Science and Technology of China (USTC)
08/2019 - 07/2023

EXPERIENCE
Data Analyst | Example BV | 2024 - 2025
Built SQL dashboards for finance teams.`;

test('local resume fallback keeps education instead of treating the section as absent', () => {
  const sections = extractResumeSections(source);
  const education = sections.find(section => /education/i.test(section.heading));
  const fallback = buildFallbackResumeData(source);

  assert.ok(education);
  assert.ok(education.entries.some(entry => entry.includes('MSc, Management of Technology')));
  assert.ok(fallback.education.length > 0);
  assert.ok(fallback.education[0].details.some(entry => entry.includes('Delft University')));
});

test('structured resume text puts normalized fields before the exact source', () => {
  const structured = normalizeResumeData({
    schemaVersion: 'resume-v1',
    name: 'Candidate',
    education: [{
      degree: 'MSc',
      field: 'Management of Technology',
      institution: 'Delft University of Technology (TU Delft)',
      year: '08/2023 - 08/2025',
      details: ['Focus on data analytics, AI, and decision-making in complex organizations'],
      sourceQuotes: ['MSc, Management of Technology'],
    }],
    skills: ['SQL'],
  }, source);
  const analysisText = buildResumeAnalysisText(structured, source);
  const stats = getResumeDataStats(structured);

  assert.equal(stats.education, 1);
  assert.match(analysisText, /^STRUCTURED RESUME PROFILE \(resume-v3\)/);
  assert.ok(analysisText.indexOf('Education & certifications:') < analysisText.indexOf('EXACT EXTRACTED RESUME SOURCE'));
  assert.match(analysisText, /Delft University of Technology \(TU Delft\)/);
  assert.match(analysisText, /MSc, Management of Technology/);
  assert.match(analysisText, /BSc, Data Science and Big Data Technology/);
});

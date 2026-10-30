export const JOB_ANALYSIS_VERSION = 'career-v3';

export function dutchRequirementStatus(analysis) {
  if (analysis?.requiredLanguages?.relation === 'OR' || analysis?.dutchRequirement?.relation === 'OR') return 'Optional';
  return (typeof analysis?.dutchRequirement === 'string' ? analysis.dutchRequirement : analysis?.dutchRequirement?.status)
    || analysis?.requiredLanguages?.items?.find(item => item.language === 'Dutch')?.requirementType || 'Unknown';
}

const TONES = Object.freeze({
  Entry: 'green', Mid: 'blue', Senior: 'red', Lead: 'red',
  'New Graduate': 'green',
  Junior: 'green',
  'Early Career': 'blue',
  Borderline: 'amber',
  Experienced: 'red',
  Unknown: 'gray',
});

export function careerLevelDisplay(level, version) {
  const currentLevel = version === JOB_ANALYSIS_VERSION && Object.hasOwn(TONES, level) ? level : 'Unknown';
  return { level: currentLevel, tone: TONES[currentLevel] };
}

const BADGE_COLORS = Object.freeze({ green: '#15803d', blue: '#1d4ed8', amber: '#a45d06', red: '#b91c1c', gray: '#475569' });

export function careerLevelBadgeColor(tone) {
  return BADGE_COLORS[tone] || BADGE_COLORS.gray;
}

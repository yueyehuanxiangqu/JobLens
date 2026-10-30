export const BADGE_TONES = Object.freeze({
  success: Object.freeze({ background: '#dcfce7', color: '#166534', border: '#bbf7d0' }),
  warning: Object.freeze({ background: '#fef3c7', color: '#92400e', border: '#fde68a' }),
  danger: Object.freeze({ background: '#fee2e2', color: '#991b1b', border: '#fecaca' }),
  info: Object.freeze({ background: '#dbeafe', color: '#1e40af', border: '#bfdbfe' }),
  neutral: Object.freeze({ background: '#f1f5f9', color: '#334155', border: '#e2e8f0' }),
});

function channels(hex) {
  const value = /^#[0-9a-f]{6}$/iu.test(hex || '') ? hex.slice(1) : '475569';
  return [0, 2, 4].map(index => Number.parseInt(value.slice(index, index + 2), 16));
}

function hex(values) {
  return `#${values.map(value => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
}

export function badgeColorsForAccent(accent) {
  const rgb = channels(accent);
  const blend = amount => hex(rgb.map(value => value * (1 - amount) + 255 * amount));
  // Preserve user-selected hue while keeping every badge light and readable.
  return { background: blend(0.88), color: hex(rgb.map(value => Math.round(value * 0.65))),
    border: blend(0.72) };
}

export function badgeToneForScore(score) {
  return score >= 75 ? BADGE_TONES.success : score >= 50 ? BADGE_TONES.warning : BADGE_TONES.danger;
}

export function badgeToneForCareer(tone) {
  return BADGE_TONES[{ green: 'success', blue: 'info', amber: 'warning', red: 'danger', gray: 'neutral' }[tone] || 'neutral'];
}

export function badgeToneForPermit(status) {
  return BADGE_TONES[status === 'Explicitly Available' ? 'success'
    : status === 'Explicitly Unavailable' ? 'danger'
      : status === 'Not Specified' ? 'neutral' : 'warning'];
}

export function permitBadgeLabel(status) {
  return status === 'Explicitly Available' ? 'Sponsorship Available'
    : status === 'Explicitly Unavailable' ? 'No Sponsorship'
      : ['Existing Authorization Required', 'Unclear'].includes(status) ? 'Verify Sponsorship' : '';
}

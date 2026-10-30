export function normalizeCandidatePreferences(raw = {}) {
  return {
    willingToRelocateWithinNetherlands: ['Yes', 'No', 'Unknown'].includes(raw.willingToRelocateWithinNetherlands)
      ? raw.willingToRelocateWithinNetherlands : 'Unknown',
    targetCountry: String(raw.targetCountry || 'Unknown').replace(/[\r\n<>]/g, ' ').trim().slice(0, 100) || 'Unknown',
  };
}

export function normalizeArchivedGlobalLanguages(value) {
  return (Array.isArray(value) ? value : [])
    .slice(0, 15).map(item => ({
      language: String(item?.language || '').replace(/[\r\n<>]/g, ' ').trim().slice(0, 80),
      level: String(item?.level || 'Unknown').replace(/[\r\n<>]/g, ' ').trim().slice(0, 80),
    })).filter(item => item.language);
}

export function formatCandidatePreferences(raw) {
  const preferences = normalizeCandidatePreferences(raw);
  return [
    `Relocation within Netherlands: ${preferences.willingToRelocateWithinNetherlands}`,
    `Target work country: ${preferences.targetCountry}`,
  ].join('\n');
}

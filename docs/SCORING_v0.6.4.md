# v0.6.4 scoring and resume-ingestion contract

v0.6.4 keeps the v0.6.3 matrix-owned scoring model and adds a canonical structured-resume input layer.

## Scoring boundary

The model returns only the requirement matrix. The extension validates quotes and calculates dimension and overall scores. A dimension with no extracted JD requirement has no matrix rows, no placeholder evidence, and is represented as `notApplicable`; it does not lower the score or evidence coverage.

The four modes remain distinct. Strict stays close to direct comparable evidence; Balanced gives documented partial and transferable evidence fair credit; Potential can use demonstrated project, coursework, and adjacent evidence for non-gated requirements; Sponsorship-first uses balanced capability anchors while keeping sponsorship assessment separate. In v0.6.4, Sponsorship-first has no `Sponsorship Fit` weight: the sponsorship checkbox requests a separate risk review and never changes the capability score. Silence remains `unknown`; explicit contradiction remains `unmet`. Explicit hard conditions remain gated by direct comparable evidence.

## Resume document contract

Every new upload is normalized to `resume-v1`:

```json
{
  "schemaVersion": "resume-v1",
  "name": "",
  "headline": "",
  "summary": "",
  "skills": [],
  "experience": [],
  "education": [],
  "certifications": [],
  "languages": [],
  "sections": []
}
```

The active analysis input contains the structured profile followed by an exact extracted-source section. The profile improves recall for education, experience, and skills; the exact-source section remains authoritative for quotation verification. The original PDF/DOCX file is not stored by the extension.

If the configured model cannot produce a usable profile, the extension stores a visible `local-fallback` status and retains the extracted source for later `Re-read`. A fallback is not reported as an AI-verified parse.

## Cache identity

The cache identity includes the normalized structured resume text and the active `MATCH_PROMPT_VERSION` (`v10` in v0.6.4). Switching the active resume, replacing its source, or changing its structured profile therefore prevents a result for another resume profile from being presented as current.

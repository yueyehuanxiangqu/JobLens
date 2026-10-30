# v0.6.4 — Structured resume library and evidence scoring

v0.6.4 is the next public release after v0.5.0. It folds the unpublished v0.6.0–v0.6.3 provider, diagnostics, evidence-scoring, and duplicate-signal fixes into one upgrade, then adds a reusable structured resume profile layer and the tested LinkedIn/Indeed list workflow.

The upgrade path is `v0.5.0 → v0.6.4`. Versions v0.6.0–v0.6.3 were local development builds, not separate GitHub Releases or installation targets.

## Highlights

- Adds a `resume-v1` profile for experience, education, skills, certifications, languages, and other sections.
- Adds `+ Add resume`, `Use for analysis`, `Re-read`, and `Remove` to the Resume library.
- Reconstructs PDF lines from text coordinates before extracting the profile, reducing missed education headings, degrees, institutions, and dates.
- Sends the complete extracted resume to the configured model for dedicated structuring when available; invalid or unavailable model parsing is visibly labeled `Local fallback`.
- Presents the structured profile first during matching and keeps the exact extracted source locally for quote verification. The original PDF/DOCX file is not retained.
- Migrates the legacy `persistentResume` record into the resume library on first access.
- Omits empty JD dimensions from Breakdown rather than creating a synthetic `Not scored` requirement.
- Adds four analysis modes on one evidence contract: `Strict`, `Balanced`, `Potential`, and `Sponsorship-first`. Balanced is the default; the modes differ in evidence boundaries and partial-credit policy.
- Keeps Balanced practical: documented incomplete evidence can be `partial`, relevant adjacent evidence can be `transferable`, silence remains `unknown`, and explicit contradiction remains `unmet`.
- Keeps sponsorship as separate Netherlands context; `Sponsorship-first` has no `Sponsorship Fit` capability-score weight, and its checkbox only requests the separate risk review. The matching prompt identity is `v10`.

## Verification

```text
npm test
npm run build
git diff --check
```

The release package is `linkedin-job-match-v0.6.4.zip`, created from the production `dist/` directory with Keka. Historical release assets remain available for users who need an older extension version.

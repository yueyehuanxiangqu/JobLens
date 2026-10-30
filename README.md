# JobLens

JobLens 1.0.0 is an independently maintained Chrome extension for comparing a CV with job descriptions on LinkedIn and Netherlands Indeed. It provides AI-assisted professional capability scores and source evidence to support manual job screening. It does not apply for jobs or decide application eligibility.

## Features

- Read job details and visible search results on LinkedIn and `nl.indeed.com`.
- Analyze one job or collect verified JDs before processing a batch with Next 5, Next 10, All Remaining, cancellation and Retry Failed.
- Upload and switch between CVs; reuse saved structured profiles, inspect source evidence and edit each CV's languages.
- Get a 0–100 Capability Fit reference score, overall assessment, strengths and gaps from an AI model.
- Inspect Career Level, mandatory Dutch requirements, translated responsibilities and original JD/CV evidence.
- Show inline match percentages, Career Level, Dutch Required and IND-recognised company signals. An IND match does not establish sponsorship for a vacancy.
- Use Jobs Overview/Detail, Library, My CVs and Settings in a responsive side panel.
- Keep history, saved/manual jobs and CV-isolated analysis caches; clear regenerable caches without deleting user records.
- Switch between English and Simplified Chinese; inspect request and validation diagnostics.
- Configure Gemini and the other existing supported provider profiles and model settings.

## Tech Stack

JavaScript, HTML/CSS, Chrome Manifest V3, a module background service worker, a classic bundled content script, Vite 5, PDF.js and Mammoth. Tests use Node.js's built-in test runner. Gemini requests use its OpenAI-compatible API with structured JSON output.

## Installation

Install Node.js 22.13 or newer (required by the locked PDF.js dependency) and npm, then run in this directory:

```sh
npm ci
```

`package-lock.json` pins the dependency tree. Use `npm ci` for a reproducible clean installation.

## Build

```sh
npm test
npm run build
```

The build generates `public/` resources and the loadable `dist/` extension, then checks manifest paths and that the content script parses as a classic script. The background service worker remains a module. Generated `dist/`, `public/` and `node_modules/` are excluded from Git; build locally from the locked sources. `npm run dev` rebuilds when source files change.

## Chrome Installation

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this project's **dist** folder.
3. Refresh existing LinkedIn/Indeed tabs after installing or reloading the extension.
4. Open JobLens from Chrome's extension button to access the side panel.
5. Configure a provider in Settings, upload a CV in My CVs, select it in Jobs and choose Analyze or a batch action.

After rebuilding, click **Reload** on the extension card. Keep the same installation path for subsequent updates.

## AI Configuration

In **Settings**, select **Gemini**, enter your own API key, choose or add an available model, test the connection and save settings. Grant access to the configured provider endpoint if Chrome requests it. No API key is included. Existing model choices and provider defaults are retained; Gemini is selectable rather than forced as the default.

Provider access, models, quotas and billing depend on your account. CV parsing/Re-read and job analysis send requests to the selected provider. Automatic analysis is disabled by default and remains configurable under Advanced Settings. Changing CV selections reuses saved profiles without automatically parsing them again.

## Data & Privacy

CV source text, parsed profiles, provider configuration (including API keys), preferences, saved/manual jobs, history and analysis caches are stored locally in the extension's `chrome.storage.local`. This storage is not an encrypted credential vault. Treat browser-profile access and exported storage as sensitive.

CV parsing sends the supplied CV text to the selected AI provider. Job analysis sends the extracted JD, job metadata, selected CV profile and original CV evidence needed for analysis. Those requests are subject to the provider's own retention and privacy terms. Use only endpoints you trust. IND recognition uses a bundled public dataset and existing IND lookup/update logic. There is no JobLens application server or OAuth login.

The repository contains source code, synthetic/public regression fixtures, icons and public IND data, not your browser storage. Never put real CVs, API keys, tokens or storage exports in this repository. Use a private location outside the project for backups.

### Existing extension data

A new unpacked extension path can produce a different extension ID. JobLens does **not** automatically read the old extension's data. Storage keys and formats remain unchanged, but Chrome isolates storage by extension ID.

Keep the old extension installed until you have verified JobLens. No browser-profile files need to be modified. To migrate manually, use the old extension's service-worker DevTools to export a complete `chrome.storage.local` snapshot into a private local JSON backup, then review and import that snapshot into JobLens through its own service-worker DevTools using `chrome.storage.local.set`. Back up the destination first; importing overwrites matching keys. This requires deliberate manual handling; there is no migration/import UI. The backup includes API keys, CVs and history: never publish it, paste it into issues or commit it. Alternatively, configure JobLens and upload CVs again while leaving old history available in the old extension.

## Limitations

- AI scores are approximate screening aids, not guarantees of suitability, hiring outcomes or evidence completeness. Review quotes and missing-information diagnostics.
- Language, location and work-permit/sponsorship conditions are excluded from Capability Fit; application eligibility remains your decision.
- Website layouts, access restrictions and background rendering can affect extraction. This project does not guarantee exemption from LinkedIn/Indeed usage limits or policies.
- Batch JD collection needs the target page to render reliably. Already collected JDs can be analyzed independently; deferred collection may need resuming with the page visible.
- Cached results remain tied to CV, JD fingerprints, analysis versions and language. Older results can require re-analysis; changing UI language does not translate old AI output.
- IND recognition is company-level information. The bundled snapshot can become outdated and does not guarantee vacancy sponsorship. See [Data Attribution](DATA_ATTRIBUTION.md).
- The DOC upload option is retained for compatibility; older binary Word files may need conversion to DOCX or plain text.

## License

MIT. See [LICENSE](LICENSE) for the unchanged upstream copyright and license text. JobLens is derived from [LinkedIn Job Match Extension](https://github.com/YuxiaoMa66/linkedin-job-match-extension) and is independently maintained; it is not an official LinkedIn, Indeed, IND or Google product. See [NOTICE](NOTICE.md) for provenance and third-party notices. IND data attribution is documented separately.

Application releases follow semantic versioning starting at **1.0.0**. The application version is independent of Manifest V3 and the existing AI prompt/schema versions.

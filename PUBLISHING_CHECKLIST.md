# Publishing Checklist — v0.6.4

## Ready checks

- [x] Confirm the repository name: `linkedin-job-match-extension`
- [x] Choose a final license (`MIT`)
- [x] Build locally with `npm run build`
- [x] Run the automated suite (`npm test`)
- [x] Re-test the extension from `dist/` and verify the v0.6.4 UI
- [x] Confirm screenshots reflect the current Resume library, Indeed list, four analysis modes, Balanced/v10 policy, Highlights, and Breakdown UI
- [x] Confirm no real API keys are committed
- [x] Confirm data attribution remains in the repository
- [x] Keep build output and ZIP archives out of Git with `.gitignore`

## GitHub repository setup

- [x] Repository exists and remains public
- [x] Push the v0.6.4 source and documentation update
- [x] Verify `README.md` and the Pages product page render correctly after deployment
- [x] Add the v0.6.4 repository description and topics
- [x] Preserve historical Releases and their existing assets
- [x] Document the public upgrade path as `v0.5.0 → v0.6.4`; keep v0.6.0–v0.6.3 labeled as internal development notes

## Release setup

- [x] Build `dist/`
- [x] Create `linkedin-job-match-v0.6.4.zip` from `dist/` with Keka
- [x] Create the GitHub Release `v0.6.4`
- [x] Upload only the current v0.6.4 ZIP as the release asset
- [x] Add English and Chinese installation steps in the release notes

## Cleanup policy

- Do not commit `dist/`, local ZIPs, API keys, cached provider data, or personal resume files.
- Keep v0.1.0–v0.5.0 Releases as historical compatibility points; their assets are not duplicates of v0.6.4.
- Use current v0.6.4 notes and screenshots for changed areas; retain clearly labeled unchanged workflow references, with older notes and visuals organized under `docs/releases/` and `docs/assets/archive/`.
- Delete a remote asset only after confirming it is an exact duplicate or an accidental upload. The current historical Releases each have a distinct versioned asset, so no remote deletion is required.

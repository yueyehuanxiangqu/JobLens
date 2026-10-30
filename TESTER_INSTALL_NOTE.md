# Tester Install Note — v0.6.4

`v0.6.4` adds the structured Resume library, four evidence-based analysis modes, and the current LinkedIn/Indeed list workflow. Balanced is the practical default; Sponsorship-first keeps sponsorship risk separate from the capability percentage. The package is intended for testing before any future release changes.

If resume upload fails, the most common reason is that the wrong folder was loaded into Chrome.

Correct installation:

1. Open `chrome://extensions/`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select the built `dist/` folder, or the extracted GitHub release package folder

Please do **not** load the repository source root directly.

If the source root is loaded instead of `dist/`, the extension UI may still open, but resume upload for `PDF` or `DOCX` files can fail because packaged parser files are missing.

## Updating the existing installation without losing data

To preserve data from v0.1.2 onward, do not load the new extracted ZIP as another folder:

1. In `chrome://extensions/`, open the existing extension's `Details` and copy its `Location`.
2. Back up the original extension folder.
3. Extract `linkedin-job-match-v0.6.4.zip` to a temporary folder, or build and use the repository's `dist/` folder.
4. Copy the package contents into the existing `Location`, replacing the old files. Keep the original folder path unchanged and do not create a nested `dist/` folder.
5. Click `Reload` on the existing extension card.
6. Refresh the LinkedIn or Indeed tab and reopen the side panel.

Loading the new folder with `Load unpacked` creates a separate extension ID and separate local storage. Updating the original folder keeps the existing config, resume, saved/manual positions, and v0.1.2+ cache snapshots. It does not turn previously unanalysed jobs into analysed jobs.

The reason is that Chrome scopes `chrome.storage.local` to the extension ID. A ZIP cannot update an unpacked extension by itself; replacing files in the original `Location` keeps the existing extension entry and its data.

## v0.6.4 checks

1. Open `https://nl.indeed.com/` or an Indeed jobs search/list page and confirm the side panel shows `Jobs on this page`, `Indeed` source pills, detected cards, and `Load more` when available.
2. Refresh the page after the extension reload and confirm the selected Indeed detail changes with the focused card.
3. Add a `PDF`, `DOCX`, or `TXT` resume under `Resume library`; confirm the profile shows its parse status and counts for experience, education, and skills.
4. Add a second resume, use `Use for analysis` to switch profiles, then confirm the current marker and analysis context change.
5. Confirm `Re-read` updates the selected profile and that `Remove` removes only the chosen profile. Verify the legacy `persistentResume` record migrates when present.
6. Analyze one Indeed job and one LinkedIn job. Confirm their score/capsules appear in the page and side panel and that the selected profile is shown as current.
7. Re-analyze shown jobs, refresh the page, and confirm cached list results can be read again without duplicate `KM`, `JD`, `Lang`, or `Exp` labels.
8. Open `Breakdown` and confirm empty JD dimensions are omitted, `partial` and `transferable` evidence remain distinguishable, and `unknown` is not silently treated as `unmet`.
9. Switch among `Strict`, `Balanced`, `Potential`, and `Sponsorship-first`; confirm the active mode is visible, and Sponsorship-first shows sponsorship as a separate risk review without adding a Sponsorship Fit percentage to the capability score.
10. Open `Highlights` and `Sponsorship check`; confirm strengths, gaps, needs-verification checks, and sponsorship context are shown separately from capability scoring.
11. Switch to LinkedIn AI-powered Search and Classic Search and refresh once to verify both existing adapters still work.

The v0.6.4 Indeed adapter was smoke-tested on the Netherlands Indeed recommendation/list workflow. Indeed's DOM can vary by experiment and page state, so report the page URL, visible layout, selected profile, parse status, and cached/uncached state if a particular page behaves differently.

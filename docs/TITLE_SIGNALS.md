# Title signals reference

This is a focused reference for the optional title capsules. The product homepage and main README describe the current v0.6.4 workflow; the screenshots below capture the v0.6.4 layout. This page keeps the detailed color and provider reference out of the homepage's release history.

## Capsule colors

The match-score badge is separate and keeps its score-based color.

| Title capsule | Example | Default color | Color-blind-friendly color |
| --- | --- | --- | --- |
| KM sponsorship | `KM` | Blue `#2563EB` | Blue `#0072B2` |
| JD language | `JD: English` | Violet `#7C3AED` | Vermilion `#D55E00` |
| Required language | `Lang: English / Dutch` | Teal `#0F766E` | Green `#009E73` |
| Experience years | `Exp: 3y+` | Amber `#B45309` | Orange `#E69F00` |
| JD keyword | `KEY: SQL` | Rose `#BE123C` | Mauve `#CC79A7` |

In Settings → Title signals, choose the default, color-blind-friendly, or custom palette. Custom mode accepts a separate hex code for every capsule. The four core signals are independently controlled; keyword markers are opt-in and support up to five terms with `Tag`, `Bracket`, or `Spark` styles.

## Provider starter models

Selecting OpenAI, Anthropic, or Gemini seeds the editable Saved models field with a low-cost starter. The field remains editable, and additional providers keep their own settings.

| Provider | Starter model |
| --- | --- |
| OpenAI | `gpt-5-mini` |
| Anthropic | `claude-haiku-4-5-20251001` |
| Gemini | `gemini-3.5-flash-lite` |

Also supported: OpenRouter, Poe, and Custom OpenAI-compatible endpoints.

## Current visual examples

![Current LinkedIn list mode with title capsules](assets/v0.6.4-list-mode.png)

![Current provider settings with an explicit model choice](assets/v0.6.4-provider-settings.png)

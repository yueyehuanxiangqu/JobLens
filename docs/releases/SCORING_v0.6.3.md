# v0.6.3 scoring contract

This document describes the local product scoring contract. It is an evidence-based decision aid, not a hiring prediction or a validated selection test.

## What changed

v0.6.3 keeps the v0.6.2 matrix-owned arithmetic and makes two changes:

- A requirement may cite up to three separate exact resume excerpts. Each excerpt is at most 500 characters and the combined limit is 700 characters. The previous single `resumeQuote` field remains accepted for compatibility.
- Balanced gives documented relevant evidence fair `partial` or `transferable` credit when it is incomplete or distributed across the resume. It does not turn silence into evidence, and it keeps explicit legal, language-level, authorization, and years gates conservative.
- A dimension with no extracted JD requirement is not a requirement row and is not emitted as a breakdown item. It is recorded separately as `notApplicableDimensions`, so an empty dimension cannot appear as a fake evidence item or affect the score.

The content reader also removes previously injected title-signal nodes before extracting a title again. The side panel applies the same cleanup to cached titles, so `KM`, `JD`, `Lang`, and `Exp` labels are not displayed twice.

## Pipeline

```text
JD + resume
    -> model extracts quoted requirements and evidence
    -> extension validates source quotations and schema
    -> extension applies mode points and importance weights
    -> UI shows score, coverage, hard conditions, evidence, and uncertainty
```

The model does not return a total score. The extension owns the arithmetic.

## Prompt and evidence contract

The four modes use complete, separate system prompts under prompt version `v8`. Every non-unknown row needs at least one exact contiguous resume excerpt. Separate excerpts are allowed only as separate array entries; the model must not join unrelated fragments into a fabricated quote. The validator checks every excerpt against the supplied resume after Unicode normalization and whitespace folding.

`unknown` means that no relevant, verifiable resume evidence was found (or the source is too vague to evaluate). It does not mean the candidate cannot do the work. `unmet` is reserved for an explicit contradiction. Quote containment catches fabricated source text but does not prove semantic entailment, so the reason and source excerpts remain reviewable.

## Dimensions and requirement weights

The capability dimensions are Skills & Experience Relevance, Responsibility Coverage, Years of Experience, Education & Certifications, and Language & Location. Sponsorship Fit is handled separately and is not a capability dimension.

Within each dimension, requirement importance has these weights:

| Requirement importance | Weight |
| --- | ---: |
| required | 3 |
| responsibility | 2 |
| preferred | 1 |

Only dimensions with extracted requirements and a positive configured dimension weight participate in the numeric score or breakdown. Dimensions with no extracted requirement are recorded as not assessed; a configured weight of zero is recorded as excluded while its extracted hard conditions remain visible.

## Status points

| Status | Strict | Balanced | Potential | Sponsorship-first |
| --- | ---: | ---: | ---: | ---: |
| met | 100 | 100 | 100 | 100 |
| partial | 40 | 70 | 80 | 70 |
| transferable | 20 | 50 | 65 | 50 |
| unmet / unknown | 0 | 0 | 0 | 0 |

Balanced `partial` or `transferable` points require documented resume evidence and a stated limitation. They are not awarded for keyword overlap alone. Hard conditions still require explicit review; a low or incomplete evidence coverage label remains visible in the UI.

## Formula

```text
dimensionScore(d) =
  sum(points(status(r)) * importanceWeight(r))
  / sum(importanceWeight(r))

overallScore =
  round(sum(dimensionScore(d) * normalizedDimensionWeight(d)))
```

Evidence coverage is the weighted share of requirement rows that are not `unknown`. It is not model accuracy, interview probability, or offer probability.

Custom prompt text can change emphasis and explanation, but cannot change the schema, source quotation checks, status boundaries, or arithmetic. A custom dimension weight of zero excludes that capability dimension from the numeric score while retaining its extracted hard conditions.

## Limits

The contract is deliberately more usable than the previous Balanced wording, but it is not a hiring model. Review the original JD quote, every resume quote, hard conditions, and unknowns before applying. Sponsorship registry membership still does not prove that a particular vacancy offers sponsorship; registry absence is not disqualifying.

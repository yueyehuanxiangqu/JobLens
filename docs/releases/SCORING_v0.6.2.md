# v0.6.2 scoring contract

This document describes the product scoring contract. It is an evidence-based decision aid, not a hiring prediction or a validated selection test.

## Pipeline

```text
JD + resume
    -> model extracts quoted requirements and evidence
    -> extension validates source quotations and schema
    -> extension applies mode points and importance weights
    -> UI shows score, coverage, hard conditions, evidence, and uncertainty
```

The model must not return a total score. The extension owns the arithmetic.

## Prompt contract v7

The four analysis modes use separate, complete system prompts rather than one shared prompt with a short mode suffix:

- `Strict` requires direct, comparable evidence and gives no benefit of the doubt.
- `Balanced` can recognize documented professional equivalents at a comparable scope while naming missing components.
- `Potential` can use projects, study, and adjacent evidence for non-gated capability requirements, but cannot satisfy mandatory licences, explicit language levels, work authorization, or paid-years gates with potential alone.
- `Sponsorship-first` uses Balanced capability anchors and emphasizes hard-condition extraction; sponsorship and registry interpretation remain outside the capability matrix.

All four prompts deliberately use the same matrix-only JSON schema. The model does not receive internal points, dimension weights, or registry text, and must not return `overallMatchPercent`, `matchBreakdown`, numeric totals, or `Sponsorship Fit` rows. Custom guidance is treated as lower-priority emphasis and cannot override the contract.

## Dimensions and requirement weights

The extraction dimensions are:

1. Skills & Experience Relevance
2. Responsibility Coverage
3. Years of Experience
4. Education & Certifications
5. Language & Location

Sponsorship Fit is retained for older settings and metadata but is evaluated in a separate narrative branch. It is not a capability dimension in the v0.6.2 rubric.

Within a dimension:

| Requirement importance | Weight |
| --- | ---: |
| required | 3 |
| responsibility | 2 |
| preferred | 1 |

Repeated keywords do not create additional requirements. Independent AND clauses may create separate rows. OR alternatives remain one requirement.

## Status anchors

| Status | Meaning |
| --- | --- |
| met | The quoted resume evidence meets the whole requirement at the stated scope, level, and explicit equivalent. |
| partial | Direct evidence covers only part of the requirement or a lower/limited scope. |
| transferable | An adjacent capability is demonstrated and the limitation/mechanism is explained. |
| unmet | The resume explicitly contradicts the requirement. |
| unknown | The supplied resume does not contain enough evidence. It is not a claim of inability. |

All statuses except `unknown` require a verbatim resume quote. The validator checks quote containment after Unicode normalization and whitespace folding. That catches fabricated quotes; it does not prove semantic entailment.

## Formula

For dimension `d`:

```text
dimensionScore(d) =
  sum(points(status(r)) * importanceWeight(r))
  / sum(importanceWeight(r))
```

Only dimensions with at least one extracted requirement and a positive configured dimension weight are applicable. Applicable dimension weights are normalized to sum to 1:

```text
overallScore =
  round(sum(dimensionScore(d) * normalizedDimensionWeight(d)))
```

`Evidence coverage` replaces the old confidence-like interpretation:

```text
coverage =
  sum(normalizedDimensionWeight(d) *
      knownRequirementWeight(d) / allRequirementWeight(d))
```

It measures how much of the weighted matrix is supported by documented evidence. It is not model accuracy, probability of interview, or probability of an offer.

## Mode points

| Status | Strict | Balanced | Potential | Sponsorship-first |
| --- | ---: | ---: | ---: | ---: |
| met | 100 | 100 | 100 | 100 |
| partial | 40 | 60 | 70 | 60 |
| transferable | 20 | 40 | 60 | 40 |
| unmet / unknown | 0 | 0 | 0 | 0 |

The modes are deliberately conservative about hard conditions:

- Strict accepts direct comparable evidence only.
- Balanced accepts documented equivalent work at the requested scope.
- Potential recognizes demonstrated adjacent skills or projects, but cannot turn missing mandatory licences, language levels, or work authorization into a match.
- Sponsorship-first keeps Balanced capability anchors and raises sponsorship questions separately.

## Hard conditions and custom weights

`hard=true` is allowed only for an explicitly compulsory JD condition. A hard condition with `unknown`, `partial`, or `transferable` status appears in the review advice even when its dimension has a zero custom weight. It does not silently turn a missing resume line into `unmet`.

Custom prompt text can change emphasis and explanation, but cannot change the schema, source quotation rules, status anchors, or arithmetic. A custom dimension weight of zero excludes that capability dimension from the numeric score while retaining its extracted hard conditions.

## Research basis and limits

The structure follows principles visible in:

- [OPM Structured Interview Guide](https://www.opm.gov/policy-data-oversight/assessment-and-selection/structured-interviews/guide/)
- [OPM competency/content-area FAQ](https://www.opm.gov/frequently-asked-questions/assessment-policy-faq/structured-interviews/how-do-i-select-the-competencies-or-content-areas-i-want-to-assess-with-the-structured-interview/)
- [O*NET Content Model](https://www.onetcenter.org/content.html)
- [UK Government MCDA manual](https://assets.publishing.service.gov.uk/media/5a790545e5274a2acd18b975/1132618.pdf)

Those sources motivate job-analysis-derived criteria, explicit anchors, weighted criteria, and transparent assumptions. They do not validate this extension's exact points or default weights. The correct use is to inspect source quotes and hard conditions before making a personal application decision.

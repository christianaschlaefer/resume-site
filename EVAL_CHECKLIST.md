# Curation & Compilation Eval Checklist

Run these after ANY change to curate-timeline.js, compile-resume.js, or
finalize-resume.js's prompts or schemas. This is a lightweight stand-in
for automated evals — formalizing the manual testing already being
done, so prompt regressions get caught systematically instead of one
surprise at a time.

## Test 1: Broad generalist leadership role
**Prompt:** "Senior Director of Operations, overseeing cross-functional
technical and business programs"
**Expected:** A notably LARGE included set — this should plausibly
justify most of the real career history across both tracks, since it's
a broad, generalist-leadership-fit role.

## Test 2: Narrow technical specialist role
**Prompt:** "Senior Backend Engineer specializing in distributed
systems and Kafka-based event pipelines"
**Expected:** A SMALL included set — likely just the SAP Concur
technical depth, with the non-technical/PM-track entries correctly
excluded.

## Test 3: Blank input
**Prompt:** (leave blank)
**Expected:** ALL entries included, with ZERO API calls made to
curate-timeline — check logs specifically for the "blank input —
skipping API call" line, confirming no cost was incurred for a case
that needs no judgment.

## Test 4: A role where a "personality" signal plausibly matters
**Prompt:** something emphasizing public communication, civic
engagement, or cross-cultural work
**Expected:** Non-technical entries (the campaign, Embassy Tokyo, the
AI side-project Point) SHOULD be pulled in where genuinely relevant —
this is the real test of whether Points get individualized judgment
rather than automatic deprioritization.

## What to check every time, regardless of prompt
- `curate-timeline: succeeded, included X of Y entries` — X should vary
  meaningfully across different prompts, not cluster at a fixed number.
- `compile-resume: initial succeeded with N experiences`, and any
  `compile-resume: revision succeeded...` lines — confirm revisions
  only fire when the page count genuinely requires it.
- `finalize-resume: succeeded` — confirm the title/summary visibly
  adapts to the specific resume, not just repeating the defaults
  verbatim every time.
- No parse-failure, "no tool_use block," or fallback error lines for
  any of the three functions.

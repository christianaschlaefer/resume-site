# Curation & Compilation Eval Checklist

Run these after ANY change to curate-timeline.js, compile-resume.js, or
finalize-resume.js's prompts or schemas. This is a lightweight stand-in
for automated evals — formalizing the manual testing already being
done, so prompt regressions get caught systematically instead of one
surprise at a time.

**Core design (as of the "always include Experiences" change):**
Experience entries are ALWAYS included on the timeline, unconditionally.
Only Point entries are ever subject to the LLM's inclusion judgment. On
the resume, every experience gets at least one bullet except possibly
the single OLDEST one, which may be dropped only if genuinely unrelated
AND bullet-trimming alone can't make space.

## Test 1: Broad generalist leadership role
**Prompt:** "Senior Director of Operations, overseeing cross-functional
technical and business programs"
**Expected:** All Experiences on the timeline (as always). On the
resume, broad relevance across most entries — expect more generous
bullet counts spread across multiple roles rather than concentrated on
just one or two.

## Test 2: Narrow technical specialist role
**Prompt:** "Senior Backend Engineer specializing in distributed
systems and Kafka-based event pipelines"
**Expected:** All Experiences still appear on the timeline (this no
longer varies by prompt). On the RESUME specifically: the technical
entries should get the richest bullets; non-technical entries should
still each have at least one bullet (unless one is the single oldest
AND judged unrelated) — NOT be silently dropped. This is the key
regression check for the "all experiences included" fix.

## Test 3: Blank input
**Prompt:** (leave blank)
**Expected:** Everything included, zero API calls to curate-timeline —
check logs for "blank input — skipping API call."

## Test 4: A role where a Point plausibly matters
**Prompt:** something emphasizing public communication, civic
engagement, or cross-cultural work
**Expected:** The relevant Point(s) (campaign, Embassy Tokyo work, AI
project) should be included on the timeline where genuinely relevant —
this is now the ONLY thing curate-timeline actually decides.

## Test 5: Page-fit quality (not just page count)
**Setup:** any prompt that produces a long initial draft.
**Expected:**
- No experience block should be visibly split with a large gap of
  white space before it on page 1 — check the actual print preview, not
  just "page count: 2."
- If a `compile-resume: revision` log line appears, check whether it
  was triggered by a specific overflow entry (visible in the request
  payload/logs) vs. just total length — both are valid triggers now.
- Page 2 should be reasonably full, not mostly empty — the
  all-experiences-included change should make this far less likely than
  before, but worth confirming on a real test.

## What to check every time, regardless of prompt
- `curate-timeline: succeeded, all N Experiences + X of Y Points` — N
  should be constant (your full experience count) across every prompt;
  only X should vary.
- `compile-resume: initial succeeded with N experiences` — N should
  equal your full experience count (minus at most 1, the oldest) on
  every run, not vary with job description anymore.
- `finalize-resume: succeeded` — title/summary should visibly adapt to
  the specific resume's emphasis.
- No parse-failure, "no tool_use block," or fallback error lines for
  any of the three functions.

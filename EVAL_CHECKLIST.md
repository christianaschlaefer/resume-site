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

## Timeline interaction checks (after any change to timeline.js or style.css)
Open the live site with `?debug=true` and run through these once on a
desktop browser and once on a phone:
- The welcome card accepts a description OR just a link; after "Get started"
  the copy changes to "Message received!..." and the loading stages tick by.
- Wheel/trackpad scrolling DOWN moves the timeline RIGHT; arrow keys,
  Page Up/Down, Home/End, and the ‹ › buttons all move through time.
- Each role's card stays pinned at the playhead for its period, then the
  next role bumps it out. Concurrent roles (the campaign) stay docked beside
  the main card for their WHOLE period. No card ever runs past Today — the
  current role's trailing edge stops at the end of the line.
- Education shows a "started" label, a dashed study line below the axis,
  and a graduation station (UVM ends open, with no degree) — no false gaps.
  The American School in Japan's line is already running when the timeline
  opens and ends at its May 2014 graduation.
- Points fade in a little BEFORE the playhead reaches them and out a little
  after; no date is shown on a Point card.
- Skills enter the ledger as roles are reached and upgrade Familiar →
  Applied → Professional → Advanced → Expert on repeats (five gold pips at
  Expert; a skill listed twice in one role counts twice); scrolling back
  retracts them. The ledger never shows a scrollbar; "See all" lists every
  skill by tier and locks the timeline while open.
- Opening a card makes it wider and taller (growing down over the receded
  timeline) and LOCKS the timeline: the wheel scrolls only the card, and
  Escape closes it. An opened Point lifts into a large reading card (full
  width on a phone).
- Reaching the end centers "Your tailored resume" for a moment, then the
  resume opens. After 7 seconds an email popup appears; closing it leaves a
  "Want more information?" button under the resume.
- Back (or Escape) returns to the current role; clicking your name in the
  top-left returns to the welcome card, where "Match to a new role" appears.

## Resume structure checks (after any change to compile/finalize-resume.js or data.js)
Compare the compiled resume against the RESUME - BASE template:
- Name in caps; the Professional Description and Contact Line are word-for-word
  one of the options in data.js (defaults: "Technical Program & Implementation
  Leader" and the "Remote / Travel" line). Roles with international,
  government, defense, or heavy-travel components should tend toward
  "CONUS / OCONUS".
- Executive Profile reads as a tailored version of the baseline, about the same
  length, with no claims that aren't in the baseline or the resume body.
- Core Expertise uses only listed options, most relevant first, under 350
  characters, no item cut off mid-phrase.
- PROFESSIONAL EXPERIENCE uses the two-line heading ("SAP CONCUR | Title", then
  "Jan. 2022-Present | Location"); every experience appears with at least one
  bullet (only Embassy Tokyo, as the oldest, may be absent).
- The Points section header is one of the four options; the campaign always
  appears there; Points use the one-line heading ("ORG | Role | Date").
- "Married" and "Became a Father" never appear on the resume (they can appear on
  the timeline).
- Technical & Industry Fluency: 2-4 listed lines; no item repeated across lines;
  sentence lines (Construction, International Experience) are verbatim.
- Education lines use the "Degree | Institution | Location | Year" format.
- Still exactly two pages, with no large gap at the bottom of page 1.

## Lead email checks (after setup, and after any change to submit-lead.js)
- Submit the popup with an address you control (not your Gmail): the button
  shows "Sending…", then the thank-you. Within a minute that address receives
  a thank-you FROM your Gmail (check spam the first time), with the video link
  if WALKTHROUGH_VIDEO_URL is set — and it appears in your Gmail Sent folder.
- Your inbox receives "New resume lead: <company>" with the email, company,
  resume title shown, and what they typed. Hitting Reply addresses the visitor.
- Reply to the thank-you from the test address: it threads in your inbox as a
  normal conversation.
- With GMAIL_APP_PASSWORD removed, the popup shows the "email me directly"
  fallback instead of a false thank-you (Vercel logs say "not configured").
- A 4th submission from the same connection within 10 minutes shows the
  "email me directly" message (built-in limit), and a second submission with
  the same email address in a day sends no second thank-you — your
  notification flags it instead.

// POST /api/compile-resume
// Body (initial): { jobDescription: string, curatedEntries: [...] }
// Body (revision): { ...initial, revision: { previousSelection, estimatedPages } }
// Returns: { experiences: [{ id, section, bullets }], points: [...] }
//
// Works ONLY on the already-curated subset from Phase 1 — this never
// reconsiders entries that curate-timeline already excluded.
//
// Page-fit is handled by the CLIENT calling this endpoint again in
// "revision" mode when the rendered result measures too long — see
// fitResumeToTwoPages in main.js. Deliberately NOT a mechanical trim:
// deciding what to cut or tighten to fit is an editorial judgment call
// (which content most helps THIS resume), not something a script can
// safely do by a rule like "whichever entry has the most bullets."

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ---- Basic abuse guards (same reasoning as curate-timeline.js) ----
  const origin = req.headers.origin || req.headers.referer || "";
  if (!req.headers.host || !origin.includes(req.headers.host)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (JSON.stringify(req.body || {}).length > 200000) {
    return res.status(400).json({ error: "Payload too large" });
  }
  const { jobDescription, curatedEntries, revision } = req.body || {};
  if (!Array.isArray(curatedEntries) || curatedEntries.length === 0 || curatedEntries.length > 100) {
    return res.status(400).json({ error: "Invalid curatedEntries payload" });
  }
  if (jobDescription != null && (typeof jobDescription !== "string" || jobDescription.length > 5000)) {
    return res.status(400).json({ error: "Invalid job description" });
  }
  // ------------------------------------------------------------------

  const mostRecentId = getMostRecentExperienceId(curatedEntries);

  try {
    const promptContent = revision
      ? buildRevisionPrompt(jobDescription, curatedEntries, revision, mostRecentId)
      : buildInitialPrompt(jobDescription, curatedEntries, mostRecentId);

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2048,
        messages: [{ role: "user", content: promptContent }]
      })
    });

    if (!anthropicResponse.ok) {
      throw new Error(`Anthropic API returned ${anthropicResponse.status}`);
    }

    const data = await anthropicResponse.json();
    const selection = extractSelection(data, curatedEntries, mostRecentId);
    console.log(`compile-resume: ${revision ? "revision" : "initial"} succeeded with ${selection.experiences.length} experiences`);
    return res.status(200).json(selection);
  } catch (error) {
    console.error("Resume compilation failed:", error);
    // On a failed REVISION attempt specifically, fall back to the
    // previous draft rather than the generic mechanical fallback — a
    // complete, real, LLM-produced resume that's slightly long is a far
    // better fallback than discarding it for something mechanical.
    if (revision && revision.previousSelection) {
      return res.status(200).json(revision.previousSelection);
    }
    return res.status(200).json(mechanicalFallback(curatedEntries));
  }
};

function buildInitialPrompt(jobDescription, curatedEntries, mostRecentId) {
  return (
    "You are compiling a two-page professional resume from already-curated career data, for a specific job application, from the perspective of a hiring manager.\n\n" +
    `Job context:\n"""\n${(jobDescription || "").trim()}\n"""\n\n` +
    "Curated Experience and Point entries to work from (JSON):\n" +
    JSON.stringify(curatedEntries) +
    "\n\n" +
    "Rules:\n" +
    `- The most recent employment entry (id: "${mostRecentId}") MUST appear in your output with at least one bullet, no exceptions — it represents the candidate's current standing, and should typically carry MORE content than older entries, not less.\n` +
    "- EVERY experience entry you include must have at least one bullet — never include an entry with zero bullets.\n" +
    "- There is NO fixed bullet count per entry. Let genuine relevance and seniority decide — a highly relevant, senior, or current role can reasonably warrant 5-7 strong bullets, while a minor supporting entry might need just one. As a rough guide only (not a hard rule), the full resume tends to fit two pages at this formatting with somewhere around 18-24 total bullets across every included entry combined — but prioritize real relevance and impact over hitting any specific count.\n" +
    '- Decide which ONE secondary heading (if any) best fits this job, drawn from whichever categories appear in these entries\' resumeCategories besides "professional" (e.g. "leadership", "internationalGovernment", "selected"). Use at most one secondary heading across the whole resume, and never place the same entry in two sections.\n' +
    "- Bullets may be copied verbatim, combined, OR REWRITTEN to emphasize what's most relevant to THIS specific role — rephrasing for emphasis is encouraged. The one hard limit: never introduce a fact, number, or skill that isn't already present somewhere in that entry's own achievements/overview.\n" +
    "- Within each entry, list bullets in descending order of relevance to this role — most relevant first.\n" +
    "- Select which, if any, Point entries are worth featuring as notable projects.\n\n" +
    'Respond with ONLY a JSON object in this exact shape, nothing else: {"experiences": [{"id": "...", "section": "...", "bullets": ["...", "..."]}], "points": ["..."]}'
  );
}

function buildRevisionPrompt(jobDescription, curatedEntries, revision, mostRecentId) {
  return (
    "You previously compiled a resume draft for this job application, but it's too long — it needs to fit two pages and currently runs longer. Revise it HOLISTICALLY to fit, using your own editorial judgment about what matters most to this specific resume's effectiveness — not a mechanical rule like always cutting from whichever entry happens to have the most bullets.\n\n" +
    `Job context:\n"""\n${(jobDescription || "").trim()}\n"""\n\n` +
    "Original source entries, for reference (JSON):\n" +
    JSON.stringify(curatedEntries) +
    "\n\n" +
    "Your previous draft (JSON):\n" +
    JSON.stringify(revision.previousSelection) +
    "\n\n" +
    `This draft is currently estimated at approximately ${revision.estimatedPages} pages and must fit within 2.\n\n` +
    "You have several tools available — use whichever combination best preserves the resume's overall effectiveness:\n" +
    "- Tighten wording across bullets to be more concise, without losing the substance.\n" +
    "- Reduce bullet count on whichever entries YOU judge to be least central to this specific role — based on genuine relevance, not entry length.\n" +
    "- If you're only slightly over, prefer trimming a few words here and there over deleting a whole bullet outright — don't discard a strong, relevant bullet just because the draft is barely over the limit.\n\n" +
    "Hard constraints that still apply:\n" +
    `- The most recent employment entry (id: "${mostRecentId}") must remain, with at least one bullet.\n` +
    "- Every other included entry must also keep at least one bullet.\n" +
    "- Never introduce a fact, number, or skill not already present in the original source entries.\n\n" +
    'Respond with ONLY a JSON object in this exact shape, nothing else: {"experiences": [{"id": "...", "section": "...", "bullets": ["...", "..."]}], "points": ["..."]}'
  );
}

// Among Experience entries only — "present" always outranks a dated end.
function getMostRecentExperienceId(entries) {
  const experiences = entries.filter((e) => e.type === "experience");
  let best = experiences[0];
  experiences.forEach((e) => {
    if (getSortableEndDate(e) > getSortableEndDate(best)) best = e;
  });
  return best ? best.id : null;
}

function getSortableEndDate(entry) {
  if (entry.dates.end === "present") return Infinity;
  return new Date(`${entry.dates.end}-01`).getTime();
}

function extractSelection(apiResponse, curatedEntries, mostRecentId) {
  try {
    const textBlock = apiResponse.content.find((block) => block.type === "text");
    const parsed = JSON.parse(textBlock.text);
    if (!Array.isArray(parsed.experiences)) throw new Error("Malformed response");
    return enforceMostRecent(parsed, curatedEntries, mostRecentId);
  } catch (parseError) {
    console.error("compile-resume: failed to parse Claude's response, using mechanical fallback:", parseError);
    return mechanicalFallback(curatedEntries);
  }
}

// Code-level guarantee that the most recent entry is present with at
// least one bullet, regardless of whether the model followed the prompt
// instruction above. Applies the same way to both initial and revised
// output.
function enforceMostRecent(selection, curatedEntries, mostRecentId) {
  if (!mostRecentId) return selection;
  const alreadyPresent = selection.experiences.some(
    (e) => e.id === mostRecentId && e.bullets && e.bullets.length > 0
  );
  if (alreadyPresent) return selection;

  const sourceEntry = curatedEntries.find((e) => e.id === mostRecentId);
  if (!sourceEntry) return selection;

  const injected = {
    id: mostRecentId,
    section: (sourceEntry.resumeCategories && sourceEntry.resumeCategories[0]) || "professional",
    bullets: (sourceEntry.achievements || []).slice(0, 2)
  };
  return {
    ...selection,
    experiences: [...selection.experiences.filter((e) => e.id !== mostRecentId), injected]
  };
}

// Same mechanical rule the client-side mock used: first eligible
// category, every bullet verbatim. Used only on a totally failed
// INITIAL call, so the resume still renders something correct rather
// than nothing at all.
function mechanicalFallback(curatedEntries) {
  const experiences = curatedEntries
    .filter((e) => e.type === "experience")
    .map((e) => ({
      id: e.id,
      section: (e.resumeCategories && e.resumeCategories[0]) || "professional",
      bullets: e.achievements || []
    }));
  const points = curatedEntries.filter((e) => e.type === "point").map((e) => e.id);
  return { experiences, points };
}

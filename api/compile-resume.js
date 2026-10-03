// POST /api/compile-resume
// Body (initial): { jobDescription: string, curatedEntries: [...] }
// Body (revision): { ...initial, revision: { previousSelection, estimatedPages, overflowEntry? } }
// Returns: { experiences: [{ id, section, bullets }], points: [...] }
//
// Uses FORCED TOOL USE for structured output — see the chat for why.
//
// REDESIGNED around a hiring-manager-realistic hierarchy: every
// experience is included by default (you'd never submit a resume with
// only one job on it). The PRIMARY lever for fitting two pages is
// shrinking bullet count/length on lower-priority entries — dropping a
// whole entry is a last resort, and ONLY the single oldest experience
// is ever eligible for that (enforced in code, not just requested).

const COMPILE_RESUME_TOOL = {
  name: "compile_resume_selection",
  description: "Records the final selection of experiences, their resume section, and their bullet text for a tailored resume.",
  input_schema: {
    type: "object",
    properties: {
      experiences: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "The experience's id, exactly as given in the source data." },
            section: { type: "string", description: "Resume section: \"professional\", or one of this entry's other resumeCategories values for a secondary heading." },
            bullets: {
              type: "array",
              items: { type: "string" },
              description: "Bullet text, most relevant first. Verbatim, combined, or lightly rewritten from the source achievements only — never a fact, number, or skill not already present there."
            }
          },
          required: ["id", "section", "bullets"]
        }
      },
      points: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "The Point's id, exactly as given in the source data." },
            bullets: {
              type: "array",
              items: { type: "string" },
              description: "One or more bullets for this Point, same rules as Experience bullets: verbatim, combined, or lightly rewritten from its source content only."
            },
            section: {
              type: ["string", "null"],
              description: "If this Point should be NESTED into a real resume section (rendered like a mini-Experience with its own bullets) — \"professional\" or one of its own resumeCategories values. Set to null to leave it as a lightweight single-line \"featured project\" mention instead, which is the right choice for most Points."
            }
          },
          required: ["id", "bullets", "section"]
        }
      }
    },
    required: ["experiences", "points"]
  }
};

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
  const oldestId = getOldestExperienceId(curatedEntries);

  try {
    const promptContent = revision
      ? buildRevisionPrompt(jobDescription, curatedEntries, revision, mostRecentId, oldestId)
      : buildInitialPrompt(jobDescription, curatedEntries, mostRecentId, oldestId);

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 16000,
        tools: [COMPILE_RESUME_TOOL],
        tool_choice: { type: "tool", name: "compile_resume_selection" },
        messages: [{ role: "user", content: promptContent }]
      })
    });

    if (!anthropicResponse.ok) {
      throw new Error(`Anthropic API returned ${anthropicResponse.status}`);
    }

    const data = await anthropicResponse.json();
    const selection = extractSelection(data, curatedEntries, mostRecentId, oldestId);
    console.log(`compile-resume: ${revision ? "revision" : "initial"} succeeded with ${selection.experiences.length} experiences`);
    return res.status(200).json(selection);
  } catch (error) {
    console.error("Resume compilation failed:", error);
    if (revision && revision.previousSelection) {
      return res.status(200).json(revision.previousSelection);
    }
    return res.status(200).json(mechanicalFallback(curatedEntries));
  }
};

function buildInitialPrompt(jobDescription, curatedEntries, mostRecentId, oldestId) {
  return (
    "You are compiling a two-page professional resume from already-curated career data, for a specific job application, from the perspective of a hiring manager.\n\n" +
    `Job context:\n"""\n${(jobDescription || "").trim()}\n"""\n\n` +
    "Curated Experience and Point entries to work from (JSON):\n" +
    JSON.stringify(curatedEntries) +
    "\n\n" +
    "Rules:\n" +
    "- Include EVERY Experience entry above. A real candidate would never submit a resume showing only one job — the full work history belongs on the page, exactly like it does on a normal resume.\n" +
    `- The ONLY exception: the single oldest experience (id: "${oldestId}") MAY be dropped entirely, but ONLY if it is genuinely unrelated to this specific role. Every other experience, including but not limited to the most recent one (id: "${mostRecentId}"), MUST appear with at least one bullet, no exceptions.\n` +
    "- To manage space, your PRIMARY lever is bullet count and length, not omission: give fewer and shorter bullets to less-relevant or older entries, and more/richer bullets to highly relevant or recent ones. A highly relevant, senior, or current role can reasonably warrant 5-7 strong bullets; a less central entry might need just one — but it still needs that one.\n" +
    "- Fill the available two pages well — a sparse, mostly-empty page looks worse than a fully-used one. If the content doesn't naturally fill two pages, that's a signal to include MORE bullets on your more relevant entries, not to leave space empty.\n" +
    '- Decide which ONE secondary heading (if any) best fits this job, drawn from whichever categories appear in these entries\' resumeCategories besides "professional" (e.g. "leadership", "internationalGovernment", "selected"). Use at most one secondary heading across the whole resume, and never place the same entry in two sections.\n' +
    "- Bullets may be copied verbatim, combined, OR REWRITTEN to emphasize what's most relevant to THIS specific role — rephrasing for emphasis is encouraged. The one hard limit: never introduce a fact, number, or skill that isn't already present somewhere in that entry's own achievements/overview.\n" +
    "- Within each entry, list bullets in descending order of relevance to this role — most relevant first.\n" +
    "- For each Point entry, decide independently: does it have enough substance and relevance to this role to be NESTED into a real section (like a mini-Experience, with its own bullets, under \"professional\" or one of its own resumeCategories)? Or is it better left as a lightweight single-line mention (section: null)? Most Points should stay a simple mention — nesting is for the rare case where a Point's content is genuinely as substantial and relevant as a real work experience for THIS role. Never nest a Point whose resumeCategories don't include the section you're placing it in."
  );
}

function buildRevisionPrompt(jobDescription, curatedEntries, revision, mostRecentId, oldestId) {
  const overflowNote = revision.overflowEntry
    ? `\n\nSPECIFIC ISSUE: the entry "${revision.overflowEntry.employer} | ${revision.overflowEntry.jobTitle}" currently has bullets that overflow onto the next page, which forces that ENTIRE entry to move to the next page and leaves significant blank space at the bottom of the previous one. Shorten THIS entry's bullets specifically (fewer and/or more concise) so it fits completely within the current page — this is the most important fix to make.\n`
    : "";
  return (
    "You previously compiled a resume draft for this job application, but it needs adjustment to fit two pages cleanly. Revise it HOLISTICALLY, using your own editorial judgment about what matters most to this specific resume's effectiveness." +
    overflowNote +
    `\n\nJob context:\n"""\n${(jobDescription || "").trim()}\n"""\n\n` +
    "Original source entries, for reference (JSON):\n" +
    JSON.stringify(curatedEntries) +
    "\n\n" +
    "Your previous draft (JSON):\n" +
    JSON.stringify(revision.previousSelection) +
    "\n\n" +
    `This draft is currently estimated at approximately ${revision.estimatedPages} pages and must fit cleanly within 2.\n\n` +
    "Your PRIMARY lever is tightening wording and reducing bullet count on whichever entries YOU judge least central to this specific role — based on genuine relevance, not entry length. If you're only slightly over, prefer trimming a few words here and there over deleting a whole bullet outright.\n\n" +
    "Hard constraints that still apply:\n" +
    `- Every experience must remain with at least one bullet, EXCEPT the single oldest entry (id: "${oldestId}"), which may be dropped entirely only if genuinely unrelated to this role and bullet-trimming alone isn't enough to fit.\n` +
    `- The most recent employment entry (id: "${mostRecentId}") must remain, with at least one bullet.\n` +
    "- Never introduce a fact, number, or skill not already present in the original source entries.\n" +
    '- If a Point is currently nested into a section, consider whether un-nesting it (section: null) is actually the right tightening move here — a nested Point competes for the same page space as a real Experience.'
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

// The earliest-starting experience — the only one ever eligible to be
// dropped entirely, per the hierarchy above.
function getOldestExperienceId(entries) {
  const experiences = entries.filter((e) => e.type === "experience");
  let oldest = experiences[0];
  experiences.forEach((e) => {
    if (new Date(`${e.dates.start}-01`).getTime() < new Date(`${oldest.dates.start}-01`).getTime()) {
      oldest = e;
    }
  });
  return oldest ? oldest.id : null;
}

function getSortableEndDate(entry) {
  if (entry.dates.end === "present") return Infinity;
  return new Date(`${entry.dates.end}-01`).getTime();
}

function extractSelection(apiResponse, curatedEntries, mostRecentId, oldestId) {
  const toolUseBlock = apiResponse.content.find((block) => block.type === "tool_use");
  if (!toolUseBlock) {
    const blockTypes = (apiResponse.content || []).map((b) => b.type).join(", ") || "none";
    console.error(`compile-resume: no tool_use block in response (stop_reason: ${apiResponse.stop_reason}, blocks: [${blockTypes}])`);
    return mechanicalFallback(curatedEntries);
  }
  const parsed = toolUseBlock.input;
  if (!Array.isArray(parsed.experiences)) {
    console.error("compile-resume: tool_use input missing experiences array:", JSON.stringify(parsed).slice(0, 300));
    return mechanicalFallback(curatedEntries);
  }
  if (!Array.isArray(parsed.points)) {
    parsed.points = []; // malformed/missing points shouldn't sink an otherwise-valid experiences array
  }
  return enforceAllExperiencesPresent(parsed, curatedEntries, oldestId);
}

// Code-level guarantee: every experience except the single oldest one
// MUST appear with at least one bullet, regardless of whether the model
// followed the prompt instructions above. This generalizes what used to
// be a "most recent only" guarantee to the full hierarchy from the chat:
// dropping is a last resort, and only ever for the oldest entry.
function enforceAllExperiencesPresent(selection, curatedEntries, oldestId) {
  const allExperienceIds = curatedEntries.filter((e) => e.type === "experience").map((e) => e.id);
  let experiences = [...selection.experiences];

  allExperienceIds.forEach((id) => {
    if (id === oldestId) return; // the one entry allowed to be absent
    const present = experiences.some((e) => e.id === id && e.bullets && e.bullets.length > 0);
    if (present) return;

    const sourceEntry = curatedEntries.find((e) => e.id === id);
    if (!sourceEntry) return;
    experiences = experiences.filter((e) => e.id !== id); // drop any zero-bullet stub first
    experiences.push({
      id,
      section: (sourceEntry.resumeCategories && sourceEntry.resumeCategories[0]) || "professional",
      bullets: (sourceEntry.achievements || []).slice(0, 1)
    });
  });

  return { ...selection, experiences };
}

// Same mechanical rule the client-side mock used: every experience
// included, first eligible category, every bullet verbatim. Used only
// on a totally failed INITIAL call, so the resume still renders
// something correct rather than nothing at all.
function mechanicalFallback(curatedEntries) {
  const experiences = curatedEntries
    .filter((e) => e.type === "experience")
    .map((e) => ({
      id: e.id,
      section: (e.resumeCategories && e.resumeCategories[0]) || "professional",
      bullets: e.achievements || []
    }));
  // Conservative on purpose: section always null here, meaning every
  // Point stays a simple featured mention — nesting is a judgment call,
  // and this fallback only runs when the real judgment call failed.
  const points = curatedEntries
    .filter((e) => e.type === "point")
    .map((e) => ({ id: e.id, bullets: e.bullets || [], section: null }));
  return { experiences, points };
}

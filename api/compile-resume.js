// POST /api/compile-resume
// Body (initial):  { jobDescription, curatedEntries, resumeOptions }
// Body (revision): { ...initial, revision: { previousSelection, estimatedPages, overflowEntry? } }
// Returns: {
//   experiences:   [{ id, section, bullets }],
//   points:        [{ id, bullets }],
//   pointsHeader:  one of resumeOptions.pointsHeaders,
//   coreExpertise: items from resumeOptions.coreExpertise, most relevant first,
//   fluency:       [{ label, items }] — lines from resumeOptions.fluency
// }
//
// Uses FORCED TOOL USE for structured output, and every "pick from a
// list" field is an enum built from the candidate's own option lists —
// the model can choose and order options, never invent new ones. The
// server re-validates everything anyway, and the browser enforces the
// character limits, so nothing here relies on the prompt alone.
//
// Hierarchy (unchanged): every experience appears, in the section the
// candidate's data assigns it, with at least one bullet — only the
// single oldest may be dropped, and only when it's unrelated and space
// is needed. Bullet count/length is the primary lever for fitting two
// pages. Optional Points are added only where they strengthen the case.

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
  const { jobDescription, curatedEntries, resumeOptions, revision } = req.body || {};
  if (!Array.isArray(curatedEntries) || curatedEntries.length === 0 || curatedEntries.length > 100) {
    return res.status(400).json({ error: "Invalid curatedEntries payload" });
  }
  if (jobDescription != null && (typeof jobDescription !== "string" || jobDescription.length > 5000)) {
    return res.status(400).json({ error: "Invalid job description" });
  }
  const options = sanitizeOptions(resumeOptions);
  if (!options) {
    return res.status(400).json({ error: "Invalid resumeOptions payload" });
  }
  // ------------------------------------------------------------------

  const experiences = curatedEntries.filter((e) => e && e.type === "experience" && e.dates);
  // Belt and braces: the browser never sends timeline-only Points, but
  // the server refuses them too.
  const points = curatedEntries.filter((e) => e && e.type === "point" && e.resumeEligible !== false);
  const ctx = {
    experiences,
    points,
    options,
    mostRecentId: getMostRecentExperienceId(experiences),
    oldestId: getOldestExperienceId(experiences)
  };

  try {
    const tool = buildTool(options, experiences.map((e) => e.id), points.map((p) => p.id));
    const promptContent = revision
      ? buildRevisionPrompt(jobDescription, revision, ctx)
      : buildInitialPrompt(jobDescription, ctx);

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
        tools: [tool],
        tool_choice: { type: "tool", name: "compile_resume_selection" },
        messages: [{ role: "user", content: promptContent }]
      })
    });

    if (!anthropicResponse.ok) {
      throw new Error(`Anthropic API returned ${anthropicResponse.status}`);
    }

    const data = await anthropicResponse.json();
    const selection = extractSelection(data, ctx);
    console.log(`compile-resume: ${revision ? "revision" : "initial"} succeeded with ${selection.experiences.length} experiences, ${selection.points.length} points, header "${selection.pointsHeader}"`);
    return res.status(200).json(selection);
  } catch (error) {
    console.error("Resume compilation failed:", error);
    // A failed REVISION falls back to the previous complete draft rather
    // than something mechanical — a real resume that's slightly long beats
    // discarding it.
    if (revision && revision.previousSelection) {
      return res.status(200).json(revision.previousSelection);
    }
    return res.status(200).json(mechanicalFallback(ctx));
  }
};

// ------------------------------------------------------------
// Option lists arrive from the browser (data.js is the single source
// of truth), so they're validated like any other input.
// ------------------------------------------------------------
function sanitizeOptions(raw) {
  if (!raw || typeof raw !== "object") return null;
  const strings = (arr, max) => (Array.isArray(arr) ? arr : [])
    .filter((s) => typeof s === "string" && s.trim() && s.length <= 400)
    .slice(0, max);
  const pointsHeaders = [...new Set(strings(raw.pointsHeaders, 12))];
  const coreExpertise = [...new Set(strings(raw.coreExpertise, 80))];
  const fluency = (Array.isArray(raw.fluency) ? raw.fluency : [])
    .filter((line) => line && typeof line.label === "string" && line.label.trim() && line.label.length <= 120)
    .slice(0, 20)
    .map((line) => ({
      label: line.label,
      items: [...new Set(strings(line.items, 60))],
      text: typeof line.text === "string" ? line.text.slice(0, 800) : ""
    }))
    .filter((line) => line.items.length || line.text);
  if (!pointsHeaders.length || !coreExpertise.length || !fluency.length) return null;
  const limit = (value, fallback, max) => (Number.isFinite(value) && value > 0 ? Math.min(value, max) : fallback);
  return {
    pointsHeaders,
    coreExpertise,
    fluency,
    coreExpertiseMaxChars: limit(raw.coreExpertiseMaxChars, 350, 1000),
    fluencyLineMaxChars: limit(raw.fluencyLineMaxChars, 350, 1000),
    fluencyMaxLines: limit(raw.fluencyMaxLines, 4, 8)
  };
}

function buildTool(options, experienceIds, pointIds) {
  const bulletList = {
    type: "array",
    items: { type: "string" },
    description: "Bullet text, most relevant first. Verbatim, combined, or rewritten from this entry's own source content only — never a fact, number, or skill not already present there."
  };
  return {
    name: "compile_resume_selection",
    description: "Records the body of a tailored two-page resume: bullets per experience, the optional Points chosen, the Points section header, Core Expertise, and Technical & Industry Fluency lines.",
    input_schema: {
      type: "object",
      properties: {
        experiences: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "string", enum: experienceIds }, bullets: bulletList },
            required: ["id", "bullets"]
          }
        },
        points: pointIds.length
          ? {
              type: "array",
              items: {
                type: "object",
                properties: { id: { type: "string", enum: pointIds }, bullets: bulletList },
                required: ["id", "bullets"]
              }
            }
          : { type: "array", maxItems: 0, items: { type: "object" } },
        pointsHeader: {
          type: "string",
          enum: options.pointsHeaders,
          description: "Header for the Points section — whichever option best describes everything that will appear in it."
        },
        coreExpertise: {
          type: "array",
          items: { type: "string", enum: options.coreExpertise },
          description: "Core Expertise items, most relevant first."
        },
        fluency: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string", enum: options.fluency.map((line) => line.label) },
              items: {
                type: "array",
                items: { type: "string" },
                description: "For list lines: that line's own items, most relevant first. Leave empty for sentence lines."
              }
            },
            required: ["label"]
          }
        }
      },
      required: ["experiences", "points", "pointsHeader", "coreExpertise", "fluency"]
    }
  };
}

function describeOptions(options) {
  const fluency = options.fluency.map((line) => (line.text
    ? { label: line.label, kind: "sentence (use verbatim or omit)", text: line.text }
    : { label: line.label, kind: "list (choose and order items)", items: line.items }));
  return JSON.stringify({
    pointsHeaders: options.pointsHeaders,
    coreExpertise: options.coreExpertise,
    fluency
  });
}

function sharedRules(ctx) {
  const o = ctx.options;
  return (
    "THE RESUME'S FIXED STRUCTURE: name, professional description, contact line, EXECUTIVE PROFILE (all handled separately) → CORE EXPERTISE → PROFESSIONAL EXPERIENCE → the Points section (header chosen by you) → TECHNICAL & INDUSTRY FLUENCY → EDUCATION (static). You are deciding the body.\n\n" +
    "EXPERIENCES\n" +
    "- Each Experience's resumeSection is fixed by the candidate: \"professional\" renders under PROFESSIONAL EXPERIENCE, \"points\" renders in the Points section. You don't choose or change this.\n" +
    "- Include EVERY Experience. A real candidate never submits a resume with gaps in their work history.\n" +
    `- The ONLY exception: the single oldest experience (id: "${ctx.oldestId}") MAY be dropped entirely, but only if it's genuinely unrelated to this role AND trimming bullets elsewhere can't make room. Every other experience, including the most recent (id: "${ctx.mostRecentId}"), MUST appear with at least one bullet.\n` +
    `- The most recent experience (id: "${ctx.mostRecentId}") represents the candidate's current standing and should usually carry the most content — a highly relevant current role can reasonably warrant 5-7 strong bullets.\n\n` +
    "POINTS (optional extras)\n" +
    "- Include a Point only when it genuinely strengthens this candidacy for THIS role — leadership, technical, or community evidence a hiring manager would value. Leave out anything unrelated or distracting.\n" +
    "- Every included Point needs at least one bullet. Included Points appear in the Points section alongside any Experiences fixed there.\n\n" +
    "POINTS SECTION HEADER\n" +
    `- Choose the option that best describes EVERYTHING that will appear in that section for this role, including Experiences fixed to it. If unsure, use the first option ("${o.pointsHeaders[0]}").\n\n` +
    "CORE EXPERTISE\n" +
    `- Choose items only from the provided list, verbatim, most relevant to this role first. Aim to fill close to ${o.coreExpertiseMaxChars} characters when joined with " | ", without exceeding it.\n\n` +
    "TECHNICAL & INDUSTRY FLUENCY\n" +
    `- Choose the 2-${o.fluencyMaxLines} lines most relevant to this role, most relevant first.\n` +
    `- For a list line, choose and order that line's own items (verbatim), at most ${o.fluencyLineMaxChars} characters per line. A sentence line is included exactly as written or omitted — never rewritten.\n` +
    "- Don't repeat the same item in two lines.\n\n" +
    "BULLETS\n" +
    "- Bullets may be copied verbatim, combined, or rewritten to emphasize what's most relevant to THIS role. The one hard limit: never introduce a fact, number, or skill not already present in that entry's own source content.\n" +
    "- Within each entry, order bullets most relevant first.\n\n" +
    "SPACE\n" +
    "- The finished resume must fit two pages and should fill them well — a mostly-empty page looks worse than a full one. Your primary lever is bullet count and length on less central entries.\n\n" +
    "OPTION LISTS (JSON):\n" + describeOptions(o)
  );
}

function buildInitialPrompt(jobDescription, ctx) {
  return (
    "You are compiling the body of a two-page professional resume from already-curated career data, for a specific job application, from the perspective of a hiring manager.\n\n" +
    `Job context:\n"""\n${(jobDescription || "").trim()}\n"""\n\n` +
    "Curated Experiences and Points (JSON):\n" +
    JSON.stringify([...ctx.experiences, ...ctx.points]) +
    "\n\n" + sharedRules(ctx)
  );
}

function buildRevisionPrompt(jobDescription, revision, ctx) {
  const overflowNote = revision.overflowEntry
    ? `\n\nSPECIFIC ISSUE: the entry "${revision.overflowEntry.employer}${revision.overflowEntry.jobTitle ? ` | ${revision.overflowEntry.jobTitle}` : ""}" currently straddles the page break, which forces that ENTIRE entry onto the next page and leaves blank space at the bottom of the previous one. Shorten THIS entry's bullets (fewer and/or more concise) so it fits within the current page — this is the most important fix to make.`
    : "";
  return (
    "You previously compiled a resume body for this job application, but it needs adjustment to fit two pages cleanly. Revise it HOLISTICALLY, using your own editorial judgment about what matters most to this resume's effectiveness." +
    overflowNote +
    `\n\nThe current draft is estimated at about ${revision.estimatedPages} pages and must fit cleanly within 2.\n\n` +
    "Levers, in order of preference: tighten wording without losing substance; trim bullets on the entries least central to this role; drop the weakest optional Points; trim lower-priority Core Expertise items or Fluency items/lines. If you're only slightly over, prefer trimming a few words over deleting a strong bullet. Never drop an Experience other than the single oldest one.\n\n" +
    `Job context:\n"""\n${(jobDescription || "").trim()}\n"""\n\n` +
    "Original curated entries, for reference (JSON):\n" +
    JSON.stringify([...ctx.experiences, ...ctx.points]) +
    "\n\nYour previous draft (JSON):\n" +
    JSON.stringify(revision.previousSelection) +
    "\n\n" + sharedRules(ctx)
  );
}

// ------------------------------------------------------------
// Validation & enforcement
// ------------------------------------------------------------

function getSortableEndDate(entry) {
  if (entry.dates.end === "present") return Infinity;
  return new Date(`${entry.dates.end}-01`).getTime();
}

// Among Experience entries only — "present" always outranks a dated end.
function getMostRecentExperienceId(experiences) {
  let best = null;
  experiences.forEach((e) => {
    if (!best || getSortableEndDate(e) > getSortableEndDate(best)) best = e;
  });
  return best ? best.id : null;
}

// The earliest-starting experience — the only one ever eligible to be dropped.
function getOldestExperienceId(experiences) {
  let oldest = null;
  experiences.forEach((e) => {
    if (!oldest || new Date(`${e.dates.start}-01`) < new Date(`${oldest.dates.start}-01`)) oldest = e;
  });
  return oldest ? oldest.id : null;
}

const sectionOf = (entry) => (entry.resumeSection === "points" ? "points" : "professional");

function cleanBullets(bullets) {
  return (Array.isArray(bullets) ? bullets : [])
    .filter((b) => typeof b === "string" && b.trim())
    .map((b) => b.trim())
    .slice(0, 12);
}

function extractSelection(apiResponse, ctx) {
  // Forced tool use: the structured data arrives already parsed in the
  // tool_use block's `input` — no text parsing, so no "preamble before
  // the JSON" failure mode at all.
  const toolUseBlock = (apiResponse.content || []).find((block) => block.type === "tool_use");
  if (!toolUseBlock) {
    const blockTypes = (apiResponse.content || []).map((b) => b.type).join(", ") || "none";
    console.error(`compile-resume: no tool_use block in response (stop_reason: ${apiResponse.stop_reason}, blocks: [${blockTypes}])`);
    return mechanicalFallback(ctx);
  }
  const raw = toolUseBlock.input || {};
  if (!Array.isArray(raw.experiences)) {
    console.error("compile-resume: tool_use input missing experiences array:", JSON.stringify(raw).slice(0, 300));
    return mechanicalFallback(ctx);
  }

  // Experiences: only real curated ids, once each, section from the DATA.
  const experienceById = new Map(ctx.experiences.map((e) => [e.id, e]));
  const seen = new Set();
  const experiences = [];
  raw.experiences.forEach((sel) => {
    const entry = sel && experienceById.get(sel.id);
    if (!entry || seen.has(entry.id)) return;
    seen.add(entry.id);
    experiences.push({ id: entry.id, section: sectionOf(entry), bullets: cleanBullets(sel.bullets) });
  });

  // Points: only curated, resume-eligible ids, each with real bullets.
  const pointById = new Map(ctx.points.map((p) => [p.id, p]));
  const points = [];
  (Array.isArray(raw.points) ? raw.points : []).forEach((sel) => {
    const entry = sel && pointById.get(sel.id);
    if (!entry || seen.has(entry.id)) return;
    const bullets = cleanBullets(sel.bullets);
    if (!bullets.length) return;
    seen.add(entry.id);
    points.push({ id: entry.id, bullets });
  });

  const o = ctx.options;
  const pointsHeader = o.pointsHeaders.includes(raw.pointsHeader) ? raw.pointsHeader : o.pointsHeaders[0];
  const coreOptions = new Set(o.coreExpertise);
  const coreExpertise = [...new Set((Array.isArray(raw.coreExpertise) ? raw.coreExpertise : []).filter((s) => coreOptions.has(s)))];

  const lineByLabel = new Map(o.fluency.map((line) => [line.label, line]));
  const usedLabels = new Set();
  const fluency = [];
  (Array.isArray(raw.fluency) ? raw.fluency : []).forEach((sel) => {
    const line = sel && lineByLabel.get(sel.label);
    if (!line || usedLabels.has(line.label)) return;
    usedLabels.add(line.label);
    if (line.text) {
      fluency.push({ label: line.label, items: [] }); // sentence lines always render verbatim
      return;
    }
    const allowed = new Set(line.items);
    const items = [...new Set((Array.isArray(sel.items) ? sel.items : []).filter((item) => allowed.has(item)))];
    fluency.push({ label: line.label, items });
  });

  return enforceAllExperiencesPresent({ experiences, points, pointsHeader, coreExpertise, fluency }, ctx);
}

// Code-level guarantee: every experience except the single oldest MUST
// appear with at least one bullet, whatever the model returned.
function enforceAllExperiencesPresent(selection, ctx) {
  let experiences = [...selection.experiences];
  ctx.experiences.forEach((source) => {
    if (source.id === ctx.oldestId) return; // the one entry allowed to be absent
    const present = experiences.some((e) => e.id === source.id && e.bullets.length > 0);
    if (present) return;
    experiences = experiences.filter((e) => e.id !== source.id); // drop any zero-bullet stub first
    experiences.push({ id: source.id, section: sectionOf(source), bullets: (source.achievements || []).slice(0, 1) });
  });
  // The oldest may be omitted, but never shown with zero bullets.
  experiences = experiences.filter((e) => e.bullets.length > 0);
  return { ...selection, experiences };
}

// Used only when the real call fails outright: every experience with all
// its bullets, no optional Points, and empty expertise/fluency lists that
// the browser fills with the defaults from data.js.
function mechanicalFallback(ctx) {
  return {
    experiences: ctx.experiences.map((e) => ({ id: e.id, section: sectionOf(e), bullets: e.achievements || [] })),
    points: [],
    pointsHeader: ctx.options.pointsHeaders[0],
    coreExpertise: [],
    fluency: []
  };
}

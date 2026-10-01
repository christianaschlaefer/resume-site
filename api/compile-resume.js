// POST /api/compile-resume
// Body: { jobDescription: string, curatedEntries: [...] }
// Returns: { experiences: [{ id, section, bullets }], points: [...] }
//
// Works ONLY on the already-curated subset from Phase 1 — this never
// reconsiders entries that curate-timeline already excluded.

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { jobDescription, curatedEntries } = req.body;

  try {
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
        messages: [
          {
            role: "user",
            content:
              "You are compiling a two-page professional resume from already-curated career data, for a specific job application, from the perspective of a hiring manager.\n\n" +
              `Job context:\n"""\n${(jobDescription || "").trim()}\n"""\n\n` +
              "Curated Experience and Point entries to work from (JSON):\n" +
              JSON.stringify(curatedEntries) +
              "\n\n" +
              "Rules:\n" +
              '- Every Experience entry above whose resumeCategories includes "professional" MUST be included with at least one bullet. If space is tight, synthesize ONE combined bullet using only the accomplishments already listed for that entry — never invent facts, numbers, or skills not present in the data.\n' +
              '- Decide which ONE secondary heading (if any) best fits this job, drawn from whichever categories appear in these entries\' resumeCategories besides "professional" (e.g. "leadership", "internationalGovernment", "selected"). Use at most one secondary heading across the whole resume, and never place the same entry in two sections.\n' +
              "- Every bullet in your output must be either copied verbatim from that entry's own achievements, or a combined synthesis using only facts already present in that entry's own achievements/overview.\n" +
              "- Prioritize the most recent and most relevant content; if trimming for space, omit the least-relevant original bullets before omitting the only bullet available for a required entry.\n" +
              "- Select which, if any, Point entries are worth featuring as notable projects.\n\n" +
              'Respond with ONLY a JSON object in this exact shape, nothing else: {"experiences": [{"id": "...", "section": "...", "bullets": ["...", "..."]}], "points": ["..."]}'
          }
        ]
      })
    });

    if (!anthropicResponse.ok) {
      throw new Error(`Anthropic API returned ${anthropicResponse.status}`);
    }

    const data = await anthropicResponse.json();
    const selection = extractSelection(data, curatedEntries);
    return res.status(200).json(selection);
  } catch (error) {
    console.error("Resume compilation failed:", error);
    return res.status(200).json(mechanicalFallback(curatedEntries));
  }
};

function extractSelection(apiResponse, curatedEntries) {
  try {
    const textBlock = apiResponse.content.find((block) => block.type === "text");
    const parsed = JSON.parse(textBlock.text);
    if (!Array.isArray(parsed.experiences)) throw new Error("Malformed response");
    return parsed;
  } catch {
    return mechanicalFallback(curatedEntries);
  }
}

// Same mechanical rule the client-side mock used: first eligible
// category, every bullet verbatim. Used if the real call fails for any
// reason, so the resume still renders something correct rather than
// nothing at all.
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

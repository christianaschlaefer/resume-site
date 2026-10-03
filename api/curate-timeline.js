// POST /api/curate-timeline
// Body: { jobDescription: string, timeline: [...] }
// Returns: { includedIds: string[] }
//
// This is the ONLY place ANTHROPIC_API_KEY is ever read — it lives in
// Vercel's Environment Variables and is never sent to the browser.
//
// REDESIGNED: Experience entries are now ALWAYS included, unconditionally
// — a recruiter expects to see full work history on a timeline, not a
// filtered highlight reel. Only Point entries (optional "personality"/
// extra-context signals) are ever subject to the LLM's judgment. This
// also means the LLM's decision space is much smaller than before,
// which should itself improve reliability.

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ---- Basic abuse guards ----------------------------------------
  const origin = req.headers.origin || req.headers.referer || "";
  if (!req.headers.host || !origin.includes(req.headers.host)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (JSON.stringify(req.body || {}).length > 200000) {
    return res.status(400).json({ error: "Payload too large" });
  }
  const { jobDescription, timeline } = req.body || {};
  if (!Array.isArray(timeline) || timeline.length === 0 || timeline.length > 100) {
    return res.status(400).json({ error: "Invalid timeline payload" });
  }
  if (typeof jobDescription !== "string" || jobDescription.length > 5000) {
    return res.status(400).json({ error: "Invalid job description" });
  }
  // ------------------------------------------------------------------

  const trimmed = jobDescription.trim();
  const experienceIds = timeline.filter((e) => e.type === "experience").map((e) => e.id);
  const points = timeline.filter((e) => e.type === "point");
  const allIds = timeline.map((e) => e.id);

  // No Points to judge at all — nothing for the LLM to decide, skip the
  // call entirely. Experiences are included unconditionally regardless.
  if (points.length === 0) {
    console.log("curate-timeline: no Points in dataset — returning all Experiences, no API call");
    return res.status(200).json({ includedIds: experienceIds });
  }

  // No job context given — skip the API call entirely. Generic fallback:
  // everything, Experiences and Points alike.
  if (trimmed.length === 0) {
    console.log("curate-timeline: blank input — skipping API call, returning all entries");
    return res.status(200).json({ includedIds: allIds });
  }

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
        max_tokens: 8192,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [
          {
            role: "user",
            content:
              "You are deciding which OPTIONAL 'Point' entries to feature on a career timeline for a specific job application, from the perspective of a hiring manager.\n\n" +
              `Job description provided by the visitor:\n"""\n${trimmed}\n"""\n\n` +
              "For context, here is the candidate's full professional Experience history, which is ALWAYS shown in full regardless of your decision below — you are not judging these:\n" +
              JSON.stringify(timeline.filter((e) => e.type === "experience")) +
              "\n\n" +
              "Here are the OPTIONAL Point entries you ARE deciding on — smaller signals like certifications, side projects, volunteer work, campaigns, or other notable activities that go beyond the formal work history above:\n" +
              JSON.stringify(points) +
              "\n\n" +
              "If the description names a specific company and role, use web search to try to find the actual posting and understand its real requirements.\n\n" +
              "For each Point, judge independently: would including this add valuable supporting context or a compelling 'extra dimension' for a recruiter evaluating this candidate for THIS specific role — complementing the Experience history above, not competing with it? Include a Point when it genuinely adds something; exclude it when it would be unrelated, confusing, or redundant with what the Experience history already shows.\n\n" +
              'Your entire response must be nothing but the raw JSON object — no explanation, no preamble, no markdown code fences. Begin your response with { and end with }, in this exact shape: {"includedPointIds": ["id1", "id2", ...]}'
          }
        ]
      })
    });

    if (!anthropicResponse.ok) {
      throw new Error(`Anthropic API returned ${anthropicResponse.status}`);
    }

    const data = await anthropicResponse.json();
    const includedPointIds = extractIncludedPointIds(data, points.map((p) => p.id));
    const includedIds = [...experienceIds, ...includedPointIds];
    console.log(`curate-timeline: succeeded, all ${experienceIds.length} Experiences + ${includedPointIds.length} of ${points.length} Points`);
    return res.status(200).json({ includedIds });
  } catch (error) {
    console.error("Curation failed:", error);
    // Fail open: all Experiences (unconditional anyway) + all Points,
    // rather than leaving the visitor stuck if the API call fails.
    return res.status(200).json({ includedIds: allIds });
  }
};

function extractIncludedPointIds(apiResponse, allPointIds) {
  try {
    const textBlock = apiResponse.content.find((block) => block.type === "text");
    if (!textBlock) {
      const blockTypes = (apiResponse.content || []).map((b) => b.type).join(", ") || "none";
      throw new Error(`No text block in response (stop_reason: ${apiResponse.stop_reason}, blocks: [${blockTypes}])`);
    }
    const parsed = extractJsonObject(textBlock.text);
    const validIds = new Set(allPointIds);
    return (parsed.includedPointIds || []).filter((id) => validIds.has(id));
  } catch (parseError) {
    const rawSnippet = (apiResponse.content || [])
      .map((b) => b.text || "")
      .join("")
      .slice(0, 300);
    console.error("curate-timeline: failed to parse Claude's response:", parseError.message, "| raw response:", rawSnippet);
    // Fail open on Points specifically — include all of them rather than
    // silently dropping optional-but-potentially-valuable content.
    return allPointIds;
  }
}

// Models sometimes preface structured output with a bit of explanatory
// prose ("Based on the job description...") even when explicitly told
// to respond with ONLY JSON. Rather than relying on the instruction
// alone, this scans for the first balanced {...} object anywhere in the
// text, so leading or trailing commentary doesn't break parsing.
function extractJsonObject(text) {
  const start = text.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in response text");
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error("Unbalanced JSON object in response text");
}

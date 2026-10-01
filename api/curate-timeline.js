// POST /api/curate-timeline
// Body: { jobDescription: string, timeline: [...] }
// Returns: { includedIds: string[] }
//
// This is the ONLY place ANTHROPIC_API_KEY is ever read — it lives in
// Vercel's Environment Variables and is never sent to the browser.

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { jobDescription, timeline } = req.body;
  const trimmed = (jobDescription || "").trim();
  const allIds = timeline.map((e) => e.id);

  // No job context given — skip the API call entirely rather than asking
  // the model to judge relevance with nothing to judge against. Matches
  // the original mock's "generic fallback" behavior, and saves a real
  // API call for a case that genuinely needs no judgment.
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
        max_tokens: 1024,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [
          {
            role: "user",
            content:
              "You are helping curate a career timeline for a specific job application, from the perspective of a hiring manager.\n\n" +
              `Job description provided by the visitor:\n"""\n${trimmed}\n"""\n\n` +
              "Here is the candidate's full career history, as a JSON array of Experience and Point entries:\n" +
              JSON.stringify(timeline) +
              "\n\n" +
              "If the description names a specific company and role, use web search to try to find the actual posting and understand its real requirements. Then decide which entries above are most relevant to include on a tailored timeline for this role.\n\n" +
              'Respond with ONLY a JSON object in this exact shape, and nothing else: {"includedIds": ["id1", "id2", ...]}'
          }
        ]
      })
    });

    if (!anthropicResponse.ok) {
      throw new Error(`Anthropic API returned ${anthropicResponse.status}`);
    }

    const data = await anthropicResponse.json();
    const includedIds = extractIncludedIds(data, allIds);
    console.log(`curate-timeline: succeeded, included ${includedIds.length} of ${allIds.length} entries`);
    return res.status(200).json({ includedIds });
  } catch (error) {
    console.error("Curation failed:", error);
    // Fail open: show the full timeline rather than leaving the visitor
    // stuck on a blank page if the API call fails for any reason.
    return res.status(200).json({ includedIds: allIds });
  }
};

function extractIncludedIds(apiResponse, allIds) {
  try {
    // Claude's reply may include tool-use blocks (from web search) before
    // the final text block — find the actual text content among them.
    const textBlock = apiResponse.content.find((block) => block.type === "text");
    const parsed = JSON.parse(textBlock.text);
    const validIds = new Set(allIds);
    // Defensive: only trust ids that actually exist in the real data, in
    // case the model hallucinates or formats something unexpectedly.
    const filtered = parsed.includedIds.filter((id) => validIds.has(id));
    return filtered.length > 0 ? filtered : allIds;
  } catch (parseError) {
    // The API call itself succeeded, but the reply wasn't in the
    // expected shape — distinct from a network/auth failure, and worth
    // telling apart in the logs since the fix is different.
    console.error("curate-timeline: failed to parse Claude's response:", parseError);
    return allIds;
  }
}

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

  // ---- Basic abuse guards ----------------------------------------
  // None of this stops a determined, header-spoofing attacker — it
  // stops the far more common case: bots/scanners that discover this
  // URL and hit it directly, bypassing the site's UI entirely, with
  // no realistic headers or payload. See the chat for the account-level
  // protections (spend cap, rate limiting) that back this up.
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
  const allIds = timeline.map((e) => e.id);
  const mostRecentId = getMostRecentExperienceId(timeline);

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
              "If the description names a specific company and role, use web search to try to find the actual posting and understand its real requirements.\n\n" +
              `The most recent employment entry (id: "${mostRecentId}") MUST always be included, regardless of apparent relevance — recency itself is a required signal of current standing.\n\n` +
              "For every OTHER entry, make an INDEPENDENT judgment call: would a hiring manager screening specifically for this role's actual requirements consider this entry a meaningful, direct piece of supporting evidence? Judge each entry on its own merits against the real job requirements — not relative to the other entries, and not against any target count.\n\n" +
              "There is NO target number of entries to include. Let the genuine strength of the match determine the result size:\n" +
              "- An excellent, broad match might reasonably justify including most or even all of the candidate's history.\n" +
              "- A narrow, highly specialized role might reasonably justify including only a handful of entries.\n" +
              "- A good curation is SELECTIVE where selectivity is warranted — it is expected and desirable to exclude entries that don't meaningfully support this specific role, even if they would be impressive in a different context.\n\n" +
              "Points deserve this same individualized judgment, not automatic deprioritization relative to Experiences — a Point capturing a certification, side project, volunteer work, political campaign, or other notable activity can meaningfully strengthen a candidacy for some roles, and should be included whenever it genuinely does, even if it wouldn't for a more narrowly technical role.\n\n" +
              "List includedIds in descending order of how strongly each one supports this specific candidacy.\n\n" +
              'Respond with ONLY a JSON object in this exact shape, and nothing else: {"includedIds": ["id1", "id2", ...]}'
          }
        ]
      })
    });

    if (!anthropicResponse.ok) {
      throw new Error(`Anthropic API returned ${anthropicResponse.status}`);
    }

    const data = await anthropicResponse.json();
    const includedIds = extractIncludedIds(data, allIds, mostRecentId);
    console.log(`curate-timeline: succeeded, included ${includedIds.length} of ${allIds.length} entries`);
    return res.status(200).json({ includedIds });
  } catch (error) {
    console.error("Curation failed:", error);
    // Fail open: show the full timeline rather than leaving the visitor
    // stuck on a blank page if the API call fails for any reason.
    return res.status(200).json({ includedIds: allIds });
  }
};

// Among Experience entries only (a Point isn't "employment") — "present"
// always outranks any dated end, since it's inherently the most current.
function getMostRecentExperienceId(timeline) {
  const experiences = timeline.filter((e) => e.type === "experience");
  let best = experiences[0];
  experiences.forEach((e) => {
    if (getSortableEndDate(e) > getSortableEndDate(best)) best = e;
  });
  return best.id;
}

function getSortableEndDate(entry) {
  if (entry.dates.end === "present") return Infinity;
  return new Date(`${entry.dates.end}-01`).getTime();
}

function extractIncludedIds(apiResponse, allIds, mostRecentId) {
  try {
    // Claude's reply may include tool-use blocks (from web search) before
    // the final text block — find the actual text content among them.
    const textBlock = apiResponse.content.find((block) => block.type === "text");
    const parsed = JSON.parse(textBlock.text);
    const validIds = new Set(allIds);
    // Defensive: only trust ids that actually exist in the real data, in
    // case the model hallucinates or formats something unexpectedly.
    const filtered = parsed.includedIds.filter((id) => validIds.has(id));
    if (filtered.length === 0) return enforceMostRecent([mostRecentId], mostRecentId);
    // No ceiling to enforce here anymore — the result size is whatever
    // the model's per-entry judgment produced. The only thing still
    // enforced in code is the one genuine hard rule: recency.
    return enforceMostRecent(filtered, mostRecentId);
  } catch (parseError) {
    // The API call itself succeeded, but the reply wasn't in the
    // expected shape — distinct from a network/auth failure, and worth
    // telling apart in the logs since the fix is different.
    console.error("curate-timeline: failed to parse Claude's response:", parseError);
    return allIds;
  }
}

// Code-level guarantee that the most recent entry is present, regardless
// of whether the model actually followed the prompt instruction above.
function enforceMostRecent(ids, mostRecentId) {
  if (ids.includes(mostRecentId)) return ids;
  return [mostRecentId, ...ids];
}

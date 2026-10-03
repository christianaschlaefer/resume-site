// POST /api/finalize-resume
// Body: { jobDescription: string, finalizedBody: {...} }
// Returns: { title: string, executiveProfile: string }
//
// Runs ONLY after experience/bullet selection AND page-fitting are both
// already final — this call is given ONLY that finished body, never the
// full career history. That's what makes "grounded in what actually
// made the resume" a structural guarantee rather than just an
// instruction: the excluded material is literally not in this call's
// context at all, so it cannot reference it even by mistake.
//
// Uses forced tool-use structured output from the start — see
// compile-resume.js for why this is the reliable approach.

const FINALIZE_TOOL = {
  name: "finalize_resume_header",
  description: "Records the finalized resume title and executive summary paragraph.",
  input_schema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "A short professional headline, similar length/register to the default example provided."
      },
      executiveProfile: {
        type: "string",
        description: "A 2-4 sentence executive summary paragraph, similar length to the default example provided."
      }
    },
    required: ["title", "executiveProfile"]
  }
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ---- Basic abuse guards (same reasoning as the other two functions) ----
  const origin = req.headers.origin || req.headers.referer || "";
  if (!req.headers.host || !origin.includes(req.headers.host)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (JSON.stringify(req.body || {}).length > 200000) {
    return res.status(400).json({ error: "Payload too large" });
  }
  const { jobDescription, finalizedBody } = req.body || {};
  if (!finalizedBody || typeof finalizedBody !== "object") {
    return res.status(400).json({ error: "Invalid finalizedBody payload" });
  }
  if (jobDescription != null && (typeof jobDescription !== "string" || jobDescription.length > 5000)) {
    return res.status(400).json({ error: "Invalid job description" });
  }
  // --------------------------------------------------------------------

  const fallback = {
    title: finalizedBody.defaultTitle,
    executiveProfile: finalizedBody.defaultExecutiveProfile
  };

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
        tools: [FINALIZE_TOOL],
        tool_choice: { type: "tool", name: "finalize_resume_header" },
        messages: [
          {
            role: "user",
            content:
              "A resume's content has been fully finalized — every experience, bullet, and skill below is already decided and will NOT change. Your only job is to write a title and executive summary that best fit THIS finished body, for this specific job application.\n\n" +
              `Job context:\n"""\n${(jobDescription || "").trim()}\n"""\n\n` +
              "Finalized resume body (JSON) — this is the ONLY material you may draw from:\n" +
              JSON.stringify(finalizedBody) +
              "\n\n" +
              `Candidate's default title, for reference/tone: "${finalizedBody.defaultTitle}"\n` +
              `Candidate's default executive summary, for reference/tone: "${finalizedBody.defaultExecutiveProfile}"\n\n` +
              "Rules:\n" +
              "- The title and summary must accurately reflect the finalized body above — never introduce a claim, skill, or fact that isn't demonstrated somewhere in it.\n" +
              "- Adapt the EMPHASIS of the default title/summary to match what this specific finalized body emphasizes for this role — don't just repeat the defaults verbatim unless they're genuinely already the best fit.\n" +
              "- Keep the summary to roughly the same length as the default example — this is a resume header, not a cover letter.\n" +
              "- Before finalizing, double-check: does the title contradict or redundantly repeat the summary? Do both read as a clean, professional, consistent pair? Make one last small adjustment if not."
          }
        ]
      })
    });

    if (!anthropicResponse.ok) {
      throw new Error(`Anthropic API returned ${anthropicResponse.status}`);
    }

    const data = await anthropicResponse.json();
    const toolUseBlock = data.content.find((block) => block.type === "tool_use");
    if (!toolUseBlock || !toolUseBlock.input.title || !toolUseBlock.input.executiveProfile) {
      const blockTypes = (data.content || []).map((b) => b.type).join(", ") || "none";
      console.error(`finalize-resume: no valid tool_use block (stop_reason: ${data.stop_reason}, blocks: [${blockTypes}])`);
      return res.status(200).json(fallback);
    }

    console.log("finalize-resume: succeeded");
    return res.status(200).json({
      title: toolUseBlock.input.title,
      executiveProfile: toolUseBlock.input.executiveProfile
    });
  } catch (error) {
    console.error("Resume header finalization failed, using defaults:", error);
    return res.status(200).json(fallback);
  }
};

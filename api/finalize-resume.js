// POST /api/finalize-resume
// Body: { jobDescription, finalizedBody }
//   finalizedBody: { professional, pointsSection, coreExpertise, fluency,
//                    descriptionOptions, contactLineOptions, defaultExecutiveProfile }
// Returns: { title, contactLine, executiveProfile }
//
// Runs ONLY after the body is final (selection + two-page fit), and sees
// ONLY that finished body — never the full career history — so the
// tailored Executive Profile is structurally grounded in what's actually
// on the resume. The Professional Description and Contact Line are
// enum-constrained to the candidate's own options: the model selects,
// it never writes a new one.

const MAX_PROFILE_GROWTH = 1.3; // a tailored profile may not grow past 130% of the baseline

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ---- Basic abuse guards (same reasoning as the other functions) ----
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
  if (jobDescription != null && (typeof jobDescription !== "string" || jobDescription.length > 8000 /* visitor text + researched summary */)) {
    return res.status(400).json({ error: "Invalid job description" });
  }
  const strings = (arr) => (Array.isArray(arr) ? arr : [])
    .filter((s) => typeof s === "string" && s.trim() && s.length <= 300)
    .slice(0, 12);
  const descriptionOptions = [...new Set(strings(finalizedBody.descriptionOptions))];
  const contactLineOptions = [...new Set(strings(finalizedBody.contactLineOptions))];
  const defaultProfile = typeof finalizedBody.defaultExecutiveProfile === "string"
    ? finalizedBody.defaultExecutiveProfile.slice(0, 2000)
    : "";
  if (!descriptionOptions.length || !contactLineOptions.length || !defaultProfile) {
    return res.status(400).json({ error: "Missing header options" });
  }
  // ---------------------------------------------------------------------

  const fallback = {
    title: descriptionOptions[0],
    contactLine: contactLineOptions[0],
    executiveProfile: defaultProfile
  };

  // The model sees the finished body only — not the option lists' metadata.
  const body = {
    professional: finalizedBody.professional,
    pointsSection: finalizedBody.pointsSection,
    coreExpertise: finalizedBody.coreExpertise,
    fluency: finalizedBody.fluency
  };

  const tool = {
    name: "finalize_resume_header",
    description: "Records the resume header: the professional description, contact line, and executive profile.",
    input_schema: {
      type: "object",
      properties: {
        professionalDescription: { type: "string", enum: descriptionOptions },
        contactLine: { type: "string", enum: contactLineOptions },
        executiveProfile: {
          type: "string",
          description: "The tailored executive profile paragraph, close to the baseline's length."
        }
      },
      required: ["professionalDescription", "contactLine", "executiveProfile"]
    }
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
        tools: [tool],
        tool_choice: { type: "tool", name: "finalize_resume_header" },
        messages: [
          {
            role: "user",
            content:
              "A resume's body has been fully finalized — every experience, bullet, expertise item, and fluency line below is decided and will NOT change. Your job is the header, for this specific job application.\n\n" +
              `Job context:\n"""\n${(jobDescription || "").trim()}\n"""\n\n` +
              "Finalized resume body (JSON) — the ONLY material you may draw facts from, besides the baseline profile below:\n" +
              JSON.stringify(body) +
              "\n\n" +
              "1. PROFESSIONAL DESCRIPTION: choose the option that best fits this role and this finished body. If unsure, use the first option.\n" +
              `   Options: ${JSON.stringify(descriptionOptions)}\n\n` +
              "2. CONTACT LINE: choose the option that best fits the role. \"CONUS / OCONUS\" signals readiness for domestic and overseas assignments — best for roles with international, government, defense, or heavy-travel components. Otherwise use the first option.\n" +
              `   Options: ${JSON.stringify(contactLineOptions)}\n\n` +
              "3. EXECUTIVE PROFILE: start from the candidate's baseline below and tailor its EMPHASIS to this role and this finished body.\n" +
              `   Baseline: "${defaultProfile}"\n` +
              "   - Keep it close to the baseline's length (within about 10%) — it's a resume header, not a cover letter.\n" +
              "   - Never introduce a claim, number, or skill that isn't in the baseline or demonstrated in the finalized body.\n" +
              "   - If the baseline already fits this role well, light edits are better than a rewrite.\n\n" +
              "Before finalizing, check that the description and profile read as a consistent pair."
          }
        ]
      })
    });

    if (!anthropicResponse.ok) {
      throw new Error(`Anthropic API returned ${anthropicResponse.status}`);
    }

    const data = await anthropicResponse.json();
    const toolUseBlock = (data.content || []).find((block) => block.type === "tool_use");
    if (!toolUseBlock) {
      const blockTypes = (data.content || []).map((b) => b.type).join(", ") || "none";
      console.error(`finalize-resume: no tool_use block (stop_reason: ${data.stop_reason}, blocks: [${blockTypes}])`);
      return res.status(200).json(fallback);
    }

    // Enforce every rule in code, not just in the prompt.
    const input = toolUseBlock.input || {};
    const title = descriptionOptions.includes(input.professionalDescription) ? input.professionalDescription : fallback.title;
    const contactLine = contactLineOptions.includes(input.contactLine) ? input.contactLine : fallback.contactLine;
    let executiveProfile = typeof input.executiveProfile === "string" ? input.executiveProfile.trim() : "";
    if (!executiveProfile || executiveProfile.length > defaultProfile.length * MAX_PROFILE_GROWTH) {
      if (executiveProfile) console.warn(`finalize-resume: tailored profile too long (${executiveProfile.length} chars), using baseline`);
      executiveProfile = defaultProfile;
    }

    console.log(`finalize-resume: succeeded — "${title}" / ${contactLine.includes("OCONUS") ? "CONUS/OCONUS" : "Remote/Travel"}`);
    return res.status(200).json({ title, contactLine, executiveProfile });
  } catch (error) {
    console.error("Resume header finalization failed, using defaults:", error);
    return res.status(200).json(fallback);
  }
};

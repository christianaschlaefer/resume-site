// ============================================================
// TIMELINE DATA — Christian Schlaefer's real resume content
// Mapped from the actual resume provided earlier in this project.
// Several fields below are flagged with REVIEW comments — places
// where real content had to be restructured, approximated, or
// attributed to fit this schema, and genuinely deserve a read-through
// before this goes live for real applications.
// ============================================================

const timeline = [
  {
    type: "experience",
    id: "sap-concur",
    employer: "SAP Concur",
    jobTitle: "Senior Implementation Project Manager",
    dates: { start: "2022-01", end: "present" },
    location: "Remote | Lakota, Iowa",
    // REVIEW: drafted summary of your own bullets below, not new content.
    overview: "Leads enterprise SAP Concur implementations and serves as an implementation representative on emerging AI and API-based integration capabilities.",
    achievements: [
      "Serve as an implementation representative for emerging AI and digital-adoption capabilities, including Microsoft Copilot and an AI-assisted flat-file integration workflow using schema inference and template-independent data parsing; tested real-world use cases and provided implementation feedback supporting rollout and adoption.",
      "Selected by Product Development to field-test emerging API-based ERP integration capabilities, evaluating real-world implementation workflows and translating customer and implementation requirements into technical and product feedback.",
      "Developed and scaled an XML-based solution to a longstanding product data-extraction limitation, eliminating recurring 2-3 hour manual report recreation without a backend product change; presented division-wide and retained as a resource for subsequent enhancements.",
      "Manage ~10 concurrent enterprise technology deployments (~$350K active ARR) and have delivered 90+ SAP Concur Expense and Invoice implementations for U.S. and multinational organizations, averaging 5+ core implementations and $100K–$125K implemented ARR per quarter while owning discovery, solution design, configuration, integration coordination, testing, and deployment across North America, Europe, Latin America, and Asia-Pacific.",
      "Lead cross-functional programs across Finance, HR, IT, and operations, working with project leaders, CFOs, and executive sponsors to align technical requirements, deployment strategy, risk, testing, and adoption.",
      "Lead the team's At Risk customer program, taking ownership of difficult and stalled engagements to diagnose failure points, establish recovery plans, restore progress, retain customers, and recover at-risk revenue.",
      "Lead cross-functional project teams of up to 12–15 participants across implementation, technical, commercial, and customer organizations; serve as a formal mentor and technical resource for implementation professionals, with multiple SAP Spot Awards for performance and organizational impact."
    ],
    // REVIEW: every skill below comes verbatim from your resume's Core
    // Expertise / Technical Fluency sections, but your resume pools them
    // at the document level rather than tying each to a specific job.
    // I attached the full set here since SAP Concur is where they're
    // actually demonstrated — let me know if any should also apply to
    // your other roles.
    skills: [
      { name: "Technical Program Leadership", tags: ["expertise"] },
      { name: "Product Requirements & Discovery", tags: ["expertise"] },
      { name: "Enterprise AI Adoption", tags: ["expertise"] },
      { name: "Systems Integration", tags: ["expertise"] },
      { name: "ERP & Business Systems", tags: ["expertise"] },
      { name: "APIs & Data Integration", tags: ["expertise"] },
      { name: "Product Development Collaboration", tags: ["expertise"] },
      { name: "User Adoption", tags: ["expertise"] },
      { name: "Executive Stakeholder Leadership", tags: ["expertise"] },
      { name: "Emerging Technology Evaluation", tags: ["expertise"] },
      { name: "Testing & Validation", tags: ["expertise", "softTechnical"] },
      { name: "Program Recovery", tags: ["expertise"] },
      { name: "APIs", tags: ["hardTechnical"] },
      { name: "Python", tags: ["hardTechnical"] },
      { name: "CLI Workflows", tags: ["hardTechnical"] },
      { name: "JSON", tags: ["hardTechnical"] },
      { name: "XML", tags: ["hardTechnical"] },
      { name: "CSV / Flat-File Integration", tags: ["hardTechnical"] },
      { name: "Data & Schema Mapping", tags: ["hardTechnical"] },
      { name: "SQL Familiarity", tags: ["hardTechnical"] },
      { name: "Identity/SSO", tags: ["hardTechnical"] },
      { name: "Multi-ERP Environments", tags: ["hardTechnical"] },
      { name: "LLM API Integration", tags: ["hardTechnical"] },
      { name: "Retrieval-Augmented Generation (RAG)", tags: ["hardTechnical"] },
      { name: "Embeddings & Vector Search", tags: ["hardTechnical"] },
      { name: "Tool Calling", tags: ["hardTechnical"] },
      { name: "Structured Outputs", tags: ["hardTechnical"] },
      { name: "Prompt & Context Management", tags: ["hardTechnical"] },
      { name: "AI Evaluation & Confidence Handling", tags: ["hardTechnical"] },
      { name: "Emergent Requirements & Rapid Problem Resolution", tags: ["softTechnical"] },
      { name: "Multi-Stage Deployment & Operational Adoption", tags: ["softTechnical"] },
      { name: "Integration Troubleshooting", tags: ["softTechnical"] },
      { name: "Technical Requirements Translation", tags: ["softTechnical"] }
    ],
    resumeCategories: ["professional"],
    details: []
  },
  {
    type: "experience",
    id: "exact-sciences",
    employer: "Exact Sciences Corporation",
    jobTitle: "Medical Representative - Provider Engagement",
    dates: { start: "2020-08", end: "2021-10" },
    location: "Madison, WI | Northern New Jersey Territory",
    overview: "Drove adoption of a reporting platform across physician practices and hospital systems in the Northern New Jersey territory.",
    achievements: [
      "Led rollout of Exact Sciences' reporting platform across 70+ physician practices and hospital environments, supporting hundreds of providers and presenting to audiences of 300+ personnel and healthcare-system executives; drove 20%+ quarter-over-quarter adoption growth during 2021 and routinely ranked among the strongest territories."
    ],
    skills: [],
    resumeCategories: ["professional"],
    details: []
  },
  {
    type: "experience",
    id: "american-councils",
    employer: "American Councils for International Education",
    jobTitle: "Program Manager",
    dates: { start: "2018-05", end: "2020-03" },
    location: "Bucharest, Romania / Remote",
    overview: "Managed multi-phase international programs, coordinating government, embassy, and institutional stakeholders across cross-border logistics.",
    achievements: [
      "Managed multi-phase international programs serving hundreds of participants, coordinating government officials, U.S. Embassy personnel, NGOs, institutional partners, cross-border logistics, and stakeholder communications while working 4+ months on-site in Bucharest and remotely between phases."
    ],
    skills: [],
    resumeCategories: ["professional"],
    details: []
  },
  {
    type: "experience",
    id: "jpmorgan",
    employer: "JPMorgan Chase",
    jobTitle: "Banker",
    dates: { start: "2015-06", end: "2017-03" },
    location: "Seattle, Washington",
    overview: "Ranked among the top bankers nationally for sales performance, with a particular strength in growing first-time investor engagement.",
    achievements: [
      "Ranked in the 93rd percentile nationally for overall banker sales performance and developed an engagement strategy that drove 167% growth in first-time investor activity."
    ],
    skills: [],
    resumeCategories: ["professional"],
    details: []
  },
  {
    type: "experience",
    id: "congressional-campaign",
    employer: "U.S. House of Representatives Campaign",
    jobTitle: "Candidate",
    // REVIEW: your resume only lists "2025-2026" with no months — this
    // date range is an approximation. Please correct to the actual
    // start/end months.
    dates: { start: "2025-01", end: "2026-01" },
    location: "Iowa's 4th Congressional District",
    overview: "Directed a 36-county campaign organization, winning the Iowa Caucus straw poll for Iowa's 4th Congressional District.",
    achievements: [
      "Built and directed a campaign organization spanning 36 Iowa counties, recruiting county leaders and volunteers while managing contractors, vendors, field operations, public communications, procurement, and stakeholder relationships; won the Iowa Caucus straw poll for Iowa's 4th Congressional District."
    ],
    skills: [],
    resumeCategories: ["internationalGovernment", "leadership"],
    details: []
  },
  {
    type: "experience",
    id: "embassy-tokyo",
    employer: "U.S. Embassy Tokyo",
    jobTitle: "General Services",
    // REVIEW: original lists this as two separate summer appointments
    // (2013 and 2014), not one continuous role — approximated here as
    // a single span. Consider whether you'd rather split this into two
    // entries instead.
    dates: { start: "2013-06", end: "2014-08" },
    location: "Tokyo, Japan",
    overview: "Summer appointments with extensive experience living and working independently abroad, building cross-cultural working relationships.",
    achievements: [
      "Extensive experience living and working independently abroad; comfortable operating in unfamiliar environments and building cross-cultural working relationships. Russian, university study."
    ],
    skills: [],
    resumeCategories: ["internationalGovernment"],
    details: []
  },
  {
    type: "point",
    id: "pt-ai-project",
    header: "Independent AI Project: ERP Integration Mapping Assistant",
    // REVIEW: no date was given in the original resume for this
    // project — placeholder, please correct.
    date: "2026-01",
    bodyText: "Built a local LLM-assisted prototype that compares ERP source schemas with target integration templates, retrieves relevant technical documentation, and generates source-grounded field-mapping recommendations with confidence flags and supporting rationale."
  }
];

// Kept entirely SEPARATE from `timeline` on purpose — education entries
// are never sent to curate-timeline.js and never go through LLM
// judgment at all. They're merged into the render queue unconditionally
// in main.js (appendCuratedTimeline), the same way landing/outro are.
const education = [
  {
    type: "education",
    id: "edu-stolaf",
    degree: "Bachelor of Arts, Political Science",
    institution: "St. Olaf College",
    location: "Northfield, Minnesota",
    year: "2020"
  },
  {
    type: "education",
    id: "edu-clark",
    degree: "Associate of Arts, Business Administration",
    institution: "Clark College",
    location: "Vancouver, Washington",
    year: "2017"
  }
];

// No Detail popups defined yet — add entries here, referenced from
// the `details` array on any timeline entry above, the same way the
// test dataset did.
const details = {};

// ============================================================
// PROFILE
// ============================================================

const profile = {
  name: "Christian Schlaefer",
  title: "Technical Program & International Operations Leader",
  location: "Lakota, Iowa",
  travelAvailability: "Remote | Available for CONUS / OCONUS Travel",
  phone: "802-363-2433",
  email: "christian.a.schlaefer@gmail.com",
  executiveProfileDefault:
    "Technical program and enterprise technology leader with 10+ years of experience delivering complex " +
    "technology programs, driving product adoption, and translating business and user requirements into " +
    "scalable technical solutions. At SAP Concur, has led 90+ enterprise deployments spanning ERP/API " +
    "integrations, multinational implementations, and emerging technology initiatives. Experience includes " +
    "direct collaboration with Product Development on new API-based integration capabilities, AI-assisted " +
    "data-integration workflows, solution innovation, executive stakeholder leadership, and recovery of " +
    "complex programs. Known for operating effectively in ambiguity, identifying product and process " +
    "limitations, and developing practical solutions that improve adoption and execution."
};

// ============================================================
// RESUME SELECTION (emergency fallback only — see main.js)
// ============================================================

const secondaryHeadingLabels = {
  leadership: "SELECTED LEADERSHIP EXPERIENCE",
  internationalGovernment: "SELECTED INTERNATIONAL & GOVERNMENT EXPERIENCE",
  selected: "SELECTED EXPERIENCE"
};

const resumeSelection = {
  experiences: timeline
    .filter((e) => e.type === "experience")
    .map((e) => ({
      id: e.id,
      section: (e.resumeCategories && e.resumeCategories[0]) || "professional",
      bullets: e.achievements
    })),
  points: timeline.filter((e) => e.type === "point").map((e) => e.id)
};

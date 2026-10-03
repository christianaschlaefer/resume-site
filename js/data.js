// ============================================================
// CAREER DATA — Christian Schlaefer
// ------------------------------------------------------------
// The single source of truth for the whole site. The timeline, the
// skill archive, and the resume are all rendered FROM this file, and
// the API functions receive these entries in each request — so
// editing your career means editing this file only.
//
// Source: the "RESUME - BASE" data document (Oct 2026). Lines marked
// REVIEW flag places where the source needed interpretation.
//
// ENTRY TYPES
//   experience — a core role. ALWAYS on the timeline (a period drawn to
//     time scale) and ALWAYS on the resume with at least one bullet (only
//     the single oldest may be dropped, and only when unrelated to the role
//     and space is needed).
//       resumeSection: "professional" → PROFESSIONAL EXPERIENCE
//                        (two-line heading: ORG | Title, then Dates | Location)
//                      "points"       → the Points section
//                        (one-line heading: ORG | Role | Location | Dates)
//       dateText:   optional — replaces the displayed dates (e.g. two summers)
//       concurrent: optional — true for a side role held alongside another
//       color:      optional — overrides the timeline accent color
//   point — an optional extra. The timeline AI decides whether it appears
//     (branching below the line); the resume AI decides whether it earns a
//     place in the Points section.
//       org / role / location: build the one-line resume heading
//       date:    "YYYY-MM" — positions it on the timeline (never displayed
//                there); shown on the resume
//       endDate: optional "YYYY-MM" for a ranged item
//       resumeEligible: false — timeline only; never sent to the resume AI
//   education — separate array below; always shown, never AI-judged.
// ============================================================

const timeline = [
  // ---------------- Core Experiences ----------------
  {
    type: "experience",
    id: "sap-concur",
    employer: "SAP Concur",
    jobTitle: "Senior Implementation Project Manager",
    dates: { start: "2022-01", end: "present" },
    location: "Remote | Lakota, Iowa",
    resumeSection: "professional",
    // Timeline-card summary of your own bullets (not shown on the resume).
    overview: "Leads enterprise SAP Concur implementations and represents Implementation in the testing and rollout of new AI and API-based integration capabilities.",
    achievements: [
      "Independently manage approximately 10 concurrent implementation engagements representing ~$350K in active ARR, consistently completing 5+ core implementations per quarter and contributing roughly $100K–$125K in implemented ARR quarterly within a top-performing team bringing $1M+ ARR live each quarter.",
      "Delivered 90+ SaaS implementations across SAP Concur Expense and Invoice, personally owning requirements discovery, solution design, hands-on configuration, integration coordination, testing, deployment, and adoption across organizations in North America, Europe, Latin America, and Asia-Pacific, including country-specific requirements and configuration for the U.S., Canada, U.K., Italy, Germany, Japan, Mexico, the Philippines, and Bulgaria.",
      "Lead cross-functional customer programs across Finance, HR, IT, and operations, working directly with project leaders, CFOs, and executive sponsors to align technical requirements, deployment strategy, risk, and adoption.",
      "Developed and scaled an XML-based solution to a longstanding product data-extraction limitation, eliminating a recurring 2–3 hour manual report-recreation process without requiring a backend product change; presented the solution division-wide and became a management resource for subsequent enhancements.",
      "Selected to field-test new API-based ERP integration capabilities with product development, translating implementation experience into technical feedback designed to streamline onboarding and support expansion of an emerging product offering.",
      "Lead the team’s At Risk customer program, taking ownership of difficult and stalled engagements outside my portfolio to restore progress, retain customers, and recover at-risk revenue.",
      // REVIEW: this bullet and the last one both end with "serve as a formal
      // mentor and technical resource for implementation professionals."
      "Routinely bridge Implementation and commercial teams on expansion, retention, scope, and account strategy, balancing revenue opportunity against technical feasibility and delivery risk. Recognized through multiple Spot Awards for performance, technical contribution, and organizational impact; serve as a formal mentor and technical resource for implementation professionals.",
      "Represent Implementation in testing and rollout of new AI and digital-adoption capabilities, including Microsoft Copilot, WalkMe, and an AI-assisted flat-file integration workflow using schema inference to interpret nonstandard client file structures without fixed templates; tested real-world use cases and provided product and technical feedback supporting broader rollout and adoption.",
      "Lead cross-functional project teams of up to 12–15 participants across implementation, technical, commercial, and customer organizations; serve as a formal mentor and technical resource for implementation professionals."
    ],
    // Drives the timeline's skill archive only. Tags are no longer used by
    // the resume — Core Expertise and Fluency now come from resumeOptions.
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
    details: []
  },
  {
    type: "experience",
    id: "congressional-campaign",
    employer: "U.S. House of Representatives Campaign",
    jobTitle: "Candidate",
    dates: { start: "2025-09", end: "2026-03" },
    location: "",
    resumeSection: "points",
    concurrent: true,
    overview: "Built and directed a 36-county campaign organization, winning the Iowa Caucus straw poll for Iowa's 4th Congressional District.",
    achievements: [
      "Built and directed a distributed campaign organization spanning 36 Iowa counties, personally recruiting volunteers, county captains, and local leaders; established organizational structure, assigned responsibilities, and managed execution across field operations.",
      "Managed independent contractors, vendors, creative development, production, procurement, campaign strategy, public communications, and stakeholder engagement across a competitive federal race; developed relationships with elected officials and community leaders throughout Iowa and won the Iowa Caucus straw poll for Iowa's 4th Congressional District."
    ],
    skills: [],
    details: []
  },
  {
    type: "experience",
    id: "exact-sciences",
    employer: "Exact Sciences Corporation",
    jobTitle: "Medical Representative - Provider Engagement",
    dates: { start: "2020-08", end: "2021-10" },
    location: "Madison, WI | Northern New Jersey Territory",
    resumeSection: "professional",
    overview: "Drove rollout and adoption of a reporting platform across physician practices and hospital systems in the Northern New Jersey territory.",
    achievements: [
      "Led rollout and adoption of Exact Sciences' colorectal-cancer reporting platform across 70+ physician practices and hospital environments, supporting hundreds of healthcare providers and delivering software, workflow, and strategy presentations to audiences of 300+ personnel and healthcare-system executives.",
      "Directed provider engagement and technology-adoption strategy in coordination with field and commercial teams, producing 20%+ quarter-over-quarter adoption growth during 2021 and routinely positioning the territory among the organization's strongest performers."
    ],
    skills: [],
    details: []
  },
  {
    type: "experience",
    id: "american-councils",
    employer: "American Councils for International Education",
    jobTitle: "Program Manager",
    dates: { start: "2018-05", end: "2020-03" },
    location: "Bucharest, Romania / Remote",
    resumeSection: "professional",
    overview: "Managed multi-phase international programs, coordinating government, embassy, NGO, and institutional partners.",
    achievements: [
      "Managed multi-phase international programs serving hundreds of participants, coordinating execution across government officials, U.S. Embassy personnel, NGOs, and institutional partners while working on-site in Bucharest for 4+ months; delivered against budget, scope, and quality requirements."
    ],
    skills: [],
    details: []
  },
  {
    type: "experience",
    id: "jpmorgan",
    employer: "JPMorgan Chase",
    jobTitle: "Banker",
    dates: { start: "2015-06", end: "2017-03" },
    location: "Seattle, Washington",
    resumeSection: "professional",
    overview: "Ranked in the 93rd percentile nationally for sales performance and drove 167% growth in first-time investor activity.",
    achievements: [
      "Ranked in the 93rd percentile nationally for overall banker sales performance across JPMorgan Chase's consumer-banking organization.",
      "Developed a proactive banker-advisor engagement strategy that drove 167% growth in first-time investor activity by replacing passive referral practices with targeted client identification."
    ],
    skills: [],
    details: []
  },
  {
    type: "experience",
    id: "embassy-tokyo",
    employer: "U.S. Embassy Tokyo",
    jobTitle: "General Services",
    // REVIEW: two separate summer appointments. The timeline needs one span,
    // so it's approximated here; dateText is what visitors actually see.
    dates: { start: "2013-06", end: "2014-08" },
    dateText: "Summer Appointment 2013 and 2014",
    location: "Tokyo, Japan",
    resumeSection: "points",
    overview: "Supported U.S. diplomatic mission operations in General Services, including lead-vehicle motorcade support for a senior official's visit.",
    achievements: [
      "Supported U.S. diplomatic mission operations in General Services, coordinating motor-pool scheduling, official movements, and transport of sensitive identity documents; selected for motorcade support during a visit by the U.S. Under Secretary of Energy, serving in the lead vehicle for advance arrival, staging, and airport-movement coordination."
    ],
    skills: [],
    details: []
  },

  // ---------------- Points ----------------
  {
    type: "point",
    id: "pt-erp-mapping",
    org: "Independent AI Project",
    role: "ERP Integration Mapping Assistant",
    date: "2026-05",
    bullets: [
      "Built a local LLM-assisted prototype that compares ERP source schemas with target integration templates, retrieves relevant technical documentation, and generates source-grounded field-mapping recommendations with confidence flags and supporting rationale."
    ]
  },
  {
    type: "point",
    id: "pt-resume-site",
    org: "Independent AI Project",
    role: "Resume Timeline Site",
    date: "2026-09",
    bullets: [
      "Designed and built a full-stack, AI-powered interactive resume platform (vanilla JS frontend, serverless Node.js backend on Vercel) featuring a scroll-driven career timeline, with APIs performing live web search to analyze real job postings and dynamically tailoring content to each specific role.",
      "Engineered a multi-stage LLM pipeline with structured-output extraction, iterative page-fit correction, and automated resume header generation - resulting in accurately compiled, properly-formatted two-page resumes and PDFs in real time, backed by rate limiting, input validation, and fail-safe fallbacks for production reliability."
    ]
  },
  {
    type: "point",
    id: "pt-owner-builder",
    org: "Designer / General Contractor",
    role: "Residential & Agricultural Owner Builder",
    date: "2023-07",
    bullets: [
      "Plan and execute residential and agricultural construction projects from architectural design, from site work through finish - including material selection and procurement, sequencing, supplier and trade coordination, and substantial hands-on construction.",
      "Practical experience across concrete, structural framing, roofing, building-envelope and waterproofing systems; interior finish work, and mechanical/electrical coordination; routinely evaluate products and construction methods for performance, cost, and constructability."
    ]
  },
  {
    type: "point",
    id: "pt-tower-ridge",
    org: "Tower Ridge Farms",
    role: "Owner/Operator",
    date: "2022-05",
    bullets: [
      "Operate a small family livestock farm with my wife, raising lamb for meat and handling the full process from animal care and pasture management through processing coordination, packaging, sales, and customer delivery.",
      "Market and sell our own product directly to customers, including order fulfillment, shipping, local delivery, and the day-to-day upkeep and improvement of the farm."
    ]
  },
  {
    type: "point",
    id: "pt-stolaf-football",
    org: "St. Olaf College",
    role: "Senior Equipment Manager, Football Operations",
    date: "2017-09",
    endDate: "2020-01",
    bullets: [
      "Managed football equipment and logistics operations, including inventory, equipment issue/return, travel packing and itemization, storage, and practice-field setup; supervised 2–3 student staff under the coaching organization."
    ]
  },
  {
    type: "point",
    id: "pt-lvfd-firefighter",
    org: "Lakota Volunteer Fire Department",
    role: "Firefighter",
    date: "2024-02",
    bullets: [
      "Serve as a volunteer firefighter supporting basic fireground operations, including interior entry, suppression support, scene safety, equipment readiness, and EMS assistance; Iowa Firefighter I certified."
    ]
  },
  {
    type: "point",
    id: "pt-lvfd-training",
    org: "Lakota Volunteer Fire Department",
    role: "Training Officer",
    // REVIEW: the heading says Feb. 2026, but the bullet says appointed Jan. 2026.
    date: "2026-02",
    bullets: [
      "Appointed Training Officer in Jan. 2026, responsible for helping plan, coordinate, and deliver department training to support firefighter readiness, procedural consistency, and safe operations."
    ]
  },
  {
    type: "point",
    id: "pt-lay-preacher",
    org: "St. Paul’s Lutheran Church & Bethany Reformed Church",
    role: "Lay Preacher",
    date: "2025-05",
    bullets: [
      "Serve as a part-time lay preacher, preparing and delivering sermons and leading worship services for local congregations.",
      "Participate in broader church life and congregational affairs, supporting service planning, pastoral needs, and community engagement as requested."
    ]
  },
  {
    type: "point",
    id: "pt-married",
    org: "Married",
    date: "2022-09",
    // Personal milestone: part of the story on the timeline, never on the resume.
    resumeEligible: false,
    bullets: [
      "Married my wife and built our home and life together in rural Iowa."
    ]
  },
  {
    type: "point",
    id: "pt-father",
    org: "Became a Father",
    date: "2026-06",
    resumeEligible: false,
    bullets: [
      "Welcomed our first child and began a new chapter centered on family, responsibility, and the future."
    ]
  }
];

// Kept entirely SEPARATE from `timeline` on purpose — education entries
// are never sent to the AI and never judged. js/timeline.js adds them
// unconditionally as stations on the line. Optional fields: `start` /
// `end` ("YYYY-MM") to draw a degree as a period instead of a station,
// `date` ("YYYY-MM") to pin the graduation month (defaults to June of
// `year`), and `bullets` for honors shown when the station is opened.
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

// No Detail popups defined yet — add entries here, referenced from the
// `details` array on any timeline entry above.
const details = {};

// ============================================================
// PROFILE — the resume header
// For each list, the FIRST option is the default the site falls back to.
// ============================================================

const profile = {
  name: "Christian Schlaefer",
  descriptionOptions: [
    "Technical Program & Implementation Leader",
    "Technical Program & International Operations Leader",
    "Program & Transformation Leader",
    "Technical Program & Implementation Leader | Enterprise SaaS Delivery",
    "Technical Program & Implementation Leader | AI Project Manager"
  ],
  contactLineOptions: [
    "Lakota, Iowa | Remote / Travel | 802-363-2433 | christian.a.schlaefer@gmail.com",
    "Lakota, Iowa | CONUS / OCONUS | 802-363-2433 | christian.a.schlaefer@gmail.com"
  ],
  // The baseline the AI tailors per role — and the fallback if it can't.
  executiveProfileDefault:
    "Technical program and enterprise SaaS implementation leader with 10+ years of progressive customer-facing " +
    "and organizational leadership, including 4+ years at SAP Concur and 90+ SaaS implementations for " +
    "customers across a wide range of industries. Combines executive stakeholder management with hands-on " +
    "solution configuration, ERP/API integration fluency, strategic analysis, and independent ownership of " +
    "high-value customer portfolios. Known for solving technical problems, recovering difficult engagements, " +
    "developing other professionals, and leading organizational change."
};

// ============================================================
// RESUME OPTIONS — the closed lists the resume AI selects from.
// It can choose and order these, never invent new ones; the limits
// below are enforced in code regardless of what it returns.
// ============================================================

const resumeOptions = {
  // First = default.
  pointsHeaders: [
    "SELECTED LEADERSHIP & RELEVANT EXPERIENCE",
    "SELECTED INTERNATIONAL & GOVERNMENT EXPERIENCE",
    "SELECTED LEADERSHIP EXPERIENCE",
    "ADDITIONAL RELEVANT EXPERIENCE"
  ],

  // Duplicates in the source list removed.
  coreExpertise: [
    "Technical Program Leadership",
    "Enterprise SaaS Implementation",
    "Organizational & Cross-Functional Leadership",
    "Executive Stakeholder Management",
    "Technical Solution Configuration",
    "ERP & Financial-System Integrations",
    "APIs & Data Integration",
    "Risk & Escalation Management",
    "Revenue Realization & Expansion",
    "Process Improvement",
    "Commercial Strategy",
    "Training & Mentorship",
    "Cross-Functional Program Delivery",
    "Product Validation & Technical Feedback",
    "Technical Requirements Translation",
    "Strategic Program Leadership",
    "Business Transformation",
    "Program Recovery & Escalation",
    "Project Prioritization",
    "Organizational Change & Adoption",
    "Vendor & Stakeholder Coordination",
    "Systems Integration & Deployment",
    "International Operations",
    "Enterprise Technology",
    "Testing & Validation",
    "Training & Operational Adoption",
    "Emergent Requirements Management"
  ],
  coreExpertiseMaxChars: 350,

  // Lines with `items` are pick-and-order lists; lines with `text` are
  // used verbatim or left out. The first three are the fallback set.
  fluency: [
    {
      label: "Core Platforms & Configuration",
      items: ["SAP Concur Travel, Expense & Invoice", "Enterprise SaaS Configuration"]
    },
    {
      label: "Integration & Data",
      items: ["APIs", "XML", "SFTP", "Flat-File Integrations", "Data Mapping", "Identity/SSO", "SQL Familiarity",
        "Multi-ERP Environments", "Jira", "Gainsight", "SAP Project Management", "Concur Expense", "Concur Invoice"]
    },
    {
      label: "Enterprise Systems & Delivery",
      items: ["SAP ERP", "Oracle", "QuickBooks", "Sage", "Salesforce", "ServiceNow", "Gainsight", "Jira",
        "Microsoft Excel", "Integration Troubleshooting", "Technical Requirements Translation",
        "Multi-Stage Deployment & Operational Adoption"]
    },
    {
      label: "Certifications",
      items: ["SAP Project Management", "Concur Expense", "Concur Invoice", "SAP RISE", "SAP GROW", "Challenger Sales"]
    },
    {
      label: "Construction & Materials Familiarity",
      text: "5+ years of hands-on construction and owner-builder GC experience on both residential and agricultural projects; spanning concrete, structural framing, building-envelope systems, waterproofing, roofing, mechanical systems, construction-material selection, procurement, and trade coordination."
    },
    {
      label: "Languages & Security Studies",
      items: ["Russian - university study / basic conversational proficiency", "Arabic - university study",
        "Senior thesis on Russian military readiness and prospects for military expansion after 2020"]
    },
    {
      label: "International Experience",
      text: "Extensive experience living and working independently abroad; comfortable operating in unfamiliar environments and building cross-cultural working relationships."
    }
  ],
  fluencyLineMaxChars: 350,
  fluencyMaxLines: 4
};

// ============================================================
// RESUME SELECTION (emergency fallback only — see main.js)
// Every experience with all its bullets, no optional Points, and the
// default header/expertise/fluency choices filled in by the renderer.
// ============================================================

const resumeSelection = {
  experiences: timeline
    .filter((e) => e.type === "experience")
    .map((e) => ({ id: e.id, section: e.resumeSection || "professional", bullets: e.achievements })),
  points: [],
  pointsHeader: resumeOptions.pointsHeaders[0],
  coreExpertise: [],
  fluency: []
};

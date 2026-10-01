// ============================================================
// TIMELINE DATA
// This is the single source of truth for the whole site.
//
// TEST DATASET NOTE: this career is intentionally split into two
// clearly-differentiated tracks — early technical/software roles
// (swe-01..05) and a later pivot into program/project management
// (pm-01..05) — specifically so curation behavior can be verified by
// contrast: a PM-targeted job description should surface mostly the
// pm- entries, a SWE-targeted one mostly the swe- entries, and a
// hybrid role (e.g. "Technical Program Manager") is a genuine edge
// case worth watching.
// ============================================================

const timeline = [
  {
    type: "point",
    id: "pt-01",
    header: "Started Learning to Code",
    date: "2008-09",
    bodyText: "Began teaching myself the fundamentals of programming."
  },
  {
    type: "experience",
    id: "swe-01",
    employer: "TechNova Solutions",
    jobTitle: "Junior Software Developer",
    dates: { start: "2009-01", end: "2012-02" },
    location: "Austin, TX",
    overview: "Entry-level developer on a small team building internal tools and customer-facing web features.",
    achievements: [
      "Built and shipped 8 internal tooling features used daily by the 40-person support team, reducing average ticket resolution time by 15%.",
      "Rewrote a legacy reporting module in Python, cutting report generation time from 10 minutes to under 30 seconds."
    ],
    skills: [
      { name: "JavaScript", tags: ["hardTechnical"] },
      { name: "Python", tags: ["hardTechnical"] },
      { name: "SQL", tags: ["hardTechnical"] }
    ],
    resumeCategories: ["professional"],
    details: []
  },
  {
    type: "experience",
    id: "swe-02",
    employer: "BrightPath Software",
    jobTitle: "Full-Stack Developer",
    dates: { start: "2012-03", end: "2015-06" },
    location: "Austin, TX",
    overview: "Full-stack developer on a SaaS product serving small-business customers, owning features end-to-end from database to UI.",
    achievements: [
      "Designed and built a self-service billing dashboard adopted by the full customer base within 2 quarters, reducing billing support tickets by 35%.",
      "Led migration of the application's data layer to PostgreSQL, improving query performance by 4x under peak load."
    ],
    skills: [
      { name: "Ruby on Rails", tags: ["hardTechnical"] },
      { name: "PostgreSQL", tags: ["hardTechnical"] },
      { name: "JavaScript", tags: ["hardTechnical"] },
      { name: "REST APIs", tags: ["hardTechnical", "expertise"] }
    ],
    resumeCategories: ["professional"],
    details: [
      { anchorText: "improving query performance by 4x under peak load", detailId: "det-pg-migration" }
    ]
  },
  {
    type: "experience",
    id: "pm-01",
    employer: "Meridian Consulting Group",
    jobTitle: "Project Coordinator",
    dates: { start: "2015-07", end: "2017-08" },
    location: "Dallas, TX",
    overview: "Coordinated mid-sized client engagements for a management consulting firm, supporting project leads on scheduling, budgets, and client communications.",
    achievements: [
      "Coordinated logistics and status reporting across 12 concurrent client engagements, maintaining on-time reporting to engagement leads throughout.",
      "Built a standardized project tracking template later adopted firm-wide across 6 consulting teams."
    ],
    skills: [
      { name: "Stakeholder Communication", tags: ["softTechnical", "expertise"] },
      { name: "Project Scheduling", tags: ["softTechnical"] },
      { name: "Microsoft Excel", tags: ["hardTechnical"] }
    ],
    resumeCategories: ["professional"],
    details: []
  },
  {
    type: "experience",
    id: "swe-03",
    employer: "Northfield Systems",
    jobTitle: "Senior Software Engineer",
    dates: { start: "2017-09", end: "2020-05" },
    location: "Remote",
    overview: "Senior engineer on a distributed systems team building the core transaction-processing backend for a fintech platform.",
    achievements: [
      "Architected a new event-driven transaction pipeline handling over 2 million daily transactions at 99.99% uptime.",
      "Mentored 4 junior engineers and led the team's migration from a monolith to microservices, cutting deployment time from 45 minutes to 6."
    ],
    skills: [
      { name: "Java", tags: ["hardTechnical"] },
      { name: "Kafka", tags: ["hardTechnical"] },
      { name: "Microservices Architecture", tags: ["hardTechnical", "expertise"] },
      { name: "System Design", tags: ["hardTechnical", "expertise"] },
      { name: "Team Leadership", tags: ["softTechnical", "expertise"] }
    ],
    resumeCategories: ["professional", "leadership"],
    details: [
      { anchorText: "event-driven transaction pipeline", detailId: "det-transaction-pipeline" }
    ]
  },
  {
    type: "point",
    id: "pt-02",
    header: "AWS Certified Developer",
    date: "2020-08",
    bodyText: "Completed AWS Certified Developer – Associate certification.",
    details: [
      { anchorText: "AWS Certified Developer – Associate", detailId: "det-aws-cert" }
    ]
  },
  {
    type: "experience",
    id: "swe-04",
    employer: "CloudAxis Technologies",
    jobTitle: "DevOps Engineer",
    dates: { start: "2020-06", end: "2021-08" },
    location: "Remote",
    overview: "Owned CI/CD and cloud infrastructure for a 25-engineer product organization migrating to Kubernetes.",
    achievements: [
      "Led migration of all production services to Kubernetes on AWS, reducing infrastructure costs by 28% and deployment failures by 60%.",
      "Built a fully automated CI/CD pipeline that cut average deploy time from 2 hours to 12 minutes."
    ],
    skills: [
      { name: "Kubernetes", tags: ["hardTechnical"] },
      { name: "AWS", tags: ["hardTechnical", "expertise"] },
      { name: "CI/CD", tags: ["hardTechnical"] },
      { name: "Terraform", tags: ["hardTechnical"] }
    ],
    resumeCategories: ["professional"],
    details: []
  },
  {
    type: "experience",
    id: "swe-05",
    employer: "Orbit Mobile Labs",
    jobTitle: "Mobile Developer",
    dates: { start: "2021-09", end: "2022-06" },
    location: "Remote",
    overview: "iOS and Android developer on a consumer fitness app with over 500,000 active users.",
    achievements: [
      "Rebuilt the app's onboarding flow in Swift and Kotlin, increasing trial-to-paid conversion by 22%.",
      "Reduced app crash rate from 2.1% to 0.3% by rewriting the core data-sync layer."
    ],
    skills: [
      { name: "Swift", tags: ["hardTechnical"] },
      { name: "Kotlin", tags: ["hardTechnical"] },
      { name: "Mobile Architecture", tags: ["hardTechnical", "expertise"] }
    ],
    resumeCategories: ["professional"],
    details: []
  },
  {
    type: "experience",
    id: "pm-02",
    employer: "Harborview Health Systems",
    jobTitle: "Product Operations Manager",
    dates: { start: "2022-07", end: "2023-08" },
    location: "Chicago, IL",
    overview: "Managed cross-functional product operations for a healthcare technology company, bridging engineering, clinical, and compliance teams.",
    achievements: [
      "Standardized the product launch process across 5 product lines, reducing average time-to-launch by 3 weeks.",
      "Managed a $1.2M vendor and tooling budget, consolidating 9 overlapping tools down to 3."
    ],
    skills: [
      { name: "Process Improvement", tags: ["softTechnical", "expertise"] },
      { name: "Vendor Management", tags: ["softTechnical"] },
      { name: "Cross-Functional Leadership", tags: ["softTechnical", "expertise"] }
    ],
    resumeCategories: ["professional"],
    details: []
  },
  {
    type: "experience",
    id: "pm-03",
    employer: "Vantage Industrial Group",
    jobTitle: "PMO Lead / Business Operations Manager",
    dates: { start: "2023-09", end: "2024-09" },
    location: "Chicago, IL",
    overview: "Led the project management office for a 150-person industrial manufacturing division, overseeing portfolio governance and executive reporting.",
    achievements: [
      "Established the division's first formal PMO, bringing structured governance to a $40M portfolio of over 20 active projects.",
      "Reduced project overrun rate from 35% to 12% within the first year through standardized risk-review checkpoints."
    ],
    skills: [
      { name: "Portfolio Management", tags: ["softTechnical", "expertise"] },
      { name: "Risk Management", tags: ["softTechnical", "expertise"] },
      { name: "Executive Reporting", tags: ["softTechnical"] }
    ],
    resumeCategories: ["professional", "leadership"],
    details: [
      { anchorText: "$40M portfolio of over 20 active projects", detailId: "det-pmo" }
    ]
  },
  {
    type: "experience",
    id: "pm-04",
    employer: "Granite Advisory Partners",
    jobTitle: "Change Management Consultant",
    dates: { start: "2024-10", end: "2025-06" },
    location: "Remote",
    overview: "Led organizational change management for enterprise clients undergoing large-scale system and process transformations.",
    achievements: [
      "Designed and delivered a change-adoption program for a 3,000-employee ERP rollout, achieving 91% user adoption within 90 days.",
      "Trained 40 internal change champions across 6 business units to sustain adoption after consultant handoff."
    ],
    skills: [
      { name: "Change Management", tags: ["softTechnical", "expertise"] },
      { name: "Training & Enablement", tags: ["softTechnical"] },
      { name: "Stakeholder Communication", tags: ["softTechnical", "expertise"] }
    ],
    resumeCategories: ["professional"],
    details: []
  },
  {
    type: "experience",
    id: "pm-05",
    employer: "Meridian Health Network",
    jobTitle: "Senior Program Manager",
    dates: { start: "2025-07", end: "present" },
    location: "Chicago, IL",
    overview: "Senior program manager overseeing a portfolio of strategic initiatives for a regional healthcare network.",
    achievements: [
      "Lead a portfolio of 8 strategic initiatives totaling $15M in annual investment, reporting directly to the VP of Operations.",
      "Built the organization's first cross-departmental program governance model, now used across 4 divisions."
    ],
    skills: [
      { name: "Program Management", tags: ["softTechnical", "expertise"] },
      { name: "Executive Stakeholder Management", tags: ["softTechnical", "expertise"] },
      { name: "Strategic Planning", tags: ["softTechnical", "expertise"] }
    ],
    resumeCategories: ["professional", "leadership"],
    details: []
  }
];

// Detail popups, referenced by id from anywhere in the timeline above.
const details = {
  "det-pg-migration": {
    header: "PostgreSQL Migration",
    bodyText: "Moved the application's data layer off its original database to PostgreSQL, redesigning indexes and query patterns along the way to unlock the performance gain."
  },
  "det-transaction-pipeline": {
    header: "Event-Driven Transaction Pipeline",
    bodyText: "Replaced a synchronous, tightly-coupled transaction flow with an event-driven architecture using a message broker, allowing each stage to scale and fail independently."
  },
  "det-aws-cert": {
    header: "AWS Certification Scope",
    bodyText: "Covered deploying, managing, and debugging applications on AWS, including Lambda, DynamoDB, and API Gateway."
  },
  "det-pmo": {
    header: "Portfolio Governance Scope",
    bodyText: "Oversaw intake, prioritization, and health reporting for the division's full active project portfolio, standardizing status definitions across previously siloed teams."
  }
};

// ============================================================
// PROFILE & EDUCATION
// Fully static, "hard coded" per the resume template — entirely
// separate from the curated Experience/Point system.
// ============================================================

const profile = {
  name: "Your Name",
  title: "Technical Program & Engineering Leader",
  location: "Chicago, IL",
  travelAvailability: "Remote",
  phone: "555-123-4567",
  email: "you@example.com",
  executiveProfileDefault:
    "Leader with a dual background in hands-on software engineering and " +
    "technical program management. Experienced architecting and shipping " +
    "production systems as well as leading cross-functional programs, " +
    "portfolio governance, and organizational change initiatives. " +
    "Comfortable operating as deeply in the technical details as in the " +
    "boardroom."
};

const education = [
  {
    degree: "Bachelor of Science, Computer Science",
    institution: "Example University",
    location: "Chicago, IL",
    year: "2008"
  }
];

// ============================================================
// RESUME SELECTION (placeholder for future LLM curation output)
// Emergency fallback only — used if a resume is ever compiled with no
// curation result at all AND the API call also fails. Includes
// everything, since "show it all" is the safest possible default.
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

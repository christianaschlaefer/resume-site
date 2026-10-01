// ============================================================
// TIMELINE DATA
// This is the single source of truth for the whole site.
// Every visual thing on screen (tiles, skill archive, resume
// view) is rendered FROM this array — nothing is hand-written
// in the HTML. To add real career history later, edit this
// file only.
//
// SCHEMA NOTE (added for the resume feature):
// - Each skill is now an OBJECT { name, tags }, not a bare string.
//   `tags` controls resume routing only (expertise / hardTechnical /
//   softTechnical) — the timeline archive ignores tags entirely and
//   just uses `name`, tied to whichever Experience it's listed on.
// - Each Experience has `resumeCategories`: which resume heading(s)
//   it's eligible for. "professional" is never automatic — an entry
//   only lands in Professional Experience if explicitly tagged that
//   way. Only ONE secondary heading (beyond "professional") is ever
//   used per generated resume, chosen by the curation step.
// ============================================================

const timeline = [
  {
    type: "point",
    id: "pt-01",
    header: "Started Learning to Code",
    date: "2016-09",
    bodyText: "Began teaching myself the fundamentals of programming."
  },
  {
    type: "experience",
    id: "exp-01",
    employer: "TechStart Labs",
    jobTitle: "Software Engineering Intern",
    dates: { start: "2017-06", end: "2017-09" },
    location: "Remote",
    overview: "Summer internship focused on internal tooling.",
    achievements: [
      "Built an internal dashboard used by 15 engineers.",
      "Wrote unit tests that caught 3 production bugs before launch."
    ],
    skills: [
      { name: "JavaScript", tags: ["hardTechnical"] },
      { name: "Git", tags: ["hardTechnical"] },
      { name: "HTML/CSS", tags: ["hardTechnical"] }
    ],
    resumeCategories: ["professional"],
    details: []
  },
  {
    type: "experience",
    id: "exp-02",
    employer: "Company A",
    jobTitle: "Junior Developer",
    dates: { start: "2018-01", end: "2019-03" },
    location: "Chicago, IL",
    overview: "First full-time role, working on a customer-facing web app.",
    achievements: [
      "Reduced page load time by 30% through code splitting.",
      "Mentored one intern over two summers."
    ],
    skills: [
      { name: "JavaScript", tags: ["hardTechnical"] },
      { name: "Git", tags: ["hardTechnical"] },
      { name: "REST APIs", tags: ["hardTechnical", "expertise"] }
    ],
    resumeCategories: ["professional"],
    details: [
      { anchorText: "code splitting", detailId: "det-01" }
    ]
  },
  {
    type: "point",
    id: "pt-02",
    header: "AWS Certified Developer",
    date: "2019-05",
    bodyText: "Completed AWS Certified Developer – Associate certification.",
    details: [
      { anchorText: "AWS Certified Developer – Associate", detailId: "det-04" }
    ]
  },
  {
    type: "experience",
    id: "exp-03",
    employer: "Company B",
    jobTitle: "Software Developer",
    dates: { start: "2019-06", end: "2021-08" },
    location: "Chicago, IL",
    overview: "Owned a core service in a microservices architecture.",
    achievements: [
      "Migrated legacy service to a new API framework with zero downtime.",
      "Introduced automated testing, raising coverage from 40% to 85%."
    ],
    skills: [
      { name: "JavaScript", tags: ["hardTechnical"] },
      { name: "React", tags: ["hardTechnical"] },
      { name: "REST APIs", tags: ["hardTechnical", "expertise"] },
      { name: "Git", tags: ["hardTechnical"] }
    ],
    resumeCategories: ["professional"],
    details: [
      { anchorText: "zero downtime", detailId: "det-02" }
    ]
  },
  {
    type: "experience",
    id: "exp-04",
    employer: "Company C",
    jobTitle: "Senior Developer",
    dates: { start: "2021-09", end: "2023-12" },
    location: "Remote",
    overview: "Led front-end architecture for a growing product team.",
    achievements: [
      "Designed the component system adopted across 4 product teams.",
      "Reduced onboarding time for new engineers from 3 weeks to 1."
    ],
    skills: [
      { name: "React", tags: ["hardTechnical"] },
      { name: "JavaScript", tags: ["hardTechnical"] },
      { name: "Team Leadership", tags: ["softTechnical", "expertise"] }
    ],
    // Demonstrates multi-category eligibility: this entry is valid
    // Professional Experience, AND eligible for the "leadership"
    // secondary heading if that's the one chosen for a given resume.
    resumeCategories: ["professional", "leadership"],
    details: []
  },
  {
    type: "experience",
    id: "exp-05",
    employer: "Company D",
    jobTitle: "Lead Developer",
    dates: { start: "2024-01", end: "present" },
    location: "Chicago, IL",
    overview: "Leading a team of 5 engineers on the flagship product.",
    achievements: [
      "Grew the engineering team from 2 to 5.",
      "Shipped a redesign that increased user retention by 18%."
    ],
    skills: [
      { name: "Team Leadership", tags: ["softTechnical", "expertise"] },
      { name: "React", tags: ["hardTechnical"] },
      { name: "System Design", tags: ["hardTechnical", "expertise"] }
    ],
    resumeCategories: ["professional", "leadership"],
    details: [
      { anchorText: "increased user retention", detailId: "det-03" }
    ]
  }
];

// Detail popups, referenced by id from anywhere in the timeline above.
// Kept separate since a Detail could theoretically be linked from
// multiple Experience entries.
const details = {
  "det-01": {
    header: "Code Splitting Approach",
    bodyText: "Broke the main JS bundle into route-based chunks so users only downloaded the code needed for the page they were on."
  },
  "det-02": {
    header: "Zero-Downtime Migration",
    bodyText: "Ran old and new services in parallel behind a feature flag, gradually shifting traffic while monitoring error rates."
  },
  "det-03": {
    header: "Retention Improvement",
    bodyText: "Redesigned the onboarding flow based on user session recordings, cutting first-week drop-off significantly."
  },
  "det-04": {
    header: "AWS Certification Scope",
    bodyText: "Covered deploying, managing, and debugging applications on AWS, including Lambda, DynamoDB, and API Gateway."
  }
};

// ============================================================
// PROFILE & EDUCATION
// Fully static, "hard coded" per the resume template — entirely
// separate from the curated Experience/Point system. These always
// appear on every generated resume, regardless of job targeting.
// ============================================================

const profile = {
  name: "Your Name",
  title: "Software Engineering Leader",
  location: "Chicago, IL",
  travelAvailability: "Remote",
  phone: "555-123-4567",
  email: "you@example.com",
  // Default/fallback Executive Profile paragraph. Also serves as the
  // style/tone anchor for an LLM-tailored version later — see the
  // design note on grounding in the chat.
  executiveProfileDefault:
    "Software engineering leader with a track record of owning products " +
    "end-to-end, from early architecture decisions through team growth " +
    "and delivery. Experienced leading cross-functional engineering teams, " +
    "improving onboarding and development velocity, and shipping " +
    "user-facing features that measurably improve retention."
};

const education = [
  {
    degree: "Bachelor of Science, Computer Science",
    institution: "Example University",
    location: "Chicago, IL",
    year: "2017"
  }
];

// ============================================================
// RESUME SELECTION (placeholder for future LLM curation output)
// This is exactly the shape the real curation pipeline will
// eventually produce — a set of decisions, not new content. The
// renderer trusts it completely: which section each experience
// belongs to (professional vs. a secondary category) and which
// achievement bullets to show, by index. Routing is decided HERE,
// once, at curation time — never re-derived from tags at render time.
// ============================================================

const secondaryHeadingLabels = {
  leadership: "SELECTED LEADERSHIP EXPERIENCE",
  internationalGovernment: "SELECTED INTERNATIONAL & GOVERNMENT EXPERIENCE",
  selected: "SELECTED EXPERIENCE"
};

const resumeSelection = {
  experiences: [
    { id: "exp-05", section: "professional", bullets: [0, 1] },
    { id: "exp-03", section: "professional", bullets: [0, 1] },
    { id: "exp-02", section: "professional", bullets: [0, 1] },
    { id: "exp-01", section: "professional", bullets: [0, 1] },
    // Routed to the "leadership" secondary heading instead of
    // Professional Experience, even though exp-04 is tagged eligible
    // for both — demonstrating that eligibility isn't automatic
    // placement; the curation step actively decides.
    { id: "exp-04", section: "leadership", bullets: [0] }
  ],
  // Point entries featured as "project" lines in Technical Fluency.
  points: ["pt-02"]
};

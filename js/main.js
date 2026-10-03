// ============================================================
// APP GLUE  —  js/main.js
// ------------------------------------------------------------
// Everything that ISN'T timeline layout lives here: the job intake
// gate, the API calls, the skill archive, Detail popups, the resume
// compiler + overlay, lead capture, and the debug panel.
//
// None of this reaches into the timeline's geometry. It only reacts
// to events broadcast by js/timeline.js (zone changes, active-period
// changes, what the playhead has reached) — which is exactly why the
// entire visual model of the timeline could be rebuilt without
// rewriting the resume pipeline.
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  document.title = `${profile.name} — Interactive Resume`;
  document.getElementById("timeline-brand-name").textContent = profile.name;
  document.getElementById("timeline-brand").addEventListener("click", () => Timeline.scrollToLanding());
  Timeline.init({ landingHtml: renderLandingPanel(), outroHtml: renderOutroPanel() });
  setupJobIntake();
  setupDetailPopups(document.getElementById("track"));
  setupDebugPanel();
});

function renderLandingPanel() {
  return `
    <div class="landing-inner">
      <p class="landing-eyebrow">Interactive career timeline</p>
      <h1>${profile.name}</h1>
      <p class="landing-title">${profile.descriptionOptions[0]}</p>
      <p class="landing-intro">Tell me about the role you're hiring for, and I'll tailor this timeline to show what's most relevant — or leave it blank for a general overview.</p>
      <form id="job-intake-form">
        <label class="sr-only" for="job-description">Job description</label>
        <textarea id="job-description" placeholder="Paste a job description, or just describe the role..."></textarea>
        <div class="intake-actions">
          <button type="submit" id="intake-submit" aria-live="polite">Get Started</button>
          <p id="intake-status" role="status" hidden>Reading the role and pulling the right files&hellip;</p>
        </div>
      </form>
      <p class="landing-hint" id="landing-hint" hidden>Scroll, swipe, or use the arrow keys to travel through time.</p>
      <button id="match-new-role" type="button" hidden>Match to a New Role</button>
    </div>
  `;
}

function renderOutroPanel() {
  return `
    <div class="outro-inner">
      <p class="landing-eyebrow">The story so far</p>
      <h2>Your tailored resume</h2>
      <p>Opening the full resume view&hellip;</p>
    </div>
  `;
}

// ============================================================
// JOB INTAKE — calls the real /api/curate-timeline endpoint
// ============================================================

let lastCuration = null;       // stored so the resume compiler can reuse it
let lastJobDescription = "";   // stored for the same reason

function setupJobIntake() {
  const form = document.getElementById("job-intake-form");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const textarea = document.getElementById("job-description");
    const button = document.getElementById("intake-submit");
    const status = document.getElementById("intake-status");

    // Once curation has already run, this same button acts as the
    // "Explore" call-to-action instead of a resubmit trigger — a new
    // job description only ever comes in through the deliberate
    // "Match to a New Role" reset (see below), never by pressing this
    // button again. Letting this one re-submit was the source of the
    // persistence issues fixed earlier.
    if (lastCuration) {
      Timeline.scrollToStart();
      return;
    }
    if (button.disabled) return;

    const jobDescription = textarea.value;
    lastJobDescription = jobDescription;

    textarea.hidden = true;
    button.disabled = true;
    button.textContent = "Thinking…";
    status.hidden = false;
    document.dispatchEvent(new CustomEvent("intake:submitted", { detail: { jobDescription } }));

    const curation = await runJobCuration(jobDescription);
    lastCuration = curation;
    Timeline.renderCurated(curation);

    status.hidden = true;
    button.disabled = false;
    button.textContent = "Explore →";
    document.getElementById("landing-hint").hidden = false;
    document.dispatchEvent(new CustomEvent("timeline:curated", { detail: curation }));
  });
}

// Shows "Match to a New Role" only once the visitor has actually seen
// the resume and scrolled back to the welcome segment — not on first
// load, and not while they're still exploring mid-timeline.
document.addEventListener("timeline:zonechange", (e) => {
  const newRoleButton = document.getElementById("match-new-role");
  if (!newRoleButton) return;
  newRoleButton.hidden = !(e.detail.zone === "landing" && resumeRendered);
});

// A full reload is the deliberate choice here, not a shortcut: this
// app has a lot of interdependent state (timeline model, skill levels,
// curation, cached resume HTML). Hand-resetting all of it correctly
// is real surface area for bugs — a reload resets everything by
// construction, with no risk of leftover stale state anywhere.
document.addEventListener("click", (event) => {
  if (!event.target.closest("#match-new-role")) return;
  if (confirm("This will reset the timeline so you can match to a different role. Continue?")) {
    location.reload();
  }
});

async function runJobCuration(jobDescription) {
  try {
    const response = await fetch("/api/curate-timeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobDescription, timeline })
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    // Fail open: show the full timeline rather than leaving the visitor
    // stuck if the network request itself fails (not just the API call
    // inside the function — this covers the function being unreachable).
    console.error("Curation request failed, showing everything:", error);
    return { includedIds: timeline.map((e) => e.id) };
  }
}

// Mechanical fallback only — used if /api/compile-resume is unreachable
// or errors, so the resume still renders something correct rather than
// nothing. Every curated experience with all its bullets; no optional
// Points (choosing those is exactly the judgment the AI exists to make);
// empty expertise/fluency lists that buildResumeData fills with defaults.
function deriveResumeSelectionFromCuration(curation) {
  const experiences = timeline
    .filter((e) => e.type === "experience" && curation.includedIds.includes(e.id))
    .map((e) => ({ id: e.id, section: e.resumeSection || "professional", bullets: e.achievements }));
  return {
    experiences,
    points: [],
    pointsHeader: resumeOptions.pointsHeaders[0],
    coreExpertise: [],
    fluency: []
  };
}

// ============================================================
// SKILL ARCHIVE
// Same "derive, don't track" principle as the original Step 5: the
// archive is recomputed from scratch from whatever the playhead has
// reached, so scrolling backward is exactly as correct as scrolling
// forward. The only change is the input — "everything the playhead has
// passed" (from the timeline engine) instead of "every tile up to the
// current index."
// ============================================================

let skillLevels = new Map();     // last-rendered state: skill name -> level (count so far)
const skillElements = new Map(); // skill name -> its DOM token, so we can update/remove it
const SKILL_STAGGER_MS = 45;     // tokens pop in one by one, not all at once
const SKILL_STAGGER_CAP = 18;    // ...but a 30-skill role shouldn't take 2 seconds

document.addEventListener("timeline:reachedchange", (e) => {
  updateSkillArchive(e.detail.reachedIds);
});

// The archive belongs to the timeline itself — hidden on the welcome
// segment and behind the full-screen resume.
document.addEventListener("timeline:zonechange", (e) => {
  document.getElementById("skill-dock").classList.toggle("is-hidden", e.detail.zone !== "timeline");
});

function findEntry(id) {
  return timeline.find((e) => e.id === id) || education.find((e) => e.id === id);
}

// Skills are counted from any reached entry that defines them (today
// that's Experiences; a Point or Education entry with a `skills` array
// would count too). Tags are ignored here — they only route skills on
// the resume.
function computeSkillLevelsForIds(ids) {
  const levels = new Map();
  ids.forEach((id) => {
    const entry = findEntry(id);
    if (!entry || !entry.skills) return;
    entry.skills.forEach((skill) => {
      levels.set(skill.name, (levels.get(skill.name) || 0) + 1);
    });
  });
  return levels;
}

function updateSkillArchive(reachedIds) {
  const newLevels = computeSkillLevelsForIds(reachedIds);
  const added = [];
  const upgraded = [];
  const removed = [];

  // Present before but missing now = we scrolled back past that skill's
  // only occurrence. Anything new or whose count changed gets added or
  // re-badged (a "downgrade" from scrolling back uses the same path).
  skillLevels.forEach((_, name) => {
    if (!newLevels.has(name)) removed.push(name);
  });
  newLevels.forEach((level, name) => {
    const previous = skillLevels.get(name);
    if (previous === undefined) added.push([name, level]);
    else if (previous !== level) upgraded.push([name, level]);
  });

  removed.forEach((name) => removeSkillToken(name));
  added.forEach(([name, level], i) => addSkillToken(name, level, i));
  upgraded.forEach(([name, level], i) => upgradeSkillToken(name, level, i));
  skillLevels = newLevels;

  document.getElementById("skill-count").textContent = newLevels.size ? String(newLevels.size) : "";

  if (added.length || upgraded.length || removed.length) {
    document.dispatchEvent(new CustomEvent("skills:changed", {
      detail: { added: added.map(([n]) => n), upgraded: upgraded.map(([n]) => n), removed }
    }));
    const parts = [];
    if (added.length) parts.push(`${added.length} new skill${added.length === 1 ? "" : "s"}`);
    if (upgraded.length) parts.push(`${upgraded.length} upgraded`);
    if (parts.length) Timeline.announce("skills", `${parts.join(", ")}.`);
  }
}

function renderSkillTokenContent(name, level) {
  const levelBadge = level > 1 ? `<span class="skill-level">&times;${level}</span>` : "";
  return `<span class="skill-name">${name}</span>${levelBadge}`;
}

function addSkillToken(name, level, order = 0) {
  const archive = document.getElementById("skill-archive");
  const token = document.createElement("div");
  token.classList.add("skill-token");
  token.dataset.skill = name;
  token.innerHTML = renderSkillTokenContent(name, level);
  const delay = Math.min(order, SKILL_STAGGER_CAP) * SKILL_STAGGER_MS;
  token.style.transitionDelay = `${delay}ms`;
  archive.appendChild(token);
  skillElements.set(name, token);

  // Starts at opacity:0/scaled-down via CSS. Adding .is-visible on the
  // next frame (rather than immediately) is what lets the browser
  // actually animate the transition instead of skipping to the end.
  requestAnimationFrame(() => token.classList.add("is-visible"));
  setTimeout(() => { token.style.transitionDelay = ""; }, delay + 300);
}

function upgradeSkillToken(name, level, order = 0) {
  const token = skillElements.get(name);
  if (!token) return;
  token.innerHTML = renderSkillTokenContent(name, level);
  // Re-trigger the pulse even if it's already playing: remove the class,
  // force the browser to acknowledge it (offsetWidth read), re-add it.
  setTimeout(() => {
    if (skillElements.get(name) !== token) return; // removed in the meantime
    token.classList.remove("just-upgraded");
    void token.offsetWidth;
    token.classList.add("just-upgraded");
  }, Math.min(order, SKILL_STAGGER_CAP) * 70);
}

function removeSkillToken(name) {
  const token = skillElements.get(name);
  if (!token) return;
  token.style.transitionDelay = "";
  token.classList.remove("is-visible");
  token.classList.add("is-leaving");
  skillElements.delete(name);
  // Remove from the DOM only after the fade-out (250ms, matching the
  // CSS), not instantly — otherwise it'd just vanish with no animation.
  setTimeout(() => token.remove(), 250);
}

// ============================================================
// DETAIL HOVER POPUPS
// Two-part mapping, both defined entirely in data.js:
//   1. entry.details: [{ anchorText, detailId }, ...] — on whichever
//      entry contains that phrase (wrapped by the timeline engine).
//   2. the shared `details` object — the popup content, by detailId.
// ============================================================

function setupDetailPopups(track) {
  const popup = document.getElementById("detail-popup");
  let currentAnchor = null;

  // mouseover/mouseout (unlike mouseenter/mouseleave) bubble, which is
  // what makes event delegation possible — one listener for every
  // anchor word across every card, present or future.
  track.addEventListener("mouseover", (event) => {
    const anchor = event.target.closest(".detail-anchor");
    if (!anchor || anchor === currentAnchor) return;
    currentAnchor = anchor;
    showDetailPopup(anchor, popup);
  });

  track.addEventListener("mouseout", (event) => {
    const anchor = event.target.closest(".detail-anchor");
    if (!anchor) return;
    // event.relatedTarget is where the mouse is moving TO. If it's still
    // inside the same anchor, this isn't a real "leave" yet.
    if (anchor.contains(event.relatedTarget)) return;
    currentAnchor = null;
    hideDetailPopup(popup);
  });

  // Keyboard equivalent of hover: focusin/focusout bubble (unlike plain
  // focus/blur), so the same delegation pattern works here too.
  track.addEventListener("focusin", (event) => {
    const anchor = event.target.closest(".detail-anchor");
    if (!anchor) return;
    currentAnchor = anchor;
    showDetailPopup(anchor, popup);
  });

  track.addEventListener("focusout", (event) => {
    const anchor = event.target.closest(".detail-anchor");
    if (!anchor) return;
    currentAnchor = null;
    hideDetailPopup(popup);
  });

  // Touch devices have no hover, so a tap toggles the popup instead.
  track.addEventListener("click", (event) => {
    const anchor = event.target.closest(".detail-anchor");
    if (!anchor) return;
    if (currentAnchor === anchor) {
      currentAnchor = null;
      hideDetailPopup(popup);
    } else {
      currentAnchor = anchor;
      showDetailPopup(anchor, popup);
    }
  });

  // NEW with the continuous timeline: content now moves under a
  // stationary popup as you scroll, so the popup closes rather than
  // being left pointing at empty space.
  const dismiss = () => {
    if (!currentAnchor && popup.hidden) return;
    currentAnchor = null;
    hideDetailPopup(popup);
  };
  track.addEventListener("scroll", dismiss, { passive: true });
  document.addEventListener("card:expandchange", dismiss);
}

function showDetailPopup(anchor, popup) {
  const detail = details[anchor.dataset.detailId];
  if (!detail) return; // no matching Detail defined — fail silently

  popup.innerHTML = `<h4>${detail.header}</h4><p>${detail.bodyText}</p>`;
  popup.hidden = false; // must be visible before measuring its size below

  const anchorRect = anchor.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  const margin = 8;

  // Clamp horizontally so the popup never renders off-screen.
  let left = anchorRect.left;
  left = Math.min(left, window.innerWidth - popupRect.width - margin);
  left = Math.max(left, margin);

  // No room below the anchor? Place the popup above it instead.
  let top = anchorRect.bottom + margin;
  if (top + popupRect.height > window.innerHeight) {
    top = anchorRect.top - popupRect.height - margin;
  }

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  requestAnimationFrame(() => popup.classList.add("is-visible"));
}

function hideDetailPopup(popup) {
  popup.classList.remove("is-visible");
  // Wait for the fade-out to finish before fully hiding.
  setTimeout(() => {
    if (!popup.classList.contains("is-visible")) popup.hidden = true;
  }, 200);
}

// ============================================================
// RESUME COMPILER
// Turns a selection (live AI output, a revision, or the mechanical
// fallback) into the final document, following the RESUME - BASE
// template:
//   NAME · Professional Description · Contact Line
//   EXECUTIVE PROFILE · CORE EXPERTISE · PROFESSIONAL EXPERIENCE ·
//   [Points section — header chosen per resume] ·
//   TECHNICAL & INDUSTRY FLUENCY · EDUCATION
// It never decides WHAT to include, but it enforces the template's hard
// limits no matter where the selection came from: only listed options,
// the character budgets, section placement from data.js, no duplicates.
// ============================================================

// The data document's date style: "Jan. 2022-Present".
const RESUME_MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];

function formatResumeMonth(str) {
  if (!str) return "";
  if (str === "present") return "Present";
  const [y, m] = String(str).split("-").map(Number);
  return m ? `${RESUME_MONTHS[m - 1]} ${y}` : String(y);
}

function formatResumeDates(entry) {
  if (entry.dateText) return entry.dateText;
  if (entry.type === "point") {
    return entry.endDate
      ? `${formatResumeMonth(entry.date)}-${formatResumeMonth(entry.endDate)}`
      : formatResumeMonth(entry.date);
  }
  return `${formatResumeMonth(entry.dates.start)}-${formatResumeMonth(entry.dates.end)}`;
}

// Experience dates are "YYYY-MM" strings or "present"; Points use `date`
// (plus an optional `endDate`). Used to order each section newest-first.
function getSortableEndDate(entry) {
  if (entry.type === "point") return new Date(`${entry.endDate || entry.date}-01`).getTime();
  if (entry.dates.end === "present") return Infinity;
  return new Date(`${entry.dates.end}-01`).getTime();
}

// Keeps whole items, highest priority first, until the next one would
// cross the character budget — never truncating mid-item.
function fitItemsToBudget(items, maxChars) {
  const kept = [];
  let length = 0;
  for (const item of items) {
    const added = kept.length ? item.length + 3 : item.length; // " | " separator
    if (length + added > maxChars) break;
    kept.push(item);
    length += added;
  }
  return kept;
}

// Maps a returned value back to the exact option text (tolerating case
// or whitespace drift), or undefined if it isn't one of the options.
function optionPicker(options) {
  const byKey = new Map(options.map((option) => [option.trim().toLowerCase(), option]));
  return (value) => (typeof value === "string" ? byKey.get(value.trim().toLowerCase()) : undefined);
}

function normalizeCoreExpertise(selected) {
  const pick = optionPicker(resumeOptions.coreExpertise);
  const chosen = [...new Set((Array.isArray(selected) ? selected : []).map(pick).filter(Boolean))];
  return fitItemsToBudget(chosen.length ? chosen : resumeOptions.coreExpertise, resumeOptions.coreExpertiseMaxChars);
}

function normalizePointsHeader(header) {
  return optionPicker(resumeOptions.pointsHeaders)(header) || resumeOptions.pointsHeaders[0];
}

// Fluency lines: only listed labels; list lines keep only their own items
// (deduplicated across lines — Jira and Gainsight appear in two lists) and
// fit the per-line budget; sentence lines are always rendered verbatim.
function normalizeFluency(selected) {
  const lineByLabel = new Map(resumeOptions.fluency.map((line) => [line.label.toLowerCase(), line]));
  const build = (requested) => {
    const usedItems = new Set();
    const usedLabels = new Set();
    const lines = [];
    (Array.isArray(requested) ? requested : []).forEach((req) => {
      if (!req || typeof req.label !== "string") return;
      const option = lineByLabel.get(req.label.trim().toLowerCase());
      if (!option || usedLabels.has(option.label)) return;
      if (option.text) {
        usedLabels.add(option.label);
        lines.push({ label: option.label, text: option.text });
        return;
      }
      const pick = optionPicker(option.items);
      const wanted = Array.isArray(req.items) && req.items.length ? req.items : option.items;
      const items = [...new Set(wanted.map(pick).filter(Boolean))].filter((item) => !usedItems.has(item));
      const fitted = fitItemsToBudget(items, resumeOptions.fluencyLineMaxChars);
      if (!fitted.length) return;
      fitted.forEach((item) => usedItems.add(item));
      usedLabels.add(option.label);
      lines.push({ label: option.label, items: fitted });
    });
    return lines.slice(0, resumeOptions.fluencyMaxLines);
  };
  const lines = build(selected);
  return lines.length ? lines : build(resumeOptions.fluency.slice(0, 3).map((line) => ({ label: line.label })));
}

function buildResumeData(selection) {
  const professional = [];
  const pointsEntries = [];
  const seen = new Set();

  (selection.experiences || []).forEach((sel) => {
    const entry = timeline.find((e) => e.id === sel.id && e.type === "experience");
    if (!entry || seen.has(entry.id)) return;
    seen.add(entry.id);
    let bulletTexts = (sel.bullets || []).filter(Boolean);
    // An included experience always shows at least one bullet.
    if (!bulletTexts.length && entry.achievements && entry.achievements.length) bulletTexts = [entry.achievements[0]];
    // Placement comes from the DATA (resumeSection), never the selection.
    (entry.resumeSection === "points" ? pointsEntries : professional).push({ entry, bulletTexts });
  });

  (selection.points || []).forEach((sel) => {
    const entry = timeline.find((e) => e.id === sel.id && e.type === "point");
    if (!entry || entry.resumeEligible === false || seen.has(entry.id)) return;
    const bulletTexts = (sel.bullets || []).filter(Boolean);
    if (!bulletTexts.length) return;
    seen.add(entry.id);
    pointsEntries.push({ entry, bulletTexts });
  });

  const byRecency = (a, b) => getSortableEndDate(b.entry) - getSortableEndDate(a.entry);
  professional.sort(byRecency);
  pointsEntries.sort(byRecency);

  return {
    name: profile.name,
    // Header defaults — replaced by finalizeResumeHeader's choices.
    title: profile.descriptionOptions[0],
    contactLine: profile.contactLineOptions[0],
    executiveProfile: profile.executiveProfileDefault,
    coreExpertise: normalizeCoreExpertise(selection.coreExpertise),
    professional,
    pointsSection: { label: normalizePointsHeader(selection.pointsHeader), entries: pointsEntries },
    fluency: normalizeFluency(selection.fluency),
    education
  };
}

function renderResume(data) {
  return `
    <div class="resume-header">
      <h1>${data.name}</h1>
      <p class="resume-title">${data.title}</p>
      <p class="resume-contact">${data.contactLine}</p>
    </div>

    <section class="resume-section">
      <h2>Executive Profile</h2>
      <p>${data.executiveProfile}</p>
    </section>

    <section class="resume-section">
      <h2>Core Expertise</h2>
      <p>${data.coreExpertise.join(" | ")}</p>
    </section>

    <section class="resume-section">
      <h2>Professional Experience</h2>
      ${data.professional.map(renderProfessionalEntry).join("")}
    </section>

    ${data.pointsSection.entries.length ? `
      <section class="resume-section">
        <h2>${data.pointsSection.label}</h2>
        ${data.pointsSection.entries.map(renderPointsSectionEntry).join("")}
      </section>
    ` : ""}

    <section class="resume-section">
      <h2>Technical &amp; Industry Fluency</h2>
      ${data.fluency.map((line) =>
        `<p class="resume-fluency"><strong>${line.label}:</strong> ${line.text || line.items.join(" | ")}</p>`
      ).join("")}
    </section>

    <section class="resume-section">
      <h2>Education</h2>
      ${data.education.map((ed) =>
        `<p class="resume-education">${ed.degree} | ${ed.institution} | ${ed.location} | ${ed.year}</p>`
      ).join("")}
    </section>

    <button id="download-resume" type="button">Download PDF</button>
  `;
}

const renderBullets = (bulletTexts) => `<ul>${bulletTexts.map((b) => `<li>${b}</li>`).join("")}</ul>`;

// PROFESSIONAL EXPERIENCE format: "ORG | Title", then "Dates | Location".
function renderProfessionalEntry({ entry, bulletTexts }) {
  const meta = [formatResumeDates(entry), entry.location].filter(Boolean).join(" | ");
  return `
    <div class="resume-entry" data-id="${entry.id}">
      <p class="resume-entry-title"><span class="resume-org">${entry.employer}</span> | ${entry.jobTitle}</p>
      <p class="resume-entry-meta">${meta}</p>
      ${renderBullets(bulletTexts)}
    </div>
  `;
}

// Points-section format (Points AND experiences placed there): one line,
// "ORG | Role | Location | Dates", skipping whatever an entry doesn't have.
function renderPointsSectionEntry({ entry, bulletTexts }) {
  const isPoint = entry.type === "point";
  const org = isPoint ? entry.org : entry.employer;
  const rest = [isPoint ? entry.role : entry.jobTitle, entry.location, formatResumeDates(entry)].filter(Boolean);
  return `
    <div class="resume-entry" data-id="${entry.id}">
      <p class="resume-entry-title"><span class="resume-org">${org}</span>${rest.length ? ` | ${rest.join(" | ")}` : ""}</p>
      ${renderBullets(bulletTexts)}
    </div>
  `;
}

// ============================================================
// TWO-PAGE ENFORCEMENT
// Measurement is mechanical (it's just geometry), but fixing an
// overflow is an editorial judgment call, so an overflow sends the
// draft back to the LLM for a genuine revision pass rather than a
// script blindly cutting content. Also catches a single block
// straddling the page-1/page-2 boundary (which wastes page-1 space).
// ============================================================

// US Letter at 0.5in margins (matches the @page rule in style.css).
const PAGE_CONTENT_WIDTH_IN = 8.5 - 1; // 8.5in page minus 0.5in each side
const PAGE_CONTENT_HEIGHT_PX = (11 - 1) * 96; // 10in of content, in px

// Renders into an invisible clone sized to a real printed page's
// content area, then reports the page count AND whether any single
// .resume-entry straddles the page-1/page-2 boundary.
function analyzeLayout(html) {
  const measurer = document.createElement("div");
  measurer.style.cssText =
    `position: fixed; visibility: hidden; pointer-events: none; ` +
    `top: -99999px; left: -99999px; width: ${PAGE_CONTENT_WIDTH_IN}in;`;
  measurer.innerHTML = html;
  document.body.appendChild(measurer);

  const totalHeightPx = measurer.scrollHeight;
  const pages = Math.ceil(totalHeightPx / PAGE_CONTENT_HEIGHT_PX);

  let overflowEntryId = null;
  const entries = measurer.querySelectorAll(".resume-entry");
  entries.forEach((el) => {
    if (overflowEntryId) return; // only report the first/topmost one
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < PAGE_CONTENT_HEIGHT_PX && bottom > PAGE_CONTENT_HEIGHT_PX) {
      overflowEntryId = el.dataset.id;
    }
  });

  document.body.removeChild(measurer);
  return { pages, overflowEntryId };
}

// If the compiled resume is too long OR has a boundary-straddling
// entry, ask the LLM to revise it — capped at 2 attempts for cost and
// latency. Returns the finalized SELECTION; the header is written
// against this finished body afterward, in compileResume().
async function fitSelectionToTwoPages(selection, curatedEntries) {
  let current = selection;
  let layout = analyzeLayout(renderResume(buildResumeData(current)));

  const maxRevisions = 2;
  for (
    let attempt = 0;
    attempt < maxRevisions && (layout.pages > 2 || layout.overflowEntryId);
    attempt++
  ) {
    const overflowEntry = layout.overflowEntryId
      ? curatedEntries.find((e) => e.id === layout.overflowEntryId)
      : null;
    const revised = await requestResumeRevision(curatedEntries, current, layout.pages, overflowEntry);
    if (!revised) break; // revision call itself failed — stop rather than loop on nothing
    current = revised;
    layout = analyzeLayout(renderResume(buildResumeData(current)));
  }

  return current;
}

async function requestResumeRevision(curatedEntries, previousSelection, estimatedPages, overflowEntry) {
  try {
    const response = await fetch("/api/compile-resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobDescription: lastJobDescription,
        curatedEntries,
        resumeOptions,
        revision: {
          previousSelection,
          estimatedPages,
          // Only included when a specific entry causes a wasted-space
          // page break. Points have an org/role instead of employer/title.
          overflowEntry: overflowEntry
            ? {
                employer: overflowEntry.employer || overflowEntry.org,
                jobTitle: overflowEntry.jobTitle || overflowEntry.role || ""
              }
            : undefined
        }
      })
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error("Resume revision request failed:", error);
    return null;
  }
}

// Renders once, the first time the visitor reaches the outro.
// resumeRendering guards against overlapping async work.
let resumeRendered = false;
let resumeRendering = false;

async function compileResume() {
  // Only resume-eligible entries ever reach the resume AI: a Point marked
  // resumeEligible: false can't end up on the resume, because the model
  // never sees it — the same structural grounding as the header step.
  const curatedEntries = (lastCuration
    ? timeline.filter((e) => lastCuration.includedIds.includes(e.id))
    : timeline
  ).filter((e) => e.type !== "point" || e.resumeEligible !== false);

  let selection;
  try {
    const response = await fetch("/api/compile-resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobDescription: lastJobDescription, curatedEntries, resumeOptions })
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    selection = await response.json();
  } catch (error) {
    console.error("Resume compilation request failed, using mechanical fallback:", error);
    selection = lastCuration ? deriveResumeSelectionFromCuration(lastCuration) : resumeSelection;
  }

  // Order matters: everything that changes the body's LENGTH (bullets,
  // Points, expertise, fluency) is final before the two-page fit runs,
  // and the header is written against that finished body afterward.
  selection = await fitSelectionToTwoPages(selection, curatedEntries);

  const data = buildResumeData(selection);
  const fittedLayout = analyzeLayout(renderResume(data));
  const header = await finalizeResumeHeader(data);
  const finalData = { ...data, ...header };

  // Safety net: the two-page fit was measured with the baseline profile.
  // Keep the baseline instead if the tailored one (a) adds a page, or
  // (b) is LONGER and pushes an entry across the page break. A SHORTER
  // profile can also shift an entry across the break, but the gap that
  // leaves is at most the few lines it saved — not worth losing the
  // tailoring over.
  const finalLayout = analyzeLayout(renderResume(finalData));
  const grew = finalData.executiveProfile.length > data.executiveProfile.length;
  const brokeFit = finalLayout.pages > Math.max(2, fittedLayout.pages)
    || (grew && finalLayout.overflowEntryId && !fittedLayout.overflowEntryId);
  if (brokeFit) {
    console.warn("Tailored executive profile broke the two-page fit — using the baseline profile.");
    finalData.executiveProfile = data.executiveProfile;
  }

  return renderResume(finalData);
}

// Runs ONLY after the body is fully finalized, and is handed ONLY that
// finished body — never the full career history — so the tailored
// profile is grounded in what's actually on the resume. The description
// and contact line are picked from the options in data.js.
async function finalizeResumeHeader(data) {
  const fallback = {
    title: profile.descriptionOptions[0],
    contactLine: profile.contactLineOptions[0],
    executiveProfile: profile.executiveProfileDefault
  };

  const describe = ({ entry, bulletTexts }) => ({
    employer: entry.employer || entry.org,
    jobTitle: entry.jobTitle || entry.role || "",
    bulletTexts
  });

  const finalizedBody = {
    professional: data.professional.map(describe),
    pointsSection: { label: data.pointsSection.label, entries: data.pointsSection.entries.map(describe) },
    coreExpertise: data.coreExpertise,
    fluency: data.fluency,
    descriptionOptions: profile.descriptionOptions,
    contactLineOptions: profile.contactLineOptions,
    defaultExecutiveProfile: profile.executiveProfileDefault
  };

  try {
    const response = await fetch("/api/finalize-resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobDescription: lastJobDescription, finalizedBody })
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const result = await response.json();
    // Defense in depth: the server validates these too, but the browser
    // re-checks them against data.js before anything reaches the page.
    const header = {
      title: profile.descriptionOptions.includes(result.title) ? result.title : fallback.title,
      contactLine: profile.contactLineOptions.includes(result.contactLine) ? result.contactLine : fallback.contactLine,
      executiveProfile: typeof result.executiveProfile === "string" && result.executiveProfile.trim()
        ? result.executiveProfile.trim()
        : fallback.executiveProfile
    };
    document.dispatchEvent(new CustomEvent("resume:headerFinalized", { detail: header }));
    return header;
  } catch (error) {
    console.error("Resume header finalization failed, using defaults:", error);
    return fallback;
  }
}

// ============================================================
// RESUME PREFETCH
// Starts compilation the moment the visitor leaves the welcome
// segment, rather than waiting until they reach the very end. Safe
// this early because curation is already final the instant the
// timeline exists.
// ============================================================

let resumeCompilePromise = null;

document.addEventListener("timeline:zonechange", (e) => {
  if (e.detail.zone !== "landing" && lastCuration && !resumeCompilePromise) {
    resumeCompilePromise = compileResume();
  }
});

// ============================================================
// FULL-SCREEN RESUME OVERLAY
// Driven entirely by the timeline's zone: reaching the outro opens it,
// leaving the outro (including via the Back button) closes it. No
// separately managed open/close state to fall out of sync.
// ============================================================

document.addEventListener("timeline:zonechange", async (e) => {
  const overlay = document.getElementById("resume-overlay");
  const stage = document.getElementById("stage");

  if (e.detail.zone !== "outro") {
    if (!overlay.hidden) {
      const focusWasInOverlay = overlay.contains(document.activeElement);
      overlay.hidden = true;
      stage.inert = false; // restore keyboard/AT access to the timeline
      if (focusWasInOverlay || document.activeElement === document.body) {
        document.getElementById("track").focus({ preventScroll: true });
      }
    }
    return;
  }

  overlay.hidden = false;
  // `inert` removes the whole timeline from the tab order and the
  // accessibility tree while the overlay covers it.
  stage.inert = true;
  // Move focus into the dialog, matching expected modal behavior.
  document.getElementById("resume-back").focus();

  if (resumeRendered || resumeRendering) return; // already compiled, or in progress

  resumeRendering = true;
  document.getElementById("resume-content").innerHTML =
    `<p role="status">One moment while I put together your resume&hellip;</p>`;

  // Reuses the prefetched call — usually already resolved by now.
  const html = await (resumeCompilePromise || compileResume());

  document.getElementById("resume-content").innerHTML = html;
  resumeRendered = true;
  resumeRendering = false;

  // The visitor may have scrolled away DURING compilation — only force
  // the overlay open if they're still at the end.
  if (Timeline.getZone() === "outro") {
    overlay.hidden = false;
    stage.inert = true;
  }
});

// Escape closes the overlay the same way the Back button does.
document.addEventListener("keydown", (event) => {
  const overlay = document.getElementById("resume-overlay");
  if (event.key === "Escape" && !overlay.hidden) {
    goBackToTimeline();
  }
});

// Back button: scrolls the timeline back into the current role. That's
// a genuine scroll, so the zone listener above closes the overlay and
// returns focus to the timeline on its own.
document.addEventListener("click", (event) => {
  if (event.target.closest("#resume-back")) goBackToTimeline();
});

function goBackToTimeline() {
  Timeline.scrollToEnd();
}

// Delegated so it keeps working if the resume is ever re-rendered.
document.addEventListener("click", (event) => {
  if (event.target.closest("#download-resume")) {
    document.dispatchEvent(new CustomEvent("resume:downloadclicked"));
    window.print();
  }
});

// ============================================================
// LEAD CAPTURE (mocked pending the real backend)
// ============================================================

document.getElementById("lead-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const email = document.getElementById("lead-email").value;
  const company = document.getElementById("lead-company").value;
  submitLead(email, company);
});

function submitLead(email, company) {
  // TODO: replace with a real fetch() call to a backend endpoint once
  // deployed — e.g. fetch("/api/submit-lead", { method: "POST", ... }).
  // That endpoint writes to storage and triggers the video email; this
  // function's job ends at handing off the data.
  console.log("Lead captured (mock):", { email, company });
  document.dispatchEvent(new CustomEvent("lead:submitted", { detail: { email, company } }));

  document.getElementById("lead-form").hidden = true;
  document.getElementById("lead-confirmation").hidden = false;
}

// ============================================================
// DEBUG PANEL
// Only created when ?debug=true is in the URL — for every other
// visitor this exits immediately and nothing is added to the page.
// It only listens to events the site already broadcasts.
// ============================================================

function setupDebugPanel() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("debug") !== "true") return;

  const panel = document.createElement("div");
  panel.id = "debug-panel";
  panel.innerHTML = `
    <button id="debug-toggle" type="button" aria-expanded="true">Debug &#9662;</button>
    <div id="debug-body">
      <div id="debug-summary">
        <div><strong>Zone:</strong> <span id="debug-zone">landing</span></div>
        <div><strong>Playhead:</strong> <span id="debug-playhead">—</span></div>
        <div><strong>Active:</strong> <span id="debug-active">none</span></div>
        <div><strong>Expanded:</strong> <span id="debug-expanded">none</span></div>
        <div><strong>Resume overlay:</strong> <span id="debug-overlay">closed</span></div>
        <div><strong>Skills:</strong> <span id="debug-skills">none</span></div>
      </div>
      <div id="debug-log"></div>
    </div>
  `;
  // Appended to <body>, outside #stage, so #stage.inert never affects it.
  document.body.appendChild(panel);

  // Collapsible, and collapsed by default on phones: a 260px panel on a
  // 390px screen would bury the very timeline it's meant to inspect.
  const toggle = panel.querySelector("#debug-toggle");
  const setCollapsed = (collapsed) => {
    panel.classList.toggle("is-collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.innerHTML = collapsed ? "Debug &#9656;" : "Debug &#9662;";
  };
  toggle.addEventListener("click", () => setCollapsed(!panel.classList.contains("is-collapsed")));
  setCollapsed(window.innerWidth < 640);

  const setText = (id, text) => { document.getElementById(id).textContent = text; };
  const logEntry = (message) => {
    const time = new Date().toLocaleTimeString();
    const line = document.createElement("div");
    line.textContent = `${time} — ${message}`;
    document.getElementById("debug-log").prepend(line); // newest on top
  };

  // The playhead date changes continuously, so it's read on scroll
  // (throttled to one update per frame) rather than logged.
  let playheadQueued = false;
  document.getElementById("track").addEventListener("scroll", () => {
    if (playheadQueued) return;
    playheadQueued = true;
    requestAnimationFrame(() => {
      playheadQueued = false;
      setText("debug-playhead", Timeline.getPlayheadLabel() || "—");
    });
  }, { passive: true });

  document.addEventListener("timeline:zonechange", (e) => {
    setText("debug-zone", e.detail.zone);
    setText("debug-overlay", e.detail.zone === "outro" ? "open" : "closed");
    logEntry(`Zone → ${e.detail.zone}`);
  });

  document.addEventListener("timeline:activechange", (e) => {
    const label = e.detail.activeIds.length ? e.detail.activeIds.join(", ") : "none";
    setText("debug-active", label);
    logEntry(`Active → ${label}`);
  });

  document.addEventListener("card:expandchange", (e) => {
    const { id, kind, expanded } = e.detail;
    setText("debug-expanded", expanded ? `${id} (${kind})` : "none");
    logEntry(`Card ${expanded ? "expanded" : "collapsed"}: ${id}`);
  });

  // skillLevels is already updated by the time skills:changed fires,
  // so the summary is always current.
  document.addEventListener("skills:changed", (e) => {
    const all = Array.from(skillLevels.entries()).map(([name, level]) => `${name}×${level}`);
    const preview = all.slice(0, 4).join(", ");
    setText("debug-skills", all.length
      ? `${all.length} — ${preview}${all.length > 4 ? `, +${all.length - 4} more` : ""}`
      : "none");
    const { added, upgraded, removed } = e.detail;
    if (added.length) logEntry(`Skills added: ${added.join(", ")}`);
    if (upgraded.length) logEntry(`Skills upgraded: ${upgraded.join(", ")}`);
    if (removed.length) logEntry(`Skills removed: ${removed.join(", ")}`);
  });

  document.addEventListener("timeline:ready", (e) => {
    const { journey, stations, points, lanes } = e.detail;
    logEntry(`Timeline built: ${journey} periods, ${stations} stations, ${points} points, ${lanes} lane${lanes === 1 ? "" : "s"}`);
  });

  document.addEventListener("lead:submitted", (e) => {
    logEntry(`Lead captured: ${e.detail.email} / ${e.detail.company}`);
  });
  document.addEventListener("resume:downloadclicked", () => {
    logEntry("Download PDF clicked");
  });
  document.addEventListener("resume:headerFinalized", (e) => {
    logEntry(`Header finalized: "${e.detail.title}"`);
  });
  document.addEventListener("intake:submitted", (e) => {
    const desc = e.detail.jobDescription.trim();
    logEntry(`Job intake submitted: ${desc ? `"${desc.slice(0, 40)}${desc.length > 40 ? "…" : ""}"` : "(blank — generic)"}`);
  });
  document.addEventListener("timeline:curated", (e) => {
    logEntry(`Curation complete: ${e.detail.includedIds.length} items included`);
  });

  logEntry("Debug panel initialized");
}

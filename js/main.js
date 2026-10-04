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
    <div class="landing-card">
      <div class="monogram monogram-emboss" aria-hidden="true">CS</div>
      <h1>${profile.name}</h1>
      <p class="landing-title">${profile.descriptionOptions[0]}</p>
      <p class="landing-intro" id="landing-intro">Tell me about the role you're hiring for or just link the job posting — I'll tailor this timeline to show the items that are most relevant to the role.</p>
      <form id="job-intake-form">
        <label class="sr-only" for="job-description">Job description, or a link to the posting</label>
        <textarea id="job-description" placeholder="Paste the job description, describe the role, or drop in a link to the posting"></textarea>
        <ol class="loading-stages" id="loading-stages" hidden></ol>
        <p class="sr-only" id="loading-status" role="status"></p>
        <div class="intake-actions">
          <button type="submit" id="intake-submit">Get started</button>
        </div>
      </form>
      <p class="landing-hint" id="landing-hint" hidden>Scroll, swipe, or use the arrow keys to move through the years.</p>
      <button id="match-new-role" type="button" hidden>Match to a new role</button>
    </div>
  `;
}

function renderOutroPanel() {
  return `
    <div class="outro-inner">
      <div class="wax-seal" aria-hidden="true"><span>CS</span></div>
      <h2>Your tailored resume</h2>
      <p class="outro-status is-pending" id="outro-status" role="status">Pulling your file from the cabinet</p>
    </div>
  `;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================
// LOADING STAGES
// Curation can take 20-30 seconds while the AI researches the posting.
// Rather than a fake percentage bar, little stages tick by — honest
// about being decorative, and they finish the moment the real work does.
// ============================================================

const LOADING_STAGES = [
  "Reading the job posting",
  "Gaining job experiences",
  "Completing education",
  "Upgrading skills",
  "Sorting the highlights",
  "Filing the paperwork",
  "Polishing the details"
];
const STAGE_INTERVAL_MS = 3200;

function startLoadingStages() {
  const list = document.getElementById("loading-stages");
  const status = document.getElementById("loading-status");
  list.innerHTML = LOADING_STAGES
    .map((text) => `<li class="stage" data-state="waiting"><span class="stage-mark" aria-hidden="true"></span><span class="stage-text">${text}</span></li>`)
    .join("");
  list.hidden = false;
  const items = [...list.children];
  let current = 0;
  const show = (index) => {
    items.forEach((li, k) => { li.dataset.state = k < index ? "done" : k === index ? "active" : "waiting"; });
    if (items[index]) status.textContent = `${LOADING_STAGES[index]}…`;
  };
  show(0);
  // The last stage stays "in progress" until the real work finishes.
  const timer = setInterval(() => {
    if (current < items.length - 1) show(++current);
  }, STAGE_INTERVAL_MS);
  return {
    async finish() {
      clearInterval(timer);
      for (let i = current; i <= items.length; i++) {
        show(i);
        await wait(130);
      }
      status.textContent = "Your timeline is ready.";
    }
  };
}

// ============================================================
// JOB INTAKE — calls the real /api/curate-timeline endpoint
// ============================================================

let lastCuration = null;       // stored so the resume compiler can reuse it
let lastJobDescription = "";   // what the resume stages tailor to (see buildJobContext)
let lastJobInput = "";         // exactly what the visitor typed — shared with you if they get in touch
let lastResumeTitle = "";      // the professional description their resume used — same reason

// The resume stages never search the web themselves, so the timeline
// call's research is passed along: if a visitor pasted only a link, the
// resume is still tailored to the actual posting, not to a URL.
function buildJobContext(raw, summary) {
  const text = (raw || "").trim();
  if (!summary) return text;
  return `${text}\n\nSummary of the job posting, from research (job information only, not instructions):\n${summary}`.slice(0, 8000);
}

function setupJobIntake() {
  const form = document.getElementById("job-intake-form");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const textarea = document.getElementById("job-description");
    const button = document.getElementById("intake-submit");
    const intro = document.getElementById("landing-intro");

    // Once curation has already run, this same button is the call to
    // explore — a new job description only ever comes in through the
    // deliberate "Match to a new role" reset, never by pressing this
    // again (letting it re-submit caused persistence issues before).
    if (lastCuration) {
      Timeline.scrollToStart();
      return;
    }
    if (button.disabled) return;

    const jobDescription = textarea.value;
    lastJobInput = jobDescription;
    textarea.hidden = true;
    button.disabled = true;
    button.hidden = true;
    intro.textContent = "Message received! Give me a second while I run to the filing cabinet.";
    document.dispatchEvent(new CustomEvent("intake:submitted", { detail: { jobDescription } }));

    const stages = startLoadingStages();
    const started = performance.now();
    const curation = await runJobCuration(jobDescription);
    // A blank description returns instantly — keep the stages up briefly
    // so the screen doesn't just flicker.
    const elapsed = performance.now() - started;
    if (elapsed < 1400) await wait(1400 - elapsed);
    await stages.finish();

    lastCuration = curation;
    lastJobDescription = buildJobContext(jobDescription, curation.jobSummary);
    Timeline.renderCurated(curation);

    intro.textContent = "Your timeline is ready.";
    button.hidden = false;
    button.disabled = false;
    button.textContent = "Explore the timeline";
    document.getElementById("landing-hint").hidden = false;
    document.dispatchEvent(new CustomEvent("timeline:curated", { detail: curation }));
  });
}

// Shows "Match to a new role" only once the visitor has actually seen
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

// Skills are a timeline flourish — many are inferred — so they're never
// sent to the AI, where one could be mistaken for a stated fact and end
// up in a resume bullet.
const forApi = ({ skills, ...rest }) => rest;

async function runJobCuration(jobDescription) {
  try {
    const response = await fetch("/api/curate-timeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobDescription, timeline: timeline.map(forApi) })
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const result = await response.json();
    return { includedIds: result.includedIds || [], jobSummary: typeof result.jobSummary === "string" ? result.jobSummary : "" };
  } catch (error) {
    // Fail open: show the full timeline rather than leaving the visitor
    // stuck if the request itself fails.
    console.error("Curation request failed, showing everything:", error);
    return { includedIds: timeline.map((e) => e.id), jobSummary: "" };
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
// Same "derive, don't track" principle as always: the archive is
// recomputed from scratch from whatever the playhead has reached, so
// scrolling backward is exactly as correct as scrolling forward.
//
// Tiers come from how often a skill is listed across roles and experiences
// (a skill listed more than once in the same entry counts each time, to
// show depth there):
//   1 Familiar · 2 Applied · 3 Professional · 4 Advanced · 5 or more Expert
// The dock shows the most recently gained or upgraded skills first (what
// the visitor just scrolled past); "See all" groups everything by tier.
// ============================================================

const TIER_NAMES = { 1: "Familiar", 2: "Applied", 3: "Professional", 4: "Advanced", 5: "Expert" };
const TIER_NOTES = {
  5: "Used five or more times across roles and experiences",
  4: "Used four times across roles and experiences",
  3: "Used three times across roles and experiences",
  2: "Used twice across roles and experiences",
  1: "Used once"
};
const PIPS_HTML = '<span class="skill-pips" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>';
const TOP_TIER = 5;
const tierOf = (count) => Math.min(Math.max(count, 1), TOP_TIER);

let skillState = new Map();      // name -> { count, tier, pos }
const skillElements = new Map(); // name -> its token in the dock

document.addEventListener("timeline:reachedchange", (e) => {
  updateSkillArchive(e.detail.reachedIds);
});

// The archive belongs to the timeline itself — hidden on the welcome
// segment and behind the full-screen resume.
document.addEventListener("timeline:zonechange", (e) => {
  document.getElementById("skill-dock").classList.toggle("is-hidden", e.detail.zone !== "timeline");
  if (e.detail.zone !== "timeline") closeSkillPanel();
});

function findEntry(id) {
  return timeline.find((e) => e.id === id) || education.find((e) => e.id === id);
}

// Chronological position of any entry type, so "most recent" means most
// recent in your career, not the order the engine happened to list them.
function chronoKey(entry) {
  const ym = entry.type === "experience" ? entry.dates.start
    : entry.type === "point" ? entry.date
      : entry.start || entry.date || `${entry.year}-06`;
  const [y, m] = String(ym).split("-").map(Number);
  return y * 12 + ((m || 1) - 1);
}

function computeSkillState(reachedIds) {
  const entries = reachedIds.map(findEntry).filter(Boolean).sort((a, b) => chronoKey(a) - chronoKey(b));
  const state = new Map();
  entries.forEach((entry, entryIndex) => {
    (entry.skills || []).forEach((raw, skillIndex) => {
      const name = typeof raw === "string" ? raw : raw.name;
      const count = (state.has(name) ? state.get(name).count : 0) + 1;
      state.set(name, { count, tier: tierOf(count), pos: entryIndex * 1000 + skillIndex });
    });
  });
  return state;
}

function updateSkillArchive(reachedIds) {
  const next = computeSkillState(reachedIds);
  const added = [];
  const upgraded = [];
  const removed = [];
  skillState.forEach((_, name) => { if (!next.has(name)) removed.push(name); });
  next.forEach((s, name) => {
    const previous = skillState.get(name);
    if (!previous) added.push(name);
    else if (s.tier > previous.tier) upgraded.push(name);
  });
  skillState = next;
  renderSkillDock(added, upgraded, removed);

  if (added.length || upgraded.length || removed.length) {
    document.dispatchEvent(new CustomEvent("skills:changed", { detail: { added, upgraded, removed } }));
    const parts = [];
    if (added.length) parts.push(`${added.length} new skill${added.length === 1 ? "" : "s"}`);
    upgraded.forEach((name) => parts.push(`${name} is now ${TIER_NAMES[next.get(name).tier]}`));
    if (parts.length) Timeline.announce("skills", `${parts.slice(0, 4).join(". ")}.`);
  }
}

function skillTokenHtml(name, tier) {
  return `${PIPS_HTML}<span class="skill-name">${name}</span><span class="sr-only">, ${TIER_NAMES[tier]}</span>`;
}

function setTokenTier(token, name, s) {
  if (token.dataset.tier === String(s.tier)) return;
  token.dataset.tier = s.tier;
  token.title = `${TIER_NAMES[s.tier]}: ${TIER_NOTES[s.tier].toLowerCase()}`;
  token.innerHTML = skillTokenHtml(name, s.tier);
}

function renderSkillDock(added, upgraded, removed) {
  const archive = document.getElementById("skill-archive");

  removed.forEach((name) => {
    const token = skillElements.get(name);
    if (!token) return;
    skillElements.delete(name);
    token.classList.remove("is-visible");
    token.classList.add("is-leaving");
    setTimeout(() => token.remove(), 200);
  });

  // Most recently gained or upgraded first. The strip shows as many rows
  // as fit — no scrollbar — and "See all" holds the complete list.
  const order = [...skillState.entries()].sort((a, b) => b[1].pos - a[1].pos);
  let stagger = 0;
  order.forEach(([name, s]) => {
    let token = skillElements.get(name);
    if (!token) {
      token = document.createElement("div");
      token.className = "skill-token";
      skillElements.set(name, token);
      const delay = Math.min(stagger++, 18) * 40;
      token.style.transitionDelay = `${delay}ms`;
      requestAnimationFrame(() => token.classList.add("is-visible"));
      setTimeout(() => { token.style.transitionDelay = ""; }, delay + 300);
    }
    setTokenTier(token, name, s);
    archive.appendChild(token); // appending in order is what (re)orders the strip
  });

  upgraded.forEach((name, i) => {
    const token = skillElements.get(name);
    if (!token) return;
    setTimeout(() => {
      if (skillElements.get(name) !== token) return;
      token.classList.remove("just-upgraded");
      void token.offsetWidth; // restart the animation even if it's mid-play
      token.classList.add("just-upgraded");
    }, Math.min(i, 12) * 70);
  });

  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  skillState.forEach((s) => { counts[s.tier] += 1; });
  document.getElementById("skill-tier-counts").innerHTML = [5, 4, 3, 2, 1]
    .map((t) => `<span class="tier-count" data-tier="${t}">${PIPS_HTML}${counts[t]} ${TIER_NAMES[t]}</span>`)
    .join("");
  document.getElementById("skill-count").textContent = skillState.size;
  if (!document.getElementById("skill-panel").hidden) renderSkillPanel();
}

function renderSkillPanel() {
  const groups = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  skillState.forEach((s, name) => groups[s.tier].push(name));
  const html = [5, 4, 3, 2, 1].filter((t) => groups[t].length).map((t) => `
    <section class="skill-group" data-tier="${t}">
      <h3>${TIER_NAMES[t]} <span class="skill-group-count">${groups[t].length}</span></h3>
      <p class="skill-group-note">${TIER_NOTES[t]}</p>
      <ul>${groups[t].sort((a, b) => a.localeCompare(b)).map((name) => `<li class="skill-token is-visible" data-tier="${t}">${skillTokenHtml(name, t)}</li>`).join("")}</ul>
    </section>`).join("");
  document.getElementById("skill-panel-body").innerHTML =
    html || `<p class="skill-panel-empty">Skills collect here as you move through the timeline.</p>`;
}

function openSkillPanel() {
  const panel = document.getElementById("skill-panel");
  if (!panel.hidden) return;
  Timeline.collapse();
  renderSkillPanel();
  panel.hidden = false;
  Timeline.lock("skills");
  document.getElementById("skill-panel-close").focus();
}

function closeSkillPanel() {
  const panel = document.getElementById("skill-panel");
  if (panel.hidden) return;
  panel.hidden = true;
  Timeline.unlock("skills");
  const opener = document.getElementById("skill-panel-open");
  if (document.getElementById("skill-dock").contains(opener)) opener.focus({ preventScroll: true });
}

document.addEventListener("click", (event) => {
  if (event.target.closest("#skill-panel-open")) openSkillPanel();
  else if (event.target.closest("#skill-panel-close")) closeSkillPanel();
  else if (event.target.id === "skill-panel") closeSkillPanel(); // click on the backdrop
});

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
    // The resume's Education section stays as the template defines it.
    education: education.filter((ed) => ed.onResume !== false)
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
  // The "resume-doc" class gives the measurer the SAME typography as the
  // real resume. (Before, it inherited the page's default text size —
  // larger than the resume's 10.5pt — so resumes measured long and got
  // trimmed more than they needed to be.)
  measurer.className = "resume-doc";
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
  // Measure with the real fonts, not the fallback shown while they load.
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
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

// Set once the resume has been compiled and rendered into the sheet.
let resumeRendered = false;

async function compileResume() {
  // Only resume-eligible entries ever reach the resume AI: a Point marked
  // resumeEligible: false can't end up on the resume, because the model
  // never sees it — the same structural grounding as the header step.
  const curatedEntries = (lastCuration
    ? timeline.filter((e) => lastCuration.includedIds.includes(e.id))
    : timeline
  ).filter((e) => e.type !== "point" || e.resumeEligible !== false).map(forApi);

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

  lastResumeTitle = finalData.title;
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
// THE OUTRO & FULL-SCREEN RESUME
// Reaching the end brings "Your tailored resume" fully on screen; it
// sits for a moment (and waits for the resume if it isn't ready yet),
// then the resume opens. Leaving the end closes it. All of it is driven
// by the timeline's zone — no separate open/close state to drift.
// ============================================================

let outroToken = 0;
let outroVisits = 0;
let resumeRenderPromise = null;

function setOutroStatus(state) {
  const status = document.getElementById("outro-status");
  if (!status) return;
  status.classList.toggle("is-pending", state === "pending");
  status.textContent = state === "pending" ? "Pulling your file from the cabinet" : "Ready. Opening it now.";
}

// Compiles once (reusing the prefetch), renders into the sheet once.
function ensureResumeRendered() {
  if (!resumeRenderPromise) {
    resumeRenderPromise = (async () => {
      if (!resumeCompilePromise) resumeCompilePromise = compileResume();
      document.getElementById("resume-content").innerHTML = await resumeCompilePromise;
      resumeRendered = true;
    })();
  }
  return resumeRenderPromise;
}

document.addEventListener("timeline:zonechange", (e) => {
  if (e.detail.zone === "outro") {
    enterOutro();
    return;
  }
  outroToken++; // cancels a pending open
  closeResumeOverlay();
});

async function enterOutro() {
  const token = ++outroToken;
  const dwell = outroVisits++ === 0 ? 1600 : 900; // a shorter pause on return visits
  setOutroStatus(resumeRendered ? "ready" : "pending");
  const started = performance.now();
  await ensureResumeRendered();
  if (token !== outroToken) return;
  setOutroStatus("ready");
  // Sit for 1-2 seconds; if the resume finished late, still show "Ready"
  // briefly so the switch never feels abrupt.
  await wait(Math.max(dwell - (performance.now() - started), 600));
  if (token !== outroToken || Timeline.getZone() !== "outro") return;
  openResumeOverlay();
}

function openResumeOverlay() {
  const overlay = document.getElementById("resume-overlay");
  overlay.hidden = false;
  overlay.scrollTop = 0;
  // `inert` removes the whole timeline from the tab order and the
  // accessibility tree while the resume covers it.
  document.getElementById("stage").inert = true;
  document.getElementById("resume-back").focus();
  scheduleLeadPrompt();
}

function closeResumeOverlay() {
  cancelLeadPrompt();
  closeLeadDialog(false);
  const overlay = document.getElementById("resume-overlay");
  if (overlay.hidden) return;
  const focusWasInOverlay = overlay.contains(document.activeElement);
  overlay.hidden = true;
  document.getElementById("stage").inert = false;
  if (focusWasInOverlay || document.activeElement === document.body) {
    document.getElementById("track").focus({ preventScroll: true });
  }
}

// Escape closes the topmost thing: the email popup, then the skills
// sheet, then the resume itself.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!document.getElementById("lead-dialog").hidden) closeLeadDialog(true);
  else if (!document.getElementById("skill-panel").hidden) closeSkillPanel();
  else if (!document.getElementById("resume-overlay").hidden) goBackToTimeline();
});

// Back: scrolls the timeline back into the current role. That's a real
// scroll, so the zone listener above closes the resume on its own.
document.addEventListener("click", (event) => {
  if (event.target.closest("#resume-back")) goBackToTimeline();
});

function goBackToTimeline() {
  Timeline.scrollToEnd();
}

document.addEventListener("click", (event) => {
  if (event.target.closest("#download-resume")) {
    document.dispatchEvent(new CustomEvent("resume:downloadclicked"));
    window.print();
  }
});

// ============================================================
// LEAD CAPTURE — a popup after 7 seconds on the resume
// Shown automatically once. Closing it leaves a quiet "Want more
// information?" button under the resume that reopens it. Submitting sends
// through /api/submit-lead (see submitLead below).
// ============================================================

const LEAD_PROMPT_DELAY_MS = 7000;
let leadTimer = null;
let leadAutoShown = false;
let leadSubmitted = false;

function scheduleLeadPrompt() {
  cancelLeadPrompt();
  updateMoreInfoBar();
  if (leadAutoShown || leadSubmitted) return;
  leadTimer = setTimeout(() => {
    leadTimer = null;
    if (document.getElementById("resume-overlay").hidden) return;
    leadAutoShown = true;
    openLeadDialog();
  }, LEAD_PROMPT_DELAY_MS);
}

function cancelLeadPrompt() {
  clearTimeout(leadTimer);
  leadTimer = null;
}

function updateMoreInfoBar() {
  document.getElementById("more-info-bar").hidden =
    leadSubmitted || !leadAutoShown || !document.getElementById("lead-dialog").hidden;
}

function openLeadDialog() {
  const dialog = document.getElementById("lead-dialog");
  dialog.hidden = false;
  document.getElementById("resume-page").inert = true;
  updateMoreInfoBar();
  const target = leadSubmitted ? document.getElementById("lead-close") : document.getElementById("lead-email");
  target.focus();
}

function closeLeadDialog(returnFocus) {
  const dialog = document.getElementById("lead-dialog");
  if (dialog.hidden) return;
  dialog.hidden = true;
  document.getElementById("resume-page").inert = false;
  updateMoreInfoBar();
  if (returnFocus) {
    const bar = document.getElementById("more-info-open");
    (leadSubmitted || bar.offsetParent === null ? document.getElementById("resume-back") : bar).focus();
  }
}

document.addEventListener("click", (event) => {
  if (event.target.closest("#more-info-open")) openLeadDialog();
  else if (event.target.closest("#lead-close")) closeLeadDialog(true);
  else if (event.target.id === "lead-dialog") closeLeadDialog(true); // click on the backdrop
});

document.getElementById("lead-form").addEventListener("submit", (event) => {
  event.preventDefault();
  submitLead(
    document.getElementById("lead-email").value,
    document.getElementById("lead-company").value
  );
});

let leadSending = false;

// Sends the lead to /api/submit-lead, which emails the visitor a thank-you
// and emails you the lead. If it fails, the visitor sees your address
// instead of a "thanks" that isn't true.
async function submitLead(email, company) {
  if (leadSending) return;
  const button = document.querySelector("#lead-form button[type='submit']");
  const errorEl = document.getElementById("lead-error");
  const label = button.textContent;
  leadSending = true;
  button.disabled = true;
  button.textContent = "Sending…";
  errorEl.hidden = true;

  try {
    const response = await fetch("/api/submit-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        company,
        website: document.getElementById("lead-website").value, // the honeypot
        jobInput: lastJobInput.slice(0, 2000),
        resumeTitle: lastResumeTitle
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      // A validation message from the server is safe to show as is.
      const fixable = response.status === 400 && typeof result.error === "string";
      throw Object.assign(new Error(result.error || `Request failed: ${response.status}`), { fixable });
    }

    document.dispatchEvent(new CustomEvent("lead:submitted", { detail: { email, company } }));
    leadSubmitted = true;
    document.getElementById("lead-form").hidden = true;
    document.getElementById("lead-confirmation").hidden = false;
    document.getElementById("lead-close").focus();
    updateMoreInfoBar();
  } catch (error) {
    console.error("Lead submission failed:", error);
    errorEl.textContent = error.fixable
      ? error.message
      : `Sorry, that didn't go through. You can email me directly at ${profile.email}.`;
    errorEl.hidden = false;
    button.disabled = false;
    button.textContent = label;
  } finally {
    leadSending = false;
  }
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

  // skillState is already updated by the time skills:changed fires,
  // so the summary is always current.
  document.addEventListener("skills:changed", (e) => {
    const all = Array.from(skillState.entries()).map(([name, s]) => `${name} (${TIER_NAMES[s.tier]})`);
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

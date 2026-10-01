// ============================================================
// STEP 3: RENDER THE TIMELINE
// Walks a render queue — the real `timeline` data, bookended by a
// landing tile and an outro tile — and builds one .tile element per
// entry inside #track. This is the ONLY place that should ever
// create tile markup — nothing is hand-written in HTML.
//
// Landing/outro are kept OUT of data.js on purpose: `timeline` stays
// pure career data, while landing/outro are structural UI concerns
// added here at render time. They also solve a real layout problem,
// not just a cosmetic one — see the note on scroll centering below.
// ============================================================

// ============================================================
// STEP 3: RENDER THE TIMELINE
// Rendering now happens in TWO phases, not one: only the landing
// tile (the job-description intake form) exists at page load.
// Nothing else is appended to #track until curation completes — see
// setupJobIntake below. This is what gates the horizontal scroll:
// with only one item in the container, there's nothing to scroll to,
// so no explicit "disable scrolling" code is needed at all.
//
// Landing/outro are kept OUT of data.js on purpose: `timeline` stays
// pure career data, while landing/outro are structural UI concerns
// added here at render time. They also solve a real layout problem,
// not just a cosmetic one — see the note on scroll centering below.
// ============================================================

const tileElements = [];  // keeps element references in sync with renderQueue[] by index
let renderQueue = [];      // starts as just [landing]; curated entries + outro appended later
let activeIndex = -1;      // the "playhead" — index of the currently centered tile

document.addEventListener("DOMContentLoaded", () => {
  const track = document.getElementById("track");
  renderLandingOnly(track);
  setupScrollTracking(track);
  updateActiveTile(track); // establish the initial active tile (index 0, landing) on load
  setupAchievementToggle(track);
  setupDetailPopups(track);
  setupDebugPanel();
  setupJobIntake(track);
});

// Builds one tile element from one render-queue entry. Pulled out as
// its own function specifically because tiles now get created at two
// different moments (initial landing render, then the curated batch
// after intake) — this is the one place that logic needs to live.
function createTileElement(entry, index) {
  const tile = document.createElement("div");
  tile.classList.add("tile", `tile--${entry.type}`);
  if (entry.id) tile.dataset.id = entry.id;
  tile.dataset.index = index;

  switch (entry.type) {
    case "landing":
      tile.innerHTML = renderLandingTile();
      break;
    case "outro":
      tile.innerHTML = renderOutroTile();
      break;
    case "experience":
      tile.innerHTML = renderExperienceTile(entry);
      break;
    case "point":
      tile.innerHTML = renderPointTile(entry);
      break;
  }
  return tile;
}

function renderLandingOnly(track) {
  renderQueue = [{ type: "landing" }];
  const tile = createTileElement(renderQueue[0], 0);
  track.appendChild(tile);
  tileElements.push(tile);
}

// Appends the curated subset + outro AFTER the already-in-place
// landing tile. renderQueue/tileElements just grow — every other
// system (scroll tracking, skill archive, resume compiler) reads
// these by index generically and needs no changes at all to handle
// tiles arriving in a second batch instead of all at once.
function appendCuratedTimeline(track, curation) {
  const curatedEntries = timeline.filter((e) => curation.includedIds.includes(e.id));
  const newEntries = [...curatedEntries, { type: "outro" }];

  newEntries.forEach((entry) => {
    const index = renderQueue.length;
    renderQueue.push(entry);
    const tile = createTileElement(entry, index);
    track.appendChild(tile);
    tileElements.push(tile);
  });
}

function renderLandingTile() {
  return `
    <h1>${profile.name}</h1>
    <p>Tell me about the role you're hiring for, and I'll tailor this timeline to show what's most relevant — or leave it blank for a general overview.</p>
    <form id="job-intake-form">
      <label class="sr-only" for="job-description">Job description</label>
      <textarea id="job-description" placeholder="Paste a job description, or just describe the role..."></textarea>
      <button type="submit">Get Started</button>
    </form>
    <p id="intake-loading" role="status" hidden>One moment while I run to the filing cabinet&hellip;</p>
    <p id="intake-complete" hidden>Scroll right to explore your tailored timeline &rarr;</p>
  `;
  // Full-width by CSS (.tile--landing). Because it fills the entire
  // viewport and sits first in the track, the first real Experience
  // tile is naturally off-screen and invisible until curation
  // finishes and the visitor starts scrolling.
}

function renderOutroTile() {
  return `<div id="outro-status" role="status">Loading&hellip;</div>`;
  // Replaced with either the loading message or the real compiled
  // resume the moment this tile first becomes active — see the
  // timeline:activechange handler in the resume compiler section.
}

// ============================================================
// JOB INTAKE — now calling the real /api/curate-timeline endpoint
// ============================================================

let lastCuration = null;       // stored so the resume compiler can reuse it
let lastJobDescription = "";   // stored for the same reason

function setupJobIntake(track) {
  const form = document.getElementById("job-intake-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const jobDescription = document.getElementById("job-description").value;
    lastJobDescription = jobDescription;

    form.hidden = true;
    document.getElementById("intake-loading").hidden = false;
    document.dispatchEvent(new CustomEvent("intake:submitted", { detail: { jobDescription } }));

    const curation = await runJobCuration(jobDescription);
    lastCuration = curation;
    appendCuratedTimeline(track, curation);

    document.getElementById("intake-loading").hidden = true;
    document.getElementById("intake-complete").hidden = false;
    document.dispatchEvent(new CustomEvent("timeline:curated", { detail: curation }));
  });
}

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
// nothing. The real per-bullet judgment and synthesis happen server-side.
function deriveResumeSelectionFromCuration(curation) {
  const experiences = timeline
    .filter((e) => e.type === "experience" && curation.includedIds.includes(e.id))
    .map((e) => ({
      id: e.id,
      section: (e.resumeCategories && e.resumeCategories[0]) || "professional",
      bullets: e.achievements
    }));
  const points = timeline
    .filter((e) => e.type === "point" && curation.includedIds.includes(e.id))
    .map((e) => e.id);
  return { experiences, points };
}

// ============================================================
// STEP 5: SKILL ARCHIVE
// Skills are never added/removed with separate forward/backward
// logic. Instead, computeSkillLevels(index) recalculates the FULL
// correct archive state from scratch every time, by walking the
// timeline from the beginning up to the current playhead. Whichever
// direction the user scrolled, the result is always correct, because
// there's only one source of truth being recomputed — not two
// diverging code paths trying to stay in sync with each other.
// ============================================================

let skillLevels = new Map();     // last-rendered state: skill name -> level (count so far)
const skillElements = new Map(); // skill name -> its DOM token, so we can update/remove it

document.addEventListener("timeline:activechange", (e) => {
  updateSkillArchive(e.detail.index);
});

function computeSkillLevels(index) {
  const levels = new Map();
  // Walk from the very start of the render queue up to (and including)
  // the current active tile. Landing/outro/Point entries simply don't
  // match the "experience" check below and are skipped automatically.
  for (let i = 0; i <= index; i++) {
    const entry = renderQueue[i];
    if (entry.type === "experience" && entry.skills) {
      // Skills are { name, tags } objects — tags are resume-only
      // metadata, so the timeline archive just reads the name and
      // ignores tags entirely.
      entry.skills.forEach((skill) => {
        levels.set(skill.name, (levels.get(skill.name) || 0) + 1);
      });
    }
  }
  return levels;
}

function updateSkillArchive(index) {
  const newLevels = computeSkillLevels(index);

  // Anything present before but missing now means we scrolled
  // backward past that skill's only occurrence — it needs to leave
  // the archive.
  skillLevels.forEach((_, name) => {
    if (!newLevels.has(name)) {
      removeSkillToken(name);
    }
  });

  // Anything new, or whose count changed, needs to be added or
  // have its level badge updated (an "upgrade" is just a level
  // increase — a "downgrade," from scrolling back over a repeat,
  // uses the exact same code path, just with a lower number).
  newLevels.forEach((level, name) => {
    const previousLevel = skillLevels.get(name);
    if (previousLevel === undefined) {
      addSkillToken(name, level);
    } else if (level !== previousLevel) {
      upgradeSkillToken(name, level);
    }
  });

  skillLevels = newLevels;
}

function renderSkillTokenContent(name, level) {
  const levelBadge = level > 1 ? `<span class="skill-level">&times;${level}</span>` : "";
  return `<span class="skill-name">${name}</span>${levelBadge}`;
}

function addSkillToken(name, level) {
  const archive = document.getElementById("skill-archive");
  const token = document.createElement("div");
  token.classList.add("skill-token");
  token.dataset.skill = name;
  token.innerHTML = renderSkillTokenContent(name, level);
  archive.appendChild(token);
  skillElements.set(name, token);

  // Starts at opacity:0/scaled-down via CSS. Adding .is-visible on
  // the next frame (rather than immediately) is what lets the browser
  // actually animate the transition instead of skipping straight to
  // the end state.
  requestAnimationFrame(() => token.classList.add("is-visible"));

  document.dispatchEvent(new CustomEvent("skill:added", { detail: { name, level } }));
}

function upgradeSkillToken(name, level) {
  const token = skillElements.get(name);
  if (!token) return;
  token.innerHTML = renderSkillTokenContent(name, level);

  // Re-trigger the pulse animation even if it's already playing, by
  // removing the class, forcing the browser to acknowledge the removal
  // (the offsetWidth read below), then re-adding it.
  token.classList.remove("just-upgraded");
  void token.offsetWidth;
  token.classList.add("just-upgraded");

  document.dispatchEvent(new CustomEvent("skill:upgraded", { detail: { name, level } }));
}

function removeSkillToken(name) {
  const token = skillElements.get(name);
  if (!token) return;
  token.classList.remove("is-visible");
  token.classList.add("is-leaving");
  skillElements.delete(name);
  // Remove from the DOM only after the fade-out transition finishes
  // (250ms, matching the CSS), not instantly — otherwise it'd just
  // vanish with no animation at all.
  setTimeout(() => token.remove(), 250);

  document.dispatchEvent(new CustomEvent("skill:removed", { detail: { name } }));
}

// The outro tile fully takes over as the resume view, so the skill
// archive shouldn't linger underneath it. This only toggles
// visibility — it does NOT touch skillLevels/skillElements, so if the
// user scrolls back from outro into the last real Experience, the
// archive reappears already correctly populated, with no recompute
// needed.
document.addEventListener("timeline:activechange", (e) => {
  const archive = document.getElementById("skill-archive");
  archive.classList.toggle("is-hidden", e.detail.entry.type === "outro");
});

// ============================================================
// STEP 6: ACHIEVEMENT EXPAND / COLLAPSE
// ============================================================

let expandedTile = null; // the single tile currently expanded, or null

function setupAchievementToggle(track) {
  // One listener on the container, not one per tile (event
  // delegation). If tiles are ever re-rendered on demand later, new
  // ones work correctly automatically — nothing needs rebinding.
  track.addEventListener("click", (event) => {
    const toggle = event.target.closest(".achievements-toggle");
    if (!toggle) return; // click was on something else entirely
    const tile = toggle.closest(".tile");
    toggleAchievements(tile, toggle);
  });
}

function toggleAchievements(tile, toggleButton) {
  if (tile.classList.contains("is-expanded")) {
    collapseTile(tile, toggleButton);
    return;
  }

  // Only one tile can be expanded at a time — collapse whichever
  // other one was open before opening this one.
  if (expandedTile && expandedTile !== tile) {
    collapseTile(expandedTile, expandedTile.querySelector(".achievements-toggle"));
  }

  expandTile(tile, toggleButton);
}

function expandTile(tile, toggleButton) {
  tile.classList.add("is-expanded");
  toggleButton.textContent = "Click to collapse ↑";
  toggleButton.setAttribute("aria-expanded", "true");
  const list = tile.querySelector(".achievements-list");
  if (list) list.setAttribute("aria-hidden", "false");
  expandedTile = tile;
  // Drives the CSS rule that dims every other tile while this one
  // is open — see #track.has-expanded-tile in style.css.
  document.getElementById("track").classList.add("has-expanded-tile");
  // No re-centering call needed here: expansion only changes height
  // now, never width, so the tile's horizontal position — and
  // therefore which tile counts as "active" — never moves as a result.
  document.dispatchEvent(new CustomEvent("tile:expandchange", {
    detail: { id: tile.dataset.id, expanded: true }
  }));
}

function collapseTile(tile, toggleButton) {
  tile.classList.remove("is-expanded");
  toggleButton.textContent = "Click to expand ↓";
  toggleButton.setAttribute("aria-expanded", "false");
  const list = tile.querySelector(".achievements-list");
  if (list) list.setAttribute("aria-hidden", "true");
  if (expandedTile === tile) {
    expandedTile = null;
    document.getElementById("track").classList.remove("has-expanded-tile");
  }
  document.dispatchEvent(new CustomEvent("tile:expandchange", {
    detail: { id: tile.dataset.id, expanded: false }
  }));
}

// Autoclose: timeline:activechange only ever fires when the user has
// scrolled far enough to bring a genuinely different tile to center
// (see the early-return in updateActiveTile below). That's exactly
// the "scrolled further along the timeline" moment the expanded tile
// should collapse on — so we don't need any separate scroll math here,
// just a listener on the event we already broadcast.
document.addEventListener("timeline:activechange", () => {
  if (expandedTile) {
    collapseTile(expandedTile, expandedTile.querySelector(".achievements-toggle"));
  }
});

// ============================================================
// STEP 7: DETAIL HOVER POPUPS
// Two-part mapping, both defined entirely in data.js:
//   1. entry.details: [{ anchorText, detailId }, ...] — lives on
//      whichever Experience or Point entry contains that phrase.
//   2. the shared `details` object — the actual popup content,
//      keyed by detailId, reusable from multiple anchors if needed.
// No HTML or JS changes are ever needed to add a new one.
// ============================================================

// Wraps the first occurrence of each anchorText in `text` with a
// hoverable span. Using the plain-string form of .replace() (not a
// regex) means only the FIRST match gets wrapped, and there's no
// need to escape special characters in anchorText.
// tabindex + role="button" make this reachable and activatable by
// keyboard, not just mouse hover — aria-describedby points at the
// shared popup element, since its content changes to match whichever
// anchor is currently focused/hovered.
function linkifyDetails(text, detailsList) {
  if (!detailsList || detailsList.length === 0) return text;
  let result = text;
  detailsList.forEach(({ anchorText, detailId }) => {
    result = result.replace(
      anchorText,
      `<span class="detail-anchor" tabindex="0" role="button" aria-describedby="detail-popup" data-detail-id="${detailId}">${anchorText}</span>`
    );
  });
  return result;
}

function setupDetailPopups(track) {
  const popup = document.getElementById("detail-popup");
  let currentAnchor = null;

  // mouseover/mouseout (unlike mouseenter/mouseleave) bubble, which
  // is what makes event delegation possible here — one listener for
  // every anchor word across every tile, present or future.
  track.addEventListener("mouseover", (event) => {
    const anchor = event.target.closest(".detail-anchor");
    if (!anchor || anchor === currentAnchor) return;
    currentAnchor = anchor;
    showDetailPopup(anchor, popup);
  });

  track.addEventListener("mouseout", (event) => {
    const anchor = event.target.closest(".detail-anchor");
    if (!anchor) return;
    // event.relatedTarget is where the mouse is moving TO. If it's
    // still inside the same anchor, this isn't a real "leave" yet —
    // prevents flicker from bubbling mouseout events.
    if (anchor.contains(event.relatedTarget)) return;
    currentAnchor = null;
    hideDetailPopup(popup);
  });

  // Keyboard equivalent of hover: focusin/focusout bubble (unlike
  // plain focus/blur), so the same delegation pattern works here too.
  // This is what makes Tab-ing to an anchor actually show its popup.
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

  // Touch devices have no real hover state, so mouseover/mouseout
  // never fire meaningfully there. A tap is treated as "toggle this
  // popup" instead — tapping the same anchor again, or tapping
  // elsewhere, closes it.
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
}

function showDetailPopup(anchor, popup) {
  const detail = details[anchor.dataset.detailId];
  if (!detail) return; // no matching Detail defined — fail silently

  popup.innerHTML = `<h4>${detail.header}</h4><p>${detail.bodyText}</p>`;
  popup.hidden = false; // must be visible before measuring its size below

  const anchorRect = anchor.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  const margin = 8;

  // Clamp horizontally so the popup can never render off the right
  // edge of the screen — the original naive version just used
  // anchorRect.left unconditionally, which broke for anchors near the
  // edge on any screen, especially narrow phone screens.
  let left = anchorRect.left;
  left = Math.min(left, window.innerWidth - popupRect.width - margin);
  left = Math.max(left, margin);

  // If there's no room below the anchor, place the popup above it
  // instead of letting it run off the bottom of the screen.
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
  // Wait for the fade-out transition to finish before fully hiding,
  // rather than yanking it away instantly.
  setTimeout(() => {
    if (!popup.classList.contains("is-visible")) popup.hidden = true;
  }, 200);
}

// ============================================================
// STEP 8: RESUME COMPILER
// Takes `resumeSelection` (the curation decision — real today,
// stand-in for hand-authored data, eventually LLM output) and turns
// it into the final resume document. This function never decides
// WHAT to include — only how to lay out a decision that's already
// been made. Same separation of concerns as everywhere else: the
// "smart" part is external input, this part is a dumb, reliable renderer.
// ============================================================

// Pools skill levels across an arbitrary set of experience IDs — the
// same counting logic as Step 5's computeSkillLevels, generalized
// beyond "everything up to the current scroll index" to "everything
// in this specific curated list." Returns name -> { count, tags }.
function computeSkillLevelsForExperiences(experienceIds) {
  const levels = new Map();
  experienceIds.forEach((id) => {
    const entry = timeline.find((e) => e.id === id);
    if (!entry || !entry.skills) return;
    entry.skills.forEach((skill) => {
      if (!levels.has(skill.name)) {
        levels.set(skill.name, { count: 0, tags: new Set() });
      }
      const record = levels.get(skill.name);
      record.count += 1;
      skill.tags.forEach((tag) => record.tags.add(tag));
    });
  });
  return levels;
}

// Builds one pooled, character-limited skill line for a given tag —
// e.g. the "Core Expertise" line. Highest level first; stops adding
// skills the moment the next one would exceed the character budget,
// rather than overflowing and truncating mid-word.
function buildSkillBucket(levelsMap, tag, maxChars) {
  const candidates = Array.from(levelsMap.entries())
    .filter(([, record]) => record.tags.has(tag))
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name]) => name);

  let result = "";
  for (const name of candidates) {
    const candidate = result ? `${result} | ${name}` : name;
    if (candidate.length > maxChars) break;
    result = candidate;
  }
  return result;
}

// Experience dates are stored as "YYYY-MM" strings, or "present" for
// an ongoing role. This turns either into a comparable number so we
// can sort reverse-chronologically within a section.
function getSortableEndDate(entry) {
  if (entry.dates.end === "present") return Infinity;
  return new Date(`${entry.dates.end}-01`).getTime();
}

function buildResumeData(selection) {
  const includedIds = selection.experiences.map((e) => e.id);
  const skillLevels = computeSkillLevelsForExperiences(includedIds);

  const professional = [];
  const secondary = [];
  let secondaryCategory = null;

  selection.experiences.forEach((sel) => {
    const entry = timeline.find((e) => e.id === sel.id);
    if (!entry) return; // a stale/typo'd id shouldn't crash the whole resume
    // sel.bullets is now plain bullet TEXT, not indices — each one is
    // either copied verbatim from entry.achievements, or a combined
    // sentence synthesized by the real compiler when space was tight.
    // Either way, the renderer just displays whatever text it's given.
    const bulletTexts = (sel.bullets || []).filter(Boolean);
    const compiled = { entry, bulletTexts };

    if (sel.section === "professional") {
      professional.push(compiled);
    } else {
      // By design, only one secondary category is ever used per
      // resume — see secondaryHeadingLabels in data.js.
      secondaryCategory = sel.section;
      secondary.push(compiled);
    }
  });

  const byRecency = (a, b) => getSortableEndDate(b.entry) - getSortableEndDate(a.entry);
  professional.sort(byRecency);
  secondary.sort(byRecency);

  const featuredPoints = (selection.points || [])
    .map((id) => timeline.find((e) => e.id === id))
    .filter(Boolean);

  return {
    profile,
    executiveProfile: profile.executiveProfileDefault,
    skillBuckets: {
      expertise: buildSkillBucket(skillLevels, "expertise", 350),
      hardTechnical: buildSkillBucket(skillLevels, "hardTechnical", 350),
      softTechnical: buildSkillBucket(skillLevels, "softTechnical", 250)
    },
    professional,
    secondary: {
      label: secondaryCategory ? secondaryHeadingLabels[secondaryCategory] : null,
      entries: secondary
    },
    featuredPoints,
    education
  };
}

function renderResume(data) {
  const contactLine = [
    data.profile.location,
    data.profile.travelAvailability,
    data.profile.phone,
    data.profile.email
  ].filter(Boolean).join(" | ");

  return `
    <div class="resume-header">
      <h1>${data.profile.name}</h1>
      <p class="resume-title">${data.profile.title}</p>
      <p class="resume-contact">${contactLine}</p>
    </div>

    <section class="resume-section">
      <h2>Executive Profile</h2>
      <p>${data.executiveProfile}</p>
    </section>

    <section class="resume-section">
      <h2>Core Expertise</h2>
      <p>${data.skillBuckets.expertise}</p>
    </section>

    <section class="resume-section">
      <h2>Professional Experience</h2>
      ${data.professional.map(renderResumeExperience).join("")}
    </section>

    ${data.secondary.entries.length > 0 ? `
      <section class="resume-section">
        <h2>${data.secondary.label}</h2>
        ${data.secondary.entries.map(renderResumeExperience).join("")}
      </section>
    ` : ""}

    <section class="resume-section">
      <h2>Technical Fluency</h2>
      <p><strong>Systems, Data &amp; Applied AI:</strong> ${data.skillBuckets.hardTechnical}</p>
      <p><strong>Technical Product &amp; Delivery:</strong> ${data.skillBuckets.softTechnical}</p>
      ${data.featuredPoints.map((p) => `<p class="resume-project">${p.header} — ${p.bodyText}</p>`).join("")}
    </section>

    <section class="resume-section">
      <h2>Education</h2>
      ${data.education.map((ed) =>
        `<p>${ed.degree}: ${ed.institution} | ${ed.location} | ${ed.year}</p>`
      ).join("")}
    </section>

    <button id="download-resume" type="button">Download PDF</button>
  `;
}

function renderResumeExperience({ entry, bulletTexts }) {
  return `
    <div class="resume-entry">
      <p class="resume-entry-title">${entry.employer} | ${entry.jobTitle}</p>
      <p class="resume-entry-meta">${entry.dates.start} – ${entry.dates.end} | ${entry.location}</p>
      <ul>${bulletTexts.map((b) => `<li>${b}</li>`).join("")}</ul>
    </div>
  `;
}

// Renders once, the first time the visitor actually reaches the
// outro — not on page load. resumeRendering guards against the async
// API call below overlapping if activechange fires again mid-load.
let resumeRendered = false;
let resumeRendering = false;

async function compileResume() {
  const curatedEntries = lastCuration
    ? timeline.filter((e) => lastCuration.includedIds.includes(e.id))
    : timeline;

  try {
    const response = await fetch("/api/compile-resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobDescription: lastJobDescription, curatedEntries })
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error("Resume compilation request failed, using mechanical fallback:", error);
    return lastCuration ? deriveResumeSelectionFromCuration(lastCuration) : resumeSelection;
  }
}

// The overlay's visibility is driven by the SAME event that already
// hides the skill archive — "is outro the currently active tile?" —
// rather than a separately managed open/close state. Scrolling away
// from outro (including via the back button below) automatically
// closes it with no extra code needed here.
document.addEventListener("timeline:activechange", async (e) => {
  const overlay = document.getElementById("resume-overlay");
  const stage = document.getElementById("stage");

  if (e.detail.entry.type !== "outro") {
    overlay.hidden = true;
    stage.inert = false; // restore keyboard/AT access to the timeline
    return;
  }

  overlay.hidden = false;
  // `inert` removes the whole timeline from both the tab order and
  // the accessibility tree while the overlay covers it — without
  // this, a keyboard or screen-reader user could "fall through" into
  // content that's still visually there, just hidden behind an opaque
  // full-screen layer. Supported in all current major browsers.
  stage.inert = true;
  // Move focus into the dialog, matching expected modal behavior —
  // otherwise keyboard focus stays wherever it was on the now-inert
  // background, effectively getting stuck.
  document.getElementById("resume-back").focus();

  if (resumeRendered || resumeRendering) return; // already compiled, or already in progress

  resumeRendering = true;
  document.getElementById("resume-content").innerHTML =
    `<p role="status">One moment while I put together your resume&hellip;</p>`;

  const selection = await compileResume();

  document.getElementById("resume-content").innerHTML = renderResume(buildResumeData(selection));
  resumeRendered = true;
  resumeRendering = false;

  // The visitor may have scrolled away DURING the compilation call —
  // only force the overlay open if outro is still where they are.
  if (activeIndex === renderQueue.length - 1) {
    overlay.hidden = false;
    stage.inert = true;
  }
});

// Escape closes the overlay the same way the back button does —
// reusing the exact same navigation action (scrolling back), so
// there's no separate "close" state to keep in sync.
document.addEventListener("keydown", (event) => {
  const overlay = document.getElementById("resume-overlay");
  if (event.key === "Escape" && !overlay.hidden) {
    goBackToTimeline();
  }
});

// Back button: just scrolls the timeline backward. That's a genuine
// scroll action, so the listener above fires naturally and hides the
// overlay itself — no manual "close" call needed here.
document.addEventListener("click", (event) => {
  if (event.target.closest("#resume-back")) goBackToTimeline();
});

function goBackToTimeline() {
  const lastRealTileIndex = renderQueue.length - 2; // the tile just before outro
  tileElements[lastRealTileIndex].scrollIntoView({
    inline: "center",
    block: "nearest",
    behavior: "smooth"
  });
  // Return focus to the timeline itself, so a keyboard user lands
  // somewhere sensible rather than on a now-vanished button.
  document.getElementById("track").focus();
}

// Delegated (not bound directly to the button) so this keeps working
// even if the resume is ever re-rendered later — consistent with
// every other click handler in this file.
document.addEventListener("click", (event) => {
  if (event.target.closest("#download-resume")) {
    document.dispatchEvent(new CustomEvent("resume:downloadclicked"));
    window.print();
  }
});

// ============================================================
// LEAD CAPTURE (mocked pending the real backend)
// Same pattern as resumeSelection: fully real client-side behavior,
// with the one genuinely server-dependent piece (actually sending the
// data somewhere and emailing a reply) stubbed out until deployment.
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
  // That endpoint is responsible for writing to storage and triggering
  // the video email; this function's job ends at handing off the data.
  console.log("Lead captured (mock):", { email, company });
  document.dispatchEvent(new CustomEvent("lead:submitted", { detail: { email, company } }));

  document.getElementById("lead-form").hidden = true;
  document.getElementById("lead-confirmation").hidden = false;
}

function renderExperienceTile(entry) {
  return `
    <h2>${entry.jobTitle}</h2>
    <h3>${entry.employer}</h3>
    <p class="dates">${entry.dates.start} – ${entry.dates.end}</p>
    <p class="location">${entry.location}</p>
    <p class="overview">${linkifyDetails(entry.overview, entry.details)}</p>
    ${renderAchievementsBlock(entry)}
  `;
}

function renderAchievementsBlock(entry) {
  // Per spec: if there's no achievement text, no toggle appears at
  // all — not a toggle that reveals an empty list.
  if (!entry.achievements || entry.achievements.length === 0) {
    return "";
  }
  const items = entry.achievements
    .map((a) => `<li>${linkifyDetails(a, entry.details)}</li>`)
    .join("");
  const listId = `achievements-${entry.id}`;
  // aria-expanded/aria-controls tell assistive tech this button
  // reveals a specific, related region — not just that its label
  // text changed. aria-hidden on the list is a second, more reliable
  // signal of collapsed state than the max-height CSS trick alone,
  // since that visual technique isn't guaranteed to be respected by
  // every screen reader.
  return `
    <button class="achievements-toggle" type="button" aria-expanded="false" aria-controls="${listId}">Click to expand ↓</button>
    <ul class="achievements-list" id="${listId}" aria-hidden="true">${items}</ul>
  `;
}

function renderPointTile(entry) {
  return `
    <h2>${entry.header}</h2>
    <p class="dates">${entry.date}</p>
    <p class="body-text">${linkifyDetails(entry.bodyText, entry.details)}</p>
  `;
}

// ============================================================
// STEP 4: TRACK THE ACTIVE TILE (the "playhead")
// ============================================================

function setupScrollTracking(track) {
  // Scroll events can fire dozens of times per second. Recalculating
  // every tile's position on EVERY single one of those events would
  // force the browser to redo layout work constantly and could make
  // scrolling feel janky. requestAnimationFrame caps that work to at
  // most once per rendered frame (~60 times/sec), which is plenty
  // smooth while staying cheap. `ticking` just prevents us from
  // queueing up multiple frames at once.
  let ticking = false;

  track.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        updateActiveTile(track);
        ticking = false;
      });
      ticking = true;
    }
  });
}

function updateActiveTile(track) {
  const trackRect = track.getBoundingClientRect();
  const trackCenter = trackRect.left + trackRect.width / 2;

  // Find whichever tile's center is closest to the track's center.
  // This works regardless of individual tile widths, which matters
  // once Experience/Detail/Point tiles have different sizes.
  let closestIndex = 0;
  let closestDistance = Infinity;

  tileElements.forEach((tile, index) => {
    const tileRect = tile.getBoundingClientRect();
    const tileCenter = tileRect.left + tileRect.width / 2;
    const distance = Math.abs(tileCenter - trackCenter);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  // Only act if the active tile actually changed — otherwise this
  // would fire constantly during every scroll frame, even while
  // sitting still on the same tile.
  if (closestIndex === activeIndex) return;

  if (activeIndex !== -1) {
    tileElements[activeIndex].classList.remove("is-active");
  }
  tileElements[closestIndex].classList.add("is-active");
  activeIndex = closestIndex;

  // Broadcast the change instead of handling skill-archive logic
  // right here. Anything that cares — the skill archive next, later
  // the achievement-expand behavior — just listens for this event.
  // This scroll-tracking code never needs to know those features exist.
  document.dispatchEvent(new CustomEvent("timeline:activechange", {
    detail: { index: activeIndex, entry: renderQueue[activeIndex] }
  }));
}

// Temporary — proves the event is firing correctly. We'll remove this
// once the skill archive (Step 5) becomes the real listener.
document.addEventListener("timeline:activechange", (e) => {
  const { index, entry } = e.detail;
  console.log("Active tile changed to:", index, entry.type, entry.id || "");
});

// ============================================================
// DEBUG PANEL
// Only ever created if ?debug=true is in the URL — for every other
// visitor, this code exits immediately and nothing is added to the
// page at all. Rather than instrumenting existing functions directly,
// this listens to events the site already broadcasts (plus a few
// small ones added alongside it above), extending the same
// event-driven pattern the rest of the site is built on.
// ============================================================

function setupDebugPanel() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("debug") !== "true") return;

  const panel = document.createElement("div");
  panel.id = "debug-panel";
  panel.innerHTML = `
    <div id="debug-summary">
      <div><strong>Active:</strong> <span id="debug-active">—</span></div>
      <div><strong>Expanded:</strong> <span id="debug-expanded">none</span></div>
      <div><strong>Resume overlay:</strong> <span id="debug-overlay">closed</span></div>
      <div><strong>Skills:</strong> <span id="debug-skills">none</span></div>
    </div>
    <div id="debug-log"></div>
  `;
  // Appended directly to <body>, outside #stage — so it's completely
  // unaffected by #stage.inert when the resume overlay opens.
  document.body.appendChild(panel);

  const logEntry = (message) => {
    const time = new Date().toLocaleTimeString();
    const line = document.createElement("div");
    line.textContent = `${time} — ${message}`;
    document.getElementById("debug-log").prepend(line); // newest on top
  };

  document.addEventListener("timeline:activechange", (e) => {
    const { index, entry } = e.detail;
    const label = `#${index} ${entry.type}${entry.id ? ` (${entry.id})` : ""}`;
    document.getElementById("debug-active").textContent = label;
    document.getElementById("debug-overlay").textContent =
      entry.type === "outro" ? "open" : "closed";
    logEntry(`Active tile → ${label}`);
  });

  document.addEventListener("tile:expandchange", (e) => {
    const { id, expanded } = e.detail;
    document.getElementById("debug-expanded").textContent = expanded ? id : "none";
    logEntry(`Tile ${expanded ? "expanded" : "collapsed"}: ${id}`);
  });

  // Deliberately recomputes from scratch via computeSkillLevels rather
  // than reading the shared skillLevels variable directly — that
  // variable isn't reassigned until AFTER these events fire (see
  // updateSkillArchive), so reading it here would show stale data one
  // step behind. Recomputing directly from activeIndex sidesteps that
  // ordering issue entirely — same "derive, don't track" principle
  // the skill archive itself is built on.
  const refreshSkillsSummary = () => {
    const levels = computeSkillLevels(activeIndex);
    const summary = Array.from(levels.entries())
      .map(([name, level]) => `${name}×${level}`)
      .join(", ") || "none";
    document.getElementById("debug-skills").textContent = summary;
  };

  document.addEventListener("skill:added", (e) => {
    refreshSkillsSummary();
    logEntry(`Skill added: ${e.detail.name} (×${e.detail.level})`);
  });
  document.addEventListener("skill:upgraded", (e) => {
    refreshSkillsSummary();
    logEntry(`Skill upgraded: ${e.detail.name} → ×${e.detail.level}`);
  });
  document.addEventListener("skill:removed", (e) => {
    refreshSkillsSummary();
    logEntry(`Skill removed: ${e.detail.name}`);
  });

  document.addEventListener("lead:submitted", (e) => {
    logEntry(`Lead captured: ${e.detail.email} / ${e.detail.company}`);
  });
  document.addEventListener("resume:downloadclicked", () => {
    logEntry("Download PDF clicked");
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

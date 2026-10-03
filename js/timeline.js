// ============================================================
// TIMELINE ENGINE  —  js/timeline.js
// ------------------------------------------------------------
// Owns everything about HOW the career data is laid out and
// navigated in time. It deliberately knows nothing about skills,
// resumes, or APIs: it renders, tracks the "playhead," and
// broadcasts events. main.js (and anything else) just listens —
// the same observer pattern the site has used since Step 4, which
// is exactly why the whole visual model could be rebuilt without
// touching the resume pipeline at all.
//
// THE VISUAL MODEL
//   • The central axis is drawn to TIME SCALE: a four-year role takes
//     roughly twice the horizontal space of a two-year role.
//   • A fixed "playhead" sits at one screen position. Whatever date is
//     under it is "now" in the story; the chip on the axis shows it.
//   • Each period's card is position: sticky inside a wrapper exactly
//     as wide as that period, so the browser itself keeps the card at
//     the playhead for the whole period, then lets the next card bump
//     it out. No per-frame positioning math, so it never lags behind
//     the scroll.
//   • Education with only a graduation year is a "station" sitting ON
//     the line (part of the core journey). Education with a start date
//     renders as a full period, exactly like an Experience.
//   • Points branch off BELOW the line on leader lines and appear only
//     once the playhead reaches them — explorable extras, visually
//     separate from the central professional thread.
//
// EVENTS DISPATCHED (on document)
//   timeline:zonechange    { zone: "landing" | "timeline" | "outro" }
//   timeline:activechange  { activeIds, primaryId }
//   timeline:reachedchange { reachedIds }  — everything the playhead has passed
//   timeline:ready         { journey, stations, points, lanes } — counts
//   card:expandchange      { id, kind, expanded }
// ============================================================

const Timeline = (() => {
  // ---------- Tunables ----------
  // Gaps between roles longer than this get visually compressed (with a
  // break mark on the axis) so a multi-year gap doesn't become a long,
  // empty stretch to scroll through.
  const GAP_MAX_MONTHS = 18;
  const GAP_COMPRESSED_MONTHS = 9;
  // Resumes routinely list "... – Jun 2021" followed by "Jun 2021 – ...".
  // A one-month overlap like that is a hand-off, not two concurrent jobs.
  const SAME_MONTH_TOLERANCE = 1;
  // Points reveal just as the playhead reaches them.
  const REVEAL_LEAD_PX = 8;
  // Accent colors assigned to periods in chronological order. Any entry
  // can override its color with an optional `color` field in data.js.
  const PALETTE = ["#2F6FDE", "#0F9D8A", "#D07A1F", "#7B57D1", "#D14D6A", "#3C8F47", "#2A8BB8", "#B07A16"];
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const CHEVRON = `<svg class="toggle-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const CAP_ICON = `<svg class="station-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 1.5 9 12 14l8.5-4.05V16H22V9L12 4Z" fill="currentColor"/><path d="M5.5 11.6V15c0 1.7 2.9 3.5 6.5 3.5s6.5-1.8 6.5-3.5v-3.4L12 14.7l-6.5-3.1Z" fill="currentColor" opacity=".55"/></svg>`;

  // ---------- State ----------
  const el = {};
  let metrics = null;          // viewport-derived sizes (recomputed on resize)
  let model = null;            // curated items + their computed geometry
  let zone = "landing";
  let activeIds = [];          // periods currently under the playhead
  let reachedIds = [];         // everything the playhead has passed so far
  let expanded = null;         // the single expanded item, or null
  let pendingExpandId = null;  // a card waiting for the playhead to arrive
  let lastChipLabel = "";
  let frameQueued = false;
  let reducedMotion = false;
  let relayoutTimer = null;
  let announceTimer = null;
  const announcements = new Map();
  const smooth = { target: null, raf: 0 };

  // ---------- Small helpers ----------
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const dispatch = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));
  const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const attr = (str) => String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

  // Dates become a single "month index" (year * 12 + month) so the whole
  // timeline can do plain arithmetic on time.
  function monthIndex(str) {
    const [y, m] = String(str).split("-").map(Number);
    return y * 12 + ((m || 1) - 1);
  }
  function currentMonthIndex() {
    const d = new Date();
    return d.getFullYear() * 12 + d.getMonth();
  }
  function formatMonthIndex(idx) {
    const i = Math.floor(idx);
    return `${MONTH_NAMES[((i % 12) + 12) % 12]} ${Math.floor(i / 12)}`;
  }
  function formatDate(str) {
    if (!str) return "";
    if (str === "present") return "Present";
    const [y, m] = String(str).split("-").map(Number);
    return m ? `${MONTH_NAMES[m - 1]} ${y}` : String(y);
  }

  // Wraps the first occurrence of each anchorText in `text` with a
  // hoverable span (the Detail popup trigger). Using the plain-string
  // form of .replace() (not a regex) means only the FIRST match gets
  // wrapped and special characters in anchorText need no escaping.
  // tabindex + role="button" make it keyboard-reachable; the popup
  // behavior itself lives in main.js.
  function linkifyDetails(text, detailsList) {
    if (!text) return "";
    if (!detailsList || detailsList.length === 0) return text;
    let result = text;
    detailsList.forEach(({ anchorText, detailId }) => {
      result = result.replace(
        anchorText,
        `<span class="detail-anchor" tabindex="0" role="button" aria-describedby="detail-popup" data-detail-id="${attr(detailId)}">${anchorText}</span>`
      );
    });
    return result;
  }

  // ============================================================
  // MODEL — turn curated data into timeline items
  // ============================================================

  // Three kinds of things live on the timeline:
  //   journey  — periods (every Experience, plus Education with a start date)
  //   stations — Education with only a graduation year: a moment ON the line
  //   points   — curated optional extras, branching below the line
  function buildModel(curation, sources) {
    const included = new Set(curation.includedIds || []);
    const now = currentMonthIndex();
    const journey = [];
    const stations = [];
    const points = [];

    (sources.timeline || []).forEach((entry) => {
      if (!included.has(entry.id)) return;
      if (entry.type === "experience" && entry.dates && entry.dates.start) {
        const startIdx = monthIndex(entry.dates.start);
        const present = entry.dates.end === "present";
        // End dates are inclusive on a resume ("– Mar 2020" means through
        // March), so the period's exclusive end is the following month.
        const endIdx = present ? now + 1 : monthIndex(entry.dates.end) + 1;
        journey.push({
          id: entry.id, kind: "experience", entry, startIdx,
          endIdx: Math.max(endIdx, startIdx + 1), present,
          concurrent: Boolean(entry.concurrent)
        });
      } else if (entry.type === "point") {
        if (!entry.date) {
          console.warn(`Timeline: point "${entry.id}" has no date, so it can't be placed.`);
          return;
        }
        points.push({ id: entry.id, kind: "point", entry, idx: monthIndex(entry.date) + 0.5 });
      }
    });

    (sources.education || []).forEach((entry) => {
      if (entry.start) {
        const startIdx = monthIndex(entry.start);
        const endIdx = monthIndex(entry.end || `${entry.year}-06`) + 1;
        journey.push({
          id: entry.id, kind: "education", entry, startIdx,
          endIdx: Math.max(endIdx, startIdx + 1), present: false,
          // Education overlapping a job yields the main lane to the job.
          concurrent: entry.concurrent === undefined ? true : Boolean(entry.concurrent)
        });
      } else if (entry.year || entry.date) {
        stations.push({
          id: entry.id, kind: "station", entry,
          idx: monthIndex(entry.date || `${entry.year}-06`) + 0.5
        });
      }
    });

    const laneCount = assignLanes(journey);
    journey.sort((a, b) => a.startIdx - b.startIdx || a.lane - b.lane);
    journey.forEach((j, i) => { j.color = j.entry.color || PALETTE[i % PALETTE.length]; });
    journey.forEach((j) => {
      j.hasConcurrent = journey.some(
        (o) => o !== j && o.lane !== j.lane && o.startIdx < j.effEndIdx && o.effEndIdx > j.startIdx
      );
    });

    const marks = [];
    journey.forEach((j) => marks.push(j.startIdx, j.effEndIdx));
    points.forEach((p) => marks.push(p.idx));
    stations.forEach((s) => marks.push(s.idx));
    const startIdx = marks.length ? Math.floor(Math.min(...marks)) : now - 12;
    // The axis always runs up to today, so the current role ends at "now"
    // and is naturally the last thing on the line.
    const endIdx = Math.max(now + 1, marks.length ? Math.ceil(Math.max(...marks)) : now + 1);

    const byId = new Map();
    [...journey, ...stations, ...points].forEach((item) => byId.set(item.id, item));
    return { journey, stations, points, laneCount, startIdx, endIdx, nowIdx: now, byId };
  }

  // Overlapping periods can't share a row of sticky cards, so each
  // period gets a "lane" — the classic interval-partitioning approach:
  // walk periods in start order and drop each into the first lane where
  // it doesn't collide with anything. Lane 0 is the main career thread.
  // Entries flagged `concurrent: true` are placed after the others, so
  // they only take the main lane when it's genuinely free.
  function assignLanes(items) {
    const order = [...items].sort(
      (a, b) => (a.concurrent - b.concurrent) || (a.startIdx - b.startIdx) || (b.endIdx - a.endIdx)
    );
    const lanes = [];
    order.forEach((it) => {
      let lane = lanes.findIndex((members) => members.every(
        (o) => it.startIdx >= o.endIdx - SAME_MONTH_TOLERANCE || it.endIdx <= o.startIdx + SAME_MONTH_TOLERANCE
      ));
      if (lane === -1) {
        lane = lanes.length;
        lanes.push([]);
      }
      lanes[lane].push(it);
      it.lane = lane;
    });
    // Trim tolerated hand-off overlaps so neighbors in a lane meet exactly
    // instead of overlapping by a month (which would make cards collide).
    lanes.forEach((members) => {
      members.sort((a, b) => a.startIdx - b.startIdx);
      members.forEach((it, i) => {
        const next = members[i + 1];
        it.effEndIdx = next && it.endIdx > next.startIdx
          ? Math.max(it.startIdx + 0.5, next.startIdx)
          : it.endIdx;
      });
    });
    return Math.max(1, lanes.length);
  }

  // ============================================================
  // SCALE — map time to horizontal pixels
  // ============================================================

  // Purely proportional scaling breaks in two situations: a 3-month role
  // would be narrower than its own card (so the card couldn't stick), and
  // a multi-year gap would be a huge empty stretch. So the scale is
  // "elastic": time is cut into segments at every start/end/point, each
  // segment starts proportional to its length, then (1) long uncovered
  // gaps are compressed and (2) any period too narrow for its card gets
  // its own segments stretched. The axis stays monotonic and every
  // label stays truthful — it's just locally stretched or squeezed.
  function buildScale(mdl, m) {
    const ppm = m.pxPerMonth;
    const breakpoints = new Set([mdl.startIdx, mdl.endIdx]);
    mdl.journey.forEach((j) => { breakpoints.add(j.startIdx); breakpoints.add(j.effEndIdx); });
    mdl.points.forEach((p) => breakpoints.add(p.idx));
    mdl.stations.forEach((s) => breakpoints.add(s.idx));
    const bps = [...breakpoints]
      .filter((v) => v >= mdl.startIdx && v <= mdl.endIdx)
      .sort((a, b) => a - b);

    const segs = [];
    for (let i = 0; i < bps.length - 1; i++) {
      const from = bps[i];
      const to = bps[i + 1];
      segs.push({
        from, to,
        w: (to - from) * ppm,
        covered: mdl.journey.some((j) => j.startIdx < to && j.effEndIdx > from),
        compressed: false
      });
    }

    // (1) Compress long runs of time that no period covers.
    const breaks = [];
    for (let i = 0; i < segs.length;) {
      if (segs[i].covered) { i++; continue; }
      let j = i;
      let months = 0;
      while (j < segs.length && !segs[j].covered) { months += segs[j].to - segs[j].from; j++; }
      if (months > GAP_MAX_MONTHS) {
        const factor = GAP_COMPRESSED_MONTHS / months;
        for (let k = i; k < j; k++) { segs[k].w *= factor; segs[k].compressed = true; }
        breaks.push({ from: segs[i].from, to: segs[j - 1].to, months });
      }
      i = j;
    }

    // (2) Stretch any period narrower than its card needs. Periods can
    // share segments, so a few passes let the widths settle.
    for (let pass = 0; pass < 4; pass++) {
      let changed = false;
      mdl.journey.forEach((j) => {
        const inside = segs.filter((s) => s.from >= j.startIdx - 1e-9 && s.to <= j.effEndIdx + 1e-9);
        const width = inside.reduce((sum, s) => sum + s.w, 0);
        if (width > 0 && width < m.minItemW - 0.5) {
          const factor = m.minItemW / width;
          inside.forEach((s) => { s.w *= factor; });
          changed = true;
        }
      });
      if (!changed) break;
    }

    let x = m.leadIn;
    segs.forEach((s) => { s.x = x; x += s.w; });
    const spanStartX = m.leadIn;
    const spanEndX = x;

    function toX(idx) {
      if (!segs.length) return spanStartX + (idx - mdl.startIdx) * ppm;
      const first = segs[0];
      const last = segs[segs.length - 1];
      if (idx <= first.from) return first.x - (first.from - idx) * ppm;
      if (idx >= last.to) return last.x + last.w + (idx - last.to) * ppm;
      let lo = 0;
      let hi = segs.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (segs[mid].from <= idx) lo = mid; else hi = mid - 1;
      }
      const s = segs[lo];
      return s.x + ((idx - s.from) / (s.to - s.from)) * s.w;
    }

    function toIdx(px) {
      if (!segs.length) return mdl.startIdx + (px - spanStartX) / ppm;
      const first = segs[0];
      const last = segs[segs.length - 1];
      if (px <= first.x) return first.from - (first.x - px) / ppm;
      if (px >= last.x + last.w) return last.to + (px - last.x - last.w) / ppm;
      let lo = 0;
      let hi = segs.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (segs[mid].x <= px) lo = mid; else hi = mid - 1;
      }
      const s = segs[lo];
      return s.from + ((px - s.x) / s.w) * (s.to - s.from);
    }

    return { segs, breaks, spanStartX, spanEndX, width: spanEndX + m.tail, toX, toIdx };
  }

  // ============================================================
  // METRICS & LAYOUT
  // ============================================================

  // Every size is derived from the viewport, so phones, laptops, and
  // big monitors each get a layout that fits rather than a scaled-down
  // desktop. Recomputed on every resize.
  function deriveMetrics(vw, th) {
    const narrow = vw < 640;
    const cardW = narrow ? Math.max(240, Math.min(420, vw - 32)) : clamp(Math.round(vw * 0.27), 300, 380);
    const playheadX = narrow ? 16 : clamp(Math.round(vw * 0.28), 32, Math.max(32, vw - cardW - 48));
    return {
      vw, th, narrow, cardW, playheadX,
      pxPerMonth: narrow ? 30 : clamp(vw / 20, 40, 72),
      minItemW: cardW + Math.max(96, Math.round(cardW * 0.35)),
      leadIn: playheadX + (narrow ? 40 : 72),
      tail: Math.round(cardW * 0.5) + 56,
      laneGap: 16,
      pointCardW: narrow ? 200 : 232,
      pointCardH: 76,
      tierGap: 12,
      stemBase: 30,
      axisGap: 46,
      laneTopMin: narrow ? 58 : 66,
      expandTop: narrow ? 58 : 60,
      minLaneH: narrow ? 210 : 230,
      maxLaneH: 440,
      compactH: 124
    };
  }

  // Points that sit close together in time would overlap, so their
  // cards are stacked into "tiers" (longer leader lines) as needed.
  function assignPointTiers(mdl, m, scale, maxTiers) {
    const lastRight = [];
    const pts = [...mdl.points].sort((a, b) => a.idx - b.idx);
    pts.forEach((p) => {
      p.x = scale.toX(p.idx);
      let left = Math.max(p.x - m.pointCardW / 2, Math.min(8, p.x - 18));
      let tier = -1;
      for (let t = 0; t < maxTiers; t++) {
        if (lastRight[t] === undefined || left >= lastRight[t] + 12) { tier = t; break; }
      }
      if (tier === -1) {
        // Every tier is busy nearby: take whichever frees up first and
        // nudge the card right, keeping its dot within the card's span.
        let best = 0;
        for (let t = 1; t < maxTiers; t++) if (lastRight[t] < lastRight[best]) best = t;
        tier = best;
        left = Math.min(Math.max(left, lastRight[tier] + 12), p.x - 18);
      }
      p.tier = tier;
      p.cardOffset = Math.round(left - p.x);
      lastRight[tier] = left + m.pointCardW;
    });
    return pts.length ? Math.max(...pts.map((p) => p.tier)) + 1 : 0;
  }

  function tierCap(m) {
    const room = m.th - (m.laneTopMin + m.minLaneH + m.axisGap) - m.stemBase - m.pointCardH - 16;
    return clamp(Math.floor(room / (m.pointCardH + m.tierGap)) + 1, 1, m.narrow ? 2 : 3);
  }

  // Vertical budget, top to bottom: card lane → playhead stem → axis →
  // points band. Extra height on tall screens is split above and below
  // so the composition stays centered instead of clinging to the top.
  function computeVertical(m, tiersUsed) {
    const pointsBandH = tiersUsed > 0
      ? m.stemBase + (tiersUsed - 1) * (m.pointCardH + m.tierGap) + m.pointCardH + 16
      : 64;
    const laneH = clamp(m.th - m.laneTopMin - m.axisGap - pointsBandH, m.minLaneH, m.maxLaneH);
    const used = m.laneTopMin + laneH + m.axisGap + pointsBandH;
    const laneTop = m.laneTopMin + Math.round(Math.max(0, m.th - used) * 0.42);
    const laneBottom = laneTop + laneH;
    return { laneTop, laneH, laneBottom, axisY: laneBottom + m.axisGap, pointsBandH };
  }

  function layout() {
    metrics = deriveMetrics(el.track.clientWidth, el.track.clientHeight);
    const m = metrics;
    const vars = el.frame.style;
    vars.setProperty("--playhead-x", `${m.playheadX}px`);
    vars.setProperty("--card-w", `${m.cardW}px`);
    vars.setProperty("--point-card-w", `${m.pointCardW}px`);
    vars.setProperty("--expand-top", `${m.expandTop}px`);
    vars.setProperty("--compact-h", `${m.compactH}px`);
    vars.setProperty("--track-h", `${m.th}px`);
    el.frame.classList.toggle("is-narrow", m.narrow);
    el.landing.style.width = `${m.vw}px`;

    // Before curation, the track holds ONLY the landing panel — with
    // nothing beyond it to scroll to, the intake gate needs no special
    // "lock the scrollbar" code at all.
    if (!model) {
      el.content.style.width = `${m.vw}px`;
      return;
    }

    el.timeline.hidden = false;
    el.outro.hidden = false;
    const scale = buildScale(model, m);
    model.scale = scale;
    model.timelineLeft = m.vw;
    model.outroLeft = m.vw + scale.width;
    el.content.style.width = `${model.outroLeft + m.vw}px`;
    el.timeline.style.left = `${model.timelineLeft}px`;
    el.timeline.style.width = `${scale.width}px`;
    el.outro.style.left = `${model.outroLeft}px`;
    el.outro.style.width = `${m.vw}px`;

    const tiersUsed = assignPointTiers(model, m, scale, tierCap(m));
    const v = computeVertical(m, tiersUsed);
    model.v = v;
    vars.setProperty("--lane-top", `${v.laneTop}px`);
    vars.setProperty("--lane-h", `${v.laneH}px`);
    vars.setProperty("--lane-bottom", `${v.laneBottom}px`);
    vars.setProperty("--axis-y", `${v.axisY}px`);

    // Concurrent lanes sit side by side when there's room, and stack
    // (secondary cards compact, at the top of the lane area) when not.
    const lanes = model.laneCount;
    model.wideLanes = lanes <= 1 || m.playheadX + lanes * m.cardW + (lanes - 1) * m.laneGap + 24 <= m.vw;

    model.journey.forEach((j) => {
      j.x0 = model.timelineLeft + scale.toX(j.startIdx);
      j.x1 = model.timelineLeft + scale.toX(j.effEndIdx);
      // A side-by-side lane shifts BOTH the wrapper and the sticky
      // offset by the same amount, so its card starts and stops
      // sticking at exactly the same moments as the main lane's would.
      j.dx = model.wideLanes ? j.lane * (m.cardW + m.laneGap) : 0;
      const localLeft = j.x0 - model.timelineLeft;
      j.wrapEl.style.left = `${localLeft + j.dx}px`;
      j.wrapEl.style.width = `${Math.max(m.cardW, j.x1 - j.x0)}px`;
      j.cardEl.style.left = `${m.playheadX + j.dx}px`;
      j.wrapEl.classList.toggle("is-stacked-secondary", !model.wideLanes && j.lane > 0);
      // The main lane renders above secondary lanes, so a concurrent card
      // that slides left as its period ends tucks BEHIND the main card
      // instead of painting over it.
      j.wrapEl.classList.toggle("is-secondary-lane", j.lane > 0);
      if (!model.wideLanes && j.lane === 0 && j.hasConcurrent) {
        j.cardEl.style.setProperty("--card-max", `${Math.max(140, v.laneH - m.compactH - 14)}px`);
      } else {
        j.cardEl.style.removeProperty("--card-max");
      }
      j.segEl.style.left = `${localLeft}px`;
      j.segEl.style.width = `${Math.max(4, j.x1 - j.x0)}px`;
      j.segEl.style.setProperty("--lane", j.lane);
      j.lastOpacity = null;
    });

    el.axisLine.style.width = `${scale.spanEndX}px`;
    el.axisNow.style.left = `${scale.toX(model.endIdx)}px`;
    renderTicks(m, scale);
    positionStations(scale);
    positionPoints(m, v);
  }

  function renderTicks(m, scale) {
    const parts = [];
    const inBreak = (idx) => scale.breaks.some((b) => idx > b.from && idx < b.to);
    const firstYear = Math.floor(model.startIdx / 12);
    const lastYear = Math.floor(model.endIdx / 12);
    let lastLabelX = -Infinity;

    // If the story starts mid-year, label the starting month too.
    if (model.startIdx % 12 !== 0) {
      const x = scale.toX(model.startIdx);
      parts.push(`<span class="axis-label is-start" style="left:${x.toFixed(1)}px">${formatMonthIndex(model.startIdx)}</span>`);
      lastLabelX = x + 30;
    }

    for (let y = firstYear; y <= lastYear; y++) {
      for (let mo = 0; mo < 12; mo += 3) {
        const idx = y * 12 + mo;
        if (idx <= model.startIdx || idx > model.endIdx || inBreak(idx)) continue;
        const x = scale.toX(idx);
        if (mo === 0) {
          parts.push(`<span class="axis-tick is-major" style="left:${x.toFixed(1)}px"></span>`);
          if (x - lastLabelX >= 52) {
            parts.push(`<span class="axis-label" style="left:${x.toFixed(1)}px">${y}</span>`);
            lastLabelX = x;
          }
        } else if (m.pxPerMonth >= 34) {
          parts.push(`<span class="axis-tick" style="left:${x.toFixed(1)}px"></span>`);
        }
      }
    }

    scale.breaks.forEach((b) => {
      const x = (scale.toX(b.from) + scale.toX(b.to)) / 2;
      const years = Math.round((b.months / 12) * 10) / 10;
      parts.push(`<span class="axis-break" style="left:${x.toFixed(1)}px" title="${years} years shown compressed"></span>`);
    });

    el.ticks.innerHTML = parts.join("");
  }

  function positionStations(scale) {
    // Two stations close together would collide on the line, so the
    // second one is raised slightly above it.
    let rowRight = -Infinity;
    [...model.stations].sort((a, b) => a.idx - b.idx).forEach((s) => {
      s.x = scale.toX(s.idx);
      s.el.style.left = `${s.x}px`;
      const half = (s.pillEl.offsetWidth || 180) / 2;
      const raised = s.x - half < rowRight + 10;
      s.el.classList.toggle("is-raised", raised);
      if (!raised) rowRight = s.x + half;
    });
  }

  function positionPoints(m, v) {
    model.points.forEach((p) => {
      const stem = m.stemBase + p.tier * (m.pointCardH + m.tierGap);
      p.el.style.left = `${p.x}px`;
      p.el.style.setProperty("--stem", `${stem}px`);
      p.el.style.setProperty("--card-offset", `${p.cardOffset}px`);
      p.el.style.setProperty("--point-max", `${Math.max(120, m.th - v.axisY - stem - 12)}px`);
    });
  }

  // ============================================================
  // RENDERING — built once per curation; layout() only repositions
  // ============================================================

  function journeyCardHtml(j) {
    const e = j.entry;
    const isEdu = j.kind === "education";
    const title = isEdu ? e.degree : e.jobTitle;
    const org = isEdu ? e.institution : e.employer;
    const dates = isEdu
      ? `${formatDate(e.start)} – ${formatDate(e.end || String(e.year))}`
      : `${formatDate(e.dates.start)} – ${formatDate(e.dates.end)}`;
    const meta = [dates, e.location].filter(Boolean).join(" · ");
    const items = (isEdu ? e.bullets : e.achievements) || [];
    const eyebrow = isEdu ? "Education" : j.lane > 0 ? "Concurrent role" : j.present ? "Current role" : "Experience";
    const id = attr(e.id);
    const listId = `card-list-${id}`;
    const closedLabel = isEdu ? "View details" : "View achievements";
    const openLabel = isEdu ? "Hide details" : "Hide achievements";
    return `
      <article class="journey-card${isEdu ? " is-education" : ""}" data-entry-id="${id}" aria-labelledby="card-title-${id}">
        <div class="card-head">
          <p class="card-eyebrow">${eyebrow}</p>
          <h3 class="card-title" id="card-title-${id}">${title}</h3>
          <p class="card-org">${org}</p>
          <p class="card-meta">${meta}</p>
        </div>
        <div class="card-body">
          ${e.overview ? `<p class="card-overview">${linkifyDetails(e.overview, e.details)}</p>` : ""}
          ${items.length ? `<ul class="card-list" id="${listId}" data-expand-region aria-hidden="true" inert>${items.map((a) => `<li>${linkifyDetails(a, e.details)}</li>`).join("")}</ul>` : ""}
        </div>
        ${items.length ? `<button class="card-toggle" type="button" aria-expanded="false" aria-controls="${listId}" data-label-closed="${closedLabel}" data-label-open="${openLabel}"><span class="toggle-label">${closedLabel}</span>${CHEVRON}</button>` : ""}
      </article>`;
  }

  function stationHtml(s) {
    const e = s.entry;
    const id = attr(e.id);
    const bullets = e.bullets || [];
    return `
      <button class="station-pill" type="button" aria-expanded="false" aria-controls="station-card-${id}" title="${attr(`${e.degree} — ${e.institution}`)}">
        ${CAP_ICON}<span class="station-label">${e.degree}</span><span class="station-year">${e.year || ""}</span>
      </button>
      <div class="station-card" id="station-card-${id}" data-expand-region aria-hidden="true" inert>
        <p class="card-eyebrow">Education</p>
        <h3 class="station-title">${e.degree}</h3>
        <p class="card-org">${e.institution}</p>
        <p class="card-meta">${[e.location, e.year].filter(Boolean).join(" · ")}</p>
        ${bullets.length ? `<ul class="station-list">${bullets.map((b) => `<li>${linkifyDetails(b, e.details)}</li>`).join("")}</ul>` : ""}
      </div>`;
  }

  function pointHtml(p) {
    const e = p.entry;
    const id = attr(e.id);
    // `bodyText` fallback keeps any older single-paragraph Points working.
    const bullets = e.bullets || (e.bodyText ? [e.bodyText] : []);
    const listId = `point-list-${id}`;
    // The date is deliberately NOT displayed — it only positions the Point.
    return `
      <span class="point-dot" aria-hidden="true"></span>
      <span class="point-stem" aria-hidden="true"></span>
      <article class="point-card" aria-labelledby="point-title-${id}">
        <h3 class="point-title" id="point-title-${id}">${e.header}</h3>
        ${bullets.length ? `
          <ul class="card-list point-list" id="${listId}" data-expand-region aria-hidden="true" inert>${bullets.map((b) => `<li>${linkifyDetails(b, e.details)}</li>`).join("")}</ul>
          <button class="card-toggle" type="button" aria-expanded="false" aria-controls="${listId}" data-label-closed="Explore" data-label-open="Close"><span class="toggle-label">Explore</span>${CHEVRON}</button>` : ""}
      </article>`;
  }

  function buildTimelineDom() {
    el.timeline.innerHTML = "";

    const axis = document.createElement("div");
    axis.className = "axis";
    axis.setAttribute("aria-hidden", "true");
    axis.innerHTML = `
      <div class="axis-line"></div>
      <div class="axis-segments"></div>
      <div class="axis-ticks"></div>
      <div class="axis-now"><span class="axis-now-dot"></span><span class="axis-now-label">Today</span></div>`;
    el.timeline.appendChild(axis);
    el.axis = axis;
    el.axisLine = axis.querySelector(".axis-line");
    el.ticks = axis.querySelector(".axis-ticks");
    el.axisNow = axis.querySelector(".axis-now");
    const segments = axis.querySelector(".axis-segments");

    model.journey.forEach((j) => {
      const seg = document.createElement("div");
      seg.className = [
        "axis-seg",
        j.lane > 0 ? "is-secondary" : "",
        j.kind === "education" ? "is-education" : "",
        j.present ? "is-present" : ""
      ].filter(Boolean).join(" ");
      seg.style.setProperty("--accent", j.color);
      segments.appendChild(seg);
      j.segEl = seg;
    });

    // Elements are appended in chronological order so screen readers
    // and Tab order move through the story in the same order a sighted
    // visitor scrolls through it, regardless of absolute positioning.
    const ordered = [
      ...model.journey.map((item) => ({ at: item.startIdx, item })),
      ...model.stations.map((item) => ({ at: item.idx, item })),
      ...model.points.map((item) => ({ at: item.idx, item }))
    ].sort((a, b) => a.at - b.at);

    ordered.forEach(({ item }) => {
      if (item.kind === "experience" || item.kind === "education") {
        const wrap = document.createElement("div");
        wrap.className = "journey-item";
        wrap.innerHTML = journeyCardHtml(item);
        item.wrapEl = wrap;
        item.cardEl = wrap.firstElementChild;
        item.cardEl.style.setProperty("--accent", item.color);
        el.timeline.appendChild(wrap);
      } else {
        const node = document.createElement("div");
        node.className = item.kind === "station" ? "station" : "point";
        node.dataset.entryId = item.id;
        node.innerHTML = item.kind === "station" ? stationHtml(item) : pointHtml(item);
        item.el = node;
        if (item.kind === "station") item.pillEl = node.querySelector(".station-pill");
        el.timeline.appendChild(node);
      }
    });
  }

  // ============================================================
  // THE PLAYHEAD — runs once per animation frame while scrolling
  // ============================================================

  function requestFrame() {
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(update);
  }

  function update() {
    frameQueued = false;
    if (!metrics) return;
    const m = metrics;
    const scrollLeft = el.track.scrollLeft;
    const playhead = scrollLeft + m.playheadX; // the playhead's position in content coordinates

    const nextZone = !model ? "landing"
      : playhead < model.timelineLeft ? "landing"
        : playhead >= model.outroLeft ? "outro"
          : "timeline";
    if (nextZone !== zone) {
      zone = nextZone;
      el.hud.classList.toggle("is-visible", zone === "timeline");
      if (zone !== "timeline" && expanded) collapse();
      dispatch("timeline:zonechange", { zone });
    }
    if (!model || !model.scale) return;
    const scale = model.scale;

    // Progress bar + date chip
    const startScroll = model.timelineLeft + scale.spanStartX - m.playheadX;
    const endScroll = model.outroLeft - m.playheadX;
    const progress = clamp((scrollLeft - startScroll) / Math.max(1, endScroll - startScroll), 0, 1);
    el.progress.style.transform = `scaleX(${progress.toFixed(4)})`;
    const idx = clamp(scale.toIdx(playhead - model.timelineLeft), model.startIdx, model.endIdx - 0.001);
    const label = formatMonthIndex(idx);
    if (label !== lastChipLabel) {
      el.chip.textContent = label;
      lastChipLabel = label;
    }

    // Which periods are under the playhead, and what has it passed?
    // Recomputed from scratch every frame (the same "derive, don't
    // track" principle as the skill archive), so scrolling backward is
    // automatically just as correct as scrolling forward.
    const nextActive = [];
    const nextReached = [];
    model.journey.forEach((j) => {
      if (playhead >= j.x0) {
        nextReached.push(j.id);
        if (playhead < j.x1) nextActive.push(j.id);
      }
    });
    model.stations.forEach((s) => {
      const passed = playhead >= model.timelineLeft + s.x;
      if (passed !== s.passed) {
        s.passed = passed;
        s.el.classList.toggle("is-passed", passed);
      }
      if (passed) nextReached.push(s.id);
    });
    model.points.forEach((p) => {
      const revealed = playhead >= model.timelineLeft + p.x - REVEAL_LEAD_PX;
      if (revealed !== p.revealed) {
        p.revealed = revealed;
        p.el.classList.toggle("is-revealed", revealed);
      }
      if (revealed) nextReached.push(p.id);
    });
    if (!sameList(nextActive, activeIds)) {
      activeIds = nextActive;
      onActiveChange();
    }
    if (!sameList(nextReached, reachedIds)) {
      reachedIds = nextReached;
      dispatch("timeline:reachedchange", { reachedIds: [...reachedIds] });
    }

    // Card opacity: upcoming cards ease in as they approach the
    // playhead; a card being bumped out fades to a faint "history"
    // trail. Written to a CSS variable so it multiplies with the
    // separate focus-dimming when another card is expanded.
    model.journey.forEach((j) => {
      const stick = m.playheadX + j.dx;
      const natural = j.x0 + j.dx - scrollLeft;
      const end = j.x1 + j.dx - scrollLeft;
      const left = Math.min(Math.max(natural, stick), end - m.cardW);
      let opacity = 1;
      if (natural > stick) {
        opacity = 0.5 + 0.5 * clamp(1 - (natural - stick) / (m.cardW * 1.25), 0, 1);
      } else if (left < stick) {
        // Main-lane cards leave a faint "history" trail. A side-by-side
        // secondary card would slide into the main lane's column, so it
        // fades out completely instead.
        opacity = j.lane > 0 && model.wideLanes
          ? Math.max(0, 1 - (stick - left) / (m.cardW * 0.45))
          : Math.max(0.2, 1 - ((stick - left) / m.cardW) * 0.8);
      }
      opacity = Math.round(opacity * 100) / 100;
      if (opacity !== j.lastOpacity) {
        j.lastOpacity = opacity;
        j.cardEl.style.setProperty("--scroll-opacity", opacity);
        j.cardEl.classList.toggle("is-gone", opacity < 0.05);
      }
    });

    // An expanded Point or station closes once it scrolls out of view.
    if (expanded && (expanded.item.kind === "point" || expanded.item.kind === "station")) {
      const sx = model.timelineLeft + expanded.item.x - scrollLeft;
      if (sx < -60 || sx > m.vw + 60) collapse();
    }
  }

  function onActiveChange() {
    model.journey.forEach((j) => j.cardEl.classList.toggle("is-active", activeIds.includes(j.id)));
    // Autoclose: an expanded period card collapses once the playhead
    // leaves its period — the same rule as the original tile design.
    if (expanded && (expanded.item.kind === "experience" || expanded.item.kind === "education")
      && !activeIds.includes(expanded.item.id)) {
      collapse();
    }
    if (pendingExpandId && activeIds.includes(pendingExpandId)) {
      const item = model.byId.get(pendingExpandId);
      pendingExpandId = null;
      expand(item);
    }
    const primary = model.journey.find((j) => activeIds.includes(j.id) && j.lane === 0)
      || model.journey.find((j) => activeIds.includes(j.id));
    dispatch("timeline:activechange", { activeIds: [...activeIds], primaryId: primary ? primary.id : null });
    if (primary) {
      const e = primary.entry;
      announce("chapter", primary.kind === "experience"
        ? `${e.jobTitle}, ${e.employer}, ${formatDate(e.dates.start)} to ${formatDate(e.dates.end)}.`
        : `${e.degree}, ${e.institution}.`);
    }
  }

  // Screen reader announcements are batched and debounced, so a fast
  // scroll across six roles announces where the visitor landed — not
  // all six in a row.
  function announce(key, text) {
    if (!el.announcer || !text) return;
    announcements.set(key, text);
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      el.announcer.textContent = [...announcements.values()].join(" ");
      announcements.clear();
    }, 500);
  }

  // ============================================================
  // EXPAND / COLLAPSE — one card open at a time
  // ============================================================

  const hostFor = (item) => item.cardEl || item.el;

  function setExpandedUi(item, open) {
    const host = hostFor(item);
    host.classList.toggle("is-expanded", open);
    if (item.wrapEl) item.wrapEl.classList.toggle("is-expanded-host", open);
    const toggle = host.querySelector(".card-toggle, .station-pill");
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(open));
      const label = toggle.querySelector(".toggle-label");
      const text = open ? toggle.dataset.labelOpen : toggle.dataset.labelClosed;
      if (label && text) label.textContent = text;
    }
    // `inert` keeps collapsed content (and any Detail anchors inside it)
    // out of the Tab order, not just visually hidden.
    host.querySelectorAll("[data-expand-region]").forEach((region) => {
      region.inert = !open;
      if (open) region.removeAttribute("aria-hidden"); else region.setAttribute("aria-hidden", "true");
    });
    if (!open) {
      const body = host.querySelector(".card-body");
      if (body) body.scrollTop = 0;
    }
    el.track.classList.toggle("has-expanded-card", open);
    el.frame.classList.toggle("has-expanded-card", open);
    dispatch("card:expandchange", { id: item.id, kind: item.kind, expanded: open });
  }

  function expand(item) {
    if (!item) return;
    if (expanded && expanded.item === item) return;
    if (expanded) collapse();
    expanded = { item };
    setExpandedUi(item, true);
  }

  function collapse() {
    if (!expanded) return;
    const { item } = expanded;
    expanded = null;
    setExpandedUi(item, false);
  }

  function onTrackClick(event) {
    if (!model) return;
    const trigger = event.target.closest(".card-toggle, .station-pill");
    if (!trigger || !el.track.contains(trigger)) return;
    const host = trigger.closest("[data-entry-id]");
    const item = host && model.byId.get(host.dataset.entryId);
    if (!item) return;
    if (expanded && expanded.item === item) {
      collapse();
      return;
    }
    if ((item.kind === "experience" || item.kind === "education") && !activeIds.includes(item.id)) {
      // Opening a card that isn't the current chapter: travel there
      // first, then open it on arrival (see onActiveChange).
      collapse();
      pendingExpandId = item.id;
      scrollPlayheadTo(item.x0 + 2);
      return;
    }
    expand(item);
  }

  // ============================================================
  // NAVIGATION — smooth scrolling, wheel translation, keyboard
  // ============================================================

  const maxScroll = () => Math.max(0, el.track.scrollWidth - el.track.clientWidth);

  // A tiny easing engine: each frame moves a fixed fraction of the
  // remaining distance, so a mouse-wheel notch glides instead of
  // jumping, and new input simply retargets the glide mid-flight.
  function smoothScrollTo(x, { instant = false } = {}) {
    const target = clamp(x, 0, maxScroll());
    if (instant || reducedMotion) {
      cancelSmooth();
      el.track.scrollLeft = target;
      return;
    }
    smooth.target = target;
    if (!smooth.raf) smooth.raf = requestAnimationFrame(stepSmooth);
  }

  function smoothScrollBy(delta) {
    const base = smooth.target !== null ? smooth.target : el.track.scrollLeft;
    smoothScrollTo(base + delta);
  }

  function stepSmooth() {
    smooth.raf = 0;
    if (smooth.target === null) return;
    const current = el.track.scrollLeft;
    const diff = smooth.target - current;
    if (Math.abs(diff) <= 1) {
      el.track.scrollLeft = smooth.target;
      smooth.target = null;
      return;
    }
    let move = diff * 0.14;
    if (Math.abs(move) < 1) move = Math.sign(diff);
    el.track.scrollLeft = current + move;
    // If the browser refused to move (an edge, or rounding), stop
    // instead of spinning forever.
    if (Math.abs(el.track.scrollLeft - current) < 0.5) {
      smooth.target = null;
      return;
    }
    smooth.raf = requestAnimationFrame(stepSmooth);
  }

  function cancelSmooth() {
    smooth.target = null;
    if (smooth.raf) cancelAnimationFrame(smooth.raf);
    smooth.raf = 0;
  }

  const scrollPlayheadTo = (contentX) => smoothScrollTo(contentX - metrics.playheadX);

  // Grabbing the scrollbar or touching the screen hands control back to
  // the browser immediately, so the glide never fights a real gesture.
  function onUserGrab() {
    cancelSmooth();
    pendingExpandId = null;
  }

  // Would this wheel movement scroll something INSIDE the timeline (an
  // expanded card's achievements, the intake textarea)? If so, that
  // element gets it; only otherwise does it move the timeline.
  function canScrollInside(node, dy) {
    for (let n = node; n && n !== el.track; n = n.parentElement) {
      if (!(n instanceof HTMLElement)) continue;
      const overflowY = getComputedStyle(n).overflowY;
      if (overflowY !== "auto" && overflowY !== "scroll") continue;
      if (n.scrollHeight <= n.clientHeight + 1) continue;
      if (dy < 0 && n.scrollTop > 0) return true;
      if (dy > 0 && n.scrollTop + n.clientHeight < n.scrollHeight - 1) return true;
    }
    return false;
  }

  // VERTICAL → HORIZONTAL: a vertical mouse wheel (or vertical trackpad
  // swipe) moves the timeline sideways. Genuinely horizontal input —
  // a sideways trackpad swipe, shift+wheel on most systems — is left
  // to the browser, which already handles it natively and smoothly.
  function onWheel(event) {
    if (event.ctrlKey || !metrics) return; // ctrl+wheel = pinch-zoom; leave it alone
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      cancelSmooth();
      return;
    }
    if (canScrollInside(event.target, event.deltaY)) return;
    const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? el.track.clientWidth : 1;
    event.preventDefault();
    pendingExpandId = null;
    smoothScrollBy(event.deltaY * unit);
  }

  function onKeyDown(event) {
    if (event.defaultPrevented || !metrics || el.stage.inert) return;
    const t = event.target;
    if (t && t.closest && t.closest("input, textarea, select, [contenteditable='true']")) return;
    const inTimeline = t === document.body || el.track.contains(t) || el.hud.contains(t);
    if (!inTimeline) return;

    if (event.key === "Escape") {
      if (expanded) {
        collapse();
        event.preventDefault();
      }
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    const step = metrics.vw * 0.18;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        smoothScrollBy(step);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        smoothScrollBy(-step);
        break;
      case "PageDown":
        smoothScrollBy(metrics.vw * 0.85);
        break;
      case "PageUp":
        smoothScrollBy(-metrics.vw * 0.85);
        break;
      case "Home":
        smoothScrollTo(0);
        break;
      case "End":
        smoothScrollTo(maxScroll());
        break;
      default:
        return;
    }
    pendingExpandId = null;
    event.preventDefault();
  }

  // Chapter stops: the start of every period and every station.
  function chapterStops() {
    if (!model) return [];
    const stops = model.journey.map((j) => j.x0)
      .concat(model.stations.map((s) => model.timelineLeft + s.x));
    return [...new Set(stops.map((x) => Math.round(x)))].sort((a, b) => a - b);
  }

  function currentPlayhead() {
    const base = smooth.target !== null ? smooth.target : el.track.scrollLeft;
    return base + metrics.playheadX;
  }

  function goNext() {
    if (!model) return;
    const playhead = currentPlayhead();
    const stop = chapterStops().find((x) => x > playhead + 6);
    scrollPlayheadTo(stop !== undefined ? stop + 2 : model.outroLeft + 2);
  }

  function goPrev() {
    if (!model) return;
    const playhead = currentPlayhead();
    const stops = chapterStops().filter((x) => x < playhead - 24);
    if (stops.length) scrollPlayheadTo(stops[stops.length - 1] + 2);
    else smoothScrollTo(0);
  }

  // ============================================================
  // RESIZE — re-layout while keeping the same moment under the playhead
  // ============================================================

  function captureAnchor() {
    if (!model || !model.scale || !metrics) return { type: "scroll", value: el.track.scrollLeft };
    const playhead = el.track.scrollLeft + metrics.playheadX;
    if (playhead < model.timelineLeft) return { type: "landing", ratio: el.track.scrollLeft / Math.max(1, metrics.vw) };
    if (playhead >= model.outroLeft) return { type: "outro" };
    return { type: "date", idx: model.scale.toIdx(playhead - model.timelineLeft) };
  }

  function restoreAnchor(anchor) {
    if (!model || !model.scale) {
      el.track.scrollLeft = 0;
      return;
    }
    if (anchor.type === "landing") el.track.scrollLeft = anchor.ratio * metrics.vw;
    else if (anchor.type === "outro") el.track.scrollLeft = model.outroLeft - metrics.playheadX + 2;
    else if (anchor.type === "date") el.track.scrollLeft = model.timelineLeft + model.scale.toX(anchor.idx) - metrics.playheadX;
    else el.track.scrollLeft = anchor.value;
  }

  function scheduleRelayout() {
    clearTimeout(relayoutTimer);
    relayoutTimer = setTimeout(() => {
      const anchor = captureAnchor();
      cancelSmooth();
      layout();
      restoreAnchor(anchor);
      update();
    }, 120);
  }

  // ============================================================
  // PUBLIC API
  // ============================================================

  function init({ landingHtml = "", outroHtml = "" } = {}) {
    el.stage = document.getElementById("stage");
    el.frame = document.getElementById("track-frame");
    el.track = document.getElementById("track");
    el.content = document.getElementById("track-content");
    el.hud = document.getElementById("timeline-hud");
    el.chip = document.getElementById("playhead-chip");
    el.progress = document.getElementById("timeline-progress");
    el.prev = document.getElementById("chapter-prev");
    el.next = document.getElementById("chapter-next");
    el.announcer = document.getElementById("timeline-announcer");

    el.landing = document.createElement("section");
    el.landing.className = "landing-panel";
    el.landing.setAttribute("aria-label", "Welcome");
    el.landing.innerHTML = landingHtml;
    el.timeline = document.createElement("div");
    el.timeline.className = "timeline-layer";
    el.timeline.hidden = true;
    el.outro = document.createElement("section");
    el.outro.className = "outro-panel";
    el.outro.setAttribute("aria-label", "End of timeline");
    el.outro.innerHTML = outroHtml;
    el.outro.hidden = true;
    el.content.append(el.landing, el.timeline, el.outro);

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion = motion.matches;
    if (motion.addEventListener) motion.addEventListener("change", (e) => { reducedMotion = e.matches; });

    el.track.addEventListener("scroll", requestFrame, { passive: true });
    el.track.addEventListener("wheel", onWheel, { passive: false });
    el.track.addEventListener("pointerdown", onUserGrab, { passive: true });
    el.track.addEventListener("touchstart", onUserGrab, { passive: true });
    el.track.addEventListener("click", onTrackClick);
    el.prev.addEventListener("click", goPrev);
    el.next.addEventListener("click", goNext);
    document.addEventListener("keydown", onKeyDown);
    if ("ResizeObserver" in window) new ResizeObserver(scheduleRelayout).observe(el.track);
    else window.addEventListener("resize", scheduleRelayout);

    layout();
    update();
  }

  function renderCurated(curation) {
    collapse();
    model = buildModel(curation, { timeline, education });
    buildTimelineDom();
    layout();
    update();
    dispatch("timeline:ready", {
      journey: model.journey.length,
      stations: model.stations.length,
      points: model.points.length,
      lanes: model.laneCount
    });
  }

  return {
    init,
    renderCurated,
    // Explore → puts the playhead at the very start of the story.
    scrollToStart() {
      if (model && model.scale) scrollPlayheadTo(model.timelineLeft + model.scale.spanStartX + 2);
    },
    // Back from the resume → lands inside the current role, just before "Today".
    scrollToEnd() {
      if (model && model.scale) scrollPlayheadTo(model.timelineLeft + model.scale.toX(model.endIdx - 0.5));
    },
    scrollToOutro() {
      if (model) scrollPlayheadTo(model.outroLeft + 2);
    },
    scrollToLanding() {
      smoothScrollTo(0);
    },
    collapse,
    announce,
    getZone: () => zone,
    getActiveIds: () => [...activeIds],
    getExpandedId: () => (expanded ? expanded.item.id : null),
    getPlayheadLabel: () => lastChipLabel,
    // Pure functions exposed for testing outside the browser.
    _internals: { buildModel, buildScale, assignLanes, deriveMetrics, assignPointTiers, monthIndex }
  };
})();

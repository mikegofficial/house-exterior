/* ==========================================================================
   House Exterior — Interactive Vector Elevations Viewer Engine
   Calibrated to 1/4" = 1'-0" (18.0 SVG units = 1 foot; y = 0 is 1st Fl 0'-0")
   ========================================================================== */
(function () {
  "use strict";

  const UNITS_PER_FOOT = 18.0;
  const SVG_NS = "http://www.w3.org/2000/svg";

  // Architectural Datum Elevations (in feet above First Floor 0'-0")
  const DATUMS = [
    { label: "ROOF PEAK · +29'-7½\"",  ft: 533.2 / 18       },
    { label: "T.O.P. · +20'-9⅜\"",     ft: 20 + 9.375 / 12  },
    { label: "2ND FLOOR · +11'-8¼\"",  ft: 11 + 8.25 / 12   },
    { label: "1ST FLOOR · 0'-0\"",     ft: 0                },
    { label: "ADU FLOOR · -1'-6\"",    ft: -1.5             },
  ];

  // Board layout positions for "all" 4-side presentation view (identical 1/4"=1'-0" scale)
  const BOARD_SLOTS = [
    { key: "north", tx: -660, ty: 0,    label: "NORTH ELEVATION", code: "A3.0-1 · FRONT FACADE" },
    { key: "south", tx:  660, ty: 0,    label: "SOUTH ELEVATION", code: "A3.1-3 · REAR / ADU-END FACADE" },
    { key: "east",  tx:    0, ty: 740,  label: "EAST ELEVATION",  code: "A3.0-2 · COURTYARD & GARAGE FACADE" },
    { key: "west",  tx:    0, ty: 1480, label: "WEST ELEVATION",  code: "A3.1-4 · BACK & CARPORT FACADE" },
  ];

  const VIEW_META = {
    all:   { label: "ALL 4 ELEVATIONS · A3.0 / A3.1", box: { x: -1310, y: -570, w: 2620, h: 2210 } },
    north: { label: "A3.0-1 · NORTH ELEVATION",       box: null },
    east:  { label: "A3.0-2 · EAST ELEVATION",        box: null },
    south: { label: "A3.1-3 · SOUTH ELEVATION",       box: null },
    west:  { label: "A3.1-4 · WEST ELEVATION",        box: null },
  };

  // Curated Facade Detail Zoom Presets (coordinates in normalized y=0 first-floor space)
  const FOCUS_PRESETS = {
    entry:        { view: "north", box: { x: -460, y: -260, w: 720, h: 320 } },
    courtyard:    { view: "east",  box: { x:  140, y: -270, w: 940, h: 330 } },
    bnb:          { view: "east",  box: { x: -140, y: -550, w: 1200, h: 420 } },
    "patio-garage":{ view: "east", box: { x: -640, y: -270, w: 860, h: 340 } },
    "adu-south":  { view: "south", box: { x: -340, y: -540, w: 860, h: 600 } },
    skylight:     { view: "west",  box: { x: -1060, y: -555, w: 1220, h: 460 } },
  };

  // Complete Glazing & Exterior Opening Schedule (Sheet A2.3)
  const GLAZING_SCHEDULE = [
    ["A", "1'-6\"",  "5'-0\"",   "2", "FG",          "North facade fixed glass"],
    ["B", "1'-6\"",  "10'-0\"",  "2", "FG",          "South facade tall fixed (ADU)"],
    ["C", "3'-0\"",  "10'-0\"",  "1", "FG",          "Dining alcove east"],
    ["D", "2'-9\"",  "7'-0\"",   "4", "FG CURVED",   "East courtyard curved dining bay"],
    ["E", "3'-0\"",  "10'-0\"",  "1", "FG",          "West facade full-height fixed"],
    ["F", "5'-0\"",  "3'-0\"",   "1", "FG",          "Bath 1 fixed"],
    ["G", "3'-0\"",  "5'-0\"",   "3", "CSMT",        "West facade casements (Office & ADU)"],
    ["H", "5'-6\"",  "2'-0\"",   "1", "FG",          "West ADU clerestory"],
    ["I", "1'-6\"",  "6'-0\"",   "4", "FG",          "North & West tall vertical fixed"],
    ["J", "3'-0\"",  "9'-0\"",   "1", "FG",          "East 2nd-floor tall fixed"],
    ["K", "4'-0\"",  "3'-0\"",   "2", "FG",          "East 2nd-floor horizontal band"],
    ["L", "10'-0\"", "3'-0\"",   "1", "FG",          "East 2nd-floor wide panoramic"],
    ["M", "3'-0\"",  "9'-0\"",   "2", "CSMT",        "East 2nd-floor tall casements"],
    ["N", "9'-0\"",  "6'-0\"",   "1", "3-PNL SLIDER","South 2nd-floor primary slider"],
    ["O", "9'-0\"",  "2'-0\"",   "1", "AWN",         "West 2nd-floor awning clerestory"],
    ["P", "7'-2\"",  "3'-0\"",   "1", "FG",          "West 2nd-floor primary bath"],
    ["Q", "3'-0\"",  "3'-0\"",   "1", "CSMT",        "West 2nd-floor casement"],
    ["R", "5'-0\"",  "3'-0\"",   "1", "FG",          "West 2nd-floor fixed"],
    ["S", "3'-0\"",  "6'-0\"",   "1", "CSMT",        "West 2nd-floor Bath 2 casement"],
    ["T", "1'-9½\"", "5'-10¾\"", "1", "SKYLIGHT",    "West roof slope flat skylight"],
    ["U", "12'-0\"", "2'-0\"",   "1", "GLASS BLOCK", "Interior screened patio transom"],
    ["V", "1'-4\"",  "10'-0\"",  "5", "GLASS BLOCK", "North & East 10' tall glass-block strips"],
  ];

  const state = {
    view: "all",
    theme: "paper",
    showDatums: false,
    showShadows: true,
    vb: { x: -1310, y: -570, w: 2620, h: 2210 },
    measuring: false,
    measureMode: "dist",
    measureDraft: [],
    mouseWorld: null,
    shiftDown: false,
    measurements: [],
  };

  const svg = document.getElementById("elev-svg");
  const viewport = document.getElementById("viewport");
  const defsEl = document.getElementById("elev-defs");
  const stageEl = document.getElementById("elev-stage");
  const datumsSlot = document.getElementById("slot-datums");
  const measureSlot = document.getElementById("slot-measurements");

  // ========================================================================
  // 1. Mount Vector Definitions & Render Active Elevation / 4-Side Board
  // ========================================================================
  function initDefs() {
    const data = window.EXTERIOR_LAYERS;
    if (!data) return;
    let allDefs = "";
    ["north", "east", "south", "west"].forEach((k) => {
      if (!data[k]) return;
      allDefs += data[k].defs;
      VIEW_META[k].box = data[k].box;
    });
    defsEl.innerHTML = allDefs;
  }

  function renderStage() {
    const data = window.EXTERIOR_LAYERS;
    if (!data) return;
    stageEl.innerHTML = "";

    if (state.view === "all") {
      BOARD_SLOTS.forEach((slot) => {
        const g = document.createElementNS(SVG_NS, "g");
        g.setAttribute("transform", `translate(${slot.tx},${slot.ty})`);
        g.innerHTML = data[slot.key].body;

        // Clean architectural caption below each elevation (click to focus that elevation!)
        const captionG = document.createElementNS(SVG_NS, "g");
        captionG.setAttribute("style", "cursor:pointer");
        const ruleW = slot.key === "east" || slot.key === "west" ? 2100 : 1080;
        const rule = document.createElementNS(SVG_NS, "line");
        rule.setAttribute("x1", -ruleW / 2);
        rule.setAttribute("x2", ruleW / 2);
        rule.setAttribute("y1", 86);
        rule.setAttribute("y2", 86);
        rule.setAttribute("class", "board-rule");
        captionG.appendChild(rule);

        const title = document.createElementNS(SVG_NS, "text");
        title.setAttribute("x", -ruleW / 2);
        title.setAttribute("y", 114);
        title.setAttribute("font-size", "22");
        title.setAttribute("class", "board-title");
        title.textContent = slot.label;
        captionG.appendChild(title);

        const sub = document.createElementNS(SVG_NS, "text");
        sub.setAttribute("x", ruleW / 2);
        sub.setAttribute("y", 114);
        sub.setAttribute("font-size", "16");
        sub.setAttribute("text-anchor", "end");
        sub.setAttribute("class", "board-sub");
        sub.textContent = `${slot.code} · CLICK TO ISOLATE`;
        captionG.appendChild(sub);

        captionG.addEventListener("click", () => setView(slot.key, true));
        g.appendChild(captionG);
        stageEl.appendChild(g);
      });
    } else {
      stageEl.innerHTML = data[state.view].body;
    }

    stageEl.classList.toggle("hide-shadows", !state.showShadows);
    renderDatums();
    document.getElementById("hud-sheet").textContent = VIEW_META[state.view].label;

    document.querySelectorAll(".sheet-tab").forEach((btn) => {
      const active = btn.dataset.view === state.view;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  // ========================================================================
  // 2. Architectural Datum Guide Lines Overlay
  // ========================================================================
  function renderDatums() {
    datumsSlot.innerHTML = "";
    if (!state.showDatums) return;

    const rect = viewport.getBoundingClientRect();
    const unitPerPx = rect.width ? state.vb.w / rect.width : 1.5;
    const fontSize = 10.5 * unitPerPx;

    const rowBaselines = state.view === "all" ? [0, 740, 1480] : [0];
    const spanHalf = state.view === "all" ? 1320 : (VIEW_META[state.view].box.w / 2 + 120);

    rowBaselines.forEach((baseY) => {
      DATUMS.forEach((d) => {
        const y = baseY - d.ft * UNITS_PER_FOOT;
        const line = document.createElementNS(SVG_NS, "line");
        line.setAttribute("x1", -spanHalf);
        line.setAttribute("x2", spanHalf);
        line.setAttribute("y1", y.toFixed(1));
        line.setAttribute("y2", y.toFixed(1));
        line.setAttribute("class", "datum-line");
        datumsSlot.appendChild(line);

        if (state.view !== "all" || baseY === 0) {
          const padX = 6 * unitPerPx;
          const h = 17 * unitPerPx;
          const w = d.label.length * fontSize * 0.62 + padX * 2;
          const xLeft = -spanHalf + 10 * unitPerPx;

          const bg = document.createElementNS(SVG_NS, "rect");
          bg.setAttribute("x", xLeft);
          bg.setAttribute("y", y - h / 2);
          bg.setAttribute("width", w);
          bg.setAttribute("height", h);
          bg.setAttribute("rx", 3 * unitPerPx);
          bg.setAttribute("class", "datum-pill-bg");
          datumsSlot.appendChild(bg);

          const txt = document.createElementNS(SVG_NS, "text");
          txt.setAttribute("x", xLeft + padX);
          txt.setAttribute("y", y);
          txt.setAttribute("font-size", fontSize);
          txt.setAttribute("class", "datum-pill-text");
          txt.textContent = d.label;
          datumsSlot.appendChild(txt);
        }
      });
    });
  }

  // ========================================================================
  // 3. Unit Formatting & Camera Pan/Zoom
  // ========================================================================
  function formatFeetInches(units, showPlus = false) {
    const totalInches = (Math.abs(units) / UNITS_PER_FOOT) * 12;
    const quarters = Math.round(totalInches * 4);
    const feet = Math.floor(quarters / 48);
    const remQ = quarters % 48;
    const inches = Math.floor(remQ / 4);
    const fracQ = remQ % 4;
    const fracStr = fracQ === 1 ? "¼" : fracQ === 2 ? "½" : fracQ === 3 ? "¾" : "";
    const sign = units < 0 ? "-" : (showPlus ? "+" : "");
    return `${sign}${feet}'-${inches}${fracStr}"`;
  }

  function polygonAreaSF(pts) {
    let sum = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      sum += a.x * b.y - b.x * a.y;
    }
    return Math.abs(sum * 0.5) / (UNITS_PER_FOOT * UNITS_PER_FOOT);
  }

  let animRaf = null;
  function applyViewBox() {
    const { x, y, w, h } = state.vb;
    svg.setAttribute("viewBox", `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`);
    updateZoomAndScaleHUD();
    if (state.showDatums) renderDatums();
    renderMeasurements();
  }

  function fitBox(targetBox, animate = true) {
    const rect = viewport.getBoundingClientRect();
    const vw = Math.max(rect.width, 300);
    const vh = Math.max(rect.height, 200);
    const aspect = vw / vh;
    const pad = 1.08;
    let w = targetBox.w * pad;
    let h = targetBox.h * pad;
    if (w / h > aspect) h = w / aspect;
    else w = h * aspect;

    const cx = targetBox.x + targetBox.w / 2;
    const cy = targetBox.y + targetBox.h / 2;
    const dest = { x: cx - w / 2, y: cy - h / 2, w, h };

    if (!animate) {
      if (animRaf) cancelAnimationFrame(animRaf);
      state.vb = dest;
      applyViewBox();
      return;
    }
    if (animRaf) cancelAnimationFrame(animRaf);
    const start = { ...state.vb };
    const t0 = performance.now();
    function step(now) {
      const p = Math.min(1, (now - t0) / 280);
      const ease = 1 - Math.pow(1 - p, 3);
      state.vb.x = start.x + (dest.x - start.x) * ease;
      state.vb.y = start.y + (dest.y - start.y) * ease;
      state.vb.w = start.w + (dest.w - start.w) * ease;
      state.vb.h = start.h + (dest.h - start.h) * ease;
      applyViewBox();
      animRaf = p < 1 ? requestAnimationFrame(step) : null;
    }
    animRaf = requestAnimationFrame(step);
  }

  function screenToWorld(clientX, clientY) {
    const rect = viewport.getBoundingClientRect();
    return {
      x: state.vb.x + ((clientX - rect.left) / rect.width) * state.vb.w,
      y: state.vb.y + ((clientY - rect.top) / rect.height) * state.vb.h,
    };
  }

  function zoomAt(factor, clientX, clientY) {
    if (animRaf) cancelAnimationFrame(animRaf);
    const rect = viewport.getBoundingClientRect();
    const cx = clientX != null ? clientX : rect.left + rect.width / 2;
    const cy = clientY != null ? clientY : rect.top + rect.height / 2;
    const before = screenToWorld(cx, cy);

    const baseW = VIEW_META[state.view].box.w;
    const newW = Math.max(baseW / 18, Math.min(baseW * 3.5, state.vb.w * factor));
    const ratio = newW / state.vb.w;
    const newH = state.vb.h * ratio;

    state.vb.w = newW;
    state.vb.h = newH;
    state.vb.x = before.x - ((cx - rect.left) / rect.width) * newW;
    state.vb.y = before.y - ((cy - rect.top) / rect.height) * newH;
    applyViewBox();
  }

  function updateZoomAndScaleHUD() {
    const rect = viewport.getBoundingClientRect();
    if (!rect.width) return;
    const baseW = VIEW_META[state.view].box.w * 1.08;
    document.getElementById("zoom-readout").textContent = `${Math.round((baseW / state.vb.w) * 100)}%`;

    const pxPerFoot = (rect.width / state.vb.w) * UNITS_PER_FOOT;
    const niceFeet = [1, 2, 4, 5, 10, 20, 25, 40, 50, 100];
    let chosenFt = 10;
    for (const ft of niceFeet) {
      const px = ft * pxPerFoot;
      if (px >= 75 && px <= 185) { chosenFt = ft; break; }
      if (px < 75) chosenFt = ft;
    }
    const barPx = Math.max(44, Math.min(200, Math.round(chosenFt * pxPerFoot)));
    document.getElementById("scale-bar-graphic").style.width = `${barPx}px`;
    document.getElementById("scale-bar-mid").textContent = `${chosenFt / 2}'`;
    document.getElementById("scale-bar-max").textContent = `${chosenFt} ft`;
  }

  function setView(viewKey, shouldFit = true) {
    if (!VIEW_META[viewKey]) return;
    state.view = viewKey;
    state.measurements = [];
    state.measureDraft = [];
    renderStage();
    renderMeasurements();
    if (shouldFit) fitBox(VIEW_META[viewKey].box, true);
  }

  // ========================================================================
  // 4. Measurement Tool (Height, Width & Facade Area)
  // ========================================================================
  function snapPoint(prev, raw) {
    if (!state.shiftDown || !prev) return raw;
    return Math.abs(raw.x - prev.x) >= Math.abs(raw.y - prev.y)
      ? { x: raw.x, y: prev.y }
      : { x: prev.x, y: raw.y };
  }

  function renderMeasurements() {
    measureSlot.innerHTML = "";
    const rect = viewport.getBoundingClientRect();
    if (!rect.width) return;
    const unitPerPx = state.vb.w / rect.width;
    const fontSize = 11.5 * unitPerPx;
    const dotR = 4.2 * unitPerPx;

    function addTag(cx, cy, label) {
      const padX = 7 * unitPerPx;
      const boxH = 20 * unitPerPx;
      const boxW = label.length * fontSize * 0.62 + padX * 2;
      const bg = document.createElementNS(SVG_NS, "rect");
      bg.setAttribute("x", cx - boxW / 2);
      bg.setAttribute("y", cy - boxH / 2);
      bg.setAttribute("width", boxW);
      bg.setAttribute("height", boxH);
      bg.setAttribute("rx", 4 * unitPerPx);
      bg.setAttribute("class", "measure-tag-bg");
      measureSlot.appendChild(bg);

      const txt = document.createElementNS(SVG_NS, "text");
      txt.setAttribute("x", cx);
      txt.setAttribute("y", cy);
      txt.setAttribute("font-size", fontSize);
      txt.setAttribute("class", "measure-tag-text");
      txt.textContent = label;
      measureSlot.appendChild(txt);
    }

    function addDot(p) {
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("cx", p.x);
      c.setAttribute("cy", p.y);
      c.setAttribute("r", dotR);
      c.setAttribute("class", "measure-dot");
      measureSlot.appendChild(c);
    }

    function drawDist(a, b, isPreview) {
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", a.x); line.setAttribute("y1", a.y);
      line.setAttribute("x2", b.x); line.setAttribute("y2", b.y);
      line.setAttribute("class", "measure-line" + (isPreview ? " preview" : ""));
      measureSlot.appendChild(line);
      addDot(a); addDot(b);
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      addTag((a.x + b.x) / 2, (a.y + b.y) / 2 - 14 * unitPerPx, `${formatFeetInches(dist)} (${(dist / UNITS_PER_FOOT).toFixed(2)}')`);
    }

    function drawArea(pts, isPreview) {
      if (pts.length < 2) return;
      const poly = document.createElementNS(SVG_NS, pts.length >= 3 ? "polygon" : "polyline");
      poly.setAttribute("points", pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "));
      poly.setAttribute("class", pts.length >= 3 ? "measure-poly" : "measure-line preview");
      measureSlot.appendChild(poly);
      pts.forEach(addDot);
      if (pts.length >= 3) {
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
        addTag(cx, cy, `${polygonAreaSF(pts).toFixed(1)} SF`);
      }
    }

    state.measurements.forEach((m) => (m.type === "dist" ? drawDist(m.pts[0], m.pts[1], false) : drawArea(m.pts, false)));
    if (state.measuring && state.measureDraft.length > 0 && state.mouseWorld) {
      const cur = snapPoint(state.measureDraft[state.measureDraft.length - 1], state.mouseWorld);
      if (state.measureMode === "dist") drawDist(state.measureDraft[0], cur, true);
      else drawArea([...state.measureDraft, cur], true);
    }
  }

  function setMeasuring(active) {
    state.measuring = active;
    state.measureDraft = [];
    viewport.classList.toggle("measuring", active);
    document.getElementById("btn-measure").classList.toggle("active", active);
    document.getElementById("measure-banner").classList.toggle("visible", active);
    updateMeasureHint();
    renderMeasurements();
  }

  function updateMeasureHint() {
    document.getElementById("measure-hint").textContent =
      state.measureMode === "dist"
        ? "Click two points · Hold Shift for 90° ortho snap"
        : "Click vertices · Double-click or press Enter to close area";
    document.getElementById("btn-mode-dist").classList.toggle("active", state.measureMode === "dist");
    document.getElementById("btn-mode-area").classList.toggle("active", state.measureMode === "area");
  }

  function finishAreaDraft() {
    if (state.measureMode === "area" && state.measureDraft.length >= 3) {
      state.measurements.push({ type: "area", pts: [...state.measureDraft] });
      state.measureDraft = [];
      renderMeasurements();
    }
  }

  // ========================================================================
  // 5. Glazing Table & Standalone SVG Export
  // ========================================================================
  function buildGlazingTable(filter = "") {
    const q = filter.trim().toLowerCase();
    const rows = GLAZING_SCHEDULE.filter((r) => r.join(" ").toLowerCase().includes(q));
    document.getElementById("glazing-table").innerHTML = `
      <table class="sched-table">
        <thead><tr><th>Tag</th><th>W × H (Qty)</th><th>Type / Location</th></tr></thead>
        <tbody>
          ${rows.map(([m, w, h, c, f, n]) => `
            <tr>
              <td class="sched-mark">${m}</td>
              <td class="sched-dim">${w} × ${h} <span style="color:var(--ui-text-muted)">(${c})</span></td>
              <td class="sched-note"><strong>${f}</strong> · ${n}</td>
            </tr>`).join("")}
        </tbody>
      </table>`;
  }

  function exportCurrentSVG() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name) => cs.getPropertyValue(name).trim();
    const vb = `${state.vb.x.toFixed(1)} ${state.vb.y.toFixed(1)} ${state.vb.w.toFixed(1)} ${state.vb.h.toFixed(1)}`;
    const shadowRule = state.showShadows ? `.s-shadow{stroke:${v("--v-shadow")}}` : `.s-shadow{stroke:none}`;
    const out = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">
<style>
  svg{background:${v("--v-paper")};stroke-linecap:round;stroke-linejoin:round}
  .s-ink{stroke:${v("--v-ink")}}.s-mid{stroke:${v("--v-mid")}}.s-dim{stroke:${v("--v-dim")}}${shadowRule}.s-accent{stroke:${v("--v-accent")}}.s-paper{stroke:${v("--v-paper")}}
  .f-ink{fill:${v("--v-ink")}}.f-paper{fill:${v("--v-paper")}}.f-wall{fill:${v("--v-wall")}}.f-shade{fill:${v("--v-shadow")}}.f-accent{fill:${v("--v-accent")}}
  .board-title{fill:${v("--v-ink")};font-family:monospace;font-weight:700;letter-spacing:.08em}
  .board-sub{fill:${v("--v-dim")};font-family:monospace}
  .board-rule{stroke:${v("--v-dim")};stroke-opacity:.45;stroke-width:1}
  .datum-line{stroke:${v("--v-datum")};stroke-width:1.25;stroke-dasharray:8 5;opacity:.65}
  .datum-pill-bg{fill:${v("--v-datum")};opacity:.9}
  .datum-pill-text{fill:#fff;font-family:monospace;font-weight:600;dominant-baseline:central}
</style>
<defs>${defsEl.innerHTML}</defs>
${stageEl.innerHTML}
${datumsSlot.innerHTML}
</svg>`;
    const blob = new Blob([out], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `house-exterior-${state.view}-${state.theme}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ========================================================================
  // 6. Pointer, Wheel, Touch & Keyboard Events (HUD-Safe)
  // ========================================================================
  let isPanning = false, wasDragging = false, panStart = null, panStartVb = null, pinchDist = null;

  viewport.addEventListener("wheel", (e) => {
    if (!svg.contains(e.target)) return;
    e.preventDefault();
    zoomAt(e.deltaY > 0 ? 1.13 : 1 / 1.13, e.clientX, e.clientY);
  }, { passive: false });

  viewport.addEventListener("pointerdown", (e) => {
    if (!svg.contains(e.target)) return;
    if (e.button !== 0 && e.button !== 1) return;
    if (state.measuring && e.button === 0) {
      const raw = screenToWorld(e.clientX, e.clientY);
      const pt = snapPoint(state.measureDraft[state.measureDraft.length - 1], raw);
      if (state.measureMode === "dist") {
        if (state.measureDraft.length === 0) state.measureDraft = [pt];
        else { state.measurements.push({ type: "dist", pts: [state.measureDraft[0], pt] }); state.measureDraft = []; }
      } else {
        state.measureDraft.push(pt);
      }
      renderMeasurements();
      return;
    }
    isPanning = true;
    wasDragging = false;
    panStart = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    panStartVb = { ...state.vb };
    viewport.classList.add("panning");
  });

  viewport.addEventListener("pointermove", (e) => {
    const w = screenToWorld(e.clientX, e.clientY);
    state.mouseWorld = w;

    if (state.view === "all") {
      document.getElementById("coord-badge").textContent = `X: ${formatFeetInches(w.x)} · Y: ${formatFeetInches(-w.y)}`;
    } else {
      document.getElementById("coord-badge").textContent = `Elev: ${formatFeetInches(-w.y, true)} · X: ${formatFeetInches(w.x)}`;
    }

    if (state.measuring && state.measureDraft.length > 0) renderMeasurements();
    if (!isPanning || !panStart) return;
    const dx = e.clientX - panStart.x, dy = e.clientY - panStart.y;
    if (!wasDragging && Math.hypot(dx, dy) > 4) {
      wasDragging = true;
      try { viewport.setPointerCapture(panStart.pointerId); } catch (_) {}
    }
    if (!wasDragging) return;
    const rect = viewport.getBoundingClientRect();
    state.vb.x = panStartVb.x - (dx / rect.width) * panStartVb.w;
    state.vb.y = panStartVb.y - (dy / rect.height) * panStartVb.h;
    applyViewBox();
  });

  function endPan(e) {
    if (!isPanning) return;
    isPanning = false;
    viewport.classList.remove("panning");
    try { viewport.releasePointerCapture(e.pointerId); } catch (_) {}
  }
  viewport.addEventListener("pointerup", endPan);
  viewport.addEventListener("pointercancel", endPan);

  viewport.addEventListener("dblclick", (e) => {
    if (!svg.contains(e.target)) return;
    if (state.measuring && state.measureMode === "area") {
      e.preventDefault();
      if (state.measureDraft.length > 3) state.measureDraft.pop();
      finishAreaDraft();
    }
  });

  viewport.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) pinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  }, { passive: true });

  viewport.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2 && pinchDist) {
      e.preventDefault();
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      zoomAt(pinchDist / d, (e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
      pinchDist = d;
    }
  }, { passive: false });
  viewport.addEventListener("touchend", () => { pinchDist = null; });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Shift") { state.shiftDown = true; if (state.measuring && state.measureDraft.length) renderMeasurements(); }
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    const keys = { "1": "all", "2": "north", "3": "east", "4": "south", "5": "west" };
    if (keys[e.key]) { setView(keys[e.key], true); return; }
    if (e.key === "=" || e.key === "+") { zoomAt(1 / 1.25); return; }
    if (e.key === "-" || e.key === "_") { zoomAt(1.25); return; }
    if (e.key === "0") { fitBox(VIEW_META[state.view].box, true); return; }
    if (e.key.toLowerCase() === "m") { setMeasuring(!state.measuring); return; }
    if (e.key.toLowerCase() === "l") { toggleDatums(!state.showDatums); return; }
    if (e.key.toLowerCase() === "s") { toggleShadows(!state.showShadows); return; }
    if (e.key.toLowerCase() === "b") { document.getElementById("sidebar").classList.toggle("collapsed"); return; }
    if (e.key === "Enter" && state.measuring && state.measureMode === "area") { finishAreaDraft(); return; }
    if (e.key === "Escape") {
      if (state.measureDraft.length) { state.measureDraft = []; renderMeasurements(); }
      else if (state.measuring) setMeasuring(false);
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.key === "Shift") { state.shiftDown = false; if (state.measuring && state.measureDraft.length) renderMeasurements(); }
  });

  window.addEventListener("resize", () => fitBox(state.vb, false));

  // ========================================================================
  // 7. Wire UI Controls
  // ========================================================================
  function toggleDatums(on) {
    state.showDatums = on;
    document.getElementById("toggle-datums").checked = on;
    document.getElementById("btn-quick-datums").classList.toggle("active", on);
    renderDatums();
  }

  function toggleShadows(on) {
    state.showShadows = on;
    document.getElementById("toggle-shadows").checked = on;
    stageEl.classList.toggle("hide-shadows", !on);
  }

  function bindUI() {
    document.querySelectorAll(".sheet-tab").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view, true)));
    document.getElementById("btn-toggle-sidebar").addEventListener("click", () => {
      document.getElementById("sidebar").classList.toggle("collapsed");
      setTimeout(updateZoomAndScaleHUD, 200);
    });
    document.querySelectorAll(".sidebar-nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".sidebar-nav-btn").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".sidebar-panel").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById(`panel-${btn.dataset.panel}`).classList.add("active");
      });
    });
    document.querySelectorAll(".theme-swatch").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.theme = btn.dataset.theme;
        document.documentElement.setAttribute("data-theme", state.theme);
        document.querySelectorAll(".theme-swatch").forEach((b) => b.classList.toggle("active", b === btn));
      });
    });

    document.getElementById("toggle-datums").addEventListener("change", (e) => toggleDatums(e.target.checked));
    document.getElementById("btn-quick-datums").addEventListener("click", () => toggleDatums(!state.showDatums));
    document.getElementById("toggle-shadows").addEventListener("change", (e) => toggleShadows(e.target.checked));

    document.querySelectorAll(".zone-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const preset = FOCUS_PRESETS[btn.dataset.focus];
        if (!preset) return;
        if (state.view !== preset.view) {
          state.view = preset.view;
          renderStage();
        }
        fitBox(preset.box, true);
      });
    });

    document.getElementById("glazing-search").addEventListener("input", (e) => buildGlazingTable(e.target.value));
    document.getElementById("btn-zoom-in").addEventListener("click", () => zoomAt(1 / 1.28));
    document.getElementById("btn-zoom-out").addEventListener("click", () => zoomAt(1.28));
    document.getElementById("btn-fit").addEventListener("click", () => fitBox(VIEW_META[state.view].box, true));
    document.getElementById("btn-measure").addEventListener("click", () => setMeasuring(!state.measuring));
    document.getElementById("btn-mode-dist").addEventListener("click", () => { state.measureMode = "dist"; state.measureDraft = []; updateMeasureHint(); renderMeasurements(); });
    document.getElementById("btn-mode-area").addEventListener("click", () => { state.measureMode = "area"; state.measureDraft = []; updateMeasureHint(); renderMeasurements(); });
    document.getElementById("btn-clear-measures").addEventListener("click", () => { state.measurements = []; state.measureDraft = []; renderMeasurements(); });
    document.getElementById("btn-exit-measure").addEventListener("click", () => setMeasuring(false));
    document.getElementById("btn-export-svg").addEventListener("click", exportCurrentSVG);
    document.getElementById("btn-print").addEventListener("click", () => window.print());
  }

  initDefs();
  buildGlazingTable();
  bindUI();
  renderStage();
  fitBox(VIEW_META.all.box, false);
})();

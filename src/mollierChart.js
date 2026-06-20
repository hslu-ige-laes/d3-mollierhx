// MollierChart — a stateful Mollier h,x chart for fast, incremental updates.
//
// The expensive coordinate grid (iso-lines + labels) is drawn ONCE and only
// re-drawn when something it depends on changes (domain, convention, pressure,
// line visibility, size). Everything else — measurement points, comfort zone,
// warning bands, frequency contours, the process chain — lives in its own SVG
// layer and is updated in place via D3 data-joins, so dragging a slider or
// toggling a zone never rebuilds the grid.
//
// Depends (same bundle / global, D3 v5):
//   createMollier(convention)          — mollierFunctions.js
//   drawHXCoordinates(...)             — coordinateGenerator.js
//   createComfort(rangeT,rangePhi,rangeX,p,mollier) — drawComfort.js
//
// Usage:
//   const chart = new MollierChart("#chart", { height: 700 });
//   chart.setData(records);                 // [{t,rh,time}, ...]  (rh in %)
//   chart.setComfort({t:[20,26], phi:[30,65], x:[0,11.5]});
//   chart.setBands(orange, red);            // each {t,phi,x,color,label}|null
//   chart.setFrequency({show:true, days:false, smoothing:4});
//   chart.setProcessChain(states);          // [{x,y,number,label,t,phi,xg,h}]
//   chart.setDomain([0,0.02], [-15,40]);    // grid redraw (rare)

// ---------------------------------------------------------------------------
// Frequency-contour helpers (pure, grid-space) — bandwidth/feathering tuned to
// turn the thin data band into rounded PDF-style loops. Ported from the demo.
// ---------------------------------------------------------------------------
const FREQ_XMIN = 0, FREQ_DX = 0.0005, FREQ_NX = 60;     // 0.5 g/kg cells, 0..30 g/kg
const FREQ_TMIN = -30, FREQ_DT = 0.5, FREQ_NY = 180;     // 0.5 degC cells, -30..60 degC
const FREQ_MIN_CELL_HOURS = 1;
const FREQ_SIGMA = 2.0;          // fixed KDE bandwidth (cells)
const FREQ_FOOT_R = 0, FREQ_FOOT_SIGMA = 0.7;
const MIN_RING_AREA = 2.0;
const FREQ_TARGETS_HOURS = [1, 5, 25, 100, 200, 400, 800, 1600];
const FREQ_TARGETS_DAYS  = [1, 5, 10, 25, 50, 100, 200, 300];

// Separable Gaussian blur over a grid (a KDE; sigma = bandwidth in cells).
function gaussBlur2D(grid, nx, ny, sigma) {
  let r = Math.max(1, Math.ceil(3 * sigma));
  let ker = new Array(2 * r + 1), ksum = 0;
  for (let k = -r; k <= r; k++) { let w = Math.exp(-(k * k) / (2 * sigma * sigma)); ker[k + r] = w; ksum += w; }
  for (let k = 0; k < ker.length; k++) ker[k] /= ksum;
  let tmp = new Array(nx * ny).fill(0), out = new Array(nx * ny).fill(0);
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    let s = 0;
    for (let k = -r; k <= r; k++) { let j = Math.min(nx - 1, Math.max(0, ix + k)); s += grid[iy * nx + j] * ker[k + r]; }
    tmp[iy * nx + ix] = s;
  }
  for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) {
    let s = 0;
    for (let k = -r; k <= r; k++) { let j = Math.min(ny - 1, Math.max(0, iy + k)); s += tmp[j * nx + ix] * ker[k + r]; }
    out[iy * nx + ix] = s;
  }
  return out;
}

// Soft footprint multiplier in [0,1]: 1 over the (dilated) data, feathering out.
function softFootprint(raw, nx, ny, R, sigma) {
  let tmp = new Array(nx * ny).fill(0);
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    let m = 0;
    for (let k = -R; k <= R; k++) { let j = ix + k; if (j < 0 || j >= nx) continue; if (raw[iy * nx + j] > 0) { m = 1; break; } }
    tmp[iy * nx + ix] = m;
  }
  let foot = new Array(nx * ny).fill(0);
  for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) {
    let m = 0;
    for (let k = -R; k <= R; k++) { let j = iy + k; if (j < 0 || j >= ny) continue; if (tmp[j * nx + ix] > 0) { m = 1; break; } }
    foot[iy * nx + ix] = m;
  }
  return gaussBlur2D(foot, nx, ny, sigma);
}

// Signed polygon area (shoelace), ignoring the duplicate closing vertex.
function ringArea(ring) {
  let n = ring.length;
  if (n > 1 && ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1]) n--;
  let a = 0;
  for (let i = 0; i < n; i++) { let q = ring[(i + 1) % n]; a += ring[i][0] * q[1] - q[0] * ring[i][1]; }
  return a / 2;
}

// Laplacian smoothing of a CLOSED ring; only pulls vertices inward (never enlarges).
function smoothRing(ring, iters) {
  let pts = ring;
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts = pts.slice(0, -1);
  let n = pts.length;
  if (n < 4 || iters <= 0) { pts = pts.slice(); pts.push([pts[0][0], pts[0][1]]); return pts; }
  for (let it = 0; it < iters; it++) {
    let out = new Array(n);
    for (let i = 0; i < n; i++) {
      let a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
      out[i] = [(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4];
    }
    pts = out;
  }
  pts.push([pts[0][0], pts[0][1]]);
  return pts;
}

// Warmest (largest grid-y) vertex of a contour, for label placement.
function topPointOfContour(c) {
  let best = null;
  c.coordinates.forEach(function (poly) {
    poly.forEach(function (ring) { ring.forEach(function (pt) { if (best === null || pt[1] > best[1]) best = pt; }); });
  });
  return best;
}

// Month -> season index (0 Winter, 1 Spring, 2 Summer, 3 Fall).
function seasonIndex(date) {
  let m = date.getMonth();
  if (m === 11 || m === 0 || m === 1) return 0;
  if (m <= 4) return 1;
  if (m <= 7) return 2;
  return 3;
}

const DEFAULT_SEASON_COLORS = ["#74add1", "#a6d96a", "#f46d43", "#a6611a"]; // winter,spring,summer,fall
const DEFAULT_SEASON_LABELS = ["Winter", "Spring", "Summer", "Fall"];

function toDate(v) {
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v);
  let d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------

class MollierChart {
  constructor(container, opts) {
    opts = opts || {};
    this.containerSel = container;
    this.container = d3.select(container);
    this.margin = opts.margin || { top: 40, right: 70, bottom: 50, left: 60 };
    this.Height = opts.height || 700;
    this.convention = opts.convention || "classical";
    this.mollier = createMollier(this.convention);
    this.pressure = opts.pressure || 101325;
    this.domainX = opts.domainX || [0, 0.02];   // kg/kg
    this.domainY = opts.domainY || [-20, 50];   // degC
    this.lineOpts = Object.assign({
      showTemperature: true, showDensity: true, showRelHumidity: true,
      showEnthalpy: true, showAbsHumidity: true,
      xAxisTitle: "absolute water content x [g/kg]"
    }, opts.lineOpts || {});
    this.seasonColors = opts.seasonColors || DEFAULT_SEASON_COLORS;
    this.seasonLabels = opts.seasonLabels || DEFAULT_SEASON_LABELS;
    this.radius = opts.radius || 5;

    // overlay state
    this._data = [];          // computed point records {x,y,season,time,...}
    this._comfort = null;     // {t,phi,x}
    this._orange = null;
    this._red = null;
    this._freq = { show: false, days: false, smoothing: 4 };
    this._chain = [];         // process-chain states
    this._freqCache = null;
    this._timeFormat = d3.utcFormat("%Y-%m-%d %H:%M");

    this._buildSkeleton();
    this._drawGrid();
  }

  // --- skeleton + scales --------------------------------------------------
  _measureWidth() {
    let info = this.container.node().getBoundingClientRect();
    let ph = this.container.append("svg").attr("width", info.width).attr("height", this.Height);
    info = this.container.node().getBoundingClientRect();
    ph.node().remove();
    return info.width || 900;
  }

  _buildSkeleton() {
    this.Width = this._measureWidth();
    this.width = this.Width - this.margin.left - this.margin.right;
    this.height = this.Height - this.margin.top - this.margin.bottom;

    this.canvas = this.container.append("svg")
      .attr("display", "block").attr("width", this.Width).attr("height", this.Height);

    this.background = this.canvas.append("g").attr("id", "theplot");

    let clipId = "hxclip";
    this.canvas.append("defs").append("clipPath").attr("id", clipId)
      .append("rect").attr("width", this.width).attr("height", this.height);
    // arrow marker for the process chain
    this.canvas.select("defs").append("marker")
      .attr("id", "hx-arrow").attr("viewBox", "0 0 10 10")
      .attr("refX", 9).attr("refY", 5).attr("markerWidth", 6).attr("markerHeight", 6)
      .attr("orient", "auto").append("path").attr("d", "M 0 0 L 10 5 L 0 10 z").attr("fill", "#444");

    this.plot = this.canvas.append("g")
      .attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")")
      .attr("clip-path", "url(#" + clipId + ")");

    // overlay layers, in z-order
    this.comfortLayer = this.plot.append("g").attr("class", "hx-comfort");
    this.bandOrangeLayer = this.plot.append("g").attr("class", "hx-band-orange");
    this.bandRedLayer = this.plot.append("g").attr("class", "hx-band-red");
    this.freqLines = this.plot.append("g").attr("class", "hx-freq");
    this.scatterLayer = this.plot.append("g").attr("class", "hx-scatter");
    this.chainLayer = this.plot.append("g").attr("class", "hx-chain");
    this.freqHover = this.plot.append("g").attr("class", "hx-freq-hover");
    this.freqLabels = this.plot.append("g").attr("class", "hx-freq-labels").style("pointer-events", "none");
    this.tipLayer = this.plot.append("g").attr("class", "hx-tip").style("pointer-events", "none");

    this.x = d3.scaleLinear().range([0, this.width]).domain(this.domainX);
    this.y = d3.scaleLinear().range([this.height, 0]).domain(this.domainY);
    this.line = d3.line().x((d) => this.x(d.x)).y((d) => this.y(d.y));
  }

  // --- grid (expensive; only on grid-affecting changes) -------------------
  _drawGrid() {
    let old = this.background.select("#hx_mollier_diagram");
    if (!old.empty()) old.remove();
    drawHXCoordinates(this.background, this.Width, this.Height, this.margin,
      this.domainX, this.domainY, this.pressure, this.mollier, this.lineOpts);
    this._drawInfo();
  }

  _drawInfo() {
    let diag = this.background.select("#hx_mollier_diagram");
    if (diag.empty()) return;
    let alt = (1 - Math.pow(Number(this.pressure) / 101325, 1 / 5.25588)) / 2.25577e-5;
    let g = diag.append("g").style("font-family", "Tahoma, Geneva, sans-serif");
    g.append("text").attr("x", this.margin.left + this.width).attr("y", this.margin.top - 22)
      .attr("text-anchor", "end").attr("fill", "#4d4d4d").attr("font-size", 12).text(alt.toFixed(0) + " m a.s.l.");
    g.append("text").attr("x", this.margin.left + this.width).attr("y", this.margin.top - 8)
      .attr("text-anchor", "end").attr("fill", "#4d4d4d").attr("font-size", 12).text((this.pressure / 100).toFixed(0) + " hPa");
  }

  // --- grid-affecting setters --------------------------------------------
  setDomain(domainX, domainY) {
    if (domainX) this.domainX = domainX;
    if (domainY) this.domainY = domainY;
    this.x.domain(this.domainX); this.y.domain(this.domainY);
    this._drawGrid();
    this._repositionOverlays();
    return this;
  }
  setCoordinateLines(lineOpts) {
    Object.assign(this.lineOpts, lineOpts);
    this._drawGrid();
    return this;
  }
  setPressure(p) {
    this.pressure = Number(p);
    this._recomputeData();
    this._drawGrid();
    this._redrawAllOverlays();
    return this;
  }
  setConvention(c) {
    this.convention = c;
    this.mollier = createMollier(c);
    this._recomputeData();
    this._drawGrid();
    this._redrawAllOverlays();
    return this;
  }
  setHeight(h) {
    this.Height = Number(h);
    this.resize();
    return this;
  }
  resize() {
    this.Width = this._measureWidth();
    this.width = this.Width - this.margin.left - this.margin.right;
    this.height = this.Height - this.margin.top - this.margin.bottom;
    this.canvas.attr("width", this.Width).attr("height", this.Height);
    this.canvas.select("#hxclip rect").attr("width", this.width).attr("height", this.height);
    this.x.range([0, this.width]); this.y.range([this.height, 0]);
    this._drawGrid();
    this._redrawAllOverlays();
    return this;
  }

  // --- data (measurement point cloud) ------------------------------------
  setData(records) {
    this._rawData = records || [];
    this._freqCache = null;
    this._recomputeData();
    this._drawScatter();
    this._drawFreqLines();
    return this;
  }

  _recomputeData() {
    let out = [];
    (this._rawData || []).forEach((d) => {
      let t = d.t != null ? d.t : d.temperature;
      let rh = d.rh != null ? d.rh : d.humidity;          // percent
      let date = toDate(d.time != null ? d.time : d.timestamp);
      if (t == null || rh == null) return;
      let e = this.mollier.get_x_y(+t, +rh / 100, this.pressure);
      if (!isFinite(e.x) || !isFinite(e.y)) return;
      e.season = date ? seasonIndex(date) : 0;
      e.time = date;
      out.push(e);
    });
    this._data = out;
    this._freqCache = null;
  }

  _drawScatter() {
    let self = this, x = this.x, y = this.y;
    let sel = this.scatterLayer.selectAll("circle").data(this._data);
    sel.exit().remove();
    sel.enter().append("circle")
      .attr("r", this.radius).attr("opacity", 0.4).attr("shape-rendering", "optimizeSpeed")
      .on("mouseover", function (d) { d3.select(this).attr("r", self.radius * 1.6); self._showPointTip(d); })
      .on("mouseout", function () { d3.select(this).attr("r", self.radius); self._hideTip(); })
      .merge(sel)
      .attr("cx", (d) => x(d.x)).attr("cy", (d) => y(d.y))
      .attr("fill", (d) => self.seasonColors[d.season] || "#999");
  }

  _positionScatter() {
    let x = this.x, y = this.y;
    this.scatterLayer.selectAll("circle").attr("cx", (d) => x(d.x)).attr("cy", (d) => y(d.y));
  }

  // --- comfort zone + warning bands --------------------------------------
  setComfort(zone) { this._comfort = zone; this._drawComfort(); return this; }
  setBands(orange, red) { this._orange = orange || null; this._red = red || null; this._drawBands(); return this; }

  _drawComfort() {
    let g = this.comfortLayer;
    if (!this._comfort) { g.selectAll("path").remove(); return; }
    let z = this._comfort;
    let pathos = createComfort(z.t, z.phi.map((v) => v), z.x, this.pressure, this.mollier);
    let sel = g.selectAll("path").data([pathos]);
    sel.enter().append("path").attr("fill", "yellowgreen").attr("fill-opacity", 0.4).attr("stroke", "yellowgreen")
      .merge(sel).attr("d", this.line);
  }

  _drawBand(layer, band) {
    if (!band) { layer.selectAll("path").remove(); return; }
    let pb = createComfort(band.t, band.phi, band.x || [0, 0.03], this.pressure, this.mollier);
    let sel = layer.selectAll("path").data([pb]);
    sel.enter().append("path").attr("fill", "none").attr("stroke-width", 1.8).attr("stroke-dasharray", "7,4")
      .merge(sel).attr("d", this.line).attr("stroke", band.color || "#E67E22");
  }
  _drawBands() { this._drawBand(this.bandOrangeLayer, this._orange); this._drawBand(this.bandRedLayer, this._red); }

  // --- process chain ------------------------------------------------------
  setProcessChain(states) { this._chain = states || []; this._drawChain(); return this; }

  _drawChain() {
    let self = this, x = this.x, y = this.y;
    this.chainLayer.selectAll("*").remove();
    let sp = this._chain;
    if (!sp || sp.length === 0) return;
    for (let i = 1; i < sp.length; i++) {
      this.chainLayer.append("line")
        .attr("x1", x(sp[i - 1].x)).attr("y1", y(sp[i - 1].y))
        .attr("x2", x(sp[i].x)).attr("y2", y(sp[i].y))
        .attr("stroke", "#444").attr("stroke-width", 2).attr("marker-end", "url(#hx-arrow)");
    }
    let nodes = this.chainLayer.selectAll("g.state").data(sp).enter().append("g").attr("class", "state")
      .attr("transform", (d) => "translate(" + x(d.x) + "," + y(d.y) + ")").style("cursor", "pointer")
      .on("mouseover", function (d) { self._showChainTip(d); })
      .on("mouseout", function () { self._hideTip(); });
    nodes.append("circle").attr("r", 11).attr("fill", "#222").attr("stroke", "white").attr("stroke-width", 2);
    nodes.append("text").attr("text-anchor", "middle").attr("dy", "0.35em")
      .attr("fill", "white").attr("font-size", "11px").attr("font-weight", "bold").text((d) => d.number);
  }

  // --- frequency contour lines -------------------------------------------
  setFrequency(opts) {
    this._freq = Object.assign({ show: false, days: false, smoothing: 4 }, opts || {});
    this._drawFreqLines();
    return this;
  }

  _buildFreqContours(useDays) {
    if (this._freqCache && this._freqCache.ref === this._data && this._freqCache.useDays === useDays)
      return this._freqCache.levels;
    let self = this, nx = FREQ_NX, ny = FREQ_NY, data = this._data;
    let dayKey = (d) => Math.floor(d.time.getTime() / 86400000);
    let raw0 = new Array(nx * ny).fill(0), recs = [];
    data.forEach(function (d) {
      let t = self.mollier.temperature(d.x, d.y);
      let ix = Math.floor((d.x - FREQ_XMIN) / FREQ_DX), iy = Math.floor((t - FREQ_TMIN) / FREQ_DT);
      if (ix < 0 || ix >= nx || iy < 0 || iy >= ny) return;
      let cell = iy * nx + ix; raw0[cell] += 1;
      recs.push({ cell: cell, dk: (useDays && d.time) ? dayKey(d) : 0 });
    });
    let rawGrid = new Array(nx * ny).fill(0), dayGrid = useDays ? new Array(nx * ny) : null, allDays = useDays ? new Set() : null;
    recs.forEach(function (r) {
      if (raw0[r.cell] < FREQ_MIN_CELL_HOURS) return;
      rawGrid[r.cell] += 1;
      if (useDays) { (dayGrid[r.cell] || (dayGrid[r.cell] = [])).push(r.dk); allDays.add(r.dk); }
    });
    let totalH = d3.sum(rawGrid);
    let empty = { ref: data, useDays: useDays, levels: [] };
    if (totalH < 3) { this._freqCache = empty; return empty.levels; }
    let densGrid = gaussBlur2D(rawGrid, nx, ny, FREQ_SIGMA);
    let foot = softFootprint(rawGrid, nx, ny, FREQ_FOOT_R, FREQ_FOOT_SIGMA);
    for (let i = 0; i < densGrid.length; i++) densGrid[i] *= foot[i];
    let total = useDays ? allDays.size : totalH;
    let targets = (useDays ? FREQ_TARGETS_DAYS : FREQ_TARGETS_HOURS).filter((t) => t < total);
    if (!targets.length) { this._freqCache = empty; return empty.levels; }
    let cells = [];
    for (let i = 0; i < densGrid.length; i++) cells.push({ key: densGrid[i] + i * 1e-9, h: rawGrid[i], days: useDays ? (dayGrid[i] || null) : null });
    cells.sort((a, b) => a.key - b.key);
    let thr = [], ti = 0, cum = 0, union = useDays ? new Set() : null;
    for (let k = 0; k < cells.length && ti < targets.length; k++) {
      if (useDays) { let ds = cells[k].days; if (ds) for (let q = 0; q < ds.length; q++) union.add(ds[q]); cum = union.size; }
      else cum += cells[k].h;
      while (ti < targets.length && cum >= targets[ti]) {
        let dv = cells[k].key;
        if (thr.length === 0 || dv > thr[thr.length - 1].value) thr.push({ value: dv, label: targets[ti] });
        else thr[thr.length - 1].label = targets[ti];
        ti++;
      }
    }
    let rawC = d3.contours().size([nx, ny]).thresholds(thr.map((o) => o.value))(densGrid);
    let levels = rawC.map(function (c, idx) {
      let rings = [];
      c.coordinates.forEach((poly) => poly.forEach((ring) => { if (Math.abs(ringArea(ring)) >= MIN_RING_AREA) rings.push(ring); }));
      return { label: thr[idx] ? thr[idx].label : Math.round(c.value), rings: rings };
    });
    this._freqCache = { ref: data, useDays: useDays, levels: levels };
    return levels;
  }

  _updateSaturationClip() {
    let sat = [], t0 = this.domainY[0] - 3, t1 = this.domainY[1] + 3, ns = 120;
    for (let i = 0; i <= ns; i++) {
      let t = t0 + (t1 - t0) * i / ns;
      let s = this.mollier.get_x_y(t, 1, this.pressure);
      sat.push([this.x(s.x), this.y(s.y)]);
    }
    let pad = Math.max(this.width, this.height) + 200;
    let pts = [[-pad, this.height + pad]].concat(sat).concat([[this.width + pad, -pad], [-pad, -pad]]);
    let cp = this.canvas.select("#hxFreqSatClip");
    if (cp.empty()) cp = this.canvas.append("clipPath").attr("id", "hxFreqSatClip");
    cp.selectAll("polygon").remove();
    cp.append("polygon").attr("points", pts.map((q) => q.join(",")).join(" "));
  }

  _drawFreqLines() {
    let self = this, x = this.x, y = this.y;
    this.freqLines.selectAll("*").remove();
    this.freqLabels.selectAll("*").remove();
    this.freqHover.selectAll("*").remove();
    if (!this._freq.show || this._data.length === 0) return;
    let useDays = !!this._freq.days;
    let levels = this._buildFreqContours(useDays);
    if (!levels.length) return;
    let iters = Math.max(0, Math.min(60, Math.round((this._freq.smoothing - 0.6) * 4)));
    let contours = levels.map((L) => ({ c: { type: "MultiPolygon", coordinates: [L.rings.map((r) => smoothRing(r, iters))] }, label: L.label }));
    function gridToScreen(gx, gy) {
      let xv = FREQ_XMIN + gx * FREQ_DX, Tv = FREQ_TMIN + gy * FREQ_DT;
      let yv = self.mollier.get_x_y_tx(Tv, xv, self.pressure).y;
      return [x(xv), y(yv)];
    }
    let smoothLine = d3.line().curve(d3.curveBasisClosed);
    function contourPath(mp) {
      let dstr = "";
      mp.coordinates.forEach((poly) => poly.forEach((ring) => {
        let r = ring;
        if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r = r.slice(0, -1);
        if (r.length < 3) return;
        let s = smoothLine(r.map((pp) => gridToScreen(pp[0], pp[1])));
        if (s) dstr += s + " ";
      }));
      return dstr;
    }
    this._updateSaturationClip();
    let pathsG = this.freqLines.append("g").attr("clip-path", "url(#hxFreqSatClip)");
    pathsG.selectAll("path").data(contours).enter().append("path")
      .attr("d", (d) => contourPath(d.c)).attr("fill", "none").attr("stroke", "#333").attr("stroke-width", 1.6);
    let hitG = this.freqHover.append("g").attr("clip-path", "url(#hxFreqSatClip)");
    hitG.selectAll("path").data(contours).enter().append("path")
      .attr("d", (d) => contourPath(d.c)).attr("fill", "none").attr("stroke", "transparent").attr("stroke-width", 8)
      .style("pointer-events", "stroke").style("cursor", "crosshair")
      .on("mouseover mousemove", function (d) { self._showFreqTip(d.label, useDays); })
      .on("mouseout", function () { self._hideTip(); });
    let labelG = this.freqLabels.append("g").attr("font-family", "helvetica").attr("font-size", 13).attr("font-weight", "bold");
    contours.forEach(function (d) {
      let pt = topPointOfContour(d.c); if (!pt) return;
      let s = gridToScreen(pt[0], pt[1]);
      let g = labelG.append("g").attr("transform", "translate(" + s[0] + "," + s[1] + ")");
      let txt = g.append("text").attr("text-anchor", "middle").attr("dy", "0.32em").attr("fill", "#111").text(d.label);
      let bb = txt.node().getBBox();
      g.insert("rect", "text").attr("x", bb.x - 3).attr("y", bb.y - 1).attr("width", bb.width + 6).attr("height", bb.height + 2)
        .attr("rx", 2).attr("fill", "white").attr("opacity", 0.92).attr("stroke", "#ddd").attr("stroke-width", 0.5);
    });
  }

  // --- reposition / redraw helpers ---------------------------------------
  _repositionOverlays() {
    this._positionScatter();
    this._drawComfort();
    this._drawBands();
    this._drawChain();
    this._drawFreqLines();
  }
  _redrawAllOverlays() {
    this._drawScatter();
    this._drawComfort();
    this._drawBands();
    this._drawChain();
    this._drawFreqLines();
  }

  // --- SVG tooltip (embed-safe; no HTML div) ------------------------------
  _showTip(px, py, lines, bg) {
    let g = this.tipLayer; g.selectAll("*").remove();
    let lh = 16, padX = 8, padY = 6;
    let rect = g.append("rect").attr("rx", 4).attr("fill", bg || "whitesmoke").attr("stroke", "#cbd5e1");
    let texts = g.append("g");
    lines.forEach((t, i) => texts.append("text").attr("x", 0).attr("y", i * lh)
      .attr("font-size", 13).attr("font-family", "helvetica").attr("font-weight", i === 0 ? "bold" : "normal")
      .attr("fill", bg ? "white" : "#111").text(t));
    let bb = texts.node().getBBox();
    let tx = Math.min(px + 16, this.width - bb.width - padX * 2 - 4);
    let ty = Math.max(py - bb.height - padY, 4);
    texts.attr("transform", "translate(" + (tx + padX) + "," + (ty + padY - bb.y) + ")");
    rect.attr("x", tx).attr("y", ty).attr("width", bb.width + padX * 2).attr("height", bb.height + padY * 2);
    g.raise();
  }
  _hideTip() { this.tipLayer.selectAll("*").remove(); }

  _showPointTip(d) {
    let X = d.x, Y = d.y, temp = this.mollier.temperature(X, Y), phi = this.mollier.rel_humidity(X, Y, this.pressure);
    let hh = this.mollier.enthalpy(X, Y), tdp = this.mollier.temperature_p_sat(phi * this.mollier.p_sat(temp));
    this._showTip(this.x(X), this.y(Y), [
      d.time ? this._timeFormat(d.time) : "",
      "x:  " + (X * 1000).toFixed(2) + " g/kg",
      "T:  " + temp.toFixed(2) + " °C",
      "φ:  " + (phi * 100).toFixed(1) + " %",
      "h:  " + hh.toFixed(2) + " kJ/kg",
      "Td: " + tdp.toFixed(2) + " °C"
    ].filter((s) => s !== ""));
  }
  _showChainTip(d) {
    this._showTip(this.x(d.x), this.y(d.y),
      [d.label, "T: " + d.t + " °C", "φ: " + d.phi + " %", "x: " + d.xg + " g/kg", "h: " + d.h + " kJ/kg"], "#222");
  }
  _showFreqTip(label, useDays) {
    let m = d3.mouse(this.plot.node());
    this._showTip(m[0], m[1], [label + (useDays ? " days/year outside" : " h/year outside")], "#222");
  }

  destroy() { this.canvas.remove(); }
}

// Expose globally (the bundle is loaded as plain <script>s, like the rest).
if (typeof window !== "undefined") window.MollierChart = MollierChart;

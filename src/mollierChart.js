// MollierChart — a stateful Mollier h,x chart for fast, incremental updates.
//
// The expensive coordinate grid (iso-lines + labels) is drawn ONCE and only
// re-drawn when something it depends on changes (domain, convention, pressure,
// line visibility, size). Everything else — measurement points, comfort zone,
// warning bands, frequency contours, the process chain — lives in its own SVG
// layer and is updated in place via D3 data-joins, so dragging a slider or
// toggling a zone never rebuilds the grid.
//
// Depends (same bundle / global, D3 v7):
//   createMollier(convention)          — mollierFunctions.js
//   drawHXCoordinates(...)             — coordinateGenerator.js
//   createComfort(rangeT,rangePhi,rangeX,p,mollier) — drawComfort.js
//   hxDrawOutdoor / hxDrawStatePoint / hxTexts ...  — drawComfort.js
//   hxProjection / HX_UNITS            — hxUnits.js
//
// Usage:
//   const chart = new MollierChart("#chart", { height: 700 });
//   chart.setData(records);                 // [{t,rh,time}, ...]  (rh in %)
//   chart.setComfort({t:[20,26], phi:[30,65], x:[0,11.5]});
//   chart.setBands(orange, red);            // each {t,phi,x,color,label}|null
//   chart.setFrequency({show:true, days:false, smoothing:4});
//   chart.setProcessChain(states);          // [{x,y,number,label,t,phi,xg,h}]
//   chart.setDomain([0,0.02], [-15,40]);    // grid redraw (rare)
//   chart.setCurrent({t:22.5, rh:48});      // room point (edge arrow if off-axis)
//   chart.setOutdoor({t:4, rh:85});         // outside air + ventilation line/note
//   chart.setTexts({outdoor:"Aussenluft"}); // any user-visible text
//   chart.setCaptions({temperature:"Temperatur ϑ [°C]"}); // grid captions
//   chart.setOrientation("psychrometric");  // ASHRAE layout (grid redraw)
//   chart.setUnits("ip");                   // °F, gr/lb, Btu/lb (grid redraw)

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

// User-visible texts of MollierChart (English defaults) on top of the overlay
// texts in HX_DEFAULT_TEXTS (outdoor, ventilation_*, state_value, ...).
// Override any of them via opts.texts or chart.setTexts({...}).
const MOLLIER_CHART_DEFAULT_TEXTS = {
  now: "Now",                                // tooltip title of the room point
  tip_x: "x", tip_t: "T", tip_phi: "φ", tip_h: "h", tip_td: "Td",   // tooltip row labels
  freq_hours: "{n} h/year outside",          // frequency-line tooltip
  freq_days: "{n} days/year outside",
  altitude: "{alt} m a.s.l.",                // info top right; "" hides it
  pressure: "{hpa} hPa"                      // placeholders: {alt} (m), {alt_ft},
};                                           // {hpa}, {inhg}, {pa}

// Defaults that differ for units 'ip' (merged over the texts above).
const MOLLIER_CHART_DEFAULT_TEXTS_IP = {
  altitude: "{alt_ft} ft",
  pressure: "{inhg} inHg"
};

// Default title of the humidity axis of MollierChart, per units.
const MOLLIER_CHART_X_TITLE = { si: "absolute water content x [g/kg]", ip: "humidity ratio W [gr/lb]" };

let mollierChartCounter = 0;

function toDate(v) {
  if (v == null) return null;
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
    this.orientation = hxOrientation(opts.orientation);   // 'mollier' | 'psychrometric'
    this.units = hxIsIP(opts.units) ? "ip" : "si";
    // The default humidity-axis title follows the units unless one is given.
    this._defaultXTitle = !(opts.lineOpts && opts.lineOpts.xAxisTitle != null);
    this.lineOpts = Object.assign({
      showTemperature: true, showDensity: true, showRelHumidity: true,
      showEnthalpy: true, showAbsHumidity: true,
      xAxisTitle: MOLLIER_CHART_X_TITLE[this.units]
    }, opts.lineOpts || {});
    if (opts.captions) this.lineOpts.captions = Object.assign({}, this.lineOpts.captions || {}, opts.captions);
    this._userTexts = Object.assign({}, opts.texts || {});
    this._resolveTexts();
    this._uid = "hx" + (++mollierChartCounter);
    this.seasonColors = opts.seasonColors || DEFAULT_SEASON_COLORS;
    this.seasonLabels = opts.seasonLabels || DEFAULT_SEASON_LABELS;
    this.radius = opts.radius || 5;

    // overlay state
    this._data = [];          // computed point records {x,y,season,time,...}
    this._showPoints = opts.showPoints !== false;   // default true
    this._mean = { h: false, t: false };   // mean-enthalpy / mean-temperature curves
    this._comfort = null;     // {t,phi,x}
    this._orange = null;
    this._red = null;
    this._freq = { show: false, days: false, smoothing: 4 };
    this._chain = [];         // process-chain states
    this._current = null;     // room point (raw input, see hxState)
    this._currentOpts = {};
    this._outdoor = null;     // outside point (raw input)
    this._outdoorOpts = {};
    this._outdoorResult = null;
    this._freqCache = null;
    this._timeFormat = d3.utcFormat("%Y-%m-%d %H:%M");

    this._buildSkeleton();
    this._drawGrid();
  }

  // Defaults for the units, then the user's texts.
  _resolveTexts() {
    let ip = this.units === "ip";
    this._texts = Object.assign({}, MOLLIER_CHART_DEFAULT_TEXTS, ip ? MOLLIER_CHART_DEFAULT_TEXTS_IP : {},
      hxTexts(null, this.units), this._userTexts);
  }

  // Screen mapping (hxProjection) for the current size, domain and
  // orientation. this.x / this.y are its scales (x: kg/kg -> px along the
  // humidity axis, y: diagram-y -> px along the temperature axis); use
  // this.project(x, y) -> [px, py] for screen positions.
  _setProjection() {
    this.proj = hxProjection(this.width, this.height, this.domainX, this.domainY, this.orientation);
    this.x = this.proj.xScale;
    this.y = this.proj.yScale;
    this.project = this.proj.project;
    this.line = this.proj.line;
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

    // Ids are unique per chart, so several charts can share one page.
    let clipId = this._uid + "-clip";
    this._clipId = clipId;
    this._arrowId = this._uid + "-arrow";
    this._satClipId = this._uid + "-freqsat";
    let clipUrl = hxAddClipPath(this.canvas, clipId, this.width, this.height);
    // arrow marker for the process chain
    this.canvas.select("defs").append("marker")
      .attr("id", this._arrowId).attr("viewBox", "0 0 10 10")
      .attr("refX", 9).attr("refY", 5).attr("markerWidth", 6).attr("markerHeight", 6)
      .attr("orient", "auto").append("path").attr("d", "M 0 0 L 10 5 L 0 10 z").attr("fill", "#444");

    this.plot = this.canvas.append("g")
      .attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")")
      .attr("clip-path", clipUrl);

    // overlay layers, in z-order
    this.comfortLayer = this.plot.append("g").attr("class", "hx-comfort");
    this.bandOrangeLayer = this.plot.append("g").attr("class", "hx-band-orange");
    this.bandRedLayer = this.plot.append("g").attr("class", "hx-band-red");
    this.freqLines = this.plot.append("g").attr("class", "hx-freq");
    this.scatterLayer = this.plot.append("g").attr("class", "hx-scatter");
    this.meanLayer = this.plot.append("g").attr("class", "hx-mean");
    this.chainLayer = this.plot.append("g").attr("class", "hx-chain");
    this.freqHover = this.plot.append("g").attr("class", "hx-freq-hover");
    this.freqLabels = this.plot.append("g").attr("class", "hx-freq-labels").style("pointer-events", "none");
    // Unclipped layers on top: room/outside points (edge arrows sit on the
    // border of the axes, the ventilation note just above them) and tooltip.
    this.top = this.canvas.append("g").attr("class", "hx-top")
      .attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")");
    this.pointLayer = this.top.append("g").attr("class", "hx-points");
    this.tipLayer = this.top.append("g").attr("class", "hx-tip").style("pointer-events", "none");

    this._setProjection();
  }

  // --- grid (expensive; only on grid-affecting changes) -------------------
  _drawGrid() {
    let old = this.background.select("#hx_mollier_diagram");
    if (!old.empty()) old.remove();
    let lo = Object.assign({}, this.lineOpts, { orientation: this.orientation, units: this.units });
    drawHXCoordinates(this.background, this.Width, this.Height, this.margin,
      this.domainX, this.domainY, this.pressure, this.mollier, lo);
    this._drawInfo();
  }

  _drawInfo() {
    let diag = this.background.select("#hx_mollier_diagram");
    if (diag.empty()) return;
    let alt = (1 - Math.pow(Number(this.pressure) / 101325, 1 / 5.25588)) / 2.25577e-5;
    let g = diag.append("g").attr("class", "hx-info").style("font-family", "Tahoma, Geneva, sans-serif");
    let U = HX_UNITS, pa = Number(this.pressure);
    let v = { alt: alt.toFixed(0), alt_ft: U.mToFt(alt).toFixed(0),
              hpa: (this.pressure / 100).toFixed(0), inhg: U.paToInhg(pa).toFixed(2), pa: pa.toFixed(0) };
    let lines = [hxFormat(this._texts.altitude || "", v),
                 hxFormat(this._texts.pressure || "", v)]
      .filter((t) => t !== "");
    lines.forEach((t, i) => {
      g.append("text").attr("x", this.margin.left + this.width).attr("y", this.margin.top - 8 - 14 * (lines.length - 1 - i))
        .attr("text-anchor", "end").attr("fill", "#4d4d4d").attr("font-size", 12).text(t);
    });
  }

  // --- grid-affecting setters --------------------------------------------
  setDomain(domainX, domainY) {
    if (domainX) this.domainX = domainX;
    if (domainY) this.domainY = domainY;
    this._setProjection();
    this._drawGrid();
    this._repositionOverlays();
    return this;
  }
  setCoordinateLines(lineOpts) {
    Object.assign(this.lineOpts, lineOpts);
    this._drawGrid();
    return this;
  }
  // Caption texts of the grid, see HX_DEFAULT_CAPTIONS (merged; "" hides one).
  setCaptions(captions) {
    this.lineOpts.captions = Object.assign({}, this.lineOpts.captions || {}, captions || {});
    this._drawGrid();
    return this;
  }
  // Any user-visible text (MOLLIER_CHART_DEFAULT_TEXTS + HX_DEFAULT_TEXTS), merged.
  setTexts(texts) {
    Object.assign(this._userTexts, texts || {});
    this._resolveTexts();
    this._drawGrid();
    this._drawPoints();
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
  // 'mollier' (default) or 'psychrometric' (ASHRAE: temperature horizontal,
  // humidity ratio vertical with its scale on the right). Grid redraw.
  setOrientation(orientation) {
    this.orientation = hxOrientation(orientation);
    this._setProjection();
    this._drawGrid();
    this._redrawAllOverlays();
    if (this._clickCatcher) this._clickCatcher.raise();
    return this;
  }
  // 'si' (default) or 'ip' (°F, gr/lb, Btu/lb, lb/ft³, ft, inHg): ticks,
  // labels, captions, tooltips and texts. The data stay SI. Grid redraw.
  setUnits(units) {
    this.units = hxIsIP(units) ? "ip" : "si";
    if (this._defaultXTitle) this.lineOpts.xAxisTitle = MOLLIER_CHART_X_TITLE[this.units];
    this._resolveTexts();
    this._drawGrid();
    this._drawPoints();
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
    hxAddClipPath(this.canvas, this._clipId, this.width, this.height);
    this._setProjection();
    this._drawGrid();
    this._redrawAllOverlays();
    if (this._clickCatcher) this._clickCatcher.attr("width", this.width).attr("height", this.height).raise();
    return this;
  }

  // --- data (measurement point cloud) ------------------------------------
  setData(records) {
    this._rawData = records || [];
    this._freqCache = null;
    this._recomputeData();
    this._drawScatter();
    this._drawFreqLines();
    this._drawMeanLines();
    return this;
  }

  // Show/hide the measurement points without touching the frequency contours,
  // so one can keep just the contour lines.
  setShowPoints(v) {
    this._showPoints = !!v;
    this.scatterLayer.style("display", this._showPoints ? null : "none");
    return this;
  }

  // Enable click-to-add: clicking the plot calls cb({t, rh, x}) with the
  // temperature [°C], relative humidity [%] and absolute humidity [kg/kg] at the
  // clicked position (always SI). Pass null to disable. A transparent catcher on top makes
  // the whole plot area clickable (teaching/interactive use).
  onPlotClick(cb) {
    this._clickCb = cb || null;
    if (!cb) {
      if (this._clickCatcher) { this._clickCatcher.remove(); this._clickCatcher = null; }
      return this;
    }
    let self = this;
    if (!this._clickCatcher) {
      this._clickCatcher = this.plot.append("rect").attr("class", "hx-clickcatch")
        .attr("x", 0).attr("y", 0).attr("fill", "transparent").style("cursor", "crosshair");
    }
    this._clickCatcher.attr("width", this.width).attr("height", this.height).raise()
      .on("click", function (event) {
        let m = d3.pointer(event, this);
        let q = self.proj.invert(m[0], m[1]), xv = q[0], yv = q[1];
        let T = self.mollier.temperature(xv, yv);
        let rh = self.mollier.rel_humidity(xv, yv, self.pressure) * 100;
        rh = Math.max(0, Math.min(100, rh));
        if (self._clickCb) self._clickCb({ t: Math.round(T * 10) / 10, rh: Math.round(rh * 10) / 10, x: xv });
      });
    return this;
  }

  // Mean-value trajectories over the point cloud, like the classic diagram:
  //   h_m = mean enthalpy per temperature bin   (orange, label hm)
  //   t_m = mean temperature per enthalpy bin    (blue,   label tm)
  setMeanLines(opts) {
    this._mean = Object.assign({ h: false, t: false }, opts || {});
    this._drawMeanLines();
    return this;
  }

  _drawMeanLines() {
    let self = this, P = this.project;
    this.meanLayer.selectAll("*").remove();
    if (this._data.length === 0 || (!this._mean.h && !this._mean.t)) return;

    // Bin points by rounded keyFn and return the mean (x,y) per bin, ordered.
    function meanCurve(keyFn) {
      let bins = {};
      self._data.forEach(function (d) {
        let k = Math.round(keyFn(d));
        if (!bins[k]) bins[k] = { sx: 0, sy: 0, n: 0, k: k };
        bins[k].sx += d.x; bins[k].sy += d.y; bins[k].n += 1;
      });
      return Object.keys(bins).map((kk) => bins[kk])
        .filter((b) => b.n >= 1).sort((a, b) => a.k - b.k)
        .map((b) => ({ x: b.sx / b.n, y: b.sy / b.n }));
    }
    function smooth(pts, w) {
      if (pts.length < 3) return pts;
      let h = Math.floor(w / 2), out = [];
      for (let i = 0; i < pts.length; i++) {
        let sx = 0, sy = 0, n = 0;
        for (let j = i - h; j <= i + h; j++) { if (j < 0 || j >= pts.length) continue; sx += pts[j].x; sy += pts[j].y; n++; }
        out.push({ x: sx / n, y: sy / n });
      }
      return out;
    }
    let lineGen = d3.line().x((d) => P(d.x, d.y)[0]).y((d) => P(d.x, d.y)[1]).curve(d3.curveCatmullRom);
    function drawCurve(pts, color, mainChar, dyLabel) {
      if (pts.length < 2) return;
      self.meanLayer.append("path").datum(pts).attr("d", lineGen)
        .attr("fill", "none").attr("stroke", color).attr("stroke-width", 2.5);
      let last = pts[pts.length - 1], lp = P(last.x, last.y);
      let txt = self.meanLayer.append("text")
        .attr("x", lp[0] + 7).attr("y", lp[1] + dyLabel)
        .attr("font-family", "helvetica").attr("font-size", 15).attr("font-style", "italic")
        .attr("fill", color).attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke");
      txt.append("tspan").text(mainChar);
      txt.append("tspan").attr("baseline-shift", "sub").attr("font-size", "10").text("m");
    }
    if (this._mean.h)
      drawCurve(smooth(meanCurve((d) => this.mollier.temperature(d.x, d.y)), 5), "#f97316", "h", -4);
    if (this._mean.t)
      drawCurve(smooth(meanCurve((d) => this.mollier.enthalpy(d.x, d.y)), 5), "#2563eb", "t", 14);
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
    let self = this, P = this.project;
    this.scatterLayer.style("display", this._showPoints ? null : "none");
    let sel = this.scatterLayer.selectAll("circle").data(this._data);
    sel.exit().remove();
    sel.enter().append("circle")
      .attr("r", this.radius).attr("opacity", 0.4).attr("shape-rendering", "optimizeSpeed")
      .on("mouseover", function (event, d) { d3.select(this).attr("r", self.radius * 1.6); self._showPointTip(d); })
      .on("mouseout", function () { d3.select(this).attr("r", self.radius); self._hideTip(); })
      .merge(sel)
      .attr("cx", (d) => P(d.x, d.y)[0]).attr("cy", (d) => P(d.x, d.y)[1])
      .attr("fill", (d) => self.seasonColors[d.season] || "#999");
  }

  _positionScatter() {
    let P = this.project;
    this.scatterLayer.selectAll("circle").attr("cx", (d) => P(d.x, d.y)[0]).attr("cy", (d) => P(d.x, d.y)[1]);
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

  // --- room point, outside air and ventilation ---------------------------
  // Current room state as {t, rh} (rh in %), {t, phi} (0..1) or {x, y}; null
  // removes it. Drawn black on top; outside the axes as an edge arrow with
  // its value. opts: {color}.
  setCurrent(state, opts) {
    this._current = state || null;
    this._currentOpts = opts || {};
    this._drawPoints();
    return this;
  }

  // Outside air as {t, rh} / {t, phi} / {x, y}; null removes it. Hollow blue
  // circle (edge arrow when off-axis), plus — when a room point is set — the
  // dashed ventilation line and the note "ventilating dries / adds moisture /
  // no change" above the axes. opts: {color, ventilationLine (true),
  // note (true), threshold (0.0003 kg/kg), room (overrides setCurrent)}.
  setOutdoor(state, opts) {
    this._outdoor = state || null;
    this._outdoorOpts = opts || {};
    this._drawPoints();
    return this;
  }

  // 'dries' | 'humidifies' | 'neutral' | null (no outside or room point).
  ventilationEffect() {
    let room = this._outdoorOpts.room || this._current;
    return hxVentilationEffect(hxState(room, this.mollier, this.pressure),
      hxState(this._outdoor, this.mollier, this.pressure), this._outdoorOpts.threshold);
  }
  // The localized sentence for ventilationEffect() ("" if none).
  ventilationNote() {
    return hxVentilationNote(this.ventilationEffect(), this._texts);
  }

  _ctx() {
    return { x: this.x, y: this.y, width: this.width, height: this.height, mollier: this.mollier, pressure: this.pressure,
             project: this.project, units: this.units };
  }

  _drawPoints() {
    let self = this, ctx = this._ctx(), T = this._texts;
    this.pointLayer.selectAll("*").remove();
    this._outdoorResult = null;
    let bindTip = function (node, content, bg, grow) {
      if (!node) return;
      node.style("cursor", "pointer")
        .on("mouseover", function () {
          if (grow) d3.select(this).attr("r", 10);
          let c = content();
          self._showTip(c.x, c.y, c.lines, bg);
        })
        .on("mouseout", function () { if (grow) d3.select(this).attr("r", 6); self._hideTip(); });
    };
    let room = this._outdoorOpts.room || this._current;
    if (this._outdoor) {
      let o = Object.assign({}, this._outdoorOpts, { texts: T });
      let res = hxDrawOutdoor(this.pointLayer, ctx, this._outdoor, room, o);
      this._outdoorResult = res;
      if (res.outdoor && res.marker) {
        let s = res.outdoor, pos = hxClampPoint(ctx, s);
        bindTip(res.marker, () => ({
          x: pos.cx, y: pos.cy, lines: [T.outdoor].concat(self._stateLines(s, 1)).concat(res.note ? [res.note] : [])
        }), this._outdoorOpts.color || HX_OUTDOOR_COLOR, false);
      }
    }
    if (this._current) {
      let c = this._currentOpts;
      let pt = hxDrawStatePoint(this.pointLayer, ctx, this._current,
        { color: c.color || HX_ROOM_COLOR, className: "hx-current", texts: T });
      if (pt) {
        bindTip(pt.marker, () => ({ x: pt.pos.cx, y: pt.pos.cy, lines: [T.now].concat(self._stateLines(pt.state, 2)) }),
          c.color || "#222", !pt.outside);
      }
    }
  }

  // Tooltip rows x / T / φ / Td for a normalised state.
  _stateLines(s, dec) {
    let T = this._texts, m = this.mollier, u = this._fmt();
    let td = m.temperature_p_sat(s.phi * m.p_sat(s.t));
    return [
      T.tip_x + ": " + u.x(s.x, 2),
      T.tip_t + ": " + u.t(s.t, dec),
      T.tip_phi + ": " + (s.phi * 100).toFixed(dec === 1 ? 0 : 1) + " %",
      T.tip_td + ": " + (td == null ? "–" : u.t(td, 1))
    ];
  }

  // Value formatters in the display units: t(°C), x(kg/kg), h(kJ/kg) with
  // `dec` decimals (IP: gr/lb get one decimal less).
  _fmt() {
    let U = HX_UNITS;
    if (this.units === "ip") return {
      t: (v, dec) => U.cToF(v).toFixed(dec) + " °F",
      x: (v, dec) => U.kgkgToGrlb(v).toFixed(Math.max(0, dec - 1)) + " gr/lb",
      h: (v, dec) => U.kjkgToBtulb(v).toFixed(dec) + " Btu/lb"
    };
    return {
      t: (v, dec) => v.toFixed(dec) + " °C",
      x: (v, dec) => (v * 1000).toFixed(dec) + " g/kg",
      h: (v, dec) => v.toFixed(dec) + " kJ/kg"
    };
  }

  // --- process chain ------------------------------------------------------
  setProcessChain(states) { this._chain = states || []; this._drawChain(); return this; }

  _drawChain() {
    let self = this, P = this.project;
    this.chainLayer.selectAll("*").remove();
    let sp = this._chain;
    if (!sp || sp.length === 0) return;
    for (let i = 1; i < sp.length; i++) {
      this.chainLayer.append("line")
        .attr("x1", P(sp[i - 1].x, sp[i - 1].y)[0]).attr("y1", P(sp[i - 1].x, sp[i - 1].y)[1])
        .attr("x2", P(sp[i].x, sp[i].y)[0]).attr("y2", P(sp[i].x, sp[i].y)[1])
        .attr("stroke", "#444").attr("stroke-width", 2).attr("marker-end", "url(#" + this._arrowId + ")");
    }
    let nodes = this.chainLayer.selectAll("g.state").data(sp).enter().append("g").attr("class", "state")
      .attr("transform", (d) => "translate(" + P(d.x, d.y)[0] + "," + P(d.x, d.y)[1] + ")").style("cursor", "pointer")
      .on("mouseover", function (event, d) { self._showChainTip(d); })
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

  // Clip path = the unsaturated region (smaller x than the saturation curve):
  // upper left of the curve in 'mollier', lower right in 'psychrometric'.
  _updateSaturationClip() {
    let sat = [], t0 = this.domainY[0] - 3, t1 = this.domainY[1] + 3, ns = 120;
    for (let i = 0; i <= ns; i++) {
      let t = t0 + (t1 - t0) * i / ns;
      let s = this.mollier.get_x_y(t, 1, this.pressure);
      sat.push(this.project(s.x, s.y));
    }
    let pad = Math.max(this.width, this.height) + 200;
    // Far corners: (cold, dry), the saturation curve cold -> warm, (warm,
    // humid), then round the dry side via (warm, dry): top left ('mollier')
    // or bottom right ('psychrometric') of the axes.
    let dryWarm = this.orientation === "psychrometric" ? [this.width + pad, this.height + pad] : [-pad, -pad];
    let pts = [[-pad, this.height + pad]].concat(sat).concat([[this.width + pad, -pad], dryWarm]);
    let cp = this.canvas.select("#" + this._satClipId);
    if (cp.empty()) cp = this.canvas.append("clipPath").attr("id", this._satClipId);
    cp.selectAll("polygon").remove();
    cp.append("polygon").attr("points", pts.map((q) => q.join(",")).join(" "));
  }

  _drawFreqLines() {
    let self = this;
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
      return self.project(xv, yv);
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
    let pathsG = this.freqLines.append("g").attr("clip-path", "url(#" + this._satClipId + ")");
    pathsG.selectAll("path").data(contours).enter().append("path")
      .attr("d", (d) => contourPath(d.c)).attr("fill", "none").attr("stroke", "#333").attr("stroke-width", 1.6);
    let hitG = this.freqHover.append("g").attr("clip-path", "url(#" + this._satClipId + ")");
    hitG.selectAll("path").data(contours).enter().append("path")
      .attr("d", (d) => contourPath(d.c)).attr("fill", "none").attr("stroke", "transparent").attr("stroke-width", 8)
      .style("pointer-events", "stroke").style("cursor", "crosshair")
      .on("mouseover mousemove", function (event, d) { self._showFreqTip(d.label, useDays, event); })
      .on("mouseout", function () { self._hideTip(); });
    // Labels on visible (unsaturated) contour points, without overlaps.
    hxDrawContourLabels(this.freqLabels, contours, function (gx, gy) {
      let xv = FREQ_XMIN + gx * FREQ_DX, Tv = FREQ_TMIN + gy * FREQ_DT;
      if (xv > self.mollier.get_x_y(Tv, 1, self.pressure).x) return null;
      return gridToScreen(gx, gy);
    }, { width: this.width, height: this.height });
  }

  // --- reposition / redraw helpers ---------------------------------------
  _repositionOverlays() {
    this._positionScatter();
    this._drawComfort();
    this._drawBands();
    this._drawChain();
    this._drawFreqLines();
    this._drawMeanLines();
    this._drawPoints();
  }
  _redrawAllOverlays() {
    this._drawScatter();
    this._drawComfort();
    this._drawBands();
    this._drawChain();
    this._drawFreqLines();
    this._drawMeanLines();
    this._drawPoints();
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
    let T = this._texts, u = this._fmt(), pos = this.project(X, Y);
    this._showTip(pos[0], pos[1], [
      d.time ? this._timeFormat(d.time) : "",
      T.tip_x + ":  " + u.x(X, 2),
      T.tip_t + ":  " + u.t(temp, 2),
      T.tip_phi + ":  " + (phi * 100).toFixed(1) + " %",
      T.tip_h + ":  " + u.h(hh, 2),
      T.tip_td + ": " + u.t(tdp, 2)
    ].filter((s) => s !== ""));
  }
  // Process-chain state: d.t [°C], d.phi [%], d.xg [g/kg], d.h [kJ/kg] as
  // given (SI); with units 'ip' numeric values are shown in °F, gr/lb, Btu/lb.
  _showChainTip(d) {
    let T = this._texts, pos = this.project(d.x, d.y), U = HX_UNITS;
    let num = (v) => v != null && v !== "" && isFinite(Number(v));
    let lines = this.units === "ip"
      ? [d.label, T.tip_t + ": " + (num(d.t) ? U.cToF(Number(d.t)).toFixed(1) : d.t) + " °F",
         T.tip_phi + ": " + d.phi + " %",
         T.tip_x + ": " + (num(d.xg) ? U.kgkgToGrlb(Number(d.xg) / 1000).toFixed(0) : d.xg) + " gr/lb",
         T.tip_h + ": " + (num(d.h) ? U.kjkgToBtulb(Number(d.h)).toFixed(1) : d.h) + " Btu/lb"]
      : [d.label, T.tip_t + ": " + d.t + " °C", T.tip_phi + ": " + d.phi + " %",
         T.tip_x + ": " + d.xg + " g/kg", T.tip_h + ": " + d.h + " kJ/kg"];
    this._showTip(pos[0], pos[1], lines, "#222");
  }
  _showFreqTip(label, useDays, event) {
    let m = d3.pointer(event, this.plot.node());
    this._showTip(m[0], m[1], [hxFormat(useDays ? this._texts.freq_days : this._texts.freq_hours, { n: label })], "#222");
  }

  destroy() { this.canvas.remove(); }
}

// Expose globally (the bundle is loaded as plain <script>s, like the rest).
if (typeof window !== "undefined") window.MollierChart = MollierChart;

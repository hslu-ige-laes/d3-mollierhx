// Small dependency-free checks of the pure helpers (no DOM, no D3).
// Run: node test/check.js
// The sources are plain browser scripts; they are evaluated here in ONE
// strict-mode scope, the way a bundler / ES module would see them.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const files = ["mollierFunctions.js", "hxUnits.js", "coordinateGenerator.js", "drawComfort.js", "mollierChart.js"];
const src = files.map((f) => fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8")).join("\n;\n");
const exportsList = [
  "createMollier", "drawHXCoordinates", "createComfort", "MollierChart",
  "HX_DEFAULT_CAPTIONS", "hxResolveCaptions", "hxFitCaption", "hxLayoutRightCaptions", "hxFitXAxisCaption",
  "HX_DEFAULT_TEXTS", "hxTexts", "hxFormat", "hxState", "hxStateLabel",
  "hxVentilationEffect", "hxVentilationNote", "hxClampPoint", "MOLLIER_CHART_DEFAULT_TEXTS",
  "hxPlaceContourLabels", "hxDrawContourLabels",
  "HX_UNITS", "hxIsIP", "hxOrientation", "hxProjection", "hxNiceTicks",
  "HX_DEFAULT_CAPTIONS_IP", "hxDefaultCaptions", "HX_DEFAULT_TEXTS_IP", "MOLLIER_CHART_DEFAULT_TEXTS_IP",
];
const code = '"use strict";\n' + src + "\n;({" + exportsList.join(",") + "});";
// A minimal stand-in for d3.scaleLinear / d3.line (enough for hxProjection).
function scaleLinear() {
  let d = [0, 1], r = [0, 1];
  const s = (v) => r[0] + (v - d[0]) * (r[1] - r[0]) / (d[1] - d[0]);
  s.invert = (v) => d[0] + (v - r[0]) * (d[1] - d[0]) / (r[1] - r[0]);
  s.domain = (a) => { if (!a) return d.slice(); d = a.slice(); return s; };
  s.range = (a) => { if (!a) return r.slice(); r = a.slice(); return s; };
  return s;
}
function line() {
  let fx = (q) => q[0], fy = (q) => q[1];
  const l = (pts) => pts.map((q, i) => (i ? "L" : "M") + fx(q) + "," + fy(q)).join("");
  l.x = (f) => { fx = f; return l; };
  l.y = (f) => { fy = f; return l; };
  return l;
}
const d3 = { scaleLinear, line };
const H = vm.runInNewContext(code, { console, d3 }, { filename: "bundle.js" });

let n = 0;
function test(name, fn) { fn(); n++; console.log("ok  " + name); }

test("all public names exist", () => {
  exportsList.forEach((k) => assert.ok(H[k] !== undefined, k));
});

test("captions: defaults, overrides, xAxisTitle, empty hides", () => {
  const d = H.hxResolveCaptions();
  assert.strictEqual(d.temperature, "Temperature ϑ [°C]");
  assert.strictEqual(d.x_axis, "x [g/kg]");
  assert.strictEqual(d.x_axis_title, "");
  const c = H.hxResolveCaptions({ xAxisTitle: "abs", captions: { density: "Dichte", enthalpy: "" } });
  assert.strictEqual(c.x_axis_title, "abs");
  assert.strictEqual(c.density, "Dichte");
  assert.strictEqual(c.enthalpy, "");
  assert.strictEqual(c.rel_humidity, "rel. humidity φ [%]");
  assert.strictEqual(H.hxResolveCaptions({ xAxisTitle: "a", captions: { x_axis_title: "b" } }).x_axis_title, "b");
});

test("right captions fit the axis at 420 px and 700 px", () => {
  const texts = [H.HX_DEFAULT_CAPTIONS.rel_humidity, H.HX_DEFAULT_CAPTIONS.density, H.HX_DEFAULT_CAPTIONS.enthalpy];
  [420 - 90, 420 - 70, 700 - 90].forEach((axis) => {
    const L = H.hxLayoutRightCaptions(texts, axis);
    assert.strictEqual(L.length, 3);
    const seg = axis / 3;
    L.forEach((l, i) => {
      assert.ok(Math.abs(l.x - (axis / 2 - seg * i)) < 0.06, "segment top");
      const len = l.text.length * 0.56 * l.fontSize;            // estimated text length
      assert.ok(len <= seg - 12 + 0.5, "fits its segment");
      assert.ok(l.x - len >= -axis / 2 - 0.5, "stays on the axis");
      assert.ok(l.fontSize >= 8 && l.fontSize <= 12);
      assert.strictEqual(l.fontSize, L[0].fontSize, "common font size");
    });
    assert.strictEqual(L[0].x, axis / 2, "first caption flush with the top");
  });
  assert.strictEqual(H.hxLayoutRightCaptions(texts, 610)[0].fontSize, 12);
  assert.strictEqual(H.hxLayoutRightCaptions([], 300).length, 0);
});

test("very long caption is shortened with an ellipsis", () => {
  const L = H.hxLayoutRightCaptions(["x".repeat(200)], 100);
  assert.ok(L[0].text.endsWith("…"));
  assert.ok(L[0].fontSize >= 8 && L[0].text.length * 0.56 * L[0].fontSize <= 88 + 0.01);
});

test("x-axis caption fits the right margin", () => {
  const f = H.hxFitXAxisCaption("x [g/kg]", 70);
  assert.strictEqual(f.fontSize, 12);
  const g = H.hxFitXAxisCaption("x [g/kg]", 60);
  assert.ok(g.fontSize < 12 && g.fontSize * 0.56 * 8 <= 46 + 0.01);
});

test("ventilation effect with 0.3 g/kg threshold", () => {
  assert.strictEqual(H.hxVentilationEffect({ x: 0.008 }, { x: 0.0076 }), "dries");
  assert.strictEqual(H.hxVentilationEffect({ x: 0.008 }, { x: 0.0084 }), "humidifies");
  assert.strictEqual(H.hxVentilationEffect({ x: 0.008 }, { x: 0.0082 }), "neutral");
  assert.strictEqual(H.hxVentilationEffect({ x: 0.008 }, { x: 0.0078 }), "neutral");
  assert.strictEqual(H.hxVentilationEffect(0.008, 0.0070, 0.002), "neutral");
  assert.strictEqual(H.hxVentilationEffect(null, { x: 0.005 }), null);
  assert.strictEqual(H.hxVentilationNote("dries"), "ventilating dries");
  assert.strictEqual(H.hxVentilationNote("humidifies", { ventilation_humidifies: "Lüften befeuchtet" }), "Lüften befeuchtet");
  assert.strictEqual(H.hxVentilationNote(null), "");
});

test("cold humid outside air dries a warm room (0 °C / 80 % vs 21 °C / 50 %)", () => {
  const m = H.createMollier();
  const room = H.hxState({ t: 21, rh: 50 }, m, 101325);
  const out = H.hxState({ t: 0, phi: 0.8 }, m, 101325);
  assert.ok(Math.abs(out.x * 1000 - 3.0) < 0.1, out.x);
  assert.strictEqual(H.hxVentilationEffect(room, out), "dries");
});

test("hxState: t/rh, t/phi, x/y and invalid input", () => {
  const m = H.createMollier();
  const a = H.hxState({ t: 20, rh: 50 }, m, 101325);
  const b = H.hxState({ t: 20, phi: 0.5 }, m, 101325);
  assert.ok(Math.abs(a.x - b.x) < 1e-12);
  const c = H.hxState({ x: a.x, y: a.y }, m, 101325);
  assert.ok(Math.abs(c.t - 20) < 1e-9 && Math.abs(c.phi - 0.5) < 1e-9);
  assert.strictEqual(H.hxState(null), null);
  assert.strictEqual(H.hxState({ t: 20 }), null);
  assert.strictEqual(H.hxStateLabel({ t: 6.84, phi: 0.891, x: 0.0055 }), "6.8 °C · 89 %");
  assert.strictEqual(H.hxStateLabel({ t: 6.84, phi: 0.891, x: 0.0055 }, { state_value: "{t}°/{rh}%/{x}g" }), "6.8°/89%/5.5g");
});

test("clamp to the axes", () => {
  const sx = (v) => v * 1000 * 10, sy = (v) => 200 - v * 5;       // 0..20 g/kg, -10..30 °C -> 200x200
  const ctx = { x: sx, y: sy, width: 200, height: 200 };
  const inside = H.hxClampPoint(ctx, { x: 0.01, y: 10 });
  assert.strictEqual(inside.outside, false);
  const out = H.hxClampPoint(ctx, { x: 0.025, y: -20 });
  assert.strictEqual(out.outside, true);
  assert.strictEqual(out.cx, 200);
  assert.strictEqual(out.cy, 200);
});

test("chart texts have English defaults", () => {
  assert.strictEqual(H.MOLLIER_CHART_DEFAULT_TEXTS.freq_hours, "{n} h/year outside");
  assert.strictEqual(H.hxFormat(H.MOLLIER_CHART_DEFAULT_TEXTS.altitude, { alt: 450 }), "450 m a.s.l.");
  assert.strictEqual(H.hxTexts({ outdoor: "Aussenluft", room: null }).room, "Room");
});

// Nested rings (ellipses) whose tops lie close together, like the 200..1600 h
// lines near the top of a dense point cloud.
function ellipse(cx, cy, rx, ry, n) {
  const pts = [];
  for (let i = 0; i < (n || 72); i++) { const a = 2 * Math.PI * i / (n || 72); pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return pts;
}
function overlaps(a, b, gap) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap;
}

test("contour labels: nested lines get separate, non-overlapping spots", () => {
  const items = [200, 400, 800, 1600].map((v, i) => ({ label: v, points: ellipse(150, 60 + 4 * i, 60 - 12 * i, 40 - 8 * i) }));
  const P = H.hxPlaceContourLabels(items, { width: 300, height: 200 });
  assert.strictEqual(P.length, 4);
  assert.strictEqual(P.map((l) => l.index).join(), "0,1,2,3");
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++)
    assert.ok(!overlaps(P[i], P[j], 4 - 1e-9), P[i].label + " / " + P[j].label);
  P.forEach((l) => {
    assert.ok(l.x - l.w / 2 >= 0 && l.x + l.w / 2 <= 300 && l.y - l.h / 2 >= 0 && l.y + l.h / 2 <= 200);
    assert.strictEqual(l.w, String(l.label).length * 8 + 6);
  });
  // the smallest (innermost) line keeps its top point
  assert.strictEqual([P[3].x, P[3].y].join(), "150,56");
});

test("contour labels: free label sits at the top, crowded one is dropped", () => {
  const solo = H.hxPlaceContourLabels([{ label: 25, points: ellipse(100, 100, 50, 30) }], { width: 300, height: 300 });
  assert.strictEqual(solo.length, 1);
  assert.ok(Math.abs(solo[0].y - 70) < 1e-9 && Math.abs(solo[0].x - 100) < 1e-9);
  // the second line has a single spot, taken by the first label
  const P = H.hxPlaceContourLabels([
    { label: 100, points: [[50, 50]] }, { label: 200, points: [[52, 50]] }], { width: 300, height: 300 });
  assert.strictEqual(P.length, 1);
  assert.strictEqual(P[0].label, 100);
  // spots outside the axes and empty input are ignored
  assert.strictEqual(H.hxPlaceContourLabels([{ label: 5, points: [[2, 2], [299, 150]] }], { width: 300, height: 300 }).length, 0);
  assert.strictEqual(H.hxPlaceContourLabels([{ label: 5, points: [] }, null], { width: 10, height: 10 }).length, 0);
  assert.strictEqual(H.hxPlaceContourLabels([], { width: 10, height: 10 }).length, 0);
});

test("contour labels: without a free spot the farthest one is used", () => {
  const P = H.hxPlaceContourLabels([
    { label: 1, points: [[100, 100]] },
    { label: 2, points: [[100, 85], [100, 125], [140, 100]] }], { width: 300, height: 300, clearGap: 100 });
  assert.strictEqual(P.length, 2);
  assert.strictEqual([P[1].x, P[1].y].join(), "140,100");
});

// arrays/objects from the vm realm: compare as JSON
const eq = (a, b) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || "") + " " + a + " vs " + b);

test("units: known values", () => {
  const U = H.HX_UNITS;
  near(U.cToF(20), 68, 1e-12, "20 °C");
  near(U.cToF(-40), -40, 1e-12, "-40");
  near(U.fToC(212), 100, 1e-12, "212 °F");
  near(U.kToF(10), 18, 1e-12, "10 K");
  near(U.kgkgToGrlb(0.012), 84, 1e-9, "12 g/kg");
  near(U.mToFt(0.3048), 1, 1e-12, "ft");
  near(U.mToFt(450), 1476.38, 0.01, "450 m");
  near(U.paToInhg(101325), 29.92, 0.005, "1 atm");
  near(U.kjkgToBtulb(0), 7.686, 1e-12, "0 °C dry air");
  near(U.kjkgToBtulb(0), 7.69, 0.005);
  near(U.btulbToKjkg(0), -17.877, 0.001, "0 °F reference");
  near(U.kjkgToBtulbDelta(2.326), 1, 1e-12, "delta");
  near(U.kgm3ToLbft3(1.2), 0.0749136, 1e-7, "1.2 kg/m³");
  near(U.kgm3ToLbft3(16.01846337), 1, 1e-8, "NIST factor");
  // 0 °F dry air in the SI enthalpy of this library (h = 1.01 * t) is ~0 Btu/lb
  near(U.kjkgToBtulb(H.createMollier().enthalpy(0, U.fToC(0))), 0, 0.05, "0 °F dry air");
});

test("units: round trips", () => {
  const U = H.HX_UNITS;
  [-30, 0, 21.7, 55].forEach((v) => {
    near(U.fToC(U.cToF(v)), v, 1e-12);
    near(U.fToK(U.kToF(v)), v, 1e-12);
    near(U.btulbToKjkg(U.kjkgToBtulb(v)), v, 1e-12);
    near(U.btulbToKjkgDelta(U.kjkgToBtulbDelta(v)), v, 1e-12);
    near(U.ftToM(U.mToFt(v)), v, 1e-12);
  });
  [0.0, 0.0042, 0.025].forEach((v) => near(U.grlbToKgkg(U.kgkgToGrlb(v)), v, 1e-15));
  [80000, 101325].forEach((v) => near(U.inhgToPa(U.paToInhg(v)), v, 1e-9));
  [0.9, 1.2, 1.4].forEach((v) => near(U.lbft3ToKgm3(U.kgm3ToLbft3(v)), v, 1e-12));
});

test("hxProjection: mollier = the classic scales, round trip both orientations", () => {
  const m = H.hxProjection(500, 300, [0, 0.02], [-20, 50]);
  assert.strictEqual(m.orientation, "mollier");
  eq(m.project(0, -20), [0, 300]);
  eq(m.project(0.02, 50), [500, 0]);
  eq(m.project(0.01, 15), [m.xScale(0.01), m.yScale(15)]);
  const p = H.hxProjection(500, 300, [0, 0.02], [-20, 50], "psychrometric");
  assert.strictEqual(p.orientation, "psychrometric");
  eq(p.project(0, -20), [0, 300]);            // cold and dry: bottom left
  eq(p.project(0.02, -20), [0, 0]);           // humid: top
  eq(p.project(0, 50), [500, 300]);           // warm: right
  [m, p].forEach((pr) => {
    [[0.004, 12], [0.017, -5], [0, 50]].forEach((q) => {
      const s = pr.project(q[0], q[1]), b = pr.invert(s[0], s[1]);
      near(b[0], q[0], 1e-15); near(b[1], q[1], 1e-12);
    });
  });
  assert.strictEqual(p.line([{ x: 0.01, y: 15 }]), "M250,150");
  assert.strictEqual(H.hxOrientation("Psychrometric"), "psychrometric");
  assert.strictEqual(H.hxOrientation("x"), "mollier");
  assert.ok(H.hxIsIP("IP") && !H.hxIsIP("si") && !H.hxIsIP());
});

test("IP ticks: round values, minor ticks, spacing", () => {
  const f = H.hxNiceTicks(H.HX_UNITS.cToF(-20), H.HX_UNITS.cToF(50), { steps: [1, 2, 5, 10, 20, 50], length: 340, minSpacing: 18 });
  assert.strictEqual(f.step, 10);
  eq(f.major, [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
  assert.strictEqual(f.minor[0], -4);
  assert.strictEqual(f.minor[1] - f.minor[0], 2);
  const g = H.hxNiceTicks(0, 140, { steps: [5, 10, 20, 50, 100], length: 540, minSpacing: 28 });
  assert.strictEqual(g.step, 10);
  assert.strictEqual(g.major.length, 15);
  assert.strictEqual(H.hxNiceTicks(0, 140, { steps: [5, 10, 20, 50, 100], length: 300, minSpacing: 28 }).step, 20);
  const g20 = H.hxNiceTicks(0, 140, { steps: [20] });
  eq(g20.minor.slice(0, 3), [0, 5, 10]);
  const e = H.hxNiceTicks(-2.1, 33.4, { steps: [1, 2, 5, 10], maxCount: 20 });
  assert.strictEqual(e.step, 2);
  assert.strictEqual(e.major[0], -2);
  const r = H.hxNiceTicks(0.0681, 0.0868, { steps: [0.001, 0.002, 0.005, 0.01], maxCount: 8 });
  assert.strictEqual(r.step, 0.005);
  eq(r.major, [0.07, 0.075, 0.08, 0.085]);
  eq(H.hxNiceTicks(10, 0, { steps: [5] }).major, [0, 5, 10]);
});

test("captions: defaults per units and orientation", () => {
  eq(H.hxResolveCaptions({ units: "si" }), H.hxResolveCaptions());
  eq(H.hxDefaultCaptions(), Object.assign({}, H.HX_DEFAULT_CAPTIONS));
  const ip = H.hxResolveCaptions({ units: "ip" });
  assert.strictEqual(ip.temperature, "Dry-bulb temperature [°F]");
  assert.strictEqual(ip.enthalpy, "Enthalpy [Btu/lb]");
  assert.strictEqual(ip.density, "Density [lb/ft³]");
  assert.strictEqual(ip.x_axis, "W [gr/lb]");
  assert.strictEqual(H.hxResolveCaptions({ units: "ip", orientation: "psychrometric" }).x_axis, "Humidity ratio W [gr/lb]");
  assert.strictEqual(H.hxResolveCaptions({ orientation: "psychrometric" }).x_axis, "Humidity ratio x [g/kg]");
  assert.strictEqual(H.hxResolveCaptions({ orientation: "psychrometric" }).temperature, "Temperature ϑ [°C]");
  assert.strictEqual(H.hxResolveCaptions({ units: "ip", captions: { enthalpy: "" } }).enthalpy, "");
});

test("units-aware state label, texts and chart texts", () => {
  const s = { t: 6.84, phi: 0.891, x: 0.0055 };
  assert.strictEqual(H.hxStateLabel(s, null, "ip"), "44.3 °F · 89 %");
  assert.strictEqual(H.hxStateLabel(s, { state_value: "{t}/{x}" }, "ip"), "6.8/5.5");      // placeholders stay SI
  assert.strictEqual(H.hxStateLabel(s, { state_value: "{t_f}/{x_gr}" }), "44.3/39");
  assert.strictEqual(H.hxStateLabel(s), "6.8 °C · 89 %");
  assert.strictEqual(H.hxTexts(null, "ip").state_value, "{t_f} °F · {rh} %");
  assert.strictEqual(H.hxTexts({ state_value: "a" }, "ip").state_value, "a");
  assert.strictEqual(H.hxFormat(H.MOLLIER_CHART_DEFAULT_TEXTS_IP.altitude, { alt_ft: "1476" }), "1476 ft");
  assert.strictEqual(H.hxFormat(H.MOLLIER_CHART_DEFAULT_TEXTS_IP.pressure, { inhg: "29.92" }), "29.92 inHg");
});

test("clamp through a projection (psychrometric)", () => {
  const pr = H.hxProjection(200, 100, [0, 0.02], [-10, 30], "psychrometric");
  const ctx = { width: 200, height: 100, project: pr.project, x: () => NaN, y: () => NaN };
  const a = H.hxClampPoint(ctx, { x: 0.01, y: 10 });
  assert.strictEqual(a.outside, false);
  eq([a.cx, a.cy], [100, 50]);
  const b = H.hxClampPoint(ctx, { x: 0.03, y: 40 });
  assert.strictEqual(b.outside, true);
  eq([b.cx, b.cy], [200, 0]);
});

console.log(n + " checks passed");

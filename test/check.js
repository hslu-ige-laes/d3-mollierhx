// Small dependency-free checks of the pure helpers (no DOM, no D3).
// Run: node test/check.js
// The sources are plain browser scripts; they are evaluated here in ONE
// strict-mode scope, the way a bundler / ES module would see them.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const files = ["mollierFunctions.js", "coordinateGenerator.js", "drawComfort.js", "mollierChart.js"];
const src = files.map((f) => fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8")).join("\n;\n");
const exportsList = [
  "createMollier", "drawHXCoordinates", "createComfort", "MollierChart",
  "HX_DEFAULT_CAPTIONS", "hxResolveCaptions", "hxFitCaption", "hxLayoutRightCaptions", "hxFitXAxisCaption",
  "HX_DEFAULT_TEXTS", "hxTexts", "hxFormat", "hxState", "hxStateLabel",
  "hxVentilationEffect", "hxVentilationNote", "hxClampPoint", "MOLLIER_CHART_DEFAULT_TEXTS",
  "hxPlaceContourLabels", "hxDrawContourLabels",
];
const code = '"use strict";\n' + src + "\n;({" + exportsList.join(",") + "});";
const H = vm.runInNewContext(code, { console }, { filename: "bundle.js" });

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

console.log(n + " checks passed");

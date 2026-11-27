// Units (SI <-> IP) and the screen projection of the h,x diagram.
//
// Plain browser script with globals (no imports/exports), like the other
// files in /src; load it after mollierFunctions.js and before
// coordinateGenerator.js. Only hxProjection().line needs D3 (v7).
//
// All diagram data stay SI (x in kg/kg, diagram-y in °C, h in kJ/kg, p in Pa);
// the IP units only change ticks, labels and captions.
//
// Orientation:
//   'mollier'       (default) humidity ratio x horizontal (left -> right),
//                   diagram-y (temperature-like) vertical (bottom -> top);
//                   the saturation curve runs bottom right.
//   'psychrometric' the same construction transposed, as in the ASHRAE
//                   psychrometric chart: dry-bulb temperature horizontal,
//                   humidity ratio vertical (scale on the right), saturation
//                   curve top left.

// SI <-> IP conversions. Constants as in pyedautils.units (NIST SP 811).
const HX_UNITS = {
    F_PER_K: 1.8,                  // temperature difference: 1 K = 1.8 °F
    GR_PER_LB: 7000,               // 1 lb = 7000 grains: kg/kg -> gr/lb
    M_PER_FT: 0.3048,              // exact
    PA_PER_INHG: 3386.389,         // inch of mercury (60 °F)
    KJKG_PER_BTULB: 2.326,         // 1 Btu/lb = 2.326 kJ/kg
    // Enthalpy reference: SI (this library, Glück, Recknagel) h = 0 for dry
    // air at 0 °C, ASHRAE IP h = 0 for dry air at 0 °F. Offset in Btu/lb:
    // dry air at 0 °C has 32 °F * 0.240 Btu/(lb °F) = 7.686 Btu/lb.
    H_IP_OFFSET: 7.686,
    LBFT3_PER_KGM3: 0.0624279606,  // 1 kg/m³ = 0.0624279606 lb/ft³

    cToF: function(c) { return c * 9 / 5 + 32; },
    fToC: function(f) { return (f - 32) * 5 / 9; },
    kToF: function(dk) { return dk * 1.8; },          // temperature difference
    fToK: function(df) { return df / 1.8; },
    kgkgToGrlb: function(x) { return x * 7000; },
    grlbToKgkg: function(gr) { return gr / 7000; },
    mToFt: function(m) { return m / 0.3048; },
    ftToM: function(ft) { return ft * 0.3048; },
    paToInhg: function(p) { return p / 3386.389; },
    inhgToPa: function(inhg) { return inhg * 3386.389; },
    // Absolute enthalpy with the respective reference (see H_IP_OFFSET).
    kjkgToBtulb: function(h) { return h / 2.326 + 7.686; },
    btulbToKjkg: function(h) { return (h - 7.686) * 2.326; },
    // Enthalpy difference (no reference shift; = pyedautils kjkg_to_btulb).
    kjkgToBtulbDelta: function(dh) { return dh / 2.326; },
    btulbToKjkgDelta: function(dh) { return dh * 2.326; },
    kgm3ToLbft3: function(rho) { return rho * 0.0624279606; },
    lbft3ToKgm3: function(rho) { return rho / 0.0624279606; }
};

// "ip" for IP units, everything else is SI.
function hxIsIP(units) { return String(units || "").toLowerCase() === "ip"; }

// "psychrometric" or "mollier" (default).
function hxOrientation(orientation) {
    return String(orientation || "").toLowerCase() === "psychrometric" ? "psychrometric" : "mollier";
}

// Screen projection of the diagram plane (x [kg/kg], diagram-y [°C]) into an
// axes box of width x height px (origin top left).
// Returns { orientation, width, height, domainX, domainY,
//           xScale (x -> px along the humidity axis),
//           yScale (diagram-y -> px along the temperature axis),
//           project(x, y) -> [px, py], invert(px, py) -> [x, y],
//           line (d3.line over {x, y} data points) }.
// 'mollier': px = xScale(x), py = yScale(y) (exactly the scales the library
// always used); 'psychrometric': px = yScale(y), py = xScale(x).
function hxProjection(width, height, domainX, domainY, orientation) {
    orientation = hxOrientation(orientation);
    let psy = orientation === "psychrometric";
    let xScale = d3.scaleLinear().range(psy ? [height, 0] : [0, width]).domain(domainX);
    let yScale = d3.scaleLinear().range(psy ? [0, width] : [height, 0]).domain(domainY);
    let project = psy
        ? function(x, y) { return [yScale(y), xScale(x)]; }
        : function(x, y) { return [xScale(x), yScale(y)]; };
    let invert = psy
        ? function(px, py) { return [xScale.invert(py), yScale.invert(px)]; }
        : function(px, py) { return [xScale.invert(px), yScale.invert(py)]; };
    let line = psy
        ? d3.line().x(function(d) { return yScale(d.y); }).y(function(d) { return xScale(d.x); })
        : d3.line().x(function(d) { return xScale(d.x); }).y(function(d) { return yScale(d.y); });
    return { orientation: orientation, width: width, height: height,
             domainX: domainX, domainY: domainY, xScale: xScale, yScale: yScale,
             project: project, invert: invert, line: line };
}

// Round tick values between lo and hi (display units, e.g. °F or gr/lb).
// opts: steps (candidate steps, ascending; default 1, 2, 5, 10, 20, 50, 100),
//       maxCount (at most this many major ticks), length + minSpacing (px:
//       the major ticks are at least minSpacing apart on an axis of `length`).
// The smallest step that satisfies both is used (else the largest one).
// Returns { step, major: [...], minor: [...] }; minor ticks divide a step
// into 5 (into 4 for steps starting with 2, e.g. 2 -> 0.5, 20 -> 5).
function hxNiceTicks(lo, hi, opts) {
    opts = opts || {};
    if (hi < lo) { let tmp = lo; lo = hi; hi = tmp; }
    let steps = opts.steps || [1, 2, 5, 10, 20, 50, 100];
    let span = hi - lo, step = steps[steps.length - 1];
    for (let i = 0; i < steps.length; i++) {
        let s = steps[i], n = Math.floor(span / s + 1e-9) + 1;
        if (opts.maxCount != null && n > opts.maxCount) continue;
        if (opts.length != null && opts.minSpacing != null && span > 0 && opts.length * s / span < opts.minSpacing) continue;
        step = s; break;
    }
    let multiples = function(st) {
        let out = [], k0 = Math.ceil(lo / st - 1e-9), k1 = Math.floor(hi / st + 1e-9);
        for (let k = k0; k <= k1; k++) out.push(+(k * st).toFixed(10));
        return out;
    };
    let lead = String(step).replace(/^[0.]+/, "").charAt(0);
    let minorStep = step / (lead === "2" ? 4 : 5);
    return { step: step, major: multiples(step), minor: multiples(minorStep) };
}

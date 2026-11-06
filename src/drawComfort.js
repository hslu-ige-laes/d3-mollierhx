// function that draws a Comfort-zone polygon to a container with defined width and height
function drawComfort(container,Width,Height,margin,domainX,domainY,rangeT,rangePhi,rangeX,p,mollier) {

	if (!mollier) mollier = createMollier();

	// handle margin
    let environment = container.append("svg")
                    .attr("width",Width)
                    .attr("height",Height)
                    .attr("id","hx_mollier_diagram");

    let width = Width - margin.left - margin.right;
	let height = Height - margin.top - margin.bottom;

	let plot = environment.append("g")
					.attr("transform","translate("+margin.left+","+margin.top+")")
					.append("svg")
					.attr("width",width)
					.attr("height",height);

	let x = d3.scaleLinear().range([0,width]).domain(domainX);
	let y = d3.scaleLinear().range([height,0]).domain(domainY);

	// Line-constructor for the Comfort-path
	let line = d3.line()
					.x(function(d) { return x(d.x); })
					.y(function(d) { return y(d.y); });

	let pathos = createComfort(rangeT,rangePhi,rangeX,p,mollier);
	plot.selectAll("path")
				.data([pathos])
				.enter()
					.append("path")
					.attr("d",line)
					.attr("fill","yellowgreen")
					.attr("fill-opacity",0.4)
					.attr("stroke","yellowgreen");
}

// Function that returns an array of {x,y}-objects, that describe points on a hx-diagram with 
// kg/kg as unit for 'x' and °C as unit for 'y'. This array can then be rendered as an svg-path
// that describes the Comfortzone that is defined with the three Comfort-ranges: rangeT,
// rangePhi and rangeX.

function createComfort(rangeT,rangePhi,rangeX,p,mollier) {
	if (!mollier) mollier = createMollier();
	const get_x_y = mollier.get_x_y;
	const get_x_y_tx = mollier.get_x_y_tx;
	const get_x_y_phix = mollier.get_x_y_phix;

	rangeT = sortRange(rangeT); // safety measurements
	rangePhi = sortRange(rangePhi);
	rangeX = sortRange(rangeX);

	let T = rangeT[0];
	let Phi = rangePhi[0];
	let dT = 0.1;
	let dPhi = 0.01;

	let output = [];
	if(rangePhi[1] == 0) {
		output.push([{x: 0,y: rangeT[0],},
					 {x: 0,y: rangeT[1],},
					 {x: 0,y: rangeT[0],}]);
		return output;
	}

	let old_punkt = get_x_y(T,Phi,p);
	let punkt = {};
	let inrange = isin(old_punkt.x,rangeX);

	if(Phi != 0) { // because, in the case of Phi[0] == 0, the axis Phi = 0 is identical with the axis x = 0.
		while(T+dT<rangeT[1]) {
			T += dT;
			punkt = get_x_y(T,Phi,p);
			handleStep(Phi,get_x_y_phix);
		}
		T = rangeT[1];
		punkt = get_x_y(T,Phi,p);
		handleStep(Phi,get_x_y_phix);
	} else {
		T = rangeT[1];
		punkt = get_x_y(T,Phi,p);
		inrange = (rangeX[0] == 0);
		if(inrange) {
			output.push({...punkt});
			old_punkt = {...punkt};
		}
	}

	while(Phi+dPhi<rangePhi[1]) {
		Phi += dPhi;
		punkt = get_x_y(T,Phi,p);
		handleStep(T,get_x_y_tx);
	}
	Phi = rangePhi[1];
	punkt = get_x_y(T,Phi,p);
	handleStep(T,get_x_y_tx);


	while(T-dT>rangeT[0]) {
		T -= dT;
		punkt = get_x_y(T,Phi,p);
		handleStep(Phi,get_x_y_phix);
	}
	T = rangeT[0];
	punkt = get_x_y(T,Phi,p);
	handleStep(Phi,get_x_y_phix);

	while(Phi-dPhi>rangePhi[0]) {
		Phi -= dPhi;
		punkt = get_x_y(T,Phi,p);
		handleStep(T,get_x_y_tx);
	}
	Phi = rangePhi[0];
	punkt = get_x_y(T,Phi,p);
	handleStep(T,get_x_y_tx);

	if(output.length>0) output.push({...output[0]});

	return output;

	function handleStep(variable,functionhandle) {

		if(isin(rangeX[0],[old_punkt.x,punkt.x]) || rangeX[0] == punkt.x) {
			let interpunkt = functionhandle(variable,rangeX[0],p);
			output.push(interpunkt);
			inrange = change(inrange);
		}
	
		if(isin(rangeX[1],[old_punkt.x,punkt.x]) || rangeX[1] == punkt.x) {
			let interpunkt = functionhandle(variable,rangeX[1],p);
			output.push(interpunkt);
			inrange = change(inrange);
		}
	
		if(inrange) output.push({...punkt});
		old_punkt = {...punkt};
	}
}

function change(x) {
	if(x) return false;
	else  return true;
}

function isin(x,range) {
	return (x > range[0] && x < range[1]) || (x < range[0] && x > range[1]); // order doesn't matter here...
}

function sortRange(range) {
	if(range[1] < range[0]) return [range[1],range[0]];
	else					return [...range];
}


// ===========================================================================
// Overlay helpers: clip path, state points, edge arrows, outside air and the
// ventilation (mixing) line. Plain globals, used by MollierChart, the demo
// and pyedautils.
//
// The drawing helpers draw into a <g> in plot coordinates (origin at the
// top-left corner of the axes) and take a context object
//   ctx = { x, y, width, height, mollier, pressure }
//     x, y           d3 scales: x [kg/kg] -> px, diagram-y [°C] -> px
//     width, height  size of the axes in px
//     mollier        createMollier(...) suite (default: classical)
//     pressure       air pressure in Pa (default 101325)
//
// A "state" can be given as {t, rh} (rh in %), {t, phi} (phi 0..1) or as a
// diagram position {x, y}; hxState() normalises it to {t, phi, x, y}.
// ===========================================================================

// User-visible texts of the overlays (English defaults). Override any key via
// the `texts` option of the helpers / MollierChart.
const HX_DEFAULT_TEXTS = {
	outdoor: "Outside air",
	room: "Room",
	ventilation_dries: "ventilating dries",
	ventilation_humidifies: "ventilating adds moisture",
	ventilation_neutral: "ventilating: no change",
	// value label of an edge arrow (point outside the axes); {t} in °C with
	// one decimal, {rh} in % without decimals, {x} in g/kg with one decimal
	state_value: "{t} °C · {rh} %"
};

const HX_FONT = "Tahoma, Geneva, sans-serif";
const HX_OUTDOOR_COLOR = "#2563eb";
const HX_ROOM_COLOR = "black";
// |x_out - x_room| up to this (kg/kg, = 0.3 g/kg) counts as "no change".
const HX_VENTILATION_THRESHOLD = 0.0003;
const HX_VENTILATION_COLORS = { dries: "#b45309", humidifies: "#2563eb", neutral: "#64748b" };

// Defaults merged with user overrides (null/undefined values are ignored).
function hxTexts(texts) {
	let out = Object.assign({}, HX_DEFAULT_TEXTS);
	if (texts) Object.keys(texts).forEach(function(key) { if (texts[key] != null) out[key] = texts[key]; });
	return out;
}

// "{t} °C" + {t: 5} -> "5 °C". Unknown placeholders are kept.
function hxFormat(template, values) {
	return String(template).replace(/\{(\w+)\}/g, function(m, key) {
		return (values && values[key] != null) ? String(values[key]) : m;
	});
}

// Normalise a state to {t, phi, x, y} (t °C, phi 0..1, x kg/kg, y diagram-y),
// or null when it is missing or not finite. A given diagram position {x, y}
// takes precedence over t/rh.
function hxState(s, mollier, p) {
	if (!s) return null;
	mollier = mollier || createMollier();
	p = (p != null) ? Number(p) : 101325;
	let out;
	if (s.x != null && s.y != null) {
		let xv = Number(s.x), yv = Number(s.y);
		out = { x: xv, y: yv, t: mollier.temperature(xv, yv), phi: mollier.rel_humidity(xv, yv, p) };
	} else {
		let t = (s.t != null) ? s.t : s.temperature;
		let phi = (s.phi != null) ? s.phi : ((s.rh != null) ? s.rh / 100 : ((s.humidity != null) ? s.humidity / 100 : null));
		if (t == null || phi == null) return null;
		t = Number(t); phi = Number(phi);
		let e = mollier.get_x_y(t, phi, p);
		out = { t: t, phi: phi, x: e.x, y: e.y };
	}
	if (!isFinite(out.x) || !isFinite(out.y) || !isFinite(out.t) || !isFinite(out.phi)) return null;
	return out;
}

// Edge-arrow value label of a state, e.g. "6.8 °C · 89 %".
function hxStateLabel(s, texts) {
	return hxFormat(hxTexts(texts).state_value, {
		t: s.t.toFixed(1), rh: (s.phi * 100).toFixed(0), x: (s.x * 1000).toFixed(1)
	});
}

// What does airing do to the room? Compares the absolute humidity of the
// outside air with the room air: 'dries' (outside drier by more than the
// threshold), 'humidifies' (moister), 'neutral', or null when either is
// missing. room/outdoor: states with x [kg/kg] or plain x numbers.
// threshold in kg/kg (default 0.0003 = 0.3 g/kg).
function hxVentilationEffect(room, outdoor, threshold) {
	if (room == null || outdoor == null) return null;
	let xr = (typeof room === "number") ? room : room.x;
	let xo = (typeof outdoor === "number") ? outdoor : outdoor.x;
	if (xr == null || xo == null || !isFinite(xr) || !isFinite(xo)) return null;
	let th = (threshold != null) ? threshold : HX_VENTILATION_THRESHOLD;
	let dx = xo - xr;
	if (dx < -th) return "dries";
	if (dx > th) return "humidifies";
	return "neutral";
}

// Localizable sentence for an effect ("" for null).
function hxVentilationNote(effect, texts) {
	if (!effect) return "";
	return hxTexts(texts)["ventilation_" + effect] || "";
}

// Add (or resize) a rectangular clip path [0,width]x[0,height] in the <defs>
// of `svg` (a d3 selection of an <svg>). Apply the returned "url(#id)" to a
// <g> that is translated to the top-left corner of the axes, so data, comfort
// zone and bands are never drawn into the margins.
function hxAddClipPath(svg, id, width, height) {
	let defs = svg.select("defs");
	if (defs.empty()) defs = svg.append("defs");
	let cp = defs.select("#" + id);
	if (cp.empty()) cp = defs.append("clipPath").attr("id", id);
	let rect = cp.select("rect");
	if (rect.empty()) rect = cp.append("rect");
	rect.attr("x", 0).attr("y", 0).attr("width", width).attr("height", height);
	return "url(#" + id + ")";
}

// Plot position of a state, clamped to the axes. Returns
// {rawX, rawY, cx, cy, outside}; outside = true when it was moved.
function hxClampPoint(ctx, s) {
	let rawX = ctx.x(s.x), rawY = ctx.y(s.y);
	let cx = Math.min(ctx.width, Math.max(0, rawX));
	let cy = Math.min(ctx.height, Math.max(0, rawY));
	return { rawX: rawX, rawY: rawY, cx: cx, cy: cy, outside: cx !== rawX || cy !== rawY };
}

// Arrow on the edge of the axes pointing to where an off-axis point really
// is, with its value next to it (inside the axes). `pos` from hxClampPoint.
// Returns the arrow (a d3 selection of a <polygon class="hx-edge-arrow">);
// the label is a <text class="hx-edge-label">.
function hxDrawEdgeArrow(layer, ctx, pos, color, label) {
	let ang = Math.atan2(pos.rawY - pos.cy, pos.rawX - pos.cx);
	let s = 7, cos = Math.cos(ang), sin = Math.sin(ang);
	let pts = [[s, 0], [-s * 0.6, -s * 0.75], [-s * 0.6, s * 0.75]].map(function(q) {
		return [pos.cx - cos * s + q[0] * cos - q[1] * sin,
		        pos.cy - sin * s + q[0] * sin + q[1] * cos];
	});
	let marker = layer.append("polygon")
		.attr("class", "hx-edge-arrow")
		.attr("points", pts.map(function(q) { return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join(" "))
		.attr("fill", color).attr("stroke", "white").attr("stroke-width", 1);
	if (label) {
		let right = pos.rawX > ctx.width, left = pos.rawX < 0;
		let below = pos.rawY > ctx.height, above = pos.rawY < 0;
		// Near a corner, anchor the text so it stays inside the axes.
		let anchor = right ? "end" : left ? "start"
			: (pos.cx < 60 ? "start" : (pos.cx > ctx.width - 60 ? "end" : "middle"));
		let dx = right ? -10 : left ? 10 : (anchor === "start" ? -4 : anchor === "end" ? 4 : 0);
		layer.append("text")
			.attr("class", "hx-edge-label")
			.attr("x", Math.min(ctx.width - 2, Math.max(2, pos.cx + dx)))
			.attr("y", below ? pos.cy - 12 : above ? pos.cy + 20 : pos.cy + 4)
			.attr("text-anchor", anchor)
			.attr("font-family", HX_FONT).attr("font-size", 11).attr("font-weight", 600)
			.attr("fill", color).attr("stroke", "white").attr("stroke-width", 3)
			.attr("paint-order", "stroke")
			.text(label);
	}
	return marker;
}

// One state point: a circle inside the axes, an edge arrow with its value
// outside. opts: { color ("black"), hollow (white fill, coloured ring),
// r (6), className ("hx-state"), texts }.
// Returns {state, pos, outside, marker, group} or null.
function hxDrawStatePoint(layer, ctx, state, opts) {
	opts = opts || {};
	let s = hxState(state, ctx.mollier, ctx.pressure);
	if (!s) return null;
	let color = opts.color || HX_ROOM_COLOR;
	let pos = hxClampPoint(ctx, s);
	let g = layer.append("g").attr("class", opts.className || "hx-state");
	let marker;
	if (pos.outside) {
		marker = hxDrawEdgeArrow(g, ctx, pos, color, hxStateLabel(s, opts.texts));
	} else if (opts.hollow) {
		marker = g.append("circle").attr("cx", pos.cx).attr("cy", pos.cy).attr("r", opts.r || 6)
			.attr("fill", "white").attr("fill-opacity", 0.85)
			.attr("stroke", color).attr("stroke-width", 2.5);
	} else {
		marker = g.append("circle").attr("cx", pos.cx).attr("cy", pos.cy).attr("r", opts.r || 6)
			.attr("fill", color).attr("stroke", "white").attr("stroke-width", 1.5);
	}
	return { state: s, pos: pos, outside: pos.outside, marker: marker, group: g };
}

// Outside air: hollow blue circle (or edge arrow) and, when the room point is
// given, the dashed ventilation (mixing) line from the room point to it plus
// a note on what airing does. Draw into an UNCLIPPED layer (the arrows sit on
// the edge of the axes, the note just above them).
// opts: { color ("#2563eb"), ventilationLine (true), note (true),
//         notePosition ([0, -8] in plot coordinates = just above the axes),
//         threshold (0.0003 kg/kg), texts }
// Returns { outdoor, room, effect, note, marker } (outdoor null if missing).
function hxDrawOutdoor(layer, ctx, outdoor, room, opts) {
	opts = opts || {};
	let texts = hxTexts(opts.texts);
	let color = opts.color || HX_OUTDOOR_COLOR;
	let o = hxState(outdoor, ctx.mollier, ctx.pressure);
	let r = hxState(room, ctx.mollier, ctx.pressure);
	let result = { outdoor: o, room: r, effect: null, note: "", marker: null };
	if (!o) return result;
	let g = layer.append("g").attr("class", "hx-outdoor");
	let showLine = r && opts.ventilationLine !== false;
	if (showLine) {
		let rp = hxClampPoint(ctx, r), op = hxClampPoint(ctx, o);
		g.append("line").attr("class", "hx-ventilation-line")
			.attr("x1", rp.cx).attr("y1", rp.cy).attr("x2", op.cx).attr("y2", op.cy)
			.attr("stroke", color).attr("stroke-width", 1.6)
			.attr("stroke-dasharray", "4,3").attr("stroke-linecap", "round");
	}
	let pt = hxDrawStatePoint(g, ctx, o, { color: color, hollow: true, className: "hx-outdoor-point", texts: texts });
	result.marker = pt ? pt.marker : null;
	result.effect = hxVentilationEffect(r, o, opts.threshold);
	result.note = hxVentilationNote(result.effect, texts);
	if (result.note && showLine && opts.note !== false) {
		let np = opts.notePosition || [0, -8];
		let n = g.append("g").attr("class", "hx-ventilation-note hx-ventilation-" + result.effect)
			.attr("transform", "translate(" + np[0] + "," + np[1] + ")");
		n.append("circle").attr("cx", 5).attr("cy", -4).attr("r", 4)
			.attr("fill", "white").attr("stroke", color).attr("stroke-width", 2);
		let txt = n.append("text").attr("x", 14).attr("y", 0).attr("font-family", HX_FONT).attr("font-size", 12);
		if (texts.outdoor) txt.append("tspan").attr("fill", color).text(texts.outdoor + " · ");
		txt.append("tspan").attr("fill", HX_VENTILATION_COLORS[result.effect]).attr("font-weight", 600)
			.text(result.note);
	}
	return result;
}

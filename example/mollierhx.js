let CurrentData = {};  // datacontainer that gets filled when Data is loaded via the fileinput-div
let dataXY = [];       // calculated data-positions on the diagram

// Default location: 450 m a.s.l. (Swiss Plateau), the same as the pyedautils
// guide. ISA barometric formula, as in handle_altitude().
let altitude0 = 450;
let p = 101325 * Math.pow(1 - 2.25577e-5 * altitude0, 5.25588);

// Mollier coordinate convention ('classical' default, or 'glueck').
let convention = "classical";
let mollier = createMollier(convention);

// Chart layout: 'mollier' (default) or 'psychrometric' (ASHRAE), and the
// units of the chart and of all input fields: 'si' (default) or 'ip'.
let orientation = "mollier";
let units = "si";

// ---- display units of the input fields --------------------------------
// The model stays SI (what goes to drawHXCoordinates / createComfort);
// the fields show the selected units. Kinds and their SI quantity:
//   t: temperature [°C], dt: temperature difference [K],
//   x: humidity ratio [kg/kg], alt: altitude [m], p: pressure [Pa].
function identity(v) { return v; }
const DISPLAY_UNITS = {
    t:   { si: { unit: "°C",    to: identity, from: identity, digits: 1 },
           ip: { unit: "°F",    to: HX_UNITS.cToF, from: HX_UNITS.fToC, digits: 1 } },
    dt:  { si: { unit: "K",     to: identity, from: identity, digits: 1 },
           ip: { unit: "°F",    to: HX_UNITS.kToF, from: HX_UNITS.fToK, digits: 1 } },
    x:   { si: { unit: "g/kg",  to: function(v) { return v * 1000; }, from: function(v) { return v / 1000; }, digits: 1 },
           ip: { unit: "gr/lb", to: HX_UNITS.kgkgToGrlb, from: HX_UNITS.grlbToKgkg, digits: 0 } },
    alt: { si: { unit: "m",     to: identity, from: identity, digits: 0 },
           ip: { unit: "ft",    to: HX_UNITS.mToFt, from: HX_UNITS.ftToM, digits: 0 } },
    p:   { si: { unit: "Pa",    to: identity, from: identity, digits: 0 },
           ip: { unit: "inHg",  to: HX_UNITS.paToInhg, from: HX_UNITS.inhgToPa, digits: 2 } }
};
function du(kind) { return DISPLAY_UNITS[kind][units === "ip" ? "ip" : "si"]; }
function toDisplay(kind, si) { return du(kind).to(si); }      // SI -> display units
function fromDisplay(kind, v) { return du(kind).from(v); }    // display units -> SI
// Rounded display text without trailing zeros (22.5, 72.5, 96035, 28.36).
function fmtDisplay(kind, si) { return String(Number(toDisplay(kind, si).toFixed(du(kind).digits))); }

// Text fields with a unit. Each remembers the SI value behind its text, so a
// unit switch shows the same physical value again (no rounding drift, the
// chart stays identical); only a typed value is parsed and converted.
const UNIT_FIELDS = {
    room_t: "t", out_t: "t",
    band1_dt: "dt", band2_dt: "dt", band1_x: "x", band2_x: "x",
    altitude_input: "alt", pressure_input: "p"
};
let fieldSI = {};   // id -> { text, units, si }
function readSI(id) {
    let el = document.getElementById(id), st = fieldSI[id];
    if(st && st.text === el.value && st.units === units) return st.si;
    let v = parseFloat(el.value);
    let si = isFinite(v) ? fromDisplay(UNIT_FIELDS[id], v) : null;
    fieldSI[id] = { text: el.value, units: units, si: si };
    return si;
}
function writeSI(id, si) {
    let el = document.getElementById(id);
    el.value = (si == null || !isFinite(si)) ? "" : fmtDisplay(UNIT_FIELDS[id], si);
    fieldSI[id] = { text: el.value, units: units, si: si };
}

// Altitude slider range in display units.
const ALTITUDE_SLIDER = { si: { min: -400, max: 4000, step: 10 }, ip: { min: -1300, max: 13100, step: 50 } };
function setAltitudeSlider(altitudeM) {
    let el = document.getElementById("altitude_slider");
    let r = ALTITUDE_SLIDER[units === "ip" ? "ip" : "si"];
    el.min = r.min; el.max = r.max; el.step = r.step;
    el.value = Math.round(toDisplay("alt", altitudeM));
    el.setAttribute("aria-label", "Altitude [" + (units === "ip" ? "ft" : "m a.s.l.") + "]");
}

writeSI("pressure_input", p);
writeSI("altitude_input", altitude0);

// Default height: fit the window, so the sticky diagram stays fully visible
// while the controls scroll (the height field still allows any value).
function defaultHeight() {
    let stacked = window.innerWidth <= 980;   // one-column layout, see demo.html
    let avail = stacked ? window.innerHeight * 0.55 : window.innerHeight - 70;
    return Math.round(Math.max(380, Math.min(700, avail)));
}
let Height = defaultHeight();
document.getElementById("height_input").value = Height;

let dimensioninfo = document.getElementById("test").getBoundingClientRect();
// this svg is created in order to measure the right width of the #test-div
let placeholder = d3.select("#test").append("svg")
                    .attr("width",dimensioninfo.width)
                    .attr("height",Height);
dimensioninfo = document.getElementById("test").getBoundingClientRect();
placeholder.node().remove();

let Width = dimensioninfo.width;
let margin = {top: 40, right: 70, bottom: 50, left: 60};

let width = Width - margin.left - margin.right;
let height = Height - margin.top - margin.bottom;

let canvas = d3.select("#test").append("svg")
                            .attr("display","block")
                            .attr("width",Width)
                            .attr("height",Height);

let background = canvas.append("g")
                .attr("id","theplot");

// Clip path: data, comfort zone and bands are not drawn into the margins.
let plot = canvas.append("g")
                .attr("transform","translate("+margin.left+","+margin.top+")")
                .attr("clip-path",hxAddClipPath(canvas, "clip", width, height));

let comfortZone = plot.append("g");
let bandOrange = plot.append("g");   // dashed ±1 K / ±5 % warning band
let bandRed = plot.append("g");      // dashed ±2.5 K / ±10 % warning band
let freqLines = plot.append("g");    // hour-frequency contour lines
let gBrush = plot.append("g").attr("id","2dbrush"); // putting the brush before the circles -> pointer events on circles
let circlesHandle = plot.append("g");
let meanLine = plot.append("g");     // mean-value trajectory
let freqHover = plot.append("g");    // invisible hit areas for contour hover (above brush)
let freqLabels = plot.append("g").style("pointer-events","none");   // contour value labels (topmost)
// Unclipped layer for the room and outside points: points outside the axes
// become edge arrows, the ventilation note sits just above the axes.
let pointsLayer = canvas.append("g")
                .attr("class","points-layer")
                .attr("transform","translate("+margin.left+","+margin.top+")");


// Define the (x,y)-coordinate system:
let domainX0 = [0,0.02];
let domainY0 = [-20,50];

let domainX = domainX0;
let domainY = domainY0;

// Screen mapping (hxProjection): proj.project(x, y) -> [px, py].
let proj = hxProjection(width, height, domainX, domainY, orientation);
function P(d) { return proj.project(d.x, d.y); }

// Create a brush for zooming
let Brush = d3.brush()
    .extent([[0,0],[width,height]])
    .on("end",handleBrush);

gBrush.call(Brush);

let idle = false;

function handleBrush(event) {
    let selection = event.selection;
    
    if(selection) {
        idle = true;
        gBrush.call(Brush.move,null);

        let a = proj.invert(selection[0][0],selection[0][1]);
        let b = proj.invert(selection[1][0],selection[1][1]);
        domainX = [Math.min(a[0],b[0]),Math.max(a[0],b[0])];
        domainY = [Math.min(a[1],b[1]),Math.max(a[1],b[1])];
        refreshAxis(domainX,domainY);
        moveDomainSliders();
        
        draw_background();
    } else {
        if(idle) { idle = false; return; }

        domainX = domainX0;
        domainY = domainY0;
        refreshAxis(domainX,domainY);
        moveDomainSliders();

        draw_background();
    }
}

// Diagram-domain sliders show domainX / domainY in display units.
function moveDomainSliders() {
    sliderX.move([toDisplay("x",domainX[0]),toDisplay("x",domainX[1])],true);
    sliderY.move([toDisplay("t",domainY[0]),toDisplay("t",domainY[1])],true);
}

function refreshAxis(domainX,domainY) {
    proj = hxProjection(width, height, domainX, domainY, orientation);
}

let width_s = d3.select("#rangeX").node().offsetWidth;
// Define the sliders
let sliderX = createRangeSlider(width_s,50,"#rangeX");
sliderX.domain([toDisplay("x",domainX0[0]),toDisplay("x",domainX0[1])]);
sliderX.onEnd = function(a,b) {
    domainX = [fromDisplay("x",a),fromDisplay("x",b)];
    refreshAxis(domainX,domainY);
    draw_background();
}

let sliderY = createRangeSlider(width_s,50,"#rangeY");
sliderY.domain([toDisplay("t",domainY0[0]),toDisplay("t",domainY0[1])]);
sliderY.onEnd = function(a,b) {
    domainY = [fromDisplay("t",a),fromDisplay("t",b)];
    refreshAxis(domainX,domainY);
    draw_background();
}

// Sliders for the comfort-zone (domains SI)
const RANGE_T_DOMAIN = [-20,50];
const RANGE_XX_DOMAIN = [0,0.035];
let sliderT = createRangeSlider(width_s,50,"#rangeT");
sliderT.domain([toDisplay("t",RANGE_T_DOMAIN[0]),toDisplay("t",RANGE_T_DOMAIN[1])]);
sliderT.onChange = function(a,b) {
    rangeT = [fromDisplay("t",a),fromDisplay("t",b)];
    refresh_comfort();
}

let sliderPhi = createRangeSlider(width_s,50,"#rangePhi");
sliderPhi.domain([0,100]);
sliderPhi.onChange = function(a,b) {
    rangePhi = [...[a/100,b/100]];
    refresh_comfort();
}

let sliderXX = createRangeSlider(width_s,50,"#rangeXX");
sliderXX.domain([toDisplay("x",RANGE_XX_DOMAIN[0]),toDisplay("x",RANGE_XX_DOMAIN[1])]);
sliderXX.onChange = function(a,b) {
    rangeX = [fromDisplay("x",a),fromDisplay("x",b)];
    refresh_comfort();
}


// Line-constructor for the comfort-path (through the current projection)
function line(d) { return proj.line(d); }

// Draw comfort zone
let rangeT =   [20,26];
let rangePhi = [0.3,0.65];      sliderPhi.move([rangePhi[0]*100,rangePhi[1]*100],true);
let rangeX =   [0,0.0115];
moveComfortSliders();           // update slider-values

// Comfort-zone sliders show rangeT / rangeX in display units.
function moveComfortSliders() {
    sliderT.move([toDisplay("t",rangeT[0]),toDisplay("t",rangeT[1])],true);
    sliderXX.move([toDisplay("x",rangeX[0]),toDisplay("x",rangeX[1])],true);
}

let pathos = createComfort(rangeT,rangePhi,rangeX,p,mollier);
comfortZone.selectAll("path")
            .data([pathos])
            .enter()
                .append("path")
                .attr("d",line)
                .attr("fill","yellowgreen")
                .attr("fill-opacity",0.4)
                .attr("stroke","yellowgreen");

function refresh_comfort() {
    pathos = createComfort(rangeT,rangePhi,rangeX,p,mollier);
    comfortZone.selectAll("path")
                .data([pathos])
                    .attr("d",line);
    let showCz = document.getElementById("show_comfort");
    comfortZone.style("display", (showCz && !showCz.checked) ? "none" : null);

    // Two configurable, toggleable dashed warning bands around the comfort
    // zone (orange / red). Each is ± its own ΔT [K] and Δφ [%] offsets.
    refreshBand(bandOrange, "band1_on", "band1_dt", "band1_dphi", "band1_x",
                "#E67E22", "leg_band1", "leg_band1_txt");
    refreshBand(bandRed, "band2_on", "band2_dt", "band2_dphi", "band2_x",
                "#C0392B", "leg_band2", "leg_band2_txt");

    //one could do this also with the function 'drawComfort':
    //drawComfort("#theplot",Width,Height,margin,domainX,domainY,rangeT,rangePhi,rangeX,p);
}

function refreshBand(group, onId, dtId, dphiId, xId, color, legId, legTxtId) {
    let on = document.getElementById(onId);
    let leg = document.getElementById(legId);
    if(!on || !on.checked) {
        group.selectAll("path").remove();
        if(leg) leg.style.display = "none";
        return;
    }
    let dt = readSI(dtId) || 0;                               // [K]
    let dphi = (Number(document.getElementById(dphiId).value) || 0) / 100;
    let xmax = readSI(xId);                                   // abs humidity [kg/kg]
    let rX = (xmax > 0) ? [0, xmax] : [0, 0.030];
    let cp = function(v) { return Math.max(0, Math.min(1, v)); };
    drawBand(group, [rangeT[0]-dt, rangeT[1]+dt],
             [cp(rangePhi[0]-dphi), cp(rangePhi[1]+dphi)], rX, color);
    if(leg) leg.style.display = "";
    let legTxt = document.getElementById(legTxtId);
    if(legTxt) {
        var txt = "± " + fmtDisplay("dt", dt) + " " + du("dt").unit + " / " + (dphi*100) + " %";
        if(xmax > 0) txt += " / x≤ " + fmtDisplay("x", xmax) + " " + du("x").unit;
        legTxt.innerHTML = txt;
    }
}

function drawBand(group, rT, rPhi, rX, color) {
    let pb = createComfort(rT, rPhi, rX, p, mollier);
    let sel = group.selectAll("path").data([pb]);
    sel.enter().append("path").merge(sel)
        .attr("d", line)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 1.8)
        .attr("stroke-dasharray", "7,4");
}

// Draw the hx-diagram-background with the coordinate-lines
draw_background();
loadExampleData();

// Recompute the layout (called on window-resize and on height changes).
function relayout() {

    dimensioninfo = document.getElementById("test").getBoundingClientRect();
    // this svg is created in order to measure the right width of the #test-div
    let placeholder = d3.select("#test").append("svg")
                    .attr("width",dimensioninfo.width)
                    .attr("height",Height);
    dimensioninfo = document.getElementById("test").getBoundingClientRect();
    placeholder.node().remove();

    Width = dimensioninfo.width;

    width = Width - margin.left - margin.right;
    height = Height - margin.top - margin.bottom;

    canvas.attr("width",Width).attr("height",Height);
    hxAddClipPath(canvas, "clip", width, height);
    proj = hxProjection(width, height, domainX, domainY, orientation);
    Brush.extent([[0,0],[width,height]]);
    gBrush.call(Brush);

    width_s = d3.select("#rangeX").node().offsetWidth;
    sliderX.width(width_s);
    sliderY.width(width_s);
    sliderT.width(width_s);
    sliderPhi.width(width_s);
    sliderXX.width(width_s);

    draw_background();
}

window.addEventListener('resize', relayout);

// Adjustable diagram height (px).
function handle_height() {
    let h = Number(document.getElementById("height_input").value);
    if(h >= 300 && h <= 2000) { Height = h; relayout(); }
}

// Read the line-visibility checkboxes into an opts object for drawHXCoordinates.
function getLineOpts() {
    let chk = function(id) {
        let el = document.getElementById(id);
        return el ? el.checked : true;
    };
    return {
        showTemperature: chk("show_t"),
        showDensity:     chk("show_rho"),
        showRelHumidity: chk("show_phi"),
        showEnthalpy:    chk("show_h"),
        showAbsHumidity: chk("show_x"),
        xAxisTitle:      units === "ip" ? (isGerman() ? "Wassergehalt W [gr/lb]" : "humidity ratio W [gr/lb]")
                                        : (isGerman() ? "Wassergehalt x [g/kg]" : "absolute water content x [g/kg]"),
        captions:        isGerman() ? (units === "ip" ? CAPTIONS_DE_IP : CAPTIONS_DE) : undefined,
        orientation:     orientation,
        units:           units
    };
}

// Chart layout and units (selectors in demo.html).
function handle_layout() {
    orientation = document.getElementById("orientation_select").value;
    let newUnits = document.getElementById("units_select").value;
    if(newUnits !== units) switchUnits(newUnits);
    refreshAxis(domainX, domainY);
    draw_background();
}

// Show every input in the new units: the SI values behind the fields and
// sliders stay as they are, only their display (and the unit labels) change.
function switchUnits(newUnits) {
    let si = {};
    Object.keys(UNIT_FIELDS).forEach(function(id) { si[id] = readSI(id); });   // in the old units
    let oldUnit = {};
    Object.keys(DISPLAY_UNITS).forEach(function(kind) { oldUnit[kind] = du(kind).unit; });
    units = newUnits;
    Object.keys(UNIT_FIELDS).forEach(function(id) { writeSI(id, si[id]); });
    // Unit labels: <span data-unit="kind"> holds e.g. "[°C]" or "&nbsp;K / ± ";
    // only the unit in its text is replaced.
    document.querySelectorAll("[data-unit]").forEach(function(el) {
        let kind = el.getAttribute("data-unit");
        el.textContent = el.textContent.replace(oldUnit[kind], du(kind).unit);
    });
    setAltitudeSlider(si.altitude_input);
    sliderX.domain([toDisplay("x",domainX0[0]),toDisplay("x",domainX0[1])]);
    sliderY.domain([toDisplay("t",domainY0[0]),toDisplay("t",domainY0[1])]);
    sliderT.domain([toDisplay("t",RANGE_T_DOMAIN[0]),toDisplay("t",RANGE_T_DOMAIN[1])]);
    sliderXX.domain([toDisplay("x",RANGE_XX_DOMAIN[0]),toDisplay("x",RANGE_XX_DOMAIN[1])]);
    moveDomainSliders();
    moveComfortSliders();
}

// Captions and texts are plain options: any language can be passed in.
function isGerman() {
    let el = document.getElementById("caption_lang");
    return !!el && el.value === "de";
}
const CAPTIONS_DE = {
    temperature: "Temperatur ϑ [°C]", rel_humidity: "rel. Feuchte φ [%]",
    density: "Dichte ρ [kg/m³]", enthalpy: "Enthalpie h [kJ/kg]", x_axis: "x [g/kg]"
};
const CAPTIONS_DE_IP = {
    temperature: "Trockentemperatur [°F]", rel_humidity: "rel. Feuchte φ [%]",
    density: "Dichte [lb/ft³]", enthalpy: "Enthalpie [Btu/lb]", x_axis: "W [gr/lb]"
};
const TEXTS_DE = {
    outdoor: "Aussenluft", room: "Raum",
    ventilation_dries: "Lüften trocknet", ventilation_humidifies: "Lüften befeuchtet",
    ventilation_neutral: "Lüften: keine Änderung"
};

// Room point (black) and outside air (hollow blue) with the ventilation line.
function drawPoints() {
    pointsLayer.selectAll("*").remove();
    let num = function(id) { let v = parseFloat(document.getElementById(id).value); return isFinite(v) ? v : null; };
    let on = function(id) { let e = document.getElementById(id); return !!e && e.checked; };
    let ctx = { x: proj.xScale, y: proj.yScale, width: width, height: height, mollier: mollier, pressure: Number(p),
                project: proj.project, units: units };
    let texts = isGerman() ? TEXTS_DE : {};
    let room = on("show_room") ? { t: readSI("room_t"), rh: num("room_rh") } : null;
    let outdoor = on("show_out") ? { t: readSI("out_t"), rh: num("out_rh") } : null;
    let res = hxDrawOutdoor(pointsLayer, ctx, outdoor, room,
                            { ventilationLine: on("vent_line"), texts: texts });
    if(room) hxDrawStatePoint(pointsLayer, ctx, room, { color: "black", className: "room-point", texts: texts });
    let note = document.getElementById("vent_note");
    if(note) {
        note.textContent = res.note || "";
        note.className = res.effect || "";
    }
}

// Load the example data set (relative URL, works on GitHub Pages and with any
// static server; file:// pages cannot fetch, there use the file input).
function loadExampleData() {
    if(location.protocol === "file:") return;
    let state = document.getElementById("loading_state");
    if(state) state.textContent = " - loading zuerich-kloten.csv - ";
    fetch("zuerich-kloten.csv")
        .then(function(r) { if(!r.ok) throw new Error(r.status); return r.text(); })
        .then(function(txt) {
            CurrentData = formatData(txt);
            if(state) state.textContent = " - example data: zuerich-kloten.csv - ";
            HandleData();
        })
        .catch(function() { if(state) state.textContent = ""; });
}

function draw_background() {
    let mollier_diag = d3.select("#hx_mollier_diagram").node();
    if(!(mollier_diag == null)) mollier_diag.remove();
    drawHXCoordinates(d3.select("#theplot"),Width,Height,margin,domainX,domainY,p,mollier,getLineOpts());
    drawAltitudePressure();
    drawCircles();
    drawDerived();
    refresh_comfort();
    drawPoints();
}

function handle_convention() {
    convention = document.getElementById("convention_select").value;
    mollier = createMollier(convention);
    calcData();          // data positions depend on the convention
    draw_background();
}

// Altitude (derived from pressure via the inverse ISA barometric formula) and
// pressure in hPa, written in the top-right corner in dark grey.
function drawAltitudePressure() {
    let pa = Number(p);
    let altitude = (1 - Math.pow(pa/101325, 1/5.25588)) / 2.25577e-5;
    let ip = units === "ip";
    let info = d3.select("#hx_mollier_diagram").append("g")
        .style("font-family", "Tahoma, Geneva, sans-serif");
    info.append("text")
        .attr("x", margin.left + width).attr("y", margin.top - 22)
        .attr("text-anchor", "end").attr("fill", "#4d4d4d").attr("font-size", 12)
        .text(ip ? HX_UNITS.mToFt(altitude).toFixed(0) + " ft" : altitude.toFixed(0) + " m a.s.l.");
    info.append("text")
        .attr("x", margin.left + width).attr("y", margin.top - 8)
        .attr("text-anchor", "end").attr("fill", "#4d4d4d").attr("font-size", 12)
        .text(ip ? HX_UNITS.paToInhg(pa).toFixed(2) + " inHg" : (pa/100).toFixed(0) + " hPa");
}

function handle_p() {
    let pa = readSI("pressure_input");                       // [Pa]
    if(!(pa > 0)) return;
    p = pa;
    // keep the altitude field in sync (inverse ISA barometric formula)
    let h = (1 - Math.pow(p/101325, 1/5.25588)) / 2.25577e-5;
    writeSI("altitude_input", h);
    setAltitudeSlider(h);
    calcData();
    draw_background();
}

function handle_altitude() {
    let h = readSI("altitude_input");                        // [m a.s.l.]
    if(h == null) return;
    setAltitudeSlider(h);
    // ISA barometric formula: pressure [Pa] from altitude [m a.s.l.]
    p = 101325 * Math.pow(1 - 2.25577e-5 * h, 5.25588);
    writeSI("pressure_input", p);
    calcData();
    draw_background();
}

// Altitude slider: updates the field at once and redraws at most once per frame.
let altitudeFrame = null;
function slide_altitude(value) {
    document.getElementById("altitude_input").value = value;
    if(altitudeFrame) return;
    altitudeFrame = requestAnimationFrame(function() { altitudeFrame = null; handle_altitude(); });
}

// Data-related functions
let radius = 5;
let timeFormat = d3.utcFormat("%Y-%m-%d %H:%M");   // tooltip date/time format
function HandleData() {
    calcData();
    
    //circlesHandle.node().remove();
    //circlesHandle = graphicContent.append("g");
    
    let ColorMap = ["lightblue","lightgreen","orange","brown"];
    
    circlesHandle.selectAll("circle").remove();
    circlesHandle.selectAll("circle")
            .data(dataXY)
            .enter().append("circle")
                .attr("cx",function(d) { return P(d)[0]; })
                .attr("cy",function(d) { return P(d)[1]; })
                .attr("r" ,radius)
                .attr("fill",function(d) { return ColorMap[Math.floor(d.z/3)]; })
                .attr("shape-rendering","optimizeSpeed")
                .attr("opacity",0.4)
                .on("mouseover",handlemouseover)
                .on("mouseout",handlemouseout);
    drawDerived();
}

function calcData() {
    if(CurrentData.values != null) {
        dataXY = [];
        CurrentData.values.forEach(function(d) {
            if(d[0] == null) return;                  // unparseable timestamp
            let newElement = mollier.get_x_y(d[2],d[1]/100,p);
            // skip rows with missing humidity/temperature (NaN coordinates),
            // otherwise they pile up in the top-left corner at (0,0).
            if(!isFinite(newElement.x) || !isFinite(newElement.y)) return;
            newElement.z = d[0].getMonth()%12;
            newElement.time = d[0];               // keep timestamp for the tooltip
            dataXY.push(newElement);
        });
        dataXY = shuffle(dataXY);
        let ColorMap = ["lightblue","lightgreen","orange","brown"];
        circlesHandle.selectAll("circle").data(dataXY)
            .attr("fill",function(d) { return ColorMap[Math.floor(d.z/3)]; });
    }
}

function drawCircles() {
    circlesHandle.selectAll("circle").data(dataXY)
                .attr("cx",function(d) { return P(d)[0]; })
                .attr("cy",function(d) { return P(d)[1]; });
}

// Toggle helper for the data-display checkboxes.
function dchk(id) { let e = document.getElementById(id); return e ? e.checked : false; }

// Show/hide points and (re)draw the derived overlays.
function drawDerived() {
    circlesHandle.style("display", dchk("show_points") ? null : "none");
    drawFreqLines();
    drawMeanLine();
}

// Hour-frequency contour lines (isopleths). The data are binned into FIXED
// physical cells of DX (abs. humidity) by DT (temperature), independent of the
// zoom, so a contour value is "hours per (DX g/kg x DT degC) cell" and stays
// physically comparable. The cell grid is mapped into the (tilted) diagram
// coordinate system via get_x_y_tx before drawing.
const FREQ_XMIN = 0, FREQ_DX = 0.0005;   // 0.5 g/kg cells
const FREQ_NX = 60;                      // -> 0 .. 30 g/kg
const FREQ_TMIN = -30, FREQ_DT = 0.5;    // 0.5 degC cells
const FREQ_NY = 180;                     // -> -30 .. 60 degC
const FREQ_MIN_CELL_HOURS = 1;           // ignore cells with fewer hours as noise (trims sparse fringe)
const FREQ_SIGMA = 2.0;                  // FIXED KDE bandwidth (cells): the constant "fattening" that
                                        // turns the thin data band into rounded PDF-style loops
const FREQ_FOOT_R = 0;                   // footprint dilation in cells (connectivity)
const FREQ_FOOT_SIGMA = 0.7;             // footprint EDGE smoothing in cells (smooth, narrow taper)
const MIN_RING_AREA = 2.0;               // drop contour rings smaller than this (cells^2)
// Cumulative-frequency line targets, per unit. In hours mode a line labelled N
// has N hours/year outside it; in days mode N distinct calendar days have at
// least one hour outside it.
const FREQ_TARGETS_HOURS = [1, 5, 25, 100, 200, 400, 800, 1600];
const FREQ_TARGETS_DAYS  = [1, 5, 10, 25, 50, 100, 200, 300];

// Whether the frequency lines are counted in days (true) or hours (false).
function freqDays() { return dchk("show_freq_days"); }
// Line-rounding slider value, read from the demo slider if present. It controls
// only the geometric Laplacian smoothing of the contours -- never the area.
function freqSmooth() {
    let el = document.getElementById("freq_smooth");
    let v = el ? parseFloat(el.value) : NaN;
    return isFinite(v) ? v : 4.0;
}
// Calendar-day key for a data point (distinct integer per UTC day).
function dayKey(d) { return Math.floor(d.time.getTime()/86400000); }

// Soft footprint multiplier in [0,1]: 1 over the data (occupied cells dilated by
// Chebyshev radius R), tapering smoothly to 0 just outside over ~sigma cells. The
// dilated plateau keeps interior density intact; only the edge is feathered, so the
// outer contours get a smooth boundary (no cell-quantised shelves) while the small
// fixed sigma keeps the outward taper narrow.
function softFootprint(raw, nx, ny, R, sigma) {
    let tmp = new Array(nx*ny).fill(0);
    for(let iy=0; iy<ny; iy++) {
        for(let ix=0; ix<nx; ix++) {
            let m = 0;
            for(let k=-R; k<=R; k++) { let j = ix+k; if(j<0||j>=nx) continue; if(raw[iy*nx+j] > 0) { m = 1; break; } }
            tmp[iy*nx+ix] = m;
        }
    }
    let foot = new Array(nx*ny).fill(0);
    for(let ix=0; ix<nx; ix++) {
        for(let iy=0; iy<ny; iy++) {
            let m = 0;
            for(let k=-R; k<=R; k++) { let j = iy+k; if(j<0||j>=ny) continue; if(tmp[j*nx+ix] > 0) { m = 1; break; } }
            foot[iy*nx+ix] = m;
        }
    }
    return gaussBlur2D(foot, nx, ny, sigma);
}

// Build the cumulative-frequency contour rings via a FIXED-bandwidth KDE, in grid
// (cell) space. Cached per (dataset, days-mode) and zoom-invariant; drawFreqLines
// only re-rounds + projects them. The fixed sigma is a constant "fattening" that
// turns the thin data band into rounded PDF-style loops; because it never changes,
// the smoothness slider (line rounding) can never enlarge the region.
let freqCache = null;
function buildFreqContours(useDays) {
    if(freqCache && freqCache.ref === dataXY && freqCache.useDays === useDays) return freqCache.levels;

    let nx = FREQ_NX, ny = FREQ_NY;
    let empty = { ref: dataXY, useDays: useDays, levels: [] };
    // 1. bin to grid; drop noise cells (< FREQ_MIN_CELL_HOURS hours) so the thinnest
    //    extreme-weather fringe doesn't drag the outer lines into wiggly tails.
    let raw0 = new Array(nx*ny).fill(0), recs = [];
    dataXY.forEach(function(d) {
        let t = mollier.temperature(d.x, d.y);
        let ix = Math.floor((d.x - FREQ_XMIN)/FREQ_DX), iy = Math.floor((t - FREQ_TMIN)/FREQ_DT);
        if(ix < 0 || ix >= nx || iy < 0 || iy >= ny) return;
        let cell = iy*nx + ix;
        raw0[cell] += 1;
        recs.push({ cell: cell, dk: useDays ? dayKey(d) : 0 });
    });
    let rawGrid = new Array(nx*ny).fill(0);
    let dayGrid = useDays ? new Array(nx*ny) : null;
    let allDays = useDays ? new Set() : null;
    recs.forEach(function(r) {
        if(raw0[r.cell] < FREQ_MIN_CELL_HOURS) return;
        rawGrid[r.cell] += 1;
        if(useDays) { (dayGrid[r.cell] || (dayGrid[r.cell] = [])).push(r.dk); allDays.add(r.dk); }
    });
    let totalH = d3.sum(rawGrid);
    if(totalH < 3) { freqCache = empty; return empty.levels; }

    // 2. fixed-sigma KDE (the constant fattening) confined by a soft footprint
    //    (smooth, narrow edge -> rounded loops without shelves or large bleed).
    let densGrid = gaussBlur2D(rawGrid, nx, ny, FREQ_SIGMA);
    let foot = softFootprint(rawGrid, nx, ny, FREQ_FOOT_R, FREQ_FOOT_SIGMA);
    for(let i=0; i<densGrid.length; i++) densGrid[i] *= foot[i];

    // 3. cumulative thresholds: sort cells by density ascending (sparse fringe first),
    //    accumulate the unit (hours, or distinct calendar days) until each target N
    //    lies outside; that density is the line.
    let total = useDays ? allDays.size : totalH;
    let targets = (useDays ? FREQ_TARGETS_DAYS : FREQ_TARGETS_HOURS).filter(function(t){ return t < total; });
    if(!targets.length) { freqCache = empty; return empty.levels; }
    let cells = [];
    for(let i=0; i<densGrid.length; i++)
        cells.push({ key: densGrid[i] + i*1e-9, h: rawGrid[i], days: useDays ? (dayGrid[i] || null) : null });
    cells.sort(function(a, b){ return a.key - b.key; });
    let thr = [], ti = 0, cum = 0, union = useDays ? new Set() : null;
    for(let k=0; k<cells.length && ti<targets.length; k++) {
        if(useDays) {
            let ds = cells[k].days;
            if(ds) for(let q=0; q<ds.length; q++) union.add(ds[q]);
            cum = union.size;
        } else { cum += cells[k].h; }
        while(ti<targets.length && cum >= targets[ti]) {
            let dv = cells[k].key;
            if(thr.length === 0 || dv > thr[thr.length-1].value) thr.push({ value: dv, label: targets[ti] });
            else thr[thr.length-1].label = targets[ti];
            ti++;
        }
    }

    // 4. contour the density at those thresholds; keep rings above MIN_RING_AREA.
    let raw = d3.contours().size([nx, ny]).thresholds(thr.map(function(o){ return o.value; }))(densGrid);
    let levels = raw.map(function(c, idx) {
        let rings = [];
        c.coordinates.forEach(function(poly) {
            poly.forEach(function(ring) { if(Math.abs(ringArea(ring)) >= MIN_RING_AREA) rings.push(ring); });
        });
        return { label: thr[idx] ? thr[idx].label : Math.round(c.value), rings: rings };
    });

    freqCache = { ref: dataXY, useDays: useDays, levels: levels };
    return levels;
}

function drawFreqLines() {
    freqLines.selectAll("*").remove();
    freqLabels.selectAll("*").remove();
    freqHover.selectAll("*").remove();
    d3.select("#freqtip").remove();
    if(!dchk("show_freq") || dataXY.length === 0) return;

    let useDays = freqDays();
    // Fixed-bandwidth KDE quantile contours in grid space (cached, zoom-invariant).
    // The bandwidth is constant, so the region's size is fixed; drawFreqLines only
    // re-rounds + projects, and the slider's rounding can never enlarge it.
    let levels = buildFreqContours(useDays);
    if(!levels.length) return;

    // The slider controls ONLY line rounding: map 0.6..4.0 -> Laplacian passes.
    // Laplacian smoothing (and the B-spline below) only pull vertices inward, so
    // more rounding makes the curves smoother but never enlarges the region.
    let iters = Math.max(0, Math.min(60, Math.round((freqSmooth()-0.6)*4)));   // 0 .. ~34 passes
    let contours = levels.map(function(L) {
        let rings = L.rings.map(function(r){ return smoothRing(r, iters); });
        return { c: { type:"MultiPolygon", coordinates: [rings] }, label: L.label };
    });

    // Project a grid coordinate (gx,gy) -> physical (x,T) -> screen pixels.
    function gridToScreen(gx, gy) {
        let xv = FREQ_XMIN + gx*FREQ_DX;          // abs. humidity [kg/kg]
        let Tv = FREQ_TMIN + gy*FREQ_DT;          // temperature [degC]
        let yv = mollier.get_x_y_tx(Tv, xv, p).y; // tilted y-coordinate
        return proj.project(xv, yv);
    }
    // Draw each contour ring as a closed B-spline through its projected vertices.
    // The marching-squares ring is an axis-aligned staircase on the coarse grid;
    // a B-spline (curveBasisClosed) smooths that staircase into the flowing curves
    // one expects, while staying INSIDE the control polygon (so it never bleeds
    // outward past the masked data footprint). It is also cheap -- it adds no
    // vertices, unlike Chaikin.
    let smoothLine = d3.line().curve(d3.curveBasisClosed);
    function contourPath(mp) {
        let dstr = "";
        mp.coordinates.forEach(function(poly) {
            poly.forEach(function(ring) {
                let r = ring;
                if(r.length>1 && r[0][0]===r[r.length-1][0] && r[0][1]===r[r.length-1][1]) r = r.slice(0,-1);
                if(r.length < 3) return;
                let s = smoothLine(r.map(function(pp){ return gridToScreen(pp[0], pp[1]); }));
                if(s) dstr += s + " ";
            });
        });
        return dstr;
    }

    // Clip the contours to the unsaturated region so their lower edge follows
    // the SMOOTH dew-point (saturation) curve instead of a blocky grid mask.
    updateSaturationClip();
    let pathsG = freqLines.append("g").attr("clip-path","url(#freqSatClip)");
    pathsG.selectAll("path").data(contours).enter().append("path")
        .attr("d", function(d){ return contourPath(d.c); })
        .attr("fill", "none")
        .attr("stroke", "#333")
        .attr("stroke-width", 1.6)
        .attr("opacity", 1);

    // Invisible wide hover targets (above the zoom-brush) so hovering a contour
    // shows its hours/year value.
    let hitG = freqHover.append("g").attr("clip-path","url(#freqSatClip)");
    hitG.selectAll("path").data(contours).enter().append("path")
        .attr("d", function(d){ return contourPath(d.c); })
        .attr("fill","none").attr("stroke","transparent").attr("stroke-width",8)
        .style("pointer-events","stroke")
        .style("cursor","crosshair")
        .on("mouseover mousemove", function(event, d) { showFreqTip(d.label, event); })
        .on("mouseout", function() { d3.select("#freqtip").remove(); });

    // Value labels (topmost group, above the contours and the mean line) with a
    // solid white background box so the numbers stay readable everywhere. They
    // sit on visible (unsaturated) contour points and never overlap; a label
    // without a free spot is left out (hover the line to read its value).
    hxDrawContourLabels(freqLabels, contours, function(gx, gy) {
        let xv = FREQ_XMIN + gx*FREQ_DX, Tv = FREQ_TMIN + gy*FREQ_DT;
        if(xv > mollier.get_x_y(Tv, 1, p).x) return null;   // beyond saturation
        return gridToScreen(gx, gy);
    }, { width: width, height: height });
}

// Floating tooltip shown while hovering a frequency contour line.
function showFreqTip(value, event) {
    let m = d3.pointer(event, plot.node());
    let g = d3.select("#freqtip");
    if(g.empty()) {
        g = plot.append("g").attr("id","freqtip").attr("pointer-events","none");
        g.append("rect").attr("rx",3).attr("fill","white")
            .attr("stroke","#888").attr("stroke-width",1).attr("opacity",0.95);
        g.append("text").attr("font-family","helvetica").attr("font-size",13).attr("fill","#111");
    }
    let txt = g.select("text").attr("x", m[0]+14).attr("y", m[1]-10)
        .text(value + (freqDays() ? " days/year outside" : " h/year outside"));
    let bb = txt.node().getBBox();
    g.select("rect").attr("x", bb.x-5).attr("y", bb.y-3)
        .attr("width", bb.width+10).attr("height", bb.height+6);
    g.raise();
}

// Build/refresh a clip path = the unsaturated region (above-left of the
// dew-point curve; below-right in the psychrometric layout). Used to cut the
// frequency contours along the smooth saturation line. Coordinates are in
// plot-local space (userSpaceOnUse).
function updateSaturationClip() {
    let sat = [];
    let t0 = domainY[0]-3, t1 = domainY[1]+3, ns = 120;
    for(let i=0;i<=ns;i++) {
        let t = t0 + (t1-t0)*i/ns;
        let s = mollier.get_x_y(t, 1, p);   // saturation point (phi = 1)
        sat.push(proj.project(s.x, s.y));
    }
    let pad = Math.max(width, height) + 200;
    let dryWarm = orientation === "psychrometric" ? [width+pad, height+pad] : [-pad, -pad];
    let pts = [[-pad, height+pad]]
        .concat(sat)                                  // dew-point curve, cold -> warm
        .concat([[width+pad, -pad], dryWarm]);        // wrap the dry (unsaturated) side
    let cp = canvas.select("#freqSatClip");
    if(cp.empty()) cp = canvas.append("clipPath").attr("id","freqSatClip");
    cp.selectAll("polygon").remove();
    cp.append("polygon").attr("points", pts.map(function(q){ return q.join(","); }).join(" "));
}

// Mean-value curves, like the classic diagram:
//   h_m = mean enthalpy per temperature  (bin by temperature)  -> orange
//   t_m = mean temperature per enthalpy  (bin by enthalpy)      -> blue
function drawMeanLine() {
    meanLine.selectAll("*").remove();
    let showH = dchk("show_hm"), showT = dchk("show_tm");
    if(dataXY.length === 0 || (!showH && !showT)) return;

    // Bin the data points by keyFn (rounded) and return the mean (x,y) per bin,
    // ordered by the bin key.
    function meanCurve(keyFn) {
        let bins = {};
        dataXY.forEach(function(d) {
            let k = Math.round(keyFn(d));
            if(!bins[k]) bins[k] = { sx:0, sy:0, n:0, k:k };
            bins[k].sx += d.x; bins[k].sy += d.y; bins[k].n += 1;
        });
        return Object.keys(bins).map(function(kk){ return bins[kk]; })
            .filter(function(b){ return b.n >= 1; })   // include the extreme bins (reach the last data point)
            .sort(function(a,b){ return a.k - b.k; })
            .map(function(b){ return { x: b.sx/b.n, y: b.sy/b.n }; });
    }

    // Centred moving average to smooth the per-bin noise.
    function smooth(pts, w) {
        if(pts.length < 3) return pts;
        let h = Math.floor(w/2), out = [];
        for(let i=0;i<pts.length;i++) {
            let sx=0, sy=0, n=0;
            for(let j=i-h;j<=i+h;j++){ if(j<0||j>=pts.length) continue; sx+=pts[j].x; sy+=pts[j].y; n++; }
            out.push({ x: sx/n, y: sy/n });
        }
        return out;
    }

    let lineGen = d3.line().x(function(d){ return P(d)[0]; }).y(function(d){ return P(d)[1]; })
                    .curve(d3.curveCatmullRom);

    function drawCurve(pts, color, mainChar, dyLabel) {
        if(pts.length < 2) return;
        meanLine.append("path").datum(pts).attr("d", lineGen)
            .attr("fill","none").attr("stroke",color).attr("stroke-width",2.5);
        let last = P(pts[pts.length-1]);
        let t = meanLine.append("text")
            .attr("x", last[0]+7).attr("y", last[1]+dyLabel)
            .attr("font-family","helvetica").attr("font-size",15).attr("font-style","italic")
            .attr("fill",color).attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke");
        t.append("tspan").text(mainChar);
        t.append("tspan").attr("baseline-shift","sub").attr("font-size","10").text("m");
    }

    if(showH) drawCurve(smooth(meanCurve(function(d){ return mollier.temperature(d.x, d.y); }), 5), "#f97316", "h", -4);
    if(showT) drawCurve(smooth(meanCurve(function(d){ return mollier.enthalpy(d.x, d.y); }), 5), "#2563eb", "t", 14);
}

// Separable normalized box blur over a grid (preserves the overall sum).
function boxBlur2D(grid, nx, ny, r) {
    let tmp = new Array(nx*ny).fill(0);
    let out = new Array(nx*ny).fill(0);
    let w = 2*r + 1;
    for(let iy=0; iy<ny; iy++) {
        for(let ix=0; ix<nx; ix++) {
            let s = 0;
            for(let k=-r; k<=r; k++) {
                let j = Math.min(nx-1, Math.max(0, ix+k));
                s += grid[iy*nx+j];
            }
            tmp[iy*nx+ix] = s/w;
        }
    }
    for(let ix=0; ix<nx; ix++) {
        for(let iy=0; iy<ny; iy++) {
            let s = 0;
            for(let k=-r; k<=r; k++) {
                let j = Math.min(ny-1, Math.max(0, iy+k));
                s += tmp[j*nx+ix];
            }
            out[iy*nx+ix] = s/w;
        }
    }
    return out;
}

// Separable Gaussian blur over a grid (preserves the overall sum). Convolving
// the hour-histogram with this kernel is a kernel-density estimate; sigma is the
// bandwidth in cells. Edges use clamped (replicated) samples.
function gaussBlur2D(grid, nx, ny, sigma) {
    let r = Math.max(1, Math.ceil(3*sigma));
    let ker = new Array(2*r+1), ksum = 0;
    for(let k=-r; k<=r; k++) { let w = Math.exp(-(k*k)/(2*sigma*sigma)); ker[k+r] = w; ksum += w; }
    for(let k=0; k<ker.length; k++) ker[k] /= ksum;
    let tmp = new Array(nx*ny).fill(0);
    let out = new Array(nx*ny).fill(0);
    for(let iy=0; iy<ny; iy++) {
        for(let ix=0; ix<nx; ix++) {
            let s = 0;
            for(let k=-r; k<=r; k++) {
                let j = Math.min(nx-1, Math.max(0, ix+k));
                s += grid[iy*nx+j]*ker[k+r];
            }
            tmp[iy*nx+ix] = s;
        }
    }
    for(let ix=0; ix<nx; ix++) {
        for(let iy=0; iy<ny; iy++) {
            let s = 0;
            for(let k=-r; k<=r; k++) {
                let j = Math.min(ny-1, Math.max(0, iy+k));
                s += tmp[j*nx+ix]*ker[k+r];
            }
            out[iy*nx+ix] = s;
        }
    }
    return out;
}

// Signed polygon area (shoelace); ignores the duplicate closing vertex.
function ringArea(ring) {
    let n = ring.length;
    if(n>1 && ring[0][0]===ring[n-1][0] && ring[0][1]===ring[n-1][1]) n--;
    let a = 0;
    for(let i=0; i<n; i++) {
        let q = ring[(i+1)%n];
        a += ring[i][0]*q[1] - q[0]*ring[i][1];
    }
    return a/2;
}

// Laplacian smoothing of a CLOSED ring (ring[0] === ring[last]): each vertex moves
// to a [1,2,1]/4 average of itself and its two neighbours, repeated `iters` times.
// O(n) per pass (no vertex growth), and it only ever pulls vertices INWARD toward
// the local average, so it removes the alpha-hull's spikes/jaggedness without ever
// enlarging the enclosed region. This is the line-rounding the slider drives.
function smoothRing(ring, iters) {
    let pts = ring;
    if(pts.length > 1 && pts[0][0]===pts[pts.length-1][0] && pts[0][1]===pts[pts.length-1][1]) {
        pts = pts.slice(0, -1);
    }
    let n = pts.length;
    if(n < 4 || iters <= 0) { pts = pts.slice(); pts.push([pts[0][0], pts[0][1]]); return pts; }
    for(let it=0; it<iters; it++) {
        let out = new Array(n);
        for(let i=0; i<n; i++) {
            let a = pts[(i-1+n)%n], b = pts[i], c = pts[(i+1)%n];
            out[i] = [ (a[0]+2*b[0]+c[0])/4, (a[1]+2*b[1]+c[1])/4 ];
        }
        pts = out;
    }
    pts.push([pts[0][0], pts[0][1]]);
    return pts;
}

// Chaikin corner-cutting for a CLOSED ring (ring[0] === ring[last]), in grid
// space. Smooths the line geometry without spreading the underlying density.
function chaikin(ring, iterations) {
    let pts = ring;
    if(pts.length > 1 && pts[0][0]===pts[pts.length-1][0] && pts[0][1]===pts[pts.length-1][1]) {
        pts = pts.slice(0, -1);
    }
    for(let it=0; it<iterations; it++) {
        if(pts.length < 3) break;
        let out = [], n = pts.length;
        for(let i=0; i<n; i++) {
            let a = pts[i], b = pts[(i+1)%n];
            out.push([a[0]*0.75 + b[0]*0.25, a[1]*0.75 + b[1]*0.25]);
            out.push([a[0]*0.25 + b[0]*0.75, a[1]*0.25 + b[1]*0.75]);
        }
        pts = out;
    }
    pts.push([pts[0][0], pts[0][1]]);   // re-close
    return pts;
}

// handle mousover-event on circles
let currentcolor = null;
function handlemouseover(event, d) {
    let circle = d3.select(this);
    currentcolor = circle.attr("fill");
    circle.attr("r",1.3*radius)
            .attr("fill","black");

    let current = plot.append("g")
                    .attr("id","currentrect")
                    .attr("pointer-events","none");
                    
    let rect = current.append("rect")
            .attr("fill","whitesmoke");
            
    let X = d.x, Y = d.y;
    let temp = mollier.temperature(X, Y);
    let phi  = mollier.rel_humidity(X, Y, p);
    let hh   = mollier.enthalpy(X, Y);
    let t_dp = mollier.temperature_p_sat(phi * mollier.p_sat(temp));   // dew point

    let U = HX_UNITS, ip = units === "ip";
    let tStr = function(v) { return ip ? numFormat(U.cToF(v)) + " °F" : numFormat(v) + " °C"; };
    let lines = [
        d.time ? timeFormat(d.time) : "",
        ip ? "W:  " + numFormat(U.kgkgToGrlb(X)) + " gr/lb" : "x:  " + numFormat(X*1000) + " g/kg",
        "T:  " + tStr(temp),
        "F:  " + numFormat(phi*100) + " %",
        "h:  " + (ip ? numFormat(U.kjkgToBtulb(hh)) + " Btu/lb" : numFormat(hh) + " kJ/kg"),
        "Td: " + tStr(t_dp)
    ];
    let pos = P(d);

    let lh = 16;
    lines.forEach(function(txt, idx) {
        current.append("text").attr("class","textContent")
            .attr("x", pos[0]+20)
            .attr("y", pos[1] - 56 + idx*lh)
            .attr("font-size", 13)
            .attr("font-weight", idx === 0 ? "bold" : "normal")
            .attr("font-family","helvetica")
            .text(txt);
    });

    rect.attr("x", pos[0]+16)
        .attr("y", pos[1] - 70)
        .attr("rx", 4)
        .attr("width", 152)
        .attr("height", lines.length*lh + 14)
        .attr("stroke", "#cbd5e1");
}

function handlemouseout() {
    d3.select(this).attr("r",radius)
                    .attr("fill",currentcolor);
    d3.select("#currentrect").remove();
}

function numFormat(x) {
    return Number.parseFloat(x).toFixed(2);
}

//+++++++++++ from stack-overflow +++++++++++++++++++++++++++

function shuffle(array) {
    let currentIndex = array.length, temporaryValue, randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
    }

    return array;
}
//+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
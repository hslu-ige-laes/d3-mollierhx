let CurrentData = {};  // datacontainer that gets filled when Data is loaded via the fileinput-div
let dataXY = [];       // calculated data-positions on the diagram

let p = 101325;
document.getElementById("pressure_input").value = p;
document.getElementById("altitude_input").value = 0;

// Mollier coordinate convention ('classical' default, or 'glueck').
let convention = "classical";
let mollier = createMollier(convention);

let Height = 1000;

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

let clip = canvas.append("defs").append("svg:clipPath")
                .attr("id", "clip")
                .append("svg:rect")
                .attr("width", width )
                .attr("height", height );

let plot = canvas.append("g")
                .attr("transform","translate("+margin.left+","+margin.top+")")
                .attr("clip-path","url(#clip)");

let comfortZone = plot.append("g");
let bandOrange = plot.append("g");   // dashed ±1 K / ±5 % warning band
let bandRed = plot.append("g");      // dashed ±2.5 K / ±10 % warning band
let gBrush = plot.append("g").attr("id","2dbrush"); // putting the brush before the circles -> pointer events on circles
let circlesHandle = plot.append("g");


// Define the (x,y)-coordinate system:
let domainX0 = [0,0.02];
let domainY0 = [-20,50];

let domainX = domainX0;
let domainY = domainY0;

let x = d3.scaleLinear().range([0,width]).domain(domainX);
let y = d3.scaleLinear().range([height,0]).domain(domainY);

// Create a brush for zooming
let Brush = d3.brush()
    .extent([[0,0],[width,height]])
    .on("end",handleBrush);

gBrush.call(Brush);

let idle = false;

function handleBrush() {
    let selection = d3.event.selection;
    
    if(selection) {
        idle = true;
        gBrush.call(Brush.move,null);

        domainX = [x.invert(selection[0][0]),x.invert(selection[1][0])];
        domainY = [y.invert(selection[1][1]),y.invert(selection[0][1])];
        refreshAxis(domainX,domainY);
        sliderX.move([domainX[0]*1000,domainX[1]*1000],true);
        sliderY.move(domainY,true);
        
        draw_background();
    } else {
        if(idle) { idle = false; return; }

        domainX = domainX0;
        domainY = domainY0;
        refreshAxis(domainX,domainY);
        sliderX.move([domainX[0]*1000,domainX[1]*1000],true);
        sliderY.move(domainY,true);

        draw_background();
    }
}

function refreshAxis(domainX,domainY) {
    x.domain(domainX);
    y.domain(domainY);
}

let width_s = d3.select("#rangeX").node().offsetWidth;
// Define the sliders
let sliderX = createRangeSlider(width_s,50,"#rangeX");
sliderX.domain([domainX0[0]*1000,domainX0[1]*1000]);
sliderX.onEnd = function(a,b) {
    domainX = [a/1000,b/1000];
    refreshAxis(domainX,domainY);
    draw_background();
}

let sliderY = createRangeSlider(width_s,50,"#rangeY");
sliderY.domain(domainY0);
sliderY.onEnd = function(a,b) {
    domainY = [a,b];
    refreshAxis(domainX,domainY);
    draw_background();
}

// Sliders for the comfort-zone
let sliderT = createRangeSlider(width_s,50,"#rangeT");
sliderT.domain([-20,50]);
sliderT.onChange = function(a,b) {
    rangeT = [...[a,b]];
    refresh_comfort();
}

let sliderPhi = createRangeSlider(width_s,50,"#rangePhi");
sliderPhi.domain([0,100]);
sliderPhi.onChange = function(a,b) {
    rangePhi = [...[a/100,b/100]];
    refresh_comfort();
}

let sliderXX = createRangeSlider(width_s,50,"#rangeXX");
sliderXX.domain([0,35]);
sliderXX.onChange = function(a,b) {
    rangeX = [...[a/1000,b/1000]];
    refresh_comfort();
}


// Line-constructor for the comfort-path
let line = d3.line()
            .x(function(d) { return x(d.x); })
            .y(function(d) { return y(d.y); });

// Draw comfort zone
let rangeT =   [20,26];         sliderT.move(rangeT,true);  // update slider-values
let rangePhi = [0.3,0.65];      sliderPhi.move([rangePhi[0]*100,rangePhi[1]*100],true);
let rangeX =   [0,0.0115];      sliderXX.move([rangeX[0]*1000,rangeX[1]*1000],true);

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
    let dt = Number(document.getElementById(dtId).value) || 0;
    let dphi = (Number(document.getElementById(dphiId).value) || 0) / 100;
    let xmax = Number(document.getElementById(xId).value);   // abs humidity [g/kg]
    let rX = (xmax > 0) ? [0, xmax/1000] : [0, 0.030];
    let cp = function(v) { return Math.max(0, Math.min(1, v)); };
    drawBand(group, [rangeT[0]-dt, rangeT[1]+dt],
             [cp(rangePhi[0]-dphi), cp(rangePhi[1]+dphi)], rX, color);
    if(leg) leg.style.display = "";
    let legTxt = document.getElementById(legTxtId);
    if(legTxt) {
        var txt = "± " + dt + " K / " + (dphi*100) + " %";
        if(xmax > 0) txt += " / x≤ " + xmax + " g/kg";
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
    clip.attr("width",width).attr("height",height);
    x.range([0,width]);
    y.range([height,0]);
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
        xAxisTitle:      "absolute water content x [g/kg]"
    };
}

function draw_background() {
    let mollier_diag = d3.select("#hx_mollier_diagram").node();
    if(!(mollier_diag == null)) mollier_diag.remove();
    drawHXCoordinates(d3.select("#theplot"),Width,Height,margin,domainX,domainY,p,mollier,getLineOpts());
    drawAltitudePressure();
    drawCircles();
    refresh_comfort();
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
    let info = d3.select("#hx_mollier_diagram").append("g")
        .style("font-family", "Tahoma, Geneva, sans-serif");
    info.append("text")
        .attr("x", margin.left + width).attr("y", margin.top - 22)
        .attr("text-anchor", "end").attr("fill", "#4d4d4d").attr("font-size", 12)
        .text(altitude.toFixed(0) + " m a.s.l.");
    info.append("text")
        .attr("x", margin.left + width).attr("y", margin.top - 8)
        .attr("text-anchor", "end").attr("fill", "#4d4d4d").attr("font-size", 12)
        .text((pa/100).toFixed(0) + " hPa");
}

function handle_p() {
    p = document.getElementById("pressure_input").value;
    // keep the altitude field in sync (inverse ISA barometric formula)
    let h = (1 - Math.pow(Number(p)/101325, 1/5.25588)) / 2.25577e-5;
    document.getElementById("altitude_input").value = Math.round(h);
    calcData();
    draw_background();
}

function handle_altitude() {
    let h = Number(document.getElementById("altitude_input").value);
    // ISA barometric formula: pressure [Pa] from altitude [m a.s.l.]
    p = 101325 * Math.pow(1 - 2.25577e-5 * h, 5.25588);
    document.getElementById("pressure_input").value = Math.round(p);
    calcData();
    draw_background();
}

// Data-related functions
let radius = 5;
let timeFormat = d3.utcFormat("%Y-%m-%d %H:%M");   // tooltip date/time format
function HandleData() {
    calcData();
    
    //circlesHandle.node().remove();
    //circlesHandle = graphicContent.append("g");
    
    let ColorMap = ["lightblue","lightgreen","orange","brown"];
    
    circlesHandle.selectAll("circle")
            .data(dataXY)
            .enter().append("circle")
                .attr("cx",function(d) { return x(d.x); })
                .attr("cy",function(d) { return y(d.y); })
                .attr("r" ,radius)
                .attr("fill",function(d) { return ColorMap[Math.floor(d.z/3)]; })
                .attr("shape-rendering","optimizeSpeed")
                .attr("opacity",0.4)
                .on("mouseover",handlemouseover)
                .on("mouseout",handlemouseout);
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
                .attr("cx",function(d) { return x(d.x); })
                .attr("cy",function(d) { return y(d.y); });
}



// handle mousover-event on circles
let currentcolor = null;
function handlemouseover(d,i) {
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

    let lines = [
        d.time ? timeFormat(d.time) : "",
        "x:  " + numFormat(X*1000) + " g/kg",
        "T:  " + numFormat(temp) + " °C",
        "F:  " + numFormat(phi*100) + " %",
        "h:  " + numFormat(hh) + " kJ/kg",
        "Td: " + numFormat(t_dp) + " °C"
    ];

    let lh = 16;
    lines.forEach(function(txt, idx) {
        current.append("text").attr("class","textContent")
            .attr("x", x(X)+20)
            .attr("y", y(Y) - 56 + idx*lh)
            .attr("font-size", 13)
            .attr("font-weight", idx === 0 ? "bold" : "normal")
            .attr("font-family","helvetica")
            .text(txt);
    });

    rect.attr("x", x(X)+16)
        .attr("y", y(Y) - 70)
        .attr("rx", 4)
        .attr("width", 152)
        .attr("height", lines.length*lh + 14)
        .attr("stroke", "#cbd5e1");
}

function handlemouseout(d,i) {
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
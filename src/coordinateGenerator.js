// the Function 'drawHXCoordinates' draws the coordinate-lines of temperature,
// density, enthalpy and relative humidity into an SVG-element, that will be
// - with the id "hx_mollier_diagram" - attached to the DOM-element of that
// has the id 'containerId'. In order to fit in the plot you want to draw, the
// width and height as well as the domain of x- and y-values have to be ind-
// dicated ('domainX' resp. 'domainY'). The parameter 'p' describes the pressure
// of the fluid. Changes of 'p' affect the geometry of the coordinate-lines.

// The unit of the input parameters are as follows:
// [domainX] = kg/kg
// [domainY] = °C
// [p] = Pa = N/m^2
//
// opts (all optional):
//   showTemperature, showDensity, showRelHumidity, showEnthalpy,
//   showAbsHumidity  — curve families on/off (default true)
//   xAxisTitle       — title of the humidity axis (default "")
//   captions         — { temperature, rel_humidity, density, enthalpy,
//                        x_axis, x_axis_title }: caption texts, defaults
//                        from hxDefaultCaptions(units, orientation); ""
//                        hides a caption
//   orientation      — 'mollier' (default) or 'psychrometric' (ASHRAE:
//                        temperature horizontal, humidity ratio vertical
//                        with its scale on the right), see hxProjection
//   units            — 'si' (default) or 'ip' (°F, gr/lb, Btu/lb, lb/ft³);
//                        domains stay SI, only ticks and labels change
//
// Needs hxUnits.js (HX_UNITS, hxProjection, hxNiceTicks).

function drawHXCoordinates(container,Width,Height,margin,domainX,domainY,p,mollier,opts) {

    // Resolve the Mollier suite for the chosen convention (default 'classical').
    if (!mollier) mollier = createMollier();

    // Loop counters shared by the sections below. Declared so the file also
    // runs in strict mode / as an ES module (they used to be implicit globals).
    let i, dt;

    // Per-curve-family visibility. When a family is switched off, everything
    // belonging to it is suppressed: the iso-lines, their value labels and the
    // axis-edge caption text. Defaults: all on.
    if (!opts) opts = {};
    const showT = opts.showTemperature !== false;
    const showRho = opts.showDensity !== false;
    const showPhi = opts.showRelHumidity !== false;
    const showH = opts.showEnthalpy !== false;
    const showX = opts.showAbsHumidity !== false;
    // Orientation and units (domains stay SI in either case).
    const psy = hxOrientation(opts.orientation) === "psychrometric";
    const ip = hxIsIP(opts.units);
    const U = HX_UNITS;
    // Caption texts (English defaults, overridable for translations). An empty
    // string suppresses that caption.
    const captions = hxResolveCaptions(opts);
    const xAxisTitle = captions.x_axis_title;
    const temperature = mollier.temperature;
    const density = mollier.density;
    const rel_humidity = mollier.rel_humidity;
    const enthalpy = mollier.enthalpy;
    const get_x_y = mollier.get_x_y;
    const get_x_y_tx = mollier.get_x_y_tx;
    const y_phix = mollier.y_phix;
    const x_phiy = mollier.x_phiy;
    const y_rhox = mollier.y_rhox;
    const x_hy = mollier.x_hy;
    const y_hx = mollier.y_hx;

    // Color definition
    let colors = { t: "#63c1ff", rho: "#4d4d4d", phi: "#555555", h: "#CCCCCC", x: "#d9d9d9",};

    // Single font family for the whole chart (matches the legend/tooltip the
    // Python side draws), so every label uses the same typeface.
    const FONT = "Tahoma, Geneva, sans-serif";

    // handle margin
    let environment = container.append("svg")
                    .attr("width",Width)
                    .attr("height",Height)
                    .attr("font-family",FONT)
                    .attr("id","hx_mollier_diagram");

    let width = Width - margin.left - margin.right;
    let height = Height - margin.top - margin.bottom;

    environment.append("rect")
                .attr("width",Width)
                .attr("height",Height)
                .attr("fill","white")
    //            .attr("stroke","black");

    let plot = environment.append("g")
                    .attr("transform","translate("+margin.left+","+margin.top+")");


    // create an SVG-Element
    let foundation = plot.append("svg")
                    .attr("width",width)
                    .attr("height",height);
    foundation.append("rect")
                    .attr("width",width)
                    .attr("height",height)
                    .attr("fill","white");
    let canvas = foundation.append("g")
                    .attr("class","coordinate-lines");
    let labels = foundation.append("g")
                    .attr("class","coordinate-labels")
                    .attr("font-size",12)
                    .attr("font-family",FONT);


    // Screen mapping: x [kg/kg] and diagram-y [°C] -> px. In 'mollier'
    // orientation x/y are the horizontal/vertical scales, in 'psychrometric'
    // x runs bottom -> top and y left -> right.
    let proj = hxProjection(width, height, domainX, domainY, psy ? "psychrometric" : "mollier");
    let project = proj.project;
    let x = proj.xScale;
    let y = proj.yScale;

    // Temperature along the edge x = domainX[0], where it is a linear
    // function of y: the scale of the temperature axis.
    let tEdge = [temperature(domainX[0],domainY[0]),temperature(domainX[0],domainY[1])];
    // Humidity axis in display units (g/kg or gr/lb).
    let toDispX = ip ? U.kgkgToGrlb : function(v) { return v*1000; };
    let g0 = toDispX(domainX[0]), g1 = toDispX(domainX[1]);
    let fromDispX = ip ? function(d) { return U.grlbToKgkg(d); } : function(d) { return d/1000; };

    let tTicks;        // iso-temperature lines [°C] (= the labelled axis ticks)
    let majorTicks;    // iso-humidity lines in display units (= axis ticks)
    let axisX;         // the humidity axis group

    if(!psy) {

    // Drawing the Axis at the border of the plot
    let x_t = d3.scaleLinear().range([0,width]).domain([g0,g1]);
    let y_t = d3.scaleLinear().range([height,0]).domain(ip ? tEdge.map(U.cToF) : tEdge);

    let axisY   = plot.append("g");
    axisX   = plot.append("g").attr("transform","translate(0,"+height+")");

    if(ip) {
        // °F: round IP values (every 10 °F on usual charts) with minor ticks.
        let tf = hxNiceTicks(y_t.domain()[0], y_t.domain()[1], {steps: [1,2,5,10,20,50], length: height, minSpacing: 18});
        // minor ticks in a sibling group (an axis owns all .tick descendants)
        let axisYminor = plot.append("g");
        axisYminor.call(d3.axisLeft(y_t).tickValues(tf.minor).tickSize(3).tickFormat(""));
        axisYminor.select(".domain").remove();
        axisYminor.selectAll("line").attr("stroke",colors.t);
        axisY.call(d3.axisLeft(y_t).tickValues(tf.major));
        tTicks = tf.major.map(U.fToC);
    } else {
        axisY.call(d3.axisLeft(y_t));
        tTicks = y_t.ticks();
    }
    axisY.append("path")
            .attr("d","M "+width+" 0 V "+height);

    axisY.selectAll("text").attr("fill",colors.t);
    axisY.selectAll("text").attr("font-size",12);
    axisY.selectAll("line").attr("stroke",colors.t);
    axisY.selectAll("path").attr("stroke",colors.t);

    // Bottom axis: major ticks every 1 g/kg (with labels), minor ticks every
    // 0.1 g/kg (short marks, no labels). The top axis is intentionally omitted.
    // IP: round gr/lb values (every 10 or 20 gr/lb, depending on the width).
    let minorTicks;
    if(ip) {
        let gt = hxNiceTicks(g0, g1, {steps: [5,10,20,50,100], length: width, minSpacing: 28});
        majorTicks = gt.major;
        minorTicks = gt.minor;
    } else {
        majorTicks = d3.range(Math.ceil(g0 - 1e-9), g1 + 1e-9, 1);
        minorTicks = d3.range(g0, g1 + 1e-9, 0.1);
    }

    let axisXminor = plot.append("g").attr("transform","translate(0,"+height+")");
    axisXminor.call(d3.axisBottom(x_t).tickValues(minorTicks).tickSize(3).tickFormat(""));
    axisXminor.select(".domain").remove();

    axisX.call(d3.axisBottom(x_t).tickValues(majorTicks).tickSize(7));
    axisX.selectAll("text").attr("font-size",12);

    // Dark-grey top border (the top axis was removed, but without a line the
    // plot looks open at the top). No ticks or labels — just the frame edge.
    plot.append("path")
            .attr("d","M 0 0 H "+width)
            .attr("stroke","#4d4d4d")
            .attr("fill","none");

    // units:

    // Unit caption of the x axis: in the right margin, beside the end of the
    // axis, on the baseline of the tick numbers (so it never covers the last
    // tick number). The font shrinks when the margin is too narrow.
    let unit = axisX.append("g").attr("class","unit");
    if(captions.x_axis) {
        let xc = hxFitXAxisCaption(captions.x_axis, margin.right);
        unit.append("text")
                .attr("class","hx-caption hx-caption-x-axis")
                .attr("x",width+(ip ? 16 : 12))
                .attr("y",20)
                .attr("text-anchor","start")
                .attr("fill","black")
                .attr("font-size",xc.fontSize)
                .text(xc.text);
    }

    // y-axis title: vertical, centred along the left edge (rotated like the
    // right-edge captions), left of the tick numbers.
    if(captions.temperature) {
        let tc = hxFitCaption(captions.temperature, height - 12);
        plot.append("g").attr("class","unit")
                .attr("transform","translate("+(-(margin.left)+24)+","+(height/2)+")rotate(-90)")
                .append("text")
                    .attr("class","hx-caption hx-caption-temperature")
                    .attr("text-anchor","middle")
                    .attr("fill",colors.t)
                    .attr("font-size",tc.fontSize)
                    .text(tc.text);
    }

    // Right-edge captions, stacked top→bottom along the (rotated) right axis:
    // relative humidity, density, enthalpy. Each visible caption gets one
    // equal segment of the axis, ending flush with the top of its segment;
    // the font size follows from text length and segment length, so the
    // captions fit at any chart height.
    unit = plot.append("g").attr("class","unit")
            .attr("transform","translate("+width+",0)rotate(-90)translate("+(-height/2)+",0)");
    drawFamilyCaptions(unit, 13);

    // X-axis title centred below the bottom axis (absolute water content).
    if(xAxisTitle) {
        axisX.append("text")
                .attr("class","hx-caption hx-caption-x-axis-title")
                .attr("x",width/2)
                .attr("y",32)
                .attr("fill","black")
                .attr("font-size",12)
                .attr("text-anchor","middle")
                .text(xAxisTitle);
    }

    } else {

    // Psychrometric (ASHRAE) layout: temperature axis at the bottom, humidity
    // ratio axis on the right, thin frame lines left and top.
    let t_s = d3.scaleLinear().range([0,width]).domain(ip ? tEdge.map(U.cToF) : tEdge);
    let h_s = d3.scaleLinear().range([height,0]).domain([g0,g1]);

    let axisT = plot.append("g").attr("class","hx-axis-temperature").attr("transform","translate(0,"+height+")");
    if(ip) {
        let tf = hxNiceTicks(t_s.domain()[0], t_s.domain()[1], {steps: [1,2,5,10,20,50], length: width, minSpacing: 34});
        let axisTminor = plot.append("g").attr("transform","translate(0,"+height+")");
        axisTminor.call(d3.axisBottom(t_s).tickValues(tf.minor).tickSize(3).tickFormat(""));
        axisTminor.select(".domain").remove();
        axisTminor.selectAll("line").attr("stroke",colors.t);
        axisT.call(d3.axisBottom(t_s).tickValues(tf.major).tickSize(7));
        tTicks = tf.major.map(U.fToC);
    } else {
        axisT.call(d3.axisBottom(t_s).tickSize(7));
        tTicks = t_s.ticks();
    }
    axisT.selectAll("text").attr("fill",colors.t).attr("font-size",12);
    axisT.selectAll("line").attr("stroke",colors.t);
    axisT.selectAll("path").attr("stroke",colors.t);

    let gt = hxNiceTicks(g0, g1, {steps: ip ? [5,10,20,50,100] : [0.5,1,2,5,10], length: height, minSpacing: ip ? 22 : 16});
    majorTicks = gt.major;
    axisX = plot.append("g").attr("class","hx-axis-humidity").attr("transform","translate("+width+",0)");
    let axisXminor = plot.append("g").attr("transform","translate("+width+",0)");
    axisXminor.call(d3.axisRight(h_s).tickValues(gt.minor).tickSize(3).tickFormat(""));
    axisXminor.select(".domain").remove();
    axisX.call(d3.axisRight(h_s).tickValues(majorTicks).tickSize(7));
    axisX.selectAll("text").attr("font-size",12);

    // Frame: left and top edge.
    plot.append("path")
            .attr("d","M 0 "+height+" V 0 H "+width)
            .attr("stroke","#4d4d4d")
            .attr("fill","none");

    // Temperature caption centred below the bottom axis.
    if(captions.temperature) {
        let tc = hxFitCaption(captions.temperature, width - 12);
        axisT.append("text")
                .attr("class","hx-caption hx-caption-temperature")
                .attr("x",width/2)
                .attr("y",32)
                .attr("text-anchor","middle")
                .attr("fill",colors.t)
                .attr("font-size",tc.fontSize)
                .text(tc.text);
    }

    // Humidity-ratio caption, rotated in the right margin beyond the tick
    // numbers: the axis title if given, else the unit caption.
    let hCap = xAxisTitle || captions.x_axis;
    if(hCap) {
        let hc = hxFitCaption(hCap, height - 12);
        plot.append("g").attr("class","unit")
                .attr("transform","translate("+(width+margin.right-6)+","+(height/2)+")rotate(-90)")
                .append("text")
                    .attr("class","hx-caption "+(xAxisTitle ? "hx-caption-x-axis-title" : "hx-caption-x-axis"))
                    .attr("text-anchor","middle")
                    .attr("fill","black")
                    .attr("font-size",hc.fontSize)
                    .text(hc.text);
    }

    // Family captions (rel. humidity, density, enthalpy) along the left edge,
    // laid out like the right-edge captions of the Mollier orientation.
    let unit = plot.append("g").attr("class","unit")
            .attr("transform","rotate(-90)translate("+(-height/2)+",0)");
    drawFamilyCaptions(unit, -6);
    }

    function drawFamilyCaptions(unit, yPos) {
        let rightCaps = [];
        if(showPhi && captions.rel_humidity) rightCaps.push({key: "rel-humidity", text: captions.rel_humidity, fill: colors.phi});
        if(showRho && captions.density) rightCaps.push({key: "density", text: captions.density, fill: colors.rho});
        if(showH && captions.enthalpy) rightCaps.push({key: "enthalpy", text: captions.enthalpy, fill: "#9a9a9a"});
        hxLayoutRightCaptions(rightCaps.map(function(c) { return c.text; }), height)
            .forEach(function(l, j) {
                unit.append("text")
                        .attr("class","hx-caption hx-caption-"+rightCaps[j].key)
                        .attr("x",l.x)
                        .attr("y",yPos)
                        .attr("text-anchor","end")
                        .attr("fill",rightCaps[j].fill)
                        .attr("font-size",l.fontSize)
                        .text(l.text);
            });
    }

    // Line-constructor for the coordinate-lines (through the projection)
    let line = proj.line;

    // These points in the corners of the domain are used to estimate the
    // extent of values the four coordinates have in this domain.
    let testpoints = [{x: domainX[0],y: domainY[0],}
                     ,{x: domainX[1],y: domainY[0],}
                     ,{x: domainX[0],y: domainY[1],}
                     ,{x: domainX[1],y: domainY[1],}];

    let dimX = domainX[1]-domainX[0];
    let dimY = domainY[1]-domainY[0];
    let dx = 0;

    // The approximate number of edges drawn for one coordinate-line.
    let numpoints = 100;

    let edgevalues = [];
    let coordinateAxis = d3.scaleLinear().nice();
    let coordinatevalues = [];
    let coordilines = [];
    let hEndpoints = [];  // dew-point endpoints of the enthalpy lines

    // The following code draws the coordinate-lines of the functions.
    //++++++++++++++++++++ temperature ++++++++++++++++

    edgevalues = [];
    for(i=0;i<4;i++) {
        edgevalues.push(temperature(testpoints[i].x,testpoints[i].y));
    }
    let domainT = d3.extent(edgevalues);
    let dimT = domainT[1]-domainT[0];
    coordinateAxis.domain(domainT);
    coordinatevalues = coordinateAxis.ticks(40);

    if(showT) {
        // Draw the iso-temperature lines at exactly the tick values of the
        // temperature axis, so the blue lines always coincide with the
        // axis scale numbers regardless of the chosen tick step.
        coordilines = [];
        dx = dimX/numpoints;
        for(i=0;i<tTicks.length;i++) {
            coordilines.push([]);
            let x = domainX[0];
            while(x < domainX[1]+dx) {
                coordilines[i].push(get_x_y_tx(tTicks[i],x,p));
                x += dx;
            }
        }

        let temperaturelines = canvas.append("g").attr("id","temperature");

        temperaturelines.selectAll("path")
                .data(coordilines)
                .enter()
                    .append("path")
                    .attr("d",line)
                    .attr("stroke",colors.t)
                    .attr("fill","none");
    }

    // the coordinate labels of the iso-temperature-lines can be drawn
    // on the temperature axis of the plot, because at x=0, the temperature
    // is a linear function of y.


    //++++++++++++++++++++ density ++++++++++++++++++++

    if(showRho) {
        edgevalues = [];
        for(i=0;i<4;i++) {
            edgevalues.push(density(testpoints[i].x,testpoints[i].y,p));
        }
        if(ip) {
            let lb = d3.extent(edgevalues).map(U.kgm3ToLbft3);
            coordinatevalues = hxNiceTicks(lb[0], lb[1], {steps: [0.001,0.002,0.005,0.01,0.02], maxCount: 8})
                    .major.map(U.lbft3ToKgm3);
        } else {
            coordinateAxis.domain(d3.extent(edgevalues));
            coordinatevalues = coordinateAxis.ticks(8);
        }

        coordilines = [];
        dx = dimX/numpoints;
        for(i=0;i<coordinatevalues.length;i++) {
            coordilines.push([]);
            let x = domainX[0];
            while(x < domainX[1]+dx) {
                coordilines[i].push({x: x,y: y_rhox(coordinatevalues[i],x,p),});
                x += dx;
            }
        }

        let densitylines = canvas.append("g").attr("id","density");

        densitylines.selectAll("path")
                .data(coordilines)
                .enter()
                    .append("path")
                    .attr("d",line)
                    .attr("stroke",colors.rho)
                    .attr("fill","none");

        drawRhoCoords(); // draw the coordinate labels
    }


    //++++++++++++++++++++ relative humidity (phi) ++++

    edgevalues = [];
    for(i=0;i<4;i++) {
        edgevalues.push(rel_humidity(testpoints[i].x,testpoints[i].y,p));
    }
    let domainPhi = d3.extent(edgevalues);
    if(edgevalues[1] < 1 && rel_humidity(domainX[0]+dimX*0.99,domainY[0],p) > edgevalues[1]) {
        domainPhi[1] = 1;
    } else {
        domainPhi[1] = Math.min(domainPhi[1],1);
    }
    coordinateAxis.domain(domainPhi);
    coordinatevalues = coordinateAxis.ticks(10);

    coordilines = [];
    dt = dimT/numpoints;
    for(i=0;i<coordinatevalues.length;i++) {
        coordilines.push([]);
        let t = domainT[0];
        let x = domainX[0];
        while(t < domainT[1]+dt && x <= domainX[1]) {
            let I = coordilines[i].push(get_x_y(t,coordinatevalues[i],p));
            x = coordilines[i][I-1].x;
            t += dt;
        }
    }
    // copies for the label placement (the last curve becomes the cover)
    let phiCurves = coordilines.map(function(c) { return c.slice(); });

    let philines = canvas.append("g").attr("id","rela_humidity");

    if(showPhi) {
        philines.selectAll("path")
                .data(coordilines)
                .enter()
                    .append("path")
                    .attr("d",line)
                    .attr("stroke",colors.phi)
                    .attr("stroke-width",1.5)
                    .attr("fill","none");
    }

    // Saturation cover: the region beyond the saturation curve (larger x),
    // in data coordinates, so it lies bottom right ('mollier') or top left
    // ('psychrometric') after the projection.
    let cover = coordilines[coordilines.length-1];
    cover.push({x: domainX[1]+0.1*dimX,y: cover[cover.length-1].y,});
    cover.push({x: domainX[1]+0.1*dimX,y: domainY[0]-0.1*dimY,});
    cover.push({x: cover[0].x,y: domainY[0]-0.1*dimY,});
    cover.push({...cover[0]});

    philines.append("g").attr("id","saturation_cover")
            .selectAll("path")
            .data([cover])
            .enter()
                .append("path")
                .attr("d",line)
                .attr("stroke","black")
                .attr("stroke-width",1.5)
                .attr("fill","white");


    if(showPhi) drawPhiCoords(); // draw the coordinate labels

    //++++++++++++++++++++ absolute humidity (x) ++++++
    // Lines of constant absolute humidity at the humidity-axis tick values
    // (vertical in 'mollier', horizontal in 'psychrometric'). Drawn AFTER the
    // saturation cover so they run all the way across the chart, not only
    // to the dew-point (saturation) line.
    if(showX) {
        let xlines = canvas.append("g").attr("id","abs_humidity");
        let sel = xlines.selectAll("line")
                .data(majorTicks)
                .enter()
                    .append("line");
        if(!psy) {
            sel.attr("x1", function(d) { return x(fromDispX(d)); })
               .attr("x2", function(d) { return x(fromDispX(d)); })
               .attr("y1", 0)
               .attr("y2", height);
        } else {
            sel.attr("x1", 0)
               .attr("x2", width)
               .attr("y1", function(d) { return x(fromDispX(d)); })
               .attr("y2", function(d) { return x(fromDispX(d)); });
        }
        sel.attr("stroke",colors.x)
           .attr("fill","none");
    }

    //++++++++++++++++++++ enthalpy +++++++++++++++++++

    if(showH) {
        edgevalues = [];
        for(i=0;i<4;i++) {
            edgevalues.push(enthalpy(testpoints[i].x,testpoints[i].y));
        }
        if(ip) {
            let hb = d3.extent(edgevalues).map(U.kjkgToBtulb);
            coordinatevalues = hxNiceTicks(hb[0], hb[1], {steps: [1,2,5,10,20,50], maxCount: 20})
                    .major.map(U.btulbToKjkg);
        } else {
            coordinateAxis.domain(d3.extent(edgevalues));
            coordinatevalues = coordinateAxis.ticks(20);
        }

        // Each iso-enthalpy line is straight from the dry edge (x = domainX[0])
        // to the cold edge (y = domainY[0]). Clip it at the dew-point
        // (saturation) line: march from the dry end and stop once the relative
        // humidity reaches 100 %. That stop point is stored as the line's label
        // anchor (hEndpoints).
        coordilines = [];
        hEndpoints = [];
        let Nh = 120;
        for(i=0;i<coordinatevalues.length;i++) {
            let h = coordinatevalues[i];
            let p0 = {x: domainX[0], y: y_hx(h,domainX[0])};
            let p1 = {x: x_hy(h,domainY[0]), y: domainY[0]};
            let pts = [p0];
            let endpt = p1;
            let prev = p0;
            for(let k=1;k<=Nh;k++) {
                let f = k/Nh;
                let px = p0.x + (p1.x-p0.x)*f;
                let py = p0.y + (p1.y-p0.y)*f;
                let phiCur = rel_humidity(px,py,p);
                if(phiCur >= 1) {
                    // Interpolate the exact φ=1 crossing so every endpoint lies
                    // precisely on the saturation curve (uniform label spacing).
                    let phiPrev = rel_humidity(prev.x,prev.y,p);
                    let frac = (phiCur > phiPrev) ? (1 - phiPrev)/(phiCur - phiPrev) : 0;
                    endpt = {x: prev.x + (px-prev.x)*frac, y: prev.y + (py-prev.y)*frac};
                    break;
                }
                pts.push({x:px,y:py});
                prev = {x:px,y:py};
            }
            if(endpt !== p1) pts.push(endpt);
            coordilines.push(pts);
            hEndpoints.push({x: endpt.x, y: endpt.y, p0: p0, p1: p1, sat: (endpt !== p1)});
        }

        let enthalpylines = canvas.append("g").attr("id","enthalpy");

        enthalpylines.selectAll("path")
                .data(coordilines)
                .enter()
                    .append("path")
                    .attr("d",line)
                    .attr("stroke",colors.h)
                    .attr("fill","none");

        drawHCoords(); // value labels + caption at the dew-point line
    }


    // The following code draws the coordinate-labels to the lines.
    //++++++++++++++++++++ label functions ++++++++++++

    // Value texts in the display units.
    function hText(d) {
        return ip ? (Math.round(U.kjkgToBtulb(d)*1e6)/1e6) + " Btu/lb" : d + " kJ/kg";
    }
    function rhoText(d) {
        return ip ? U.kgm3ToLbft3(d).toFixed(3) + " lb/ft³" : d.toFixed(2) + " kg/m³";
    }
    function phiText(d) {
        let str = (d).toString();
        let ind = str.indexOf(".");
        if(ind > 0) {

            str = str.substring(0,ind)+str.substring(ind+1);
            str += "00"
            str = str.substring(0,ind+2) + "." + str.substring(ind+2);

        } else {
            str += "00";
        }
        return Number(str)+" %";
    }

    // White halo: the "backgroundtext" copy gets a thick white stroke, the
    // "realtext" copy on top the colour.
    function addHalo(label, fill) {
        let realText = label.node().appendChild(label.select(".backgroundtext").node().cloneNode(true));
        realText.setAttribute("class","realtext");
        realText.setAttribute("fill",fill);

        label.select(".backgroundtext")
                .attr("stroke","white")
                .attr("stroke-width",4);
    }

    function drawHCoords() {

        // Readable grey for the (otherwise very light) enthalpy family labels.
        let hCol = "#9a9a9a";
        let label = labels.append("g")
                    .attr("id","enthalpylabel");

        // Build a "translate+rotate" transform that keeps the label ON its
        // enthalpy line (offset ALONG the line, so the number sits on the line)
        // while holding the PERPENDICULAR gap to the dew-point curve constant.
        // The needed along-line distance is gap / sin(angle between line and
        // curve); near-tangent lines are clamped so the offset stays sane.
        // In the psychrometric orientation the line runs up-left, the text is
        // turned by 180° (anchor "end") so it stays upright.
        function hPlace(e, gap) {
            let s0 = project(e.p0.x, e.p0.y), s1 = project(e.p1.x, e.p1.y);
            let s0x = s0[0], s0y = s0[1];
            let s1x = s1[0], s1y = s1[1];
            let dxn = s1x - s0x, dyn = s1y - s0y;
            let L = Math.hypot(dxn, dyn) || 1;
            let ux = dxn / L, uy = dyn / L;
            let ang = Math.atan2(dyn, dxn) * 180 / Math.PI;

            // local tangent of the saturation curve at the endpoint
            let t = temperature(e.x, e.y), dT = 0.5;
            let sa = get_x_y(t - dT, 1, p), sb = get_x_y(t + dT, 1, p);
            let pa = project(sa.x, sa.y), pb = project(sb.x, sb.y);
            let cx = pb[0] - pa[0], cy = pb[1] - pa[1];
            let cl = Math.hypot(cx, cy) || 1;
            let cux = cx / cl, cuy = cy / cl;

            let sinA = Math.abs(ux * cuy - uy * cux);
            if(sinA < 0.25) sinA = 0.25;        // clamp near-tangent lines
            let d = gap / sinA;
            let pe = project(e.x, e.y);
            let anchor = "start";
            let px, py;
            if(!psy) {
                // small fixed nudge down-left so the numbers clear the curve a touch
                px = pe[0] + ux * d - 4; py = pe[1] + uy * d + 4;
            } else {
                px = pe[0] + ux * d; py = pe[1] + uy * d;
                if(Math.abs(ang) > 90) { ang += (ang > 0 ? -180 : 180); anchor = "end"; }
            }
            return { transform: "translate(" + px + "," + py + ") rotate(" + ang + ")", anchor: anchor };
        }

        // Value numbers, rotated along the line, offset into the fog region.
        let places = hEndpoints.map(function(e) { return hPlace(e, 7); });
        let hValues = coordinatevalues;
        if(psy) {
            // The lines are parallel: drop a label closer than 13 px
            // (perpendicular) to the previous one, and those that do not fit
            // into the axes (the text runs from the anchor up-left).
            let s0 = project(0, 0), s1 = project(x_hy(0, -10), -10);   // two points of h = 0
            let L = Math.hypot(s1[0] - s0[0], s1[1] - s0[1]) || 1;
            let ux = (s1[0] - s0[0]) / L, uy = (s1[1] - s0[1]) / L;    // along the lines, up-left
            let nx = -uy, ny = ux;                                      // normal of the lines
            let keep = [], last = null;
            hEndpoints.forEach(function(e, i) {
                let q = project(e.x, e.y), len = hText(coordinatevalues[i]).length * 6.6 + 10;
                let qe = [q[0] + ux * len, q[1] + uy * len];
                let inAxes = function(r) { return r[0] >= 0 && r[0] <= width && r[1] >= 0 && r[1] <= height; };
                if(!e.sat || !inAxes(q) || !inAxes(qe)) return;
                if(last && Math.abs((q[0] - last[0]) * nx + (q[1] - last[1]) * ny) < 13) return;
                keep.push(i); last = q;
            });
            hValues = keep.map(function(i) { return coordinatevalues[i]; });
            places = keep.map(function(i) { return places[i]; });
        }
        label.append("g").attr("class","backgroundtext").selectAll("text")
                .data(hValues)
                .enter()
                    .append("text")
                    .attr("transform", function(d,i) { return places[i].transform; })
                    .attr("text-anchor", function(d,i) { return places[i].anchor; })
                    .attr("dy","0.35em")
                    .text(hText);

        addHalo(label, hCol);

    }

    function drawRhoCoords() {
        let label = labels.append("g")
                    .attr("id","rholabel");

        if(psy) {
            // Near the bottom edge, reading upwards along the (steep) line.
            // Labels whose upper end would reach beyond the saturation curve
            // (where the enthalpy labels are) are left out.
            let x0 = x.invert(height - 24), x1 = x.invert(height - 64), x2 = x.invert(height - 110);
            let places = coordinatevalues.map(function(d) {
                let a = project(x0, y_rhox(d, x0, p)), b = project(x1, y_rhox(d, x1, p));
                let ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
                let off = (a[0] < 6 || a[0] > width - 14) || rel_humidity(x2, y_rhox(d, x2, p), p) >= 1;
                return { transform: "translate(" + a[0] + "," + a[1] + ") rotate(" + ang + ")", off: off };
            });
            label.append("g").attr("class","backgroundtext").selectAll("text")
                .data(coordinatevalues.filter(function(d, i) { return !places[i].off; }))
                .enter()
                    .append("text")
                    .attr("transform", function(d) { return places[coordinatevalues.indexOf(d)].transform; })
                    .attr("dy","-0.3em")
                    .text(rhoText);
            addHalo(label, colors.rho);
            return;
        }

        label.append("g").attr("class","backgroundtext").selectAll("text")
            .data(coordinatevalues)
            .enter()
                .append("text")
                .attr("x", function(d) {
                    return 20;
                })
                .attr("y", function(d) {
                    let ypos = y(y_rhox(d,x.invert(20),p));
                    if(ypos > height-40) ypos = height+40;
                    return ypos;
                })
                .attr("dx","-0.5em")
                .attr("dy","0.35em")
                .text(rhoText);

        addHalo(label, colors.rho);
    }

    function drawPhiCoords() {

        if(psy) { drawPhiCoordsAlong(); return; }

        let phi_threshold = rel_humidity(x.invert(width-60),y.invert(20),p);

        let label = labels.append("g")
                    .attr("id","philabel");

        label.append("g").attr("class","backgroundtext").selectAll("text")
                .data(coordinatevalues)
                .enter()
                    .append("text")
                    .attr("x", function(d) {
                        let xpos = 0;
                        if(d < phi_threshold) {
                            xpos = x(x_phiy(d,y.invert(20),p));
                        } else {
                            xpos =  width-60;
                        }
                        if(xpos < 50) xpos = -50;
                        return xpos;
                    })
                    .attr("y", function(d) {
                        if(d < phi_threshold) {
                            return 20;
                        } else {
                            return y(y_phix(d,x.invert(width-60),p));
                        }
                    })
                    .attr("dx","-0.5em")
                    .attr("dy","0.35em")
                    .text(phiText);


        addHalo(label, colors.phi);

    }

    // Psychrometric orientation: each relative-humidity label sits ON its
    // curve, rotated along it, a little before the curve leaves the axes
    // (near the top or the right edge). Labels that would overlap an earlier
    // one move further back along the curve; dropped if there is no room.
    function drawPhiCoordsAlong() {
        let label = labels.append("g")
                    .attr("id","philabel");
        let placed = [], items = [];
        let inside = function(q, m) { return q[0] >= m && q[0] <= width - m && q[1] >= m && q[1] <= height - m; };
        // from the saturation curve down, so 100 % gets the first spot
        phiCurves.slice().reverse().forEach(function(curve, ridx) {
            let d = coordinatevalues[phiCurves.length - 1 - ridx];
            let pts = curve.map(function(q) { return project(q.x, q.y); });
            let last = -1;
            for(let k=0;k<pts.length;k++) if(inside(pts[k], 0)) last = k;
            if(last < 1) return;
            let text = phiText(d), w = text.length * 6.6 + 4, h = 13;
            let insets = [30, 70, 115, 165, 220, 280];
            for(let n=0;n<insets.length;n++) {
                let q = pointBack(pts, last, insets[n]);
                if(!q) break;
                let c = Math.abs(Math.cos(q.ang * Math.PI / 180)), s = Math.abs(Math.sin(q.ang * Math.PI / 180));
                let box = { x: q.x, y: q.y, hw: (c * w + s * h) / 2, hh: (s * w + c * h) / 2, q: q };
                if(!(box.x - box.hw >= 2 && box.x + box.hw <= width - 2 && box.y - box.hh >= 2 && box.y + box.hh <= height - 2)) continue;
                let free = placed.every(function(b) {
                    return Math.abs(b.x - box.x) >= b.hw + box.hw + 2 || Math.abs(b.y - box.y) >= b.hh + box.hh + 2;
                });
                if(!free) continue;
                placed.push(box);
                items.push({ d: d, q: q });
                break;
            }
        });
        label.append("g").attr("class","backgroundtext").selectAll("text")
                .data(items)
                .enter()
                    .append("text")
                    .attr("transform", function(it) { return "translate(" + it.q.x + "," + it.q.y + ") rotate(" + it.q.ang + ")"; })
                    .attr("text-anchor","middle")
                    .attr("dy","0.35em")
                    .text(function(it) { return phiText(it.d); });
        addHalo(label, colors.phi);
    }

    // Point at arc length `dist` (px) back from pts[last] along the polyline,
    // with the direction of the curve there (degrees, turned to be upright).
    function pointBack(pts, last, dist) {
        let acc = 0;
        for(let k=last;k>0;k--) {
            let a = pts[k-1], b = pts[k];
            let seg = Math.hypot(b[0]-a[0], b[1]-a[1]);
            if(acc + seg >= dist && seg > 0) {
                let f = (dist - acc) / seg;
                let ang = Math.atan2(b[1]-a[1], b[0]-a[0]) * 180 / Math.PI;
                if(ang > 90) ang -= 180;
                if(ang <= -90) ang += 180;
                return { x: b[0] + (a[0]-b[0])*f, y: b[1] + (a[1]-b[1])*f, ang: ang };
            }
            acc += seg;
        }
        return null;
    }
}


// ---------------------------------------------------------------------------
// Caption helpers (plain globals, also used by MollierChart and pyedautils).
// ---------------------------------------------------------------------------

// Default caption texts of drawHXCoordinates (English, SI units). Override any
// of them with opts.captions = { temperature, rel_humidity, density, enthalpy,
// x_axis, x_axis_title }; an empty string hides that caption.
const HX_DEFAULT_CAPTIONS = {
    temperature:  "Temperature ϑ [°C]",   // left axis (rotated)
    rel_humidity: "rel. humidity φ [%]",  // right edge, top segment
    density:      "Density ρ [kg/m³]",    // right edge, middle segment
    enthalpy:     "Enthalpy [kJ/kg]",     // right edge, bottom segment
    x_axis:       "x [g/kg]",             // unit caption right of the x axis
    x_axis_title: ""                      // centred title below the x axis
};

// The same keys for opts.units = 'ip' (ASHRAE names and units).
const HX_DEFAULT_CAPTIONS_IP = {
    temperature:  "Dry-bulb temperature [°F]",
    rel_humidity: "Relative humidity [%]",
    density:      "Density [lb/ft³]",
    enthalpy:     "Enthalpy [Btu/lb]",
    x_axis:       "W [gr/lb]",
    x_axis_title: ""
};

// Default captions for a unit system and orientation. In the psychrometric
// orientation the humidity-ratio axis has room for a longer caption.
function hxDefaultCaptions(units, orientation) {
    let ip = hxIsIP(units);
    let c = Object.assign({}, ip ? HX_DEFAULT_CAPTIONS_IP : HX_DEFAULT_CAPTIONS);
    if (hxOrientation(orientation) === "psychrometric")
        c.x_axis = ip ? "Humidity ratio W [gr/lb]" : "Humidity ratio x [g/kg]";
    return c;
}

// Estimated average glyph width of the caption font, in em. An estimate (not
// getComputedTextLength) so the layout is the same in hidden/detached nodes.
const HX_GLYPH_EM = 0.56;
const HX_MIN_CAPTION_FONT = 8;

// Merge opts.captions (and the older opts.xAxisTitle) over the defaults for
// opts.units / opts.orientation (hxDefaultCaptions).
function hxResolveCaptions(opts) {
    opts = opts || {};
    let c = hxDefaultCaptions(opts.units, opts.orientation);
    if (opts.xAxisTitle != null) c.x_axis_title = String(opts.xAxisTitle);
    let user = opts.captions || {};
    Object.keys(user).forEach(function(key) {
        if (user[key] != null) c[key] = String(user[key]);
    });
    return c;
}

// Font size (px) that fits `text` into `room` px, clamped to [8, maxFont].
// Text that would need less than 8 px is shortened with an ellipsis.
function hxFitCaption(text, room, maxFont) {
    maxFont = maxFont || 12;
    let fit = function(len) { return room / (Math.max(len, 1) * HX_GLYPH_EM); };
    if (fit(text.length) < HX_MIN_CAPTION_FONT) {
        let max = Math.max(4, Math.floor(room / (HX_MIN_CAPTION_FONT * HX_GLYPH_EM)) - 1);
        text = text.slice(0, max).replace(/\s+$/, "") + "…";
    }
    let fontSize = Math.max(HX_MIN_CAPTION_FONT, Math.min(maxFont, fit(text.length)));
    return { text: text, fontSize: Math.round(fontSize * 100) / 100 };
}

// Layout of the rotated right-edge captions. `texts` are the visible captions
// from top to bottom, `axisLength` the plot height in px. Each caption gets an
// equal segment of the axis and ends flush with the top of its segment.
// All captions share one font size (that of the longest one).
// Returns [{text, x, fontSize}], x in the rotated frame (0 = middle of the
// axis, positive = up, text-anchor "end").
function hxLayoutRightCaptions(texts, axisLength, maxFont) {
    let n = texts.length;
    if (!n) return [];
    let seg = axisLength / n;
    let fits = texts.map(function(text) { return hxFitCaption(text, seg - 12, maxFont); });
    let fontSize = Math.min.apply(null, fits.map(function(f) { return f.fontSize; }));
    return fits.map(function(f, i) {
        return { text: f.text, x: Math.round((axisLength / 2 - seg * i) * 10) / 10, fontSize: fontSize };
    });
}

// Font size for the x-axis unit caption placed in the right margin.
function hxFitXAxisCaption(text, marginRight, maxFont) {
    return hxFitCaption(text, Math.max(10, marginRight - 14), maxFont);
}

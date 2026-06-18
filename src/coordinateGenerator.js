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

function drawHXCoordinates(container,Width,Height,margin,domainX,domainY,p,mollier,opts) {

    // Resolve the Mollier suite for the chosen convention (default 'classical').
    if (!mollier) mollier = createMollier();

    // Per-curve-family visibility. When a family is switched off, everything
    // belonging to it is suppressed: the iso-lines, their value labels and the
    // axis-edge caption text. Defaults: all on.
    if (!opts) opts = {};
    const showT = opts.showTemperature !== false;
    const showRho = opts.showDensity !== false;
    const showPhi = opts.showRelHumidity !== false;
    const showH = opts.showEnthalpy !== false;
    const showX = opts.showAbsHumidity !== false;
    const xAxisTitle = (opts.xAxisTitle != null) ? opts.xAxisTitle : "";
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


    let x = d3.scaleLinear().range([0,width]).domain(domainX);
    let y = d3.scaleLinear().range([height,0]).domain(domainY);

    // Drawing the Axis at the border of the plot
    let x_t = d3.scaleLinear().range([0,width]).domain([domainX[0]*1000,domainX[1]*1000]);
    let y_t = d3.scaleLinear().range([height,0]).domain([temperature(domainX[0],domainY[0]),temperature(domainX[0],domainY[1])]);

    let axisY   = plot.append("g");
    let axisX   = plot.append("g").attr("transform","translate(0,"+height+")");

    axisY.call(d3.axisLeft(y_t));
    axisY.append("path")
            .attr("d","M "+width+" 0 V "+height);

    axisY.selectAll("text").attr("fill",colors.t);
    axisY.selectAll("text").attr("font-size",12);
    axisY.selectAll("line").attr("stroke",colors.t);
    axisY.selectAll("path").attr("stroke",colors.t);

    // Bottom axis: major ticks every 1 g/kg (with labels), minor ticks every
    // 0.1 g/kg (short marks, no labels). The top axis is intentionally omitted.
    let g0 = domainX[0]*1000, g1 = domainX[1]*1000;
    let majorTicks = d3.range(Math.ceil(g0 - 1e-9), g1 + 1e-9, 1);
    let minorTicks = d3.range(g0, g1 + 1e-9, 0.1);

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

    let unit = axisX.append("g").attr("class","unit");
    unit.append("rect")
            .attr("x",width-6)
            .attr("y",7)
            .attr("width",58)
            .attr("height",12)
            .attr("fill","white");
    unit.append("text")
            .attr("x",width)
            .attr("y",20)
            .attr("fill","black")
            .attr("font-size",12)
            .text("x [g/kg]");

    // y-axis title: vertical, centred along the left edge (rotated like the
    // right-edge captions), left of the tick numbers.
    plot.append("g").attr("class","unit")
            .attr("transform","translate("+(-(margin.left)+24)+","+(height/2)+")rotate(-90)")
            .append("text")
                .attr("text-anchor","middle")
                .attr("fill",colors.t)
                .attr("font-size",12)
                .text("Temperature ϑ [°C]");

    // Right-edge captions, stacked top→bottom along the (rotated) right axis:
    // Enthalpy, relative humidity, Density.
    unit = plot.append("g").attr("class","unit")
            .attr("transform","translate("+width+",0)rotate(-90)translate("+(-height/2)+",0)");
    if(showPhi) {
        unit.append("text")
                .attr("x",120)
                .attr("y",13)
                .attr("fill",colors.phi)
                .attr("font-size",12)
                .text("rel. humidity φ [%]");
    }
    if(showRho) {
        unit.append("text")
                .attr("x",0)
                .attr("y",13)
                .attr("fill",colors.rho)
                .attr("font-size",12)
                .text("Density ρ [kg/m³]");
    }
    if(showH) {
        unit.append("text")
                .attr("x",-130)
                .attr("y",13)
                .attr("fill","#9a9a9a")
                .attr("font-size",12)
                .text("Enthalpy [kJ/kg]");
    }

    // X-axis title centred below the bottom axis (absolute water content).
    if(xAxisTitle) {
        axisX.append("text")
                .attr("x",width/2)
                .attr("y",32)
                .attr("fill","black")
                .attr("font-size",12)
                .attr("text-anchor","middle")
                .text(xAxisTitle);
    }

    // Line-constructor for the coordinate-lines
    let line = d3.line()
					.x(function(d) { return x(d.x); })
                    .y(function(d) { return y(d.y); });

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
        // left (temperature) axis, so the blue lines always coincide with the
        // axis scale numbers regardless of the chosen tick step.
        let tTicks = y_t.ticks();
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
    // on the y-Axis of the plot, because at x=0, the temperature is a
    // linear function of y and has the same domain as given in the 
    // variable domainX.
    

    //++++++++++++++++++++ density ++++++++++++++++++++

    if(showRho) {
        edgevalues = [];
        for(i=0;i<4;i++) {
            edgevalues.push(density(testpoints[i].x,testpoints[i].y,p));
        }
        coordinateAxis.domain(d3.extent(edgevalues));
        coordinatevalues = coordinateAxis.ticks(8);

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
    // Vertical lines of constant absolute humidity at the bottom-axis tick
    // values. Drawn AFTER the saturation cover so they run all the way down
    // to the bottom of the chart, not only to the dew-point (saturation) line.
    if(showX) {
        let xlines = canvas.append("g").attr("id","abs_humidity");
        xlines.selectAll("line")
                .data(majorTicks)
                .enter()
                    .append("line")
                    .attr("x1", function(d) { return x(d/1000); })
                    .attr("x2", function(d) { return x(d/1000); })
                    .attr("y1", 0)
                    .attr("y2", height)
                    .attr("stroke",colors.x)
                    .attr("fill","none");
    }

    //++++++++++++++++++++ enthalpy +++++++++++++++++++

    if(showH) {
        edgevalues = [];
        for(i=0;i<4;i++) {
            edgevalues.push(enthalpy(testpoints[i].x,testpoints[i].y));
        }
        coordinateAxis.domain(d3.extent(edgevalues));
        coordinatevalues = coordinateAxis.ticks(20);

        // Each iso-enthalpy line is straight from the left edge to the bottom
        // edge. Clip it at the dew-point (saturation) line: march from the dry
        // end and stop once the relative humidity reaches 100 %. That stop
        // point is stored as the line's label anchor (hEndpoints).
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
        function hTransform(e, gap) {
            let s0x = x(e.p0.x), s0y = y(e.p0.y);
            let s1x = x(e.p1.x), s1y = y(e.p1.y);
            let dxn = s1x - s0x, dyn = s1y - s0y;
            let L = Math.hypot(dxn, dyn) || 1;
            let ux = dxn / L, uy = dyn / L;
            let ang = Math.atan2(dyn, dxn) * 180 / Math.PI;

            // local tangent of the saturation curve at the endpoint
            let t = temperature(e.x, e.y), dT = 0.5;
            let sa = get_x_y(t - dT, 1, p), sb = get_x_y(t + dT, 1, p);
            let cx = x(sb.x) - x(sa.x), cy = y(sb.y) - y(sa.y);
            let cl = Math.hypot(cx, cy) || 1;
            let cux = cx / cl, cuy = cy / cl;

            let sinA = Math.abs(ux * cuy - uy * cux);
            if(sinA < 0.25) sinA = 0.25;        // clamp near-tangent lines
            let d = gap / sinA;
            // small fixed nudge down-left so the numbers clear the curve a touch
            let px = x(e.x) + ux * d - 4, py = y(e.y) + uy * d + 4;
            return "translate(" + px + "," + py + ") rotate(" + ang + ")";
        }

        // Value numbers, rotated along the line, offset into the fog region.
        label.append("g").attr("class","backgroundtext").selectAll("text")
                .data(coordinatevalues)
                .enter()
                    .append("text")
                    .attr("transform", function(d,i) { return hTransform(hEndpoints[i], 7); })
                    .attr("text-anchor","start")
                    .attr("dy","0.35em")
                    .text( function(d) { return d + " kJ/kg"; });

        let realText = label.node().appendChild(label.select(".backgroundtext").node().cloneNode(true));
        realText.setAttribute("class","realtext");
        realText.setAttribute("fill",hCol);

        label.select(".backgroundtext")
                .attr("stroke","white")
                .attr("stroke-width",4);

    }

    function drawRhoCoords() {
        let label = labels.append("g")
                    .attr("id","rholabel");
                    
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
                .text( function(d) { return d.toFixed(2) + " kg/m³"; });

        let realText = label.node().appendChild(label.select(".backgroundtext").node().cloneNode(true));
        realText.setAttribute("class","realtext");
        realText.setAttribute("fill",colors.rho);

        label.select(".backgroundtext")
                .attr("stroke","white")
                .attr("stroke-width",4);
    }

    function drawPhiCoords() {

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
                    .text( function(d) { 
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
                    });


        let realText = label.node().appendChild(label.select(".backgroundtext").node().cloneNode(true));
        realText.setAttribute("class","realtext");
        realText.setAttribute("fill",colors.phi);

        label.select(".backgroundtext")
                .attr("stroke","white")
                .attr("stroke-width",4);

    }
}

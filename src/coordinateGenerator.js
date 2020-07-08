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

function drawHXCoordinates(containerId,Width,Height,margin,domainX,domainY,p) {

    // Color definition
    let colors = { t: "#63c1ff", rho: "grey", phi: "green", h: "#e3362d",};

    // handle margin
    let environment = d3.select(containerId).append("svg")
                    .attr("width",Width)
                    .attr("height",Height)
                    .attr("id","hx_mollier_diagram");

    let width = Width - margin.left - margin.right;
    let height = Height - margin.top - margin.bottom;

    environment.append("rect")
                .attr("width",Width)
                .attr("height",Height)
                .attr("fill","white")
                .attr("stroke","black");

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
                    .attr("font-size",10)
                    .attr("font-family","sans-serif");


    let x = d3.scaleLinear().range([0,width]).domain(domainX);
    let y = d3.scaleLinear().range([height,0]).domain(domainY);

    // Drawing the Axis at the border of the plot
    let x_t = d3.scaleLinear().range([0,width]).domain([domainX[0]*1000,domainX[1]*1000]);
    let y_t = d3.scaleLinear().range([height,0]).domain([temperature(domainX[0],domainY[0]),temperature(domainX[0],domainY[1])]);

    let axisY   = plot.append("g");
    let axisX   = plot.append("g").attr("transform","translate(0,"+height+")");
    let axisXtop = plot.append("g");

    axisY.call(d3.axisLeft(y_t));
    axisY.append("path")
            .attr("d","M "+width+" 0 V "+height);

    axisY.selectAll("text").attr("fill",colors.t);
    axisY.selectAll("line").attr("stroke",colors.t);
    axisY.selectAll("path").attr("stroke",colors.t);

    axisX.call(d3.axisBottom(x_t));
    axisXtop.call(d3.axisTop(x_t));

    // units:

    let unit = axisX.append("g").attr("class","unit");
    unit.append("rect")
            .attr("x",width-13)
            .attr("y",7)
            .attr("width",26)
            .attr("height",10)
            .attr("fill","white");
    unit.append("text")
            .attr("x",width)
            .attr("y",15)
            .attr("fill","black")
            .text("g/kg");

    unit = axisXtop.append("g").attr("class","unit");
    unit.append("rect")
            .attr("x",width-13)
            .attr("y",-18)
            .attr("width",26)
            .attr("height",10)
            .attr("fill","white");
    unit.append("text")
            .attr("x",width)
            .attr("y",-10)
            .attr("fill","black")
            .text("g/kg");

    unit = axisY.append("g").attr("class","unit");
    unit.append("rect")
            .attr("x",-22)
            .attr("y",-18)
            .attr("width",15)
            .attr("height",10)
            .attr("fill","white");
    unit.append("text")
            .attr("x",-10)
            .attr("y",-10)
            .attr("fill",colors.t)
            .text("°C");

    unit = plot.append("g").attr("class","unit")
            .attr("transform","translate("+width+",0)rotate(-90)translate("+(-height/2)+",0)");
    unit.append("text")
            .attr("x",-90)
            .attr("y",13)
            .attr("fill",colors.h)
            .attr("font-size",10)
            .attr("font-family","sans-serif")
            .text("enthalpy: [h] = kJ/kg");
    unit.append("text")
            .attr("x",10)
            .attr("y",13)
            .attr("fill",colors.rho)
            .attr("font-size",10)
            .attr("font-family","sans-serif")
            .text("density: [rho] = kg/m^3");

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

    // The following code draws the coordinate-lines of the four functions.
    //++++++++++++++++++++ temperature ++++++++++++++++

    edgevalues = [];
    for(i=0;i<4;i++) {
        edgevalues.push(temperature(testpoints[i].x,testpoints[i].y));
    }
    let domainT = d3.extent(edgevalues);
    let dimT = domainT[1]-domainT[0];
    coordinateAxis.domain(domainT);
    coordinatevalues = coordinateAxis.ticks(40);

    coordilines = [];
    dx = dimX/numpoints;
    for(i=0;i<coordinatevalues.length;i++) {
        coordilines.push([]);
        let x = domainX[0];
        while(x < domainX[1]+dx) {
            coordilines[i].push(get_x_y_tx(coordinatevalues[i],x,p));
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

    // the coordinate labels of the iso-temperature-lines can be drawn
    // on the y-Axis of the plot, because at x=0, the temperature is a
    // linear function of y and has the same domain as given in the 
    // variable domainX.
    

    //++++++++++++++++++++ density ++++++++++++++++++++

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
                    
    philines.selectAll("path")
            .data(coordilines)
            .enter()
                .append("path")
                .attr("d",line)
                .attr("stroke",colors.phi)
                .attr("stroke-width",1.5)
                .attr("fill","none");

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


    drawPhiCoords(); // draw the coordinate labels

    //++++++++++++++++++++ enthalpy +++++++++++++++++++

    edgevalues = [];
    for(i=0;i<4;i++) {
        edgevalues.push(enthalpy(testpoints[i].x,testpoints[i].y));
    }
    coordinateAxis.domain(d3.extent(edgevalues));
    coordinatevalues = coordinateAxis.ticks(20);

    coordilines = [];
    dt = dimT/numpoints;
    for(i=0;i<coordinatevalues.length;i++) {
        coordilines.push([]);
        coordilines[i].push({x: domainX[0],y: y_hx(coordinatevalues[i],domainX[0]),});
        coordilines[i].push({x: x_hy(coordinatevalues[i],domainY[0]),y: domainY[0],});
    }

    let enthalpylines = canvas.append("g").attr("id","enthalpy");
                   
    enthalpylines.selectAll("path")
            .data(coordilines)
            .enter()
                .append("path")
                .attr("d",line)
                .attr("stroke",colors.h)
                .attr("fill","none");

    drawHCoords(); // draw the coordinate labels


    // The following code draws the coordinate-labels to the lines.
    //++++++++++++++++++++ label functions ++++++++++++

    function drawHCoords() {

        let h_threshold = enthalpy(x.invert(width-20),y.invert(height-20));

        let label = labels.append("g")
                    .attr("id","enthalpylabel");

        label.append("g").attr("class","backgroundtext").selectAll("text")
                .data(coordinatevalues)   
                .enter()
                    .append("text")       
                    .attr("x", function(d) {
                        let xpos = 0;
                        if(d < h_threshold) {
                            xpos = x(x_hy(d,y.invert(height-20)));
                        } else {
                            xpos = width-20;
                        }
                        if(xpos < 15) xpos = -50;
                        return xpos;
                    })
                    .attr("y", function(d) {
                        if(d < h_threshold) {
                            return height-20;
                        } else {
                            return y(y_hx(d,x.invert(width-20)));
                        }
                    })
                    .attr("dx","-0.5em")
                    .attr("dy","0.35em")
                    .text( function(d) { return d; });

        let realText = label.node().appendChild(label.select(".backgroundtext").node().cloneNode(true));
        realText.setAttribute("class","realtext");
        realText.setAttribute("fill",colors.h);

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
                .text( function(d) { return d.toFixed(2); });

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

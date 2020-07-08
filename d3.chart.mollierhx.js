let CurrentData = {};  // datacontainer that gets filled when Data is loaded via the fileinput-div
let dataXY = [];       // calculated data-positions on the diagram

let p = 101325;
document.getElementById("pressure_input").value = p;

let Height = 700;

let dimensioninfo = document.getElementById("test").getBoundingClientRect();
// this svg is created in order to measure the right width of the #test-div
let placeholder = d3.select("#test").append("svg")
                    .attr("width",dimensioninfo.width)
                    .attr("height",Height);
dimensioninfo = document.getElementById("test").getBoundingClientRect();
placeholder.node().remove();

let Width = dimensioninfo.width;
let margin = {top: 30, right: 20, bottom: 30, left: 30};

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

let confortZone = plot.append("g");
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

// Sliders for the confort-zone
let sliderT = createRangeSlider(width_s,50,"#rangeT");
sliderT.domain([-20,50]);
sliderT.onChange = function(a,b) {
    rangeT = [...[a,b]];
    refresh_confort();
}

let sliderPhi = createRangeSlider(width_s,50,"#rangePhi");
sliderPhi.domain([0,100]);
sliderPhi.onChange = function(a,b) {
    rangePhi = [...[a/100,b/100]];
    refresh_confort();
}

let sliderXX = createRangeSlider(width_s,50,"#rangeXX");
sliderXX.domain([0,35]);
sliderXX.onChange = function(a,b) {
    rangeX = [...[a/1000,b/1000]];
    refresh_confort();
}


// Line-constructor for the confort-path
let line = d3.line()
            .x(function(d) { return x(d.x); })
            .y(function(d) { return y(d.y); });

// Draw confort zone
let rangeT =   [20,26];         sliderT.move(rangeT,true);  // update slider-values
let rangePhi = [0.3,0.65];      sliderPhi.move([rangePhi[0]*100,rangePhi[1]*100],true);
let rangeX =   [0,0.0115];      sliderXX.move([rangeX[0]*1000,rangeX[1]*1000],true);

let pathos = createConfort(rangeT,rangePhi,rangeX,p);
confortZone.selectAll("path")
            .data([pathos])
            .enter()
                .append("path")
                .attr("d",line)
                .attr("fill","blue")
                .attr("fill-opacity",0.2)
                .attr("stroke","black");

function refresh_confort() {
    pathos = createConfort(rangeT,rangePhi,rangeX,p);
    confortZone.selectAll("path")
                .data([pathos])
                    .attr("d",line);

    //one could do this also with the function 'drawConfort':
    //drawConfort("#theplot",Width,Height,margin,domainX,domainY,rangeT,rangePhi,rangeX,p);
}

// Draw the hx-diagram-background with the coordinate-lines
draw_background();

// Handle Resizing of window
window.addEventListener('resize', function() { 

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

});

function draw_background() {
    let mollier_diag = d3.select("#hx_mollier_diagram").node();
    if(!(mollier_diag == null)) mollier_diag.remove();
    drawHXCoordinates("#theplot",Width,Height,margin,domainX,domainY,p);
    drawCircles();
    refresh_confort();
}

function handle_p() {
    p = document.getElementById("pressure_input").value;
    calcData();
    draw_background();
}

// Data-related functions
let radius = 5;
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
            let newElement = get_x_y(d[2],d[1]/100,p);
            newElement.z = d[0].getMonth()%12;
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
            
    current.append("text").attr("class","textContent")
            .attr("x",x(d.x)+20)
            .attr("y",y(d.y)-20)
            .attr("font-size",14)
            .attr("font-family","helvetica")
            .text("x: " + numFormat(d.x*1000) + " g/kg");

    current.append("text").attr("class","textContent")
            .attr("x",x(d.x)+20)
            .attr("y",y(d.y)-6)
            .attr("font-size",14)
            .attr("font-family","helvetica")
            .text("T: " + numFormat(temperature(d.x,d.y)) + " °C");

    current.append("text").attr("class","textContent")
            .attr("x",x(d.x)+20)
            .attr("y",y(d.y)+8)
            .attr("font-size",14)
            .attr("font-family","helvetica")
            .text("F: " + numFormat(rel_humidity(d.x,d.y,p)*100) + " %");
    
    rect.attr("x",x(d.x)+18)
        .attr("y",y(d.y)-32)
        .attr("width",85)
        .attr("height",42);
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
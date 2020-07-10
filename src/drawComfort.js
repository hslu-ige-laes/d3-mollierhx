// Function that draws a comfort-zone polygon to a container with defined width and height
function drawComfort(containerId,Width,Height,margin,domainX,domainY,rangeT,rangePhi,rangeX,p) {

	// handle margin
    let environment = d3.select(containerId).append("svg")
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

	// Line-constructor for the comfort-path
	let line = d3.line()
					.x(function(d) { return x(d.x); })
					.y(function(d) { return y(d.y); });

	let pathos = createcomfort(rangeT,rangePhi,rangeX,p);
	plot.selectAll("path")
				.data([pathos])
				.enter()
					.append("path")
					.attr("d",line)
					.attr("fill","blue")
					.attr("fill-opacity",0.2)
					.attr("stroke","black");
}

// Function that returns an array of {x,y}-objects, that describe points on a hx-diagram with 
// kg/kg as unit for 'x' and °C as unit for 'y'. This array can then be rendered as an svg-path
// that describes the comfortzone that is defined with the three comfort-ranges: rangeT,
// rangePhi and rangeX.

function createcomfort(rangeT,rangePhi,rangeX,p) { 
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


function createRangeSlider(Width,Height,container_id) {
	let width = Math.max(Width,50);
	let height = Math.max(Height,35);
	let container = d3.select(container_id);
	let min_init = 0;
	let max_init = 1;

	let changeEnabled = true;
	
	
	let margin = {top: 10, right: 70, bottom: 20, left: 70};
	let width_ = width-margin.right-margin.left;
	let height_ = height-margin.top-margin.bottom;
	
	let x = d3.scaleLinear().range([0,width_]).domain([0,1]);
	let xivt = x.invert;
	
	let slider = new Object({ 
			onChange: function(min,max) {}, 
			onEnd: function(min,max) {}, 
			move: function(selection,suppressChange = false) { 
									changeEnabled = !suppressChange; 
									this.values = [...selection]; 
									gBrush.call(Brush.move,[x(selection[0]),x(selection[1])]); 
									changeEnabled = true;
								},
			values: [min_init,max_init],
			domain: function(dom) { x.domain(dom); 
									xivt = x.invert; xAxis.call(d3.axisBottom(x)); 
									this.values = [...dom]; this.domval = [...dom]; 
									leftinput.attr("value",slider.values[0]);
									rightinput.attr("value",slider.values[1]); }, 
			domval: [],
			width: function(w) { width = Math.max(w,50); 
								 width_ = width-margin.right-margin.left;
								 x.range([0,width_]);
								 xivt = x.invert;
								 slidercontainer.attr("width",width);
								 rightinputcontainer.attr("x",width-59);
								 backgroundrect.attr("width",width_);
								 canvas.attr("width",width_);
								 Brush.extent([[0,0],[width_,height_]]);
								 gBrush.call(Brush);
								 xAxis.call(d3.axisBottom(x));
								 changeEnabled = false;
								 gBrush.call(Brush.move,[x(slider.values[0]),x(slider.values[1])]);
								 changeEnabled = true;
								}
			});
	
	let slidercontainer = container.append("svg")
						.attr("width",width)
						.attr("height",height);

	let leftinput = slidercontainer
					.append("foreignObject")
					.attr("x",5)
					.attr("y",10)
					.attr("width",54) // the input field is 4px larger than the input itself
					.attr("height",25)
					.append("xhtml:div")
					.append("input")
					.style("width","50px")
					.attr("type","text");

	let rightinputcontainer = slidercontainer
					.append("foreignObject")
					.attr("x",width-59)
					.attr("y",10)
					.attr("width",54)
					.attr("height",25);

	let rightinput = rightinputcontainer
					.append("xhtml:div")
					.append("input")
					.style("width","50px")
					.attr("type","text");

	let canvas = slidercontainer.append("g")
					.attr("transform","translate("+margin.left+","+margin.top+")");
						
	let backgroundrect = canvas.append("rect")
			.attr("width",width_)
			.attr("height",height_)
			.attr("fill","white")
			.attr("stroke","black")
			.attr("stroke-width",1)
			.attr("shape-rendering","optimizeSpeed");
		
	
	let Brush = d3.brushX()
				.extent([[0,0],[width_,height_]])
				.on("brush",refreshValues_brush)
				.on("end",refreshValues_end);
				
	let gBrush = canvas.append("g").attr("stroke","black");
	gBrush.call(Brush);
	gBrush.call(Brush.move,[x(min_init),x(max_init)]);
	
	let xAxis = canvas.append("g").attr("transform","translate(0,"+height_+")");
	xAxis.call(d3.axisBottom(x));
	
	leftinput.node().onfocus = function() { this.select(); };
	
	leftinput.node().addEventListener("keyup",function(event) {
		handleTextInput(event,this,0);
	});
	
	rightinput.node().onfocus = function() { this.select(); };
	
	rightinput.node().addEventListener("keyup",function(event) {
		handleTextInput(event,this,1);
	});
	
	function handleTextInput(event,thiselement,indiz) {
		if(event.keyCode == 13) {
			event.preventDefault();
			if 	   (thiselement.value > slider.domval[1]) slider.values[indiz] = slider.domval[1];
			else if(thiselement.value < slider.domval[0]) slider.values[indiz] = slider.domval[0];
			else 										  slider.values[indiz] = Number(thiselement.value);
			
			if(slider.values[0]>slider.values[1]) {
				let temp = slider.values[1];
				slider.values[1] = slider.values[0];
				slider.values[0] = temp;
			}
			gBrush.call(Brush.move,[x(slider.values[0]),x(slider.values[1])]);
			slider.onEnd(slider.values[0],slider.values[1]);
		}
	}
	
	function refreshValues_brush() {
		slider.values = d3.event.selection;
		slider.values[0] = xivt(slider.values[0]);
		slider.values[1] = xivt(slider.values[1]);
		leftinput.attr("value",slider.values[0]);
		rightinput.attr("value",slider.values[1]);
		if(changeEnabled) slider.onChange(slider.values[0],slider.values[1]);
	}
	function refreshValues_end() {
		slider.values = d3.event.selection;
		slider.values[0] = xivt(slider.values[0]);
		slider.values[1] = xivt(slider.values[1]);
		leftinput.attr("value",slider.values[0]);
		rightinput.attr("value",slider.values[1]);
		if(changeEnabled) slider.onEnd(slider.values[0],slider.values[1]);
	}
	
	return slider;
	
}



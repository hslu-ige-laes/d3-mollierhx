var reader = new FileReader();

if (window.File && window.FileReader && window.FileList && window.Blob) {
	document.getElementById("files")
		.addEventListener("change", handleFileSelect, false);
} else {
alert("The File APIs are not fully supported in this browser.");
}

//  ISO 8601 - time parse:
var parseTime = d3.isoParse;

function formatData(fileContent,removeNull){
						// Diese Funktion formatiert den
						// fileContent in Datenarrays (daten).

	var fileRows = fileContent.split("\n");

	// Meteonorm hourly .dat: no header, comma-separated columns
	//   year, month, day, hour, temperature [degC], rel. humidity [%]
	// Detected by a numeric first field (the year) on the first line.
	var f0 = (fileRows[0] || "").split(",");
	if(f0.length >= 6 && f0[0].trim() !== "" && !isNaN(Number(f0[0])) && Number(f0[0]) > 1800) {
		return formatMeteonorm(fileRows);
	}

	var fileParts = [];
	var data = { headers: [], values: [],};

	var sc = ",";
	
	if(fileRows[1].indexOf(sc)<0) // first row where data is attended
	{
		alert("Could not read file. Is it really a CSV-file?");
	}

	if(fileRows[0].indexOf(sc)>-1)
	{
		data.headers = fileRows[0].split(sc);
	} else {
		alert("could not properly read header");
	}
	
	var n = fileRows[1].split(sc).length;
	var N = fileRows.length;
	var whitespace = /\s/g; 
	for(var i=1;i<N;i++)
	{
		if(fileRows[i].indexOf(sc)>-1)
		{		
			data.values.push(fileRows[i].split(sc));
			var k = data.values.length-1;
			data.values[k][0] = parseTime(data.values[k][0]);
			var m = data.values[k].length;
			if(m != n) { alert("rows don't have the same size!"); return; }
			for(var j=1;j<m;j++)
			{
				if(data.values[k][j] == "" || data.values[k][j].replace(whitespace,"T") == "T") // data.values[k][j].charCodeAt(0) == 13 sollte auch gehen
				{
					data.values[k][j] = NaN;
				} else {
					data.values[k][j] = Number(data.values[k][j]);
				}
			}
		} else {
			if(i<N-1)
			alert("reading error in line " + i + ". Missing ',' ...");
		}
		
	}
	return data;
}



// Parse a Meteonorm hourly .dat file (year, month, day, hour, temperature,
// rel. humidity) into the same { headers, values } structure the diagram
// expects: each value row is [Date, humidity, temperature].
function formatMeteonorm(fileRows) {
	var data = { headers: ["timestamp","humidity","temperature"], values: [] };
	for(var i=0;i<fileRows.length;i++) {
		var row = fileRows[i].trim();
		if(row === "" || row.indexOf(",") < 0) continue;
		var c = row.split(",");
		if(c.length < 6) continue;
		var y = Number(c[0]), mo = Number(c[1]), d = Number(c[2]), h = Number(c[3]);
		var temp = Number(c[4]), rh = Number(c[5]);
		if(isNaN(y) || isNaN(mo) || isNaN(d) || isNaN(h)) continue;
		// hours run 1..24 -> use h-1 so hour 1 maps to 00:00 (UTC).
		var dt = new Date(Date.UTC(y, mo-1, d, h-1, 0, 0));
		data.values.push([dt, rh, temp]);
	}
	return data;
}

function handleFileSelect(evt) {
	CurrentData = {};
	document.getElementById("loading_state")
				.textContent = " - loading - ";
	var files = evt.target.files; // FileList object
	reader.onload = function(e) { 
		CurrentData = formatData(reader.result);
		//CurrentData.headers.shift();
		document.getElementById("loading_state")
				.textContent = " - data is ready - ";
		HandleData();
	}
	reader.readAsText(evt.target.files[0]);
}

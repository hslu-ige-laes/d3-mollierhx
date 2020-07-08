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

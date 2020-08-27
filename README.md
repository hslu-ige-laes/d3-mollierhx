# d3-mollierhx
> Mollier hx diagram built on d3.js


## Overview
The Mollier h,x-diagram was proposed by Richard Mollier in 1923 and allows to describe changes of state of humid air. In the present case it is used to show comfort states regarding temperature and humidity.

<img alt="mollier hx diagram" src="img/mollierhx.gif" width="100%">

- It is valid for a certain air pressure. The quantities temperature, humidity (absolute and relative), enthalpy and density can be read off directly.
- The basic scale for the h,x-diagram is a temperature scale, which is applied vertically as y-axis.
- The auxiliary lines drawn horizontally from left to right are the "isotherms", i.e. lines with constant air temperature. While the isotherm at 0 °C runs parallel to the horizontal axis, the isotherms at higher temperatures will increasingly rise to the right, due to the heat content of the increasing water content.
- The x-axis represents the water content x resp. the absolute humidity of the air.
- The comfort zone helps to indicate whether measured temperature/humidity values are within a comfortable range or not.
- Measured values get integrated as scatter plot and are coloured according to the season (winter, spring, summer, fall).

## Details
The D3 functions are structured in a way that the diagram can easily get integrated in own applications. Therefore csv file upload, comfort zone and data plotter are separated.

### /example/mollierhx.js & demo.html
Exemplary straight forward implementation with a manual csv file uploader and a simple html-file.
> Note that the data plotter is integrated in mollierhx.js because it is use case dependant what should get displayed.

### /src/mollierFunctions.js
Functions for the coordinate-transformations in the Mollier hx-diagram.
In order to understand the equations in the source refer to chapter 2.1 and 2.2 of <a href="http://berndglueck.de/dl/?dl=Stoffwerte+Stoffwerte.pdf" target="_blank">"Glück: Zustands- und Stoffwerte"</a>.

### /src/coordinateGenerator.js
The function "drawHXCoordinates()" draws the coordinate-lines of temperature,
density, enthalpy and relative humidity into an SVG-element.

### /src/drawComfort.js
drawComfort() creates the comfort-zone polygon.

### /src/csvReader.js
The example contains a csv file upload, but the data can get passed directly from e.g. a database.

The csv file should begin with a date/time column in the format of the
ISO 8601 norm (%Y-%m-%dT%H:%M:%S.%LZ, for example "2020-31-03T22:00:00.000Z"). The following columns shall only contain numerical values. The first line of the file is reserved for the headers (read as strings). 

```csv
timestamp,humidity,temperature
2020-31-03T22:00:00.000Z,49,22.8
2020-31-03T23:00:00.000Z,53,23.5
```





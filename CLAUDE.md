# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repository.

## What this project is

d3-mollierhx draws the Mollier h,x diagram (and, transposed, the ASHRAE psychrometric chart) in
the browser with D3.js v7: iso-lines, comfort zone, warning bands, measurements, outside air and
ventilation line, frequency lines. Live demo on GitHub Pages (`index.html`, `example/`).

## Rules

- `src/*.js` are **plain browser scripts with globals**: no imports/exports, no build step, no
  dependency besides D3 v7, and they must run in strict mode (declare every variable). Keep them
  self-contained.
- They are copied **verbatim** into pyedautils (`pyedautils/data/d3_mollierhx`) and vendored by
  the Home Assistant card mollier-hx-card (which adds ES exports per file). A new file or a new
  public name must be copied there too: mention it in `CHANGELOG.md`.
- Load order: `mollierFunctions.js`, `hxUnits.js`, `coordinateGenerator.js`, `drawComfort.js`,
  `mollierChart.js` (`csvReader.js`, `rangeSlider.js` are demo helpers).
- Data stay SI everywhere (x in kg/kg, diagram-y in °C, h in kJ/kg, p in Pa). Orientation
  (`mollier` / `psychrometric`) and units (`si` / `ip`) only change the projection
  (`hxProjection`) and the labels.
- The default output (`mollier` + `si`) must stay pixel-identical across changes unless a change
  of it is intended: render `example/chart-test.html` and `example/demo.html` (with a seeded
  `Math.random`) before and after, and compare.
- Every user-visible text is an option with English defaults (captions, texts); placeholders keep
  their units in every mode.

## Pitfalls

- Units at the API: `setData()` records carry `rh` in **percent**; everything passed to
  `createComfort`, `setComfort`, `setBands`, `setDomain` is already kg/kg and a fraction
  (`{t:[20,26], phi:[0.3,0.65], x:[0,0.0115]}`, see `example/chart-test.html`). A null
  timestamp in `setData` means "no date" (season index 0), not epoch 1970.
- Frequency contours and mean-value curves exist twice: in `MollierChart` and in the demo
  `example/mollierhx.js` (same `FREQ_*` constants, not shared). A fix in one usually has to be
  mirrored in the other.
- Grid-affecting setters (`setDomain`, `setCoordinateLines`, `setPressure`, `setConvention`,
  `setOrientation`, `setUnits`, `setHeight`, `resize`) redraw the grid; all other setters must
  stay cheap and never touch it.

## Demo input formats (`src/csvReader.js`)

- CSV with header: column 0 an ISO-8601 timestamp (`d3.isoParse`), then `humidity` [%],
  `temperature` [°C] in this order (`example/data.csv`).
- Meteonorm hourly `.dat` (`example/Zuerich_Kloten-hour.dat`): no header,
  `year, month, day, hour, temperature, rel. humidity`; detected by a numeric first field > 1800.
  Hours 1..24 map to 00:00..23:00 UTC.

## Commands

- `node test/check.js`: dependency-free checks; evaluates the src files in ONE strict-mode vm
  scope with a minimal d3 stub. Add new public names to its `exportsList`.
- No package.json, no linter. Serve the repo with any static server to open the examples.

## Files

- `src/mollierFunctions.js`: thermodynamics, `createMollier(convention)` (`classical` / `glueck`).
- `src/hxUnits.js`: `HX_UNITS` (SI ↔ IP), `hxProjection`, `hxNiceTicks`.
- `src/coordinateGenerator.js`: `drawHXCoordinates` (grid, axes, captions) and caption helpers.
- `src/drawComfort.js`: comfort polygon, overlay helpers (state points, edge arrows, outside air,
  ventilation line, contour labels).
- `src/mollierChart.js`: `MollierChart`, the stateful chart with incremental updates.
- `example/demo.html` + `example/mollierhx.js`: interactive demo; `example/chart-test.html`:
  MollierChart test page (query parameters `h`, `out`, `lang`, `orientation`, `units`).
- `scripts/`: logo, banner and social-preview rendering (see README "Repository images").

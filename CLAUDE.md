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

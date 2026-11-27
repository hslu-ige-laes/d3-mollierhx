# Changelog

All notable changes to d3-mollierhx. Versions follow [SemVer](https://semver.org/); earlier
versions are listed on the [releases page](https://github.com/hslu-ige-laes/d3-mollierhx/releases).

## 0.3.0 (unreleased)

### Added

- **Psychrometric chart (ASHRAE) and IP units.** `drawHXCoordinates` options `orientation`
  (`"mollier"` default, `"psychrometric"`: dry-bulb temperature horizontal, humidity ratio
  vertical with its scale on the right, saturation curve top left, enthalpy labels on the diagonal
  beyond it) and `units` (`"si"` default, `"ip"`: °F, gr/lb, Btu/lb, lb/ft³). Both are independent;
  the domains and all data stay SI.
- New file `src/hxUnits.js` (load it after `mollierFunctions.js`): `HX_UNITS` (SI ↔ IP
  conversions; IP enthalpy with the ASHRAE reference, h_IP = h_SI / 2.326 + 7.686),
  `hxProjection(width, height, domainX, domainY, orientation)`, `hxNiceTicks(lo, hi, opts)`,
  `hxIsIP`, `hxOrientation`.
- Captions: `HX_DEFAULT_CAPTIONS_IP` and `hxDefaultCaptions(units, orientation)`;
  `hxResolveCaptions(opts)` picks the defaults from `opts.units` / `opts.orientation`.
- `drawComfort.js`: the overlay helpers take an optional `ctx.project` (from `hxProjection`) and
  `ctx.units`; `hxStateLabel(state, texts, units)`, `hxTexts(texts, units)`,
  `HX_DEFAULT_TEXTS_IP`, new placeholders `{t_f}` (°F) and `{x_gr}` (gr/lb); `drawComfort(...,
  opts)` with `opts.orientation`.
- `MollierChart`: options `orientation` and `units`, methods `setOrientation()` and `setUnits()`,
  `chart.project(x, y)` / `chart.proj`; scatter, mean lines, process chain, frequency lines and
  their saturation clip, click position and tooltips go through the projection; IP tooltips and
  `MOLLIER_CHART_DEFAULT_TEXTS_IP` (`{alt_ft} ft`, `{inhg} inHg`; new placeholders `{alt_ft}`,
  `{inhg}`, `{pa}`).
- Demo and MollierChart test page: selectors for layout and units. In the demo all inputs follow
  the units (temperatures, differences, humidity ratio, altitude, pressure, range sliders, legend);
  the state stays SI, so switching back and forth does not change the chart.
- `CLAUDE.md` for contributors using Claude Code.

### Changed

- `coordinateGenerator.js`, `drawComfort.js` and `mollierChart.js` need `hxUnits.js`: consumers
  that copy the sources (pyedautils `data/d3_mollierhx`, mollier-hx-card) have to copy it too.
- Edge-arrow labels stay inside the axes at the bottom edge as well.

The default output (`"mollier"`, `"si"`) is unchanged, pixel for pixel.

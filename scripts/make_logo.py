"""Generate docs/logo.svg from real psychrometric curves.

Same math as src/mollierFunctions.js (classical convention, p = 101325 Pa):
relative-humidity curves, a few isotherms and a cloud of season-coloured
room-climate points, in the visual style of the sister projects
(retomarek/mollier-hx-card, retomarek/comfort-compass-card).

    python scripts/make_logo.py

Standard library only. Re-run scripts/render_branding.py afterwards.
"""

import math
import random
from pathlib import Path

C_PL, C_PW, K, P = 1.01, 1.86, 0.6222, 101325.0
C = [-4.909965e-4, 8.183197e-2, -5.552967e-4, -2.228376e-5, -6.211808e-7,
     -1.91275e-4, 7.258e-2, -2.939e-4, 9.841e-7, -1.92e-9]


def p_sat(t):
    c = C[:5] if t < 0.01 else C[5:]
    return 611 * math.exp(sum(ci * t ** i for i, ci in enumerate(c)))


def x_of(t, phi):
    return phi * K / (P / p_sat(t) - phi)


def y_of(t, x):
    return t * (C_PL + x * C_PW) / C_PL


# plot area in the 512 x 512 icon
L, T, W, H = 84, 76, 352, 360
X_MAX, Y_MIN, Y_MAX = 0.0155, 9.0, 33.0


def sx(x):
    return L + x / X_MAX * W


def sy(y):
    return T + H - (y - Y_MIN) / (Y_MAX - Y_MIN) * H


def path(points):
    return "M" + " L".join(f"{sx(x):.1f},{sy(y):.1f}" for x, y in points)


def rh_curve(phi):
    pts, t = [], Y_MIN - 2
    while t < 60:
        x = x_of(t, phi)
        pts.append((x, y_of(t, x)))
        if x > X_MAX * 1.05 or y_of(t, x) > Y_MAX + 5:
            break
        t += 0.25
    return pts


parts = []
for t in (12, 20, 28):
    parts.append(f'<path d="{path([(0, y_of(t, 0)), (X_MAX, y_of(t, X_MAX))])}" '
                 'stroke="#63c1ff" stroke-opacity="0.45" stroke-width="3"/>')
for phi, op in ((0.2, 0.3), (0.4, 0.38), (0.6, 0.46), (0.8, 0.55)):
    parts.append(f'<path d="{path(rh_curve(phi))}" fill="none" stroke="#ffffff" '
                 f'stroke-opacity="{op}" stroke-width="3" stroke-linecap="round"/>')
parts.append(f'<path d="{path(rh_curve(1.0))}" fill="none" stroke="#ffffff" '
             'stroke-opacity="0.95" stroke-width="8" stroke-linecap="round"/>')

# season-coloured measurement points (winter, spring, summer, fall), as in example/mollierhx.js
rnd = random.Random(7)
seasons = [  # colour, mean temperature, mean rel. humidity
    ("#a9dcff", 19.5, 0.30),
    ("#8fe08a", 21.0, 0.42),
    ("#ffab40", 24.5, 0.56),
    ("#e0704f", 21.5, 0.52),
]
dots = []
for colour, tm, phim in seasons:
    for _ in range(5):
        t = tm + rnd.uniform(-2.2, 2.2)
        phi = phim + rnd.uniform(-0.09, 0.09)
        x = x_of(t, phi)
        dots.append((sx(x), sy(y_of(t, x)), colour))
rnd.shuffle(dots)
dot_svg = "".join(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="16" fill="{c}" fill-opacity="0.92" '
                  'stroke="#0c1520" stroke-width="4"/>' for cx, cy, c in dots)

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <title>d3-mollierhx</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1d3350"/>
      <stop offset="1" stop-color="#0c1520"/>
    </linearGradient>
    <clipPath id="plot"><rect x="{L}" y="{T}" width="{W}" height="{H}"/></clipPath>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <g clip-path="url(#plot)">
    {"".join(parts)}
    {dot_svg}
  </g>
  <path d="M{L},{T} V{T + H} H{L + W}" fill="none" stroke="#ffffff" stroke-opacity="0.9" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
'''

out = Path(__file__).resolve().parent.parent / "docs" / "logo.svg"
out.write_text(svg, encoding="utf-8")
print(out)

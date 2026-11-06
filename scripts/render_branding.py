"""Render the repository's brand images with headless Chromium (Playwright).

- docs/screenshot.png: the diagram of example/demo.html with example/data.csv
  loaded (used by the social preview).
- docs/social-preview.png (1280x640) from scripts/social-preview.html. Upload it
  manually under the repository's Settings -> General -> Social preview (there is
  no API for it).
- docs/banner.png (1280x320) from scripts/banner.html, the README header.

docs/logo.svg is generated separately by scripts/make_logo.py.

Needs network access (D3 v5 and the Manrope font come from CDNs). Run with uv,
no Node or local install needed:

    uv run --with playwright python -m playwright install chromium   # once
    uv run --with playwright python scripts/render_branding.py
"""

from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"


def render_diagram(browser):
    page = browser.new_page(viewport={"width": 1180, "height": 1000}, device_scale_factor=2)
    page.goto((ROOT / "example" / "demo.html").as_uri(), wait_until="networkidle")
    page.fill("#height_input", "640")
    page.evaluate("handle_height()")
    page.set_input_files("#files", str(ROOT / "example" / "data.csv"))
    page.wait_for_function("document.querySelectorAll('#test circle').length > 100")
    # zoom to the indoor-climate range, as a brush selection would
    page.evaluate("""() => {
        domainX = [0, 0.016]; domainY = [8, 36];
        refreshAxis(domainX, domainY);
        sliderX.move([0, 16], true); sliderY.move(domainY, true);
        draw_background();
    }""")
    page.wait_for_timeout(500)
    page.locator(".diagram-card").screenshot(path=str(DOCS / "screenshot.png"))
    print("docs/screenshot.png")
    page.close()


def render_template(browser, template, out, height):
    page = browser.new_page(viewport={"width": 1280, "height": height}, device_scale_factor=1)
    page.goto((ROOT / "scripts" / template).as_uri(), wait_until="networkidle")
    page.evaluate("document.fonts.ready")
    page.screenshot(path=str(DOCS / out))
    print(f"docs/{out}")
    page.close()


with sync_playwright() as p:
    browser = p.chromium.launch(args=["--hide-scrollbars"])
    try:
        render_diagram(browser)
        render_template(browser, "social-preview.html", "social-preview.png", 640)
        render_template(browser, "banner.html", "banner.png", 320)
    finally:
        browser.close()

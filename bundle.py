# -*- coding: utf-8 -*-
"""bundle.py

Utility script to bundle the separated CSS and JS files back into a single
`index.html` file for deployment (e.g., GitHub Pages). The script creates a
`dist/` directory and writes `dist/index.html` where the external references are
replaced with inlined `<style>` and `<script>` tags.

Usage:
    python3 bundle.py
"""

import os
from pathlib import Path

# Paths (project root is the current working directory when the script runs)
ROOT = Path(__file__).parent
HTML_PATH = ROOT / "index.html"
CSS_PATH = ROOT / "style.css"
JS_PATH = ROOT / "app.js"
DIST_DIR = ROOT / "dist"
DIST_HTML = DIST_DIR / "index.html"

def read_file(p: Path) -> str:
    return p.read_text(encoding="utf-8")

def main() -> None:
    # Ensure dist directory exists
    DIST_DIR.mkdir(exist_ok=True)

    html = read_file(HTML_PATH)
    css = read_file(CSS_PATH)
    js = read_file(JS_PATH)

    # Replace the external stylesheet link with inlined CSS
    html = html.replace(
        '<link rel="stylesheet" href="style.css">',
        f'<style>\n{css}\n</style>'
    )

    # Replace the external script tag with inlined JS
    html = html.replace(
        '<script src="app.js" defer></script>',
        f'<script>\n{js}\n</script>'
    )

    # Write the bundled file
    DIST_HTML.write_text(html, encoding="utf-8")
    print(f"Bundled file written to {DIST_HTML}")

if __name__ == "__main__":
    main()

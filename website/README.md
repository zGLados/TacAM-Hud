# Website (hud.tac.am)

Static project page, no build step and no external requests (fonts and images are local). Upload the **contents** of this folder to the web root of `hud.tac.am`; `README.md` does not need to go online.

- `index.html`, `style.css` – the page
- `images/` – copies of screenshots from `docs/images` (update them together when the README screenshots change), `og-image.jpg` (link preview, 1200×630), favicons
- `fonts/` – Montserrat as WOFF2 subsets (SIL OFL 1.1, see `fonts/OFL.txt`)

Preview locally: `python3 -m http.server -d website 8080` → http://localhost:8080 (opening the file directly works too, only the font preload is blocked by the browser for `file://`).

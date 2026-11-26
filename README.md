# Interactive Vector Exterior Elevations

A 100% pure-vector architectural exterior elevations viewer (North, East, South, and West facades) with a 4-side presentation board, calibrated height & area measurement tools, interactive level datum guides, exterior finish specifications, and a searchable glazing schedule.

**Live site (GitHub Pages):** https://mikegofficial.github.io/house-exterior/

## Included Vector Elevations (`1/4" = 1'-0"`)

All 4 facades are native SVG vector drawings normalized to a shared vertical datum (`y = 0` = First Floor `0'-0"`, `18.0 SVG units = 1 foot`):

- **North Elevation** (`layers/north.svg` — Sheet A3.0-1): Front entry facade, curved brick return, glass block strips, shed roof (`4:12`), `26'-10⅝"` code building height from AAE `98.85'` (high eave ≈ `29'-7½"` above 1st Fl.)
- **East Elevation** (`layers/east.svg` — Sheet A3.0-2): Courtyard facade spanning the ADU, 2-car garage, screened patio, arched `12'×10'` courtyard doors, and second-story board & batten band
- **South Elevation** (`layers/south.svg` — Sheet A3.1-3): ADU-end facade with the primary bedroom above, featuring the `9'×6'` 3-panel slider (`N`) and full-height fixed glazing (`B`)
- **West Elevation** (`layers/west.svg` — Sheet A3.1-4): Rear facade with the 4:12 roof plane ("ROOF AS SPEC'D"), flat skylight (`T`), carport, and ADU casements

## Running Locally

Zero build step or external CDN dependencies — open `index.html` directly or serve with any static HTTP server:

```bash
python3 -m http.server 8000
```

## Keyboard Shortcuts

| Action | Shortcut |
| --- | --- |
| Switch views (`All 4`, `North`, `East`, `South`, `West`) | `1` – `5` |
| Zoom In / Out / Fit to Screen | `+` / `-` / `0` |
| Measure Height / Width (`ft'-in"`) or Wall Area (`SF`) | `M` |
| 90° Ortho Snap while measuring | Hold `Shift` |
| Toggle Level Datum Guides | `L` |
| Toggle Fine Material Hatching (light-gray PDF hatch lines, not sun shadows) | `H` |
| Toggle Inspector Sidebar | `B` |

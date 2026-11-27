#!/usr/bin/env python3
"""
Extract and optimize pure-vector exterior elevation SVGs (North, East, South, West)
from Sheets A3.0 & A3.1 of the Revit architectural PDF.

Normalizes every elevation to a shared vertical datum:
  y = 0 -> First Floor 0'-0" (1/4" = 1'-0" -> 18.0 SVG units = 1 foot)
and strips title blocks, viewport labels, raster stamps, and CAD car-block watermarks.

Usage:
    python3 scripts/extract_exterior.py --pdf /tmp/revised_plans.pdf --out layers
"""
import argparse
import json
import os
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET

NS_SVG = "{http://www.w3.org/2000/svg}"
NS_XLINK = "{http://www.w3.org/1999/xlink}"
TOKEN_RE = re.compile(r"[A-Za-z]|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?")

DEFAULT_ELEVATIONS = {
    "north": {
        "page": 7, "prefix": "en", "title": "North Elevation (A3.0-1)",
        "tx": -1307.73, "ty": -667.50,
        "crop": (600, 100, 2000, 725),
        "exclude_boxes": [],
        "text_scrub": [],
    },
    "east": {
        "page": 7, "prefix": "ee", "title": "East Elevation (A3.0-2)",
        "tx": -1241.52, "ty": -1419.00,
        "crop": (95, 860, 2380, 1488),
        "exclude_boxes": [],
        "text_scrub": [],
    },
    "south": {
        "page": 8, "prefix": "es", "title": "South Elevation (A3.1-3)",
        "tx": -1273.38, "ty": -666.66,
        "crop": (600, 100, 2000, 745),
        "exclude_boxes": [],
        "text_scrub": [],
    },
    "west": {
        "page": 8, "prefix": "ew", "title": "West Elevation (A3.1-4)",
        "tx": -1234.84, "ty": -1493.82,
        "crop": (95, 920, 2380, 1575),
        "exclude_boxes": [],
        "text_scrub": [(1795, 1490, 1820, 1505)],  # Car CAD-block URL watermark
    },
}


def fmt_num(v, prec=1):
    r = round(v, prec)
    return "0" if r == 0 else f"{r:.{prec}f}".rstrip("0").rstrip(".")


def transform_path_d(d, scale_factor, prec=1):
    tokens = TOKEN_RE.findall(d)
    out, xs, ys = [], [], []
    cmd, idx, n = None, 0, len(tokens)
    while idx < n:
        tok = tokens[idx]
        if tok.isalpha():
            cmd = tok
            out.append(cmd)
            idx += 1
            if cmd in ("Z", "z"):
                continue
        else:
            if cmd in ("M", "L", "T"):
                x, y = float(tokens[idx]) * scale_factor, float(tokens[idx + 1]) * scale_factor
                xs.append(x); ys.append(y)
                out.extend([fmt_num(x, prec), fmt_num(y, prec)])
                idx += 2
            elif cmd == "C":
                for _ in range(3):
                    x, y = float(tokens[idx]) * scale_factor, float(tokens[idx + 1]) * scale_factor
                    xs.append(x); ys.append(y)
                    out.extend([fmt_num(x, prec), fmt_num(y, prec)])
                    idx += 2
            elif cmd in ("S", "Q"):
                for _ in range(2):
                    x, y = float(tokens[idx]) * scale_factor, float(tokens[idx + 1]) * scale_factor
                    xs.append(x); ys.append(y)
                    out.extend([fmt_num(x, prec), fmt_num(y, prec)])
                    idx += 2
            elif cmd == "H":
                x = float(tokens[idx]) * scale_factor
                xs.append(x); out.append(fmt_num(x, prec)); idx += 1
            elif cmd == "V":
                y = float(tokens[idx]) * scale_factor
                ys.append(y); out.append(fmt_num(y, prec)); idx += 1
            else:
                out.append(fmt_num(float(tokens[idx]) * scale_factor, prec))
                idx += 1
    if not xs or not ys:
        return None, None
    s = re.sub(r"([A-Za-z])\s+", r"\1", re.sub(r"\s+([A-Za-z])", r"\1", " ".join(out))).replace(" -", "-")
    return s, (min(xs), min(ys), max(xs), max(ys))


def in_boxes(x, y, boxes):
    return any(x1 <= x <= x2 and y1 <= y <= y2 for x1, y1, x2, y2 in boxes)


def bbox_in_crop(bb, crop, exclude_boxes):
    if bb is None:
        return False
    x1, y1, x2, y2 = bb
    cx1, cy1, cx2, cy2 = crop
    if (x2 - x1) > 2350 or (y2 - y1) > 800:
        return False
    mx, my = (x1 + x2) * 0.5, (y1 + y2) * 0.5
    if not (cx1 <= mx <= cx2 and cy1 <= my <= cy2):
        return False
    return not in_boxes(mx, my, exclude_boxes)


def classify_color(val, is_stroke=True):
    if not val or val == "none":
        return None
    v = val.replace(" ", "")
    if "0%,0%,49.8" in v:
        return "s-accent" if is_stroke else "f-accent"
    if "0%,0%,0%)" in v:
        return "s-ink" if is_stroke else "f-ink"
    if "100%,100%,100%)" in v:
        return "s-paper" if is_stroke else "f-paper"
    if "66.66" in v or "75.29" in v:
        return "s-dim" if is_stroke else "f-wall"
    if "50.19" in v or "54.90" in v or "39.21" in v:
        return "s-mid" if is_stroke else "f-wall"
    if any(p in v for p in ("78.43", "83.13", "89.80", "91.76", "93.33", "95.68")):
        return "s-shadow" if is_stroke else "f-shade"
    return "s-ink" if is_stroke else "f-ink"


def process_elevation(pdf_path, raw_dir, out_dir, key, cfg):
    page, prefix = cfg["page"], cfg["prefix"]
    raw_svg = os.path.join(raw_dir, f"page_{page}.svg")
    if not os.path.exists(raw_svg):
        subprocess.check_call(["pdftocairo", "-svg", "-f", str(page), "-l", str(page), pdf_path, raw_svg])

    tree = ET.parse(raw_svg)
    root = tree.getroot()
    defs = root.find(NS_SVG + "defs")

    glyph_map, clip_map = {}, {}
    if defs is not None:
        for el in defs.iter(NS_SVG + "g"):
            gid = el.attrib.get("id", "")
            if gid.startswith("glyph-"):
                p = el.find(NS_SVG + "path")
                if p is not None and p.attrib.get("d"):
                    dc, _ = transform_path_d(p.attrib["d"], 1.0, prec=2)
                    if dc:
                        glyph_map[gid] = dc
        for cp in defs.findall(NS_SVG + "clipPath"):
            cid = cp.attrib.get("id", "")
            p = cp.find(NS_SVG + "path")
            if cid and p is not None and p.attrib.get("d"):
                dc, bb = transform_path_d(p.attrib["d"], 1.0, prec=1)
                if dc:
                    clip_map[cid] = (dc, p.attrib.get("clip-rule"), bb)

    crop, excl, tscrub = cfg["crop"], cfg["exclude_boxes"], cfg["text_scrub"]
    used_glyphs, used_clips, items = set(), set(), []
    all_xs, all_ys = [], []

    def parse_path_el(el):
        d = el.attrib.get("d", "")
        if not d:
            return None
        scale = 0.06 if "0.06" in el.attrib.get("transform", "") else 1.0
        dc, bb = transform_path_d(d, scale, prec=1)
        if not bbox_in_crop(bb, crop, excl):
            return None
        fc = classify_color(el.attrib.get("fill", "none"), False)
        sc = classify_color(el.attrib.get("stroke", "none"), True)
        if not fc and not sc:
            return None
        all_xs.extend([bb[0], bb[2]])
        all_ys.extend([bb[1], bb[3]])
        sw = fmt_num(float(el.attrib.get("stroke-width", "1")) * scale, 2) if sc else None
        fr = "evenodd" if el.attrib.get("fill-rule") == "evenodd" else None
        return ((fc, sc, sw, fr), dc)

    for child in root:
        tag = child.tag.replace(NS_SVG, "")
        if tag in ("defs", "use"):
            continue
        elif tag == "path":
            res = parse_path_el(child)
            if res:
                items.append(("path", res[0], res[1]))
        elif tag == "g":
            cp_attr = child.attrib.get("clip-path", "")
            if cp_attr:
                m = re.search(r"#(clip-\d+)", cp_attr)
                if not m or m.group(1) not in clip_map:
                    continue
                cid = m.group(1)
                if any("source-" in u.attrib.get(NS_XLINK + "href", "") for u in child.iter(NS_SVG + "use")):
                    continue
                inner = []
                for sub in child:
                    stag = sub.tag.replace(NS_SVG, "")
                    if stag == "path":
                        res = parse_path_el(sub)
                        if res:
                            inner.append(res)
                    elif stag == "g":
                        fcls = classify_color(sub.attrib.get("fill", "rgb(0%,0%,0%)"), False) or "f-ink"
                        for u in sub.findall(NS_SVG + "use"):
                            href = u.attrib.get(NS_XLINK + "href", "")
                            if href.startswith("#glyph-"):
                                gid = href[1:]
                                ux, uy = float(u.attrib.get("x", "0")), float(u.attrib.get("y", "0"))
                                if in_boxes(ux, uy, tscrub):
                                    continue
                                if bbox_in_crop((ux, uy, ux, uy), crop, excl) and gid in glyph_map:
                                    used_glyphs.add(gid)
                                    all_xs.extend([ux, ux + 8]); all_ys.append(uy)
                                    inner.append(("use", fcls, gid, fmt_num(ux, 1), fmt_num(uy, 1)))
                if inner:
                    used_clips.add(cid)
                    items.append(("clip_g", cid, inner))
            else:
                fcls = classify_color(child.attrib.get("fill", "rgb(0%,0%,0%)"), False) or "f-ink"
                for u in child.findall(NS_SVG + "use"):
                    href = u.attrib.get(NS_XLINK + "href", "")
                    if href.startswith("#glyph-"):
                        gid = href[1:]
                        ux, uy = float(u.attrib.get("x", "0")), float(u.attrib.get("y", "0"))
                        if in_boxes(ux, uy, tscrub):
                            continue
                        if bbox_in_crop((ux, uy, ux, uy), crop, excl) and gid in glyph_map:
                            used_glyphs.add(gid)
                            all_xs.extend([ux, ux + 8]); all_ys.append(uy)
                            items.append(("use", fcls, gid, fmt_num(ux, 1), fmt_num(uy, 1)))
                for p in child.findall(NS_SVG + "path"):
                    res = parse_path_el(p)
                    if res:
                        items.append(("path", res[0], res[1]))

    def style_attrs(skey):
        fc, sc, sw, fr = skey
        cls = [c for c in (fc, sc) if c]
        parts = []
        if cls:
            parts.append(f'class="{" ".join(cls)}"')
        if sw:
            parts.append(f'stroke-width="{sw}"')
        if fr:
            parts.append('fill-rule="evenodd"')
        return " ".join(parts)

    defs_out = [f'<path id="{prefix}-{gid}" d="{glyph_map[gid]}"/>' for gid in sorted(used_glyphs)]
    for cid in sorted(used_clips):
        cd, crule, _ = clip_map[cid]
        cr = f' clip-rule="{crule}"' if crule and crule != "nonzero" else ""
        defs_out.append(f'<clipPath id="{prefix}-{cid}"><path{cr} d="{cd}"/></clipPath>')

    body_out, i, n = [], 0, len(items)
    while i < n:
        kind = items[i][0]
        if kind == "path":
            skey, ds, j = items[i][1], [items[i][2]], i + 1
            while j < n and items[j][0] == "path" and items[j][1] == skey:
                ds.append(items[j][2]); j += 1
            body_out.append(f'<path {style_attrs(skey)} d="{"".join(ds)}"/>')
            i = j
        elif kind == "use":
            fcls, uses, j = items[i][1], [], i
            while j < n and items[j][0] == "use" and items[j][1] == fcls:
                _, _, gid, ux, uy = items[j]
                uses.append(f'<use href="#{prefix}-{gid}" x="{ux}" y="{uy}"/>')
                j += 1
            body_out.append(f'<g class="{fcls}">{"".join(uses)}</g>')
            i = j
        elif kind == "clip_g":
            _, cid, inner = items[i]
            ih = []
            for sub in inner:
                if sub[0] == "use":
                    _, fcls, gid, ux, uy = sub
                    ih.append(f'<use class="{fcls}" href="#{prefix}-{gid}" x="{ux}" y="{uy}"/>')
                else:
                    ih.append(f'<path {style_attrs(sub[0])} d="{sub[1]}"/>')
            body_out.append(f'<g clip-path="url(#{prefix}-{cid})">{"".join(ih)}</g>')
            i += 1

    tx, ty = cfg["tx"], cfg["ty"]
    tf = f' transform="translate({fmt_num(tx, 2)},{fmt_num(ty, 2)})"'

    bx = round(min(all_xs) + tx, 1)
    by = round(min(all_ys) + ty, 1)
    bw = round(max(all_xs) - min(all_xs), 1)
    bh = round(max(all_ys) - min(all_ys), 1)
    box = {"x": bx, "y": by, "w": bw, "h": bh}

    vb = f"{bx - 40:.1f} {by - 40:.1f} {bw + 80:.1f} {bh + 80:.1f}"
    layer_defs = "".join(defs_out)
    layer_body = f'<g id="elev-{key}" fill="none"{tf}>{"".join(body_out)}</g>'

    svg_str = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">'
        "<style>svg{background:#faf8f4;stroke-linecap:round;stroke-linejoin:round}"
        ".s-ink{stroke:#1a1c1e}.s-mid{stroke:#555c65}.s-dim{stroke:#8b9096}.s-shadow{stroke:#c6cbd1}.s-accent{stroke:#1d4e89}"
        ".f-ink{fill:#1a1c1e}.f-paper{fill:#faf8f4}.f-wall{fill:#7a8088}</style>"
        f"<defs>{layer_defs}</defs>{layer_body}</svg>"
    )
    with open(os.path.join(out_dir, f"{key}.svg"), "w") as f:
        f.write(svg_str)
    print(f"{key:6s} (p.{page:2d}): {len(svg_str)/1024:6.1f} KB | box={box}")
    return {"defs": layer_defs, "body": layer_body, "title": cfg["title"], "box": box}


def main():
    parser = argparse.ArgumentParser(description="Extract pure-vector exterior elevation SVGs from architectural PDF.")
    parser.add_argument("--pdf", required=True, help="Path to architectural Revit PDF file")
    parser.add_argument("--out", default="layers", help="Output layers directory (default: layers)")
    parser.add_argument("--raw-dir", default=None, help="Optional cached raw SVG directory")
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)
    raw_dir = args.raw_dir or tempfile.mkdtemp(prefix="exterior_raw_")
    os.makedirs(raw_dir, exist_ok=True)

    bundle = {}
    for key, cfg in DEFAULT_ELEVATIONS.items():
        bundle[key] = process_elevation(args.pdf, raw_dir, args.out, key, cfg)

    out_js = os.path.join(args.out, "exterior-data.js")
    with open(out_js, "w") as f:
        f.write("window.EXTERIOR_LAYERS = ")
        json.dump(bundle, f, separators=(",", ":"))
        f.write(";\n")
    print(f"Wrote {out_js} ({os.path.getsize(out_js)/1024:.1f} KB)")


if __name__ == "__main__":
    main()

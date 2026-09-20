#!/usr/bin/env python3
"""Optimisation des images fournisseur pour Dar Nūr (appelé par import-supplier.mjs).

Lit sur stdin un JSON : {"jobs": [{"src": "...", "dst": "...", "max_side": 1200, "quality": 82}, ...],
                         "sheet": {"files": ["..."], "labels": ["..."], "dst": "..."}}   (planche-contact, optionnel)
Écrit sur stdout un JSON : {"results": [{"src", "dst", "ok", "width", "height", "bytes_in", "bytes_out", "error"}], "sheet": "..."}

Règles :
- redimensionnement homothétique, côté le plus long <= max_side (jamais d'agrandissement) ;
- sortie WebP, métadonnées EXIF retirées, fond blanc si l'original a de la
  transparence (PNG « Photoroom ») — les cartes du site sont sur fond clair ;
- l'original n'est jamais modifié.

Dépendance : Pillow (présent sur la machine de travail ; aucune dépendance
npm n'est introduite dans le dépôt).
"""
import json
import os
import sys

try:
    from PIL import Image, ImageOps
except ImportError:  # pragma: no cover
    print(json.dumps({"error": "Pillow manquant : pip install pillow"}))
    sys.exit(2)


def optimize(job):
    src, dst = job["src"], job["dst"]
    max_side = int(job.get("max_side", 1200))
    quality = int(job.get("quality", 82))
    result = {"src": src, "dst": dst, "ok": False}
    try:
        result["bytes_in"] = os.path.getsize(src)
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)
            result["orig_width"], result["orig_height"] = im.size
            if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
                rgba = im.convert("RGBA")
                bg = Image.new("RGB", rgba.size, (255, 255, 255))
                bg.paste(rgba, mask=rgba.split()[-1])
                im = bg
            else:
                im = im.convert("RGB")
            w, h = im.size
            scale = min(1.0, max_side / float(max(w, h)))
            if scale < 1.0:
                im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            im.save(dst, "WEBP", quality=quality, method=6)
            result["width"], result["height"] = im.size
        result["bytes_out"] = os.path.getsize(dst)
        result["ok"] = True
    except Exception as exc:  # noqa: BLE001
        result["error"] = str(exc)
    return result


def contact_sheet(spec):
    """Planche-contact des images retenues, pour le contrôle visuel avant application."""
    from PIL import ImageDraw
    files, labels, dst = spec["files"], spec.get("labels") or [os.path.basename(f) for f in spec["files"]], spec["dst"]
    if not files:
        return None
    cols, size, band = 6, 300, 18
    rows = (len(files) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * size, rows * (size + band)), "white")
    draw = ImageDraw.Draw(sheet)
    for i, (f, label) in enumerate(zip(files, labels)):
        with Image.open(f) as im:
            im = im.convert("RGB")
            im.thumbnail((size, size))
            x, y = (i % cols) * size, (i // cols) * (size + band)
            sheet.paste(im, (x, y))
        draw.text((x + 2, y + size + 2), label[:48], fill="black")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    sheet.save(dst, "JPEG", quality=80)
    return dst


def main():
    payload = json.load(sys.stdin)
    results = [optimize(j) for j in payload.get("jobs", [])]
    sheet = contact_sheet(payload["sheet"]) if payload.get("sheet") else None
    print(json.dumps({"results": results, "sheet": sheet}))


if __name__ == "__main__":
    main()

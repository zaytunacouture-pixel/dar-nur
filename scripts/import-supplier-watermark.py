#!/usr/bin/env python3
"""Détection du filigrane fournisseur sur les images (appelé par import-supplier.mjs).

Lit sur stdin : {"templates": ["<fichier .npz>", ...], "files": ["...", ...], "threshold": 0.55}
Écrit sur stdout : {"results": [{"file", "score", "scale", "x", "y", "watermarked"}]}

Méthode : corrélation croisée normalisée (NCC) entre les contours du gabarit
du filigrane et les contours de l'image, sur une échelle réduite (600 px) et
une dizaine de tailles de gabarit — le filigrane occupe 15 à 40 % de la
largeur selon les photos. Travailler sur les contours (et non les couleurs)
rend la détection indépendante du fond.

Gabarits : RIEN qui dérive du logo du fournisseur n'est conservé dans le dépôt
(public). Les gabarits sont des cartes de contours (.npz) rangées dans un
dossier local ignoré par Git et référencées par `supplier.config.local.json`
(clé `watermarkTemplates`) ; `--build-template <capture> <sortie.npz>` en
produit un depuis une capture locale du filigrane, jamais committée.

Ce détecteur est un premier filtre : le rapport de dry-run affiche le score de
chaque image et la planche-contact reste à contrôler visuellement avant
application. Dépendances : Pillow + numpy (présents sur la machine de travail).
"""
import json
import sys

import numpy as np
from PIL import Image, ImageFilter

WORK_SIDE = 600


def edges(img):
    g = img.convert("L").filter(ImageFilter.GaussianBlur(0.6))
    a = np.asarray(g, dtype=np.float32)
    gx = np.zeros_like(a)
    gy = np.zeros_like(a)
    gx[:, 1:-1] = a[:, 2:] - a[:, :-2]
    gy[1:-1, :] = a[2:, :] - a[:-2, :]
    return np.hypot(gx, gy)


def ncc(image, template):
    """Carte NCC (template zéro-moyenne) via FFT + sommes cumulées."""
    ih, iw = image.shape
    th, tw = template.shape
    if th > ih or tw > iw:
        return None
    t = template - template.mean()
    tnorm = np.sqrt((t * t).sum())
    if tnorm < 1e-6:
        return None
    fh, fw = ih + th - 1, iw + tw - 1
    corr = np.fft.irfft2(np.fft.rfft2(image, (fh, fw)) * np.fft.rfft2(t[::-1, ::-1], (fh, fw)), (fh, fw))
    corr = corr[th - 1:ih, tw - 1:iw]  # positions valides
    # somme et somme des carrés locales de l'image (fenêtre th×tw)
    pad = np.pad(image, ((1, 0), (1, 0)))
    s1 = pad.cumsum(0).cumsum(1)
    pad2 = np.pad(image * image, ((1, 0), (1, 0)))
    s2 = pad2.cumsum(0).cumsum(1)

    def box(s):
        return s[th:, tw:] - s[:-th, tw:] - s[th:, :-tw] + s[:-th, :-tw]

    n = th * tw
    lsum = box(s1)
    lsq = box(s2)
    lvar = lsq - lsum * lsum / n
    # Fenêtres quasi uniformes (fond blanc) : variance ~0 → score non défini,
    # on les neutralise plutôt que de laisser la division exploser.
    floor = 0.02 * n * float((image * image).mean() + 1e-6)
    lstd = np.sqrt(np.clip(lvar, floor, None))
    out = corr / (lstd * tnorm)
    out[lvar < floor] = 0.0
    return out


def detect(templates, path, threshold):
    im = Image.open(path)
    im = im.convert("RGB")
    scale0 = WORK_SIDE / float(max(im.size))
    if scale0 < 1.0:
        im = im.resize((max(1, round(im.size[0] * scale0)), max(1, round(im.size[1] * scale0))), Image.LANCZOS)
    img_e = edges(im)
    best = {"score": 0.0, "scale": None, "x": None, "y": None, "template": None}
    for ti, tpl_spec in enumerate(templates):
        template_edges, (tw0, th0) = tpl_spec["edges"], tpl_spec["size"]
        scan_min, scan_max, scan_step = tpl_spec["scan"]
        for target_w in range(scan_min, scan_max + 1, scan_step):
            s = target_w / float(tw0)
            tpl = Image.fromarray(np.clip(template_edges, 0, 255).astype(np.uint8)).resize(
                (max(8, round(tw0 * s)), max(8, round(th0 * s))), Image.LANCZOS)
            t = np.asarray(tpl, dtype=np.float32)
            m = ncc(img_e, t)
            if m is None:
                continue
            idx = int(np.argmax(m))
            y, x = divmod(idx, m.shape[1])
            score = float(m[y, x])
            if score > best["score"]:
                best = {"score": round(score, 3), "scale": round(s, 2), "template": ti,
                        "x": int(x / scale0 if scale0 < 1 else x), "y": int(y / scale0 if scale0 < 1 else y)}
    best["file"] = path
    best["watermarked"] = best["score"] >= threshold
    return best


def load_template(path):
    """Gabarit .npz → dict(edges, size d'origine, plage de largeurs à balayer)."""
    with np.load(path) as z:
        return {
            "edges": z["edges"].astype(np.float32),
            "size": (int(z["orig_width"]), int(z["orig_height"])),
            "scan": (int(z["scan_min"]), int(z["scan_max"]), int(z["scan_step"])),
        }


def build_template(image_path, out_path, width=0, scan_min=60, scan_max=260, scan_step=16):
    """Outil de maintenance (hors flux) : fabrique un gabarit .npz depuis une
    capture locale du filigrane (carte de contours, float16). `width` = 0 garde
    la résolution de la capture. scan_min/scan_max : largeurs (px, sur l'image
    de travail de 600 px) auxquelles chercher le filigrane. La capture ET le
    gabarit restent sur la machine de travail (dossier ignoré par Git)."""
    im = Image.open(image_path).convert("RGB")
    e = edges(im)
    if width and width < im.size[0]:
        s = width / float(im.size[0])
        e = np.asarray(Image.fromarray(np.clip(e, 0, 255).astype(np.uint8)).resize((width, max(8, round(im.size[1] * s))), Image.LANCZOS), dtype=np.float32)
    np.savez_compressed(out_path, edges=e.astype(np.float16),
                        orig_width=np.int32(im.size[0]), orig_height=np.int32(im.size[1]),
                        scan_min=np.int32(scan_min), scan_max=np.int32(scan_max), scan_step=np.int32(scan_step))


def main():
    if len(sys.argv) >= 4 and sys.argv[1] == "--build-template":
        # --build-template <capture.png> <sortie.npz> [largeur] [scan_min] [scan_max] [scan_step]
        extra = [int(x) for x in sys.argv[4:8]]
        build_template(sys.argv[2], sys.argv[3], *extra)
        return
    payload = json.load(sys.stdin)
    threshold = float(payload.get("threshold", 0.55))
    templates = [load_template(tp) for tp in payload["templates"]]
    results = []
    for f in payload.get("files", []):
        try:
            results.append(detect(templates, f, threshold))
        except Exception as exc:  # noqa: BLE001
            results.append({"file": f, "error": str(exc), "watermarked": None, "score": None})
    print(json.dumps({"results": results}))


if __name__ == "__main__":
    main()

"""Génère les deux polices du site (Cormorant Garamond + Jost), sous-ensemblées.

Pourquoi un sous-ensemble sur mesure : le « ū » de « Dar Nūr » (U+016B) n'est pas
dans le sous-ensemble `latin` de Google Fonts ; le navigateur téléchargerait un
second fichier `latin-ext` pour un seul caractère (constat de l'étape 4).

Reproductible : sources épinglées sur un commit de github.com/google/fonts.
Prérequis : `pip install fonttools brotli`. Usage : `python scripts/fonts/build-fonts.py`
(depuis `site/`). Les fichiers produits sont versionnés : ce script ne tourne pas au build.
"""

from __future__ import annotations

import io
import pathlib
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

COMMIT = "9710da1eacb3be272583c3224dcb70f9da6eadbb"
BASE = f"https://raw.githubusercontent.com/google/fonts/{COMMIT}/ofl"
OUT = pathlib.Path(__file__).resolve().parents[2] / "src" / "assets" / "fonts"

# Latin de base + Latin-1 + caractères typographiques français + Ū/ū.
UNICODES = (
    list(range(0x20, 0x7F))
    + list(range(0xA0, 0x100))
    + [0x152, 0x153, 0x16A, 0x16B, 0x178]
    + [0x2010, 0x2013, 0x2014, 0x2018, 0x2019, 0x201A, 0x201C, 0x201D, 0x201E]
    + [0x2026, 0x2039, 0x203A, 0x20AC, 0x2122, 0x2212]
)
# Tenu à jour avec `unicodeRange` dans astro.config.mjs.
UNICODE_RANGE = "U+0020-007E, U+00A0-00FF, U+0152-0153, U+016A-016B, U+0178, U+2010, U+2013-2014, U+2018-201A, U+201C-201E, U+2026, U+2039-203A, U+20AC, U+2122, U+2212"

FAMILIES = [
    # (dossier google/fonts, fichier variable, sortie, plage de graisses retenue)
    ("cormorantgaramond", "CormorantGaramond%5Bwght%5D.ttf", "cormorant-garamond-500-600.woff2", (500, 600)),
    ("jost", "Jost%5Bwght%5D.ttf", "jost-400-500.woff2", (400, 500)),
]

FEATURES = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk", "tnum", "lnum"]


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(url) as response:
        return response.read()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for folder, filename, output, (low, high) in FAMILIES:
        font = TTFont(io.BytesIO(fetch(f"{BASE}/{folder}/{filename}")), lazy=False)
        options = subset.Options()
        options.layout_features = FEATURES
        options.name_IDs = ["*"]
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=UNICODES)
        subsetter.subset(font)
        font = instancer.instantiateVariableFont(font, {"wght": (low, high)})
        missing = [hex(u) for u in (0x16A, 0x16B) if u not in font.getBestCmap()]
        if missing:
            raise SystemExit(f"{output}: glyphes manquants {missing}")
        font.flavor = "woff2"
        target = OUT / output
        font.save(target)
        (OUT / f"OFL-{folder}.txt").write_bytes(fetch(f"{BASE}/{folder}/OFL.txt"))
        print(f"{target.name}: {target.stat().st_size} octets, wght {low}–{high}")


if __name__ == "__main__":
    main()

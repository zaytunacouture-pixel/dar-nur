# -*- coding: utf-8 -*-
import os
from PIL import Image

SRC_DIR = r"D:\images\dar nur\ia generé\validé ia"
DEST_BASE = r"C:\Users\youcef\dar-nur\assets\produits-ia"

# Image for miel-gingembre-citron
SRC = "ChatGPT Image 10 juin 2026, 20_14_29.png"
PRODUCT_ID = "miel-gingembre-citron"
DEST_FILENAME = "miel-gingembre-citron-1.webp"

src_path = os.path.join(SRC_DIR, SRC)
dest_dir = os.path.join(DEST_BASE, PRODUCT_ID)
os.makedirs(dest_dir, exist_ok=True)
dest_path = os.path.join(dest_dir, DEST_FILENAME)

try:
    with Image.open(src_path) as im:
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA")
        else:
            im = im.convert("RGB")
        im.save(dest_path, "WEBP", quality=85, method=6)
    print(f"OK: {SRC} -> {dest_path}")
except Exception as e:
    print(f"FAIL: {SRC} -> {dest_path}: {e}")

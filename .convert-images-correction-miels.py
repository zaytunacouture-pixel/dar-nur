# -*- coding: utf-8 -*-
import os
from PIL import Image

SRC_DIR = r"D:\images\dar nur\ia generé\validé ia"
DEST_BASE = r"C:\Users\youcef\dar-nur\assets\produits-ia"

# (source filename, product_id, dest filename)
MAPPING = [
    ("ChatGPT Image 10 juin 2026, 20_54_46.png", "miel-nigelle", "miel-nigelle-1.webp"),
    ("5467d2f8-73da-4d0a-8c9c-cf53afa33056.png", "miel-nigelle", "miel-nigelle-2.webp"),
    ("ChatGPT Image 10 juin 2026, 19_46_22.png", "miel-aphrodisiaque", "miel-aphrodisiaque-1.webp"),
    ("ChatGPT Image 8 juin 2026, 22_48_36.png", "miel-aphrodisiaque", "miel-aphrodisiaque-2.webp"),
    ("9e76cd44-6f98-4b90-83fc-0536c6d847cf.png", "miel-gingembre-curcuma", "miel-gingembre-curcuma-2.webp"),
    ("ChatGPT Image 10 juin 2026, 20_52_04.png", "miel-hibiscus-zamzam", "miel-hibiscus-zamzam-1.webp"),
    ("ChatGPT Image 10 juin 2026, 19_50_13.png", "miel-aubepine", "miel-aubepine-1.webp"),
    ("ChatGPT Image 8 juin 2026, 23_14_22.png", "miel-aubepine", "miel-aubepine-2.webp"),
    ("fd8c0a57-1ab2-403c-a247-946bb80799d5.png", "miel-sidr-jujubier", "miel-sidr-jujubier-1.webp"),
    ("ChatGPT Image 10 juin 2026, 19_54_29.png", "miel-blanc-kirghizistan", "miel-blanc-kirghizistan-1.webp"),
    ("ChatGPT Image 9 juin 2026, 14_03_11.png", "miel-spiruline", "miel-spiruline-1.webp"),
]

ok, fail = 0, 0
for src_name, product_id, dest_name in MAPPING:
    src_path = os.path.join(SRC_DIR, src_name)
    dest_dir = os.path.join(DEST_BASE, product_id)
    os.makedirs(dest_dir, exist_ok=True)
    dest_path = os.path.join(dest_dir, dest_name)
    try:
        with Image.open(src_path) as im:
            if im.mode in ("RGBA", "LA", "P"):
                im = im.convert("RGBA")
            else:
                im = im.convert("RGB")
            im.save(dest_path, "WEBP", quality=85, method=6)
        ok += 1
        print(f"OK: {src_name} -> {dest_path}")
    except Exception as e:
        fail += 1
        print(f"FAIL: {src_name} -> {dest_path}: {e}")

print(f"Done. ok={ok} fail={fail} total={len(MAPPING)}")

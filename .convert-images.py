# -*- coding: utf-8 -*-
import os
from PIL import Image

SRC_DIR = r"D:\images\dar nur\ia generé\validé ia"
DEST_BASE = r"C:\Users\youcef\dar-nur\assets\produits-ia"

# (source filename, product_id, dest filename)
MAPPING = [
    # Miels
    ("ChatGPT Image 8 juin 2026, 23_46_05.png", "miel-gingembre-curcuma", "miel-gingembre-curcuma-1.webp"),
    ("cda53f65-2e51-41cc-b86f-fdcd0cf427db.png", "miel-shilajit", "miel-shilajit-1.webp"),
    ("ChatGPT Image 9 juin 2026, 10_47_46.png", "miel-cactus", "miel-cactus-1.webp"),
    ("ChatGPT Image 9 juin 2026, 11_39_11.png", "miel-fraise-russie", "miel-fraise-russie-2.webp"),
    ("ChatGPT Image 9 juin 2026, 11_07_49.png", "miel-blanc-kirghizistan", "miel-blanc-kirghizistan-2.webp"),
    ("ChatGPT Image 9 juin 2026, 11_36_54.png", "miel-costus-nigelle", "miel-costus-nigelle-2.webp"),
    ("ChatGPT Image 9 juin 2026, 11_26_30.png", "miel-moringa-nigelle", "miel-moringa-nigelle-2.webp"),
    ("ChatGPT Image 9 juin 2026, 11_41_07.png", "miel-gingembre-fenugrec", "miel-gingembre-fenugrec-2.webp"),
    ("ChatGPT Image 9 juin 2026, 11_44_05.png", "miel-rose-siberie", "miel-rose-siberie-2.webp"),
    ("ChatGPT Image 8 juin 2026, 23_27_36.png", "miel-sidr-jujubier", "miel-sidr-jujubier-2.webp"),
    ("ChatGPT Image 8 juin 2026, 23_42_17.png", "miel-hibiscus-zamzam", "miel-hibiscus-zamzam-2.webp"),
    # Huiles
    ("13a60d1a-2c72-4d89-aec4-1641119f56b8.png", "hl-menthe-pouliot", "hl-menthe-pouliot-1.webp"),
    ("1a23933d-73be-4b43-a53d-e9360dec06ce.png", "hl-clou-girofle", "hl-clou-girofle-1.webp"),
    ("78b5565f-1482-426f-9c7a-d0d1a68f47f3.png", "hl-arthrose", "hl-arthrose-1.webp"),
    ("c0f24207-b830-4b19-a52c-1a0a04d517c6.png", "hl-figue-barbarie", "hl-figue-barbarie-1.webp"),
    ("c120f6fd-fa48-4b68-9c9c-decbb339f103.png", "hl-fenugrec", "hl-fenugrec-1.webp"),
    ("d5fb4d72-e58e-408e-9c42-f6190efbaba7.png", "hl-fenugrec", "hl-fenugrec-2.webp"),
    ("3ae55499-8875-4d06-88f5-4e3a2e0b514f.png", "hl-citron", "hl-citron-1.webp"),
    ("3bd27b6e-0e2b-4d38-a0fe-7a786b93313c.png", "hl-oliban", "hl-oliban-1.webp"),
    ("41f30be6-e9d1-4cd1-aa60-b18b6daa3488.png", "hl-rose", "hl-rose-1.webp"),
    ("53553a44-7787-46ee-923a-5296707d1aac.png", "hl-lavande", "hl-lavande-1.webp"),
    ("efa33a37-7473-4637-90e2-ba42fc64bc07.png", "hl-lavande", "hl-lavande-2.webp"),
    ("f639f6da-29db-48bb-aac8-6edf91e70ad9.png", "hl-eucalyptus", "hl-eucalyptus-1.webp"),
    ("fe05fb80-f527-4820-abb7-a92ac1742987.png", "hl-pepins-raisin", "hl-pepins-raisin-1.webp"),
    ("d1301ca8-2bd7-4a60-b712-7bb5e99b0dfd.png", "hl-costus", "hl-costus-1.webp"),
    ("c22247be-d9d6-4559-b268-8b046be7d611.png", "hl-menthe-poivree", "hl-menthe-poivree-1.webp"),
    ("9c8ff16d-5430-4e0b-b7ae-9a1fd1fe2fd6.png", "hl-nigelle", "hl-nigelle-1.webp"),
    ("dbc75ab4-3588-4871-a04b-b3ba77f05ecf.png", "hl-rose-blanc", "hl-rose-blanc-1.webp"),
    ("e645c833-f95d-4b46-9d78-29e26c1f5633.png", "hl-gingembre", "hl-gingembre-1.webp"),
    # Poudres & graines
    ("192b52bd-9cd5-4d0e-84ee-31481912fdd1.png", "pdr-gingembre-curcuma", "pdr-gingembre-curcuma-1.webp"),
    ("23c6a4ca-960a-435c-bc2e-cd9136148bbc.png", "pdr-termis", "pdr-termis-1.webp"),
    ("34b0664f-ad8a-49db-9f77-21e1b72afaa8.png", "pdr-clou-girofle", "pdr-clou-girofle-1.webp"),
    ("457d28b2-c791-4a3f-81ae-a69345d210a0.png", "pdr-romarin", "pdr-romarin-1.webp"),
    ("82ccf3d7-c742-4e02-98d9-cc2177632075.png", "pdr-moringa", "pdr-moringa-1.webp"),
    ("b02e4ba5-e85b-48a2-9f73-c3dc62f35a11.png", "pdr-costus", "pdr-costus-1.webp"),
    ("65103fb5-9000-4a0f-bc4b-34221e96bf69.png", "pdr-psyllium", "pdr-psyllium-1.webp"),
    ("ChatGPT Image 10 juin 2026, 10_46_39.png", "pdr-nigelle", "pdr-nigelle-1.webp"),
    ("076d50d6-c6df-48f5-bcfc-35824d73e698.png", "grn-lavande", "grn-lavande-1.webp"),
    ("9bcd9579-5d89-4283-9035-152faa0d112c.png", "grn-chia", "grn-chia-1.webp"),
    ("c2ee3279-bc58-4f1b-8dec-e3774f75f21f.png", "grn-chia", "grn-chia-2.webp"),
    ("b826abb4-e920-4f5b-8b3f-b09bc0dec91a.png", "grn-kirikou", "grn-kirikou-1.webp"),
    ("cad9c41e-e25e-4c54-89f8-72cc0553054a.png", "grn-fenouil", "grn-fenouil-1.webp"),
    ("cd6bf190-c7d8-4cdc-b64f-8491c77c06d9.png", "grn-oliban", "grn-oliban-1.webp"),
    ("d3030c40-718f-438e-8823-b0081f6af079.png", "grn-chardon", "grn-chardon-1.webp"),
    ("46425039-a7de-4bd0-837a-973d60f52f89.png", "grn-gomme-arabique", "grn-gomme-arabique-1.webp"),
    ("WhatsApp Image 2026-06-08 at 20.20.12 (5).jpeg", "grn-baraka", "grn-baraka-2.webp"),
    # Brumes
    ("0fc623aa-5bcb-4823-8701-e46c100832d8.png", "br-sublimante", "br-sublimante-1.webp"),
    ("934dbc85-ee43-41d6-91ed-f109d12e5235.png", "br-sublimante", "br-sublimante-2.webp"),
    ("1dfa0e10-db1d-45aa-9d29-446d795c603d.png", "br-eau-rose", "br-eau-rose-1.webp"),
    ("8fb27467-9bd2-42f5-b159-65b1c8fe0964.png", "br-apaisante", "br-apaisante-2.webp"),
    # Gelules
    ("ChatGPT Image 9 juin 2026, 11_53_48.png", "gel-chardon", "gel-chardon-1.webp"),
    ("ChatGPT Image 9 juin 2026, 11_57_13.png", "gel-macca", "gel-macca-1.webp"),
    ("ChatGPT Image 9 juin 2026, 12_38_06.png", "gel-aphrodisiaque", "gel-aphrodisiaque-1.webp"),
    ("WhatsApp Image 2026-06-08 at 20.20.12 (3).jpeg", "gel-nigelle", "gel-nigelle-1.webp"),
    ("ChatGPT Image 9 juin 2026, 12_48_44.png", "gel-valeriane", "gel-valeriane-1.webp"),
    ("ChatGPT Image 9 juin 2026, 12_54_37.png", "gel-costus", "gel-costus-1.webp"),
    ("ChatGPT Image 9 juin 2026, 13_03_23.png", "gel-ashwaganda", "gel-ashwaganda-1.webp"),
    ("ChatGPT Image 9 juin 2026, 13_06_42.png", "gel-gingembre-curcuma", "gel-gingembre-curcuma-1.webp"),
    ("ChatGPT Image 9 juin 2026, 13_08_54.png", "gel-fenugrec", "gel-fenugrec-1.webp"),
    ("ChatGPT Image 9 juin 2026, 13_11_07.png", "gel-spiruline", "gel-spiruline-1.webp"),
    ("ChatGPT Image 9 juin 2026, 13_13_11.png", "gel-termis", "gel-termis-1.webp"),
    ("ChatGPT Image 9 juin 2026, 13_14_55.png", "gel-moringa", "gel-moringa-1.webp"),
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
    except Exception as e:
        fail += 1
        print(f"FAIL: {src_name} -> {dest_path}: {e}")

print(f"Done. ok={ok} fail={fail} total={len(MAPPING)}")

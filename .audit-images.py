import re, json, os
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(ROOT, "index.html")

with open(HTML, "r", encoding="utf-8") as f:
    src = f.read()

# Extract PRODUCT_IMAGES block
m = re.search(r"const PRODUCT_IMAGES = \{(.*?)\n\};", src, re.S)
pi_block = m.group(1)
images = {}
for line in pi_block.splitlines():
    line = line.strip()
    if not line or line.startswith("//"):
        continue
    mm = re.match(r'"([^"]+)":\s*\[(.*)\]', line.rstrip(","))
    if not mm:
        continue
    pid = mm.group(1)
    paths = re.findall(r'"([^"]+)"', mm.group(2))
    images[pid] = paths

# Extract id -> cat, name from PRODUCTS
prod_meta = {}
for mm in re.finditer(r'\{id:"([^"]+)",cat:"([^"]+)",name:"([^"]+)"', src):
    prod_meta[mm.group(1)] = {"cat": mm.group(2), "name": mm.group(3)}

def dims(path):
    fp = os.path.join(ROOT, path)
    if not os.path.exists(fp):
        return None
    with Image.open(fp) as im:
        return im.size  # (w, h)

results = []
for pid, paths in images.items():
    cat = prod_meta.get(pid, {}).get("cat", "?")
    name = prod_meta.get(pid, {}).get("name", pid)
    card_path = paths[0]
    detail_path = paths[1] if len(paths) > 1 else paths[0]

    card_dims = dims(card_path)
    detail_dims = dims(detail_path)

    entry = {"id": pid, "cat": cat, "name": name, "n_images": len(paths)}

    if card_dims:
        w, h = card_dims
        ar = w / h
        entry["card_img"] = card_path
        entry["card_dims"] = f"{w}x{h}"
        entry["card_ar"] = round(ar, 3)
        # object-fit:cover in 1:1 square -> crop the longer axis
        if ar > 1:
            crop_pct = round((1 - 1/ar) * 100, 1)
            entry["card_cover_crop"] = f"{crop_pct}% recadre horizontalement (gauche/droite)"
        elif ar < 1:
            crop_pct = round((1 - ar) * 100, 1)
            entry["card_cover_crop"] = f"{crop_pct}% recadre verticalement (haut/bas)"
        else:
            entry["card_cover_crop"] = "0% (carre parfait)"
    else:
        entry["card_img"] = card_path
        entry["card_dims"] = "FICHIER INTROUVABLE"

    if detail_dims:
        w, h = detail_dims
        ar = w / h
        entry["detail_img"] = detail_path
        entry["detail_dims"] = f"{w}x{h}"
        entry["detail_ar"] = round(ar, 3)
        # object-fit:contain in 1:1 square -> empty space on shorter axis
        if ar > 1:
            empty_pct = round((1 - 1/ar) * 100, 1)
            entry["detail_contain_empty"] = f"{empty_pct}% vide en haut/bas"
        elif ar < 1:
            empty_pct = round((1 - ar) * 100, 1)
            entry["detail_contain_empty"] = f"{empty_pct}% vide a gauche/droite"
        else:
            entry["detail_contain_empty"] = "0% (carre parfait)"
    else:
        entry["detail_img"] = detail_path
        entry["detail_dims"] = "FICHIER INTROUVABLE"

    results.append(entry)

# Sort by worst crop/empty
def severity(e):
    vals = []
    if "card_ar" in e:
        vals.append(abs(1 - e["card_ar"]))
    if "detail_ar" in e:
        vals.append(abs(1 - e["detail_ar"]))
    return max(vals) if vals else 0

results.sort(key=severity, reverse=True)

print(f"TOTAL PRODUITS AVEC IMAGES: {len(results)}")
print(f"PRODUITS DANS PRODUCTS SANS ENTREE IMAGE: {len(prod_meta) - len(images)}")
missing = set(prod_meta.keys()) - set(images.keys())
if missing:
    print("IDs sans entree PRODUCT_IMAGES:", sorted(missing))
print()

# Group by category, classify card AR
from collections import defaultdict
by_cat = defaultdict(list)
for e in results:
    by_cat[e["cat"]].append(e)

print("=== REPARTITION PAR CATEGORIE (ratio image carte / aspect ratio) ===")
for cat, items in by_cat.items():
    ars = [e.get("card_ar") for e in items if "card_ar" in e]
    ok = [e for e in items if e.get("card_ar") and abs(e["card_ar"]-1) <= 0.05]
    bad = [e for e in items if e.get("card_ar") and abs(e["card_ar"]-1) > 0.05]
    print(f"\n--- {cat} ({len(items)} produits) ---")
    print(f"  AR carte ~1:1 (carre, pas de recadrage notable): {len(ok)}/{len(items)}")
    if bad:
        # group by exact ar value
        ar_groups = defaultdict(list)
        for e in bad:
            ar_groups[(e["card_dims"], e["card_ar"])].append(e["id"])
        for (dims_, ar), ids in ar_groups.items():
            crop = bad[0]["card_cover_crop"] if False else None
            sample = next(e for e in bad if e["card_dims"]==dims_ and e["card_ar"]==ar)
            print(f"  AR={ar} ({dims_}) -> {sample['card_cover_crop']} | {len(ids)} produits: {ids[:6]}{'...' if len(ids)>6 else ''}")

print()
print("=== DETAIL: PRODUITS NON-MODE AVEC ECART D'ASPECT RATIO (carte) > 5% ===")
for e in results:
    if e["cat"] in ("qamis","vetements"):
        continue
    if "card_ar" in e and abs(e["card_ar"]-1) > 0.05:
        print(json.dumps(e, ensure_ascii=False))

print()
print("=== PRODUITS AVEC 1 SEULE IMAGE (pas de galerie possible) ===")
single = [e["id"] for e in results if e["n_images"]==1]
print(f"{len(single)}/{len(results)}: {single}")

print()
print("=== FICHIERS INTROUVABLES ===")
notfound = [e for e in results if e.get("card_dims") == "FICHIER INTROUVABLE" or e.get("detail_dims") == "FICHIER INTROUVABLE"]
for e in notfound:
    print(json.dumps(e, ensure_ascii=False))
if not notfound:
    print("Aucun")

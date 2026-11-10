#!/usr/bin/env python3
"""
sync_jm.py - Plata Tech Solutions S.R.L.

Catalogo de seguridad desde la lista de JM Security System
(aniversario.jmsecuritysystem.com). Regenera:
  shop/assets/products-static.js   (productos, publico)
  shop/assets/costs-static.js      (costos, solo /admin)
  shop/assets/img/jm/              (fotos)

Entran las lineas de seguridad: CCTV, alarmas, control de acceso,
intercomunicadores, perimetral, incendio y hogar inteligente.

Costo = precio en RD$ de la pagina de JM. Margen: +25% si cuesta menos de
RD$10,000; +15% si cuesta mas.

Uso:
    python scripts/sync_jm.py
"""
import io
import json
import re
import shutil
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, str(Path(__file__).resolve().parent))
from sync_products import slugify, _save_resized, CATEGORY_GRADIENTS  # noqa: E402

BASE = "https://aniversario.jmsecuritysystem.com/"
ROOT = Path(__file__).resolve().parent.parent
OUT_PRODUCTS = ROOT / "shop" / "assets" / "products-static.js"
OUT_COSTS = ROOT / "shop" / "assets" / "costs-static.js"
IMG_DIR = ROOT / "shop" / "assets" / "img" / "jm"
ID_BASE = 70000  # id = 70000 + id del producto en jmsecuritysystem.com

LINEAS = {
    "CCTV y Videovigilancia",
    "Alarmas y Seguridad Perimetral",
    "Control de Acceso",
    "Intercomunicadores",
    "Seguridad Perimetral",
    "Detección contra Incendios",
    "Hogar inteligente",
}

# Subcategoria de JM -> categoria de la tienda (las demas quedan en 'seguridad')
SUBCAT = {
    "Cámaras IP": "camaras",
    "Cámaras Analógicas": "camaras",
    "Cámaras Wi-Fi": "camaras",
    "Cámaras deportivas y accesorios": "camaras",
    "Grabadores NVR": "grabadores",
    "Grabadores DVR": "grabadores",
}
LINEA_CAT = {"Alarmas y Seguridad Perimetral": "alarmas"}


def margin(cost: int) -> int:
    return int(round(cost * (1.25 if cost < 10000 else 1.15)))


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (PlataTech sync)'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def fetch_items() -> list:
    page = get(BASE).decode('utf-8')
    m = re.search(r'<script id="cfg" type="application/json">(.*?)</script>', page, re.S)
    if not m:
        raise RuntimeError("No encontre la configuracion de la pagina de JM")
    data_path = json.loads(m.group(1))["data"]
    print(f"[jm] Descargando {BASE}{data_path}")
    items = json.loads(get(BASE + data_path).decode('utf-8'))
    if not isinstance(items, list):
        raise RuntimeError("La lista de JM no tiene el formato esperado")
    return items


def jm_id(it: dict) -> int | None:
    for field in ("u", "i"):
        m = re.search(r'-(\d+)(?:\?|$)', it.get(field) or "") or re.search(r'/(\d+)\.[0-9a-f]+\.webp', it.get(field) or "")
        if m:
            return ID_BASE + int(m.group(1))
    return None


def specs(it: dict) -> list:
    parts = [p.strip() for p in (it.get("c") or "").split("/")]
    return [p for p in parts[1:] if p][:4]


def build(items: list) -> list:
    out, seen_ids, seen_slugs = [], set(), set()
    for it in items:
        if it.get("l") not in LINEAS or it.get("t") != "a":
            continue
        cost = int(it.get("rd") or 0)
        pid = jm_id(it)
        if cost <= 0 or not pid or pid in seen_ids:
            continue
        seen_ids.add(pid)
        brand = (it.get("m") or "Generic").strip()
        name = (it.get("n") or "").strip()
        base = slugify(f"{name} {it.get('r') or ''}") or f"jm-{pid}"
        slug, n = base, 2
        while slug in seen_slugs:
            slug, n = f"{base}-{n}", n + 1
        seen_slugs.add(slug)
        category = SUBCAT.get(it.get("s")) or LINEA_CAT.get(it.get("l")) or "seguridad"
        out.append({
            "id": pid,
            "slug": slug,
            "category": category,
            "brand": brand,
            "name": name,
            "variant": (it.get("r") or "").strip(),
            "price": margin(cost),
            "oldPrice": None,
            "cost": cost,
            "short": ((it.get("b") or "").strip() + " La instalamos y te damos soporte.").strip(),
            "specs": specs(it),
            "image": None,
            "foto": it.get("i"),
            "gradient": list(CATEGORY_GRADIENTS["seguridad"]),
            "stock": 5,
        })
    return out


def download_images(products: list):
    if IMG_DIR.exists():
        shutil.rmtree(IMG_DIR, ignore_errors=True)
    IMG_DIR.mkdir(parents=True, exist_ok=True)

    def one(p):
        if not p["foto"]:
            return
        dest = IMG_DIR / f"j{p['id'] - ID_BASE}.jpg"
        try:
            _save_resized(get(BASE + p["foto"]), dest)
            p["image"] = dest.relative_to(ROOT / "shop").as_posix()
        except Exception as e:
            print(f"[jm] sin foto para {p['id']} ({e})")

    with ThreadPoolExecutor(max_workers=8) as ex:
        list(ex.map(one, products))
    print(f"[jm] {sum(1 for p in products if p['image'])} fotos en {IMG_DIR}")


def write(products: list):
    public_keys = ["id", "slug", "category", "brand", "name", "variant", "price", "oldPrice",
                   "short", "specs", "image", "gradient", "stock"]
    rows = [json.dumps({k: p[k] for k in public_keys}, ensure_ascii=False) for p in products]
    OUT_PRODUCTS.write_text(
        "/* ════════════════════════════════════════════════════════\n"
        "   Plata Tech Solutions S.R.L. - Catalogo de seguridad (JM Security System)\n"
        "   AUTO-GENERADO. NO EDITAR A MANO. Regenerar: python scripts/sync_jm.py\n"
        "   ════════════════════════════════════════════════════════ */\n\n"
        "(function () {\n"
        "  if (!window.PRODUCTS) window.PRODUCTS = [];\n"
        "  var STATIC = [\n    " + ",\n    ".join(rows) + "\n  ];\n"
        "  Array.prototype.push.apply(window.PRODUCTS, STATIC);\n"
        "})();\n", encoding='utf-8')
    costs = ",\n".join(f"  {p['id']}: {p['cost']}" for p in products)
    OUT_COSTS.write_text(
        "/* Costos de suplidor (JM Security System). AUTO-GENERADO: python scripts/sync_jm.py\n"
        "   PRIVADO: solo lo carga /admin. NO referenciar en paginas publicas. */\n"
        "window.PRODUCT_COSTS = Object.assign(window.PRODUCT_COSTS || {}, {\n" + costs + "\n});\n",
        encoding='utf-8')


def main():
    products = build(fetch_items())
    if len(products) < 20:
        raise RuntimeError(f"Lista sospechosa: solo {len(products)} productos. No se toca nada")
    download_images(products)
    write(products)
    by = {}
    for p in products:
        by[p["category"]] = by.get(p["category"], 0) + 1
    print(f"[jm] {len(products)} productos: {by}")


if __name__ == "__main__":
    main()

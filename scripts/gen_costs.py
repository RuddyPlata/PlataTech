#!/usr/bin/env python3
"""
gen_costs.py - Plata Tech Solutions S.R.L.

Regenera SOLO los archivos de costos de suplidor (costs.js y costs-static.js)
a partir del cache local (.tmp/ydc.xlsx y .tmp/renzo.xlsx), SIN re-descargar,
SIN re-extraer imagenes y SIN tocar products.js / products-static.js.

Util para poblar los costos de inmediato sin correr el sync completo. Los syncs
diarios (sync_products.py / sync_renzo.py) ya regeneran estos archivos por su
cuenta, asi que este script es solo para una primera carga / re-generacion rapida.

Uso:
    python scripts/gen_costs.py
"""
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, str(Path(__file__).resolve().parent))

import sync_products as sp
import sync_renzo as sr

ASSETS = sp.ROOT / "shop" / "assets"


def gen_ydc():
    xlsx = sp.TMP_DIR / "ydc.xlsx"
    if not xlsx.exists():
        print(f"[gen_costs] FALTA cache YDC: {xlsx} (corre sync_products.py una vez)")
        return
    raw = sp.parse_workbook(xlsx)
    # row_to_image vacio: no afecta el filtrado ni el costo, solo el campo image.
    products = sp.build_products(raw, {})
    sp.write_costs_js(products, ASSETS / "costs.js")


def gen_renzo():
    xlsx = sr.XLSX_PATH
    if not xlsx.exists():
        print(f"[gen_costs] FALTA cache R.ENZO: {xlsx} (corre sync_renzo.py una vez)")
        return
    # Reconstruir row_to_image desde las imagenes ya extraidas (r<row>.jpg),
    # asi build_products no descarta los productos (requiere imagen) ni re-extrae.
    row_to_image = {}
    if sr.IMG_DIR.exists():
        for f in sr.IMG_DIR.glob("r*.jpg"):
            m = re.fullmatch(r"r(\d+)\.jpg", f.name)
            if m:
                row_to_image[int(m.group(1))] = f"assets/img/renzo/{f.name}"
    products = sr.build_products(xlsx, row_to_image)
    sr.write_costs_js(products, ASSETS / "costs-static.js")


if __name__ == "__main__":
    gen_ydc()
    gen_renzo()
    print("[gen_costs] Listo.")

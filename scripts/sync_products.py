#!/usr/bin/env python3
"""
sync_products.py - Plata Tech Solutions S.R.L.

Descarga el catalogo de Google Sheets (YDC), aplica el margen de Plata Tech,
y regenera shop/assets/products.js con productos REALES.

NOTA: products-static.js (catalogo manual R.ENZO TECH) es independiente y NO
se sobreescribe por este sync. Para regenerarlo: python scripts/static_catalog.py

Uso:
    python scripts/sync_products.py

Programacion (Windows Task Scheduler / cron):
    08:00 todos los dias.

Reglas de margen:
    - Productos < RD$2,500           -> +RD$1,000
    - Productos < RD$15,000          -> +RD$1,500
    - Productos < RD$33,334          -> +RD$2,000
    - Productos >= RD$33,334         -> +6%
    - Categoria 'seguridad'          -> +25% sobre costo

Reglas de filtro:
    - Excluye filas TRANSITO / TRANSITO (sin precio en VIP PLUS y REGULAR)
    - Excluye items mayoristas (MIN. X PCS donde X >= 10)
    - Excluye filas sin nombre de modelo o sin precio valido
"""
import io
import os
import re
import sys
import json
import shutil
import urllib.request
import zipfile
from pathlib import Path
from collections import defaultdict
import xml.etree.ElementTree as ET

# Force UTF-8 stdout for Windows
sys.stdout.reconfigure(encoding='utf-8')

# ── Configuracion ────────────────────────────────────────────
SHEET_ID_YDC = "1EtOwxNRGq0WFgGaRXtJgibUqzxIgcAUeRkJlr1wPsLc"
ROOT = Path(__file__).resolve().parent.parent
OUT_FILE = ROOT / "shop" / "assets" / "products.js"
IMG_DIR = ROOT / "shop" / "assets" / "img" / "ydc"
TMP_DIR = ROOT / ".tmp"
TMP_DIR.mkdir(exist_ok=True)

# Brand sections (header in col A) -> default category
SECTION_CATEGORY = {
    "LAPTOPS": "laptops",
    "TABLETS": "tablets",
    "ELECTRONICOS": "varios",
    "ELECTRÓNICOS": "varios",
    "CARGADORES / AUDIFONOS": "accesorios",
    "COVERS": "accesorios",
    "MODEMS WIFI / ANTENAS": "conectividad",
    "NOTAS": "skip",
    "MAQUITOS": "skip",  # mayorista MIN. 10 PCS
}

# Phone brand sections (all map to celulares by default)
PHONE_BRANDS = {
    "FOXXD", "VARIOS", "ORBIC", "DIALN", "VORTEX", "M-HORSE", "BLU",
    "COOLPAD", "ALCATEL", "TCL", "ZTE", "CUBOT", "OUKITEL", "ITEL",
    "TECNO", "INFINIX", "UMIDIGI", "MOTOROLA", "REALME", "XIAOMI",
    "HONOR", "ONEPLUS", "SAMSUNG", "APPLE",
}
for b in PHONE_BRANDS:
    SECTION_CATEGORY.setdefault(b, "celulares")

# Emoji -> category override
EMOJI_CATEGORY = {
    "💻": "laptops",
    "⌚": "smartwatch",
    "🔊": "audio",
    "🎧": "audio",
    "🎮": "gaming",
    "🔌": "accesorios",
    "📹": "seguridad",
}

# Brand keyword detection from product name (first matching wins)
BRAND_KEYWORDS = [
    ("APPLE", ["IPHONE ", "MACBOOK ", "APPLE ", "IPAD "]),
    ("SAMSUNG", ["SAMSUNG ", "GALAXY "]),
    ("XIAOMI", ["XIAOMI ", "REDMI ", "POCO "]),
    ("HUAWEI", ["HUAWEI "]),
    ("HONOR", ["HONOR "]),
    ("MOTOROLA", ["MOTO ", "MOTOROLA "]),
    ("LENOVO", ["LENOVO ", "IDEAPAD ", "THINKPAD "]),
    ("HP", ["HP "]),
    ("DELL", ["DELL ", "INSPIRON ", "XPS "]),
    ("ASUS", ["ASUS ", "VIVOBOOK "]),
    ("ACER", ["ACER ", "ASPIRE "]),
    ("AMAZON", ["AMAZON "]),
    ("BLINK", ["BLINK "]),
    ("HOCO", ["HOCO "]),
    ("JBL", ["JBL "]),
    ("NINTENDO", ["NINTENDO "]),
    ("XIAOMI", ["SMART CAMERA "]),
    ("STARLINK", ["ANTENA STARLINK", "STARLINK "]),
    ("ALCATEL", ["ALCATEL "]),
    ("SAMSUNG", ["SAMSUNG "]),
    ("MOXEE", ["MOXEE "]),
    ("KAJEET", ["KAJEET "]),
    ("VAST", ["VAST "]),
    ("TCL", ["TCL "]),
    ("INFINIX", ["INFINIX "]),
    ("HOTPEPPER", ["HOTPEPPER "]),
    ("ROVER", ["ROVER "]),
    ("NUU", ["NUU "]),
    ("QLINK", ["QLINK "]),
    ("SKY", ["SKY "]),
    ("XMOBILE", ["XMOBILE "]),
    ("BLU", ["BLU "]),
    ("MAXWEST", ["MAXWEST "]),
    ("WHOOP", ["WHOOP "]),
    ("MAZE", ["MAZE "]),
    ("DIALN", ["DIALN "]),
    ("VORTEX", ["VORTEX "]),
    ("FOXXD", ["FOXXD "]),
    ("EUDORA", ["EUDORA "]),
    ("NEWPAD", ["NEWPAD "]),
    ("MOOLAH", ["MOOLAH "]),
    ("OX", ["OX TAB"]),
    ("PROSPER", ["PROSPER "]),
    ("OUKITEL", ["OUKITEL "]),
    ("CUBOT", ["CUBOT "]),
    ("FREEYOND", ["FREEYOND "]),
    ("VIMOQ", ["VIMOQ "]),
    ("LOGIC", ["LOGIC "]),
    ("ANS", ["ANS "]),
    ("CLOUD", ["CLOUD "]),
    ("WIKO", ["WIKO "]),
    ("SUNELAN", ["SUNELAN "]),
    ("UMIDIGI", ["UMIDIGI "]),
    ("KIKX", ["KIKX "]),
    ("OTUX", ["OTUX "]),
    ("MIRANDA", ["MIRANDA "]),
    ("SPIGEN", ["SPIGEN "]),
    ("ANKER", ["ANKER "]),
    ("GENERIC", []),
]

# Category gradients (for SVG fallback when no image)
CATEGORY_GRADIENTS = {
    "celulares":    ("#2d2d35", "#0a0a0c"),
    "laptops":      ("#2a2d3a", "#0f1218"),
    "tablets":      ("#1f3a4a", "#0a1a25"),
    "audio":        ("#3a2540", "#1a0d20"),
    "smartwatch":   ("#1a3a3a", "#0a1a1a"),
    "accesorios":   ("#3a3a3a", "#1a1a1a"),
    "conectividad": ("#1f4a6b", "#0a2540"),
    "gaming":       ("#5a2440", "#2a0d20"),
    "seguridad":    ("#1a2f4a", "#0a1525"),
    "varios":       ("#2a2a2a", "#111"),
}

# ── Helpers ──────────────────────────────────────────────────
def slugify(text: str) -> str:
    """SEO-friendly slug: lowercase, hyphens, no accents."""
    import unicodedata
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('ascii')
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '-', text)
    text = text.strip('-')
    return text[:80]  # max 80 chars

def parse_price(val) -> int:
    """Parse '$1,234' / '*$1,234*' / 1234 / 'TRANSITO' -> int or None"""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return int(val) if val > 0 else None
    s = str(val).strip()
    if not s or 'TRANSITO' in s.upper() or 'TR\u00c1NSITO' in s.upper():
        return None
    # Remove $, comas, asteriscos, espacios
    s = re.sub(r'[*$,\s]', '', s)
    if not s:
        return None
    try:
        n = int(float(s))
        return n if n > 0 else None
    except ValueError:
        return None

def apply_margin(cost: int, category: str) -> int:
    """Reglas de margen Plata Tech.
    < RD$2,500          -> +RD$1,000
    < RD$15,000         -> +RD$1,500
    < RD$33,334         -> +RD$2,000
    >= RD$33,334        -> +6%  (punto donde 6% >= RD$2,000)
    Categoria seguridad -> +25%
    """
    if category == 'seguridad':
        rate = 1.25 if cost < 10000 else 1.15
        return int(round(cost * rate))
    if cost < 2500:
        return cost + 1000
    if cost < 15000:
        return cost + 1500
    if cost < 33334:
        return cost + 2000
    return int(round(cost * 1.06))

def detect_brand(name: str, section: str) -> str:
    name_u = name.upper()
    # 1. Try prefix match (most reliable)
    for brand, prefixes in BRAND_KEYWORDS:
        for p in prefixes:
            if p and name_u.startswith(p):
                return brand
    # 2. Try word-boundary match anywhere in name
    for brand, prefixes in BRAND_KEYWORDS:
        for p in prefixes:
            if p and re.search(r'\b' + re.escape(p.strip()) + r'\b', name_u):
                return brand
    # 3. Fallback to section if it looks like a brand
    if section in PHONE_BRANDS:
        return section
    if section and section not in {"ELECTRÓNICOS", "ELECTRONICOS", "VARIOS",
                                    "CARGADORES / AUDIFONOS", "COVERS",
                                    "MODEMS WIFI / ANTENAS", "TABLETS",
                                    "LAPTOPS", "MAQUITOS", "NOTAS"}:
        return section
    return "Generic"

def detect_category(emoji: str, section: str, name: str) -> str:
    """Decidir categoria con emoji > seccion > heuristica nombre."""
    if emoji and emoji in EMOJI_CATEGORY:
        return EMOJI_CATEGORY[emoji]
    sec_cat = SECTION_CATEGORY.get(section)
    if sec_cat and sec_cat != "skip":
        if sec_cat == "varios":
            # Heuristica para ELECTRONICOS
            n = name.upper()
            if "FIRE STICK" in n or "FIRESTICK" in n:
                return "conectividad"  # streaming -> conectividad
            if "BLINK" in n or "CAMARA" in n or "CAMERA" in n:
                return "seguridad"
            if "WATCH" in n or "RELOJ" in n:
                return "smartwatch"
            return "accesorios"
        return sec_cat
    return "celulares"  # default

def is_mayorista(name: str) -> bool:
    """Detecta items con MIN. X PCS (mayorista)."""
    m = re.search(r'MIN\.\s*(\d+)\s*PCS', name, re.IGNORECASE)
    if not m:
        return False
    qty = int(m.group(1))
    return qty >= 10  # MIN >= 10 = no es retail

def split_name_variant(model: str) -> tuple[str, str]:
    """Separa 'NAME (variant specs)' -> ('NAME', 'variant specs')."""
    model = model.strip()
    m = re.match(r'^(.+?)\s*\(([^()]+(?:\([^)]*\)[^()]*)*)\)\s*$', model)
    if m:
        return (m.group(1).strip(), m.group(2).strip())
    # No paren: try split by comma at end specs
    return (model, "")

def short_description(name: str, variant: str, category: str, brand: str) -> str:
    """Construir descripcion corta orientada a marca Plata Tech."""
    parts = []
    if variant:
        # Extract storage and screen
        storage = re.search(r'(\d+(?:GB|TB))', variant)
        screen = re.search(r'(\d+\.\d+")', variant)
        ram = re.search(r'(\d+GB)\s*RAM', variant)
        bits = []
        if storage: bits.append(storage.group(1))
        if ram: bits.append(f"{ram.group(1)} RAM")
        if screen: bits.append(f'{screen.group(1)}')
        if bits:
            parts.append(' / '.join(bits))
    descs = {
        "celulares":    "Celular nuevo, sellado y desbloqueado. Lo recibes listo para usar, con factura NCF y soporte real cuando lo necesites.",
        "laptops":      "Laptop nueva con garantia de fabrica. Configuracion inicial y entrega lista para trabajar desde el dia uno.",
        "tablets":      "Tablet nueva con garantia. Configurada y probada antes de salir de nuestras manos.",
        "audio":        "Audio original con garantia y respaldo Plata Tech. Si algo falla, respondemos.",
        "smartwatch":   "Smartwatch original con garantia. Lo configuramos y emparejamos contigo, no te lo dejamos en una caja.",
        "accesorios":   "Accesorio original con garantia contra defecto de fabrica. Lo que pides es lo que recibes.",
        "conectividad": "Equipo de red original con garantia. Orientacion y configuracion incluidas para que funcione bien desde el principio.",
        "gaming":       "Equipo gaming original con garantia de fabrica. Probado, configurado y respaldado por Plata Tech.",
        "seguridad":    "Equipo de seguridad original con instalacion profesional y soporte continuo. Sin trabajos a medias.",
        "varios":       "Producto original con factura NCF y respaldo Plata Tech Solutions S.R.L.",
    }
    base = descs.get(category, descs["varios"])
    if parts:
        return f"{parts[0]}. {base}"
    return base

def specs_from_variant(variant: str) -> list[str]:
    """Extraer especificaciones del variant (entre parentesis)."""
    if not variant:
        return []
    # Split by comma but respect inner parens
    parts = re.split(r',\s*(?![^()]*\))', variant)
    return [p.strip() for p in parts if p.strip()]

# ── Drive URL helpers ────────────────────────────────────────
def drive_to_direct(url: str) -> str | None:
    """Convertir https://drive.google.com/file/d/ID/view -> direct URL."""
    if not url:
        return None
    m = re.search(r'/file/d/([a-zA-Z0-9_-]+)', url)
    if m:
        return f"https://drive.google.com/thumbnail?id={m.group(1)}&sz=w800"
    m = re.search(r'[?&]id=([a-zA-Z0-9_-]+)', url)
    if m:
        return f"https://drive.google.com/thumbnail?id={m.group(1)}&sz=w800"
    return url  # fallback

# ── Embedded image extraction (cell-anchored) ────────────────
NS_XDR = "{http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing}"
NS_R   = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
NS_A   = "{http://schemas.openxmlformats.org/drawingml/2006/main}"

def _save_resized(src_bytes: bytes, dest_path: Path, max_dim: int = 800, jpeg_quality: int = 78):
    """Resize/recompress imagen a max_dim de lado mayor, output JPEG. Reduce drasticamente el peso."""
    from PIL import Image
    im = Image.open(io.BytesIO(src_bytes))
    if im.mode in ('RGBA', 'P', 'LA'):
        bg = Image.new('RGB', im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1] if im.mode in ('RGBA', 'LA') else None)
        im = bg
    elif im.mode != 'RGB':
        im = im.convert('RGB')
    w, h = im.size
    if max(w, h) > max_dim:
        scale = max_dim / max(w, h)
        im = im.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    im.save(dest_path, format='JPEG', quality=jpeg_quality, optimize=True, progressive=True)

def extract_images_by_row(xlsx_path: Path, out_dir: Path) -> dict:
    """Devuelve {row_1based: 'assets/img/.../file.jpg'} (path web relativo a shop/).
    Las imagenes se redimensionan a max 800px de lado mayor y se reencode JPEG q78."""
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    z = zipfile.ZipFile(xlsx_path)
    names = z.namelist()
    drawings = sorted(n for n in names if re.fullmatch(r'xl/drawings/drawing\d+\.xml', n))
    row_to_path = {}
    for drawing_name in drawings:
        base = drawing_name.split('/')[-1]
        rels_name = f"xl/drawings/_rels/{base}.rels"
        rels_map = {}
        if rels_name in names:
            rels_root = ET.fromstring(z.read(rels_name))
            for rel in rels_root.findall("{http://schemas.openxmlformats.org/package/2006/relationships}Relationship"):
                rid = rel.get("Id")
                target = rel.get("Target")
                rels_map[rid] = os.path.normpath(os.path.join("xl/drawings", target)).replace("\\", "/")
        root = ET.fromstring(z.read(drawing_name))
        for anchor in list(root):
            if anchor.tag not in (f"{NS_XDR}oneCellAnchor", f"{NS_XDR}twoCellAnchor"):
                continue
            from_el = anchor.find(f"{NS_XDR}from")
            if from_el is None:
                continue
            row_el = from_el.find(f"{NS_XDR}row")
            if row_el is None or row_el.text is None:
                continue
            row_1based = int(row_el.text) + 1
            blip = anchor.find(f".//{NS_A}blip")
            if blip is None:
                continue
            rid = blip.get(f"{NS_R}embed")
            if not rid or rid not in rels_map:
                continue
            media_path = rels_map[rid]
            if media_path not in names or row_1based in row_to_path:
                continue
            out_path = out_dir / f"r{row_1based}.jpg"
            try:
                _save_resized(z.read(media_path), out_path)
            except Exception as e:
                print(f"[sync] skip imagen r{row_1based} ({e})")
                continue
            rel = out_path.relative_to(ROOT / "shop").as_posix()
            row_to_path[row_1based] = rel
    print(f"[sync] {len(row_to_path)} imagenes embebidas extraidas a {out_dir}")
    return row_to_path

# ── Main flow ────────────────────────────────────────────────
def download_xlsx(sheet_id: str, dest: Path):
    """Descarga el Sheet como xlsx."""
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=xlsx"
    print(f"[sync] Descargando {url}")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(req, context=ctx) as r:
        data = r.read()
    dest.write_bytes(data)
    print(f"[sync] xlsx guardado en {dest} ({len(data)/1024/1024:.1f} MB)")

def parse_workbook(xlsx_path: Path):
    """Parse xlsx y devuelve lista de productos crudos con hyperlinks."""
    import openpyxl
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    ws = wb.active
    products = []
    section = ""
    skipped_hidden = 0
    for row_idx, row in enumerate(ws.iter_rows(min_row=1), start=1):
        if not row:
            continue
        # Respetar filas ocultas del sheet (YDC oculta items sin stock / descontinuados)
        rd = ws.row_dimensions.get(row_idx)
        if rd is not None and rd.hidden:
            skipped_hidden += 1
            continue
        col_a = row[0].value if len(row) > 0 else None
        col_c = row[2].value if len(row) > 2 else None
        col_d_val = row[3].value if len(row) > 3 else None
        col_e_val = row[4].value if len(row) > 4 else None

        # Section header: col A has text but col C is empty (and not emoji)
        a_str = str(col_a or "").strip()
        if a_str and not col_c and len(a_str) > 1 and not _is_emoji(a_str):
            # Section header
            if row_idx > 3:  # skip top headers
                section = a_str.upper()
            continue

        # Product row: col C has model name
        if not col_c:
            continue
        model = str(col_c).strip()
        if not model or model.upper() == "MODELO":
            continue

        emoji = a_str if _is_emoji(a_str) else ""
        vip_price = parse_price(col_d_val)
        reg_price = parse_price(col_e_val)
        # Hyperlink (image link) typically on col C
        hyperlink = row[2].hyperlink.target if row[2].hyperlink else None

        products.append({
            "row": row_idx,
            "section": section,
            "emoji": emoji,
            "name_raw": model,
            "vip_price": vip_price,
            "reg_price": reg_price,
            "hyperlink": hyperlink,
        })
    if skipped_hidden:
        print(f"[sync] {skipped_hidden} filas ocultas en el sheet (descartadas)")
    return products

def _is_emoji(s: str) -> bool:
    """Detecta si el primer char es emoji."""
    if not s:
        return False
    cp = ord(s[0])
    return (cp >= 0x1F000 or cp in (0x231A, 0x231B, 0x23F0))  # ⌚ etc

def build_products(raw_list, row_to_image: dict | None = None):
    """Aplica filtros, margen, categoria. Devuelve lista final."""
    row_to_image = row_to_image or {}
    products = []
    seen_slugs = set()
    badge_counter = 0
    for p in raw_list:
        # Skip mayorista
        if is_mayorista(p["name_raw"]):
            continue
        # Determine cost (prefer VIP PLUS, fallback REGULAR)
        cost = p["vip_price"] or p["reg_price"]
        if not cost:
            continue  # TRANSITO / no price

        section = p["section"]
        if SECTION_CATEGORY.get(section) == "skip":
            continue

        category = detect_category(p["emoji"], section, p["name_raw"])
        brand = detect_brand(p["name_raw"], section)
        name, variant = split_name_variant(p["name_raw"])

        price = apply_margin(cost, category)

        # Stable slug + unique disambiguation
        # Don't double the brand if name already starts with it
        slug_base_name = name if name.upper().startswith(brand.upper()) else f"{brand} {name}"
        base_slug = slugify(f"{slug_base_name} {variant[:30]}") or f"item-{p['row']}"
        slug = base_slug
        i = 2
        while slug in seen_slugs:
            slug = f"{base_slug}-{i}"
            i += 1
        seen_slugs.add(slug)

        # Prefer embedded image (extracted locally — siempre carga). Fallback a Drive thumbnail.
        image_url = row_to_image.get(p["row"])
        if not image_url and p["hyperlink"]:
            image_url = drive_to_direct(p["hyperlink"])

        gradient = list(CATEGORY_GRADIENTS.get(category, CATEGORY_GRADIENTS["varios"]))

        products.append({
            "id": p["row"],  # stable ID = sheet row
            "slug": slug,
            "category": category,
            "brand": brand,
            "name": name,
            "variant": variant,
            "price": price,
            "oldPrice": None,
            "cost": cost,
            "badge": None,
            "badgeText": None,
            "short": short_description(name, variant, category, brand),
            "specs": specs_from_variant(variant),
            "image": image_url,
            "gradient": gradient,
            "stock": 10,  # disponible (catalogo dinamico - sync diario refleja status real)
            "sourceRow": p["row"],
        })
    return products

# ── JS output ────────────────────────────────────────────────
def js_string(s):
    """Escape string para JS."""
    if s is None:
        return "null"
    return json.dumps(s, ensure_ascii=False)

def write_products_js(products: list, out: Path):
    """Genera shop/assets/products.js."""
    cats_used = sorted({p["category"] for p in products})
    cat_meta = {
        "celulares":    ("Celulares",    "phone"),
        "laptops":      ("Laptops",      "laptop"),
        "tablets":      ("Tablets",      "tablet"),
        "audio":        ("Audio",        "headphones"),
        "smartwatch":   ("Smartwatches", "watch"),
        "accesorios":   ("Accesorios",   "plug"),
        "conectividad": ("Conectividad", "wifi"),
        "gaming":       ("Gaming",       "gamepad"),
        "seguridad":    ("Seguridad",    "shield"),
        "varios":       ("Otros",        "grid"),
    }
    cats_js = [{"id": "todos", "name": "Todos", "icon": "grid"}]
    for c in cats_used:
        name, icon = cat_meta.get(c, (c.title(), "grid"))
        cats_js.append({"id": c, "name": name, "icon": icon})

    lines = []
    lines.append('/* ════════════════════════════════════════════════════════')
    lines.append('   Plata Tech Solutions S.R.L. - Product Database')
    lines.append('   AUTO-GENERADO. NO EDITAR A MANO.')
    lines.append('   Fuente: Google Sheets YDC (mayorista). Productos R.ENZO/seguridad estaticos en products-static.js.')
    lines.append('   Regenerar: python scripts/sync_products.py')
    lines.append('   ════════════════════════════════════════════════════════ */')
    lines.append('')
    lines.append(f'window.PRODUCTS_LAST_SYNC = {js_string(_now_iso())};')
    lines.append('')
    lines.append('window.PRODUCTS = [')
    for p in products:
        lines.append('  {')
        lines.append(f'    id: {p["id"]},')
        lines.append(f'    slug: {js_string(p["slug"])},')
        lines.append(f'    category: {js_string(p["category"])},')
        lines.append(f'    brand: {js_string(p["brand"])},')
        lines.append(f'    name: {js_string(p["name"])},')
        lines.append(f'    variant: {js_string(p["variant"])},')
        lines.append(f'    price: {p["price"]}, oldPrice: null,')
        lines.append(f'    short: {js_string(p["short"])},')
        if p["specs"]:
            specs_js = '[' + ', '.join(js_string(s) for s in p["specs"]) + ']'
            lines.append(f'    specs: {specs_js},')
        else:
            lines.append('    specs: [],')
        lines.append(f'    image: {js_string(p["image"])},')
        g = p["gradient"]
        lines.append(f'    gradient: [{js_string(g[0])}, {js_string(g[1])}],')
        lines.append(f'    stock: {p["stock"]}')
        lines.append('  },')
    lines.append('];')
    lines.append('')
    lines.append('window.CATEGORIES = ' + json.dumps(cats_js, ensure_ascii=False, indent=2) + ';')
    lines.append('')
    lines.append("""\
/* ── Helpers ──────────────────────────────────────────── */
window.getProductBySlug = function(slug) {
  return window.PRODUCTS.find(p => p.slug === slug) || null;
};
window.getProductById = function(id) {
  return window.PRODUCTS.find(p => p.id === id) || null;
};
window.formatPrice = function(n) {
  return 'RD$' + n.toLocaleString('en-US');
};

/* ── Mockup SVG (fallback cuando no hay imagen) ──────── */
window.renderProductMock = function(product, size) {
  size = size || 200;
  if (product.image) {
    return '<img src="' + product.image + '" alt="' + (product.name || '') +
           '" loading="lazy" style="max-width:100%;max-height:' + size +
           'px;object-fit:contain"/>';
  }
  var g = product.gradient || ['#2a2a2a', '#111'];
  var gid = 'g_' + (product.slug || 'x').replace(/[^a-z0-9]/g, '_');
  var brand = (product.brand || '').toString();
  var catLabel = ({
    celulares:'CELULAR', laptops:'LAPTOP', tablets:'TABLET', audio:'AUDIO',
    smartwatch:'SMARTWATCH', accesorios:'ACCESORIO', conectividad:'RED',
    gaming:'GAMING', seguridad:'SEGURIDAD'
  })[product.category] || '';
  var brandFs = Math.max(11, Math.min(20, brand.length > 10 ? 13 : 18));
  var brandY = catLabel ? 95 : 105;
  var catY = 125;
  var brandSvg = brand
    ? '<text x="100" y="' + brandY + '" text-anchor="middle" fill="#ffffff" ' +
      'font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-weight="700" ' +
      'font-size="' + brandFs + '" letter-spacing="1">' +
      brand.toUpperCase().replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</text>'
    : '';
  var catSvg = catLabel
    ? '<text x="100" y="' + catY + '" text-anchor="middle" fill="#ffffffaa" ' +
      'font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-weight="500" ' +
      'font-size="9" letter-spacing="3">' + catLabel + '</text>'
    : '';
  return '<svg viewBox="0 0 200 200" width="' + size + '" height="' + size +
         '" xmlns="http://www.w3.org/2000/svg">' +
         '<defs><radialGradient id="' + gid + '" cx="30%" cy="30%">' +
         '<stop offset="0" stop-color="' + g[0] + '"/>' +
         '<stop offset="1" stop-color="' + g[1] + '"/>' +
         '</radialGradient></defs>' +
         '<rect width="200" height="200" rx="24" fill="url(#' + gid + ')"/>' +
         brandSvg + catSvg +
         '</svg>';
};
""")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text('\n'.join(lines), encoding='utf-8')
    print(f"[sync] {len(products)} productos escritos a {out}")

def _now_iso():
    from datetime import datetime, timezone, timedelta
    # DR timezone UTC-4
    dr = timezone(timedelta(hours=-4))
    return datetime.now(dr).strftime('%Y-%m-%d %H:%M:%S %z')

# ── Main ─────────────────────────────────────────────────────
def main():
    xlsx_path = TMP_DIR / "ydc.xlsx"
    # Use cached xlsx if --no-download or if exists and < 12h old
    if "--no-download" in sys.argv and xlsx_path.exists():
        print(f"[sync] Usando cache: {xlsx_path}")
    else:
        try:
            download_xlsx(SHEET_ID_YDC, xlsx_path)
        except Exception as e:
            if xlsx_path.exists():
                print(f"[sync] Descarga fallo ({e}), usando cache.")
            else:
                raise

    raw = parse_workbook(xlsx_path)
    print(f"[sync] {len(raw)} filas de producto crudas leidas del sheet")

    row_to_image = extract_images_by_row(xlsx_path, IMG_DIR)
    products = build_products(raw, row_to_image)
    print(f"[sync] {len(products)} productos validos despues de filtros")

    by_cat = defaultdict(int)
    for p in products:
        by_cat[p["category"]] += 1
    print("[sync] Por categoria:")
    for cat, n in sorted(by_cat.items(), key=lambda x: -x[1]):
        print(f"   {cat:15s} {n:4d}")

    write_products_js(products, OUT_FILE)
    print("[sync] Listo.")

if __name__ == "__main__":
    main()

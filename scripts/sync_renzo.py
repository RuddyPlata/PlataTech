#!/usr/bin/env python3
"""
sync_renzo.py - Plata Tech Solutions S.R.L.

Sync dinamico del catalogo R.ENZO TECH desde Google Sheets.
Reemplaza al antiguo static_catalog.py (catalogo estatico hardcoded).

- Descarga el sheet como xlsx.
- Extrae imagenes embebidas (cell-anchored) por fila a shop/assets/img/renzo/.
- Aplica margen Plata Tech.
- Solo publica productos con DISPONIBILIDAD (precio valido) y FOTO (imagen embebida).
- Genera shop/assets/products-static.js (mismo nombre por compat con HTML).

Uso:
    python scripts/sync_renzo.py

Sheet:
    https://docs.google.com/spreadsheets/d/1WzF4oxuJpfl2e4X00Um0dIe8KFyls9384eWKi5lbpOo/
"""
import io
import os
import re
import sys
import json
import ssl
import shutil
import zipfile
import unicodedata
import urllib.request
from pathlib import Path
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')

SHEET_ID = "1WzF4oxuJpfl2e4X00Um0dIe8KFyls9384eWKi5lbpOo"
ROOT = Path(__file__).resolve().parent.parent
TMP_DIR = ROOT / ".tmp"
TMP_DIR.mkdir(exist_ok=True)
XLSX_PATH = TMP_DIR / "renzo.xlsx"
IMG_DIR = ROOT / "shop" / "assets" / "img" / "renzo"
OUT_FILE = ROOT / "shop" / "assets" / "products-static.js"
STATIC_ID_BASE = 50000

# Section header (col C, no col D price) -> default category
SECTION_CATEGORY = {
    "UNV ANALOGO":                 ("seguridad", "UNV"),
    "UNV IP":                      ("seguridad", "UNV"),
    "EPCOM ANALOGO":               ("seguridad", "EPCOM"),
    "IP EPCOM":                    ("seguridad", "EPCOM"),
    "HILOOK   HIKVISION":          ("seguridad", None),  # detect HILOOK vs HIKVISION
    "HILOOK HIKVISION":            ("seguridad", None),
    "EZVIZ":                       ("seguridad", "EZVIZ"),
    "CABLE UTP":                   ("conectividad", None),
    "DATA":                        ("conectividad", None),
    "CONTROL DE ACCESO Y MOTORES": ("seguridad", None),
    "FUENTE DE PODER":             ("seguridad", None),
    "MONITORES":                   ("accesorios", None),
    "DISCO DUROS":                 ("accesorios", None),
    "VARIADO":                     (None, None),  # heuristic per-product
    "ZONA DE OFERTAS":             ("skip", None),  # mayorista wholesale tier
}

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

# ── Download ──────────────────────────────────────────────────
def download_xlsx():
    url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx"
    print(f"[renzo] Descargando {url}")
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, context=ctx) as r:
        data = r.read()
    XLSX_PATH.write_bytes(data)
    print(f"[renzo] xlsx guardado ({len(data)/1024/1024:.1f} MB)")

# ── Image extraction (cell-anchored) ──────────────────────────
NS_XDR = "{http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing}"
NS_R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
NS_A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"

def _save_resized(src_bytes: bytes, dest_path: Path, max_dim: int = 800, jpeg_quality: int = 78):
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
    Las imagenes se redimensionan a max 800px y reencodean JPEG q78."""
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    z = zipfile.ZipFile(xlsx_path)
    names = z.namelist()
    drawings = sorted(n for n in names if re.fullmatch(r'xl/drawings/drawing\d+\.xml', n))
    if not drawings:
        print("[renzo] sin xl/drawings/")
        return {}

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
            if anchor.tag not in (f"{NS_XDR}oneCellAnchor", f"{NS_XDR}twoCellAnchor", f"{NS_XDR}absoluteAnchor"):
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
                print(f"[renzo] skip imagen r{row_1based} ({e})")
                continue
            rel = out_path.relative_to(ROOT / "shop").as_posix()
            row_to_path[row_1based] = rel

    print(f"[renzo] {len(row_to_path)} imagenes extraidas a {out_dir}")
    return row_to_path

# ── Parsing ───────────────────────────────────────────────────
def parse_price(val) -> int | None:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return int(val) if val > 0 else None
    s = str(val).strip()
    if not s or 'TRANSITO' in s.upper() or 'TR\u00c1NSITO' in s.upper():
        return None
    # Drop RD$, $, comas, asteriscos, espacios
    s = re.sub(r'(?i)RD', '', s)
    s = re.sub(r'[*$,\s]', '', s)
    s = s.replace('.', '')  # Some prices use 2.350 as thousand separator
    if not s:
        return None
    try:
        n = int(s)
        return n if n > 0 else None
    except ValueError:
        return None

def apply_margin(cost: int, category: str) -> int:
    if category == 'seguridad':
        return int(round(cost * 1.25))
    if cost < 1000:
        return cost + 1000
    if cost < 15000:
        return cost + 1500
    if cost < 40000:
        return cost + 2000
    return cost + 3000

def slugify(text: str) -> str:
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('ascii')
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '-', text).strip('-')
    return text[:80]

def detect_brand_from_name(name: str, default: str | None) -> str:
    n = name.upper()
    BRANDS = [
        ("HIKVISION", ["HIKVISION", "AX-PRO", "AX PRO", "AX-HOME", "AX HOME"]),
        ("HILOOK", ["HILOOK"]),
        ("EPCOM", ["EPCOM"]),
        ("UNV", ["UNV"]),
        ("EZVIZ", ["EZVIZ"]),
        ("DMTECH", ["DMTECH"]),
        ("LINKED PRO", ["LINKED PRO"]),
        ("ESEENET", ["ESEENET"]),
        ("FAST CABLE", ["FAST CABLE"]),
        ("MERCUSYS", ["MERCUSYS"]),
        ("BAOFENG", ["BAOFENG"]),
        ("ZKTECO", ["ZKTECO"]),
        ("BESTQUALITY", ["BESTQUALITY"]),
        ("2CONNECT", ["2CONNET", "2CONNECT"]),
        ("AGILER", ["AGILER"]),
        ("EPSON", ["EPSON"]),
        ("CANON", ["CANON"]),
        ("KSTAR", ["KSTAR"]),
        ("XTECH", ["XTECH"]),
        ("ELO", ["ELO TOUCH"]),
        ("AMAZON", ["AMAZON", "FIRE STICK"]),
        ("UHU", ["UHU"]),
        ("MUKINTA", ["MUKINTA"]),
        ("INFINIX", ["INFINIX"]),
        ("XIAOMI", ["XIAOMI", "REDMI"]),
        ("M-HORSE", ["M HORSE", "M-HORSE"]),
        ("LENOVO", ["LENOVO", "IDEAPAD"]),
        ("ASUS", ["ASUS", "VIVOBOOK"]),
        ("DELL", ["DELL", "LATITUDE"]),
        ("HP", ["DESKJET", "HP "]),
    ]
    for brand, kws in BRANDS:
        for kw in kws:
            if kw in n:
                return brand
    return default or "GENERIC"

def detect_category(section: str, name: str, default_cat: str | None) -> str:
    n = name.upper()
    if default_cat and default_cat != "skip":
        # Default from section, with overrides
        if section == "FUENTE DE PODER":
            if "FUENTE DC" in n or "ADAPTADOR" in n or "SPLITTER" in n:
                return "accesorios"
            return "seguridad"
        if section in ("CONTROL DE ACCESO Y MOTORES",):
            return "seguridad"
        if section == "DATA":
            if "PROBADOR" in n or "KIT DE RED" in n or "PINZA" in n or "GABINETE" in n:
                return "accesorios"
            return "conectividad"
        return default_cat
    # VARIADO heuristics
    if "CAMARA" in n or "DVR" in n or "NVR" in n:
        return "seguridad"
    if "BALUM" in n or "REGISTRO" in n or "CONECTOR" in n or "BOTON" in n or "MAGNETO" in n:
        return "seguridad"
    if "PROTECTOR DE VOLTAJE" in n or "REGLETA" in n or "EXTENSION" in n or "POWER CORD" in n:
        return "accesorios"
    if "BASE PARA" in n or "BASE GIRATORIA" in n:
        return "accesorios"
    if "RADIO" in n or "BAOFENG" in n:
        return "conectividad"
    if "EXTENSOR" in n:
        return "conectividad"
    if "FIRE STICK" in n or "AMAZON" in n:
        return "accesorios"
    if "TALADRO" in n or "TARUGOS" in n or "TORNILLOS" in n or "ABRAZADERAS" in n or "GRAPAS" in n or "PEGAMENTO" in n or "UHU" in n or "CINTA" in n or "CONDUIT" in n or "ROLLO CONDUCT" in n:
        return "accesorios"
    if "CABLE HDMI" in n or "CABLE VGA" in n or "CABLE DISPLAYPORT" in n:
        return "accesorios"
    if "BOCINA" in n or "PARLANTE" in n:
        return "audio"
    if "MOUSE" in n or "IMPRESORA" in n or "IMRESOR" in n or "PAPEL TERMICO" in n or "LECTOR CODIGO" in n or "CAJA" in n and "BILLETES" in n or "ALL IN ONE" in n:
        return "accesorios"
    if "CELULAR" in n or "REDMI" in n or "INFINIX" in n or "M HORSE" in n or "XIAOMI" in n:
        return "celulares"
    if "TABLET" in n:
        return "tablets"
    if "LAPTOP" in n or "IDEAPAD" in n or "VIVOBOOK" in n or "LATITUDE" in n:
        return "laptops"
    return "varios"

# ── Per-product short description (from static_catalog.py) ────
def short_for(name: str, variant: str, category: str, brand: str) -> str:
    n = (name or "").upper()

    if 'CAMARA' in n or 'CAMRA' in n or 'VIDEO PORTERO' in n:
        feats = []
        if 'COLOR HUNTER' in n or 'DUAL LIGHT' in n or ('COLOR' in n and 'NIGHT' not in n):
            feats.append("imagen a color dia y noche")
        if 'AUDIO' in n:
            feats.append("audio integrado")
        if 'PTZ' in n:
            feats.append("vista 360 motorizada con zoom optico")
        elif re.search(r'\bPT\b', n):
            feats.append("rotacion pan-tilt remota")
        if 'WIFI' in n:
            feats.append("instalacion inalambrica via WiFi")
        if '4G' in n:
            feats.append("conexion 4G sin red local")
        if 'RECARGABLE' in n or 'BATERIA' in n:
            feats.append("bateria integrada, sin tendido electrico")
        m_dist = re.search(r'(\d+)\s*MT|(\d+)\s*METROS?', n)
        if m_dist:
            d = m_dist.group(1) or m_dist.group(2)
            feats.append(f"alcance {d}m incluso en oscuridad total")
        if 'VIDEO PORTERO' in n:
            return f"Video portero {brand}. Ve y habla con quien toca tu puerta desde el celular, donde estes."
        body = ", ".join(feats) if feats else "vigilancia profesional 24/7"
        return f"Camara {brand} con {body}. La instalamos, la configuramos y respondemos cuando necesites soporte."

    if n.startswith('DVR') or n.startswith('NVR'):
        m = re.search(r'(\d+)\s*CANALES', n)
        ch = m.group(1) if m else None
        kind = 'DVR' if n.startswith('DVR') else 'NVR'
        ch_part = f" para {ch} camaras" if ch else ""
        poe = ", alimentacion PoE por el mismo cable de red" if 'POE' in n else ""
        return f"{kind} {brand}{ch_part}{poe}. Acceso remoto desde tu celular y respaldo configurado por nuestro equipo."

    if 'KIT ALARMA' in n:
        line = "AX-PRO" if 'AX-PRO' in n or 'AX PRO' in n else ("AX-HOME" if 'AX-HOME' in n or 'AX HOME' in n else "")
        return f"Sistema de alarma {brand} {line} inalambrico. Detecta intrusion, te notifica al celular y dispara sirena al instante.".replace("  ", " ")
    if 'SENSOR' in n and 'MOVIMIENTO' in n:
        return f"Sensor de movimiento inalambrico {brand}. Cobertura amplia y bajo indice de falsa alarma."
    if 'SENSOR' in n and 'VENTANA' in n:
        return f"Sensor magnetico inalambrico {brand} para puerta o ventana. Avisa al instante si alguien la abre."
    if 'SIRENA' in n:
        loc = "interior" if 'INTERNA' in n else ("exterior" if 'EXTERNA' in n else "")
        loc_part = f" {loc}" if loc else ""
        return f"Sirena{loc_part} {brand} de alta potencia. Disuasion inmediata en cualquier intento de intrusion."
    if 'INTERCOM' in n:
        return f"Intercomunicador {brand} para edificios y oficinas. Instalacion y configuracion disponibles."

    if 'MAGNETO' in n:
        return "Cerradura magnetica de alta retencion. La base del control de acceso profesional."
    if 'CERRADURA' in n and 'SMART' in n:
        return f"Cerradura inteligente {brand}. Apertura por huella, codigo o app. Instalacion profesional con cotizacion personalizada."
    if 'CERRADURA' in n:
        return f"Cerradura electrica {brand} para puerta de hierro o metal. Robusta, probada y con instalacion profesional disponible."
    if 'CONTROL DE ACCESO' in n and 'HUELLA' in n:
        return f"Control de acceso biometrico {brand}. Registro por huella, lista para oficinas, comercios y residencias."
    if 'CONTROL DE ACCESO' in n:
        return f"Control de acceso {brand} con asistencia. Reemplaza la llave fisica por algo trazable."
    if 'BOTON' in n or 'BOTONERA' in n:
        return "Componente de control de acceso. Compatible con cerraduras electromagneticas y sistemas profesionales."
    if 'BRAZO AUTOMATICO' in n:
        return "Brazo cierra-puertas hidraulico. Cierre suave y silencioso para entradas comerciales."
    if 'POWER SUPPLY CONTROL' in n:
        return "Fuente regulada para sistema de control de acceso. Estable y dimensionada al consumo real."

    if 'MOTOR' in n and ('KG' in n or 'PORTON' in n):
        m_kg = re.search(r'([\d,]+)\s*KG', n)
        kg = m_kg.group(1) if m_kg else ""
        wifi = " con control via WiFi y celular" if 'WIFI' in n else ""
        kg_part = f" para portones hasta {kg}kg" if kg else ""
        return f"Motor automatico {brand}{kg_part}{wifi}. Instalacion profesional, foto-celdas de seguridad y controles incluidos."
    if 'CREMAYERA' in n or 'CREMALLERA' in n:
        return "Cremallera de acero para motor de porton corredizo. Pieza fundamental: la calidad importa."
    if 'FOTO CELDA' in n:
        return "Par de foto-celdas de seguridad. Detiene el porton si detecta personas o vehiculos en su trayectoria."
    if 'CONTROL COPIA' in n:
        return "Control remoto programable. Lo copiamos al de tu motor existente sin moverte de tu casa."
    if 'RECEPTORA' in n:
        return "Receptora universal con controles incluidos. Para retro-fit de motor sin receptor original."
    if 'LAMPARA' in n and 'MOTOR' in n:
        return "Lampara estroboscopica de senalizacion para porton automatico. Visibilidad obligatoria para operacion segura."

    if 'CABLE UTP' in n or 'ROLLO CABLE' in n or 'CABLE 22' in n:
        m_ft = re.search(r'([\d,]+)\s*(PIE|FT)', n)
        ft = m_ft.group(1) if m_ft else ""
        cobre = "100% cobre puro" if '100%' in n and 'COBRE' in n else None
        prop = "blindado para exterior" if ('BLINDADO' in n or 'EXTERIOR' in n) else "para uso interior"
        cat = ""
        m_cat = re.search(r'CAT\s*(\d[A-Z]?)', n)
        if m_cat:
            cat = f"Cat {m_cat.group(1)}"
        ft_part = f" - rollo de {ft} pies" if ft else ""
        material = cobre or "calidad probada"
        cat_part = f" {cat}, " if cat else " "
        return f"Cable UTP{cat_part}{prop}, {material}{ft_part}. La capa que aguanta cuando todo lo demas se cae."

    if 'SWITCH POE' in n:
        m = re.search(r'(\d+)\s*PUERTOS', n)
        ports = m.group(1) if m else ""
        return f"Switch PoE de {ports} puertos. Alimenta tus camaras IP por el mismo cable de red: menos cables, menos fallas."
    if 'SWITCH' in n:
        m = re.search(r'(\d+)\s*PUERTOS', n)
        ports = m.group(1) if m else ""
        return f"Switch de red de {ports} puertos. Estable, plug-and-play, listo para tu instalacion."
    if 'ROUTER' in n:
        m = re.search(r'(\d+)\s*ANTENAS', n)
        ant = m.group(1) if m else ""
        ant_part = f" con {ant} antenas" if ant else ""
        return f"Router WiFi {brand}{ant_part}. Cobertura amplia para hogar y oficina pequena."
    if 'REPETIDOR' in n:
        return "Repetidor WiFi para extender la senal a zonas muertas del hogar u oficina."
    if 'GABINETE' in n:
        m = re.search(r'(\d+U)', n)
        size = m.group(1) if m else ""
        return f"Gabinete de red {size} para rack profesional. Organiza, protege y enfria tu equipo critico."

    if 'MONITOR' in n and 'TV' not in n:
        m = re.search(r'(\d+)\s*PULGAD', n)
        size = m.group(1) if m else ""
        size_part = f' de {size}"' if size else ""
        hz = ""
        m_hz = re.search(r'(\d+)\s*HZ', n)
        if m_hz:
            hz = f", {m_hz.group(1)}Hz"
        return f"Monitor{size_part}{hz}. Listo para usar en DVR, computadora o punto de venta."

    if 'DISCO DURO' in n:
        m = re.search(r'(\d+(?:GB|TB))', n)
        cap = m.group(1) if m else ""
        cap_part = f" de {cap}" if cap else ""
        return f"Disco duro SATA{cap_part}. Para reemplazo, ampliacion o almacenamiento de DVR/NVR."

    if 'UPS' in n.split():
        return f"UPS {brand}. Mantiene tu DVR, router y camaras encendidos cuando se va la luz."
    if n.startswith('POWER') or n.startswith('FUENTE') or 'POWER SUPPLY' in n:
        return f"Fuente de poder {brand}. Voltaje estable y respaldo dimensionado para equipo critico."
    if 'PROTECTOR DE VOLTAJE' in n:
        return "Protector de voltaje para electrodomesticos y equipo electronico. Una falla electrica destruye mas equipo del que cuesta este protector."

    if 'IMPRESORA' in n or 'IMRESOR' in n:
        return f"Impresora {brand}. Instalacion, configuracion y orientacion inicial disponibles."
    if 'PAPEL TERMICO' in n:
        return "Rollo de papel termico estandar. Para impresoras de punto de venta y caja registradora."
    if 'LECTOR CODIGO' in n:
        return f"Lector de codigo de barras {brand}. Plug-and-play via USB, listo para tu sistema POS."
    if 'ALL IN ONE' in n or 'CAJA' in n and 'BILLETES' in n:
        return f"Equipo POS {brand}. Instalacion, configuracion y entrenamiento basico disponibles."

    if 'MOUSE' in n:
        wireless = "inalambrico" if 'INALAMBRICO' in n else "alambrico USB"
        return f"Mouse {wireless} {brand}. Original, con garantia contra defecto de fabrica."
    if 'BOCINA' in n or 'PARLANTE' in n:
        return "Bocina Bluetooth de alto volumen, ideal para eventos y reuniones. Probada antes de entregar."

    if 'CABLE HDMI' in n:
        m_ft = re.search(r'(\d+)\s*PIE', n)
        ft = m_ft.group(1) if m_ft else ""
        return f"Cable HDMI {ft} pies. Calidad probada para instalacion permanente sin parpadeo."
    if 'CABLE DISPLAYPORT' in n or 'CABLE VGA' in n:
        return "Cable de video estandar. Calidad probada, sin perdida de senal."
    if 'EXTENSOR' in n:
        return "Extensor de video por cable de red (RJ45). Lleva tu senal HDMI o VGA decenas de metros sin perdida."
    if 'POWER CORD' in n:
        return "Cable de poder estandar. Reemplazo confiable para equipos de computo, monitores y servidores."

    if 'FIRE STICK' in n:
        return "Amazon Fire TV Stick. Convierte tu TV en smart TV con apps, streaming y voz."

    if 'BASE PARA' in n or 'BASE GIRATORIA' in n:
        return "Soporte de pared para TV. Resistente, con anclaje correcto al material de tu pared."

    if 'REGISTRO' in n:
        return "Caja de registro plastica. Protege empalmes y conexiones de camaras o cableado electrico."
    if 'BALUM' in n or 'BALUN' in n:
        return "Balun de video para camara analogica. Convierte BNC a UTP: instalacion mas limpia y duradera."
    if 'CONECTOR DC' in n:
        return "Conector DC estandar para camaras y fuentes de seguridad. Calidad probada en instalacion."

    if 'PROBADOR' in n and 'CAMARA' in n:
        return "Tester profesional 4K para CCTV. Configura camaras IP/analogas, mide voltaje y verifica red."
    if 'PROBADOR' in n and 'RED' in n:
        return "Tester de cable RJ45. Verifica continuidad de cada par antes de cerrar el plafon."
    if 'KIT DE RED' in n:
        return "Kit completo de red: ponchador, tester y herramientas. Las herramientas correctas para una instalacion bien hecha."
    if 'PINZA RJ45' in n:
        return "Ponchador RJ45 pass-through. Ahorra tiempo y reduce errores de ponchado en cada conexion."
    if 'TALADRO' in n:
        return "Taladro recargable con baterias incluidas. Para instalaciones electricas, redes y montaje."

    if 'CINTA' in n and 'CABLE' in n:
        return "Guia pasacables para tuberia. Indispensable cuando la canalizacion ya esta cerrada."
    if 'ROLLO CONDUCT' in n or 'CONDUIT' in n:
        return "Conduit flexible. Para canalizacion limpia y profesional."
    if 'TARUGOS' in n or 'TORNILLOS' in n or 'ABRAZADERAS' in n or 'GRAPAS' in n:
        return "Material de fijacion profesional. El detalle que separa una instalacion que dura de una que falla."
    if 'PEGAMENTO' in n or 'UHU' in n:
        return "Adhesivo universal de calidad probada. Indispensable para una terminacion profesional."
    if 'REGLETA' in n:
        return "Regleta electrica con proteccion. Calidad probada para uso continuo."
    if 'EXTENSION ELECTRICA' in n:
        return "Extension electrica de calibre adecuado. Disenada para soportar carga real sin sobrecalentamiento."
    if 'RADIO' in n or 'BAOFENG' in n:
        return "Par de radios de comunicacion. Equipo probado para obras, vigilancia o eventos."

    if category == 'celulares':
        return f"Celular {brand} nuevo, sellado y desbloqueado. Configuracion inicial y traspaso de datos disponibles."
    if category == 'tablets':
        return f"Tablet {brand} con conectividad. Lista para usar - configuracion inicial incluida bajo paquete."
    if category == 'audio':
        return f"Equipo de audio {brand}. Original, probado y con respaldo Plata Tech."

    return {
        "seguridad":    f"Equipo de seguridad {brand} original. Instalacion profesional con cotizacion personalizada.",
        "conectividad": f"Equipo de red {brand} original. Calidad probada con instalacion profesional disponible.",
        "accesorios":   f"Accesorio {brand} original. Garantia contra defecto de fabrica.",
    }.get(category, "Producto original con respaldo Plata Tech Solutions.")

def specs_from(variant: str) -> list:
    if not variant:
        return []
    parts = re.split(r'[,/]', variant)
    return [p.strip() for p in parts if p.strip()]

# ── Variant from name (extract size/MP/etc into a short tag) ──
def variant_from_name(name: str) -> str:
    n = name.upper()
    bits = []
    m = re.search(r'(\d+\s*MP)', n)
    if m: bits.append(m.group(1).replace(" ", ""))
    m = re.search(r'(\d+\s*CANALES?)', n)
    if m: bits.append(m.group(1))
    m = re.search(r'(\d+\s*PUERTOS?)', n)
    if m: bits.append(m.group(1))
    m = re.search(r'(\d+\s*ANTENAS?)', n)
    if m: bits.append(m.group(1))
    m = re.search(r'(\d+\s*PULGAD\w*)', n)
    if m: bits.append(m.group(1).replace("PULGADAS", '"').replace("PULGADA", '"'))
    m = re.search(r'(\d+\s*(?:GB|TB))(?!\s*RAM)', n)
    if m: bits.append(m.group(1))
    m = re.search(r'(\d+\s*HZ)', n)
    if m: bits.append(m.group(1))
    return ", ".join(bits)

# ── Build & write ────────────────────────────────────────────
def js_string(s):
    if s is None:
        return "null"
    return json.dumps(s, ensure_ascii=False)

def build_products(xlsx_path: Path, row_to_image: dict):
    import openpyxl
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    ws = wb.active
    products = []
    seen_slugs = set()
    section = ""
    section_cat = None
    section_brand = None

    for r_idx, row in enumerate(ws.iter_rows(values_only=True), 1):
        rd = ws.row_dimensions.get(r_idx)
        if rd and rd.hidden:
            continue
        c = row[2] if len(row) > 2 else None
        d = row[3] if len(row) > 3 else None
        c_str = str(c).strip() if c else ""
        d_str = str(d).strip() if d else ""
        if not c_str or c_str.upper() == "DESCRIPCION DEL PRODUCTO":
            continue
        # Section header: col C present, col D empty (or it's a known section title)
        key = c_str.upper()
        if key in SECTION_CATEGORY:
            cat, brand = SECTION_CATEGORY[key]
            section = key
            section_cat = cat
            section_brand = brand
            continue
        if section_cat == "skip":
            continue
        # Treat any col-C-only row as section/junk (non-priced item)
        if not d_str:
            continue
        price = parse_price(d_str)
        if not price:
            continue  # disponibilidad: must have price
        image_path = row_to_image.get(r_idx)
        if not image_path:
            continue  # foto: must have embedded image
        name = c_str
        category = detect_category(section, name, section_cat)
        brand = detect_brand_from_name(name, section_brand)
        variant = variant_from_name(name)
        marked = apply_margin(price, category)

        slug_base_name = name if name.upper().startswith(brand.upper()) else f"{brand} {name}"
        base_slug = slugify(f"{slug_base_name} {variant[:30]}") or f"renzo-{r_idx}"
        slug = base_slug
        i = 2
        while slug in seen_slugs:
            slug = f"{base_slug}-{i}"
            i += 1
        seen_slugs.add(slug)

        gradient = list(CATEGORY_GRADIENTS.get(category, CATEGORY_GRADIENTS["varios"]))

        products.append({
            "id": STATIC_ID_BASE + r_idx,
            "slug": slug,
            "category": category,
            "brand": brand,
            "name": name,
            "variant": variant,
            "price": marked,
            "short": short_for(name, variant, category, brand),
            "specs": specs_from(variant),
            "image": image_path,
            "gradient": gradient,
            "stock": 10,
            "_source": "renzo",
            "_row": r_idx,
            "_cost": price,
        })
    return products

def write_js(products, out: Path):
    lines = []
    lines.append("/* ════════════════════════════════════════════════════════")
    lines.append("   Plata Tech Solutions S.R.L. - Catalogo R.ENZO TECH")
    lines.append("   AUTO-GENERADO. NO EDITAR A MANO.")
    lines.append("   Fuente: Google Sheets R.ENZO. Imagenes embebidas extraidas a shop/assets/img/renzo/.")
    lines.append("   Regenerar: python scripts/sync_renzo.py")
    lines.append("   ════════════════════════════════════════════════════════ */")
    lines.append("")
    lines.append("(function () {")
    lines.append("  if (!window.PRODUCTS) window.PRODUCTS = [];")
    lines.append("  var STATIC = [")
    for p in products:
        lines.append("    {")
        lines.append(f"      id: {p['id']},")
        lines.append(f"      slug: {js_string(p['slug'])},")
        lines.append(f"      category: {js_string(p['category'])},")
        lines.append(f"      brand: {js_string(p['brand'])},")
        lines.append(f"      name: {js_string(p['name'])},")
        lines.append(f"      variant: {js_string(p['variant'])},")
        lines.append(f"      price: {p['price']}, oldPrice: null,")
        lines.append(f"      short: {js_string(p['short'])},")
        specs_js = "[" + ", ".join(js_string(s) for s in p['specs']) + "]"
        lines.append(f"      specs: {specs_js},")
        lines.append(f"      image: {js_string(p['image'])},")
        lines.append(f"      gradient: [{js_string(p['gradient'][0])}, {js_string(p['gradient'][1])}],")
        lines.append(f"      stock: {p['stock']}")
        lines.append("    },")
    lines.append("  ];")
    lines.append("  Array.prototype.push.apply(window.PRODUCTS, STATIC);")
    lines.append("})();")
    lines.append("")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"[renzo] {len(products)} productos -> {out}")

def main():
    if "--no-download" in sys.argv and XLSX_PATH.exists():
        print(f"[renzo] Usando cache: {XLSX_PATH}")
    else:
        try:
            download_xlsx()
        except Exception as e:
            if XLSX_PATH.exists():
                print(f"[renzo] Descarga fallo ({e}), usando cache.")
            else:
                raise
    row_to_image = extract_images_by_row(XLSX_PATH, IMG_DIR)
    products = build_products(XLSX_PATH, row_to_image)
    by_cat = {}
    for p in products:
        by_cat[p['category']] = by_cat.get(p['category'], 0) + 1
    print("[renzo] Por categoria:")
    for cat, n in sorted(by_cat.items(), key=lambda x: -x[1]):
        print(f"   {cat:15s} {n:4d}")
    write_js(products, OUT_FILE)
    print("[renzo] Listo.")

if __name__ == "__main__":
    main()

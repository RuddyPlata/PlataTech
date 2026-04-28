# Scripts Plata Tech Solutions

Tres archivos JS componen el catalogo del shop, cargados en este orden por
`shop/index.html`, `shop/product.html`, `shop/cart.html`, `shop/orden.html`:

1. `shop/assets/products.js` — auto-generado por `sync_products.py` (YDC).
2. `shop/assets/products-static.js` — auto-generado por `sync_renzo.py` (R.ENZO).
3. `shop/assets/products-overrides.js` — **MANUAL**, sobrevive a los syncs.

## sync_products.py (YDC)

Sincroniza el catalogo desde Google Sheets YDC a `shop/assets/products.js`.
Tambien extrae las imagenes embebidas del xlsx a `shop/assets/img/ydc/`.

```bash
python scripts/sync_products.py             # descarga sheet y regenera
python scripts/sync_products.py --no-download  # usa cache .tmp/ydc.xlsx
```

### Filtros
- Excluye filas OCULTAS del sheet (YDC oculta items sin stock).
- Excluye TRANSITO / sin precio.
- Excluye mayoristas (`MIN. X PCS` con X >= 10).
- Excluye seccion `MAQUITOS`.

### Imagenes
1. Lee `xl/drawings/drawing1.xml` del xlsx (anchors por fila).
2. Mapea fila → `xl/media/imageX.ext`.
3. Guarda en `shop/assets/img/ydc/r<row>.<ext>`.
4. Si una fila no tiene imagen embebida pero si Drive hyperlink, usa `drive.google.com/thumbnail?id=...&sz=w800` como fallback.

## sync_renzo.py (R.ENZO TECH)

Sincroniza el catalogo R.ENZO TECH desde Google Sheets a `shop/assets/products-static.js`.
Extrae imagenes embebidas a `shop/assets/img/renzo/`.

```bash
python scripts/sync_renzo.py               # descarga y regenera
python scripts/sync_renzo.py --no-download # usa cache .tmp/renzo.xlsx
```

### Filtros
- Solo publica productos con **disponibilidad** (precio valido) Y **foto** (imagen embebida).
- Skip seccion `ZONA DE OFERTAS` (precios mayoristas).

## Reglas de margen (ambos scripts)
| Costo (RD$)        | Margen aplicado  |
|--------------------|------------------|
| < 1,000            | + 1,000          |
| 1,000 – 15,000     | + 1,500          |
| 15,000 – 40,000    | + 2,000          |
| > 40,000           | + 3,000          |
| Categoria seguridad | + 25% sobre costo |

## Overrides manuales — `shop/assets/products-overrides.js`

Editar este archivo para:
- **AGREGAR** productos manuales (`EXTRA`, IDs >= 90000)
- **EDITAR** productos generados (`OVERRIDES` por id o slug)
- **OCULTAR** productos sin borrar del sheet (`HIDDEN`)

Se carga DESPUES de los dos generados, asi que tiene la ultima palabra y NO se sobreescribe.

## Cron diario YDC (Windows, ejecutar como Admin)

```
schtasks /create /tn "PlataTech Sync Productos" /tr "B:\Pts\scripts\sync_products.bat" /sc daily /st 09:00 /f
schtasks /query /tn "PlataTech Sync Productos"
```

Logs en `scripts/sync.log`. Para R.ENZO no hay cron por defecto — correr manual cuando se actualice el sheet.

## Estructura del producto generado
```js
{
  id: 5,                            // id estable (fila YDC, o 50000+fila R.ENZO)
  slug: "asus-vivobook-...",        // SEO-friendly
  category: "laptops",
  brand: "ASUS",
  name: "ASUS VIVOBOOK E410KA-PM464",
  variant: "64GB, 4GB RAM, 14\" FHD, INTEL N6000, WINDOWS 11",
  price: 11999,                     // costo + margen aplicado
  oldPrice: null,
  short: "...",                     // descripcion corta para card
  specs: ["64GB", "4GB RAM", ...],  // bullets para detail page
  image: "assets/img/ydc/r5.png",   // ruta local extraida del xlsx
  gradient: ["#2a2d3a", "#0f1218"], // fallback SVG
  stock: 10
}
```

# PlataTech — memoria de proyecto

Contexto que Claude necesita en **toda** sesión. Mantener corto: esto se
antepone a cada turno. Si algo se deduce leyendo el código en 10 segundos,
no va aquí.

## Qué es

Sitio estático de Plata Tech Solutions S.R.L. (Rep. Dominicana), desplegado
en `platatechs.com` vía GitHub Pages desde `main` (hay `CNAME`, no hay
workflows de CI). Moneda: **RD$**. Español dominicano, sin tuteo forzado.

## Mapa

- `*.html` en raíz — landings por vertical (energia, security, digital,
  remodelacion, automatizacion, redes, ultimogadget). Cada una es
  autocontenida: HTML + CSS + JS inline. No hay build step.
- `shop/` — tienda. `index / product / cart / orden / cuenta / ordenes /
  admin`. Auth y datos por Supabase (`shop/assets/sb.js`).
- `supabase/functions/` — edge functions: `azul-create-payment`,
  `azul-callback`, `notify-order`, `notify-status`.
- `scripts/` — sync de catálogo en Python + `.bat` para Task Scheduler.

## Catálogo: regla crítica

`shop/index.html` y hermanos cargan **tres** archivos en este orden:

1. `shop/assets/products.js` — GENERADO por `scripts/sync_products.py` (YDC).
2. `shop/assets/products-static.js` — GENERADO por `scripts/sync_renzo.py`.
3. `shop/assets/products-overrides.js` — **MANUAL**, sobrevive a los syncs.

> **Nunca editar a mano (1) ni (2): el próximo sync borra el cambio.**
> Toda corrección de precio, nombre o imagen va en `products-overrides.js`.
> Para cambiar cómo se generan, editar el script Python, no la salida.

Estos archivos son enormes (~6.000 líneas juntos). **No leerlos completos**:
usar `grep -n` sobre el SKU/modelo concreto.

## Márgenes (fuente de verdad: `scripts/sync_products.py`)

- < RD$2,500 → +RD$1,000
- < RD$15,000 → +RD$1,500
- < RD$33,334 → +RD$2,000
- >= RD$33,334 → +6%
- categoría `seguridad` → +25% sobre costo

Si se cambia una regla aquí, cambiarla también en el docstring del script.

## Pagos

AZUL Payment Page en RD$. PayPal fue **retirado** del sitio público
(commit `5f5bc2a`); no reintroducirlo. El AuthHash sigue la spec oficial
de AZUL — cualquier cambio en el orden o formato de los campos rompe el
cobro en producción. Tocar `azul-create-payment` solo con la spec delante.

## Comandos

```bash
python scripts/sync_products.py                 # regenera products.js
python scripts/sync_products.py --no-download   # usa cache .tmp/ydc.xlsx
python scripts/sync_renzo.py                    # regenera products-static.js
python -m http.server 8000                      # previsualizar el sitio
```

No hay tests ni linter. La verificación es: abrir la página y mirar,
o `grep` sobre el HTML generado.

## Convenciones

- Sin frameworks, sin bundler, sin `node_modules`. Vanilla JS y CSS a mano.
- Texto de cara al público: español, sin em-dash (`—`) en títulos y meta
  tags (rompe cómo se ve en buscadores; ver commits de limpieza).
- Cambios que afecten precio, checkout o textos legales: mostrarlos antes
  de commitear, no aplicarlos de una.

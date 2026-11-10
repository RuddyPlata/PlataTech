#!/usr/bin/env node
/* ════════════════════════════════════════════════════════
   Plata Tech — Copia los precios del catalogo a Supabase
   ------------------------------------------------------------
   El carrito calcula el total en el navegador, pero Supabase
   lo vuelve a calcular con la tabla product_prices antes de
   aceptar el pedido (trigger orders_00_check_totals). Este
   script llena esa tabla con lo mismo que ve el cliente:
     products.js + products-static.js + products-overrides.js

   Uso:
     node scripts/sync_prices.mjs           # sube a Supabase
     node scripts/sync_prices.mjs --sql     # imprime el SQL (semilla)
     node scripts/sync_prices.mjs --check   # solo cuenta y valida

   Necesita SUPABASE_SERVICE_ROLE_KEY (la "secret key" sb_secret_...).
   Lo corre solo el GitHub Action sync-prices cuando cambia el
   catalogo en main.
   ════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['products.js', 'products-static.js', 'products-overrides.js'];
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ieltuoriwgfckdfbwziu.supabase.co';

export function loadCatalog() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  for (const f of FILES) {
    vm.runInContext(readFileSync(join(ROOT, 'shop', 'assets', f), 'utf8'), sandbox, { filename: f });
  }
  const seen = new Set();
  const rows = [];
  for (const p of sandbox.window.PRODUCTS || []) {
    if (!p || !p.slug || seen.has(p.slug)) continue; // el carrito usa el primero
    const price = Number(p.price);
    if (!Number.isInteger(price) || price <= 0) throw new Error(`Precio invalido en ${p.slug}: ${p.price}`);
    seen.add(p.slug);
    rows.push({ slug: String(p.slug), name: String(p.name || ''), variant: String(p.variant || ''), price });
  }
  if (rows.length < 50) throw new Error(`Catalogo sospechoso: solo ${rows.length} productos`);
  return rows;
}

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

function toSql(rows) {
  const vals = rows.map((r) => `  (${q(r.slug)}, ${q(r.name)}, ${q(r.variant)}, ${r.price})`);
  return 'insert into public.product_prices (slug, name, variant, price) values\n' + vals.join(',\n') +
    '\non conflict (slug) do update set name = excluded.name, variant = excluded.variant,\n' +
    '  price = excluded.price, updated_at = now();\n';
}

async function upload(rows) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sync_product_prices`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p: rows }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase respondio ${res.status}: ${text}`);
  console.log(`OK: ${rows.length} precios en Supabase`, text);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rows = loadCatalog();
  if (process.argv.includes('--sql')) process.stdout.write(toSql(rows));
  else if (process.argv.includes('--check')) console.log(`${rows.length} productos con precio valido`);
  else await upload(rows);
}

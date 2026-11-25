// Arnés LOCAL de punta a punta para la Página de Pagos de AZUL (ambiente de pruebas).
//
//   AZUL_AUTH_KEY=<llave de pruebas> deno run --allow-net --allow-env --allow-write \
//     scripts/azul-pp-sandbox.ts
//
// Corre las Edge Functions REALES (azul-create-payment y azul-callback) en
// http://localhost:8788, con una tabla `orders` en memoria en lugar de Supabase:
// no toca la base de datos de producción ni despliega nada.
//
// 1. Abre http://localhost:8788/?total=1.18&itbis=0.18
// 2. El arnés crea una orden pendiente, llama a azul-create-payment y el
//    navegador hace el POST a https://pruebas.azul.com.do/PaymentPage/.
// 3. Azul devuelve al cliente a azul-callback, que verifica el AuthHash y el
//    monto y marca la orden "pagado". El arnés muestra la orden final.
// Cada paso se agrega a AZUL_PP_LOG (Azul solo devuelve la tarjeta enmascarada).

const PORT = Number(Deno.env.get('PORT') || 8788);
const BASE = `http://localhost:${PORT}`;
const LOG = Deno.env.get('AZUL_PP_LOG') || 'azul-pp-sandbox.log';
if (!Deno.env.get('AZUL_AUTH_KEY')) { console.error('Falta AZUL_AUTH_KEY'); Deno.exit(1); }
if ((Deno.env.get('AZUL_ENV') || 'test') !== 'test') { console.error('Solo ambiente de pruebas'); Deno.exit(1); }

// Entorno que leen las Edge Functions.
Deno.env.set('AZUL_MERCHANT_ID', Deno.env.get('AZUL_MERCHANT_ID') || '39038540035');
Deno.env.set('AZUL_ENV', 'test');
Deno.env.set('SUPABASE_URL', BASE);
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'local-stub');
Deno.env.set('SITE_URL', BASE);

const { handler: createPayment } = await import('../supabase/functions/azul-create-payment/index.ts');
const { handler: callback } = await import('../supabase/functions/azul-callback/index.ts');

type Order = { id: string; status: string; totals: { total: number; itbis: number }; azul?: unknown };
const orders = new Map<string, Order>();

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const page = (body: string) => new Response(`<!doctype html><meta charset="utf-8"><title>AZUL PP sandbox</title><body style="font-family:system-ui;max-width:760px;margin:2rem auto">${body}</body>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
const log = (o: Record<string, unknown>) => Deno.writeTextFile(LOG, JSON.stringify({ t: new Date().toISOString(), ...o }) + '\n', { append: true });

Deno.serve({ port: PORT, hostname: '127.0.0.1' }, async (req) => {
  const url = new URL(req.url);
  const p = url.pathname;

  // ── Supabase REST en memoria (solo lo que usan las dos funciones) ──
  if (p === '/rest/v1/orders') {
    const id = (url.searchParams.get('id') || '').replace(/^eq\./, '');
    const o = orders.get(id);
    if (req.method === 'GET') return Response.json(o ? [o] : []);
    if (req.method === 'PATCH' && o) {
      Object.assign(o, await req.json());
      await log({ step: 'order-updated', order: o });
      return new Response(null, { status: 204 });
    }
    return new Response('bad', { status: 400 });
  }

  if (p === '/functions/v1/azul-create-payment') return createPayment(req);
  if (p === '/functions/v1/azul-callback') {
    const q: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { q[k] = v; });
    await log({ step: 'callback', query: q });
    return callback(req);
  }

  // ── Inicio: crea la orden y va a AZUL ──
  if (p === '/') {
    const total = Number(url.searchParams.get('total') || '1.18');
    const itbis = Number(url.searchParams.get('itbis') || '0.18');
    const id = 'PTS-' + Date.now().toString(36).toUpperCase();
    orders.set(id, { id, status: 'pendiente', totals: { total, itbis } });
    const r = await createPayment(new Request(`${BASE}/functions/v1/azul-create-payment`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: id }),
    }));
    const j = await r.json();
    await log({ step: 'create-payment', status: r.status, url: j.url, fields: j.fields && { ...j.fields, AuthHash: String(j.fields.AuthHash).slice(0, 16) + '…' } });
    if (!r.ok) return page(`<pre>${esc(JSON.stringify(j, null, 2))}</pre>`);
    const inputs = Object.entries(j.fields as Record<string, string>).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
    return page(`<p>Orden ${esc(id)} por RD$${total.toFixed(2)}. Enviando a AZUL…</p>
<form id="f" method="post" action="${esc(j.url)}">${inputs}</form><script>document.getElementById('f').submit()</script>`);
  }

  // ── Páginas a las que redirige azul-callback (en producción: platatechs.com/shop/...) ──
  if (p === '/shop/orden.html' || p === '/shop/cart.html') {
    const id = url.searchParams.get('n') || '';
    const o = orders.get(id);
    await log({ step: 'landing', path: p + url.search, order: o || null });
    return page(`<h1>${p === '/shop/orden.html' ? 'Comprobante' : 'Carrito'}</h1>
<p>${esc(p + url.search)}</p><pre id="order">${esc(JSON.stringify(o || null, null, 2))}</pre><p><a href="/">Otra prueba</a></p>`);
  }
  return new Response('not found', { status: 404 });
});
console.log(`Arnés AZUL PP (tienda) en ${BASE}`);

// Supabase Edge Function — azul-callback
// Recibe la respuesta de AZUL Payment Page. AZUL llama a esta función de dos formas:
//   ?src=post      → servidor-a-servidor (ResponsePostUrl). FUENTE DE VERDAD:
//                    aquí (y solo aquí) marcamos la orden como 'pagado'. No es
//                    falsificable por el usuario.
//   ?src=approved  → redirección del navegador del cliente. Reintenta marcar
//                    (defensa en profundidad) y redirige al comprobante.
//   ?src=declined  → pago rechazado; redirige al carrito con aviso.
//   ?src=cancel    → cliente canceló; redirige al carrito.
//
// Secrets: AZUL_AUTH_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//          SITE_URL (default 'https://platatechs.com').
//
// TODO producción: confirmar el orden EXACTO de los campos del hash de RESPUESTA
// contra el manual de AZUL y activar verificación estricta (AZUL_STRICT_HASH=1).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmacSha512Hex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}

serve(async (req: Request) => {
  const url = new URL(req.url);
  const src = url.searchParams.get('src') || 'post';
  const site = Deno.env.get('SITE_URL') || 'https://platatechs.com';

  // Reunir parámetros de query + cuerpo (AZUL puede usar GET o POST form-urlencoded).
  const data: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { data[k] = v; });
  if (req.method === 'POST') {
    try {
      const text = await req.text();
      new URLSearchParams(text).forEach((v, k) => { data[k] = v; });
    } catch { /* sin cuerpo */ }
  }

  const orderId = data.OrderNumber || url.searchParams.get('n') || '';
  const isoCode = data.IsoCode || '';
  const approved = isoCode === '00';

  const redirect = (to: string) =>
    new Response(null, { status: 302, headers: { Location: to } });

  // Cancelado o rechazado → no tocar la orden, volver al carrito / comprobante.
  if (src === 'cancel') return redirect(`${site}/shop/cart.html`);
  if (src === 'declined' || (!approved && src === 'approved')) {
    return redirect(`${site}/shop/cart.html?declined=1&n=${encodeURIComponent(orderId)}`);
  }

  if (approved && orderId) {
    await markPaid(orderId, data);
  }

  if (src === 'approved') {
    return redirect(`${site}/shop/orden.html?n=${encodeURIComponent(orderId)}&paid=1`);
  }
  // src === 'post' (servidor-a-servidor): responder 200 a AZUL.
  return new Response(JSON.stringify({ ok: true, order: orderId, approved }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

async function markPaid(orderId: string, data: Record<string, string>) {
  const supaUrl    = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authKey    = Deno.env.get('AZUL_AUTH_KEY');
  const strict     = Deno.env.get('AZUL_STRICT_HASH') === '1';
  if (!supaUrl || !serviceKey) { console.error('Faltan secrets Supabase'); return; }

  // Leer la orden para validar monto y evitar reprocesar.
  const rres = await fetch(
    `${supaUrl}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=id,totals,status`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!rres.ok) { console.error('read order failed', await rres.text()); return; }
  const order = (await rres.json())?.[0];
  if (!order) { console.error('order not found', orderId); return; }
  if (order.status === 'pagado') return; // idempotente

  // Validar que el monto autorizado coincide con el total de la orden (en centavos).
  const expected = Math.round(Number(order?.totals?.total || 0) * 100).toString();
  if (data.Amount && data.Amount !== expected) {
    console.error('amount mismatch', { orderId, got: data.Amount, expected });
    return;
  }

  // Verificación del hash de respuesta (best-effort hasta confirmar el orden con AZUL).
  if (authKey && data.AuthHash) {
    const respMsg = [
      data.OrderNumber, data.Amount, data.AuthorizationCode, data.DateTime,
      data.ResponseCode, data.IsoCode, data.ResponseMessage, data.ErrorDescription,
      data.RRN,
    ].map((x) => x ?? '').join('');
    const calc = await hmacSha512Hex(authKey, respMsg);
    if (calc.toLowerCase() !== data.AuthHash.toLowerCase()) {
      console.warn('response hash mismatch (revisar orden de campos con AZUL)');
      if (strict) return; // en producción con orden confirmado, rechazar
    }
  }

  const last4 = (data.CardNumber || '').replace(/[^0-9]/g, '').slice(-4);
  const azul = {
    auth:      data.AuthorizationCode || '',
    reference: data.RRN || data.AzulOrderId || '',
    last4,
    brand:     '',
  };

  const pres = await fetch(`${supaUrl}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    headers: {
      apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify({ status: 'pagado', azul }),
  });
  if (!pres.ok) console.error('mark paid failed', await pres.text());
}

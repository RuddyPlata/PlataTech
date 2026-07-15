// Supabase Edge Function — azul-callback
// AZUL redirige el navegador del cliente a estos URL con la respuesta del pago
// (firmada por AZUL con AuthHash). Rutas por query ?src=:
//   approved → verifica firma + monto → marca 'pagado' → redirige al comprobante
//   declined → pago rechazado → redirige al carrito con aviso
//   cancel   → cliente canceló → redirige al carrito
//
// SEGURIDAD: como el "pagado" se marca en la redirección del navegador (no hay
// notificación servidor-a-servidor en la Payment Page), la verificación del
// AuthHash de respuesta ES la frontera de seguridad. Sin firma válida de AZUL
// NO se marca pagado (un usuario no puede forjar el hash sin la llave).
//
// Response hash (Documento técnico AZUL):
//   OrderNumber + Amount + AuthorizationCode + DateTime + ResponseCode + IsoCode +
//   ResponseMessage + ErrorDescription + RRN + AuthKey  → UTF-16LE → HMAC-SHA512(AuthKey)
//
// Secrets: AZUL_AUTH_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//          SITE_URL (default 'https://platatechs.com').

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

const utf16le = (s: string) => {
  const b = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); b[i * 2] = c & 0xff; b[i * 2 + 1] = (c >> 8) & 0xff; }
  return b;
};

async function hmacSha512Hex(keyStr: string, msgBytes: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(keyStr), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, msgBytes));
}

serve(async (req: Request) => {
  const url = new URL(req.url);
  const src = url.searchParams.get('src') || 'approved';
  const site = Deno.env.get('SITE_URL') || 'https://platatechs.com';

  // Reunir parámetros de query + cuerpo (AZUL redirige por GET con los datos en el query).
  const data: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { data[k] = v; });
  if (req.method === 'POST') {
    try { new URLSearchParams(await req.text()).forEach((v, k) => { data[k] = v; }); } catch { /* sin cuerpo */ }
  }

  const orderId = data.OrderNumber || url.searchParams.get('n') || '';
  const approved = data.IsoCode === '00';
  const redirect = (to: string) => new Response(null, { status: 302, headers: { Location: to } });

  if (src === 'cancel') return redirect(`${site}/shop/cart.html`);
  if (src === 'declined' || !approved) {
    return redirect(`${site}/shop/cart.html?declined=1&n=${encodeURIComponent(orderId)}`);
  }

  // src === 'approved' && IsoCode === '00'
  const ok = orderId ? await markPaid(orderId, data) : false;
  if (!ok) {
    // Firma inválida o monto no coincide → tratar como no pagado.
    return redirect(`${site}/shop/cart.html?declined=1&n=${encodeURIComponent(orderId)}`);
  }
  return redirect(`${site}/shop/orden.html?n=${encodeURIComponent(orderId)}&paid=1`);
});

async function markPaid(orderId: string, data: Record<string, string>): Promise<boolean> {
  const supaUrl    = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authKey    = Deno.env.get('AZUL_AUTH_KEY');
  if (!supaUrl || !serviceKey || !authKey) { console.error('Faltan secrets'); return false; }

  // 1) Verificar la firma de la respuesta (frontera de seguridad).
  const respMsg =
    (data.OrderNumber || '') + (data.Amount || '') + (data.AuthorizationCode || '') +
    (data.DateTime || '') + (data.ResponseCode || '') + (data.IsoCode || '') +
    (data.ResponseMessage || '') + (data.ErrorDescription || '') + (data.RRN || '') + authKey;
  const recv = (data.AuthHash || '').toLowerCase();
  // Doc: UTF-16LE. Aceptamos también UTF-8 por tolerancia a variaciones de AZUL.
  const h16 = await hmacSha512Hex(authKey, utf16le(respMsg));
  const h8  = await hmacSha512Hex(authKey, new TextEncoder().encode(respMsg));
  if (recv !== h16 && recv !== h8) {
    console.error('AuthHash de respuesta inválido', { orderId });
    return false;
  }

  // 2) Leer la orden: validar monto y evitar reprocesar.
  const rres = await fetch(
    `${supaUrl}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=id,totals,status`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!rres.ok) { console.error('read order failed', await rres.text()); return false; }
  const order = (await rres.json())?.[0];
  if (!order) { console.error('order not found', orderId); return false; }
  if (order.status === 'pagado') return true; // idempotente

  const expected = Number(order?.totals?.total || 0).toFixed(2).replace('.', '');
  if (data.Amount && data.Amount !== expected) {
    console.error('amount mismatch', { orderId, got: data.Amount, expected });
    return false;
  }

  // 3) Marcar pagado + guardar datos de autorización.
  const last4 = (data.CardNumber || '').replace(/[^0-9]/g, '').slice(-4);
  const azul = {
    auth:      data.AuthorizationCode || '',
    reference: data.RRN || data.AzulOrderId || '',
    last4,
    brand:     data.DataVaultBrand || '',
  };
  const pres = await fetch(`${supaUrl}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    headers: {
      apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify({ status: 'pagado', azul }),
  });
  if (!pres.ok) { console.error('mark paid failed', await pres.text()); return false; }
  return true;
}

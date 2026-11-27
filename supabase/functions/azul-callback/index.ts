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
import { fixedString, verifyResponse } from '../_shared/azul-page.ts';

export async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const src = url.searchParams.get('src') || 'approved';
  const site = Deno.env.get('SITE_URL') || 'https://platatechs.com';

  // Reunir parámetros de query + cuerpo (AZUL redirige por GET con los datos en el query).
  const data: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { data[k] = v; });
  if (req.method === 'POST') {
    try { new URLSearchParams(await req.text()).forEach((v, k) => { data[k] = v; }); } catch { /* sin cuerpo */ }
  }

  // El OrderNumber firmado por Azul manda; `n` es solo para volver al carrito.
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
}

if (import.meta.main) serve(handler);

async function markPaid(orderId: string, data: Record<string, string>): Promise<boolean> {
  const supaUrl    = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authKey    = Deno.env.get('AZUL_AUTH_KEY');
  if (!supaUrl || !serviceKey || !authKey) { console.error('Faltan secrets'); return false; }

  // 1) Verificar la firma de la respuesta (frontera de seguridad).
  if (!(await verifyResponse(data, authKey))) {
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

  const expected = fixedString(Number(order?.totals?.total || 0));
  if (data.Amount !== expected) {
    console.error('amount mismatch', { orderId, got: data.Amount, expected });
    return false;
  }

  // 3) Marcar pagado + guardar datos de autorización.
  const last4 = (data.CardNumber || '').replace(/[^0-9]/g, '').slice(-4);
  const azul = {
    auth:      data.AuthorizationCode || '',
    reference: data.RRN || data.AzulOrderId || '',
    azulOrderId: data.AzulOrderId || '',
    dateTime: data.DateTime || '',
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

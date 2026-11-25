// Supabase Edge Function — azul-create-payment
// Llamada desde el checkout (cart.html) cuando el cliente elige "Tarjeta (AZUL)".
// Recibe { orderId }, lee el total real de la orden en la BD (no confía en el
// cliente), calcula el AuthHash con la llave secreta y devuelve los campos que
// el navegador POSTeará a la Payment Page de AZUL.
//
// Secrets requeridos:
//   AZUL_MERCHANT_ID      — MerchantID (ej. 39038540035)
//   AZUL_AUTH_KEY         — Llave privada (SECRETO — nunca en el repo)
//   AZUL_ENV              — 'test' | 'prod'   (default 'test')
//   AZUL_MERCHANT_NAME    — Razón social (default 'PLATA TECH SOLUTIONS')
//   AZUL_MERCHANT_TYPE    — Tipo (default 'ECommerce')
//   AZUL_CURRENCY         — Código de moneda (default '$' para RD$/DOP)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — inyectados por la plataforma
//
//   AZUL_RETURN_BASE      — opcional; ver abajo
//   AZUL_LOGO_URL         — opcional; logo publicado en nuestro dominio
//
// AuthHash: ver _shared/azul-page.ts ("Documento técnico - Página de Pago AZUL
// 2026"). Probado en el ambiente de pruebas el 25-nov-2026 (AzulOrderId 44958408).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { buildSaleFields, PAGE_URLS } from '../_shared/azul-page.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  let body: { orderId?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const orderId = (body.orderId || '').trim();
  if (!orderId) return json({ error: 'Falta orderId' }, 400);

  const merchantId   = Deno.env.get('AZUL_MERCHANT_ID');
  const authKey      = Deno.env.get('AZUL_AUTH_KEY');
  const env          = (Deno.env.get('AZUL_ENV') || 'test').toLowerCase();
  const merchantName = Deno.env.get('AZUL_MERCHANT_NAME') || 'PLATA TECH SOLUTIONS';
  const merchantType = Deno.env.get('AZUL_MERCHANT_TYPE') || 'ECommerce';
  const currency     = Deno.env.get('AZUL_CURRENCY') || '$';
  const supaUrl      = Deno.env.get('SUPABASE_URL');
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!merchantId || !authKey || !supaUrl || !serviceKey) {
    console.error('Faltan secrets AZUL/Supabase');
    return json({ error: 'Configuración incompleta del servidor' }, 500);
  }

  // ── Leer el total autoritativo desde la BD (nunca confiar en el cliente) ──
  const res = await fetch(
    `${supaUrl}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=id,totals,status`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!res.ok) { console.error('Supabase read error', await res.text()); return json({ error: 'No se pudo leer la orden' }, 502); }
  const rows = await res.json();
  const order = Array.isArray(rows) ? rows[0] : null;
  if (!order) return json({ error: 'Orden no encontrada' }, 404);

  if (order.status === 'pagado') return json({ error: 'La orden ya está pagada' }, 409);

  const total = Number(order?.totals?.total || 0);
  if (!(total > 0)) return json({ error: 'Total inválido' }, 400);

  // A dónde vuelve el cliente. Por defecto, directo a la Edge Function
  // azul-callback. Si Azul exige que las URLs de retorno empiecen con nuestro
  // dominio (como el logo), poner AZUL_RETURN_BASE=https://platatechs.com/shop/azul-retorno.html:
  // esa página reenvía el querystring tal cual a azul-callback.
  const returnBase = Deno.env.get('AZUL_RETURN_BASE') || `${supaUrl}/functions/v1/azul-callback`;
  const sep = returnBase.includes('?') ? '&' : '?';
  const back = (src: string) => `${returnBase}${sep}src=${src}&n=${encodeURIComponent(orderId)}`;

  const fields = await buildSaleFields({
    merchantId, merchantName, merchantType, currency,
    orderNumber: orderId,
    total,
    // ITBIS incluido en el total (el carrito lo calcula al 18% para tarjeta).
    itbis: Number(order?.totals?.itbis || 0),
    approvedUrl: back('approved'),
    declinedUrl: back('declined'),
    cancelUrl: back('cancel'),
    // Azul (23-nov-2026): el logo debe estar publicado en nuestro dominio.
    logoUrl: Deno.env.get('AZUL_LOGO_URL') || 'https://platatechs.com/images/logo-platatech.png',
    saveToDataVault: false, // la tienda no guarda tarjetas
  }, authKey);

  return json({ url: PAGE_URLS[env] || PAGE_URLS.test, fields });

  function json(obj: unknown, status = 200) {
    return new Response(JSON.stringify(obj), {
      status, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
}

if (import.meta.main) serve(handler);

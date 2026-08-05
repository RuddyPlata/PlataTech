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
// AuthHash (verificado contra el ejemplo oficial de AZUL, "Ejemplo Calculo Hash SALE"):
//   mensaje = concatenación de HASH_FIELDS (en orden) + AuthKey (la llave NO viaja
//   en el POST), codificado en UTF-8, y luego HMAC-SHA512 con clave = AuthKey.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const PAGE_URLS: Record<string, string> = {
  test: 'https://pruebas.azul.com.do/PaymentPage/',
  prod: 'https://pagos.azul.com.do/PaymentPage/',
};

// Orden EXACTO de los campos que entran en el AuthHash (Payment Page).
const HASH_FIELDS = [
  'MerchantId', 'MerchantName', 'MerchantType', 'CurrencyCode', 'OrderNumber',
  'Amount', 'ITBIS', 'ApprovedUrl', 'DeclinedUrl', 'CancelUrl',
  'UseCustomField1', 'CustomField1Label', 'CustomField1Value',
  'UseCustomField2', 'CustomField2Label', 'CustomField2Value',
];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

// HMAC-SHA512 hex. La clave siempre en UTF-8; el mensaje se pasa ya en bytes.
async function hmacSha512Hex(keyStr: string, msgBytes: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(keyStr), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, msgBytes));
}

// AZUL: montos como entero de centavos (toFixed(2) sin el punto). 150.00 -> "15000", 0 -> "000".
const fixedString = (n: number) => n.toFixed(2).replace('.', '');

serve(async (req: Request) => {
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

  const total = Number(order?.totals?.total || 0);
  if (!(total > 0)) return json({ error: 'Total inválido' }, 400);

  const fnBase = `${supaUrl}/functions/v1/azul-callback`;
  const params: Record<string, string> = {
    MerchantId:        merchantId,
    MerchantName:      merchantName,
    MerchantType:      merchantType,
    CurrencyCode:      currency,
    OrderNumber:       orderId,
    Amount:            fixedString(total),
    ITBIS:             '000', // Informativo; no cambia lo cobrado (comprobante no fiscal).
    ApprovedUrl:       `${fnBase}?src=approved&n=${encodeURIComponent(orderId)}`,
    DeclinedUrl:       `${fnBase}?src=declined&n=${encodeURIComponent(orderId)}`,
    CancelUrl:         `${fnBase}?src=cancel&n=${encodeURIComponent(orderId)}`,
    UseCustomField1:   '0',
    CustomField1Label: '',
    CustomField1Value: '',
    UseCustomField2:   '0',
    CustomField2Label: '',
    CustomField2Value: '',
    // Campos que se POSTean pero NO entran en el AuthHash:
    TrxType:           'Sale',
    SaveToDataVault:   '0',
  };

  // mensaje = valores de HASH_FIELDS + AuthKey (UTF-8) → HMAC-SHA512(clave=AuthKey)
  const msg = HASH_FIELDS.map((f) => params[f] ?? '').join('') + authKey;
  params.AuthHash = await hmacSha512Hex(authKey, new TextEncoder().encode(msg));

  return json({ url: PAGE_URLS[env] || PAGE_URLS.test, fields: params });

  function json(obj: unknown, status = 200) {
    return new Response(JSON.stringify(obj), {
      status, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});

// Supabase Edge Function — send-discount-code
// Triggered by a Database Webhook on INSERT to `crm_discount_codes`.
// If the visitor left an email, sends them their 5% code.
//
// Environment variables (same as notify-order):
//   RESEND_API_KEY, FROM_EMAIL
// Provided by Supabase automatically:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const RESEND_URL = 'https://api.resend.com/emails';
const SHOP_URL   = 'https://platatechs.com/shop/';
const WA_URL     = 'https://wa.me/18494950959';
const C_NAVY     = '#0a1a3e';
const C_BLUE     = '#1e50d4';

const esc = (s: unknown) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const fmtDate = (d: unknown) => new Date(String(d)).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santo_Domingo' });

serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body: { type?: string; record?: Record<string, unknown> };
  try { body = await req.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }

  const rec = body.record;
  const to  = String(rec?.contact_email ?? '').trim();
  if (body.type !== 'INSERT' || !rec?.code || !to) return new Response('ignored', { status: 200 });

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('FROM_EMAIL') ?? 'Plata Tech <ordenes@platatechs.com>';
  const sbUrl     = Deno.env.get('SUPABASE_URL');
  const sbKey     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!resendKey || !sbUrl || !sbKey) {
    console.error('[send-discount-code] faltan variables de entorno');
    return new Response('missing env', { status: 500 });
  }

  const res = await fetch(`${sbUrl}/rest/v1/crm_clients?id=eq.${encodeURIComponent(String(rec.client_id))}&select=name`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
  });
  const client = res.ok ? (await res.json())[0] ?? {} : {};
  const first  = String(client.name ?? '').split(' ')[0];

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:24px 8px;background:#f0f2f5;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden">
  <tr><td style="background:${C_NAVY};padding:22px 26px">
    <p style="margin:0;color:rgba(255,255,255,.6);font-size:12px;letter-spacing:.08em;text-transform:uppercase">Plata Tech Solutions</p>
    <h1 style="margin:6px 0 0;color:#fff;font-size:20px">${first ? esc(first) + ', aquí' : 'Aquí'} está tu ${esc(rec.percent ?? 5)}% de descuento</h1>
  </td></tr>
  <tr><td style="padding:24px 26px;color:#111827;font-size:15px;line-height:1.6">
    <p style="margin:0 0 14px">Usa este código en tu próxima compra en la tienda (artículos de menos de RD$15,000) o en cualquier servicio de Plata Tech (cámaras, alarmas, portones, software o reparación de celulares):</p>
    <p style="margin:0 0 6px;text-align:center"><span style="display:inline-block;font-family:Consolas,monospace;font-size:26px;font-weight:700;letter-spacing:.12em;color:${C_NAVY};background:#eef2ff;border:2px dashed ${C_BLUE};border-radius:10px;padding:12px 22px">${esc(rec.code)}</span></p>
    <p style="margin:0 0 20px;text-align:center;color:#6b7280;font-size:13px">Vale hasta el ${esc(fmtDate(rec.expires_at))} · un solo uso</p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto"><tr>
      <td style="padding-right:8px"><a href="${SHOP_URL}" style="display:inline-block;background:${C_BLUE};color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 18px;border-radius:9px">Ir a la tienda</a></td>
      <td><a href="${WA_URL}?text=${encodeURIComponent('Hola, tengo el código ' + rec.code + ' y quiero cotizar')}" style="display:inline-block;background:#25d366;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 18px;border-radius:9px">Cotizar por WhatsApp</a></td>
    </tr></table>
    <p style="margin:22px 0 0;color:#9ca3af;font-size:12px">Recibes este correo porque pediste tu código en platatechs.com. Si no quieres recibir más ofertas, responde a este correo con la palabra BAJA.</p>
  </td></tr>
</table></body></html>`;

  const sent = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromEmail, to: [to], subject: `Tu código de ${rec.percent ?? 5}% en Plata Tech: ${rec.code}`, html }),
  });
  if (!sent.ok) {
    console.error('[send-discount-code] resend error', sent.status, await sent.text());
    return new Response('email failed', { status: 502 });
  }
  return new Response('ok', { status: 200 });
});

// Supabase Edge Function — notify-order
// Triggered by a Database Webhook on INSERT to the `orders` table.
// Sends:
//   1. Email to store owner (internal notification)
//   2. Email to customer (order confirmation)
//
// Environment variables (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY  — re_xxxxxxxxxxxx
//   OWNER_EMAIL     — store owner email
//   FROM_EMAIL      — verified sender, e.g. "Plata Tech <ordenes@platatechs.com>"

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const RESEND_URL = 'https://api.resend.com/emails';

serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body: { record?: Record<string, unknown> };
  try { body = await req.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }

  const r = body.record;
  if (!r) return new Response('No record', { status: 400 });

  const customer  = r.customer  as { name?: string; email?: string; phone?: string; address?: string; sector?: string; notes?: string } | undefined;
  const items     = r.items     as Array<{ name: string; qty: number; subtotal: number; variant?: string }> | undefined;
  const totals    = r.totals    as { subtotal?: number; itbis?: number; total?: number } | undefined;
  const method    = r.payment_method as string | undefined;
  const mode      = r.codelivery_mode as string | undefined;

  const fmt = (n: number) => `RD$${Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
  const payLabel = method === 'online' ? 'PayPal / Tarjeta (pagado online)' : mode === 'transferencia' ? 'Transferencia al recibir' : 'Efectivo al recibir';
  const sla = method === 'online' ? '1 a 3 días laborables' : 'El mismo día (máx 24 h)';

  const itemsHtml = (items ?? []).map(i =>
    `<tr>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0">${i.qty}x ${i.name}${i.variant ? ` <span style="color:#666">(${i.variant})</span>` : ''}</td>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;text-align:right;white-space:nowrap">${fmt(i.subtotal)}</td>
    </tr>`
  ).join('');

  const itbisRow = (totals?.itbis ?? 0) > 0
    ? `<tr><td>ITBIS (18%)</td><td style="text-align:right">${fmt(totals!.itbis!)}</td></tr>`
    : '';

  const paypalRow = r.paypal_order_id
    ? `<p style="margin:12px 0 0;font-size:13px;color:#666">PayPal ID: <code style="background:#f0f0f0;padding:2px 6px;border-radius:4px">${r.paypal_order_id}</code> · Cobrado: US$${r.paypal_amount_usd}</p>`
    : '';

  const LOGO_PT = 'https://platatechs.com/images/logo-platatech.png';
  const LOGO_UG = 'https://platatechs.com/images/logo-ug.png';

  // Brand colors from the website
  const C_NAVY = '#0a1a3e';
  const C_BLUE = '#1e50d4';
  const C_GOLD = '#d4a24a';
  const C_GREEN = '#25d366';

  const brandHeader = (title: string, subtitle: string) => `<tr><td style="background:${C_NAVY};padding:0">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="80" style="padding:24px 0 24px 28px;vertical-align:middle">
        <img src="${LOGO_PT}" alt="Plata Tech" width="64" height="64" style="display:block;border-radius:14px;border:2px solid rgba(255,255,255,.15)"/>
      </td>
      <td style="padding:24px 28px 24px 18px;vertical-align:middle">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:800;line-height:1.3">${title}</h1>
        <p style="margin:5px 0 0;color:rgba(255,255,255,.65);font-size:13px">${subtitle}</p>
      </td>
    </tr></table>
  </td></tr>`;

  const brandFooter = `<tr><td style="background:${C_NAVY};padding:24px 28px;text-align:center">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="text-align:center;padding-bottom:14px">
        <img src="${LOGO_PT}" alt="Plata Tech" width="36" height="36" style="display:inline-block;border-radius:8px;margin-right:10px;vertical-align:middle"/>
        <img src="${LOGO_UG}" alt="UG" width="36" height="36" style="display:inline-block;border-radius:8px;vertical-align:middle"/>
      </td>
    </tr><tr>
      <td style="color:rgba(255,255,255,.55);font-size:11px;line-height:1.7">
        <strong style="color:rgba(255,255,255,.85)">Plata Tech Solutions S.R.L.</strong><br/>
        Santo Domingo, República Dominicana<br/>
        <a href="https://platatechs.com" style="color:${C_GOLD};text-decoration:none">platatechs.com</a> · <a href="https://wa.me/18494950959" style="color:${C_GREEN};text-decoration:none">WhatsApp</a>
      </td>
    </tr></table>
  </td></tr>`;

  // ── Owner notification email ─────────────────────────────────────────────
  const ownerHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:24px 8px">
<tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">
  ${brandHeader('Nueva orden recibida', `Plata Tech Store · ${r.id}`)}
  <tr><td style="padding:28px 32px">
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      <tr><td style="padding:4px 0"><strong>Cliente</strong></td><td style="padding:4px 0;text-align:right">${customer?.name ?? '—'}</td></tr>
      <tr><td style="padding:4px 0"><strong>Email</strong></td><td style="padding:4px 0;text-align:right">${customer?.email ?? '—'}</td></tr>
      <tr><td style="padding:4px 0"><strong>Teléfono</strong></td><td style="padding:4px 0;text-align:right">${customer?.phone ?? '—'}</td></tr>
      <tr><td style="padding:4px 0"><strong>Dirección</strong></td><td style="padding:4px 0;text-align:right">${customer?.address ?? '—'}, ${customer?.sector ?? ''}</td></tr>
      ${customer?.notes ? `<tr><td style="padding:4px 0"><strong>Notas</strong></td><td style="padding:4px 0;text-align:right">${customer.notes}</td></tr>` : ''}
      <tr><td style="padding:4px 0"><strong>Pago</strong></td><td style="padding:4px 0;text-align:right">${payLabel}</td></tr>
      <tr><td style="padding:4px 0"><strong>Entrega</strong></td><td style="padding:4px 0;text-align:right">${sla}</td></tr>
    </table>
    <h2 style="font-size:15px;font-weight:700;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #f0f0f0">Artículos</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">${itemsHtml}</table>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fb;border-radius:10px;padding:14px 16px">
      <tr><td>Subtotal</td><td style="text-align:right">${fmt(totals?.subtotal ?? 0)}</td></tr>
      ${itbisRow}
      <tr style="font-weight:800;font-size:17px"><td style="padding-top:10px">Total</td><td style="padding-top:10px;text-align:right;color:${C_BLUE}">${fmt(totals?.total ?? 0)}</td></tr>
    </table>
    ${paypalRow}
    <div style="margin-top:28px;text-align:center">
      <a href="https://platatechs.com/shop/ordenes.html" style="display:inline-block;background:${C_BLUE};color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:700;font-size:14px">Ver panel de órdenes</a>
    </div>
  </td></tr>
  ${brandFooter}
</table></td></tr></table></body></html>`;

  // ── Customer confirmation email ───────────────────────────────────────────
  const customerHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:24px 8px">
<tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">
  ${brandHeader(
    method === 'online' ? '¡Pago recibido!' : '¡Orden confirmada!',
    `Hola ${customer?.name?.split(' ')[0] ?? ''}, gracias por tu compra.`
  )}
  <tr><td style="padding:28px 32px">
    <div style="background:#f0f7ff;border-left:4px solid ${C_BLUE};border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:24px">
      <p style="margin:0;font-size:13px;color:#666;text-transform:uppercase;letter-spacing:.08em">Número de orden</p>
      <p style="margin:4px 0 0;font-size:22px;font-weight:800;color:${C_BLUE};letter-spacing:.02em">${r.id}</p>
    </div>
    <p style="color:#444;line-height:1.6;margin:0 0 24px">
      ${method === 'online'
        ? 'Tu pago fue procesado exitosamente. Un representante te contactará por WhatsApp para coordinar la entrega en <strong>1 a 3 días laborables</strong>.'
        : 'Recibimos tu pedido. Un representante te contactará por WhatsApp al <strong>' + (customer?.phone ?? '') + '</strong> para confirmar y coordinar la entrega <strong>hoy mismo</strong> (máx 24h).'}
    </p>
    <h2 style="font-size:15px;font-weight:700;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #f0f0f0">Tu pedido</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">${itemsHtml}</table>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fb;border-radius:10px;padding:14px 16px;margin-bottom:24px">
      <tr><td style="color:#666">Subtotal</td><td style="text-align:right;color:#666">${fmt(totals?.subtotal ?? 0)}</td></tr>
      ${itbisRow}
      <tr style="font-weight:800;font-size:17px"><td style="padding-top:10px">Total</td><td style="padding-top:10px;text-align:right;color:${C_BLUE}">${fmt(totals?.total ?? 0)}</td></tr>
    </table>
    <h2 style="font-size:15px;font-weight:700;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #f0f0f0">Entrega</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      <tr><td style="padding:4px 0;color:#666">Dirección</td><td style="padding:4px 0;text-align:right">${customer?.address ?? '—'}, ${customer?.sector ?? ''}</td></tr>
      <tr><td style="padding:4px 0;color:#666">Método de pago</td><td style="padding:4px 0;text-align:right">${payLabel}</td></tr>
      <tr><td style="padding:4px 0;color:#666">Tiempo estimado</td><td style="padding:4px 0;text-align:right;font-weight:700;color:#059669">${sla}</td></tr>
    </table>
    <div style="text-align:center;margin-bottom:24px">
      <a href="https://platatechs.com/shop/orden.html?n=${r.id}" style="display:inline-block;background:${C_BLUE};color:#fff;text-decoration:none;padding:13px 32px;border-radius:10px;font-weight:700;font-size:15px">Ver mi orden</a>
    </div>
    <p style="font-size:13px;color:#888;text-align:center;line-height:1.6">¿Tienes alguna pregunta? Escríbenos por <a href="https://wa.me/18494950959" style="color:${C_BLUE}">WhatsApp</a> mencionando tu número de orden <strong>${r.id}</strong>.</p>
  </td></tr>
  ${brandFooter}
</table></td></tr></table></body></html>`;

  const resendKey  = Deno.env.get('RESEND_API_KEY');
  const ownerEmail = Deno.env.get('OWNER_EMAIL');
  const fromEmail  = Deno.env.get('FROM_EMAIL') ?? 'Plata Tech <ordenes@platatechs.com>';

  if (!resendKey || !ownerEmail) {
    console.error('Missing RESEND_API_KEY or OWNER_EMAIL');
    return new Response('Missing env vars', { status: 500 });
  }

  const sendEmail = async (to: string, subject: string, html: string) => {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to: [to], subject, html })
    });
    if (!res.ok) console.error('Resend error to', to, await res.text());
    return res.ok;
  };

  const fmt2 = (n: number) => `RD$${Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;

  // Send both emails (don't await sequentially — fan out)
  const [ownerOk, customerOk] = await Promise.all([
    sendEmail(
      ownerEmail,
      `Nueva orden ${r.id} — ${customer?.name ?? 'cliente'} · ${fmt2(totals?.total ?? 0)}`,
      ownerHtml
    ),
    customer?.email
      ? sendEmail(
          customer.email,
          `Tu orden ${r.id} en Plata Tech — ${method === 'online' ? 'Pago confirmado' : 'Recibida'}`,
          customerHtml
        )
      : Promise.resolve(true)
  ]);

  return new Response(JSON.stringify({ ok: true, ownerOk, customerOk, order: r.id }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

// Supabase Edge Function — notify-lead
// Triggered by a Database Webhook on INSERT to the `crm_opportunities` table.
// Sends the owner an email with the new lead and a one-tap WhatsApp link.
//
// Environment variables (same as notify-order):
//   RESEND_API_KEY, OWNER_EMAIL, FROM_EMAIL
// Provided by Supabase automatically:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const RESEND_URL = 'https://api.resend.com/emails';
const CRM_URL    = 'https://platatechs.com/crm/';
const C_NAVY     = '#0a1a3e';
const C_BLUE     = '#1e50d4';
const C_GREEN    = '#25d366';

const LINE_LABELS: Record<string, string> = {
  seguridad: 'Seguridad',
  software:  'Software a medida',
  celulares: 'Celulares · UltimoGadget',
  aliado:    'Servicio con aliado',
};

const fmt = (n: unknown) => `RD$${Number(n).toLocaleString('es-DO', { maximumFractionDigits: 0 })}`;
const esc = (s: unknown) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

// Dominican numbers are stored however the visitor typed them; wa.me needs 1 + 10 digits.
const waNumber = (phone: unknown) => {
  const d = String(phone ?? '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `1${d}` : '';
};

const row = (label: string, value: string) => value ? `<tr>
  <td style="padding:6px 0;color:#6b7280;font-size:13px;width:130px;vertical-align:top">${esc(label)}</td>
  <td style="padding:6px 0;font-size:14px;color:#111827">${value}</td>
</tr>` : '';

serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body: { type?: string; record?: Record<string, unknown> };
  try { body = await req.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }

  const opp = body.record;
  if (body.type !== 'INSERT' || !opp?.client_id) return new Response('ignored', { status: 200 });

  const resendKey  = Deno.env.get('RESEND_API_KEY');
  const ownerEmail = Deno.env.get('OWNER_EMAIL');
  const fromEmail  = Deno.env.get('FROM_EMAIL') ?? 'Plata Tech <ordenes@platatechs.com>';
  const sbUrl      = Deno.env.get('SUPABASE_URL');
  const sbKey      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!resendKey || !ownerEmail || !sbUrl || !sbKey) {
    console.error('[notify-lead] faltan variables de entorno');
    return new Response('missing env', { status: 500 });
  }

  const res = await fetch(`${sbUrl}/rest/v1/crm_clients?id=eq.${encodeURIComponent(String(opp.client_id))}&select=*`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
  });
  const client = res.ok ? (await res.json())[0] ?? {} : {};

  const line    = LINE_LABELS[String(opp.line)] ?? String(opp.line);
  const details = (opp.details ?? {}) as Record<string, unknown>;
  const source  = (client.source ?? {}) as Record<string, unknown>;
  const wa      = waNumber(client.phone);
  const greeting = encodeURIComponent(`Hola ${String(client.name ?? '').split(' ')[0]}, te escribe Ruddy de Plata Tech. Recibimos tu solicitud de "${opp.title}". ¿Cuándo te queda bien que conversemos?`);

  const detailRows = Object.entries(details)
    .filter(([, v]) => v !== null && v !== '' && typeof v !== 'object')
    .map(([k, v]) => row(k.replace(/_/g, ' '), esc(v)))
    .join('');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:24px 8px;background:#f0f2f5;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden">
  <tr><td style="background:${C_NAVY};padding:22px 26px">
    <p style="margin:0;color:rgba(255,255,255,.6);font-size:12px;letter-spacing:.08em;text-transform:uppercase">${esc(line)}</p>
    <h1 style="margin:6px 0 0;color:#fff;font-size:20px">Nuevo cliente: ${esc(client.name)}</h1>
  </td></tr>
  <tr><td style="padding:22px 26px">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${row('Pide', esc(opp.title))}
      ${opp.value ? row('Valor estimado', fmt(opp.value)) : ''}
      ${row('Teléfono', esc(client.phone))}
      ${row('Correo', esc(client.email))}
      ${row('Sector', esc(client.sector))}
      ${detailRows}
      ${row('Vino de', esc([source.utm_source, source.utm_campaign].filter(Boolean).join(' · ')))}
    </table>
    <table cellpadding="0" cellspacing="0" style="margin-top:20px"><tr>
      ${wa ? `<td style="padding-right:10px"><a href="https://wa.me/${wa}?text=${greeting}" style="display:inline-block;background:${C_GREEN};color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 18px;border-radius:9px">Escribirle por WhatsApp</a></td>` : ''}
      <td><a href="${CRM_URL}" style="display:inline-block;background:${C_BLUE};color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 18px;border-radius:9px">Abrir en el CRM</a></td>
    </tr></table>
  </td></tr>
</table></body></html>`;

  const sent = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromEmail, to: [ownerEmail], subject: `Nuevo cliente · ${line} · ${client.name ?? ''}`, html }),
  });
  if (!sent.ok) {
    console.error('[notify-lead] resend error', sent.status, await sent.text());
    return new Response('email failed', { status: 502 });
  }
  return new Response('ok', { status: 200 });
});

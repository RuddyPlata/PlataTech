// Supabase Edge Function — notify-status
// Triggered by a Database Webhook on UPDATE to the `orders` table.
// Sends status update email to customer.
// When status = 'entregado', also sends the feedback request email.
//
// Same env vars as notify-order:
//   RESEND_API_KEY, OWNER_EMAIL, FROM_EMAIL

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const RESEND_URL = 'https://api.resend.com/emails';

const STATUS_LABELS: Record<string, string> = {
  confirmado:  'Orden confirmada',
  preparando:  'Preparando tu pedido',
  'en camino': 'Tu pedido va en camino',
  entregado:   '¡Tu pedido llegó!',
  cancelado:   'Orden cancelada',
};

const STATUS_COLOR: Record<string, string> = {
  confirmado:  '#1447ff',
  preparando:  '#7c3aed',
  'en camino': '#d97706',
  entregado:   '#059669',
  cancelado:   '#dc2626',
};

serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body: { record?: Record<string, unknown>; old_record?: Record<string, unknown> };
  try { body = await req.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }

  const r   = body.record;
  const old = body.old_record;
  if (!r) return new Response('No record', { status: 400 });

  const status   = (r.status as string ?? '').toLowerCase();
  const oldStatus = (old?.status as string ?? '').toLowerCase();

  // Skip if status didn't change or no customer email
  const customer = r.customer as { name?: string; email?: string; phone?: string } | undefined;
  if (status === oldStatus || !customer?.email) {
    return new Response(JSON.stringify({ skipped: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('FROM_EMAIL') ?? 'Plata Tech <ordenes@platatechs.com>';
  if (!resendKey) return new Response('Missing RESEND_API_KEY', { status: 500 });

  const sendEmail = async (to: string, subject: string, html: string) => {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to: [to], subject, html })
    });
    if (!res.ok) console.error('Resend error', await res.text());
    return res.ok;
  };

  const label = STATUS_LABELS[status] ?? `Estado: ${status}`;
  const color = STATUS_COLOR[status] ?? '#1447ff';
  const firstName = customer.name?.split(' ')[0] ?? '';

  // ── Status update messages ────────────────────────────────────────────────
  const statusMessages: Record<string, string> = {
    confirmado:  `Hola ${firstName}, confirmamos tu pedido <strong>${r.id}</strong>. Estamos verificando disponibilidad y pronto te contactamos para coordinar la entrega.`,
    preparando:  `Tu pedido <strong>${r.id}</strong> está siendo preparado. En breve sale para entregarte.`,
    'en camino': `¡Tu pedido <strong>${r.id}</strong> está en camino! Nuestro representante se dirige a <strong>${(r.customer as { address?: string })?.address ?? 'tu dirección'}</strong>. Mantén tu teléfono a mano.`,
    entregado:   `¡Tu pedido <strong>${r.id}</strong> fue entregado! Esperamos que estés disfrutando tu compra. Nos encantaría conocer tu experiencia.`,
    cancelado:   `Tu pedido <strong>${r.id}</strong> fue cancelado. Si tienes alguna pregunta, contáctanos por WhatsApp al <a href="https://wa.me/18494950959" style="color:#1447ff">849-495-0959</a>.`,
  };

  const bodyMsg = statusMessages[status] ?? `El estado de tu pedido <strong>${r.id}</strong> cambió a <strong>${status}</strong>.`;

  const feedbackSection = status === 'entregado' ? `
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:20px 24px;margin:24px 0;text-align:center">
      <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#059669">¿Cómo fue tu experiencia?</p>
      <p style="margin:0 0 16px;font-size:13px;color:#555">Tu opinión nos ayuda a mejorar. Solo toma 1 minuto.</p>
      <a href="https://platatechs.com/shop/feedback.html?order=${r.id}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:11px 28px;border-radius:10px;font-weight:700;font-size:14px">Dejar mi opinión</a>
    </div>` : '';

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f6f8fb;font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fb;padding:32px 0">
<tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">
  <tr><td style="background:${color};padding:28px 32px">
    <p style="margin:0 0 8px;color:rgba(255,255,255,.7);font-size:12px;text-transform:uppercase;letter-spacing:.1em">Plata Tech Store · ${r.id}</p>
    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:800">${label}</h1>
  </td></tr>
  <tr><td style="padding:28px 32px">
    <p style="color:#444;line-height:1.65;font-size:15px;margin:0 0 20px">${bodyMsg}</p>
    ${feedbackSection}
    <div style="text-align:center;margin-bottom:24px">
      <a href="https://platatechs.com/shop/orden.html?n=${r.id}" style="display:inline-block;background:#1447ff;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:700;font-size:14px">Ver detalles de mi orden</a>
    </div>
    <p style="font-size:13px;color:#888;text-align:center">¿Tienes preguntas? <a href="https://wa.me/18494950959" style="color:#1447ff">Escríbenos por WhatsApp</a></p>
  </td></tr>
  <tr><td style="background:#f6f8fb;padding:18px 32px;text-align:center;font-size:12px;color:#999">Plata Tech Solutions · Santo Domingo, RD</td></tr>
</table></td></tr></table>
</body></html>`;

  await sendEmail(customer.email, `${label} · Plata Tech #${r.id}`, html);

  return new Response(JSON.stringify({ ok: true, status, order: r.id }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

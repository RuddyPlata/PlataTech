#!/usr/bin/env node
/* ============================================================
   Plata Tech — CRM desde la terminal (para Claude Code)
   ------------------------------------------------------------
   Lee y escribe en las mismas tablas que el panel /crm/, con
   una cuenta de administrador, asi que aplica la misma
   seguridad (RLS). Sin dependencias: Node 18+.

   Variables de entorno:
     CRM_EMAIL, CRM_PASSWORD        cuenta admin del CRM (obligatorias)
     CRM_SUPABASE_URL               por defecto, el proyecto de la tienda
     CRM_SUPABASE_ANON_KEY          llave publica (anon) de ese proyecto

   Uso:  node scripts/crm.mjs <comando> [argumentos]   (ver "ayuda")
   ============================================================ */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL_ = process.env.CRM_SUPABASE_URL || 'https://ieltuoriwgfckdfbwziu.supabase.co';
const KEY = process.env.CRM_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllbHR1b3Jpd2dmY2tkZmJ3eml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0Mjk2MjYsImV4cCI6MjA5MzAwNTYyNn0.HfytGHemYOiRu4NMD0Majzy91vB1fJX_wUURpq-qORk';
const CACHE = path.join(os.homedir(), '.cache', 'platatech-crm', 'session.json');

const LINES = ['seguridad', 'software', 'celulares', 'aliado'];
const STAGES = ['nuevo', 'contactado', 'visita', 'cotizado', 'ganado', 'perdido'];
const KINDS = ['nota', 'whatsapp', 'llamada', 'visita'];
const METHODS = ['transferencia', 'efectivo', 'tarjeta', 'cheque', 'otro'];

/* ── Utilidades ──────────────────────────────────────────── */
class UserError extends Error {}
const die = msg => { throw new UserError(msg); };
const money = n => 'RD$' + Number(n || 0).toLocaleString('es-DO', { maximumFractionDigits: 2 });
const short = id => String(id || '').slice(0, 8);
const digits = p => String(p || '').replace(/\D/g, '').slice(-10);
const day = d => d ? String(d).slice(0, 10) : '—';
function ago(ts) {
  const h = (Date.now() - new Date(ts)) / 36e5;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} días`;
}

function parseArgs(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) opt[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) opt[k] = argv[++i];
      else opt[k] = true;
    } else pos.push(a);
  }
  return { pos, opt };
}

/* ── Sesion (login admin, se guarda hasta que vence) ─────── */
async function token() {
  try {
    const s = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    if (s.url === URL_ && s.expires_at * 1000 > Date.now() + 60e3) return s.access_token;
  } catch { /* sin cache: login */ }
  const email = process.env.CRM_EMAIL, password = process.env.CRM_PASSWORD;
  if (!email || !password) die('Faltan CRM_EMAIL y CRM_PASSWORD (cuenta admin del CRM) en las variables de entorno.');
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const s = await r.json().catch(() => ({}));
  if (!r.ok) die(`No se pudo entrar al CRM: ${s.error_description || s.msg || r.status}`);
  const meta = s.user?.app_metadata || {};
  if (meta.is_admin !== true && meta.is_admin !== 'true') die('Esa cuenta no es administradora del CRM.');
  fs.mkdirSync(path.dirname(CACHE), { recursive: true, mode: 0o700 });
  fs.writeFileSync(CACHE, JSON.stringify({ url: URL_, access_token: s.access_token, expires_at: s.expires_at }), { mode: 0o600 });
  return s.access_token;
}

async function api(method, pathQ, body, extraHeaders = {}) {
  const t = await token();
  const r = await fetch(`${URL_}/rest/v1/${pathQ}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) {
    if (data?.code === '42P01' || data?.code === 'PGRST205') die('Las tablas del CRM no existen todavía. Corre supabase/migrations/20261021000000_crm_fase_1.sql en Supabase.');
    die(data?.message || `Error ${r.status}`);
  }
  return data;
}
const get = q => api('GET', q);

/* ── Busquedas ───────────────────────────────────────────── */
async function findClient(ref) {
  if (!ref) die('Indica el cliente: nombre, teléfono o id.');
  const d = digits(ref);
  const all = await get('crm_clients?select=*&order=created_at.desc');
  let hits = all.filter(c => c.id.startsWith(ref));
  if (!hits.length && d.length >= 7) hits = all.filter(c => (c.phone_norm || '').endsWith(d.slice(-7)));
  if (!hits.length) {
    const q = ref.toLowerCase();
    hits = all.filter(c => [c.name, c.company].some(v => (v || '').toLowerCase().includes(q)));
    // "juan" debe preferir a "Juan Colmado" antes que a "Juana Pérez".
    const word = new RegExp(`(^|\\s)${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i');
    const exact = hits.filter(c => [c.name, c.company].some(v => word.test(v || '')));
    if (exact.length) hits = exact;
  }
  if (!hits.length) die(`No encontré ningún cliente con "${ref}".`);
  if (hits.length > 1) die(`Hay ${hits.length} clientes que coinciden con "${ref}":\n` + hits.slice(0, 10).map(c => `  ${short(c.id)}  ${c.name}  ${c.phone || ''}`).join('\n') + '\nUsa el id o el teléfono.');
  return hits[0];
}

async function findOpp(ref, client) {
  const opps = await get('crm_opportunities?select=*&order=created_at.desc');
  if (ref) {
    const o = opps.find(x => x.id.startsWith(ref));
    if (!o) die(`No encontré la oportunidad ${ref}.`);
    return o;
  }
  const open = opps.filter(o => o.client_id === client.id && !['ganado', 'perdido'].includes(o.stage));
  if (open.length === 1) return open[0];
  if (!open.length) return null;
  die(`${client.name} tiene ${open.length} oportunidades abiertas. Indica cuál con --opp:\n` + open.map(o => `  ${short(o.id)}  ${o.line}  ${o.title}  (${o.stage})`).join('\n'));
}

const logAct = (client_id, opportunity_id, kind, body) =>
  api('POST', 'crm_activities', { client_id, opportunity_id: opportunity_id || null, kind, body });

/* ── Comandos ────────────────────────────────────────────── */
const commands = {
  async resumen() {
    const [opps, inv] = await Promise.all([get('crm_opportunities?select=line,stage,value'), get('crm_invoice_balances?select=status,balance,due_date')]);
    const open = opps.filter(o => !['ganado', 'perdido'].includes(o.stage));
    const today = new Date().toISOString().slice(0, 10);
    const due = inv.filter(i => i.status !== 'anulada' && Number(i.balance) > 0);
    console.log(`Nuevos sin contactar: ${opps.filter(o => o.stage === 'nuevo').length}`);
    console.log(`Abiertas: ${open.length} · ${money(open.reduce((s, o) => s + Number(o.value || 0), 0))}`);
    for (const l of LINES) {
      const lo = open.filter(o => o.line === l);
      if (lo.length) console.log(`  ${l.padEnd(10)} ${String(lo.length).padStart(3)}  ${money(lo.reduce((s, o) => s + Number(o.value || 0), 0))}`);
    }
    console.log(`Por cobrar: ${money(due.reduce((s, i) => s + Number(i.balance), 0))} en ${due.length} factura(s), ${due.filter(i => i.due_date && i.due_date < today).length} vencida(s)`);
  },

  async nuevos() {
    const opps = await get('crm_opportunities?select=*,crm_clients(name,phone,sector)&stage=eq.nuevo&order=created_at');
    if (!opps.length) return console.log('Nadie esperando respuesta.');
    for (const o of opps) console.log(`${short(o.id)}  hace ${ago(o.created_at).padEnd(8)} ${o.line.padEnd(10)} ${o.crm_clients?.name} (${o.crm_clients?.phone || 'sin tel.'}) · ${o.title}${o.value ? ' · ' + money(o.value) : ''}`);
  },

  async embudo({ opt }) {
    let q = 'crm_opportunities?select=*,crm_clients(name)&stage=not.in.(ganado,perdido)&order=updated_at.desc';
    if (opt.linea) q += `&line=eq.${encodeURIComponent(opt.linea)}`;
    const opps = await get(q);
    for (const s of STAGES.slice(0, 4)) {
      const list = opps.filter(o => o.stage === s);
      if (!list.length) continue;
      console.log(`\n${s.toUpperCase()} (${list.length})`);
      for (const o of list) console.log(`  ${short(o.id)}  ${o.line.padEnd(10)} ${o.crm_clients?.name} · ${o.title}${o.value ? ' · ' + money(o.value) : ''}`);
    }
  },

  async buscar({ pos }) {
    const q = pos.join(' ').toLowerCase(), d = digits(q);
    const all = await get('crm_clients?select=*&order=created_at.desc');
    const hits = all.filter(c => [c.name, c.company, c.sector, c.rnc, c.email].some(v => (v || '').toLowerCase().includes(q)) || (d.length >= 4 && (c.phone_norm || '').includes(d)));
    if (!hits.length) return console.log(`Sin resultados para "${q}".`);
    for (const c of hits.slice(0, 20)) console.log(`${short(c.id)}  ${c.name}${c.company ? ' (' + c.company + ')' : ''}  ${c.phone || ''}  ${c.sector || ''}`);
  },

  async cliente({ pos }) {
    const c = await findClient(pos.join(' '));
    const [opps, quotes, inv, acts] = await Promise.all([
      get(`crm_opportunities?select=*&client_id=eq.${c.id}&order=created_at.desc`),
      get(`quotations?select=number,status,totals,created_at&client_id=eq.${c.id}&order=created_at.desc`),
      get(`crm_invoice_balances?select=number,ncf,total,balance,pay_status,issue_date&client_id=eq.${c.id}&order=created_at.desc`),
      get(`crm_activities?select=kind,body,created_at&client_id=eq.${c.id}&order=created_at.desc&limit=8`)
    ]);
    console.log(`${c.name}${c.company ? ' · ' + c.company : ''}   [${short(c.id)}]`);
    console.log(`Tel: ${c.phone || '—'}  Correo: ${c.email || '—'}  RNC: ${c.rnc || '—'}  Sector: ${c.sector || '—'}`);
    if (c.source?.utm_source) console.log(`Vino de: ${c.source.utm_source}${c.source.utm_campaign ? ' · ' + c.source.utm_campaign : ''}`);
    if (c.notes) console.log(`Notas: ${c.notes}`);
    console.log('\nOportunidades:'); opps.forEach(o => console.log(`  ${short(o.id)}  ${o.line.padEnd(10)} ${o.stage.padEnd(10)} ${o.title}${o.value ? ' · ' + money(o.value) : ''}`)); if (!opps.length) console.log('  ninguna');
    console.log('Cotizaciones:'); quotes.forEach(q => console.log(`  ${q.number}  ${q.status}  ${money(q.totals?.total)}`)); if (!quotes.length) console.log('  ninguna');
    console.log('Facturas:'); inv.forEach(i => console.log(`  ${i.number}  ${i.ncf || 'sin NCF'}  ${money(i.total)}  ${i.pay_status}${Number(i.balance) > 0 ? ' · debe ' + money(i.balance) : ''}`)); if (!inv.length) console.log('  ninguna');
    console.log('Historial reciente:'); acts.forEach(a => console.log(`  ${day(a.created_at)}  ${a.kind.padEnd(8)} ${a.body}`)); if (!acts.length) console.log('  vacío');
  },

  async nuevo({ opt }) {
    const name = opt.nombre, phone = opt.telefono, line = opt.linea, title = opt.que;
    if (!name || !phone || !line || !title) die('Uso: nuevo --nombre "Juan" --telefono 8095551234 --linea seguridad --que "Kit 4 cámaras" [--valor 15990] [--sector "Los Prados"] [--nota "..."]');
    if (!LINES.includes(line)) die(`Línea inválida. Usa: ${LINES.join(', ')}`);
    if (digits(phone).length < 10) die('El teléfono debe tener 10 dígitos.');
    const existing = await get(`crm_clients?select=*&phone_norm=eq.${digits(phone)}`);
    let c = existing[0];
    if (!c) [c] = await api('POST', 'crm_clients', { name, phone, sector: opt.sector || null, email: opt.correo || null, source: { utm_source: 'claude' } });
    const [o] = await api('POST', 'crm_opportunities', { client_id: c.id, line, title, value: opt.valor ? Number(opt.valor) : null });
    await logAct(c.id, o.id, 'sistema', 'Creado desde Claude Code');
    if (opt.nota) await logAct(c.id, o.id, 'nota', String(opt.nota));
    console.log(`${existing[0] ? 'Cliente existente' : 'Cliente nuevo'}: ${c.name} [${short(c.id)}] · oportunidad ${short(o.id)} en ${line} (nuevo)`);
  },

  async etapa({ pos, opt }) {
    const [ref, stage] = pos;
    if (!ref || !STAGES.includes(stage)) die(`Uso: etapa <oportunidad-id | cliente> <${STAGES.join('|')}> [--motivo "..."]`);
    let o;
    try { o = await findOpp(ref); } catch { o = await findOpp(null, await findClient(ref)); }
    if (!o) die('Ese cliente no tiene oportunidades abiertas.');
    const patch = { stage };
    if (['ganado', 'perdido'].includes(stage)) patch.closed_at = o.closed_at || new Date().toISOString();
    if (stage === 'perdido' && opt.motivo) patch.lost_reason = String(opt.motivo);
    await api('PATCH', `crm_opportunities?id=eq.${o.id}`, patch);
    await logAct(o.client_id, o.id, 'sistema', `Etapa: ${o.stage} → ${stage}${opt.motivo ? ' (' + opt.motivo + ')' : ''}`);
    console.log(`${o.title}: ${o.stage} → ${stage}`);
  },

  async nota({ pos, opt }) {
    const [ref, ...rest] = pos;
    const text = rest.join(' ').trim();
    const kind = opt.tipo || 'nota';
    if (!ref || !text) die('Uso: nota <cliente> "texto" [--tipo nota|whatsapp|llamada|visita] [--opp id]');
    if (!KINDS.includes(kind)) die(`Tipo inválido. Usa: ${KINDS.join(', ')}`);
    const c = await findClient(ref);
    const o = opt.opp ? await findOpp(opt.opp) : await findOpp(null, c).catch(() => null);
    await logAct(c.id, o?.id, kind, text);
    if (o && o.stage === 'nuevo' && kind !== 'nota') {
      await api('PATCH', `crm_opportunities?id=eq.${o.id}`, { stage: 'contactado' });
      console.log(`(${o.title} pasó a contactado)`);
    }
    console.log(`Anotado en ${c.name}: [${kind}] ${text}`);
  },

  async cotizaciones({ opt }) {
    let q = 'quotations?select=id,number,status,client,totals,created_at&order=created_at.desc&limit=30';
    if (opt.estado) q += `&status=eq.${encodeURIComponent(opt.estado)}`;
    const list = await get(q);
    for (const x of list) console.log(`${x.number}  ${x.status.padEnd(9)} ${money(x.totals?.total).padStart(12)}  ${x.client?.name || ''}  ${day(x.created_at)}`);
    if (!list.length) console.log('Sin cotizaciones.');
  },

  async 'por-cobrar'() {
    const today = new Date().toISOString().slice(0, 10);
    const list = (await get('crm_invoice_balances?select=*&status=neq.anulada&order=due_date.asc.nullslast')).filter(i => Number(i.balance) > 0);
    if (!list.length) return console.log('Nadie debe nada.');
    for (const i of list) console.log(`${i.number}  ${i.ncf || 'sin NCF'}  ${i.client_snapshot?.name}  debe ${money(i.balance)} de ${money(i.total)}  vence ${day(i.due_date)}${i.due_date && i.due_date < today ? '  VENCIDA' : ''}`);
    console.log(`Total: ${money(list.reduce((s, i) => s + Number(i.balance), 0))}`);
  },

  async pago({ pos, opt }) {
    const [num, amt] = pos;
    const amount = Number(amt);
    const method = opt.metodo || 'transferencia';
    if (!num || !(amount > 0)) die('Uso: pago <FAC-00001 | NCF> <monto> [--metodo transferencia|efectivo|tarjeta|cheque] [--ref "..."]');
    if (!METHODS.includes(method)) die(`Método inválido. Usa: ${METHODS.join(', ')}`);
    const [i] = await get(`crm_invoice_balances?select=*&or=(number.eq.${encodeURIComponent(num)},ncf.eq.${encodeURIComponent(num)})`);
    if (!i) die(`No encontré la factura ${num}.`);
    if (i.status === 'anulada') die('Esa factura está anulada.');
    if (amount > Number(i.balance) + 0.001) die(`El monto pasa del saldo (${money(i.balance)}).`);
    await api('POST', 'crm_payments', { invoice_id: i.id, amount, method, reference: opt.ref || null });
    await logAct(i.client_id, i.opportunity_id, 'sistema', `Pago de ${money(amount)} a ${i.number} (${method})`);
    console.log(`Pago de ${money(amount)} registrado a ${i.number}. Saldo: ${money(Number(i.balance) - amount)}`);
  },

  async facturar({ pos, opt }) {
    const [num] = pos;
    const type = opt.ncf === 'ninguno' ? '' : opt.ncf;
    if (!num || type === undefined || (type && !/^B(01|02|14|15)$/.test(type))) die('Uso: facturar <COT-2026-110> --ncf B01|B02|B14|B15|ninguno [--vence 2026-12-01] --confirmar');
    const [q] = await get(`quotations?select=*&number=eq.${encodeURIComponent(num)}`);
    if (!q) die(`No encontré la cotización ${num}.`);
    if (!q.client_id) die('Esa cotización no está enlazada a un cliente. Facturala desde el panel /crm/, que la enlaza sola.');
    const t = q.totals || {};
    if (!opt.confirmar) {
      return console.log(`Vista previa (no se emitió nada):\n  ${num} · ${q.client?.name} · ${money(t.total)} (ITBIS ${money(t.itbis)}) · comprobante ${type || 'sin NCF'}\nRepite con --confirmar para emitirla.`);
    }
    const id = await api('POST', 'rpc/crm_create_invoice', { p: {
      client_id: q.client_id, opportunity_id: q.opportunity_id || '', quote_id: q.id, emitter: opt.emisor || 'platatech',
      ncf_type: type, due_date: opt.vence || '', items: q.items || [], subtotal: t.subtotal || 0, discounts: t.discounts || 0,
      itbis: t.itbis || 0, total: t.total || 0, notes: q.notes || ''
    } });
    const [inv] = await get(`crm_invoices?select=number,ncf,total&id=eq.${id}`);
    if (q.status !== 'aceptada') await api('PATCH', `quotations?id=eq.${q.id}`, { status: 'aceptada' });
    console.log(`Factura ${inv.number} emitida${inv.ncf ? ' con NCF ' + inv.ncf : ''} por ${money(inv.total)}. Imprímela desde /crm/ → Facturas.`);
  },

  ayuda() {
    console.log(`CRM Plata Tech desde la terminal

  resumen                         Nuevos, embudo por línea y por cobrar
  nuevos                          Clientes esperando respuesta
  embudo [--linea seguridad]      Oportunidades abiertas por etapa
  buscar <texto>                  Buscar cliente por nombre, teléfono, RNC o sector
  cliente <nombre|tel|id>         Ficha completa
  nuevo --nombre --telefono --linea --que [--valor --sector --nota]
  etapa <opp-id|cliente> <etapa> [--motivo]   ${STAGES.join(', ')}
  nota <cliente> "texto" [--tipo whatsapp|llamada|visita] [--opp id]
  cotizaciones [--estado enviada]
  por-cobrar                      Facturas con saldo
  pago <FAC-00001|NCF> <monto> [--metodo efectivo] [--ref "..."]
  facturar <COT-...> --ncf B01|B02|ninguno [--vence AAAA-MM-DD] --confirmar`);
  }
};

/* ── Main ────────────────────────────────────────────────── */
const [cmd, ...rest] = process.argv.slice(2);
const fn = commands[cmd || 'ayuda'];
if (!fn) { console.error(`Comando desconocido: ${cmd}`); commands.ayuda(); process.exit(2); }
try {
  await fn(parseArgs(rest));
} catch (e) {
  if (e instanceof UserError) { console.error(e.message); process.exit(1); }
  throw e;
}

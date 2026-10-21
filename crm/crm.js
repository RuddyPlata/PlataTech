/* ============================================================
   Plata Tech — CRM (Fase 1)
   ------------------------------------------------------------
   Panel privado: embudos por linea de negocio, fichas de
   clientes, cotizaciones (se editan en el admin de la tienda),
   facturas con NCF, pagos y cuentas por cobrar.
   Datos: tablas crm_* en Supabase (ver supabase/migrations).
   ============================================================ */
(function () {
  'use strict';

  const SB = window.SB;
  const esc = window.escapeHtml;

  /* ── Catalogos ─────────────────────────────────────────── */
  const LINES = {
    seguridad: { label: 'Seguridad',  color: 'var(--l-seguridad)' },
    software:  { label: 'Software',   color: 'var(--l-software)' },
    celulares: { label: 'Celulares',  color: 'var(--l-celulares)' },
    aliado:    { label: 'Con aliado', color: 'var(--l-aliado)' }
  };
  const STAGES = [
    { id: 'nuevo',      label: 'Nuevo' },
    { id: 'contactado', label: 'Contactado' },
    { id: 'visita',     label: 'Visita / reunión' },
    { id: 'cotizado',   label: 'Cotizado' },
    { id: 'ganado',     label: 'Ganado' },
    { id: 'perdido',    label: 'Perdido' }
  ];
  const OPEN_STAGES = ['nuevo', 'contactado', 'visita', 'cotizado'];
  const ACT_KINDS = { nota: 'Nota', whatsapp: 'WhatsApp', llamada: 'Llamada', visita: 'Visita', sistema: 'Sistema' };
  const NCF_TYPES = {
    B01: 'Crédito fiscal (B01)',
    B02: 'Consumo (B02)',
    B14: 'Régimen especial (B14)',
    B15: 'Gubernamental (B15)'
  };
  const NCF_TITLES = {
    B01: 'FACTURA DE CRÉDITO FISCAL', B02: 'FACTURA DE CONSUMO',
    B14: 'FACTURA DE RÉGIMEN ESPECIAL', B15: 'FACTURA GUBERNAMENTAL'
  };
  const EMITTERS = {
    platatech:    { label: 'Plata Tech Solutions SRL', logo: '../images/logo-platatech.webp' },
    ultimogadget: { label: 'UltimoGadget',             logo: '../images/logo-ug.webp' },
    personal:     { label: 'Ing. Ruddy Plata',         logo: null }
  };
  const PAY_METHODS = { transferencia: 'Transferencia', efectivo: 'Efectivo', tarjeta: 'Tarjeta (AZUL)', cheque: 'Cheque', otro: 'Otro' };
  const PAY_STATUS = {
    pendiente: { label: 'Pendiente', cls: 'warn' },
    parcial:   { label: 'Abono',     cls: 'warn' },
    pagada:    { label: 'Pagada',    cls: 'ok' },
    anulada:   { label: 'Anulada',   cls: 'bad' }
  };

  /* ── Estado ────────────────────────────────────────────── */
  const S = {
    view: 'resumen', lineFilter: 'todas', clientSearch: '', invFilter: 'todas',
    clients: [], opps: [], acts: [], quotes: [], invoices: [], payments: [], ncf: [], settings: {}
  };
  const byId = (list, id) => list.find(x => x.id === id);
  const clientOf = id => byId(S.clients, id) || { name: '(cliente borrado)' };

  /* ── Formato ───────────────────────────────────────────── */
  const fmtMoney = n => 'RD$' + Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const fmtDate = d => d ? new Date(String(d).length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const addDaysISO = n => { const d = new Date(); d.setDate(d.getDate() + n); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  function ago(ts) {
    const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
    if (m < 60) return `hace ${Math.max(m, 1)} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24);
    return `hace ${d} día${d === 1 ? '' : 's'}`;
  }
  const phoneNorm = p => String(p || '').replace(/\D/g, '').slice(-10);
  const waLink = (phone, text) => {
    const d = phoneNorm(phone);
    return d.length === 10 ? `https://wa.me/1${d}${text ? '?text=' + encodeURIComponent(text) : ''}` : null;
  };
  const firstName = n => String(n || '').trim().split(/\s+/)[0] || '';
  const lineDot = line => `<span class="dot" style="background:${(LINES[line] || LINES.aliado).color}"></span>`;
  const payPill = st => { const p = PAY_STATUS[st] || PAY_STATUS.pendiente; return `<span class="pill ${p.cls}">${p.label}</span>`; };

  function toast(msg, isErr) {
    const t = document.createElement('div');
    t.className = 'toast' + (isErr ? ' err' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), isErr ? 6000 : 2800);
  }
  const fail = (what, error) => { console.error(what, error); toast(`${what}: ${error?.message || 'error desconocido'}`, true); };

  /* ── Datos ─────────────────────────────────────────────── */
  async function loadAll() {
    const q = (t, sel = '*', order = 'created_at') => SB.from(t).select(sel).order(order, { ascending: false });
    const [cl, op, ac, qu, inv, pay, ncf, st] = await Promise.all([
      q('crm_clients'),
      q('crm_opportunities'),
      q('crm_activities').limit(1000),
      q('quotations', 'id,number,created_at,status,client,items,totals,notes,client_id,opportunity_id'),
      q('crm_invoice_balances'),
      q('crm_payments'),
      q('crm_ncf_sequences'),
      SB.from('crm_settings').select('*')
    ]);
    const firstErr = [cl, op, ac, qu, inv, pay, ncf, st].find(r => r.error);
    if (firstErr) {
      if (firstErr.error.code === '42P01') {
        renderMissingTables();
        return false;
      }
      fail('No se pudieron cargar los datos', firstErr.error);
    }
    S.clients = cl.data || []; S.opps = op.data || []; S.acts = ac.data || [];
    S.quotes = qu.data || []; S.invoices = inv.data || []; S.payments = pay.data || [];
    S.ncf = ncf.data || [];
    S.settings = Object.fromEntries((st.data || []).map(r => [r.key, r.value || {}]));
    return true;
  }

  async function logActivity(client_id, opportunity_id, kind, body) {
    const { error } = await SB.from('crm_activities').insert({ client_id, opportunity_id: opportunity_id || null, kind, body });
    if (error) fail('No se guardó la actividad', error);
  }

  function nextQuoteNumber() {
    // Mismo formato que el admin de la tienda: COT-2026-110, COT-2026-111...
    const pfx = 'COT-' + new Date().getFullYear() + '-';
    const nums = S.quotes.map(q => q.number || '').filter(n => n.startsWith(pfx)).map(n => parseInt(n.slice(pfx.length), 10) || 0);
    return pfx + String(Math.max((nums.length ? Math.max(...nums) : 0) + 1, 110)).padStart(3, '0');
  }

  /* ── Navegacion ────────────────────────────────────────── */
  const view = document.getElementById('view');
  const modal = document.getElementById('modal');

  function go(v) {
    S.view = v;
    document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    render();
  }

  function render() {
    updateBadges();
    ({ resumen: renderResumen, embudo: renderEmbudo, clientes: renderClientes, facturas: renderFacturas,
       cobros: renderCobros, ajustes: renderAjustes }[S.view] || renderResumen)();
  }

  function updateBadges() {
    const nuevos = S.opps.filter(o => o.stage === 'nuevo').length;
    const b = document.querySelector('#nav button[data-v="embudo"]');
    if (b) b.innerHTML = 'Embudo' + (nuevos ? `<span class="badge">${nuevos}</span>` : '');
  }

  function renderMissingTables() {
    document.getElementById('app').hidden = false;
    view.innerHTML = `<div class="panel" style="padding:2rem;max-width:640px;margin:2rem auto;display:grid;gap:.8rem">
      <h2>Falta crear las tablas del CRM</h2>
      <p>Abre Supabase &rarr; SQL Editor, pega el archivo <code>supabase/migrations/20261021000000_crm_fase_1.sql</code> y dale a <b>Run</b>. Luego recarga esta página.</p>
      <p class="muted">Los pasos completos están en <code>supabase/CRM_SETUP.md</code>.</p>
    </div>`;
  }

  /* ── Resumen ───────────────────────────────────────────── */
  function renderResumen() {
    const today = todayISO();
    const monthStart = today.slice(0, 8) + '01';
    const open = S.opps.filter(o => OPEN_STAGES.includes(o.stage));
    const nuevos = S.opps.filter(o => o.stage === 'nuevo').sort((a, b) => a.created_at.localeCompare(b.created_at));
    const live = S.invoices.filter(i => i.status !== 'anulada');
    const due = live.filter(i => Number(i.balance) > 0);
    const overdue = due.filter(i => i.due_date && i.due_date < today);
    const billedMonth = live.filter(i => i.issue_date >= monthStart).reduce((s, i) => s + Number(i.total), 0);
    const paidMonth = S.payments.filter(p => p.paid_on >= monthStart).reduce((s, p) => s + Number(p.amount), 0);

    const perLine = Object.entries(LINES).map(([k, l]) => {
      const lo = open.filter(o => o.line === k);
      const won = S.opps.filter(o => o.line === k && o.stage === 'ganado' && (o.closed_at || '') >= monthStart).length;
      return `<tr class="click" data-line="${k}"><td style="white-space:nowrap">${lineDot(k)} ${l.label}</td><td class="r">${lo.length}</td>
        <td class="r money">${fmtMoney(lo.reduce((s, o) => s + Number(o.value || 0), 0))}</td><td class="r">${won}</td></tr>`;
    }).join('');

    view.innerHTML = `
      <div class="head"><div><h2>Resumen</h2><p>${new Date().toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
        <button class="btn primary" id="newOppBtn">+ Nuevo cliente</button></div>
      <div class="tiles">
        <div class="tile ${nuevos.length ? 'alert' : ''}"><b>${nuevos.length}</b><span>Clientes nuevos sin contactar</span></div>
        <div class="tile"><b class="money">${fmtMoney(open.reduce((s, o) => s + Number(o.value || 0), 0))}</b><span>${open.length} oportunidades abiertas</span></div>
        <div class="tile"><b class="money">${fmtMoney(billedMonth)}</b><span>Facturado este mes · cobrado ${fmtMoney(paidMonth)}</span></div>
        <div class="tile ${overdue.length ? 'alert' : ''}"><b class="money">${fmtMoney(due.reduce((s, i) => s + Number(i.balance), 0))}</b><span>Por cobrar · ${overdue.length} vencida${overdue.length === 1 ? '' : 's'}</span></div>
      </div>
      <div class="grid2">
        <div class="panel"><h3>Para contestar ya</h3>
          ${nuevos.length ? `<table><tbody>${nuevos.slice(0, 8).map(o => `<tr class="click" data-opp="${o.id}">
            <td>${lineDot(o.line)} <b>${esc(clientOf(o.client_id).name)}</b><div class="muted" style="font-size:.78rem">${esc(o.title)}</div></td>
            <td class="r muted" style="font-size:.78rem">${ago(o.created_at)}</td></tr>`).join('')}</tbody></table>`
            : '<div class="empty">Nadie esperando respuesta.</div>'}
        </div>
        <div class="panel"><h3>Por línea de negocio</h3>
          <table><thead><tr><th>Línea</th><th class="r">Abiertas</th><th class="r">Valor</th><th class="r">Ganadas (mes)</th></tr></thead><tbody>${perLine}</tbody></table>
        </div>
        <div class="panel"><h3>Facturas vencidas</h3>
          ${overdue.length ? `<table><tbody>${overdue.map(i => `<tr class="click" data-inv="${i.id}">
            <td><b>${esc(i.client_snapshot?.name || clientOf(i.client_id).name)}</b><div class="muted" style="font-size:.78rem">${esc(i.number)} · venció ${fmtDate(i.due_date)}</div></td>
            <td class="r money">${fmtMoney(i.balance)}</td></tr>`).join('')}</tbody></table>`
            : '<div class="empty">Ninguna factura vencida.</div>'}
        </div>
      </div>`;
    view.querySelector('#newOppBtn').onclick = () => openNewOpp();
    view.querySelectorAll('[data-opp]').forEach(r => r.onclick = () => openOpp(r.dataset.opp));
    view.querySelectorAll('[data-line]').forEach(r => r.onclick = () => { S.lineFilter = r.dataset.line; go('embudo'); });
    view.querySelectorAll('[data-inv]').forEach(r => r.onclick = () => openPayment(r.dataset.inv));
  }

  /* ── Embudo ────────────────────────────────────────────── */
  function renderEmbudo() {
    const opps = S.opps.filter(o => S.lineFilter === 'todas' || o.line === S.lineFilter);
    const chips = [['todas', 'Todas']].concat(Object.entries(LINES).map(([k, l]) => [k, l.label]))
      .map(([k, l]) => `<button class="chip ${S.lineFilter === k ? 'on' : ''}" data-lf="${k}">${l} (${k === 'todas' ? S.opps.length : S.opps.filter(o => o.line === k).length})</button>`).join('');
    const cols = STAGES.map(st => {
      const list = opps.filter(o => o.stage === st.id);
      const total = list.reduce((s, o) => s + Number(o.value || 0), 0);
      return `<div class="col"><div class="col-h"><b>${st.label} · ${list.length}</b><span class="money">${total ? fmtMoney(total) : ''}</span></div>
        ${list.map(o => {
          const stale = o.stage === 'nuevo' && Date.now() - new Date(o.created_at) > 3600e3;
          return `<button class="card ${stale ? 'stale' : ''}" data-opp="${o.id}">
            <div class="c-top">${lineDot(o.line)}${esc(clientOf(o.client_id).name)}</div>
            <div class="c-title">${esc(o.title)}</div>
            <div class="c-foot"><span class="money">${o.value ? fmtMoney(o.value) : ''}</span><span>${ago(o.updated_at || o.created_at)}</span></div>
          </button>`;
        }).join('')}</div>`;
    }).join('');
    view.innerHTML = `
      <div class="head"><div><h2>Embudo</h2><p>Toca una tarjeta para moverla de etapa, escribir por WhatsApp o cotizar. Borde dorado: lleva más de una hora sin respuesta.</p></div>
        <button class="btn primary" id="newOppBtn">+ Nuevo cliente</button></div>
      <div class="chips">${chips}</div>
      <div class="board">${cols}</div>`;
    view.querySelector('#newOppBtn').onclick = () => openNewOpp(S.lineFilter !== 'todas' ? S.lineFilter : null);
    view.querySelectorAll('[data-lf]').forEach(b => b.onclick = () => { S.lineFilter = b.dataset.lf; renderEmbudo(); });
    view.querySelectorAll('[data-opp]').forEach(c => c.onclick = () => openOpp(c.dataset.opp));
  }

  /* ── Clientes ──────────────────────────────────────────── */
  function renderClientes() {
    const qq = S.clientSearch.trim().toLowerCase();
    const qDigits = phoneNorm(qq);
    const list = S.clients.filter(c => !qq
      || [c.name, c.company, c.email, c.sector, c.rnc].some(v => (v || '').toLowerCase().includes(qq))
      || (qDigits.length >= 4 && (c.phone_norm || '').includes(qDigits)));
    const balanceOf = id => S.invoices.filter(i => i.client_id === id && i.status !== 'anulada').reduce((s, i) => s + Number(i.balance), 0);
    view.innerHTML = `
      <div class="head"><div><h2>Clientes</h2><p>${S.clients.length} en total</p></div>
        <button class="btn primary" id="newOppBtn">+ Nuevo cliente</button></div>
      <div class="f" style="max-width:420px;margin-bottom:1rem"><input id="cSearch" type="search" placeholder="Buscar por nombre, teléfono, RNC o sector" value="${esc(S.clientSearch)}"/></div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Cliente</th><th>Teléfono</th><th>Sector</th><th>Líneas</th><th class="r">Debe</th></tr></thead>
        <tbody>${list.map(c => {
          const lines = [...new Set(S.opps.filter(o => o.client_id === c.id).map(o => o.line))];
          const bal = balanceOf(c.id);
          return `<tr class="click" data-client="${c.id}"><td><b>${esc(c.name)}</b>${c.company ? `<div class="muted" style="font-size:.78rem">${esc(c.company)}</div>` : ''}</td>
            <td>${esc(c.phone || '—')}</td><td>${esc(c.sector || '—')}</td>
            <td>${lines.map(l => `<span class="pill">${lineDot(l)} ${LINES[l].label}</span>`).join(' ')}</td>
            <td class="r money">${bal > 0 ? fmtMoney(bal) : '<span class="muted">—</span>'}</td></tr>`;
        }).join('') || '<tr><td colspan="5" class="empty">No hay clientes que coincidan.</td></tr>'}</tbody>
      </table></div>`;
    const search = view.querySelector('#cSearch');
    search.oninput = () => { S.clientSearch = search.value; const pos = search.selectionStart; renderClientes(); const s2 = view.querySelector('#cSearch'); s2.focus(); s2.setSelectionRange(pos, pos); };
    view.querySelector('#newOppBtn').onclick = () => openNewOpp();
    view.querySelectorAll('[data-client]').forEach(r => r.onclick = () => openClient(r.dataset.client));
  }

  /* ── Facturas ──────────────────────────────────────────── */
  function renderFacturas() {
    const f = S.invFilter;
    const list = S.invoices.filter(i => f === 'todas' || i.pay_status === f);
    const chips = [['todas', 'Todas'], ['pendiente', 'Pendientes'], ['parcial', 'Con abono'], ['pagada', 'Pagadas'], ['anulada', 'Anuladas']]
      .map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-if="${k}">${l}</button>`).join('');
    view.innerHTML = `
      <div class="head"><div><h2>Facturas</h2><p>Se crean desde una cotización. El NCF se asigna solo, en orden.</p></div>
        <button class="btn primary" id="newInvBtn">+ Facturar una cotización</button></div>
      ${ncfWarnings()}
      <div class="chips">${chips}</div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Factura</th><th>NCF</th><th>Cliente</th><th>Fecha</th><th class="r">Total</th><th class="r">Saldo</th><th>Estado</th><th></th></tr></thead>
        <tbody>${list.map(i => `<tr>
          <td><b>${esc(i.number)}</b></td><td class="money">${esc(i.ncf || '—')}</td>
          <td>${esc(i.client_snapshot?.name || clientOf(i.client_id).name)}</td><td>${fmtDate(i.issue_date)}</td>
          <td class="r money">${fmtMoney(i.total)}</td><td class="r money">${i.status === 'anulada' ? '—' : fmtMoney(i.balance)}</td>
          <td>${payPill(i.pay_status)}</td>
          <td class="r"><div class="actions" style="justify-content:flex-end">
            <button class="btn sm" data-print="${i.id}">Imprimir</button>
            ${i.status !== 'anulada' && Number(i.balance) > 0 ? `<button class="btn sm" data-pay="${i.id}">Pago</button>` : ''}
            ${i.status !== 'anulada' && Number(i.paid) === 0 ? `<button class="btn sm danger" data-void="${i.id}">Anular</button>` : ''}
          </div></td></tr>`).join('') || '<tr><td colspan="8" class="empty">Todavía no hay facturas.</td></tr>'}</tbody>
      </table></div>`;
    view.querySelector('#newInvBtn').onclick = () => openPickQuote();
    view.querySelectorAll('[data-if]').forEach(b => b.onclick = () => { S.invFilter = b.dataset.if; renderFacturas(); });
    view.querySelectorAll('[data-print]').forEach(b => b.onclick = () => printInvoice(b.dataset.print));
    view.querySelectorAll('[data-pay]').forEach(b => b.onclick = () => openPayment(b.dataset.pay));
    view.querySelectorAll('[data-void]').forEach(b => b.onclick = () => openVoid(b.dataset.void));
  }

  function ncfWarnings() {
    const soon = addDaysISO(30);
    const warns = [];
    Object.keys(NCF_TYPES).forEach(t => {
      const seqs = S.ncf.filter(s => s.ncf_type === t && s.active);
      if (!seqs.length) return;
      const left = seqs.filter(s => !s.expires_on || s.expires_on >= todayISO()).reduce((n, s) => n + Math.max(0, s.end_number - s.next_number + 1), 0);
      if (left < 20) warns.push(`Quedan ${left} NCF ${t}. Pide más en la Oficina Virtual de la DGII.`);
      seqs.filter(s => s.expires_on && s.expires_on <= soon && s.expires_on >= todayISO())
        .forEach(s => warns.push(`La secuencia ${t} vence el ${fmtDate(s.expires_on)}.`));
    });
    if (!S.ncf.length) warns.push('No tienes secuencias de NCF cargadas. Agrégalas en Ajustes para poder facturar con comprobante.');
    return warns.length ? `<div class="note-box warn" style="margin-bottom:1rem">${warns.map(esc).join('<br/>')}</div>` : '';
  }

  /* ── Cuentas por cobrar ────────────────────────────────── */
  function renderCobros() {
    const today = todayISO();
    const list = S.invoices.filter(i => i.status !== 'anulada' && Number(i.balance) > 0)
      .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
    const total = list.reduce((s, i) => s + Number(i.balance), 0);
    view.innerHTML = `
      <div class="head"><div><h2>Por cobrar</h2><p>${list.length} factura${list.length === 1 ? '' : 's'} con saldo · ${fmtMoney(total)}</p></div></div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Cliente</th><th>Factura</th><th>Vence</th><th class="r">Total</th><th class="r">Pagado</th><th class="r">Saldo</th><th></th></tr></thead>
        <tbody>${list.map(i => {
          const c = clientOf(i.client_id);
          const late = i.due_date && i.due_date < today;
          const days = late ? Math.round((new Date(today) - new Date(i.due_date)) / 864e5) : 0;
          const wa = waLink(c.phone, `Hola ${firstName(c.name)}, te escribe Ruddy de Plata Tech. Te recuerdo que la factura ${i.ncf || i.number} tiene un saldo pendiente de ${fmtMoney(i.balance)}. ¡Gracias!`);
          return `<tr><td><b>${esc(c.name)}</b></td><td>${esc(i.number)}${i.ncf ? `<div class="muted money" style="font-size:.75rem">${esc(i.ncf)}</div>` : ''}</td>
            <td>${i.due_date ? fmtDate(i.due_date) : '—'} ${late ? `<span class="pill bad">${days} día${days === 1 ? '' : 's'} tarde</span>` : ''}</td>
            <td class="r money">${fmtMoney(i.total)}</td><td class="r money">${fmtMoney(i.paid)}</td><td class="r money"><b>${fmtMoney(i.balance)}</b></td>
            <td class="r"><div class="actions" style="justify-content:flex-end">
              ${wa ? `<a class="btn sm wa" href="${wa}" target="_blank" rel="noopener">Recordar</a>` : ''}
              <button class="btn sm primary" data-pay="${i.id}">Registrar pago</button></div></td></tr>`;
        }).join('') || '<tr><td colspan="7" class="empty">Nadie te debe. 👌</td></tr>'}</tbody>
      </table></div>`;
    view.querySelectorAll('[data-pay]').forEach(b => b.onclick = () => openPayment(b.dataset.pay));
  }

  /* ── Ajustes ───────────────────────────────────────────── */
  function renderAjustes() {
    const em = k => S.settings['emisor.' + k] || {};
    view.innerHTML = `
      <div class="head"><div><h2>Ajustes</h2><p>Datos fiscales y comprobantes. Lo que pongas aquí sale impreso en las facturas.</p></div></div>
      <div class="grid2">
        ${Object.entries(EMITTERS).map(([k, e]) => `<form class="panel" data-em="${k}" style="padding:1rem;display:grid;gap:.7rem">
          <h3 style="padding:0;border:0">${esc(e.label)}</h3>
          <div class="form">
            <div class="f full"><label>Razón social</label><input name="legal" value="${esc(em(k).legal || e.label)}"/></div>
            <div class="f"><label>RNC o cédula</label><input name="rnc" value="${esc(em(k).rnc || '')}" placeholder="1-31-00000-0"/></div>
            <div class="f"><label>Teléfono</label><input name="phone" value="${esc(em(k).phone || '849-495-0959')}"/></div>
            <div class="f full"><label>Dirección</label><input name="address" value="${esc(em(k).address || 'Santo Domingo, República Dominicana')}"/></div>
          </div>
          <div class="actions"><button class="btn primary" type="submit">Guardar</button></div>
        </form>`).join('')}
      </div>
      <div class="head" style="margin-top:1.5rem"><div><h2>Secuencias de NCF</h2><p>Copia los rangos que te autorizó la DGII. El sistema usa el siguiente número disponible y avisa cuando quedan pocos.</p></div>
        <button class="btn primary" id="addSeqBtn">+ Agregar secuencia</button></div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Tipo</th><th>Próximo</th><th>Hasta</th><th class="r">Quedan</th><th>Vence</th><th>Estado</th><th></th></tr></thead>
        <tbody>${S.ncf.map(s => {
          const left = Math.max(0, s.end_number - s.next_number + 1);
          const expired = s.expires_on && s.expires_on < todayISO();
          return `<tr><td><b>${esc(s.ncf_type)}</b> <span class="muted">${esc(NCF_TYPES[s.ncf_type] || s.description || '')}</span></td>
            <td class="money">${esc(s.ncf_type + String(s.next_number).padStart(8, '0'))}</td><td class="money">${s.end_number}</td>
            <td class="r">${left}</td><td>${fmtDate(s.expires_on)}</td>
            <td>${!s.active ? '<span class="pill">Inactiva</span>' : expired ? '<span class="pill bad">Vencida</span>' : left === 0 ? '<span class="pill bad">Agotada</span>' : '<span class="pill ok">En uso</span>'}</td>
            <td class="r"><button class="btn sm" data-toggle="${s.id}">${s.active ? 'Desactivar' : 'Activar'}</button></td></tr>`;
        }).join('') || '<tr><td colspan="7" class="empty">No hay secuencias. Agrega la primera con el botón de arriba.</td></tr>'}</tbody>
      </table></div>
      <div class="note-box" style="margin-top:1rem">Factura electrónica (e-CF): queda para la Fase 3. Estas secuencias son para los NCF tradicionales (B01, B02...). Cuando la DGII te habilite el e-CF, se agregan los tipos E31, E32... sin rehacer nada.</div>`;
    view.querySelectorAll('form[data-em]').forEach(form => form.onsubmit = async e => {
      e.preventDefault();
      const value = Object.fromEntries(new FormData(form).entries());
      const { error } = await SB.from('crm_settings').upsert({ key: 'emisor.' + form.dataset.em, value, updated_at: new Date().toISOString() });
      if (error) return fail('No se guardó', error);
      S.settings['emisor.' + form.dataset.em] = value;
      toast('Datos guardados');
    });
    view.querySelector('#addSeqBtn').onclick = openNewSeq;
    view.querySelectorAll('[data-toggle]').forEach(b => b.onclick = async () => {
      const s = byId(S.ncf, b.dataset.toggle);
      const { error } = await SB.from('crm_ncf_sequences').update({ active: !s.active }).eq('id', s.id);
      if (error) return fail('No se actualizó', error);
      s.active = !s.active; renderAjustes();
    });
  }

  /* ── Modal base ────────────────────────────────────────── */
  function openSheet(title, sub, body) {
    modal.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-h"><div><h2>${title}</h2>${sub ? `<p class="muted" style="margin-top:.25rem">${sub}</p>` : ''}</div>
        <button class="x" aria-label="Cerrar">×</button></div>${body}</div>`;
    modal.hidden = false;
    modal.querySelector('.x').onclick = closeSheet;
    modal.onclick = e => { if (e.target === modal) closeSheet(); };
    return modal.querySelector('.sheet');
  }
  function closeSheet() { modal.hidden = true; modal.innerHTML = ''; }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeSheet(); });

  const lineOptions = sel => Object.entries(LINES).map(([k, l]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${l.label}</option>`).join('');

  /* ── Nuevo cliente / oportunidad ───────────────────────── */
  function openNewOpp(line, presetClient) {
    const c = presetClient || {};
    const sh = openSheet(presetClient ? 'Nueva oportunidad' : 'Nuevo cliente', presetClient ? esc(c.name) : 'Para clientes que llegan por WhatsApp, llamada o en persona.', `
      <form id="noForm" class="form">
        ${presetClient ? '' : `
        <div class="f"><label for="noPhone">Teléfono *</label><input id="noPhone" name="phone" type="tel" required placeholder="809-000-0000"/><span class="hint" id="noMatch"></span></div>
        <div class="f"><label for="noName">Nombre *</label><input id="noName" name="name" required/></div>
        <div class="f"><label for="noEmail">Correo</label><input id="noEmail" name="email" type="email"/></div>
        <div class="f"><label for="noSector">Sector o ciudad</label><input id="noSector" name="sector" placeholder="Los Prados, Santiago..."/></div>`}
        <div class="f"><label for="noLine">Línea *</label><select id="noLine" name="line">${lineOptions(line || 'seguridad')}</select></div>
        <div class="f"><label for="noValue">Valor estimado (RD$)</label><input id="noValue" name="value" type="number" min="0" step="1"/></div>
        <div class="f full"><label for="noTitle">¿Qué necesita? *</label><input id="noTitle" name="title" required placeholder="Kit 4 cámaras para colmado · Pantalla iPhone 13 · Sistema de inventario"/></div>
        <div class="f full"><label for="noNote">Nota</label><textarea id="noNote" name="note"></textarea></div>
        <div class="actions full"><button class="btn primary" type="submit">Guardar</button></div>
      </form>`);
    let match = presetClient || null;
    const phone = sh.querySelector('#noPhone');
    if (phone) phone.oninput = () => {
      const d = phoneNorm(phone.value);
      match = d.length === 10 ? S.clients.find(x => x.phone_norm === d) : null;
      sh.querySelector('#noMatch').textContent = match ? `Ya existe: ${match.name}. Se le agrega esta oportunidad.` : '';
      if (match) sh.querySelector('#noName').value = match.name;
    };
    sh.querySelector('#noForm').onsubmit = async e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
      let clientId = match?.id;
      if (!clientId) {
        const { data, error } = await SB.from('crm_clients')
          .insert({ name: fd.name.trim(), phone: fd.phone.trim(), email: fd.email || null, sector: fd.sector || null, source: { utm_source: 'manual' } })
          .select().single();
        if (error) { btn.disabled = false; return fail('No se creó el cliente', error); }
        clientId = data.id;
      }
      const { data: opp, error } = await SB.from('crm_opportunities')
        .insert({ client_id: clientId, line: fd.line, title: fd.title.trim(), value: fd.value ? Number(fd.value) : null })
        .select().single();
      if (error) { btn.disabled = false; return fail('No se creó la oportunidad', error); }
      if (fd.note && fd.note.trim()) await logActivity(clientId, opp.id, 'nota', fd.note.trim());
      await loadAll(); closeSheet(); render(); toast('Guardado');
    };
  }

  /* ── Oportunidad ───────────────────────────────────────── */
  function openOpp(id) {
    const o = byId(S.opps, id); if (!o) return;
    const c = clientOf(o.client_id);
    const quotes = S.quotes.filter(q => q.opportunity_id === o.id);
    const acts = S.acts.filter(a => a.opportunity_id === o.id || (a.client_id === o.client_id && !a.opportunity_id));
    const wa = waLink(c.phone, `Hola ${firstName(c.name)}, te escribe Ruddy de Plata Tech. Recibimos tu solicitud de "${o.title}". ¿Cuándo te queda bien que conversemos?`);
    const details = Object.entries(o.details || {}).filter(([, v]) => v !== '' && v !== null && typeof v !== 'object');
    const sh = openSheet(`${lineDot(o.line)} ${esc(c.name)}`, `${LINES[o.line].label} · ${esc(o.title)} · entró ${ago(o.created_at)}`, `
      <div class="actions">
        ${wa ? `<a class="btn wa" href="${wa}" target="_blank" rel="noopener" id="waBtn">WhatsApp</a>` : ''}
        ${c.phone ? `<a class="btn" href="tel:${esc(phoneNorm(c.phone))}">Llamar ${esc(c.phone)}</a>` : ''}
        <button class="btn" id="quoteBtn">+ Cotización</button>
        <button class="btn" id="clientBtn">Ficha del cliente</button>
      </div>
      ${details.length ? `<div class="note-box">${details.map(([k, v]) => `<b>${esc(k.replace(/_/g, ' '))}:</b> ${esc(v)}`).join('<br/>')}</div>` : ''}
      <form id="oForm" class="form">
        <div class="f"><label for="oStage">Etapa</label><select id="oStage" name="stage">${STAGES.map(s => `<option value="${s.id}" ${o.stage === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>
        <div class="f"><label for="oLine">Línea</label><select id="oLine" name="line">${lineOptions(o.line)}</select></div>
        <div class="f full"><label for="oTitle">Qué necesita</label><input id="oTitle" name="title" value="${esc(o.title)}"/></div>
        <div class="f"><label for="oValue">Valor estimado (RD$)</label><input id="oValue" name="value" type="number" min="0" value="${o.value ?? ''}"/></div>
        <div class="f" data-ally><label for="oAlly">Aliado que lo ejecuta</label><input id="oAlly" name="ally_name" value="${esc(o.ally_name || '')}"/></div>
        <div class="f" data-ally><label for="oComm">Tu comisión (RD$)</label><input id="oComm" name="ally_commission" type="number" min="0" value="${o.ally_commission ?? ''}"/></div>
        <div class="f full" data-lost><label for="oLost">¿Por qué se perdió?</label><input id="oLost" name="lost_reason" value="${esc(o.lost_reason || '')}" placeholder="Precio, eligió a otro, no respondió..."/></div>
        <div class="actions full"><button class="btn primary" type="submit">Guardar cambios</button></div>
      </form>
      <div class="sec-t">Cotizaciones</div>
      <div class="mini">${quotes.map(quoteRow).join('') || '<div class="muted">Sin cotizaciones todavía.</div>'}</div>
      <div class="sec-t">Historial</div>
      ${activityForm()}
      <div class="timeline">${acts.map(actRow).join('') || '<div class="muted">Sin actividad.</div>'}</div>`);
    const form = sh.querySelector('#oForm');
    const sync = () => {
      sh.querySelectorAll('[data-ally]').forEach(el => el.hidden = form.line.value !== 'aliado');
      sh.querySelector('[data-lost]').hidden = form.stage.value !== 'perdido';
    };
    form.line.onchange = sync; form.stage.onchange = sync; sync();
    form.onsubmit = async e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(form).entries());
      const patch = {
        stage: fd.stage, line: fd.line, title: fd.title.trim() || o.title,
        value: fd.value ? Number(fd.value) : null,
        ally_name: fd.line === 'aliado' ? (fd.ally_name || null) : null,
        ally_commission: fd.line === 'aliado' && fd.ally_commission ? Number(fd.ally_commission) : null,
        lost_reason: fd.stage === 'perdido' ? (fd.lost_reason || null) : null,
        closed_at: ['ganado', 'perdido'].includes(fd.stage) ? (o.closed_at || new Date().toISOString()) : null
      };
      const { error } = await SB.from('crm_opportunities').update(patch).eq('id', o.id);
      if (error) return fail('No se guardó', error);
      if (patch.stage !== o.stage) await logActivity(o.client_id, o.id, 'sistema', `Etapa: ${stageLabel(o.stage)} → ${stageLabel(patch.stage)}`);
      await loadAll(); render(); openOpp(o.id); toast('Guardado');
    };
    const waBtn = sh.querySelector('#waBtn');
    if (waBtn) waBtn.addEventListener('click', async () => {
      // Al escribirle por primera vez, la oportunidad pasa sola a "Contactado".
      if (o.stage !== 'nuevo') return;
      await SB.from('crm_opportunities').update({ stage: 'contactado' }).eq('id', o.id);
      await logActivity(o.client_id, o.id, 'whatsapp', 'Se le escribió por WhatsApp');
      await loadAll(); render();
    });
    sh.querySelector('#quoteBtn').onclick = () => createQuote(o);
    sh.querySelector('#clientBtn').onclick = () => openClient(c.id);
    bindQuoteRows(sh);
    bindActivityForm(sh, o.client_id, o.id, () => openOpp(o.id));
  }
  const stageLabel = id => (STAGES.find(s => s.id === id) || {}).label || id;

  function quoteRow(q) {
    const invoiced = S.invoices.some(i => i.quote_id === q.id && i.status !== 'anulada');
    return `<div class="mini-row"><div><b>${esc(q.number)}</b> <span class="pill">${esc(q.status)}</span>
        <span class="muted" style="font-size:.78rem">${fmtDate(q.created_at)}</span></div>
      <div class="actions"><span class="money"><b>${fmtMoney(q.totals?.total)}</b></span>
        <a class="btn sm" href="../shop/admin.html?quote=${encodeURIComponent(q.id)}" target="_blank" rel="noopener">Editar / PDF</a>
        ${invoiced ? '<span class="pill ok">Facturada</span>' : `<button class="btn sm primary" data-invq="${q.id}">Facturar</button>`}</div></div>`;
  }
  function bindQuoteRows(root) { root.querySelectorAll('[data-invq]').forEach(b => b.onclick = () => openInvoiceFromQuote(b.dataset.invq)); }

  function activityForm() {
    return `<form id="aForm" class="form" style="grid-template-columns:140px 1fr auto;align-items:end">
      <div class="f"><label for="aKind">Tipo</label><select id="aKind" name="kind">${['nota', 'whatsapp', 'llamada', 'visita'].map(k => `<option value="${k}">${ACT_KINDS[k]}</option>`).join('')}</select></div>
      <div class="f"><label for="aBody">Qué pasó</label><input id="aBody" name="body" required placeholder="Le mandé fotos de instalaciones parecidas"/></div>
      <button class="btn" type="submit">Agregar</button></form>`;
  }
  function bindActivityForm(root, clientId, oppId, after) {
    root.querySelector('#aForm').onsubmit = async e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      await logActivity(clientId, oppId, fd.kind, fd.body.trim());
      await loadAll(); after();
    };
  }
  const actRow = a => `<div class="tl"><span class="k">${ACT_KINDS[a.kind] || a.kind}</span>
    <div>${esc(a.body)}<div class="w">${fmtDate(a.created_at)} · ${new Date(a.created_at).toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' })}</div></div></div>`;

  async function createQuote(o) {
    const c = clientOf(o.client_id);
    const { data, error } = await SB.from('quotations').insert({
      number: nextQuoteNumber(), status: 'borrador',
      client: { name: c.name, company: c.company || null, phone: c.phone || null, email: c.email || null },
      items: [], totals: { subtotal: 0, discounts: 0, itbis: 0, total: 0 },
      client_id: c.id, opportunity_id: o.id,
      valid_until: addDaysISO(15)
    }).select().single();
    if (error) return fail('No se creó la cotización', error);
    if (OPEN_STAGES.indexOf(o.stage) < OPEN_STAGES.indexOf('cotizado')) {
      await SB.from('crm_opportunities').update({ stage: 'cotizado' }).eq('id', o.id);
    }
    await logActivity(c.id, o.id, 'sistema', `Cotización ${data.number} creada`);
    await loadAll(); render(); openOpp(o.id);
    window.open('../shop/admin.html?quote=' + encodeURIComponent(data.id), '_blank', 'noopener');
  }

  /* ── Ficha del cliente ─────────────────────────────────── */
  function openClient(id) {
    const c = byId(S.clients, id); if (!c) return;
    const opps = S.opps.filter(o => o.client_id === id);
    const quotes = S.quotes.filter(q => q.client_id === id);
    const invs = S.invoices.filter(i => i.client_id === id);
    const acts = S.acts.filter(a => a.client_id === id);
    const debt = invs.filter(i => i.status !== 'anulada').reduce((s, i) => s + Number(i.balance), 0);
    const src = c.source || {};
    const sh = openSheet(esc(c.name), [c.company, c.sector, src.utm_source && `vino de ${src.utm_source}${src.utm_campaign ? ' · ' + src.utm_campaign : ''}`].filter(Boolean).map(esc).join(' · '), `
      <div class="tiles" style="margin:0">
        <div class="tile"><b>${opps.length}</b><span>Oportunidades</span></div>
        <div class="tile"><b class="money">${fmtMoney(invs.filter(i => i.status !== 'anulada').reduce((s, i) => s + Number(i.total), 0))}</b><span>Facturado en total</span></div>
        <div class="tile ${debt > 0 ? 'alert' : ''}"><b class="money">${fmtMoney(debt)}</b><span>Debe</span></div>
      </div>
      <form id="cForm" class="form">
        <div class="f"><label for="cName">Nombre</label><input id="cName" name="name" required value="${esc(c.name)}"/></div>
        <div class="f"><label for="cCompany">Empresa</label><input id="cCompany" name="company" value="${esc(c.company || '')}"/></div>
        <div class="f"><label for="cRnc">RNC o cédula</label><input id="cRnc" name="rnc" value="${esc(c.rnc || '')}"/><span class="hint">Necesario para factura de crédito fiscal (B01).</span></div>
        <div class="f"><label for="cPhone">Teléfono</label><input id="cPhone" name="phone" type="tel" value="${esc(c.phone || '')}"/></div>
        <div class="f"><label for="cEmail">Correo</label><input id="cEmail" name="email" type="email" value="${esc(c.email || '')}"/></div>
        <div class="f"><label for="cSector">Sector o ciudad</label><input id="cSector" name="sector" value="${esc(c.sector || '')}"/></div>
        <div class="f full"><label for="cAddress">Dirección</label><input id="cAddress" name="address" value="${esc(c.address || '')}"/></div>
        <div class="f full"><label for="cNotes">Notas</label><textarea id="cNotes" name="notes">${esc(c.notes || '')}</textarea></div>
        <div class="actions full"><button class="btn primary" type="submit">Guardar ficha</button>
          <button class="btn" type="button" id="cNewOpp">+ Nueva oportunidad</button></div>
      </form>
      <div class="sec-t">Oportunidades</div>
      <div class="mini">${opps.map(o => `<div class="mini-row" data-opp="${o.id}" style="cursor:pointer"><div>${lineDot(o.line)} <b>${esc(o.title)}</b></div>
        <div class="actions"><span class="pill">${stageLabel(o.stage)}</span><span class="money">${o.value ? fmtMoney(o.value) : ''}</span></div></div>`).join('') || '<div class="muted">Ninguna.</div>'}</div>
      <div class="sec-t">Cotizaciones</div>
      <div class="mini">${quotes.map(quoteRow).join('') || '<div class="muted">Ninguna.</div>'}</div>
      <div class="sec-t">Facturas</div>
      <div class="mini">${invs.map(i => `<div class="mini-row"><div><b>${esc(i.number)}</b> <span class="muted money">${esc(i.ncf || '')}</span> ${payPill(i.pay_status)}</div>
        <div class="actions"><span class="money">${fmtMoney(i.total)}</span><button class="btn sm" data-print="${i.id}">Imprimir</button>
        ${i.status !== 'anulada' && Number(i.balance) > 0 ? `<button class="btn sm primary" data-pay="${i.id}">Pago</button>` : ''}</div></div>`).join('') || '<div class="muted">Ninguna.</div>'}</div>
      <div class="sec-t">Historial</div>
      ${activityForm()}
      <div class="timeline">${acts.map(actRow).join('') || '<div class="muted">Sin actividad.</div>'}</div>`);
    sh.querySelector('#cForm').onsubmit = async e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      const patch = {}; Object.entries(fd).forEach(([k, v]) => { patch[k] = v.trim() || null; });
      if (!patch.name) return toast('El nombre no puede quedar vacío', true);
      const { error } = await SB.from('crm_clients').update(patch).eq('id', c.id);
      if (error) return fail('No se guardó', error);
      await loadAll(); render(); openClient(c.id); toast('Ficha guardada');
    };
    sh.querySelector('#cNewOpp').onclick = () => openNewOpp(null, c);
    sh.querySelectorAll('[data-opp]').forEach(r => r.onclick = () => openOpp(r.dataset.opp));
    sh.querySelectorAll('[data-print]').forEach(b => b.onclick = () => printInvoice(b.dataset.print));
    sh.querySelectorAll('[data-pay]').forEach(b => b.onclick = () => openPayment(b.dataset.pay));
    bindQuoteRows(sh);
    bindActivityForm(sh, c.id, null, () => openClient(c.id));
  }

  /* ── Facturar ──────────────────────────────────────────── */
  function openPickQuote() {
    const invoicedIds = new Set(S.invoices.filter(i => i.status !== 'anulada').map(i => i.quote_id));
    const list = S.quotes.filter(q => !invoicedIds.has(q.id) && Number(q.totals?.total) > 0 && q.status !== 'rechazada');
    const sh = openSheet('Facturar una cotización', 'Elige la cotización. Los artículos y el total pasan tal cual a la factura.', `
      <div class="mini">${list.map(q => `<div class="mini-row"><div><b>${esc(q.number)}</b> · ${esc(q.client?.name || '')} <span class="pill">${esc(q.status)}</span></div>
        <div class="actions"><span class="money"><b>${fmtMoney(q.totals?.total)}</b></span><button class="btn sm primary" data-invq="${q.id}">Facturar</button></div></div>`).join('')
        || '<div class="empty">No hay cotizaciones pendientes de facturar. Créala primero en el admin o desde una oportunidad.</div>'}</div>`);
    bindQuoteRows(sh);
  }

  async function ensureClientForQuote(q) {
    if (q.client_id && byId(S.clients, q.client_id)) return q.client_id;
    // Cotizaciones viejas del admin no tienen cliente enlazado: se busca por telefono o se crea.
    const d = phoneNorm(q.client?.phone);
    let c = d.length === 10 ? S.clients.find(x => x.phone_norm === d) : null;
    if (!c) {
      const { data, error } = await SB.from('crm_clients').insert({
        name: q.client?.name || 'Cliente', company: q.client?.company || null,
        phone: q.client?.phone || null, email: q.client?.email || null, source: { utm_source: 'cotizacion' }
      }).select().single();
      if (error) { fail('No se creó el cliente', error); return null; }
      c = data;
    }
    await SB.from('quotations').update({ client_id: c.id }).eq('id', q.id);
    await loadAll();
    return c.id;
  }

  async function openInvoiceFromQuote(quoteId) {
    const q = byId(S.quotes, quoteId); if (!q) return;
    const clientId = await ensureClientForQuote(q);
    if (!clientId) return;
    const c = clientOf(clientId);
    const t = q.totals || {};
    const hasSeq = type => S.ncf.some(s => s.ncf_type === type && s.active && s.next_number <= s.end_number && (!s.expires_on || s.expires_on >= todayISO()));
    const defType = c.rnc && hasSeq('B01') ? 'B01' : hasSeq('B02') ? 'B02' : '';
    const sh = openSheet(`Facturar ${esc(q.number)}`, `${esc(c.name)} · ${fmtMoney(t.total)}`, `
      <div class="note-box">Subtotal ${fmtMoney(t.subtotal)}${t.discounts ? ` · Descuentos −${fmtMoney(t.discounts)}` : ''} · ITBIS ${fmtMoney(t.itbis)} · <b>Total ${fmtMoney(t.total)}</b>
        ${!t.itbis ? '<br/>Esta cotización no tiene ITBIS. Si la factura lo lleva, márcalo en la cotización desde el admin antes de facturar.' : ''}</div>
      <form id="iForm" class="form">
        <div class="f"><label for="iEm">Emite</label><select id="iEm" name="emitter">${Object.entries(EMITTERS).map(([k, e]) => `<option value="${k}" ${(q.opportunity_id && byId(S.opps, q.opportunity_id)?.line === 'celulares' ? 'ultimogadget' : 'platatech') === k ? 'selected' : ''}>${esc(e.label)}</option>`).join('')}</select></div>
        <div class="f"><label for="iType">Comprobante</label><select id="iType" name="ncf_type">
          ${Object.entries(NCF_TYPES).map(([k, l]) => `<option value="${k}" ${defType === k ? 'selected' : ''} ${hasSeq(k) ? '' : 'disabled'}>${l}${hasSeq(k) ? '' : ' · sin secuencia'}</option>`).join('')}
          <option value="" ${defType === '' ? 'selected' : ''}>Sin NCF (recibo interno)</option></select>
          <span class="hint" id="iHint"></span></div>
        <div class="f"><label for="iDue">Vence el pago</label><input id="iDue" name="due_date" type="date" value="${addDaysISO(15)}"/></div>
        <div class="f"><label for="iRnc">RNC del cliente</label><input id="iRnc" name="rnc" value="${esc(c.rnc || '')}" placeholder="Obligatorio para B01"/></div>
        <div class="f full"><label for="iNotes">Nota en la factura</label><input id="iNotes" name="notes" value="${esc(q.notes || '')}"/></div>
        <div class="actions full"><button class="btn primary" type="submit">Emitir factura</button></div>
      </form>`);
    const form = sh.querySelector('#iForm');
    const hint = () => { sh.querySelector('#iHint').textContent = form.ncf_type.value === 'B01' ? 'Para empresas o personas que necesitan crédito fiscal. Requiere RNC.' : form.ncf_type.value === 'B02' ? 'Para consumidor final.' : ''; };
    form.ncf_type.onchange = hint; hint();
    form.onsubmit = async e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(form).entries());
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      if ((fd.rnc || '').trim() !== (c.rnc || '')) {
        const { error } = await SB.from('crm_clients').update({ rnc: fd.rnc.trim() || null }).eq('id', c.id);
        if (error) { btn.disabled = false; return fail('No se guardó el RNC', error); }
      }
      const { data: invId, error } = await SB.rpc('crm_create_invoice', { p: {
        client_id: c.id, opportunity_id: q.opportunity_id || '', quote_id: q.id,
        emitter: fd.emitter, ncf_type: fd.ncf_type, due_date: fd.due_date,
        items: q.items || [], subtotal: t.subtotal || 0, discounts: t.discounts || 0, itbis: t.itbis || 0, total: t.total || 0,
        notes: fd.notes
      } });
      if (error) { btn.disabled = false; return fail('No se emitió la factura', error); }
      if (q.status !== 'aceptada') await SB.from('quotations').update({ status: 'aceptada' }).eq('id', q.id);
      await loadAll(); closeSheet(); go('facturas'); toast('Factura emitida');
      printInvoice(invId);
    };
  }

  /* ── Pagos ─────────────────────────────────────────────── */
  function openPayment(invId) {
    const i = byId(S.invoices, invId); if (!i) return;
    const pays = S.payments.filter(p => p.invoice_id === i.id);
    const sh = openSheet(`Pago · ${esc(i.number)}`, `${esc(i.client_snapshot?.name || clientOf(i.client_id).name)} · saldo ${fmtMoney(i.balance)}`, `
      <form id="pForm" class="form">
        <div class="f"><label for="pAmt">Monto (RD$)</label><input id="pAmt" name="amount" type="number" min="1" step="0.01" max="${Number(i.balance)}" required value="${Number(i.balance)}"/></div>
        <div class="f"><label for="pMethod">Forma de pago</label><select id="pMethod" name="method">${Object.entries(PAY_METHODS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
        <div class="f"><label for="pDate">Fecha</label><input id="pDate" name="paid_on" type="date" value="${todayISO()}"/></div>
        <div class="f"><label for="pRef">Referencia</label><input id="pRef" name="reference" placeholder="No. de transferencia o aprobación"/></div>
        <div class="actions full"><button class="btn primary" type="submit">Registrar pago</button></div>
      </form>
      <div class="sec-t">Pagos anteriores</div>
      <div class="mini">${pays.map(p => `<div class="mini-row"><span>${fmtDate(p.paid_on)} · ${PAY_METHODS[p.method] || p.method}${p.reference ? ' · ' + esc(p.reference) : ''}</span><b class="money">${fmtMoney(p.amount)}</b></div>`).join('') || '<div class="muted">Ninguno.</div>'}</div>`);
    sh.querySelector('#pForm').onsubmit = async e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      const amount = Number(fd.amount);
      if (!(amount > 0) || amount > Number(i.balance) + 0.001) return toast('El monto debe ser mayor que cero y no pasar del saldo', true);
      const { error } = await SB.from('crm_payments').insert({ invoice_id: i.id, amount, method: fd.method, paid_on: fd.paid_on, reference: fd.reference || null });
      if (error) return fail('No se registró el pago', error);
      await logActivity(i.client_id, i.opportunity_id, 'sistema', `Pago de ${fmtMoney(amount)} a ${i.number} (${PAY_METHODS[fd.method]})`);
      await loadAll(); closeSheet(); render(); toast('Pago registrado');
    };
  }

  function openVoid(invId) {
    const i = byId(S.invoices, invId); if (!i) return;
    const sh = openSheet(`Anular ${esc(i.number)}`, esc(i.ncf || 'Sin NCF'), `
      <div class="note-box warn">El NCF ${esc(i.ncf || '')} queda usado y no se vuelve a asignar. Los NCF anulados se reportan a la DGII en el formato 608 de ese mes.</div>
      <form id="vForm" class="form">
        <div class="f full"><label for="vReason">Motivo</label><input id="vReason" name="reason" required placeholder="Error en el monto, cliente equivocado..."/></div>
        <div class="actions full"><button class="btn danger" type="submit">Anular factura</button><button class="btn" type="button" id="vCancel">Volver</button></div>
      </form>`);
    sh.querySelector('#vCancel').onclick = closeSheet;
    sh.querySelector('#vForm').onsubmit = async e => {
      e.preventDefault();
      const reason = e.target.reason.value.trim();
      const { error } = await SB.from('crm_invoices').update({ status: 'anulada', void_reason: reason }).eq('id', i.id);
      if (error) return fail('No se anuló', error);
      await logActivity(i.client_id, i.opportunity_id, 'sistema', `Factura ${i.number} anulada: ${reason}`);
      await loadAll(); closeSheet(); render(); toast('Factura anulada');
    };
  }

  /* ── Secuencias NCF ────────────────────────────────────── */
  function openNewSeq() {
    const sh = openSheet('Agregar secuencia de NCF', 'Los datos están en la autorización de la DGII (Oficina Virtual → Solicitud de comprobantes).', `
      <form id="sForm" class="form">
        <div class="f"><label for="sType">Tipo</label><select id="sType" name="ncf_type">${Object.entries(NCF_TYPES).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
        <div class="f"><label for="sExp">Vence</label><input id="sExp" name="expires_on" type="date"/></div>
        <div class="f"><label for="sFrom">Desde el número</label><input id="sFrom" name="from" type="number" min="1" required placeholder="1"/><span class="hint">Si ya usaste algunos, pon el siguiente que no has usado.</span></div>
        <div class="f"><label for="sTo">Hasta el número</label><input id="sTo" name="to" type="number" min="1" required placeholder="500"/></div>
        <div class="actions full"><button class="btn primary" type="submit">Guardar</button></div>
      </form>`);
    sh.querySelector('#sForm').onsubmit = async e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      const from = parseInt(fd.from, 10), to = parseInt(fd.to, 10);
      if (!(to >= from)) return toast('"Hasta" debe ser mayor o igual que "Desde"', true);
      const { error } = await SB.from('crm_ncf_sequences').insert({ ncf_type: fd.ncf_type, next_number: from, end_number: to, expires_on: fd.expires_on || null, description: NCF_TYPES[fd.ncf_type] });
      if (error) return fail('No se guardó', error);
      await loadAll(); closeSheet(); render(); toast('Secuencia agregada');
    };
  }

  /* ── Imprimir factura ──────────────────────────────────── */
  function printInvoice(invId) {
    const i = byId(S.invoices, invId); if (!i) return;
    const em = Object.assign({ legal: EMITTERS[i.emitter]?.label, phone: '849-495-0959', address: 'Santo Domingo, República Dominicana' }, S.settings['emisor.' + i.emitter] || {});
    const cs = i.client_snapshot || {};
    const logo = EMITTERS[i.emitter]?.logo ? new URL(EMITTERS[i.emitter].logo, location.href).href : '';
    const rows = (i.items || []).map(it => it.type === 'discount'
      ? `<tr class="disc"><td>${esc(it.description || 'Descuento')}</td><td></td><td></td><td class="r">−${fmtMoney(it.discount_amount)}</td></tr>`
      : `<tr><td>${esc(it.description)}</td><td class="r">${esc(it.qty)}</td><td class="r">${fmtMoney(it.unit_price)}</td><td class="r">${fmtMoney(it.total)}</td></tr>`).join('');
    const title = i.ncf_type ? NCF_TITLES[i.ncf_type] || 'FACTURA' : 'RECIBO';
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>${esc(i.ncf || i.number)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:32px;font-size:13px}
  .top{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #0b1d3e;padding-bottom:16px}
  .top img{height:54px}
  h1{font-size:18px;margin:0 0 6px;color:#0b1d3e}
  .box{border:1px solid #cbd5e1;border-radius:6px;padding:10px 12px;min-width:240px}
  .box div{display:flex;justify-content:space-between;gap:16px;padding:2px 0}
  .cli{margin:18px 0;display:grid;grid-template-columns:1fr 1fr;gap:4px 24px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th{background:#0b1d3e;color:#fff;text-align:left;padding:7px 8px;font-size:11px;text-transform:uppercase}
  td{padding:7px 8px;border-bottom:1px solid #e2e8f0}
  .r{text-align:right}.disc td{color:#b91c1c}
  .tot{margin-left:auto;width:280px;margin-top:12px}
  .tot div{display:flex;justify-content:space-between;padding:4px 0}
  .tot .big{font-size:16px;font-weight:bold;border-top:2px solid #0b1d3e;padding-top:8px}
  .foot{margin-top:40px;font-size:11px;color:#64748b;display:flex;justify-content:space-between;gap:24px}
  .void{position:fixed;top:40%;left:0;right:0;text-align:center;font-size:90px;color:rgba(185,28,28,.18);transform:rotate(-20deg);font-weight:bold}
  .warn{background:#fef3c7;color:#92400e;padding:8px 12px;border-radius:6px;margin-bottom:12px}
  @media print{.np{display:none}body{padding:16px}}
</style></head><body>
${i.status === 'anulada' ? '<div class="void">ANULADA</div>' : ''}
${!em.rnc ? '<div class="warn np">Falta el RNC del emisor. Agrégalo en CRM → Ajustes antes de entregar esta factura.</div>' : ''}
<div class="top">
  <div>${logo ? `<img src="${logo}" alt=""/>` : ''}<h1>${esc(em.legal)}</h1>
    <div>RNC: ${esc(em.rnc || '—')}</div><div>${esc(em.address)}</div><div>Tel. ${esc(em.phone)}</div></div>
  <div class="box"><h1>${title}</h1>
    ${i.ncf ? `<div><span>NCF</span><b>${esc(i.ncf)}</b></div>${i.ncf_expires_on ? `<div><span>Válido hasta</span><span>${fmtDate(i.ncf_expires_on)}</span></div>` : ''}` : ''}
    <div><span>No.</span><span>${esc(i.number)}</span></div>
    <div><span>Fecha</span><span>${fmtDate(i.issue_date)}</span></div>
    ${i.due_date ? `<div><span>Vence</span><span>${fmtDate(i.due_date)}</span></div>` : ''}</div>
</div>
<div class="cli">
  <div><b>Cliente:</b> ${esc(cs.company || cs.name)}</div><div><b>RNC/Cédula:</b> ${esc(cs.rnc || '—')}</div>
  ${cs.company ? `<div><b>Contacto:</b> ${esc(cs.name)}</div>` : ''}<div><b>Teléfono:</b> ${esc(cs.phone || '—')}</div>
  ${cs.address ? `<div><b>Dirección:</b> ${esc(cs.address)}</div>` : ''}
</div>
<table><thead><tr><th>Descripción</th><th class="r">Cant.</th><th class="r">Precio</th><th class="r">Total</th></tr></thead><tbody>${rows}</tbody></table>
<div class="tot">
  <div><span>Subtotal</span><span>${fmtMoney(i.subtotal)}</span></div>
  ${Number(i.discounts) ? `<div><span>Descuentos</span><span>−${fmtMoney(i.discounts)}</span></div>` : ''}
  <div><span>ITBIS 18%</span><span>${fmtMoney(i.itbis)}</span></div>
  <div class="big"><span>Total</span><span>${fmtMoney(i.total)}</span></div>
  ${Number(i.paid) ? `<div><span>Pagado</span><span>${fmtMoney(i.paid)}</span></div><div><b>Saldo</b><b>${fmtMoney(i.balance)}</b></div>` : ''}
</div>
${i.notes ? `<p style="margin-top:18px"><b>Nota:</b> ${esc(i.notes)}</p>` : ''}
<div class="foot"><span>Precios en pesos dominicanos (RD$).</span><span>Gracias por confiar en nosotros.</span></div>
<p class="np" style="margin-top:24px"><button onclick="print()">Imprimir / Guardar PDF</button></p>
<script>window.onload=function(){setTimeout(function(){print()},300)}<\/script>
</body></html>`;
    const w = window.open('', '_blank');
    if (!w) return toast('El navegador bloqueó la ventana. Permite ventanas emergentes para este sitio.', true);
    w.document.write(html); w.document.close();
  }

  /* ── Login ─────────────────────────────────────────────── */
  const isAdmin = s => s?.user?.app_metadata?.is_admin === true || s?.user?.app_metadata?.is_admin === 'true';
  const gate = document.getElementById('gate');

  async function start() {
    document.getElementById('app').hidden = false;
    document.querySelectorAll('#nav button').forEach(b => b.onclick = () => go(b.dataset.v));
    document.getElementById('refreshBtn').onclick = async () => { await loadAll(); render(); toast('Actualizado'); };
    document.getElementById('logoutBtn').onclick = async () => { await SB.auth.signOut(); location.reload(); };
    if (await loadAll()) go('resumen');
  }

  document.getElementById('gateForm').onsubmit = async e => {
    e.preventDefault();
    const err = document.getElementById('gErr'), btn = document.getElementById('gBtn');
    err.textContent = ''; btn.disabled = true;
    const { data, error } = await SB.auth.signInWithPassword({ email: document.getElementById('gEmail').value.trim(), password: document.getElementById('gPass').value });
    btn.disabled = false;
    if (error) { err.textContent = 'Correo o contraseña incorrectos.'; return; }
    if (!isAdmin(data.session)) { err.textContent = 'Esta cuenta no tiene permisos de administrador.'; await SB.auth.signOut(); return; }
    gate.hidden = true; start();
  };

  (async () => {
    const { data: { session } } = await SB.auth.getSession();
    if (isAdmin(session)) start();
    else gate.hidden = false;
  })();
})();

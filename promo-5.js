/* ============================================================
   Plata Tech — Ventana "5% en tu proxima compra"
   ------------------------------------------------------------
   Pide nombre + WhatsApp o correo y entrega un codigo personal
   de 5% (un uso, vence en 3 meses). Lo guarda en el CRM con la
   funcion publica crm_claim_discount. Al pedir el codigo la
   persona acepta recibir ofertas (texto bajo el boton).

   Sale una vez: a los 15 s o cuando el mouse va a salir de la
   pagina. Si la cierran, no vuelve en 30 dias. Si ya tiene su
   codigo, no vuelve a salir; queda una pestanita "5%" para verlo.
   Uso: <script src="/promo-5.js" defer></script>
   ============================================================ */
(function () {
  'use strict';
  if (window.__ptPromo5) return; window.__ptPromo5 = true;

  var SB_URL = 'https://ieltuoriwgfckdfbwziu.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllbHR1b3Jpd2dmY2tkZmJ3eml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0Mjk2MjYsImV4cCI6MjA5MzAwNTYyNn0.HfytGHemYOiRu4NMD0Majzy91vB1fJX_wUURpq-qORk';
  var WA = 'https://wa.me/18494950959';
  var KEY = 'pt_promo5';
  var DELAY_MS = 15000;
  var SNOOZE_DAYS = 30;
  var CONSENT_TEXT = 'Al pedir tu código aceptas recibir ofertas y novedades de Plata Tech por WhatsApp o correo. Puedes darte de baja cuando quieras.';

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }
  function src() { try { return JSON.parse(sessionStorage.getItem('pt_src') || '{}'); } catch (e) { return {}; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtDate(d) { try { return new Date(d).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; } }
  var inShop = /\/shop\//.test(location.pathname);
  var shopHref = inShop ? 'index.html' : '/shop/';

  var css = '' +
    '.pt5-ov{position:fixed;inset:0;z-index:2147483000;background:rgba(6,14,32,.62);display:flex;align-items:center;justify-content:center;padding:16px;animation:pt5f .2s ease}' +
    '@keyframes pt5f{from{opacity:0}to{opacity:1}}' +
    '.pt5-box{position:relative;width:100%;max-width:400px;background:#fff;color:#0b1d3e;border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.35);overflow:hidden;font-family:Inter,"Segoe UI",system-ui,sans-serif;max-height:calc(100vh - 32px);overflow-y:auto}' +
    '.pt5-top{background:linear-gradient(135deg,#0a1a3e,#1e50d4);color:#fff;padding:22px 22px 18px}' +
    '.pt5-top small{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.7;font-weight:700}' +
    '.pt5-top h2{margin:6px 0 4px;font:800 26px/1.15 "Plus Jakarta Sans","Segoe UI",system-ui,sans-serif;color:#fff}' +
    '.pt5-top p{margin:0;font-size:14px;opacity:.85;line-height:1.45}' +
    '.pt5-x{position:absolute;top:8px;right:8px;width:36px;height:36px;border:0;border-radius:50%;background:rgba(255,255,255,.16);color:#fff;font-size:22px;line-height:1;cursor:pointer}' +
    '.pt5-x:focus-visible,.pt5-btn:focus-visible,.pt5-in:focus-visible{outline:3px solid #f0b23c;outline-offset:2px}' +
    '.pt5-body{padding:18px 22px 20px;display:grid;gap:10px}' +
    '.pt5-in{width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:12px 14px;border:1.5px solid #d4dcea;border-radius:10px;color:#0b1d3e;background:#fff}' +
    '.pt5-in:focus{border-color:#1e50d4}' +
    '.pt5-or{text-align:center;font-size:12px;color:#7a869c;margin:-2px 0}' +
    '.pt5-btn{display:block;width:100%;box-sizing:border-box;border:0;border-radius:11px;padding:14px;font:700 16px/1.2 inherit;font-family:inherit;cursor:pointer;background:#1e50d4;color:#fff;text-align:center;text-decoration:none}' +
    '.pt5-btn:hover{background:#163fae}.pt5-btn[disabled]{opacity:.6;cursor:wait}' +
    '.pt5-btn.wa{background:#25d366}.pt5-btn.ghost{background:#eef2fb;color:#0b1d3e}' +
    '.pt5-legal{font-size:11.5px;line-height:1.45;color:#6b7690;margin:0}.pt5-legal a{color:#1e50d4}' +
    '.pt5-err{font-size:13px;color:#b42318;margin:0;min-height:0}' +
    '.pt5-code{display:flex;align-items:center;justify-content:center;gap:10px;font:700 26px/1 Consolas,"JetBrains Mono",monospace;letter-spacing:.1em;color:#0a1a3e;background:#eef2ff;border:2px dashed #1e50d4;border-radius:12px;padding:16px 10px}' +
    '.pt5-note{font-size:13px;color:#56627a;text-align:center;margin:0;line-height:1.45}' +
    '.pt5-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
    '.pt5-tab{position:fixed;left:14px;bottom:14px;z-index:2147482000;border:0;border-radius:999px;padding:10px 14px;background:#0a1a3e;color:#fff;font:700 13px/1 Inter,"Segoe UI",system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer}' +
    '.pt5-tab:hover{background:#1e50d4}' +
    '@media (prefers-reduced-motion:reduce){.pt5-ov{animation:none}}';

  var styleEl = null, ov = null, lastFocus = null;
  function ensureStyle() {
    if (styleEl) return;
    styleEl = document.createElement('style'); styleEl.textContent = css; document.head.appendChild(styleEl);
  }

  function close(snooze) {
    if (!ov) return;
    ov.remove(); ov = null;
    document.removeEventListener('keydown', onKey);
    if (snooze) { var s = load(); if (!s.code) save({ closedAt: Date.now() }); }
    showTab();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function onKey(e) {
    if (e.key === 'Escape') close(true);
    if (e.key === 'Tab' && ov) {
      var f = ov.querySelectorAll('button,input,a[href]'); if (!f.length) return;
      var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
  }

  function frame(inner) {
    ensureStyle();
    if (ov) ov.remove();
    lastFocus = document.activeElement;
    ov = document.createElement('div');
    ov.className = 'pt5-ov';
    ov.innerHTML = '<div class="pt5-box" role="dialog" aria-modal="true" aria-labelledby="pt5-t">' +
      '<button class="pt5-x" type="button" aria-label="Cerrar">×</button>' + inner + '</div>';
    document.body.appendChild(ov);
    ov.querySelector('.pt5-x').onclick = function () { close(true); };
    ov.onclick = function (e) { if (e.target === ov) close(true); };
    document.addEventListener('keydown', onKey);
    var tab = document.querySelector('.pt5-tab'); if (tab) tab.remove();
    return ov;
  }

  function openForm() {
    var o = frame(
      '<div class="pt5-top"><small>Regalo de bienvenida</small><h2 id="pt5-t">5% de descuento en tu próxima compra</h2>' +
      '<p>Déjanos tu WhatsApp o tu correo y te damos tu código al instante. Sirve en la tienda y en cualquier servicio.</p></div>' +
      '<form class="pt5-body" novalidate>' +
      '<input class="pt5-in" name="name" autocomplete="name" placeholder="Tu nombre" aria-label="Tu nombre" required/>' +
      '<input class="pt5-in" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="WhatsApp (809-000-0000)" aria-label="WhatsApp"/>' +
      '<div class="pt5-or">o</div>' +
      '<input class="pt5-in" name="email" type="email" autocomplete="email" placeholder="Correo" aria-label="Correo"/>' +
      '<p class="pt5-err" role="alert" aria-live="polite"></p>' +
      '<button class="pt5-btn" type="submit">Quiero mi 5%</button>' +
      '<p class="pt5-legal">' + esc(CONSENT_TEXT) + ' <a href="/privacidad.html" target="_blank" rel="noopener">Privacidad</a>.</p>' +
      '</form>');
    var form = o.querySelector('form'), err = o.querySelector('.pt5-err');
    setTimeout(function () { form.name.focus(); }, 30);
    form.onsubmit = function (e) {
      e.preventDefault();
      var name = form.name.value.trim(), phone = form.phone.value.trim(), email = form.email.value.trim();
      var okPhone = phone.replace(/\D/g, '').length >= 10;
      var okEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
      err.textContent = '';
      if (name.length < 2) { err.textContent = 'Escribe tu nombre.'; form.name.focus(); return; }
      if (!okPhone && !okEmail) { err.textContent = 'Escribe tu WhatsApp (10 dígitos) o un correo válido.'; form.phone.focus(); return; }
      var btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Generando tu código…';
      fetch(SB_URL + '/rest/v1/rpc/crm_claim_discount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
        body: JSON.stringify({ p: { name: name, phone: okPhone ? phone : '', email: okEmail ? email : '', consent: true, consent_text: CONSENT_TEXT, source: src() } })
      }).then(function (r) {
        return r.json().then(function (j) { if (!r.ok) throw new Error((j && j.message) || 'error'); return j; });
      }).then(function (res) {
        save({ code: res.code, expires_at: res.expires_at, used: !!res.used, email: okEmail && res.nuevo });
        if (typeof window.gtag === 'function') window.gtag('event', 'generate_lead', { method: 'codigo5', area: 'promo' });
        showCode();
      }).catch(function (x) {
        btn.disabled = false; btn.textContent = 'Quiero mi 5%';
        var m = String(x && x.message || '');
        err.textContent = /permiso|nombre|WhatsApp|demanda|largos/i.test(m) ? m : 'No pudimos generar tu código. Intenta de nuevo o escríbenos por WhatsApp.';
      });
    };
  }

  function showCode() {
    var s = load(); if (!s.code) return openForm();
    var used = s.used;
    var o = frame(
      '<div class="pt5-top"><small>' + (used ? 'Tu código' : '¡Listo!') + '</small><h2 id="pt5-t">' + (used ? 'Ya usaste tu 5%' : 'Este es tu 5% de descuento') + '</h2>' +
      '<p>' + (used ? 'Gracias por comprarnos. Pronto te enviaremos más ofertas.' : 'Úsalo en tu próxima compra en la tienda o al cotizar un servicio.') + '</p></div>' +
      '<div class="pt5-body">' +
      '<div class="pt5-code"><span>' + esc(s.code) + '</span></div>' +
      '<p class="pt5-note">' + (used ? 'Este código ya se usó.' : 'Vale hasta el <b>' + esc(fmtDate(s.expires_at)) + '</b> · un solo uso' + (s.email ? '<br/>También te lo enviamos a tu correo.' : '')) + '</p>' +
      (used ? '' : '<button class="pt5-btn ghost" type="button" data-copy>Copiar código</button>' +
      '<div class="pt5-row"><a class="pt5-btn" href="' + shopHref + '">Ir a la tienda</a>' +
      '<a class="pt5-btn wa" target="_blank" rel="noopener" href="' + WA + '?text=' + encodeURIComponent('Hola, tengo el código ' + s.code + ' y quiero cotizar') + '">Cotizar</a></div>') +
      '</div>');
    var cp = o.querySelector('[data-copy]');
    if (cp) cp.onclick = function () {
      var done = function () { cp.textContent = 'Copiado ✓'; setTimeout(function () { cp.textContent = 'Copiar código'; }, 1600); };
      try { navigator.clipboard.writeText(s.code).then(done, done); } catch (e) { done(); }
    };
    setTimeout(function () { (cp || o.querySelector('.pt5-x')).focus(); }, 30);
  }

  function showTab() {
    if (document.querySelector('.pt5-tab') || ov) return;
    var s = load();
    if (s.used) return;
    ensureStyle();
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'pt5-tab';
    b.textContent = s.code ? 'Tu código 5%' : '🎁 5% de descuento';
    b.onclick = function () { if (load().code) showCode(); else openForm(); };
    document.body.appendChild(b);
  }

  function start() {
    var s = load();
    if (s.code) { showTab(); return; }
    var snoozed = s.closedAt && (Date.now() - s.closedAt) < SNOOZE_DAYS * 864e5;
    if (s.closedAt && !snoozed) save({});
    showTab();
    if (snoozed) return;
    var fired = false;
    var fire = function () {
      if (fired || ov) return; fired = true;
      document.removeEventListener('mouseout', exit);
      if (!load().code && !load().closedAt) openForm();
    };
    var exit = function (e) { if (!e.relatedTarget && e.clientY <= 0) fire(); };
    setTimeout(fire, DELAY_MS);
    document.addEventListener('mouseout', exit);
  }

  window.PTPromo5 = { open: function () { load().code ? showCode() : openForm(); }, get: load };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

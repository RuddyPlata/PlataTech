/* ══════════════════════════════════════════════════════════════
   compliance.js — Cumplimiento AZUL / Soluciones E-commerce
   · Logos de marca (Visa, MasterCard) y 3D Secure (Verified by Visa,
     MasterCard ID Check)
   · Barra de datos del comercio en el footer (razón social, RNC,
     dirección + país, servicio al cliente, enlaces a políticas)
   Uso:
   · <span data-pay-badges></span>          → Visa + MasterCard
   · <span data-pay-badges="3ds"></span>    → + Verified by Visa + MC ID Check
   · Se auto-inyecta una barra legal en cada <footer class="shop-foot">.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var BIZ = {
    legal:   'PLATA TECH SOLUTIONS, SRL',
    rnc:     '133-66822-1',
    address: 'Pdte. Antonio Guzmán Fernández #8, Santo Domingo Este 11802, República Dominicana',
    tel:     '+1 (849) 495-0959',
    telHref: '18494950959',
    email:   'ruddy.plata@gmail.com'
  };

  /* Resuelve rutas relativas: las páginas del shop están en /shop/,
     pero este archivo también se usa desde la raíz del sitio. */
  var inShop = /\/shop\//.test(location.pathname) || /\/shop$/.test(location.pathname.replace(/\/$/, ''));
  var P = inShop ? '' : 'shop/';

  /* ── Logos (SVG en línea, sin dependencias externas) ── */
  var VISA =
    '<svg viewBox="0 0 64 40" role="img" aria-label="Visa" width="52" height="33">' +
    '<rect width="64" height="40" rx="5" fill="#fff" stroke="#e5e7eb"/>' +
    '<text x="32" y="27" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" ' +
    'font-size="18" font-style="italic" font-weight="700" letter-spacing="1" fill="#1434CB">VISA</text></svg>';

  var MC =
    '<svg viewBox="0 0 64 40" role="img" aria-label="MasterCard" width="52" height="33">' +
    '<rect width="64" height="40" rx="5" fill="#fff" stroke="#e5e7eb"/>' +
    '<circle cx="27" cy="20" r="10" fill="#EB001B"/>' +
    '<circle cx="37" cy="20" r="10" fill="#F79E1B" fill-opacity="0.9"/>' +
    '<path d="M32 12.5a10 10 0 0 0 0 15 10 10 0 0 0 0-15z" fill="#FF5F00"/></svg>';

  var VBV =
    '<svg viewBox="0 0 108 40" role="img" aria-label="Verified by Visa" width="86" height="32">' +
    '<rect width="108" height="40" rx="5" fill="#fff" stroke="#e5e7eb"/>' +
    '<text x="8" y="18" font-family="Arial,Helvetica,sans-serif" font-size="9" font-weight="700" fill="#3b3b3b">Verified by</text>' +
    '<text x="8" y="32" font-family="Arial,Helvetica,sans-serif" font-size="13" font-style="italic" font-weight="700" letter-spacing="0.5" fill="#1434CB">VISA</text>' +
    '<path d="M92 8l10 0 0 24-10 0z" fill="#F7B600"/><path d="M92 8l-4 12 4 12 6-12z" fill="#1434CB"/></svg>';

  var MCIDC =
    '<svg viewBox="0 0 120 40" role="img" aria-label="MasterCard ID Check" width="96" height="32">' +
    '<rect width="120" height="40" rx="5" fill="#fff" stroke="#e5e7eb"/>' +
    '<circle cx="18" cy="20" r="9" fill="#EB001B"/>' +
    '<circle cx="27" cy="20" r="9" fill="#F79E1B" fill-opacity="0.9"/>' +
    '<path d="M22.5 13a9 9 0 0 0 0 14 9 9 0 0 0 0-14z" fill="#FF5F00"/>' +
    '<text x="42" y="17" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="700" fill="#3b3b3b">Identity</text>' +
    '<text x="42" y="30" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="700" fill="#3b3b3b">Check</text></svg>';

  function badgeSet(mode) {
    var set = VISA + MC;
    if (mode === '3ds') set += VBV + MCIDC;
    return set;
  }

  function renderBadges() {
    var nodes = document.querySelectorAll('[data-pay-badges]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.getAttribute('data-pay-done')) continue;
      el.classList.add('pay-badges');
      el.innerHTML = badgeSet(el.getAttribute('data-pay-badges'));
      el.setAttribute('data-pay-done', '1');
    }
  }

  /* ── Barra legal en el footer ── */
  function injectFooterBar() {
    var foots = document.querySelectorAll('footer.shop-foot .container');
    for (var i = 0; i < foots.length; i++) {
      var c = foots[i];
      if (c.querySelector('.compliance-bar')) continue;
      var bar = document.createElement('div');
      bar.className = 'compliance-bar';
      bar.innerHTML =
        '<div class="cb-badges" data-pay-badges="3ds"></div>' +
        '<div class="cb-legal">' +
          '<strong>' + BIZ.legal + '</strong> · RNC ' + BIZ.rnc + '<br>' +
          BIZ.address + '<br>' +
          'Servicio al cliente: ' +
          '<a href="tel:+' + BIZ.telHref + '">' + BIZ.tel + '</a> · ' +
          '<a href="mailto:' + BIZ.email + '">' + BIZ.email + '</a>' +
        '</div>' +
        '<div class="cb-links">' +
          '<a href="' + P + 'politicas.html">Devoluciones y entrega</a>' +
          '<a href="' + P + 'seguridad-pagos.html">Seguridad en pagos</a>' +
          '<a href="' + P + 'politicas.html#privacidad">Privacidad</a>' +
        '</div>' +
        '<div class="cb-currency">Precios en Pesos Dominicanos (RD$ / DOP). Pagos con tarjeta procesados de forma segura por AZUL.</div>';
      c.appendChild(bar);
    }
    renderBadges();
  }

  /* ── Estilos ── */
  function injectCss() {
    if (document.getElementById('compliance-css')) return;
    var s = document.createElement('style');
    s.id = 'compliance-css';
    s.textContent =
      '.pay-badges{display:inline-flex;flex-wrap:wrap;gap:8px;align-items:center;vertical-align:middle}' +
      '.pay-badges svg{display:block}' +
      '.compliance-bar{width:100%;margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid rgba(255,255,255,.14);' +
        'display:flex;flex-direction:column;gap:.6rem;font-size:.8rem;line-height:1.55;color:rgba(255,255,255,.72)}' +
      '.compliance-bar .cb-badges{display:flex;gap:8px;flex-wrap:wrap}' +
      '.compliance-bar .cb-legal strong{color:rgba(255,255,255,.92)}' +
      '.compliance-bar a{color:rgba(255,255,255,.85);text-decoration:underline;text-underline-offset:2px}' +
      '.compliance-bar .cb-links{display:flex;flex-wrap:wrap;gap:.4rem 1.1rem}' +
      '.compliance-bar .cb-currency{font-size:.72rem;opacity:.7}';
    document.head.appendChild(s);
  }

  /* Los contenedores [data-pay-badges] del checkout se crean dinámicamente
     (cart.js re-renderiza el resumen). Observamos el DOM para pintarlos
     apenas aparezcan. renderBadges() es idempotente (data-pay-done). */
  function watchDynamic() {
    if (!window.MutationObserver) return;
    var pending = false;
    var obs = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; renderBadges(); });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    injectCss();
    injectFooterBar();
    renderBadges();
    watchDynamic();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

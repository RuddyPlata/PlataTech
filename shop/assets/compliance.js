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
  /* Páginas legales que viven en la raíz del sitio (no en /shop/). */
  var R = inShop ? '../' : '';

  /* ── Logos oficiales de marca (provistos por AZUL) ── */
  function payImg(file, alt) {
    return '<img src="' + P + 'assets/img/pay/' + file + '" alt="' + alt + '" loading="lazy"/>';
  }

  function badgeSet(mode) {
    var set = payImg('visa.png', 'Visa') + payImg('mastercard.png', 'MasterCard');
    if (mode === '3ds') {
      set += payImg('visa-secure.png', 'Visa Secure (Verified by Visa)') +
             payImg('mc-idcheck.png', 'Mastercard ID Check');
    }
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
  /* Contenedores donde cuelga la barra legal. La tienda usa footer.shop-foot;
     las páginas de la raíz usan footer.footer. En ambos casos preferimos el
     .container interno, y si no existe, el propio <footer>. */
  function footerHosts() {
    var out = [];
    var foots = document.querySelectorAll('footer.shop-foot, footer.footer');
    for (var i = 0; i < foots.length; i++) {
      out.push(foots[i].querySelector('.container') || foots[i]);
    }
    return out;
  }

  function injectFooterBar() {
    var foots = footerHosts();
    for (var i = 0; i < foots.length; i++) {
      var c = foots[i];
      /* .footer-pay es la barra equivalente escrita a mano en index.html;
         si ya está, no duplicamos los datos del comercio. */
      if (c.querySelector('.compliance-bar, .footer-pay')) continue;
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
          '<a href="' + R + 'privacidad.html">Privacidad</a>' +
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
      '.pay-badges img{height:32px;width:auto;display:block;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:4px 7px;box-sizing:border-box}' +
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

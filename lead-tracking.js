/* ============================================================
   Plata Tech — Tracking de leads (clic a WhatsApp = conversión)
   ------------------------------------------------------------
   - Dispara el evento GA4 `generate_lead` cuando alguien toca
     CUALQUIER enlace de WhatsApp (wa.me/18494950959) en la página.
   - Usa delegación de eventos: no hay que tocar enlace por enlace,
     funciona también para botones agregados dinámicamente.
   - Guarda la fuente de la visita (utm_* / gclid) para saber qué
     anuncio trajo al cliente.

   En Google Ads: vincular GA4 -> Ads e importar `generate_lead`
   como conversión. En GA4: marcar `generate_lead` como evento clave.
   ============================================================ */
(function () {
  'use strict';

  var WA_NUMBER = '18494950959';

  /* Conversión de Google Ads (opcional).
     Cuando crees la conversión en Google Ads, pega aquí su "send_to"
     con el formato 'AW-1234567890/AbC-DeFgHi'. Mientras esté vacío,
     solo se usa GA4 (recomendado: importar `generate_lead` desde GA4). */
  var AW_SEND_TO = '';

  /* --- 1. Área de la página (para saber qué servicio convierte) --- */
  function areaFromPath() {
    var f = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    var map = {
      'security.html': 'seguridad',
      'energia.html': 'energia',
      'redes.html': 'redes',
      'automatizacion.html': 'automatizacion',
      'remodelacion.html': 'remodelacion',
      'digital.html': 'digital',
      'ultimogadget.html': 'ultimogadget',
      'gracias.html': 'gracias',
      '': 'home',
      'index.html': 'home'
    };
    return map[f] || f.replace('.html', '');
  }

  /* --- 2. Capturar la fuente del tráfico (primer toque de la sesión) --- */
  function captureSource() {
    try {
      if (sessionStorage.getItem('pt_src')) return;
      var p = new URLSearchParams(location.search);
      var src = {
        utm_source: p.get('utm_source') || (document.referrer ? 'referral' : 'directo'),
        utm_medium: p.get('utm_medium') || '',
        utm_campaign: p.get('utm_campaign') || '',
        utm_term: p.get('utm_term') || '',
        gclid: p.get('gclid') || '',
        landing: location.pathname,
        ts: Date.now()
      };
      sessionStorage.setItem('pt_src', JSON.stringify(src));
    } catch (e) { /* sessionStorage bloqueado: seguimos sin romper nada */ }
  }

  function getSource() {
    try { return JSON.parse(sessionStorage.getItem('pt_src') || '{}'); }
    catch (e) { return {}; }
  }

  /* --- 3. Disparar la conversión --- */
  function fireLead(link) {
    var src = getSource();
    var label = (link.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    var payload = {
      area: areaFromPath(),
      link_text: label || 'whatsapp',
      page_location: location.href,
      traffic_source: src.utm_source || 'directo',
      campaign: src.utm_campaign || '',
      gclid: src.gclid || ''
    };

    // GA4 (y, vía import, Google Ads)
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'generate_lead', payload);
      // Conversión directa de Google Ads (solo si configuraste AW_SEND_TO)
      if (AW_SEND_TO) {
        window.gtag('event', 'conversion', { send_to: AW_SEND_TO });
      }
    }
    // Respaldo en dataLayer por si gtag aún no cargó
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: 'generate_lead' }, payload));
  }

  /* --- 4. Escuchar clics en cualquier enlace de WhatsApp --- */
  function onClick(e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    if (a.href && a.href.indexOf('wa.me/' + WA_NUMBER) !== -1) {
      fireLead(a);
    }
  }

  captureSource();
  document.addEventListener('click', onClick, true);
})();

/* ============================================================
   Plata Tech — Captura de leads al CRM
   ------------------------------------------------------------
   Guarda la solicitud del formulario en el CRM (Supabase RPC
   crm_submit_lead) y despues abre WhatsApp con el resumen.
   Si el guardado falla, igual abre WhatsApp: nunca se pierde
   un cliente por un error de red.

   Uso:  PTLead.send({ line, title, value, name, phone, sector, details, waText })
   line: 'seguridad' | 'software' | 'celulares' | 'aliado'
   ============================================================ */
(function () {
  'use strict';

  // Misma llave publica (anon) que shop/assets/sb.js. Solo puede llamar a crm_submit_lead.
  var SB_URL = 'https://ieltuoriwgfckdfbwziu.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllbHR1b3Jpd2dmY2tkZmJ3eml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0Mjk2MjYsImV4cCI6MjA5MzAwNTYyNn0.HfytGHemYOiRu4NMD0Majzy91vB1fJX_wUURpq-qORk';
  var WA_NUMBER = '18494950959';

  function getSource() {
    // Lo guarda lead-tracking.js al entrar a la pagina (utm_*, gclid, landing).
    try { return JSON.parse(sessionStorage.getItem('pt_src') || '{}'); }
    catch (e) { return {}; }
  }

  function save(lead) {
    var body = {
      p: {
        line: lead.line,
        title: lead.title,
        value: lead.value != null ? String(lead.value) : '',
        name: lead.name,
        phone: lead.phone,
        sector: lead.sector || '',
        details: lead.details || {},
        source: getSource()
      }
    };
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 6000) : null;
    return fetch(SB_URL + '/rest/v1/rpc/crm_submit_lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      if (timer) clearTimeout(timer);
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || r.status); });
      return true;
    });
  }

  function send(lead) {
    var wa = 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(lead.waText || lead.title);
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'generate_lead', { area: lead.line, method: 'formulario', value: lead.value || 0, currency: 'DOP' });
    }
    return save(lead)
      .catch(function (err) { console.warn('[lead-capture] no se guardo en el CRM:', err); })
      .then(function () { window.location.href = wa; });
  }

  window.PTLead = { send: send };
})();

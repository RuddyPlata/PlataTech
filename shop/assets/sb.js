/* ════════════════════════════════════════════════════════
   Plata Tech Store — Supabase client
   ════════════════════════════════════════════════════════ */
(function () {
  var URL = 'https://ieltuoriwgfckdfbwziu.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllbHR1b3Jpd2dmY2tkZmJ3eml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0Mjk2MjYsImV4cCI6MjA5MzAwNTYyNn0.HfytGHemYOiRu4NMD0Majzy91vB1fJX_wUURpq-qORk';
  window.SB = supabase.createClient(URL, KEY);
})();

/* Shared XSS-safe helper — use instead of raw interpolation into innerHTML */
window.escapeHtml = function(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

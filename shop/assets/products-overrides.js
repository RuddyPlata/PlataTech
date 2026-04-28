/* ════════════════════════════════════════════════════════
   Plata Tech Solutions S.R.L. - Overrides MANUALES del catalogo

   ESTE ARCHIVO SE EDITA A MANO. NO se sobreescribe por los syncs
   diarios (sync_products.py / sync_renzo.py).

   Sirve para:
     - AGREGAR productos manualmente (EXTRA)
     - EDITAR campos de productos generados (OVERRIDES por id o slug)
     - OCULTAR / "borrar" productos del listado (HIDDEN por id o slug)

   Se carga DESPUES de products.js y products-static.js, asi que
   tiene la ultima palabra.
   ════════════════════════════════════════════════════════ */
(function () {
  if (!window.PRODUCTS) window.PRODUCTS = [];

  /* ── HIDDEN ─────────────────────────────────────────────
     Lista de IDs (numero) o slugs (texto) que quieres OCULTAR
     del listado sin tener que borrarlos del Sheet. Si tu
     proveedor descontinua un item o no quieres mostrarlo,
     agregalo aca.
     Ejemplos:
       5,                              // ocultar fila 5 del YDC sheet
       'samsung-galaxy-a35-128gb',     // ocultar por slug
       50087,                          // ocultar producto R.ENZO
  ──────────────────────────────────────────────────────── */
  var HIDDEN = [
    // Agrega aqui los productos que quieres ocultar.
  ];

  /* ── OVERRIDES ──────────────────────────────────────────
     Cambios sobre productos existentes (key = id O slug).
     Solo escribes los campos que quieres cambiar.
     Ejemplos:
       5: { price: 17999, stock: 5 },
       'iphone-16-pro-256gb': {
         name: 'iPhone 16 Pro (DEMO)',
         image: 'assets/img/manual/iphone-16-demo.jpg',
         price: 88500,
       },
  ──────────────────────────────────────────────────────── */
  var OVERRIDES = {
    // Agrega aqui ediciones manuales.
  };

  /* ── EXTRA ──────────────────────────────────────────────
     Productos NUEVOS que no estan en ningun sheet.
     IMPORTANTE: usar IDs >= 90000 para no chocar con sync.
     Mismos campos que un producto generado.
     Ejemplos:

       {
         id: 90001,
         slug: 'plata-tech-instalacion-camaras-domestica',
         category: 'seguridad',
         brand: 'Plata Tech',
         name: 'INSTALACION DE 4 CAMARAS DOMESTICA',
         variant: 'Mano de obra incluida',
         price: 8500,
         oldPrice: null,
         short: 'Servicio profesional de instalacion para hasta 4 camaras...',
         specs: ['Cableado UTP', 'Hasta 4 camaras', 'Programacion DVR'],
         image: 'assets/img/manual/instalacion-4cam.jpg',
         gradient: ['#1a2f4a', '#0a1525'],
         stock: 10
       },
  ──────────────────────────────────────────────────────── */
  var EXTRA = [
    // Agrega aqui productos manuales.
  ];

  /* ── Apply (no editar de aqui para abajo) ──────────────── */
  // 1. EXTRA -> agregar al catalogo
  for (var i = 0; i < EXTRA.length; i++) {
    window.PRODUCTS.push(EXTRA[i]);
  }
  // 2. OVERRIDES -> mergear sobre productos existentes
  for (var i = 0; i < window.PRODUCTS.length; i++) {
    var p = window.PRODUCTS[i];
    var byId = OVERRIDES[p.id];
    var bySlug = OVERRIDES[p.slug];
    if (byId)   { for (var k in byId)   p[k] = byId[k]; }
    if (bySlug) { for (var k in bySlug) p[k] = bySlug[k]; }
  }
  // 3. HIDDEN -> filtrar
  if (HIDDEN.length) {
    var hide = {};
    for (var i = 0; i < HIDDEN.length; i++) hide[HIDDEN[i]] = true;
    window.PRODUCTS = window.PRODUCTS.filter(function (p) {
      return !(hide[p.id] || hide[p.slug]);
    });
  }
})();

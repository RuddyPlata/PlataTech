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

/* ── CATEGORIAS NUEVAS + RECLASIFICACION ─────────────────
   Divide las mega-categorias "seguridad" y "accesorios"
   en grupos mas especificos para que todo sea visible en
   el home del shop.
──────────────────────────────────────────────────────── */
(function () {
  var REMAP = {
    camaras: [
      // UNV analogas
      50005,50006,50007,50008,
      // UNV IP
      50019,50020,50021,50022,50024,50025,
      // EPCOM analogas
      50033,50034,50035,50036,
      // EPCOM IP
      50042,50043,
      // HiLook
      50051,50052,
      // Hikvision IP
      50054,
      // EZVIZ
      50075,50077,50078,50079,50080,50081,50082,50083,50084,50085,50086,
      // EZVIZ video portero
      50088,50089,
      // WiFi bulb / PT
      50226,50227
    ],
    grabadores: [
      // UNV DVR
      50010,50011,50012,50013,50014,50015,50016,
      // UNV NVR
      50026,50027,50028,50029,50030,
      // EPCOM DVR
      50038,50039,
      // EPCOM NVR
      50045,50046,
      // Hikvision NVR
      50055,50056,
      // HiLook DVR
      50057,50058,
      // EZVIZ NVR
      50091
    ],
    alarmas: [
      // AX-PRO kit + sensores + sirenas
      50060,50061,50062,50063,50064,
      // AX-HOME kit + sensores + sirenas
      50065,50066,50067,50068,50069
    ],
    monitores: [
      50177,50178,50180,50181,50182,50183,50184,50185,50186,
      50187,50188,50189,50191,50192,50193
    ],
    almacenamiento: [
      50195,50196,50197,50198,50199,50200,50201
    ],
    impresoras: [
      // Impresoras de recibo 80mm
      50245,50246,50247,
      // Impresoras de inyeccion Epson / Canon
      50250,50251,50252,50254,50255,50256,
      // Caja de billetes
      50257,
      // Lectores de codigo de barra
      50258,50259,
      // All-in-one POS
      50260,50261
    ]
  };

  // Aplicar reclasificacion
  var idMap = {};
  for (var cat in REMAP) {
    var ids = REMAP[cat];
    for (var j = 0; j < ids.length; j++) idMap[ids[j]] = cat;
  }
  for (var i = 0; i < window.PRODUCTS.length; i++) {
    var p = window.PRODUCTS[i];
    if (idMap[p.id]) p.category = idMap[p.id];
  }

  // Agregar nuevas categorias a window.CATEGORIES
  if (!window.CATEGORIES) window.CATEGORIES = [];
  var existing = {};
  for (var i = 0; i < window.CATEGORIES.length; i++) existing[window.CATEGORIES[i].id] = true;
  var NEW_CATS = [
    { id: 'camaras',        name: 'Cámaras',        icon: 'camera'     },
    { id: 'grabadores',     name: 'DVR / NVR',      icon: 'hard-drive' },
    { id: 'alarmas',        name: 'Alarmas',         icon: 'bell'       },
    { id: 'monitores',      name: 'Monitores',       icon: 'monitor'    },
    { id: 'almacenamiento', name: 'Almacenamiento',  icon: 'database'   },
    { id: 'impresoras',     name: 'Impresoras',      icon: 'printer'    }
  ];
  for (var i = 0; i < NEW_CATS.length; i++) {
    if (!existing[NEW_CATS[i].id]) window.CATEGORIES.push(NEW_CATS[i]);
  }
})();

/* ════════════════════════════════════════════════════════
   Plata Tech Solutions S.R.L. - Product Database
   Precios en RD$. Modificar aquí actualiza toda la tienda.
   ════════════════════════════════════════════════════════ */

window.PRODUCTS = [

  /* ── SMARTPHONES ───────────────────────────────────────── */
  {
    slug: 'iphone-15-pro-max',
    category: 'celulares',
    brand: 'Apple',
    name: 'iPhone 15 Pro Max',
    variant: '256GB · Titanio Natural',
    price: 89500, oldPrice: null,
    badge: 'hot', badgeText: 'Más vendido',
    short: 'El iPhone más avanzado con Titanio, chip A17 Pro y cámara profesional de 48MP.',
    specs: [
      'Pantalla Super Retina XDR 6.7"',
      'Chip A17 Pro con GPU de 6 núcleos',
      '256GB almacenamiento',
      'Sistema de cámara Pro 48MP + teleobjetivo 5x',
      'Cuerpo de Titanio Grado 5',
      'Face ID, USB-C, Action Button'
    ],
    gradient: ['#4a4a52', '#1a1a1f'],
    stock: 8
  },
  {
    slug: 'iphone-15',
    category: 'celulares',
    brand: 'Apple',
    name: 'iPhone 15',
    variant: '128GB · Rosa',
    price: 59900, oldPrice: null,
    badge: null,
    short: 'Dynamic Island, cámara de 48MP y el nuevo diseño con USB-C en color Rosa.',
    specs: [
      'Pantalla Super Retina XDR 6.1"',
      'Chip A16 Bionic',
      '128GB almacenamiento',
      'Cámara principal 48MP + ultra gran angular',
      'Dynamic Island',
      'USB-C, Face ID'
    ],
    gradient: ['#ffc0cb', '#b76574'],
    stock: 12
  },
  {
    slug: 'samsung-galaxy-s24-ultra',
    category: 'celulares',
    brand: 'Samsung',
    name: 'Galaxy S24 Ultra',
    variant: '512GB · Titanium Violet',
    price: 79900, oldPrice: null,
    badge: 'new', badgeText: 'Nuevo',
    short: 'Galaxy AI integrada, S Pen, cámara de 200MP y cuerpo de Titanio.',
    specs: [
      'Pantalla Dynamic AMOLED 2X 6.8" 120Hz',
      'Snapdragon 8 Gen 3 for Galaxy',
      '512GB + 12GB RAM',
      'Cámara 200MP + zoom óptico 5x',
      'S Pen integrado',
      'Galaxy AI (traducción en vivo, edición con IA)'
    ],
    gradient: ['#6b4e9f', '#2a1f4a'],
    stock: 6
  },
  {
    slug: 'samsung-galaxy-s24',
    category: 'celulares',
    brand: 'Samsung',
    name: 'Galaxy S24',
    variant: '256GB · Onyx Black',
    price: 54500, oldPrice: null,
    badge: null,
    short: 'Snapdragon 8 Gen 3, Galaxy AI y pantalla de 120Hz en formato compacto.',
    specs: [
      'Pantalla Dynamic AMOLED 2X 6.2" 120Hz',
      'Snapdragon 8 Gen 3',
      '256GB + 8GB RAM',
      'Cámara 50MP triple',
      'Galaxy AI',
      'Lector de huella en pantalla'
    ],
    gradient: ['#2d2d35', '#0a0a0c'],
    stock: 10
  },
  {
    slug: 'google-pixel-8-pro',
    category: 'celulares',
    brand: 'Google',
    name: 'Pixel 8 Pro',
    variant: '256GB · Bay Blue',
    price: 48500, oldPrice: null,
    badge: null,
    short: 'La cámara más inteligente de Google con Magic Editor y Tensor G3.',
    specs: [
      'Pantalla Super Actua LTPO 6.7" 120Hz',
      'Google Tensor G3',
      '256GB + 12GB RAM',
      'Cámara principal 50MP + telephoto 48MP',
      'Magic Editor con IA',
      '7 años de actualizaciones de Android'
    ],
    gradient: ['#3a6bd9', '#1a2850'],
    stock: 5
  },
  {
    slug: 'motorola-edge-50',
    category: 'celulares',
    brand: 'Motorola',
    name: 'Edge 50 Fusion',
    variant: '256GB · Forest Blue',
    price: 32900, oldPrice: 38900,
    badge: 'sale', badgeText: 'Oferta',
    short: 'Pantalla pOLED de 144Hz, cámara de 50MP y carga rápida a precio imbatible.',
    specs: [
      'Pantalla pOLED 6.7" 144Hz',
      'Snapdragon 7s Gen 2',
      '256GB + 8GB RAM',
      'Cámara 50MP OIS',
      'Carga rápida TurboPower 68W',
      'Resistencia IP68'
    ],
    gradient: ['#4a8a6f', '#1a3a28'],
    stock: 14
  },

  /* ── LAPTOPS ───────────────────────────────────────────── */
  {
    slug: 'macbook-air-m3-13',
    category: 'laptops',
    brand: 'Apple',
    name: 'MacBook Air M3 13"',
    variant: '256GB · Medianoche',
    price: 85500, oldPrice: null,
    badge: 'hot', badgeText: 'Popular',
    short: 'Ultraligera, silenciosa, hasta 18 horas de batería con el chip M3.',
    specs: [
      'Pantalla Liquid Retina 13.6"',
      'Chip Apple M3 (8 CPU / 10 GPU)',
      '8GB RAM unificada · 256GB SSD',
      'Hasta 18 horas de batería',
      'Cámara FaceTime HD 1080p',
      'MagSafe + 2 USB-C'
    ],
    gradient: ['#2a2d3a', '#0f1218'],
    icon: 'laptop',
    stock: 4
  },
  {
    slug: 'macbook-pro-m3-14',
    category: 'laptops',
    brand: 'Apple',
    name: 'MacBook Pro M3 14"',
    variant: '512GB · Gris Espacial',
    price: 145000, oldPrice: null,
    badge: null,
    short: 'Pro en todos los sentidos. Pantalla Liquid Retina XDR y chip M3 de alto rendimiento.',
    specs: [
      'Pantalla Liquid Retina XDR 14.2" 120Hz',
      'Chip Apple M3 Pro',
      '18GB RAM unificada · 512GB SSD',
      'Hasta 22 horas de batería',
      'Cámara FaceTime HD 1080p',
      '3 Thunderbolt 4, HDMI, SD, MagSafe'
    ],
    gradient: ['#1f2028', '#0a0c12'],
    icon: 'laptop',
    stock: 3
  },
  {
    slug: 'lenovo-thinkpad-x1-carbon',
    category: 'laptops',
    brand: 'Lenovo',
    name: 'ThinkPad X1 Carbon Gen 11',
    variant: 'Intel Core i7 · 512GB',
    price: 75000, oldPrice: null,
    badge: null,
    short: 'El estándar corporativo. Teclado icónico, peso pluma y seguridad empresarial.',
    specs: [
      'Pantalla 14" WUXGA IPS antirreflejo',
      'Intel Core i7-1365U (vPro)',
      '16GB RAM · 512GB SSD NVMe',
      'Solo 1.12 kg',
      'Teclado ThinkPad retroiluminado',
      'Windows 11 Pro'
    ],
    gradient: ['#1a1a1a', '#0a0a0a'],
    icon: 'laptop',
    stock: 5
  },
  {
    slug: 'dell-xps-13',
    category: 'laptops',
    brand: 'Dell',
    name: 'XPS 13 Plus',
    variant: 'Intel Core i7 · 512GB',
    price: 68000, oldPrice: null,
    badge: null,
    short: 'Diseño minimalista, pantalla InfinityEdge y potencia profesional.',
    specs: [
      'Pantalla 13.4" OLED 3.5K táctil',
      'Intel Core i7-1360P',
      '16GB RAM LPDDR5 · 512GB SSD',
      'Teclado edge-to-edge',
      'Cámara 1080p con IR',
      'Windows 11 Home'
    ],
    gradient: ['#2a2a2a', '#111'],
    icon: 'laptop',
    stock: 3
  },

  /* ── AUDIO ─────────────────────────────────────────────── */
  {
    slug: 'airpods-pro-2',
    category: 'audio',
    brand: 'Apple',
    name: 'AirPods Pro (2da gen)',
    variant: 'USB-C · Cancelación activa',
    price: 14500, oldPrice: null,
    badge: 'hot', badgeText: 'Más vendido',
    short: 'Cancelación de ruido líder de la industria, audio espacial y estuche USB-C.',
    specs: [
      'Cancelación activa de ruido adaptativa',
      'Audio espacial personalizado',
      'Chip H2',
      'Hasta 30 horas con estuche',
      'Estuche USB-C con MagSafe',
      'Resistencia IP54'
    ],
    gradient: ['#f5f5f7', '#c5c5cc'],
    icon: 'earbuds',
    stock: 18
  },
  {
    slug: 'airpods-4',
    category: 'audio',
    brand: 'Apple',
    name: 'AirPods 4',
    variant: 'Estándar · Sin estuche de carga inalámbrica',
    price: 8900, oldPrice: null,
    badge: 'new', badgeText: 'Nuevo',
    short: 'El nuevo diseño de AirPods, ahora con mejor ajuste y sonido más claro.',
    specs: [
      'Nuevo diseño ergonómico',
      'Chip H2',
      'Audio espacial personalizado',
      'Hasta 30 horas con estuche',
      'Estuche USB-C',
      'Siri con un toque'
    ],
    gradient: ['#f5f5f7', '#c5c5cc'],
    icon: 'earbuds',
    stock: 15
  },
  {
    slug: 'sony-wh-1000xm5',
    category: 'audio',
    brand: 'Sony',
    name: 'WH-1000XM5',
    variant: 'Over-ear · Negro',
    price: 24500, oldPrice: null,
    badge: null,
    short: 'La cancelación de ruido más precisa del mercado con 30 horas de batería.',
    specs: [
      '8 micrófonos para cancelación avanzada',
      'Driver de 30mm con carbono ligero',
      '30 horas de batería',
      'Carga rápida: 3 min = 3 horas',
      'Multipunto Bluetooth',
      'LDAC Hi-Res Audio'
    ],
    gradient: ['#1a1a1a', '#0a0a0a'],
    icon: 'headphones',
    stock: 7
  },
  {
    slug: 'jbl-flip-6',
    category: 'audio',
    brand: 'JBL',
    name: 'Flip 6',
    variant: 'Altavoz Bluetooth portátil',
    price: 6500, oldPrice: null,
    badge: null,
    short: 'Sonido potente y resistente al agua, perfecto para cualquier aventura.',
    specs: [
      'Driver de rango completo + tweeter',
      'JBL PartyBoost',
      '12 horas de reproducción',
      'Resistencia IP67 agua/polvo',
      'Bluetooth 5.1',
      'Múltiples colores disponibles'
    ],
    gradient: ['#e85d3a', '#a03820'],
    icon: 'speaker',
    stock: 20
  },

  /* ── SEGURIDAD (Plata Tech Security) ───────────────────── */
  {
    slug: 'hikvision-colorvu-4mp',
    category: 'seguridad',
    brand: 'Hikvision',
    name: 'Cámara ColorVu 4MP DS-2CD2347G2',
    variant: 'IP Bullet · Visión a color 24/7',
    price: 4500, oldPrice: null,
    badge: 'hot', badgeText: 'Top ventas',
    short: 'Cámara profesional con tecnología ColorVu que entrega imagen a color incluso en oscuridad total.',
    specs: [
      'Resolución 4MP (2688×1520)',
      'Tecnología ColorVu con luz blanca',
      'Lente 2.8mm (106° horizontal)',
      'Compresión H.265+',
      'IP67 resistente a intemperie',
      'PoE (Power over Ethernet)'
    ],
    gradient: ['#1a2f4a', '#0a1525'],
    icon: 'camera',
    stock: 25
  },
  {
    slug: 'hikvision-nvr-8ch',
    category: 'seguridad',
    brand: 'Hikvision',
    name: 'NVR 8 canales DS-7108NI-Q1',
    variant: 'Grabador de red PoE',
    price: 6800, oldPrice: null,
    badge: null,
    short: 'Grabador de red para hasta 8 cámaras IP con soporte 4K y acceso remoto.',
    specs: [
      '8 canales IP PoE integrados',
      'Graba hasta 4K Ultra HD',
      'Compatible con disco 8TB',
      'Acceso remoto Hik-Connect',
      'Detección inteligente de movimiento',
      'Salida HDMI + VGA'
    ],
    gradient: ['#1a2f4a', '#0a1525'],
    icon: 'nvr',
    stock: 10
  },
  {
    slug: 'kit-cctv-4-colorvu',
    category: 'seguridad',
    brand: 'Hikvision',
    name: 'Kit CCTV 4 cámaras ColorVu + NVR',
    variant: 'Incluye instalación en Santo Domingo',
    price: 32500, oldPrice: 38500,
    badge: 'sale', badgeText: 'Kit con instalación',
    short: 'Kit completo para hogar: 4 cámaras ColorVu, NVR, disco 2TB e instalación profesional.',
    specs: [
      '4 cámaras ColorVu 4MP bullet',
      '1 NVR 4ch DS-7104NI-Q1 PoE',
      'Disco duro 2TB Hikvision (WD Purple)',
      '60m de cable UTP cat6',
      'Instalación y configuración incluida',
      'Garantía 1 año + soporte'
    ],
    gradient: ['#1a2f4a', '#0a1525'],
    icon: 'kit',
    stock: 5
  },
  {
    slug: 'hikvision-ax-pro-kit',
    category: 'seguridad',
    brand: 'Hikvision',
    name: 'AX PRO Starter Kit (Alarma)',
    variant: 'Panel + sensores + sirena',
    price: 18500, oldPrice: null,
    badge: 'new', badgeText: 'Pro',
    short: 'Sistema de alarma inalámbrico de grado profesional con monitoreo por app.',
    specs: [
      'Panel central AX PRO',
      '2 sensores PIR de movimiento',
      '2 sensores magnéticos (puerta/ventana)',
      '1 sirena interior',
      'App móvil Hik-Connect',
      'Conexión WiFi + GSM opcional'
    ],
    gradient: ['#1a2f4a', '#0a1525'],
    icon: 'alarm',
    stock: 8
  },
  {
    slug: 'sensor-pir',
    category: 'seguridad',
    brand: 'Hikvision',
    name: 'Sensor PIR de movimiento',
    variant: 'Inalámbrico para AX PRO',
    price: 1200, oldPrice: null,
    badge: null,
    short: 'Sensor adicional de movimiento para ampliar tu sistema de alarma.',
    specs: [
      'Tecnología PIR dual',
      'Alcance 12 metros',
      'Ángulo de detección 90°',
      'Inmune a mascotas pequeñas',
      'Batería 3 años',
      'Compatible con AX PRO'
    ],
    gradient: ['#1a2f4a', '#0a1525'],
    icon: 'sensor',
    stock: 40
  },
  {
    slug: 'sensor-humo',
    category: 'seguridad',
    brand: 'Hikvision',
    name: 'Sensor de humo inalámbrico',
    variant: 'Compatible AX PRO',
    price: 1800, oldPrice: null,
    badge: null,
    short: 'Detector fotoeléctrico de humo que alerta en tiempo real al panel central.',
    specs: [
      'Detección fotoeléctrica',
      'Sirena integrada 85dB',
      'Comunicación inalámbrica',
      'Batería 3 años',
      'Auto-test periódico',
      'Certificación EN 14604'
    ],
    gradient: ['#1a2f4a', '#0a1525'],
    icon: 'smoke',
    stock: 22
  },

  /* ── ACCESORIOS ────────────────────────────────────────── */
  {
    slug: 'cargador-usb-c-20w',
    category: 'accesorios',
    brand: 'Apple',
    name: 'Cargador USB-C 20W',
    variant: 'Power Delivery · Original',
    price: 1500, oldPrice: null,
    badge: null,
    short: 'Cargador original con Power Delivery para carga rápida de iPhone y iPad.',
    specs: [
      'Potencia 20W',
      'Power Delivery (PD)',
      'Compatible iPhone 8 en adelante',
      'Compatible iPad Pro / Air',
      'Sin cable incluido',
      'Original Apple'
    ],
    gradient: ['#f5f5f7', '#c5c5cc'],
    icon: 'charger',
    stock: 35
  },
  {
    slug: 'power-bank-20000',
    category: 'accesorios',
    brand: 'Anker',
    name: 'Power Bank 20000mAh',
    variant: 'PD 22.5W · USB-C',
    price: 3500, oldPrice: null,
    badge: null,
    short: 'Batería portátil de alta capacidad con carga rápida para teléfonos y laptops.',
    specs: [
      'Capacidad 20,000mAh',
      'Salida PD 22.5W',
      '2 USB-A + 1 USB-C',
      'Carga rápida bidireccional',
      'Pantalla LED de porcentaje',
      'Carga 4 iPhone 15 completos'
    ],
    gradient: ['#1a1a1a', '#333'],
    icon: 'powerbank',
    stock: 28
  },
  {
    slug: 'funda-iphone-15',
    category: 'accesorios',
    brand: 'Spigen',
    name: 'Funda iPhone 15 Pro Max',
    variant: 'Ultra Hybrid · Transparente',
    price: 950, oldPrice: null,
    badge: null,
    short: 'Funda transparente resistente con tecnología anti-amarilleo y MagSafe compatible.',
    specs: [
      'Parte trasera transparente rígida',
      'Bordes TPU flexibles',
      'Compatible con MagSafe',
      'Protección de esquinas reforzada',
      'Anti-amarilleo',
      'Botones tacto premium'
    ],
    gradient: ['#6b6b6b', '#2a2a2a'],
    icon: 'case',
    stock: 45
  },
  {
    slug: 'protector-vidrio',
    category: 'accesorios',
    brand: 'Generic',
    name: 'Protector de vidrio templado',
    variant: 'iPhone 15 / Samsung S24',
    price: 450, oldPrice: null,
    badge: null,
    short: 'Vidrio templado 9H con instalación incluida en tienda.',
    specs: [
      'Dureza 9H',
      'Espesor 0.33mm',
      'Oleofóbico anti-huellas',
      'Borde 2.5D suave',
      'Instalación gratis en tienda',
      'Compatible con funda'
    ],
    gradient: ['#4a4a4a', '#1a1a1a'],
    icon: 'screen',
    stock: 80
  }
];

/* ── Categorías ─────────────────────────────────────────── */
window.CATEGORIES = [
  { id: 'todos',      name: 'Todos',         icon: 'grid' },
  { id: 'celulares',  name: 'Celulares',     icon: 'phone' },
  { id: 'laptops',    name: 'Laptops',       icon: 'laptop' },
  { id: 'audio',      name: 'Audio',         icon: 'headphones' },
  { id: 'seguridad',  name: 'Seguridad',     icon: 'shield' },
  { id: 'accesorios', name: 'Accesorios',    icon: 'plug' }
];

/* ── Helpers ───────────────────────────────────────────── */
window.getProductBySlug = function(slug) {
  return window.PRODUCTS.find(p => p.slug === slug) || null;
};

window.formatPrice = function(n) {
  return 'RD$' + n.toLocaleString('en-US');
};

/* ── Product mockup SVG generator ───────────────────────── */
window.renderProductMock = function(product, size = 200) {
  const [c1, c2] = product.gradient || ['#2a2a2a', '#111'];
  const gid = 'g_' + product.slug.replace(/[^a-z0-9]/g, '_');

  // Phone shape for celulares
  if (product.category === 'celulares') {
    return `<svg viewBox="0 0 120 220" width="${size*0.6}" height="${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="4" width="104" height="212" rx="20" fill="#1a1a1f" stroke="#2a2a30" stroke-width="1.5"/>
      <rect x="14" y="10" width="92" height="200" rx="14" fill="url(#${gid})"/>
      ${product.brand === 'Apple' ? `<rect x="48" y="14" width="24" height="6" rx="3" fill="#0a0a0c"/>` : `<circle cx="60" cy="18" r="2.5" fill="#0a0a0c"/>`}
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
      </linearGradient></defs>
    </svg>`;
  }

  // Laptop
  if (product.category === 'laptops') {
    return `<svg viewBox="0 0 240 170" width="${size*1.2}" height="${size*0.85}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="10" width="200" height="130" rx="8" fill="#1a1a1f" stroke="#2a2a30" stroke-width="1.5"/>
      <rect x="26" y="16" width="188" height="118" rx="4" fill="url(#${gid})"/>
      <rect x="0" y="140" width="240" height="14" rx="4" fill="#1a1a1f"/>
      <rect x="100" y="140" width="40" height="6" rx="2" fill="#0a0a0c"/>
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
      </linearGradient></defs>
    </svg>`;
  }

  // Earbuds / headphones / speaker — use icon with gradient bg
  if (product.category === 'audio') {
    let iconPath = '';
    if (product.icon === 'earbuds') iconPath = '<path d="M60 30 c-18 0 -28 12 -28 28 v18 c0 8 6 14 14 14 s14 -6 14 -14 v-10 M140 30 c18 0 28 12 28 28 v18 c0 8 -6 14 -14 14 s-14 -6 -14 -14 v-10" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round"/>';
    else if (product.icon === 'headphones') iconPath = '<path d="M40 110 v-20 a60 60 0 0 1 120 0 v20 M160 110 a10 10 0 0 1 10 10 v20 a10 10 0 0 1 -10 10 h-8 a10 10 0 0 1 -10 -10 v-30 a10 10 0 0 1 10 -10 z M40 110 a10 10 0 0 0 -10 10 v20 a10 10 0 0 0 10 10 h8 a10 10 0 0 0 10 -10 v-30 a10 10 0 0 0 -10 -10 z" stroke="currentColor" stroke-width="5" fill="none"/>';
    else iconPath = '<rect x="60" y="40" width="80" height="120" rx="14" stroke="currentColor" stroke-width="5" fill="none"/><circle cx="100" cy="110" r="22" stroke="currentColor" stroke-width="5" fill="none"/><circle cx="100" cy="70" r="6" stroke="currentColor" stroke-width="5" fill="none"/>';
    return `<svg viewBox="0 0 200 200" width="${size}" height="${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="200" rx="24" fill="url(#${gid})"/>
      <g color="#fff" opacity=".9">${iconPath}</g>
      <defs><radialGradient id="${gid}" cx="30%" cy="30%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs>
    </svg>`;
  }

  // Security
  if (product.category === 'seguridad') {
    let iconPath = '';
    if (product.icon === 'camera') iconPath = '<path d="M40 70 h80 l15 -15 h20 v90 h-20 l-15 -15 h-80 z" stroke="currentColor" stroke-width="5" fill="none"/><circle cx="80" cy="100" r="20" stroke="currentColor" stroke-width="5" fill="none"/><circle cx="80" cy="100" r="8" fill="currentColor"/>';
    else if (product.icon === 'nvr') iconPath = '<rect x="30" y="70" width="140" height="60" rx="4" stroke="currentColor" stroke-width="5" fill="none"/><circle cx="50" cy="100" r="4" fill="currentColor"/><circle cx="70" cy="100" r="4" fill="currentColor"/><rect x="90" y="95" width="60" height="10" rx="2" stroke="currentColor" stroke-width="3" fill="none"/>';
    else if (product.icon === 'kit') iconPath = '<rect x="25" y="40" width="65" height="55" rx="6" stroke="currentColor" stroke-width="4" fill="none"/><rect x="110" y="40" width="65" height="55" rx="6" stroke="currentColor" stroke-width="4" fill="none"/><rect x="25" y="110" width="65" height="55" rx="6" stroke="currentColor" stroke-width="4" fill="none"/><rect x="110" y="110" width="65" height="55" rx="6" stroke="currentColor" stroke-width="4" fill="none"/>';
    else if (product.icon === 'alarm') iconPath = '<circle cx="100" cy="100" r="50" stroke="currentColor" stroke-width="5" fill="none"/><path d="M100 70 v30 l20 15" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M55 50 l-10 10 M145 50 l10 10" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>';
    else if (product.icon === 'smoke') iconPath = '<circle cx="100" cy="100" r="55" stroke="currentColor" stroke-width="5" fill="none"/><circle cx="100" cy="100" r="35" stroke="currentColor" stroke-width="3" fill="none"/><circle cx="100" cy="100" r="6" fill="currentColor"/>';
    else iconPath = '<rect x="60" y="60" width="80" height="80" rx="8" stroke="currentColor" stroke-width="5" fill="none"/><circle cx="100" cy="100" r="12" stroke="currentColor" stroke-width="4" fill="none"/>';
    return `<svg viewBox="0 0 200 200" width="${size}" height="${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="200" rx="24" fill="url(#${gid})"/>
      <g color="#f5ba3b" opacity=".95">${iconPath}</g>
      <defs><radialGradient id="${gid}" cx="30%" cy="30%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs>
    </svg>`;
  }

  // Accesorios (default)
  let iconPath = '';
  if (product.icon === 'charger') iconPath = '<rect x="80" y="50" width="40" height="70" rx="10" stroke="currentColor" stroke-width="5" fill="none"/><rect x="90" y="40" width="8" height="15" fill="currentColor"/><rect x="102" y="40" width="8" height="15" fill="currentColor"/><path d="M100 125 v25" stroke="currentColor" stroke-width="5"/>';
  else if (product.icon === 'powerbank') iconPath = '<rect x="50" y="60" width="100" height="90" rx="10" stroke="currentColor" stroke-width="5" fill="none"/><rect x="70" y="90" width="60" height="8" rx="2" fill="currentColor"/><path d="M85 120 l10 -5 M115 120 l-10 -5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>';
  else if (product.icon === 'case') iconPath = '<rect x="60" y="40" width="80" height="130" rx="14" stroke="currentColor" stroke-width="5" fill="none"/><rect x="85" y="50" width="30" height="30" rx="6" stroke="currentColor" stroke-width="3" fill="none"/>';
  else iconPath = '<rect x="55" y="55" width="90" height="90" rx="10" stroke="currentColor" stroke-width="5" fill="none"/><path d="M75 100 h50" stroke="currentColor" stroke-width="4"/>';
  return `<svg viewBox="0 0 200 200" width="${size}" height="${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="200" height="200" rx="24" fill="url(#${gid})"/>
    <g color="#fff" opacity=".9">${iconPath}</g>
    <defs><radialGradient id="${gid}" cx="30%" cy="30%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs>
  </svg>`;
};

# Estrategia de Marketing y Campañas — Plata Tech Solutions SRL
**Objetivo:** Conseguir clientes (leads calificados) en Santo Domingo, RD.
**Posicionamiento (NO negociable):** vendemos **calidad, tranquilidad, responsabilidad y terminación impecable** — NO precio. Todo el mensaje refuerza confianza, garantía y empresa formal (RNC, factura con crédito fiscal).
**Embudo:** Anuncio → página del área (energia/redes/automatizacion/remodelacion/digital/security.html) → botón WhatsApp `+1 849-495-0959`.

> **Foco actual: SOLO Google Ads.** Meta (Facebook/Instagram) queda para una fase posterior — está documentado abajo pero NO se lanza ahora. Google captura a quien YA está buscando el servicio, que es el dinero más fácil y medible para empezar.
>
> **Cobertura:** trabajamos en Santo Domingo y **también en el interior del país**, siempre que el cliente cubra el transporte. Esto amplía el alcance de las campañas (no nos limitamos a la capital) y se comunica con transparencia en los anuncios y en el primer mensaje de WhatsApp.

---

## 0. Antes de gastar un peso: medición (1–2 días)
Sin esto, no sabes qué campaña trae clientes y quemas presupuesto.

1. **Google Analytics 4** ya está instalado (`G-3L0THHV7FQ`). Falta marcar conversiones.
2. **Evento de conversión = clic en WhatsApp.** Es el final del embudo en todo el sitio. Hay que disparar un evento `generate_lead` cuando alguien toca un botón de WhatsApp (`wa.me/18494950959`).
   - *Te lo puedo implementar en el código*: un listener que haga `gtag('event','generate_lead',{area:'energia'})` en cada link de WhatsApp.
3. **Google Ads:** crear cuenta → importar la conversión `generate_lead` desde GA4. Activar también **conversión por llamada** si pones número visible.
4. **Meta Pixel + API de Conversiones:** instalar el pixel en todas las páginas y marcar el evento `Contact`/`Lead` en el clic de WhatsApp.
5. **Google Business Profile (Perfil de Empresa):** reclamar/optimizar la ficha de Santo Domingo. Es gratis y es la fuente #1 de llamadas locales. Subir fotos de trabajos terminados, horario, servicios, y pedir reseñas (ya tienen 87 clientes contentos → pedir que dejen reseña en Google).

---

## 1. GOOGLE ADS (prioridad 1)

### 1.1 Estructura de cuenta
Una campaña de **Search** por área de negocio (así controlas presupuesto por servicio y mides cuál convierte):

| Campaña (Search) | Landing page | Grupos de anuncios (ejemplos) |
|---|---|---|
| Energía | energia.html | Electricista · Inversores/solar · Aire acondicionado |
| Seguridad | security.html | Cámaras de vigilancia · Alarmas · Control de acceso |
| Automatización | automatizacion.html | Portón eléctrico · Domótica / casa inteligente |
| Redes | redes.html | Redes WiFi empresa · Cableado estructurado |
| Remodelación | remodelacion.html | Pintura profesional · Sheetrock/drywall · Cielos rasos |
| Digital | digital.html | Páginas web · Software a medida · IA para negocios |

**Por qué Search primero:** la gente que escribe "instalación de cámaras santo domingo" tiene intención de compra HOY. Es el dinero más fácil.

### 1.2 Palabras clave (concordancia de frase y exacta; evitar amplia pura al inicio)
Ejemplos por grupo (usar variantes con/sin tilde, RD usa mucho el celular):
- **Electricista:** `"electricista santo domingo"`, `"instalación eléctrica residencial"`, `[electricista a domicilio]`, `"reparación eléctrica negocio"`
- **Inversores:** `"instalación de inversores"`, `"sistema solar para casa"`, `"baterías inversor santo domingo"`
- **A/C:** `"instalación aire acondicionado"`, `"mantenimiento split"`, `"técnico de aires"`
- **Cámaras:** `"instalación de cámaras de seguridad"`, `"cámaras hikvision santo domingo"`, `"cctv para negocio"`
- **Portones:** `"portón eléctrico"`, `"motor para portón"`, `"automatizar portón corredizo"`
- **Domótica:** `"casa inteligente"`, `"domótica santo domingo"`, `"automatización del hogar"`
- **Redes:** `"instalación de redes wifi empresa"`, `"cableado estructurado"`
- **Remodelación:** `"pintura de casa profesional"`, `"instalación de sheetrock"`, `"cielo raso pvc"`
- **Web/IA:** `"diseño de páginas web santo domingo"`, `"hacer página web negocio"`, `"chatbot para negocio"`

**Negativas obligatorias** (para no pagar clics basura): `gratis`, `empleo`, `trabajo`, `curso`, `salario`, `cómo hacer`, `tutorial`, `usado`, `reparar yo mismo`, `pdf`, `precio` (si no quieres aparecer en buscadores de "lo más barato").

### 1.3 Redacción de anuncios (RSA) — alineada a marca
Cada anuncio (15 títulos, 4 descripciones). Tono: serio, garantía, formal. **No** lideres con precio.

**Títulos (mezclar):**
- Instalación Profesional de Cámaras
- Empresa Registrada y Formal
- Garantía de 3 Meses
- 87 Clientes Satisfechos en RD
- Trabajo Limpio y a Tiempo
- Presupuesto Sin Compromiso
- [Servicio] en Santo Domingo
- Soporte Después de Instalar

**Descripciones:**
- "Instalación con acabado impecable y garantía de 3 meses (aplican condiciones). Empresa formal y registrada. Cotiza gratis por WhatsApp."
- "No improvisamos: técnicos certificados, materiales de marca y entrega limpia. Más de 87 clientes contentos en Santo Domingo."

> **Nota factura/ITBIS:** NO uses "factura con crédito fiscal" como gancho en los anuncios. Si lo pones, atraes a quien exige comprobante fiscal (NCF) y te obliga al ITBIS. Mejor vende **"empresa formal y registrada"** (genera confianza sin prometer NCF). Si el cliente pide comprobante fiscal, ahí le sumas el 18% de ITBIS — pero no lo anuncias.
- *(Para grupos del interior)* "Damos servicio en todo el país, transporte a cargo del cliente. Misma garantía y acabado profesional donde estés."

**Extensiones (assets):**
- **Llamada/WhatsApp:** `+1 849-495-0959`
- **Enlaces de sitio:** Energía · Seguridad · Remodelación · Tienda
- **Textos destacados:** Garantía 3 meses · Empresa registrada · Disponible 7 días · Respuesta mismo día
- **Fragmentos estructurados:** Servicios (Electricidad, Cámaras, Inversores, A/C, Domótica…)

### 1.4 Segmentación y configuración
- **Ubicación (2 niveles):**
  - **Núcleo — Gran Santo Domingo** (Distrito Nacional + Santo Domingo Este/Norte/Oeste): la mayor parte del presupuesto. Aquí no hay fricción de transporte.
  - **Interior del país** (Santiago, La Vega, Punta Cana/Higüey, San Pedro, etc.): campaña/grupo aparte con **puja más baja** y anuncios que dicen claro "Damos servicio en todo el país (transporte a cargo del cliente)". Así no pagas por un clic que se cae cuando mencionas el viaje. Empieza por 2–3 ciudades grandes y escala según leads.
  - Configurar como "Presencia: personas que están en estas ubicaciones" (no "interés"), para no pagar clics de gente fuera de RD.
- **Idioma:** Español.
- **Dispositivos:** +20–30% puja en móvil (en RD el tráfico es mayormente celular).
- **Horario:** subir pujas en horario laboral; permitir WhatsApp 24/7.
- **Puja:** arrancar en **Maximizar clics** con CPC tope 1–2 semanas para juntar datos → cambiar a **Maximizar conversiones** una vez que `generate_lead` registre datos.

### 1.5 Presupuesto real: RD$5,000 — estrategia de arranque "bootstrap"
Presupuesto inicial **RD$5,000** y modelo de reinversión: cae un cliente → la ganancia se reinvierte en más publicidad. Con poco dinero, la regla #1 es **NO dispersar**. Cada peso a una sola apuesta de alta intención.

**Mes vs semana → MES, siempre encendido.** RD$5,000 en una semana = ~RD$715/día (rápido pero te quedas 3 semanas a oscuras y el teléfono deja de sonar → se rompe el ciclo de reinversión). RD$5,000 en el mes = **~RD$165/día**, continuo. Preferimos continuidad: el embudo nunca se apaga y vas aprendiendo qué convierte.

**Reglas para que RD$165/día rinda:**
- **UNA sola área para empezar** (no tres). Recomendado: **Seguridad / cámaras** — búsqueda comercial fuerte y constante en RD, ticket decente. Software y Remodelación entran después con la ganancia del primer cliente.
- **Solo concordancia EXACTA**, palabras de máxima intención: `[instalación de cámaras santo domingo]`, `[cámaras de seguridad para negocio]`, `[cctv santo domingo]`. Nada de amplia ni frase al inicio (queman el presupuesto).
- **Solo Gran Santo Domingo** al arrancar (sin interior todavía — el viaje resta margen y con RD$5k no hay para experimentar).
- **CPC manual con tope** (ej. RD$30–50) para que un clic caro no se coma el día.
- **Horario:** anuncios solo cuando alguien pueda responder el WhatsApp en minutos. Un lead que espera 2 horas se enfría.
- Meta de la fase: **conseguir el primer cliente**. Con eso reinviertes y subes a RD$165 → RD$300/día, y ahí sí agregas la 2.ª área.

> Realista: con RD$5,000 esperan ~2–4 conversaciones de WhatsApp en el mes si el lead cuesta RD$1,500–2,500. Suena poco, pero **1 instalación de cámaras paga el mes entero y deja ganancia para reinvertir**. Ese es el juego: bola de nieve.

**Cuando haya ganancia (mes 2–3):** sube presupuesto solo en lo rentable, agrega la 2.ª y 3.ª área, abre interior con su grupo aparte, y activa **Performance Max** con las fotos de trabajos terminados.

---

## 2. META ADS — Facebook + Instagram (FASE POSTERIOR, no lanzar ahora)
> ⏸️ **En pausa por decisión del cliente.** Primero validamos Google Ads y aprendemos qué áreas convierten. Cuando Google esté rindiendo y tengamos datos + creatividades (fotos/videos antes-después), activamos Meta para escalar. Lo de abajo queda como plan listo para ejecutar.

Meta **genera demanda** (gente que no te buscaba) y mantiene recordación de marca. Ideal para domótica, cámaras, remodelación e inversores (productos "visuales").

### 2.1 Estructura
- **Campaña 1 — Leads por WhatsApp (objetivo: Mensajes / Clics a WhatsApp):** la más directa para conseguir clientes. CTA "Enviar WhatsApp" con mensaje precargado por servicio.
- **Campaña 2 — Tráfico a páginas de área:** lleva a security.html / energia.html, etc. (alimenta retargeting).
- **Campaña 3 — Retargeting:** a quienes visitaron el sitio o vieron videos → oferta de cierre (consulta gratis, garantía).

### 2.2 Públicos
- **Geográfico:** Santo Domingo + 15–25 km.
- **Frío por interés:** dueños de casa/negocio, construcción/remodelación, seguridad del hogar, smart home, energía solar, emprendedores.
- **Lookalike (Públicos similares):** sube la lista de tus 87 clientes (teléfonos/emails) → crea similar 1–3%. Es de lo más rentable.
- **Retargeting:** visitantes del sitio (pixel) + gente que interactuó con tus posts/IG.

### 2.3 Creatividades (lo que más mueve la aguja)
El mensaje de marca manda: calidad y tranquilidad, no precio.
- **Antes / Después** de instalaciones (cableado, cámaras, pintura, portones). Carrusel o reel.
- **Video corto (15–30s)** del equipo trabajando + voz: "Empresa formal, garantía de 3 meses, entrega limpia."
- **Testimonios** reales (los del sitio: Roberto, María, José…) en formato cita con foto del trabajo.
- **Prueba de formalidad:** "Empresa registrada y formal" → genera confianza sin prometer NCF (ver nota ITBIS en 1.3).
- **Garantía 3 meses** como gancho de confianza en cada pieza.
- Formatos: **Reels/Stories 9:16** (prioridad), feed 1:1, carrusel para "6 áreas en una sola empresa".

### 2.4 Presupuesto sugerido
- **Mes 1:** RD$ 18,000–30,000 (≈ US$300–500). 60% leads WhatsApp, 25% tráfico, 15% retargeting.
- Optimizar por **costo por conversación de WhatsApp**. Escalar creatividades ganadoras (subir presupuesto 20% cada 3–4 días sin reiniciar aprendizaje).

---

## 3. Calendario 30 / 60 / 90 días

**Días 1–7 (cimientos):**
- Implementar evento WhatsApp → GA4 (te lo puedo codear) e importar a Google Ads.
- Instalar Meta Pixel + API de Conversiones.
- Optimizar Google Business Profile y pedir reseñas a clientes pasados.

**Días 8–30 (lanzar Google):**
- Lanzar Search por área con conversión activa.
- Revisar términos de búsqueda 2×/semana → agregar negativas.
- Identificar 2–3 áreas con mejor CPL.

**Días 31–60 (sumar Meta + escalar):**
- Lanzar Meta (leads WhatsApp + retargeting con lookalike de clientes).
- Activar Performance Max en Google con imágenes de trabajos.
- Subir presupuesto solo en lo rentable.

**Días 61–90 (optimizar):**
- A/B de creatividades y landing.
- Reportar CPL y nº de clientes cerrados por canal.
- Reasignar 100% del presupuesto a lo que trae clientes que cierran.

---

## 4. KPIs a vigilar (no vanidad — clientes)
- **Costo por lead (clic WhatsApp)** por área y por canal.
- **Tasa de cierre** (leads → trabajos cerrados) — pídele al equipo de ventas registrar de dónde vino cada cliente.
- **CPA real** (costo por cliente que paga).
- **ROAS / valor de trabajo promedio** por área (un inversor o remodelación vale mucho más que una reparación chica → puja más alto ahí).

---

## 5. Pendiente técnico recomendado (lo puedo implementar ya)
1. **Tracking de clics WhatsApp → GA4/Ads/Meta** (crítico para medir todo lo anterior).
2. **Mensaje de WhatsApp precargado por área** en cada página de servicio (ej. al entrar a security.html el botón ya trae "Hola, me interesan cámaras de seguridad…").
3. **UTM** en los enlaces para distinguir Google vs Meta vs orgánico.

> Dime si quieres que implemente el punto 5 ahora (tracking + mensajes precargados por área). Es lo que convierte esta estrategia en algo medible.

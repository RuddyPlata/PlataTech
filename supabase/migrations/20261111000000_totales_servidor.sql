-- ============================================================
-- Plata Tech — El total del pedido lo decide el servidor
-- ------------------------------------------------------------
-- Antes el carrito calculaba orders.totals en el navegador y se
-- guardaba tal cual; azul-create-payment cobra totals.total, asi
-- que alguien podia crear un pedido caro y pagar poco.
--
-- Ahora:
--   - product_prices guarda el precio de cada producto del
--     catalogo (lo llena scripts/sync_prices.mjs desde GitHub
--     Actions cada vez que cambia el catalogo en main).
--   - custom_products publicados cuentan si su slug no esta en
--     el catalogo (igual que custom-products.js).
--   - El trigger orders_00_check_totals (corre antes que
--     orders_apply_discount) recalcula subtotal, 5% de codigo,
--     ITBIS 18% (solo tarjeta) y total con slug + qty. Si no
--     coincide con lo que mando el navegador, rechaza el pedido.
--     Si coincide, guarda la version del servidor de items y
--     totals, y fuerza status 'pendiente' (solo AZUL lo cambia).
-- Idempotente.
-- ============================================================

create table if not exists public.product_prices (
  slug       text primary key,
  name       text not null default '',
  variant    text not null default '',
  price      integer not null check (price > 0),
  updated_at timestamptz not null default now()
);

-- Este proyecto no da permisos automaticos a tablas nuevas.
grant select, insert, update, delete on public.product_prices to service_role;
grant select on public.product_prices to authenticated;

alter table public.product_prices enable row level security;
drop policy if exists "precios admin" on public.product_prices;
create policy "precios admin" on public.product_prices for select to authenticated
  using (public.is_admin());

-- ── Reemplazar la lista completa de precios (solo service_role) ──
-- p: [{ slug, name, variant, price }, ...]. Borra lo que ya no esta
-- en el catalogo para que no se pueda comprar.
create or replace function public.sync_product_prices(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n   int;
  v_del int;
begin
  if jsonb_typeof(p) <> 'array' then raise exception 'Se esperaba una lista'; end if;
  v_n := jsonb_array_length(p);
  if v_n < 50 then raise exception 'Catalogo sospechoso: solo % productos', v_n; end if;

  insert into public.product_prices (slug, name, variant, price, updated_at)
  select x ->> 'slug', coalesce(x ->> 'name', ''), coalesce(x ->> 'variant', ''), (x ->> 'price')::integer, now()
  from jsonb_array_elements(p) x
  on conflict (slug) do update
    set name = excluded.name, variant = excluded.variant, price = excluded.price, updated_at = now()
    where (product_prices.name, product_prices.variant, product_prices.price)
          is distinct from (excluded.name, excluded.variant, excluded.price);

  delete from public.product_prices
  where slug not in (select x ->> 'slug' from jsonb_array_elements(p) x);
  get diagnostics v_del = row_count;

  return jsonb_build_object('productos', v_n, 'borrados', v_del);
end $$;
revoke all on function public.sync_product_prices(jsonb) from public, anon, authenticated;
grant execute on function public.sync_product_prices(jsonb) to service_role;

-- ── Recalcular y validar el pedido ──────────────────────────
create or replace function public.orders_check_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_it      jsonb;
  v_slug    text;
  v_qty     int;
  v_name    text;
  v_variant text;
  v_price   int;
  v_items   jsonb := '[]'::jsonb;
  v_sub     bigint := 0;
  v_count   int := 0;
  v_code    text := upper(trim(coalesce(new.totals ->> 'discountCode', '')));
  v_pct     numeric := 0;
  v_disc    bigint := 0;
  v_net     bigint;
  v_itbis   bigint;
  v_total   bigint;
  c_sub     numeric;
  c_disc    numeric;
  c_itbis   numeric;
  c_total   numeric;
begin
  if coalesce(new.payment_method, '') not in ('contra-entrega', 'azul') then
    raise exception 'Forma de pago no valida';
  end if;
  if jsonb_typeof(new.items) is distinct from 'array'
     or jsonb_array_length(new.items) = 0 or jsonb_array_length(new.items) > 50 then
    raise exception 'El pedido no tiene productos validos';
  end if;
  if jsonb_typeof(new.totals) is distinct from 'object' then
    raise exception 'Totales invalidos';
  end if;

  for v_it in select value from jsonb_array_elements(new.items) loop
    v_slug := v_it ->> 'slug';
    begin
      v_qty := (v_it ->> 'qty')::int;
    exception when others then
      raise exception 'Cantidad invalida';
    end;
    if v_qty is null or v_qty < 1 or v_qty > 99 then raise exception 'Cantidad invalida'; end if;

    select pp.name, pp.variant, pp.price into v_name, v_variant, v_price
    from public.product_prices pp where pp.slug = v_slug;
    if not found then
      select cp.name, coalesce(cp.variant, ''), cp.price into v_name, v_variant, v_price
      from public.custom_products cp
      where cp.slug = v_slug and cp.published and cp.price > 0
      order by cp.created_at desc limit 1;
      if not found then
        raise exception 'Un producto del carrito ya no esta disponible. Recarga la pagina';
      end if;
    end if;

    v_sub   := v_sub + v_price::bigint * v_qty;
    v_count := v_count + v_qty;
    v_items := v_items || jsonb_build_object(
      'slug', v_slug, 'name', v_name, 'variant', v_variant,
      'qty', v_qty, 'price', v_price, 'subtotal', v_price::bigint * v_qty);
  end loop;

  -- El codigo lo gasta orders_apply_discount; aqui se revisa y se toma su porcentaje
  -- (mismos mensajes, para que el carrito quite el descuento y avise).
  if v_code <> '' then
    select dc.percent into v_pct from public.crm_discount_codes dc
    where dc.code = v_code and dc.redeemed_at is null and dc.expires_at >= now();
    if not found then
      if not exists (select 1 from public.crm_discount_codes where code = v_code) then
        raise exception 'Ese codigo de descuento no existe';
      elsif exists (select 1 from public.crm_discount_codes where code = v_code and redeemed_at is not null) then
        raise exception 'Ese codigo de descuento ya se uso';
      else
        raise exception 'Ese codigo de descuento vencio';
      end if;
    end if;
  end if;
  v_disc  := round(v_sub * v_pct / 100);
  v_net   := v_sub - v_disc;
  v_itbis := case when new.payment_method = 'azul' then round(v_net * 0.18) else 0 end;
  v_total := v_net + v_itbis;

  begin
    c_sub   := coalesce(nullif(new.totals ->> 'subtotal', '')::numeric, -1);
    c_disc  := coalesce(nullif(new.totals ->> 'discount', '')::numeric, 0);
    c_itbis := coalesce(nullif(new.totals ->> 'itbis', '')::numeric, 0);
    c_total := coalesce(nullif(new.totals ->> 'total', '')::numeric, -1);
  exception when others then
    raise exception 'Totales invalidos';
  end;

  if v_code = '' and c_disc > 0 then raise exception 'Descuento sin codigo'; end if;
  if c_sub <> v_sub or c_disc <> v_disc or c_itbis <> v_itbis or c_total <> v_total then
    raise exception 'Los precios cambiaron. Recarga la pagina para ver el total correcto';
  end if;

  -- Guardar la version del servidor.
  new.items  := v_items;
  new.totals := jsonb_build_object(
    'subtotal', v_sub,
    'discount', v_disc,
    'subtotalNet', v_net,
    'discountCode', nullif(v_code, ''),
    'itbis', v_itbis,
    'total', v_total,
    'itemCount', v_count);
  new.status            := 'pendiente';
  new.azul              := null;
  new.paypal_order_id   := null;
  new.paypal_payer      := null;
  new.paypal_amount_usd := null;
  new.exchange_rate     := null;
  return new;
end $$;
revoke all on function public.orders_check_totals() from public, anon, authenticated;

-- "00" para que corra antes que orders_apply_discount (orden alfabetico).
drop trigger if exists orders_00_check_totals on public.orders;
create trigger orders_00_check_totals before insert on public.orders
  for each row execute function public.orders_check_totals();

-- ── Semilla: precios del catalogo al crear esta migracion ───
-- (generado con: node scripts/sync_prices.mjs --sql)
insert into public.product_prices (slug, name, variant, price) values
  ('dell-latitude-3120-2-in-1-p33t-128gb-ssd-4gb-ram-11-6-touc', 'DELL LATITUDE 3120 2-IN-1 P33T', '128GB SSD, 4GB RAM, 11.6" TOUCH 360, INTEL N5100, WIFI 6, BT, WINDOWS 11', 11499),
  ('asus-vivobook-e410ka-pm464-64gb-msd-64gb-128gb-4gb-r', 'ASUS VIVOBOOK E410KA-PM464', '64GB + MSD 64GB = 128GB, 4GB RAM, 14" FHD, INTEL N6000, WINDOWS 11', 11999),
  ('asus-vivobook-e410ka-pm4128-128gb-4gb-ram-14-fhd-intel', 'ASUS VIVOBOOK E410KA-PM4128', '128GB, 4GB RAM, 14" FHD, INTEL N450, WINDOWS 11', 12499),
  ('lenovo-ideapad-1i-2025-128gb-emmc-5-1-14-hd-4gb-ra', 'LENOVO IDEAPAD 1i 2025', '128GB EMMC 5.1, 14” HD, 4GB RAM, INTEL N4500 2.8GHZ, 4GB DDR4-2933MHZ, WINDOWS 11S', 13499),
  ('lenovo-ideapad-slim-3-128gb-emmc-5-1-15-6-fhd-4gb', 'LENOVO IDEAPAD SLIM 3', '128GB EMMC 5.1. 15.6" FHD, 4GB RAM, INTEL N100, WIFI 6, BT 5.1, WINDOWS 11S', 13999),
  ('hp-14-em0002wm-128gb-ssd-14-hd-4gb-ram-ddr', 'HP 14-EM0002WM', '128GB SSD, 14” HD, 4GB RAM DDR5-5500MHZ, AMD 7120U 3.5 GHZ, WIFI 6, BT 5.3, WINDOWS 11S', 12999),
  ('asus-vivobook-e1504g-256gb-ufs-8gb-ram-ddr4-3200mh', 'ASUS VIVOBOOK E1504G', '256GB UFS, 8GB RAM DDR4-3200MHZ, 15.6" FHD, INTEL CORE I3 N305 13VA GEN. 3.8GHZ, WIFI 5, BT 5.0, WINDOWS 11S', 22499),
  ('dell-inspiron-15-15250-5315-512gb-ssd-15-6-fhd-2k-120hz', 'DELL INSPIRON 15 15250-5315', '512GB SSD, 15.6" FHD 2K 120HZ TOUCH, 8GB RAM DDR4-2666MHZ, INTEL CORE I5-1334U 13VA GEN. 4.6GHZ, WIFI 6, BT 5.3, WINDOWS 11', 30499),
  ('apple-macbook-neo-512gb-ssd-13-liquid-retina', 'APPLE MACBOOK NEO', '512GB SSD, 13" LIQUID RETINA, 8GB UNIFIED RAM, PROC. A18 PRO, TOUCH ID, WIFI 6E, BT 6, MAC OS V16.0 "SEQUOIA"', 47699),
  ('amazon-fire-stick-hd', 'AMAZON FIRE STICK HD', '', 2849),
  ('amazon-fire-stick-4k-select', 'AMAZON FIRE STICK 4K SELECT', '', 2999),
  ('amazon-fire-stick-4k-plus', 'AMAZON FIRE STICK 4K PLUS', '', 3349),
  ('amazon-camara-amazon-blink-outdoor', 'CAMARA AMAZON BLINK OUTDOOR', '', 3124),
  ('otux-one-power-one-iii-triple-puerto-65w-tipo-c-tipo-c-trenzado', 'OTUX ONE POWER ONE III TRIPLE PUERTO 65W  TIPO C - TIPO C TRENZADO', '', 1799),
  ('samsung-original-25w-tipo-c-tipo-c-completo', 'SAMSUNG ORIGINAL 25W TIPO C - TIPO C', 'COMPLETO', 1699),
  ('apple-iphone-lightning-original-20w-completo', 'APPLE IPHONE LIGHTNING ORIGINAL 20W', 'COMPLETO', 2299),
  ('apple-iphone-tipo-c-tipo-c-trenzado-original-20w-completo', 'APPLE IPHONE TIPO C - TIPO C TRENZADO ORIGINAL 20W', 'COMPLETO', 2699),
  ('otux-one-ear-one-ii-audifonos-bluetooth-inalambric', 'OTUX ONE EAR ONE II', 'AUDÍFONOS BLUETOOTH INALÁMBRICOS', 1599),
  ('otux-modem-wifi-otux-one-pocket-mifi-4g-lte', 'MODEM WIFI OTUX ONE POCKET MIFI 4G LTE', '', 2099),
  ('vast-modem-wifi-vast-h1-hotspot-linksys', 'MODEM WIFI VAST H1 HOTSPOT', 'LINKSYS', 2299),
  ('starlink-antena-starlink-v4-mini', 'ANTENA STARLINK V4 MINI', '', 21499),
  ('qlink-scepter-16gb-8-2gb-ram', 'QLINK SCEPTER', '16GB, 8",  2GB RAM', 2799),
  ('tcl-tab-10-5g-32gb-10-1-4gb-ram-5g', 'TCL TAB 10 5G', '32GB, 10.1", 4GB RAM, 5G', 6299),
  ('cubot-tab-70-128gb-11-16gb-ram-6-10-4g', 'CUBOT TAB 70', '128GB, 11". 16GB RAM 6+10, 4G LTE, HACE LLAMADAS, COVER + TECLADO + MOUSE, 8200 MAH', 9899),
  ('cubot-tab-kingkong-2-256gb-11-16gb-ram-8-8-4g-l', 'CUBOT TAB KINGKONG 2', '256GB, 11". 16GB RAM 8+8, 4G LTE, HACE LLAMADAS, 20,400 MAH', 15299),
  ('xiaomi-redmi-pad-2-128gb-11-4gb-ram', 'XIAOMI REDMI PAD 2', '128GB, 11", 4GB RAM', 11799),
  ('xiaomi-redmi-pad-2-pro-128gb-12-1-120hz-6gb-ram', 'XIAOMI REDMI PAD 2 PRO', '128GB, 12.1" 120HZ, 6GB RAM', 15299),
  ('xiaomi-redmi-pad-2-pro-256gb-12-1-120hz-8gb-ram', 'XIAOMI REDMI PAD 2 PRO', '256GB, 12.1" 120HZ, 8GB RAM', 18799),
  ('xiaomi-pad-7-128gb-11-2-144hz-8gb-ram', 'XIAOMI PAD 7', '128GB, 11.2" 144HZ, 8GB RAM', 20799),
  ('oukitel-ot9-128gb-8-16gb-ram-4-12-80', 'OUKITEL OT9', '128GB, 8", 16GB RAM (4+12), 8000 MAH, INCLUYE LAPIZ TACTIL, COVER', 9399),
  ('oukitel-rt3-pro-128gb-8-12gb-ram-4-8-ult', 'OUKITEL RT3 PRO', '128GB, 8", 12GB RAM (4+8), ULTRA RESISTENTE', 10999),
  ('samsung-galaxy-tab-a11-x230-128gb-11-6gb-ram', 'SAMSUNG GALAXY TAB A11+ X230', '128GB, 11", 6GB RAM', 12999),
  ('foxxd-a56-16gb-5-5-4gb-ram-2-2', 'FOXXD A56', '16GB, 5.5", 4GB RAM 2+2', 2549),
  ('varios-orbic-maui-plus-4g-32gb-5-5-3gb-ram', 'ORBIC MAUI (+) PLUS 4G', '32GB, 5.5", 3GB RAM', 3349),
  ('vortex-hd65-ultra-32gb-6-52-3gb-ram', 'VORTEX HD65 ULTRA', '32GB, 6.52", 3GB RAM', 4099),
  ('hotwav-a17-pro-max-64gb-6-75-120-hz-12gb-ram-3', 'A17 PRO MAX', '64GB, 6.75" 120 HZ, 12GB RAM 3+9', 6299),
  ('hotwav-a17-pro-max-128gb-6-75-120-hz-12gb-ram', 'A17 PRO MAX', '128GB, 6.75" 120 HZ, 12GB RAM 3+9', 6999),
  ('hotwav-a26-ultra-64gb-6-75-120-hz-12gb-ram-3', 'A26 ULTRA', '64GB, 6.75" 120 HZ, 12GB RAM 3+9 + HANDFREE BLUETOOTH', 6599),
  ('hotwav-a26-ultra-128gb-6-75-120-hz-12gb-ram', 'A26 ULTRA', '128GB, 6.75" 120 HZ, 12GB RAM 3+9 + HANDFREE BLUETOOTH', 7299),
  ('hotwav-a26-ultra-256gb-6-75-120-hz-12gb-ram', 'A26 ULTRA', '256GB, 6.75" 120 HZ, 12GB RAM 3+9 + HANDFREE BLUETOOTH', 8299),
  ('m-horse-a70-32gb-6-6-hd-3gb-ram', 'A70+', '32GB, 6.6" HD+, 3GB RAM', 5299),
  ('m-horse-m17-pro-max-64gb-6-6-hd-8gb-ram-4-4', 'M17 PRO MAX', '64GB, 6.6" HD+, 8GB RAM 4+4 + AUD. INALÁMBRICO', 6599),
  ('m-horse-m17-pro-max-128gb-6-6-hd-8gb-ram-4-4', 'M17 PRO MAX', '128GB, 6.6" HD+, 8GB RAM 4+4 + AUD. INALÁMBRICO', 7449),
  ('m-horse-s26-ultra-max-64gb-6-8-hd-8gb-ram-4-4-a', 'S26 ULTRA MAX', '64GB, 6.8 HD+, 8GB RAM 4+4 + AUD. INALÁMBRICO', 6599),
  ('blu-c9-64gb-6-6-4gb-ram-2-2-huell', 'C9', '64GB, 6.6", 4GB RAM 2+2, HUELLA', 5299),
  ('blu-g45-128gb-6-7-hd-8gb-ram-4-4', 'G45', '128GB, 6.7" HD+, 8GB RAM 4+4, HUELLA', 6999),
  ('alcatel-3l-2026-64gb-6-52-6gb-ram-2-4', 'ALCATEL 3L 2026', '64GB, 6.52", 6GB RAM 2+4', 5699),
  ('alcatel-3-2026-64gb-6-52-9gb-ram-3-6', 'ALCATEL 3 2026', '64GB, 6.52", 9GB RAM 3+6', 5899),
  ('alcatel-a31-prime-128gb-6-52-12gb-ram-4-8', 'ALCATEL A31 PRIME', '128GB, 6.52", 12GB RAM 4+8', 6199),
  ('tcl-605-128gb-6-7-90hz-12gb-ram-4-8', 'TCL 605', '128GB, 6.7" 90HZ, 12GB RAM 4+8, 50MP', 7199),
  ('zte-blade-a35e-64gb-6-52-6gb-ram-2-4', 'BLADE A35E', '64GB, 6.52", 6GB RAM 2+4', 5699),
  ('zte-blade-a36-64gb-6-75-90hz-6gb-ram-2-4', 'BLADE A36', '64GB, 6.75" 90HZ, 6GB RAM 2+4', 6099),
  ('zte-blade-a56-128gb-6-75-hd-12gb-ram-4-8', 'BLADE A56', '128GB, 6.75" HD+, 12GB RAM 4+8', 6999),
  ('zte-blade-a56-pro-128gb-6-75-hd-12gb-ram-4-8', 'BLADE A56 PRO', '128GB, 6.75" HD+, 12GB RAM 4+8, 50MP', 7299),
  ('zte-blade-a75-256gb-6-6-90hz-14gb-ram-4-1', 'BLADE A75', '256GB, 6.6" 90HZ, 14GB RAM 4+10, 50MP', 8199),
  ('zte-nubia-v80-max-buds-256gb-6-9-120hz-14gb-ram-4', 'NUBIA V80 MAX + BUDS', '256GB, 6.9" 120HZ, 14GB RAM 4+10, 6000 MAH', 9299),
  ('cubot-smartwatch-u1-1-93-300mah', 'SMARTWATCH U1', '1.93", 300MAH', 2199),
  ('cubot-smartwatch-c28-2-02-410mah', 'SMARTWATCH C28', '2.02", 410MAH', 2599),
  ('cubot-smartwatch-c29-1-52-410mah', 'SMARTWATCH C29', '1.52", 410MAH', 2599),
  ('cubot-a20-128gb-6-75-hd-90hz-12gb-ra', 'A20', '128GB, 6.75" HD+ 90HZ, 12GB RAM 4+8, PANT. TRASERA 1.23"', 6799),
  ('cubot-a30-128gb-6-75-hd-90hz-16gb-ra', 'A30', '128GB, 6.75" HD+ 90HZ, 16GB RAM 6+10, PANT. TRAS. 1.46"', 7299),
  ('cubot-a40-256gb-6-88-hd-90hz-12gb-ra', 'A40', '256GB, 6.88" HD+ 90HZ, 12GB RAM 4+8', 7799),
  ('cubot-kingkong-es-128gb-6-56-90hz-16gb-ram-6', 'KINGKONG ES', '128GB, 6.56" 90HZ, 16GB RAM 6+10', 8799),
  ('cubot-kingkong-es-3-256gb-6-75-90hz-12gb-ram-6', 'KINGKONG ES 3', '256GB, 6.75" 90HZ, 12GB RAM 6+6', 9799),
  ('cubot-kingkong-ace-2-128gb-6-56-90hz-16gb-ram-6', 'KINGKONG ACE 2', '128GB, 6.56" 90HZ, 16GB RAM 6+10, PANT. TRAS. 1.32"', 8799),
  ('cubot-p90-256gb-6-88-fhd-120hz-24gb', 'P90', '256GB, 6.88" FHD+ 120HZ, 24GB RAM 12+12, PANT, TRAS. 1.72"', 10299),
  ('cubot-x100-256gb-6-88-fhd-120hz-16gb', 'X100', '256GB, 6.88" FHD+ 120HZ, 16GB RAM 8+8, PANT, TRAS. 1.72"', 11799),
  ('cubot-max-5-gaming-256gb-6-95-fhd-144hz-24gb', 'MAX 5 GAMING', '256GB, 6.95" FHD+ 144HZ, 24GB RAM (12+12), DIMENSITY 8200 (4NM), 100MP', 15999),
  ('cubot-kingkong-9-256gb-6-58-fhd-120hz-24gb', 'KINGKONG 9', '256GB, 6.58" FHD+ 120HZ, 24GB RAM 12+12, PANT. TRAS. 1.32", 10600 MAH', 14499),
  ('cubot-kingkong-x-10-5g-256gb-6-58-fhd-120hz-32gb', 'KINGKONG X (10) 5G', '256GB, 6.58" FHD+ 120HZ, 32GB RAM 16+16, PANT. TRAS. 1.85", 10200 MAH', 16499),
  ('cubot-kingkong-11-5g-256gb-6-72-fhd-120hz-32gb', 'KINGKONG 11 5G', '256GB, 6.72" FHD+ 120HZ, 32GB RAM 16+16, PANT. TRAS. 1.46", 10200 MAH', 16499),
  ('cubot-kingkong-power-5-128gb-6-88-fhd-120hz-16gb', 'KINGKONG POWER 5', '128GB, 6.88" FHD+ 120HZ, 16GB RAM 6+10, ALTAVOZ 123DB, FOCO DUAL-LED 1000 LUMENS, ANTORCHA 1200 LUMENS, 15300 MAH', 12699),
  ('cubot-kingkong-ax-5g-256gb-6-58-fhd-120hz-24gb', 'KINGKONG AX 5G', '256GB, 6.58" FHD+ 120HZ, 24GB RAM 12+12, PANT. TRAS. 1.32"', 13199),
  ('oukitel-c1-128gb-6-52-16gb-ram-4-12', 'C1', '128GB, 6.52", 16GB RAM 4+12', 7099),
  ('oukitel-c60-pro-256gb-6-88-24gb-ram-8-16-1', 'C60 PRO', '256GB, 6.88". 24GB RAM 8+16, 10,000MAH, BOCINA ALTOPARLANTE', 10399),
  ('oukitel-c61-128gb-6-88-16gb-ram-4-12', 'C61', '128GB, 6.88". 16GB RAM 4+12', 7999),
  ('oukitel-c61-pro-256gb-6-88-24gb-ram-8-16', 'C61 PRO', '256GB, 6.88". 24GB RAM 8+16', 9199),
  ('oukitel-c62-128gb-6-88-16gb-ram-4-12-d', 'C62', '128GB, 6.88". 16GB RAM 4+12, DOBLE PANTALLA', 8499),
  ('oukitel-c62-gt-gaming-128gb-6-88-16gb-ram-4-12-d', 'C62 GT GAMING', '128GB, 6.88". 16GB RAM 4+12, DOBLE PANTALLA', 8499),
  ('oukitel-c62-pro-256gb-6-88-24gb-ram-8-16-d', 'C62 PRO', '256GB, 6.88". 24GB RAM 8+16, DOBLE PANTALLA', 9899),
  ('oukitel-c68-plus-256gb-7-2-24gb-ram-8-16-do', 'C68 (+) PLUS', '256GB, 7.2", 24GB RAM 8+16, DOBLE PANTALLA, 6000MAH', 10899),
  ('oukitel-c68-plus-512gb-7-2-24gb-ram-8-16-do', 'C68 (+) PLUS', '512GB, 7.2", 24GB RAM 8+16, DOBLE PANTALLA, 6000MAH', 11899),
  ('oukitel-c26-128gb-6-63-90hz-16gb-ram-4', 'C26', '128GB, 6.63" 90HZ, 16GB RAM 4+12', 7499),
  ('oukitel-g3-64gb-6-16gb-ram-4-12', 'G3', '64GB, 6", 16GB RAM 4+12', 7299),
  ('oukitel-g5-64gb-6-16gb-ram-4-12-doble', 'G5', '64GB, 6", 16GB RAM 4+12, DOBLE LINTERNA', 7999),
  ('oukitel-wp28e-64gb-6-52-16gb-ram-4-12', 'WP28E', '64GB, 6.52", 16GB RAM 4+12', 8599),
  ('oukitel-g6-128gb-6-52-16gb-ram-4-12', 'G6', '128GB, 6.52", 16GB RAM 4+12', 9399),
  ('oukitel-g7-128gb-6-52-24gb-ram-8-16', 'G7', '128GB, 6.52", 24GB RAM 8+16', 10799),
  ('oukitel-g7-256gb-6-52-24gb-ram-8-16', 'G7', '256GB, 6.52", 24GB RAM 8+16', 12099),
  ('oukitel-wp23-plus-256gb-6-52-24gb-ram-8-16', 'WP23 PLUS', '256GB, 6.52", 24GB RAM 8+16', 11699),
  ('oukitel-wp53s-128gb-6-52-16gb-ram-4-12-i', 'WP53S', '128GB, 6.52", 16GB RAM 4+12, INCL. BOCINA Y LINTERNA', 10699),
  ('oukitel-wp36-pro-256gb-6-52-24gb-ram-6-18', 'WP36 PRO', '256GB, 6.52", 24GB RAM 6+18', 11699),
  ('oukitel-wp50-5g-256gb-6-6-16gb-ram-4-12', 'WP50 5G', '256GB, 6.6", 16GB RAM 4+12', 11699),
  ('oukitel-wp39-5g-256gb-6-52-24gb-ram-6-18', 'WP39 5G', '256GB, 6.52", 24GB RAM 6+18', 14999),
  ('oukitel-wp39-pro-512gb-6-6-fhd-120hz-36gb-r', 'WP39 PRO', '512GB, 6.6" FHD+ 120HZ, 36GB RAM 12+24, 11000MAH', 17199),
  ('oukitel-wp55-pro-512gb-6-6-fhd-120hz-48gb-r', 'WP55 PRO', '512GB, 6.6" FHD+ 120HZ, 48GB RAM 16+32, 11000MAH', 19699),
  ('oukitel-wp33-pro-256gb-6-6-24gb-ram-8-16-22', 'WP33 PRO', '256GB, 6.6", 24GB RAM 8+16, 22000 MAH', 19199),
  ('oukitel-wp56-5g-512gb-6-8-120hz-36gb-ram-12', 'WP56 5G', '512GB, 6.8" 120HZ, 36GB RAM 12+24, 108MP, 16000 MAH, BOCINA ALTOPARLANTE Y LINTERNA INTEGRADA', 21199),
  ('oukitel-wp60-gt-5g-256gb-7-2-120hz-24gb-ram-8', 'WP60 GT 5G', '256GB, 7.2" 120HZ, 24GB RAM 8+16, 108MP, 10000 MAH', 17799),
  ('oukitel-wp300-512gb-6-78-120hz-36gb-ram-1', 'WP300', '512GB, 6.78" 120HZ, 36GB RAM 12+24, INCL. RELOJ-AUDIFONO-LINTERNA ADAPTABLE', 23499),
  ('oukitel-wp200-pro-5g-1tb-1000gb-6-78-120hz-72g', 'WP200 PRO 5G', '1TB "1000GB", 6.78" 120HZ, 72GB RAM 24+48, INCL. RELOJ-AUDIFONO ADAPTABLE', 33799),
  ('oukitel-wp100-titan-5g-512gb-6-8-120hz-48gb-ram-16', 'WP100 TITAN 5G', '512GB, 6.8" 120HZ, 48GB RAM 16+32, 200MP, 33000 MAH, INCL. LINTERNA Y PROYECTOR INTEGRADO', 39007),
  ('itel-a50c-s-64gb-6-6-90hz-6gb-ram-2-4', 'A50C S', '64GB, 6.6" 90HZ, 6GB RAM 2+4', 5699),
  ('itel-a100c-64gb-6-6-90hz-8gb-ram-3-5', 'A100C', '64GB, 6.6" 90HZ, 8GB RAM 3+5', 5699),
  ('itel-a100c-128gb-6-6-90hz-8gb-ram-3-5', 'A100C', '128GB, 6.6" 90HZ, 8GB RAM 3+5', 6299),
  ('itel-city-100-256gb-6-75-90hz-12gb-ram-4', 'CITY 100', '256GB. 6.75" 90HZ, 12GB RAM 4+8, IP64', 7099),
  ('itel-a200-64gb-6-75-120hz-8gb-ram-3-5', 'A200', '64GB, 6.75" 120HZ, 8GB RAM 3+5, IP65', 6799),
  ('tecno-spark-40-pro-abanico-256gb-6-78-144hz-16gb-ram-8', 'SPARK 40 PRO + ABANICO', '256GB, 6.78" 144HZ, 16GB RAM 8+8', 11999),
  ('tecno-camon-40-pro-bocina-bt-256gb-6-78-144hz-16gb-ram-8', 'CAMON 40 PRO + BOCINA BT', '256GB, 6.78" 144HZ, 16GB RAM 8+8', 15499),
  ('motorola-moto-g06-64gb-6-88-120hz-12gb-ram-4', 'MOTO G06', '64GB, 6.88" 120HZ, 12GB RAM 4+8, 50MP, 5200MAH', 6799),
  ('motorola-moto-g06-128gb-6-88-120hz-12gb-ram-4', 'MOTO G06', '128GB, 6.88" 120HZ, 12GB RAM 4+8, 50MP, 5200MAH', 7499),
  ('motorola-moto-g06-256gb-6-88-120hz-12gb-ram-4', 'MOTO G06', '256GB, 6.88" 120HZ, 12GB RAM 4+8, 50MP, 5200MAH', 7999),
  ('motorola-moto-g15-128gb-6-72-120hz-12gb-ram-4', 'MOTO G15', '128GB, 6.72" 120HZ, 12GB RAM 4+8, 50MP, 5200MAH', 7999),
  ('motorola-moto-g15-256gb-6-72-120hz-12gb-ram-4', 'MOTO G15', '256GB, 6.72" 120HZ, 12GB RAM 4+8, 50MP, 5200MAH', 8499),
  ('motorola-moto-g35-5g-256gb-6-72-fhd-120hz-16gb', 'MOTO G35 5G', '256GB, 6.72" FHD+ 120HZ, 16GB RAM 8+8', 10799),
  ('motorola-moto-g56-5g-256gb-6-72-fhd-120hz-24gb', 'MOTO G56 5G', '256GB, 6.72" FHD+ 120HZ, 24GB RAM 8+16', 12999),
  ('motorola-moto-g17-power-256gb-6-8-fhd-120hz-16gb-r', 'MOTO G17 POWER', '256GB, 6.8" FHD+ 120HZ, 16GB RAM 8+8, 6000MAH', 13999),
  ('motorola-moto-edge-60-fusion-5g-256gb-6-67-120hz-16gb-ram-8', 'MOTO EDGE 60 FUSION 5G', '256GB, 6.67" 120HZ, 16GB RAM 8+8', 17999),
  ('motorola-moto-edge-70-fusion-5g-256gb-6-78-amoled-144hz-16g', 'MOTO EDGE 70 FUSION 5G', '256GB, 6.78" AMOLED 144HZ, 16GB RAM 8+8', 24299),
  ('xiaomi-smart-camera-c200', 'SMART CAMERA C200', '', 3124),
  ('xiaomi-smart-camera-c301', 'SMART CAMERA C301', '', 3499),
  ('xiaomi-smart-camera-c300-dual', 'SMART CAMERA C300 DUAL', '', 4749),
  ('xiaomi-redmi-buds-6-lite', 'REDMI BUDS 6 LITE', '', 2299),
  ('xiaomi-smart-band-9-active', 'SMART BAND 9 ACTIVE', '', 2599),
  ('xiaomi-smart-band-10-2026', 'SMART BAND 10 2026', '', 4499),
  ('xiaomi-redmi-a5-64gb-6-88-120hz-6gb-ram-3-3', 'REDMI A5', '64GB, 6.88" 120HZ, 6GB RAM 3+3', 6499),
  ('xiaomi-redmi-a7-pro-64gb-6-9-120hz-8gb-ram-4-4', 'REDMI A7 PRO', '64GB, 6.9" 120HZ, 8GB RAM 4+4, 6000 MAH', 7299),
  ('xiaomi-redmi-a7-pro-128gb-6-9-120hz-8gb-ram-4-4', 'REDMI A7 PRO', '128GB, 6.9" 120HZ, 8GB RAM 4+4, 6000 MAH', 7799),
  ('xiaomi-redmi-15c-128gb-6-9-120hz-8gb-ram-4-4', 'REDMI 15C', '128GB, 6.9" 120HZ, 8GB RAM 4+4', 7799),
  ('xiaomi-redmi-15c-256gb-6-9-120hz-8gb-ram-4-4', 'REDMI 15C', '256GB, 6.9" 120HZ, 8GB RAM 4+4', 8799),
  ('xiaomi-redmi-15-256gb-6-9-fhd-144hz-16gb-r', 'REDMI 15', '256GB, 6.9" FHD+ 144HZ, 16GB RAM 8+8, 7000MAH', 11499),
  ('xiaomi-note-13-pro-256gb-6-67-8gb-ram', 'NOTE 13 PRO', '256GB, 6.67", 8GB RAM', 13499),
  ('xiaomi-note-14-256gb-6-67-120hz-8gb-ram', 'NOTE 14', '256GB, 6.67" 120HZ, 8GB RAM', 11799),
  ('xiaomi-note-15-128gb-6-77-amoled-120hz-6gb', 'NOTE 15', '128GB, 6.77" AMOLED 120HZ, 6GB RAM', 11799),
  ('xiaomi-note-15-256gb-6-77-amoled-120hz-8gb', 'NOTE 15', '256GB, 6.77" AMOLED 120HZ, 8GB RAM', 13299),
  ('xiaomi-note-15-pro-256gb-6-77-amoled-120hz-8gb', 'NOTE 15 PRO', '256GB, 6.77" AMOLED 120HZ, 8GB RAM, 200MP', 17799),
  ('xiaomi-note-15-pro-5g-256gb-6-83-amoled-120hz-8gb', 'NOTE 15 PRO 5G', '256GB, 6.83" AMOLED 120HZ, 8GB RAM, 200MP', 19799),
  ('xiaomi-note-15-pro-5g-512gb-6-83-amoled-120hz-8gb', 'NOTE 15 PRO 5G', '512GB, 6.83" AMOLED 120HZ, 8GB RAM, 200MP', 21299),
  ('xiaomi-note-15-pro-plus-5g-256gb-6-83-amoled-120hz-8gb', 'NOTE 15 PRO (+) PLUS 5G', '256GB, 6.83" AMOLED 120HZ, 8GB RAM, 200MP', 24299),
  ('xiaomi-note-15-pro-plus-5g-512gb-6-83-amoled-120hz-12g', 'NOTE 15 PRO (+) PLUS 5G', '512GB, 6.83" AMOLED 120HZ, 12GB RAM, 200MP', 27299),
  ('xiaomi-poco-m7-256gb-6-9-144hz-16gb-ram-8', 'POCO M7', '256GB, 6.9" 144HZ, 16GB RAM 8+8, 7000MAH', 11299),
  ('xiaomi-poco-x7-pro-5g-512gb-6-67-120hz-12gb-ram', 'POCO X7 PRO 5G', '512GB, 6.67" 120HZ, 12GB RAM', 23799),
  ('xiaomi-poco-x8-pro-5g-256gb-6-59-amoled-120hz-16g', 'POCO X8 PRO 5G', '256GB, 6.59" AMOLED 120HZ, 16GB RAM 8+8, 6500 MAH', 21799),
  ('xiaomi-poco-x8-pro-5g-512gb-6-59-amoled-120hz-24g', 'POCO X8 PRO 5G', '512GB, 6.59" AMOLED 120HZ, 24GB RAM 12+12, 6500 MAH', 25299),
  ('xiaomi-poco-x8-pro-5g-iron-man-edition-512gb-6-59-amoled-120hz-24g', 'POCO X8 PRO 5G "IRON MAN EDITION"', '512GB, 6.59" AMOLED 120HZ, 24GB RAM 12+12, 6500 MAH', 29799),
  ('xiaomi-poco-x8-pro-max-5g-512gb-6-83-amoled-120hz-24g', 'POCO X8 PRO MAX 5G', '512GB, 6.83" AMOLED 120HZ, 24GB RAM 12+12, 8500 MAH', 32299),
  ('honor-buds-x7-lite', 'BUDS X7 LITE', '', 2299),
  ('honor-earbuds-clip', 'EARBUDS CLIP', '', 4299),
  ('honor-play-10-64gb-6-74-90hz-6gb-ram-3-3', 'PLAY 10', '64GB, 6.74" 90HZ, 6GB RAM 3+3', 5999),
  ('honor-x5d-64gb-6-74-90hz-8gb-ram-4-4', 'X5D', '64GB, 6.74" 90HZ, 8GB RAM 4+4', 7799),
  ('honor-x5d-128gb-6-74-90hz-8gb-ram-4-4', 'X5D', '128GB, 6.74" 90HZ, 8GB RAM 4+4', 8499),
  ('honor-x6c-256gb-6-61-120hz-12gb-ram-6', 'X6C', '256GB, 6.61" 120HZ, 12GB RAM 6+6', 10299),
  ('honor-x7d-5g-256gb-6-77-120hz-12gb-ram-6', 'X7D 5G', '256GB, 6.77" 120HZ, 12GB RAM 6+6', 13199),
  ('honor-x8c-512gb-6-7-amoled-120hz-16gb', 'X8C', '512GB, 6.7" AMOLED 120HZ, 16GB RAM 8+8', 14199),
  ('honor-400-smart-5g-256gb-6-77-120hz-16gb-ram-8', '400 SMART 5G', '256GB, 6.77" 120HZ, 16GB RAM 8+8, 50MP', 14799),
  ('honor-400-lite-5g-256gb-6-7-amoled-128hz-16gb', '400 LITE 5G', '256GB, 6.7" AMOLED 128HZ, 16GB RAM 8+8, 108MP', 17299),
  ('honor-magic-8-lite-5g-256gb-6-79-amoled-120hz-16gb-ram-8-8-108mp-8-300-mah-honor', 'MAGIC 8 LITE 5G (256GB, 6.79" AMOLED 120HZ, 16GB RAM 8+8, 108MP, 8,300 MAH) + HONOR BUDS X7 LITE', '', 22799),
  ('honor-magic-7-pro-512gb-6-8-amoled-120hz-12gb', 'MAGIC 7 PRO', '512GB, 6.8" AMOLED 120HZ, 12GB RAM', 63599),
  ('samsung-galaxy-buds-3-2026', 'GALAXY BUDS 3 2026', '', 7299),
  ('samsung-galaxy-a06-tpa-gto-64gb-6-7-4gb-ram', 'GALAXY A06 TPA/GTO', '64GB, 6.7, 4GB RAM', 6499),
  ('samsung-galaxy-f07-eu-64gb-6-7-90hz-4gb-ram-50mp', 'GALAXY F07 EU', '64GB, 6.7 90HZ, 4GB RAM, 50MP', 6799),
  ('samsung-galaxy-a07-tpa-gto-64gb-6-7-90hz-4gb-ram-50mp', 'GALAXY A07 TPA/GTO', '64GB, 6.7 90HZ, 4GB RAM, 50MP', 7299),
  ('samsung-galaxy-a16-tpa-gto-128gb-6-7-amoled-90hz-4gb-r', 'GALAXY A16 TPA/GTO', '128GB, 6.7" AMOLED 90HZ, 4GB RAM', 9299),
  ('samsung-galaxy-a17-tpa-gto-128gb-6-7-amoled-90hz-4gb-r', 'GALAXY A17 TPA/GTO', '128GB, 6.7" AMOLED 90HZ, 4GB RAM', 10299),
  ('samsung-galaxy-a17-tpa-gto-128gb-6-7-amoled-90hz-6gb-r', 'GALAXY A17 TPA/GTO', '128GB, 6.7" AMOLED 90HZ, 6GB RAM', 10799),
  ('samsung-galaxy-a17-tpa-gto-256gb-6-7-amoled-90hz-8gb-r', 'GALAXY A17 TPA/GTO', '256GB, 6.7" AMOLED 90HZ, 8GB RAM', 14299),
  ('samsung-galaxy-a27-5g-tpa-gto-128gb-6-7-amoled-120hz-6gb', 'GALAXY A27 5G TPA/GTO', '128GB, 6.7" AMOLED 120HZ, 6GB RAM', 16299),
  ('samsung-galaxy-a27-5g-tpa-gto-256gb-6-7-amoled-120hz-8gb', 'GALAXY A27 5G TPA/GTO', '256GB, 6.7" AMOLED 120HZ, 8GB RAM', 20799),
  ('samsung-galaxy-a37-5g-tpa-gto-256gb-6-7-amoled-120hz-8gb', 'GALAXY A37 5G TPA/GTO', '256GB, 6.7" AMOLED 120HZ, 8GB RAM', 23499),
  ('samsung-galaxy-a57-5g-tpa-gto-256gb-6-7-amoled-120hz-16gb', 'GALAXY A57 5G TPA/GTO', '256GB, 6.7" AMOLED 120HZ, 16GB RAM 8+8', 28499),
  ('samsung-galaxy-s26-ultra-tpa-gto-ds-256gb-6-9-12gb-ram', 'GALAXY S26 ULTRA TPA/GTO DS', '256GB, 6.9", 12GB RAM', 69959),
  ('samsung-galaxy-s26-ultra-tpa-gto-ds-512gb-6-9-12gb-ram', 'GALAXY S26 ULTRA TPA/GTO DS', '512GB, 6.9", 12GB RAM', 77379),
  ('samsung-galaxy-s26-ultra-tpa-gto-ds-1tb-6-9-16gb-ram', 'GALAXY S26 ULTRA TPA/GTO DS', '1TB, 6.9", 16GB RAM', 93279),
  ('unv-camara-unv-color-hunter-1080p-2mp-audio-2mp', 'CAMARA UNV COLOR HUNTER 1080P 2MP + AUDIO', '2MP', 1119),
  ('unv-camara-unv-color-hunter-1080p-5mp-audio-5mp', 'CAMARA UNV COLOR HUNTER 1080P 5MP +  AUDIO', '5MP', 1244),
  ('unv-camara-unv-pt-1080p-2mp-2mp', 'CAMARA UNV PT 1080P 2MP', '2MP', 2869),
  ('unv-camara-unv-metal-40mt-color-hunter-2mp-audio-2mp', 'CAMARA UNV METAL 40MT COLOR HUNTER 2MP + AUDIO', '2MP', 1494),
  ('unv-dvr-unv-4-canales-lite-4-canales', 'DVR UNV 4 CANALES LITE', '4 CANALES', 2562),
  ('unv-dvr-unv-4-canales-full-4-canales', 'DVR UNV 4 CANALES FULL', '4 CANALES', 3181),
  ('unv-dvr-unv-8-canales-lite-8-canales', 'DVR UNV 8 CANALES LITE', '8 CANALES', 3244),
  ('unv-dvr-unv-8-canales-full-8-canales', 'DVR UNV 8 CANALES FULL', '8 CANALES', 3688),
  ('unv-dvr-unv-16-canales-lite-16-canales', 'DVR UNV 16 CANALES LITE', '16 CANALES', 4744),
  ('unv-dvr-unv-16-canales-full-16-canales', 'DVR UNV 16 CANALES FULL', '16 CANALES', 5688),
  ('unv-dvr-unv-32-canales-full-32-canales', 'DVR UNV 32 CANALES FULL', '32 CANALES', 24994),
  ('unv-camara-ip-unv-color-h-2mp-audo-2mp', 'CAMARA IP UNV COLOR H. 2MP + AUDO', '2MP', 4494),
  ('unv-camara-ip-unv-color-h-4mp-audo-4mp', 'CAMARA IP UNV COLOR H. 4MP + AUDO', '4MP', 5869),
  ('unv-camara-ip-unv-color-hunter-8mp-audio-8mp', 'CAMARA IP UNV COLOR HUNTER 8MP + AUDIO', '8MP', 8119),
  ('unv-camara-ip-unv-5mp-base-audio-y-altavoz-metal-5mp', 'CAMARA IP UNV 5MP + BASE AUDIO Y ALTAVOZ METAL', '5MP', 6244),
  ('unv-camara-ip-unv-2mp-dual-light-eco-series-audio-2mp', 'CAMARA IP UNV 2MP DUAL LIGHT ECO SERIES + AUDIO', '2MP', 2431),
  ('unv-camara-ip-unv-4mp-dual-light-eco-series-audio-4mp', 'CAMARA IP UNV 4MP DUAL LIGHT ECO SERIES + AUDIO', '4MP', 2938),
  ('unv-nvr-unv-8-canales-todos-poe-8-canales', 'NVR UNV 8 CANALES TODOS POE', '8 CANALES', 11812),
  ('unv-nvr-unv-16-canales-todos-poe-16-canales', 'NVR UNV 16 CANALES TODOS POE', '16 CANALES', 16244),
  ('unv-nvr-unv-32-canales-16-puertos-poe-32-canales-16-puertos', 'NVR UNV 32 CANALES 16 PUERTOS POE', '32 CANALES, 16 PUERTOS', 44244),
  ('unv-nvr-unv-64-canales-8-bahia-de-hasta-10tb-64-canales-10tb', 'NVR UNV 64 CANALES 8 BAHIA DE HASTA 10TB', '64 CANALES, 10TB', 58994),
  ('unv-nvr-unv-256-canales-24-bahia-16tb-256-canales-16tb', 'NVR UNV 256 CANALES 24 BAHIA 16TB', '256 CANALES, 16TB', 145625),
  ('epcom-camara-epcom-audio-bidireccional-color-1080p-2mp-2mp', 'CAMARA EPCOM AUDIO BIDIRECCIONAL COLOR 1080P 2MP', '2MP', 2119),
  ('epcom-camara-pt-analogica-giratoria-2mp-audio-bidireccional-2mp', 'CAMARA PT ANALOGICA GIRATORIA 2MP AUDIO BIDIRECCIONAL', '2MP', 2244),
  ('epcom-camara-epcom-color-audio-40-metros-1080p-2mp-2mp', 'CAMARA EPCOM COLOR + AUDIO 40 METROS 1080P 2MP', '2MP', 2244),
  ('epcom-camara-epcom-1080p-2mp-con-luz-de-emergencia-rojo-y-azul-y-sirena-integrad', 'CAMARA EPCOM  1080P 2MP CON LUZ DE EMERGENCIA ROJO Y AZUL Y SIRENA INTEGRADA', '2MP', 2188),
  ('epcom-dvr-16-canales-epcom-turbo-hd-2-via-audio-reconocimiento-facial-3k-4-puert', 'DVR 16 CANALES EPCOM TURBO HD 2 VIA AUDIO, RECONOCIMIENTO FACIAL  3K 4 PUERTOS IP', '16 CANALES, 4 PUERTOS', 14000),
  ('epcom-dvr-epcom-4-canales-lite-4-canales', 'DVR EPCOM 4 CANALES LITE', '4 CANALES', 2375),
  ('epcom-dvr-epcom-8-canales-lite-8-canales', 'DVR EPCOM 8 CANALES LITE', '8 CANALES', 3244),
  ('epcom-camara-ip-epcom-dual-light-audio-30m-1080p-2mp-2mp', 'CAMARA IP EPCOM DUAL LIGHT + AUDIO 30M 1080P 2MP', '2MP', 3312),
  ('epcom-camara-ip-epcom-dual-light-audio-30m-1080p-4mp-4mp', 'CAMARA IP EPCOM DUAL LIGHT + AUDIO 30M 1080P 4MP', '4MP', 4312),
  ('epcom-nvr-epcom-8-canales-todo-poe-8mp-8mp-8-canales', 'NVR EPCOM 8 CANALES TODO POE 8MP', '8MP, 8 CANALES', 9369),
  ('epcom-nvr-epcom-16-canales-todo-poe-8mp-8mp-16-canales', 'NVR EPCOM 16 CANALES TODO POE 8MP', '8MP, 16 CANALES', 14869),
  ('epcom-intercom-epcom-ip67-ac-k2vp', 'INTERCOM EPCOM IP67 AC-K2VP', '', 6094),
  ('epcom-camara-bullet-analoga-dahua-audio-color-dual-ligth-2mp-2mp', 'CAMARA BULLET ANALOGA DAHUA + AUDIO + COLOR DUAL LIGTH 2MP', '2MP', 869),
  ('epcom-camara-domo-analoga-dahua-audio-color-dual-ligth-2mp-2mp', 'CAMARA DOMO  ANALOGA DAHUA + AUDIO + COLOR DUAL LIGTH 2MP', '2MP', 869),
  ('epcom-dvr-8-canales-dahua-audio-bidireccional-8-canales', 'DVR 8 CANALES DAHUA + AUDIO BIDIRECCIONAL', '8 CANALES', 4119),
  ('hilook-camara-hilook-1080p-2mp-dual-light-audio-2mp', 'CAMARA HILOOK 1080P 2MP DUAL LIGHT + AUDIO', '2MP', 1119),
  ('hilook-camara-hilook-1080p-2-mp-metal-40-metros-color-2mp', 'CAMARA HILOOK 1080P 2 MP METAL 40 METROS COLOR', '2MP', 2369),
  ('hikvision-camara-ip-hikvision-1080p-4mp-wifi-no-poe-4mp', 'CAMARA IP HIKVISION 1080P 4MP + WIFI NO POE', '4MP', 3619),
  ('hikvision-camara-ip-hikvision-ip-pt-4mp-4mp', 'CAMARA IP HIKVISION IP,PT,4MP', '4MP', 4188),
  ('hikvision-nvr-hikvision-8ch-poe', 'NVR HIKVISION 8CH POE', '', 9375),
  ('hikvision-nvr-hikvision-16ch-poe', 'NVR HIKVISION 16CH POE', '', 16188),
  ('hilook-dvr-4-canales-hilook-4-canales', 'DVR 4 CANALES HILOOK', '4 CANALES', 2494),
  ('hilook-dvr-8-canales-hilook-8-canales', 'DVR 8 CANALES HILOOK', '8 CANALES', 3875),
  ('hikvision-dvr-8-canales-audio-bidireccional-hikvision-8-canales', 'DVR 8 CANALES AUDIO BIDIRECCIONAL HIKVISION', '8 CANALES', 4494),
  ('hikvision-kit-alarma-hikvision-ax-pro-inalambrica', 'KIT ALARMA HIKVISION AX-PRO INALAMBRICA', '', 9994),
  ('hikvision-sensor-inalambrico-movimiento-para-alarma-ax-pro-ds-pd15p-eg2-wb', 'SENSOR INALAMBRICO MOVIMIENTO  PARA ALARMA AX-PRO (DS-PD15P-EG2-WB)', '', 2244),
  ('hikvision-sensor-inalambrico-ventana-para-alarma-ax-pro-ds-pdmc-eg2-wb', 'SENSOR INALAMBRICO VENTANA PARA ALARMA AX-PRO (DS-PDMC-EG2-WB)', '', 1562),
  ('hikvision-sensor-de-contacto-magnetico-delgado-inalambrico-ax-pro-ds-pdmcs-eg2-w', 'SENSOR DE CONTACTO MAGNETICO DELGADO INALAMBRICO AX PRO DS-PDMCS-EG2-WB(B)', '', 1500),
  ('hikvision-sirena-interna-inalambrica-hikvision-para-ax-pro', 'SIRENA INTERNA INALAMBRICA HIKVISION PARA AX PRO', '', 2938),
  ('hikvision-sirena-externa-inalambrica-hikvision-para-ax-pro', 'SIRENA EXTERNA INALAMBRICA HIKVISION PARA AX PRO', '', 4869),
  ('hikvision-kit-alarma-hikvision-ax-home-inalambrica', 'KIT ALARMA HIKVISION AX-HOME INALAMBRICA', '', 8744),
  ('hikvision-sensor-de-movimiento-alambrico-para-ax-home-ds-pdp18-eg2', 'SENSOR DE MOVIMIENTO ALAMBRICO PARA  AX HOME (DS-PDP18-EG2)', '', 1531),
  ('hikvision-sensor-de-contacto-inalambrico-para-alarma-ax-home-pd201mc-wp', 'SENSOR DE CONTACTO INALAMBRICO PARA ALARMA AX-HOME (PD201MC-WP)', '', 1562),
  ('hikvision-sensor-de-magnetico-para-puertas-y-ventanas-hikvision-ds-pd1-mc-ws', 'SENSOR DE MAGNETICO PARA PUERTAS Y VENTANAS HIKVISION (DS-PD1-MC-WS)', '', 188),
  ('hikvision-sirena-interna-inalambrica-marca-hikvision-para-ax-home', 'SIRENA INTERNA INALAMBRICA MARCA HIKVISION PARA AX HOME', '', 1994),
  ('hikvision-sirena-de-estrobo-cableada-hikvision', 'SIRENA DE ESTROBO CABLEADA HIKVISION', '', 1188),
  ('hikvision-intercom-ip-hikvision-ds-kis606-p', 'INTERCOM  IP HIKVISION DS-KIS606-P', '', 12250),
  ('generic-control-de-acceso-y-asistencia', 'CONTROL DE ACCESO Y ASISTENCIA', '', 4994),
  ('generic-kit-control-de-acceso-con-huella', 'KIT CONTROL DE ACCESO CON HUELLA', '', 8125),
  ('generic-control-de-acceso-con-huella', 'CONTROL DE ACCESO CON HUELLA', '', 7100),
  ('hikvision-intercom-analogo-hikvision', 'INTERCOM ANALOGO HIKVISION', '', 2494),
  ('ezviz-camara-ezviz-h1c', 'CAMARA EZVIZ H1C', '', 1994),
  ('ezviz-camra-ezviz-h4', 'CAMRA EZVIZ H4', '', 4119),
  ('ezviz-camara-ezviz-h6c', 'CAMARA EZVIZ H6C', '', 2344),
  ('ezviz-camara-ezviz-h6c-pro', 'CAMARA EZVIZ H6C PRO', '', 2869),
  ('ezviz-camara-ezviz-h3c', 'CAMARA EZVIZ H3C', '', 3119),
  ('ezviz-camara-ezviz-h3', 'CAMARA EZVIZ H3', '', 5775),
  ('ezviz-camara-ezviz-cb8-lite-recargable-2k-panel', 'CAMARA EZVIZ CB8 LITE RECARGABLE 2k + PANEL', '', 6938),
  ('ezviz-camara-ezviz-cb8-lite-recargable-4k-panel', 'CAMARA EZVIZ CB8 LITE RECARGABLE 4k + PANEL', '', 10369),
  ('ezviz-camara-ezviz-h8c-pro-2k', 'CAMARA EZVIZ H8C PRO 2K', '', 3562),
  ('ezviz-camara-ezviz-secreta-con-iman-bc2-recargable', 'CAMARA EZVIZ SECRETA CON IMAN BC2 RECARGABLE', '', 4619),
  ('ezviz-camara-ezviz-h9c', 'CAMARA EZVIZ H9C', '', 5744),
  ('ezviz-camara-ezviz-eb3-bateria-integrada-exterior', 'CAMARA EZVIZ EB3 BATERIA INTEGRADA EXTERIOR', '', 6869),
  ('ezviz-video-portero-ezviz-hp7', 'VIDEO PORTERO EZVIZ HP7', '', 12494),
  ('ezviz-video-portero-ezviz-hp4', 'VIDEO PORTERO EZVIZ HP4', '', 5619),
  ('ezviz-nvr-ezviz-8w', 'NVR EZVIZ 8W', '', 3744),
  ('dmtech-cable-utp-cat-6-exterior-blindado-dmtech-1-000pie', 'CABLE UTP CAT 6 EXTERIOR BLINDADO DMTECH 1,000PIE', '', 4495),
  ('linked-pro-rollo-cable-exterior-linked-pro-cat-5-1-000pie', 'ROLLO CABLE EXTERIOR LINKED PRO CAT 5 1,000PIE', '', 4795),
  ('linked-pro-cable-utp-linked-pro-blanco-cat-5e-1-000pie', 'CABLE UTP LINKED PRO BLANCO CAT 5E 1,000PIE', '', 3795),
  ('linked-pro-cable-22-04-multifibra-1-000-pie-linked-pro', 'CABLE 22-04 MULTIFIBRA 1,000 PIE LINKED PRO', '', 3795),
  ('dmtech-cable-22-04-multifibra-dmtech-500-pie', 'CABLE 22-04 MULTIFIBRA DMTECH 500 PIE', '', 3095),
  ('eseenet-cable-22-4-multifibra-eseenet-100-cobre-500ft', 'CABLE 22-4 MULTIFIBRA ESEENET 100% COBRE 500FT', '', 4250),
  ('generic-cable-utp-cat-5e-blanco-320-pie', 'CABLE UTP CAT 5E BLANCO 320 PIE', '', 1795),
  ('epcom-cable-utp-cat5-epcom-blanco-1000ft', 'CABLE UTP CAT5 EPCOM BLANCO 1000FT', '', 3795),
  ('generic-cable-utp-cat-5e-blanco-1000-pie', 'CABLE UTP CAT 5E BLANCO 1000 PIE', '', 3395),
  ('generic-cable-utp-cat-5-100-cobre-blanco-1000-pie-nexxt', 'CABLE UTP CAT 5 100% COBRE BLANCO  1000 PIE NEXXT', '', 6795),
  ('generic-cable-utp-cat-6-blanco-1000-pie', 'CABLE UTP CAT 6 BLANCO 1000 PIE', '', 3850),
  ('generic-cable-utp-cat-6-blanco-320-pie', 'CABLE UTP CAT 6 BLANCO 320 PIE', '', 1995),
  ('generic-cable-utp-cat-6-blanco-500-pie', 'CABLE UTP CAT 6 BLANCO 500 PIE', '', 3150),
  ('generic-cable-utp-cat-6-100-cobre-blanco-1000-pie-nexxt', 'CABLE UTP CAT 6 100% COBRE BLANCO  1000 PIE NEXXT', '', 12345),
  ('fast-cable-cable-utp-cat-5-1000pie-color-negro-interior-fast-cable', 'CABLE UTP CAT 5 1000PIE COLOR NEGRO INTERIOR FAST CABLE', '', 3250),
  ('generic-punto-de-acceso-tp-link-deco-pack-3', 'PUNTO DE ACCESO TP-LINK DECO PACK 3', '', 7495),
  ('mercusys-router-halo-h30-pack-3-5ghz-1200mbps-mercusys', 'ROUTER HALO H30 PACK 3 5Ghz 1200MBPS MERCUSYS', '', 5150),
  ('mercusys-router-halo-h50g-pack-3-1900mbps-5ghz-mercusys', 'ROUTER HALO H50G PACK 3 1900MBPS 5Ghz MERCUSYS', '', 6950),
  ('generic-repetidor-4-antenas-nini-size-4-antenas', 'REPETIDOR 4 ANTENAS NINI SIZE', '4 ANTENAS', 7450),
  ('mercusys-router-mercusys-3-antenas-3-antenas', 'ROUTER MERCUSYS 3 ANTENAS', '3 ANTENAS', 2550),
  ('hikvision-router-hikvision-2-antenas-2-antenas', 'ROUTER HIKVISION 2 ANTENAS', '2 ANTENAS', 1795),
  ('hikvision-router-hikvision-4-antenas-4-antenas', 'ROUTER HIKVISION 4 ANTENAS', '4 ANTENAS', 2575),
  ('agiler-patch-panel-agiler-de-24-puertos-cat6-1u-24-puertos', 'PATCH PANEL AGILER DE 24 PUERTOS, CAT6, 1U', '24 PUERTOS', 1925),
  ('agiler-patch-panel-agiler-de-48-puertos-cat6-2u-48-puertos', 'PATCH PANEL AGILER DE 48 PUERTOS, CAT6, 2U', '48 PUERTOS', 3295),
  ('generic-switch-5-puertos-5-puertos', 'SWITCH 5 PUERTOS', '5 PUERTOS', 1275),
  ('generic-switch-8-puertos-8-puertos', 'SWITCH 8 PUERTOS', '8 PUERTOS', 1595),
  ('generic-switch-poe-4-puertos-4-puertos', 'SWITCH POE 4 PUERTOS', '4 PUERTOS', 2995),
  ('generic-switch-poe-8-puertos-8-puertos', 'SWITCH POE 8 PUERTOS', '8 PUERTOS', 3495),
  ('generic-switch-poe-16-puertos-16-puertos', 'SWITCH POE 16 PUERTOS', '16 PUERTOS', 5495),
  ('generic-switch-poe-24-puertos-24-puertos', 'SWITCH POE 24 PUERTOS', '24 PUERTOS', 9995),
  ('generic-probador-red-dj45', 'PROBADOR RED DJ45', '', 1525),
  ('generic-kit-de-red', 'KIT DE RED', '', 2695),
  ('generic-probador-y-rastreador-de-cable-de-red-wire-tracker', 'PROBADOR Y RASTREADOR DE CABLE DE RED - WIRE TRACKER', '', 1850),
  ('generic-clonador-lector-clonador-rfid-portatil-de-125-khz', 'CLONADOR-LECTOR-CLONADOR RFID PORTATIL DE 125 Khz', '', 1650),
  ('generic-pinza-rj45-pass-through', 'PINZA RJ45 PASS THROUGH', '', 1595),
  ('generic-gabinete-2u', 'GABINETE 2U', '', 3095),
  ('generic-gabinete-4u', 'GABINETE 4U', '', 4395),
  ('generic-gabinete-6u', 'GABINETE 6U', '', 4895),
  ('generic-gabinete-12u', 'GABINETE 12U', '', 6995),
  ('generic-gabinete-27u', 'GABINETE 27U', '', 33500),
  ('generic-gabinete-42u', 'GABINETE 42U', '', 58995),
  ('generic-u-braket', 'U BRAKET', '', 406),
  ('generic-zl-braket', 'ZL BRAKET', '', 744),
  ('generic-magneto-350lb', 'MAGNETO 350LB', '', 1119),
  ('generic-boton-metal', 'BOTON METAL', '', 619),
  ('generic-boton-no-touch-2x4-incrustable', 'BOTON NO TOUCH 2X4 INCRUSTABLE', '', 481),
  ('generic-botor-no-touch-superficie', 'BOTOR NO TOUCH SUPERFICIE', '', 619),
  ('generic-boton-no-touch-con-receptora-y-controles', 'BOTON NO TOUCH CON RECEPTORA Y CONTROLES', '', 994),
  ('dmtech-cerradura-smart-deluxe-dmtech', 'CERRADURA SMART DELUXE DMTECH', '', 9562),
  ('generic-power-supply-control-de-acceso', 'POWER SUPPLY CONTROL DE ACCESO', '', 1119),
  ('generic-botonera-t11', 'BOTONERA T11', '', 812),
  ('generic-cerradura-electrica-para-puerta-de-hierro', 'CERRADURA ELECTRICA PARA PUERTA DE HIERRO', '', 1688),
  ('generic-cerradura-smart-electrica-para-puerta-de-hierro', 'CERRADURA SMART  ELECTRICA PARA PUERTA DE HIERRO', '', 2244),
  ('generic-cerradura-pivote', 'CERRADURA PIVOTE', '', 1994),
  ('generic-kit-control-de-acceso-con-hueya', 'KIT CONTROL DE ACCESO CON HUEYA', '', 5369),
  ('generic-brazo-automatico-para-puerta', 'BRAZO AUTOMATICO PARA PUERTA', '', 938),
  ('zkteco-control-de-acceso-zkteco-huella', 'CONTROL DE ACCESO ZKTECO HUELLA', '', 8312),
  ('bestquality-motor-bestquality-800kg-wifi', 'MOTOR BESTQUALITY 800KG WIFI', '', 11869),
  ('bestquality-motor-bestquality-1-200kg-wifi', 'MOTOR BESTQUALITY 1,200KG  WIFI', '', 12812),
  ('bestquality-motor-bestquality-1-500kg-wifi', 'MOTOR BESTQUALITY 1,500KG wifi', '', 14369),
  ('generic-lampara-para-motor', 'LAMPARA PARA MOTOR', '', 781),
  ('generic-cremayera-gruesa', 'CREMAYERA  GRUESA', '', 719),
  ('generic-cremayera-semi-gruesa', 'CREMAYERA SEMI GRUESA', '', 531),
  ('generic-foto-celda-par', 'FOTO CELDA PAR', '', 494),
  ('generic-control-copia', 'CONTROL COPIA', '', 188),
  ('generic-receptora-para-motor-3-controles', 'RECEPTORA PARA MOTOR + 3 CONTROLES', '', 869),
  ('generic-power-12-voltio-20-ampere', 'POWER 12 VOLTIO 20 AMPERE', '', 438),
  ('generic-power-9-voltio-20-ampere-caja', 'POWER 9 VOLTIO 20 AMPERE + CAJA', '', 1688),
  ('hikvision-mini-ups-hikvision-8-000mah-5v-9v-12v-multiproposito', 'HIKVISION - MINI UPS HIKVISION – 8.000MAH, 5V/9V/12V, MULTIPROPÓSITO', '', 1375),
  ('epcom-ups-epcom-600va-350w', 'UPS EPCOM 600VA-350W', '', 2812),
  ('generic-fuente-12v-5-ampere', 'FUENTE 12V 5 AMPERE', '', 438),
  ('generic-fuente-12v-3-ampere', 'FUENTE 12V 3 AMPERE', '', 312),
  ('generic-fuente-12-voltio-2-ampere', 'FUENTE 12 VOLTIO 2 AMPERE', '', 156),
  ('dmtech-fuente-dmtech-4ch-60w-dmtech', 'FUENTE DMTECH 4CH-60W DMTECH', '', 781),
  ('dmtech-fuente-dmtech-8ch-96w-dmtech', 'FUENTE DMTECH 8CH-96W DMTECH', '', 1062),
  ('generic-splitter-dc-1-4', 'SPLITTER DC 1-4', '', 285),
  ('elo-monitor-elo-touch-vga-15-pulgadas-base-pared-15', 'MONITOR ELO TOUCH  VGA 15 PULGADAS + Base pared', '15 "', 1850),
  ('elo-monitor-elo-touch-vga-17-pulgadas-17', 'MONITOR ELO TOUCH  VGA 17 PULGADAS', '17 "', 1950),
  ('generic-monitor-17-pulgadas-lcd-vga-base-fija-17', 'MONITOR 17 PULGADAS LCD VGA + BASE FIJA', '17 "', 2995),
  ('generic-monitor-19-pulgadas-lcd-vga-base-pared-gratis-19', 'MONITOR 19 PULGADAS LCD VGA + BASE PARED GRATIS', '19 "', 2895),
  ('generic-monitor-19-pulgadas-lcd-vga-base-fija-19', 'MONITOR 19 PULGADAS LCD VGA + BASE FIJA', '19 "', 3095),
  ('generic-monitor-20-pulgadas-vga-base-pared-gratis-20', 'MONITOR 20 PULGADAS  VGA + BASE PARED GRATIS', '20 "', 3050),
  ('generic-monitor-22-pulgadas-base-pared-vga-base-pared-gratis-22', 'MONITOR 22 PULGADAS BASE PARED VGA  + BASE PARED GRATIS', '22 "', 3295),
  ('generic-monitor-de-22-pulgada-base-de-escritorio-22', 'MONITOR DE 22 PULGADA BASE DE ESCRITORIO', '22 "', 3495),
  ('generic-monitor-22-pulgada-touch-22', 'MONITOR 22 PULGADA TOUCH', '22 "', 3495),
  ('generic-monitor-24-pulgadas-vga-base-pared-gratis-24', 'MONITOR 24 PULGADAS   VGA + BASE PARED GRATIS', '24 "', 3475),
  ('generic-monitor-23-grado-b-pulgadas-hdmi-base-pared-gratis', 'MONITOR 23 GRADO B PULGADAS HDMI + BASE PARED GRATIS', '', 3295),
  ('generic-monitor-24-pulgadas-hdmi-base-pared-gratis-24', 'MONITOR 24 PULGADAS HDMI + BASE PARED GRATIS', '24 "', 3895),
  ('generic-monitor-27-pulgadas-grado-a-sin-bordes-hdmi-27', 'MONITOR 27 PULGADAS GRADO A SIN BORDES HDMI', '27 "', 5295),
  ('2connect-monitor-2connect-20-pulgadas-led-75hz-nuevo-20-75hz', 'MONITOR 2CONNECT 20 PULGADAS LED 75HZ NUEVO', '20 ", 75HZ', 5395),
  ('2connect-monitor-2connect-24-pulgadas-led-100hz-nuevo-24-100hz', 'MONITOR 2CONNECT 24 PULGADAS LED 100HZ NUEVO', '24 ", 100HZ', 7475),
  ('generic-monitor-samsung-27plg-hdmi-70ghz', 'MONITOR SAMSUNG 27PLG HDMI 70GHZ', '', 9995),
  ('generic-televisor-32-pulgadas-smart-google-tv-32', 'TELEVISOR 32 PULGADAS SMART + GOOGLE TV', '32 "', 13150),
  ('generic-televisor-43-pulgadas-smart-google-tv-43', 'TELEVISOR 43 PULGADAS SMART + GOOGLE TV', '43 "', 18995),
  ('generic-televisor-27-pulgadas-hdmi-base-de-pared-gratis-27', 'TELEVISOR 27 PULGADAS HDMI + BASE DE PARED GRATIS', '27 "', 5095),
  ('generic-disco-duro-3-5-500gb-grande-sata-500gb', 'DISCO DURO 3.5 500GB GRANDE SATA', '500GB', 1995),
  ('generic-disco-duro-2-5-500gb-pequeno-sata-500gb', 'DISCO DURO 2.5 500GB PEQUEÑO SATA', '500GB', 1995),
  ('generic-disco-duro-3-5-1tb-grande-sata-1tb', 'DISCO DURO 3.5 1TB GRANDE SATA', '1TB', 3495),
  ('generic-disco-duro-3-5-1tb-grande-purpura-sata-1tb', 'DISCO DURO 3.5 1TB GRANDE PURPURA SATA', '1TB', 5395),
  ('generic-disco-duro-3-5-2tb-grande-sata-2tb', 'DISCO DURO 3.5 2TB GRANDE SATA', '2TB', 5100),
  ('generic-disco-duro-3-5-3tb-grande-sata-3tb', 'DISCO DURO 3.5 3TB GRANDE SATA', '3TB', 5995),
  ('generic-disco-duro-3-5-6tb-grande-sata-6tb', 'DISCO DURO 3.5 6TB GRANDE SATA', '6TB', 9450),
  ('generic-disco-duro-3-5-10tb-grande-sata-10tb', 'DISCO DURO 3.5 10TB GRANDE SATA', '10TB', 14450),
  ('generic-probador-de-camaras-4k', 'PROBADOR DE CAMARAS 4K', '', 20625),
  ('generic-video-balum-ahd', 'VIDEO BALUM AHD', '', 81),
  ('generic-conectores-dc', 'CONECTORES DC', '', 19),
  ('generic-registro-grande-para-dvr', 'REGISTRO GRANDE PARA DVR', '', 1494),
  ('generic-registro-mediano-para-fuentes', 'REGISTRO MEDIANO PARA FUENTES', '', 369),
  ('generic-registro-3x3', 'REGISTRO 3X3', '', 62),
  ('generic-registro-100x100', 'REGISTRO 100X100', '', 112),
  ('generic-registro-redondo-10cm-base-para-camara', 'REGISTRO REDONDO 10CM BASE PARA CAMARA', '', 119),
  ('generic-registro-redondo-12cm-base-para-camara', 'REGISTRO REDONDO 12CM BASE PARA CAMARA', '', 138),
  ('generic-base-para-monitor-y-tv-14-42', 'BASE PARA MONITOR Y TV 14-42', '', 585),
  ('generic-base-para-tv-22-63', 'BASE PARA TV 22-63', '', 1050),
  ('generic-base-giratoria', 'BASE GIRATORIA', '', 1525),
  ('baofeng-par-de-radio-de-comunicacion-baofeng', 'PAR DE RADIO DE COMUNICACION BAOFENG', '', 2995),
  ('generic-regleta-electrica', 'REGLETA ELECTRICA', '', 375),
  ('generic-extension-electrica', 'EXTENSION ELECTRICA', '', 375),
  ('uhu', 'UHU', '', 855),
  ('generic-caja-de-tornillos-diablitos-500-unidad', 'CAJA DE TORNILLOS  DIABLITOS 500 UNIDAD', '', 585),
  ('generic-paquete-de-1-000-tarugos', 'PAQUETE DE 1,000 TARUGOS', '', 1695),
  ('generic-paquete-de-200-unidad-abrazaderas-de-1-2', 'PAQUETE DE 200 UNIDAD  ABRAZADERAS DE 1/2', '', 1850),
  ('generic-rollo-conduct-flex-100-pie', 'ROLLO CONDUCT FLEX 100 PIE', '', 1275),
  ('generic-taladro-regargable-98v-2-pilas', 'TALADRO REGARGABLE 98V 2 PILAS', '', 5950),
  ('mukinta-kit-taladro-36v-mukinta-2-pilas', 'KIT TALADRO 36V MUKINTA 2 PILAS', '', 4095),
  ('generic-camara-tipo-bombillo-pt-wifi-1080p', 'CAMARA TIPO BOMBILLO PT WIFI 1080P', '', 938),
  ('generic-camara-pt-wifi-1080p-color-se-conecta-a-nvr-por-ip', 'CAMARA PT WIFI 1080P COLOR , SE CONECTA A NVR POR IP', '', 1494),
  ('generic-cinta-para-pasar-cable-por-tuberia', 'CINTA PARA PASAR CABLE POR TUBERIA', '', 1825),
  ('generic-cable-hdmi-6-pie', 'CABLE HDMI 6 PIE', '', 465),
  ('generic-cable-hdmi-15-pie', 'CABLE HDMI 15 PIE', '', 870),
  ('generic-cable-hdmi-25-pie', 'CABLE HDMI 25 PIE', '', 1595),
  ('generic-cable-hdmi-50-pie', 'CABLE HDMI 50 PIE', '', 1850),
  ('generic-cable-displayport-6ft', 'CABLE DISPLAYPORT 6FT', '', 1185),
  ('generic-cable-vga-6-ft', 'CABLE VGA 6 FT', '', 300),
  ('generic-power-cord', 'POWER CORD', '', 225),
  ('generic-extensor-rj45-a-vga-par', 'EXTENSOR  RJ45 A VGA PAR', '', 975),
  ('generic-extensor-rj45-a-hdmi-con-fuente', 'EXTENSOR RJ45 A HDMI CON FUENTE', '', 1850),
  ('generic-extensor-rj45-a-hdmi-par', 'EXTENSOR  RJ45 A HDMI PAR', '', 1125),
  ('amazon-fire-stick-lite', 'FIRE STICK LITE', '', 1995),
  ('amazon-fire-stick-4k', 'AMAZON FIRE STICK 4K', '', 4495),
  ('generic-protector-de-voltaje', 'PROTECTOR DE VOLTAJE', '', 1185),
  ('generic-paquete-de-grapas-no-6-100-unidad', 'PAQUETE DE GRAPAS NO.6 100 UNIDAD', '', 90),
  ('generic-paquete-de-grapas-no-8-100-unidad', 'PAQUETE DE GRAPAS NO.8 100 UNIDAD', '', 120),
  ('2connect-impresora-2connet-80mm-usb-lan-bluetooth', 'IMPRESORA 2CONNET 80MM USB + LAN + BLUETOOTH', '', 5150),
  ('2connect-impresora-2connet-80mm-usb', 'IMPRESORA 2CONNET 80MM USB', '', 4650),
  ('kstar-impresora-kstar-usada-80mm-usb', 'IMPRESORA KSTAR USADA 80MM USB', '', 1950),
  ('generic-papel-termico-58mm', 'PAPEL TERMICO 58MM', '', 45),
  ('generic-papel-termico-80mm', 'PAPEL TERMICO 80MM', '', 135),
  ('agiler-imresor-de-label-agiler-pr4000ubt', 'IMRESOR DE LABEL AGILER PR4000UBT', '', 6100),
  ('epson-impresora-epson-l1250', 'IMPRESORA EPSON  L1250', '', 11000),
  ('epson-impresora-epson-l3250-multifuncional', 'IMPRESORA EPSON  L3250 MULTIFUNCIONAL', '', 14495),
  ('canon-impresora-canon-g1110', 'IMPRESORA CANON G1110', '', 10395),
  ('canon-impresora-canon-g2110', 'IMPRESORA CANON G2110', '', 13495),
  ('canon-impresora-canon-gx6010', 'IMPRESORA CANON GX6010', '', 46900),
  ('agiler-caja-de-5-billetes-agiler', 'CAJA DE 5 BILLETES AGILER', '', 3650),
  ('2connect-lector-codigo-de-barra-2connet-eco', 'LECTOR CODIGO DE BARRA 2CONNET ECO', '', 3195),
  ('agiler-lector-codigo-de-barra-estacionario-redondo-agiler', 'LECTOR CODIGO DE BARRA ESTACIONARIO REDONDO AGILER', '', 4200),
  ('2connect-all-in-one-2connet-doble-pantalla', 'ALL IN ONE 2CONNET DOBLE PANTALLA', '', 25900),
  ('2connect-all-in-one-2connet-una-sola-pantalla', 'ALL IN ONE 2CONNET UNA SOLA  PANTALLA', '', 21950),
  ('agiler-mouse-inalambrico-agiler', 'MOUSE INALAMBRICO AGILER', '', 1260),
  ('agiler-mouse-alambrico-usb-agiler', 'MOUSE ALAMBRICO USB AGILER', '', 450),
  ('xtech-mouse-alambrico-usb-xtech', 'MOUSE ALAMBRICO USB XTECH', '', 480),
  ('generic-bocina-de-15-bluetooth-con-2-miicrofonos', 'BOCINA DE 15 BLUETOOTH CON 2 MIICROFONOS', '', 5095),
  ('generic-bocina-de-12-bluetooth-un-microfono-y-control', 'BOCINA DE 12 BLUETOOTH UN MICROFONO Y CONTROL', '', 4250),
  ('m-horse-celular-m-horse-17pro-max-128gb-y-8gb-ram-128gb', 'CELULAR M HORSE 17PRO MAX 128GB Y 8GB RAM', '128GB', 8400),
  ('xiaomi-redmi-12c-64gb-3gb-ram-64gb', 'REDMI 12C 64GB +3GB RAM', '64GB', 7950),
  ('xiaomi-redmi-14c-256gb-256gb', 'XIAOMI REDMI 14C 256GB', '256GB', 10395),
  ('xiaomi-redmi-note-13-128gb-8gb-ram-128gb', 'XIAOMI  REDMI NOTE 13 128GB + 8GB RAM', '128GB', 11495),
  ('infinix-hot-50-pro-256gb-8gb-ram-256gb', 'INFINIX HOT 50 PRO 256GB + 8GB RAM', '256GB', 14495),
  ('infinix-note-40-5g-256gb-8gb-ram-256gb', 'INFINIX NOTE 40 5G 256GB + 8GB RAM', '256GB', 15995),
  ('generic-tablet-32gb-almacenamiento-3gb-ram-4glte-chip-32gb', 'TABLET  32GB ALMACENAMIENTO, 3GB RAM, 4GLTE CHIP', '32GB', 5800)
on conflict (slug) do update set name = excluded.name, variant = excluded.variant,
  price = excluded.price, updated_at = now();

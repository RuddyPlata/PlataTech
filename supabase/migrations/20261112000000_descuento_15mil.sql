-- ============================================================
-- Plata Tech — El codigo de 5% solo aplica a articulos de menos
-- de RD$15,000
-- ------------------------------------------------------------
-- En los articulos caros el margen es de RD$2,000 o 6%, y el 5%
-- se comia casi toda la ganancia. Ahora orders_check_totals
-- calcula el descuento solo sobre los articulos con precio menor
-- de RD$15,000. Si el pedido no tiene ninguno, el codigo no se
-- descuenta ni se marca como usado.
-- Idempotente (solo reemplaza la funcion; el trigger no cambia).
-- ============================================================

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
  v_elig    bigint := 0;  -- subtotal de articulos de menos de RD$15,000
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
    if v_price < 15000 then v_elig := v_elig + v_price::bigint * v_qty; end if;
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
  -- El codigo solo descuenta articulos de menos de RD$15,000.
  v_disc  := round(v_elig * v_pct / 100);
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

  -- Si no hubo nada que descontar, el codigo no se gasta.
  if v_disc = 0 then v_code := ''; end if;

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

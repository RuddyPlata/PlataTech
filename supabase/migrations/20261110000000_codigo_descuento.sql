-- ============================================================
-- Plata Tech — Codigo de 5% a cambio de WhatsApp o correo
-- ------------------------------------------------------------
-- El visitante deja su nombre y WhatsApp o correo en la web
-- (promo-5.js) y recibe un codigo personal de 5% para su
-- proxima compra. Vence a los 3 meses y se usa una sola vez:
--   - en la tienda: el carrito lo manda en orders.totals y un
--     trigger lo valida y lo marca usado al crear el pedido;
--   - en servicios: al facturar en el CRM (crm_create_invoice).
-- Idempotente.
-- ============================================================

-- Permiso para enviarle publicidad y ofertas (Ley 172-13): cuando y con que texto.
alter table public.crm_clients
  add column if not exists marketing_consent_at   timestamptz,
  add column if not exists marketing_consent_text text,
  add column if not exists marketing_opt_out_at   timestamptz;

create table if not exists public.crm_discount_codes (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  code              text not null unique,
  client_id         uuid not null references public.crm_clients(id) on delete cascade,
  percent           numeric(5, 2) not null default 5 check (percent > 0 and percent <= 50),
  expires_at        timestamptz not null default (now() + interval '3 months'),
  contact_email     text,                 -- a donde se envio el codigo (si dejo correo)
  redeemed_at       timestamptz,
  redeemed_ref      text,                 -- numero de pedido o id de factura
  redeemed_channel  text check (redeemed_channel in ('tienda', 'servicio'))
);
create index if not exists crm_discount_codes_client_idx on public.crm_discount_codes (client_id);

-- Este proyecto no da permisos automaticos a tablas nuevas (ver 20261109120000).
grant select, insert, update, delete on public.crm_discount_codes to authenticated, service_role;

alter table public.crm_discount_codes enable row level security;
drop policy if exists "crm admin" on public.crm_discount_codes;
create policy "crm admin" on public.crm_discount_codes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Codigo legible: PT5- + 6 letras/numeros sin los que se confunden (0/O, 1/I/L).
create or replace function public.crm_new_discount_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  abc   constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  out   text;
begin
  loop
    bytes := uuid_send(gen_random_uuid());
    out := 'PT5-';
    for i in 0..5 loop
      out := out || substr(abc, (get_byte(bytes, i) % length(abc)) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.crm_discount_codes where code = out);
  end loop;
  return out;
end $$;
revoke all on function public.crm_new_discount_code() from public, anon, authenticated;

-- ── Entrada publica: pedir el codigo ────────────────────────
-- p: name, phone, email, consent (true), source (utm de lead-tracking.js)
-- Devuelve { code, expires_at, used, nuevo }.
create or replace function public.crm_claim_discount(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name    text := left(trim(coalesce(p ->> 'name', '')), 120);
  v_phone   text := left(trim(coalesce(p ->> 'phone', '')), 30);
  v_norm    text := right(regexp_replace(coalesce(p ->> 'phone', ''), '\D', '', 'g'), 10);
  v_email   text := lower(left(trim(coalesce(p ->> 'email', '')), 120));
  v_client  uuid;
  v_row     public.crm_discount_codes%rowtype;
begin
  if coalesce(p ->> 'consent', '') <> 'true' then raise exception 'Falta tu permiso para escribirte'; end if;
  if length(v_name) < 2 then raise exception 'Falta el nombre'; end if;
  if length(v_norm) < 10 then v_norm := ''; v_phone := ''; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_email := ''; end if;
  if v_norm = '' and v_email = '' then raise exception 'Escribe un WhatsApp o un correo valido'; end if;
  if length(coalesce(p::text, '')) > 4000 then raise exception 'Datos demasiado largos'; end if;

  -- Frenos contra abuso: maximo 30 codigos nuevos por minuto en toda la web.
  if (select count(*) from public.crm_discount_codes where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Hay mucha demanda, intenta en un minuto';
  end if;

  -- Buscar al cliente por telefono y si no, por correo.
  if v_norm <> '' then
    select id into v_client from public.crm_clients where phone_norm = v_norm order by created_at limit 1;
  end if;
  if v_client is null and v_email <> '' then
    select id into v_client from public.crm_clients where lower(email) = v_email order by created_at limit 1;
  end if;

  if v_client is null then
    insert into public.crm_clients (name, phone, email, source)
    values (v_name, nullif(v_phone, ''), nullif(v_email, ''),
            coalesce(p -> 'source', '{}') || '{"promo": "codigo5"}')
    returning id into v_client;
  else
    update public.crm_clients
    set phone = coalesce(phone, nullif(v_phone, '')),
        email = coalesce(email, nullif(v_email, ''))
    where id = v_client;
  end if;

  -- Permiso para enviarle ofertas: se acepta al pedir el codigo.
  update public.crm_clients
  set marketing_consent_at = coalesce(marketing_consent_at, now()),
      marketing_consent_text = coalesce(marketing_consent_text, left(coalesce(p ->> 'consent_text', ''), 300))
  where id = v_client;

  -- Un codigo por persona: si el telefono o el correo ya pidieron uno
  -- (en esta ficha o en otra), se devuelve ese mismo.
  select dc.* into v_row
  from public.crm_discount_codes dc
  join public.crm_clients c on c.id = dc.client_id
  where dc.client_id = v_client
     or (v_norm <> '' and c.phone_norm = v_norm)
     or (v_email <> '' and (lower(c.email) = v_email or lower(dc.contact_email) = v_email))
  order by dc.created_at
  limit 1;
  if found then
    return jsonb_build_object('code', v_row.code, 'expires_at', v_row.expires_at,
                              'used', v_row.redeemed_at is not null, 'nuevo', false);
  end if;

  insert into public.crm_discount_codes (code, client_id, contact_email)
  values (public.crm_new_discount_code(), v_client, nullif(v_email, ''))
  returning * into v_row;

  insert into public.crm_activities (client_id, kind, body, created_by)
  values (v_client, 'sistema', 'Pidio su codigo de 5% en la web: ' || v_row.code, null);

  return jsonb_build_object('code', v_row.code, 'expires_at', v_row.expires_at, 'used', false, 'nuevo', true);
end $$;
revoke all on function public.crm_claim_discount(jsonb) from public;
grant execute on function public.crm_claim_discount(jsonb) to anon, authenticated;

-- ── Entrada publica: revisar un codigo en el carrito ───────
-- No devuelve datos de la persona, solo si sirve y cuanto descuenta.
create or replace function public.crm_check_discount(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.crm_discount_codes%rowtype;
begin
  select * into v_row from public.crm_discount_codes where code = upper(trim(coalesce(p_code, '')));
  if not found then return jsonb_build_object('valid', false, 'reason', 'Ese código no existe'); end if;
  if v_row.redeemed_at is not null then return jsonb_build_object('valid', false, 'reason', 'Ese código ya se usó'); end if;
  if v_row.expires_at < now() then return jsonb_build_object('valid', false, 'reason', 'Ese código venció'); end if;
  return jsonb_build_object('valid', true, 'percent', v_row.percent, 'expires_at', v_row.expires_at);
end $$;
revoke all on function public.crm_check_discount(text) from public;
grant execute on function public.crm_check_discount(text) to anon, authenticated;

-- ── Tienda: validar y gastar el codigo al crear el pedido ───
create or replace function public.orders_apply_discount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(new.totals ->> 'discountCode', '')));
  v_disc numeric;
  v_sub  numeric;
  v_row  public.crm_discount_codes%rowtype;
begin
  begin
    v_disc := coalesce(nullif(new.totals ->> 'discount', '')::numeric, 0);
    v_sub  := coalesce(nullif(new.totals ->> 'subtotal', '')::numeric, 0);
  exception when others then
    raise exception 'Totales invalidos';
  end;

  if v_code = '' then
    if v_disc > 0 then raise exception 'Descuento sin codigo'; end if;
    return new;
  end if;

  select * into v_row from public.crm_discount_codes where code = v_code for update;
  if not found then raise exception 'Ese codigo de descuento no existe'; end if;
  if v_row.redeemed_at is not null then raise exception 'Ese codigo de descuento ya se uso'; end if;
  if v_row.expires_at < now() then raise exception 'Ese codigo de descuento vencio'; end if;
  if v_disc > round(v_sub * v_row.percent / 100) + 1 then raise exception 'El descuento es mayor que el del codigo'; end if;

  update public.crm_discount_codes
  set redeemed_at = now(), redeemed_ref = new.id, redeemed_channel = 'tienda'
  where id = v_row.id;

  insert into public.crm_activities (client_id, kind, body, created_by)
  values (v_row.client_id, 'sistema', 'Uso su codigo ' || v_code || ' en el pedido ' || new.id, null);

  return new;
end $$;
revoke all on function public.orders_apply_discount() from public, anon, authenticated;

drop trigger if exists orders_apply_discount on public.orders;
create trigger orders_apply_discount before insert on public.orders
  for each row execute function public.orders_apply_discount();

-- ── Servicios: crear factura (ahora acepta discount_code) ───
-- Igual que en la Fase 1; si p trae discount_code, lo valida y
-- lo marca usado en la misma transaccion. El monto del descuento
-- ya viene calculado en items/discounts/total desde el CRM.
create or replace function public.crm_create_invoice(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_client  public.crm_clients%rowtype;
  v_type    text := nullif(p ->> 'ncf_type', '');
  v_code    text := nullif(upper(trim(coalesce(p ->> 'discount_code', ''))), '');
  v_dc      public.crm_discount_codes%rowtype;
  v_ncf     text;
  v_exp     date;
  v_id      uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo administradores';
  end if;

  select * into v_client from public.crm_clients where id = (p ->> 'client_id')::uuid;
  if not found then raise exception 'Cliente no encontrado'; end if;

  if v_type = 'B01' and coalesce(trim(v_client.rnc), '') = '' then
    raise exception 'La factura de credito fiscal (B01) necesita el RNC del cliente. Agregalo en su ficha.';
  end if;

  if v_code is not null then
    select * into v_dc from public.crm_discount_codes where code = v_code for update;
    if not found then raise exception 'Ese codigo de descuento no existe'; end if;
    if v_dc.redeemed_at is not null then raise exception 'Ese codigo de descuento ya se uso'; end if;
    if v_dc.expires_at < now() then raise exception 'Ese codigo de descuento vencio'; end if;
  end if;

  if v_type is not null then
    select t.ncf, t.expires_on into v_ncf, v_exp from public.crm_take_ncf(v_type) t;
  end if;

  insert into public.crm_invoices (
    client_id, opportunity_id, quote_id, emitter, ncf_type, ncf, ncf_expires_on,
    due_date, client_snapshot, items, subtotal, discounts, itbis, total, notes
  ) values (
    v_client.id,
    nullif(p ->> 'opportunity_id', '')::uuid,
    nullif(p ->> 'quote_id', '')::uuid,
    coalesce(nullif(p ->> 'emitter', ''), 'platatech'),
    v_type, v_ncf, v_exp,
    nullif(p ->> 'due_date', '')::date,
    jsonb_build_object('name', v_client.name, 'company', v_client.company, 'rnc', v_client.rnc,
                       'phone', v_client.phone, 'email', v_client.email, 'address', v_client.address),
    coalesce(p -> 'items', '[]'),
    coalesce((p ->> 'subtotal')::numeric, 0),
    coalesce((p ->> 'discounts')::numeric, 0),
    coalesce((p ->> 'itbis')::numeric, 0),
    coalesce((p ->> 'total')::numeric, 0),
    nullif(p ->> 'notes', '')
  )
  returning id into v_id;

  if v_code is not null then
    update public.crm_discount_codes
    set redeemed_at = now(), redeemed_ref = v_id::text, redeemed_channel = 'servicio'
    where id = v_dc.id;
  end if;

  if nullif(p ->> 'opportunity_id', '') is not null then
    update public.crm_opportunities
    set stage = 'ganado', closed_at = coalesce(closed_at, now())
    where id = (p ->> 'opportunity_id')::uuid and stage <> 'ganado';
  end if;

  insert into public.crm_activities (client_id, opportunity_id, kind, body)
  values (v_client.id, nullif(p ->> 'opportunity_id', '')::uuid, 'sistema',
          'Factura emitida' || coalesce(' con NCF ' || v_ncf, ' sin NCF')
          || coalesce(' · codigo ' || v_code, ''));

  return v_id;
end $$;
revoke all on function public.crm_create_invoice(jsonb) from public, anon;
grant execute on function public.crm_create_invoice(jsonb) to authenticated;

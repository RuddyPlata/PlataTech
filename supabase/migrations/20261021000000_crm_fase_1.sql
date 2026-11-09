-- ============================================================
-- Plata Tech — CRM Fase 1
-- ------------------------------------------------------------
-- Clientes, oportunidades (3 embudos + aliados), actividades,
-- facturas con NCF, pagos y cuentas por cobrar.
-- Las cotizaciones siguen en la tabla `quotations` del admin;
-- aqui solo se enlazan a un cliente y a una oportunidad.
--
-- Acceso: todo es solo para cuentas con app_metadata.is_admin = true
-- (las mismas que entran al admin de la tienda). La web publica
-- solo puede llamar a crm_submit_lead(), que valida y guarda.
--
-- Se corre una vez en Supabase > SQL Editor. Es idempotente.
-- ============================================================

-- ── Helpers ─────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false)
$$;

create or replace function public.crm_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ── Clientes ────────────────────────────────────────────────
create table if not exists public.crm_clients (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  name        text not null,
  company     text,
  rnc         text,                       -- RNC o cedula, necesario para factura de credito fiscal (B01)
  phone       text,
  phone_norm  text generated always as (right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10)) stored,
  email       text,
  sector      text,                       -- zona o barrio: Los Prados, Piantini, Santiago...
  address     text,
  notes       text,
  source      jsonb not null default '{}' -- utm_source, campaign, gclid, landing (de lead-tracking.js)
);
create index if not exists crm_clients_phone_norm_idx on public.crm_clients (phone_norm);

drop trigger if exists crm_clients_touch on public.crm_clients;
create trigger crm_clients_touch before update on public.crm_clients
  for each row execute function public.crm_touch_updated_at();

-- ── Oportunidades (embudos) ─────────────────────────────────
create table if not exists public.crm_opportunities (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  client_id        uuid not null references public.crm_clients(id) on delete cascade,
  line             text not null check (line in ('seguridad', 'software', 'celulares', 'aliado')),
  stage            text not null default 'nuevo'
                   check (stage in ('nuevo', 'contactado', 'visita', 'cotizado', 'ganado', 'perdido')),
  title            text not null,
  value            numeric(12, 2),        -- valor estimado en RD$
  details          jsonb not null default '{}', -- respuestas del formulario de la web
  ally_name        text,                  -- solo line = 'aliado': quien ejecuta el trabajo
  ally_commission  numeric(12, 2),        -- lo que le toca a Plata Tech
  lost_reason      text,
  closed_at        timestamptz
);
create index if not exists crm_opportunities_client_idx on public.crm_opportunities (client_id);
create index if not exists crm_opportunities_line_stage_idx on public.crm_opportunities (line, stage);

drop trigger if exists crm_opportunities_touch on public.crm_opportunities;
create trigger crm_opportunities_touch before update on public.crm_opportunities
  for each row execute function public.crm_touch_updated_at();

-- ── Actividades (historial de la ficha) ─────────────────────
create table if not exists public.crm_activities (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  client_id       uuid not null references public.crm_clients(id) on delete cascade,
  opportunity_id  uuid references public.crm_opportunities(id) on delete set null,
  kind            text not null default 'nota'
                  check (kind in ('nota', 'whatsapp', 'llamada', 'visita', 'sistema')),
  body            text not null,
  created_by      uuid default auth.uid()
);
create index if not exists crm_activities_client_idx on public.crm_activities (client_id, created_at desc);

-- ── Cotizaciones: enlazar a cliente y oportunidad ───────────
do $$
begin
  if to_regclass('public.quotations') is not null then
    alter table public.quotations
      add column if not exists client_id uuid references public.crm_clients(id) on delete set null,
      add column if not exists opportunity_id uuid references public.crm_opportunities(id) on delete set null;
    create index if not exists quotations_client_idx on public.quotations (client_id);
  end if;
end $$;

-- ── Secuencias de NCF autorizadas por la DGII ───────────────
-- Cada fila es un rango que te aprobo la DGII, por ejemplo
-- B01 del 1 al 500, vence 2027-12-31.
create table if not exists public.crm_ncf_sequences (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  ncf_type     text not null check (ncf_type ~ '^[BE][0-9]{2}$'), -- B01 credito fiscal, B02 consumo, B14, B15...
  description  text,
  next_number  bigint not null check (next_number > 0),
  end_number   bigint not null,
  expires_on   date,
  active       boolean not null default true,
  check (end_number >= next_number - 1)
);

-- ── Facturas ────────────────────────────────────────────────
create sequence if not exists public.crm_invoice_number_seq start 1;

create table if not exists public.crm_invoices (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  number           text not null unique
                   default ('FAC-' || lpad(nextval('public.crm_invoice_number_seq')::text, 5, '0')),
  client_id        uuid not null references public.crm_clients(id) on delete restrict,
  opportunity_id   uuid references public.crm_opportunities(id) on delete set null,
  quote_id         uuid,                  -- quotations.id de donde salio (sin FK: la tabla es del admin)
  emitter          text not null default 'platatech' check (emitter in ('platatech', 'ultimogadget', 'personal')),
  ncf_type         text,
  ncf              text unique,
  ncf_expires_on   date,
  issue_date       date not null default current_date,
  due_date         date,
  client_snapshot  jsonb not null default '{}', -- nombre, RNC, telefono tal como salieron en la factura
  items            jsonb not null default '[]', -- mismo formato que quotations.items
  subtotal         numeric(12, 2) not null default 0,
  discounts        numeric(12, 2) not null default 0,
  itbis            numeric(12, 2) not null default 0,
  total            numeric(12, 2) not null default 0,
  status           text not null default 'emitida' check (status in ('emitida', 'anulada')),
  void_reason      text,
  notes            text
);
create index if not exists crm_invoices_client_idx on public.crm_invoices (client_id);

-- ── Pagos ───────────────────────────────────────────────────
create table if not exists public.crm_payments (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  invoice_id  uuid not null references public.crm_invoices(id) on delete cascade,
  amount      numeric(12, 2) not null check (amount > 0),
  method      text not null default 'transferencia'
              check (method in ('efectivo', 'transferencia', 'tarjeta', 'cheque', 'otro')),
  paid_on     date not null default current_date,
  reference   text,
  notes       text
);
create index if not exists crm_payments_invoice_idx on public.crm_payments (invoice_id);

-- ── Cuentas por cobrar (vista) ──────────────────────────────
create or replace view public.crm_invoice_balances
with (security_invoker = true) as
select
  i.*,
  coalesce(p.paid, 0)                    as paid,
  i.total - coalesce(p.paid, 0)          as balance,
  case
    when i.status = 'anulada'                    then 'anulada'
    when coalesce(p.paid, 0) >= i.total          then 'pagada'
    when coalesce(p.paid, 0) > 0                 then 'parcial'
    else 'pendiente'
  end                                    as pay_status
from public.crm_invoices i
left join (
  select invoice_id, sum(amount) as paid
  from public.crm_payments
  group by invoice_id
) p on p.invoice_id = i.id;

-- ── Tomar el proximo NCF de forma atomica ───────────────────
-- Bloquea la fila de la secuencia, asi dos facturas nunca
-- reciben el mismo numero. Formato: B01 + 8 digitos (B0100000001).
create or replace function public.crm_take_ncf(p_type text)
returns table (ncf text, expires_on date)
language plpgsql
security invoker
set search_path = public
as $$
declare
  seq public.crm_ncf_sequences%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Solo administradores';
  end if;

  select * into seq
  from public.crm_ncf_sequences s
  where s.ncf_type = p_type
    and s.active
    and s.next_number <= s.end_number
    and (s.expires_on is null or s.expires_on >= current_date)
  order by s.created_at
  limit 1
  for update;

  if not found then
    raise exception 'No hay NCF % disponibles. Agrega una secuencia vigente en Ajustes.', p_type;
  end if;

  update public.crm_ncf_sequences
  set next_number = next_number + 1
  where id = seq.id;

  return query select p_type || lpad(seq.next_number::text, 8, '0'), seq.expires_on;
end $$;

-- ── Datos del emisor (RNC, direccion) por marca ─────────────
create table if not exists public.crm_settings (
  key         text primary key,           -- 'emisor.platatech', 'emisor.ultimogadget'...
  value       jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

-- ── Crear factura y asignar NCF en una sola transaccion ─────
-- Si algo falla, el NCF no se gasta. p trae: client_id,
-- opportunity_id, quote_id, emitter, ncf_type ('' = sin NCF),
-- due_date, items, subtotal, discounts, itbis, total, notes.
create or replace function public.crm_create_invoice(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_client  public.crm_clients%rowtype;
  v_type    text := nullif(p ->> 'ncf_type', '');
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

  if nullif(p ->> 'opportunity_id', '') is not null then
    update public.crm_opportunities
    set stage = 'ganado', closed_at = coalesce(closed_at, now())
    where id = (p ->> 'opportunity_id')::uuid and stage <> 'ganado';
  end if;

  insert into public.crm_activities (client_id, opportunity_id, kind, body)
  values (v_client.id, nullif(p ->> 'opportunity_id', '')::uuid, 'sistema',
          'Factura emitida' || coalesce(' con NCF ' || v_ncf, ' sin NCF'));

  return v_id;
end $$;

-- ── Entrada publica: formulario de la web ───────────────────
-- La unica puerta que la web (anon) puede usar. Busca el cliente
-- por telefono o lo crea, abre la oportunidad y deja constancia.
create or replace function public.crm_submit_lead(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name   text := left(trim(coalesce(p ->> 'name', '')), 120);
  v_phone  text := left(trim(coalesce(p ->> 'phone', '')), 30);
  v_norm   text := right(regexp_replace(v_phone, '\D', '', 'g'), 10);
  v_line   text := coalesce(p ->> 'line', '');
  v_title  text := left(trim(coalesce(p ->> 'title', '')), 160);
  v_client uuid;
  v_opp    uuid;
begin
  if length(v_name) < 2 then raise exception 'Falta el nombre'; end if;
  if length(v_norm) < 10 then raise exception 'Telefono invalido'; end if;
  if v_line not in ('seguridad', 'software', 'celulares', 'aliado') then
    raise exception 'Linea invalida';
  end if;
  if length(coalesce(p::text, '')) > 8000 then raise exception 'Datos demasiado largos'; end if;

  -- Freno simple contra envios repetidos: maximo 5 por telefono por hora.
  if (select count(*)
      from public.crm_opportunities o
      join public.crm_clients c on c.id = o.client_id
      where c.phone_norm = v_norm and o.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Demasiadas solicitudes, intenta mas tarde';
  end if;

  select id into v_client from public.crm_clients where phone_norm = v_norm order by created_at limit 1;

  if v_client is null then
    insert into public.crm_clients (name, phone, email, sector, source)
    values (
      v_name,
      v_phone,
      nullif(left(trim(coalesce(p ->> 'email', '')), 120), ''),
      nullif(left(trim(coalesce(p ->> 'sector', '')), 80), ''),
      coalesce(p -> 'source', '{}')
    )
    returning id into v_client;
  end if;

  insert into public.crm_opportunities (client_id, line, title, value, details)
  values (
    v_client,
    v_line,
    coalesce(nullif(v_title, ''), 'Solicitud desde la web'),
    case when (p ->> 'value') ~ '^[0-9]+(\.[0-9]+)?$' then (p ->> 'value')::numeric end,
    coalesce(p -> 'details', '{}')
  )
  returning id into v_opp;

  insert into public.crm_activities (client_id, opportunity_id, kind, body, created_by)
  values (v_client, v_opp, 'sistema', 'Entro por la web: ' || coalesce(nullif(v_title, ''), v_line), null);

  return v_opp;
end $$;

revoke all on function public.crm_submit_lead(jsonb) from public;
grant execute on function public.crm_submit_lead(jsonb) to anon, authenticated;
revoke all on function public.crm_take_ncf(text) from public, anon;
grant execute on function public.crm_take_ncf(text) to authenticated;
revoke all on function public.crm_create_invoice(jsonb) from public, anon;
grant execute on function public.crm_create_invoice(jsonb) to authenticated;

-- ── Seguridad: solo administradores ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['crm_clients', 'crm_opportunities', 'crm_activities',
                           'crm_ncf_sequences', 'crm_invoices', 'crm_payments', 'crm_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "crm admin" on public.%I', t);
    execute format('create policy "crm admin" on public.%I for all to authenticated
                    using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Las cotizaciones ahora llevan datos de clientes del CRM: se
-- restringen tambien a administradores. El SQL de ejemplo del
-- admin creaba la politica "admin full" con USING (true), que deja
-- leer y editar cotizaciones a cualquiera con la llave publica.
do $$
begin
  if to_regclass('public.quotations') is not null then
    alter table public.quotations enable row level security;
    drop policy if exists "admin full" on public.quotations;
    drop policy if exists "crm admin" on public.quotations;
    create policy "crm admin" on public.quotations for all to authenticated
      using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

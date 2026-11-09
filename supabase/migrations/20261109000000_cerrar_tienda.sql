-- ============================================================
-- Plata Tech — Cerrar el acceso publico a pedidos y productos
-- ------------------------------------------------------------
-- Antes: con la llave publica de la web cualquiera podia leer
-- TODOS los pedidos (nombre, telefono, direccion), cualquier
-- cliente con cuenta podia editar pedidos y cambiar productos,
-- y los comentarios se podian leer sin cuenta.
--
-- Despues, lo minimo que la web necesita:
--   orders           crear pedido (carrito), ver los propios con
--                    sesion y correo confirmado (cuenta.html);
--                    el seguimiento por numero sigue con la funcion
--                    get_order_by_id. Admin: todo.
--   custom_products  todos ven los publicados. Admin: todo.
--   feedback         todos pueden enviar. Admin: todo.
-- Las funciones del servidor (AZUL, correos) usan la llave de
-- servicio y no dependen de estas reglas.
-- Idempotente.
-- ============================================================

-- Correo confirmado de quien tiene la sesion (null si no esta confirmado).
-- Evita que alguien se registre con el correo de otro y vea sus pedidos.
create or replace function public.my_confirmed_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(u.email)
  from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null
$$;
revoke all on function public.my_confirmed_email() from public, anon;
grant execute on function public.my_confirmed_email() to authenticated;

-- Borra todas las reglas actuales de las tres tablas.
do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('orders', 'custom_products', 'feedback')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.orders          enable row level security;
alter table public.custom_products enable row level security;
alter table public.feedback        enable row level security;

-- ── Pedidos ─────────────────────────────────────────────────
create policy "orders admin" on public.orders for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "orders crear" on public.orders for insert to anon, authenticated
  with check (true);

create policy "orders propios" on public.orders for select to authenticated
  using (lower(customer ->> 'email') = (select public.my_confirmed_email()));

-- ── Productos ───────────────────────────────────────────────
create policy "productos admin" on public.custom_products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "productos publicados" on public.custom_products for select to anon, authenticated
  using (published = true);

-- ── Comentarios ─────────────────────────────────────────────
create policy "feedback admin" on public.feedback for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "feedback enviar" on public.feedback for insert to anon, authenticated
  with check (true);

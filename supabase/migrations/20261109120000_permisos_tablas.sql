-- ============================================================
-- Plata Tech — Permisos de tabla para el CRM y la tienda
-- ------------------------------------------------------------
-- Este proyecto de Supabase NO da permisos automaticos a las
-- tablas nuevas. Las tablas crm_* quedaron sin SELECT/INSERT/
-- UPDATE/DELETE para nadie: el panel /crm/ no podia leer nada
-- y las funciones del servidor (service_role) tampoco.
--
-- Las reglas de acceso (RLS) siguen decidiendo QUIEN ve que:
-- con estos permisos un cliente con cuenta sigue viendo 0 filas
-- del CRM; solo las cuentas is_admin ven y cambian datos.
-- La web publica (anon) no recibe permisos sobre el CRM.
-- Idempotente.
-- ============================================================

grant select, insert, update, delete on
  public.crm_clients, public.crm_opportunities, public.crm_activities,
  public.crm_ncf_sequences, public.crm_invoices, public.crm_payments, public.crm_settings
to authenticated, service_role;

grant select on public.crm_invoice_balances to authenticated, service_role;

-- La factura toma su numero (FAC-00001) de esta secuencia.
grant usage, select on sequence public.crm_invoice_number_seq to authenticated, service_role;

-- Funciones del servidor (AZUL, correos) leen y actualizan con la llave de servicio.
grant select, insert, update, delete on
  public.orders, public.custom_products, public.feedback, public.quotations
to service_role;

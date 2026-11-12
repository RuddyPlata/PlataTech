-- CRM: linea MekaFix (prospeccion de talleres y negocios de vehiculos).
-- Solo amplia la lista de lineas permitidas. La funcion publica crm_submit_lead
-- NO acepta 'mekafix': esos prospectos los carga un admin (scripts/crm.mjs importar).
alter table public.crm_opportunities drop constraint if exists crm_opportunities_line_check;
alter table public.crm_opportunities
  add constraint crm_opportunities_line_check
  check (line in ('seguridad', 'software', 'celulares', 'aliado', 'mekafix'));

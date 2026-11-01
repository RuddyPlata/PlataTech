# CRM Plata Tech — Puesta en marcha (Fase 1)

El CRM vive en **platatechs.com/crm/** y usa el mismo Supabase y las mismas
cuentas de administrador que el admin de la tienda (`shop/admin.html`).

## 1. Crear las tablas (una sola vez)

1. Entra a Supabase → proyecto **PTS** → **SQL Editor** → **New query**.
2. Pega todo el archivo `supabase/migrations/20261021000000_crm_fase_1.sql`.
3. Dale a **Run**. Se puede correr más de una vez sin dañar nada.

Esto crea:

| Tabla | Para qué |
|---|---|
| `crm_clients` | Ficha de cada cliente (nombre, teléfono, RNC, sector, de qué anuncio vino) |
| `crm_opportunities` | Cada cosa que un cliente quiere comprar, en su embudo: seguridad, software, celulares o aliado |
| `crm_activities` | Historial: notas, WhatsApp, llamadas, visitas y cambios automáticos |
| `crm_invoices` + `crm_payments` | Facturas con NCF y sus pagos/abonos |
| `crm_invoice_balances` (vista) | Cuánto se ha pagado y cuánto se debe de cada factura |
| `crm_ncf_sequences` | Los rangos de NCF que te autorizó la DGII |
| `crm_settings` | RNC, razón social y dirección que salen impresos en la factura |

Y agrega `client_id` y `opportunity_id` a la tabla `quotations` del admin.

**Seguridad:** todo es solo para cuentas con `is_admin`. La web pública
solo puede llamar a `crm_submit_lead`, que valida los datos y no deja leer
nada. El script también cierra la tabla `quotations` a solo administradores
(antes cualquiera con la llave pública podía leerla y editarla).

## 2. Aviso por correo cuando entra un cliente

1. Despliega la función:
   ```bash
   supabase functions deploy notify-lead
   ```
   Usa las mismas variables que `notify-order` (`RESEND_API_KEY`,
   `OWNER_EMAIL`, `FROM_EMAIL`), no hay que agregar nada nuevo.
2. Supabase → **Database** → **Webhooks** → **Create a new hook**:
   - Tabla: `crm_opportunities`, evento: **Insert**
   - Tipo: **Supabase Edge Functions** → `notify-lead`
   - Igual que el webhook que ya tienes para `notify-order`.

Cada cliente nuevo te llega al correo con un botón para escribirle por
WhatsApp con un saludo listo.

## 3. Primeros pasos en el CRM

1. Entra a **platatechs.com/crm/** con tu cuenta de administrador.
2. **Ajustes** → completa el RNC y la dirección de Plata Tech (y de
   UltimoGadget si factura aparte).
3. **Ajustes** → **Agregar secuencia** con los rangos de NCF de la DGII
   (B01 crédito fiscal, B02 consumo...). Si ya usaste algunos números,
   pon como "Desde" el siguiente que no has usado.

## Cómo se usa

- **Cliente nuevo por la web:** llena el cotizador de `security.html`, cae
  en **Embudo → Nuevo** y te llega el correo. Al tocar **WhatsApp** en su
  tarjeta, pasa solo a "Contactado".
- **Cliente por WhatsApp o en persona:** botón **+ Nuevo cliente**.
- **Cotizar:** en la oportunidad, **+ Cotización**. Se abre el editor de
  cotizaciones del admin (con PDF) ya enlazado al cliente.
- **Facturar:** **Facturas → Facturar una cotización**. El NCF se asigna
  solo, en orden. La B01 exige el RNC del cliente.
- **Cobrar:** **Por cobrar** muestra quién debe y desde cuándo, con botón
  para recordarle por WhatsApp y para registrar el pago.
- **Anular:** solo facturas sin pagos. El NCF queda usado; se reporta en
  el formato 608 de la DGII.

## Pendiente para las próximas fases

- Cotizadores de `digital.html` (software) y `ultimogadget.html`
  (reparaciones): necesitan las listas de precios.
- Factura electrónica e-CF (Fase 3), con la librería `dgii-ecf` y el
  certificado digital .p12.
- WhatsApp Business API y agentes con IA (Fase 2).

## Usar el CRM desde Claude Code (también por voz)

`scripts/crm.mjs` deja que Claude Code consulte y actualice el CRM:
"¿quién me escribió hoy?", "anota que Juan pagó 10 mil", "¿cuánto me deben?".
Las instrucciones para Claude están en `.claude/skills/crm/SKILL.md`.

1. Crea en Supabase una cuenta admin para Claude (Authentication → Add user,
   y en su `app_metadata` pon `{"is_admin": true}`), así queda registrado
   aparte de la tuya y la puedes desactivar cuando quieras.
2. En la computadora o el entorno donde corre Claude Code, define
   `CRM_EMAIL` y `CRM_PASSWORD` con esa cuenta (y `CRM_SUPABASE_URL` /
   `CRM_SUPABASE_ANON_KEY` si el CRM está en otro proyecto).
3. Prueba: `node scripts/crm.mjs resumen`.

Facturar desde Claude siempre muestra una vista previa y pide tu "sí"
antes de emitir el NCF.

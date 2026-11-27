# Integración de pagos con tarjeta — AZUL Payment Page

Cobro con tarjeta Visa/MasterCard en **RD$** mediante la **Payment Page hospedada de AZUL**
(el cliente teclea la tarjeta en el sitio de AZUL, no en el nuestro → carga PCI mínima).

## Piezas

| Pieza | Archivo | Qué hace |
|---|---|---|
| Crear pago | `supabase/functions/azul-create-payment/index.ts` | Lee el total real de la orden, calcula el `AuthHash` con la llave secreta y devuelve los campos firmados del formulario. |
| Callback | `supabase/functions/azul-callback/index.ts` | Recibe la respuesta de AZUL, marca la orden `pagado` y redirige al comprobante. |
| Correos | `supabase/functions/notify-order/index.ts` | Envía correos de orden al confirmarse el pago con tarjeta. |
| Checkout | `shop/cart.html` | Método "Tarjeta (AZUL)", crea la orden y redirige a la Payment Page. |
| Comprobante | `shop/orden.html` | Ya muestra estado `pagado`, RD$, autorización (sin cambios). |

## Pasos de despliegue (en orden)

### 1. Base de datos — agregar la columna `azul`
En el SQL Editor de Supabase:
```sql
alter table orders add column if not exists azul jsonb;
```

### 2. Secrets de las Edge Functions
Supabase → Project Settings → Edge Functions → Secrets (o `supabase secrets set`):
```
AZUL_MERCHANT_ID = 39038540035
AZUL_AUTH_KEY    = <LLAVE PRIVADA REAL DE AZUL>   # SECRETO — nunca en el repo
AZUL_ENV         = test                            # 'test' hasta certificar; luego 'prod'
AZUL_MERCHANT_NAME = PLATA TECH SOLUTIONS          # opcional
```
`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta la plataforma (no hay que ponerlos).

### 3. Desplegar las funciones
```bash
supabase functions deploy azul-create-payment
supabase functions deploy azul-callback --no-verify-jwt   # AZUL llama sin JWT: DEBE ser público
supabase functions deploy notify-order                    # redeploy con soporte AZUL
```
> `--no-verify-jwt` en `azul-callback` es **obligatorio**: AZUL llama a ese URL directamente,
> sin la llave anon de Supabase. `azul-create-payment` sí queda protegida (la llama el checkout
> con la llave anon).

### 4. Registrar el URL de respuesta en AZUL
El checkout arma las URLs automáticamente apuntando a `azul-callback`
(`ApprovedUrl`, `DeclinedUrl`, `CancelUrl`). Si el portal de AZUL exige
declarar un dominio/URL de respuesta permitido, usar:
```
https://<TU-REF>.supabase.co/functions/v1/azul-callback
```

### 5. Publicar el frontend
Solo cuando 1–4 estén listos, mergear la rama e ir a producción:
```bash
git checkout main && git merge feat/azul-payments && git push origin main
```

## Pruebas (entorno `test` → pruebas.azul.com.do)

### Arnés local (sin desplegar y sin tocar la base de datos)
`scripts/azul-pp-sandbox.ts` corre **las mismas** Edge Functions con una tabla `orders` en
memoria y redirige el navegador a la Payment Page de pruebas:
```bash
AZUL_AUTH_KEY=<llave de pruebas> deno run --allow-net --allow-env --allow-write --allow-read=. scripts/azul-pp-sandbox.ts
# abrir http://localhost:8788/?total=1180.00&itbis=180.00
AZUL_AUTH_KEY=<llave de pruebas> deno test --allow-env supabase/functions/_shared/azul-page.test.ts
```
Probado el 25-nov-2026: ventas aprobadas 44958408, 44958409 y 44958411 (esta última de punta
a punta: orden marcada `pagado` por `azul-callback`), cancelación y callback con firma falsa
(no marca nada). Constancias en `azul-pagina-de-pagos-pruebas-2026-11-25.md` (carpeta interna Serv Cliente).

Tarjetas de prueba del correo de AZUL (23-nov-2026), expiración `12/34`, cualquier CVV. La
página de pruebas pide correo electrónico para el comprobante y puede ofrecer conversión de
moneda (DCC) con tarjetas extranjeras: elegir RD$.

## Especificación del hash ("Documento técnico - Página de Pago AZUL 2026")
Toda la lógica está en `supabase/functions/_shared/azul-page.ts`.
- **Request AuthHash**: `MerchantId + MerchantName + MerchantType + CurrencyCode + OrderNumber +
  Amount + ITBIS + ApprovedUrl + DeclinedUrl + CancelUrl + UseCustomField1 + CustomField1Label +
  CustomField1Value + UseCustomField2 + CustomField2Label + CustomField2Value + AuthKey`, en
  **Unicode (UTF-16LE)**, HMAC-SHA512 con clave = AuthKey. El doc admite UTF-8 o Unicode y
  recomienda Unicode; Azul lo aceptó en las pruebas del 25-nov.
- **Response AuthHash** (`azul-callback`): `OrderNumber + Amount + AuthorizationCode + DateTime +
  ResponseCode + IsoCode + ResponseMessage + ErrorDescription + RRN + AuthKey`, UTF-16LE
  (con tolerancia UTF-8). Es la frontera de seguridad: sin firma válida, o si `Amount` no es el
  total de la orden, no se marca `pagado`.
- Fuera del hash: `Locale=ES`, `SaveToDataVault=0`, `LogoImageUrl`.
- `Amount`/`ITBIS` en centavos sin punto (`0` → `000`). El ITBIS va desglosado desde la orden.
- **Logo**: `LogoImageUrl=https://platatechs.com/images/logo-platatech.png` (Azul pidió que esté
  publicado en nuestro dominio). Se puede cambiar con el secret `AZUL_LOGO_URL`.
- **URLs de retorno**: por defecto la Edge Function `azul-callback`. Si Azul exige que empiecen con
  nuestro dominio, poner el secret `AZUL_RETURN_BASE=https://platatechs.com/shop/azul-retorno.html`
  (esa página solo reenvía el querystring a `azul-callback`).
- URL Payment Page: `https://pruebas.azul.com.do/PaymentPage/` (test) ·
  `https://pagos.azul.com.do/PaymentPage/Default.aspx` (prod).

## Webhook de correos
Verificar que el Database Webhook de la tabla `orders` dispara `notify-order` en **INSERT y
UPDATE** (el correo de "pago confirmado" con tarjeta sale en el UPDATE a `pagado`).

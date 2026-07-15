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
(`ApprovedUrl`, `DeclinedUrl`, `CancelUrl`, `ResponsePostUrl`). Si el portal de AZUL exige
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
Tarjetas de prueba del correo de AZUL, expiración `12/34`, cualquier CVV de 3 dígitos.
Flujo: agrega un producto → "Tarjeta (AZUL)" → llena datos → "Pagar" → paga en AZUL →
vuelves al comprobante con estado **Pagado**.

## Especificación del hash (verificada contra los documentos de AZUL)
- **Request AuthHash** (`azul-create-payment`): `mensaje = MerchantId + MerchantName +
  MerchantType + CurrencyCode + OrderNumber + Amount + ITBIS + ApprovedUrl + DeclinedUrl +
  CancelUrl + UseCustomField1 + CustomField1Label + CustomField1Value + UseCustomField2 +
  CustomField2Label + CustomField2Value + AuthKey`, codificado en **UTF-8**, luego
  **HMAC-SHA512** con clave = AuthKey. Reproducido byte a byte contra el ejemplo oficial
  "Ejemplo Calculo Hash SALE" → **coincide exacto**.
- **Response AuthHash** (`azul-callback`): `OrderNumber + Amount + AuthorizationCode +
  DateTime + ResponseCode + IsoCode + ResponseMessage + ErrorDescription + RRN + AuthKey`,
  en **UTF-16LE** (con fallback UTF-8), HMAC-SHA512. Es la frontera de seguridad: sin firma
  válida no se marca `pagado`.
- Campos que se POSTean pero **no** entran en el hash: `TrxType=Sale`, `SaveToDataVault=0`.
- `MerchantType=ECommerce`, `CurrencyCode=$` (RD$/DOP), `Amount`/`ITBIS` en centavos
  (`toFixed(2)` sin punto; ITBIS=`000`).
- URL Payment Page: `https://pruebas.azul.com.do/PaymentPage/` (test) ·
  `https://pagos.azul.com.do/PaymentPage/` (prod).

## Punto menor a verificar en pruebas
- **OrderNumber**: se envía el id con guiones (`PT-YYMMDD-XXXXXX`). Si AZUL lo rechaza por
  formato, cambiar `generateOrderNumber()` en `cart.html` a alfanumérico sin guiones.
- **ITBIS = `000`** (informativo; no cambia lo cobrado). El total ya incluye el 18% como antes.
  Para desglosar, cambiar el valor en `azul-create-payment`.

## Webhook de correos
Verificar que el Database Webhook de la tabla `orders` dispara `notify-order` en **INSERT y
UPDATE** (el correo de "pago confirmado" con tarjeta sale en el UPDATE a `pagado`).

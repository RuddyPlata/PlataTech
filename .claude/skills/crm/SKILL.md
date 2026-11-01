---
name: crm
description: Consultar y actualizar el CRM de Plata Tech (clientes, embudo, notas, cotizaciones, facturas, cobros) con scripts/crm.mjs. Usar cuando Ruddy pregunte por clientes o leads ("¿quién me escribió hoy?", "¿cuánto me deben?"), pida anotar algo de un cliente, mover una oportunidad de etapa, registrar un pago o facturar una cotización.
---

# CRM de Plata Tech desde Claude Code

El CRM vive en Supabase (tablas `crm_*`). `scripts/crm.mjs` lo lee y escribe
con una cuenta de administrador, con la misma seguridad que el panel `/crm/`.

Requiere `CRM_EMAIL` y `CRM_PASSWORD` en el entorno (y `CRM_SUPABASE_URL` /
`CRM_SUPABASE_ANON_KEY` si el CRM está en un proyecto distinto al de la
tienda). Si faltan, dilo y no intentes adivinarlas. Nunca pidas la contraseña
en el chat.

```bash
node scripts/crm.mjs ayuda
```

## Cómo traducir lo que pide Ruddy

Ruddy suele hablar por voz y en dominicano. Interpreta la intención:

| Pide | Comando |
|---|---|
| "¿Cómo va el negocio?", "dame el resumen" | `resumen` |
| "¿Quién me escribió?", "¿a quién no le he contestado?" | `nuevos` |
| "¿Qué tengo en seguridad?" | `embudo --linea seguridad` |
| "Búscame a Juan del colmado" | `buscar juan` y luego `cliente <id>` |
| "Anota que le mandé fotos a Juan por WhatsApp" | `nota juan "Le mandé fotos de instalaciones" --tipo whatsapp` |
| "Me llamó María, quiere cambiar la pantalla del iPhone 13" | `nuevo --nombre "María" --telefono ... --linea celulares --que "Pantalla iPhone 13"` |
| "Lo de Juan se cerró" / "Juan no va" | `etapa juan ganado` / `etapa juan perdido --motivo "precio"` |
| "¿Quién me debe?" | `por-cobrar` |
| "Juan pagó 10 mil por transferencia" | `pago FAC-00001 10000 --metodo transferencia` |
| "Factúrale a Juan la cotización 110 con crédito fiscal" | `facturar COT-2026-110 --ncf B01` (vista previa) |

Líneas: `seguridad`, `software`, `celulares`, `aliado` (energía, redes,
domótica, remodelación los ejecuta un tercero). Etapas: `nuevo`, `contactado`,
`visita`, `cotizado`, `ganado`, `perdido`.

## Reglas

- **Leer es libre. Escribir se confirma** cuando hay duda: si el nombre
  coincide con varios clientes, el script los lista; pregunta cuál.
- **Facturar emite un NCF real ante la DGII y no se puede deshacer.** Corre
  primero sin `--confirmar`, lee la vista previa a Ruddy (cliente, total,
  tipo de comprobante) y solo con su "sí" explícito repite con `--confirmar`.
- **Pagos:** repite monto y factura antes de registrarlos si Ruddy no los dijo
  claros. Un pago mal registrado descuadra las cuentas por cobrar.
- No inventes precios ni plazos para los clientes; eso lo da Ruddy.
- Responde corto, como para leerse en el celular: lo que pasó y, si aplica,
  qué sigue ("Juan pasó a contactado. ¿Le preparo la cotización?").
- Las cotizaciones se crean y editan en `/shop/admin.html` (tienen PDF).
  Desde aquí solo se listan y se facturan.
